# Work Packages: Execution Prioritization Foundations

**Inputs**: Design documents from `/kitty-specs/007-execution-prioritization-foundations/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Add unit and regression coverage for all ranking behavior changes because this feature defines policy used by downstream recommendation surfaces.

**Organization**: Four work packages move from contract definition to core engine, then to exception/rationale behavior, then to integration seams and regression coverage.

**Prompt Files**: Each work package references a matching prompt file in `/tasks/`.

---

## Product Vision Alignment Contract

This work-package task list is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature is the policy core of the product vision: the assistant must help the user stop mistaking motion for progress and consistently identify work that actually matters.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Rank leverage, goal alignment, and consequential progress ahead of low-value busywork by default.
- Use honest degraded behavior when the system cannot know what matters; ask or expose uncertainty rather than inventing precision.
- Allow exceptions only for clearly justified blockers, urgent real-world constraints, or capacity protection.

**Reject or revise this artifact if**:
- The ranking model optimizes for due dates, small-task count, or completion volume over meaningful progress.
- The implementation hard-codes the user’s values instead of consuming explicit goal context.
- The rationale hides uncertainty behind confident coaching language.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission is the judgment engine for what matters. It must prevent the product's biggest failure mode: confidently steering the user toward the wrong work. Ranking must favor leverage, long-term goals, due pressure, and realistic execution while suppressing busywork that merely feels productive.

### Required Product Behavior For This Mission

- The active plan is capped and focused, usually no more than three tasks.
- At least one long-term-goal-aligned task is favored when available and plausible for the day.
- Low-priority busywork is deprioritized when higher-leverage work exists.
- When metadata is weak, ranking degrades honestly and avoids pretending to know more than it does.

### Cross-Mission Dependency And Drift Risk

This mission depends on task state from 001-005 and feeds 006 daily planning, 008 urgent mode, and 009 behavioral reflection. If this mission is wrong, the whole product can become motion-as-progress automation.

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

## Work Package WP01: Ranking Contract and Inputs (Priority: P0)

**Goal**: Define the shared prioritization contract, normalize the required inputs, and make downstream ownership boundaries explicit before implementation begins.
**Independent Test**: A reviewer can inspect the shared contract and confirm that goals, themes, candidate inputs, degraded behavior, and downstream boundaries are unambiguous.
**Prompt**: `/tasks/WP01-ranking-contract-and-inputs.md`

**Requirement Refs**: FR-001, FR-002, FR-003

### Included Subtasks
- [x] T001 Audit current prioritization logic in `services/gemini.js` and `bot/commands.js`, and record the duplicated heuristics that must move behind a shared policy module.
- [x] T002 Define the `PriorityCandidate` and `GoalThemeProfile` input contracts in the implementation module and align them with `data-model.md`.
- [x] T003 Define how explicit user-owned goals and consequential life themes are sourced from `services/user_context.js` and fallback context without hard-coding a fixed value system.
- [x] T004 Define the top-level `RecommendationResult` and degraded-state contract that downstream consumers will depend on.

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
- [x] T005 Create the shared prioritization module in `services/` with a stable exported API.
- [x] T006 Implement leverage-first candidate assessment using goal alignment, urgency, and consequential life themes.
- [x] T007 Implement honest fallback behavior for ambiguous leverage rather than prompt-only guessing or false precision.
- [x] T008 Ensure recommendation output works when work-style state is unknown by treating state modifiers as optional inputs with safe defaults.
- [x] T009 Add unit tests for baseline ranking behavior and degraded fallback paths.

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
- [x] T010 Implement recovery, maintenance, and enabling-work exception handling inside the shared ranking module.
- [x] T011 Encode exception reasons explicitly so downstream consumers can tell why an override occurred.
- [x] T012 Generate short human-readable rationale text from structured ranking decisions rather than prompt-only prose.
- [x] T013 Add regression coverage for blocker removal, urgent real-world requirements, and capacity-protection scenarios.

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
- [x] T014 Add one thin consumer integration seam so recommendation or summary code can call the shared prioritization module without copying logic.
- [x] T015 Narrow or replace duplicated local prioritization helpers in `bot/commands.js` and `services/gemini.js` where doing so is safe for this track.
- [x] T016 Add regression tests that assert downstream consumers inherit the shared policy rather than local heuristics.
- [x] T017 Add regression tests for unknown-state behavior and honest degraded recommendations.
- [x] T018 Update feature artifacts or example context notes where needed so future tracks `006`, `008`, and `009` can adopt the shared contract cleanly.

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

<!-- status-model:start -->
## Canonical Status (Generated)
- WP01: done
- WP02: done
- WP03: done
- WP04: done
<!-- status-model:end -->
