# TickTick AI Coach — Parallel Execution & Validation Plan

## Purpose

This plan validates `ticktick_ai_coach_audit_instructions.md` and converts it into an agent-executable engineering program.

Goal: make the Telegram assistant deterministic, truthful, scoped, and calm without building a heavy dashboard or replacing the existing pipeline architecture.

## Validation verdict on the existing audit

The audit correctly identifies the core trust failures:

- user-facing copy can blur preview, local review, and applied TickTick state;
- local review queue and TickTick live state are not always scoped clearly;
- project routing fallback must never silently write somewhere unexpected;
- lock/busy/degraded states exist internally but are not consistently product states;
- debug data leaks into normal Telegram UX;
- action vocabulary is inconsistent across review, reorg, mutation, and completion flows.

The audit overreaches where it proposes a broad global state machine and durable `delivery_state`. The existing repository already has strong boundaries:

- `services/pipeline.js` — free-form write path;
- `services/ticktick-adapter.js` — TickTick mutation boundary;
- `services/store.js` — local queues, locks, deferred state;
- `bot/commands.js` — command surfaces;
- `bot/callbacks.js` — operational callback flows;
- `services/reorg-executor.js` — reorg action execution;
- `services/summary-surfaces/` — briefing/weekly/daily-close composition.

Best architecture: add a thin shared operation-state/receipt contract and render all user-visible mutation-like results from it. Do not add a second orchestration platform.

## Root cause

The system has multiple real states — TickTick live state, local review queue, dry-run preview, deferred write queue, lock state, and model recovery state — but user-facing outputs do not consistently declare which scope they describe. This creates truthful backend behavior that can still feel untrustworthy because the UI implies broader certainty than the backend has.

## Architectural approach vs band-aid

Structural fix, not rule patch. The solution is to standardize operation receipts, scoped command semantics, deterministic project resolution, and state-aware rendering. Do not add keyword-specific copy patches, one-off message guards, or another parallel state manager.

## Safe failure defaults

- Missing or ambiguous project destination → `blocked` or `pending_confirmation`, never first-project fallback.
- Dry-run or preview uncertainty → `preview`, `changed=false`.
- Lock contention → `busy`, no duplicate processing.
- Malformed model output → clarification/block, no write.
- TickTick outage after parsing → `deferred` or `failed`, never success.
- Stale preview → resync/confirmation, never blind mutation.
- Unknown state scope → scoped conservative copy: local queue only, live TickTick unknown.

## Implementation progress

### Stage 1 — Contract seed and glossary — completed

Commit: `c5b369a feat: add operation receipt contract`

Scope completed:

- Added `services/operation-receipt.js` as a pure, descriptive contract module.
- Added canonical receipt vocabulary via `OPERATION_RECEIPT_VALUES`.
- Added `validateOperationReceipt(receipt)` and `assertValidOperationReceipt(receipt)`.
- Added `tests/regression.operation-receipt-contract.test.js` with deterministic contract/invariant coverage.
- Documented the receipt contract in `docs/ARCHITECTURE.md`.
- Recorded the architecture decision and module entry in `AGENTS.md`.
- Regenerated `context/refs/codebase-function-map.md`.
- Committed the source audit and this parallel execution plan for durable handoff.

Stage 1 intentionally did **not** wire receipts into production flows yet. No changes were made to `services/pipeline.js`, `bot/commands.js`, `bot/callbacks.js`, project routing, lock behavior, Telegram copy, or scheduler behavior.

Contract invariants now enforced:

- Receipt must declare `status`, `scope`, `command`, `operationType`, `nextAction`, `changed`, `dryRun`, `applied`, `fallbackUsed`, `message`, and `traceId`.
- Dry-run receipts can only be `preview` or `blocked`, and cannot be applied.
- Applied receipts require `status=applied`, `applied=true`, `changed=true`, and `scope=ticktick_live`.
- Applied receipts with a destination require `exact` or `configured` destination confidence.
- `changed=false` cannot use applied-success state.
- `blocked`, `deferred`, `failed`, and `busy` can only use safe next actions: `retry`, `wait`, `resync`, or `none`.
- `pending_confirmation` cannot already be changed/applied.
- `pending_confirmation.confirmation.target` must include a safe identifier: `taskId`, `previewId`, `candidateId`, `targetId`, or `referenceId`.
- Pending create/update confirmations require destination details:
  - exact/configured destination → `projectId` or `projectName`;
  - ambiguous destination → non-empty `destination.choices` with safe project references;
  - missing destination → invalid.
- Receipts reject raw private task/user text fields in diagnostic metadata, including raw rollback snapshots.

Validation completed:

- `node --test tests/regression.operation-receipt-contract.test.js` → 12/12 pass.
- `npm run docs:map` → pass.
- `npm test` → 694 pass, 0 fail.
- `npm run check:test-sizes` → pass.
- Oracle review after rework → safe to commit.
- `git status --short` after commit → clean.

Stage 1 acceptance status:

- Canonical terms have one meaning: complete.
- Contract invariants documented and tested: complete.
- Safe defaults explicit and conservative: complete.
- Tests deterministic and mocked: complete.
- No production flow behavior changed: complete.
- No UX/routing/lock/deferred implementation included: complete.

Next stage should start from this contract and add reproduction-first tests for the highest-risk findings before production wiring.

### Stage 2 — Reproduction-first trust tests — completed

Scope completed:

- Added red regression coverage for `/pending` scoped empty-state copy when TickTick still has live tasks.
- Added red regression coverage proving missing project destinations currently fall back to the first project and write silently.
- Added red regression coverage proving dry-run create results currently return task-shaped success copy instead of preview-only semantics.
- Kept this stage test-only; no production behavior, routing, receipt mapping, or Telegram copy was changed.

Reproduced trust failures:

- F1: `/pending` replies `No tasks pending review.` even when live TickTick tasks exist, flattening local review queue state into broader task state.
- F3: create with projects `[Career, Personal]` and no Inbox/default destination logs first-project fallback and creates in `Career`.
- F6: dry-run create avoids adapter mutation but still returns `type: 'task'`, which looks applied rather than preview-only.

Validation completed:

- `node --test tests/regression.scheduler-status-commands.test.js` → expected red: 1 failing Stage 2 test, 3 passing existing tests.
- `node --test tests/regression.mutation-confirmation-gate.test.js` → expected red: 2 failing Stage 2 tests, 17 passing existing tests.

Stage 2 acceptance status:

- Highest-risk reproduction tests added before fixes: complete.
- Tests mock TickTick/Gemini through existing harnesses: complete.
- No implementation merged before reproduction: complete.
- Full suite intentionally not green until Stage 3+ production fixes land: expected.

## Core contract: OperationReceipt

Define a shared contract used by pipeline, review callbacks, reorg execution, and command rendering.

```text
OperationReceipt
  status: preview | applied | pending_confirmation | blocked | deferred | failed | busy
  scope: ticktick_live | local_review_queue | preview | deferred_queue | system
  changed: boolean
  command: scan | pending | status | review | freeform | reorg | scheduler | callback
  operationType: create | update | complete | delete | review | scan | sync | reorg | none
  message: short user-safe summary
  nextAction: apply | edit | skip | retry | wait | resync | none
  traceId: string
  lastSyncAt?: ISO timestamp
  sourceOfTruthCount?: number
  localQueueCount?: number
  destination?: { projectId?: string, projectName?: string, confidence: exact | configured | ambiguous | missing }
  dryRun: boolean
  applied: boolean
  fallbackUsed: boolean
  errorClass?: validation | auth | ticktick_unavailable | model_unavailable | routing | stale_preview | lock | unknown
  rollback?: applied-action rollback metadata only
```

Contract rules:

1. `changed=false` forbids success verbs: created, updated, completed, deleted, applied.
2. `dryRun=true` requires `status=preview` or `blocked`; no adapter mutation calls.
3. `applied=true` requires `changed=true` and adapter success.
4. `pending_confirmation` must show exact target and proposed destination.
5. `blocked`, `deferred`, and `failed` must include safe next action.
6. No raw task titles/descriptions/user free text in structured telemetry by default.

## Parallel workstreams

### Workstream A — Contract and state semantics

Agent type: senior backend/fixer after spec approval.

Primary files:

- `services/pipeline.js`
- `services/reorg-executor.js`
- `services/ticktick-adapter.js`
- `services/pipeline-observability.js`
- `services/shared-utils.js`
- `docs/ARCHITECTURE.md`
- `context/refs/codebase-function-map.md` if new exports/signatures change

Responsibilities:

1. Define `OperationReceipt` helpers in the smallest suitable module.
2. Map existing pipeline result types to receipt statuses.
3. Ensure free-form write path, dry-run scan path, deferred-intent path, and error path expose `changed`, `status`, `scope`, and `traceId`.
4. Add privacy-safe telemetry fields aligned to receipts.

Can start immediately after this plan is accepted. Must finish before UI rendering work merges.

### Workstream B — Project routing and Inbox safety

Agent type: backend/fixer.

Primary files:

- `services/ticktick-adapter.js`
- `services/ticktick.js`
- `services/normalizer.js`
- `services/project-policy.js`
- `services/user_context.example.js` if policy/config is added
- `.env.example` and `render.yaml` only if env vars are added
- relevant regression tests

Responsibilities:

1. Replace first-project fallback for write destinations with deterministic resolution.
2. Resolve Inbox by API metadata if available; otherwise exact/configured project identity.
3. Missing/ambiguous destination becomes `blocked` or `pending_confirmation`.
4. Optional fallback policy must be explicit, config-backed, documented, and off by default.
5. Add tests for missing, renamed, duplicated, and configured destination cases.

Can run in parallel with Workstream A if both agree on receipt fields.

### Workstream C — Command semantics and reconciliation

Agent type: backend/fixer.

Primary files:

- `bot/commands.js`
- `services/store.js`
- `services/scheduler.js`
- `services/pipeline.js`
- relevant regression tests

Responsibilities:

1. Define command semantics exactly:
   - `/scan` = fetch/rank candidates; may populate local review queue; does not write to TickTick unless explicitly documented and confirmed.
   - `/pending` = local review queue only.
   - `/status` = connection, local queue, running job, blocked/deferred counts, last sync.
   - `/briefing` = user-facing prioritization summary.
2. Add or reuse one canonical refresh/reconcile helper where needed.
3. Ensure local queue and live TickTick counts are never presented as the same thing.
4. Include last sync timestamp and scope in user-visible status.
5. Preserve lock safety and cleanup on mid-operation errors.

Must wait for Workstream A contract shape before final rendering, but can write failing tests and identify call sites in parallel.

### Workstream D — Telegram UX and copy system

Agent type: designer + fixer.

Primary files:

- `bot/commands.js`
- `bot/callbacks.js`
- `services/shared-utils.js`
- `services/summary-surfaces/summary-formatter.js`
- `services/summary-surfaces/briefing-summary.js`
- `services/summary-surfaces/weekly-summary.js`
- `services/summary-surfaces/daily-close-summary.js`
- `README.md`

Responsibilities:

1. Standardize message card pattern:
   - title;
   - state label;
   - one-sentence reason;
   - next action.
2. Standardize labels:
   - `Preview only`
   - `Applied`
   - `Waiting for confirmation`
   - `Blocked`
   - `Syncing`
   - `Deferred`
   - `Failed`
   - `Busy`
3. Standardize buttons:
   - `Apply` = apply proposed change.
   - `Edit` = revise before applying.
   - `Skip` = leave unchanged and move on.
   - `Delete` = delete task.
   - `Stop` = stop review loop.
   - `Complete` = complete a task only; never synonym for apply.
4. Replace absolute empty-state copy with scoped copy.
5. Split normal `/status` from debug details. Debug can remain behind a separate command/flag only if already supported or explicitly added.
6. Keep briefings short: Focus, Top 3, Why now, First action.

Must wait for Workstream A receipt fields for final implementation. Copy vocabulary and README updates can be drafted in parallel.

### Workstream E — Concurrency, stale preview, and deferred/outage paths

Agent type: backend/fixer with oracle review if architecture changes widen.

Primary files:

- `services/store.js`
- `services/scheduler.js`
- `bot/callbacks.js`
- `services/ticktick-adapter.js`
- `services/undo-executor.js`
- relevant regression tests

Responsibilities:

1. Lock collision returns stable `busy` receipt and user-safe busy copy.
2. Mid-operation throw releases intake lock.
3. Applying a queued preview revalidates task snapshot and destination.
4. Deleted/changed/completed tasks in TickTick force resync or confirmation.
5. Partial batch success reports applied vs failed/deferred counts.
6. Undo metadata is created only for applied actions.

Can write tests in parallel. Final implementation touches shared callback/store paths, so coordinate with Workstreams A/C/D.

### Workstream F — Tests, docs, and validation harness

Agent type: fixer.

Primary files:

- `tests/regression.*.test.js`
- `README.md`
- `docs/ARCHITECTURE.md`
- `AGENTS.md` only if architectural decisions change
- `context/refs/codebase-function-map.md` if exports/signatures change

Responsibilities:

1. Add failing regression tests before bug fixes.
2. Use mocked TickTick/Gemini only for automated tests.
3. Keep live TickTick verification in opt-in manual scripts or checklist steps.
4. Enforce command semantics and receipt copy via tests.
5. Update durable docs in same change set.

Runs throughout all phases.

## Serial integration order

Parallel discovery/test drafting may happen early, but merge order should be:

1. Contract and glossary accepted. **Completed in Stage 1 (`c5b369a`).**
2. Failing tests added for highest-risk findings. **Completed in Stage 2.**
3. OperationReceipt helpers and pipeline mapping. **Partially complete: pure contract helpers exist; production mapping remains.**
4. Project routing safety.
5. Lock/deferred/stale-preview receipts.
6. Command semantics and reconciliation copy.
7. Telegram UX vocabulary cleanup.
8. Telemetry/privacy standardization.
9. Docs and generated function map.
10. Full validation review.

Do not let multiple agents simultaneously edit the same high-coupling files without handoff:

- `services/pipeline.js`
- `bot/commands.js`
- `bot/callbacks.js`
- `services/store.js`

## Findings, owners, and acceptance criteria

### F1 — Source-of-truth vs local working state is unclear

Owner: Workstreams A, C.

Acceptance criteria:

- Every `/scan`, `/pending`, `/status`, `/review`, free-form mutation, reorg, and callback result declares `scope`.
- `/pending` never implies TickTick has no tasks; it only describes local review queue.
- `/status` separately reports TickTick live count, local queue count, deferred count, lock/running state, and last sync.
- Local queue items include enough metadata to say when they were last synced or previewed.
- Tests prove “empty local queue with active TickTick tasks” renders scoped non-contradictory copy.

Validation:

- Mock active TickTick tasks with empty pending queue.
- Run `/pending` and `/status` command handlers.
- Assert copy says local queue empty and separately acknowledges live TickTick/backlog state.

### F2 — No explicit user-visible operation state

Owner: Workstreams A, D.

Acceptance criteria:

- All mutation-like responses map to exactly one status: `preview`, `applied`, `pending_confirmation`, `blocked`, `deferred`, `failed`, or `busy`.
- State label appears in a stable position in Telegram cards/receipts.
- `changed=false` responses never use applied-success verbs.
- Tests cover at least one rendering per status.

Validation:

- Unit-test receipt-to-message rendering.
- Snapshot or string-match key status labels.
- Search user-facing copy for ambiguous success verbs in dry-run paths.

### F3 — Inbox/project fallback can be silent

Owner: Workstream B.

Acceptance criteria:

- Missing Inbox/default project never falls back to first project for writes.
- Ambiguous project match returns `blocked` or `pending_confirmation`.
- Exact/configured project match includes destination in receipt.
- Optional fallback routing requires explicit user policy config; default off.
- Tests cover missing, renamed, duplicated, exact, configured, and first-project fallback prevention.

Validation:

- Mock project lists for each case.
- Assert adapter mutation is not called when destination is missing/ambiguous.
- Assert user-facing confirmation includes destination when routing is non-obvious.

### F4 — Lock/busy state not visible enough

Owner: Workstreams C, E.

Acceptance criteria:

- Concurrent scan/poll/write returns `busy` with owner or generic operation type and last activity timestamp.
- Duplicate scan cannot process same task twice while lock held.
- Lock releases on success, throw, and early return.
- Stale lock TTL still self-heals.
- Tests simulate collision and mid-operation throw.

Validation:

- Force `tryAcquireIntakeLock()` failure and assert busy copy.
- Throw after lock acquisition and assert `releaseIntakeLock()` called or status unlocked.
- Run existing regression suite serially.

### F5 — Malformed model output recovery can look like success

Owner: Workstreams A, F.

Acceptance criteria:

- Invalid Gemini structured output produces `blocked`, `failed`, or clarification receipt with `changed=false`.
- No adapter mutation occurs after validation failure.
- User sees neutral recovery copy, not raw parser/schema diagnostics.
- Telemetry records `errorClass=validation` with trace ID.

Validation:

- Mock malformed model response.
- Assert no TickTick adapter mutation method called.
- Assert user copy contains safe clarification/block language only.

### F6 — Dry-run and apply modes are visually inconsistent

Owner: Workstreams A, D, F.

Acceptance criteria:

- Dry-run always renders `Preview only — nothing changed` or equivalent standardized label.
- Applied writes always render `Applied` plus exact outcome.
- Review queue cards never say “Reviewed” when meaning “queued locally” unless term is formally scoped.
- Tests verify dry-run path never calls create/update/complete/delete.

Validation:

- Mock `/scan` dry-run and inspect rendered message.
- Spy adapter mutation methods.
- Search copy for “Reviewed” and replace/scope as needed.

### F7 — `/scan`, `/pending`, `/status` semantics conflict

Owner: Workstreams C, D.

Acceptance criteria:

- README command table defines each command exactly.
- `/scan` says whether it only prepared local review items or changed TickTick.
- `/pending` says “local review queue”.
- `/status` says “live/sync state” and does not dump low-level debug fields by default.
- Tests run command sequence `/scan` → `/pending` → `/status` with mocked states and assert no contradictory wording.

Validation:

- Command-handler regression sequence.
- Manual Telegram transcript review from mocked/staging run.

### F8 — Debug information leaks into normal UX

Owner: Workstream D.

Acceptance criteria:

- Normal `/status` hides Gemini key index, cache age, raw fallback internals, and log-console style fields.
- Debug information remains available only through explicit debug mode/command if retained.
- User status answers: connected? queue healthy? job running? anything blocked? last sync?
- Tests assert normal status excludes known debug strings.

Validation:

- Run `/status` fixture.
- Assert inclusion of five user status questions and exclusion of debug-only fields.

### F9 — Action vocabulary is inconsistent

Owner: Workstream D.

Acceptance criteria:

- Review, reorg, confirmation, mutation, and checklist surfaces use documented label meanings.
- `Complete` appears only for completing a TickTick task.
- `Apply` appears only for applying a proposed change.
- `Refine` is renamed to `Edit` unless intentionally kept and documented.
- Tests or static assertions cover `taskReviewKeyboard()` labels by action type.

Validation:

- Inspect generated keyboards for task/create/update/complete/delete/reorg flows.
- README documents action vocabulary if exposed to users.

### F10 — Briefing and summary copy is too dense

Owner: Workstream D.

Acceptance criteria:

- Morning briefing renders: Focus, Top 3 priorities, Why now, First action.
- Each priority has concise rationale; no long argumentative paragraphs.
- Urgent/focus modes remain more direct, not more verbose.
- Behavioral notices stay calm and optional; debug causes are not front-loaded.
- Tests verify top-3 cap and required section order.

Validation:

- Snapshot/string tests for briefing formatter.
- Manual transcript review against product tone: calm, direct, low cognitive load.

### F11 — Confirmation boundaries insufficient for non-obvious writes

Owner: Workstreams A, B, E.

Acceptance criteria:

- Non-exact task resolution already gates destructive mutation; routing uncertainty uses same confirmation model, not a second system.
- Confirmation shows exact task, exact destination, exact proposed outcome.
- Confirm callback resumes with explicit skip flag only after state validation.
- Expired/missing confirmation does not mutate.

Validation:

- Mock ambiguous routing and non-exact task match.
- Assert pending confirmation stored with TTL.
- Assert confirm applies only if state exists and target remains valid.

### F12 — Stale preview before apply is not guarded

Owner: Workstream E.

Acceptance criteria:

- Applying a queued preview re-fetches or validates current TickTick task/project state.
- Deleted/completed/changed target returns `blocked` or `pending_confirmation` with resync next action.
- No adapter update/complete/delete executes against stale snapshot without confirmation.
- Tests cover external deletion and external project/title change after preview.

Validation:

- Create queued preview fixture.
- Mock TickTick snapshot mismatch.
- Assert no blind mutation and user sees resync/block copy.

### F13 — Partial batch and undo behavior under-specified

Owner: Workstreams E, F.

Acceptance criteria:

- Batch/reorg receipt reports applied, failed, deferred, and skipped counts separately.
- Undo log contains entries only for successfully applied actions.
- Failed/deferred actions are not marked as successfully processed.
- User copy says partial success when applicable.

Validation:

- Mock batch with mixed adapter successes/failures.
- Assert undo entries count equals applied count.
- Assert store processed/deferred marks match real outcomes.

### F14 — Model fallback/degraded paths lack product semantics

Owner: Workstreams A, D, F.

Acceptance criteria:

- Model fallback stays invisible only if final status/confidence/outcome class remains stable.
- Degraded confidence routes to scoped preview/clarification, not decisive write copy.
- Raw Gemini/API errors never leak to normal UX.
- Telemetry records fallback class and final receipt status.

Validation:

- Mock primary model 503 then successful fallback.
- Mock fallback producing low-confidence/clarification result.
- Assert user copy remains honest and non-diagnostic.

### F15 — Telemetry lacks consistent privacy-safe schema

Owner: Workstreams A, F.

Acceptance criteria:

- Operation boundaries emit trace ID, command, operation type, state/status, scope, counts, dry-run/applied booleans, fallback flag, project-resolution class, error class, latency.
- No raw task titles, descriptions, checklist items, or free-form user message text in structured logs by default.
- Trace ID links extract → normalize → adapter → render where practical.
- Tests or static checks verify known sensitive fields are not emitted in telemetry helpers.

Validation:

- Unit-test telemetry event construction.
- Review log samples from test run.
- Confirm privacy constraints in docs.

## Test plan

Automated tests must be mocked and deterministic.

Required regression groups:

1. Receipt contract tests. **Completed in Stage 1.**
2. Project routing resolver tests.
3. Dry-run vs apply tests.
4. Command semantics tests for `/scan`, `/pending`, `/status`.
5. Lock/busy cleanup tests.
6. Malformed model output recovery tests.
7. Stale preview apply tests.
8. Partial batch/undo tests.
9. Telemetry privacy tests.
10. Telegram keyboard/action vocabulary tests.
11. Briefing formatter structure tests.

Canonical commands:

```bash
npm test
npm run check:test-sizes
npm run docs:map   # only if exports/signatures/JSDoc changed
```

Manual/live verification must be opt-in only:

1. Connected TickTick account project-list check.
2. Inbox/default project resolution check.
3. Preview-only `/scan` transcript.
4. Apply one low-risk test task with explicit confirmation.
5. Simulate lock collision by issuing scan twice quickly.
6. Trigger status view and verify no debug leakage.
7. Review briefing output for low cognitive load.

## Validation review plan

### Gate 0 — Plan approval

Reviewer: orchestrator/user.

Status: completed. User approved staged execution: complete one stage, review/rework, commit, summarize, then stop before moving on.

Checks:

- Scope accepted.
- OperationReceipt contract accepted or adjusted.
- Parallel workstream ownership accepted.
- No global dashboard/state-machine creep.

Exit condition: implementation agents can start from this plan.

### Gate 1 — Reproduction-first review

Reviewer: orchestrator.

Status: completed. Stage 2 added red reproduction tests for the highest-risk findings before fixes: scoped `/pending` copy, project destination fallback, and dry-run preview semantics.

Checks:

- Each bug-fix finding has failing test or explicit manual reproduction.
- Tests mock TickTick/Gemini.
- No implementation merged before reproduction exists, except pure refactor scaffolding.

Exit condition: red tests demonstrate trust failures.

### Gate 2 — Contract review

Reviewer: oracle recommended.

Status: partially completed. Contract seed, glossary, invariant tests, docs, and oracle review are complete. Remaining Gate 2 work is mapping the accepted contract to pipeline/callback/reorg paths without turning it into a global state manager.

Checks:

- Receipt status/scope model covers all flows without becoming global state platform.
- Safe defaults enforced at type/helper level.
- No raw private text in telemetry contract.
- Docs updated for architecture contract.

Exit condition: receipt contract approved and mapped to pipeline/callback/reorg paths.

### Gate 3 — Backend correctness review

Reviewer: orchestrator + targeted oracle if risk expands.

Checks:

- Project routing cannot silently fallback.
- Dry-run cannot mutate.
- Lock always releases.
- Deferred/failure paths do not imply success.
- Stale preview guarded.
- Partial success/undo metadata correct.

Exit condition: backend tests pass and code review finds no unsafe write path.

### Gate 4 — UX trust review

Reviewer: designer.

Checks:

- Each card answers: what is this, what changed, what next.
- Status labels are stable and scoped.
- Normal status is not a debug dump.
- Buttons use consistent vocabulary.
- Briefing remains action-oriented and not argumentative.

Exit condition: transcript review approved for `/scan`, `/pending`, `/status`, review card, confirmation, applied receipt, failed/deferred receipt, briefing.

### Gate 5 — Full regression and docs review

Reviewer: orchestrator.

Checks:

- `npm test` passes.
- `npm run check:test-sizes` passes.
- `npm run docs:map` run if required.
- README updated for command semantics.
- `docs/ARCHITECTURE.md` updated for receipt/state contract.
- `services/user_context.example.js`, `.env.example`, and `render.yaml` updated if config/env changed.
- No secrets or personal data committed.

Exit condition: repository ready for commit/PR.

### Gate 6 — Final product acceptance

Reviewer: user/orchestrator.

Checks against product vision:

- Bot is more truthful without becoming noisy.
- User can tell what changed, what did not change, what is waiting, and where task lives.
- System still helps execution: top priorities, first action, low cognitive load.
- Assertive coaching remains confidence-gated.

Exit condition: implementation meets this plan’s acceptance criteria.

## Suggested agent launch matrix

Batch 1 — parallel, no shared edits except tests/docs drafts:

- Agent A: draft `OperationReceipt` spec and contract tests.
- Agent B: project routing failing tests and resolver design.
- Agent C: command semantics failing tests for `/scan`, `/pending`, `/status`.
- Agent D: UX vocabulary/copy inventory and target transcript fixtures.
- Agent E: stale preview/lock/partial batch failing tests.

Batch 2 — bounded implementation after contract settles:

- Agent A: implement receipt helpers and pipeline mapping.
- Agent B: implement routing safety.
- Agent E: implement lock/stale/deferred/partial receipts.

Batch 3 — UI integration:

- Agent C: command rendering and reconciliation copy.
- Agent D: keyboard labels, card formatting, status/briefing cleanup.

Batch 4 — validation:

- Agent F: docs, function map, full test run.
- Oracle: backend architecture review.
- Designer: transcript UX review.

## Definition of done

All finding-level acceptance criteria pass, validation gates 0–6 are complete, and the final transcript set proves:

1. Preview-only actions say nothing changed.
2. Applied actions say exactly what changed and where.
3. Missing/ambiguous project routing blocks or asks confirmation.
4. `/pending` and `/status` are scoped and cannot mislead.
5. Busy/deferred/failed states are visible and calm.
6. Debug internals are absent from normal UX.
7. Briefing remains focused on execution, not diagnostics.
8. Tests and docs support the new behavior.
