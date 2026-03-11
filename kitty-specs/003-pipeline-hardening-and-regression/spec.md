# Feature Specification: Core Pipeline Hardening and Regression

**Feature Branch**: `003-pipeline-hardening-and-regression`  
**Created**: 2026-03-10  
**Status**: Draft  
**Mission**: software-dev  
**Input**: Follow-on hardening from `001-task-operations-pipeline`. The new architecture is the core task path, but its contract, failure handling, and regression coverage still need to catch up.

## Clarifications

### Session 2026-03-11

- Q: When the active Gemini key is exhausted, what is the required pipeline behavior before returning a user-facing failure? -> A: Always try another configured key first, then fail if none work
- Q: For a multi-action request, what should the pipeline do after one action fails mid-run? -> A: retry then rollback all
- Q: What is the required user-facing message shape for pipeline failures in this feature? -> A: dev detailed, user compact
- Q: Which source should be the canonical timezone for pipeline date resolution? -> A: User profile timezone from stored context
- Q: What scale must the regression suite handle for this feature? -> A: Small concurrent bursts (tens of requests)

## User Scenarios & Testing

### User Story 1 - Context-Aware Extraction (Priority: P1)

The pipeline provides AX with the contextual inputs it expects, including current date, timezone, and available projects, so extraction is consistent and testable.

**Why this priority**: Structured extraction is only as reliable as the contract that feeds it.

**Independent Test**: Inspect extraction inputs and verify relative date and project-hint scenarios produce the correct normalized actions.

**Acceptance Scenarios**:

1. **Given** the user sends "book dentist thursday", **When** the pipeline executes, **Then** AX receives current date and the user profile timezone from stored context and the due date resolves correctly
2. **Given** TickTick projects exist, **When** the user sends a task with an implicit or explicit project hint, **Then** AX receives the available project names and the normalizer resolves the expected project

---

### User Story 2 - Hardened Failure Paths (Priority: P1)

The pipeline degrades predictably when AX output is malformed, empty, invalid, or blocked by adapter failures or quota issues.

**Why this priority**: Once the pipeline becomes the default path, failure semantics have to be deliberate rather than incidental.

**Independent Test**: Simulate malformed AX output, validation failures, quota failures, and adapter errors, then verify deterministic user and log behavior.

**Acceptance Scenarios**:

1. **Given** AX returns malformed or empty output, **When** the pipeline processes a message, **Then** it returns a non-destructive failure path instead of throwing an unhandled exception
2. **Given** the active Gemini key is exhausted, **When** AX fails after retries, **Then** the system attempts another configured key and returns a clear quota failure only if no configured key succeeds, without losing request context
3. **Given** the adapter rejects a write, **When** the pipeline handles the error, **Then** the result is logged and the user sees a concise failure message

---

### User Story 3 - Regression Coverage For The Live Architecture (Priority: P1)

The regression suite covers the pipeline and adapter path directly rather than mostly legacy helper behavior.

**Why this priority**: The most important architectural path should also be the best-tested path.

**Independent Test**: Run the regression suite and confirm direct coverage for create, mutate, non-task, validation-failure, and adapter-failure outcomes.

**Acceptance Scenarios**:

1. **Given** the regression suite runs, **When** the new pipeline is exercised with mocked AX and TickTick dependencies, **Then** create, update, complete, and delete flows are covered directly
2. **Given** a non-task message is processed, **When** the pipeline receives no actionable intents, **Then** the regression suite verifies the non-task route explicitly
3. **Given** a validation failure or adapter failure occurs, **When** tests execute, **Then** the suite asserts fail-closed behavior and compact user messaging

## Edge Cases

- If the AX wrapper and the pipeline drift in input shape again, the regression suite should fail fast.
- If timezone handling differs between command handlers, scheduler jobs, and pipeline entry points, one canonical source must win.
- If a multi-action request fails after a retry, the pipeline must roll back prior writes, log per-action outcomes, and return a partial-failure summary instead of a misleading success state.

## Out Of Scope

- Product-level ranking policy, work-style state, urgent-mode semantics, and behavioral memory rules
- Reflection-surface contract tests that depend on later foundation specs

## Requirements

### Functional Requirements

- **FR-001**: The pipeline MUST pass the full contextual input shape expected by `services/ax-intent.js`
- **FR-002**: The pipeline MUST use the user profile timezone from stored context as the canonical timezone source when resolving dates in commands, scheduler jobs, and free-form handling
- **FR-003**: The pipeline MUST handle malformed AX output, empty intent lists, and validation failures without unhandled exceptions
- **FR-004**: The pipeline MUST attempt another configured Gemini key before returning a quota failure, and MUST surface final quota exhaustion and adapter failure states with deterministic messages that are compact for end users
- **FR-005**: The regression suite MUST cover the pipeline directly, not only legacy execution helpers
- **FR-006**: Tests MUST cover create, update, complete, delete, non-task, validation-failure, and adapter-failure paths
- **FR-007**: Logging MUST remain sufficient to trace raw input, AX contract input, normalized output, adapter execution, and error paths
- **FR-008**: Hardening work MUST preserve the single write boundary through `TickTickAdapter`
- **FR-009**: For multi-action requests, the pipeline MUST retry a failed action once and roll back prior writes if the retry fails before returning a user-facing failure
- **FR-010**: Failure responses MUST use detailed diagnostic text in development mode and compact failure-class messaging in user-facing mode

### Key Entities

- **Pipeline Contract**: The shared input and output shape used by `services/pipeline.js`, `services/ax-intent.js`, `services/normalizer.js`, and `services/ticktick-adapter.js`
- **Regression Harness**: The automated tests that validate the live architecture under representative mocked dependencies

## Success Criteria

- **SC-001**: AX extraction receives the context fields it expects, including the user profile timezone from stored context, in every pipeline call site
- **SC-002**: Failures in AX, normalization, and adapter execution are handled without unhandled throws in user-facing paths
- **SC-003**: Regression tests exercise the new architecture directly and pass reliably
- **SC-004**: Contract drift between extraction, normalization, and adapter layers fails fast in tests
- **SC-005**: The regression suite remains reliable under small concurrent bursts in the tens-of-requests range with mocked dependencies

## Assumptions

- Mocked dependencies are sufficient for most regression coverage, with live tests remaining opt-in
- Cross-layer policy tests for ranking, state, and behavioral memory can be added later once those contracts stabilize
