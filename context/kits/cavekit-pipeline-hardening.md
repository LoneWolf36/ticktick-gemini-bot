---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-25T10:40:00Z"
source_specs: ["003-pipeline-hardening-and-regression"]
complexity: "complex"
---

# Cavekit: Pipeline Hardening

## Scope

Testing harness, failure classification, quota semantics, retry/rollback, burst regression, and end-to-end observability for the task operations pipeline. This domain ensures the pipeline defined in cavekit-task-pipeline is resilient, traceable, and regression-proof.

See `context/refs/research-003-pipeline-hardening-and-regression.md` for library evaluation.
See `context/refs/data-model-003-pipeline-hardening-and-regression.md` for data model.
See `context/refs/pipeline.openapi.yaml` for API contracts.
See `context/refs/telemetry-events.schema.json` for telemetry schema.

## Requirements

### R1: Canonical Pipeline Context
**Description:** A single pipeline context object carries the full lifecycle state of every request from entry to adapter response.
**Acceptance Criteria:**
- [x] Pipeline context includes: request metadata, intent extraction output, normalized actions, adapter requests/results, validation failures, timing, and correlation ID
- [x] Context is immutable after each stage writes to it — no later stage mutates earlier fields
- [x] Pipeline context is available to all observability consumers without requiring separate instrumentation
**Dependencies:** none

### R2: Entry-Point Context Wiring
**Description:** Every entry point (Telegram handler, bot command, scheduled job) creates and passes a pipeline context to the pipeline.
**Acceptance Criteria:**
- [x] Telegram message handler creates a context before any pipeline call
- [x] Bot command handlers create contexts for mutation flows
- [x] Scheduled jobs (briefing, scan) create contexts for their pipeline interactions
**Dependencies:** R1

### R3: Failure Classification
**Description:** Pipeline failures are classified into deterministic categories with appropriate user messaging and recovery semantics.
**Acceptance Criteria:**
- [x] Classification categories: transient (API timeout, rate limit), permanent (invalid input, missing project), partial (some tasks succeeded, some failed)
- [x] Transient failures trigger retry; permanent failures surface clear user-facing error; partial failures report what succeeded and what failed
- [x] User-facing error messages are terse, actionable, and do not expose internal details
**Dependencies:** R1

### R4: Quota and Rate-Limit Semantics
**Description:** TickTick API quota and rate-limit responses are handled with backoff and user notification.
**Acceptance Criteria:**
- [x] Rate-limit responses (429) trigger exponential backoff with configurable max retries
- [x] User is informed when rate limits prevent immediate execution with ETA if available
- [x] Quota exhaustion is distinguishable from transient failure
**Dependencies:** R3

### R5: Retry and Rollback
**Description:** Transient failures trigger automatic retry with rollback for partially completed multi-task operations.
**Acceptance Criteria:**
- [x] Single-task transient failures retry up to configured max with exponential backoff
- [x] Multi-task operations that partially succeed report which tasks were created and which failed
- [x] No silent data loss — every parsed intent is either executed, retried, or surfaced to the user as failed
**Dependencies:** R3, R4

### R6: Direct Pipeline Harness
**Description:** A test harness exercises the full pipeline path without requiring Telegram or live TickTick.
**Acceptance Criteria:**
- [x] Harness accepts JSON input representing user messages and returns pipeline context output
- [x] Harness supports mocked adapter responses for testing failure paths
- [x] Harness validates pipeline contracts without network dependencies
- [x] See `context/refs/pipeline-harness.js` for reference implementation
**Dependencies:** R1

### R7: Story-Level Regression Coverage
**Description:** Every user story from cavekit-task-pipeline has at least one automated regression test.
**Acceptance Criteria:**
- [x] Single-task creation produces clean title, correct date, correct project
- [x] Multi-task creation produces correct count of separate tasks
- [x] Recurring intent produces single recurring task
- [x] Multi-day intent produces separate dated tasks
- [x] Mutation flows resolve correct target or ask clarification
- [x] Failure paths surface user-friendly errors
**Dependencies:** R6

### R8: Burst Regression
**Description:** Pipeline handles burst scenarios (rapid successive messages, concurrent requests) without data loss or corruption.
**Acceptance Criteria:**
- [x] 5+ messages sent within 2 seconds all produce correct pipeline outcomes
- [x] No race conditions in adapter write paths
- [x] Pipeline context isolation prevents cross-request contamination
**Dependencies:** R6

### R9: Observability Integration
**Description:** Pipeline telemetry is structured, queryable, and compatible with the behavioral memory boundary.
**Acceptance Criteria:**
- [x] Telemetry events conform to `context/refs/telemetry-events.schema.json`
- [x] End-to-end request tracing via correlation ID from entry point to adapter result
- [x] Telemetry does not persist raw user messages in long-term storage
**Dependencies:** R1

### R10: Acceptance Matrix Coverage
**Description:** All acceptance criteria across cavekit-task-pipeline and this kit are tracked in a matrix.
**Acceptance Criteria:**
- [x] Every FR maps to at least one test case in the harness
- [x] See `context/refs/acceptance-matrix.json` for tracking
**Dependencies:** R6, R7

### R11: Adapter Failure Surfacing
**Description:** When an adapter operation fails (target already deleted externally, permission error), the failure is surfaced clearly.
**Acceptance Criteria:**
- [x] Adapter returns typed error objects distinguishing "not found", "already completed", "permission denied", "network error"
- [x] Pipeline translates adapter errors to user-friendly messages without exposing API internals
**Dependencies:** R3

### R12: Graceful Degradation Under API Unavailability
**Description:** When TickTick API is completely unavailable, parsed intents are preserved for later retry or manual recovery.
**Acceptance Criteria:**
- [x] Pipeline does not discard parsed intent on API unavailability
- [x] User is informed that execution is deferred with reason
- [x] Deferred intents can be retried when API recovers
**Dependencies:** R3, R5

## Out of Scope

- Load testing at production scale (SaaS-level concerns)
- Multi-tenant isolation for failure handling
- Custom alerting/monitoring infrastructure

## Cross-References

- See also: cavekit-task-pipeline.md (the pipeline this domain hardens)
- See also: cavekit-behavioral-memory.md (telemetry boundary)

## Validation Action Items — 2026-04-19

- [x] `tests/e2e-live-ticktick.mjs` mapped as optional live smoke-test harness for production-parity verification (complements R6's offline harness).
- [x] Drift notes for live TickTick E2E harness resolved by mapping above.

## Validation Action Items — 2026-04-20

- [x] R6 audited directly against `tests/pipeline-harness.js` and `context/refs/pipeline-harness.js`: harness accepts structured input, supports `adapterOverrides` for failure-path mocking, uses in-memory fixtures, and runs without Telegram or live TickTick.
- [x] R9 audited directly against `services/pipeline-observability.js`, `context/refs/telemetry-events.schema.json`, and `tests/regression.pipeline-hardening-mutation.test.js` (`WP06 T017`): emitted events keep the required schema fields, preserve `requestId` tracing across request/execution/result steps, and avoid raw user-message persistence in telemetry payloads.
- [x] R1 audited directly against `services/pipeline-context.js`, `services/pipeline.js`, `services/pipeline-observability.js`, `tests/pipeline-context.test.js`, and `tests/regression.pipeline-hardening-mutation.test.js`: immutable lifecycle snapshots now capture request metadata, correlation ID, intent extraction output, normalization state, execution requests/results, validation failures, timing, and final result; observability sinks receive the canonical context without changing the telemetry event schema.
- [x] R2 completed: `pipeline.js` exposes `createRequestContext()`, `scheduler.js` wraps pipeline calls in `processPipelineMessage()` constructing context first, and bot handlers pass context through pipeline options.
- [x] R3 audited directly against `services/pipeline.js`, `tests/regression.pipeline-hardening-mutation.test.js`, and `tests/regression.adapter-execution-reorg.test.js`: pipeline failures now classify deterministic transient/permanent/partial categories, transient adapter failures retry once automatically, permanent failures surface corrective user-safe messaging, and partial failures report success/failure counts without exposing internal details.
- [x] R4 audited directly against `services/ticktick.js`, `services/ticktick-adapter.js`, `services/pipeline.js`, `tests/regression.adapter-execution-reorg.test.js`, and `tests/regression.pipeline-hardening-mutation.test.js`: TickTick 429 responses now retry with configurable exponential backoff, preserve `Retry-After`/`retry_after` ETA metadata, fail fast on oversized retry windows, surface ETA-aware user messaging, and distinguish quota exhaustion from transient rate limiting.
- [x] R5 audited directly against `services/pipeline.js` and `tests/regression.pipeline-hardening-r5-r11.test.js`: pipeline retry/rollback now uses configurable exponential backoff for transient non-429 single-task failures, partial multi-task failures surface rolled-back and failed task labels clearly, and pending parsed actions are surfaced explicitly instead of dropping silently.
- [x] R7 audited directly against `tests/regression.pipeline-hardening-mutation.test.js`, `tests/regression.pipeline-multi-create-clarification.test.js`, and `tests/normalizer.test.js`: single-task/title-date-project behavior, multi-task count, recurring intent normalization, multi-day splitting, mutation target resolution/clarification, and user-safe failure messaging now all have explicit regression anchors.
- [x] R8 audited directly against `tests/regression.pipeline-hardening-mutation.test.js` (`burst pipeline requests remain isolated and deterministic`): burst runs now assert <2s completion window, per-request requestId isolation, non-overlapping successful adapter write titles, and request-local action titles under concurrent load.
- [x] R10 audited directly against `context/refs/acceptance-matrix.json`: full FR-to-test mapping is now tracked for both `cavekit-task-pipeline` and `cavekit-pipeline-hardening` requirement sets.
- [x] R11 audited directly against `services/ticktick-adapter.js`, `services/pipeline.js`, and `tests/regression.pipeline-hardening-r5-r11.test.js`: adapter failures now normalize to typed `NOT_FOUND`, `ALREADY_COMPLETED`, `PERMISSION_DENIED`, and `NETWORK_ERROR` codes, and pipeline surfacing turns them into user-safe messages without leaking API internals.
- [x] R12 completed: `pipeline.js` defers parsed intents on API unavailability with user messaging, `store.js` provides `deferredPipelineIntents` CRUD (`appendDeferredPipelineIntent`, `getDeferredPipelineIntents`, `removeDeferredPipelineIntent`) for persistence, `scheduler.js` exports `retryDeferredIntents()` with health-check gating, batch processing, transient/permanent classification, and user notification. 15 regression tests in `tests/regression.scheduler-grace-window.test.js` cover store CRUD, retry success/failure/batch-limit/notification/fallback paths.

## Changelog
- 2026-04-25: R12 hardened — `retryDeferredIntents()` added to `scheduler.js` with health-check gating, batch processing, transient/permanent classification, user notification. DRY: `processMessageWithContext()` extracted to `pipeline.js`. 15 regression tests added covering store CRUD, retry paths, batch limits, notification, and fallback.
- 2026-04-25: R2 completed — `pipeline.js` exposes `createRequestContext()`, `scheduler.js` wraps calls in `processPipelineMessage()`, bot handlers pass context through pipeline options.
- 2026-04-25: R12 completed — pipeline defers parsed intents on API unavailability with user messaging, `store.js` provides deferred intent CRUD for persistence and retry.
- 2026-04-25: R7, R8, and R10 completed — story-level regression anchors now cover task-pipeline user stories end-to-end, burst regression now asserts timing + write-path isolation under concurrency, and acceptance-matrix tracking now maps both task-pipeline and hardening FRs to concrete automated tests.
- 2026-04-24: R11 completed — adapter failures now normalize to typed not-found, already-completed, permission-denied, and network-error codes, and pipeline surfacing translates them into safe user messages without leaking API internals.
- 2026-04-24: R5 completed — transient non-429 adapter failures now retry with configurable exponential backoff, partial failures surface rolled-back and failed task labels clearly, and execution accounting prevents silent drops for remaining parsed actions.
- 2026-04-18: Migrated from kitty-specs 003-pipeline-hardening-and-regression
- 2026-04-20: R6 and R9 completed — offline harness behavior and telemetry contract now have direct code + regression evidence.
- 2026-04-21: R1 completed — canonical immutable pipeline context now persists across request, intent extraction, normalization, execution, and result stages with observability access.
- 2026-04-22: R3 completed — pipeline failure handling now emits deterministic transient/permanent/partial categories with retry, corrective messaging, and partial-failure reporting covered by regression tests.
- 2026-04-22: R4 completed — TickTick 429 handling now uses configurable exponential backoff with ETA-aware user messaging, preserves rate-limit metadata through adapter and pipeline layers, and distinguishes quota exhaustion from transient rate limiting in regression coverage.
