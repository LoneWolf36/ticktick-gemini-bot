---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-21T13:45:00Z"
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
- [x] Pipeline context includes: request metadata, AX intent output, normalized actions, adapter requests/results, validation failures, timing, and correlation ID
- [x] Context is immutable after each stage writes to it — no later stage mutates earlier fields
- [x] Pipeline context is available to all observability consumers without requiring separate instrumentation
**Dependencies:** none

### R2: Entry-Point Context Wiring
**Description:** Every entry point (Telegram handler, bot command, scheduled job) creates and passes a pipeline context to the pipeline.
**Acceptance Criteria:**
- [ ] Telegram message handler creates a context before any pipeline call
- [ ] Bot command handlers create contexts for mutation flows
- [ ] Scheduled jobs (briefing, scan) create contexts for their pipeline interactions
**Dependencies:** R1

### R3: Failure Classification
**Description:** Pipeline failures are classified into deterministic categories with appropriate user messaging and recovery semantics.
**Acceptance Criteria:**
- [ ] Classification categories: transient (API timeout, rate limit), permanent (invalid input, missing project), partial (some tasks succeeded, some failed)
- [ ] Transient failures trigger retry; permanent failures surface clear user-facing error; partial failures report what succeeded and what failed
- [ ] User-facing error messages are terse, actionable, and do not expose internal details
**Dependencies:** R1

### R4: Quota and Rate-Limit Semantics
**Description:** TickTick API quota and rate-limit responses are handled with backoff and user notification.
**Acceptance Criteria:**
- [ ] Rate-limit responses (429) trigger exponential backoff with configurable max retries
- [ ] User is informed when rate limits prevent immediate execution with ETA if available
- [ ] Quota exhaustion is distinguishable from transient failure
**Dependencies:** R3

### R5: Retry and Rollback
**Description:** Transient failures trigger automatic retry with rollback for partially completed multi-task operations.
**Acceptance Criteria:**
- [ ] Single-task transient failures retry up to configured max with exponential backoff
- [ ] Multi-task operations that partially succeed report which tasks were created and which failed
- [ ] No silent data loss — every parsed intent is either executed, retried, or surfaced to the user as failed
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
- [ ] Single-task creation produces clean title, correct date, correct project
- [ ] Multi-task creation produces correct count of separate tasks
- [ ] Recurring intent produces single recurring task
- [ ] Multi-day intent produces separate dated tasks
- [ ] Mutation flows resolve correct target or ask clarification
- [ ] Failure paths surface user-friendly errors
**Dependencies:** R6

### R8: Burst Regression
**Description:** Pipeline handles burst scenarios (rapid successive messages, concurrent requests) without data loss or corruption.
**Acceptance Criteria:**
- [ ] 5+ messages sent within 2 seconds all produce correct pipeline outcomes
- [ ] No race conditions in adapter write paths
- [ ] Pipeline context isolation prevents cross-request contamination
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
- [ ] Every FR maps to at least one test case in the harness
- [ ] See `context/refs/acceptance-matrix.json` for tracking
**Dependencies:** R6, R7

### R11: Adapter Failure Surfacing
**Description:** When an adapter operation fails (target already deleted externally, permission error), the failure is surfaced clearly.
**Acceptance Criteria:**
- [ ] Adapter returns typed error objects distinguishing "not found", "already completed", "permission denied", "network error"
- [ ] Pipeline translates adapter errors to user-friendly messages without exposing API internals
**Dependencies:** R3

### R12: Graceful Degradation Under API Unavailability
**Description:** When TickTick API is completely unavailable, parsed intents are preserved for later retry or manual recovery.
**Acceptance Criteria:**
- [ ] Pipeline does not discard parsed intent on API unavailability
- [ ] User is informed that execution is deferred with reason
- [ ] Deferred intents can be retried when API recovers
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
- [x] R1 audited directly against `services/pipeline-context.js`, `services/pipeline.js`, `services/pipeline-observability.js`, `tests/pipeline-context.test.js`, and `tests/regression.pipeline-hardening-mutation.test.js`: immutable lifecycle snapshots now capture request metadata, correlation ID, AX output, normalization state, execution requests/results, validation failures, timing, and final result; observability sinks receive the canonical context without changing the telemetry event schema.
- [ ] R2 remains unchecked: entry points consistently pass pipeline options, but handlers do not themselves construct the full canonical context object before the pipeline call.
- [ ] R3 remains unchecked: failure handling exists, but the exact transient/permanent/partial classification contract in the AC is not implemented as written.
- [ ] R4 remains unchecked: no exponential backoff/ETA semantics for TickTick 429 responses were verified.
- [ ] R5 remains unchecked: current execution retry logic is limited and does not satisfy the single-task exponential-backoff AC.
- [ ] R7 remains unchecked: regression coverage is broad, but this pass did not prove every cavekit-task-pipeline story maps cleanly to at least one automated regression.
- [ ] R8 remains unchecked: burst isolation is tested, but this pass did not prove the full no-race-condition write-path claim strictly enough to close the requirement.
- [ ] R10 remains unchecked: `context/refs/acceptance-matrix.json` exists, but it does not yet provide full FR-to-test-case tracking.
- [ ] R11 remains unchecked: adapter errors are classified, but the AC's exact typed surface (`not found`, `already completed`, `permission denied`, `network error`) is not fully implemented.
- [ ] R12 remains unchecked: parsed intents are not persisted for deferred retry/manual recovery under full API unavailability.

## Changelog
- 2026-04-18: Migrated from kitty-specs 003-pipeline-hardening-and-regression
- 2026-04-20: R6 and R9 completed — offline harness behavior and telemetry contract now have direct code + regression evidence.
- 2026-04-21: R1 completed — canonical immutable pipeline context now persists across request, AX, normalization, execution, and result stages with observability access.
