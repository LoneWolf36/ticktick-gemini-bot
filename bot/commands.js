// Bot command handlers — /start, /status, /scan, /briefing, /weekly, /review, /pending, /undo
import * as store from '../services/store.js';
import { taskReviewKeyboard } from './callbacks.js';
import {
    buildTaskCard, buildPendingData, pendingToAnalysis, buildTickTickUpdate,
    sleep, userLocaleString, isAuthorized, guardAccess, PRIORITY_LABEL, buildUndoEntry,
    formatBriefingHeader, filterProcessedThisWeek, buildQuotaExhaustedMessage
} from './utils.js';

export function registerCommands(bot, ticktick, gemini, config = {}) {
    const {
        autoApplyLifeAdmin = false,
        autoApplyDrops = false,
    } = config;

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
            `/status — Bot status and stats`
        );
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

        lines.push('\nCommands: /scan | /pending | /undo | /briefing | /weekly');
        await ctx.reply(lines.join('\n'));
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
            const autoConfig = { autoApplyLifeAdmin, autoApplyDrops };
            let quotaHit = false;

            for (const task of batch) {
                if (quotaParking) {
                    try {
                        const result = await analyzeAndSend(ctx, task, gemini, ticktick, projects, autoConfig);
                        if (result === 'supervised') supervised++;
                        else if (result) autoApplied.push(result);
                    } catch (err) {
                        if (err.message === 'QUOTA_EXHAUSTED') {
                            const remaining = batch.slice(batch.indexOf(task));
                            for (const t of remaining) {
                                await store.markTaskFailed(t.id, 'quota_exhausted');
                            }
                            failed += remaining.length;
                            quotaHit = true;
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
                if (quotaHit) {
                    doneMsg += `\n⚠️ AI quota reached — ${failed} task(s) parked for retry in ~2 hours.`;
                } else if (failed > 0) {
                    doneMsg += `\n⚠️ ${failed} task(s) failed — parked for retry later.`;
                }
                if (!doneMsg) doneMsg = `✨ Batch done! ${batch.length} task(s) processed.`;
                if (targetTasks.length > 5) {
                    doneMsg += `\n\n📝 ${targetTasks.length - 5} more remain. Run /scan again for the next batch.`;
                }
                await ctx.reply(doneMsg.trim());
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
            await ctx.reply(card, { reply_markup: taskReviewKeyboard(taskId) });
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
                projectId: last.originalProjectId,
                title: last.originalTitle,
                content: last.originalContent,
                priority: last.originalPriority,
            });
            await store.removeLastUndoEntry();

            // Build detailed context of what was reverted
            const lines = [`↩️ Reverted: "${last.originalTitle}"`];
            if (last.appliedTitle && last.appliedTitle !== last.originalTitle) {
                lines.push(`  Title: "${last.appliedTitle}" → "${last.originalTitle}"`);
            }
            if (last.appliedPriority) {
                lines.push(`  Priority: ${last.appliedPriority} → original`);
            }
            if (last.appliedProject) {
                lines.push(`  Project: moved back from ${last.appliedProject}`);
            }
            if (last.appliedSchedule) {
                lines.push(`  Schedule: removed (was: ${last.appliedSchedule})`);
            }
            lines.push('\nTask restored to its original state.');
            await ctx.reply(lines.join('\n'));

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
            await ctx.reply(formatBriefingHeader({ kind: 'daily' }) + briefing);
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
            await ctx.reply(formatBriefingHeader({ kind: 'weekly' }) + digest);
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

    // ─── Catch-all: free-form messages → Gemini ─────────────
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

        if (gemini.isQuotaExhausted()) {
            await ctx.reply(buildQuotaExhaustedMessage(gemini));
            return;
        }

        await ctx.reply('🤔 Thinking...');

        try {
            const tasks = await ticktick.getAllTasksCached(60000);
            const projects = ticktick.getLastFetchedProjects();
            const result = await gemini.handleFreeform(userMessage, tasks, projects);

            if (!result) {
                await ctx.reply('Sorry, I couldn\'t process that. Try again?');
                return;
            }

            if (result.mode === 'action' && result.actions?.length > 0) {
                // Execute the actions Gemini suggested
                const { outcomes, hasUndoableActions } = await executeActions(result.actions, ticktick, tasks);
                let response = result.summary || '✅ Done.';
                if (outcomes.length > 0) {
                    response += '\n\n' + outcomes.join('\n');
                }
                if (hasUndoableActions) {
                    response += '\n\nRun /undo to revert the last change.';
                }
                await ctx.reply(response);
            } else if (result.mode === 'coach') {
                await ctx.reply(result.response || 'I\'m here to help. Ask me anything about your tasks!');
            } else {
                await ctx.reply(result.response || result.summary || 'Got it! Let me know if you need anything else.');
            }
        } catch (err) {
            if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                await ctx.reply('🔴 TickTick disconnected (token expired). Please re-authenticate.');
                return;
            }
            console.error('Freeform error:', err.message);
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });
}

// ─── Execute Gemini-suggested actions against TickTick ────────

async function executeActions(actions, ticktick, currentTasks) {
    const outcomes = [];
    let hasUndoableActions = false;
    for (const action of actions) {
        try {
            if (action.type === 'create' && action.changes && action.changes.title) {
                await ticktick.createTask({ title: action.changes.title, ...action.changes });
                outcomes.push(`✅ Created: "${action.changes.title}"`);
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

            if (action.type === 'update' && action.changes) {
                // Log for /undo before applying
                await store.addUndoEntry(buildUndoEntry({
                    source: task,
                    action: 'freeform-update',
                    applied: {
                        title: action.changes.title ?? null,
                        project: null,
                        schedule: action.changes.dueDate ?? null,
                    }
                }));

                await ticktick.updateTask(task.id, {
                    projectId: action.changes.projectId || task.projectId,
                    ...action.changes,
                });
                outcomes.push(`✅ Updated: "${task.title}"`);
                hasUndoableActions = true;
            } else if (action.type === 'drop') {
                // Flag as dropped but DON'T delete — too risky
                await store.markTaskProcessed(task.id, {
                    originalTitle: task.title,
                    dropped: true,
                    droppedByFreeform: true,
                });
                outcomes.push(`⚪ Flagged for dropping: "${task.title}" (not deleted — mark complete in TickTick if you agree)`);
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

        const shouldAutoApply =
            (analysis.priority === 'life-admin' && config.autoApplyLifeAdmin) ||
            (analysis.priority === 'consider-dropping' && config.autoApplyDrops);

        if (shouldAutoApply) {
            return await autoApply(task, pendingData, analysis, ticktick);
        }

        // Supervised: send card with buttons
        await store.markTaskPending(task.id, pendingData);
        const card = buildTaskCard(task, analysis);
        const chatId = store.getChatId();

        if (ctx?.reply) {
            await ctx.reply(card, { reply_markup: taskReviewKeyboard(task.id) });
        } else if (ctx?.api && chatId) {
            // Called from scheduler — ctx is the bot object
            await ctx.api.sendMessage(chatId, card, { reply_markup: taskReviewKeyboard(task.id) });
        }
        return 'supervised';
    } catch (err) {
        if (err.message === 'QUOTA_EXHAUSTED') throw err; // Let caller handle quota abort
        console.error(`Failed to analyze "${task.title}":`, err.message);
        return false;
    }
}

// ─── Auto-apply: update TickTick directly, no user approval ─

async function autoApply(task, pendingData, analysis, ticktick) {
    const update = buildTickTickUpdate(pendingData);
    await ticktick.updateTask(task.id, update);

    // Log for /undo — include what was changed so undo can report it
    await store.addUndoEntry(buildUndoEntry({
        source: task,
        action: 'auto-apply',
        applied: {
            title: pendingData.improvedTitle ?? null,
            priority: PRIORITY_LABEL[pendingData.suggestedPriority] ?? null,
            project: (pendingData.suggestedProjectId && pendingData.suggestedProjectId !== task.projectId)
                ? pendingData.suggestedProject : null,
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
