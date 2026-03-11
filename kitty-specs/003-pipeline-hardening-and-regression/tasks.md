# Work Packages: Core Pipeline Hardening and Regression

**Inputs**: Design documents from `/kitty-specs/003-pipeline-hardening-and-regression/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: This feature explicitly requires regression coverage for direct pipeline behavior, failure classes, rollback, and burst concurrency; include test work in the implementation packages below.

**Organization**: Six focused work packages move from canonical context into three parallelizable tracks: caller wiring, failure semantics, and direct harness setup. Later packages then converge on rollback/observability hardening and final regression closure.

**Prompt Files**: Each work package references a matching prompt file in `kitty-specs/003-pipeline-hardening-and-regression/tasks/`.

---

## Work Package WP01: Canonical Pipeline Context Foundation (Priority: P0)

**Goal**: Define and enforce one canonical request context for the pipeline so AX extraction, normalization, and downstream observability start from the same shape everywhere.
**Independent Test**: A reviewer can inspect the pipeline contract and confirm that request IDs, entry point metadata, canonical timezone sourcing, current date, available projects, and existing task snapshots are assembled consistently before execution begins.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP01-canonical-pipeline-context-foundation.md`

**Requirement Refs**: FR-001, FR-002, FR-007, FR-008, SC-001, SC-004

### Included Subtasks
- [ ] T001 Define the canonical `PipelineRequestContext` assembly path in `services/pipeline.js` or a dedicated helper module, including `requestId`, `entryPoint`, `mode`, `currentDate`, canonical timezone, available projects, and optional existing task snapshot.
- [ ] T002 Align `services/ax-intent.js` and `services/pipeline.js` around the canonical context contract so AX receives the expected extraction inputs on every request.
- [ ] T003 Align normalization input handling in `services/normalizer.js` and `services/pipeline.js` so due-date expansion and project resolution consume the same context shape instead of ad-hoc option fields.
- [ ] T004 Add fail-fast contract validation and development-mode diagnostics for missing or drifted pipeline context fields before execution proceeds.

### Implementation Notes
- Keep the write path unchanged: `AX -> normalizer -> TickTickAdapter`.
- Treat the user profile timezone from stored context as the canonical source; environment defaults remain fallback infrastructure only, not request-time truth.
- Make the request context reusable by Telegram commands, scheduler polling, and manual command entry points.

### Parallel Opportunities
- T002 and T003 can overlap once T001 defines the shared shape and naming.

### Dependencies
- None.

### Risks & Mitigations
- Risk: Introducing a new helper without updating every caller leaves hidden contract drift in place.
- Mitigation: Centralize context assembly and add validation that fails loudly in development when a caller omits required fields.

### Estimated Prompt Size
~360 lines

---

## Work Package WP02: Entry-Point Context Wiring (Priority: P1)

**Goal**: Push the canonical context contract through the live Telegram and scheduler entry points so callers stop owning request-time timezone and context shaping.
**Independent Test**: Free-form, `/scan`, `/review`, and scheduler-triggered pipeline calls all pass the same canonical context fields and no live caller still relies on direct `process.env.USER_TIMEZONE` fallback logic for request-time resolution.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP02-entry-point-context-wiring.md`

**Requirement Refs**: FR-001, FR-002, FR-005, FR-006, SC-001, SC-003

### Included Subtasks
- [ ] T005 Update the free-form, `/scan`, and `/review` pipeline call sites in `bot/commands.js` to source canonical timezone and entry-point metadata from the new request context contract rather than direct `process.env.USER_TIMEZONE` fallbacks.
- [ ] T006 Update scheduler-triggered pipeline calls in `services/scheduler.js` and any bootstrap wiring in `server.js` so scheduled task processing uses the same canonical context fields and request metadata.
- [ ] T007 Ensure project lookup and AX-facing project-name context are fetched once per request and passed consistently into AX extraction and normalization without shape drift.

### Implementation Notes
- Keep call-site-specific behavior thin; the shared context helper from WP01 should own defaulting and field names.
- Be explicit about entry-point labels so observability can distinguish Telegram free-form, scan/review, and scheduler traffic.
- Preserve current user-facing behavior unless the clarified spec explicitly changes it.

### Parallel Opportunities
- T005 and T006 can proceed in parallel once WP01 lands.

### Dependencies
- Depends on WP01.

### Risks & Mitigations
- Risk: Scheduler and command handlers diverge again because they keep local timezone defaults.
- Mitigation: Route both through the same context-construction path and assert the canonical timezone field at the pipeline boundary.

### Estimated Prompt Size
~280 lines

---

## Work Package WP03: Failure Classification, Quota Semantics, and Story 2 User Messaging (Priority: P1)

**Goal**: Replace incidental failure behavior with explicit failure classes, configured-key rotation before quota failure, and deterministic dev-versus-user messaging.
**Independent Test**: Malformed AX output, empty intents, validation failures, and exhausted active Gemini keys all resolve through classified pipeline results with compact user-facing text and preserved developer diagnostics.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP03-failure-classification-quota-semantics-and-story-2-user-messaging.md`

**Requirement Refs**: FR-003, FR-004, FR-007, FR-010, SC-002, SC-003

### Included Subtasks
- [ ] T009 Reshape `services/pipeline.js` result handling so malformed AX output, empty intent lists, validation failures, quota exhaustion, adapter failures, and unexpected exceptions map to explicit failure classes instead of one broad catch-all.
- [ ] T010 Integrate configured-key rotation and quota exhaustion behavior across `services/ax-intent.js`, `services/gemini.js`, and `services/pipeline.js` so the pipeline tries another configured key before surfacing a quota failure.
- [ ] T011 Implement failure-message rendering that keeps end-user responses compact by failure class while preserving detailed diagnostics in development mode.

### Implementation Notes
- Preserve request context when rotating keys; do not lose the original message, request ID, or entry-point metadata.
- Treat empty AX output and malformed AX output differently if the implementation needs separate developer diagnostics, but keep both non-destructive.
- Keep failure rendering deterministic so tests can assert failure class and messaging shape without depending on brittle prose.

### Parallel Opportunities
- T010 and T011 can overlap after T009 establishes the classified failure envelope.

### Dependencies
- Depends on WP01.

### Risks & Mitigations
- Risk: Key rotation logic becomes duplicated between `GeminiAnalyzer` and AX wrapper handling.
- Mitigation: Keep the source of truth in the current Gemini key manager path and make pipeline failure classification consume that behavior rather than reimplement it.

### Estimated Prompt Size
~300 lines

---

## Work Package WP04: Direct Pipeline Harness and Story 1 Coverage (Priority: P0)

**Goal**: Stand up the direct pipeline regression harness early so one agent can validate canonical context and baseline task flows while other agents implement caller wiring and failure semantics.
**Independent Test**: The regression harness exercises `createPipeline()` directly for Story 1 context behavior plus baseline create, update, complete, delete, and non-task outcomes with mocked dependencies.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP04-direct-pipeline-harness-and-story-1-coverage.md`

**Requirement Refs**: FR-001, FR-002, FR-005, FR-006, SC-001, SC-003

### Included Subtasks
- [ ] T008 Add direct regression coverage for relative-date resolution and project-hint resolution through the hardened pipeline path.
- [ ] T018 Refactor `tests/regression.test.js` and `tests/run-regression-tests.mjs` helpers so they exercise `createPipeline()` directly with mocked AX, normalizer, and adapter doubles rather than mostly legacy helper behavior.
- [ ] T019 Add direct pipeline happy-path coverage for create, update, complete, delete, and non-task outcomes using the hardened result envelope.

### Implementation Notes
- This package is intentionally front-loaded to unlock parallel work on the harness.
- Keep it focused on direct pipeline tests, not caller-specific bot flows.
- The result is a reusable harness that later failure and rollback regressions can extend.

### Parallel Opportunities
- T008 and T018 can overlap once WP01 lands.
- T019 can start after the shared direct-pipeline fixtures in T018 exist.

### Dependencies
- Depends on WP01.

### Risks & Mitigations
- Risk: Harness work drifts back into helper-only testing and fails to improve real pipeline confidence.
- Mitigation: Keep `createPipeline()` as the explicit unit under test and assert canonical contract fields in the fixtures.

### Estimated Prompt Size
~320 lines

---

## Work Package WP05: Retry, Rollback, and Observability Hardening (Priority: P1)

**Goal**: Add per-action execution records, retry-once rollback orchestration, and full observability scaffolding without breaking the adapter boundary.
**Independent Test**: A multi-action request retries one failed action once, rolls back earlier writes if the retry still fails, emits structured telemetry for each stage, and returns a classified rollback-aware failure summary.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP05-retry-rollback-and-observability-hardening.md`

**Requirement Refs**: FR-007, FR-008, FR-009, SC-002, SC-004

### Included Subtasks
- [ ] T013 Introduce per-action execution records and rollback-step capture in `services/pipeline.js` for `create`, `update`, `complete`, and `delete` operations.
- [ ] T014 Implement retry-once then rollback orchestration above `TickTickAdapter`, including pre-write snapshots or compensating payload capture for prior successful actions.
- [ ] T015 Classify rollback outcomes explicitly, including the case where rollback itself partially fails, and surface a deterministic partial-failure summary.
- [ ] T016 Add structured observability helpers or hooks that emit request-correlated logs, metrics, and tracing scaffolding for request start, AX, normalization, execution, rollback, and terminal result.

### Implementation Notes
- Do not bypass `services/ticktick-adapter.js`; rollback must use compensating adapter calls.
- Prefer vendor-neutral telemetry hooks that can remain local/no-op by default on Render.
- Treat request ID propagation as mandatory for every observability event.

### Parallel Opportunities
- T016 can start once the execution-record fields from T013 are defined.

### Dependencies
- Depends on WP01, WP03.

### Risks & Mitigations
- Risk: Some operations, especially completion and deletion, may not have an obvious inverse in the current adapter surface.
- Mitigation: Capture pre-write snapshots early, document any best-effort limitations explicitly, and fail as `rollback` rather than silently pretending success.

### Estimated Prompt Size
~360 lines

---

## Work Package WP06: Failure, Rollback, and Burst Regression Finalization (Priority: P0)

**Goal**: Close the loop on the hardening work by extending the direct harness to cover failure semantics, rollback behavior, observability emission, and small concurrent bursts.
**Independent Test**: The direct regression suite proves malformed AX handling, quota rotation, rollback success, rollback failure, observability emission, and tens-of-requests burst behavior without live API calls.
**Prompt**: `kitty-specs/003-pipeline-hardening-and-regression/tasks/WP06-failure-rollback-and-burst-regression-finalization.md`

**Requirement Refs**: FR-003, FR-004, FR-005, FR-006, FR-007, FR-010, SC-002, SC-003, SC-004, SC-005

### Included Subtasks
- [ ] T012 Add direct regression coverage for malformed AX output, empty intents, validation failures, and key-rotation-before-failure quota scenarios.
- [ ] T017 Add direct regression coverage for adapter rejection, successful rollback, rollback failure, and request-correlated observability emission.
- [ ] T020 Add direct pipeline failure-path coverage for validation failure, malformed AX, quota rotation, adapter failure, rollback success, and rollback failure.
- [ ] T021 Add burst-concurrency regressions for tens of concurrent mocked requests with unique request IDs, isolated results, and deterministic contract assertions.
- [ ] T022 Update any pipeline test doubles or validation notes in `tests/e2e-live-ticktick.mjs`, `tests/e2e-live-checklist.mjs`, and feature docs so future implementers can run the hardened regression scope without rediscovering the contract.

### Implementation Notes
- Keep live API scripts opt-in; the required regression coverage should remain mocked and deterministic.
- Favor reusable pipeline doubles from WP04 so this package extends a shared harness instead of creating a second one.
- Make contract-drift assertions explicit: if AX input shape, execution record fields, or telemetry fields change, tests should fail fast.

### Parallel Opportunities
- T012 and T017 can proceed in parallel once WP03 and WP05 land.
- T020 and T021 can overlap after the direct harness from WP04 is stable.
- T022 can run alongside the final regression additions once result shapes are settled.

### Dependencies
- Depends on WP03, WP04, WP05.

### Risks & Mitigations
- Risk: Final regression work duplicates earlier harness coverage instead of extending it.
- Mitigation: Reuse WP04 fixtures and keep this package focused on failure, rollback, telemetry, and burst behaviors only.

### Estimated Prompt Size
~380 lines

---

## Dependency & Execution Summary

- **Sequence**: WP01 first. Then run WP02, WP03, and WP04 in parallel. WP05 follows once WP03 is complete. WP06 closes the loop after WP03, WP04, and WP05.
- **Parallelization**: Three agent tracks open immediately after WP01:
  - Track A: caller wiring in WP02
  - Track B: failure semantics in WP03
  - Track C: direct harness setup in WP04
  After that, one agent can take WP05 while another prepares the final regression closure in WP06 as soon as its dependencies are merged.
- **MVP Scope**: For the earliest meaningful integration slice, complete WP01 + WP02 + WP03 + WP04. Full feature acceptance still requires WP05 and WP06.

---

## Subtask Index

| Subtask ID | Summary | Work Package | Priority | Parallel? |
|------------|---------|--------------|----------|-----------|
| T001 | Define canonical request-context assembly path | WP01 | P0 | No |
| T002 | Align AX extraction with canonical context | WP01 | P0 | Yes |
| T003 | Align normalization with canonical context | WP01 | P0 | Yes |
| T004 | Add fail-fast contract validation and dev diagnostics | WP01 | P0 | No |
| T005 | Update bot command entry points to use canonical context | WP02 | P1 | Yes |
| T006 | Update scheduler and bootstrap wiring to use canonical context | WP02 | P1 | Yes |
| T007 | Unify per-request project lookup and AX-facing project names | WP02 | P1 | No |
| T008 | Add Story 1 direct regressions for dates and project hints | WP04 | P0 | Yes |
| T009 | Introduce explicit pipeline failure classes | WP03 | P1 | No |
| T010 | Implement configured-key rotation before quota failure | WP03 | P1 | Yes |
| T011 | Add dev-vs-user failure message rendering | WP03 | P1 | Yes |
| T012 | Add Story 2 failure-path regressions | WP06 | P0 | Yes |
| T013 | Add execution records and rollback-step capture | WP05 | P1 | No |
| T014 | Implement retry-once then rollback orchestration | WP05 | P1 | No |
| T015 | Classify rollback outcomes and summaries | WP05 | P1 | No |
| T016 | Add structured logs, metrics, and tracing hooks | WP05 | P1 | Yes |
| T017 | Add rollback and observability regressions | WP06 | P0 | Yes |
| T018 | Refactor harness to use direct `createPipeline()` doubles | WP04 | P0 | No |
| T019 | Add direct happy-path pipeline regressions | WP04 | P0 | Yes |
| T020 | Add direct failure-path pipeline regressions | WP06 | P0 | Yes |
| T021 | Add burst-concurrency contract regressions | WP06 | P0 | Yes |
| T022 | Update live doubles and validation notes for hardened contract | WP06 | P0 | Yes |
