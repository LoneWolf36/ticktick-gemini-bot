# Work Packages: Core Pipeline Hardening and Regression

**Inputs**: `spec.md`, `plan.md`, and the implemented pipeline hardening seams already present in `services/`, `bot/`, and `tests/`  
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and the current post-`001` codebase on `master`

**Tests**: Required. This feature exists to harden direct pipeline behavior, failure handling, rollback semantics, and regression coverage.

**Organization**: Six work packages move from canonical context into parallel caller/failure/harness tracks, then converge on rollback hardening and final regression closure.

**Prompt Files**: Each work package references a matching prompt file in `kitty-specs/003-pipeline-hardening-and-regression/tasks/`. This checklist file is the dependency map; the prompt files carry the detailed implementation guidance.

---

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
