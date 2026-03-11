# Work Packages: Execution Prioritization Foundations

**Inputs**: Design documents from `/kitty-specs/007-execution-prioritization-foundations/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Add unit and regression coverage for all ranking behavior changes because this feature defines policy used by downstream recommendation surfaces.

**Organization**: Four work packages move from contract definition to core engine, then to exception/rationale behavior, then to integration seams and regression coverage.

**Prompt Files**: Each work package references a matching prompt file in `/tasks/`.

---

## Work Package WP01: Ranking Contract and Inputs (Priority: P0)

**Goal**: Define the shared prioritization contract, normalize the required inputs, and make downstream ownership boundaries explicit before implementation begins.
**Independent Test**: A reviewer can inspect the shared contract and confirm that goals, themes, candidate inputs, degraded behavior, and downstream boundaries are unambiguous.
**Prompt**: `/tasks/WP01-ranking-contract-and-inputs.md`

**Requirement Refs**: FR-001, FR-002, FR-003

### Included Subtasks
- [ ] T001 Audit current prioritization logic in `services/gemini.js` and `bot/commands.js`, and record the duplicated heuristics that must move behind a shared policy module.
- [ ] T002 Define the `PriorityCandidate` and `GoalThemeProfile` input contracts in the implementation module and align them with `data-model.md`.
- [ ] T003 Define how explicit user-owned goals and consequential life themes are sourced from `services/user_context.js` and fallback context without hard-coding a fixed value system.
- [ ] T004 Define the top-level `RecommendationResult` and degraded-state contract that downstream consumers will depend on.

### Implementation Notes
- Keep this package domain-focused and pure. It should not fetch TickTick data or send Telegram messages.
- The output of this package is the canonical module API and the normalized shapes that later packages implement.

### Parallel Opportunities
- T001 can run in parallel with T003 once the source files are identified.

### Dependencies
- None.

### Risks & Mitigations
- Risk: Contract drift between docs and code.
- Mitigation: Keep the canonical type and function signatures in the module and align them with `data-model.md`.

---

## Work Package WP02: Core Leverage Ranking Engine (Priority: P1)

**Goal**: Implement the pure leverage-first ranking engine and honest fallback behavior without pulling in state or memory ownership from adjacent features.
**Independent Test**: Given representative tasks and explicit goal context, the engine ranks meaningful work ahead of low-value admin by default and degrades honestly when leverage is ambiguous.
**Prompt**: `/tasks/WP02-core-leverage-ranking-engine.md`

**Requirement Refs**: FR-004, FR-006, FR-008, FR-009

### Included Subtasks
- [ ] T005 Create the shared prioritization module in `services/` with a stable exported API.
- [ ] T006 Implement leverage-first candidate assessment using goal alignment, urgency, and consequential life themes.
- [ ] T007 Implement honest fallback behavior for ambiguous leverage rather than prompt-only guessing or false precision.
- [ ] T008 Ensure recommendation output works when work-style state is unknown by treating state modifiers as optional inputs with safe defaults.
- [ ] T009 Add unit tests for baseline ranking behavior and degraded fallback paths.

### Implementation Notes
- Do not own state resolution here. `008` will supply work-style and urgent-mode modifiers later.
- Reuse current repo heuristics only as clearly marked fallback behavior, not as the primary policy.

### Parallel Opportunities
- T005 must land first. T009 can be prepared in parallel once the exported API is stable.

### Dependencies
- Depends on WP01.

### Risks & Mitigations
- Risk: Reproducing existing duplicated heuristics in a new place.
- Mitigation: Move heuristic behavior behind a single service and delete or narrow duplicates in later integration work.

---

## Work Package WP03: Exceptions and Rationale (Priority: P1)

**Goal**: Implement recovery-aware exceptions and human-readable rationale generation so the ranking engine can justify why a lower-friction task outranked deeper work.
**Independent Test**: When blocker removal, urgent maintenance, or capacity protection applies, the engine can rank the exception first and emit a concise rationale that explains the choice.
**Prompt**: `/tasks/WP03-exceptions-and-rationale.md`

**Requirement Refs**: FR-005, FR-007

### Included Subtasks
- [ ] T010 Implement recovery, maintenance, and enabling-work exception handling inside the shared ranking module.
- [ ] T011 Encode exception reasons explicitly so downstream consumers can tell why an override occurred.
- [ ] T012 Generate short human-readable rationale text from structured ranking decisions rather than prompt-only prose.
- [ ] T013 Add regression coverage for blocker removal, urgent real-world requirements, and capacity-protection scenarios.

### Implementation Notes
- Keep rationale generation deterministic and inspectable in tests.
- Exception handling must not redefine the product as admin-first; it only explains justified departures from default leverage ordering.

### Parallel Opportunities
- T011 and T012 can proceed in parallel after the exception reason model is stable.

### Dependencies
- Depends on WP02.

### Risks & Mitigations
- Risk: Rationale becomes a thin wrapper over hidden scores.
- Mitigation: Keep explicit rationale codes and a small allowed explanation vocabulary.

---

## Work Package WP04: Integration Seams and Regression Coverage (Priority: P1)

**Goal**: Add thin adoption seams for recommendation consumers and cover the shared policy with regression tests so downstream features stop inventing local priorities.
**Independent Test**: At least one consumer path can call the shared module, and regression coverage proves downstream inheritance, unknown-state behavior, and non-goal guardrails.
**Prompt**: `/tasks/WP04-integration-seams-and-regression-coverage.md`

**Requirement Refs**: FR-010

### Included Subtasks
- [ ] T014 Add one thin consumer integration seam so recommendation or summary code can call the shared prioritization module without copying logic.
- [ ] T015 Narrow or replace duplicated local prioritization helpers in `bot/commands.js` and `services/gemini.js` where doing so is safe for this track.
- [ ] T016 Add regression tests that assert downstream consumers inherit the shared policy rather than local heuristics.
- [ ] T017 Add regression tests for unknown-state behavior and honest degraded recommendations.
- [ ] T018 Update feature artifacts or example context notes where needed so future tracks `006`, `008`, and `009` can adopt the shared contract cleanly.

### Implementation Notes
- Do not fully rewrite `/briefing` or `/weekly` in this feature. Add the seam and the policy contract they will consume.
- Keep `009` privacy boundaries intact. No behavioral archive should be introduced here.

### Parallel Opportunities
- T016 and T017 can run in parallel after the seam from T014 exists.

### Dependencies
- Depends on WP01, WP02, WP03.

### Risks & Mitigations
- Risk: Integration work accidentally expands scope into `006`, `008`, or `009`.
- Mitigation: Restrict this package to seam creation, helper narrowing, and regression coverage.

---

## Dependency and Execution Summary

- **Sequence**: WP01 -> WP02 -> WP03 -> WP04.
- **Parallelization**: Within WP01 and WP03 there are limited safe parallel subtasks. Cross-package parallelism should begin only after dependency packages are complete.
- **MVP Scope**: WP01 + WP02 + WP03 provide the core shared ranking engine. WP04 makes it adoptable and verifiable.

---

## Subtask Index

| Subtask ID | Summary | Work Package | Priority | Parallel? |
|------------|---------|--------------|----------|-----------|
| T001 | Audit duplicated prioritization logic | WP01 | P0 | Yes |
| T002 | Define candidate and goal input contracts | WP01 | P0 | No |
| T003 | Define explicit goal/theme sourcing contract | WP01 | P0 | Yes |
| T004 | Define result and degraded-state contract | WP01 | P0 | No |
| T005 | Create shared prioritization module | WP02 | P1 | No |
| T006 | Implement leverage-first assessment | WP02 | P1 | No |
| T007 | Implement honest fallback behavior | WP02 | P1 | No |
| T008 | Support unknown-state-safe ranking inputs | WP02 | P1 | No |
| T009 | Add unit tests for baseline ranking | WP02 | P1 | Yes |
| T010 | Implement recovery and enabling exceptions | WP03 | P1 | No |
| T011 | Encode explicit exception reasons | WP03 | P1 | Yes |
| T012 | Generate deterministic rationale text | WP03 | P1 | Yes |
| T013 | Add exception regression coverage | WP03 | P1 | Yes |
| T014 | Add thin consumer integration seam | WP04 | P1 | No |
| T015 | Narrow duplicated local helpers safely | WP04 | P1 | No |
| T016 | Add downstream inheritance regressions | WP04 | P1 | Yes |
| T017 | Add unknown-state and degraded-path regressions | WP04 | P1 | Yes |
| T018 | Update adoption notes for adjacent tracks | WP04 | P1 | Yes |
