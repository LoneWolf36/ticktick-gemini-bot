// Bot command handlers — /start, /status, /scan, /briefing, /weekly, /review, /pending
import * as store from '../services/store.js';
import { taskReviewKeyboard } from './callbacks.js';
import { buildTaskCard, buildPendingData, pendingToAnalysis, PRIORITY_MAP, sleep } from './utils.js';

// ─── Access Control ─────────────────────────────────────────
const AUTHORIZED_CHAT_ID = process.env.TELEGRAM_CHAT_ID
    ? parseInt(process.env.TELEGRAM_CHAT_ID)
    : null;

function isAuthorized(ctx) {
    if (!AUTHORIZED_CHAT_ID) return true; // No restriction if not set
    return ctx.chat.id === AUTHORIZED_CHAT_ID;
}

async function guardAccess(ctx) {
    if (!isAuthorized(ctx)) {
        await ctx.reply('🔒 Unauthorized. This bot is private.');
        return false;
    }
    return true;
}

export function registerCommands(bot, ticktick, gemini) {

    // ─── /start — register chat ID ────────────────────────────
    bot.command('start', async (ctx) => {
        if (!await guardAccess(ctx)) return;

        const chatId = ctx.chat.id;
        store.setChatId(chatId);

        await ctx.reply(
            `🧠 TickTick AI Accountability Partner\n\n` +
            `Connected! Your chat ID is ${chatId}.\n\n` +
            `Commands:\n` +
            `/scan — Check for new tasks now (batched, 5 at a time)\n` +
            `/review — Walk through all tasks one by one\n` +
            `/pending — Re-surface tasks you haven't responded to\n` +
            `/briefing — Get today's morning briefing\n` +
            `/weekly — Get weekly accountability digest\n` +
            `/status — Show bot status and stats`
        );
    });

    // ─── /status — show stats ─────────────────────────────────
    bot.command('status', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        const stats = store.getStats();
        const pendingCount = store.getPendingCount();
        const lines = [
            '🧠 TickTick AI Accountability Partner\n',
            `🔌 TickTick: ${ticktick.isAuthenticated() ? '🟢 Connected' : '🔴 Not connected'}`,
            `📊 Tasks Analyzed: ${stats.tasksAnalyzed}`,
            `✅ Approved: ${stats.tasksApproved}`,
            `⏭ Skipped: ${stats.tasksSkipped}`,
            `⏳ Pending Review: ${pendingCount}`,
        ];
        if (stats.lastDailyBriefing) {
            lines.push(`🌅 Last Briefing: ${new Date(stats.lastDailyBriefing).toLocaleString('en-IE')}`);
        }
        if (stats.lastWeeklyDigest) {
            lines.push(`📊 Last Digest: ${new Date(stats.lastWeeklyDigest).toLocaleString('en-IE')}`);
        }
        lines.push('\nCommands: /scan | /pending | /briefing | /weekly');
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
            const newTasks = allTasks.filter(t => !store.isTaskKnown(t.id));

            if (newTasks.length === 0) {
                const pendingCount = store.getPendingCount();
                let msg = '✅ No new tasks found.';
                if (pendingCount > 0) {
                    msg += `\n\n⏳ You have ${pendingCount} task(s) still pending review. Run /pending to see them.`;
                }
                await ctx.reply(msg);
                return;
            }

            const batch = newTasks.slice(0, 5);
            await ctx.reply(`📬 Found ${newTasks.length} new task(s). Analyzing first ${batch.length}...`);

            let successes = 0;
            for (const task of batch) {
                const ok = await analyzeAndSend(ctx, task, gemini);
                if (ok) successes++;
                await sleep(5000);  // 5s between tasks to avoid Gemini rate limits
            }

            let doneMsg = `✨ Batch done! ${successes}/${batch.length} task(s) analyzed.`;
            if (successes < batch.length) {
                doneMsg += `\n\n⚠️ ${batch.length - successes} failed (likely rate-limited). Run /scan again — they'll retry.`;
            }
            if (newTasks.length > 5) {
                doneMsg += `\n\n📝 ${newTasks.length - 5} more remain. Run /scan again for the next batch.`;
            }
            await ctx.reply(doneMsg);
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
            // Reconstruct analysis from stored raw fields (no double-formatting)
            const analysis = pendingToAnalysis(data);
            const card = buildTaskCard(
                { title: data.originalTitle, projectName: data.projectName },
                analysis
            );
            await ctx.reply(card, { reply_markup: taskReviewKeyboard(taskId) });
            await sleep(1000);
        }

        if (entries.length > 5) {
            await ctx.reply(`📝 Sent 5 of ${entries.length}. Run /pending again for more.`);
        }
    });

    // ─── /briefing — daily briefing on demand ─────────────────
    bot.command('briefing', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected.');
            return;
        }

        await ctx.reply('🌅 Generating your briefing...');

        try {
            const tasks = await ticktick.getAllTasks();
            const briefing = await gemini.generateDailyBriefing(tasks);
            const header = `🌅 MORNING BRIEFING\n${new Date().toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' })}\n${'─'.repeat(24)}\n\n`;
            await ctx.reply(header + briefing);
            store.updateStats({ lastDailyBriefing: new Date().toISOString() });
        } catch (err) {
            console.error('Briefing error:', err.message);
            await ctx.reply(`❌ Briefing error: ${err.message}`);
        }
    });

    // ─── /weekly — weekly digest on demand ────────────────────
    bot.command('weekly', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected.');
            return;
        }

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
            const header = `📊 WEEKLY ACCOUNTABILITY REVIEW\n${'─'.repeat(28)}\n\n`;
            await ctx.reply(header + digest);
            store.updateStats({ lastWeeklyDigest: new Date().toISOString() });
        } catch (err) {
            console.error('Weekly error:', err.message);
            await ctx.reply(`❌ Weekly digest error: ${err.message}`);
        }
    });

    // ─── /review — batch walk-through ─────────────────────────
    bot.command('review', async (ctx) => {
        if (!await guardAccess(ctx)) return;
        if (!ticktick.isAuthenticated()) {
            await ctx.reply('🔴 TickTick not connected.');
            return;
        }

        const pendingCount = store.getPendingCount();
        if (pendingCount > 0) {
            await ctx.reply(`⏳ You have ${pendingCount} task(s) still pending review.\nRun /pending to review them first, or /scan to analyze new ones.`);
            return;
        }

        await ctx.reply('📋 Checking for unreviewed tasks...');

        try {
            const allTasks = await ticktick.getAllTasks();
            const unreviewed = allTasks.filter(t => !store.isTaskKnown(t.id));

            if (unreviewed.length === 0) {
                await ctx.reply('✅ All tasks have been reviewed!');
                return;
            }

            const batch = unreviewed.slice(0, 5);
            await ctx.reply(`📬 ${unreviewed.length} task(s) to review. Sending ${batch.length}...`);

            for (const task of batch) {
                await analyzeAndSend(ctx, task, gemini);
                await sleep(2500);
            }

            if (unreviewed.length > 5) {
                await ctx.reply(`📝 Sent ${batch.length} of ${unreviewed.length}. Run /review again for the next batch.`);
            }
        } catch (err) {
            console.error('Review error:', err.message);
            await ctx.reply(`❌ Review error: ${err.message}`);
        }
    });
}

// ─── Analyze a task and send to Telegram ────────────────────

export async function analyzeAndSend(ctx, task, gemini) {
    try {
        const analysis = await gemini.analyzeTask(task);

        // Store in PENDING using shared builder (single source of truth)
        store.markTaskPending(task.id, buildPendingData(task, analysis));

        const card = buildTaskCard(task, analysis);
        await ctx.reply(card, {
            reply_markup: taskReviewKeyboard(task.id),
        });
        return true;
    } catch (err) {
        console.error(`Failed to analyze "${task.title}":`, err.message);
        return false;
    }
}
