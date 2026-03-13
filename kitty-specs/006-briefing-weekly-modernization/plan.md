# Implementation Plan: Briefing and Weekly Pipeline Modernization

**Branch**: `006-briefing-weekly-modernization` | **Date**: 2026-03-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/kitty-specs/006-briefing-weekly-modernization/spec.md`

## Summary

Replace the legacy free-form `/briefing` and `/weekly` generation path with a lean shared summary surface that produces inspectable structured summary objects and deterministic Telegram formatting for both manual and scheduled runs. The implementation must preserve current tone as closely as possible, keep behavioral interpretation out of `006`, and create explicit coordination contracts so later work packages can run in parallel without schema drift or duplicated logic.

## Engineering Alignment

- Use one shared summary core, not separate command-local or scheduler-local logic.
- Keep the design lean: small function-based modules in the existing `services/`, `bot/`, and `tests/` layout only.
- Keep tests embedded with each implementation stream to support TDD.
- Treat wording changes as regression-sensitive; preserve current headers, urgency reminder behavior, and overall tone unless the spec requires a clearer fallback.
- Do not add a new public API, storage layer, plugin system, or behavioral-memory logic.

## Technical Context

**Language/Version**: Node.js 18+ with ESM  
**Primary Dependencies**: Existing `grammy`, `node-cron`, `@google/generative-ai`, `@ax-llm/ax`, `ioredis`, and local service modules only; no new runtime dependencies  
**Storage**: Existing TickTick task data plus `services/store.js` processed-task history and urgent-mode state; no new durable store  
**Testing**: `node tests/run-regression-tests.mjs`, `node --test tests/regression.test.js`, and optional live checklist scripts in `tests/`  
**Target Platform**: Single-user Telegram bot backend running on Render/Docker  
**Project Type**: Server/Bot application  
**Performance Goals**: Keep summary generation inside the current 5-10 second workflow expectation; deterministic formatting overhead should be negligible relative to Gemini calls  
**Constraints**: Preserve current tone closely; keep manual and scheduler paths on one summary contract; no local ranking-policy drift; no behavioral interpretation in `/weekly.watchouts`; no overengineered abstraction layers  
**Scale/Scope**: Two command surfaces, two scheduler jobs, one shared summary service, deterministic formatting, logging, and embedded regression coverage

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Pre-Phase 0:
- ADHD-friendly execution and trust: summaries must stay compact, reduce choice overload, and degrade honestly when data is sparse.
- Deterministic logic outside the LLM: section contracts, notice rules, fallback behavior, watchout limits, and formatter output must remain in application code.
- Shared architecture boundary: `bot/commands.js` and `services/scheduler.js` must call one shared summary surface rather than embedding separate prompt and formatting logic.
- Observability: logs must capture source counts, structured summary output, formatting decisions, and delivery failures.
- Avoid over-engineering: stay inside the existing bot/service/test layout and add only the minimum module split needed for clean ownership and parallel work.
- Testing discipline: each implementation stream must update regression coverage alongside code; no untested summary-path rewrites.

Post-Phase 1 design status:
- Pass. The planned design keeps one shared summary surface inside `services/`, keeps formatting deterministic, reuses existing state and scheduling infrastructure, and introduces no constitution conflicts.

## Project Structure

### Documentation (this feature)

```text
kitty-specs/006-briefing-weekly-modernization/
|-- plan.md
|-- spec.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- summary-surfaces.openapi.yaml
`-- tasks.md                 # created later by /spec-kitty.tasks
```

### Source Code (repository root)

```text
bot/
|-- commands.js
`-- utils.js

services/
|-- execution-prioritization.js
|-- gemini.js
|-- scheduler.js
|-- store.js
|-- summary-surfaces/
|   |-- index.js
|   |-- briefing-summary.js
|   |-- weekly-summary.js
|   `-- summary-formatter.js
`-- schemas.js

tests/
|-- regression.test.js
|-- run-regression-tests.mjs
|-- e2e-live-checklist.mjs
`-- e2e-live-ticktick.mjs
```

**Structure Decision**: Introduce one small `services/summary-surfaces/` feature folder so daily summary logic, weekly summary logic, and deterministic formatting can be edited independently by parallel agents. Keep the rest of the integration in existing files. Do not create additional layers beyond this folder unless implementation proves a smaller extraction is insufficient.

## Implementation Strategy

### Shared summary surface

- Add a function-based orchestration module in `services/summary-surfaces/index.js` that exposes shared entry points for daily and weekly summary generation.
- The orchestration layer accepts raw source data plus resolved recommendation state and returns `{ summary, formattedText, diagnostics }`.
- `bot/commands.js` and `services/scheduler.js` remain responsible for data loading and Telegram delivery only. The existing scheduler-only pending review notice can stay outside the shared summary contract as a delivery wrapper.

### Daily briefing path

- Move daily summary shaping into `services/summary-surfaces/briefing-summary.js`.
- Use shared ranking output from `services/execution-prioritization.js` to derive `focus`, `priorities`, `why_now`, and `start_now`.
- Emit `notices` for sparse tasks, degraded ranking, or urgent-mode state without inventing urgency or extra behavioral commentary.

### Weekly review path

- Move weekly summary shaping into `services/summary-surfaces/weekly-summary.js`.
- Build `progress`, `carry_forward`, `next_focus`, and `watchouts` from current tasks plus processed-task history.
- When processed history is sparse or missing, produce a reduced digest and a missing-history notice.
- Keep `watchouts` limited to evidence-backed execution risks or missing-data notices only.

### Deterministic formatter

- Add `services/summary-surfaces/summary-formatter.js` to render briefing and weekly summaries into Telegram-safe markdown.
- Preserve current headers and urgent-mode reminder behavior from `bot/utils.js`.
- Keep formatting rules deterministic and testable; the formatter must never invent policy or rewrite the feature's trust boundary.

### Logging and diagnostics

- Log source input counts and degraded reasons before formatting.
- Log the structured summary object and formatter decisions before delivery.
- Log manual and scheduled delivery failures with enough context to compare path parity.

## Parallel Execution Strategy

### Dependency graph

```text
Phase A: Contract freeze and scaffolding
    |
    +-- Stream 1: Daily summary builder + embedded tests
    +-- Stream 2: Weekly summary builder + embedded tests
    +-- Stream 3: Formatter and entry-point adapters + embedded tests
    |
    `-- Phase B: Integration parity, observability, and final regression sweep
```

### Sequential foundation before parallel work

1. Freeze the shared section contracts, request/response shapes, and formatter invariants.
2. Create the `services/summary-surfaces/` scaffolding and common fixtures.
3. Define logging and diagnostic field names so every stream emits compatible data.

This is the only intentionally sequential portion. Everything after it should branch from the same contract commit.

### Parallel streams

- Stream 1 - Daily summary core:
  - owns `services/summary-surfaces/briefing-summary.js`
  - owns daily-specific fixture updates and regression assertions
  - must not change weekly contracts or entry-point delivery code
- Stream 2 - Weekly summary core:
  - owns `services/summary-surfaces/weekly-summary.js`
  - owns sparse-history fallback and watchout evidence rules
  - owns weekly-specific regression additions
- Stream 3 - Formatter and adapters:
  - owns `services/summary-surfaces/summary-formatter.js`
  - wires `bot/commands.js` and `services/scheduler.js` to the shared surface
  - preserves headers, urgent reminders, and delivery-specific wrappers
- Phase B - Integration stabilization:
  - resolves shared import wiring
  - completes observability parity
  - runs the full regression and smoke pass

### Coordination contracts for parallel agents

- The top-level summary section names are fixed by the spec and must not change without re-clarification.
- `summary-formatter.js` accepts structured summary objects only; it does not inspect raw task history.
- Entry-point adapters own data loading and Telegram delivery only; they do not rebuild summary logic locally.
- Tests stay embedded: each stream lands its own contract and regression coverage before merge.
- Copy edits are regression-sensitive. If wording must change, keep it localized and justified by deterministic formatting or honest fallback requirements.

### Conflict hotspots and mitigations

- `services/gemini.js` is the main merge hotspot today. The first implementation step should move briefing and weekly shaping out of it so later streams stop colliding there.
- `bot/commands.js` and `services/scheduler.js` should be touched only by the adapter stream until the final integration pass.
- `tests/regression.test.js` and `tests/run-regression-tests.mjs` should receive grouped, labeled sections per stream to minimize patch overlap.

## Phase Outputs

### Phase 0: Research

- Resolve the minimal module split that enables parallel work without a generic framework.
- Define summary schema contracts, formatter guardrails, fallback rules, and observability expectations.
- Confirm how ranking output and processed-task history should feed the new summary surface.

### Phase 1: Design and contracts

- Capture the domain model for summary request context, structured summaries, notices, watchouts, formatter output, and summary diagnostics.
- Publish an internal contract file for briefing and weekly summary composition so implementers share one shape.
- Write a quickstart that validates manual/scheduler parity, sparse-data honesty, and tone preservation.
- Update agent context from the final `plan.md` so future work packages inherit the same tech assumptions.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Small `services/summary-surfaces/` folder | It isolates daily, weekly, and formatter work so agents can implement in parallel with shared contracts. | Keeping all work in `services/gemini.js` would create a single conflict hotspot and weaken TDD boundaries. |
