# TickTick AI Accountability Partner

An AI-powered Telegram bot that connects to your TickTick task manager and acts as a proactive accountability partner — analyzing tasks, improving them with Gemini AI, and keeping you honest about your goals.

## What It Does

- **Analyzes every new task** you add to TickTick using Gemini AI, assessing whether it's a needle-mover toward your real goals or busywork
- **Improves task quality** — rewrites vague titles into clear actionable ones, adds structured descriptions and sub-steps, and re-prioritizes based on your actual goals
- **Sends all changes to Telegram for review** — nothing is applied without your approval (✅ Apply / ⏭ Skip / ⚪ Drop)
- **Daily morning briefing** — 3-4 prioritized focus items, leading with what you've been avoiding
- **Weekly accountability digest** — honest review of wins, avoidance patterns, and next week's top 3
- **Proactive polling** — detects new tasks added to TickTick and notifies you within 5 minutes
- **Goal-aware prioritization** — the AI knows your goals and behavioral patterns, calling out avoidance directly

## Architecture

```
TickTick API ──→ Scheduler (cron) ──→ Gemini 2.5 Flash ──→ Telegram Bot (grammy)
                    ↕                                            ↕
              File-based store                          User approves/skips
              (pending → processed)                     in Telegram
```

## Setup

### 1. Prerequisites

- Node.js 18+
- [TickTick developer app](https://developer.ticktick.com) (for OAuth credentials)
- [Gemini API key](https://aistudio.google.com/apikey)
- Telegram bot token from [@BotFather](https://t.me/BotFather)

### 2. Install

```bash
git clone https://github.com/YOUR_USERNAME/ticktick-gemini-bot
cd ticktick-gemini-bot
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see `.env.example` for all required fields).

### 4. Configure your personal context

```bash
cp services/user_context.example.js services/user_context.js
```

Edit `services/user_context.js` to describe your situation, goals, and behavioral patterns. **This file is gitignored — your personal data stays local.**

### 5. Authorize TickTick

```bash
node server.js
```

Visit `http://localhost:8080` and click the auth URL to connect TickTick via OAuth.

### 6. Connect Telegram

Open your bot in Telegram and send `/start`.

---

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/scan` | Analyze new tasks (batched, 5 at a time) |
| `/pending` | Re-surface tasks awaiting your review |
| `/briefing` | Get today's prioritized morning plan |
| `/weekly` | Get your weekly accountability digest |
| `/review` | Walk through all unreviewed tasks |
| `/status` | Show bot status and stats |

---

## Deployment

### Local (long polling)

```bash
node server.js
```

### Cloud (webhook — Railway, Render, Fly.io)

Set in `.env`:
```
BOT_MODE=webhook
WEBHOOK_URL=https://your-app.railway.app
```

Deploy using the included `Dockerfile`.

---

## Project Structure

```
├── server.js                    # Entry point (Express + bot startup)
├── bot/
│   ├── index.js                 # Bot factory
│   ├── commands.js              # /scan, /briefing, /weekly, /pending etc.
│   ├── callbacks.js             # Inline keyboard handlers (approve/skip/drop)
│   └── utils.js                 # Shared card builders, formatters
├── services/
│   ├── gemini.js                # Gemini AI analyzer (3 models)
│   ├── ticktick.js              # TickTick API client (OAuth2 + task CRUD)
│   ├── scheduler.js             # Cron jobs (polling, briefings, digest)
│   ├── store.js                 # File-based state store (two-phase task tracking)
│   ├── user_context.js          # YOUR personal context (gitignored — create from example)
│   └── user_context.example.js  # Template to copy from
├── .env.example                 # Environment variable template
└── Dockerfile                   # For cloud deployment
```

---

## Key Design Decisions

**Two-phase task tracking:** Tasks move from `pendingTasks` (analyzed, sent to Telegram) to `processedTasks` (user clicked a button). This guarantees no task is ever silently lost — if you don't respond to a card, `/pending` will re-surface it.

**Non-destructive by default:** Nothing is written to TickTick until you explicitly click ✅ Apply. Every change has an undo log.

**Access control:** Set `TELEGRAM_CHAT_ID` in `.env` to ensure only you can use the bot.

---

## License

MIT
