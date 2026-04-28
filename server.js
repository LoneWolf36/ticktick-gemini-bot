// TickTick AI Accountability Partner - Main Entry Point
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import chalk from 'chalk';
import { TickTickClient } from './services/ticktick.js';
import { GeminiAnalyzer } from './services/gemini.js';
import { startScheduler } from './services/scheduler.js';
import { createBot } from './bot/index.js';
import { TickTickAdapter } from './services/ticktick-adapter.js';
import { createIntentExtractor } from './services/intent-extraction.js';
import * as normalizer from './services/normalizer.js';
import { createPipeline } from './services/pipeline.js';
import { createPipelineObservability } from './services/pipeline-observability.js';
import { getUserTimezone } from './services/user-settings.js';
import * as store from './services/store.js';

const {
    TICKTICK_CLIENT_ID,
    TICKTICK_CLIENT_SECRET,
    TICKTICK_REDIRECT_URI,
    GEMINI_API_KEY,
    GEMINI_API_KEYS,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    DAILY_BRIEFING_HOUR = '8',
    WEEKLY_DIGEST_DAY = '0',
    POLL_INTERVAL_MINUTES = '5',
    BOT_MODE = 'polling',
    WEBHOOK_URL = '',
    PORT = '8080',
    TELEGRAM_WEBHOOK_SECRET = '',
    AUTO_APPLY_LIFE_ADMIN = 'true',
    AUTO_APPLY_DROPS = 'false',
    AUTO_APPLY_MODE = 'metadata-only',
    GEMINI_MODEL_FAST = 'gemini-2.5-flash',
    GEMINI_MODEL_ADVANCED = 'gemini-2.5-pro',
    GEMINI_MODEL_FAST_FALLBACKS = '',
    GEMINI_MODEL_ADVANCED_FALLBACKS = '',
    DEFAULT_PROJECT_NAME = 'Inbox',
    // TICKTICK_ACCESS_TOKEN is loaded by dotenv and used by TickTickClient internally
    // (validated at first API call, not at startup — the OAuth flow sets it)
} = process.env;

const REQUIRED_VARS = {
    TICKTICK_CLIENT_ID,
    TICKTICK_CLIENT_SECRET,
    TICKTICK_REDIRECT_URI,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
};

const parseModelList = (val) => val.split(',').map(s => s.trim()).filter(Boolean);

// Startup validation: REQUIRED_VARS are checked first (hard failure if missing).
// GEMINI_API_KEYS is validated next (hard failure if no keys available).
// TICKTICK_ACCESS_TOKEN is NOT checked here — it's validated on first API call
// because the OAuth flow populates it dynamically after authorization.

const missingVars = Object.entries(REQUIRED_VARS)
    .filter(([_, val]) => !val || val.trim() === '')
    .map(([key]) => key);

if (missingVars.length > 0) {
    console.error(chalk.red('Missing required environment variables:'));
    missingVars.forEach(v => console.error(chalk.red(`  - ${v}`)));
    process.exit(1);
}

const ticktick = new TickTickClient({
    clientId: TICKTICK_CLIENT_ID,
    clientSecret: TICKTICK_CLIENT_SECRET,
    redirectUri: TICKTICK_REDIRECT_URI,
});

let geminiKeys = [];
if (GEMINI_API_KEYS && GEMINI_API_KEYS.trim().length > 0) {
    geminiKeys = GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
} else if (GEMINI_API_KEY && GEMINI_API_KEY.trim().length > 0) {
    geminiKeys = [GEMINI_API_KEY.trim()];
}

if (geminiKeys.length === 0) {
    console.error(chalk.red('Missing GEMINI_API_KEYS (or GEMINI_API_KEY) in .env'));
    process.exit(1);
}

let gemini;
try {
    gemini = new GeminiAnalyzer(geminiKeys, {
        modelFast: GEMINI_MODEL_FAST,
        modelAdvanced: GEMINI_MODEL_ADVANCED,
        modelFastFallbacks: parseModelList(GEMINI_MODEL_FAST_FALLBACKS),
        modelAdvancedFallbacks: parseModelList(GEMINI_MODEL_ADVANCED_FALLBACKS),
    });
} catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
}

const botConfig = {
    autoApplyLifeAdmin: AUTO_APPLY_LIFE_ADMIN === 'true',
    autoApplyDrops: AUTO_APPLY_DROPS === 'true',
    autoApplyMode: AUTO_APPLY_MODE,
};

// Initialize new pipeline context
const adapter = new TickTickAdapter(ticktick);

const intentExtractor = createIntentExtractor(gemini);
const observability = createPipelineObservability();
const pipeline = createPipeline({
    intentExtractor,
    normalizer,
    adapter,
    observability,
    deferIntent: (entry) => store.appendDeferredPipelineIntent(entry),
    defaultProjectName: DEFAULT_PROJECT_NAME,
});

const bot = createBot(TELEGRAM_BOT_TOKEN, ticktick, gemini, adapter, pipeline, botConfig);
const app = express();
const userTimezone = getUserTimezone();

app.get('/health', async (req, res) => {
    const activeTasks = await adapter.listActiveTasks(true).catch(() => []);
    const queueHealth = store.getQueueHealthSnapshot();
    const operational = store.getOperationalSnapshot();
    const aiHealth = gemini.getHealthSnapshot();
    const recentLatencies = observability.getRecentLatencies ? observability.getRecentLatencies() : [];

    const latencySummary = {};
    for (const entry of recentLatencies) {
        if (!latencySummary[entry.stage]) latencySummary[entry.stage] = { count: 0, buckets: {} };
        latencySummary[entry.stage].count++;
        latencySummary[entry.stage].buckets[entry.bucket] = (latencySummary[entry.stage].buckets[entry.bucket] || 0) + 1;
    }

    const report = {
        status: 'ok',
        ticktick: {
            authenticated: ticktick.isAuthenticated(),
            activeTasks: activeTasks.length,
        },
        queue: queueHealth,
        workflow: operational.localWorkflow,
        cumulative: operational.cumulative,
        ai: aiHealth,
        latency: latencySummary,
        uptimeSeconds: Math.floor(process.uptime()),
    };

    res.json(report);
});

app.get('/', async (req, res) => {
    const { code } = req.query;

    if (code) {
        try {
            await ticktick.exchangeCode(code);
            res.send(`
        <!DOCTYPE html><html><head><title>Connected!</title>
        <style>body{font-family:'Segoe UI',sans-serif;background:#0f0f23;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;}.card{background:#1a1a2e;border-radius:16px;padding:48px;text-align:center;box-shadow:0 8px 32px rgba(0,200,150,0.2);max-width:500px;}h1{color:#00c896;}p{color:#a0a0b0;line-height:1.6;}</style></head>
        <body><div class="card"><div style="font-size:3em">??</div><h1>TickTick Connected!</h1><p>Your AI accountability partner is now watching your tasks.<br>Go to Telegram and send <b>/start</b> to your bot.</p></div></body></html>`);
            console.log(chalk.green('\nTickTick authenticated.'));
        } catch (err) {
            console.error(chalk.red('OAuth error:'), err.message);
            res.status(500).send(`<h1>Auth Failed</h1><p>${err.message}</p>`);
        }
        return;
    }

    res.json({
        app: 'TickTick AI Accountability Partner',
        ticktick: ticktick.isAuthenticated() ? 'connected' : 'not connected',
        authUrl: ticktick.isAuthenticated() ? null : ticktick.getAuthUrl(),
    });
});

if (BOT_MODE === 'webhook' && WEBHOOK_URL) {
    app.use(express.json());
    app.post('/webhook', async (req, res) => {
        try {
            // Verify Telegram webhook signature
            const secretToken = req.headers['x-telegram-bot-api-secret-token'];
            if (TELEGRAM_WEBHOOK_SECRET && secretToken !== TELEGRAM_WEBHOOK_SECRET) {
                console.warn('Webhook: invalid secret token — rejecting request');
                res.sendStatus(403);
                return;
            }
            await bot.handleUpdate(req.body);
        } catch (err) {
            console.error('Webhook error:', err.message);
        }
        res.sendStatus(200);
    });
}

const TELEGRAM_COMMANDS = [
    { command: 'start', description: 'Initialize bot and show quick actions' },
    { command: 'menu', description: 'Show command shortcuts' },
    { command: 'scan', description: 'Analyze new tasks (batched)' },
    { command: 'pending', description: 'Re-surface pending task reviews' },
    { command: 'briefing', description: 'Generate daily morning briefing' },
    { command: 'weekly', description: 'Generate weekly review digest' },
    { command: 'review', description: 'Walk through unreviewed tasks' },
    { command: 'reorg', description: 'Propose full task reorganization' },
    { command: 'undo', description: 'Revert last applied change' },
    { command: 'status', description: 'Show bot state and stats' },
    { command: 'reset', description: 'Wipe bot state (requires CONFIRM)' },
];

app.listen(parseInt(PORT), async () => {
    if (BOT_MODE === 'webhook' && WEBHOOK_URL) {
        await bot.init();
        await bot.api.setMyCommands(TELEGRAM_COMMANDS);
        if (TELEGRAM_WEBHOOK_SECRET) {
            await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`, { secret_token: TELEGRAM_WEBHOOK_SECRET });
        } else {
            await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`);
        }
        console.log(chalk.green(`Telegram bot running (webhook: ${WEBHOOK_URL})`));
    } else {
        bot.start().catch((err) => {
            console.error(chalk.red(`\nTelegram bot failed to start: ${err.message}`));
            console.error(chalk.yellow('Check your TELEGRAM_BOT_TOKEN in .env'));
        });
        await bot.api.setMyCommands(TELEGRAM_COMMANDS);
        console.log(chalk.green('Telegram bot running (long polling)'));
    }

    if (ticktick.isAuthenticated()) {
        console.log(chalk.green('TickTick connected'));
    } else {
        const authUrl = ticktick.getAuthUrl();
        console.log(chalk.yellow('\nTickTick not connected. Visit this URL to authorize:'));
        console.log(chalk.cyan(`   ${authUrl}\n`));
    }

    await startScheduler(bot, ticktick, gemini, adapter, pipeline, {
        dailyHour: parseInt(DAILY_BRIEFING_HOUR),
        weeklyDay: parseInt(WEEKLY_DIGEST_DAY),
        pollMinutes: parseInt(POLL_INTERVAL_MINUTES),
        timezone: userTimezone,
        ...botConfig,
    });

    console.log(chalk.dim(`\nServer: http://127.0.0.1:${PORT}`));
});
