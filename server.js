// TickTick AI Accountability Partner — Main Entry Point
import 'dotenv/config';
import express from 'express';
import chalk from 'chalk';
import { TickTickClient } from './services/ticktick.js';
import { GeminiAnalyzer } from './services/gemini.js';
import { startScheduler } from './services/scheduler.js';
import { createBot } from './bot/index.js';

// ─── Config ──────────────────────────────────────────────────
const {
    TICKTICK_CLIENT_ID,
    TICKTICK_CLIENT_SECRET,
    TICKTICK_REDIRECT_URI,
    GEMINI_API_KEY,
    GEMINI_API_KEYS,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    USER_TIMEZONE = 'America/Los_Angeles',
    DAILY_BRIEFING_HOUR = '8',
    WEEKLY_DIGEST_DAY = '0',
    POLL_INTERVAL_MINUTES = '5',
    BOT_MODE = 'polling',
    WEBHOOK_URL = '',
    PORT = '8080',
    AUTO_APPLY_LIFE_ADMIN = 'true',
    AUTO_APPLY_DROPS = 'false',
} = process.env;

// ─── Validate required vars ─────────────────────────────────
const REQUIRED_VARS = {
    'TICKTICK_CLIENT_ID': TICKTICK_CLIENT_ID,
    'TICKTICK_CLIENT_SECRET': TICKTICK_CLIENT_SECRET,
    'TICKTICK_REDIRECT_URI': TICKTICK_REDIRECT_URI,
    'TELEGRAM_BOT_TOKEN': TELEGRAM_BOT_TOKEN,
    'TELEGRAM_CHAT_ID': TELEGRAM_CHAT_ID
};

const missingVars = Object.entries(REQUIRED_VARS)
    .filter(([_, val]) => !val || val.trim() === '')
    .map(([key]) => key);

if (missingVars.length > 0) {
    console.error(chalk.red('❌ Missing required environment variables:'));
    missingVars.forEach(v => console.error(chalk.red(`   - ${v}`)));
    console.error(chalk.yellow('\n💡 Example .env configuration:'));
    console.error(chalk.yellow('   TICKTICK_CLIENT_ID="your_client_id"'));
    console.error(chalk.yellow('   TICKTICK_CLIENT_SECRET="your_client_secret"'));
    console.error(chalk.yellow('   TICKTICK_REDIRECT_URI="http://localhost:8080/"'));
    console.error(chalk.yellow('   TELEGRAM_BOT_TOKEN="12345:ABCDE"'));
    console.error(chalk.yellow('   TELEGRAM_CHAT_ID="831923" (Required to secure the bot to your account)\n'));
    process.exit(1);
}

// ─── Initialize services ────────────────────────────────────
const ticktick = new TickTickClient({
    clientId: TICKTICK_CLIENT_ID,
    clientSecret: TICKTICK_CLIENT_SECRET,
    redirectUri: TICKTICK_REDIRECT_URI,
});

let geminiKeys = [];
if (GEMINI_API_KEYS && GEMINI_API_KEYS.trim().length > 0) {
    geminiKeys = GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k);
} else if (GEMINI_API_KEY && GEMINI_API_KEY.trim().length > 0) {
    geminiKeys = [GEMINI_API_KEY.trim()];
}

if (geminiKeys.length === 0) {
    console.error(chalk.red('❌ Missing GEMINI_API_KEYS (or GEMINI_API_KEY) in .env'));
    process.exit(1);
}

let gemini;
try {
    gemini = new GeminiAnalyzer(geminiKeys);
} catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
}

// ─── Bot config ─────────────────────────────────────────────
const botConfig = {
    autoApplyLifeAdmin: AUTO_APPLY_LIFE_ADMIN === 'true',
    autoApplyDrops: AUTO_APPLY_DROPS === 'true',
};

// ─── Create Telegram bot ────────────────────────────────────
const bot = createBot(TELEGRAM_BOT_TOKEN, ticktick, gemini, botConfig);

// ─── Express (OAuth callback + health check) ────────────────
const app = express();

// Health check for cloud hosting
app.get('/health', (req, res) => res.json({ status: 'ok', authenticated: ticktick.isAuthenticated() }));

// OAuth callback for TickTick
app.get('/', async (req, res) => {
    const { code } = req.query;

    if (code) {
        try {
            await ticktick.exchangeCode(code);
            res.send(`
        <!DOCTYPE html><html><head><title>Connected!</title>
        <style>body{font-family:'Segoe UI',sans-serif;background:#0f0f23;color:#e0e0e0;
        display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;}
        .card{background:#1a1a2e;border-radius:16px;padding:48px;text-align:center;
        box-shadow:0 8px 32px rgba(0,200,150,0.2);max-width:500px;}
        h1{color:#00c896;} p{color:#a0a0b0;line-height:1.6;}</style></head>
        <body><div class="card">
          <div style="font-size:3em">🎉</div>
          <h1>TickTick Connected!</h1>
          <p>Your AI accountability partner is now watching your tasks.<br>
          Go to Telegram and send <b>/start</b> to your bot.</p>
        </div></body></html>`);
            console.log(chalk.green('\n✅ TickTick authenticated!'));
        } catch (err) {
            console.error(chalk.red('OAuth error:'), err.message);
            res.status(500).send(`<h1>Auth Failed</h1><p>${err.message}</p>`);
        }
        return;
    }

    // Show status page
    res.json({
        app: 'TickTick AI Accountability Partner',
        ticktick: ticktick.isAuthenticated() ? 'connected' : 'not connected',
        authUrl: ticktick.isAuthenticated() ? null : ticktick.getAuthUrl(),
    });
});

// Webhook endpoint for production Telegram
if (BOT_MODE === 'webhook' && WEBHOOK_URL) {
    app.use(express.json());
    app.post('/webhook', async (req, res) => {
        try {
            await bot.handleUpdate(req.body);
        } catch (err) {
            console.error('Webhook error:', err.message);
        }
        res.sendStatus(200);
    });
}

// ─── Start everything ───────────────────────────────────────
app.listen(parseInt(PORT), async () => {
    console.log(chalk.bold.magenta('\n╔══════════════════════════════════════════════════╗'));
    console.log(chalk.bold.magenta('║  🧠 TickTick AI Accountability Partner           ║'));
    console.log(chalk.bold.magenta('╚══════════════════════════════════════════════════╝\n'));

    // Start Telegram bot
    if (BOT_MODE === 'webhook' && WEBHOOK_URL) {
        await bot.init();  // Required for webhook mode — polling does this automatically
        await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`);
        console.log(chalk.green(`📡 Telegram bot running (webhook: ${WEBHOOK_URL})`));
    } else {
        bot.start().catch((err) => {
            console.error(chalk.red(`\n❌ Telegram bot failed to start: ${err.message}`));
            console.error(chalk.yellow('   Check your TELEGRAM_BOT_TOKEN in .env'));
        });
        console.log(chalk.green('📡 Telegram bot running (long polling)'));
    }

    // Check TickTick auth
    if (ticktick.isAuthenticated()) {
        console.log(chalk.green('✅ TickTick connected'));
    } else {
        const authUrl = ticktick.getAuthUrl();
        console.log(chalk.yellow('\n🔑 TickTick not connected. Visit this URL to authorize:'));
        console.log(chalk.cyan(`   ${authUrl}\n`));
    }

    // Start scheduler
    await startScheduler(bot, ticktick, gemini, {
        dailyHour: parseInt(DAILY_BRIEFING_HOUR),
        weeklyDay: parseInt(WEEKLY_DIGEST_DAY),
        pollMinutes: parseInt(POLL_INTERVAL_MINUTES),
        timezone: USER_TIMEZONE,
        ...botConfig,
    });

    console.log(chalk.dim(`\n🌐 Server: http://127.0.0.1:${PORT}`));
    console.log(chalk.dim('💬 Open Telegram and send /start to your bot\n'));
});
