---
work_package_id: WP05
title: Pipeline Orchestrator & Telegram Integration
lane: "doing"
dependencies: [WP01, WP02, WP03, WP04]
base_branch: 001-task-operations-pipeline-WP05-merge-base
base_commit: 0f42d9bc6193d92f754291f4095b071b21db9797
created_at: '2026-03-10T15:26:18.435625+00:00'
subtasks: [T021, T022, T026, T027]
shell_pid: "21840"
agent: "Gemini"
history:
- date: '2026-03-09'
  action: created
  by: spec-kitty.tasks
---

# WP05 — Pipeline Orchestrator & Telegram Integration

## Objective

Wire all layers (AX → Normalizer → Adapter) into a single pipeline module and connect it to the Telegram DM handler, replacing the legacy `gemini.converse()` path.

## Implementation Command

```bash
spec-kitty implement WP05 --base WP04
```

## Context

- WP01: TickTickAdapter (execution), WP02: AX (extraction), WP03+04: Normalizer (transformation)
- Current DM handler in `bot/index.js` calls `gemini.converse()` — to be replaced
- `bot/commands.js` `executeActions()` (lines 572-1103) — current action engine

---

## Subtask T021: Create Pipeline Orchestrator

**Purpose**: Orchestrate message → AX → normalise → adapter → result.

**Steps**:
1. Create `services/pipeline.js`, export `createPipeline({ axIntent, normalizer, adapter, config })`
2. Pipeline exposes `processMessage(userMessage, options)`:
   - Extract intents via AX
   - If no intents or all low-confidence → return `{ type: 'non-task' }`
   - Normalise intents with project list, timezone, defaults
   - Separate valid/invalid actions
   - Execute valid actions via adapter (route by type: create/update/complete/delete)
   - Build terse confirmation text
   - Return `{ type: 'task', actions, confirmationText, errors }`
3. Add `_executeActions(valid, adapter)` helper routing by action type
4. Full pipeline logging at each stage (FR-014)

**Files**: `services/pipeline.js` (new, ~120 lines)

**Validation**:
- [ ] Single task → one created task
- [ ] Multi-task → multiple tasks
- [ ] Non-task message → `type: 'non-task'`

---

## Subtask T022: Integrate Pipeline with Telegram DMs

**Purpose**: Replace `gemini.converse()` in the bot's DM handler with the pipeline.

**Steps**:
1. In `bot/index.js`, initialise pipeline components (adapter, axIntent, normalizer)
2. Replace DM handler: call `pipeline.processMessage(text)` instead of `gemini.converse()`
3. If result is `non-task` → fall through to existing conversational handler
4. If result is `task` → reply with `result.confirmationText`
5. Keep "/" commands routing to existing command handlers

**Files**: `bot/index.js` (~40 lines modified), `server.js` (minor wiring)

**Validation**:
- [ ] "Book dentist Thursday" → creates task, terse confirmation
- [ ] "hello" → no task, falls through to coach
- [ ] "book flight, pack bag, call uber friday" → 3 tasks

---

## Subtask T026: Graceful API Failure Handling (FR-016)

**Purpose**: Preserve parsed intent when TickTick API is unavailable.

**Steps**:
1. Wrap adapter calls in try/catch in `_executeActions()`
2. Detect API unavailability (network errors, 5xx, timeouts)
3. On failure: log full intent, continue with remaining actions
4. Return partial success: "Created 2 tasks. ⚠️ 1 failed (API unavailable)"
5. Failed intents stored in results for potential retry

**Files**: `services/pipeline.js` (~30 lines added)

**Validation**:
- [ ] API timeout → user gets warning, intent logged
- [ ] Partial success → confirms created, warns about failed

---

## Subtask T027: Terse Confirmation Responses (FR-011)

**Purpose**: Replace verbose analysis with 1-3 line confirmations.

**Steps**:
1. Implement `_buildConfirmation(results, errors)`:
   - Single create → "✅ Created: {title}"
   - Multi create → "✅ Created {n} tasks"
   - Updates/completions/deletions → "📝 Updated {n} task(s)"
   - Errors → "⚠️ {n} action(s) skipped"
2. No coaching, no analysis, no motivation
3. Include title only for single-task operations

**Files**: `services/pipeline.js` (~25 lines)

**Validation**:
- [ ] Single → "✅ Created: Book dentist appointment"
- [ ] Multiple → "✅ Created 3 tasks"
- [ ] Mixed → multi-line summary

---

## Definition of Done

- [ ] `services/pipeline.js` exports working `createPipeline`
- [ ] Telegram DMs route through pipeline
- [ ] Non-task messages fall through to coach
- [ ] API failures handled gracefully (FR-016)
- [ ] Confirmations are terse (FR-011)

## Risks

- Message routing: AX must reliably return empty for non-task input
- Error aggregation across mixed success/failure
- Pipeline must not block Telegram event loop

## Reviewer Guidance

- Test with spec acceptance scenarios end-to-end
- Verify non-task messages don't create tasks
- Check error messages are user-friendly

## Activity Log

- 2026-03-10T15:26:20Z – Gemini – shell_pid=5544 – lane=doing – Assigned agent via workflow command
- 2026-03-10T15:26:56Z – Gemini – shell_pid=5544 – lane=for_review – Moved to for_review
- 2026-03-10T15:27:12Z – Gemini – shell_pid=21840 – lane=doing – Started review via workflow command
