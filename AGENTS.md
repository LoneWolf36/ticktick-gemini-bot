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

**AX Framework (@ax-llm/ax)**: Currently used for structured intent extraction in `services/ax-intent.js`. Analysis shows Gemini's native `responseSchema` provides stronger guarantees than AX's text-based schema instructions. **Future action**: Replace AX with direct Gemini calls using `responseSchema`. Estimated effort: ~100-150 lines replacement code. Not urgent — the current implementation works.

**TickTick Checklist API**: Expected to be supported. Task creation endpoint (`POST /task`) accepts `items` array with `{title, status}` objects based on API structure analysis. No documented item limit. `desc` field provides checklist-level context. No separate checklist endpoint exists — checklists are inline in the task object. **Note**: Not yet used in production code; verify with a live API call before building checklist features (spec 005).

## Project Structure & Module Organization

### Service modules (source of truth for business logic)
- `services/pipeline.js` — Orchestrates the structured write path: message → AX intent extraction → deterministic normalization → TickTick adapter execution. This is the **only** path for new task-writing flows.
- `services/ax-intent.js` — Extracts structured `Intent Action` objects from natural language using Gemini via the AX framework (@ax-llm/ax).
- `services/normalizer.js` — Deterministic cleaner that maps intent actions to TickTick-compatible fields (title truncation, filler stripping, repeatHint → RRULE, projectHint → project ID).
- `services/ticktick-adapter.js` — Executes normalized actions against the TickTick REST API (create/update/complete/delete). Handles retries, OAuth refresh, and project-move rollback.
- `services/ticktick.js` — Low-level TickTick API client with OAuth2 token management and CRUD operations.
- `services/gemini.js` — Gemini AI client for briefing, weekly digest, reorg proposals, free-form chat, and intent extraction. Manages API key rotation.
- `services/scheduler.js` — Cron-driven read-only jobs: proactive TickTick polling, daily morning briefings, weekly accountability digests, and store pruning.
- `services/store.js` — State persistence layer. Redis-backed when `REDIS_URL` is set; falls back to local JSON file for development.
- `services/pipeline-context.js` — Carries structured context through the pipeline execution stages.
- `services/pipeline-observability.js` — Pipeline execution metrics and logging.
- `services/schemas.js` — Structured data schemas for intent actions and normalized actions.
- `services/shared-utils.js` — Shared utility functions used across service modules.
- `services/task-resolver.js` — Resolves task references from natural language into TickTick task IDs.
- `services/user-settings.js` — User-level configuration (timezone, preferences).
- `services/user_context.js` — **Gitignored.** Personal behavioral context — goals, patterns, challenges. Create from `user_context.example.js`.
- `services/summary-surfaces/` — (If present) Summary generation for various output surfaces.

### Bot module (Telegram-facing behavior only)
- `bot/index.js` — Bot factory. Creates and configures the Telegraf bot instance.
- `bot/commands.js` — Slash command handlers. **Must not** call the TickTick client directly for write operations — always route through the pipeline.
- `bot/callbacks.js` — Inline keyboard callback handlers (approve/skip/drop/reorg flows).
- `bot/utils.js` — Card builders, message formatters, priority maps, and schedule display logic.

### Integration rule
**Bot handlers must never bypass the pipeline for new task-writing flows.** All mutations to TickTick state must flow through `pipeline.js` → `normalizer.js` → `ticktick-adapter.js`. Bot handlers may read from TickTick directly only for display purposes (e.g., `/pending`, `/status`).

### Other directories
- `tests/` — Regression and unit tests.
- `kitty-specs/` — Spec Kitty multi-mission artifact directory (specs, plans, work packages, and event-sourced status tracking).
- Root deployment files: `Dockerfile`, `render.yaml`.
- Local context template: `services/user_context.example.js`.

## Build, Test, and Development Commands
- `npm install` installs dependencies from `package-lock.json`.
- `npm start` runs the production entrypoint with `node server.js`.
- `npm run dev` starts watch mode for local iteration.
- `node tests/run-regression-tests.mjs` runs the lightweight regression suite used in this repo today.
- `node --test tests/regression.test.js` runs the Node test file when your environment allows spawned subprocesses.
- `docker build -t ticktick-gemini .` builds the same container shape used for Render.

## Coding Style & Naming Conventions
- Use ESM only: `import`/`export`, not CommonJS.
- Follow the existing style: 4-space indentation, semicolons, camelCase for variables/functions, PascalCase for classes.
- Keep files single-purpose: Telegram interaction in `bot/`, integrations and orchestration in `services/`.
- Prefer named exports for helpers and service factories.
- New task-writing flows must stay on the existing path: `AX intent -> normalizer -> ticktick-adapter`. Do not call the low-level TickTick client directly from bot handlers.

## Testing Guidelines
- Add or update regression coverage for behavior changes in `tests/regression.test.js` or `tests/run-regression-tests.mjs`.
- Name tests by behavior, for example: `executeActions accepts suggested_schedule update alias`.
- Mock TickTick and Gemini integrations in automated tests; keep live API calls in opt-in scripts only.

## Commit & Pull Request Guidelines
- Match the existing Conventional Commit pattern from history: `feat: ...`, `chore: ...`, `feat(scope): ...`.
- Keep each commit focused to one behavior change or one work package.
- PRs should include a short behavior summary, any new env vars, linked issue or `kitty-specs/...` reference, and sample Telegram output or screenshots when message formatting changes.

## Security & Configuration Tips
- Never commit `.env`, `services/user_context.js`, OAuth tokens, Telegram chat IDs, or Redis credentials.
- Start local setup from `.env.example` and `services/user_context.example.js`.
- When adding a required environment variable, update both `README.md` and `render.yaml`.

## Spec Kitty — Multi-Mission Artifacts

The `kitty-specs/` directory is a **multi-mission artifact directory**. Each subdirectory (`kitty-specs/001-.../`, `kitty-specs/002-.../`, etc.) contains an independent mission with its own spec, plan, work packages, and event-sourced status history (`status.events.jsonl`).

**Key principles**:
- Multiple missions coexist. Not all are active simultaneously — check `status.events.jsonl` per mission for WP lane states.
- WP state is tracked exclusively via `status.events.jsonl` files in each feature directory.
- Planning commands (`spec-kitty specify`, `spec-kitty plan`) work in the main repository (no worktrees).
- Implementation commands (`spec-kitty implement WP## --mission <slug>`) create isolated worktrees for execution.
- Command naming is current: `spec-kitty charter` (not `constitution`), `--mission` flag (not `--feature`).

## Spec Kitty v3.1.1 Notes (Latest - Upgraded 2026-04-09)
- **CLI Version**: Upgraded from v3.0.1 to v3.1.1 (2026-04-09)
- **Work Package Frontmatter**: WP files in `kitty-specs/**/tasks/WP*.md` use minimal frontmatter. Deprecated fields removed in v3.0.0 migration:
  - Removed: `lane`, `agent`, `shell_pid`, `review_status`, `reviewed_by`, `history`, `assignee`, `progress`, `review_feedback_file`
  - Kept: `work_package_id`, `title`, `dependencies`, `subtasks`, `base_branch`, `base_commit`, `created_at`, `phase`, `requirement_refs`
- **State Tracking**: WP state is tracked exclusively via `status.events.jsonl` files in each feature directory
- **Command Templates**: Planning commands in `.agent/workflows/spec-kitty-*.toml` reference v3.1.0+
- **Platform**: Development platform is Linux
- **Mission Detection**: Commands now use `--mission <slug>` flag (deprecated `--feature` flag)
- **Charter vs Constitution**: `spec-kitty charter` replaces `spec-kitty constitution` across all surfaces
- **Migration History**: 
  - v3.0.1 → v3.1.1 upgrade completed 2026-04-09
  - v2.1.3 → v3.0.1 upgrade completed 2026-03-31
  - Previous migration (v1.0.3 → v2.0.9 → v2.1.3) completed 2026-03-19
  - Frontmatter migration events logged in `kitty-specs/**/status.events.jsonl`

### Key Changes in v3.1.0+
- **Charter Rename**: `spec-kitty constitution` is replaced by `spec-kitty charter`
- **Canonical Flag**: `--mission` is now the official flag for identifying features/missions. `--feature` is deprecated and hidden
- **WP Manifest Format**: `wps.yaml` is now the primary dependency source for task finalization
- **Read-Only Status Commands**: Read-only status commands no longer dirty the Git working tree
- **Explicit Merge Strategy**: Introduces `--strategy` flag (`MERGE`/`SQUASH`/`REBASE`) and `config.yaml` support
- **Clean Git State**: Read-only commands (`status`, `next` query mode, `dashboard`) no longer dirty the working tree
- **Execution Resilience**: Adds `merge --resume`, `implement --recover`, and `doctor` for stale-claim diagnostics
- **Planning-Artifact Execution**: Now runs in the repository root outside the lane graph (instead of lane worktrees)
- **Review Resilience**: Introduces versioned review-cycle artifacts, focused fix prompts, and dirty-state classification

### Key Changes in v3.0.0+
- **Deterministic Branch Contract**: Commands use `target_branch`/`base_branch` from `create-feature --json` output
- **No Auto-Detection**: Mission slug must be provided explicitly via `--mission` flag
- **Direct Repo Execution**: Planning commands (`/spec-kitty.specify`, `/spec-kitty.plan`) work in planning repository (no worktrees)
- **Worktrees for Implementation Only**: Worktrees created during `/spec-kitty.implement WP##` for isolated implementation work
- **Event-Sourced State**: All WP state transitions recorded in `status.events.jsonl` with `event_id`, `actor`, `reason`, and `evidence`
