---
work_package_id: WP05
title: Pipeline Orchestrator & Telegram Integration
dependencies: [WP01, WP02, WP03, WP04]
base_branch: 001-task-operations-pipeline-WP05-merge-base
base_commit: 0f42d9bc6193d92f754291f4095b071b21db9797
created_at: '2026-03-10T15:26:18.435625+00:00'
subtasks: [T021, T022, T026, T027]
authoritative_surface: src/
execution_mode: code_change
mission_id: 01KNT55PMWQ9GQH7JH6E61VDZD
owned_files:
- src/**
wp_code: WP05
---

# WP05 — Pipeline Orchestrator & Telegram Integration

## Objective

Wire all layers (AX → Normalizer → Adapter) into a single pipeline module and connect it to the Telegram DM handler, replacing the legacy `gemini.converse()` path.

## Implementation Command

```bash
spec-kitty implement WP05 --base WP04
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
5. Preserve the content-merge boundary from the 2026-04-11 review: pass only cleaned new content from the normalizer into `adapter.updateTask`; never pass a description that already contains existing TickTick content.
6. Consume adapter operation logs into the pipeline diagnostics stream with request id, stage, operation, timing, result, and failure class. Do not persist raw user messages, raw task titles, or raw task descriptions in behavioral-memory signals.

**Files**: `services/pipeline.js` (new, ~120 lines)

**Validation**:
- [ ] Single task → one created task
- [ ] Multi-task → multiple tasks
- [ ] Non-task message → `type: 'non-task'`
- [ ] Update flow cannot double-merge task descriptions
- [ ] Adapter logs are visible through pipeline observability without storing raw task/user text

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
- [ ] Pipeline preserves the adapter-owned content merge boundary
- [ ] Pipeline consumes adapter operation logs in privacy-aware diagnostics

## Risks

- Message routing: AX must reliably return empty for non-task input
- Error aggregation across mixed success/failure
- Pipeline must not block Telegram event loop
- Passing pre-merged content from normalizer to adapter would duplicate task descriptions

## Reviewer Guidance

- Test with spec acceptance scenarios end-to-end
- Verify non-task messages don't create tasks
- Check error messages are user-friendly
- Confirm adapter logs are consumed by pipeline observability and behavioral signals remain metadata-only

## Activity Log

- 2026-03-10T15:26:20Z – Gemini – shell_pid=5544 – lane=doing – Assigned agent via workflow command
- 2026-03-10T15:26:56Z – Gemini – shell_pid=5544 – lane=for_review – Moved to for_review
- 2026-03-10T15:27:12Z – Gemini – shell_pid=21840 – lane=doing – Started review via workflow command
- 2026-03-10T15:31:20Z – Gemini – shell_pid=21840 – lane=done – Review passed: Pipeline orchestrator implemented and integrated with Telegram DMs. API failures handled gracefully.

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Wire AX → Normalizer → Adapter into services/pipeline.js, integrate with Telegram DM handler (replacing gemini.converse()), add graceful API failure handling (FR-016), and terse confirmation responses (FR-011).

#### What's Actually Done:
Marked done. Pipeline created, Telegram DMs routed through it, non-task messages fall through to coach, API failures handled gracefully, terse confirmations implemented. Review passed.

#### Gaps Found:
- No gaps. The pipeline is the critical integration point and it was executed cleanly.
- The terse confirmation requirement (FR-011) — "no coaching, no analysis, no motivation" — is a direct implementation of the Product Vision's "The user does not want verbosity."

#### Product Vision Alignment Issues:
- Strongly aligned. This is the WP that makes the Product Vision operational: AX extracts intent, normalizer cleans it, adapter executes it, and the pipeline returns terse confirmations. This is the "morning start" flow made real.
- Non-task fall-through to coach supports the Product Vision's "coach that guides the user" identity.
- Terse confirmations ("✅ Created: {title}") match "clear, adaptive, minimally verbose."

#### Recommendations:
- No action needed. This is a foundational WP that was well-executed.
