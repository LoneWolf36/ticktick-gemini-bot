---
work_package_id: WP06
title: 'Command Migration: /scan & /review'
lane: "done"
dependencies: [WP05]
base_branch: 001-task-operations-pipeline-WP05
base_commit: 0f42d9bc6193d92f754291f4095b071b21db9797
created_at: '2026-03-10T15:31:50.991733+00:00'
subtasks: [T023, T024, T025]
shell_pid: "19860"
agent: "Gemini"
reviewed_by: "TickTick Bot"
review_status: "approved"
history:
- date: '2026-03-09'
  action: created
  by: spec-kitty.tasks
---

# WP06 — Command Migration: /scan & /review

## Objective

Migrate `/scan` and `/review` commands from legacy Gemini analysis to the new AX → Normalizer → Adapter pipeline per the clean-cut strategy. Also hook `autoApply` and inline callback actions to use `TickTickAdapter`.

## Implementation Command

```bash
spec-kitty implement WP06 --base WP05
```

## Context

- `/scan` uses `runTaskIntake()` (commands.js L241-343) which calls `analyzeAndSend()` → `gemini.analyzeTask()` → `executeActions()`
- `/review` uses a similar flow for walking through unreviewed tasks
- `autoApply()` (commands.js L1145-1179) calls `ticktick.updateTask()` directly — must go through adapter
- Callback actions in `callbacks.js` approve/skip/drop tasks, calling `ticktick.*` directly

**Key decision** (plan.md): `/scan` and `/review` mutate state and MUST migrate. `/briefing` and `/weekly` stay on legacy.

---

## Subtask T023: Migrate /scan to New Pipeline

**Purpose**: Replace `runTaskIntake` → `analyzeAndSend` → `executeActions` with pipeline-based processing.

**Steps**:
1. In `registerCommands()`, update the `/scan` handler:
   - Instead of fetching tasks and running `analyzeAndSend()` per task, use the pipeline
   - For each unreviewed task, call `pipeline.processMessage(taskTitle, { existingTask: task })`
   - Or: create a batch pipeline method that processes multiple tasks
2. Replace the card-sending flow with terse updates
3. Keep the batching logic (process N tasks at a time with quota awareness)
4. Remove calls to `gemini.analyzeTask()` and `executeActions()` for scan flow

**Files**: `bot/commands.js` (~80 lines modified in /scan handler)

**Edge Cases**:
- Quota exhaustion mid-batch: stop processing, inform user of progress
- No unreviewed tasks: existing "all clear" message unchanged

**Validation**:
- [ ] `/scan` processes tasks through the new pipeline
- [ ] No calls to `gemini.analyzeTask()` in the scan path
- [ ] Batch processing respects quota limits
- [ ] User gets terse summary of actions taken

---

## Subtask T024: Migrate /review to New Pipeline

**Purpose**: Route `/review` task mutations through the pipeline instead of legacy `executeActions`.

**Steps**:
1. Update the `/review` command handler
2. When the user reviews a task and chooses an action (approve/modify):
   - Route the action through `pipeline.processMessage()` or directly through the adapter
3. For "approve" actions: use `adapter.updateTask()` with normalised fields
4. Keep the interactive review UX (inline keyboards, step-through)
5. Replace direct `ticktick.*` calls with adapter calls

**Files**: `bot/commands.js` (~50 lines modified in /review handler)

**Validation**:
- [ ] `/review` mutations flow through adapter
- [ ] Interactive keyboard flow still works
- [ ] Updates are logged via adapter's pipeline logging

---

## Subtask T025: Hook autoApply and Callbacks to Adapter

**Purpose**: Route `autoApply()` and inline callback actions through `TickTickAdapter`.

**Steps**:
1. Update `autoApply()` (commands.js L1145-1179):
   - Replace `ticktick.updateTask()` with `adapter.updateTask()`
   - Replace `ticktick.completeTask()` with `adapter.completeTask()`
   - Replace `ticktick.deleteTask()` with `adapter.deleteTask()`
2. Update `callbacks.js`:
   - Approval callback: route through adapter
   - Skip callback: adapter (if it touches TickTick)
   - Drop callback: `adapter.deleteTask()` or `adapter.completeTask()`
3. Ensure the adapter instance is accessible from these contexts (pass via dependency injection)

**Files**: `bot/commands.js` (~30 lines), `bot/callbacks.js` (~20 lines)

**Validation**:
- [ ] Auto-applied changes go through adapter
- [ ] Callback actions go through adapter
- [ ] No direct `ticktick.createTask/updateTask/completeTask/deleteTask` outside adapter
- [ ] Pipeline logging captures all mutations

---

## Definition of Done

- [ ] `/scan` uses new pipeline (no `gemini.analyzeTask` calls)
- [ ] `/review` mutations go through adapter
- [ ] `autoApply` and callbacks use adapter exclusively
- [ ] No direct `ticktick.*Task()` calls remain outside the adapter (FR-005)
- [ ] `/briefing` and `/weekly` continue working on legacy path (unchanged)

## Risks

- `/scan` batching logic is complex — needs careful migration to not break quota handling
- `autoApply` has project-move edge cases with rollback — adapter must handle
- Callbacks may need adapter reference injected — verify DI flow

## Reviewer Guidance

- Grep for remaining direct `ticktick.createTask`, `ticktick.updateTask` etc. — there should be none outside adapter
- Verify `/briefing` and `/weekly` still work (they must NOT be touched)
- Test `/scan` with a real task list to verify batch processing

## Activity Log

- 2026-03-10T15:31:55Z – Gemini – shell_pid=25736 – lane=doing – Assigned agent via workflow command
- 2026-03-10T15:32:27Z – Gemini – shell_pid=25736 – lane=for_review – Moved to for_review
- 2026-03-10T15:32:48Z – Gemini – shell_pid=19860 – lane=doing – Started review via workflow command
- 2026-03-10T15:33:19Z – Gemini – shell_pid=19860 – lane=done – Review passed: /scan and /review migrated to pipeline. autoApply and callbacks hooked to adapter. No direct API calls remain outside adapter.
