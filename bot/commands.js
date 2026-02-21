// Bot command handlers — /start, /status, /scan, /briefing, /weekly, /review, /pending, /undo
import * as store from '../services/store.js';
import { taskReviewKeyboard } from './callbacks.js';
import {
    buildTaskCard, buildPendingData, buildTickTickUpdate,
    buildAutoApplyNotification, pendingToAnalysis, PRIORITY_MAP, sleep,
} from './utils.js';

// ─── Access Control ─────────────────────────────────────────
const AUTHORIZED_CHAT_ID = process.env.TELEGRAM_CHAT_ID
    ? parseInt(process.env.TELEGRAM_CHAT_ID)
    : null;

function isAuthorized(ctx) {
    if (!AUTHORIZED_CHAT_ID) return true;
    return ctx.chat.id === AUTHORIZED_CHAT_ID;
}

async function guardAccess(ctx) {
    if (!isAuthorized(ctx)) {
        await ctx.reply('🔒 Unauthorized. This bot is private.');
        return false;
    }
    return true;
}

export function registerCommands(bot, ticktick, gemini, config = {}) {
    const {
        autoApplyLifeAdmin = false,
        autoApplyDrops = false,
    } = config;

    // ─── /start ───────────────────────────────────────────────
    bot.command('start', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        const chatId = ctx.chat.id;
        store.setChatId(chatId);
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
            `/status — Bot status and stats`
        );
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
            lines.push(`🌅 Last Briefing: ${new Date(stats.lastDailyBriefing).toLocaleString('en-IE')}`);
        }
        if (stats.lastWeeklyDigest) {
            lines.push(`📊 Last Digest: ${new Date(stats.lastWeeklyDigest).toLocaleString('en-IE')}`);
        }
        lines.push('\nCommands: /scan | /pending | /undo | /briefing | /weekly');
        await ctx.reply(lines.join('\n'));
    });

    // ─── /scan — manual poll, BATCHED (5 at a time) ───────────
    bot.command('scan', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected. Run the OAuth flow first.');
            return;
        }

        await ctx.reply('🔍 Scanning for new tasks...');

        try {
            const allTasks = await ticktick.getAllTasks();
            const projects = ticktick.getLastFetchedProjects();
            const newTasks = allTasks.filter(t => !store.isTaskKnown(t.id));

            if (newTasks.length === 0) {
                const pendingCount = store.getPendingCount();
                let msg = '✅ No new tasks found.';
                if (pendingCount > 0) {
                    msg += `\n\n⏳ You have ${pendingCount} task(s) pending review. Run /pending to see them.`;
                }
                await ctx.reply(msg);
                return;
            }

            const batch = newTasks.slice(0, 5);
            await ctx.reply(`📬 Found ${newTasks.length} new task(s). Analyzing first ${batch.length}...`);

            let supervised = 0, autoApplied = [];
            const autoConfig = { autoApplyLifeAdmin, autoApplyDrops };

            for (const task of batch) {
                const result = await analyzeAndSend(ctx, task, gemini, ticktick, projects, autoConfig);
                if (result === 'supervised') supervised++;
                else if (result) autoApplied.push(result);
                await sleep(5000);
            }

            let doneMsg = '';
            if (supervised > 0) doneMsg += `✨ ${supervised} task(s) sent for your review.\n`;
            if (autoApplied.length > 0) {
                doneMsg += buildAutoApplyNotification(autoApplied);
            }
            if (!doneMsg) doneMsg = `✨ Batch done! ${batch.length} task(s) processed.`;
            if (newTasks.length > 5) {
                doneMsg += `\n\n📝 ${newTasks.length - 5} more remain. Run /scan again for the next batch.`;
            }
            await ctx.reply(doneMsg.trim());
        } catch (err) {
            console.error('Scan error:', err.message);
            await ctx.reply(`❌ Scan error: ${err.message}`);
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
            store.removeLastUndoEntry();

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
        await ctx.reply('🌅 Generating your briefing...');
        try {
            const tasks = await ticktick.getAllTasks();
            const briefing = await gemini.generateDailyBriefing(tasks);
            const header = `🌅 MORNING BRIEFING\n${new Date().toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' })}\n${'─'.repeat(24)}\n\n`;
            await ctx.reply(header + briefing);
            store.updateStats({ lastDailyBriefing: new Date().toISOString() });
        } catch (err) {
            await ctx.reply(`❌ Briefing error: ${err.message}`);
        }
    });

    // ─── /weekly ──────────────────────────────────────────────
    bot.command('weekly', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (!ticktick.isAuthenticated()) { await ctx.reply('🔴 TickTick not connected.'); return; }
        await ctx.reply('📊 Generating your weekly review...');
        try {
            const tasks = await ticktick.getAllTasks();
            const processed = store.getProcessedTasks();
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const thisWeek = {};
            for (const [id, data] of Object.entries(processed)) {
                if (new Date(data.reviewedAt || data.processedAt) > oneWeekAgo) thisWeek[id] = data;
            }
            const digest = await gemini.generateWeeklyDigest(tasks, thisWeek);
            await ctx.reply(`📊 WEEKLY ACCOUNTABILITY REVIEW\n${'─'.repeat(28)}\n\n${digest}`);
            store.updateStats({ lastWeeklyDigest: new Date().toISOString() });
        } catch (err) {
            await ctx.reply(`❌ Weekly digest error: ${err.message}`);
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

        await ctx.reply('📋 Checking for unreviewed tasks...');
        try {
            const allTasks = await ticktick.getAllTasks();
            const projects = ticktick.getLastFetchedProjects();
            const unreviewed = allTasks.filter(t => !store.isTaskKnown(t.id));

            if (unreviewed.length === 0) { await ctx.reply('✅ All tasks reviewed!'); return; }

            const batch = unreviewed.slice(0, 5);
            await ctx.reply(`📬 ${unreviewed.length} task(s) to review. Sending ${batch.length}...`);

            for (const task of batch) {
                await analyzeAndSend(ctx, task, gemini, ticktick, projects, { autoApplyLifeAdmin, autoApplyDrops });
                await sleep(2500);
            }
            if (unreviewed.length > 5) {
                await ctx.reply(`📝 Sent ${batch.length} of ${unreviewed.length}. Run /review again for more.`);
            }
        } catch (err) {
            await ctx.reply(`❌ Review error: ${err.message}`);
        }
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

        await ctx.reply('🤔 Thinking...');

        try {
            const tasks = await ticktick.getAllTasks();
            const projects = ticktick.getLastFetchedProjects();
            const result = await gemini.handleFreeform(userMessage, tasks, projects);

            if (!result) {
                await ctx.reply('Sorry, I couldn\'t process that. Try again?');
                return;
            }

            if (result.mode === 'action' && result.actions?.length > 0) {
                // Execute the actions Gemini suggested
                const outcomes = await executeActions(result.actions, ticktick, tasks);
                let response = result.summary || '✅ Done.';
                if (outcomes.length > 0) {
                    response += '\n\n' + outcomes.join('\n');
                }
                response += '\n\nRun /undo to revert the last change.';
                await ctx.reply(response);
            } else if (result.mode === 'coach') {
                await ctx.reply(result.response || 'I\'m here to help. Ask me anything about your tasks!');
            } else {
                await ctx.reply(result.response || result.summary || 'Got it! Let me know if you need anything else.');
            }
        } catch (err) {
            console.error('Freeform error:', err.message);
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });
}

// ─── Execute Gemini-suggested actions against TickTick ────────

async function executeActions(actions, ticktick, currentTasks) {
    const outcomes = [];
    for (const action of actions) {
        try {
            const task = currentTasks.find(t => t.id === action.taskId);
            if (!task) {
                outcomes.push(`⚠️ Task not found: ${action.taskId}`);
                continue;
            }

            if (action.type === 'update' && action.changes) {
                // Log for /undo before applying
                store.addUndoEntry({
                    taskId: task.id,
                    action: 'freeform-update',
                    originalTitle: task.title,
                    originalContent: task.content || '',
                    originalPriority: task.priority,
                    originalProjectId: task.projectId,
                    appliedTitle: action.changes.title || null,
                    appliedProject: action.changes.projectId ? 'new project' : null,
                    appliedSchedule: action.changes.dueDate || null,
                });

                await ticktick.updateTask(task.id, {
                    projectId: action.changes.projectId || task.projectId,
                    ...action.changes,
                });
                outcomes.push(`✅ Updated: "${task.title}"`);
            } else if (action.type === 'drop') {
                // Flag as dropped but DON'T delete — too risky
                store.markTaskProcessed(task.id, {
                    originalTitle: task.title,
                    dropped: true,
                    droppedByFreeform: true,
                });
                outcomes.push(`⚪ Flagged for dropping: "${task.title}" (not deleted — mark complete in TickTick if you agree)`);
            }
        } catch (err) {
            outcomes.push(`❌ Failed on "${action.taskId}": ${err.message}`);
        }
    }
    return outcomes;
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
        store.markTaskPending(task.id, pendingData);
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
        console.error(`Failed to analyze "${task.title}":`, err.message);
        return false;
    }
}

// ─── Auto-apply: update TickTick directly, no user approval ─

async function autoApply(task, pendingData, analysis, ticktick) {
    const update = buildTickTickUpdate(pendingData);
    await ticktick.updateTask(task.id, update);

    // Log for /undo — include what was changed so undo can report it
    const priorityLabels = { 5: '🔴 career-critical', 3: '🟡 important', 1: '🔵 life-admin', 0: '⚪ consider-dropping' };
    store.addUndoEntry({
        taskId: task.id,
        action: 'auto-apply',
        originalTitle: task.title,
        originalContent: task.content || '',
        originalPriority: task.priority,
        originalProjectId: task.projectId,
        // What the bot changed (for /undo context)
        appliedTitle: pendingData.improvedTitle || null,
        appliedPriority: priorityLabels[pendingData.suggestedPriority] || null,
        appliedProject: (pendingData.suggestedProjectId && pendingData.suggestedProjectId !== task.projectId)
            ? pendingData.suggestedProject : null,
        appliedSchedule: pendingData.suggestedSchedule || null,
    });

    store.markTaskProcessed(task.id, { ...pendingData, autoApplied: true });
    store.updateStats({ tasksAutoApplied: (store.getStats().tasksAutoApplied || 0) + 1 });

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
