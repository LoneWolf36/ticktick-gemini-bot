// Scheduler - cron jobs for daily briefing, weekly digest, and task polling
import cron from 'node-cron';
import * as store from './store.js';
import { buildAutoApplyNotification, buildUndoEntry, userTimeString, filterProcessedThisWeek, sendWithMarkdown } from './shared-utils.js';
import { logSummarySurfaceEvent } from './summary-surfaces/index.js';

/**
 * Enum for scheduler notification types to manage suppression and logging.
 * @enum {string}
 */
export const SCHEDULER_NOTIFICATION_TYPES = Object.freeze({
    DAILY_BRIEFING: 'daily_briefing',
    WEEKLY_DIGEST: 'weekly_digest',
    PENDING_SUPPRESSION: 'pending_suppression',
    AUTO_APPLY: 'auto_apply',
    TOKEN_EXPIRED: 'token_expired',
    QUOTA_EXHAUSTED: 'quota_exhausted',
});

// Default grace window for missed scheduled deliveries (in minutes)
const DEFAULT_GRACE_WINDOW_MINUTES = 15;
const WEEKLY_DIGEST_HOUR = 20;
const WEEKDAY_INDEX = Object.freeze({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 });

const FOCUS_SUPPRESSED_NOTIFICATION_TYPES = new Set([
    SCHEDULER_NOTIFICATION_TYPES.DAILY_BRIEFING,
    SCHEDULER_NOTIFICATION_TYPES.WEEKLY_DIGEST,
    SCHEDULER_NOTIFICATION_TYPES.PENDING_SUPPRESSION,
    SCHEDULER_NOTIFICATION_TYPES.AUTO_APPLY,
]);

/**
 * Determines if a notification should be suppressed based on current work-style mode.
 * @param {string} workStyleMode - Current mode (standard/focus/urgent)
 * @param {string} notificationType - Type from SCHEDULER_NOTIFICATION_TYPES
 * @returns {boolean} True if suppressed
 */
export function shouldSuppressScheduledNotification(workStyleMode, notificationType) {
    return workStyleMode === store.MODE_FOCUS && FOCUS_SUPPRESSED_NOTIFICATION_TYPES.has(notificationType);
}


/**
 * Check if a scheduled delivery should be sent based on last delivery time and grace window
 * @param {string|null} lastDeliveryIso - ISO timestamp of last delivery
 * @param {string} scheduledTimeIso - ISO timestamp when delivery was scheduled for
 * @param {number} graceWindowMinutes - Grace window in minutes
 * @returns {boolean} Whether delivery should be sent
 */
export function shouldSendMissedDelivery(lastDeliveryIso, scheduledTimeIso, { nowIso = new Date().toISOString(), graceWindowMinutes = DEFAULT_GRACE_WINDOW_MINUTES } = {}) {
    const scheduledMs = Date.parse(scheduledTimeIso || '');
    const nowMs = Date.parse(nowIso || '') || Date.now();
    if (!Number.isFinite(scheduledMs) || scheduledMs > nowMs) return false;

    const graceWindowMs = graceWindowMinutes * 60 * 1000;
    if (scheduledMs + graceWindowMs < nowMs) return false;

    if (!lastDeliveryIso) return true;

    const lastDeliveryMs = Date.parse(lastDeliveryIso || '');
    if (!Number.isFinite(lastDeliveryMs)) return true;
    return lastDeliveryMs < scheduledMs;
}

/**
 * Helper to build scheduling metadata context for consistent delivery path
 * @param {string} scheduleKey - Identifier for the schedule (e.g., 'daily-briefing')
 * @param {string} scheduledForIso - When the delivery was scheduled for
 * @param {number} graceWindowMinutes - Configured grace window
 * @returns {Object} Scheduling metadata context
 */
export function buildSchedulingMetadata(scheduleKey, scheduledForIso, graceWindowMinutes = DEFAULT_GRACE_WINDOW_MINUTES) {
    return {
        schedulingMetadata: {
            triggerKind: 'scheduled',
            scheduleKey,
            scheduledForIso,
            graceWindowMinutes,
        },
    };
}

function getZonedClockParts(date, timezone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const weekday = parts.find((part) => part.type === 'weekday')?.value;
    const hour = Number.parseInt(parts.find((part) => part.type === 'hour')?.value || '0', 10);
    const minute = Number.parseInt(parts.find((part) => part.type === 'minute')?.value || '0', 10);

    return {
        weekday: WEEKDAY_INDEX[weekday] ?? null,
        minutesSinceMidnight: (hour * 60) + minute,
    };
}

function computeCatchupScheduledForIso({ scheduleKind, dailyHour = 8, weeklyDay = 0, timezone = 'Europe/Dublin', now = new Date(), graceWindowMinutes = DEFAULT_GRACE_WINDOW_MINUTES }) {
    const { weekday, minutesSinceMidnight } = getZonedClockParts(now, timezone);
    const scheduledMinutes = scheduleKind === 'weekly'
        ? WEEKLY_DIGEST_HOUR * 60
        : dailyHour * 60;

    if (scheduleKind === 'weekly' && weekday !== weeklyDay) {
        return null;
    }

    const diffMinutes = minutesSinceMidnight - scheduledMinutes;
    if (diffMinutes < 0 || diffMinutes > graceWindowMinutes) {
        return null;
    }

    return new Date(now.getTime() - (diffMinutes * 60 * 1000)).toISOString();
}

/**
 * Executes the daily briefing job, including task fetch, Gemini summary, and notification.
 * @param {Object} deps
 * @param {Object} deps.bot - Bot instance
 * @param {Object} deps.ticktick - TickTick client
 * @param {Object} deps.gemini - Gemini service
 * @param {Object} deps.adapter - TickTick adapter
 * @param {Object} [deps.config={}] - Job configuration
 * @returns {Promise<boolean>} True if successful
 */
export async function runDailyBriefingJob({ bot, ticktick, gemini, adapter, config = {} }) {

    if (!ticktick.isAuthenticated()) return false;
    const chatId = store.getChatId();
    if (!chatId) return false;

    const workStyleMode = await store.getWorkStyleMode(chatId);
    if (shouldSuppressScheduledNotification(workStyleMode, SCHEDULER_NOTIFICATION_TYPES.DAILY_BRIEFING)) {
        console.log('Skipping daily briefing - focus mode suppresses scheduled briefings.');
        return false;
    }

    console.log('Sending daily briefing...');
    
    // Build scheduling metadata for consistent delivery path
    const scheduledForIso = config.scheduledForIso || new Date().toISOString();
    const graceWindowMinutes = config.graceWindowMinutes || DEFAULT_GRACE_WINDOW_MINUTES;
    const schedulingMetadata = buildSchedulingMetadata('daily-briefing', scheduledForIso, graceWindowMinutes);
    
    const context = {
        kind: 'briefing',
        entryPoint: 'scheduler',
        userId: chatId,
        workStyleMode,
        urgentMode: workStyleMode === store.MODE_URGENT,
        generatedAtIso: new Date().toISOString(),
        ...schedulingMetadata,
    };
    let briefing = null;
    let tasks = [];
    let ticktickFetchFailed = false;
    try {
        if (gemini.isQuotaExhausted()) {
            console.log('Skipping daily briefing - Gemini quota exhausted.');
            return false;
        }

        try {
            tasks = await adapter.listActiveTasks(true);
        } catch (fetchErr) {
            ticktickFetchFailed = true;
            console.error('Daily briefing task fetch failed:', fetchErr.message);
        }

        briefing = await gemini.generateDailyBriefingSummary(tasks, {
            ...context,
            ticktickFetchFailed,
        });
        if (typeof config.captureTopPriorityTaskIds === 'function') {
            const topIds = (Array.isArray(briefing?.summary?.priorities) ? briefing.summary.priorities : [])
                .map((item) => item?.task_id)
                .filter((value) => typeof value === 'string' && value.trim().length > 0)
                .slice(0, 3);
            config.captureTopPriorityTaskIds(topIds);
        }
        logSummarySurfaceEvent({ context, result: briefing, deliveryStatus: 'ready' });

        let msg = briefing.formattedText;
        const pendingCount = store.getPendingCount();
        if (pendingCount > 0) {
            msg += `\n\n⏳ ${pendingCount} task(s) pending your review. Run /pending.`;
        }

        await sendWithMarkdown(bot.api, chatId, msg);
        logSummarySurfaceEvent({
            context,
            result: briefing,
            deliveryStatus: 'sent',
            extra: { pendingReviewCount: pendingCount },
        });
        await store.updateStats({ lastDailyBriefing: new Date().toISOString() });
        return true;
    } catch (err) {
        logSummarySurfaceEvent({ context, result: briefing, deliveryStatus: 'failed', error: err });
        console.error('Daily briefing error:', err.message);
        // Notify user so they know the briefing failed (not just silent failure)
        try {
            const errorMsg = err.message === 'QUOTA_EXHAUSTED'
                ? '⚠️ Daily briefing skipped — AI quota exhausted for today.'
                : `❌ Daily briefing failed: ${err.message}. Try /briefing manually.`;
            await sendWithMarkdown(bot.api, chatId, errorMsg);
        } catch (_) { /* don't let notification failure mask the original error */ }
        return false;
    }
}

/**
 * Executes the weekly digest job, analyzing processed tasks from the past week.
 * @param {Object} deps
 * @param {Object} deps.bot - Bot instance
 * @param {Object} deps.ticktick - TickTick client
 * @param {Object} deps.gemini - Gemini service
 * @param {Object} deps.adapter - TickTick adapter
 * @param {Object} [deps.processedTasks] - Map of processed tasks (defaults to store)
 * @param {Object} [deps.config={}] - Job configuration
 * @returns {Promise<boolean>} True if successful
 */
export async function runWeeklyDigestJob({ bot, ticktick, gemini, adapter, processedTasks = store.getProcessedTasks(), config = {} }) {

    if (!ticktick.isAuthenticated()) return false;
    const chatId = store.getChatId();
    if (!chatId) return false;

    const workStyleMode = await store.getWorkStyleMode(chatId);
    if (shouldSuppressScheduledNotification(workStyleMode, SCHEDULER_NOTIFICATION_TYPES.WEEKLY_DIGEST)) {
        console.log('Skipping weekly digest - focus mode suppresses scheduled briefings.');
        return false;
    }

    console.log('Sending weekly digest...');
    
    // Build scheduling metadata for consistent delivery path
    const scheduledForIso = config.scheduledForIso || new Date().toISOString();
    const graceWindowMinutes = config.graceWindowMinutes || DEFAULT_GRACE_WINDOW_MINUTES;
    const schedulingMetadata = buildSchedulingMetadata('weekly-digest', scheduledForIso, graceWindowMinutes);
    
    const context = {
        kind: 'weekly',
        entryPoint: 'scheduler',
        userId: chatId,
        workStyleMode,
        urgentMode: workStyleMode === store.MODE_URGENT,
        generatedAtIso: new Date().toISOString(),
        ...schedulingMetadata,
    };
    let digest = null;
    let tasks = [];
    let ticktickFetchFailed = false;
    try {
        if (gemini.isQuotaExhausted()) {
            console.log('Skipping weekly digest - Gemini quota exhausted.');
            return false;
        }

        try {
            tasks = await adapter.listActiveTasks(true);
        } catch (fetchErr) {
            ticktickFetchFailed = true;
            console.error('Weekly digest task fetch failed:', fetchErr.message);
        }

        const historyAvailable = typeof processedTasks === 'object' && processedTasks !== null && !Array.isArray(processedTasks);
        const processed = historyAvailable ? processedTasks : {};
        const thisWeek = filterProcessedThisWeek(processed, ['sentAt']);
        const excludedTaskIds = config.excludedTaskIds || [];
        digest = await gemini.generateWeeklyDigestSummary(tasks, thisWeek, {
            ...context,
            historyAvailable,
            ticktickFetchFailed,
            excludedTaskIds,
        });
        logSummarySurfaceEvent({
            context,
            result: digest,
            deliveryStatus: 'ready',
            extra: { historyAvailable },
        });

        await sendWithMarkdown(bot.api, chatId, digest.formattedText);
        logSummarySurfaceEvent({
            context,
            result: digest,
            deliveryStatus: 'sent',
            extra: { historyAvailable },
        });
        await store.updateStats({ lastWeeklyDigest: new Date().toISOString() });
        return true;
    } catch (err) {
        logSummarySurfaceEvent({ context, result: digest, deliveryStatus: 'failed', error: err });
        console.error('Weekly digest error:', err.message);
        return false;
    }
}

/**
 * Retry deferred pipeline intents that were saved when the TickTick API
 * was unavailable (R12 graceful degradation).  Runs on startup and
 * periodically during the poll cycle.
 *
 * @param {Object} deps
 * @param {Object} deps.adapter - TickTick adapter (used to probe API health)
 * @param {Object} deps.pipeline - Pipeline instance (processMessageWithContext)
 * @param {Object} [deps.bot] - Bot instance for user notification
 * @param {Object} [options]
 * @param {number} [options.maxRetries=5] - Max intents to retry per invocation
 * @returns {{ retried: number, failed: number, remaining: number }}
 */
export async function retryDeferredIntents({ adapter, pipeline, bot } = {}, options = {}) {
    const { maxRetries = 5 } = options;
    const deferred = store.getDeferredPipelineIntents();
    if (deferred.length === 0) return { retried: 0, failed: 0, remaining: 0 };

    // Quick health check — if the API is still down, skip retry entirely
    try {
        await adapter.listActiveTasks(false);
    } catch {
        console.log(`[DeferredRetry] API still unavailable — skipping ${deferred.length} deferred intent(s).`);
        return { retried: 0, failed: 0, remaining: deferred.length };
    }

    const batch = deferred.slice(0, maxRetries);
    let retried = 0;
    let failed = 0;
    const notifications = [];

    for (const entry of batch) {
        if (!entry.userMessage) {
            // Malformed entry — remove silently
            await store.removeDeferredPipelineIntent(entry.id);
            continue;
        }

        // Cap retries — remove intents that have failed too many times
        const retryCount = (entry.retryCount || 0) + 1;
        if (retryCount > 3) {
            await store.removeDeferredPipelineIntent(entry.id);
            failed++;
            notifications.push(`❌ Failed permanently (3 retries): ${entry.userMessage.slice(0, 40)}`);
            console.log(`[DeferredRetry] Removing intent ${entry.id} after ${retryCount} retries`);
            continue;
        }

        try {
            const processMessage = typeof pipeline.processMessageWithContext === 'function'
                ? pipeline.processMessageWithContext
                : pipeline.processMessage;

            const result = await processMessage(entry.userMessage, {
                entryPoint: entry.entryPoint || 'deferred-retry',
                mode: entry.mode || 'interactive',
                workStyleMode: entry.workStyleMode || undefined,
            });

            if (result.type === 'task') {
                await store.removeDeferredPipelineIntent(entry.id);
                retried++;
                notifications.push(`✅ Retried: ${result.actions?.[0]?.title || entry.userMessage.slice(0, 40)}`);
            } else if (result.type === 'error' && result.failure?.category === 'transient') {
                // Still transient — increment retry count and leave in queue
                entry.retryCount = retryCount;
                await store.updateDeferredPipelineIntent(entry);
                failed++;
            } else {
                // Permanent failure or non-task result — remove to avoid infinite retry
                await store.removeDeferredPipelineIntent(entry.id);
                failed++;
                notifications.push(`❌ Failed permanently: ${entry.userMessage.slice(0, 40)}`);
            }
        } catch (err) {
            console.error(`[DeferredRetry] Error retrying intent ${entry.id}:`, err.message);
            failed++;
        }
    }

    const remaining = store.getDeferredPipelineIntents().length;

    if (notifications.length > 0 && bot) {
        const chatId = store.getChatId();
        if (chatId) {
            try {
                const msg = `🔄 *Deferred Intent Retry*\n${notifications.join('\n')}` +
                    (remaining > 0 ? `\n\n${remaining} intent(s) still queued.` : '');
                await sendWithMarkdown(bot.api, chatId, msg);
            } catch {
                // best effort
            }
        }
    }

    console.log(`[DeferredRetry] retried=${retried} failed=${failed} remaining=${remaining}`);
    return { retried, failed, remaining };
}

/**
 * Orchestrates catch-up jobs on startup for any missed scheduled deliveries.
 * @param {Object} services - Service dependencies
 * @param {Object} [config={}] - Scheduler configuration
 * @param {Object} [options] - Optional timing overrides for testing
 * @returns {Promise<{daily: boolean, weekly: boolean}>} Results of catch-up attempts
 */
export async function runStartupCatchupJobs({ bot, ticktick, gemini, adapter, processedTasks = store.getProcessedTasks() }, config = {}, { now = new Date() } = {}) {

    const {
        dailyHour = 8,
        weeklyDay = 0,
        timezone = 'Europe/Dublin',
        graceWindowMinutes = DEFAULT_GRACE_WINDOW_MINUTES,
    } = config;

    const stats = store.getStats();
    const nowIso = now.toISOString();
    const results = { daily: false, weekly: false };
    let dailyPriorityTaskIds = [];

    const dailyScheduledForIso = computeCatchupScheduledForIso({
        scheduleKind: 'daily',
        dailyHour,
        timezone,
        now,
        graceWindowMinutes,
    });
    if (dailyScheduledForIso && shouldSendMissedDelivery(stats.lastDailyBriefing, dailyScheduledForIso, { nowIso, graceWindowMinutes })) {
        console.log('Handling missed daily briefing on startup...');
        results.daily = await runDailyBriefingJob({
            bot,
            ticktick,
            gemini,
            adapter,
            config: {
                ...config,
                dailyHour,
                weeklyDay,
                timezone,
                graceWindowMinutes,
                scheduledForIso: dailyScheduledForIso,
                captureTopPriorityTaskIds: (taskIds = []) => {
                    dailyPriorityTaskIds = Array.isArray(taskIds) ? taskIds : [];
                },
            },
        });
    }

    const weeklyScheduledForIso = computeCatchupScheduledForIso({
        scheduleKind: 'weekly',
        weeklyDay,
        timezone,
        now,
        graceWindowMinutes,
    });
    if (weeklyScheduledForIso && shouldSendMissedDelivery(stats.lastWeeklyDigest, weeklyScheduledForIso, { nowIso, graceWindowMinutes })) {
        console.log('Handling missed weekly digest on startup...');
        results.weekly = await runWeeklyDigestJob({
            bot,
            ticktick,
            gemini,
            adapter,
            processedTasks,
            config: {
                ...config,
                dailyHour,
                weeklyDay,
                timezone,
                graceWindowMinutes,
                scheduledForIso: weeklyScheduledForIso,
                excludedTaskIds: dailyPriorityTaskIds,
            },
        });
    }

    return results;
}

/**
 * Initializes and starts the cron-based scheduler.
 * @param {Object} bot - Bot instance
 * @param {Object} ticktick - TickTick client
 * @param {Object} gemini - Gemini service
 * @param {Object} adapter - TickTick adapter
 * @param {Object} pipeline - Pipeline instance
 * @param {Object} config - Scheduler configuration
 * @returns {Promise<void>}
 */
export async function startScheduler(bot, ticktick, gemini, adapter, pipeline, config) {

    const {
        dailyHour = 8,
        weeklyDay = 0,
        pollMinutes = 5,
        timezone = 'Europe/Dublin',
        autoApplyLifeAdmin = false,
        autoApplyDrops = false,
        autoApplyMode = 'metadata-only',
        graceWindowMinutes = DEFAULT_GRACE_WINDOW_MINUTES,
    } = config;

    const autoConfig = { autoApplyLifeAdmin, autoApplyDrops, autoApplyMode };
    const schedulerConfig = { dailyHour, weeklyDay, timezone, graceWindowMinutes };

    console.log(`Scheduler starting (timezone: ${timezone})`);
    console.log(`   Daily briefing: ${dailyHour}:00`);
    console.log(`   Weekly digest: ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weeklyDay]} 20:00`);
    console.log(`   Task polling: every ${pollMinutes} min`);
    console.log(`   Auto-apply life-admin: ${autoApplyLifeAdmin ? 'ON' : 'OFF'}`);
    console.log(`   Grace window: ${graceWindowMinutes} minutes`);

    // Handle missed scheduled deliveries on startup
    await runStartupCatchupJobs({ bot, ticktick, gemini, adapter }, schedulerConfig);

    // Retry any deferred intents from previous API outages (R12)
    await retryDeferredIntents({ adapter, pipeline, bot });

    // Task polling (every N minutes)
    let tokenExpiredNotified = false;
    let quotaNotificationSent = false;
    let pendingSuppressionSent = false;
    let unscannedNotificationSent = false;

    const processPipelineMessage = (userMessage, options) =>
        typeof pipeline.processMessageWithContext === 'function'
            ? pipeline.processMessageWithContext(userMessage, options)
            : pipeline.processMessage(userMessage, options);

    cron.schedule(`*/${pollMinutes} * * * *`, async () => {
        if (!ticktick.isAuthenticated()) {
            if (!tokenExpiredNotified) {
                tokenExpiredNotified = true;
                const chatId = store.getChatId();
                if (chatId) {
                    try {
                        await sendWithMarkdown(bot.api, chatId,
                            '🔑 TickTick token has expired!\n\n' +
                            'The bot can no longer access your tasks. To reconnect:\n' +
                            `1. Visit: ${ticktick.getAuthUrl()}\n` +
                            '2. After authorizing, copy the new token from console\n' +
                            '3. Update TICKTICK_ACCESS_TOKEN in Render env vars'
                        );
                    } catch {
                        // best effort
                    }
                }
                console.error('🔑 TickTick token expired - sent notification to user.');
            }
            return;
        }
        tokenExpiredNotified = false;
        const chatId = store.getChatId();
        if (!chatId) return;
        const workStyleMode = await store.getWorkStyleMode(chatId);

        // Retry deferred intents before polling for new tasks (R12)
        if (store.getDeferredPipelineIntents().length > 0) {
            try {
                await retryDeferredIntents({ adapter, pipeline, bot });
            } catch (err) {
                console.error('[DeferredRetry] Poll-cycle retry error:', err.message);
            }
        }

        console.log(`🔄 [${userTimeString()}] Polling for new tasks...`);

        const pendingCount = store.getPendingCount();
        if (pendingCount > 0) {
            console.log(`⏸️  Skipping poll - ${pendingCount} tasks already pending review.`);
            if (!pendingSuppressionSent) {
                try {
                    if (!shouldSuppressScheduledNotification(workStyleMode, SCHEDULER_NOTIFICATION_TYPES.PENDING_SUPPRESSION)) {
                        await sendWithMarkdown(bot.api, chatId, `⏳ You have ${pendingCount} pending task(s). Run /pending to review; background scanning paused to save your API quota.`);
                    }
                    pendingSuppressionSent = true;
                } catch (err) {
                    console.error('Failed to send pending suppression notice:', err.message);
                }
            }
            return;
        }
        pendingSuppressionSent = false;

        if (!store.tryAcquireIntakeLock()) {
            console.log('⏸️  Skipping poll - intake lock held by an active operation.');
            return;
        }

        try {
            if (gemini.isQuotaExhausted()) {
                console.log('⏸️  Skipping poll - Gemini quota cooldown active.');
                return;
            }

            const allTasks = await adapter.listActiveTasks(true);
            const projects = await adapter.listProjects();
            const newTasks = allTasks.filter((t) => !store.isTaskKnown(t.id));

            if (newTasks.length === 0) {
                unscannedNotificationSent = false;
                return;
            }
            console.log(`📬 Found ${newTasks.length} new task(s)`);

// When auto-apply is OFF, just notify and skip pipeline processing
// Do NOT mark tasks as processed — /scan needs to find them
            if (!autoApplyLifeAdmin) {
                if (!unscannedNotificationSent) {
                    if (!shouldSuppressScheduledNotification(workStyleMode, SCHEDULER_NOTIFICATION_TYPES.AUTO_APPLY)) {
                        await sendWithMarkdown(bot.api, chatId,
                            `📬 ${newTasks.length} new task(s) found.\n\nAuto-apply is OFF. Run /scan to process them.`);
                    }
                    unscannedNotificationSent = true;
                }
                return;
            }

            const batch = newTasks.slice(0, 5);
            const autoApplied = [];
            const batchId = `auto-${Date.now()}`;
            let quotaHit = false;

            for (const task of batch) {
                try {
                    const userMessage = task.title + (task.content ? `\n${task.content}` : '');
                    const result = await processPipelineMessage(userMessage, {
                        existingTask: task,
                        entryPoint: 'scheduler:poll',
                        mode: 'poll',
                        availableProjects: projects,
                        activeTasks: allTasks,
                    });

                    if (result.type === 'error') {
                        if (result.failure?.class === 'quota') {
                            throw new Error('QUOTA_EXHAUSTED');
                        }
                        const reason = result.failure?.summary || result.confirmationText || result.errors.join(', ') || 'Pipeline failed';
                        await store.markTaskFailed(task.id, reason);
                        console.error(`  ❌ Failed: "${task.title}": ${reason}`);
                    } else if (result.type === 'task') {
                        // Safety filter: never auto-apply destructive or terminal actions
                        const appliedActions = result.actions.filter(a => {
                            if (a.type === 'delete' || a.type === 'complete') return false;
                            if (a.type === 'drop' && !autoApplyDrops) return false;
                            return true;
                        });

                        await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: true });
                        for (const action of appliedActions) {
                            autoApplied.push({
                                title: action.title || task.title,
                                schedule: action.dueDate ? action.dueDate.split('T')[0] : null,
                                movedTo: action.projectId && action.projectId !== task.projectId
                                    ? (projects.find(p => p.id === action.projectId)?.name || action.projectId)
                                    : null,
                            });
                        }
                        // Create undo entry per task with batchId for batch undo
                        const lastAction = [...appliedActions].reverse().find(a => a.type !== 'drop');
                        if (lastAction) {
                            const undoEntry = buildUndoEntry({
                                source: task,
                                action: 'auto-apply',
                                applied: {
                                    title: lastAction.title ?? null,
                                    projectId: lastAction.projectId ?? null,
                                    priority: lastAction.priority ?? null,
                                    schedule: lastAction.dueDate ? lastAction.dueDate.split('T')[0] : null,
                                },
                                appliedTaskId: task.id,
                            });
                            await store.addUndoEntry({ ...undoEntry, batchId });
                        }
                    } else {
                        await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: false });
                    }
                } catch (err) {
                    if (err.message === 'QUOTA_EXHAUSTED') {
                        const resetMs = gemini.quotaResumeTime()
                            ? gemini.quotaResumeTime().getTime() - Date.now()
                            : 2 * 60 * 60 * 1000;
                        for (const t of newTasks) {
                            await store.markTaskFailed(t.id, 'quota_exhausted', resetMs);
                        }
                        console.log(`⏸️  Quota exhausted - parked ${newTasks.length} task(s) until quota resets.`);
                        quotaHit = true;
                        break;
                    }

                    await store.markTaskFailed(task.id, err.message);
                    console.error(`  ❌ Failed: "${task.title}": ${err.message}`);
                }
                await new Promise((r) => setTimeout(r, 3000));
            }

            if (autoApplied.length > 0) {
                const notification = buildAutoApplyNotification(autoApplied);
                if (notification && !shouldSuppressScheduledNotification(workStyleMode, SCHEDULER_NOTIFICATION_TYPES.AUTO_APPLY)) {
                    await sendWithMarkdown(bot.api, chatId, notification);
                }
            }

            if (quotaHit && !quotaNotificationSent) {
                quotaNotificationSent = true;
                const resumeTime = gemini.quotaResumeTime();
                const resumeStr = resumeTime
                    ? resumeTime.toLocaleTimeString('en-US', {
                        timeZone: 'America/Los_Angeles',
                        hour: '2-digit',
                        minute: '2-digit',
                    }) + ' PT'
                    : '~midnight PT';
                await sendWithMarkdown(bot.api, chatId,
                    `⚠️ AI daily quota exhausted - ${newTasks.length} tasks parked.\n` +
                    `Quota resets at ~${resumeStr}. Bot will auto-resume then.\n` +
                    'Or run /scan manually after reset.'
                );
            }
        } catch (err) {
            console.error('Poll error:', err.message);
        } finally {
            store.releaseIntakeLock();
        }

        if (quotaNotificationSent && !gemini.isQuotaExhausted()) {
            quotaNotificationSent = false;
        }
    }, { timezone });

    cron.schedule(`0 ${dailyHour} * * *`, async () => {
        await runDailyBriefingJob({ bot, ticktick, gemini, adapter, config: { graceWindowMinutes } });
    }, { timezone });

    cron.schedule(`0 20 * * ${weeklyDay}`, async () => {
        await runWeeklyDigestJob({ bot, ticktick, gemini, adapter, config: { graceWindowMinutes } });
    }, { timezone });

    await store.pruneOldEntries(14);
    const initialPruned = await store.pruneFailedTasks();
    if (initialPruned > 0) console.log(`Boot maintenance: Pruned ${initialPruned} recovered failed tasks.`);

    cron.schedule('0 0 * * *', async () => {
        await store.pruneOldEntries(14);
        const prunedCount = await store.pruneFailedTasks();
        if (prunedCount > 0) console.log(`Daily maintenance: Pruned ${prunedCount} recovered failed tasks.`);
    }, { timezone });

    console.log('Scheduler running');
}
