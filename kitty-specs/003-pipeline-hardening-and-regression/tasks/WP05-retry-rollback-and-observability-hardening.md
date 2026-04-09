---
work_package_id: WP05
title: Retry, Rollback, and Observability Hardening
dependencies:
- WP01
- WP03
requirement_refs:
- FR-007
- FR-008
- FR-009
base_branch: 003-pipeline-hardening-and-regression-WP05-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T013
- T014
- T015
- T016
phase: Phase 4 - Execution Hardening
authoritative_surface: kitty-specs/003-pipeline-hardening-and-regression/
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQV
owned_files:
- kitty-specs/003-pipeline-hardening-and-regression/contracts/telemetry-events.schema.json
- kitty-specs/003-pipeline-hardening-and-regression/plan.md
- kitty-specs/003-pipeline-hardening-and-regression/spec.md
wp_code: WP05
---

# Work Package Prompt: WP05 - Retry, Rollback, and Observability Hardening

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task.**

- **Has review feedback?** Check the current review state before starting.
- **Address all review feedback** before marking the package complete.
- **Report progress** by appending Activity Log entries in chronological order.

---

## Review Feedback

> Populated by `/spec-kitty.review` when changes are requested.

*[This section is empty initially. Any later feedback becomes mandatory scope.]*  

---

## Markdown Formatting

Wrap HTML/XML tags in backticks: `` `<div>` ``, `` `<script>` ``  
Use language identifiers in fenced code blocks.

---

## Objectives & Success Criteria

- Track every executed action explicitly.
- Retry one failed action once, then roll back earlier successful writes through compensating adapter calls.
- Emit request-correlated telemetry across request stages without breaking the adapter boundary.
- Keep rollback behavior honest and explicitly classifiable when compensation is partial or unsupported.

## Context & Constraints

- Implementation command: `spec-kitty implement WP05 --base WP03`
- Canonical references:
  - `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/contracts/telemetry-events.schema.json`
  - `services/pipeline.js`
  - `services/pipeline-observability.js`
  - `services/ticktick-adapter.js`
  - `services/ticktick.js`
- Rollback must stay above `TickTickAdapter`; do not bypass the adapter boundary.
- Observability remains vendor-neutral and local/no-op by default.
- Request IDs must flow through telemetry and execution records consistently.
- Build on WP03 failure classes rather than creating a competing result model.

## Subtasks & Detailed Guidance

### Subtask T013 - Add execution records and rollback-step capture
- **Purpose**: Make action-by-action execution inspectable and reversible.
- **Steps**:
  1. Extend pipeline execution bookkeeping to create one execution record per normalized action.
  2. Capture attempt count, execution status, failure class, and rollback metadata.
  3. Record enough pre-write state for later compensation, especially for update, delete, and complete flows.
  4. Keep the execution-record contract stable enough for direct regression assertions.
- **Files to Touch**:
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Every executed action has a stable execution record.
  - Rollback steps are explicit rather than inferred from logs.
- **Guardrails**:
  - Do not store more snapshot data than later compensation actually needs.

### Subtask T014 - Implement retry-once then rollback orchestration
- **Purpose**: Enforce the clarified multi-action failure policy without breaking the adapter boundary.
- **Steps**:
  1. Add bounded retry behavior for action failures in multi-action requests.
  2. If retry still fails, walk prior successful actions in reverse order and execute compensating adapter operations.
  3. Define compensation strategies deliberately for create, update, complete, and delete.
  4. Keep unsupported compensation cases explicit rather than silent.
- **Files to Touch**:
  - `services/pipeline.js`
  - `services/ticktick-adapter.js` only if existing restore/read helpers need small expansion
- **Tests / Acceptance Cues**:
  - Retry occurs once.
  - Failed retries trigger rollback of prior successful writes.
  - Unsupported compensation paths surface as explicit rollback problems.
- **Guardrails**:
  - Do not pretend transactionality TickTick cannot provide.

### Subtask T015 - Classify rollback outcomes and summaries
- **Purpose**: Ensure partial failure states are honest and deterministic.
- **Steps**:
  1. Distinguish adapter failure before rollback, rollback success after retry failure, and rollback failure during compensation.
  2. Surface deterministic summary fields and messages for rollback-aware outcomes.
  3. Keep developer diagnostics rich enough to inspect which action failed and which rollback steps ran.
  4. Reuse the WP03 failure model rather than creating a separate rollback output path.
- **Files to Touch**:
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Rollback outcomes are explicit and classifiable.
  - Caller code cannot mistake a rollback-heavy failure for success.
- **Guardrails**:
  - Do not split rollback messaging into a second caller-owned rendering layer.

### Subtask T016 - Add structured observability hooks
- **Purpose**: Make the hardened pipeline inspectable without vendor lock-in.
- **Steps**:
  1. Keep structured event emission aligned with `telemetry-events.schema.json`.
  2. Emit request, AX, normalization, execution, rollback, and terminal-result events through `services/pipeline-observability.js`.
  3. Include stable correlation fields such as request ID, step, status, failure class, action type, attempt count, and rollback state.
  4. Keep sink integration optional and safe as a no-op.
- **Files to Touch**:
  - `services/pipeline-observability.js`
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Request-correlated observability events can be asserted without a real vendor sink.
  - Entry-point normalization and event structure remain stable.
- **Guardrails**:
  - Do not add a mandatory telemetry dependency for this feature.

## Definition of Done

- Per-action execution records exist and capture rollback metadata.
- Retry-once then rollback behavior is explicit and adapter-safe.
- Rollback outcomes are classified deterministically.
- Structured observability hooks exist through the pipeline observability surface.

## Activity Log

- 2026-04-01: WP regenerated after audit; prior prompt replaced because it still embedded obsolete task-lane history instead of the current review-oriented format.
