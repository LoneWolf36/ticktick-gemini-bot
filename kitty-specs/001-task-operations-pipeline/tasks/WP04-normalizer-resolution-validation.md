---
work_package_id: WP04
title: 'Normalizer: Project Resolution, Dates & Validation'
lane: "for_review"
dependencies: [WP01, WP03]
base_branch: 001-task-operations-pipeline-WP04-merge-base
base_commit: 0f42d9bc6193d92f754291f4095b071b21db9797
created_at: '2026-03-10T15:24:28.423102+00:00'
subtasks: [T017, T018, T019, T020]
shell_pid: "26124"
agent: "Gemini"
history:
- date: '2026-03-09'
  action: created
  by: spec-kitty.tasks
---

# WP04 — Normalizer: Project Resolution, Dates & Validation

## Objective

Complete the normalizer module with project hint resolution, relative date expansion, split strategy handling, and the validation gate that rejects malformed or low-confidence actions.

## Implementation Command

```bash
spec-kitty implement WP04 --base WP01
```

## Context

**Dependencies**:
- **WP01** — provides `TickTickAdapter.findProjectByName()` and `listProjects()` for project resolution
- **WP03** — provides the `normalizer.js` module structure this WP extends

**Key references**:
- `bot/commands.js` `resolveDueDate()` (lines 613-650) — existing date resolution logic
- `bot/utils.js` `parseDateStringToTickTickISO()` and `scheduleToDate()` — existing date utilities
- `USER_TIMEZONE` from environment — all date calculations must be timezone-aware

---

## Subtask T017: ProjectHint → ProjectId Resolution

**Purpose**: Resolve the `projectHint` string from AX output to a concrete TickTick project ID using the adapter's project list.

**Steps**:
1. Add `_resolveProject(projectHint, projects, defaultProjectId)` internal function to `normalizer.js`
2. Resolution strategy:
   a. If `projectHint` is null/empty → use `defaultProjectId`
   b. If `projectHint` looks like a 24-char hex ID → use as-is (already resolved)
   c. Otherwise, search `projects` array:
      - Exact case-insensitive match on project name
      - Starts-with match
      - Contains match
      - Use shortest matching name (prefer "Work" over "Work Projects")
   d. If no match → use `defaultProjectId`, log the miss
3. Return resolved `projectId` (string or null)

**Files**:
- `services/normalizer.js` (~30 lines)

**Edge Cases**:
- AX returns project ID directly (from prompt context): accept it
- User says "health stuff" and project is "Health & Fitness": should match via contains
- Multiple matches with same score: prefer alphabetically first
- `defaultProjectId` is null: return null (task goes to Inbox)

**Validation**:
- [ ] "Work" matches project named "Work"
- [ ] "health" matches "Health" (case-insensitive)
- [ ] Unknown project falls back to default
- [ ] Already-resolved IDs pass through unchanged

---

## Subtask T018: DueDate Expansion (Relative → Absolute)

**Purpose**: Convert relative date expressions and schedule buckets into absolute ISO date strings, timezone-aware.

**Steps**:
1. Add `_expandDueDate(dueDate, { currentDate, timezone })` internal function
2. Supported inputs:
   ```
   Absolute:  "2026-03-15"           → "2026-03-15T00:00:00+00:00"
   Relative:  "today"                → today's ISO date
              "tomorrow"             → tomorrow's ISO date
              "monday", "tuesday"... → next occurrence of that weekday
              "next monday"          → next occurrence (skip this week if today is mon)
              "this friday"          → this week's friday
              "next week"            → next Monday
   Bucket:    "this-week"            → this Friday
              "next-week"            → next Monday
              "someday"              → null (no due date)
   ```
3. All calculations must use the configured `USER_TIMEZONE` for day boundaries
4. Return ISO date string or null

**Reference**: `bot/utils.js` has `scheduleToDate()` and `parseDateStringToTickTickISO()` — can borrow logic or wrap these utilities.

**Files**:
- `services/normalizer.js` (~45 lines)

**Edge Cases**:
- "thursday" when today is Thursday → next Thursday (not today)
- "this monday" when today is Wednesday → should this be past Monday or next Monday? → next Monday
- "someday" → null (explicitly no due date)
- Already ISO date ("2026-03-15") → pass through

**Validation**:
- [ ] "today" → today's date in configured timezone
- [ ] "tomorrow" → tomorrow's date
- [ ] "thursday" (on a Monday) → this coming Thursday
- [ ] "next monday" → next week's Monday
- [ ] "someday" → null
- [ ] "2026-03-15" → "2026-03-15T00:00:00+00:00" (pass through)

---

## Subtask T019: SplitStrategy Handling

**Purpose**: Handle `splitStrategy` field from AX output to produce the correct number of normalised actions.

**Steps**:
1. Add split strategy handling in `normalizeActions()`:
   ```javascript
   for (const intent of intentActions) {
     if (intent.splitStrategy === 'multi-day' && intent.dueDate) {
       // Extract multiple dates from dueDate field
       const dates = _parseDateList(intent.dueDate);
       for (const date of dates) {
         const cloned = { ...intent, dueDate: date, splitStrategy: 'single' };
         results.push(normalizeAction(cloned, options));
       }
     } else {
       results.push(normalizeAction(intent, options));
     }
   }
   ```
2. Add `_parseDateList(dueDateString)` helper:
   - Input: "monday tuesday wednesday" or "monday, tuesday, wednesday" or "mon wed fri"
   - Output: array of individual date strings
3. When `splitStrategy` = `multi-task`: AX should already produce multiple intents — no extra splitting needed
4. When `splitStrategy` = `multi-day`: clone the action for each extracted date
5. Default `splitStrategy` = `single`: pass through

**Files**:
- `services/normalizer.js` (~35 lines)

**Edge Cases**:
- "mon wed fri" — is this multi-day or recurring? Trust AX's `splitStrategy` field. If AX says `multi-day`, split; if it sets `repeatHint`, it's recurring
- Single date with `multi-day` strategy: just produce one task
- Empty date list after parsing: skip splitting, produce one task with no date

**Validation**:
- [ ] `splitStrategy: "multi-day"` + dueDate "monday tuesday wednesday" → 3 normalised actions
- [ ] `splitStrategy: "multi-task"` → actions already separate, no extra work
- [ ] `splitStrategy: "single"` → one normalised action
- [ ] Invalid dates in list → skip those dates, produce for valid ones

---

## Subtask T020: Validation Gate

**Purpose**: Validate each normalised action before it reaches the adapter, rejecting malformed or low-confidence actions per FR-013.

**Steps**:
1. Add `_validateAction(normalizedAction)` internal function
2. Validation rules:
   ```
   Rule 1: type must be one of: "create", "update", "complete", "delete"
   Rule 2: "create" must have a title (non-empty after normalisation)
   Rule 3: "update" must have a valid taskId
   Rule 4: "complete" must have a valid taskId
   Rule 5: "delete" must have a valid taskId
   Rule 6: confidence must be >= 0.5 (configurable threshold)
   Rule 7: priority (if set) must be one of: 0, 1, 3, 5
   Rule 8: title (if present) must not be empty after normalisation
   Rule 9: projectId (if set) must look like a valid ID (24-char hex or similar)
   ```
3. Set `normalizedAction.valid = true/false`
4. Set `normalizedAction.validationErrors = [...]` with descriptive messages
5. Wire validation into `normalizeAction()` as the final step

**Files**:
- `services/normalizer.js` (~40 lines)

**Edge Cases**:
- Action with confidence 0.49: reject, add "Low confidence (0.49)" to errors
- Create action with empty title after stripping: reject with "Empty title"
- Update action with no taskId: reject with "Missing taskId for update"
- All fields optional for "complete" except taskId: valid even without title

**Validation**:
- [ ] Valid create action passes → `valid: true, validationErrors: []`
- [ ] Create with empty title → `valid: false, validationErrors: ["Empty title after normalization"]`
- [ ] Low confidence → `valid: false, validationErrors: ["Confidence 0.3 below threshold 0.5"]`
- [ ] Invalid priority (2) → `valid: false, validationErrors: ["Invalid priority: 2"]`
- [ ] Update without taskId → `valid: false`

---

## Definition of Done

- [ ] Project hints resolve to correct project IDs using adapter's project list
- [ ] Relative dates expand to absolute ISO dates in the correct timezone
- [ ] Multi-day split strategy produces separate dated tasks (FR-009)
- [ ] Validation gate rejects invalid/low-confidence actions with clear reasons (FR-013)
- [ ] All validation errors are descriptive and actionable

## Risks

- **Date parsing complexity**: Natural-language dates are a classic pitfall — may want to leverage `bot/utils.js` existing logic
- **Confidence threshold**: 0.5 may be too low or too high — should be configurable
- **Multi-day parsing**: "mon wed fri" format variations need robust parsing

## Reviewer Guidance

- Test date expansion with various timezone configurations
- Verify multi-day splitting produces correct number of tasks
- Check that validation prevents bad data from reaching TickTick API
- Ensure project resolution gracefully falls back rather than crashing

## Activity Log

- 2026-03-10T15:24:37Z – Gemini – shell_pid=26124 – lane=doing – Assigned agent via workflow command
- 2026-03-10T15:24:59Z – Gemini – shell_pid=26124 – lane=for_review – Moved to for_review
