---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-18T22:30:00Z"
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
- [ ] Pipeline context includes: request metadata, AX intent output, normalized actions, adapter requests/results, validation failures, timing, and correlation ID
- [ ] Context is immutable after each stage writes to it — no later stage mutates earlier fields
- [ ] Pipeline context is available to all observability consumers without requiring separate instrumentation
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
- [ ] Harness accepts JSON input representing user messages and returns pipeline context output
- [ ] Harness supports mocked adapter responses for testing failure paths
- [ ] Harness validates pipeline contracts without network dependencies
- [ ] See `context/refs/pipeline-harness.js` for reference implementation
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
- [ ] Telemetry events conform to `context/refs/telemetry-events.schema.json`
- [ ] End-to-end request tracing via correlation ID from entry point to adapter result
- [ ] Telemetry does not persist raw user messages in long-term storage
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

## Changelog
- 2026-04-18: Migrated from kitty-specs 003-pipeline-hardening-and-regression
