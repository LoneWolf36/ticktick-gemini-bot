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
