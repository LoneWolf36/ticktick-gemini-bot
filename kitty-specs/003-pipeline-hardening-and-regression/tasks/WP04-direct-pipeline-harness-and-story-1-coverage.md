---
work_package_id: WP04
title: Direct Pipeline Harness and Story 1 Coverage
lane: "doing"
dependencies:
- WP01
subtasks:
- T008
- T018
- T019
phase: Phase 2 - Direct Harness Foundation
assignee: ''
agent: "codex"
shell_pid: "24356"
review_status: "has_feedback"
reviewed_by: "TickTick Bot"
review_feedback_file: "C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP04.md"
history:
- timestamp: '2026-03-11T17:18:05Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
- timestamp: '2026-03-11T17:50:00Z'
  lane: planned
  agent: codex
  shell_pid: ''
  action: Split out direct harness work from later regression closure to maximize parallelism
requirement_refs:
- FR-001
- FR-002
- FR-005
- FR-006
---

# Work Package Prompt: WP04 - Direct Pipeline Harness and Story 1 Coverage

## Objectives and Success Criteria

- Move regression confidence onto the live pipeline architecture early instead of waiting for all hardening work to land.
- Cover Story 1 context behavior plus baseline happy-path outcomes with mocked dependencies.
- Leave behind a reusable direct-pipeline harness that later packages can extend.

Success looks like:
- `createPipeline()` is exercised directly by the regression harness
- Story 1 tests cover relative-date resolution and project-hint resolution through the hardened context path
- baseline happy-path tests cover create, update, complete, delete, and non-task routing
- shared test doubles are reusable by later failure, rollback, and burst-concurrency work

## Context and Constraints

- Implementation command: `spec-kitty implement WP04 --base WP01`
- This package depends only on WP01 and is intentionally front-loaded so it can run in parallel with WP02 and WP03.
- Keep routine regressions mocked and deterministic. Live API checks stay opt-in.
- Keep the pipeline as the unit under test, not a synthetic wrapper around bot commands.

Relevant documents:
- `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
- `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
- `kitty-specs/003-pipeline-hardening-and-regression/quickstart.md`
- `kitty-specs/003-pipeline-hardening-and-regression/data-model.md`

Relevant code and tests:
- `tests/regression.test.js`
- `tests/run-regression-tests.mjs`
- `services/pipeline.js`
- `services/ax-intent.js`
- `services/normalizer.js`
- `services/ticktick-adapter.js`

## Subtasks and Detailed Guidance

### Subtask T008 - Add Story 1 direct regression coverage
- **Purpose**: Prove the context contract fixes relative-date and project-hint behavior through the live pipeline path.
- **Steps**:
  1. Add or update direct pipeline tests for a relative-date message such as `book dentist thursday` using canonical timezone from stored context.
  2. Add tests proving available project names reach AX and normalization resolves the intended project.
  3. Prefer mocked AX and adapter dependencies over live API calls.
  4. Assert contract behavior, not incidental console output.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes.
- **Notes**:
  - Use exact dates or injected `currentDate` where needed so tests stay deterministic.

### Subtask T018 - Refactor the harness around direct `createPipeline()` doubles
- **Purpose**: Make the regression suite prove the live pipeline architecture rather than mostly helper behavior.
- **Steps**:
  1. Identify tests that still primarily validate helper-only or command-only flows.
  2. Introduce reusable direct-pipeline doubles for AX extraction, normalizer, adapter, and optional telemetry sink.
  3. Keep fixtures small enough that a reviewer can understand setup without reading the entire file.
  4. Reuse helpers between `tests/regression.test.js` and `tests/run-regression-tests.mjs` where it improves clarity.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - optionally a shared test helper module
- **Parallel**: No.
- **Notes**:
  - Do not over-abstract the harness.
  - Keep `createPipeline()` as the explicit unit under test.

### Subtask T019 - Add direct happy-path regressions
- **Purpose**: Prove the hardened pipeline still performs the core task operations correctly.
- **Steps**:
  1. Add direct tests for create, update, complete, and delete actions.
  2. Add direct tests for `non-task` routing when no actionable intent exists.
  3. Assert the hardened result envelope, including `type`, actions, execution records or results, confirmation text, and request correlation where relevant.
  4. Keep success assertions focused on contract behavior rather than decorative formatting.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, after T018 sets up the harness.
- **Notes**:
  - Use direct mocks instead of live TickTick behavior.
  - Verify the adapter path remains the path exercised by execution.

## Test Strategy

- Required:
  - direct pipeline regression for relative-date resolution
  - direct pipeline regression for project-hint resolution
  - direct pipeline happy-path coverage for core task actions
- Prefer mocked doubles for:
  - AX extraction output
  - project lists
  - adapter behavior

Verification commands:
- `node tests/run-regression-tests.mjs`
- `node --test tests/regression.test.js`

## Risks and Mitigations

- **Risk**: Harness work drifts back into helper-only testing and fails to improve real pipeline confidence.
  - **Mitigation**: Keep `createPipeline()` as the explicit unit under test and assert canonical context fields in fixtures.
- **Risk**: Shared fixtures become so abstract that later contributors stop understanding what is under test.
  - **Mitigation**: Reuse helpers only where they materially improve clarity.

## Review Guidance

- Verify the regression suite now exercises `createPipeline()` directly.
- Verify Story 1 regressions cover relative-date and project-hint behavior through the canonical request context.
- Verify happy-path coverage uses mocked dependencies and the hardened result envelope.
- Verify this harness is reusable by later failure and rollback packages instead of creating a parallel test path.

## Review Feedback

**Reviewed by**: TickTick Bot
**Status**: ❌ Changes Requested
**Date**: 2026-03-11
**Feedback file**: `C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP04.md`

**Issue 1**: `tests/regression.test.js` and `tests/run-regression-tests.mjs` import `./pipeline-harness.js`, but that file does not exist in this worktree. This will fail with module-not-found. Please add/commit `tests/pipeline-harness.js` (or adjust imports to an existing helper).

**Issue 2**: The WP04 changes are not committed. `git log master..HEAD` only shows `feat(WP01)` and `git status` shows uncommitted edits in `tests/regression.test.js` and `tests/run-regression-tests.mjs`. Please commit the WP04 deliverables as required before review.

**Issue 3**: Dependency check: WP04 depends on WP01, but WP01 is not merged to `master` (the WP01 commit is still in this branch). Please merge WP01 to master or rebase WP04 on the merged WP01 before resubmitting for review.


## Activity Log

- 2026-03-11T17:18:05Z - system - lane=planned - Prompt created.
- 2026-03-11T17:50:00Z - codex - lane=planned - Reframed as early direct-harness work to open a third parallel implementation track.
- 2026-03-11T19:39:35Z – codex – shell_pid=18888 – lane=doing – Started implementation via workflow command
- 2026-03-11T19:51:46Z – codex – shell_pid=18888 – lane=planned – Moved to planned
- 2026-03-11T19:53:16Z – codex – shell_pid=24356 – lane=doing – Started implementation via workflow command
