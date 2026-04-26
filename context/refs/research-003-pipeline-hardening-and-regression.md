# Research: 003 Pipeline Hardening and Regression

## Scope

This research resolves the implementation decisions required to harden the live task pipeline without changing the repo's core architecture. It uses the clarified feature spec, the current pipeline and adapter code, the regression harness, and the repository constitution as the source of truth.

## Research Tasks

1. Determine where rollback orchestration should live.
2. Determine what "full observability scaffolding" means within the current deployment constraints.
3. Define the canonical pipeline context contract shared by all entry points.
4. Define how quota rotation and failure classification should be surfaced.
5. Define the regression strategy that verifies the live architecture directly.

## Findings

### 1. Rollback belongs in pipeline orchestration, not in the adapter

Decision:
- Implement best-effort compensating rollback in `services/pipeline.js`.
- Record an execution history entry after every successful adapter write.
- If a later action still fails after one retry, replay inverse operations through `TickTickAdapter` before returning the failure result.

Rationale:
- The spec requires rollback, but the constitution also requires a single write boundary through the adapter.
- `TickTickAdapter` is currently scoped to single task operations and project lookup. Pushing cross-action rollback into it would mix orchestration concerns into the write boundary.
- Pipeline-level orchestration can capture pre-write snapshots and decide which inverse action is valid for each success case.

Alternatives considered:
- Adapter-owned transaction semantics: rejected because TickTick writes are remote REST calls and the adapter is intentionally narrow.
- Fail without rollback: rejected because the clarification explicitly requires retry followed by rollback.

### 2. Full observability should mean structured logs, counters, and tracing hooks without a new vendor dependency

Decision:
- Emit structured log events for request receipt, AX extraction, normalization, action execution, rollback, and terminal outcome.
- Add lightweight metrics hooks for counts, failure classes, retries, and duration measurements.
- Add tracing scaffolding based on request IDs and step/span names so later instrumentation can forward to a vendor without changing business logic.

Rationale:
- The feature clarification selected full observability scope, but the constitution also emphasizes limited free-tier infrastructure and incremental design.
- The current code already logs to the console. Extending that into structured events and reusable timing hooks is low-risk and compatible with Render.
- Request correlation is required to debug quota failover, adapter rejections, and rollback attempts across multiple steps.

Alternatives considered:
- Logs only: rejected because it does not satisfy the agreed scope.
- Immediate external telemetry vendor integration: rejected because it adds operational surface area outside the feature's stated scope.

### 3. The pipeline needs one canonical request context assembled before AX runs

Decision:
- Standardize a single pipeline context object assembled at every entry point before `intentExtractor.extractIntents()` is called.
- The context should include `requestId`, `entryPoint`, `userMessage`, `currentDate`, canonical timezone from stored user context, available projects, optional existing task snapshot, and the caller-supplied execution mode string (`interactive`, `scan`, `review`, `poll`, or dev/debug aliases).

Rationale:
- `services/pipeline.js` currently passes inconsistent context fields to AX and normalizer.
- The clarified spec makes the user profile timezone from stored context the canonical source, so each call site must produce the same value.
- A stable request context also enables observability and makes direct pipeline tests straightforward.

Alternatives considered:
- Keep entry-point-specific options and patch them incrementally: rejected because that is the source of the current contract drift.
- Continue using environment-default timezone values at runtime: rejected because the clarified spec overrides that behavior.

### 4. Failure handling needs explicit classes and mode-aware message rendering

Decision:
- Normalize terminal failures into explicit classes: `quota`, `malformed_ax`, `validation`, `adapter`, `rollback`, and `unexpected`.
- Keep dev mode responses detailed and keep user mode responses compact by failure class.
- On quota exhaustion, rotate to another configured Gemini key before surfacing failure. Only return a quota failure if no configured key succeeds.

Rationale:
- The current pipeline has one broad catch block and does not distinguish empty AX output, malformed AX output, adapter failures, or rollback failures cleanly.
- The feature spec and clarifications require deterministic messaging and preserve request context through quota failover.
- Explicit failure classes also make regression expectations and telemetry aggregation testable.

Alternatives considered:
- One generic failure path: rejected because it weakens both observability and user messaging contracts.
- Detailed user-facing diagnostics everywhere: rejected by the dev-vs-user clarification.

### 5. Regression coverage should move to direct pipeline doubles and burst tests

Decision:
- Add direct tests around `createPipeline()` with mocked `intentExtractor`, `normalizer`, and `TickTickAdapter`.
- Cover create, update, complete, delete, non-task, malformed AX output, validation failure, adapter failure, retry/rollback, and quota rotation through the pipeline surface itself.
- Add a mocked burst-concurrency regression that exercises tens of requests and verifies deterministic outcomes without live API calls.

Rationale:
- The current regression suite still spends substantial effort on legacy helper behavior rather than the live orchestration path.
- The spec requires contract drift to fail fast in tests and explicitly expands scale expectations to small concurrent bursts.
- Mocked pipeline tests preserve determinism and avoid requiring live TickTick or Gemini credentials.

Alternatives considered:
- Keep coverage at helper level only: rejected because it misses the new architecture's failure semantics.
- Add live API burst tests: rejected because they would be noisy, slow, and unsuitable for routine regression runs.

## Conclusion

The implementation should remain in the current Node.js service layout and harden the existing pipeline rather than replacing it. The primary design moves are:
- add a canonical request context,
- classify failures explicitly,
- orchestrate retry plus rollback above the adapter,
- emit structured observability events, and
- move regression coverage to direct pipeline behavior.
