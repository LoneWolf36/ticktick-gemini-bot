---
work_package_id: WP06
title: 'Command Migration: /scan & /review'
dependencies: [WP05]
base_branch: 001-task-operations-pipeline-WP05
base_commit: 0f42d9bc6193d92f754291f4095b071b21db9797
created_at: '2026-03-10T15:31:50.991733+00:00'
subtasks: [T023, T024, T025]
authoritative_surface: src/
execution_mode: code_change
mission_id: 01KNT55PMWQ9GQH7JH6E61VDZD
owned_files:
- src/**
wp_code: WP06
---

# WP06 — Command Migration: /scan & /review

## Objective

Migrate `/scan` and `/review` commands from legacy Gemini analysis to the new AX → Normalizer → Adapter pipeline per the clean-cut strategy. Also hook `autoApply` and inline callback actions to use `TickTickAdapter`.

## Implementation Command

```bash
spec-kitty implement WP06 --base WP05
```

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature protects the task-writing path so the assistant can turn natural language into clean TickTick actions without leaking context, inflating titles, adding unnecessary commentary, or creating task clutter that makes execution harder.

**Implementation must**:
- Keep task creation and mutation cognitively light: short confirmations, no analysis unless needed, and no extra decision burden for clear requests.
- Prefer correctness over confidence: ambiguous task intent, project choice, recurrence, or mutation target must clarify or fail closed instead of guessing.
- Preserve the single structured path AX intent -> normalizer -> TickTick adapter so future behavioral features can reason about actions consistently.

**Implementation must not**:
- The implementation restores prompt-only task execution, bypasses the adapter, or lets model prose decide writes directly.
- The implementation creates verbose coaching around straightforward task writes.
- The implementation makes more tasks when one correct task or one clarification would better support execution.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission is the safe execution foundation. It turns Telegram language into reliable TickTick task writes through the accepted path: AX intent -> normalizer -> ticktick-adapter. Its value is not task storage by itself; its value is reducing friction without creating clutter, wrong tasks, inflated tasks, or silent data loss. It must keep clear task capture terse and dependable so later behavioral guidance can rely on accurate task state.

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

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Migrate /scan and /review commands from legacy Gemini analysis to the new pipeline. Hook autoApply and inline callback actions to use TickTickAdapter. Ensure /briefing and /weekly stay on legacy.

#### What's Actually Done:
Marked done. /scan and /review migrated, autoApply and callbacks use adapter, no direct ticktick.*Task() calls remain outside adapter. Review passed.

#### Gaps Found:
- No gaps. Clean migration with clear boundaries (what moves, what stays).

#### Product Vision Alignment Issues:
- Aligned. Migrating /scan and /review to the pipeline ensures consistent task processing across all entry points, supporting the Product Vision's principle that the system should "feel like a trusted assistant" rather than having inconsistent behavior paths.
- The deliberate exclusion of /briefing and /weekly from migration shows good scope discipline.

#### Recommendations:
- No action needed. Well-scoped migration WP.
