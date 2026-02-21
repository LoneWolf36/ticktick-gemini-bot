# TickTick AI Accountability Partner

An AI-powered Telegram bot that connects to your TickTick task manager and acts as a proactive accountability partner — analyzing tasks, reorganizing them with Gemini AI, and keeping you honest about your goals.

## Features

- **AI task analysis** — Gemini evaluates every new task: is it a needle-mover or busywork? Rewrites vague titles, adds sub-steps, and re-prioritizes based on your real goals
- **Project reassignment** — suggests moving tasks to the right TickTick project
- **Smart scheduling** — assigns due dates (today / tomorrow / this-week / next-week / someday) based on urgency and your patterns
- **Native TickTick priority flags** — maps to 🔴🟡🔵 priority levels
- **Autonomous mode** — auto-applies low-risk changes (life-admin tasks) without needing your tap. One compact notification per batch
- **Free-form instructions** — send natural language messages like *"move all gym tasks to next week"* or *"what should I focus on today?"*
- **Daily morning briefing** — 3-4 prioritized focus items, leading with what you've been avoiding
- **Weekly accountability digest** — honest review of wins, avoidance patterns, and next week's top 3
- **Proactive polling** — detects new tasks every 5 minutes and notifies you
- **Undo** — revert any applied change with `/undo`
- **Redis-backed persistence** — state survives server restarts and cloud redeploys
- **Render deployment ready** — webhook mode, `render.yaml` blueprint included

## Architecture

```
TickTick API ──→ Scheduler (cron) ──→ Gemini 2.5 Flash ──→ Telegram Bot (grammy)
                    ↕                                            ↕
              Redis / file store                         User approves/skips
              (pending → processed)                      or sends instructions
```

## Setup

### 1. Prerequisites

- Node.js 18+
- [TickTick developer app](https://developer.ticktick.com) (for OAuth credentials)
- [Gemini API key](https://aistudio.google.com/apikey)
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- Optional: [Redis](https://redis.io/) for persistent storage (free tier on Redis Cloud works)

### 2. Install

```bash
git clone https://github.com/LoneWolf36/ticktick-gemini-bot
cd ticktick-gemini-bot
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see `.env.example` for all fields).

### 4. Configure your personal context

```bash
cp services/user_context.example.js services/user_context.js
```

Edit `services/user_context.js` to describe your situation, goals, and behavioral patterns. **This file is gitignored — your personal data stays local.** For cloud deployments, set it as the `USER_CONTEXT` env var instead.

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
| `/pending` | Re-surface tasks awaiting review |
| `/briefing` | Get today's prioritized morning plan |
| `/weekly` | Weekly accountability digest |
| `/review` | Walk through all unreviewed tasks |
| `/undo` | Revert last applied change |
| `/reset` | Wipe all bot data and start fresh (requires `/reset CONFIRM`) |
| `/status` | Bot status, stats, and auto-apply mode |

**Free-form messages:** Any text that isn't a command goes to Gemini. You can:
- Give instructions: *"move all gym tasks to next week"*, *"drop everything in Inbox"*
- Ask questions: *"what should I focus on right now?"*
- Vent: *"I'm overwhelmed"* — the bot will coach you, not just list tasks

---

## Deployment

### Local (long polling)

```bash
node server.js
```

### Docker

```bash
docker build -t ticktick-bot .
docker run --env-file .env -p 8080:8080 ticktick-bot
```

### Cloud (Render — recommended)

1. Connect your GitHub repo on [render.com](https://render.com)
2. Render auto-detects the `Dockerfile` and builds from it
3. The included `render.yaml` blueprint configures the web service
4. Set these env vars in Render's dashboard:

| Variable | Value |
|----------|-------|
| `TELEGRAM_BOT_TOKEN` | Your bot token |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `GEMINI_API_KEY` | Your Gemini API key |
| `TICKTICK_CLIENT_ID` | Your TickTick app client ID |
| `TICKTICK_CLIENT_SECRET` | Your TickTick app secret |
| `TICKTICK_ACCESS_TOKEN` | OAuth token (run locally first, copy from console) |
| `USER_CONTEXT` | Your personal context (the content of `user_context.js`) |
| `REDIS_URL` | Redis connection URL (for persistent storage) |
| `WEBHOOK_URL` | Your Render URL (e.g., `https://your-app.onrender.com`) |
| `TICKTICK_REDIRECT_URI` | Same as WEBHOOK_URL + `/` |

5. Update the redirect URI at [developer.ticktick.com](https://developer.ticktick.com) to match
6. Set up [UptimeRobot](https://uptimerobot.com) to ping `/health` every 5 min (keeps free tier awake)

---

## Project Structure

```
├── server.js                    # Entry point (Express + bot startup)
├── Dockerfile                   # Production Docker image
├── render.yaml                  # Render deployment blueprint
├── bot/
│   ├── index.js                 # Bot factory
│   ├── commands.js              # /scan, /briefing, /weekly, /pending, /undo, /reset, free-form
│   ├── callbacks.js             # Inline keyboard handlers (approve/skip/drop)
│   └── utils.js                 # Card builders, formatters, priority map, schedule logic
├── services/
│   ├── gemini.js                # Gemini AI (4 models: analyze, briefing, weekly, chat)
│   ├── ticktick.js              # TickTick API client (OAuth2 + task CRUD)
│   ├── scheduler.js             # Cron jobs (polling, briefings, digest, store pruning)
│   ├── store.js                 # Redis-backed state store (file fallback for local dev)
│   ├── user_context.js          # YOUR personal context (gitignored — create from example)
│   └── user_context.example.js  # Template to copy from
├── .env.example                 # Environment variable template
└── data/                        # Local store files (gitignored)
```

---

## Key Design Decisions

- **Two-phase task tracking:** Tasks move `pending → processed`. Nothing is silently lost — `/pending` re-surfaces unanswered cards.
- **Non-destructive by default:** Nothing written to TickTick without ✅ Apply. Drop actions flag tasks, never delete. Every change has an undo log.
- **Autonomous mode:** Life-admin and drop-candidate tasks can be auto-applied (configurable). Batched notifications, not per-task spam.
- **Single AI prompt for free-form:** One prompt returns either action JSON or coaching text — no over-engineered multi-agent routing.
- **Redis + file dual backend:** `REDIS_URL` set → Redis. Not set → local `data/store.json`. Zero config for local dev, persistent for cloud.
- **Access control:** `TELEGRAM_CHAT_ID` in `.env` ensures only you can use the bot.
- **Auto-pruning:** Entries older than 30 days are automatically cleaned from the store daily.

---

## License

MIT
