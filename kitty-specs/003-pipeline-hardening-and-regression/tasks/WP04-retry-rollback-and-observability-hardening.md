---
work_package_id: WP04
title: Retry, Rollback, and Observability Hardening
lane: planned
dependencies:
- WP01
- WP03
subtasks:
- T013
- T014
- T015
- T016
- T017
phase: Phase 4 - Execution Hardening
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
- FR-007
- FR-008
- FR-009
---

# Work Package Prompt: WP04 - Retry, Rollback, and Observability Hardening

## Objectives and Success Criteria

- Track every executed action explicitly.
- Retry one failed action once, then roll back earlier successful writes through compensating adapter calls.
- Emit request-correlated logs, metrics hooks, and tracing scaffolding across request stages.

Success looks like:
- per-action execution records with attempts, status, failure class, and rollback metadata
- retry-once behavior for multi-action failures
- rollback orchestration above `TickTickAdapter`
- explicit classification when rollback itself fails
- structured telemetry emitted for request, AX, normalization, execution, rollback, and terminal result

## Context and Constraints

- Implementation command: `spec-kitty implement WP04 --base WP03`
- This package depends on:
  - WP01 for canonical request context
  - WP03 for explicit failure classes and message semantics
- The constitution forbids scattering direct TickTick client calls outside the adapter. Respect that even when adding rollback.
- Observability scope is full for this feature, but vendor integration is not required. Keep it local and vendor-neutral.

Relevant documents:
- `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
- `kitty-specs/003-pipeline-hardening-and-regression/research.md`
- `kitty-specs/003-pipeline-hardening-and-regression/data-model.md`
- `kitty-specs/003-pipeline-hardening-and-regression/contracts/pipeline.openapi.yaml`
- `kitty-specs/003-pipeline-hardening-and-regression/contracts/telemetry-events.schema.json`

Relevant code:
- `services/pipeline.js`
- `services/ticktick-adapter.js`
- `services/ticktick.js`
- `services/ax-intent.js`
- `services/normalizer.js`
- `tests/regression.test.js`
- `tests/run-regression-tests.mjs`

Operational constraints:
- Rollback must be best-effort and explicit, not magical.
- Compensation behavior needs enough pre-write data to restore previous state when possible.
- Request IDs must flow through telemetry and execution records consistently.

## Subtasks and Detailed Guidance

### Subtask T013 - Add execution records and rollback-step capture
- **Purpose**: Make action-by-action execution inspectable and reversible.
- **Steps**:
  1. Extend pipeline execution bookkeeping to create one execution record per normalized action.
  2. Capture:
     - action index
     - normalized action payload
     - attempt count
     - execution status
     - error message
     - failure class
     - optional rollback step
  3. Record enough pre-write state for later compensation, especially for update and delete flows.
  4. Keep the record format aligned with `data-model.md`.
- **Files**:
  - `services/pipeline.js`
  - possibly helper modules for rollback metadata
- **Parallel**: No.
- **Notes**:
  - Avoid leaking adapter implementation details into unrelated callers.
  - Keep the execution record stable enough for direct regression assertions.

### Subtask T014 - Implement retry-once then rollback orchestration
- **Purpose**: Enforce the clarified multi-action failure policy without breaking the adapter boundary.
- **Steps**:
  1. Add bounded retry behavior for action failures in multi-action requests.
  2. If the retry still fails, walk previously successful actions in reverse order and execute compensating adapter operations.
  3. Define compensation strategies deliberately:
     - delete a newly created task
     - restore a pre-update snapshot
     - recreate a deleted task when possible
     - reverse completion only if the current adapter surface can support it cleanly
  4. Stop short of pretending transactional guarantees that TickTick cannot offer.
- **Files**:
  - `services/pipeline.js`
  - `services/ticktick-adapter.js`
- **Parallel**: No.
- **Notes**:
  - If a clean inverse does not exist for one operation, classify and document that behavior explicitly instead of silently skipping it.
  - Keep compensating calls routed through `TickTickAdapter`.

### Subtask T015 - Classify rollback outcomes and user-facing summaries
- **Purpose**: Ensure partial failure states are honest and deterministic.
- **Steps**:
  1. Add explicit rollback-related failure classes or status markers to the result envelope.
  2. Distinguish:
     - adapter failure before rollback
     - rollback success after retry failure
     - rollback failure while compensating earlier writes
  3. Render a deterministic summary so callers do not present misleading success text after rollback activity.
  4. Keep developer diagnostics rich enough to inspect which action failed and which compensations ran.
- **Files**:
  - `services/pipeline.js`
- **Parallel**: No.
- **Notes**:
  - This should build on WP03's mode-aware failure rendering rather than creating a competing output path.

### Subtask T016 - Add structured observability hooks
- **Purpose**: Make the hardened pipeline inspectable without binding the feature to a specific telemetry vendor.
- **Steps**:
  1. Introduce a structured event shape aligned with `telemetry-events.schema.json`.
  2. Emit events or reusable hooks for:
     - request received
     - AX completed or failed
     - normalization completed
     - execution succeeded or failed
     - rollback succeeded or failed
     - request completed or failed
  3. Include request ID, entry point, step, status, duration, failure class, action type, attempt count, and rollback state where relevant.
  4. Keep metric and trace hooks lightweight and safe as no-ops if no sink is configured.
- **Files**:
  - `services/pipeline.js`
  - optionally a new module such as `services/pipeline-observability.js`
  - `services/ticktick-adapter.js` if correlation must cross the adapter boundary
- **Parallel**: Yes, after T013 defines execution-record fields.
- **Notes**:
  - Console logging can remain one sink, but structure the data before printing it.
  - Preserve compatibility with limited Render/free-tier deployment.

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
- **Parallel**: Yes, once T014-T016 stabilize.
- **Notes**:
  - Favor deterministic mocks over live API conditions.
  - Verify request correlation survives retries and rollback.

## Test Strategy

- Required direct regressions:
  - retry-once behavior
  - rollback after unrecovered action failure
  - rollback failure classification
  - structured observability emission
- Prefer mocked doubles for:
  - adapter methods
  - rollback compensation outcomes
  - telemetry sinks

Verification commands:
- `node tests/run-regression-tests.mjs`
- `node --test tests/regression.test.js`

## Risks and Mitigations

- **Risk**: Completion and deletion rollback semantics may be weaker than create/update rollback.
  - **Mitigation**: Capture pre-write state early and classify unsupported reversals explicitly instead of masking them.
- **Risk**: Telemetry logic contaminates business flow with sink-specific code.
  - **Mitigation**: Isolate event creation and sink dispatch behind small helper functions or modules.
- **Risk**: Retry plus rollback state becomes hard to reason about.
  - **Mitigation**: Keep execution records explicit and assert them in direct tests.

## Review Guidance

- Verify all compensating writes still go through `TickTickAdapter`.
- Verify rollback occurs only after one retry attempt has failed.
- Verify rollback summaries are honest and do not look like full success.
- Verify telemetry payloads carry request correlation and failure-class data consistently.

## Activity Log

- 2026-03-11T17:18:05Z - system - lane=planned - Prompt created.
