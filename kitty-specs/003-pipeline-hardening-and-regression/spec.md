# Feature Specification: Core Pipeline Hardening and Regression

**Feature Branch**: `003-pipeline-hardening-and-regression`
**Created**: 2026-03-10
**Status**: Accepted
**Mission**: software-dev
**Input**: Follow-on hardening from `001-task-operations-pipeline`. The new architecture is the core task path, but its contract, failure handling, and regression coverage still need to catch up.

## Product Vision Alignment Contract

This specification is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature makes the behavioral assistant dependable under failure. If the pipeline breaks, the user loses trust and returns to manual over-planning, so failures must be compact, honest, logged, and non-destructive.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Handle malformed model output, quota exhaustion, adapter failure, and partial multi-action failures without losing context or silently corrupting tasks.
- Keep user-facing failures compact while preserving enough developer diagnostics to fix root causes.
- Test the live architecture directly, especially paths that affect user trust: create, mutate, clarify, fail closed, and roll back.

**Reject or revise this artifact if**:
- The pipeline returns misleading success after partial failure.
- Diagnostics leak into user-facing Telegram copy.
- Regression tests mainly exercise dead legacy helpers instead of the structured path.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission protects trust when model calls, TickTick calls, parsing, context, or downstream services fail. The product vision requires correctness over confidence. This mission must make failures honest, recoverable, and cognitively light instead of hiding uncertainty or leaving the user with a broken invisible workflow.

### Required Product Behavior For This Mission

- Failures are explained briefly with what did and did not happen, without dumping technical noise into the conversation.
- Partial writes have rollback or explicit recovery behavior where the spec requires it.
- Low-confidence or unavailable context leads to clarification, retry options, or safe fallback, not fabricated certainty.
- Telemetry and diagnostics support future improvement without storing raw user content unnecessarily.

### Cross-Mission Dependency And Drift Risk

This mission depends on 001 and 002 behavior surfaces. Later behavioral systems rely on this mission to distinguish true user behavior from API/model failure noise.

### Evidence Required Before Any WP Approval

Every implement-review cycle for this mission must produce reviewer-visible evidence for all of the following:

1. The specific Product Vision clause or behavioral scope section served by the change.
2. The local FR, NFR, plan step, task, or WP requirement implemented by the change.
3. The concrete user-visible behavior that changed, including whether the change affects capture, clarification, planning, ranking, intervention, reflection, recovery, or behavioral memory.
4. The anti-drift rule the change preserves: not a passive task manager, not generic reminders, not over-planning support, not busywork optimization, not false certainty, and not SaaS scope expansion.
5. The automated test, regression script, manual transcript, or inspection evidence that proves the behavior.
6. The downstream missions that rely on this behavior and what would break if it drifted.

### Complete 001-009 Acceptance Criteria

After all WPs in missions 001 through 009 have passed implementation, review, and mission-level acceptance, the integrated product must satisfy every item below. If any item is not demonstrably true, the 001-009 chain is not complete.

1. The user can capture clear, vague, multi-task, checklist, recurring, and mutation requests safely through the accepted pipeline without legacy path drift.
2. Ambiguous or destructive actions clarify or fail closed instead of guessing.
3. The daily plan usually contains no more than three tasks, is realistic for the user context, and includes long-term-goal work when such work exists and is plausible.
4. The system distinguishes important work from low-value busywork and actively avoids rewarding motion-as-progress.
5. Urgent mode is temporary, minimal, direct, and action-oriented; it is not the default tone and it does not mutate TickTick state unless the user explicitly asks for a task operation.
6. Weak behavioral or priority inference is never presented as fact. The assistant asks, labels uncertainty, or stays quiet.
7. Behavioral memory stores derived signals only, uses retention limits, and supports inspection/reset so memory remains a coaching aid rather than surveillance.
8. Morning start stays short; end-of-day reflection stays brief, context-aware, and non-punitive.
9. Ignored guidance causes adaptation or backing off, not louder nagging.
10. The implementation avoids MVP scope creep: no auth, billing, rate limiting, multi-tenant isolation, or SaaS infrastructure unless an accepted spec explicitly requires it.
11. User-facing copy is compact, concrete, non-judgmental, and oriented toward the next useful action.
12. No raw user message, raw task title, or raw task description is persisted in long-term behavioral memory.

### Mandatory Rejection Conditions

A reviewer must reject or reopen work in this mission if any of these are true:

- The change can pass local tests while still encouraging list management instead of task execution.
- The assistant accepts the user's first input as correct when the spec requires challenge, clarification, or safe failure.
- The change increases verbosity, ceremony, or planning overhead without improving action clarity or prioritization.
- The change optimizes low-value tasks, cosmetic organization, or generic reminders while ignoring meaningful progress.
- The change presents weak inference as certainty or invents goals, constraints, priorities, or behavioral patterns.
- The change stores raw user/task content in behavioral memory or logs where the mission only allows derived signals.
- The change introduces auth, billing, rate limiting, multi-tenant isolation, or platform-scale infrastructure not accepted by spec.
- The reviewer cannot trace the change from Product Vision -> spec/plan/task -> code/docs -> test evidence.

### Claim Boundary

When this mission is marked done, the claim is not merely that its files changed or tests passed. The claim is that this mission now contributes its defined role to the complete behavioral support system. The stronger statement, "after running 001 through 009 the product exactly matches the vision", is only valid when every mission enforces this contract, every WP has review evidence, and a final mission review confirms spec-to-code-to-test-to-product-vision fidelity across the whole chain.

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
- Regression coverage for checklist creation (005), briefing/weekly commands (006), execution prioritization (007), work-style state resolution (008), and behavioral signal generation (009) should be added as separate regression test additions once those specs are accepted.

## Requirements

### Functional Requirements

- **FR-001**: The pipeline MUST pass the full contextual input shape expected by `services/ax-intent.js`
- **FR-002**: The pipeline MUST use the user profile timezone from stored context as the canonical timezone source when resolving dates in commands, scheduler jobs, and free-form handling
- **FR-003**: The pipeline MUST handle malformed AX output, empty intent lists, and validation failures without unhandled exceptions
- **FR-004**: The pipeline MUST attempt another configured Gemini key before returning a quota failure, and MUST surface final quota exhaustion and adapter failure states with deterministic messages that are compact for end users
- **FR-005**: The regression suite MUST cover the pipeline directly, not only legacy execution helpers
- **FR-005a**: Future regression extensions should cover behavioral signal generation paths defined in `009-behavioral-signals-and-memory`.
- **FR-006**: Tests MUST cover create, update, complete, delete, non-task, validation-failure, and adapter-failure paths
- **FR-006a**: Tests SHOULD verify the shared urgency utility from `008-work-style-and-urgent-mode` returns consistent classifications across all callers once that spec is implemented.
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
