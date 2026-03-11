---
work_package_id: WP06
title: Failure, Rollback, and Burst Regression Finalization
lane: planned
dependencies:
- WP03
- WP04
- WP05
subtasks:
- T012
- T017
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
- timestamp: '2026-03-11T17:50:00Z'
  lane: planned
  agent: codex
  shell_pid: ''
  action: Created final convergence package for failure, rollback, telemetry, and burst-concurrency regressions
requirement_refs:
- FR-003
- FR-004
- FR-005
- FR-006
- FR-007
- FR-010
---

# Work Package Prompt: WP06 - Failure, Rollback, and Burst Regression Finalization

## Objectives and Success Criteria

- Close the loop on the hardening work by extending the direct harness to cover failure semantics, rollback behavior, observability emission, and small concurrent bursts.
- Keep the final regression scope isolated in one convergence package instead of scattering it across implementation packages.

Success looks like:
- malformed AX, empty intent, validation, quota, adapter, rollback, and unexpected paths are covered through the direct harness
- rollback success and rollback failure are both asserted through execution-record and message-shape contracts
- structured observability emission is asserted without vendor lock-in
- burst tests prove tens of concurrent mocked requests remain isolated and deterministic

## Context and Constraints

- Implementation command: `spec-kitty implement WP06 --base WP05`
- This package depends on WP03, WP04, and WP05. It is the convergence package after the three parallel tracks and the hardening package complete.
- Keep live API checks opt-in. Required regression coverage should remain mocked and deterministic.
- Reuse the direct-pipeline doubles and fixtures established in WP04.

Relevant documents:
- `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
- `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
- `kitty-specs/003-pipeline-hardening-and-regression/quickstart.md`
- `kitty-specs/003-pipeline-hardening-and-regression/contracts/pipeline.openapi.yaml`
- `kitty-specs/003-pipeline-hardening-and-regression/contracts/telemetry-events.schema.json`

Relevant code and tests:
- `tests/regression.test.js`
- `tests/run-regression-tests.mjs`
- `tests/e2e-live-ticktick.mjs`
- `tests/e2e-live-checklist.mjs`
- `services/pipeline.js`
- `services/ax-intent.js`
- `services/normalizer.js`
- `services/ticktick-adapter.js`

## Subtasks and Detailed Guidance

### Subtask T012 - Add Story 2 failure-path regressions
- **Purpose**: Lock in the hardened failure semantics so they cannot drift silently.
- **Steps**:
  1. Add tests for malformed AX output that prove the pipeline fails safely.
  2. Add tests for empty intent lists and validation failure behavior.
  3. Add tests proving configured-key rotation happens before final quota failure.
  4. Assert failure class plus message-shape behavior rather than brittle full error paragraphs.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, once WP03 lands.
- **Notes**:
  - Prefer direct pipeline doubles over calling unrelated legacy helpers.

### Subtask T017 - Add rollback and observability regressions
- **Purpose**: Keep rollback and telemetry behavior from drifting after implementation.
- **Steps**:
  1. Add direct tests for adapter failure after partial success plus successful rollback.
  2. Add direct tests for rollback failure classification.
  3. Add assertions for emitted event structure or telemetry hook invocation.
  4. Keep assertions focused on stable contract fields rather than raw log formatting.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, once WP05 lands.
- **Notes**:
  - Verify request correlation survives retries and rollback.

### Subtask T020 - Add direct failure-path regressions
- **Purpose**: Lock in the fail-closed behavior introduced by the hardening work.
- **Steps**:
  1. Add direct tests for malformed AX output, validation failure, adapter failure, and quota rotation before final failure.
  2. Add tests for rollback success and rollback failure using the new execution-record contract.
  3. Keep one assertion path for user mode and another for dev mode if message shape differs materially.
  4. Assert failure classes and rollback markers rather than brittle raw text blobs.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, after WP04 and WP05 are stable.
- **Notes**:
  - These tests are the main guard against accidental regression in failure semantics.

### Subtask T021 - Add burst-concurrency regressions
- **Purpose**: Prove the hardened contract holds under the clarified tens-of-requests scale assumption.
- **Steps**:
  1. Build a mocked burst test that launches tens of pipeline requests concurrently.
  2. Ensure each request gets a distinct request ID or deterministic injected ID.
  3. Assert that one request's failure does not corrupt neighboring outcomes.
  4. Keep the burst test bounded and fast enough for routine local regression use.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, after request ID semantics and direct harness fixtures are stable.
- **Notes**:
  - This is not a live load test.

### Subtask T022 - Update live doubles and validation notes
- **Purpose**: Keep the wider test surface compatible with the hardened result contract so future contributors do not reintroduce drift.
- **Steps**:
  1. Review `tests/e2e-live-ticktick.mjs` and `tests/e2e-live-checklist.mjs` for assumptions about result shape.
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

## Test Strategy

- Required:
  - direct pipeline failure-path tests
  - rollback and observability regression coverage
  - burst-concurrency regression
  - contract-drift assertions
- Keep the primary commands:
  - `node tests/run-regression-tests.mjs`
  - `node --test tests/regression.test.js`

Optional follow-up only if helpful:
- spot-check the opt-in live scripts after the contract change lands

## Risks and Mitigations

- **Risk**: Final regression work duplicates earlier harness coverage instead of extending it.
  - **Mitigation**: Reuse WP04 fixtures and keep this package focused on failure, rollback, telemetry, and burst behaviors only.
- **Risk**: Burst tests become flaky due to wall-clock or randomness dependence.
  - **Mitigation**: Inject request IDs, dates, and deterministic mocks explicitly.

## Review Guidance

- Verify success and failure coverage now spans the full feature spec without falling back to helper-only tests.
- Verify rollback and telemetry assertions use stable contract fields.
- Verify the burst test is mocked, bounded, and deterministic.
- Verify live-script assumptions stay compatible with the hardened result envelope.

## Activity Log

- 2026-03-11T17:50:00Z - codex - lane=planned - Prompt created.
