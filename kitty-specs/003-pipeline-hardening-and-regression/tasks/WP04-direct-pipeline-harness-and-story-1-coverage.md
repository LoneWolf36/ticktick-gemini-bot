---
work_package_id: WP04
title: Direct Pipeline Harness and Story 1 Coverage
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
- FR-005
- FR-006
base_branch: 003-pipeline-hardening-and-regression-WP04-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T008
- T018
- T019
phase: Phase 2 - Direct Harness Foundation
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQV
owned_files:
- kitty-specs/003-pipeline-hardening-and-regression/plan.md
- kitty-specs/003-pipeline-hardening-and-regression/spec.md
- tests/pipeline-harness.js
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP04
agent: "reconciliation-audit"
shell_pid: "audit-2026-04-15"
---

# Work Package Prompt: WP04 - Direct Pipeline Harness and Story 1 Coverage

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

- Move regression confidence onto the live pipeline architecture early instead of proving mostly helper behavior.
- Cover Story 1 context behavior plus baseline happy-path pipeline outcomes with mocked dependencies.
- Leave behind a reusable direct-pipeline harness that later failure and rollback packages can extend.
- Keep direct pipeline tests concentrated in the current repository test surfaces.

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature makes the behavioral assistant dependable under failure. If the pipeline breaks, the user loses trust and returns to manual over-planning, so failures must be compact, honest, logged, and non-destructive.

**Implementation must**:
- Handle malformed model output, quota exhaustion, adapter failure, and partial multi-action failures without losing context or silently corrupting tasks.
- Keep user-facing failures compact while preserving enough developer diagnostics to fix root causes.
- Test the live architecture directly, especially paths that affect user trust: create, mutate, clarify, fail closed, and roll back.

**Implementation must not**:
- The pipeline returns misleading success after partial failure.
- Diagnostics leak into user-facing Telegram copy.
- Regression tests mainly exercise dead legacy helpers instead of the structured path.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission protects trust when model calls, TickTick calls, parsing, context, or downstream services fail. The product vision requires correctness over confidence. This mission must make failures honest, recoverable, and cognitively light instead of hiding uncertainty or leaving the user with a broken invisible workflow.

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

- Implementation command: `spec-kitty implement WP04 --base WP01`
- Canonical references:
  - `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
  - `tests/pipeline-harness.js`
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - `services/pipeline.js`
  - `services/pipeline-context.js`
- Keep required coverage mocked and deterministic.
- Keep `createPipeline()` as the unit under test, not Telegram command handlers.
- Reuse or refine `tests/pipeline-harness.js` instead of creating a second harness stack.

## Subtasks & Detailed Guidance

### Subtask T008 - Add Story 1 direct regression coverage
- **Purpose**: Prove the canonical context fixes relative-date and project-hint behavior through the live pipeline path.
- **Steps**:
  1. Add or update direct pipeline regressions for relative-date resolution using injected deterministic dates and timezone.
  2. Add regressions that prove available project names reach AX and normalization resolves the intended project.
  3. Prefer mocked AX and adapter doubles over live API calls.
  4. Assert contract behavior rather than incidental console output.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - `tests/pipeline-harness.js` if harness helpers need extension
- **Tests / Acceptance Cues**:
  - Story 1 context behavior is covered directly through `createPipeline()`.
  - Relative-date assertions remain deterministic.
- **Guardrails**:
  - Do not fall back to legacy helper-only testing.

### Subtask T018 - Refactor the harness around direct `createPipeline()` doubles
- **Purpose**: Make the regression suite prove the live architecture directly.
- **Steps**:
  1. Identify fixture setup that still obscures the real pipeline unit under test.
  2. Keep direct doubles for AX extraction, normalizer, adapter, and optional observability sink small and explicit.
  3. Reuse helpers between `tests/regression.test.js` and `tests/run-regression-tests.mjs` only where it improves clarity.
  4. Keep the harness understandable without reading unrelated bot code.
- **Files to Touch**:
  - `tests/pipeline-harness.js`
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Tests / Acceptance Cues**:
  - `createPipeline()` is plainly the unit under test.
  - The harness is reusable by later failure and rollback packages.
- **Guardrails**:
  - Do not over-abstract the test harness.

### Subtask T019 - Add direct happy-path regressions
- **Purpose**: Prove the hardened pipeline still performs the core task operations correctly.
- **Steps**:
  1. Add direct tests for create, update, complete, and delete actions.
  2. Add direct tests for `non-task` routing when no actionable intent exists.
  3. Assert the hardened result envelope and adapter interaction shape where relevant.
  4. Keep success assertions focused on contract behavior rather than decorative formatting.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Tests / Acceptance Cues**:
  - Direct pipeline happy paths are covered for the core action types plus non-task routing.
  - The adapter path remains the execution path under test.
- **Guardrails**:
  - Do not shift this package into caller-specific UI behavior.

## Definition of Done

- Story 1 context behavior is covered directly through the pipeline.
- `tests/pipeline-harness.js` is the reusable direct-pipeline harness surface.
- Direct happy-path pipeline regressions cover create, update, complete, delete, and non-task.
- The required test confidence now sits on the live architecture rather than mostly helper behavior.

## Activity Log

- 2026-04-01: WP regenerated after audit; prior prompt replaced because it still carried obsolete lane history instead of the current review-oriented prompt structure.

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Direct pipeline harness with mocked doubles, Story 1 context coverage (relative dates, project hints), happy-path regressions for create/update/complete/delete/non-task.

#### What's Actually Done:
Not started. Depends on WP01.

#### Gaps Found:
- Not started. Well-scoped testing WP — focuses on the live architecture, not just helpers.

#### Product Vision Alignment Issues:
- Aligned. Testing the actual pipeline (not just helpers) ensures the system that users interact with is the one being validated — preventing the gap between "impressive demos and production disasters."

#### Recommendations:
- Blocking on WP01. Good testing discipline.
