---
work_package_id: WP03
title: Failure Classification, Quota Semantics, and Story 2 User Messaging
lane: "for_review"
dependencies:
- WP01
base_branch: 003-pipeline-hardening-and-regression-WP01
base_commit: c90a6dba8b6ef9698fc24fa7c02e3ca6025f7094
created_at: '2026-03-11T19:39:14.309884+00:00'
subtasks:
- T009
- T010
- T011
phase: Phase 3 - Failure Semantics
assignee: ''
agent: "codex"
shell_pid: "16852"
review_status: "has_feedback"
reviewed_by: "TickTick Bot"
review_feedback_file: "C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP03.md"
history:
- timestamp: '2026-03-11T17:18:05Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-003
- FR-004
- FR-007
- FR-010
---

# Work Package Prompt: WP03 - Failure Classification, Quota Semantics, and Story 2 User Messaging

## Objectives and Success Criteria

- Classify pipeline failures explicitly instead of routing everything through a generic catch path.
- Preserve request context through configured-key rotation before surfacing quota failure.
- Render failures deterministically with dev-detailed diagnostics and compact user-facing messaging.

Success looks like:
- stable failure classes such as `quota`, `malformed_ax`, `validation`, `adapter`, `rollback`, and `unexpected`
- quota handling rotates to another configured key before the pipeline gives up
- user mode gets short failure-class messaging
- development mode retains enough detail to debug the failing stage
- the result envelope is stable enough that a separate regression package can lock it down without chasing formatting drift

## Context and Constraints

- Implementation command: `spec-kitty implement WP03 --base WP01`
- This package depends on the canonical context foundation from WP01.
- Story 2 behavior must remain non-destructive. Malformed or empty AX output should not throw unhandled exceptions or create partial success illusions.
- Existing quota logic is split between `services/ax-intent.js`, `services/gemini.js`, and current caller behavior. This package should unify semantics rather than adding yet another parallel path.

Relevant documents:
- `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
- `kitty-specs/003-pipeline-hardening-and-regression/research.md`
- `kitty-specs/003-pipeline-hardening-and-regression/data-model.md`
- `kitty-specs/003-pipeline-hardening-and-regression/contracts/pipeline.openapi.yaml`

Relevant code:
- `services/pipeline.js`
- `services/ax-intent.js`
- `services/gemini.js`
- `bot/commands.js`
- `services/scheduler.js`

Design constraints:
- Keep the Gemini key manager as the current rotation authority where possible.
- Do not conflate empty intent extraction with user-facing non-task routing unless the behavior is intentionally specified.
- Preserve request IDs and caller metadata while failures move across stages.

## Subtasks and Detailed Guidance

### Subtask T009 - Introduce explicit pipeline failure classes
- **Purpose**: Replace the current broad error behavior with a result envelope that names what failed and where.
- **Steps**:
  1. Review how `services/pipeline.js` currently returns `task`, `non-task`, and `error`.
  2. Add or refine a structured failure object aligned with `data-model.md` and `contracts/pipeline.openapi.yaml`.
  3. Distinguish at least:
     - malformed AX output
     - empty intent list
     - validation failure
     - adapter failure
     - unexpected exception
  4. Make sure non-task routing and true error routing remain clearly separate.
- **Files**:
  - `services/pipeline.js`
  - optionally a new helper for failure rendering or classification
- **Parallel**: No.
- **Notes**:
  - Empty intent lists may still resolve to `non-task`, but the internal reason should remain inspectable.
  - Favor a small, stable taxonomy over overly granular one-off categories.

### Subtask T010 - Implement configured-key rotation before quota failure
- **Purpose**: Ensure the active Gemini key is not the only recovery attempt when quota is hit.
- **Steps**:
  1. Inspect quota and invalid-key handling in `services/ax-intent.js` and `services/gemini.js`.
  2. Keep the configured-key rotation behavior authoritative in the existing key manager path.
  3. Ensure `services/pipeline.js` receives a classified `quota` outcome only after no configured key can satisfy the request.
  4. Preserve the original request context and avoid dropping the user message or request ID during retries.
- **Files**:
  - `services/ax-intent.js`
  - `services/gemini.js`
  - `services/pipeline.js`
- **Parallel**: Yes, after T009 defines the failure envelope.
- **Notes**:
  - Invalid-key handling and daily quota handling are related but not identical; do not blur them if the current code already treats them differently.
  - Keep request retry count bounded and observable.

### Subtask T011 - Add mode-aware failure message rendering
- **Purpose**: Honor the clarified requirement that development mode can be detailed while end-user mode stays compact.
- **Steps**:
  1. Decide where failure text is rendered so callers do not all invent their own wording.
  2. Render compact user-facing text by failure class for user mode.
  3. Render more diagnostic text in development mode, including failing stage or missing contract details when helpful.
  4. Keep confirmation and failure text deterministic enough for regression assertions.
- **Files**:
  - `services/pipeline.js`
  - potentially `bot/commands.js` if caller behavior must be simplified
- **Parallel**: Yes, after T009 makes failure classes explicit.
- **Notes**:
  - Avoid dumping raw stack traces into user mode.
  - If callers still append `result.errors`, ensure that behavior is compatible with the new message model or remove the duplication.

## Test Strategy

- Keep implementation deterministic enough for WP06 to add:
  - malformed AX regressions
  - empty or missing intent regressions
  - validation failure regressions
  - configured-key rotation regressions
- Preferred local verification during this package:
  - targeted unit or direct pipeline checks near the touched modules if needed
  - request/response spot checks in development mode for message-shape consistency

Verification commands:
- `node tests/run-regression-tests.mjs`
- `node --test tests/regression.test.js`

## Risks and Mitigations

- **Risk**: Failure classification is implemented in both the pipeline and callers.
  - **Mitigation**: Centralize classification and keep callers focused on displaying the returned result.
- **Risk**: Quota rotation leaks implementation details into tests.
  - **Mitigation**: Mock the rotation outcome explicitly and assert externally visible contract behavior.
- **Risk**: Compact user messaging becomes too generic to be useful.
  - **Mitigation**: Tie messages to failure class, not raw exception text.

## Review Guidance

- Verify each major failure mode maps to an explicit class.
- Verify the pipeline does not report quota failure until all configured keys are exhausted for that request.
- Verify user mode and dev mode message shapes differ intentionally and safely.
- Verify the returned failure envelope is stable enough for downstream regression packages to assert without reinterpreting caller-local strings.

## Review Feedback

**Reviewed by**: TickTick Bot
**Status**: ❌ Changes Requested
**Date**: 2026-03-11
**Feedback file**: `C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP03.md`

**Issue 1**: Dev-mode failure diagnostics omit validation and adapter details, so callers cannot surface actionable info.

In `services/pipeline.js`, `buildFailureResult` only includes `details.diagnostics` and the summary/error message. For validation failures you populate `details.validationErrors`, and for adapter failures you populate `details.failures`, but those never make it into `errors`/`diagnostics`. The bot `formatPipelineFailure` only displays `result.diagnostics`, so dev-mode output loses the precise validation reasons and adapter failure messages. This violates the requirement that dev mode retains enough detail to debug the failing stage.

**Fix**: Populate `diagnostics` with a deterministic rendering of `details.validationErrors` and `details.failures` (or update `formatPipelineFailure` to include `result.failure.details`). Keep user mode compact. Also consider including the failure `stage`/`class` in dev diagnostics for clarity.


## Activity Log

- 2026-03-11T17:18:05Z - system - lane=planned - Prompt created.
- 2026-03-11T17:50:00Z - codex - lane=planned - Restructured to keep Story 2 regression closure in WP06 and improve parallel execution.
- 2026-03-11T19:39:15Z – codex – shell_pid=28820 – lane=doing – Assigned agent via workflow command
- 2026-03-11T19:50:06Z – codex – shell_pid=28820 – lane=for_review – Ready for review: added failure classes, quota rotation, and mode-aware messaging
- 2026-03-11T19:50:55Z – codex – shell_pid=21012 – lane=doing – Started review via workflow command
- 2026-03-11T19:52:41Z – codex – shell_pid=21012 – lane=planned – Moved to planned
- 2026-03-11T20:07:56Z – codex – shell_pid=16852 – lane=doing – Started implementation via workflow command
- 2026-03-11T20:08:44Z – codex – shell_pid=16852 – lane=for_review – Ready for review: added dev-mode validation/adapter diagnostics
