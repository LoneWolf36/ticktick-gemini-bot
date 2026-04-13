// Bot command handlers — /start, /status, /scan, /briefing, /weekly, /review, /pending, /undo
import * as store from '../services/store.js';
import { InlineKeyboard } from 'grammy';
import { taskReviewKeyboard } from './callbacks.js';
import {
    buildTaskCard,
    sleep, userLocaleString, isAuthorized, guardAccess, buildUndoEntry,
    filterProcessedThisWeek, buildQuotaExhaustedMessage,
    parseDateStringToTickTickISO, replyWithMarkdown, sendWithMarkdown, editWithMarkdown, truncateMessage, scheduleToDate, containsSensitiveContent, pendingToAnalysis,
    buildMutationCandidateKeyboard,
    buildMutationClarificationMessage,
    formatPipelineFailure,
} from './utils.js';
import { logSummarySurfaceEvent } from '../services/summary-surfaces/index.js';
import { createGoalThemeProfile, inferPriorityLabelFromTask, inferPriorityValueFromTask, inferProjectIdFromTask } from '../services/execution-prioritization.js';
import { detectUrgentModeIntent } from '../services/ax-intent.js';

// ─── Simple per-user rate limiter ───────────────────────────
// Heavy commands (/scan, /briefing, /weekly, /review, /reorg) are rate-limited
// to prevent accidental spam that burns TickTick/Gemini API quotas.
// Light commands (/start, /menu, /status, /urgent, /pending, /undo, /reset) are not limited.

const RATE_LIMIT_WINDOW_MS = 30_000;  // 30-second window
const RATE_LIMIT_MAX = 1;              // 1 heavy command per window
const HEAVY_COMMANDS = new Set(['scan', 'briefing', 'weekly', 'review', 'reorg']);

const rateLimitWindows = new Map(); // userId -> { count, resetAt }

function isRateLimited(userId, command) {
    if (!HEAVY_COMMANDS.has(command)) return false;
    const now = Date.now();
    const entry = rateLimitWindows.get(userId);
    if (!entry || now >= entry.resetAt) {
        rateLimitWindows.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }
    entry.count += 1;
    if (entry.count > RATE_LIMIT_MAX) return true;
    return false;
}

function rateLimitRemaining(userId) {
    const entry = rateLimitWindows.get(userId);
    if (!entry || Date.now() >= entry.resetAt) return RATE_LIMIT_MAX;
    return Math.max(0, RATE_LIMIT_MAX - entry.count);
}

/** Middleware-style guard — returns true if request should be rejected */
export function guardRateLimit(ctx, command) {
    const userId = ctx.from?.id ?? ctx.chat?.id;
    if (!userId || !isRateLimited(userId, command)) return false;
    const remaining = rateLimitRemaining(userId);
    const waitSec = Math.ceil((rateLimitWindows.get(userId)?.resetAt - Date.now()) / 1000);
    ctx.reply(`⏳ Slow down — ${command} can be run once every ${RATE_LIMIT_WINDOW_MS / 1000}s. Try again in ~${waitSec}s.`);
    return true;
}

export function registerCommands(bot, ticktick, gemini, adapter, pipeline, config = {}) {
    const {
        autoApplyLifeAdmin = false,
        autoApplyDrops = false,
        autoApplyMode = 'metadata-only',
    } = config;

    const menuKeyboard = () => new InlineKeyboard()
        .text('🔍 Scan', 'menu:scan')
        .text('⏳ Pending', 'menu:pending')
        .row()
        .text('🌅 Briefing', 'menu:briefing')
        .text('📊 Weekly', 'menu:weekly')
        .row()
        .text('🧭 Reorg', 'menu:reorg')
        .text('📈 Status', 'menu:status');

    const reorgKeyboard = () => new InlineKeyboard()
        .text('✅ Apply Reorg', 'reorg:apply')
        .text('🛠️ Refine', 'reorg:refine')
        .row()
        .text('❌ Cancel', 'reorg:cancel');

    const summarizeReorg = (proposal, tasks = []) => {
        const byId = new Map(tasks.map(t => [t.id, t.title]));
        const lines = [];
        lines.push(`**🧭 Reorg Proposal**`);
        lines.push(proposal.summary || 'System cleanup proposal generated.');
        const actions = Array.isArray(proposal.actions) ? proposal.actions : [];
        lines.push(`\nActions: ${actions.length}`);
        actions.slice(0, 10).forEach((a, idx) => {
            const title = a.taskId ? (byId.get(a.taskId) || a.taskId) : (a.changes?.title || 'New Task');
            lines.push(`${idx + 1}. ${a.type} → ${title}`);
        });
        if (actions.length > 10) lines.push(`...and ${actions.length - 10} more`);
        const questions = Array.isArray(proposal.questions) ? proposal.questions : [];
        if (questions.length > 0) {
            lines.push(`\nClarifications needed:`);
            questions.slice(0, 3).forEach((q, i) => lines.push(`${i + 1}. ${q}`));
        }
        return lines.join('\n');
    };

    const buildAiUnavailableMessage = () => {
        const quotaResume = gemini.quotaResumeTime?.();
        if (quotaResume) return buildQuotaExhaustedMessage(gemini);
        return '⚠️ AI is temporarily unavailable (keys expired/invalid/quota-limited). Update GEMINI_API_KEYS or retry shortly.';
    };

    const buildSummaryContext = ({ kind, userId, urgentMode }) => ({
        kind,
        entryPoint: 'manual_command',
        userId,
        urgentMode,
        tonePolicy: 'preserve_existing',
        generatedAtIso: new Date().toISOString(),
    });

    // ─── /start ───────────────────────────────────────────────
    bot.command('start', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        const chatId = ctx.chat.id;
        await store.setChatId(chatId);
        await ctx.reply(
            `🧠 TickTick AI Accountability Partner\n\n` +
            `Connected! Chat ID: ${chatId}\n\n` +
            `Commands:\n` +
            `/scan — Analyze new tasks (batched, 5 at a time)\n` +
            `/pending — Re-surface tasks awaiting review\n` +
            `/briefing — Today's prioritized morning plan\n` +
            `/weekly — Weekly accountability digest\n` +
            `/review — Walk through all unreviewed tasks\n` +
            `/undo — Revert last auto-applied change\n` +
            `/reset — Wipe all bot data and start fresh\n` +
            `/status — Bot status and stats`,
            { reply_markup: menuKeyboard() }
        );
    });

    bot.command('menu', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        await replyWithMarkdown(
            ctx,
            `**Quick Actions**\nTap a shortcut below or type a command.`,
            { reply_markup: menuKeyboard() }
        );
    });

    bot.command('reorg', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (guardRateLimit(ctx, 'reorg')) return;
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }
        if (gemini.isQuotaExhausted()) {
            await ctx.reply(buildQuotaExhaustedMessage(gemini));
            return;
        }
        await ctx.reply('🧭 Building reorganization proposal...');
        try {
            const tasks = await ticktick.getAllTasksCached(60000);
            const projects = ticktick.getLastFetchedProjects();
            const proposal = await gemini.generateReorgProposal(tasks, projects);
            await store.setPendingReorg({
                ...proposal,
                awaitingRefine: false,
                createdAt: new Date().toISOString(),
            });
            await replyWithMarkdown(ctx, summarizeReorg(proposal, tasks), { reply_markup: reorgKeyboard() });
        } catch (err) {
            await ctx.reply(`❌ Reorg failed: ${err.message}`);
        }
    });

    // ─── /reset ──────────────────────────────────────────────
    bot.command('reset', async (ctx) => {
        if (!await guardAccess(ctx)) return;
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
        await store.resetAll();
        await ctx.reply('🗑️ All bot data has been wiped. Fresh start.\n\nRun /scan to re-analyze your tasks.');
    });

    // ─── /status ──────────────────────────────────────────────
    bot.command('status', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        const stats = store.getStats();
        const pendingCount = store.getPendingCount();
        const lines = [
            '🧠 TickTick AI Accountability Partner\n',
            `🔌 TickTick: ${ticktick.isAuthenticated() ? '🟢 Connected' : '🔴 Not connected'}`,
            `📊 Tasks Analyzed: ${stats.tasksAnalyzed}`,
            `✅ Approved: ${stats.tasksApproved}`,
            `⚡ Auto-applied: ${stats.tasksAutoApplied || 0}`,
            `⏭ Skipped: ${stats.tasksSkipped}`,
            `⏳ Pending Review: ${pendingCount}`,
            `\n🤖 Auto-apply life-admin: ${autoApplyLifeAdmin ? 'ON' : 'OFF'}`,
            `🤖 Auto-apply mode: ${autoApplyMode}`,
        ];
        if (stats.lastDailyBriefing) {
            lines.push(`🌅 Last Briefing: ${userLocaleString(stats.lastDailyBriefing)}`);
        }
        if (stats.lastWeeklyDigest) {
            lines.push(`📊 Last Digest: ${userLocaleString(stats.lastWeeklyDigest)}`);
        }

        const quotaResume = gemini.quotaResumeTime();
        if (quotaResume) {
            lines.push(`⚠️ Quota Exhausted Until: ${userLocaleString(quotaResume.toISOString())}`);
        }

        const cacheAge = ticktick.getCacheAgeSeconds();
        if (cacheAge !== null) {
            lines.push(`🗄️ Cache Age: ${cacheAge}s old`);
        }

        const keyInfo = gemini.activeKeyInfo?.();
        if (keyInfo) {
            lines.push(`🔑 Gemini Key: ${keyInfo.index}/${keyInfo.total}`);
        }

        lines.push('\nCommands: /menu | /scan | /pending | /reorg | /undo | /briefing | /weekly');
        await ctx.reply(lines.join('\n'));
    });

    const resolveUrgentModeUserId = (ctx) => ctx.from?.id ?? ctx.chat?.id ?? null;

    const applyUrgentModeState = async (ctx, requestedValue, { source = 'command' } = {}) => {
        const userId = resolveUrgentModeUserId(ctx);
        if (userId == null) {
            await ctx.reply('Could not resolve your Telegram user ID, so urgent mode was not changed.');
            return false;
        }

        try {
            const currentValue = await store.getUrgentMode(userId);
            const nextValue = requestedValue === 'toggle' ? !currentValue : requestedValue === true;
            await store.setUrgentMode(userId, nextValue);

            const confirmation = nextValue
                ? 'Urgent mode activated. I will use a sharper tone and prioritize immediate deadlines.'
                : 'Urgent mode deactivated. Humane mode remains your baseline recommendation posture.';
            const statusLine = nextValue ? 'Current state: URGENT MODE ON' : 'Current state: Humane baseline active';

            await ctx.reply(source === 'natural-language' ? confirmation : `${confirmation}\n${statusLine}`);
            return true;
        } catch (err) {
            await ctx.reply(`Could not update urgent mode: ${err.message}`);
            return false;
        }
    };

    bot.command('urgent', async (ctx) => {
        if (!await guardAccess(ctx)) return;

        const rawArg = typeof ctx.match === 'string' ? ctx.match.trim().toLowerCase() : '';
        if (!rawArg) {
            await applyUrgentModeState(ctx, 'toggle');
            return;
        }

        if (['on', 'enable', 'enabled', 'true'].includes(rawArg)) {
            await applyUrgentModeState(ctx, true);
            return;
        }

        if (['off', 'disable', 'disabled', 'false'].includes(rawArg)) {
            await applyUrgentModeState(ctx, false);
            return;
        }

        await ctx.reply('Usage: /urgent on | /urgent off\nTip: /urgent with no argument toggles the current state.');
    });

    bot.callbackQuery(/^menu:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const cmd = ctx.match[1];
        await ctx.answerCallbackQuery();
        const map = {
            scan: '/scan',
            pending: '/pending',
            briefing: '/briefing',
            weekly: '/weekly',
            reorg: '/reorg',
            status: '/status',
        };
        const typed = map[cmd];
        if (!typed) return;
        await ctx.reply(`Run ${typed}`);
    });

    bot.callbackQuery(/^reorg:(apply|refine|cancel)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const action = ctx.match[1];
        const pending = store.getPendingReorg();
        if (!pending) {
            await ctx.answerCallbackQuery({ text: 'No active reorg proposal.' });
            return;
        }
        if (action === 'cancel') {
            await store.clearPendingReorg();
            await ctx.answerCallbackQuery({ text: 'Reorg canceled.' });
            await editWithMarkdown(ctx, '❌ **Reorg canceled.**');
            return;
        }
        if (action === 'refine') {
            await store.setPendingReorg({ ...pending, awaitingRefine: true });
            await ctx.answerCallbackQuery({ text: 'Send your refinement in chat.' });
            await ctx.reply('🛠️ Send refinement instructions (e.g., "keep admin tasks in evening, no merges for personal notes").');
            return;
        }
        if (action === 'apply') {
            await ctx.answerCallbackQuery({ text: 'Applying proposal...' });
            try {
                const tasks = await ticktick.getAllTasksCached(60000);
                const projects = ticktick.getLastFetchedProjects();
                const { outcomes, hasUndoableActions } = await executeActions(
                    pending.actions || [],
                    adapter,
                    tasks,
                    {
                        enforcePolicySweep: true,
                        projects,
                        policyScopeTaskIds: (pending.actions || []).map((a) => a?.taskId).filter(Boolean),
                    }
                );
                await store.clearPendingReorg();
                let msg = `✅ **Reorg applied.**\n\n${outcomes.join('\n') || 'No actions were applied.'}`;
                if (hasUndoableActions) msg += '\n\nRun /undo to revert the last change.';
                await replyWithMarkdown(ctx, truncateMessage(msg, 4000));
            } catch (err) {
                await ctx.reply(`❌ Failed to apply reorg: ${err.message}`);
            }
        }
    });


    // ─── /scan — manual poll, BATCHED (5 at a time) ───────────
    bot.command('scan', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (guardRateLimit(ctx, 'scan')) return;
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected. Run the OAuth flow first.'); return; }

        const pendingCount = store.getPendingCount();
        if (pendingCount > 0) {
            await ctx.reply(`⏳ You have ${pendingCount} task(s) pending review. Run /pending first.`);
            return;
        }

        if (!store.tryAcquireIntakeLock()) { await ctx.reply('⏳ A scan or poll is already running.'); return; }

        try {
            await ctx.reply('🔍 Scanning for new tasks...');
            const allTasks = await ticktick.getAllTasks();
            const availableProjects = ticktick.getLastFetchedProjects();
            const targetTasks = allTasks.filter(t => !store.isTaskKnown(t.id));

            if (targetTasks.length === 0) {
                await ctx.reply('✅ No new tasks found.');
                return;
            }

            const batch = targetTasks.slice(0, 5);
            await ctx.reply(`📬 Found ${targetTasks.length} new task(s). Processing first ${batch.length} through pipeline...`);

            let confirmations = [];
            let failed = 0;

            for (const task of batch) {
                try {
                    // Pass to pipeline with existing task context so it emits an 'update'
                    const userMessage = task.title + (task.content ? `\n${task.content}` : '');

                    const result = await pipeline.processMessage(userMessage, {
                        existingTask: task,
                        entryPoint: 'telegram:scan',
                        mode: 'scan',
                        availableProjects
                    });

                    if (result.type === 'error') {
                        if (result.failure?.class === 'quota') {
                            failed += (batch.length - batch.indexOf(task));
                            confirmations.push(`\n⚠️ AI quota exhausted. Stopping batch.`);
                            break;
                        }
                        failed++;
                        confirmations.push(`❌ ${task.title}: ${formatPipelineFailure(result, { compact: true })}`);
                    } else if (result.type === 'task') {
                        // Mark as known since pipeline modified it directly
                        await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: true });
                        confirmations.push(`✨ ${result.confirmationText.replace(/\n\n/g, ' | ')}`);
                    } else {
                        // It was non-task, pipeline ignored it
                        await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: false });
                        confirmations.push(`💭 Ignored (not actionable): ${task.title}`);
                    }
                } catch (err) {
                    if (err.message.includes('quota') || err.message === 'All API keys exhausted') {
                        failed += (batch.length - batch.indexOf(task));
                        confirmations.push(`\n⚠️ AI quota exhausted. Stopping batch.`);
                        break;
                    }
                    failed++;
                    confirmations.push(`❌ Failed processing ${task.title}: ${err.message}`);
                }
                await sleep(3000); // Respect rate limits
            }

            let doneMsg = confirmations.join('\n');
            if (failed > 0) {
                doneMsg += `\n\n⚠️ ${failed} task(s) failed or parked for retry.`;
            }
            if (targetTasks.length > 5) {
                doneMsg += `\n\n📝 ${targetTasks.length - 5} more remain. Run /scan again for the next batch.`;
            }

            await replyWithMarkdown(ctx, doneMsg.trim());

        } catch (err) {
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
            } else {
                console.error('Scan error:', err.message);
                await ctx.reply(`❌ Scan error: ${err.message}`);
            }
        } finally {
            store.releaseIntakeLock();
        }
    });

    // ─── /pending — re-surface un-reviewed tasks ──────────────
    bot.command('pending', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        const pending = store.getPendingTasks();
        const entries = Object.entries(pending);

        if (entries.length === 0) {
            await ctx.reply('✅ No pending tasks! Everything has been reviewed.');
            return;
        }

        await ctx.reply(`⏳ You have ${entries.length} task(s) awaiting review. Re-sending...`);

        const batch = entries.slice(0, 5);
        for (const [taskId, data] of batch) {
            const analysis = pendingToAnalysis(data);
            const card = buildTaskCard({ title: data.originalTitle, projectName: data.projectName }, analysis);
            await replyWithMarkdown(ctx, card, { reply_markup: taskReviewKeyboard(taskId) });
            await sleep(1000);
        }

        if (entries.length > 5) {
            await ctx.reply(`📝 Sent 5 of ${entries.length}. Run /pending again for more.`);
        }
    });

    // ─── /undo — revert last auto-applied change ──────────────
    bot.command('undo', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        const last = store.getLastUndoEntry();

        if (!last) {
            await ctx.reply('Nothing to undo.');
            return;
        }

        try {
            // Restore original values via adapter
            await adapter.updateTask(last.taskId, {
                originalProjectId: last.appliedProjectId || last.originalProjectId,
                projectId: last.originalProjectId,
                title: last.originalTitle,
                content: last.originalContent,
                priority: last.originalPriority,
            });
            await store.removeLastUndoEntry();

            // Build detailed context of what was reverted
            const lines = [`↩️ **Reverted:** "${last.originalTitle}"`];
            if (last.appliedTitle && last.appliedTitle !== last.originalTitle) {
                lines.push(`  **Title:** "${last.appliedTitle}" → "${last.originalTitle}"`);
            }
            if (last.appliedPriority) {
                lines.push(`  **Priority:** ${last.appliedPriority} → original`);
            }
            if (last.appliedProject) {
                lines.push(`  **Project:** moved back from ${last.appliedProject}`);
            }
            if (last.appliedSchedule) {
                lines.push(`  **Schedule:** removed (was: ${last.appliedSchedule})`);
            }
            lines.push('\n*Task restored to its original state.*');
            await replyWithMarkdown(ctx, lines.join('\n'));

            console.log(`[UNDO] Reverted "${last.originalTitle}" (${last.action}) at ${new Date().toISOString()}`);
        } catch (err) {
            console.error('Undo error:', err.message);
            await ctx.reply(`❌ Undo failed: ${err.message}`);
        }
    });

    // ─── /briefing ────────────────────────────────────────────
    bot.command('briefing', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (guardRateLimit(ctx, 'briefing')) return;
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }
        if (gemini.isQuotaExhausted()) {
            await ctx.reply(buildQuotaExhaustedMessage(gemini));
            return;
        }
        await ctx.reply('🌅 Generating your briefing...');
        const userId = ctx.from?.id ?? ctx.chat?.id ?? null;
        const urgentMode = userId == null ? false : await store.getUrgentMode(userId);
        const context = buildSummaryContext({ kind: 'briefing', userId, urgentMode });
        try {
            const tasks = await ticktick.getAllTasks();
            const briefingResult = await gemini.generateDailyBriefingSummary(tasks, {
                entryPoint: context.entryPoint,
                userId,
                urgentMode,
                generatedAtIso: context.generatedAtIso,
            });
            logSummarySurfaceEvent({ context, result: briefingResult, deliveryStatus: 'ready' });
            await replyWithMarkdown(ctx, briefingResult.formattedText);
            logSummarySurfaceEvent({ context, result: briefingResult, deliveryStatus: 'sent' });
            await store.updateStats({ lastDailyBriefing: new Date().toISOString() });
        } catch (err) {
            logSummarySurfaceEvent({ context, deliveryStatus: 'failed', error: err });
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                return;
            }
            await ctx.reply(`❌ Briefing error: ${err.message}`);
        }
    });

    // ─── /weekly ──────────────────────────────────────────────
    bot.command('weekly', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (guardRateLimit(ctx, 'weekly')) return;
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }
        if (gemini.isQuotaExhausted()) {
            await ctx.reply(buildQuotaExhaustedMessage(gemini));
            return;
        }
        await ctx.reply('📊 Generating your weekly review...');
        const userId = ctx.from?.id ?? ctx.chat?.id ?? null;
        const urgentMode = userId == null ? false : await store.getUrgentMode(userId);
        const context = buildSummaryContext({ kind: 'weekly', userId, urgentMode });
        try {
            const tasks = await ticktick.getAllTasks();
            const processed = store.getProcessedTasks();
            const historyAvailable = typeof processed === 'object' && processed !== null && !Array.isArray(processed);
            const thisWeek = filterProcessedThisWeek(processed || {}, ['processedAt']);
            const weeklyResult = await gemini.generateWeeklyDigestSummary(tasks, thisWeek, {
                entryPoint: context.entryPoint,
                userId,
                urgentMode,
                generatedAtIso: context.generatedAtIso,
                historyAvailable,
            });
            logSummarySurfaceEvent({
                context,
                result: weeklyResult,
                deliveryStatus: 'ready',
                extra: { historyAvailable },
            });
            await replyWithMarkdown(ctx, weeklyResult.formattedText);
            logSummarySurfaceEvent({
                context,
                result: weeklyResult,
                deliveryStatus: 'sent',
                extra: { historyAvailable },
            });
            await store.updateStats({ lastWeeklyDigest: new Date().toISOString() });
        } catch (err) {
            logSummarySurfaceEvent({ context, deliveryStatus: 'failed', error: err });
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                return;
            }
            await ctx.reply(`❌ Weekly digest error: ${err.message}`);
        }
    });

    // ─── /review ──────────────────────────────────────────────
    bot.command('review', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (guardRateLimit(ctx, 'review')) return;
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }

        const pendingCount = store.getPendingCount();
        if (pendingCount > 0) {
            await ctx.reply(`⏳ You have ${pendingCount} task(s) pending review.\nRun /pending first, or /scan for new tasks.`);
            return;
        }

        if (!store.tryAcquireIntakeLock()) { await ctx.reply('⏳ A scan or poll is already running.'); return; }

        try {
            await ctx.reply('📋 Checking for unreviewed tasks...');
            const allTasks = await ticktick.getAllTasks();
            const availableProjects = ticktick.getLastFetchedProjects();
            const targetTasks = allTasks.filter(t => !store.isTaskKnown(t.id));

            if (targetTasks.length === 0) {
                await ctx.reply('✅ All tasks reviewed!');
                return;
            }

            const batch = targetTasks.slice(0, 5);
            await ctx.reply(`📬 ${targetTasks.length} task(s) to review. Processing ${batch.length} through pipeline...`);

            let confirmations = [];
            let failed = 0;

            for (const task of batch) {
                try {
                    const userMessage = task.title + (task.content ? `\n${task.content}` : '');
                    const result = await pipeline.processMessage(userMessage, {
                        existingTask: task,
                        entryPoint: 'telegram:review',
                        mode: 'review',
                        availableProjects
                    });

                    if (result.type === 'error') {
                        if (result.failure?.class === 'quota') {
                            failed += (batch.length - batch.indexOf(task));
                            confirmations.push(`\n⚠️ AI quota exhausted. Stopping batch.`);
                            break;
                        }
                        failed++;
                        confirmations.push(`❌ ${task.title}: ${formatPipelineFailure(result, { compact: true })}`);
                    } else if (result.type === 'task') {
                        await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: true });
                        confirmations.push(`✨ ${result.confirmationText.replace(/\n\n/g, ' | ')}`);
                    } else {
                        await store.markTaskProcessed(task.id, { originalTitle: task.title, autoApplied: false });
                        confirmations.push(`💭 Ignored (not actionable): ${task.title}`);
                    }
                } catch (err) {
                    if (err.message.includes('quota') || err.message === 'All API keys exhausted') {
                        failed += (batch.length - batch.indexOf(task));
                        confirmations.push(`\n⚠️ AI quota exhausted. Stopping batch.`);
                        break;
                    }
                    failed++;
                    confirmations.push(`❌ Failed processing ${task.title}: ${err.message}`);
                }
                await sleep(2500); // Respect rate limits
            }

            let doneMsg = confirmations.join('\n');
            if (failed > 0) {
                doneMsg += `\n\n⚠️ ${failed} task(s) failed or parked for retry.`;
            }
            if (targetTasks.length > 5) {
                doneMsg += `\n\n📝 ${targetTasks.length - 5} more remain. Run /review again for more.`;
            }

            await replyWithMarkdown(ctx, doneMsg.trim());

        } catch (err) {
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
            } else {
                console.error('Review error:', err.message);
                await ctx.reply(`❌ Review error: ${err.message}`);
            }
        } finally {
            store.releaseIntakeLock();
        }
    });

    // ─── Catch-all: free-form messages → Pipeline ─────────────
    bot.on('message:text', async (ctx) => {
        if (!isAuthorized(ctx)) return;
        // Skip commands (Grammy routes them first, but just in case)
        if (ctx.message.text.startsWith('/')) return;
        const rawText = ctx.message.text.trim();
        if (!rawText) return;

        const freeformUrgentIntent = detectUrgentModeIntent(rawText);
        if (freeformUrgentIntent?.type === 'set_urgent_mode') {
            await applyUrgentModeState(ctx, freeformUrgentIntent.value, { source: 'natural-language' });
            return;
        }
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected yet. Complete OAuth first.');
            return;
        }

        const userMessage = rawText;

        const pendingReorg = store.getPendingReorg();
        if (pendingReorg?.awaitingRefine) {
            if (gemini.isQuotaExhausted()) {
                await ctx.reply(buildQuotaExhaustedMessage(gemini));
                return;
            }
            await ctx.reply('🛠️ Refining reorg proposal...');
            try {
                const tasks = await ticktick.getAllTasksCached(60000);
                const projects = ticktick.getLastFetchedProjects();
                const refined = await gemini.generateReorgProposal(tasks, projects, userMessage, pendingReorg.actions || []);
                await store.setPendingReorg({
                    ...refined,
                    awaitingRefine: false,
                    createdAt: pendingReorg.createdAt || new Date().toISOString(),
                });
                await replyWithMarkdown(ctx, summarizeReorg(refined, tasks), { reply_markup: reorgKeyboard() });
            } catch (err) {
                await ctx.reply(`❌ Reorg refinement failed: ${err.message}`);
            }
            return;
        }

        // New pipeline path. Note: we leave gemini check in for the coach fallback optionally.
        await ctx.reply('🤔 Processing...');
        try {
            const result = await pipeline.processMessage(userMessage, {
                entryPoint: 'telegram:freeform',
                mode: 'interactive'
            });

            if (result.type === 'task') {
                await replyWithMarkdown(ctx, truncateMessage(result.confirmationText, 4000));
            } else if (result.type === 'non-task') {
                // Fall back to conversational handling if no intent extracted
                if (gemini.isQuotaExhausted()) {
                    await ctx.reply(buildQuotaExhaustedMessage(gemini));
                    return;
                }
                const tasks = await ticktick.getAllTasksCached(60000);
                await ctx.reply(result.confirmationText || 'Got it — no actionable tasks detected.');
            } else if (result.type === 'clarification') {
                // Ambiguous mutation request — present candidates for user to pick
                const candidates = result.clarification?.candidates || [];
                const reason = result.clarification?.reason || null;
                if (candidates.length === 0) {
                    await ctx.reply('Not sure what you mean — could you rephrase?');
                } else {
                    // Persist pending clarification so callbacks can resume
                    await store.setPendingMutationClarification({
                        originalMessage: userMessage,
                        candidates: candidates.map(c => ({ id: c.id, title: c.title })),
                        intentSummary: result.confirmationText,
                        chatId: ctx.chat?.id ?? null,
                        userId: ctx.from?.id ?? null,
                        entryPoint: 'telegram:freeform',
                        mode: 'interactive',
                    });
                    const msg = buildMutationClarificationMessage(reason, candidates, result.confirmationText);
                    const keyboard = buildMutationCandidateKeyboard(candidates);
                    await replyWithMarkdown(ctx, msg, { reply_markup: keyboard });
                }
            } else if (result.type === 'not-found') {
                const reason = result.notFound?.reason || '';
                await ctx.reply(`Couldn't find a matching task. ${reason ? reason : 'Try a different name or create a new task.'}`);
            } else if (result.type === 'error') {
                await ctx.reply(formatPipelineFailure(result));
            }
        } catch (err) {
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                return;
            }
            console.error('Pipeline error:', err.message);
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });
}

// ─── Execute Gemini-suggested actions against TickTick ────────

export async function executeActions(actions, adapter, currentTasks, options = {}) {
    const outcomes = [];
    let hasUndoableActions = false;
    const policyGoalThemeProfile = options.goalThemeProfile || createGoalThemeProfile(
        typeof options.userContext === 'string' ? options.userContext : (process.env.USER_CONTEXT || ''),
        { source: typeof options.userContext === 'string' ? 'user_context' : (process.env.USER_CONTEXT ? 'env' : 'fallback') },
    );

    const buildPolicySweepActions = (planned, tasks, projects = [], scopeTaskIds = null, sweepAllActive = false) => {
        const actionByTask = new Map();
        const completeOrDrop = new Set();
        for (const action of planned) {
            if (!action?.taskId) continue;
            if (action.type === 'complete' || action.type === 'drop') {
                completeOrDrop.add(action.taskId);
            }
            if (action.type === 'update') {
                actionByTask.set(action.taskId, action);
            }
        }

        const overlays = [];
        for (const task of tasks) {
            if (!task || (task.status !== 0 && task.status !== undefined)) continue;
            if (completeOrDrop.has(task.id)) continue;
            const currentProjectName = (task.projectName || '').toLowerCase();
            const inInbox = currentProjectName === 'inbox';
            if (!sweepAllActive && scopeTaskIds && scopeTaskIds.size > 0 && !scopeTaskIds.has(task.id) && !inInbox) {
                continue;
            }
            if (!sweepAllActive && (!scopeTaskIds || scopeTaskIds.size === 0) && !inInbox) {
                continue;
            }

            const pendingUpdate = actionByTask.get(task.id);
            const fix = {};

            const plannedPriority = pendingUpdate?.changes?.priority;
            const hasValidPlannedPriority = [1, 3, 5].includes(plannedPriority);
            const hasValidCurrentPriority = [1, 3, 5].includes(task.priority);
            if (!hasValidPlannedPriority && !hasValidCurrentPriority) {
                fix.priority = inferPriorityValueFromTask(task, { goalThemeProfile: policyGoalThemeProfile, nowIso: options.nowIso, workStyleMode: options.workStyleMode, urgentMode: options.urgentMode });
            } else if (plannedPriority === 0) {
                fix.priority = inferPriorityValueFromTask(task, { goalThemeProfile: policyGoalThemeProfile, nowIso: options.nowIso, workStyleMode: options.workStyleMode, urgentMode: options.urgentMode });
            }

            if (inInbox && !pendingUpdate?.changes?.projectId) {
                const targetProjectId = inferProjectIdFromTask(task, projects, { goalThemeProfile: policyGoalThemeProfile, nowIso: options.nowIso, workStyleMode: options.workStyleMode, urgentMode: options.urgentMode });
                if (targetProjectId && targetProjectId !== task.projectId) {
                    fix.projectId = targetProjectId;
                }
            }

            if (Object.keys(fix).length > 0) {
                overlays.push({ type: 'update', taskId: task.id, changes: fix });
            }
        }
        return overlays;
    };

    // We assume incoming actions for reorg are already cleanly shaped
    let plannedActions = [...(actions || [])].map(a => ({ ...a, changes: { ...(a.changes || {}) } }));

    if (options.enforcePolicySweep) {
        const scopeIds = new Set(
            Array.isArray(options.policyScopeTaskIds)
                ? options.policyScopeTaskIds.filter((id) => typeof id === 'string' && id.trim())
                : []
        );
        const overlays = buildPolicySweepActions(
            plannedActions,
            Array.isArray(currentTasks) ? currentTasks : [],
            Array.isArray(options.projects) ? options.projects : [],
            scopeIds,
            options.sweepAllActive === true
        );

        if (overlays.length > 0) {
            const map = new Map();
            for (const act of plannedActions) {
                if (act.taskId && act.type === 'update') map.set(act.taskId, act);
            }
            for (const overlay of overlays) {
                if (map.has(overlay.taskId)) {
                    map.get(overlay.taskId).changes = { ...map.get(overlay.taskId).changes, ...overlay.changes };
                } else {
                    plannedActions.push(overlay);
                }
            }
            outcomes.push(`🛡️ Policy sweep appended ${overlays.length} action(s).`);
        }
    }

    const resolveDueDate = (value, explicitPriority) => {
        if (!value) return null;
        const priorityLabel = explicitPriority === 5 ? 'career-critical' : explicitPriority === 1 ? 'life-admin' : 'important';
        return scheduleToDate(value, { priorityLabel }) || parseDateStringToTickTickISO(value, { priorityLabel, slotMode: 'priority' });
    };

    for (const action of plannedActions) {
        if (!action || typeof action !== 'object' || !action.type) continue;

        try {
            if (action.type === 'create') {
                const changes = action.changes || {};
                if (changes.title) {
                    let safeDueDate = resolveDueDate(changes.dueDate, changes.priority);
                    const createPayload = { ...changes, title: changes.title };
                    if (safeDueDate) createPayload.dueDate = safeDueDate;

                    await adapter.createTask(createPayload);
                    outcomes.push(`✅ Created: "${changes.title}"`);
                } else {
                    outcomes.push(`⚠️ Cannot create task: Missing title`);
                }
                continue;
            }

            if (!action.taskId) {
                outcomes.push(`⚠️ Skipped '${action.type}' action: AI did not provide a valid Task ID.`);
                continue;
            }

            const task = currentTasks.find(t => t.id === action.taskId);
            if (!task) {
                outcomes.push(`⚠️ Task not found: ${action.taskId}`);
                continue;
            }

            if (action.type === 'complete') {
                await adapter.completeTask(task.id, task.projectId);
                outcomes.push(`✅ Marked complete: "${task.title}"`);
                continue;
            }

            if (action.type === 'update') {
                const changes = action.changes || {};
                if (Object.keys(changes).length === 0) {
                    outcomes.push(`⚠️ Skipped invalid/unsupported action: update (No valid schema changes found)`);
                    continue;
                }

                let safeDueDate = resolveDueDate(changes.dueDate || changes.suggested_schedule, changes.priority);

                const updatePayload = {
                    ...changes,
                    projectId: changes.projectId || task.projectId,
                    originalProjectId: task.projectId
                };
                if (safeDueDate) updatePayload.dueDate = safeDueDate;
                if (changes.dueDate === null) updatePayload.dueDate = null;

                if (updatePayload.content !== undefined && containsSensitiveContent(task.content || '')) {
                    delete updatePayload.content;
                    outcomes.push(`⚠️ Preserved sensitive content for "${task.title}" (content rewrite blocked)`);
                }

                const updatedTask = await adapter.updateTask(task.id, updatePayload);

                await store.addUndoEntry(buildUndoEntry({
                    source: task,
                    action: 'reorg-update',
                    appliedTaskId: updatedTask.id,
                    applied: {
                        title: changes.title ?? null,
                        projectId: (changes.projectId && changes.projectId !== task.projectId) ? changes.projectId : null,
                        schedule: updatePayload.dueDate ?? null,
                    }
                }));

                outcomes.push(`✅ Updated: "${task.title}"`);
                hasUndoableActions = true;
            } else if (action.type === 'drop') {
                const dropChanges = action.changes || {};
                const hasTickTickMutation =
                    dropChanges.projectId !== undefined ||
                    dropChanges.priority !== undefined ||
                    dropChanges.title !== undefined ||
                    dropChanges.content !== undefined ||
                    dropChanges.dueDate !== undefined;

                if (hasTickTickMutation) {
                    const safeDueDate = resolveDueDate(dropChanges.dueDate, 0);
                    const updatePayload = {
                        projectId: dropChanges.projectId || task.projectId,
                        originalProjectId: task.projectId,
                        priority: dropChanges.priority ?? 0,
                    };
                    if (dropChanges.title !== undefined) updatePayload.title = dropChanges.title;
                    if (dropChanges.content !== undefined && !containsSensitiveContent(task.content || '')) {
                        updatePayload.content = dropChanges.content;
                    }
                    if (safeDueDate !== undefined) updatePayload.dueDate = safeDueDate;
                    await adapter.updateTask(task.id, updatePayload);
                    outcomes.push(`⚪ Demoted as drop-candidate: "${task.title}"`);
                } else {
                    outcomes.push(`⚪ Flagged for dropping: "${task.title}" (not deleted — mark complete in TickTick if you agree)`);
                }

                await store.markTaskProcessed(task.id, {
                    originalTitle: task.title,
                    dropped: true,
                    droppedByReorg: true,
                });
            } else {
                outcomes.push(`⚠️ Skipped invalid/unsupported action: ${action.type}`);
            }
        } catch (err) {
            outcomes.push(`❌ Failed on "${action.taskId}": ${err.message}`);
        }
    }
    return { outcomes, hasUndoableActions };
}


