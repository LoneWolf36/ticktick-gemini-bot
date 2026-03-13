---
work_package_id: WP06
title: Scheduler Integration and Delivery Parity
lane: "doing"
dependencies:
- WP02
- WP03
- WP04
base_branch: 006-briefing-weekly-modernization-WP03
base_commit: 834edfe28644dfee289147dd3f319cb0f9ce77d0
created_at: '2026-03-13T17:57:05.361650+00:00'
subtasks:
- T027
- T028
- T029
- T030
- T031
phase: Phase 3 - Surface Adapters
assignee: ''
agent: "codex"
shell_pid: "25084"
review_status: "has_feedback"
reviewed_by: "TickTick Bot"
review_feedback_file: "C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP06.md"
history:
- timestamp: '2026-03-12T21:27:55Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-003
- FR-006
- FR-007
---

# Work Package Prompt: WP06 - Scheduler Integration and Delivery Parity

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task.**

- **Has review feedback?** Check the `review_status` field above. If it says `has_feedback`, read the Review Feedback section immediately.
- **You must address all feedback** before the work is complete.
- **Mark as acknowledged** when you begin addressing review feedback.
- **Report progress** by appending Activity Log entries in chronological order.

---

## Review Feedback

**Reviewed by**: TickTick Bot
**Status**: ❌ Changes Requested
**Date**: 2026-03-13
**Feedback file**: `C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP06.md`

**Issue 1**: The scheduled weekly path does not pass explicit history availability into the shared weekly summary surface. In `services/scheduler.js`, `runWeeklyDigestJob()` computes `processed` and `thisWeek`, but calls `gemini.generateWeeklyDigestSummary(tasks, thisWeek, { entryPoint: 'scheduler', userId: chatId, urgentMode })` without `historyAvailable`. In `services/gemini.js`, `generateWeeklyDigestSummary()` then defaults `historyAvailable` to `true` via `options.historyAvailable !== false`, so the shared weekly composer never knows when processed-task history is actually missing. That breaks WP06 subtask T028 step 4 and the spec requirement that sparse-history handling stay inside the shared weekly summary surface.

How to fix:
- In `services/scheduler.js`, compute `historyAvailable` explicitly from the processed-task store state and pass it through to `generateWeeklyDigestSummary(...)`.
- Keep the fallback behavior inside the shared weekly surface; do not patch it in the scheduler wrapper.
- Add or extend a scheduler regression that covers the no-history case and asserts the shared weekly surface receives `historyAvailable: false`.


## Markdown Formatting

Wrap HTML/XML tags in backticks: `` `<div>` ``, `` `<script>` ``  
Use language identifiers in fenced code blocks.

---

## Objectives & Success Criteria

- Move scheduled daily and weekly sends onto the same shared summary surface used by manual commands.
- Preserve scheduler-only delivery wrappers and operational guardrails such as quota skips, auth checks, and stats updates.
- Keep pending-review reminder behavior outside the shared summary contract.
- Add parity coverage so scheduled surfaces can be reviewed against manual behavior with the same input snapshots.

## Context & Constraints

- Implementation command: after WP02, WP03, and WP04 are merged into the shared baseline, run `spec-kitty implement WP06 --base WP04`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `kitty-specs/006-briefing-weekly-modernization/quickstart.md`
  - `.kittify/memory/constitution.md`
- This package is scheduler-only. Do not refactor manual command handlers here.
- Do not touch task-polling behavior except where shared logging helpers are genuinely needed.
- Scheduler wrappers should stay thin and delivery-focused; summary composition remains owned by the shared summary surface.

## Subtasks & Detailed Guidance

### Subtask T027 - Replace scheduled daily execution in `services/scheduler.js`
- **Purpose**: Move the scheduled daily briefing path to the shared summary surface without losing operational safeguards.
- **Steps**:
  1. Find the scheduled daily briefing block in `services/scheduler.js`.
  2. Preserve current TickTick auth and Gemini quota short-circuit behavior.
  3. Replace direct `gemini.generateDailyBriefing(...)` usage with the shared daily summary-surface entry point.
  4. Pass scheduler context including `entryPoint`, `userId`, timezone, urgent mode, and fetched tasks.
  5. Continue sending the final formatted output through `sendWithMarkdown`.
  6. Preserve stats updates after successful send.
- **Files**:
  - `services/scheduler.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - Keep scheduler log lines recognizable so operators can still trace scheduled sends.
  - Do not accidentally route scheduled sends through command-layer helpers.

### Subtask T028 - Replace scheduled weekly execution in `services/scheduler.js`
- **Purpose**: Move the scheduled weekly digest path to the shared weekly surface while keeping current data-loading semantics.
- **Steps**:
  1. Find the scheduled weekly digest block in `services/scheduler.js`.
  2. Continue loading processed-task history through `store.getProcessedTasks()` plus `filterProcessedThisWeek`.
  3. Replace direct `gemini.generateWeeklyDigest(...)` usage with the shared weekly summary-surface entry point.
  4. Pass explicit history availability metadata and scheduler context.
  5. Preserve stats updates after successful send.
- **Files**:
  - `services/scheduler.js`
  - `services/summary-surfaces/index.js`
  - `bot/utils.js`
- **Parallel?**: No.
- **Notes**:
  - Keep missing-history handling inside the shared weekly summary surface, not in the scheduler wrapper.
  - Preserve current weekly send cadence and logging behavior.

### Subtask T029 - Keep the pending-review reminder as a scheduler-only post-format delivery wrapper
- **Purpose**: Preserve the one scheduler-specific daily reminder without polluting the shared summary contract used for parity.
- **Steps**:
  1. Identify the current pending-review reminder behavior in the scheduled daily path.
  2. Keep this reminder outside the shared summary composition and formatting contract.
  3. Apply the reminder only after the shared formatted text is produced.
  4. Make the boundary explicit in code so reviewers can see that summary parity excludes this wrapper.
- **Files**:
  - `services/scheduler.js`
  - `services/summary-surfaces/index.js` only if a small adapter return shape needs to expose the final message body cleanly
- **Parallel?**: No.
- **Notes**:
  - This is the main allowed scheduler-only divergence from manual output in `006`.
  - Do not move the reminder into `SummaryNotice`; it is delivery-only behavior.

### Subtask T030 - Preserve quota skip, auth safety, and delivery-failure behavior while removing legacy string-only path dependence
- **Purpose**: Keep scheduled sends operationally safe during the migration.
- **Steps**:
  1. Preserve auth checks, quota short-circuits, and existing log/error behavior around scheduled daily and weekly sends.
  2. Keep send failures visible through `console.error` or the shared diagnostics path selected later.
  3. Remove any remaining scheduler-only dependence on direct legacy daily or weekly plain-text methods.
  4. Avoid touching poll, auto-apply, or maintenance jobs except where imports need minimal adjustment.
- **Files**:
  - `services/scheduler.js`
  - `services/gemini.js` only if compatibility wrappers must be retired or narrowed
- **Parallel?**: No.
- **Notes**:
  - Scope is daily and weekly scheduled sends only.
  - Reviewers should see a focused scheduler diff, not broad unrelated job edits.

### Subtask T031 - Add scheduler-focused parity coverage for the shared summary surface
- **Purpose**: Make scheduled output reviewable against manual output and protect the scheduler-only wrapper boundary.
- **Steps**:
  1. Add scheduler regression coverage that mocks the shared summary surface and delivery API.
  2. Assert scheduled daily and weekly jobs call the same shared summary surface as manual commands.
  3. Assert the pending-review reminder remains outside the shared summary contract.
  4. Assert quota skip and auth checks still short-circuit before summary generation when appropriate.
  5. Keep parity assertions scoped to the shared summary stage plus the explicit scheduler-only wrapper difference.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - `services/scheduler.js`
- **Parallel?**: No.
- **Notes**:
  - These tests should not duplicate the command-handler details already covered in WP05.
  - The parity target is summary composition and formatting, not identical delivery wrapper text.

## Test Strategy

- Required commands:
  - `node tests/run-regression-tests.mjs`
  - `node --test tests/regression.test.js`
- Mandatory coverage:
  - scheduled daily uses shared summary surface
  - scheduled weekly uses shared summary surface
  - pending-review reminder stays outside the shared contract
  - scheduler quota and auth behavior remain intact

## Risks & Mitigations

- **Risk**: Scheduler output diverges subtly from manual output during migration.
  - **Mitigation**: Keep scheduler wrappers thin and add explicit parity checks at the shared summary stage.
- **Risk**: Pending-review reminder bleeds into the shared summary contract.
  - **Mitigation**: Keep it as a post-format wrapper and assert that boundary in tests.
- **Risk**: Scheduler refactor spills into polling or maintenance jobs.
  - **Mitigation**: Limit changes to the scheduled daily and weekly blocks plus minimal import adjustments.

## Review Guidance

- Confirm scheduled daily and weekly jobs use the shared summary surface rather than direct legacy Gemini string methods.
- Confirm pending-review reminder logic remains scheduler-only and outside the summary contract.
- Confirm quota, auth, and stats-update behavior remain intact.
- Confirm scheduler regressions cover parity and wrapper boundaries without re-testing unrelated polling behavior.

## Activity Log

- 2026-03-12T21:27:55Z - system - lane=planned - Prompt generated.

---

### Updating Lane Status

Use `spec-kitty agent tasks move-task <WPID> --to <lane> --note "message"` or edit the frontmatter plus append a new activity log entry.

**Valid lanes**: `planned`, `doing`, `for_review`, `done`
- 2026-03-13T17:57:07Z – codex – shell_pid=28528 – lane=doing – Assigned agent via workflow command
- 2026-03-13T18:07:55Z – codex – shell_pid=28528 – lane=for_review – Ready for review: scheduled daily and weekly jobs now use shared summary surfaces with scheduler-only wrappers preserved and regression coverage added
- 2026-03-13T18:08:15Z – Codex – shell_pid=17184 – lane=doing – Started review via workflow command
- 2026-03-13T18:09:25Z – Codex – shell_pid=17184 – lane=planned – Moved to planned
- 2026-03-13T18:12:49Z – codex – shell_pid=25084 – lane=doing – Started implementation via workflow command
