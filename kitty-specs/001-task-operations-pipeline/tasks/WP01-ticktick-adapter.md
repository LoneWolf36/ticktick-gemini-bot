---
work_package_id: WP01
title: TickTick Adapter Module
dependencies: []
subtasks: [T001, T002, T003, T004, T005, T006, T007, T008]
authoritative_surface: src/
execution_mode: code_change
mission_id: 01KNT55PMWQ9GQH7JH6E61VDZD
owned_files:
- src/**
wp_code: WP01
---

# WP01 — TickTick Adapter Module

## Objective

Refactor the existing `services/ticktick.js` (`TickTickClient` class) into a compliant **adapter module** (`services/ticktick-adapter.js`) that exposes the narrow FR-015 interface. All TickTick REST API interactions across the codebase will eventually flow through this adapter.

The adapter wraps (not replaces) the existing `TickTickClient`, preserving its OAuth2 token refresh, retry with exponential backoff, cache invalidation, and project-move rollback infrastructure.

## Implementation Command

```bash
spec-kitty implement WP01
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

**Existing code**: `services/ticktick.js` — 345 lines, class `TickTickClient`
- Already has: `createTask`, `updateTask`, `completeTask`, `deleteTask`, `getProjects`, `getAllTasks`
- Missing from FR-015: `findProjectByName`, `createTasksBatch`, `listProjects` (alias)
- No field mapping from normalised actions to API shape
- No structured pipeline logging

**Key files**:
- `services/ticktick.js` — wrap, don't modify heavily
- `services/ticktick-adapter.js` — **NEW** file
- `bot/commands.js` — see `executeActions` for current field mapping patterns (lines 572-1103)

---

## Subtask T001: Create TickTickAdapter Class

**Purpose**: Create the adapter shell class that wraps `TickTickClient` and will be the single entry point for all TickTick operations.

**Steps**:
1. Create `services/ticktick-adapter.js`
2. Import `TickTickClient` from `./ticktick.js`
3. Define `TickTickAdapter` class:
   - Constructor takes a `TickTickClient` instance
   - Stores reference as `this._client`
   - Initialises `this._projectCache = null` and `this._projectCacheTs = 0`
4. Export the class as named export

**Files**:
- `services/ticktick-adapter.js` (new, ~30 lines initially)

**Validation**:
- [ ] Class can be instantiated with a TickTickClient
- [ ] No direct API calls in the adapter — all delegated to `this._client`

---

## Subtask T002: Implement listProjects()

**Purpose**: Expose a cached project listing that other components (normalizer) can use for resolution.

**Steps**:
1. Add `async listProjects(forceRefresh = false)` method
2. If cache is valid (< 5 minutes old) and `!forceRefresh`, return cached
3. Otherwise call `this._client.getProjects()`
4. Store result in `this._projectCache` with timestamp
5. Return array of project objects `[{ id, name, ... }]`

**Files**:
- `services/ticktick-adapter.js` (~25 lines)

**Validation**:
- [ ] Returns project array
- [ ] Subsequent calls within 5 minutes return cached result
- [ ] `forceRefresh = true` bypasses cache

---

## Subtask T003: Implement findProjectByName(name)

**Purpose**: Deterministically resolve a project name/hint to a project ID using the cached project list. Supports exact match, case-insensitive match, and substring match.

**Steps**:
1. Add `async findProjectByName(nameHint)` method
2. Call `this.listProjects()` to ensure cache is populated
3. Resolution priority:
   a. Exact match (case-insensitive)
   b. Starts-with match (case-insensitive)
   c. Contains match (case-insensitive)
4. If no match found, return `null`
5. If multiple matches, prefer the exact match, then the shortest name

**Files**:
- `services/ticktick-adapter.js` (~30 lines)

**Edge Cases**:
- `null` or empty `nameHint`: return `null`
- User sends "work" and projects include "Work" and "Work Projects" — prefer "Work" (exact)
- User sends "heal" and projects include "Health" — match via starts-with

**Validation**:
- [ ] Exact match works case-insensitively
- [ ] Partial match works for substring
- [ ] Returns null for no match
- [ ] Prefers shorter/exact matches

---

## Subtask T004: Implement createTask(normalizedAction)

**Purpose**: Map a normalised action object to the TickTick API create payload and execute the creation.

**Steps**:
1. Add `async createTask(normalizedAction)` method
2. Map normalised fields to TickTick API fields:
   ```
   normalizedAction.title      → taskData.title
   normalizedAction.content    → taskData.content
   normalizedAction.dueDate    → taskData.dueDate (ISO string)
   normalizedAction.priority   → taskData.priority (0,1,3,5)
   normalizedAction.projectId  → taskData.projectId
   normalizedAction.repeatFlag → taskData.repeatFlag (RRULE string)
   ```
3. Strip `undefined` / `null` fields from payload
4. Call `this._client.createTask(taskData)`
5. Return the created task object from API response

**Files**:
- `services/ticktick-adapter.js` (~35 lines)

**Validation**:
- [ ] All mapped fields reach the API
- [ ] undefined/null fields are omitted
- [ ] Returns created task with ID

---

## Subtask T005: Implement createTasksBatch(normalizedActions)

**Purpose**: Create multiple tasks from an array of normalised actions, with per-item error handling so one failure doesn't block others.

**Steps**:
1. Add `async createTasksBatch(normalizedActions)` method
2. Iterate over `normalizedActions` array
3. For each, call `this.createTask(action)` wrapped in try/catch
4. Collect results: `{ created: [], failed: [] }`
5. Each failed entry includes the action + error message
6. Return the results object

**Files**:
- `services/ticktick-adapter.js` (~25 lines)

**Validation**:
- [ ] Successfully creates multiple tasks
- [ ] One failure doesn't prevent others from being created
- [ ] Returns structured results with created and failed arrays

---

## Subtask T006: Implement updateTask(taskId, normalizedAction)

**Purpose**: Apply a partial update to an existing task, with special handling for content preservation (FR-007). The adapter is the single source of truth for merging cleaned incoming content with existing TickTick content.

**Steps**:
1. Add `async updateTask(taskId, normalizedAction)` method
2. Fetch the existing task first: `this._client.getTask(projectId, taskId)` — note: need projectId, which should be in the normalised action or fetched from task
3. Build update payload:
   - `title`: replace if provided
   - `content`: **MERGE ONCE** — if existing task has content, append/improve without overwriting (FR-007). Treat `normalizedAction.content` as cleaned new content, not as a pre-merged description.
   - `dueDate`, `priority`, `projectId`, `repeatFlag`: replace if provided
4. Handle project moves: if `projectId` changes, the adapter must handle the TickTick API's move semantics
5. Call `this._client.updateTask(taskId, updatePayload)`
6. Return updated task

**Content Preservation Logic (FR-007)**:
```javascript
// If task has existing content and update provides new content:
// - If new content is different, append new content below existing
// - If new content duplicates existing, keep existing only
// Existing URLs, locations, instructions MUST be preserved
```

**Single-source-of-truth rule added after 2026-04-11 review**:
- `services/normalizer.js` may clean, suppress, or return new incoming content.
- `services/pipeline.js` must pass only the cleaned new content to `adapter.updateTask`.
- `TickTickAdapter.updateTask` performs the only merge with existing TickTick content.
- If the adapter detects that incoming content already contains the existing content, it must avoid appending it again.
- This rule closes the review risk where normalizer and adapter could both merge content and duplicate descriptions.

**Files**:
- `services/ticktick-adapter.js` (~50 lines)

**Edge Cases**:
- Task has no existing content: just set the new content
- Update provides content identical to existing: no-op on content
- Project move: existing client handles rollback via transactional pattern

**Validation**:
- [ ] Partial updates work (only changed fields sent)
- [ ] Existing content is preserved when new content is added
- [ ] Project moves work correctly

---

## Subtask T007: Implement completeTask() and deleteTask()

**Purpose**: Simple pass-through methods for completion and deletion.

**Steps**:
1. Add `async completeTask(taskId, projectId)` method
   - Call `this._client.completeTask(projectId, taskId)`
   - Return confirmation `{ completed: true, taskId }`

2. Add `async deleteTask(taskId, projectId)` method
   - Call `this._client.deleteTask(projectId, taskId)`
   - Return confirmation `{ deleted: true, taskId }`

**Files**:
- `services/ticktick-adapter.js` (~20 lines)

**Validation**:
- [ ] Complete marks task as done in TickTick
- [ ] Delete removes task from TickTick
- [ ] Both return structured confirmations

---

## Subtask T008: Pipeline Logging for All Operations

**Purpose**: Add structured logging to every adapter method so the full pipeline is observable (FR-014).

**Steps**:
1. Add a `_log(operation, data)` helper method
2. Log at entry and exit of each public method:
   ```
   [Adapter] createTask: { title: "...", projectId: "..." }
   [Adapter] createTask: SUCCESS { id: "...", 127ms }
   [Adapter] updateTask: FAILED { error: "...", 340ms }
   ```
3. Include timing (start/end of each operation)
4. Log at `console.log` level for success, `console.error` for failures
5. Mask any sensitive data (OAuth tokens) — shouldn't appear but defensive

**Files**:
- `services/ticktick-adapter.js` (~25 lines added across methods)

**Validation**:
- [ ] Every adapter call produces a log entry
- [ ] Log includes operation type, key fields, timing, and result status
- [ ] Errors are logged with full context

---

## Definition of Done

- [ ] `services/ticktick-adapter.js` exports `TickTickAdapter` class
- [ ] All FR-015 methods implemented: `createTask`, `updateTask`, `completeTask`, `deleteTask`, `listProjects`, `findProjectByName`, `createTasksBatch`
- [ ] Content preservation works for updates (FR-007)
- [ ] All operations produce structured logs (FR-014)
- [ ] No direct TickTick API calls in the adapter — all via `this._client`
- [ ] Existing `TickTickClient` unchanged (backward compatible)

## Risks

- **Content merge during updates**: Needs careful logic to not corrupt existing task content
- **Project move edge cases**: The existing client has rollback logic — adapter must not bypass it
- **Rate limiting on batch creates**: TickTick may throttle rapid sequential creates — adapter should handle gracefully

## Reviewer Guidance

- Verify content preservation logic by reviewing merge scenarios
- Verify the pipeline does not pass pre-merged content to the adapter.
- Verify adapter operation logs are visible in pipeline diagnostics without persisting raw user/task text.
- Check that all public methods follow the same error/logging pattern
- Confirm no direct `axios` or API calls — everything goes through `this._client`

## Review Feedback

**Reviewed by**: TickTick Bot
**Status**: ❌ Changes Requested
**Date**: 2026-03-10
**Feedback file**: `C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP01.md`

﻿**Issue 1: Content Merge Separator Mismatch (FR-007)**
The implementation in services/ticktick-adapter.js uses \n\n as a separator when merging content in updateTask:
updatePayload.content = "$(.content)\n\n$(.content)";
However, the spec for WP01 (and WP03) explicitly requires \n---\n as the separator. This inconsistency will lead to formatting issues.

**Issue 2: Redundant and Conflicting Merge Logic**
Both services/normalizer.js (WP03) and services/ticktick-adapter.js (WP01) implement content merge logic.
- normalizer.js merges if existingTaskContent is provided in options.
- adapter.updateTask merges by fetching the existing task from the API.
If pipeline.js passes the already-merged content to adapter.updateTask, the adapter will see that the new content is different from the existing (API) content and append it again, resulting in duplicated content (e.g., OLD \n\n OLD \n---\n NEW).
We should decide on a single source of truth for merging. Given the adapter has direct access to the latest state via API, it might be the safer place, but the normalizer is currently doing it too.

**Issue 3: Duplicate Subtask ID in Spec**
Subtask ID T012 is used in both WP02 ("Add quota-exhaustion error handler") and WP03 ("Create services/normalizer.js"). This causes confusion in task tracking. (Note: This is a spec issue, not an implementation issue).

## Activity Log

- 2026-03-10T14:38:56Z – unknown – lane=for_review – Moved to for_review
- 2026-03-10T14:39:22Z – Gemini – shell_pid=20788 – lane=doing – Started review via workflow command
- 2026-03-10T14:43:52Z – Gemini – shell_pid=20788 – lane=planned – Moved to planned
- 2026-03-10T15:35:57Z – Gemini – shell_pid=20788 – lane=done – Review passed: Fixed content merge separator and improved duplication prevention logic.

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
A TickTickAdapter module wrapping the existing TickTickClient with a narrow FR-015 interface: listProjects, findProjectByName, createTask, createTasksBatch, updateTask (with content preservation), completeTask, deleteTask, and structured pipeline logging.

#### What's Actually Done:
WP01 is marked done in status.events.jsonl. The review feedback identified and resolved a content merge separator mismatch (\n\n vs \n---\n) and a duplicate content merge logic issue between normalizer.js and adapter.updateTask. The adapter file exists with all 8 subtasks completed and review-passed.

#### Gaps Found:
- Content merge logic exists in BOTH the adapter and normalizer — WP01 review flagged this as Issue 2 but the fix was "improved duplication prevention logic" rather than choosing a single source of truth. This remains a potential risk for content duplication if the pipeline passes pre-merged content.
- WP01 review feedback referenced an external file path (Windows path) that may not be accessible for detailed issue review.

#### Product Vision Alignment Issues:
- Well-aligned. The adapter provides the infrastructure for reliable task creation/update, which supports the Product Vision's goal of "better judgment" through clean task management.
- Content preservation (FR-007) aligns with "Correctness matters more than confidence" — preserving existing task content prevents data loss.

#### Recommendations:
- Verify that the content merge single-source-of-truth decision is documented — either the normalizer OR the adapter should own it, not both.
- Confirm the adapter's pipeline logging is being consumed by the observability path (needed for FR-014).

#### Closure Added 2026-04-11:
- The current spec, plan, task list, and WP prompts now document the single-source-of-truth decision: the normalizer cleans incoming content only; `TickTickAdapter.updateTask` owns the only merge with existing TickTick content.
- WP05 now explicitly requires the pipeline to pass only cleaned new content to the adapter and to consume adapter operation logs in privacy-aware diagnostics.
