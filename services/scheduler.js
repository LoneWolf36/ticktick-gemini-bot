// Scheduler - cron jobs for daily briefing, weekly digest, and task polling
import cron from 'node-cron';
import * as store from './store.js';
import { buildAutoApplyNotification, userTimeString, filterProcessedThisWeek, sendWithMarkdown } from './shared-utils.js';
import { logSummarySurfaceEvent } from './summary-surfaces/index.js';

export const SCHEDULER_NOTIFICATION_TYPES = Object.freeze({
    DAILY_BRIEFING: 'daily_briefing',
    WEEKLY_DIGEST: 'weekly_digest',
    PENDING_SUPPRESSION: 'pending_suppression',
    AUTO_APPLY: 'auto_apply',
    TOKEN_EXPIRED: 'token_expired',
    QUOTA_EXHAUSTED: 'quota_exhausted',
});

const FOCUS_SUPPRESSED_NOTIFICATION_TYPES = new Set([
    SCHEDULER_NOTIFICATION_TYPES.DAILY_BRIEFING,
    SCHEDULER_NOTIFICATION_TYPES.WEEKLY_DIGEST,
    SCHEDULER_NOTIFICATION_TYPES.PENDING_SUPPRESSION,
    SCHEDULER_NOTIFICATION_TYPES.AUTO_APPLY,
]);

export function shouldSuppressScheduledNotification(workStyleMode, notificationType) {
    return workStyleMode === store.MODE_FOCUS && FOCUS_SUPPRESSED_NOTIFICATION_TYPES.has(notificationType);
}

export async function runDailyBriefingJob({ bot, ticktick, gemini, adapter }) {
    if (!ticktick.isAuthenticated()) return false;
    const chatId = store.getChatId();
    if (!chatId) return false;

    const workStyleMode = await store.getWorkStyleMode(chatId);
    if (shouldSuppressScheduledNotification(workStyleMode, SCHEDULER_NOTIFICATION_TYPES.DAILY_BRIEFING)) {
        console.log('Skipping daily briefing - focus mode suppresses scheduled briefings.');
        return false;
    }

    console.log('Sending daily briefing...');
    const context = {
        kind: 'briefing',
        entryPoint: 'scheduler',
        userId: chatId,
        workStyleMode,
        urgentMode: workStyleMode === store.MODE_URGENT,
        generatedAtIso: new Date().toISOString(),
    };
    let briefing = null;
    try {
        if (gemini.isQuotaExhausted()) {
            console.log('Skipping daily briefing - Gemini quota exhausted.');
            return false;
        }

        const tasks = await adapter.listActiveTasks(true);
        briefing = await gemini.generateDailyBriefingSummary(tasks, context);
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
        return false;
    }
}

export async function runWeeklyDigestJob({ bot, ticktick, gemini, adapter, processedTasks = store.getProcessedTasks() }) {
    if (!ticktick.isAuthenticated()) return false;
    const chatId = store.getChatId();
    if (!chatId) return false;

    const workStyleMode = await store.getWorkStyleMode(chatId);
    if (shouldSuppressScheduledNotification(workStyleMode, SCHEDULER_NOTIFICATION_TYPES.WEEKLY_DIGEST)) {
        console.log('Skipping weekly digest - focus mode suppresses scheduled briefings.');
        return false;
    }

    console.log('Sending weekly digest...');
    const context = {
        kind: 'weekly',
        entryPoint: 'scheduler',
        userId: chatId,
        workStyleMode,
        urgentMode: workStyleMode === store.MODE_URGENT,
        generatedAtIso: new Date().toISOString(),
    };
    let digest = null;
    try {
        if (gemini.isQuotaExhausted()) {
            console.log('Skipping weekly digest - Gemini quota exhausted.');
            return false;
        }

        const tasks = await adapter.listActiveTasks(true);
        const historyAvailable = typeof processedTasks === 'object' && processedTasks !== null && !Array.isArray(processedTasks);
        const processed = historyAvailable ? processedTasks : {};
        const thisWeek = filterProcessedThisWeek(processed, ['sentAt']);
        digest = await gemini.generateWeeklyDigestSummary(tasks, thisWeek, {
            ...context,
            historyAvailable,
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

export async function startScheduler(bot, ticktick, gemini, adapter, pipeline, config) {
    const {
        dailyHour = 8,
        weeklyDay = 0,
        pollMinutes = 5,
        timezone = 'Europe/Dublin',
        autoApplyLifeAdmin = false,
        autoApplyDrops = false,
        autoApplyMode = 'metadata-only',
    } = config;

    const autoConfig = { autoApplyLifeAdmin, autoApplyDrops, autoApplyMode };

    console.log(`Scheduler starting (timezone: ${timezone})`);
    console.log(`   Daily briefing: ${dailyHour}:00`);
    console.log(`   Weekly digest: ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weeklyDay]} 20:00`);
    console.log(`   Task polling: every ${pollMinutes} min`);
    console.log(`   Auto-apply life-admin: ${autoApplyLifeAdmin ? 'ON' : 'OFF'}`);

    // Task polling (every N minutes)
    let tokenExpiredNotified = false;
    let quotaNotificationSent = false;
    let pendingSuppressionSent = false;

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

            if (newTasks.length === 0) return;
            console.log(`📬 Found ${newTasks.length} new task(s)`);

            const batch = newTasks.slice(0, 5);
            const autoApplied = [];
            let quotaHit = false;

            for (const task of batch) {
                try {
                    const userMessage = task.title + (task.content ? `\n${task.content}` : '');
                    const result = await pipeline.processMessage(userMessage, {
                        existingTask: task,
                        entryPoint: 'scheduler:poll',
                        mode: 'poll',
                        availableProjects: projects,
                    });

                    if (result.type === 'error') {
                        if (result.failure?.class === 'quota') {
                            throw new Error('QUOTA_EXHAUSTED');
                        }
                        const reason = result.failure?.summary || result.confirmationText || result.errors.join(', ') || 'Pipeline failed';
                        await store.markTaskFailed(task.id, reason);
                        console.error(`  ❌ Failed: "${task.title}": ${reason}`);
                    } else if (result.type === 'task') {
                        await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: true });
                        for (const action of result.actions) {
                            if (action.type !== 'drop') {
                                autoApplied.push({
                                    title: action.title || task.title,
                                    schedule: action.dueDate ? action.dueDate.split('T')[0] : null,
                                    movedTo: action.projectId && action.projectId !== task.projectId ? action.projectId : null,
                                });
                            }
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
        await runDailyBriefingJob({ bot, ticktick, gemini, adapter });
    }, { timezone });

    cron.schedule(`0 20 * * ${weeklyDay}`, async () => {
        await runWeeklyDigestJob({ bot, ticktick, gemini, adapter });
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
