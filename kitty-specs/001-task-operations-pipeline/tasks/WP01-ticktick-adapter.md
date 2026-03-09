---
work_package_id: "WP01"
title: "TickTick Adapter Module"
lane: "planned"
dependencies: []
subtasks: ["T001", "T002", "T003", "T004", "T005", "T006", "T007", "T008"]
history:
  - date: "2026-03-09"
    action: "created"
    by: "spec-kitty.tasks"
---

# WP01 — TickTick Adapter Module

## Objective

Refactor the existing `services/ticktick.js` (`TickTickClient` class) into a compliant **adapter module** (`services/ticktick-adapter.js`) that exposes the narrow FR-015 interface. All TickTick REST API interactions across the codebase will eventually flow through this adapter.

The adapter wraps (not replaces) the existing `TickTickClient`, preserving its OAuth2 token refresh, retry with exponential backoff, cache invalidation, and project-move rollback infrastructure.

## Implementation Command

```bash
spec-kitty implement WP01
```

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

**Purpose**: Apply a partial update to an existing task, with special handling for content preservation (FR-007).

**Steps**:
1. Add `async updateTask(taskId, normalizedAction)` method
2. Fetch the existing task first: `this._client.getTask(projectId, taskId)` — note: need projectId, which should be in the normalised action or fetched from task
3. Build update payload:
   - `title`: replace if provided
   - `content`: **MERGE** — if existing task has content, append/improve don't overwrite (FR-007)
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
- Check that all public methods follow the same error/logging pattern
- Confirm no direct `axios` or API calls — everything goes through `this._client`
