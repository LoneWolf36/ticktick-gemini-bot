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

## Operation Receipt Contract

`services/operation-receipt.js` defines the shared vocabulary for user-visible operation outcomes. The receipt describes what happened after the pipeline, callback, adapter, or scheduler logic has already decided the result; it must not make routing, mutation, or orchestration decisions.

Core fields:

- `status` — one of `preview`, `applied`, `pending_confirmation`, `blocked`, `deferred`, `failed`, or `busy`.
- `scope` — the state being described: TickTick live state, local review queue, preview state, deferred queue, or system state.
- `command` — entry command/surface: scan, pending, status, review, free-form, reorg, scheduler, or callback.
- `operationType` — create, update, complete, delete, review, scan, sync, reorg, or none.
- `changed` — whether TickTick or durable local state actually changed.
- `dryRun` — whether the operation was preview-only.
- `applied` — whether a TickTick mutation succeeded.
- `fallbackUsed` — whether model or execution fallback influenced the outcome.
- `message` — short user-safe summary, not raw task/user text.
- `traceId` — diagnostic correlation ID.
- `nextAction` — the safe user/system next step.
- `errorClass` — optional safe failure class.
- `destination.confidence` — destination resolution class when a project is involved: exact, configured, ambiguous, or missing. Pending create/update confirmations require `projectId` or `projectName` for exact/configured destinations, or non-empty `choices` with safe project references for ambiguous destinations.
- `confirmation` — required details for pending-confirmation receipts, including a safe target identifier (`taskId`, `previewId`, `candidateId`, `targetId`, or `referenceId`) and proposed outcome.
- `rollback` — safe rollback metadata only. Raw undo snapshots stay in undo storage and must not be embedded in a receipt that may be logged or rendered.

Safety invariants:

- Dry-run receipts can only be `preview` or `blocked`; they cannot be applied.
- Applied receipts require `changed=true`, `applied=true`, and `status=applied`.
- Applied receipts must describe `ticktick_live` scope.
- Applied receipts with a destination require exact or configured destination confidence.
- `changed=false` forbids applied success state.
- Blocked, deferred, failed, and busy states can only point to safe next actions: retry, wait, resync, or none.
- Pending-confirmation receipts cannot already be changed/applied; they require confirmation details, a safe target identifier, and create/update confirmations require a proposed destination reference or choices.
- Receipts must not carry raw task titles, descriptions, checklist text, or free-form user message text in diagnostic metadata.

Safe defaults: uncertainty stays conservative. Missing/ambiguous routing, malformed model output, stale preview, lock contention, or unknown state should become blocked, failed, deferred, pending confirmation, or busy — never an applied success.

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
