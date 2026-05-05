// Bot command handlers — operational bootstrap plus manual command surfaces.
// /start is an operational bootstrap / command-discovery surface, not a standalone Cavekit domain requirement.
// /daily_close is the manual entrypoint for cavekit-briefings R7 (End-of-Day Reflection).
import * as store from '../services/store.js';
import { InlineKeyboard } from 'grammy';
import { USER_CONTEXT } from '../services/gemini.js';
import { taskReviewKeyboard } from './callbacks.js';
import {
    buildTaskCard,
    buildTaskCardFromAction,
    sleep,
    userLocaleString,
    isAuthorized,
    guardAccess,
    filterProcessedThisWeek,
    buildQuotaExhaustedMessage,
    replyWithMarkdown,
    sendWithMarkdown,
    editWithMarkdown,
    truncateMessage,
    pendingToAnalysis,
    buildMutationCandidateKeyboard,
    buildMutationClarificationMessage,
    buildMutationConfirmationMessage,
    buildMutationConfirmationKeyboard,
    buildPendingDataFromAction,
    PRIORITY_LABEL,
    retryWithBackoff,
    isFollowUpMessage,
    answerCallbackQueryBestEffort
} from '../services/shared-utils.js';
import { buildFreeformPipelineResultReceipt } from './pipeline-result-receipts.js';
import { formatPipelineFailure, executeUndoBatch } from '../services/undo-executor.js';
import { logSummarySurfaceEvent } from '../services/summary-surfaces/index.js';
import { formatBusyLockMessage } from '../services/operation-receipt.js';
import {
    createGoalThemeProfile,
    inferPriorityLabelFromTask,
    inferPriorityValueFromTask,
    inferProjectIdFromTask
} from '../services/execution-prioritization.js';
import { projectPolicy } from '../services/project-policy.js';
import { detectWorkStyleModeIntent } from '../services/intent-extraction.js';
import { detectBehavioralPatterns } from '../services/behavioral-patterns.js';

// Rate limiter removed 2026-04-19 (cavekit-validate Phase 3): YAGNI for 1-user MVP.
// Heavy-command rate limiting listed as out-of-scope in cavekit-task-pipeline.md.

/**
 * Register all slash commands for the bot.
 *
 * @param {Bot} bot - Grammy bot instance.
 * @param {TickTickClient} ticktick - TickTick client instance.
 * @param {GeminiAnalyzer} gemini - Gemini client instance.
 * @param {TickTickAdapter} adapter - TickTick adapter instance.
 * @param {Object} pipeline - Pipeline instance.
 * @param {Object} [config={}] - Bot configuration options.
 * @description Registers operational commands (/start, /menu, /status, /reset) and product surface commands (/scan, /pending, /undo, /briefing, /weekly, /daily_close, /memory, /forget, /urgent, /focus, /normal, /mode).
 */
export function registerCommands(bot, ticktick, gemini, adapter, pipeline, config = {}) {
    const { autoApplyLifeAdmin = false, autoApplyMode = 'metadata-only' } = config;

    const menuKeyboard = () =>
        new InlineKeyboard()
            .text('🔍 Scan', 'menu:scan')
            .text('⏳ Pending', 'menu:pending')
            .row()
            .text('🌅 Morning', 'menu:briefing')
            .text('🌙 Evening', 'menu:daily_close')
            .text('📊 Weekly', 'menu:weekly')
            .row()
            .text('⚡ Urgent', 'menu:urgent')
            .text('🎯 Focus', 'menu:focus')
            .text('🧘 Normal', 'menu:normal')
            .row()
            .text('📈 Status', 'menu:status');

    const buildAiUnavailableMessage = () => {
        const quotaResume = gemini.quotaResumeTime?.();
        if (quotaResume) return buildQuotaExhaustedMessage(gemini);
        return '⚠️ AI is temporarily unavailable (keys expired/invalid/quota-limited). Update GEMINI_API_KEYS or retry shortly.';
    };

    const buildSummaryContext = ({ kind, userId, workStyleMode }) => ({
        kind,
        entryPoint: 'manual_command',
        userId,
        workStyleMode,
        urgentMode: workStyleMode === store.MODE_URGENT,
        tonePolicy: 'preserve_existing',
        generatedAtIso: new Date().toISOString()
    });

    const formatLastSyncLine = (sync = {}) => {
        if (!sync?.lastTickTickSyncAt) return 'Last sync: none yet';
        const when = userLocaleString(sync.lastTickTickSyncAt);
        const source = sync.lastSyncSource || 'unknown';
        const activeCount = Number.isInteger(sync.lastTickTickActiveCount) ? sync.lastTickTickActiveCount : 'unknown';
        const version = Number.isInteger(sync.stateVersion) ? sync.stateVersion : 0;
        return `Last sync: ${when} · source: ${source} · active: ${activeCount} · version: ${version}`;
    };

    const formatLastSuccessfulSyncLine = (sync = {}) => {
        if (!sync?.lastTickTickSyncAt) return 'No successful TickTick sync recorded yet';
        const activeCount = Number.isInteger(sync.lastTickTickActiveCount) ? sync.lastTickTickActiveCount : 'unknown';
        return `Last successful sync: ${activeCount} active task(s)`;
    };

    const processPipelineMessage = (userMessage, options) =>
        typeof pipeline.processMessageWithContext === 'function'
            ? pipeline.processMessageWithContext(userMessage, options)
            : pipeline.processMessage(userMessage, options);

    const isReviewPreviewResult = (result) => result?.type === 'task' || result?.type === 'preview';

    const describePatternForMemory = (pattern) => {
        switch (pattern?.type) {
            case 'snooze_spiral':
                return `You've postponed this task ${pattern.signalCount} times — might be worth asking if it truly matters.`;
            case 'planning_without_execution_type_a':
                return `Detailed planning stacked up ${pattern.signalCount} times without matching completion. Planning feels productive, but execution moves the needle.`;
            case 'planning_without_execution_type_b':
                return `${pattern.signalCount} new tasks landed before completion caught up. Check if you're adding more than you're finishing.`;
            default:
                return `A recurring pattern was detected ${pattern.signalCount || 1} time(s). Worth reflecting on.`;
        }
    };

    const buildBehavioralMemorySummary = async (userId, { nowMs = Date.now() } = {}) => {
        if (typeof userId !== 'string' && typeof userId !== 'number') {
            throw new Error('invalid behavioral memory user');
        }

        const allSignals = await store.getBehavioralSignals(userId, { includeExpired: true });
        const activePatterns = detectBehavioralPatterns(allSignals, { nowMs }).filter(
            (pattern) => pattern.eligibleForSurfacing === true
        );

        const lastSignalTimestamp =
            allSignals
                .map((signal) => Date.parse(signal?.timestamp || ''))
                .filter(Number.isFinite)
                .sort((left, right) => right - left)[0] || null;

        const lines = ['**🧠 Behavioral Memory Summary**', ''];

        if (activePatterns.length === 0) {
            lines.push(`No active patterns in the last ${store.BEHAVIORAL_SIGNAL_RETENTION_DAYS} days.`);
        } else {
            lines.push('**Active Patterns**');
            activePatterns.slice(0, 3).forEach((pattern, index) => {
                lines.push(`${index + 1}. ${describePatternForMemory(pattern)} (${pattern.confidence} confidence)`);
            });
            if (activePatterns.length > 3) {
                lines.push(
                    `- ${activePatterns.length - 3} additional active pattern(s) are retained but omitted here for brevity.`
                );
            }
        }

        lines.push('');
        lines.push(`**Retention Window:** ${store.BEHAVIORAL_SIGNAL_RETENTION_DAYS} days`);
        lines.push(
            `**Last Signal Date:** ${lastSignalTimestamp ? userLocaleString(new Date(lastSignalTimestamp).toISOString()) : 'No retained signals yet'}`
        );
        lines.push('');
        lines.push('_Derived patterns only. No raw task titles or raw message text are stored in behavioral memory._');

        return lines.join('\n');
    };

    const resolveCurrentWorkStyleMode = async (ctx) => {
        const userId = resolveWorkStyleModeUserId(ctx);
        if (userId == null) return store.MODE_STANDARD;
        try {
            return await store.getWorkStyleMode(userId);
        } catch {
            return store.MODE_STANDARD;
        }
    };

    // ─── /start (operational bootstrap / command discovery) ──
    bot.command('start', async (ctx) => {
        if (!(await guardAccess(ctx))) return;
        const chatId = ctx.chat.id;
        await store.setChatId(chatId);
        await replyWithMarkdown(
            ctx,
            `**🧠 TickTick AI Accountability Partner**\n\n` +
                `Connected! I'll help you focus on what actually matters.\n\n` +
                `**Core commands:**\n` +
                `/scan — Analyze new tasks\n` +
                `/briefing — Today's plan\n` +
                `/pending — Review queue\n` +
                `/status — System overview\n\n` +
                `Tap /menu for all commands, or just send me a task naturally.`,
            { reply_markup: menuKeyboard() }
        );
    });

    bot.command('menu', async (ctx) => {
        if (!(await guardAccess(ctx))) return;
        await replyWithMarkdown(ctx, `**Quick Actions**\nTap a shortcut below or type a command.`, {
            reply_markup: menuKeyboard()
        });
    });

    // ─── /reset ──────────────────────────────────────────────
    bot.command('reset', async (ctx) => {
        if (!(await guardAccess(ctx))) return;
        const arg = ctx.match?.trim();
        if (arg !== 'CONFIRM') {
            await ctx.reply(
                '⚠️ This will wipe ALL bot data:\n' +
                    '• Pending tasks\n• Processed tasks\n• Undo history\n• Stats\n\n' +
                    'Your TickTick tasks are NOT affected.\n\n' +
                    'To confirm, type: /reset CONFIRM'
            );
            return;
        }
        await store.clearCurrentReviewSession(ctx.chat.id);
        await store.resetAll();
        let backendCount = null;
        try {
            const activeTasks = await adapter.listActiveTasks(true);
            backendCount = activeTasks.length;
        } catch (err) {
            console.error('Reset: failed to fetch backend count:', err.message);
        }
        const backendText = backendCount === null ? 'unavailable' : `${backendCount} active task(s)`;
        await ctx.reply(`Local review state cleared. TickTick: ${backendText}.`);
    });

    // ─── /status ──────────────────────────────────────────────
    async function cmdStatus(ctx) {
        if (!(await guardAccess(ctx))) return;

        let backendCount = null;
        try {
            const activeTasks = await adapter.listActiveTasks(true);
            backendCount = activeTasks.length;
        } catch (err) {
            console.error('Status: failed to fetch backend count:', err.message);
        }

        const snapshot = store.getOperationalSnapshot();
        const stats = snapshot.cumulative;
        const local = snapshot.localWorkflow;
        const sync = snapshot.tickTickSync || {};
        const intakeLock = store.getIntakeLockStatus();

        const deferredIntents = store.getDeferredPipelineIntents();
        const failedDeferred = store.getFailedDeferredIntents();
        const pendingRetry = deferredIntents.length;
        const failedPermanently = failedDeferred.length;
        let nextRetryText = '—';
        if (pendingRetry > 0) {
            const oldest = deferredIntents
                .filter((e) => typeof e.nextAttemptAt === 'number')
                .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)[0];
            if (oldest) {
                const seconds = Math.max(0, Math.ceil((oldest.nextAttemptAt - Date.now()) / 1000));
                if (seconds <= 0) {
                    nextRetryText = 'now';
                } else if (seconds < 60) {
                    nextRetryText = `in ${seconds}s`;
                } else {
                    nextRetryText = `in ${Math.ceil(seconds / 60)}m`;
                }
            }
        }

        const lines = [
            '**📊 Status**\n',
            '**📊 TickTick live state**',
            `Active tasks in TickTick: ${backendCount === null ? 'unavailable' : backendCount}`,
            formatLastSyncLine(sync),
            `Connection: ${ticktick.isAuthenticated() ? 'connected' : 'not connected'}`,
            '',
            '**📋 Local review queue**',
            `Pending review: ${local.pendingReview}`,
            `Failed / parked: ${local.failedParked}`,
            `Clarifications waiting: ${local.clarifications}`,
            '',
            '**⏳ Deferred queue**',
            `Pending retry: ${pendingRetry} items`,
            `Next retry: ${nextRetryText}`,
            `Failed permanently: ${failedPermanently} items`,
            '',
            '**⚡ Running job**',
            intakeLock.locked ? formatBusyLockMessage(intakeLock, 'Running job') : '⏳ Running job busy: no',
            '',
            '**📈 Recent activity**',
            `Analyzed: ${stats.tasksAnalyzed}  |  Approved: ${stats.tasksApproved}`,
            `Skipped: ${stats.tasksSkipped}  |  Dropped: ${stats.tasksDropped}`,
            `Auto-applied: ${stats.tasksAutoApplied || 0}`
        ];

        const quotaResume = gemini.quotaResumeTime();
        if (quotaResume) {
            lines.push(`⚠️ Quota resumes: ${userLocaleString(quotaResume.toISOString())}`);
        }
        if (stats.lastDailyBriefing) {
            lines.push(`Last briefing: ${userLocaleString(stats.lastDailyBriefing)}`);
        }
        if (stats.lastWeeklyDigest) {
            lines.push(`Last digest: ${userLocaleString(stats.lastWeeklyDigest)}`);
        }

        await replyWithMarkdown(ctx, lines.join('\n'));
    }

    const resolveWorkStyleModeUserId = (ctx) => ctx.from?.id ?? ctx.chat?.id ?? null;

    const formatModeLabel = (mode) => mode.toUpperCase();

    const formatModeReply = (state, confirmation) => {
        const lines = [confirmation, `Current mode: ${formatModeLabel(state.mode)}`];
        if (state.expiresAt) {
            const expiry = new Date(state.expiresAt).toLocaleTimeString('en-IE', {
                hour: '2-digit',
                minute: '2-digit'
            });
            lines.push(`Expires: ${expiry}`);
        }
        return lines.join('\n');
    };

    const replyWithMixedModeClarification = async (ctx) => {
        await applyWorkStyleMode(ctx, store.MODE_STANDARD);
        await ctx.reply(
            'Heard mixed mode signals. Staying in STANDARD mode for now. If you want urgency, say /urgent. If you want deliberate planning, say /focus.'
        );
    };

    const applyWorkStyleMode = async (ctx, mode, { expiryMs } = {}) => {
        const userId = resolveWorkStyleModeUserId(ctx);
        if (userId == null) {
            await ctx.reply('Could not resolve your Telegram user ID, so work style was not changed.');
            return false;
        }

        try {
            const state = await store.setWorkStyleMode(userId, mode, { expiryMs });
            const confirmationMap = {
                [store.MODE_URGENT]: 'Urgent mode activated.',
                [store.MODE_FOCUS]: 'Focus mode activated.',
                [store.MODE_STANDARD]: 'Standard mode active.'
            };
            await ctx.reply(formatModeReply(state, confirmationMap[mode] || 'Work style updated.'));
            return true;
        } catch (err) {
            console.error('Work style update error:', err.message);
            await ctx.reply('Could not update work style right now. Try again in a moment.');
            return false;
        }
    };

    const replyWithCurrentMode = async (ctx) => {
        const userId = resolveWorkStyleModeUserId(ctx);
        if (userId == null) {
            await ctx.reply('Could not resolve your Telegram user ID, so current mode is unavailable.');
            return false;
        }

        try {
            const state = await store.getWorkStyleState(userId);
            await ctx.reply(formatModeReply(state, 'Mode status.'));
            return true;
        } catch (err) {
            console.error('Work style read error:', err.message);
            await ctx.reply('Could not read current mode right now. Try again in a moment.');
            return false;
        }
    };

    async function cmdUrgent(ctx) {
        if (!(await guardAccess(ctx))) return;
        await applyWorkStyleMode(ctx, store.MODE_URGENT, { expiryMs: store.DEFAULT_URGENT_EXPIRY_MS });
    }

    async function cmdFocus(ctx) {
        if (!(await guardAccess(ctx))) return;
        await applyWorkStyleMode(ctx, store.MODE_FOCUS);
    }

    async function cmdNormal(ctx) {
        if (!(await guardAccess(ctx))) return;
        await applyWorkStyleMode(ctx, store.MODE_STANDARD);
    }

    bot.command('mode', async (ctx) => {
        if (!(await guardAccess(ctx))) return;
        await replyWithCurrentMode(ctx);
    });

    bot.command('scan', cmdScan);
    bot.command('pending', cmdPending);
    bot.command('review', cmdReview);
    bot.command('briefing', cmdBriefing);
    bot.command('daily_close', cmdDailyClose);
    bot.command('weekly', cmdWeekly);
    bot.command('status', cmdStatus);
    bot.command('urgent', cmdUrgent);
    bot.command('focus', cmdFocus);
    bot.command('normal', cmdNormal);

    const handlers = {
        scan: cmdScan,
        pending: cmdPending,
        review: cmdReview,
        briefing: cmdBriefing,
        daily_close: cmdDailyClose,
        weekly: cmdWeekly,
        status: cmdStatus,
        urgent: cmdUrgent,
        focus: cmdFocus,
        normal: cmdNormal
    };

    bot.callbackQuery(/^menu:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await answerCallbackQueryBestEffort(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        const cmd = ctx.match[1];
        await answerCallbackQueryBestEffort(ctx);

        if (handlers[cmd]) {
            await handlers[cmd](ctx);
        }
    });

    // ─── /scan — manual poll, BATCHED (up to soft-cap slots) ──
    async function cmdScan(ctx) {
        if (!(await guardAccess(ctx))) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected. Run the OAuth flow first.');
            return;
        }

        const MAX_PENDING_REVIEW = 5;
        const availableSlots = MAX_PENDING_REVIEW - store.getPendingCount();
        if (availableSlots <= 0) {
            await ctx.reply(
                `⏳ Review queue full (${MAX_PENDING_REVIEW}/${MAX_PENDING_REVIEW}). Run /pending to clear.`
            );
            return;
        }

        if (!store.tryAcquireIntakeLock({ owner: 'bot:scan' })) {
            await ctx.reply(formatBusyLockMessage(store.getIntakeLockStatus(), 'Scan'));
            return;
        }

        let backgroundPromise = Promise.resolve();
        try {
            await store.clearCurrentReviewSession(ctx.chat.id);
            const allTasks = await adapter.listActiveTasks(true);
            await store.recordTickTickSync({ source: 'bot:scan', activeCount: allTasks.length });

            const { removedPending, removedFailed } = await store.reconcileTaskState(allTasks);
            if (removedPending > 0 || removedFailed > 0) {
                console.log(`🧹 Scan reconciled: removed ${removedPending} pending, ${removedFailed} failed`);
            }

            const availableProjects = typeof adapter.listProjects === 'function' ? await adapter.listProjects() : [];
            const workStyleMode = await resolveCurrentWorkStyleMode(ctx);
            const targetTasks = allTasks.filter((t) => !store.isTaskKnown(t.id));

            if (targetTasks.length === 0) {
                await ctx.reply(
                    `Scan complete. No new local review items queued. TickTick active: ${allTasks.length}. Already known locally: ${allTasks.length - targetTasks.length}.`
                );
                return;
            }

            const batch = targetTasks.slice(0, availableSlots);
            let firstQueuedTask = null;
            let firstQueuedAction = null;
            let firstQueuedPendingData = null;
            let quotaExhausted = false;

            // Phase 1: process first task synchronously and show card immediately
            if (batch.length > 0) {
                const task = batch[0];
                try {
                    const userMessage = task.title + (task.content ? `\n${task.content}` : '');
                    const result = await retryWithBackoff(() =>
                        processPipelineMessage(userMessage, {
                            existingTask: task,
                            entryPoint: 'telegram:scan',
                            mode: 'scan',
                            availableProjects,
                            workStyleMode,
                            dryRun: true
                        })
                    );

                    if (isReviewPreviewResult(result)) {
                        const action = result.actions?.[0];
                        if (action) {
                            const pendingData = buildPendingDataFromAction(task, action, availableProjects);
                            await store.markTaskPending(task.id, pendingData);
                            firstQueuedTask = task;
                            firstQueuedAction = action;
                            firstQueuedPendingData = pendingData;
                        } else {
                            await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: false });
                        }
                    } else if (result.type === 'error' && result.failure?.class === 'quota') {
                        quotaExhausted = true;
                        for (const t of batch.slice(1)) {
                            await store.markTaskFailed(t.id, 'quota_exhausted', 30 * 60 * 1000);
                        }
                    } else if (result.type === 'error') {
                        await store.markTaskFailed(task.id, result.failure?.summary || 'pipeline_error');
                    } else if (result.type === 'clarification') {
                        await store.markTaskFailed(task.id, 'clarification_needed');
                    } else if (result.type === 'non-task') {
                        await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: false });
                    } else if (result.type === 'pending-confirmation') {
                        // Fail-closed: scan/review is automated and cannot handle interactive
                        // confirmation. Park task as processed so it doesn't re-queue.
                        await store.markTaskProcessed(task.id, {
                            originalTitle: task.title,
                            autoApplied: false,
                            pendingConfirmation: true
                        });
                    } else {
                        await store.markTaskFailed(task.id, `unknown_result_type: ${result.type}`);
                    }
                } catch (err) {
                    if (err.message.includes('quota') || err.message === 'All API keys exhausted') {
                        quotaExhausted = true;
                        for (const t of batch.slice(1)) {
                            await store.markTaskFailed(t.id, 'quota_exhausted', 30 * 60 * 1000);
                        }
                    } else {
                        await store.markTaskFailed(task.id, err.message);
                    }
                }
            }

            if (firstQueuedTask) {
                const card = buildTaskCardFromAction(firstQueuedTask, firstQueuedAction, availableProjects);
                const summaryLine = `${allTasks.length} active in TickTick · ${targetTasks.length} unreviewed locally · Showing next`;
                const msg = await replyWithMarkdown(ctx, `${summaryLine}\n\n${card}\n\n_(Preview — not yet applied)_`, {
                    reply_markup: taskReviewKeyboard(firstQueuedTask.id, firstQueuedPendingData.actionType)
                });
                await store.setCurrentReviewSession(ctx.chat.id, {
                    messageId: msg.message_id,
                    chatId: ctx.chat.id,
                    source: 'scan',
                    startedAt: new Date().toISOString(),
                    startingProcessedCount: store.getProcessedCount(),
                    totalTasks: batch.length
                });
            } else {
                await ctx.reply(
                    `Scan complete. No new local review items queued. TickTick active: ${allTasks.length}. Already known locally: ${allTasks.length - targetTasks.length}.`
                );
            }

            // Phase 2: background processing for remaining tasks
            if (batch.length > 1 && !quotaExhausted) {
                const remainingTasks = batch.slice(1);
                backgroundPromise = (async () => {
                    try {
                        for (const task of remainingTasks) {
                            try {
                                const userMessage = task.title + (task.content ? `\n${task.content}` : '');
                                const result = await retryWithBackoff(() =>
                                    processPipelineMessage(userMessage, {
                                        existingTask: task,
                                        entryPoint: 'telegram:scan',
                                        mode: 'scan',
                                        availableProjects,
                                        workStyleMode,
                                        dryRun: true
                                    })
                                );
                                if (isReviewPreviewResult(result)) {
                                    const action = result.actions?.[0];
                                    if (action) {
                                        const pendingData = buildPendingDataFromAction(task, action, availableProjects);
                                        await store.markTaskPending(task.id, pendingData);
                                    } else {
                                        await store.markTaskProcessed(task.id, {
                                            originalTitle: task.title,
                                            autoApplied: false
                                        });
                                    }
                                } else if (result.type === 'error') {
                                    await store.markTaskFailed(task.id, result.failure?.summary || 'pipeline_error');
                                } else if (result.type === 'clarification') {
                                    await store.markTaskFailed(task.id, 'clarification_needed');
                                } else if (result.type === 'non-task') {
                                    await store.markTaskProcessed(task.id, {
                                        originalTitle: task.title,
                                        autoApplied: false
                                    });
                                } else if (result.type === 'pending-confirmation') {
                                    await store.markTaskProcessed(task.id, {
                                        originalTitle: task.title,
                                        autoApplied: false,
                                        pendingConfirmation: true
                                    });
                                } else {
                                    await store.markTaskFailed(task.id, `unknown_result_type: ${result.type}`);
                                }
                            } catch (err) {
                                await store.markTaskFailed(task.id, err.message);
                            }
                            await sleep(1000);
                        }
                    } catch (bgErr) {
                        console.error(`[ScanBackground] error: ${bgErr.message}`);
                    }
                })();
            }
        } catch (err) {
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
            } else {
                console.error('Scan error:', err.message);
                await ctx.reply('Could not scan tasks right now. Try again, or run /status.');
            }
        } finally {
            try {
                await backgroundPromise;
            } catch (bgAwaitErr) {
                console.error(`[ScanBackground] await error: ${bgAwaitErr.message}`);
            }
            store.releaseIntakeLock();
        }
    }

    // ─── /pending — re-surface un-reviewed tasks ──────────────
    async function cmdPending(ctx) {
        if (!(await guardAccess(ctx))) return;
        const pendingCount = store.getPendingCount();

        if (pendingCount === 0) {
            let liveTaskCount = null;
            try {
                if (typeof adapter?.listActiveTasks === 'function') {
                    const liveTasks = await adapter.listActiveTasks();
                    liveTaskCount = Array.isArray(liveTasks) ? liveTasks.length : null;
                    if (liveTaskCount !== null) {
                        await store.recordTickTickSync({ source: 'bot:pending', activeCount: liveTaskCount });
                    }
                }
            } catch (err) {
                console.warn(`[Pending] Could not read live TickTick task count: ${err.message}`);
            }

            const sync = store.getOperationalSnapshot().tickTickSync || {};

            const tickTickState =
                liveTaskCount === null
                    ? `TickTick live task count unavailable right now. ${formatLastSuccessfulSyncLine(sync)}.`
                    : `TickTick still has ${liveTaskCount} live task(s).`;
            await ctx.reply(`Local review queue empty. ${tickTickState}`);
            return;
        }

        await store.clearCurrentReviewSession(ctx.chat.id);
        await ctx.reply(`${pendingCount} tasks awaiting your review. Approve or skip each one.`);

        const next = store.getNextPendingTask();
        if (next) {
            const [taskId, data] = next;
            const analysis = pendingToAnalysis(data);
            const card = buildTaskCard(
                {
                    title: data.originalTitle,
                    projectName: data.projectName,
                    priority: data.originalPriority,
                    content: data.originalContent,
                    dueDate: data.originalDueDate
                },
                analysis
            );
            const msg = await replyWithMarkdown(ctx, card, {
                reply_markup: taskReviewKeyboard(taskId, data.actionType)
            });
            await store.setCurrentReviewSession(ctx.chat.id, {
                messageId: msg.message_id,
                chatId: ctx.chat.id,
                source: 'pending',
                startedAt: new Date().toISOString(),
                totalTasks: pendingCount
            });
        }

        if (pendingCount > 1) {
            await ctx.reply(`📝 ${pendingCount - 1} more task(s) after this one.`);
        }
    }

    // ─── /undo — revert last applied change (single or batch) ──
    // RETAINED BOUNDARY: /undo restores previously applied structured changes
    // directly through the adapter. It is an operational recovery path, not a
    // product-feature drift from the canonical pipeline write path.
    bot.command('undo', async (ctx) => {
        if (!(await guardAccess(ctx))) return;
        const last = store.getLastUndoEntry();

        if (!last) {
            await ctx.reply('Nothing to undo.');
            return;
        }

        try {
            // Determine entries to revert: batch or single
            let entries = [last];

            // New-style batch: entries share a batchId
            if (last.batchId) {
                const batch = store.getUndoBatch(last.batchId);
                if (batch.length > 1) entries = batch;
            } else if (last.action === 'auto-apply') {
                // Legacy auto-apply batch
                const batch = store.getLastAutoApplyBatch();
                if (batch.length > 1) entries = batch;
            }

            const { reverted, successful } = await executeUndoBatch(entries, adapter);

            if (successful.length > 0) {
                await store.removeUndoEntries(successful);
            }

            const msg =
                reverted.length > 0
                    ? `↩️ **Reverted ${reverted.length} change(s):**\n${reverted.map((t) => `• "${t}"`).join('\n')}`
                    : '↩️ **Nothing was reverted.** Check the adapter logs for details.';

            await replyWithMarkdown(ctx, msg);
            console.log(
                `[UNDO] Reverted ${reverted.length} change(s) (${successful.length} successful) at ${new Date().toISOString()}`
            );
        } catch (err) {
            console.error('Undo error:', err.message);
            await ctx.reply('Undo failed. The task may have changed in TickTick. Try /status.');
        }
    });

    // ─── /briefing ────────────────────────────────────────────
    async function cmdBriefing(ctx) {
        if (!(await guardAccess(ctx))) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected.');
            return;
        }
        if (gemini.isQuotaExhausted()) {
            await replyWithMarkdown(ctx, buildQuotaExhaustedMessage(gemini));
            return;
        }
        await ctx.reply('🌅 Generating your briefing...');
        const userId = ctx.from?.id ?? ctx.chat?.id ?? null;
        const workStyleMode = userId == null ? store.MODE_STANDARD : await store.getWorkStyleMode(userId);
        const context = buildSummaryContext({ kind: 'briefing', userId, workStyleMode });
        try {
            const tasks = await adapter.listActiveTasks(true);
            const briefingResult = await gemini.generateDailyBriefingSummary(tasks, {
                entryPoint: context.entryPoint,
                userId,
                workStyleMode,
                urgentMode: context.urgentMode,
                generatedAtIso: context.generatedAtIso
            });
            logSummarySurfaceEvent({ context, result: briefingResult, deliveryStatus: 'ready' });

            // Store expansion data and attach "Show more" button
            const expansionId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const orderedTasks = briefingResult.orderedTasks || [];
            const ranking = briefingResult.ranking || { ranked: [] };
            await store.setPendingBriefingExpansion({
                expansionId,
                orderedTasks: orderedTasks.map(t => ({ id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate })),
                ranking: (ranking.ranked || []).map(r => ({ taskId: r.taskId, score: r.score, rationaleText: r.rationaleText })),
                kind: 'briefing',
                chatId: ctx.chat?.id
            });
            const keyboard = new InlineKeyboard().text('Show more', `briefing:more:${expansionId}`);
            await replyWithMarkdown(ctx, briefingResult.formattedText, { reply_markup: keyboard });

            logSummarySurfaceEvent({ context, result: briefingResult, deliveryStatus: 'sent' });
            await store.updateStats({ lastDailyBriefing: new Date().toISOString() });
        } catch (err) {
            logSummarySurfaceEvent({ context, deliveryStatus: 'failed', error: err });
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                return;
            }
            await ctx.reply('Could not generate the briefing right now. Try again in a moment.');
        }
    }

    // ─── /weekly ──────────────────────────────────────────────
    async function cmdWeekly(ctx) {
        if (!(await guardAccess(ctx))) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected.');
            return;
        }
        if (gemini.isQuotaExhausted()) {
            await replyWithMarkdown(ctx, buildQuotaExhaustedMessage(gemini));
            return;
        }
        await ctx.reply('📊 Generating your weekly review...');
        const userId = ctx.from?.id ?? ctx.chat?.id ?? null;
        const workStyleMode = userId == null ? store.MODE_STANDARD : await store.getWorkStyleMode(userId);
        const context = buildSummaryContext({ kind: 'weekly', userId, workStyleMode });
        try {
            const tasks = await adapter.listActiveTasks(true);
            const processed = store.getProcessedTasks();
            const historyAvailable = typeof processed === 'object' && processed !== null && !Array.isArray(processed);
            const thisWeek = filterProcessedThisWeek(processed || {}, ['processedAt']);
            const weeklyResult = await gemini.generateWeeklyDigestSummary(tasks, thisWeek, {
                entryPoint: context.entryPoint,
                userId,
                workStyleMode,
                urgentMode: context.urgentMode,
                generatedAtIso: context.generatedAtIso,
                historyAvailable
            });
            logSummarySurfaceEvent({
                context,
                result: weeklyResult,
                deliveryStatus: 'ready',
                extra: { historyAvailable }
            });
            await replyWithMarkdown(ctx, weeklyResult.formattedText);
            logSummarySurfaceEvent({
                context,
                result: weeklyResult,
                deliveryStatus: 'sent',
                extra: { historyAvailable }
            });
            await store.updateStats({ lastWeeklyDigest: new Date().toISOString() });
        } catch (err) {
            logSummarySurfaceEvent({ context, deliveryStatus: 'failed', error: err });
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                return;
            }
            await ctx.reply('Could not generate the weekly digest right now. Try again in a moment.');
        }
    }

    // ─── /daily_close (cavekit-briefings R7 manual surface) ──
    async function cmdDailyClose(ctx) {
        if (!(await guardAccess(ctx))) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected.');
            return;
        }
        if (gemini.isQuotaExhausted()) {
            await replyWithMarkdown(ctx, buildQuotaExhaustedMessage(gemini));
            return;
        }
        await ctx.reply('🌙 Generating your end-of-day reflection...');
        const userId = ctx.from?.id ?? ctx.chat?.id ?? null;
        const workStyleMode = userId == null ? store.MODE_STANDARD : await store.getWorkStyleMode(userId);
        const context = buildSummaryContext({ kind: 'daily_close', userId, workStyleMode });
        try {
            const tasks = await ticktick.getAllTasks();
            const processed = store.getProcessedTasks();
            const historyAvailable = typeof processed === 'object' && processed !== null && !Array.isArray(processed);
            const dailyCloseResult = await gemini.generateDailyCloseSummary(tasks, processed || {}, {
                entryPoint: context.entryPoint,
                userId,
                workStyleMode,
                urgentMode: context.urgentMode,
                generatedAtIso: context.generatedAtIso,
                historyAvailable
            });
            logSummarySurfaceEvent({
                context,
                result: dailyCloseResult,
                deliveryStatus: 'ready',
                extra: { historyAvailable }
            });
            await replyWithMarkdown(ctx, dailyCloseResult.formattedText);
            logSummarySurfaceEvent({
                context,
                result: dailyCloseResult,
                deliveryStatus: 'sent',
                extra: { historyAvailable }
            });
        } catch (err) {
            logSummarySurfaceEvent({ context, deliveryStatus: 'failed', error: err });
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                return;
            }
            await ctx.reply('Could not generate the daily close right now. Try again in a moment.');
        }
    }

    // ─── /memory (cavekit-behavioral-memory R8) ──
    bot.command('memory', async (ctx) => {
        if (!(await guardAccess(ctx))) return;
        const userId = ctx.from?.id ?? ctx.chat?.id ?? null;
        if (!userId) {
            await ctx.reply('❌ Could not identify user for behavioral memory.');
            return;
        }

        try {
            const summary = await buildBehavioralMemorySummary(userId);
            await replyWithMarkdown(ctx, summary);
        } catch (err) {
            console.error('[MemoryCommand] Error:', err.message);
            await ctx.reply('🧠 Behavioral memory is unavailable right now. No summary available.');
        }
    });

    // ─── /forget (cavekit-behavioral-memory R9) ──
    bot.command('forget', async (ctx) => {
        if (!(await guardAccess(ctx))) return;
        const userId = ctx.from?.id ?? ctx.chat?.id ?? null;
        if (!userId) {
            await ctx.reply('❌ Could not identify user for behavioral memory.');
            return;
        }

        try {
            const deletedCount = await store.deleteBehavioralSignals(userId);
            await ctx.reply(
                `🧠 Behavioral memory cleared. ${deletedCount} signal(s) removed. Previously stored patterns will no longer influence future summaries.`
            );
        } catch (err) {
            console.error('[ForgetCommand] Error:', err.message);
            await ctx.reply('❌ Failed to clear behavioral memory. Please try again.');
        }
    });

    // ─── /review ──────────────────────────────────────────────
    async function cmdReview(ctx) {
        if (!(await guardAccess(ctx))) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected. Run the OAuth flow first.');
            return;
        }

        const MAX_PENDING_REVIEW = 5;
        const availableSlots = MAX_PENDING_REVIEW - store.getPendingCount();
        if (availableSlots <= 0) {
            await ctx.reply(
                `⏳ Review queue full (${MAX_PENDING_REVIEW}/${MAX_PENDING_REVIEW}). Run /pending to clear.`
            );
            return;
        }

        if (!store.tryAcquireIntakeLock({ owner: 'bot:review' })) {
            await ctx.reply(formatBusyLockMessage(store.getIntakeLockStatus(), 'Review'));
            return;
        }

        let backgroundPromise = Promise.resolve();
        try {
            await store.clearCurrentReviewSession(ctx.chat.id);
            const allTasks = await adapter.listActiveTasks(true);
            await store.recordTickTickSync({ source: 'bot:review', activeCount: allTasks.length });

            const { removedPending, removedFailed } = await store.reconcileTaskState(allTasks);
            if (removedPending > 0 || removedFailed > 0) {
                console.log(`🧹 Review reconciled: removed ${removedPending} pending, ${removedFailed} failed`);
            }

            const availableProjects = typeof adapter.listProjects === 'function' ? await adapter.listProjects() : [];
            const targetTasks = allTasks.filter((t) => !store.isTaskKnown(t.id));

            if (targetTasks.length === 0) {
                await ctx.reply(
                    `Review complete. No new local review items queued. TickTick active: ${allTasks.length}. Already known locally: ${allTasks.length - targetTasks.length}.`
                );
                return;
            }

            const batch = targetTasks.slice(0, availableSlots);
            const workStyleMode = await resolveCurrentWorkStyleMode(ctx);

            let firstQueuedTask = null;
            let firstQueuedAction = null;
            let firstQueuedPendingData = null;
            let quotaExhausted = false;

            // Phase 1: process first task synchronously and show card immediately
            if (batch.length > 0) {
                const task = batch[0];
                try {
                    const userMessage = task.title + (task.content ? `\n${task.content}` : '');
                    const result = await retryWithBackoff(() =>
                        processPipelineMessage(userMessage, {
                            existingTask: task,
                            entryPoint: 'telegram:review',
                            mode: 'review',
                            availableProjects,
                            workStyleMode,
                            dryRun: true
                        })
                    );

                    if (isReviewPreviewResult(result)) {
                        const action = result.actions?.[0];
                        if (action) {
                            const pendingData = buildPendingDataFromAction(task, action, availableProjects);
                            await store.markTaskPending(task.id, pendingData);
                            firstQueuedTask = task;
                            firstQueuedAction = action;
                            firstQueuedPendingData = pendingData;
                        } else {
                            await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: false });
                        }
                    } else if (result.type === 'error' && result.failure?.class === 'quota') {
                        quotaExhausted = true;
                        for (const t of batch.slice(1)) {
                            await store.markTaskFailed(t.id, 'quota_exhausted', 30 * 60 * 1000);
                        }
                    } else if (result.type === 'error') {
                        await store.markTaskFailed(task.id, result.failure?.summary || 'pipeline_error');
                    } else if (result.type === 'clarification') {
                        await store.markTaskFailed(task.id, 'clarification_needed');
                    } else if (result.type === 'non-task') {
                        await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: false });
                    } else if (result.type === 'pending-confirmation') {
                        await store.markTaskProcessed(task.id, {
                            originalTitle: task.title,
                            autoApplied: false,
                            pendingConfirmation: true
                        });
                    } else {
                        await store.markTaskFailed(task.id, `unknown_result_type: ${result.type}`);
                    }
                } catch (err) {
                    if (err.message.includes('quota') || err.message === 'All API keys exhausted') {
                        quotaExhausted = true;
                        for (const t of batch.slice(1)) {
                            await store.markTaskFailed(t.id, 'quota_exhausted', 30 * 60 * 1000);
                        }
                    } else {
                        await store.markTaskFailed(task.id, err.message);
                    }
                }
            }

            if (firstQueuedTask) {
                const card = buildTaskCardFromAction(firstQueuedTask, firstQueuedAction, availableProjects);
                const summaryLine = `${allTasks.length} active in TickTick · ${targetTasks.length} unreviewed locally · Showing next`;
                const msg = await replyWithMarkdown(ctx, `${summaryLine}\n\n${card}\n\n_(Preview — not yet applied)_`, {
                    reply_markup: taskReviewKeyboard(firstQueuedTask.id, firstQueuedPendingData.actionType)
                });
                await store.setCurrentReviewSession(ctx.chat.id, {
                    messageId: msg.message_id,
                    chatId: ctx.chat.id,
                    source: 'review',
                    startedAt: new Date().toISOString(),
                    startingProcessedCount: store.getProcessedCount(),
                    totalTasks: batch.length
                });
            } else {
                await ctx.reply(
                    `Review complete. No new local review items queued. TickTick active: ${allTasks.length}. Already known locally: ${allTasks.length - targetTasks.length}.`
                );
            }

            // Phase 2: background processing for remaining tasks
            if (batch.length > 1 && !quotaExhausted) {
                const remainingTasks = batch.slice(1);
                backgroundPromise = (async () => {
                    try {
                        for (const task of remainingTasks) {
                            try {
                                const userMessage = task.title + (task.content ? `\n${task.content}` : '');
                                const result = await retryWithBackoff(() =>
                                    processPipelineMessage(userMessage, {
                                        existingTask: task,
                                        entryPoint: 'telegram:review',
                                        mode: 'review',
                                        availableProjects,
                                        workStyleMode,
                                        dryRun: true
                                    })
                                );
                                if (isReviewPreviewResult(result)) {
                                    const action = result.actions?.[0];
                                    if (action) {
                                        const pendingData = buildPendingDataFromAction(task, action, availableProjects);
                                        await store.markTaskPending(task.id, pendingData);
                                    } else {
                                        await store.markTaskProcessed(task.id, {
                                            originalTitle: task.title,
                                            autoApplied: false
                                        });
                                    }
                                } else if (result.type === 'error') {
                                    await store.markTaskFailed(task.id, result.failure?.summary || 'pipeline_error');
                                } else if (result.type === 'clarification') {
                                    await store.markTaskFailed(task.id, 'clarification_needed');
                                } else if (result.type === 'non-task') {
                                    await store.markTaskProcessed(task.id, {
                                        originalTitle: task.title,
                                        autoApplied: false
                                    });
                                } else if (result.type === 'pending-confirmation') {
                                    await store.markTaskProcessed(task.id, {
                                        originalTitle: task.title,
                                        autoApplied: false,
                                        pendingConfirmation: true
                                    });
                                } else {
                                    await store.markTaskFailed(task.id, `unknown_result_type: ${result.type}`);
                                }
                            } catch (err) {
                                await store.markTaskFailed(task.id, err.message);
                            }
                            await sleep(1000);
                        }
                    } catch (bgErr) {
                        console.error(`[ReviewBackground] error: ${bgErr.message}`);
                    }
                })();
            }
        } catch (err) {
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
            } else {
                console.error('Review error:', err.message);
                await ctx.reply('Could not start review right now. Try again, or run /status.');
            }
        } finally {
            try {
                await backgroundPromise;
            } catch (bgAwaitErr) {
                console.error(`[ReviewBackground] await error: ${bgAwaitErr.message}`);
            }
            store.releaseIntakeLock();
        }
    }

    // ─── Catch-all: free-form messages → Pipeline ─────────────
    bot.on('message:text', async (ctx) => {
        if (!isAuthorized(ctx)) return;
        // Skip commands (Grammy routes them first, but just in case)
        let pendingRefinement = store.getPendingTaskRefinement();
        if (pendingRefinement && ctx.message.text.startsWith('/')) {
            await store.clearPendingTaskRefinement();
            await ctx.reply('Refinement cancelled — running your command.');
        }
        if (ctx.message.text.startsWith('/')) return;
        const rawText = ctx.message.text.trim();
        if (!rawText) return;

        const userId = ctx.from?.id;
        if (userId) {
            await store.getWorkStyleMode(userId, { notify: (msg) => ctx.reply(msg).catch(() => {}) });
        }

        const freeformModeIntent = detectWorkStyleModeIntent(rawText);
        if (freeformModeIntent?.type === 'clarify_work_style_mode') {
            await replyWithMixedModeClarification(ctx);
            return;
        }
        if (freeformModeIntent?.type === 'set_work_style_mode') {
            const expiryMs = freeformModeIntent.mode === store.MODE_URGENT ? store.DEFAULT_URGENT_EXPIRY_MS : undefined;
            await applyWorkStyleMode(ctx, freeformModeIntent.mode, { expiryMs });
            return;
        }
        if (freeformModeIntent?.type === 'query_work_style_mode') {
            await replyWithCurrentMode(ctx);
            return;
        }

        // ─── Advisory / planning question detection ─────────────────
        // Matches: "what should I do today?", "plan my day", "what to focus on now", etc.
        // Skips task creation messages like "add task do something today".
        const advisoryRe = /(?:(?:what|how)\s+(?:should|do)\s+I\s+(?:do|focus|work|prioritize)\s+(?:today|now|next)|what\s+(?:is|are)\s+(?:most|top)\s+(?:important|priority)|plan\s+(?:my\s+day|today)|show\s+(?:my\s+)?(?:priorities|tasks))/i;
        const taskCreationRe = /\b(add|create|new|remind|schedule|set)\b/i;
        if (advisoryRe.test(rawText) && !taskCreationRe.test(rawText)) {
            if (!ticktick.isAuthenticated()) {
                await ctx.reply('🔴 TickTick not connected yet. Complete OAuth first.');
                return;
            }
            try {
                const tasks = await adapter.listActiveTasks(true);
                if (tasks.length === 0) {
                    await ctx.reply('You have no active tasks right now — take a breather!');
                    return;
                }
                const workStyleMode = await resolveCurrentWorkStyleMode(ctx);
                const { orderedTasks, ranking } = await gemini._prepareBriefingTasks(tasks, {
                    workStyleMode,
                    urgentMode: workStyleMode === store.MODE_URGENT
                });
                const top3 = orderedTasks.slice(0, 3);
                if (top3.length === 0) {
                    await ctx.reply('No ranked tasks available right now.');
                    return;
                }
                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                // Priority-aware filtering: preserve ranking order, show ALL high-priority (>=3),
                // cap low-priority at 2 per section.
                function filterPriorityAware(tasks, maxLowPriority = 2) {
                    const shown = [];
                    let lowShown = 0;
                    for (const task of tasks) {
                        if ((task.priority || 0) >= 3) {
                            shown.push(task);
                            continue;
                        }
                        if (lowShown < maxLowPriority) {
                            shown.push(task);
                            lowShown++;
                        }
                    }
                    return { shown, total: tasks.length, highCount: shown.filter((task) => (task.priority || 0) >= 3).length };
                }

                const dueToday = orderedTasks.filter(t => t.dueDate && t.dueDate.startsWith(todayStr));
                const backlog = orderedTasks.filter(t => !(t.dueDate && t.dueDate.startsWith(todayStr)));

                const dueTodayFiltered = filterPriorityAware(dueToday);
                const backlogFiltered = filterPriorityAware(backlog);

                const lines = ['**Here are your top priorities right now:**', ''];
                let counter = 0;

                if (dueTodayFiltered.shown.length > 0) {
                    lines.push(`Due today (${dueTodayFiltered.total} total):`);
                    for (const task of dueTodayFiltered.shown) {
                        counter++;
                        const decision = ranking.ranked.find(d => d.taskId === task.id);
                        const rationale = decision?.rationaleText ? `   ${decision.rationaleText}` : '';
                        lines.push(`${counter}. **${task.title}**`);
                        if (rationale) lines.push(rationale);
                        lines.push('');
                    }
                }

                if (backlogFiltered.shown.length > 0) {
                    lines.push(`Backlog (${backlogFiltered.total} total):`);
                    for (const task of backlogFiltered.shown) {
                        counter++;
                        const decision = ranking.ranked.find(d => d.taskId === task.id);
                        const rationale = decision?.rationaleText ? `   ${decision.rationaleText}` : '';
                        lines.push(`${counter}. **${task.title}**`);
                        if (rationale) lines.push(rationale);
                        lines.push('');
                    }
                }

                // Focus/context line from first task's rationale
                const firstRanked = orderedTasks[0];
                const firstDecision = firstRanked ? ranking.ranked.find(d => d.taskId === firstRanked.id) : null;
                const focusLine = firstDecision?.rationaleText
                    ? `Focus: ${firstDecision.rationaleText}`
                    : "Focus on today's work first";
                lines.push(focusLine);

                // Store expansion data and attach "Show more" button
                const expansionId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                await store.setPendingBriefingExpansion({
                    expansionId,
                    orderedTasks: orderedTasks.map(t => ({ id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate })),
                    ranking: ranking.ranked.map(r => ({ taskId: r.taskId, score: r.score, rationaleText: r.rationaleText })),
                    kind: 'advisory',
                    chatId: ctx.chat?.id
                });
                const keyboard = new InlineKeyboard().text('Show more', `advisory:more:${expansionId}`);
                await replyWithMarkdown(ctx, lines.join('\n'), { reply_markup: keyboard });
                return;
            } catch (err) {
                if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                    await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                    return;
                }
                console.error('Advisory briefing error:', err.message);
                await ctx.reply('Could not fetch your priorities right now.');
                return;
            }
        }

        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected yet. Complete OAuth first.');
            return;
        }

        const userMessage = rawText;

        pendingRefinement = store.getPendingTaskRefinement();
        if (pendingRefinement?.taskId) {
            const isReplyToForceReply =
                pendingRefinement.mode === 'force_reply' &&
                ctx.message?.reply_to_message?.message_id === pendingRefinement.forceReplyMessageId;
            const isOldStyleRefinement = !pendingRefinement.mode || pendingRefinement.mode !== 'force_reply';

            if (isReplyToForceReply || isOldStyleRefinement) {
                const pendingRefinementId = pendingRefinement.taskId;
                const data = store.getPendingTasks()[pendingRefinementId];
                if (data) {
                    await store.clearPendingTaskRefinement();
                    try {
                        const availableProjects = await adapter.listProjects();
                        const workStyleMode = await resolveCurrentWorkStyleMode(ctx);

                        // We need a complete TickTick task object for the pipeline
                        const existingTask = {
                            id: pendingRefinementId,
                            title: data.originalTitle,
                            content: data.originalContent,
                            projectId: data.originalProjectId,
                            priority: data.originalPriority
                        };

                        const result = await processPipelineMessage(userMessage, {
                            existingTask,
                            entryPoint: 'telegram:refine',
                            mode: 'interactive',
                            availableProjects,
                            workStyleMode
                        });

                        if (result.type === 'error') {
                            await ctx.reply(formatPipelineFailure(result));
                        } else if (result.type === 'task') {
                            await store.markTaskProcessed(pendingRefinementId, {
                                originalTitle: data.originalTitle,
                                autoApplied: true
                            });
                            const { text: receipt, replyExtra } = await buildFreeformPipelineResultReceipt({
                                result,
                                store,
                                userId,
                                projects: availableProjects
                            });
                            await replyWithMarkdown(
                                ctx,
                                truncateMessage(`Refined "${data.originalTitle}":\n\n${receipt}`, 4000),
                                replyExtra
                            );

                            // Store recent task context
                            if (userId) {
                                await store.setRecentTaskContext(userId, {
                                    taskId: pendingRefinementId,
                                    title: data.originalTitle,
                                    projectId: data.originalProjectId,
                                    content: data.originalContent || undefined,
                                    source: 'refine:applied'
                                });
                            }
                        } else {
                            await ctx.reply(result.confirmationText || 'Done.');
                        }
                    } catch (err) {
                        console.error('Refinement error:', err.message);
                        await ctx.reply('Could not apply that refinement safely. Try rephrasing it.');
                    }
                    return;
                } else {
                    await store.clearPendingTaskRefinement();
                }
            } else {
                // Non-reply message while force_reply refinement is pending — cancel and process normally
                await store.clearPendingTaskRefinement();
                await ctx.reply('Refinement cancelled.');
            }
        }

        // New pipeline path. Note: we leave gemini check in for the coach fallback optionally.
        await ctx.reply('Working on that...');
        try {
            // Check for pending checklist clarification resume.
            const pendingChecklist = store.getPendingChecklistClarification();
            if (pendingChecklist) {
                // User replied to a checklist clarification — resume with their answer
                const answer = userMessage.toLowerCase().trim();
                await store.clearPendingChecklistClarification();
                console.log('[ChecklistClarification] Reply received, resuming with answer:', answer);

                const resolvedMode =
                    answer === 'checklist' || answer === 'checklist please' || answer === 'subtasks'
                        ? 'checklist'
                        : answer === 'separate' || answer === 'separate tasks' || answer === 'separate'
                          ? 'separate'
                          : answer === 'skip' || answer === 'cancel' || answer === 'nevermind'
                            ? 'skip'
                            : null; // ambiguous reply — treat as fallback
                const availableProjects = await adapter.listProjects();
                const workStyleMode = await resolveCurrentWorkStyleMode(ctx);

                if (resolvedMode === 'skip') {
                    console.log('[ChecklistClarification] User skipped — creating plain parent task only');
                    const result = await processPipelineMessage(pendingChecklist.originalMessage, {
                        entryPoint: 'telegram:checklist-clarification-skip',
                        mode: 'interactive',
                        skipChecklist: true,
                        availableProjects,
                        workStyleMode
                    });
                    if (result.type === 'task') {
                        const { text: receipt, replyExtra } = await buildFreeformPipelineResultReceipt({
                            result,
                            store,
                            userId,
                            projects: availableProjects
                        });
                        await replyWithMarkdown(ctx, truncateMessage(receipt, 4000), replyExtra);
                        if (userId && result.actions?.[0]) {
                            const action = result.actions[0];
                            await store.setRecentTaskContext(userId, {
                                taskId:
                                    action.type === 'create'
                                        ? result.results?.[0]?.result?.id || 'unknown'
                                        : action.taskId || 'unknown',
                                title: result.results?.[0]?.result?.title || action.title || 'Task',
                                projectId: action.projectId,
                                content: result.results?.[0]?.result?.content || action.content || undefined,
                                source: 'checklist:create'
                            });
                        }
                    } else if (result.type === 'error') {
                        await ctx.reply(formatPipelineFailure(result));
                    } else {
                        await ctx.reply(result.confirmationText || 'Created as a single task.');
                    }
                    return;
                }

                if (resolvedMode === 'checklist' || resolvedMode === 'separate') {
                    console.log('[ChecklistClarification] Resuming pipeline with mode:', resolvedMode);
                    const result = await processPipelineMessage(pendingChecklist.originalMessage, {
                        entryPoint: 'telegram:checklist-clarification-resume',
                        mode: 'interactive',
                        checklistPreference: resolvedMode,
                        availableProjects,
                        workStyleMode
                    });
                    if (result.type === 'task') {
                        const { text: receipt, replyExtra } = await buildFreeformPipelineResultReceipt({
                            result,
                            store,
                            userId,
                            projects: availableProjects
                        });
                        await replyWithMarkdown(ctx, truncateMessage(receipt, 4000), replyExtra);
                        if (userId && result.actions?.[0]) {
                            const action = result.actions[0];
                            await store.setRecentTaskContext(userId, {
                                taskId:
                                    action.type === 'create'
                                        ? result.results?.[0]?.result?.id || 'unknown'
                                        : action.taskId || 'unknown',
                                title: result.results?.[0]?.result?.title || action.title || 'Task',
                                projectId: action.projectId,
                                content: result.results?.[0]?.result?.content || action.content || undefined,
                                source: 'checklist:create'
                            });
                        }
                    } else if (result.type === 'error') {
                        await ctx.reply(formatPipelineFailure(result));
                    } else {
                        await ctx.reply(result.confirmationText || 'Done.');
                    }
                    return;
                }

                // Ambiguous reply — conservative fallback (T054)
                console.log('[ChecklistClarification] Ambiguous reply — falling back to plain parent task');
                const result = await processPipelineMessage(pendingChecklist.originalMessage, {
                    entryPoint: 'telegram:checklist-clarification-fallback',
                    mode: 'interactive',
                    skipChecklist: true, // Never create inferred checklist after ignored clarification
                    availableProjects,
                    workStyleMode
                });
                if (result.type === 'task') {
                    const { text: receipt, replyExtra } = await buildFreeformPipelineResultReceipt({
                        result,
                        store,
                        userId,
                        projects: availableProjects
                    });
                    await replyWithMarkdown(ctx, truncateMessage(receipt, 4000), replyExtra);
                    if (userId && result.actions?.[0]) {
                        const action = result.actions[0];
                        await store.setRecentTaskContext(userId, {
                            taskId:
                                action.type === 'create'
                                    ? result.results?.[0]?.result?.id || 'unknown'
                                    : action.taskId || 'unknown',
                            title: action.title || 'Task',
                            projectId: action.projectId,
                            source: 'checklist:create'
                        });
                    }
                } else if (result.type === 'error') {
                    await ctx.reply(formatPipelineFailure(result));
                } else {
                    await ctx.reply(result.confirmationText || 'Created as a single task.');
                }
                return;
            }

            // Follow-up detection: bind short/pronoun messages to recently discussed task
            const availableProjects = typeof adapter.listProjects === 'function' ? await adapter.listProjects() : [];
            let pipelineOptions = {
                entryPoint: 'telegram:freeform',
                mode: 'interactive',
                availableProjects,
                workStyleMode: await resolveCurrentWorkStyleMode(ctx)
            };
            let recentTask = null;
            if (userId && !pipelineOptions.existingTask) {
                recentTask = store.getRecentTaskContext(userId);
                if (isFollowUpMessage(userMessage, recentTask?.title || null)) {
                    if (recentTask) {
                        pipelineOptions.existingTask = {
                            id: recentTask.taskId,
                            title: recentTask.title,
                            projectId: recentTask.projectId
                        };
                    }
                }
            }

            const result = await processPipelineMessage(userMessage, pipelineOptions);

            if (result.type === 'task') {
                const { text: receipt, replyExtra } = await buildFreeformPipelineResultReceipt({
                    result,
                    store,
                    userId,
                    projects: availableProjects
                });
                await replyWithMarkdown(ctx, truncateMessage(receipt, 4000), replyExtra);

                // Store recent task context after successful create/update/complete/delete
                if (userId) {
                    const action = result.actions?.[0];
                    if (action) {
                        if (action.type === 'create' && action.title) {
                            await store.setRecentTaskContext(userId, {
                                taskId: result.results?.[0]?.result?.id || 'unknown',
                                title: action.title,
                                content: result.results?.[0]?.result?.content || action.content || undefined,
                                projectId: action.projectId,
                                source: 'freeform:create'
                            });
                        } else if (['update', 'complete', 'delete'].includes(action.type) && action.taskId) {
                            await store.setRecentTaskContext(userId, {
                                taskId: action.taskId,
                                title: result.results?.[0]?.result?.title || action.title || 'Task',
                                content: result.results?.[0]?.result?.content || action.content || undefined,
                                projectId: action.projectId,
                                source: `freeform:${action.type}`
                            });
                        }
                    }
                }
            } else if (result.type === 'non-task') {
                // Fall back to conversational handling if no intent extracted
                if (gemini.isQuotaExhausted()) {
                    await replyWithMarkdown(ctx, buildQuotaExhaustedMessage(gemini));
                    return;
                }
                await ctx.reply(result.confirmationText || 'Got it — no actionable tasks detected.');
            } else if (result.type === 'clarification') {
                // Determine clarification type: checklist vs mutation
                const reason = result.clarification?.reason || '';

                if (reason === 'ambiguous_checklist_vs_multi_task') {
                    // Checklist vs separate-tasks clarification.
                    const intents = result.clarification?.candidates || [];
                    const question =
                        result.confirmationText ||
                        'I noticed your message could be one task with sub-steps, or several separate tasks. Which did you mean?';

                    // Persist pending clarification with TTL (T052)
                    await store.setPendingChecklistClarification({
                        originalMessage: userMessage,
                        intents: intents.map((i) => ({ type: i.type, title: i.title, projectHint: i.projectHint })),
                        chatId: ctx.chat?.id ?? null,
                        userId: ctx.from?.id ?? null,
                        entryPoint: 'telegram:freeform',
                        mode: 'interactive'
                    });
                    console.log('[ChecklistClarification] Question sent — pending state persisted');

                    // Send question with optional inline buttons (T055)
                    const keyboard = new InlineKeyboard()
                        .text('📋 One task + subtasks', 'cl:checklist')
                        .text('📝 Multiple tasks', 'cl:separate')
                        .row()
                        .text('⏭ Just one task', 'cl:skip');

                    await replyWithMarkdown(ctx, question + '\n\nReply with your choice or tap a button:', {
                        reply_markup: keyboard
                    });
                } else {
                    // Existing mutation clarification flow plus create-fragment clarification.
                    const candidates = result.clarification?.candidates || [];
                    if (candidates.length === 0) {
                        await ctx.reply(result.confirmationText || 'Not sure what you mean — could you rephrase?');
                    } else {
                        // Persist pending clarification so callbacks can resume
                        await store.setPendingMutationClarification({
                            originalMessage: userMessage,
                            candidates: candidates
                                .map((c) => ({ id: c.id || c.taskId, title: c.title }))
                                .filter((c) => c.id),
                            intentSummary: result.confirmationText,
                            chatId: ctx.chat?.id ?? null,
                            userId: ctx.from?.id ?? null,
                            entryPoint: 'telegram:freeform',
                            mode: 'interactive'
                        });
                        const msg = buildMutationClarificationMessage(reason, candidates, result.confirmationText, {
                            workStyleMode: result.workStyleMode || (await resolveCurrentWorkStyleMode(ctx))
                        });
                        const keyboard = buildMutationCandidateKeyboard(candidates);
                        await replyWithMarkdown(ctx, msg, { reply_markup: keyboard });
                    }
                }
            } else if (result.type === 'pending-confirmation') {
                // Non-exact match confirmation gate
                const userId = ctx.from?.id;
                await store.setPendingMutationConfirmation({
                    originalMessage: userMessage,
                    matchedTask: result.pendingConfirmation?.matchedTask || null,
                    actionType: result.pendingConfirmation?.actionType || null,
                    targetQuery: result.pendingConfirmation?.targetQuery || null,
                    matchConfidence: result.pendingConfirmation?.matchConfidence || null,
                    matchType: result.pendingConfirmation?.matchType || null,
                    chatId: ctx.chat?.id ?? null,
                    userId: userId ?? null,
                    entryPoint: result.entryPoint || 'telegram:freeform',
                    mode: result.mode || 'interactive',
                    workStyleMode: result.workStyleMode || null
                });
                const msg = buildMutationConfirmationMessage(result.pendingConfirmation, {
                    workStyleMode: result.workStyleMode || (await resolveCurrentWorkStyleMode(ctx))
                });
                const keyboard = buildMutationConfirmationKeyboard();
                await replyWithMarkdown(ctx, msg, { reply_markup: keyboard });
            } else if (result.type === 'not-found') {
                await ctx.reply(
                    result.confirmationText ||
                        `I couldn't find that task. Try a more specific name, or create it first.`
                );
            } else if (result.type === 'error') {
                await ctx.reply(formatPipelineFailure(result));
            }
        } catch (err) {
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                return;
            }
            console.error('Pipeline error:', err.message);
            await ctx.reply('Something went wrong. Try again, or run /status.');
        }
    });
}
