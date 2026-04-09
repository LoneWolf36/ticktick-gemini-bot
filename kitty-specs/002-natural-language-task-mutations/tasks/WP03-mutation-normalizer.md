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
