---
work_package_id: WP02
title: AX Mutation Intent Extension
dependencies: []
requirement_refs:
- FR-001
- FR-006
- FR-009
base_branch: master
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T021
- T022
- T023
- T024
- T025
phase: Phase 1 - Parallel Foundations
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQT
owned_files:
- kitty-specs/002-natural-language-task-mutations/plan.md
- kitty-specs/002-natural-language-task-mutations/spec.md
- tests/ax-intent.test.js
- tests/regression.test.js
wp_code: WP02
---

# Work Package Prompt: WP02 - AX Mutation Intent Extension

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

- Extend the existing AX extraction path so mutation actions emit `targetQuery` while create actions remain compatible with `001`.
- Make runtime validation distinguish create requirements from mutation requirements instead of requiring a title for every action type.
- Keep the mutation action shape close to the current normalizer and pipeline contracts: `targetQuery` plus top-level change fields.
- Explicitly exclude `reschedule`, extra command aliases, and any broader command surface from this package.

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

- Implementation command: `spec-kitty implement WP02`
- Canonical references:
  - `kitty-specs/002-natural-language-task-mutations/spec.md`
  - `kitty-specs/002-natural-language-task-mutations/plan.md`
  - `services/ax-intent.js`
  - `tests/ax-intent.test.js`
  - `tests/regression.test.js`
- Extend the existing `extractIntents()` flow unless there is a proven compatibility blocker.
- Mutation types in scope are only `update`, `complete`, and `delete`.
- A mutation action may omit `title` when the user is not renaming the task.
- Mixed create+mutation requests should be treated as out-of-scope signals, not silently converted into multiple writes.

## Subtasks & Detailed Guidance

### Subtask T021 - Extend AX instructions so mutation actions emit `targetQuery`
- **Purpose**: Make AX extraction distinguish the lookup key for an existing task from the new task title or title change.
- **Steps**:
  1. Update the instruction block in `services/ax-intent.js`.
  2. Keep the current create-action fields intact.
  3. Add `targetQuery` as a required field for `update`, `complete`, and `delete`.
  4. Keep change fields top-level for mutations so the normalizer can reuse the current action shape.
  5. Document that `title` on an update is the new title, not the lookup key.
- **Files to Touch**:
  - `services/ax-intent.js`
- **Tests / Acceptance Cues**:
  - Rename instructions should carry both `targetQuery` and the new `title`.
  - Complete/delete instructions should validate without a synthetic title.
- **Guardrails**:
  - Do not add nested `payload` objects unless the current top-level contract proves impossible to extend safely.

### Subtask T022 - Split runtime validation rules for create vs mutation actions
- **Purpose**: Remove the current “title required for every action” assumption that blocks free-form mutations.
- **Steps**:
  1. Update runtime validation in `services/ax-intent.js`.
  2. Keep create validation strict: create still requires a title.
  3. Require `targetQuery` for mutation actions.
  4. Keep confidence validation common across all action types.
  5. Preserve existing priority and split-strategy validation where still applicable.
- **Files to Touch**:
  - `services/ax-intent.js`
- **Tests / Acceptance Cues**:
  - Create actions that worked in `001` should still validate.
  - Mutation actions with `targetQuery` and no title should now validate.
  - Mutation actions with neither `targetQuery` nor `taskId` should fail.
- **Guardrails**:
  - Do not weaken create validation to make mutation validation easier.

### Subtask T023 - Add mutation-focused AX examples and rejection cues
- **Purpose**: Reduce extraction drift by giving AX explicit in-scope and out-of-scope examples.
- **Steps**:
  1. Add examples for due-date update, rename, priority update, complete, and delete.
  2. Add an out-of-scope mixed create+mutation example that should come back with low confidence or an unsupported shape.
  3. Add an underspecified pronoun example such as “move that one to Friday” and bias it toward low confidence.
  4. Keep examples terse and repo-relevant.
  5. Avoid examples that introduce `reschedule`, `status`, or `listId`.
- **Files to Touch**:
  - `services/ax-intent.js`
- **Tests / Acceptance Cues**:
  - The examples should make it obvious that `targetQuery` is required for mutations.
  - Out-of-scope examples should not normalize into silent multi-write behavior later.
- **Guardrails**:
  - Do not encode UX copy here; only shape the extracted actions.

### Subtask T024 - Add mutation extraction coverage in `tests/ax-intent.test.js`
- **Purpose**: Lock the expanded AX contract before the pipeline starts depending on it.
- **Steps**:
  1. Add tests covering mutation validation rules.
  2. Add tests covering example-like payloads for rename, due-date update, complete, and delete.
  3. Add tests for underspecified mutation requests and mixed create+mutation requests.
  4. Keep the tests focused on shape and validation rather than external model quality.
- **Files to Touch**:
  - `tests/ax-intent.test.js`
- **Tests / Acceptance Cues**:
  - Create-path tests from `001` should still pass.
  - Mutation validation should fail clearly when `targetQuery` is missing.
- **Guardrails**:
  - Avoid inventing a separate fixture tree unless current tests become unreadable without it.

### Subtask T025 - Preserve backwards compatibility with the current create path and harnesses
- **Purpose**: Ensure this package extends `001` rather than regressing it.
- **Steps**:
  1. Review the existing create-path regression expectations in `tests/regression.test.js`.
  2. Confirm the updated AX contract still fits the current pipeline harness assumptions.
  3. Patch any tests that accidentally depended on the old mutation-title requirement rather than the accepted feature behavior.
  4. Keep the regression surface coherent: one AX service, one extraction method, one action contract.
- **Files to Touch**:
  - `services/ax-intent.js`
  - `tests/ax-intent.test.js`
  - `tests/regression.test.js` if needed
- **Tests / Acceptance Cues**:
  - Existing create scenarios still pass without special-casing.
  - Harness-based update/complete/delete tests remain valid or are adjusted for the new `targetQuery` contract explicitly.
- **Guardrails**:
  - Do not fork create and mutation into unrelated extraction services.

## Definition of Done

- `services/ax-intent.js` emits and validates mutation actions with `targetQuery`.
- Create-path compatibility is preserved.
- No `reschedule` or speculative mutation types appear in code or tests.
- AX tests cover the accepted in-scope mutation scenarios and key rejection cues.

## Activity Log

- 2026-04-01: WP regenerated after review-first audit; prior prompt replaced because it introduced unsupported mutation types and wrong repo paths.

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Extend AX extraction to emit targetQuery for mutation actions (update/complete/delete). Split validation rules for create vs mutation. Add mutation examples. Preserve backward compatibility with create path.

#### What's Actually Done:
WP is in "planned" lane. Regenerated on 2026-04-01 after previous version introduced unsupported mutation types and wrong repo paths. No implementation started.

#### Gaps Found:
- Not started. The previous version had scope creep (unsupported mutation types) which was caught and corrected during the review-first audit.
- The regenerated WP has tight guardrails: only update/complete/delete, no reschedule, no extra command aliases.

#### Product Vision Alignment Issues:
- Aligned. Mutation support via natural language (e.g., "move that to Friday") supports the Product Vision's goal of being a "collaborative" system that understands user intent.
- The explicit exclusion of reschedule and mixed create+mutation shows good discipline — keeping the system honest rather than silently converting ambiguous requests into multiple writes.

#### Recommendations:
- Depends on WP01 (resolver) being implemented first. The targetQuery field needs the resolver to produce actionable results.
- Well-scoped after regeneration. No further changes needed.
