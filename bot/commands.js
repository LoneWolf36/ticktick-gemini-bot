// Bot command handlers — /start, /status, /scan, /briefing, /weekly, /review, /pending, /undo
import * as store from '../services/store.js';
import { InlineKeyboard } from 'grammy';
import { taskReviewKeyboard } from './callbacks.js';
import {
    buildTaskCard, buildPendingData, pendingToAnalysis, buildTickTickUpdate,
    sleep, userLocaleString, isAuthorized, guardAccess, PRIORITY_LABEL, buildUndoEntry,
    formatBriefingHeader, filterProcessedThisWeek, buildQuotaExhaustedMessage, buildAutoApplyNotification,
    parseDateStringToTickTickISO, parseTelegramMarkdownToHTML, replyWithMarkdown, sendWithMarkdown, editWithMarkdown, truncateMessage, scheduleToDate, containsSensitiveContent
} from './utils.js';

export function registerCommands(bot, ticktick, gemini, config = {}) {
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
                    ticktick,
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

    async function runTaskIntake(ctx, { mode, pendingGate, quotaParking }) {
        if (!await guardAccess(ctx)) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply(mode === 'scan'
                ? '🔴 TickTick not connected. Run the OAuth flow first.'
                : '🔴 TickTick not connected.'
            );
            return;
        }

        if (pendingGate) {
            const pendingCount = store.getPendingCount();
            if (pendingCount > 0) {
                await ctx.reply(`⏳ You have ${pendingCount} task(s) pending review.\nRun /pending first, or /scan for new tasks.`);
                return;
            }
        }

        await ctx.reply(mode === 'scan' ? '🔍 Scanning for new tasks...' : '📋 Checking for unreviewed tasks...');

        try {
            const allTasks = await ticktick.getAllTasks();
            const projects = ticktick.getLastFetchedProjects();
            const targetTasks = allTasks.filter(t => !store.isTaskKnown(t.id));

            if (targetTasks.length === 0) {
                if (mode === 'scan') {
                    const pendingCount = store.getPendingCount();
                    let msg = '✅ No new tasks found.';
                    if (pendingCount > 0) {
                        msg += `\n\n⏳ You have ${pendingCount} task(s) pending review. Run /pending to see them.`;
                    }
                    await ctx.reply(msg);
                } else {
                    await ctx.reply('✅ All tasks reviewed!');
                }
                return;
            }

            const batch = targetTasks.slice(0, 5);
            await ctx.reply(mode === 'scan'
                ? `📬 Found ${targetTasks.length} new task(s). Analyzing first ${batch.length}...`
                : `📬 ${targetTasks.length} task(s) to review. Sending ${batch.length}...`
            );

            let supervised = 0, autoApplied = [], failed = 0;
            const autoConfig = { autoApplyLifeAdmin, autoApplyDrops, autoApplyMode };
            let aiUnavailable = false;

            for (const task of batch) {
                if (quotaParking) {
                    try {
                        const result = await analyzeAndSend(ctx, task, gemini, ticktick, projects, autoConfig);
                        if (result === 'supervised') supervised++;
                        else if (result) autoApplied.push(result);
                    } catch (err) {
                        if (err.message === 'QUOTA_EXHAUSTED' || err.message === 'API_KEYS_UNAVAILABLE') {
                            const remaining = batch.slice(batch.indexOf(task));
                            for (const t of remaining) {
                                await store.markTaskFailed(t.id, 'quota_exhausted');
                            }
                            failed += remaining.length;
                            aiUnavailable = true;
                            break;
                        }
                        await store.markTaskFailed(task.id, err.message);
                        failed++;
                    }
                } else {
                    await analyzeAndSend(ctx, task, gemini, ticktick, projects, autoConfig);
                }

                await sleep(mode === 'scan' ? 3000 : 2500);
            }

            if (mode === 'scan') {
                let doneMsg = '';
                if (supervised > 0) doneMsg += `✨ ${supervised} task(s) sent for your review.\n`;
                if (autoApplied.length > 0) doneMsg += buildAutoApplyNotification(autoApplied);
                if (aiUnavailable) {
                    doneMsg += `\n${buildAiUnavailableMessage()} ${failed} task(s) parked for retry.`;
                } else if (failed > 0) {
                    doneMsg += `\n⚠️ ${failed} task(s) failed — parked for retry later.`;
                }
                if (!doneMsg) doneMsg = `✨ Batch done! ${batch.length} task(s) processed.`;
                if (targetTasks.length > 5) {
                    doneMsg += `\n\n📝 ${targetTasks.length - 5} more remain. Run /scan again for the next batch.`;
                }
                await replyWithMarkdown(ctx, doneMsg.trim());
            } else {
                if (targetTasks.length > 5) {
                    await ctx.reply(`📝 Sent ${batch.length} of ${targetTasks.length}. Run /review again for more.`);
                }
            }
        } catch (err) {
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                return;
            }
            if (mode === 'scan') console.error('Scan error:', err.message);
            await ctx.reply(mode === 'scan' ? `❌ Scan error: ${err.message}` : `❌ Review error: ${err.message}`);
        }
    }

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
        try { await runTaskIntake(ctx, { mode: 'scan', pendingGate: false, quotaParking: true }); }
        finally { store.releaseIntakeLock(); }
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
            // Restore original values to TickTick
            await ticktick.updateTask(last.taskId, {
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
        try {
            const tasks = await ticktick.getAllTasks();
            const briefing = await gemini.generateDailyBriefing(tasks);
            await replyWithMarkdown(ctx, formatBriefingHeader({ kind: 'daily' }) + briefing);
            await store.updateStats({ lastDailyBriefing: new Date().toISOString() });
        } catch (err) {
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
        try {
            const tasks = await ticktick.getAllTasks();
            const processed = store.getProcessedTasks();
            const thisWeek = filterProcessedThisWeek(processed, ['processedAt']);
            const digest = await gemini.generateWeeklyDigest(tasks, thisWeek);
            await replyWithMarkdown(ctx, formatBriefingHeader({ kind: 'weekly' }) + digest);
            await store.updateStats({ lastWeeklyDigest: new Date().toISOString() });
        } catch (err) {
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
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }

        if (!store.tryAcquireIntakeLock()) { await ctx.reply('⏳ A scan or poll is already running.'); return; }
        try { await runTaskIntake(ctx, { mode: 'review', pendingGate: true, quotaParking: false }); }
        finally { store.releaseIntakeLock(); }
    });

    // ─── Catch-all: free-form messages → Pipeline ─────────────
    bot.on('message:text', async (ctx) => {
        if (!isAuthorized(ctx)) return;
        // Skip commands (Grammy routes them first, but just in case)
        if (ctx.message.text.startsWith('/')) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected yet. Complete OAuth first.');
            return;
        }

        const userMessage = ctx.message.text.trim();
        if (!userMessage) return;

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
                timezone: process.env.USER_TIMEZONE || 'Europe/Dublin'
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
                const projects = ticktick.getLastFetchedProjects();
                const fallbackResult = await gemini.handleFreeform(userMessage, tasks, projects);
                if (fallbackResult) {
                    await replyWithMarkdown(ctx, truncateMessage(fallbackResult.response || fallbackResult.summary || 'Got it!', 4000));
                } else {
                    await ctx.reply('Sorry, no tasks found to act upon, and the coach didn\'t have a response.');
                }
            } else if (result.type === 'error') {
                await ctx.reply(result.confirmationText + '\n\n' + result.errors.join('\n'));
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

export async function executeActions(actions, ticktick, currentTasks, options = {}) {
    const outcomes = [];
    let hasUndoableActions = false;

    const inferPriorityLabel = (task, explicitPriority = undefined) => {
        const normalizedPriority = explicitPriority ?? task?.priority;
        if (normalizedPriority === 5) return 'career-critical';
        if (normalizedPriority === 1) return 'life-admin';
        if (normalizedPriority === 3) return 'important';

        const haystack = `${task?.title || ''} ${task?.projectName || ''}`.toLowerCase();
        if (/\b(system design|dsa|interview|resume|leetcode|backend|career|study|assignment|exam)\b/i.test(haystack)) {
            return 'career-critical';
        }
        if (/\b(bank|bill|grocery|admin|errand|password|credential|home|apartment|rent|insurance)\b/i.test(haystack)) {
            return 'life-admin';
        }
        return 'important';
    };

    const normalizeActionType = (action) => {
        const rawType = action?.type ?? action?.action ?? action?.operation ?? action?.intent;
        if (typeof rawType !== 'string') return null;
        const normalized = rawType.trim().toLowerCase();
        if (['update', 'drop', 'create', 'complete'].includes(normalized)) return normalized;
        if (normalized === 'delete') return 'drop';
        if (normalized === 'done') return 'complete';
        if (normalized === 'add') return 'create';
        return null;
    };

    const normalizeTaskId = (action) =>
        action?.taskId ??
        action?.task_id ??
        action?.id ??
        action?.targetTaskId ??
        action?.target_task_id ??
        action?.targetId ??
        action?.target_id ??
        null;

    const resolveDueDate = (value, { task, explicitPriority } = {}) => {
        const priorityLabel = inferPriorityLabel(task, explicitPriority);
        if (value === null) return null;
        if (typeof value === 'object') {
            const bucketCandidate =
                value.scheduleBucket ??
                value.schedule_bucket ??
                value.bucket ??
                value.value ??
                value.relative;
            if (typeof bucketCandidate === 'string') {
                const bucketDate = scheduleToDate(bucketCandidate.trim().toLowerCase());
                if (bucketDate) return bucketDate;
            }
            const absoluteCandidate =
                value.dueDate ??
                value.due_date ??
                value.date ??
                value.dateString ??
                value.datetime;
            if (typeof absoluteCandidate === 'string') {
                const parsedAbsolute = parseDateStringToTickTickISO(absoluteCandidate, {
                    slotMode: 'priority',
                    priorityLabel,
                });
                if (parsedAbsolute) return parsedAbsolute;
            }
            return undefined;
        }
        if (typeof value !== 'string') return undefined;
        const normalized = value.trim().toLowerCase();
        const bucketToDate = scheduleToDate(normalized, { priorityLabel });
        if (bucketToDate) return bucketToDate;
        return parseDateStringToTickTickISO(value, {
            slotMode: 'priority',
            priorityLabel,
        }) || undefined;
    };

    const normalizeActionChanges = (action) => {
        const extracted = {};
        const source = (action && typeof action.changes === 'object') ? action.changes : {};
        const nested = (action && typeof action.payload === 'object') ? action.payload : {};
        const updateLike = (action && typeof action.update === 'object') ? action.update : {};
        const fieldsLike = (action && typeof action.fields === 'object') ? action.fields : {};

        const firstDefined = (...values) => values.find(v => v !== undefined);

        // Canonical schema keys
        const canonicalKeys = ['title', 'content', 'projectId', 'priority'];
        for (const key of canonicalKeys) {
            if (source[key] !== undefined) extracted[key] = source[key];
        }
        if (extracted.title === undefined) {
            extracted.title = firstDefined(
                source.name,
                source.newTitle,
                source.new_title,
                nested.title,
                nested.name,
                updateLike.title,
                updateLike.name,
                fieldsLike.title,
                fieldsLike.name
            );
        }
        if (extracted.content === undefined) {
            extracted.content = firstDefined(
                source.description,
                source.notes,
                source.note,
                source.details,
                source.comment,
                nested.content,
                nested.description,
                nested.details,
                nested.note,
                updateLike.content,
                updateLike.description,
                updateLike.details,
                fieldsLike.content,
                fieldsLike.description,
                fieldsLike.details
            );
        }
        if (extracted.priority === undefined) {
            extracted.priority = firstDefined(
                source.priorityLevel,
                source.priority_level,
                source.priority,
                nested.priority,
                updateLike.priority,
                fieldsLike.priority
            );
        }

        // Common LLM aliases for project and due date
        if (extracted.projectId === undefined) {
            extracted.projectId =
                source.project_id ??
                source.project ??
                source.suggestedProjectId ??
                source.suggested_project_id ??
                nested.projectId ??
                nested.project_id ??
                updateLike.projectId ??
                updateLike.project_id ??
                fieldsLike.projectId ??
                fieldsLike.project_id ??
                action.projectId ??
                action.project_id;
        }

        const rawDueDate =
            source.dueDate ??
            source.due_date ??
            source.newDueDate ??
            source.new_due_date ??
            source.date ??
            source.when ??
            source.due ??
            source.deadline ??
            source.due_on ??
            source.schedule ??
            source.scheduleBucket ??
            source.suggested_schedule ??
            source.suggestedSchedule ??
            source.newSchedule ??
            source.new_schedule ??
            source.schedule_bucket ??
            nested.dueDate ??
            nested.due_date ??
            nested.newDueDate ??
            nested.new_due_date ??
            nested.date ??
            nested.when ??
            nested.due ??
            nested.deadline ??
            nested.schedule ??
            nested.scheduleBucket ??
            nested.suggested_schedule ??
            nested.suggestedSchedule ??
            nested.newSchedule ??
            nested.new_schedule ??
            updateLike.dueDate ??
            updateLike.due_date ??
            updateLike.newDueDate ??
            updateLike.new_due_date ??
            updateLike.date ??
            updateLike.when ??
            updateLike.due ??
            updateLike.deadline ??
            updateLike.schedule ??
            updateLike.scheduleBucket ??
            updateLike.suggested_schedule ??
            updateLike.suggestedSchedule ??
            updateLike.newSchedule ??
            updateLike.new_schedule ??
            fieldsLike.dueDate ??
            fieldsLike.due_date ??
            fieldsLike.newDueDate ??
            fieldsLike.new_due_date ??
            fieldsLike.date ??
            fieldsLike.when ??
            fieldsLike.due ??
            fieldsLike.deadline ??
            fieldsLike.schedule ??
            fieldsLike.scheduleBucket ??
            fieldsLike.suggested_schedule ??
            fieldsLike.suggestedSchedule ??
            action.dueDate ??
            action.due_date ??
            action.newDueDate ??
            action.new_due_date ??
            action.date ??
            action.when ??
            action.due ??
            action.deadline ??
            action.schedule ??
            action.scheduleBucket ??
            action.suggested_schedule;

        if (rawDueDate !== undefined) {
            const parsed = resolveDueDate(rawDueDate);
            if (parsed !== undefined) extracted.dueDate = parsed;
        }

        // Root-level fallback for historically flat-mapped model output
        for (const key of ['title', 'content', 'priority']) {
            if (extracted[key] === undefined && action[key] !== undefined) extracted[key] = action[key];
        }

        if (typeof extracted.priority === 'string') {
            const p = extracted.priority.trim().toLowerCase();
            if (p === 'high' || p === 'p1' || p === 'career-critical') extracted.priority = 5;
            else if (p === 'medium' || p === 'p2' || p === 'important') extracted.priority = 3;
            else if (p === 'low' || p === 'p3' || p === 'life-admin') extracted.priority = 1;
            else if (p === 'none' || p === 'p4' || p === 'consider-dropping') extracted.priority = 0;
        }

        if (typeof extracted.priority === 'number' && ![0, 1, 3, 5].includes(extracted.priority)) {
            delete extracted.priority;
        }

        return extracted;
    };

    const normalizeAndDedupeActions = (inputActions = []) => {
        const updateByTaskId = new Map();
        const terminalByTaskId = new Map();
        const creates = [];
        const seenCreates = new Set();

        for (const raw of inputActions) {
            const action = raw && typeof raw === 'object' ? { ...raw } : {};
            action.type = normalizeActionType(action);
            action.taskId = normalizeTaskId(action);
            if (!action.type) continue;

            if (action.type === 'create') {
                const c = normalizeActionChanges(action);
                const key = `${(c.title || '').trim().toLowerCase()}|${c.projectId || ''}|${c.dueDate || ''}`;
                if (!c.title || seenCreates.has(key)) continue;
                seenCreates.add(key);
                creates.push({ type: 'create', changes: c });
                continue;
            }

            if (!action.taskId) continue;

            if (action.type === 'update' || action.type === 'drop') {
                const c = normalizeActionChanges(action);
                const prior = updateByTaskId.get(action.taskId) || {};
                const merged = { ...prior, ...c };
                const nextType = action.type === 'drop' ? 'drop' : (prior.__type === 'drop' ? 'drop' : 'update');
                merged.__type = nextType;
                updateByTaskId.set(action.taskId, merged);
                continue;
            }

            if (action.type === 'complete') {
                terminalByTaskId.set(action.taskId, { type: 'complete', taskId: action.taskId, changes: {} });
            }
        }

        const deduped = [];
        for (const [taskId, payload] of updateByTaskId.entries()) {
            if (terminalByTaskId.has(taskId)) continue;
            const type = payload.__type || 'update';
            delete payload.__type;
            deduped.push({ type, taskId, changes: payload });
        }
        deduped.push(...terminalByTaskId.values());
        deduped.push(...creates);
        return deduped;
    };

    const inferPriorityForPolicy = (task) => {
        const label = inferPriorityLabel(task);
        if (label === 'career-critical') return 5;
        if (label === 'life-admin') return 1;
        return 3;
    };

    const inferProjectIdForPolicy = (task, projects = []) => {
        if (!Array.isArray(projects) || projects.length === 0) return null;
        const text = `${task?.title || ''} ${task?.projectName || ''} ${task?.content || ''}`.toLowerCase();
        const byFragment = (fragment) =>
            projects.find((p) => (p.name || '').toLowerCase().includes(fragment))?.id || null;
        if (/\b(system design|dsa|interview|resume|backend|career|study|college|assignment|exam)\b/.test(text)) {
            return byFragment('career') || byFragment('study') || null;
        }
        if (/\b(bank|bill|grocery|get |print|admin|errand|shopping|passport|visa|password|credential|wifi|home)\b/.test(text)) {
            return byFragment('admin') || byFragment('personal') || null;
        }
        return byFragment('admin') || byFragment('personal') || null;
    };

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
                fix.priority = inferPriorityForPolicy(task);
            } else if (plannedPriority === 0) {
                fix.priority = inferPriorityForPolicy(task);
            }

            if (inInbox && !pendingUpdate?.changes?.projectId) {
                const targetProjectId = inferProjectIdForPolicy(task, projects);
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

    let plannedActions = normalizeAndDedupeActions(actions);
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
            plannedActions = normalizeAndDedupeActions([...plannedActions, ...overlays]);
            outcomes.push(`🛡️ Policy sweep appended ${overlays.length} action(s).`);
        }
    }

    for (const rawAction of plannedActions) {
        const action = rawAction && typeof rawAction === 'object' ? { ...rawAction } : {};
        action.type = normalizeActionType(action);
        action.taskId = normalizeTaskId(action);

        try {
            if (action.type === 'create') {
                const createChanges = normalizeActionChanges(action);
                if (createChanges && createChanges.title) {
                    let safeDueDate = undefined;
                    if (createChanges.dueDate) {
                        safeDueDate = resolveDueDate(createChanges.dueDate, {
                            explicitPriority: createChanges.priority,
                        });
                    }
                    const createPayload = { ...createChanges, title: createChanges.title };
                    if (safeDueDate) createPayload.dueDate = safeDueDate;

                    await ticktick.createTask(createPayload);
                    outcomes.push(`✅ Created: "${createChanges.title}"`);
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
                await ticktick.completeTask(task.projectId, task.id);
                outcomes.push(`✅ Marked complete: "${task.title}"`);
                continue;
            }

            if (action.type === 'update') {
                const changesPayload = normalizeActionChanges(action);
                if (Object.keys(changesPayload).length === 0) {
                    const actionKeys = Object.keys(action || {});
                    const changeKeys = (action && typeof action.changes === 'object') ? Object.keys(action.changes) : [];
                    outcomes.push(`⚠️ Skipped invalid/unsupported action: update (No valid schema changes found; action keys: ${actionKeys.join(', ') || 'none'}; changes keys: ${changeKeys.join(', ') || 'none'})`);
                    continue;
                }

                // If Gemini provided a due date, safely format it for TickTick
                let safeDueDate = undefined;
                if (changesPayload.dueDate) {
                    safeDueDate = resolveDueDate(changesPayload.dueDate, {
                        task,
                        explicitPriority: changesPayload.priority,
                    });
                }

                const changes = {
                    ...changesPayload,
                    dueDate: safeDueDate ?? changesPayload.dueDate, // Try parsed, fallback to original to let API error rather than silently drop if it's completely alien
                    projectId: changesPayload.projectId || task.projectId,
                    originalProjectId: task.projectId
                };
                if (changes.content !== undefined && containsSensitiveContent(task.content || '')) {
                    delete changes.content;
                    outcomes.push(`⚠️ Preserved sensitive content for "${task.title}" (content rewrite blocked)`);
                }
                // Remove raw dueDate if we safely parsed it
                if (safeDueDate) changes.dueDate = safeDueDate;

                // If it was meant to be cleared... 
                if (changesPayload.dueDate === null) changes.dueDate = null;

                const updatedTask = await ticktick.updateTask(task.id, changes);

                // Log for /undo
                await store.addUndoEntry(buildUndoEntry({
                    source: task,
                    action: 'freeform-update',
                    appliedTaskId: updatedTask.id,
                    applied: {
                        title: changesPayload.title ?? null,
                        project: null,
                        projectId: (changesPayload.projectId && changesPayload.projectId !== task.projectId) ? changesPayload.projectId : null,
                        schedule: changes.dueDate ?? null,
                    }
                }));

                outcomes.push(`✅ Updated: "${task.title}"`);
                hasUndoableActions = true;
            } else if (action.type === 'drop') {
                const dropChanges = normalizeActionChanges(action);
                const hasTickTickMutation =
                    dropChanges.projectId !== undefined ||
                    dropChanges.priority !== undefined ||
                    dropChanges.title !== undefined ||
                    dropChanges.content !== undefined ||
                    dropChanges.dueDate !== undefined;

                if (hasTickTickMutation) {
                    const safeDueDate = dropChanges.dueDate
                        ? resolveDueDate(dropChanges.dueDate, {
                            task,
                            explicitPriority: dropChanges.priority ?? 0,
                        })
                        : undefined;
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
                    await ticktick.updateTask(task.id, updatePayload);
                    outcomes.push(`⚪ Demoted as drop-candidate: "${task.title}"`);
                } else {
                    // Flag as dropped but DON'T delete — too risky
                    outcomes.push(`⚪ Flagged for dropping: "${task.title}" (not deleted — mark complete in TickTick if you agree)`);
                }

                await store.markTaskProcessed(task.id, {
                    originalTitle: task.title,
                    dropped: true,
                    droppedByFreeform: true,
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

// ─── Core: Analyze a task, then auto-apply or send card ─────
// Returns: 'supervised' if card sent, auto-apply result object if auto-applied, false if failed

export async function analyzeAndSend(ctx, task, gemini, ticktick, projects = [], config = {}) {
    try {
        const analysis = await gemini.analyzeTask(task, projects);
        const pendingData = buildPendingData(task, analysis, projects);
        const hasSensitiveContent = containsSensitiveContent(task.content || '');
        const hasExistingRichContent = (task.content || '').trim().length > 40;
        const safeAutoApply = !hasSensitiveContent && !hasExistingRichContent;

        const shouldAutoApply =
            (analysis.priority === 'life-admin' && config.autoApplyLifeAdmin) ||
            (analysis.priority === 'consider-dropping' && config.autoApplyDrops);

        if (shouldAutoApply && safeAutoApply) {
            return await autoApply(task, pendingData, analysis, ticktick, config);
        }

        // Supervised: send card with buttons
        await store.markTaskPending(task.id, pendingData);
        const card = buildTaskCard(task, analysis);
        const chatId = store.getChatId();

        if (ctx?.reply) {
            await replyWithMarkdown(ctx, card, { reply_markup: taskReviewKeyboard(task.id) });
        } else if (ctx?.api && chatId) {
            // Called from scheduler — ctx is the bot object
            await sendWithMarkdown(ctx.api, chatId, card, { reply_markup: taskReviewKeyboard(task.id) });
        }
        return 'supervised';
    } catch (err) {
        if (err.message === 'QUOTA_EXHAUSTED' || err.message === 'API_KEYS_UNAVAILABLE') throw err; // Let caller handle AI unavailability
        console.error(`Failed to analyze "${task.title}":`, err.message);
        return false;
    }
}

// ─── Auto-apply: update TickTick directly, no user approval ─

async function autoApply(task, pendingData, analysis, ticktick, config = {}) {
    const applyMode = config.autoApplyMode || 'metadata-only';
    const update = buildTickTickUpdate(pendingData, { applyMode, priorityLabel: analysis.priority || 'important' });
    const updatedTask = await ticktick.updateTask(task.id, update);

    // Log for /undo — include what was changed so undo can report it
    await store.addUndoEntry(buildUndoEntry({
        source: task,
        action: 'auto-apply',
        appliedTaskId: updatedTask.id,
        applied: {
            title: pendingData.improvedTitle ?? null,
            priority: PRIORITY_LABEL[pendingData.suggestedPriority] ?? null,
            project: (pendingData.suggestedProjectId && pendingData.suggestedProjectId !== task.projectId)
                ? pendingData.suggestedProject : null,
            projectId: (pendingData.suggestedProjectId && pendingData.suggestedProjectId !== task.projectId)
                ? pendingData.suggestedProjectId : null,
            schedule: pendingData.suggestedSchedule ?? null,
        }
    }));

    await store.markTaskProcessed(task.id, { ...pendingData, autoApplied: true });
    await store.updateStats({ tasksAutoApplied: (store.getStats().tasksAutoApplied || 0) + 1 });

    console.log(`[AUTO-APPLY] "${task.title}" → ${analysis.priority} | sched: ${pendingData.suggestedSchedule || 'none'} | project: ${pendingData.suggestedProject || 'same'}`);

    // Build summary for batch notification
    const schedLabel = { today: 'today', tomorrow: 'tomorrow', 'this-week': 'this week', 'next-week': 'next week' };
    return {
        title: pendingData.improvedTitle || task.title,
        schedule: schedLabel[pendingData.suggestedSchedule] || null,
        movedTo: (pendingData.suggestedProjectId && pendingData.suggestedProjectId !== task.projectId)
            ? pendingData.suggestedProject : null,
    };
}
