# Work Packages: Core Pipeline Hardening and Regression

**Inputs**: `spec.md`, `plan.md`, and the implemented pipeline hardening seams already present in `services/`, `bot/`, and `tests/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and the current post-`001` codebase on `master`

**Tests**: Required. This feature exists to harden direct pipeline behavior, failure handling, rollback semantics, and regression coverage.

**Organization**: Six work packages move from canonical context into parallel caller/failure/harness tracks, then converge on rollback hardening and final regression closure.

**Prompt Files**: Each work package references a matching prompt file in `kitty-specs/003-pipeline-hardening-and-regression/tasks/`. This checklist file is the dependency map; the prompt files carry the detailed implementation guidance.

---

## Product Vision Alignment Contract

This work-package task list is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature makes the behavioral assistant dependable under failure. If the pipeline breaks, the user loses trust and returns to manual over-planning, so failures must be compact, honest, logged, and non-destructive.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Handle malformed model output, quota exhaustion, adapter failure, and partial multi-action failures without losing context or silently corrupting tasks.
- Keep user-facing failures compact while preserving enough developer diagnostics to fix root causes.
- Test the live architecture directly, especially paths that affect user trust: create, mutate, clarify, fail closed, and roll back.

**Reject or revise this artifact if**:
- The pipeline returns misleading success after partial failure.
- Diagnostics leak into user-facing Telegram copy.
- Regression tests mainly exercise dead legacy helpers instead of the structured path.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission protects trust when model calls, TickTick calls, parsing, context, or downstream services fail. The product vision requires correctness over confidence. This mission must make failures honest, recoverable, and cognitively light instead of hiding uncertainty or leaving the user with a broken invisible workflow.

### Required Product Behavior For This Mission

- Failures are explained briefly with what did and did not happen, without dumping technical noise into the conversation.
- Partial writes have rollback or explicit recovery behavior where the spec requires it.
- Low-confidence or unavailable context leads to clarification, retry options, or safe fallback, not fabricated certainty.
- Telemetry and diagnostics support future improvement without storing raw user content unnecessarily.

### Cross-Mission Dependency And Drift Risk

This mission depends on 001 and 002 behavior surfaces. Later behavioral systems rely on this mission to distinguish true user behavior from API/model failure noise.

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

## Work Package WP01: Canonical Pipeline Context Foundation (Priority: P0)

**Goal**: Stabilize one canonical request context for the pipeline so AX extraction, normalization, and downstream observability begin from the same shape everywhere.
**Independent Test**: The pipeline context builder validates `requestId`, `entryPoint`, `mode`, `currentDate`, canonical timezone, available projects, and optional existing task data consistently before execution begins.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP01-canonical-pipeline-context-foundation.md`
**Estimated Prompt Size**: ~320 lines

**Requirements Refs**: FR-001, FR-002, FR-007, FR-008

### Included Subtasks
- [ ] T001 Stabilize the canonical request-context builder in `services/pipeline-context.js`
- [ ] T002 Align `services/ax-intent.js` and `services/pipeline.js` around the canonical context contract
- [ ] T003 Align `services/normalizer.js` and `services/pipeline.js` so date and project resolution consume the same context shape
- [ ] T004 Add fail-fast context validation and development-mode diagnostics before execution proceeds

### Implementation Notes
- Keep the write path unchanged: `AX -> normalizer -> TickTickAdapter`.
- Treat the canonical timezone source as owned by the shared user-settings path, not by individual callers.
- Reuse the existing `services/pipeline-context.js` module instead of inventing a new context system.

### Parallel Opportunities
- T002 and T003 can overlap once T001 locks field names and ownership.

**Dependencies**: None.

### Risks & Mitigations
- Risk: callers or downstream stages keep reintroducing ad hoc context fields.
- Mitigation: centralize validation and make missing-field drift fail loudly in development mode.

---

## Work Package WP02: Entry-Point Context Wiring (Priority: P1)

**Goal**: Push the canonical context contract through the live Telegram and scheduler entry points so callers stop owning request-time timezone and context shaping.
**Independent Test**: Free-form, `/scan`, `/review`, and scheduler-triggered pipeline calls all pass the same canonical context fields and no live caller still owns request-time timezone behavior.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP02-entry-point-context-wiring.md`
**Estimated Prompt Size**: ~280 lines

**Requirements Refs**: FR-001, FR-002, FR-005, FR-006

### Included Subtasks
- [ ] T005 Update the free-form, `/scan`, and `/review` pipeline call sites in `bot/commands.js` to rely on the canonical context contract
- [ ] T006 Update scheduler-triggered pipeline calls in `services/scheduler.js` and any needed bootstrap wiring in `server.js`
- [ ] T007 Ensure project lookup and AX-facing project-name context are fetched once per request and reused consistently

### Implementation Notes
- Keep call-site-specific behavior thin; the shared context builder should own field names and defaults.
- Preserve current user-facing behavior unless the accepted spec requires a compatibility adjustment.
- This package is wiring only; it should not redesign rollback or failure taxonomy.

### Parallel Opportunities
- T005 and T006 can proceed in parallel once WP01 lands.

**Dependencies**: WP01.

### Risks & Mitigations
- Risk: Telegram and scheduler paths drift again because they retain local defaults.
- Mitigation: route both through the same builder and assert canonical context at the pipeline boundary.

---

## Work Package WP03: Failure Classification, Quota Semantics, and Story 2 User Messaging (Priority: P1)

**Goal**: Keep pipeline failure behavior explicit with classified outcomes, configured-key rotation before quota failure, and deterministic dev-versus-user messaging.
**Independent Test**: Malformed AX output, empty intents, validation failures, and exhausted active Gemini keys resolve through classified pipeline results with compact user-facing text and preserved developer diagnostics.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP03-failure-classification-quota-semantics-and-story-2-user-messaging.md`
**Estimated Prompt Size**: ~300 lines

**Requirements Refs**: FR-003, FR-004, FR-007, FR-010

### Included Subtasks
- [ ] T009 Reshape `services/pipeline.js` result handling around explicit pipeline failure classes
- [ ] T010 Align configured-key rotation and quota semantics across `services/ax-intent.js`, `services/gemini.js`, and `services/pipeline.js`
- [ ] T011 Implement deterministic mode-aware failure-message rendering for compact user mode and detailed dev mode

### Implementation Notes
- Preserve request context during retries and classification.
- Keep `non-task` distinct from failure routing.
- Reuse the current Gemini key-manager path rather than duplicating quota logic.

### Parallel Opportunities
- T010 and T011 can overlap after T009 defines the classified failure envelope.

**Dependencies**: WP01.

### Risks & Mitigations
- Risk: failure behavior becomes split between the pipeline and individual callers.
- Mitigation: keep failure classification and message rendering owned by the pipeline contract.

---

## Work Package WP04: Direct Pipeline Harness and Story 1 Coverage (Priority: P0)

**Goal**: Lock regression confidence onto the live pipeline architecture early so Story 1 context behavior and baseline happy paths are covered through direct pipeline tests.
**Independent Test**: The regression harness exercises `createPipeline()` directly for relative-date resolution, project-hint resolution, and baseline create/update/complete/delete/non-task outcomes with mocked dependencies.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP04-direct-pipeline-harness-and-story-1-coverage.md`
**Estimated Prompt Size**: ~300 lines

**Requirements Refs**: FR-001, FR-002, FR-005, FR-006

### Included Subtasks
- [ ] T008 Add direct regression coverage for relative-date and project-hint resolution through the hardened pipeline path
- [ ] T018 Refactor `tests/pipeline-harness.js`, `tests/regression.test.js`, and `tests/run-regression-tests.mjs` around direct `createPipeline()` doubles
- [ ] T019 Add direct happy-path pipeline regressions for create, update, complete, delete, and non-task outcomes

### Implementation Notes
- Reuse the existing `tests/pipeline-harness.js` seam instead of inventing a second harness.
- Keep this package focused on direct pipeline tests, not caller-specific bot flows.
- Live API checks remain opt-in.

### Parallel Opportunities
- T008 and T018 can overlap once WP01 lands.
- T019 can start after the direct harness fixtures from T018 exist.

**Dependencies**: WP01.

### Risks & Mitigations
- Risk: regression work drifts back into helper-only testing.
- Mitigation: keep `createPipeline()` as the explicit unit under test and assert canonical contract behavior directly.

---

## Work Package WP05: Retry, Rollback, and Observability Hardening (Priority: P1)

**Goal**: Preserve per-action execution records, retry-once rollback orchestration, and structured observability without breaking the adapter boundary.
**Independent Test**: A multi-action request retries one failed action once, rolls back earlier writes if the retry still fails, emits structured telemetry for each stage, and returns a deterministic rollback-aware failure summary.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP05-retry-rollback-and-observability-hardening.md`
**Estimated Prompt Size**: ~340 lines

**Requirements Refs**: FR-007, FR-008, FR-009

### Included Subtasks
- [ ] T013 Introduce per-action execution records and rollback-step capture in `services/pipeline.js`
- [ ] T014 Implement retry-once then rollback orchestration above `TickTickAdapter`
- [ ] T015 Classify rollback outcomes explicitly, including partial rollback failure
- [ ] T016 Extend the structured observability path in `services/pipeline-observability.js` for request, AX, normalization, execution, rollback, and terminal result stages

### Implementation Notes
- Do not bypass `services/ticktick-adapter.js`; rollback must use compensating adapter calls.
- Treat request ID propagation as mandatory for every observability event.
- Reuse the existing observability helper instead of creating a competing telemetry path.

### Parallel Opportunities
- T016 can start once the execution-record fields from T013 are defined.

**Dependencies**: WP01, WP03.

### Risks & Mitigations
- Risk: some operations lack a clean inverse and rollback behavior becomes misleading.
- Mitigation: capture pre-write state early, classify best-effort rollback explicitly, and never report silent success after partial failure.

---

## Work Package WP06: Failure, Rollback, and Burst Regression Finalization (Priority: P0)

**Goal**: Close the loop by extending the direct harness to cover failure semantics, rollback behavior, observability emission, and small concurrent bursts.
**Independent Test**: The direct regression suite proves malformed AX handling, quota rotation, rollback success, rollback failure, observability emission, and tens-of-requests burst behavior without live API calls.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP06-failure-rollback-and-burst-regression-finalization.md`
**Estimated Prompt Size**: ~320 lines

**Requirements Refs**: FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010

### Included Subtasks
- [ ] T012 Add direct regression coverage for malformed AX output, empty intents, validation failures, and key-rotation-before-failure quota scenarios
- [ ] T017 Add direct regression coverage for adapter rejection, successful rollback, rollback failure, and request-correlated observability emission
- [ ] T020 Add direct pipeline failure-path coverage for validation failure, malformed AX, quota rotation, adapter failure, rollback success, and rollback failure
- [ ] T021 Add burst-concurrency regressions for tens of concurrent mocked requests with unique request IDs and isolated results
- [ ] T022 Update live validation notes and test doubles so the hardened contract is documented without making live scripts mandatory

### Implementation Notes
- Keep required regression coverage mocked and deterministic.
- Reuse the direct-pipeline doubles and fixtures from WP04.
- Make contract-drift assertions explicit so changes to context fields, execution-record fields, or telemetry fields fail fast in tests.

### Parallel Opportunities
- T012 and T017 can proceed in parallel once WP03 and WP05 land.
- T020 and T021 can overlap after the direct harness from WP04 is stable.
- T022 can run alongside the final regression additions once result shapes are settled.

**Dependencies**: WP03, WP04, WP05.

### Risks & Mitigations
- Risk: final regression work duplicates earlier harness coverage instead of extending it.
- Mitigation: keep this package focused on failure, rollback, telemetry, and burst behaviors only.
