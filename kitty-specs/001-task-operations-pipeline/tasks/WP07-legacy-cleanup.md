---
work_package_id: WP07
title: Legacy Cleanup
lane: "doing"
dependencies: [WP06]
base_branch: 001-task-operations-pipeline-WP06
base_commit: 0f42d9bc6193d92f754291f4095b071b21db9797
created_at: '2026-03-10T15:40:35.840514+00:00'
subtasks: [T028, T029, T030, T031]
shell_pid: "21884"
agent: "Gemini"
history:
- date: '2026-03-09'
  action: created
  by: spec-kitty.tasks
---

# WP07 — Legacy Cleanup

## Objective

Remove dead code paths replaced by the new pipeline. Clean up legacy schemas, prompts, and inline normalisation logic. Verify no regressions on `/briefing` and `/weekly` which stay on legacy.

## Implementation Command

```bash
spec-kitty implement WP07 --base WP06
```

## Context

After WP01-06, the new pipeline handles all task mutations. Legacy code for task creation/update via `gemini.converse()` and `executeActions()` normalisation is dead. However, `/briefing` and `/weekly` STILL use `gemini.js` — do NOT remove shared infrastructure.

---

## Subtask T028: Remove Legacy converseSchema and converse()

**Purpose**: Remove the `converseSchema` from `schemas.js` and the `converse()` method from `gemini.js`.

**Steps**:
1. Delete `converseSchema` export from `services/schemas.js`
2. Remove `gemini.converse()` method and its associated prompt template
3. Remove any imports of `converseSchema` across the codebase
4. Verify no other module references `converse()`

**Files**: `services/schemas.js` (~35 lines removed), `services/gemini.js` (~100+ lines removed)

**Validation**:
- [ ] `converseSchema` no longer exported
- [ ] `gemini.converse()` method removed
- [ ] No import errors across codebase
- [ ] `/briefing` and `/weekly` still work (they use different methods)

---

## Subtask T029: Remove Legacy ANALYZE_PROMPT Where Replaced

**Purpose**: Remove the `ANALYZE_PROMPT` usage for task analysis flows now handled by AX.

**Steps**:
1. Identify where `ANALYZE_PROMPT` is used:
   - `gemini.analyzeTask()` — used by `/scan` (now migrated in WP06)
2. If `analyzeTask()` is no longer called anywhere, remove:
   - `ANALYZE_PROMPT` template
   - `analyzeTask()` method
   - `analyzeSchema` from schemas.js (if unused)
3. **CAUTION**: Check if `/briefing`, `/weekly`, or `/reorg` use these — only remove if truly dead

**Files**: `services/gemini.js` (~80 lines), `services/schemas.js` (conditional)

**Validation**:
- [ ] No remaining callers of `analyzeTask()` (grep verification)
- [ ] ANALYZE_PROMPT removed
- [ ] `/briefing` and `/weekly` unaffected

---

## Subtask T030: Remove executeActions Inline Normalisation

**Purpose**: Remove normalisation functions from `commands.js` now handled by `normalizer.js`.

**Steps**:
1. Identify dead normalisation functions in `commands.js`:
   - `normalizeActionType()` — replaced by normalizer
   - `normalizeActionChanges()` — replaced by normalizer
   - `normalizeTaskId()` — replaced by normalizer
   - `resolveDueDate()` — replaced by normalizer
   - `normalizeAndDedupeActions()` — replaced by normalizer
   - `inferPriorityLabel()` — check if still used by non-migrated flows
2. Remove functions that have zero callers (use grep to verify)
3. Keep any functions still used by `/briefing`, `/weekly`, or `/reorg`

**Files**: `bot/commands.js` (~200+ lines removed)

**Validation**:
- [ ] Dead normalisation functions removed
- [ ] No import errors
- [ ] `/reorg` command still works if it uses any of these

---

## Subtask T031: General Cleanup

**Purpose**: Remove stale imports, unused variables, orphaned comments, and tidy the codebase.

**Steps**:
1. In `bot/commands.js`: remove unused imports, stale comments, dead variables
2. In `services/gemini.js`: remove unused model initialisations if any
3. In `services/schemas.js`: remove unused schema exports
4. In `bot/index.js`: remove old DM handler code if still present
5. Final grep for direct `ticktick.createTask`, `ticktick.updateTask` etc. outside adapter
6. Verify clean `npm start` with no warnings

**Files**: Multiple files, minor edits each

**Validation**:
- [ ] No unused imports remain
- [ ] No lint warnings from removed code
- [ ] `npm start` runs cleanly
- [ ] All commands still functional: /start, /scan, /review, /pending, /briefing, /weekly, /undo, /status, /reorg, /menu

---

## Definition of Done

- [ ] `converseSchema` and `converse()` removed
- [ ] `ANALYZE_PROMPT` and `analyzeTask()` removed (if fully dead)
- [ ] Dead normalisation functions removed from commands.js
- [ ] No direct TickTick API calls outside adapter (FR-005 verified by grep)
- [ ] All commands functional (no regressions)
- [ ] Codebase compiles and runs cleanly

## Risks

- **Shared code**: Some "dead" functions may still be used by `/reorg` or `/pending` — grep carefully
- **/briefing regression**: Must NOT touch the briefing/weekly prompt or model infrastructure
- **Missing imports**: Aggressive removal may break secondary code paths

## Reviewer Guidance

- Run all commands manually after cleanup
- Grep for: `analyzeTask`, `converse`, `converseSchema`, `ANALYZE_PROMPT`, `normalizeActionChanges`
- Verify zero hits outside of comments/documentation

## Activity Log

- 2026-03-10T15:40:37Z – Gemini – shell_pid=14764 – lane=doing – Assigned agent via workflow command
- 2026-03-10T15:41:02Z – Gemini – shell_pid=14764 – lane=for_review – Moved to for_review
- 2026-03-10T15:41:19Z – Gemini – shell_pid=21884 – lane=doing – Started review via workflow command
