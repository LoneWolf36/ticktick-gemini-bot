// Bot command handlers — operational bootstrap plus manual command surfaces.
// /start is an operational bootstrap / command-discovery surface, not a standalone Cavekit domain requirement.
// /daily_close is the manual entrypoint for cavekit-briefings R7 (End-of-Day Reflection).
import * as store from '../services/store.js';
import { InlineKeyboard } from 'grammy';
import { USER_CONTEXT } from '../services/gemini.js';
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
import { detectWorkStyleModeIntent } from '../services/ax-intent.js';
import { detectBehavioralPatterns } from '../services/behavioral-patterns.js';

// Rate limiter removed 2026-04-19 (cavekit-validate Phase 3): YAGNI for 1-user MVP.
// Heavy-command rate limiting listed as out-of-scope in cavekit-task-pipeline.md.

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
        .text('🌙 Daily Close', 'menu:daily_close')
        .row()
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

    const buildSummaryContext = ({ kind, userId, workStyleMode }) => ({
        kind,
        entryPoint: 'manual_command',
        userId,
        workStyleMode,
        urgentMode: workStyleMode === store.MODE_URGENT,
        tonePolicy: 'preserve_existing',
        generatedAtIso: new Date().toISOString(),
    });

    const processPipelineMessage = async (userMessage, options) => {
        if (typeof pipeline?.createRequestContext !== 'function') {
            return pipeline.processMessage(userMessage, options);
        }
        const requestContext = await pipeline.createRequestContext(userMessage, options);
        return pipeline.processMessage(userMessage, {
            ...options,
            requestContext,
        });
    };

    const describePatternForMemory = (pattern) => {
        switch (pattern?.type) {
            case 'snooze_spiral':
                return `A task was postponed ${pattern.signalCount} times in the current window.`;
            case 'planning_without_execution_type_a':
                return `Detailed planning stacked up ${pattern.signalCount} times without matching completion.`;
            case 'planning_without_execution_type_b':
                return `${pattern.signalCount} new tasks landed before completion caught up.`;
            default:
                return `One recurring pattern was detected ${pattern.signalCount || 1} time(s).`;
        }
    };

    const buildBehavioralMemorySummary = async (userId, { nowMs = Date.now() } = {}) => {
        if (typeof userId !== 'string' && typeof userId !== 'number') {
            throw new Error('invalid behavioral memory user');
        }

        const allSignals = await store.getBehavioralSignals(userId, { includeExpired: true });
        const activePatterns = detectBehavioralPatterns(allSignals, { nowMs })
            .filter((pattern) => pattern.eligibleForSurfacing === true);

        const lastSignalTimestamp = allSignals
            .map((signal) => Date.parse(signal?.timestamp || ''))
            .filter(Number.isFinite)
            .sort((left, right) => right - left)[0] || null;

        const lines = [
            '**🧠 Behavioral Memory Summary**',
            '',
        ];

        if (activePatterns.length === 0) {
            lines.push(`No active patterns in the last ${store.BEHAVIORAL_SIGNAL_RETENTION_DAYS} days.`);
        } else {
            lines.push('**Active Patterns**');
            activePatterns.slice(0, 3).forEach((pattern, index) => {
                lines.push(`${index + 1}. ${describePatternForMemory(pattern)} (${pattern.confidence} confidence)`);
            });
            if (activePatterns.length > 3) {
                lines.push(`- ${activePatterns.length - 3} additional active pattern(s) are retained but omitted here for brevity.`);
            }
        }

        lines.push('');
        lines.push(`**Retention Window:** ${store.BEHAVIORAL_SIGNAL_RETENTION_DAYS} days`);
        lines.push(`**Last Signal Date:** ${lastSignalTimestamp ? userLocaleString(new Date(lastSignalTimestamp).toISOString()) : 'No retained signals yet'}`);
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
            `/daily_close — Brief end-of-day reflection\n` +
            `/weekly — Weekly accountability digest\n` +
            `/review — Walk through all unreviewed tasks\n` +
            `/undo — Revert last auto-applied change\n` +
            `/reset — Wipe all bot data and start fresh\n` +
            `/status — Bot status and stats\n` +
            `/memory — View behavioral memory summary\n` +
            `/forget — Clear behavioral memory\n` +
            `/urgent — Activate urgent mode\n` +
            `/focus — Activate focus mode\n` +
            `/normal — Return to standard mode\n` +
            `/mode — Show current work-style mode`,
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
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }
        if (gemini.isQuotaExhausted()) {
            await ctx.reply(buildQuotaExhaustedMessage(gemini));
            return;
        }
        await ctx.reply('🧭 Building reorganization proposal...');
        try {
            const tasks = await adapter.listActiveTasks();
            const projects = await adapter.listProjects();
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

    const resolveWorkStyleModeUserId = (ctx) => ctx.from?.id ?? ctx.chat?.id ?? null;

    const formatModeLabel = (mode) => mode.toUpperCase();

    const formatModeReply = (state, confirmation) => {
        const lines = [confirmation, `Current mode: ${formatModeLabel(state.mode)}`];
        if (state.expiresAt) {
            const expiry = new Date(state.expiresAt).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
            lines.push(`Expires: ${expiry}`);
        }
        return lines.join('\n');
    };

    const replyWithMixedModeClarification = async (ctx) => {
        await applyWorkStyleMode(ctx, store.MODE_STANDARD);
        await ctx.reply('Heard mixed mode signals. Staying in STANDARD mode for now. If you want urgency, say /urgent. If you want deliberate planning, say /focus.');
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
                [store.MODE_STANDARD]: 'Standard mode active.',
            };
            await ctx.reply(formatModeReply(state, confirmationMap[mode] || 'Work style updated.'));
            return true;
        } catch (err) {
            await ctx.reply(`Could not update work style: ${err.message}`);
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
            await ctx.reply(`Could not read current mode: ${err.message}`);
            return false;
        }
    };

    bot.command('urgent', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        await applyWorkStyleMode(ctx, store.MODE_URGENT, { expiryMs: store.DEFAULT_URGENT_EXPIRY_MS });
    });

    bot.command('focus', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        await applyWorkStyleMode(ctx, store.MODE_FOCUS);
    });

    bot.command('normal', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        await applyWorkStyleMode(ctx, store.MODE_STANDARD);
    });

    bot.command('mode', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        await replyWithCurrentMode(ctx);
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
                const tasks = await adapter.listActiveTasks();
                const projects = await adapter.listProjects();
                const { outcomes, hasUndoableActions } = await executeActions(
                    pending.actions || [],
                    adapter,
                    tasks,
                    {
                        enforcePolicySweep: true,
                        projects,
                        policyScopeTaskIds: (pending.actions || []).map((a) => a?.taskId).filter(Boolean),
                        userContext: USER_CONTEXT,
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
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected. Run the OAuth flow first.'); return; }

        const pendingCount = store.getPendingCount();
        if (pendingCount > 0) {
            await ctx.reply(`⏳ You have ${pendingCount} task(s) pending review. Run /pending first.`);
            return;
        }

        if (!store.tryAcquireIntakeLock()) { await ctx.reply('⏳ A scan or poll is already running.'); return; }

        try {
            await ctx.reply('🔍 Scanning for new tasks...');
            const allTasks = await adapter.listActiveTasks(true);
            const availableProjects = await adapter.listProjects();
            const workStyleMode = await resolveCurrentWorkStyleMode(ctx);
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

                    const result = await processPipelineMessage(userMessage, {
                        existingTask: task,
                        entryPoint: 'telegram:scan',
                        mode: 'scan',
                        availableProjects,
                        workStyleMode,
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
    // RETAINED BOUNDARY: /undo restores a previously applied structured change
    // directly through the adapter. It is an operational recovery path, not a
    // product-feature drift from the canonical pipeline write path.
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
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }
        if (gemini.isQuotaExhausted()) {
            await ctx.reply(buildQuotaExhaustedMessage(gemini));
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
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }
        if (gemini.isQuotaExhausted()) {
            await ctx.reply(buildQuotaExhaustedMessage(gemini));
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

    // ─── /daily_close (cavekit-briefings R7 manual surface) ──
    bot.command('daily_close', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }
        if (gemini.isQuotaExhausted()) {
            await ctx.reply(buildQuotaExhaustedMessage(gemini));
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
                historyAvailable,
            });
            logSummarySurfaceEvent({
                context,
                result: dailyCloseResult,
                deliveryStatus: 'ready',
                extra: { historyAvailable },
            });
            await replyWithMarkdown(ctx, dailyCloseResult.formattedText);
            logSummarySurfaceEvent({
                context,
                result: dailyCloseResult,
                deliveryStatus: 'sent',
                extra: { historyAvailable },
            });
        } catch (err) {
            logSummarySurfaceEvent({ context, deliveryStatus: 'failed', error: err });
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                return;
            }
            await ctx.reply(`❌ Daily close error: ${err.message}`);
        }
    });

    // ─── /memory (cavekit-behavioral-memory R8) ──
    bot.command('memory', async (ctx) => {
        if (!await guardAccess(ctx)) return;
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
        if (!await guardAccess(ctx)) return;
        const userId = ctx.from?.id ?? ctx.chat?.id ?? null;
        if (!userId) {
            await ctx.reply('❌ Could not identify user for behavioral memory.');
            return;
        }

        try {
            const deletedCount = await store.deleteBehavioralSignals(userId);
            await ctx.reply(`🧠 Behavioral memory cleared. ${deletedCount} signal(s) removed. Previously stored patterns will no longer influence future summaries.`);
        } catch (err) {
            console.error('[ForgetCommand] Error:', err.message);
            await ctx.reply('❌ Failed to clear behavioral memory. Please try again.');
        }
    });

    // ─── /review ──────────────────────────────────────────────
    bot.command('review', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }

        const pendingCount = store.getPendingCount();
        if (pendingCount > 0) {
            await ctx.reply(`⏳ You have ${pendingCount} task(s) pending review.\nRun /pending first, or /scan for new tasks.`);
            return;
        }

        if (!store.tryAcquireIntakeLock()) { await ctx.reply('⏳ A scan or poll is already running.'); return; }

        try {
            await ctx.reply('📋 Checking for unreviewed tasks...');
            const allTasks = await adapter.listActiveTasks(true);
            const availableProjects = await adapter.listProjects();
            const targetTasks = allTasks.filter(t => !store.isTaskKnown(t.id));

            if (targetTasks.length === 0) {
                await ctx.reply('✅ All tasks reviewed!');
                return;
            }

            const batch = targetTasks.slice(0, 5);
            await ctx.reply(`📬 ${targetTasks.length} task(s) to review. Processing ${batch.length} through pipeline...`);
            const workStyleMode = await resolveCurrentWorkStyleMode(ctx);

            let confirmations = [];
            let failed = 0;

            for (const task of batch) {
                try {
                    const userMessage = task.title + (task.content ? `\n${task.content}` : '');
                    const result = await processPipelineMessage(userMessage, {
                        existingTask: task,
                        entryPoint: 'telegram:review',
                        mode: 'review',
                        availableProjects,
                        workStyleMode,
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
                const tasks = await adapter.listActiveTasks();
                const projects = await adapter.listProjects();
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
            // Check for pending checklist clarification resume.
            const pendingChecklist = store.getPendingChecklistClarification();
            if (pendingChecklist) {
                // User replied to a checklist clarification — resume with their answer
                const answer = userMessage.toLowerCase().trim();
                await store.clearPendingChecklistClarification();
                console.log('[ChecklistClarification] Reply received, resuming with answer:', answer);

                const resolvedMode = answer === 'checklist' || answer === 'checklist please' || answer === 'subtasks'
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
                        workStyleMode,
                    });
                    if (result.type === 'task') {
                        await replyWithMarkdown(ctx, truncateMessage(result.confirmationText, 4000));
                    } else if (result.type === 'error') {
                        await ctx.reply(formatPipelineFailure(result));
                    } else {
                        await ctx.reply(result.confirmationText || '✅ Created as a single task.');
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
                        workStyleMode,
                    });
                    if (result.type === 'task') {
                        await replyWithMarkdown(ctx, truncateMessage(result.confirmationText, 4000));
                    } else if (result.type === 'error') {
                        await ctx.reply(formatPipelineFailure(result));
                    } else {
                        await ctx.reply(result.confirmationText || '✅ Done.');
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
                    workStyleMode,
                });
                if (result.type === 'task') {
                    await replyWithMarkdown(ctx, truncateMessage(result.confirmationText, 4000));
                } else if (result.type === 'error') {
                    await ctx.reply(formatPipelineFailure(result));
                } else {
                    await ctx.reply(result.confirmationText || '✅ Created as a single task.');
                }
                return;
            }

            const result = await processPipelineMessage(userMessage, {
                entryPoint: 'telegram:freeform',
                mode: 'interactive',
                workStyleMode: await resolveCurrentWorkStyleMode(ctx),
            });

            if (result.type === 'task') {
                await replyWithMarkdown(ctx, truncateMessage(result.confirmationText, 4000));
            } else if (result.type === 'non-task') {
                // Fall back to conversational handling if no intent extracted
                if (gemini.isQuotaExhausted()) {
                    await ctx.reply(buildQuotaExhaustedMessage(gemini));
                    return;
                }
                await ctx.reply(result.confirmationText || 'Got it — no actionable tasks detected.');
            } else if (result.type === 'clarification') {
                // Determine clarification type: checklist vs mutation
                const reason = result.clarification?.reason || '';

                if (reason === 'ambiguous_checklist_vs_multi_task') {
                    // Checklist vs separate-tasks clarification.
                    const intents = result.clarification?.candidates || [];
                    const question = result.confirmationText || 'I noticed your message could be one task with sub-steps, or several separate tasks. Which did you mean?';

                    // Persist pending clarification with TTL (T052)
                    await store.setPendingChecklistClarification({
                        originalMessage: userMessage,
                        intents: intents.map(i => ({ type: i.type, title: i.title })),
                        chatId: ctx.chat?.id ?? null,
                        userId: ctx.from?.id ?? null,
                        entryPoint: 'telegram:freeform',
                        mode: 'interactive',
                    });
                    console.log('[ChecklistClarification] Question sent — pending state persisted');

                    // Send question with optional inline buttons (T055)
                    const keyboard = new InlineKeyboard()
                        .text('📋 Checklist', 'cl:checklist')
                        .text('📝 Separate', 'cl:separate')
                        .row()
                        .text('⏭ Skip', 'cl:skip');

                    await replyWithMarkdown(ctx, question + '\n\nReply with your choice or tap a button:', { reply_markup: keyboard });
                } else {
                    // Existing mutation clarification flow plus create-fragment clarification.
                    const candidates = result.clarification?.candidates || [];
                    if (candidates.length === 0) {
                        await ctx.reply(result.confirmationText || 'Not sure what you mean — could you rephrase?');
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
                        const msg = buildMutationClarificationMessage(
                            reason,
                            candidates,
                            result.confirmationText,
                            { workStyleMode: result.workStyleMode || await resolveCurrentWorkStyleMode(ctx) }
                        );
                        const keyboard = buildMutationCandidateKeyboard(candidates);
                        await replyWithMarkdown(ctx, msg, { reply_markup: keyboard });
                    }
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
//
// RETAINED SCOPE: This function is the canonical bridge between
// Gemini's reorg proposals (structured JSON actions) and TickTick
// writes via the adapter. It is ALSO used by the /reorg inline
// apply flow (bot.callbackQuery /^reorg:(apply|refine|cancel)$/).
//
// Primary task creation/mutation for bot-driven flows uses the
// structured pipeline path: AX intent -> normalizer -> ticktick-adapter.
// This helper is NOT a general-purpose task writer — it exists solely
// to apply Gemini-generated reorg actions (update/drop/create/complete)
// that come from the /reorg command or policy-sweep automation.
//
// Do NOT call this from new bot handlers unless the action source is
// a Gemini reorg proposal or a programmatic policy sweep.

export async function executeActions(actions, adapter, currentTasks, options = {}) {
    const outcomes = [];
    let hasUndoableActions = false;
    const policyGoalThemeProfile = options.goalThemeProfile || createGoalThemeProfile(
        typeof options.userContext === 'string' ? options.userContext : '',
        { source: typeof options.userContext === 'string' ? 'user_context' : 'fallback' },
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
