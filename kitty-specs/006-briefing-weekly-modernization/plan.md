# Implementation Plan: Briefing and Weekly Pipeline Modernization

**Branch**: `006-briefing-weekly-modernization` | **Date**: 2026-03-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/kitty-specs/006-briefing-weekly-modernization/spec.md`

## Product Vision Alignment Contract

This implementation plan is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature makes morning and weekly surfaces trustworthy, brief, and action-oriented. Summaries are only useful if they help the user return to what matters without reading a report.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Daily briefing should usually surface no more than three meaningful tasks, with at least one long-term-goal-aligned action when available.
- Weekly output must separate factual history from behavioral interpretation and avoid unsupported pattern claims reserved for behavioral memory.
- Fallbacks must be honest about sparse data and still give a small next action instead of pretending certainty.

**Reject or revise this artifact if**:
- Briefing output becomes verbose, generic, or motivational filler.
- Weekly summaries infer avoidance patterns without enough evidence or without the 009 privacy/confidence contract.
- Formatting depends on model prose instead of deterministic rendering for stable Telegram output.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission creates the main behavioral support surfaces: morning start, daily plan, weekly review, and end-of-day reflection. It must feel like a trusted assistant that helps the user return to what matters. It must stay cognitively light: no interrogation, no generic productivity lecture, no fabricated insight from sparse data.

### Required Product Behavior For This Mission

- Morning check asks only what is needed to understand energy, constraints, and intent for today.
- Daily planning usually surfaces no more than three tasks and includes meaningful long-term-goal work when available.
- End-of-day reflection is brief, context-aware, and non-punitive when the user was irregular, travelling, or social.
- Sparse data produces honest low-confidence language or silence rather than overconfident coaching.

### Cross-Mission Dependency And Drift Risk

This mission depends on reliable task operations from 001-005 and ranking from 007. It is one of the primary user-visible proofs that the product is behavioral support, not a passive list manager.

### Evidence Required Before Any WP Approval

Every implement-review cycle for this mission must produce reviewer-visible evidence for all of the following:

1. The specific Product Vision clause or behavioral scope section served by the change.
2. The local FR, NFR, plan step, task, or WP requirement implemented by the change.
3. The concrete user-visible behavior that changed, including whether the change affects capture, clarification, planning, ranking, intervention, reflection, recovery, or behavioral memory.
4. The anti-drift rule the change preserves: not a passive task manager, not generic reminders, not over-planning support, not busywork optimization, not false certainty, and not SaaS scope expansion.
5. The automated test, regression script, manual transcript, or inspection evidence that proves the behavior.
6. The downstream missions that rely on this behavior and what would break if it drifted.

### Complete 001-009 Acceptance Criteria

After all WPs in missions 001 through 009 have passed implementation, review, and mission-level acceptance, the integrated product must satisfy every item below. If any item is not demonstrably true, the 001-009 chain is not complete.

1. The user can capture clear, vague, multi-task, checklist, recurring, and mutation requests safely through the accepted pipeline without legacy path drift.
2. Ambiguous or destructive actions clarify or fail closed instead of guessing.
3. The daily plan usually contains no more than three tasks, is realistic for the user context, and includes long-term-goal work when such work exists and is plausible.
4. The system distinguishes important work from low-value busywork and actively avoids rewarding motion-as-progress.
5. Urgent mode is temporary, minimal, direct, and action-oriented; it is not the default tone and it does not mutate TickTick state unless the user explicitly asks for a task operation.
6. Weak behavioral or priority inference is never presented as fact. The assistant asks, labels uncertainty, or stays quiet.
7. Behavioral memory stores derived signals only, uses retention limits, and supports inspection/reset so memory remains a coaching aid rather than surveillance.
8. Morning start stays short; end-of-day reflection stays brief, context-aware, and non-punitive.
9. Ignored guidance causes adaptation or backing off, not louder nagging.
10. The implementation avoids MVP scope creep: no auth, billing, rate limiting, multi-tenant isolation, or SaaS infrastructure unless an accepted spec explicitly requires it.
11. User-facing copy is compact, concrete, non-judgmental, and oriented toward the next useful action.
12. No raw user message, raw task title, or raw task description is persisted in long-term behavioral memory.

### Mandatory Rejection Conditions

A reviewer must reject or reopen work in this mission if any of these are true:

- The change can pass local tests while still encouraging list management instead of task execution.
- The assistant accepts the user's first input as correct when the spec requires challenge, clarification, or safe failure.
- The change increases verbosity, ceremony, or planning overhead without improving action clarity or prioritization.
- The change optimizes low-value tasks, cosmetic organization, or generic reminders while ignoring meaningful progress.
- The change presents weak inference as certainty or invents goals, constraints, priorities, or behavioral patterns.
- The change stores raw user/task content in behavioral memory or logs where the mission only allows derived signals.
- The change introduces auth, billing, rate limiting, multi-tenant isolation, or platform-scale infrastructure not accepted by spec.
- The reviewer cannot trace the change from Product Vision -> spec/plan/task -> code/docs -> test evidence.

### Claim Boundary

When this mission is marked done, the claim is not merely that its files changed or tests passed. The claim is that this mission now contributes its defined role to the complete behavioral support system. The stronger statement, "after running 001 through 009 the product exactly matches the vision", is only valid when every mission enforces this contract, every WP has review evidence, and a final mission review confirms spec-to-code-to-test-to-product-vision fidelity across the whole chain.

## Summary

Replace the legacy free-form `/briefing` and `/weekly` generation path with a lean shared summary surface that produces inspectable structured summary objects and deterministic Telegram formatting for both manual and scheduled runs. The implementation must preserve current tone as closely as possible, keep behavioral interpretation out of `006`, and create explicit coordination contracts so later work packages can run in parallel without schema drift or duplicated logic.

This mission also includes a spec-level obligation that the original work-package breakdown missed: a brief end-of-day reflection surface (`/daily_close` or equivalent) required by User Story 4 plus FR-009 and FR-012 in `spec.md`. The delivered WP01-WP07 work modernizes briefing and weekly flows only; a follow-up work package is required before the mission can be treated as spec-complete.

## Engineering Alignment

- Use one shared summary core, not separate command-local or scheduler-local logic.
- Keep the design lean: small function-based modules in the existing `services/`, `bot/`, and `tests/` layout only.
- Keep tests embedded with each implementation stream to support TDD.
- Treat wording changes as regression-sensitive; preserve current headers, urgency reminder behavior, and overall tone unless the spec requires a clearer fallback.
- Do not add a new public API, storage layer, plugin system, or behavioral-memory logic.
- Do not treat briefing/weekly completion as mission completion while the end-of-day reflection surface required by `spec.md` remains unplanned or unimplemented.

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

## Charter Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Pre-Phase 0:
- ADHD-friendly execution and trust: summaries must stay compact, reduce choice overload, and degrade honestly when data is sparse.
- Deterministic logic outside the LLM: section contracts, notice rules, fallback behavior, watchout limits, and formatter output must remain in application code.
- Shared architecture boundary: `bot/commands.js` and `services/scheduler.js` must call one shared summary surface rather than embedding separate prompt and formatting logic.
- Observability: logs must capture source counts, structured summary output, formatting decisions, and delivery failures.
- Avoid over-engineering: stay inside the existing bot/service/test layout and add only the minimum module split needed for clean ownership and parallel work.
- Testing discipline: each implementation stream must update regression coverage alongside code; no untested summary-path rewrites.

Post-Phase 1 design status:
- Pass. The planned design keeps one shared summary surface inside `services/`, keeps formatting deterministic, reuses existing state and scheduling infrastructure, and introduces no charter conflicts.

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
|   |-- daily-close-summary.js
|   |-- weekly-summary.js
|   `-- summary-formatter.js
`-- schemas.js

tests/
|-- regression.test.js
|-- run-regression-tests.mjs
|-- e2e-live-checklist.mjs
`-- e2e-live-ticktick.mjs
```

**Structure Decision**: Introduce one small `services/summary-surfaces/` feature folder so daily summary logic, weekly summary logic, end-of-day reflection logic, and deterministic formatting can be edited independently by parallel agents. Keep the rest of the integration in existing files. Do not create additional layers beyond this folder unless implementation proves a smaller extraction is insufficient.

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

### End-of-day reflection path

- Add `services/summary-surfaces/daily-close-summary.js` to build a compact reflection object with lightweight stats, a context-aware reflection line, and minimal notices.
- Expose `/daily_close` or an explicitly equivalent end-of-day surface through the bot without introducing punitive copy or behavioral-memory claims that belong to later missions.
- Keep irregular-use handling deliberately non-punitive: when the day is sparse, skipped, or disrupted, the reflection should degrade to facts and a small reset cue instead of manufacturing insight.
- Reuse the deterministic formatter so end-of-day output remains Telegram-safe and inspectable before rendering.

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
    +-- Phase B: Integration parity, observability, and final regression sweep
    |
    `-- Phase C: End-of-day reflection contract, integration, and regression closure
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
- Phase C - End-of-day reflection closure:
  - owns the missing end-of-day reflection surface required by `spec.md`
  - extends the shared summary contract and formatter only as far as needed for brief reflection output
  - adds manual-command and/or equivalent delivery wiring plus sparse-day regressions

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
- `services/summary-surfaces/summary-formatter.js` becomes a new hotspot once end-of-day reflection is added; reflection-specific formatting should land in one grouped patch with tests.

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

### Phase 2: Spec-gap closure for end-of-day reflection

- Define the minimum structured reflection contract needed to satisfy User Story 4 plus FR-009 and FR-012 without reopening the already-delivered briefing/weekly surfaces.
- Add a focused work package for `/daily_close` (or equivalent) so the mission can satisfy the spec's end-of-day reflection promise explicitly instead of relying on briefing/weekly work alone.
- Keep the reflection surface context-aware, sparse-data honest, and non-punitive for irregular use.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Small `services/summary-surfaces/` folder | It isolates daily, weekly, and formatter work so agents can implement in parallel with shared contracts. | Keeping all work in `services/gemini.js` would create a single conflict hotspot and weaken TDD boundaries. |
