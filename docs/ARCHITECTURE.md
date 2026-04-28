# Architecture

## Current State

The project uses **Cavekit** for spec-driven development. Domain kits live in `context/kits/`. See `context/kits/cavekit-overview.md` for the full domain index, cross-reference map, and dependency graph.

## Pipeline Architecture

```
Telegram Message
    → Bot Handler (bot/commands.js, bot/callbacks.js)
    → Pipeline (services/pipeline.js)
    → Intent Extraction (services/intent-extraction.js)
    → Normalizer (services/normalizer.js)
    → TickTick Adapter (services/ticktick-adapter.js)
    → TickTick REST API

Parallel non-write paths:
    Scheduler (services/scheduler.js)
    → Daily briefing / Weekly digest / Polling notifications / Deferred retry
    → Telegram only (no TickTick mutation)
```

See `AGENTS.md` for the full service module descriptions.

## Runtime Endpoints

### `/health`

`GET /health` (server.js) returns a JSON health report with:

- **TickTick status** — authentication state and active task count
- **Queue health** — deferred intent queue depth, retry status, and operational snapshot
- **AI health** — per-model circuit breaker state, quota exhaustion status, and fallback chain availability
- **Latency histograms** — per-stage pipeline latency bucketed by `pipeline-observability.js`

UptimeRobot or similar should ping this endpoint every 5 minutes to keep free-tier Render instances awake.

## Resilience Patterns

### Circuit Breaker (AI Reliability)

`services/gemini.js` implements a per-model circuit breaker around `_executeWithFailover`. If a model returns repeated errors (quota exhaustion, transient failures), the breaker opens for a cooldown window and traffic fails over to the next model in the chain. When the window expires, a single probe is allowed; success closes the breaker. This prevents hammering an exhausted API and gives automatic degradation across multiple Gemini API keys.

### Deferred Queue with Backoff and DLQ

When the TickTick API is unavailable, the pipeline defers the normalized intent to `services/store.js` (`deferredPipelineIntents`). The scheduler retries these on startup and every poll cycle with exponential backoff. Intents that fail more than 3 retries are removed permanently (DLQ behavior) and the user is notified. This ensures no parsed intent is lost during transient outages.

## UX Flows

### One-Card-at-a-Time Scan / Review

`/scan` and `/review` walk the user through a single task card at a time with inline keyboards (approve / skip / drop). This avoids notification spam and keeps the decision surface focused. The same card builder and callback handlers are reused in autonomous poll notifications.

### `force_reply` Refinement

During `/reorg` refinement, the bot can switch to `force_reply` mode (`bot/callbacks.js`). The next user message is treated as a direct refinement prompt rather than a new free-form instruction, making the conversational loop feel synchronous.

### Compact Intent Prompt

When the standard intent extraction prompt exceeds token budget or returns malformed JSON, the pipeline falls back to a compact prompt (`COMPACT_INTENT_EXTRACTION_PROMPT` in `services/intent-extraction.js`) with reduced examples. This recovers from edge-case inputs without failing closed.

## Context Binding

### `recentTaskContext`

`services/store.js` maintains a per-user `recentTaskContext` map with TTL expiry. After a task is created or updated, the context stores `{ taskId, title, projectId, source, updatedAt, expiresAt }`. Follow-up messages like "move that to tomorrow" or "mark it done" resolve pronouns against this context before falling back to broader task search. This enables natural conversational follow-ups without requiring exact title repetition.

## Scheduler Configuration

Polling interval is configurable via the `POLL_INTERVAL_MINUTES` environment variable (default: 5 minutes). The scheduler also runs daily briefings, weekly digests, deferred intent retry, and queue health checks.

## Historical Notes

- Legacy prompt-driven write paths were removed. Current write behavior is centralized in intent extraction → normalizer → adapter for deterministic, auditable mutations.
