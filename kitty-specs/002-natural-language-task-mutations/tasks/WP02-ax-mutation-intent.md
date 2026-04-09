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
