---
work_package_id: WP05
title: Retry, Rollback, and Observability Hardening
lane: "for_review"
dependencies:
- WP01
- WP03
base_branch: 003-pipeline-hardening-and-regression-WP05-merge-base
base_commit: 1e390162039ac4c9bf35864ef90e45e25f225add
created_at: '2026-03-11T20:33:26.419166+00:00'
subtasks:
- T013
- T014
- T015
- T016
phase: Phase 4 - Execution Hardening
assignee: ''
agent: "Codex"
shell_pid: "31060"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-11T17:18:05Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
- timestamp: '2026-03-11T17:50:00Z'
  lane: planned
  agent: codex
  shell_pid: ''
  action: Narrowed to implementation hardening so rollback and observability tests can converge later in WP06
requirement_refs:
- FR-007
- FR-008
- FR-009
---

# Work Package Prompt: WP05 - Retry, Rollback, and Observability Hardening

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

- Implementation command: `spec-kitty implement WP05 --base WP03`
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

Operational constraints:
- Rollback must be best-effort and explicit, not magical.
- Compensation behavior needs enough pre-write data to restore previous state when possible.
- Request IDs must flow through telemetry and execution records consistently.

## Subtasks and Detailed Guidance

### Subtask T013 - Add execution records and rollback-step capture
- **Purpose**: Make action-by-action execution inspectable and reversible.
- **Steps**:
  1. Extend pipeline execution bookkeeping to create one execution record per normalized action.
  2. Capture action index, normalized action payload, attempt count, execution status, error message, failure class, and optional rollback step.
  3. Record enough pre-write state for later compensation, especially for update and delete flows.
  4. Keep the record format aligned with `data-model.md`.
- **Files**:
  - `services/pipeline.js`
  - possibly helper modules for rollback metadata
- **Parallel**: No.
- **Notes**:
  - Keep the execution record stable enough for direct regression assertions in WP06.

### Subtask T014 - Implement retry-once then rollback orchestration
- **Purpose**: Enforce the clarified multi-action failure policy without breaking the adapter boundary.
- **Steps**:
  1. Add bounded retry behavior for action failures in multi-action requests.
  2. If the retry still fails, walk previously successful actions in reverse order and execute compensating adapter operations.
  3. Define compensation strategies deliberately for create, update, delete, and completion flows.
  4. Stop short of pretending transactional guarantees that TickTick cannot offer.
- **Files**:
  - `services/pipeline.js`
  - `services/ticktick-adapter.js`
- **Parallel**: No.
- **Notes**:
  - If a clean inverse does not exist for one operation, classify and document that behavior explicitly instead of silently skipping it.

### Subtask T015 - Classify rollback outcomes and user-facing summaries
- **Purpose**: Ensure partial failure states are honest and deterministic.
- **Steps**:
  1. Add explicit rollback-related failure classes or status markers to the result envelope.
  2. Distinguish adapter failure before rollback, rollback success after retry failure, and rollback failure while compensating earlier writes.
  3. Render a deterministic summary so callers do not present misleading success text after rollback activity.
  4. Keep developer diagnostics rich enough to inspect which action failed and which compensations ran.
- **Files**:
  - `services/pipeline.js`
- **Parallel**: No.
- **Notes**:
  - Build on WP03's mode-aware failure rendering rather than creating a competing output path.

### Subtask T016 - Add structured observability hooks
- **Purpose**: Make the hardened pipeline inspectable without binding the feature to a specific telemetry vendor.
- **Steps**:
  1. Introduce a structured event shape aligned with `telemetry-events.schema.json`.
  2. Emit events or reusable hooks for request received, AX completed or failed, normalization completed, execution succeeded or failed, rollback succeeded or failed, and request completed or failed.
  3. Include request ID, entry point, step, status, duration, failure class, action type, attempt count, and rollback state where relevant.
  4. Keep metric and trace hooks lightweight and safe as no-ops if no sink is configured.
- **Files**:
  - `services/pipeline.js`
  - optionally a new helper such as `services/pipeline-observability.js`
  - `services/ticktick-adapter.js` if correlation must cross the adapter boundary
- **Parallel**: Yes, after T013 defines execution-record fields.
- **Notes**:
  - Console logging can remain one sink, but structure the data before printing it.

## Test Strategy

- Keep implementation deterministic enough for WP06 to add:
  - retry-once regressions
  - rollback-success and rollback-failure regressions
  - structured observability assertions
- Preferred local verification during this package:
  - focused checks around execution record shape
  - spot checks that telemetry hooks remain no-op safe when no sink is configured

Verification commands:
- `node tests/run-regression-tests.mjs`
- `node --test tests/regression.test.js`

## Risks and Mitigations

- **Risk**: Completion and deletion rollback semantics may be weaker than create/update rollback.
  - **Mitigation**: Capture pre-write state early and classify unsupported reversals explicitly instead of masking them.
- **Risk**: Telemetry logic contaminates business flow with sink-specific code.
  - **Mitigation**: Isolate event creation and sink dispatch behind small helper functions or modules.

## Review Guidance

- Verify all compensating writes still go through `TickTickAdapter`.
- Verify rollback occurs only after one retry attempt has failed.
- Verify rollback summaries are honest and do not look like full success.
- Verify telemetry payloads carry request correlation and failure-class data consistently.

## Activity Log

- 2026-03-11T17:18:05Z - system - lane=planned - Prompt created.
- 2026-03-11T17:50:00Z - codex - lane=planned - Tightened scope so implementation hardening and final regression closure can proceed as separate packages.
- 2026-03-11T20:33:30Z – Codex – shell_pid=31060 – lane=doing – Assigned agent via workflow command
- 2026-03-11T20:51:55Z – Codex – shell_pid=31060 – lane=for_review – Ready for review: added per-action execution records, retry-once rollback handling, and structured pipeline telemetry with regression coverage.
