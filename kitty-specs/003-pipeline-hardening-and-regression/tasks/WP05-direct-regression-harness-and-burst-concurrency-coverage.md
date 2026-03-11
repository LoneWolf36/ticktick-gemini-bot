---
work_package_id: WP05
title: Direct Regression Harness and Burst Concurrency Coverage
lane: planned
dependencies:
- WP02
- WP03
- WP04
subtasks:
- T018
- T019
- T020
- T021
- T022
phase: Phase 5 - Regression Hardening
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-11T17:18:05Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-005
- FR-006
---

# Work Package Prompt: WP05 - Direct Regression Harness and Burst Concurrency Coverage

## Objectives and Success Criteria

- Move regression confidence onto the live pipeline architecture instead of legacy helper behavior.
- Cover direct happy paths, direct failure paths, rollback semantics, and small concurrent bursts with mocked dependencies.
- Leave the test harness reusable for future hardening work.

Success looks like:
- `createPipeline()` is exercised directly by the regression harness
- happy-path tests cover create, update, complete, delete, and non-task routing
- failure-path tests cover malformed AX, validation failure, quota rotation, adapter failure, rollback success, and rollback failure
- burst tests prove tens of concurrent mocked requests remain isolated and deterministic
- contract-drift assertions fail fast when the AX or pipeline contract changes unexpectedly

## Context and Constraints

- Implementation command: `spec-kitty implement WP05 --base WP04`
- This package depends on the stabilized request context, failure envelope, rollback records, and telemetry semantics from earlier work packages.
- The feature spec explicitly requires regression coverage, so this package is not optional polish.
- Keep routine regressions mocked and deterministic. Live API checks stay opt-in.

Relevant documents:
- `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
- `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
- `kitty-specs/003-pipeline-hardening-and-regression/quickstart.md`
- `kitty-specs/003-pipeline-hardening-and-regression/contracts/pipeline.openapi.yaml`
- `kitty-specs/003-pipeline-hardening-and-regression/data-model.md`

Relevant code and tests:
- `tests/regression.test.js`
- `tests/run-regression-tests.mjs`
- `tests/e2e-live-ticktick.mjs`
- `tests/e2e-live-checklist.mjs`
- `services/pipeline.js`
- `services/ax-intent.js`
- `services/normalizer.js`
- `services/ticktick-adapter.js`
- `bot/commands.js`

Important test constraints:
- Prefer direct pipeline doubles over bot-command-only coverage.
- Keep fixtures legible and explicit.
- Use exact dates and injected request IDs where possible so the burst tests remain deterministic.

## Subtasks and Detailed Guidance

### Subtask T018 - Refactor the harness around direct `createPipeline()` doubles
- **Purpose**: Make the regression suite prove the live pipeline architecture rather than mostly helper behavior.
- **Steps**:
  1. Identify the current tests that still primarily validate helper-only or command-only flows.
  2. Introduce reusable direct-pipeline doubles for:
     - AX extractor
     - normalizer
     - adapter
     - optional telemetry sink
  3. Keep the fixtures small enough that a reviewer can understand the setup without spelunking the whole test file.
  4. Reuse helpers between `tests/regression.test.js` and `tests/run-regression-tests.mjs` where it improves clarity.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - optionally a new shared test helper module if the repo layout benefits from one
- **Parallel**: No.
- **Notes**:
  - Do not over-abstract the harness.
  - Keep the pipeline as the unit under test, not a synthetic wrapper around it.

### Subtask T019 - Add direct happy-path regressions
- **Purpose**: Prove the hardened pipeline still performs the core task operations correctly.
- **Steps**:
  1. Add direct tests for create, update, complete, and delete actions.
  2. Add direct tests for `non-task` routing when no actionable intent exists.
  3. Assert the hardened result envelope:
     - `type`
     - actions
     - execution records or results
     - confirmation text
     - request correlation where relevant
  4. Keep success assertions focused on contract behavior rather than decorative formatting.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, after T018 sets up the harness.
- **Notes**:
  - Use direct mocks instead of live TickTick behavior.
  - Verify the adapter path remains the one exercised by execution.

### Subtask T020 - Add direct failure-path regressions
- **Purpose**: Lock in the fail-closed behavior introduced by the hardening work.
- **Steps**:
  1. Add direct tests for malformed AX output.
  2. Add tests for validation failure, adapter failure, and quota rotation before final failure.
  3. Add tests for rollback success and rollback failure using the new execution-record contract.
  4. Assert failure classes and rollback markers rather than brittle raw text blobs.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, after T018 and once WP03-WP04 behavior stabilizes.
- **Notes**:
  - These tests are the main guard against accidental regression in failure semantics.
  - Keep one assertion path for user mode and another for dev mode if message shape differs materially.

### Subtask T021 - Add burst-concurrency regressions
- **Purpose**: Prove the hardened contract holds under the clarified "tens of requests" scale assumption.
- **Steps**:
  1. Build a mocked burst test that launches tens of pipeline requests concurrently.
  2. Ensure each request gets a distinct request ID or deterministic injected ID.
  3. Assert that one request's failure does not corrupt neighboring outcomes.
  4. Keep the burst test bounded and fast enough for routine local regression use.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, after request ID semantics are stable.
- **Notes**:
  - This is not a live load test.
  - Favor deterministic concurrency primitives and bounded batch sizes.

### Subtask T022 - Update live doubles and validation notes
- **Purpose**: Keep the wider test surface compatible with the hardened result contract so future contributors do not reintroduce drift.
- **Steps**:
  1. Review `tests/e2e-live-ticktick.mjs` and `tests/e2e-live-checklist.mjs` for pipeline doubles or assumptions about result shape.
  2. Update those doubles only as needed so they remain compatible with the hardened pipeline contract.
  3. Refresh feature-level validation notes or quickstart references if command expectations or regression steps changed materially.
  4. Keep the documentation delta small and specific to the hardened pipeline behavior.
- **Files**:
  - `tests/e2e-live-ticktick.mjs`
  - `tests/e2e-live-checklist.mjs`
  - `kitty-specs/003-pipeline-hardening-and-regression/quickstart.md` if implementation drift requires it
- **Parallel**: Yes.
- **Notes**:
  - Do not expand this into broad documentation cleanup.
  - Only touch live scripts where the hardened pipeline contract would otherwise break them or make them misleading.

## Test Strategy

- Required:
  - direct pipeline happy-path tests
  - direct pipeline failure-path tests
  - burst-concurrency regression
  - contract-drift assertions
- Keep the primary commands:
  - `node tests/run-regression-tests.mjs`
  - `node --test tests/regression.test.js`

Optional follow-up only if helpful:
- spot-check the opt-in live scripts after the contract change lands

## Risks and Mitigations

- **Risk**: The harness becomes too abstract and hard to maintain.
  - **Mitigation**: Reuse helpers only where they materially improve clarity.
- **Risk**: Burst tests become flaky due to wall-clock or randomness dependence.
  - **Mitigation**: Inject request IDs, dates, and deterministic mocks explicitly.
- **Risk**: Live-script doubles drift from the hardened result envelope.
  - **Mitigation**: Update only the touched assumptions and keep contract assertions near the direct pipeline tests.

## Review Guidance

- Verify the regression suite now exercises `createPipeline()` directly.
- Verify success and failure coverage match the feature spec requirements.
- Verify the burst test is mocked, bounded, and deterministic.
- Verify contract-drift assertions would catch changes in context shape or result envelope.

## Activity Log

- 2026-03-11T17:18:05Z - system - lane=planned - Prompt created.
