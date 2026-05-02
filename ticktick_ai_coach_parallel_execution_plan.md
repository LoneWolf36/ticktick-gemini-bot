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

### Stage 3 — Production fixes for trust regressions — completed

Scope completed:

- Scoped `/pending` empty-state copy to the local review queue and reported live TickTick count separately.
- Removed unsafe first-project fallback from pipeline default project resolution.
- Blocked create actions when no configured/default/Inbox destination can be resolved.
- Changed dry-run results from task-shaped success to preview-only semantics with `changed=false`, `applied=false`, and no adapter writes.

Production fixes:

- F1: `/pending` now says the local review queue is empty and separately reports TickTick live-task state, avoiding false implication that TickTick itself has no tasks.
- F3: when Inbox/default project is missing, the pipeline returns `type: blocked` and performs no create call instead of writing to the first available project.
- F6: dry-run now returns `type: preview` with copy stating nothing changed; create/update/complete/delete adapter calls remain zero.

Validation completed:

- `node --test tests/regression.scheduler-status-commands.test.js` → 4/4 pass.
- `node --test tests/regression.mutation-confirmation-gate.test.js` → 19/19 pass.
- `node --test tests/regression.pipeline-hardening-mutation.test.js` → 41/41 pass.
- `npm run check:test-sizes` → pass.
- `npm test` → 697 pass, 0 fail.

Stage 3 acceptance status:

- Red Stage 2 tests now green via production fixes: complete.
- No silent write fallback remains in the free-form pipeline when destination is missing: complete.
- Dry-run no longer reports applied/task-shaped success: complete.
- `/pending` copy declares local-vs-live scope: complete.
- Result-shape contract change documented after review; `context/refs/codebase-function-map.md` regenerated because `preview` and `blocked` are now public pipeline result types: complete.

### Stage 3 review — Preview consumers and contract cleanup — completed

Scope completed:

- Reviewed the Stage 2 and Stage 3 diffs against the trust-state contract and command consumers.
- Fixed scan/review dry-run consumers so `type: preview` results still queue review cards instead of falling through to `unknown_result_type: preview` and replying `No tasks to review.`
- Preserved dry-run truth on blocked missing-destination results by returning `dryRun=true` when the caller requested dry-run.
- Updated the public pipeline JSDoc/result contract to include `preview` and `blocked`, then regenerated `context/refs/codebase-function-map.md`.
- Tightened Stage 2/3 regression tests so they assert exact blocked/preview contracts, `changed=false`, `applied=false`, and zero mutation calls.

Review findings fixed:

- `/scan` and `/review` preview result handling now accepts both legacy `task` results and new `preview` results when building the local review queue.
- Dry-run missing-destination blocks remain non-mutating and now truthfully report `dryRun=true`.
- Pipeline return-shape docs now match production behavior.
- Regressions now pin the intended contract rather than allowing multiple safe-but-different result types.

Validation completed after review fixes:

- `node --test tests/regression.scheduler-status-commands.test.js` → 5/5 pass.
- `node --test tests/regression.mutation-confirmation-gate.test.js` → 20/20 pass.
- `node --test tests/regression.pipeline-hardening-mutation.test.js` → 41/41 pass.
- `npm run check:test-sizes` → pass.
- `npm run docs:map` → pass.
- `npm test` → 699 pass, 0 fail.

Stage 3 review acceptance status:

- Concrete review findings fixed with regression coverage: complete.
- Public pipeline result contract and generated function map aligned: complete.
- Full regression suite green after fixes: complete.
- Remaining trust risks are deferred to later stages unless selected next: explicit bad `projectHint` still falls back to the configured default project, and `/pending` live count degrades to unknown on TickTick read failure.

### Stage 4 — Pipeline-only OperationReceipt production mapping — completed

Scope completed:

- Mapped pipeline terminal outcomes to `OperationReceipt` without adding a global state machine.
- Kept Stage 4 pipeline-only: `bot/callbacks.js` and `services/reorg-executor.js` receipt mapping remain deferred.
- Attached receipts to representative pipeline outcomes: preview, blocked, pending confirmation when destination is safely known, applied success, failed adapter/system paths, and deferred queue paths.
- Preserved legacy pipeline result envelopes for callers while adding `operationReceipt` as the structured truth surface.
- Added test harness support for deferred-intent injection so quota/deferred paths can be reproduced without live Gemini or TickTick calls.

Production mapping details:

- Added internal receipt-building helpers in `services/pipeline.js`:
  - `buildOperationReceipt(...)` validates every generated receipt through `assertValidOperationReceipt(...)`.
  - `resolveReceiptCommand(context)` maps Telegram scan/review/status/pending, scheduler/deferred retry, callbacks, and free-form entry points into canonical command values.
  - `inferOperationType(actions)` whitelists supported operation types so unsupported action types cannot crash receipt creation.
  - `resolveReceiptDestinationForPendingMutation(action, context)` only emits create/update pending-confirmation destinations when the proposed destination exists in `context.availableProjects`.
  - Applied receipt messages use privacy-safe count-only copy and stay separate from Telegram confirmation text.
- Applied receipts now derive `changed`/`applied` from actual successful adapter results, not merely from normalized actions.
- Zero-success safety paths such as scheduler `blockedActionTypes` now produce non-applied blocked receipts.
- Deferred queue outcomes now use `status: deferred`, `scope: deferred_queue`, `changed=true`, `applied=false`, and `fallbackUsed=true` when a deferred intent is persisted.
- AI hard-quota deferral now passes deferred intent details into failure/receipt mapping so the receipt matches the user-facing retry copy.
- Adapter failures return valid failed receipts with safe messages rather than raw task text.
- Pending-confirmation delete/complete receipts omit destinations; create/update receipts include only verified real project destinations.
- Unknown or stale model-supplied `projectId` values no longer become fake `configured` destinations.

Review findings fixed before commit:

- P0: applied receipt no longer leaks raw task titles via `confirmationText`.
- P0: fake `projectId: pending` destination removed.
- P0: skipped-only/blocked-action runs no longer report applied changes.
- P1: deferred adapter and AI quota paths now report deferred receipts instead of failed/system/unchanged.
- P1: dry-run AI quota failures stay blocked and do not enqueue deferred retries.
- P1: receipt command no longer hardcodes `freeform` for scan/scheduler/deferred surfaces.
- P1: pending update destination now comes from proposed destination, not the current task project.
- P1: proposed `projectId` is verified against `availableProjects` before receipt emission.
- P1: unsupported operation types cannot produce invalid receipt vocabulary.
- P2: tests now assert exact receipt fields, privacy invariants, changed/applied truth, deferred state, command mapping, and destination safety.

Validation completed:

- `node --test tests/regression.mutation-confirmation-gate.test.js` → 29/29 pass.
- `node --test tests/regression.operation-receipt-contract.test.js` → 12/12 pass.
- `node --test tests/regression.pipeline-hardening-mutation.test.js` → 41/41 pass.
- `npm run check:test-sizes` → pass.
- `npm test` → 708 pass, 0 fail.

Stage 4 acceptance status:

- Pipeline terminal outcomes expose canonical OperationReceipt data: complete for selected pipeline paths.
- Receipts are validated at construction time and fail closed on invalid vocabulary/invariants: complete.
- Receipt messages avoid raw task title/checklist/user-text leakage: complete for mapped pipeline receipts.
- Destination confidence no longer trusts fake/stale project ids: complete for mapped pending-confirmation receipts.
- Deferred and dry-run states preserve truthful changed/applied/dryRun semantics: complete.
- Callback and reorg receipt mapping remain explicitly out of Stage 4 scope and should be handled in later stages.

### Stage 5 — Routing, command semantics, and UX trust hardening — completed

Commit: `bcc0ff9 fix: harden trust routing and review races`

Scope completed:

- Hardened project destination resolution for create/write flows.
- Removed silent fallback from explicit unresolved project hints to configured defaults.
- Treated duplicate destination names/defaults as ambiguous and blocked, not as first-match writes.
- Accepted exact opaque project IDs and exact single project-name matches as safe destinations.
- Blocked ambiguous create destinations instead of exposing a confirmation flow that did not yet have project-choice UI.
- Cleaned normal `/status` into a user-facing health surface and removed Gemini key/cache/raw auto-apply debug leakage.
- Standardized review button vocabulary from `Refine`/`Keep` drift to `Edit`/`Skip` where appropriate.
- Compacted briefing summary layout to clearer Focus / Top priorities / Why it matters / First action / Notes sections.
- Added per-task review claims so concurrent Apply/Skip/Delete taps cannot double-mutate or resolve the same local review item twice.

Production fixes:

- Workstream B: deterministic project routing now fails closed on missing, ambiguous, or unmatched destinations.
- Workstream C: `/status` now separates TickTick live state, local review queue, deferred queue, running job, recent activity, and coarse automation state.
- Workstream D: review buttons and summary copy are more consistent and less noisy.
- Workstream E: duplicate review callback races now fail closed with already-handled copy instead of duplicate writes.

Validation completed:

- `npm run check:test-sizes` → pass.
- Targeted routing/review/status/summary suites → pass.
- `npm test` → 722 pass, 0 fail.
- Oracle review after rework → safe to commit.
- `git status --short` after commit → clean.

Stage 5 acceptance status:

- Missing/ambiguous/unmatched project routing blocks safely: complete.
- Exact/configured destination routing works without substring/fuzzy inference: complete.
- Normal `/status` no longer leaks debug internals: complete.
- Review button vocabulary drift reduced: complete.
- Duplicate callback mutation race guarded for review actions: complete.

### Stage 6 — Receipt trust surfaces for busy, stale, partial, and reorg flows — completed

Commit: `c38646b feat: harden receipt trust surfaces`

Scope completed:

- Added shared busy-lock copy/receipt formatting for `/scan` and `/review` lock contention.
- Added stale preview revalidation before pending review apply/delete/complete mutations.
- Added stale/missing/revalidation-error safe blocking behavior and stale-card parking.
- Added safe partial batch receipt counts for succeeded, failed, and actually rolled-back actions.
- Added structured reorg execution summaries and validated reorg operation receipts.
- Split oversized reorg receipt tests into a focused regression file.
- Updated JSDoc and regenerated `context/refs/codebase-function-map.md` for new/changed exports.

Production fixes:

- Workstream A: receipt vocabulary now covers more terminal mutation-like paths beyond pipeline-only outcomes.
- Workstream E: stale pending-review previews no longer blindly mutate changed/deleted/live tasks.
- Workstream E/F: rollback-failure receipts count only records actually rolled back, not attempted rollback records.
- Reorg apply copy distinguishes real TickTick changes from local-only drops.
- Busy lock collisions now use stable product copy instead of ad-hoc command text.

Validation completed:

- `npm run check:test-sizes` → pass.
- Targeted receipt/reorg/stale/lock suites → pass.
- `npm test` → 731 pass, 0 fail.
- Oracle review after rework → no blockers.
- `git status --short` after commit → clean.

Stage 6 acceptance status:

- Busy lock user-facing receipt/copy: complete.
- Mid-operation lock cleanup coverage: complete.
- Stale pending-review apply/delete/complete guard: complete for review callbacks.
- Partial batch receipt counts: complete for covered pipeline rollback/failure paths.
- Reorg apply receipt mapping: complete.

### Stage 7 — Callback receipt and undo parity — completed

Commit: `ed5d0aa feat: unify callback receipts and undo`

Scope completed:

- Added `bot/pipeline-result-receipts.js` as a shared Telegram receipt/undo helper for pipeline task results.
- Refactored free-form mutation replies in `bot/commands.js` to use the shared helper.
- Routed resumed mutation callbacks (`mut:confirm`, `mut:pick`) through the same receipt/undo helper.
- Routed checklist clarification success callbacks through the same receipt/undo helper.
- Persisted undo entries only when rollback metadata exists and persistence succeeds.
- Kept applied receipts visible even when undo persistence fails; no undo button is shown in that case.
- Reused already-fetched callback project context after mutation so a post-mutation project-list failure cannot mask an applied write.
- Updated callback receipt regressions, helper regressions, docs, AGENTS module list, and generated function map.

Production fixes:

- Free-form writes and callback-resumed writes now share the same visible receipt and undo affordance behavior.
- Callback dry-runs do not persist undo entries.
- Partial undo persistence still exposes undo when at least one rollback entry was saved.
- Checklist callback success no longer falls back to raw `confirmationText` with no undo affordance.

Validation completed:

- `node --test tests/regression.telegram-callback-receipts.test.js tests/regression.checklist-clarification.test.js` → 27/27 pass.
- `npm run check:test-sizes` → pass.
- `npm test` → 741 pass, 0 fail.
- Oracle review blocker fixed before commit.
- `git status --short` after commit → clean.

Stage 7 acceptance status:

- Callback mutation receipt parity with free-form writes: complete.
- Callback undo affordance parity: complete.
- Undo button shown only after rollback persistence succeeds: complete.
- Applied mutation remains truthfully reported if undo persistence fails: complete.
- Docs/function map synced: complete.

### Stage 8 — Deferred retry trust boundary — completed

Stage 8 closed the remaining truth gaps around deferred retry, command sync snapshots, routing semantics, and telemetry privacy.

Remaining root cause:

- Scheduler-owned deferred retry now renders through the same receipt boundary as free-form/callback writes.
- Command sync snapshot is the durable source for the last known live TickTick read, so `/status` can truthfully scope live-vs-local state without a global machine.

Planned scope:

- Deferred retry and poll auto-apply share privacy-safe receipt rendering.
- Terminal telemetry is emitted with safe receipt metadata only.
- Result copy remains count-safe and scope-safe.

Likely files:

- `services/scheduler.js`
- `bot/pipeline-result-receipts.js` or a scheduler-safe sibling formatter if Telegram-specific keyboard output is unsuitable
- `services/store.js` only if redacted deferred/DLQ metadata needs shape changes
- `tests/regression.scheduler-grace-window.test.js`
- `tests/regression.pipeline-logging-privacy.test.js`
- `docs/ARCHITECTURE.md`
- `README.md` if user-visible deferred retry copy changes

Safe failure defaults:

- Retry result lacks valid receipt → do not send success copy; keep/dead-letter according to retry policy.
- Applied but undo persistence fails → report applied, omit undo affordance, and do not claim rollback is available.
- Permanent failure → DLQ with safe reason/count/id only, no raw user message.
- Transient failure → stay queued, increment retry/backoff, no success notification.

Validation completed:

- Full regression suite green at 783/783.
- `npm run check:test-sizes` → pass.
- `npm run docs:map` → pass.
- Acceptance audit reconciled against receipt/sync-snapshot architecture.

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

Status: mostly complete for pipeline, reorg, free-form, review, callback, and receipt contract surfaces. Remaining A/F work is telemetry/privacy standardization for deferred scheduler retry and any uncovered model-degraded paths.

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

Status: complete for current MVP routing policy. Exact project IDs, one exact project-name match, and configured defaults are allowed; missing, unmatched, or ambiguous destinations block safely. No explicit fallback policy was added because default-off safe behavior met the current need.

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

Status: mostly complete for `/scan`, `/pending`, `/status`, local review queue copy, running-job/busy state, and debug leakage removal. Remaining C work is deferred retry notification/status semantics.

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

Status: mostly complete for normal `/status`, review buttons, applied/callback receipts, and briefing density. Remaining D work is deferred retry notification copy and any final transcript polish after Stage 8.

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

Status: partially complete. Busy lock copy, mid-operation lock cleanup coverage, stale review-preview revalidation, partial receipt counts, reorg receipts, and callback undo parity are complete. Deferred retry/outage handling remains the active gap.

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

Status: active throughout. Regression suites, docs, test-size guard, and function map have been kept current through Stage 7. Continue for Stage 8.

## Serial integration order

Parallel discovery/test drafting may happen early, but merge order should be:

1. Contract and glossary accepted. **Completed in Stage 1 (`c5b369a`).**
2. Failing tests added for highest-risk findings. **Completed in Stage 2.**
3. OperationReceipt helpers and pipeline mapping. **Completed through Stage 4 (`2c5b461`).**
4. Project routing safety. **Completed in Stage 5 (`bcc0ff9`).**
5. Lock/deferred/stale-preview receipts. **Busy, stale review-preview, partial, and reorg paths completed in Stage 6 (`c38646b`); deferred retry remains Stage 8.**
6. Command semantics and reconciliation copy. **Mostly completed in Stage 5; deferred retry/status semantics remain.**
7. Telegram UX vocabulary cleanup. **Mostly completed in Stage 5 and Stage 7.**
8. Telemetry/privacy standardization. **Partially complete for receipts; deferred scheduler retry privacy remains.**
9. Docs and generated function map. **Kept current through Stage 7 (`ed5d0aa`).**
10. Full validation review. **Completed after each committed stage; continue for Stage 8.**

Do not let multiple agents simultaneously edit the same high-coupling files without handoff:

- `services/pipeline.js`
- `bot/commands.js`
- `bot/callbacks.js`
- `services/store.js`

## Findings, owners, and acceptance criteria

### F1 — Source-of-truth vs local working state is unclear

Owner: Workstreams A, C.

Current status: mostly complete. `/pending` is scoped to local review queue; `/status` separates TickTick live state, local queue, deferred queue, running job, recent activity, and automation state. Remaining gap: deferred retry status/notification semantics.

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

Current status: mostly complete. Pipeline, free-form writes, mutation callbacks, checklist callbacks, reorg apply, busy lock, stale preview, and partial batch paths now expose or render structured trust states. Remaining gap: deferred retry notifications.

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

Current status: complete for current policy. Missing, unmatched, duplicate, or ambiguous destinations block safely; exact project IDs, one exact project-name match, and configured defaults are allowed; first-project fallback is removed from the write path.

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

Current status: complete for scan/review/poll lock surfaces currently covered. Lock collision uses stable busy copy, stale locks self-heal, and mid-operation throw cleanup is regression-tested.

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

Current status: partially complete through pipeline receipt failure/block handling. Remaining work: verify model fallback/degraded output and scheduler retry notifications cannot surface raw diagnostics or success-like copy.

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

Current status: mostly complete. Dry-run returns preview semantics with no adapter writes; applied writes use structured receipts in free-form and callback paths. Remaining polish: final transcript sweep after deferred retry work.

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

Current status: mostly complete. `/pending` and `/status` copy is scoped and debug leakage is removed from normal `/status`. Remaining gap: deferred retry should report count-safe state consistently.

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

Current status: complete for normal `/status`; Gemini key index, cache age, and raw auto-apply mode no longer appear in the normal status output. Continue to guard deferred notifications/logs in Stage 8.

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

Current status: mostly complete for review cards and documented user-facing button vocabulary. Remaining polish: re-check any deferred/retry notification actions after Stage 8.

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

Current status: mostly complete. Briefing formatter now uses shorter Focus / Top priorities / Why it matters / First action / Notes structure with mode-sensitive density. Remaining polish: manual transcript review.

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

Current status: mostly complete. Non-exact destructive task mutations use confirmation gates; ambiguous destination creates now block safely until project-choice UI exists; callback resume paths use shared receipts and undo parity. Remaining gap: deferred retry should not bypass state validation semantics.

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

Current status: complete for local pending-review callbacks. Apply/delete/complete revalidate live snapshots, block on stale/missing/error states, and avoid blind mutations. Remaining gap: deferred retry and any non-review queued preview surfaces.

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

Current status: mostly complete for pipeline/reorg/callback-visible paths. Partial receipts include safe counts, undo entries are tied to successful rollback metadata, and callback/free-form undo affordances are consistent. Remaining gap: deferred retry undo persistence.

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

Current status: completed. Pipeline quota/deferred receipt semantics exist, scheduler retry/degraded notifications are product-safe and non-diagnostic, and terminal receipts carry scoped fallback metadata only.

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

Current status: completed. Operation receipts reject raw diagnostic/private text fields, mapped receipt messages are count-safe, and terminal telemetry now emits privacy-safe receipt metadata without raw task/user text.

Acceptance criteria:

- Operation boundaries emit privacy-safe terminal receipt telemetry with command, operation type, status/scope, dry-run/applied booleans, changed flag, destination confidence, error class, and counts.
- No raw task titles, descriptions, checklist items, or free-form user message text in structured logs by default.
- Trace IDs and latency remain available on ordinary pipeline step telemetry where already implemented; terminal receipt telemetry stays count-based and privacy-safe.
- Tests or static checks verify known sensitive fields are not emitted in telemetry helpers.

Validation:

- Unit-test telemetry event construction.
- Review log samples from test run.
- Confirm privacy constraints in docs.

## Test plan

Automated tests must be mocked and deterministic.

Required regression groups:

1. Receipt contract tests. **Completed in Stage 1.**
2. Project routing resolver tests. **Completed through Stage 5.**
3. Dry-run vs apply tests. **Completed through Stage 4/5; continue guarding callback/deferred paths.**
4. Command semantics tests for `/scan`, `/pending`, `/status`. **Mostly complete; deferred retry/status semantics remain.**
5. Lock/busy cleanup tests. **Completed for intake lock and scan/review busy paths.**
6. Malformed model output recovery tests. **Partial; model/deferred degraded copy remains.**
7. Stale preview apply tests. **Completed for pending-review callbacks.**
8. Partial batch/undo tests. **Completed for pipeline/reorg/callback paths; deferred retry undo remains.**
9. Telemetry privacy tests. **Partial; scheduler deferred retry privacy remains.**
10. Telegram keyboard/action vocabulary tests. **Mostly complete for review/callback surfaces.**
11. Briefing formatter structure tests. **Completed for current summary formatter behavior.**

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

Status: mostly completed. Contract seed, glossary, invariant tests, docs, oracle review, pipeline mapping, reorg receipts, busy/stale/partial receipts, and callback receipt/undo parity are complete. Remaining Gate 2 work is deferred retry receipt mapping without turning it into a global state manager.

Checks:

- Receipt status/scope model covers all flows without becoming global state platform.
- Safe defaults enforced at type/helper level.
- No raw private text in telemetry contract.
- Docs updated for architecture contract.

Exit condition: receipt contract approved and mapped to pipeline/callback/reorg paths.

### Gate 3 — Backend correctness review

Reviewer: orchestrator + targeted oracle if risk expands.

Status: mostly completed. Project routing, dry-run, lock release, stale review-preview, partial success, and undo metadata correctness are covered. Remaining backend risk is deferred scheduler retry applying writes outside the shared receipt/undo boundary.

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

Status: mostly completed. Normal `/status`, review button vocabulary, briefing density, and mutation/callback receipts have been tightened. Remaining UX review should focus on deferred retry notification wording and final Telegram transcript sweep.

Checks:

- Each card answers: what is this, what changed, what next.
- Status labels are stable and scoped.
- Normal status is not a debug dump.
- Buttons use consistent vocabulary.
- Briefing remains action-oriented and not argumentative.

Exit condition: transcript review approved for `/scan`, `/pending`, `/status`, review card, confirmation, applied receipt, failed/deferred receipt, briefing.

### Gate 5 — Full regression and docs review

Reviewer: orchestrator.

Status: completed for Stages 1–7. Each committed stage passed `npm test`, `npm run check:test-sizes`, and `npm run docs:map` when required. Repeat after Stage 8.

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
