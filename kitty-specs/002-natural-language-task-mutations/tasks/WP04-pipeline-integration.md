---
work_package_id: WP04
title: Pipeline Integration
dependencies:
- WP03
requirement_refs:
- FR-002
- FR-003
- FR-004
- FR-006
- FR-007
- FR-008
- FR-009
base_branch: 002-natural-language-task-mutations-WP04-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T041
- T042
- T043
- T044
- T045
phase: Phase 3 - Pipeline Routing
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQT
owned_files:
- kitty-specs/002-natural-language-task-mutations/plan.md
- kitty-specs/002-natural-language-task-mutations/spec.md
- tests/pipeline-harness.js
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP04
---

# Work Package Prompt: WP04 - Pipeline Integration

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

- Extend the existing pipeline so a free-form mutation request can resolve to `task`, `clarification`, or `not-found` without bypassing current execution and rollback machinery.
- Expose a thin adapter read seam for active tasks so resolution does not force bot handlers to call `TickTickClient` directly.
- Thread available-task and resolver metadata through the request context and harnesses needed by tests.
- Keep logging and diagnostics on the existing observability path rather than inventing a new logger subsystem.

## Context & Constraints

- Implementation command: `spec-kitty implement WP04 --base WP03`
- Canonical references:
  - `kitty-specs/002-natural-language-task-mutations/spec.md`
  - `kitty-specs/002-natural-language-task-mutations/plan.md`
  - `services/pipeline.js`
  - `services/pipeline-context.js`
  - `services/pipeline-observability.js`
  - `services/ticktick-adapter.js`
  - `tests/pipeline-harness.js`
  - `tests/regression.test.js`
- Do not create a second pipeline module.
- Successful writes must still flow through `_executeActions()` and the existing adapter methods.
- Avoid new infrastructure such as webhook invalidation, standalone task cache modules, timeout guards, or correlation-ID rewrites.
- Keep result types minimal: `task`, `clarification`, `not-found`, `non-task`, and `error`.

## Subtasks & Detailed Guidance

### Subtask T041 - Add a thin adapter read seam for active tasks
- **Purpose**: Make task resolution possible without breaking the repository rule against bot handlers calling the low-level client directly.
- **Steps**:
  1. Extend `services/ticktick-adapter.js` with one small helper for listing active tasks.
  2. Reuse the client’s current cached task-list behavior where practical.
  3. Return task objects with the fields the resolver and pipeline need, including project context.
  4. Keep this helper read-only and narrow.
- **Files to Touch**:
  - `services/ticktick-adapter.js`
- **Tests / Acceptance Cues**:
  - The helper should be usable by the pipeline and by test doubles in the harness.
  - No successful write path should change because of this addition.
- **Guardrails**:
  - Do not expose the full raw client or a generic “get everything” service layer.

### Subtask T042 - Extend pipeline context and harness plumbing for available tasks and resolution metadata
- **Purpose**: Give the pipeline a stable way to carry task-list inputs and resolver decisions without ad hoc option bags.
- **Steps**:
  1. Extend `services/pipeline-context.js` so request context can hold available tasks or fetch them through the adapter helper.
  2. Preserve existing context validation rules for request ID, mode, and available projects.
  3. Extend `tests/pipeline-harness.js` so resolver scenarios can be tested deterministically.
  4. Keep context additions small and mutation-specific.
- **Files to Touch**:
  - `services/pipeline-context.js`
  - `tests/pipeline-harness.js`
- **Tests / Acceptance Cues**:
  - Harnesses should be able to provide active tasks directly for mutation tests.
  - Existing create-path harness usage should still work unchanged.
- **Guardrails**:
  - Do not overload context with Telegram-specific UI state; that belongs later.

### Subtask T043 - Add mutation routing in `services/pipeline.js`
- **Purpose**: Extend `processMessage()` so free-form mutation requests can be resolved and then executed through the existing pipeline.
- **Steps**:
  1. Detect when the extracted actions represent one in-scope mutation request.
  2. Reject out-of-scope mixed create+mutation or multi-mutation batches early.
  3. Fetch active tasks through the adapter helper.
  4. Resolve the target through `services/task-resolver.js`.
  5. On `resolved`, populate the normalized mutation path with the selected task context and execute through `_executeActions()`.
- **Files to Touch**:
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Exact-match update/complete/delete scenarios should end as `task` results.
  - Mixed create+mutation requests should not reach adapter writes.
- **Guardrails**:
  - Do not duplicate execution code that already exists below `processMessage()`.

### Subtask T044 - Add `clarification` and `not-found` result types with terse user-facing payloads
- **Purpose**: Give the bot layer enough structured information to ask a narrow follow-up or decline safely.
- **Steps**:
  1. Add a `clarification` result shape carrying candidate metadata and a terse prompt.
  2. Add a `not-found` result shape carrying a terse failure message and a machine-readable reason.
  3. Keep both results compatible with the existing pipeline return conventions (`requestId`, `entryPoint`, `mode`, diagnostics where applicable).
  4. Emit the relevant observability events through the current telemetry path.
- **Files to Touch**:
  - `services/pipeline.js`
  - `services/pipeline-observability.js` if needed
- **Tests / Acceptance Cues**:
  - Ambiguous requests should return `clarification`.
  - Missing tasks should return `not-found`.
  - Delete should not fall through to execution when the result is `clarification`.
- **Guardrails**:
  - Do not move Telegram copy or keyboard construction into the pipeline.

### Subtask T045 - Add regression coverage for mutation routing outcomes
- **Purpose**: Freeze the pipeline contract before bot UI work starts.
- **Steps**:
  1. Add regression tests for exact-match success.
  2. Add regression tests for ambiguity and not-found.
  3. Add regression tests for mixed create+mutation rejection.
  4. Assert that successful mutation writes still call the adapter through `_executeActions()`.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - `tests/pipeline-harness.js` if needed
- **Tests / Acceptance Cues**:
  - Result types should be asserted structurally, not by brittle log text alone.
  - Existing create-path regressions should continue to pass.
- **Guardrails**:
  - Keep coverage close to the existing regression surfaces; do not open a large new test suite here.

## Definition of Done

- The adapter exposes one read helper for active tasks.
- The pipeline can return `task`, `clarification`, and `not-found` for mutation requests.
- Existing execution and rollback paths are reused for successful writes.
- Regression coverage locks exact-match, ambiguity, not-found, and mixed-intent rejection behavior.

## Activity Log

- 2026-04-01: WP regenerated after review-first audit; prior prompt replaced because it invented unsupported infrastructure and wrong service seams.
