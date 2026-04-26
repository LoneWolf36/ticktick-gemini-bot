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

**Intent Extraction (@ax-llm/ax successor)**: Direct Gemini API calls using `responseSchema`. The implementation uses `GeminiAnalyzer._executeWithFailover` with structured JSON schema output, giving intent extraction access to model fallback chains and eliminating the dual rotation system.

**TickTick Checklist API**: Expected to be supported. Task creation endpoint (`POST /task`) accepts `items` array with `{title, status}` objects based on API structure analysis. No documented item limit. `desc` field provides checklist-level context. No separate checklist endpoint exists — checklists are inline in the task object. **Note**: Not yet used in production code; verify with a live API call before building checklist features (spec 005).

## Project Structure & Module Organization

### Service modules (source of truth for business logic)
- `services/pipeline.js` — Orchestrates the structured write path: message → AX intent extraction → deterministic normalization → TickTick adapter execution. Exposes `processMessageWithContext()` for callers that need automatic context construction. This is the **only** path for new task-writing flows.
- `services/intent-extraction.js` — Extracts structured `Intent Action` objects from natural language using Gemini via direct `responseSchema` API calls.
- `services/normalizer.js` — Deterministic cleaner that maps intent actions to TickTick-compatible fields (title truncation, filler stripping, repeatHint → RRULE, projectHint → project ID).
- `services/ticktick-adapter.js` — Executes normalized actions against the TickTick REST API (create/update/complete/delete). Handles retries, OAuth refresh, and project-move rollback.
- `services/ticktick.js` — Low-level TickTick API client with OAuth2 token management and CRUD operations.
- `services/gemini.js` — Gemini AI client for briefing, weekly digest, reorg proposals, free-form chat, and intent extraction. Manages API key rotation.
- `services/scheduler.js` — Cron-driven read-only jobs: proactive TickTick polling, daily morning briefings, weekly accountability digests, and store pruning. Also retries deferred pipeline intents on startup and each poll cycle.
- `services/store.js` — State persistence layer. Redis-backed when `REDIS_URL` is set; falls back to local JSON file for development.
- `services/pipeline-context.js` — Carries structured context through the pipeline execution stages.
- `services/pipeline-observability.js` — Pipeline execution metrics and logging.
- `services/schemas.js` — Structured data schemas for intent actions and normalized actions.
- `services/shared-utils.js` — Shared utility functions used across service modules.
- `services/task-resolver.js` — Resolves task references from natural language into TickTick task IDs.
- `services/user-settings.js` — User-level configuration (timezone, preferences).
- `services/user_context.js` — **Gitignored.** Personal behavioral context — goals, patterns, challenges. Create from `user_context.example.js`.
- `services/summary-surfaces/` — Summary composition, formatting, and context normalization for briefing, weekly digest, and daily close surfaces. Includes behavioral pattern notices, intervention profiling, and reflection recompute logic.

### Bot module (Telegram-facing behavior only)
- `bot/index.js` — Bot factory. Creates and configures the Telegraf bot instance.
- `bot/commands.js` — Slash command handlers. **Must not** call the TickTick client directly for write operations — always route through the pipeline.
- `bot/callbacks.js` — Inline keyboard callback handlers (approve/skip/drop/reorg flows).
- `bot/utils.js` — Card builders, message formatters, priority maps, and schedule display logic.

### Integration rule
**Bot handlers must never bypass the pipeline for new task-writing flows.** All mutations to TickTick state must flow through `pipeline.js` → `normalizer.js` → `ticktick-adapter.js`. Bot handlers may read from TickTick directly only for display purposes (e.g., `/pending`, `/status`).

### Function Map

See `context/refs/codebase-function-map.md` for a complete registry of all exported functions, classes, constants, and internal helpers with signatures and purposes. Includes a data flow diagram showing the write path (Telegram → pipeline → adapter → TickTick API) and read path (scheduler → Gemini → summary surfaces).

### Other directories
- `tests/` — Regression and unit tests.
- `context/kits/` — Cavekit domain kits (R-numbered requirements with testable acceptance criteria).
- `context/refs/` — Reference materials (research briefs, data models, OpenAPI specs, schemas, codebase function map).
- `context/plans/` — Cavekit build plans (generated by `/ck:map`).
- `context/impl/` — Cavekit implementation tracking.
- Root deployment files: `Dockerfile`, `render.yaml`.
- Local context template: `services/user_context.example.js`.

## Telegram Command Surfaces

All command-triggered write behavior must use `services/pipeline.js` (AX -> normalizer -> adapter):

- `/scan` — batch analysis + apply/review routing through pipeline
- `/review` — pending review loop (no direct TickTick writes outside adapter)
- `/reorg` — guided reorganization proposal with apply/refine/cancel flows
- Free-form text — parsed by AX, normalized, then executed via adapter

Read/summarization surfaces stay outside write path:

- `/briefing`, `/weekly`, scheduler briefings/digests/poll notifications are non-write surfaces
- `/status`, `/pending`, `/menu` are operational/read-only command surfaces

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
- New task-writing flows must stay on the existing path: `AX intent -> normalizer -> ticktick-adapter`. Do not call the low-level TickTick client directly from bot handlers.

## Testing Guidelines
- Add or update regression coverage in the relevant domain suite under `tests/regression.*.test.js` (or the closest existing test file).
- Search before add: extend an existing nearby test or table-driven case before creating a new standalone block.
- Keep regression files below the size guard. If a file is nearing the limit, extract helpers or split the domain before appending more cases.
- Name tests by behavior, for example: `executeActions accepts suggested_schedule update alias`.
- Mock TickTick and Gemini integrations in automated tests; keep live API calls in opt-in scripts only.

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
| `cavekit-task-pipeline.md` | 17 | Core task capture, mutation, intent extraction, normalization, adapter, command surfaces, guided reorg, autonomous poll auto-apply |
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

### Agent Protocol: Codebase Function Map
CRITICAL: Every agent MUST consult `context/refs/codebase-function-map.md` to discover codebase capabilities before searching blindly. Whenever you add, remove, or change the signature of any exported function, class, or constant, you MUST run `npm run docs:map` and `npm run docs:typedoc` to regenerate the map and API documentation.
