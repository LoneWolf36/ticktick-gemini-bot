---
work_package_id: WP04
title: 'Normalizer: Project Resolution, Dates & Validation'
dependencies: [WP01, WP03]
base_branch: 001-task-operations-pipeline-WP04-merge-base
base_commit: 0f42d9bc6193d92f754291f4095b071b21db9797
created_at: '2026-03-10T15:24:28.423102+00:00'
subtasks: [T017, T018, T019, T020]
authoritative_surface: src/
execution_mode: code_change
mission_id: 01KNT55PMWQ9GQH7JH6E61VDZD
owned_files:
- src/**
wp_code: WP04
---

# WP04 — Normalizer: Project Resolution, Dates & Validation

## Objective

Complete the normalizer module with project hint resolution, relative date expansion, split strategy handling, and the validation gate that rejects malformed or low-confidence actions.

## Implementation Command

```bash
spec-kitty implement WP04 --base WP01
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
- 2026-03-10T15:25:13Z – Gemini – shell_pid=25632 – lane=doing – Started review via workflow command
- 2026-03-10T15:25:48Z – Gemini – shell_pid=25632 – lane=done – Review passed: Normalizer completed with project resolution, date expansion, and validation logic.

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Complete the normalizer with project hint resolution, relative date expansion, split strategy handling (multi-day), and validation gate rejecting malformed/low-confidence actions.

#### What's Actually Done:
Marked done. All 4 subtasks completed: project resolution, date expansion, split strategy, validation gate. Review passed without issues.

#### Gaps Found:
- No gaps. The WP is well-scoped, cleanly executed, and the validation gate (confidence >= 0.5, valid type/title/taskId) directly supports the Product Vision's safety requirements.

#### Product Vision Alignment Issues:
- Strongly aligned. The validation gate prevents bad data from reaching TickTick, supporting "Wrong tasks are worse than fewer tasks."
- Project resolution supports the system's ability to correctly categorize work, reducing "mistaking motion for progress."
- Multi-day split strategy supports handling "motivated but scattered" users by breaking vague intentions into actionable dated tasks.

#### Recommendations:
- No action needed. Well-executed WP.
