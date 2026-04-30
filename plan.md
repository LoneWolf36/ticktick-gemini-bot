# Telegram Transparency and Rollback Plan

## Current status

Previous commit `54f55d0 fix: harden task write UX` fixed the narrow transcript bugs but did not complete the larger trust/rollback UX.

### Already addressed

- [x] Raw resolver reasons such as `no_matching_tasks` no longer surface to the user.
- [x] The normalizer no longer adds the incorrect `Do` prefix to LLM-provided titles.
- [x] Non-exact mutation confirmation copy no longer exposes match type or score.
- [x] Follow-up detection no longer binds messages solely because they share words with the recent task title.
- [x] TickTick due-date verification compares equivalent timezone instants instead of raw strings.
- [x] Freeform error copy no longer leaks raw exception messages.
- [x] Regression suite and test-size guard passed before commit.

### Addressed by this implementation

- [x] Freeform task mutations are persisted into the undo log when rollback metadata exists.
- [x] Single action receipts tell the user exactly what changed when snapshot/diff data exists.
- [x] Complete/delete responses are task-specific, not count-only.
- [x] Batch results use shared batch ids and expose undo-all behavior through `/undo` / `undo:last`.
- [x] Inline undo is available on normal freeform success messages when undo metadata was stored.
- [x] Non-exact confirmations remain conservative and jargon-free; field-level previews stay deferred unless diff data is already available without extra fetches.
- [x] Auto-apply notifications show per-task changes and undo guidance.

## Root cause

The pipeline already creates rollback metadata (`rollbackStep`) and pre-write snapshots, but the Telegram freeform path does not consistently persist that metadata into the undo log or present it back to the user as an actionable receipt.

The UI also optimizes for terse completion messages instead of trust-building receipts. The user sees that something happened, but not always what changed, why it changed, and how to reverse it.

## Architectural vs band-aid assessment

This should be a structural UX/rollback layer, not more copy patches.

- Use existing pipeline snapshots and rollback steps as the source of truth.
- Use existing undo store and `/undo` command where possible.
- Add shared diff/receipt helpers so freeform, callbacks, scheduler auto-apply, and future batch flows use one pattern.
- Avoid hardcoded task/project/user-specific heuristics.
- Avoid building a large history browser, partial batch undo, or complex new task-state system in MVP.

## Opinion on @designer recommendations

@designer's direction is right: the product needs receipts, not only success messages. The strongest recommendation is the action receipt pattern: show action, target task, changed fields, and rollback affordance in one Telegram message.

MVP-critical now:

- [x] Shared field-diff builder.
- [x] Rich freeform action receipts.
- [x] Persist freeform rollback entries.
- [x] Inline `↩️ Undo` / `↩️ Undo all` buttons where undo is available.
- [x] Auto-apply batch receipts with per-task summaries.
- [x] Clear skipped/destructive-action notices.
- [x] Deep visual redesign of every `/scan` and `/review` card.

Defer for later:

- [ ] `/history` action browser.
- [ ] Partial batch undo.
- [x] Deep visual redesign of every `/scan` and `/review` card is required for this work, not deferred.
- [ ] New multi-mutation freeform capabilities beyond existing pipeline support.
- [ ] Complex confirmation cards that require extra API fetches before every confirmation.

Rationale: the MVP should make current actions transparent and undoable. It should not expand the product surface before trust basics are solved.

## Safe failure modes

- [x] If rollback metadata is missing, do not show an undo button.
- [x] If rollback execution fails, tell the user the task could not be reverted and log diagnostics server-side.
- [x] If a batch contains non-rollbackable items, show safe rollback failure copy and keep diagnostics server-side.
- [x] If a completed task cannot be uncompleted through TickTick, restore by recreating from snapshot and disclose this limitation in docs/tests.
- [x] If field diffs cannot be computed, fall back to a task-specific receipt, not a vague count.
- [x] If the action is ambiguous or non-exact, confirmation remains required before mutation.

## Telegram UX patterns

### Single update receipt

```text
✅ Updated "Quarterly Report"

Priority  Medium → High 🔴
Due       None → Monday, 5 May
Project   Inbox → Health

[↩️ Undo]
```

### Single create receipt

```text
✅ Created "Plan party" in Goals
3 checklist items added.

[↩️ Undo]
```

### Single complete receipt

```text
✅ Completed "Quarterly Report"

[↩️ Undo]
```

### Single delete receipt

```text
🗑️ Deleted "Quarterly Report"

[↩️ Undo]
```

### Batch receipt

```text
✅ 3 tasks updated

• "Quarterly Report" → priority, due date
• "Vendor call" → moved to Health
• "Book gym" → priority

[↩️ Undo all]
```

### Skipped destructive action notice

```text
⚠️ 1 destructive action was blocked for safety.
```

### Non-exact confirmation preview

```text
Update "Quarterly Report"?

This did not match exactly. Please confirm.

Will change:
• Priority: Medium → High
• Due: None → Monday, 5 May

[Confirm] [Cancel]
```

### Redesigned `/scan` and `/review` card

```text
Task review

Inbox → Health

Was
"gym"

Proposed
"Book gym session"

Changes
• Priority: Low → High 🔴
• Due: None → Today
• Reason: supports health routine

[Apply] [Refine] [Skip]
```

Rules:

- [x] Every card must show `Was` and `Proposed` when title or fields changed.
- [x] Every card must group changes by field, not bury them in prose.
- [x] Every card must state why the system recommends the action when rationale exists.
- [x] Destructive actions must look visually different and include explicit consequence copy.
- [x] Cards must stay Telegram-safe: compact, no tables that break on mobile, no raw JSON, no internal scores.
- [x] Keyboard labels must be action-oriented and consistent across `/scan` and `/review`.

## Implementation plan

### Phase 1 — Shared diff and receipt utilities

- [x] Add shared field-diff helper using rollback snapshot + normalized action.
- [x] Add shared receipt formatter for create/update/complete/delete.
- [x] Include changed-field labels for title, project, due date, priority, content, repeat, checklist count where available.
- [x] Keep formatting Telegram-safe and concise.
- [x] Add regression tests for field diffs, receipts, auto-apply summaries, and card output.

Files likely touched:

- `services/shared-utils.js`
- `tests/regression.shared-utils.test.js` or closest existing shared-utils regression file

### Phase 2 — Persist freeform undo entries

- [x] In Telegram freeform success path, persist each successful action's rollback metadata into the undo log.
- [x] Assign a batch id for all successful actions from one user message.
- [x] Store enough metadata to undo create, update, delete, and complete-by-recreate.
- [x] Do not show undo button when no undo entry was persisted.
- [x] Add regression coverage for rollback-step to undo-entry mapping and receipt generation.

Files likely touched:

- `bot/commands.js`
- `services/store.js` only if existing undo APIs are insufficient
- `tests/regression.work-style-commands-scheduler.test.js` or a new bot command regression file

### Phase 3 — Freeform action receipts

- [x] Replace generic freeform success copy with action receipts.
- [x] Show task title for every create/update/complete/delete.
- [x] Show old → new field diffs for updates.
- [x] Show concise batch summary when multiple actions succeed.
- [x] Append skipped destructive-action warnings when present.
- [x] Add tests that user-facing receipts include exact task titles and changed fields.

Files likely touched:

- `services/pipeline.js`
- `bot/commands.js`
- `tests/regression.pipeline-hardening-mutation.test.js`
- `tests/regression.work-style-commands-scheduler.test.js`

### Phase 4 — Inline undo callbacks

- [x] Add `undo:last` callback handler.
- [x] Reuse existing `/undo` execution helper rather than duplicating rollback execution.
- [x] Edit original Telegram message after undo when possible.
- [x] Fall back to a new reply if edit fails.
- [x] Remove inline keyboard after undo succeeds.
- [x] Add regression coverage for undo-entry execution paths and batch grouping.

Files likely touched:

- `bot/callbacks.js`
- `bot/commands.js`
- `bot/utils.js` if keyboard helper is needed
- `tests/regression.bot-confirmation.test.js` or a new callback regression file

### Phase 5 — Auto-apply batch transparency

- [x] Improve scheduler auto-apply notification to show per-task changed-field summaries.
- [x] Keep existing undo-all behavior and make the message explicit.
- [x] Show up to five items, then `…+N more`.
- [x] Add tests for auto-apply notification diff content and batch undo hint.

Files likely touched:

- `services/shared-utils.js`
- `services/scheduler.js`
- `tests/regression.work-style-commands-scheduler.test.js`

### Phase 6 — Confirmation preview polish

- [x] Keep non-exact update confirmations conservative and defer field previews unless diff data is already available without extra fetches.
- [x] Keep delete/complete confirmations clear and conservative.
- [x] Do not add extra API fetches unless needed.
- [x] Preserve tests that confirmation copy contains matched task, action, non-exact warning, and no resolver jargon.

Files likely touched:

- `services/pipeline.js`
- `services/shared-utils.js`
- `tests/regression.mutation-confirmation-gate.test.js`

### Phase 7 — Deep `/scan` and `/review` card redesign

- [x] Audit all current `/scan` and `/review` card builders and callback responses.
- [x] Redesign task cards around `Was`, `Proposed`, `Changes`, and `Why` sections.
- [x] Show old → new field-level deltas for rename, project, due date, priority, repeat, and content where available.
- [x] Make destructive cards visually distinct and explicit about consequence.
- [x] Keep cards calm, compact, and readable on Telegram mobile.
- [x] Keep inline keyboards consistent: apply/refine/skip/delete actions must be predictable.
- [x] Add regression tests for scan card, review card, destructive card, and no-internal-jargon card.

Files likely touched:

- `bot/utils.js`
- `bot/commands.js`
- `bot/callbacks.js`
- `services/shared-utils.js` if card helpers are shared
- `tests/regression.work-style-commands-scheduler.test.js` or a new Telegram card regression file

## Testing plan

### Regression tests

- [x] Freeform update persists an undo entry with original snapshot.
- [x] Freeform create persists an undo entry that can delete the created task.
- [x] Freeform delete persists an undo entry that can recreate the deleted task.
- [x] Freeform complete persists an undo entry that restores by recreating from snapshot if needed.
- [x] Multiple successful actions from one user message share one batch id.
- [x] `/undo` reverts the latest freeform single action through shared undo execution.
- [x] Inline `undo:last` reverts the latest freeform single action through shared undo execution.
- [x] Inline `undo:last` reverts an entire latest batch when batch id is present.
- [x] Action receipt includes task title for create/update/complete/delete.
- [x] Update receipt includes field-level old → new diff.
- [x] Batch receipt lists task titles and summarized changes.
- [x] Skipped destructive actions are shown to the user.
- [x] Non-exact confirmation copy remains jargon-free and shows enough context.
- [x] Auto-apply notification includes per-task change summaries and undo-all hint.
- [x] `/scan` cards show clear `Was`, `Proposed`, `Changes`, and `Why` sections.
- [x] `/review` cards show clear `Was`, `Proposed`, `Changes`, and `Why` sections.
- [x] Destructive review cards include explicit irreversible/consequence copy.
- [x] Card tests verify no internal scores, resolver jargon, raw JSON, or stack traces.

### Full verification

- [x] `npm run check:test-sizes`
- [x] `npm test`
- [x] Specialist code review via @oracle after implementation and self-review.
- [x] Specialist UX review via @designer after implementation and self-review.
- [x] Rework any blocking findings.
- [x] Re-run tests after rework.

## Acceptance criteria

- [x] Every successful Telegram task mutation tells the user exactly what task was changed.
- [x] Every update receipt shows changed fields with old → new values when a snapshot exists.
- [x] Every undoable single action shows a visible undo affordance.
- [x] Every undoable batch shows a visible undo-all affordance.
- [x] Undo buttons are only shown when rollback metadata was actually persisted.
- [x] `/undo` and inline undo share the same rollback behavior.
- [x] Batch undo reverts all rollbackable actions from the latest batch.
- [x] Non-rollbackable rollback failures are disclosed in user-safe copy.
- [x] No resolver internals, scores, stack traces, or raw error messages appear in Telegram copy.
- [x] `/scan` and `/review` cards are visually redesigned, mobile-readable, and transparent.
- [x] Tests reproduce the current transparency/undo gaps before implementation where practical.
- [x] Full test suite and test-size guard pass.
- [x] Plan checkboxes are marked complete only after implementation, tests, and review are done.

## Documentation updates required

- [x] Update `AGENTS.md` Telegram command surfaces or architectural decisions to note that freeform mutations persist undo entries.
- [x] Update docs for `/undo` behavior and batch undo scope.
- [x] Document complete-action rollback limitation: restore may recreate the task rather than truly uncomplete it.
- [x] No `.env.example` or `render.yaml` change expected unless implementation adds configuration.
- [x] Run `npm run docs:map` because exported function signatures were added/changed.

## Delegation plan

### @fixer slice A — shared diff/receipt utilities

- [x] Add tests first.
- [x] Implement shared helpers.
- [x] Run focused tests.
- [x] Report changed files and verification.

### @fixer slice B — freeform undo persistence and receipts

- [x] Add tests first.
- [x] Persist undo entries from freeform pipeline results.
- [x] Use receipt helpers in freeform success messages.
- [x] Run focused tests.
- [x] Report changed files and verification.

### @fixer slice C — inline undo callback

- [x] Add regression coverage first for shared undo execution paths.
- [x] Implement `undo:last` callback using shared undo execution.
- [x] Run focused tests.
- [x] Report changed files and verification.

### @fixer slice D — auto-apply batch transparency

- [x] Add notification tests first.
- [x] Improve auto-apply message with per-task summaries.
- [x] Ensure undo-all language remains accurate.
- [x] Run focused tests.
- [x] Report changed files and verification.

### @designer slice E — `/scan` and `/review` visual redesign

- [x] Add/identify card rendering tests first.
- [x] Redesign Telegram task cards around `Was`, `Proposed`, `Changes`, and `Why`.
- [x] Keep mobile-safe formatting and consistent buttons.
- [x] Run focused tests.
- [x] Report changed files and verification.

### @designer review

- [x] Review final Telegram receipt and undo copy.
- [x] Confirm UX is transparent, calm, and not noisy.
- [x] Identify blocking copy issues.

### @oracle review

- [x] Review rollback architecture and failure modes.
- [x] Confirm no band-aid heuristics or unsafe mutation paths.
- [x] Identify blocking reliability issues.

## Completion log

- [x] Plan created.
- [x] Plan approved for implementation.
- [x] Slice A complete.
- [x] Slice B complete.
- [x] Slice C complete.
- [x] Slice D complete.
- [x] Slice E complete.
- [x] Docs updated.
- [x] Full tests passed.
- [x] Designer review passed.
- [x] Oracle review passed.
- [x] All checkboxes updated.
- [x] Final commit created.
