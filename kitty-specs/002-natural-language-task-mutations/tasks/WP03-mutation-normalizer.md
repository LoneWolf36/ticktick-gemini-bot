---
work_package_id: WP03
title: Mutation Normalizer
dependencies:
- WP01
- WP02
requirement_refs:
- FR-001
- FR-005
- FR-009
base_branch: 002-natural-language-task-mutations-WP03-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T031
- T032
- T033
- T034
phase: Phase 2 - Mutation Contracts
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQT
owned_files:
- kitty-specs/002-natural-language-task-mutations/plan.md
- kitty-specs/002-natural-language-task-mutations/spec.md
- tests/normalizer.test.js
wp_code: WP03
---

# Work Package Prompt: WP03 - Mutation Normalizer

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

- Extend the existing normalizer so resolved mutation intents become valid adapter write actions with the minimum new code surface.
- Require resolved task context before any update, complete, or delete action can become executable.
- Preserve existing content on updates by default, staying aligned with the current adapter merge semantics from `001`.
- Reject unsupported mutation shapes early so later pipeline packages do not need to guess at policy.

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

- Implementation command: `spec-kitty implement WP03 --base WP01`
- Canonical references:
  - `kitty-specs/002-natural-language-task-mutations/spec.md`
  - `kitty-specs/002-natural-language-task-mutations/plan.md`
  - `services/normalizer.js`
  - `services/ticktick-adapter.js`
  - `tests/normalizer.test.js`
- Do not create `services/mutation-normalizer.js`.
- The normalizer remains the safety gate between AX output and adapter writes.
- Content-preservation behavior must match the current adapter contract rather than inventing a second merge policy.
- Mixed create+mutation and multiple mutation actions remain out of scope and should be rejected cleanly.

## Subtasks & Detailed Guidance

### Subtask T031 - Extend `services/normalizer.js` for resolved mutation actions
- **Purpose**: Reuse the current normalizer surface instead of creating a parallel mutation stack.
- **Steps**:
  1. Review how `normalizeAction()` and `normalizeActions()` currently shape create and mutation-like actions.
  2. Extend the normalized action contract so resolved mutation intents can carry `taskId`, `originalProjectId`, and any required existing-task context cleanly.
  3. Keep create-path behavior intact.
  4. Keep the output shape directly compatible with `TickTickAdapter.updateTask()`, `completeTask()`, and `deleteTask()`.
- **Files to Touch**:
  - `services/normalizer.js`
- **Tests / Acceptance Cues**:
  - Resolved update intents should normalize into executable update actions.
  - Resolved complete/delete intents should validate only when task context is present.
- **Guardrails**:
  - Do not create a second top-level normalize function just for mutations.

### Subtask T032 - Require resolved task context before mutation writes become valid
- **Purpose**: Enforce the “one safe resolved target” rule at the normalizer layer, not only in the bot.
- **Steps**:
  1. Update validation rules so update/complete/delete actions require a resolved `taskId`.
  2. Ensure project context is available for actions that need it downstream.
  3. Keep validation errors machine-readable enough for pipeline diagnostics.
  4. Preserve the current create-path required fields and confidence handling.
- **Files to Touch**:
  - `services/normalizer.js`
- **Tests / Acceptance Cues**:
  - Mutation actions without resolved task context should fail validation.
  - Mutation actions populated by the resolver should pass validation without hacks.
- **Guardrails**:
  - Do not let the normalizer silently invent a task ID or project.

### Subtask T033 - Preserve existing content on update and reject unsupported mutation shapes
- **Purpose**: Keep `FR-005` and the out-of-scope boundaries encoded in one place.
- **Steps**:
  1. Review current content merge behavior in `services/normalizer.js` and `services/ticktick-adapter.js`.
  2. Ensure update actions preserve existing task content unless the user explicitly requests replacement.
  3. Reject unsupported mixed create+mutation or multiple mutation-action batches.
  4. Reject unresolved pronoun-only mutation inputs once they reach this layer without a chosen task.
- **Files to Touch**:
  - `services/normalizer.js`
- **Tests / Acceptance Cues**:
  - Rename-only updates should not wipe content.
  - Due-date or priority updates should keep existing content untouched.
  - Unsupported mixed-action requests should fail validation with a clear reason.
- **Guardrails**:
  - Do not add a new “reschedule” type to solve due-date updates; they are just `update`.

### Subtask T034 - Add normalizer regression coverage for mutation behavior
- **Purpose**: Freeze mutation safety rules before pipeline integration begins.
- **Steps**:
  1. Add tests for resolved update, complete, and delete actions.
  2. Add tests for content-preserving updates.
  3. Add tests for missing task context and unsupported mixed requests.
  4. Keep the tests close to the current style in `tests/normalizer.test.js`.
- **Files to Touch**:
  - `tests/normalizer.test.js`
- **Tests / Acceptance Cues**:
  - Existing create-path assertions should still pass.
  - Mutation validation failures should be asserted by code and message/reason, not only by boolean state.
- **Guardrails**:
  - Avoid moving all mutation regression into a new test file unless the existing one becomes unreadable.

## Definition of Done

- The existing normalizer supports resolved mutation intents without a second mutation stack.
- Mutation writes require resolved task context.
- Content preservation matches current adapter semantics.
- `tests/normalizer.test.js` covers the accepted mutation behaviors and rejection paths.

## Activity Log

- 2026-04-01: WP regenerated after review-first audit; prior prompt replaced because it introduced a second mutation normalizer stack and oversized scope.

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Extend the existing normalizer (not create a second one) to handle resolved mutation actions. Require resolved task context before mutation writes. Preserve content on updates. Reject unsupported shapes.

#### What's Actually Done:
Not started. Regenerated after previous version introduced a parallel mutation normalizer stack, which was caught and corrected.

#### Gaps Found:
- Not started. Previous scope error (second normalizer) was corrected — good catch by the review process.
- Depends on WP01 (resolver) and WP02 (AX mutation intent).

#### Product Vision Alignment Issues:
- Aligned. Content preservation on updates (FR-005) directly supports "Wrong tasks are worse than fewer tasks" — never silently destroying user data.
- Rejecting unsupported shapes (mixed create+mutation) prevents the system from "pretending certainty" about ambiguous requests.

#### Recommendations:
- Blocking on WP01 and WP02. Well-scoped after regeneration.
