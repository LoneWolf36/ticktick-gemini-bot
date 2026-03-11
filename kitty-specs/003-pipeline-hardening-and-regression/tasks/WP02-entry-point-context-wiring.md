---
work_package_id: WP02
title: Entry-Point Context Wiring
lane: "done"
dependencies:
- WP01
base_branch: 003-pipeline-hardening-and-regression-WP01
base_commit: c90a6dba8b6ef9698fc24fa7c02e3ca6025f7094
created_at: '2026-03-11T19:39:14.294528+00:00'
subtasks:
- T005
- T006
- T007
phase: Phase 2 - Story 1 Context Wiring
assignee: ''
agent: "Codex"
shell_pid: "26852"
review_status: "has_feedback"
reviewed_by: "TickTick Bot"
review_feedback_file: "C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP02.md"
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
  action: Scope tightened to caller wiring so Story 1 regression work can run in parallel in WP04
requirement_refs:
- FR-001
- FR-002
- FR-005
- FR-006
---

# Work Package Prompt: WP02 - Entry-Point Context Wiring

## Objectives and Success Criteria

- Push the canonical request-context contract through every live pipeline entry point.
- Remove direct per-caller timezone defaults from free-form, scan, review, and scheduler-triggered pipeline calls.
- Ensure project-name context is fetched once and reused consistently.

Success looks like:
- Telegram and scheduler entry points pass the same canonical context fields
- request-time timezone resolution comes from stored user context, not ad hoc env fallback logic
- AX and normalization both see the same project list for a request
- caller code becomes thinner because context assembly lives in one shared path

## Context and Constraints

- Implementation command: `spec-kitty implement WP02 --base WP01`
- This package depends on the request-context contract from WP01.
- This package deliberately excludes Story 1 regression coverage so a separate agent can build the direct harness in parallel.
- It should not redesign failure classes or rollback behavior.

Relevant documents:
- `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
- `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
- `kitty-specs/003-pipeline-hardening-and-regression/research.md`
- `kitty-specs/003-pipeline-hardening-and-regression/quickstart.md`

Relevant code:
- `bot/commands.js`
- `services/scheduler.js`
- `server.js`
- `services/pipeline.js`
- `services/ax-intent.js`
- `services/normalizer.js`
- `services/user_context.example.js`

Key story requirements:
- Story 1 requires current date, canonical timezone, and available project names to be present for extraction and normalization.
- The canonical timezone must come from stored user context, not whichever environment fallback is easiest to reach.

## Subtasks and Detailed Guidance

### Subtask T005 - Update Telegram command entry points
- **Purpose**: Remove per-handler timezone drift from Telegram-driven pipeline execution.
- **Steps**:
  1. Inspect the free-form, `/scan`, and `/review` calls to `pipeline.processMessage(...)` in `bot/commands.js`.
  2. Replace direct `process.env.USER_TIMEZONE` fallbacks with canonical context assembly from WP01.
  3. Tag each caller with a stable `entryPoint` value so later observability can distinguish them.
  4. Preserve existing task snapshots for scan/review flows that mutate existing TickTick tasks.
- **Files**:
  - `bot/commands.js`
  - `services/pipeline.js`
- **Parallel**: Yes.
- **Notes**:
  - Keep user-facing bot behavior unchanged unless the new contract requires a compatibility adjustment.
  - Avoid duplicating context construction inside each command handler.

### Subtask T006 - Update scheduler and bootstrap wiring
- **Purpose**: Ensure scheduled processing uses the same canonical context fields as Telegram entry points.
- **Steps**:
  1. Inspect pipeline calls in `services/scheduler.js`.
  2. Remove scheduler-local authority over timezone and treat it as a pipeline input sourced from the canonical contract.
  3. Update any bootstrap or helper wiring in `server.js` that needs to pass execution mode, stored context access, or request metadata into the pipeline layer.
  4. Keep scheduled polling behavior compatible with current batching and quota-avoidance flow.
- **Files**:
  - `services/scheduler.js`
  - `server.js`
  - `services/pipeline.js`
- **Parallel**: Yes.
- **Notes**:
  - Scheduler infrastructure defaults can remain, but request-time canonical timezone resolution should happen through the hardened contract.
  - Do not break current polling, daily briefing, or weekly digest behavior while plumbing context changes.

### Subtask T007 - Unify project lookup and AX-facing project names
- **Purpose**: Make project context deterministic and avoid drift between what AX sees and what normalization resolves.
- **Steps**:
  1. Review how `services/pipeline.js` currently fetches projects and derives default project IDs.
  2. Ensure available project names are fetched once per request and passed to AX in the intended shape.
  3. Ensure the same fetched project objects are passed forward into normalization.
  4. Keep caching behavior inside existing adapter or TickTick layers rather than reintroducing per-caller logic.
- **Files**:
  - `services/pipeline.js`
  - `services/ticktick-adapter.js`
  - `services/ax-intent.js`
  - `services/normalizer.js`
- **Parallel**: No.
- **Notes**:
  - This is about consistency, not aggressive optimization.
  - If project name normalization is needed, keep it explicit and local to the pipeline contract.

## Test Strategy

- Verify by exercising each live entry point against the canonical context helper or direct pipeline mocks.
- Prefer narrow validation of context fields over broad end-to-end behavior in this package.
- Leave Story 1 direct pipeline regressions to WP04.

Verification commands:
- `node tests/run-regression-tests.mjs`
- `node --test tests/regression.test.js`

## Risks and Mitigations

- **Risk**: Telegram and scheduler callers still diverge because one path bypasses the shared context helper.
  - **Mitigation**: Make `pipeline.processMessage(...)` normalize incoming options immediately and keep callers thin.
- **Risk**: Project lists are fetched multiple times or reshaped inconsistently.
  - **Mitigation**: Fetch once per request in the pipeline and reuse that data for both AX and normalization.

## Review Guidance

- Verify `bot/commands.js` no longer owns authoritative timezone resolution for pipeline requests.
- Verify scheduler-triggered processing uses the same context field names as Telegram calls.
- Verify project lookup is performed once per request and reused consistently.
- Verify this package does not re-absorb harness or regression work that now belongs in WP04.

## Review Feedback

**Reviewed by**: TickTick Bot
**Status**: ❌ Changes Requested
**Date**: 2026-03-11
**Feedback file**: `C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP02.md`

**Issue 1**: Dependency check failed. WP02 depends on WP01, but WP01 is not merged to `master` yet (current branch is 2 commits ahead: WP01 + WP02). This review is blocked until WP01 lands on `master`.
**How to fix**: Merge WP01 to `master` first, then rebase/merge WP02 on top of `master` and resubmit for review.
EOF


## Activity Log

- 2026-03-11T17:18:05Z - system - lane=planned - Prompt created.
- 2026-03-11T17:50:00Z - codex - lane=planned - Reframed as pure caller wiring to open a parallel test-harness track.
- 2026-03-11T19:39:31Z – Codex – shell_pid=19636 – lane=doing – Assigned agent via workflow command
- 2026-03-11T19:50:34Z – Codex – shell_pid=19636 – lane=for_review – Ready for review: unified pipeline context wiring + project reuse
- 2026-03-11T19:51:15Z – Codex – shell_pid=26852 – lane=doing – Started review via workflow command
- 2026-03-11T19:52:42Z – Codex – shell_pid=26852 – lane=planned – Moved to planned
- 2026-03-11T20:30:17Z – Codex – shell_pid=26852 – lane=done – Review passed: entry-point wiring verified with shared project/timezone context
