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

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature reduces task-maintenance friction while protecting trust: the user can clean up or complete work quickly, but the system must never mutate the wrong task just to appear helpful.

**Implementation must**:
- Resolve exactly one target before any update, completion, or deletion.
- Ask narrow clarification questions when target confidence is low or when pronouns and fuzzy references create ambiguity.
- Keep mutation confirmations terse so the task system remains an execution aid rather than another inbox to read.

**Implementation must not**:
- Any bulk or multi-target mutation is introduced without an accepted spec.
- A delete or complete operation proceeds on fuzzy confidence alone.
- The user is forced into command syntax for clear natural-language maintenance.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission gives the user a low-friction way to correct, complete, reschedule, or delete existing work by language. It exists to reduce task-management overhead, not to encourage endless list grooming. It must fail closed when target identity or intent is uncertain, because confident mutation of the wrong task is worse than asking a short clarification.

### Required Implementer Evidence

The implementer must leave enough evidence for review to answer all of the following without guessing:

1. Which Product Vision clause or behavioral scope section does this WP serve?
2. Which FR, NFR, plan step, task entry, or acceptance criterion does the implementation satisfy?
3. What user-visible behavior changes because of this WP?
4. How does the change reduce procrastination, improve task clarity, improve prioritization, improve recovery/trust, or improve behavioral awareness?
5. What does the implementation deliberately avoid so it does not become a passive task manager, generic reminder app, over-planning assistant, busywork optimizer, or judgmental boss?
6. What automated tests, regression checks, manual transcripts, or static inspections prove the intended behavior?
7. Which later mission or WP depends on this behavior, and what drift would it create downstream if implemented incorrectly?

### Required Reviewer Checks

The reviewer must reject the WP unless all of the following are true:

- The behavior is traceable from Product Vision -> mission spec -> plan/tasks -> WP instructions -> implementation evidence.
- The change preserves the accepted architecture and does not bypass canonical paths defined by earlier missions.
- The user-facing result is concise, concrete, and action-oriented unless the spec explicitly requires reflection or clarification.
- Ambiguity, low confidence, and missing context are handled honestly rather than hidden behind confident output.
- The change does not add MVP-forbidden platform scope such as auth, billing, rate limiting, or multi-tenant isolation.
- Tests or equivalent evidence cover the behavioral contract, not just the happy-path technical operation.
- Any completed-WP edits preserve Spec Kitty frontmatter and event-sourced status history; changed behavior is documented rather than silently rewritten.

### Drift Rejection Triggers

Reject, reopen, or move work back to planned if this WP enables any of the following:

- The assistant helps the user organize more without helping them execute what matters.
- The assistant chooses or mutates tasks confidently when it should clarify, fail closed, or mark inference as weak.
- The assistant rewards low-value busywork, cosmetic cleanup, or motion-as-progress.
- The assistant becomes verbose, punitive, generic, or motivational in a way the Product Vision explicitly rejects.
- The implementation stores raw user/task content where only derived behavioral metadata is allowed.
- The change creates a second implementation path that future agents could use instead of the accepted pipeline.
- The reviewer cannot state why this WP is necessary for the final 001-009 product.

### Done-State And Future Rework Note

If this WP is already marked done, this contract does not rewrite Spec Kitty history. It governs future audits, reopened work, bug fixes, and final mission review. If any later change alters the behavior described here, the WP may be moved back to planned or reopened so the implement-review loop can re-establish product-vision fidelity.

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

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Extend the pipeline for mutation routing: add adapter read seam for active tasks, extend pipeline context, route mutations through resolver, add clarification/not-found result types with terse payloads, add regression coverage.

#### What's Actually Done:
Not started. Regenerated after previous version invented unsupported infrastructure (webhook invalidation, task cache modules, correlation-ID rewrites) and wrong service seams.

#### Gaps Found:
- Not started. Previous scope was significantly oversized — the regeneration correctly narrowed it to: one read helper, context extension, mutation routing, clarification/not-found results, and regressions.
- Depends on WP03 (mutation normalizer).

#### Product Vision Alignment Issues:
- Strongly aligned. The clarification result type enables the system to "ask directly when it is unsure" — exactly what the Product Vision demands for uncertainty handling.
- Not-found result prevents the system from silently ignoring user requests it can't fulfill.
- Keeping Telegram copy out of the pipeline maintains separation of concerns, supporting future adaptability.

#### Recommendations:
- Blocking on WP01-WP03. The regenerated scope is well-disciplined.
