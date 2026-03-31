# Implementation Plan: Core Pipeline Hardening and Regression
*Path: `.kittify/missions/software-dev/templates/plan-template.md`*

- **Branch**: `master`
- **Date**: `2026-03-11`
- **Spec**: `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
- **Input**: Feature specification from `kitty-specs/003-pipeline-hardening-and-regression/spec.md`

## Summary

Harden the existing `AX -> normalizer -> TickTickAdapter` path so every call site passes the same context contract, failure paths are deterministic, rollback is orchestrated above the adapter, and regression coverage moves from legacy helper behavior to direct pipeline behavior.

The implementation stays inside the current Node.js Telegram bot architecture. It adds explicit key-rotation behavior, canonical timezone propagation from stored user context, rollback-aware execution records, and full observability scaffolding without introducing a new runtime or bypassing the adapter boundary.

## Technical Context

- **Language/Version**: Node.js 18+ with ESM
- **Primary Dependencies**: Express, grammY, `@ax-llm/ax`, `@google/generative-ai`, axios, ioredis, node-cron
- **Storage**: TickTick REST API, Redis-backed state, local user context file or environment configuration
- **Testing**: `node tests/run-regression-tests.mjs`, `node --test tests/regression.test.js`, direct pipeline mocks, mocked burst-concurrency regressions
- **Target Platform**: Dockerized Node.js backend on Render free tier
- **Project Type**: Single backend service with Telegram bot, scheduler, and Express entry points
- **Performance Goals**: Keep standard pipeline requests within the existing 5-10 second user expectation; keep mocked burst tests in the tens-of-requests range deterministic and reliable
- **Constraints**: Preserve the `AX -> normalizer -> TickTickAdapter` write path; use the user profile timezone from stored context as the canonical timezone; rotate configured Gemini keys before surfacing quota failure; orchestrate rollback above the adapter; keep user-facing failures compact while preserving detailed diagnostics in development mode; stay compatible with limited free-tier resources
- **Scale/Scope**: Single-user deployment today, but this feature must harden create, update, complete, delete, non-task, validation, quota, adapter-failure, and rollback flows across `server.js`, `bot/commands.js`, and `services/scheduler.js`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Pre-Phase 0 gate:
- PASS: Runtime and architecture stay in the constitution-approved Node.js, ESM, AX, and TickTick adapter stack.
- PASS: Deterministic logic remains in application code. Validation, retry, rollback, and failure classification do not move into the model layer.
- PASS: All TickTick writes continue to flow through `services/ticktick-adapter.js`; rollback uses compensating adapter calls rather than direct `TickTickClient` access.
- PASS: Planned tests target the critical parse-normalize-execute path and mocked external dependencies, matching the constitution's testing guidance.
- PASS: Full observability scaffolding strengthens the existing logging requirement and does not introduce a conflicting vendor lock-in.

Post-Phase 1 re-check:
- PASS if the contracts keep request correlation, rollback records, and telemetry events explicit.
- PASS if timezone resolution remains sourced from stored user context instead of environment defaults at execution time.
- No constitution violations are currently justified for this feature.

## Project Structure

### Documentation (this feature)

```text
kitty-specs/003-pipeline-hardening-and-regression/
|- plan.md
|- research.md
|- data-model.md
|- quickstart.md
`- contracts/
   |- pipeline.openapi.yaml
   `- telemetry-events.schema.json
```

### Source Code (repository root)

```text
server.js

bot/
|- index.js
`- commands.js

services/
|- ax-intent.js
|- gemini.js
|- normalizer.js
|- pipeline.js
|- scheduler.js
|- store.js
`- ticktick-adapter.js

tests/
|- regression.test.js
`- run-regression-tests.mjs
```

**Structure Decision**: Keep the existing single-service backend layout. Implement pipeline hardening inside `services/`, adjust only the thin entry-point wiring in `server.js`, `bot/commands.js`, and `services/scheduler.js`, and verify behavior through focused regression coverage in `tests/`.

## Complexity Tracking

No constitution violations expected.

## Phase 0: Outline And Research

Research tasks to resolve before implementation:
- Define how rollback compensations are recorded and replayed for `create`, `update`, `complete`, and `delete` without breaking the adapter boundary.
- Define the observability contract for structured logs, metrics, and tracing scaffolding, including request correlation and failure classification.
- Define the shared pipeline context contract used by all entry points before AX extraction begins.
- Define the regression harness shape for malformed AX output, validation failure, quota rotation, adapter rejection, rollback failure, and burst concurrency.

## Phase 1: Design And Contracts

Design outputs for this plan:
- `data-model.md` formalizes the request context, normalized action, execution record, rollback step, telemetry event, and final result envelope.
- `contracts/pipeline.openapi.yaml` captures the internal process contract for pipeline execution and failure classes.
- `contracts/telemetry-events.schema.json` captures the observability event schema expected by logs, metrics, and tracing hooks.
- `quickstart.md` defines the verification flow for direct pipeline regressions, rollback behavior, and observability checks.

Agent context update:
- No agent-specific context change is required for this plan because it introduces no new language, framework, or deployment technology beyond the existing repository baseline.
