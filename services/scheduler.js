// Scheduler — cron jobs for daily briefing, weekly digest, and task polling
import cron from 'node-cron';
import * as store from './store.js';
import { buildAutoApplyNotification } from '../bot/utils.js';
import { userTimeString, userTodayFormatted } from '../bot/utils.js';
import { analyzeAndSend } from '../bot/commands.js';

export async function startScheduler(bot, ticktick, gemini, config) {
    const {
        dailyHour = 8,
        weeklyDay = 0,
        pollMinutes = 5,
        timezone = 'Europe/Dublin',
        autoApplyLifeAdmin = false,
        autoApplyDrops = false,
    } = config;

    const autoConfig = { autoApplyLifeAdmin, autoApplyDrops };

    console.log(`📅 Scheduler starting (timezone: ${timezone})`);
    console.log(`   🌅 Daily briefing: ${dailyHour}:00`);
    console.log(`   📊 Weekly digest: ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weeklyDay]} 20:00`);
    console.log(`   🔄 Task polling: every ${pollMinutes} min`);
    console.log(`   🤖 Auto-apply life-admin: ${autoApplyLifeAdmin ? 'ON' : 'OFF'}`);

    // ─── Task polling (every N minutes) ──────────────────────
    let tokenExpiredNotified = false;
    let quotaNotificationSent = false;

    cron.schedule(`*/${pollMinutes} * * * *`, async () => {
        if (!ticktick.isAuthenticated()) {
            // Send a one-time Telegram notification when token expires
            if (!tokenExpiredNotified) {
                tokenExpiredNotified = true;
                const chatId = store.getChatId();
                if (chatId) {
                    try {
                        await bot.api.sendMessage(chatId,
                            '🔑 TickTick token has expired!\n\n' +
                            'The bot can no longer access your tasks. To reconnect:\n' +
                            `1. Visit: ${ticktick.getAuthUrl()}\n` +
                            '2. After authorizing, copy the new token from console\n' +
                            '3. Update TICKTICK_ACCESS_TOKEN in Render env vars'
                        );
                    } catch { /* best effort */ }
                }
                console.error('🔑 TickTick token expired — sent notification to user.');
            }
            return;
        }
        tokenExpiredNotified = false; // Reset if re-authenticated
        const chatId = store.getChatId();
        if (!chatId) return;

        console.log(`🔄 [${userTimeString()}] Polling for new tasks...`);

        try {
            // Skip if Gemini quota is known to be exhausted
            if (gemini.isQuotaExhausted()) {
                console.log('⏸️  Skipping poll — Gemini quota cooldown active.');
                return;
            }

            const allTasks = await ticktick.getAllTasks();
            const projects = ticktick.getLastFetchedProjects();
            const newTasks = allTasks.filter(t => !store.isTaskKnown(t.id));

            if (newTasks.length === 0) return;
            console.log(`📬 Found ${newTasks.length} new task(s)`);

            const batch = newTasks.slice(0, 5);
            const autoApplied = [];
            let quotaHit = false;

            for (const task of batch) {
                try {
                    const result = await analyzeAndSend(bot, task, gemini, ticktick, projects, autoConfig);
                    if (result && result !== 'supervised') autoApplied.push(result);
                } catch (err) {
                    if (err.message === 'QUOTA_EXHAUSTED') {
                        // Park ALL new tasks (not just this batch) — none can be processed
                        const resetMs = gemini.quotaResumeTime()
                            ? gemini.quotaResumeTime().getTime() - Date.now()
                            : 2 * 60 * 60 * 1000;
                        for (const t of newTasks) {
                            await store.markTaskFailed(t.id, 'quota_exhausted', resetMs);
                        }
                        console.log(`⏸️  Quota exhausted — parked ${newTasks.length} task(s) until quota resets.`);
                        quotaHit = true;
                        break;
                    }
                    // Non-quota failure — park individual task
                    await store.markTaskFailed(task.id, err.message);
                    console.error(`  ❌ Failed: "${task.title}": ${err.message}`);
                }
                await new Promise(r => setTimeout(r, 3000));
            }

            // Send one compact batch notification for auto-applied tasks
            if (autoApplied.length > 0) {
                const notification = buildAutoApplyNotification(autoApplied);
                if (notification) await bot.api.sendMessage(chatId, notification);
            }

            if (quotaHit && !quotaNotificationSent) {
                quotaNotificationSent = true;
                const resumeTime = gemini.quotaResumeTime();
                const resumeStr = resumeTime
                    ? resumeTime.toLocaleTimeString('en-US', {
                        timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit'
                    }) + ' PT'
                    : '~midnight PT';
                await bot.api.sendMessage(chatId,
                    `⚠️ AI daily quota exhausted — ${newTasks.length} tasks parked.\n` +
                    `Quota resets at ~${resumeStr}. Bot will auto-resume then.\n` +
                    `Or run /scan manually after reset.`
                );
            }
        } catch (err) {
            console.error('Poll error:', err.message);
        }

        // Reset spam suppression flag once quota cooldown has actually expired
        if (quotaNotificationSent && !gemini.isQuotaExhausted()) {
            quotaNotificationSent = false;
        }
    }, { timezone });

    // ─── Daily briefing (morning) ─────────────────────────────
    cron.schedule(`0 ${dailyHour} * * *`, async () => {
        if (!ticktick.isAuthenticated()) return;
        const chatId = store.getChatId();
        if (!chatId) return;

        console.log('🌅 Sending daily briefing...');
        try {
            // Don't waste an API call if quota is exhausted
            if (gemini.isQuotaExhausted()) {
                console.log('⏸️  Skipping daily briefing — Gemini quota exhausted.');
                return;
            }
            const tasks = await ticktick.getAllTasks();
            const briefing = await gemini.generateDailyBriefing(tasks);
            const today = userTodayFormatted();

            let msg = `🌅 MORNING BRIEFING\n${today}\n${'─'.repeat(24)}\n\n${briefing}`;

            const pendingCount = store.getPendingCount();
            if (pendingCount > 0) {
                msg += `\n\n⏳ ${pendingCount} task(s) pending your review. Run /pending.`;
            }

            await bot.api.sendMessage(chatId, msg);
            await store.updateStats({ lastDailyBriefing: new Date().toISOString() });
        } catch (err) {
            console.error('Daily briefing error:', err.message);
        }
    }, { timezone });

    // ─── Weekly digest (Sunday evening) ───────────────────────
    cron.schedule(`0 20 * * ${weeklyDay}`, async () => {
        if (!ticktick.isAuthenticated()) return;
        const chatId = store.getChatId();
        if (!chatId) return;

        console.log('📊 Sending weekly digest...');
        try {
            const tasks = await ticktick.getAllTasks();
            const processed = store.getProcessedTasks();
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const thisWeek = {};
            for (const [id, data] of Object.entries(processed)) {
                if (new Date(data.reviewedAt || data.sentAt) > oneWeekAgo) thisWeek[id] = data;
            }
            const digest = await gemini.generateWeeklyDigest(tasks, thisWeek);
            await bot.api.sendMessage(chatId, `📊 WEEKLY ACCOUNTABILITY REVIEW\n${'─'.repeat(28)}\n\n${digest}`);
            await store.updateStats({ lastWeeklyDigest: new Date().toISOString() });
        } catch (err) {
            console.error('Weekly digest error:', err.message);
        }
    }, { timezone });

    // ─── Store maintenance (daily at midnight) ─────────────────
    await store.pruneOldEntries(30); // Run once on boot
    cron.schedule('0 0 * * *', async () => {
        await store.pruneOldEntries(30);
    }, { timezone });

    console.log('✅ Scheduler running');
}
