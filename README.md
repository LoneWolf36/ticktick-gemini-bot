# TickTick AI Accountability Partner

An AI-powered Telegram bot that connects to your TickTick task manager and acts as a proactive accountability partner — analyzing tasks, reorganizing them with Gemini AI, and keeping you honest about your goals.

## Features

- **Structured write pipeline** — Natural language → AX intent extraction → deterministic normalizer → TickTick adapter. No model prose writes directly to TickTick.
- **AI task analysis** — Gemini evaluates every new task: is it a needle-mover or busywork? Rewrites vague titles, adds sub-steps, and re-prioritizes based on your real goals
- **Project reassignment** — suggests moving tasks to the right TickTick project
- **Smart scheduling** — assigns due dates (today / tomorrow / this-week / next-week / someday) based on urgency and your patterns
- **Native TickTick priority flags** — maps to 🔴🟡🔵 priority levels
- **Autonomous mode** — auto-applies low-risk changes (life-admin tasks) without needing your tap. One compact notification per batch
- **Free-form instructions** — send natural language messages like *"move all gym tasks to next week"* or *"what should I focus on today?"*
- **Quick command menu** — use `/menu` to access inline shortcuts and avoid command discovery friction
- **Guided full-system reorg** — use `/reorg` to generate a proposal, refine it, and apply it safely
- **Urgent mode** — `/urgent on` switches to sharper tone with deadline-first prioritization; `/urgent off` returns to standard baseline
- **Daily morning briefing** — 3-4 prioritized focus items, leading with what you've been avoiding
- **Weekly accountability digest** — honest review of wins, avoidance patterns, and next week's top 3
- **Proactive polling** — detects new tasks every 5 minutes and notifies you
- **Undo** — revert any applied change with `/undo`
- **Redis-backed persistence** — state survives server restarts and cloud redeploys
- **Render deployment ready** — webhook mode, `render.yaml` blueprint included

## Architecture

```
Telegram Message
       │
       ▼
┌─────────────────────┐
│  AX Intent Extract  │  Gemini 2.5 Flash → structured Intent Action
│  (Structured LLM)   │  type, title, content, projectHint, dueDate, …
└────────┬────────────┘
         │ Intent Action (JSON)
         ▼
┌─────────────────────┐
│  Deterministic      │  Title truncation, filler stripping,
│  Normalizer         │  repeatHint → RRULE, projectHint → project ID
└────────┬────────────┘
         │ Normalized Action
         ▼
┌─────────────────────┐
│  TickTick Adapter   │  Strict REST API client (create/update/complete/delete)
│  (ticktick-adapter) │  OAuth2 refresh, retries, project-move rollback
└────────┬────────────┘
         │
         ▼
   TickTick API

──────────────────────────────────────────
  Parallel (non-write) summary paths:
    Scheduler (cron) ──→ Briefing  │  Weekly digest  │  Proactive polling
    All read-only — no TickTick mutations
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
| `/scan` | Analyze new tasks through the structured pipeline (AX → Normalizer → Adapter, batched 5 at a time) |
| `/menu` | Show quick-action shortcut menu |
| `/pending` | Re-surface tasks awaiting your review |
| `/briefing` | Daily morning briefing — 3-4 prioritized focus items |
| `/weekly` | Weekly accountability digest — wins, avoidance patterns, top 3 for next week |
| `/review` | Walk through all unreviewed tasks |
| `/reorg` | Build a full task reorganization proposal (apply/refine/cancel) |
| `/urgent` | Toggle urgent mode on/off — sharper tone, deadline-first prioritization |
| `/undo` | Revert last auto-applied change |
| `/reset` | Wipe all bot data and start fresh (requires `/reset CONFIRM`) |
| `/status` | Bot status, stats, and auto-apply mode |

**Free-form messages:** Any text that isn't a command goes through the structured pipeline (AX → Normalizer → Adapter). You can:
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

| Variable | Required | Value |
|----------|----------|-------|
| `TICKTICK_CLIENT_ID` | Yes | Your TickTick app client ID |
| `TICKTICK_CLIENT_SECRET` | Yes | Your TickTick app secret |
| `TICKTICK_REDIRECT_URI` | Yes | Same as WEBHOOK_URL + `/` |
| `TICKTICK_ACCESS_TOKEN` | No | OAuth token (obtained via OAuth flow at `http://localhost:8080` — run locally first, then copy from console for deployment) |
| `TELEGRAM_BOT_TOKEN` | Yes | Your bot token |
| `TELEGRAM_CHAT_ID` | Yes | Your Telegram chat ID |
| `GEMINI_API_KEYS` | Yes | Comma-separated Gemini API keys (preferred for rotation) |
| `GEMINI_API_KEY` | No | Single key (fallback used only if `GEMINI_API_KEYS` is not set) |
| `TELEGRAM_WEBHOOK_SECRET` | No | Random secret token for webhook signature verification (recommended for webhook mode) |
| `REDIS_URL` | Yes on Render | Redis connection URL (required due to ephemeral filesystem) |
| `USER_CONTEXT` | Optional | Your personal context (the content of `user_context.js`) |
| `WEBHOOK_URL` | Yes (webhook) | Your Render URL (e.g., `https://your-app.onrender.com`) |
| `BOT_MODE` | No | `webhook` for Render (default in render.yaml) |
| `PORT` | No | `10000` for Render (default in render.yaml) |
| `USER_TIMEZONE` | No | Your timezone (default: `Europe/Dublin`) |
| `AUTO_APPLY_LIFE_ADMIN` | No | Auto-apply life-admin tasks (default: `true`) |
| `AUTO_APPLY_DROPS` | No | Auto-apply drop candidates (default: `false`) |
| `AUTO_APPLY_MODE` | No | `metadata-only` or `full` (default: `metadata-only`) |

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
│   ├── commands.js              # All slash commands + pipeline integration
│   ├── callbacks.js             # Inline keyboard handlers (approve/skip/drop/reorg)
│   └── utils.js                 # Card builders, formatters, priority map, schedule logic
├── services/
│   ├── ax-intent.js             # AX structured intent extraction (Gemini-backed)
│   ├── normalizer.js            # Deterministic normalizer (intent → TickTick fields)
│   ├── ticktick-adapter.js      # TickTick REST API adapter (create/update/complete/delete)
│   ├── ticktick.js              # Low-level TickTick API client (OAuth2 + CRUD)
│   ├── gemini.js                # Gemini AI (briefing, weekly, reorg, free-form chat)
│   ├── pipeline.js              # Orchestrates: message → AX → normalizer → adapter
│   ├── scheduler.js             # Cron jobs (polling, briefings, digest, store pruning)
│   ├── store.js                 # Redis-backed state store (file fallback for local dev)
│   ├── user_context.js          # YOUR personal context (gitignored — create from example)
│   └── user_context.example.js  # Template to copy from
├── context/kits/                # Cavekit domain kits (current source of truth)
├── kitty-specs.archived/        # Archived Spec Kitty materials (historical only)
├── tests/                       # Regression and unit tests
├── .env.example                 # Environment variable template
└── data/                        # Local store files (gitignored)
```

---

## Key Design Decisions

- **Structured write path (AX → Normalizer → Adapter):** All task creation and mutation flows through a single pipeline. AX (via Gemini 2.5 Flash) extracts a structured `Intent Action` from natural language. The deterministic normalizer cleans and maps it to TickTick-compatible fields. The TickTick adapter executes the mutation against the REST API. This prevents model prose from writing directly to TickTick and keeps the path auditable and testable.
- **Two-phase task tracking:** Tasks move `pending → processed`. Nothing is silently lost — `/pending` re-surfaces unanswered cards.
- **Non-destructive by default:** Nothing written to TickTick without ✅ Apply. Drop actions flag tasks, never delete. Every change has an undo log.
- **Autonomous mode:** Life-admin and drop-candidate tasks can be auto-applied (configurable). Batched notifications, not per-task spam.
- **Redis + file dual backend:** `REDIS_URL` set → Redis. Not set → local `data/store.json`. Zero config for local dev, persistent for cloud (Redis is required on Render because the filesystem is ephemeral).
- **Access control:** `TELEGRAM_CHAT_ID` in `.env` ensures only you can use the bot.
- **Auto-pruning:** Entries older than 30 days are automatically cleaned from the store daily.
- **Failure boundaries:** When the TickTick API is unavailable, parsed intent is preserved and the user is notified — no silent data loss. When Gemini is unavailable, the pipeline fails closed rather than guessing.
- **Future simplification (not yet implemented):** AX's text-based schema instructions can be replaced with Gemini's native `responseSchema` for stronger structural guarantees. The current AX path works; replacement is future work.

### Parallel (non-write) paths

- **Scheduler (cron):** Runs proactive polling (detects new TickTick tasks every 5 min), daily morning briefings, weekly accountability digests, and store pruning. These are read-only — they never mutate TickTick state.
- **Briefing & weekly:** Use separate Gemini prompts optimized for summarization and accountability, not the write-path prompt.

---

## License

MIT
