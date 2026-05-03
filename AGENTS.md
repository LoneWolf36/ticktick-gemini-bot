# Repository Guidelines

## Product Vision

This product is a **behavioral support system for task execution** — not a task manager. It helps the user consistently move toward important long-term goals by reducing procrastination, improving task clarity, improving prioritization, and gently rewiring unhelpful behavioral patterns over time.

**Core problem**: The user has used TickTick for years but still struggles to use it effectively — creating tasks but not executing them, focusing on busywork instead of meaningful progress.

**The system should help the user**:
- Stop mistaking motion for progress
- Stop over-planning as a form of avoidance
- Stop focusing on low-priority tasks that feel productive
- Keep returning to what actually matters

**What it should feel like**: A trusted assistant that understands the user over time, a coach willing to be assertive when needed, a system that knows when to challenge and when to step back.

**What it should NOT feel like**: A passive list manager, a generic reminder app, or a system that blindly accepts the user's first input as correct.

See `Product Vision and Behavioural Scope.md` for the complete product document.

## Architecture Principles

### YAGNI (You Aren't Gonna Need It)
- Build only what is needed today, not what might be needed at 100+ users
- The MVP is for 1 user (eventually 5-10). No auth, billing, rate limiting, or multi-tenant isolation yet
- If a feature is not referenced by an accepted spec, do not build it
- Placeholders for future expansion are fine — but do not implement them now

### DRY (Don't Repeat Yourself)
- Extract shared utilities when duplication is clearly harmful (>50 lines, or >3 call sites)
- Do not extract helpers for 2-line patterns that are unlikely to change
- When in doubt: extract if it improves readability, skip if it adds indirection

### Simplicity First
- Prefer JSON files over databases for single-user state (except on Render where filesystem is ephemeral)
- Prefer direct API calls over framework wrappers when the framework adds no value
- Prefer one implementation pattern over multiple competing patterns
- If a solution needs explanation, it's probably too complex

### Architectural Decisions (Recorded for Future Reference)

**Redis**: Kept for Render deployment (ephemeral filesystem). For local dev or VPS hosting, JSON file fallback works. Future simplification: remove dual-backend code, commit to one backend, remove separate `user:{userId}:urgent_mode` keys.

**Intent Extraction**: Direct Gemini API calls using `responseSchema`. The implementation uses `GeminiAnalyzer._executeWithFailover` with structured JSON schema output, giving intent extraction access to model fallback chains and eliminating the dual rotation system.

**TickTick Checklist API**: Expected to be supported. Task creation endpoint (`POST /task`) accepts `items` array with `{title, status}` objects based on API structure analysis. No documented item limit. `desc` field provides checklist-level context. No separate checklist endpoint exists — checklists are inline in the task object. **Note**: Not yet used in production code; verify with a live API call before building checklist features (spec 005).

**Project Policy Config**: All hardcoded keyword lists, project names, and scoring magic numbers have been extracted from the codebase into a configurable `PROJECT_POLICY` exported from `user_context.js`. The shared `services/user-context-loader.js` searches `services/user_context.js`, root `user_context.js`, then Render secret file `/etc/secrets/user_context.js`; `services/project-policy.js` normalizes this config and provides exact alias/category lookup maps. If `PROJECT_POLICY` is absent, the system falls back to safe `uncategorized` defaults (priority cap 3, default 1) — no task is ever auto-promoted to Core Goal without explicit configuration.

**Project Destination Resolution**: Create writes must resolve to an exact project ID, one exact project-name match, or an existing configured default project. The normalizer must not route writes using fuzzy/substring text inference or first-project fallback. Missing destinations block; duplicate exact project names block for now with safe choices kept for diagnostics. This keeps project routing deterministic and conservative.

**TickTick Task API**: Task updates must follow official OpenAPI contracts. `POST /task/{taskId}` bodies include both `id` and `projectId`; project moves use official `POST /task/move` instead of create/delete copy workarounds; active task retrieval prefers `POST /task/filter { status: [0] }` with project-loop fallback so Inbox tasks are visible to the resolver. Completed-task retrieval is exposed via `POST /task/completed` for analysis plumbing only; completed tasks are not mixed into mutation resolution by default. Repeat updates send a full anchored task payload through the official update endpoint (preserving title, schedule fields, timezone, reminders, priority, items, and repeatFlag when present) because sparse `repeatFlag` updates can be accepted without UI-visible recurrence. Unsupported repeat hints and no-anchor non-weekly repeats fail conservative instead of silently writing a no-op.

**Command Sync Snapshot**: Successful scheduler/manual intake reads must record durable sync metadata in `services/store.js` (`lastTickTickSyncAt`, `lastTickTickActiveCount`, `lastSyncSource`, `stateVersion`). `/status` should report that snapshot alongside the current live read, while `/scan`, `/review`, and `/pending` keep their empty states scoped to the local review queue instead of generic TickTick absence. Failed live reads must not overwrite the previous successful sync snapshot.

**Timezone Canonical Source**: Canonical timezone resolved via `getUserTimezone()` in `services/user-settings.js`. Priority: `process.env.USER_TIMEZONE` → `user_context.js` `USER_TIMEZONE` export → `Europe/Dublin` default. All timezone-dependent code imports `USER_TZ` from `services/shared-utils.js`, which calls `getUserTimezone()` at module init time. A regression test in `tests/regression.work-style-commands-scheduler.test.js` verifies the shared constant stays in sync with the canonical source.

**Checklist Validation Split**: Three-layer validation: `services/intent-extraction.js` `validateChecklistItems()` validates extracted output structure (capped at `MAX_CHECKLIST_ITEMS=30` from `services/schemas.js`); `services/normalizer.js` cleans TickTick-ready items (also caps at its own `MAX_CHECKLIST_ITEMS=30` from `services/schemas.js`); `services/shared-utils.js` exports only the singular `validateChecklistItem()` — no batch or cap logic at the utility layer. The adapter consumes the validated items directly.

**Intake Lock**: `services/store.js` exports `tryAcquireIntakeLock()`, `releaseIntakeLock()`, and `getIntakeLockStatus()` for mutual exclusion over the TickTick poll-analysis cycle. Lock has configurable `ttlMs` (default 5min) and `owner` metadata. `getIntakeLockStatus()` returns `{ locked, owner, acquiredAt, expiresAt }`. Used by `services/scheduler.js` to prevent concurrent scan/poll cycles.

**Deferred Pipeline Intents**: When the TickTick API is unavailable, `services/pipeline.js` defers the parsed normalized intent into `services/store.js` `deferredPipelineIntents` (max 200 entries). `services/scheduler.js` exports `retryDeferredIntents()` which processes the queue with health-check gating and exponential backoff (max 15min). Intents that exhaust 3 retries are moved to `failedDeferredIntents` (dead-letter queue, max 50 entries). The user is notified on permanent failure. See `docs/ARCHITECTURE.md` Resilience Patterns for details.

**Operation Receipt Contract**: `services/operation-receipt.js` defines the shared vocabulary and invariant checks for user-visible operation outcomes. It is descriptive only — execution, routing, and mutation decisions remain in pipeline/callback/adapter boundaries. Receipt states must fail conservative: dry-run cannot be applied, applied requires a real TickTick change with exact/configured destination confidence when a destination is present, blocked/deferred/failed/busy states use safe next actions, and diagnostic metadata must not carry raw task titles, descriptions, checklist text, free-form user message text, or raw rollback snapshots.

## Project Structure & Module Organization

### Service modules (source of truth for business logic)
- `services/pipeline.js` — Orchestrates the structured write path: message → intent extraction → deterministic normalization → TickTick adapter execution. Exposes `processMessageWithContext()` for callers that need automatic context construction. This is the **only** path for new task-writing flows.
- `services/intent-extraction.js` — Extracts structured `Intent Action` objects from natural language using Gemini via direct `responseSchema` API calls.
- `services/normalizer.js` — Deterministic cleaner that maps intent actions to TickTick-compatible fields (title truncation, filler stripping, repeatHint → RRULE, projectHint → project ID).
- `services/ticktick-adapter.js` — Executes normalized actions against the TickTick REST API (create/update/complete/delete). Handles retries, OAuth refresh, active-task listing, and completed-task plumbing.
- `services/undo-executor.js` — Executes undo/rollback entries against the adapter. Handles all rollback types (delete_created, restore_updated, recreate_deleted, uncomplete_task, plus legacy pre-rollback restore).
- `services/ticktick.js` — Low-level TickTick API client with OAuth2 token management, CRUD operations, official task move, task filter, and completed-task endpoints.
- `services/gemini.js` — Gemini AI client for briefing, weekly digest, free-form chat, and intent extraction. Manages API key rotation.
- `services/scheduler.js` — Cron-driven jobs: proactive TickTick reads, daily/weekly briefings, deferred intent retry, queue health checks
- `services/store.js` — State persistence layer. Redis-backed when `REDIS_URL` is set; falls back to local JSON file for development.
- `services/pipeline-context.js` — Carries structured context through the pipeline execution stages.
- `services/pipeline-observability.js` — Pipeline execution metrics and logging.
- `services/operation-receipt.js` — Shared operation outcome vocabulary and invariant validation for truthful user-visible state.
- `services/pipeline-undo-persistence.js` — Shared undo persistence helper for pipeline/batch receipts and deferred retry recovery.
- `services/schemas.js` — Structured data schemas for intent actions and normalized actions.
- `services/shared-utils.js` — Shared utility functions used across service modules.
- `services/execution-prioritization.js` — Leverage-based ranking, priority inference, and recommendation result building for task prioritization.
- `services/behavioral-signals.js` — Classifies task events into derived behavioral signal types (snooze, commitment overload, avoidance, etc.) using metadata only — never raw titles/text.
- `services/behavioral-patterns.js` — Detects higher-level behavioral patterns by analyzing signal clusters over time.
- `services/task-resolver.js` — Resolves task references from natural language into TickTick task IDs.
- `services/user-settings.js` — User-level configuration (timezone, preferences).
- `services/user-context-loader.js` — Shared loader for gitignored/root/Render-secret `user_context.js` modules used by Gemini, project policy, and user settings.
- `services/user_context.js` — **Gitignored.** Personal behavioral context — goals, patterns, challenges. Create from `user_context.example.js`.
- `services/project-policy.js` — Loads structured `PROJECT_POLICY`, `KEYWORDS`, `VERB_LIST`, and `SCORING` through `user-context-loader.js`. Provides normalized lookup maps, project category resolution, and exact alias/category lookup. Replaces all hardcoded keyword lists, project names, and magic numbers from earlier versions.
- `services/summary-surfaces/` — Summary composition, formatting, and context normalization for briefing, weekly digest, and daily close surfaces. Includes behavioral pattern notices, intervention profiling, and reflection recompute logic.

### Bot module (Telegram-facing behavior only)
- `bot/index.js` — Bot factory. Creates and configures the Telegraf bot instance.
- `bot/commands.js` — Slash command handlers. **Must not** call the TickTick client directly for write operations — always route through the pipeline.
- `bot/callbacks.js` — Inline keyboard callback handlers (approve/skip/drop flows).
- `bot/pipeline-result-receipts.js` — Shared receipt builder for pipeline and callback mutation responses; keeps trust receipt and undo affordance parity.

### Integration rule
**Bot handlers must never bypass the pipeline for new task-writing flows.** Operational mutations (approve/skip/drop in callbacks) directly call the adapter as a retained boundary for interactive UX. All new free-form text flows must route through `pipeline.js` → `normalizer.js` → `ticktick-adapter.js`. Bot handlers may read from TickTick directly only for display purposes (e.g., `/pending`, `/status`).

**Undo/rollback boundary:** Free-form task mutations still execute through the pipeline, then the Telegram handler persists the pipeline-provided rollback metadata into the undo log and renders a receipt with an inline undo affordance when rollback metadata exists. `/undo` and `undo:last` callbacks are operational recovery surfaces that call the adapter directly to restore the captured snapshot. Complete/delete rollback may recreate a task from the saved snapshot rather than truly reopening the original TickTick task because TickTick does not expose a reliable uncomplete API.

### Function Map

See `context/refs/codebase-function-map.md` for the generated export/signature index. Use it to find public helpers, classes, constants, and likely edit targets; do not treat it as behavior truth. Source files, tests, Cavekit kits, and this AGENTS.md override generated docs.

`docs/api/` is generated Typedoc output for local deep reference only. It is intentionally ignored and should not be committed because it creates noisy diffs and can accidentally expose local-only context if misconfigured.

### Other directories
- `tests/` — Regression and unit tests.
- `context/kits/` — Cavekit domain kits (R-numbered requirements with testable acceptance criteria).
- `context/refs/` — Reference materials (research briefs, data models, OpenAPI specs, schemas, codebase function map).
- `context/plans/` — Cavekit build plans (generated by `/ck:map`).
- `context/impl/` — Cavekit implementation tracking.
- Root deployment files: `Dockerfile`, `render.yaml`.
- Local context template: `services/user_context.example.js`.

## Telegram Command Surfaces

All command-triggered write behavior must use `services/pipeline.js` (intent extraction -> normalizer -> adapter):

- `/scan` — batch analysis + apply/review routing through pipeline
- `/review` — pending review loop (no direct TickTick writes outside adapter)
- Free-form text — parsed by intent extraction, normalized, then executed via adapter

Read/summarization surfaces stay outside write path:

- `/briefing`, `/weekly`, `/daily_close`, scheduler briefings/digests/poll notifications are non-write surfaces
- `/status`, `/pending`, `/menu`, `/memory`, `/mode` are operational/read-only command surfaces
- `/focus`, `/normal`, `/urgent`, `/forget` are work-style/behavioral command surfaces (bot-local state only, no TickTick mutation)
- `/undo` and inline `undo:last` are operational recovery surfaces for the latest undoable single action or batch. They must use stored rollback snapshots and safe user-facing failure copy; do not expose raw adapter errors.

### Destructive/Non-Exact Mutation Confirmation Gate

Mutations resolved via non-exact match (prefix, contains, token_overlap, fuzzy, coreference) require explicit user confirmation before execution. The pipeline returns `type: 'pending-confirmation'` with a `pendingConfirmation` block. The bot handler persists this state (10min TTL) and presents a confirm/cancel keyboard. The confirm callback (`mut:confirm`) resumes through the pipeline with `skipMutationConfirmation: true`. Callback data: `mut:confirm` / `mut:confirm:cancel`. The gate is bypassed for: pre-resolved taskId, clarification resume (`skipClarification`), and confirmed callback resume (`skipMutationConfirmation`). Exact matches execute without confirmation.

## Build, Test, and Development Commands
- `npm install` installs dependencies from `package-lock.json`.
- `npm start` runs the production entrypoint with `node server.js`.
- `npm run dev` starts watch mode for local iteration.
- `npm test` runs the canonical serial regression suite with `node --test --test-concurrency=1 tests/*.test.js`.
- `npm run test:regression` runs the same serial regression suite directly.
- `npm run check:test-sizes` enforces the max-lines guard for regression test files.
- `docker build -t ticktick-gemini .` builds the same container shape used for Render.

## Coding Style & Naming Conventions
- Use ESM only: `import`/`export`, not CommonJS.
- Follow the existing style: 4-space indentation, semicolons, camelCase for variables/functions, PascalCase for classes.
- Keep files single-purpose: Telegram interaction in `bot/`, integrations and orchestration in `services/`.
- Prefer named exports for helpers and service factories.
- New task-writing flows must stay on the existing path: `intent extraction -> normalizer -> ticktick-adapter`. Do not call the low-level TickTick client directly from bot handlers.

## Testing Guidelines
- Add or update regression coverage in the relevant domain suite under `tests/regression.*.test.js` (or the closest existing test file).
- Search before add: extend an existing nearby test or table-driven case before creating a new standalone block.
- Keep regression files below the size guard. If a file is nearing the limit, extract helpers or split the domain before appending more cases.
- Name tests by behavior, for example: `executeActions accepts suggested_schedule update alias`.
- Mock TickTick and Gemini integrations in automated tests; keep live API calls in opt-in scripts only.

## Agent Workflow Guardrails

### 1. Mandatory Plan Before Coding

Every non-trivial task must begin with a written plan that the user can review before any code is written.

**Trivial changes exempt:** comments, copy-only docs edits, formatting, renames with zero behavior change.
**Everything else requires a mini-plan.**

The plan must include:

- **Root cause** (1-2 sentences): What is actually broken and why?
  - If the root cause is unknown, say so explicitly and frame the plan as diagnosis first.
- **Architectural vs band-aid**: Is this a structural fix or a rule addition to a broken system?
- **Files to change**: code files, tests, docs, config templates.
- **Safe failure mode**: if inference/classification is wrong or uncertain, what default happens?
- **Doc updates list**: Which files will change? If none, state why explicitly.

**The user must approve the plan before coding begins.** If the user says "just do it," the agent may proceed but must still produce the plan for the record.

### 2. Band-Aid Prohibition Rule

**Never fix wrong classification/behavior by adding more rules to the broken system.**

When a classifier or inference path produces wrong results, the correct response is to **redesign the classifier's architecture** — not to add keyword guards, regex exceptions, special-case handlers, or hardcoded lists.

**Forbidden patterns:**
- Adding keyword arrays to suppress false positives
- Adding regex guards for specific inputs
- Hardcoding user-specific data (names, foods, projects, locations) in source code
- Adding more heuristics to an already over-complicated heuristic chain

**Allowed exception:** User-specific or policy-specific behavior belongs in `user_context.js` / `PROJECT_POLICY`, not source heuristics. Move it to config.

**Required response:**
- Redesign the inference path with conservative defaults
- Move user-specific rules into `user_context.js`
- Add confidence gating: low confidence → safe default, never aggressive guess

If you catch yourself writing `if (title.includes('masala')) return 1`, stop. That is a band-aid.

### 3. Root-Cause Statement Required

Before writing any fix, state the root cause in 1-2 sentences. If the proposed fix is "add more rules/heuristics/special-cases," the agent must instead propose an architectural fix.

**Bad:** "Recipes are getting Core Goal, so I'll add a food keyword list to catch them."
**Good:** "The absolute priority classifier uses the same broad matching as the relative ranking engine, so any task with slight goal overlap gets promoted. I will split ranking from classification and add project-category caps."

### 4. Safe-Default Rule for Inference / Classification

**Inference systems must fail conservative.** Low confidence, ambiguous mapping, or missing config must resolve to safe default, not aggressive guess or promotion.

- Unclear priority → default to lowest safe tier (1 or 3), never 5
- Missing project category → `uncategorized` (cap 3, default 1)
- Ambiguous target task → clarification, not best-guess update

### 5. Docs-With-Code Rule

Every behavior, config, or interface change must update durable docs in the same change set, or explicitly state why no doc surface changed.

| Change Type | Required Doc Update |
|-------------|-------------------|
| New feature / command | README.md command table + AGENTS.md module list |
| Configurable behavior | `services/user_context.example.js` + README setup section |
| Architecture change | AGENTS.md Architectural Decisions + `docs/ARCHITECTURE.md` |
| New endpoint / health metric | `docs/ARCHITECTURE.md` + README monitoring section |
| API change (exported function signature) | Update `context/refs/codebase-function-map.md` via `npm run docs:map`; run `npm run docs:typedoc` only to validate local API output when useful |

### 6. Source-of-Truth Rule

When behavior moves from code to config, remove old in-code constants/heuristics in the same change. Do not leave dual sources of truth.

**Bad:** Move project names to `PROJECT_POLICY` but leave old `STRATEGIC_PROJECT_NAMES` array in code.
**Good:** Delete the old array, update all call sites to use the loader, verify no references remain.

### 7. Async Safety Rules

Any code involving promises, locks, background processing, or callbacks must obey these hard rules:

**Rule A — No variable first declared inside `try` may be referenced from `catch` or `finally`.** Declare it before `try` with a safe initial value.

Example:
```javascript
let backgroundPromise = Promise.resolve();
let releaseLock = null;
try {
    backgroundPromise = processBatch();
    releaseLock = () => store.releaseIntakeLock();
} finally {
    await backgroundPromise;
    if (releaseLock) releaseLock();
}
```

**Rule B — For locks/cleanup handlers, initialize no-op or null and guard before calling.**

**Rule C — Mental checklist for async code:**
- [ ] What happens if an error throws **before** the promise is assigned?
- [ ] Is the lock released in **all** error paths including `throw`, `return`, and `break`?
- [ ] Can a second call start while the first is still running (race condition)?
- [ ] Is there a test that throws mid-async-operation and verifies cleanup?

### 8. Config Parity Rule

Changes to configurable systems must update **all four**:
1. The runtime code
2. `services/user_context.example.js` (or equivalent template)
3. The loader's fallback defaults (missing config → safe behavior, not crash)
4. `.env.example` and `render.yaml` if environment variables changed

**If the example file would be broken for a new user copying it, the change is incomplete.**

### 9. Bug-Fix Regression Rule

**No bug fix without reproduction.** Before fixing a bug, add or identify a test that fails for the current behavior. Fix, then make it pass.

If no automated test is possible, state why and provide manual reproduction steps.

### 10. Self-Review Checklist Before "Done"

Before declaring a task complete, verify:

- [ ] All tests pass (`npm test`)
- [ ] Bug fix includes regression test (or explicit justification if impossible)
- [ ] Every new export has a known consumer or documented external contract; obvious dead code removed
- [ ] No hardcoded personal data in code (names, projects, foods, locations)
- [ ] Docs updated for all behavior changes (or explicit "no doc change needed because …")
- [ ] Example config updated if config system changed
- [ ] Relevant edge cases covered: empty input, error mid-flow, timeout, quota exhaustion, ambiguous input — where applicable
- [ ] Async safety rules passed (if applicable)
- [ ] Config parity verified (if applicable)

### 11. Council / Review Escalation Protocol

Multi-agent council review is for:
- Architectural decisions with long-term impact
- High-risk refactors touching >3 service files
- Security / data integrity concerns
- Costly trade-offs (performance vs maintainability)

Council review is **not** for catching:
- Syntax errors
- Missing tests
- Docs not updated
- Async scoping bugs
- Config example drift

**Do not request council/review until the self-review checklist is complete and reported.** These are the implementer's responsibility.

## Commit & Pull Request Guidelines
- Match the existing Conventional Commit pattern from history: `feat: ...`, `chore: ...`, `feat(scope): ...`.
- Keep each commit focused to one behavior change or one work package.
- PRs should include a short behavior summary, any new env vars, linked cavekit requirement reference (e.g., `cavekit-task-pipeline R3`), and sample Telegram output or screenshots when message formatting changes.

## Security & Configuration Tips
- Never commit `.env`, `services/user_context.js`, OAuth tokens, Telegram chat IDs, or Redis credentials.
- Start local setup from `.env.example` and `services/user_context.example.js`.
- When adding a required environment variable, update both `README.md` and `render.yaml`.

## Cavekit — Spec-Driven Development

This project uses **Cavekit** for spec-driven development. Domain kits live in `context/kits/`.

### Domain Index

| Kit | Requirements | Description |
|-----|-------------|-------------|
| `cavekit-task-pipeline.md` | 16 | Core task capture, mutation, intent extraction, normalization, adapter, command surfaces, autonomous poll auto-apply |
| `cavekit-pipeline-hardening.md` | 12 | Testing harness, failure classification, retry/rollback, observability |
| `cavekit-cleanup.md` | 5 | Dead code removal, docs alignment, env standardization |
| `cavekit-checklists.md` | 7 | Checklist extraction, subtask creation, disambiguation |
| `cavekit-briefings.md` | 15 | Daily/weekly summaries, end-of-day reflection, scheduler |
| `cavekit-prioritization.md` | 12 | Leverage-based ranking, source register, rationale |
| `cavekit-work-style.md` | 13 | Tone modes (standard/focus/urgent), prompt augmentation |
| `cavekit-behavioral-memory.md` | 15 | Signal classification, pattern detection, privacy, retention |

See `context/kits/cavekit-overview.md` for the full cross-reference map and dependency graph.

### Cavekit Workflow

```
/ck:sketch   → Decompose into domains with R-numbered requirements
/ck:map      → Generate tiered build plan
/ck:make     → Autonomous build loop
/ck:check    → Gap analysis and peer review
/ck:ship     → All 4 steps in one shot (small features)
```

### Notes

- Cavekit kits in `context/kits/` are the canonical requirements source.

### Agent Protocol: Agent Onboarding

**NEW AGENTS: Start here.**

Before any coding:

1. Read `context/refs/agent-onboarding.md` for navigation, key flows, and reference tables.
2. Read this `AGENTS.md` in full — especially guardrails and architecture principles. If docs conflict, AGENTS.md wins.
3. Read the relevant Cavekit kit in `context/kits/` for the domain.
4. Consult `context/refs/codebase-function-map.md` when discovering exports, public signatures, or likely call sites.
5. Read the source file(s) and nearby tests you plan to edit — never code from generated docs alone.

**Source-of-truth priority**: AGENTS.md → agent-onboarding.md → Cavekit kits → source files/tests → codebase-function-map.md (generated index) → local `docs/api/` output (fallback only).

### Agent Protocol: Codebase Function Map
Use `context/refs/codebase-function-map.md` as a fast export index before broad searching or changing public surfaces. It is generated from JSDoc annotations via `jsdoc2md` (`npm run docs:map`). Whenever you add, remove, or change the signature of any exported function, class, or constant, or update JSDoc on any export surface, **run `npm run docs:map` and commit the updated map**. `npm run docs:typedoc` may be run to validate local API docs, but generated `docs/api/` output is ignored and not committed.
