# 003-pipeline-hardening-and-regression Implementation Plan

**Feature**: Core Pipeline Hardening and Regression  
**Created**: 2026-04-01  
**Status**: Ready for Implementation  
**Mission**: software-dev  
**Input**: Accepted `spec.md`, the live `001` pipeline architecture, and the current repo seams already carrying `003` hardening behavior

---

## Overview

This feature hardens the existing `AX -> normalizer -> TickTickAdapter` path rather than introducing new architecture. The repository already contains the main seams associated with this hardening work, including:

- `services/pipeline-context.js` for canonical request context,
- `services/pipeline-observability.js` for request-correlated telemetry hooks,
- `tests/pipeline-harness.js` for direct-pipeline mocking,
- expanded regression coverage in `tests/regression.test.js` and `tests/run-regression-tests.mjs`.

The aligned plan is therefore about keeping the feature package honest to the spec and the current repo shape:

1. stabilize one canonical pipeline context contract,
2. push that contract through Telegram and scheduler entry points,
3. keep failure classes, key-rotation semantics, and compact-vs-dev messaging explicit,
4. preserve rollback orchestration above `TickTickAdapter`,
5. keep regression coverage focused on direct pipeline behavior, not legacy helpers.

---

## Confirmed Scope Guardrails

These constraints are locked by the feature spec and the repo’s current Spec Kitty v3.0.1 rules:

- Source of truth for artifact shape: the repo’s current Spec Kitty v3.0.1 contract.
- Preserve the single write boundary through `TickTickAdapter`; no direct `TickTickClient` writes from callers.
- Use the canonical timezone source exposed by the current stored user-settings path; callers may not each invent request-time timezone behavior.
- Attempt another configured Gemini key before surfacing quota failure.
- Retry one failed action once, then roll back prior writes if retry still fails.
- Keep end-user failure messages compact and development-mode diagnostics explicit.
- Required regressions stay mocked and deterministic; live API checks remain opt-in.
- Product policy work such as urgent-mode semantics, ranking policy, and behavioral memory is out of scope for this feature.

---

## Existing Code Baseline

The repaired package should explicitly target the code that now exists in the repository:

- [services/pipeline.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/pipeline.js): orchestrates extraction, normalization, execution, retry, rollback, and result shaping.
- [services/pipeline-context.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/pipeline-context.js): canonical request-context builder and validation.
- [services/pipeline-observability.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/pipeline-observability.js): structured observability hooks and entry-point normalization.
- [services/ax-intent.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/ax-intent.js): AX extraction plus quota-aware key rotation surface.
- [services/normalizer.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/normalizer.js): normalized action shaping and validation.
- [services/ticktick-adapter.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/ticktick-adapter.js): the only write boundary.
- [services/scheduler.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/scheduler.js): scheduled entry points that must share the same contract.
- [services/user-settings.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/user-settings.js): current canonical timezone source in the live repo.
- [bot/commands.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/bot/commands.js): Telegram free-form, scan, and review entry points.
- [tests/pipeline-harness.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/pipeline-harness.js): direct-pipeline doubles.
- [tests/regression.test.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/regression.test.js): direct regression coverage.
- [tests/run-regression-tests.mjs](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/run-regression-tests.mjs): lightweight regression runner.

---

## Design Decisions

### Canonical Context Ownership

The canonical request context should be owned by `services/pipeline-context.js`, not rebuilt ad hoc in `services/pipeline.js`, `bot/commands.js`, or `services/scheduler.js`. Required fields remain:

- `requestId`
- `entryPoint`
- `mode`
- `userMessage`
- `currentDate`
- `timezone`
- `availableProjects`
- `existingTask`

### Timezone Source

The spec requires one canonical timezone source. In the current repo, that source is surfaced through `services/user-settings.js`. Callers may pass `currentDate` and request metadata for determinism, but request-time timezone behavior should remain centralized in the builder path rather than split across Telegram and scheduler call sites.

### Failure Taxonomy

Pipeline failure behavior should remain explicit and stable:

- `quota`
- `malformed_ax`
- `validation`
- `adapter`
- `rollback`
- `unexpected`

`non-task` remains separate from failure routing.

### Retry, Rollback, and Observability

- retry-once behavior is orchestrated in `services/pipeline.js`,
- rollback remains above `TickTickAdapter`,
- execution records and rollback metadata are first-class testable contract fields,
- observability uses the existing structured helper path in `services/pipeline-observability.js` rather than a new logging subsystem.

### Regression Surface

Direct pipeline regressions should remain anchored in:

- `tests/pipeline-harness.js`,
- `tests/regression.test.js`,
- `tests/run-regression-tests.mjs`.

This feature does not need a second parallel harness or a mandatory live-integration suite.

---

## Work Package Strategy

The dependency model remains:

1. **WP01**: stabilize canonical context ownership and validation.
2. **WP02**: wire Telegram and scheduler entry points to that contract.
3. **WP03**: align failure classes, quota semantics, and compact-vs-dev messaging.
4. **WP04**: lock direct pipeline harness coverage for context and baseline happy paths.
5. **WP05**: harden retry, rollback, execution records, and observability.
6. **WP06**: close the loop with failure, rollback, telemetry, and burst regressions.

Only WP01 is foundational. WP02, WP03, and WP04 can proceed in parallel once WP01 lands. WP05 depends on WP01 and WP03. WP06 converges on WP03, WP04, and WP05.

---

## Work Package Summary

| WP | Title | Depends On | Parallel? | Primary Files |
|----|-------|------------|-----------|---------------|
| WP01 | Canonical Pipeline Context Foundation | None | No | `services/pipeline-context.js`, `services/pipeline.js`, `services/ax-intent.js`, `services/normalizer.js` |
| WP02 | Entry-Point Context Wiring | WP01 | Yes | `bot/commands.js`, `services/scheduler.js`, `server.js`, `services/pipeline.js` |
| WP03 | Failure Classification, Quota Semantics, and Story 2 User Messaging | WP01 | Yes | `services/pipeline.js`, `services/ax-intent.js`, `services/gemini.js` |
| WP04 | Direct Pipeline Harness and Story 1 Coverage | WP01 | Yes | `tests/pipeline-harness.js`, `tests/regression.test.js`, `tests/run-regression-tests.mjs` |
| WP05 | Retry, Rollback, and Observability Hardening | WP01, WP03 | No | `services/pipeline.js`, `services/pipeline-observability.js`, `services/ticktick-adapter.js` |
| WP06 | Failure, Rollback, and Burst Regression Finalization | WP03, WP04, WP05 | No | `tests/regression.test.js`, `tests/run-regression-tests.mjs`, `tests/pipeline-harness.js` |

---

## Implementation Constraints

- Do not move writes outside `TickTickAdapter`.
- Do not replace the current pipeline with a new orchestration layer.
- Do not treat `process.env.USER_TIMEZONE` as per-request truth when the canonical user-settings path already exists.
- Do not scatter failure rendering across multiple callers.
- Do not create a second direct-pipeline harness or a second observability stack.
- Keep required regressions mocked and deterministic.

---

## Testing Strategy

Required coverage remains tied to the current repo surfaces:

- canonical-context and Story 1 regressions in [tests/regression.test.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/regression.test.js),
- direct harness support in [tests/pipeline-harness.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/pipeline-harness.js),
- lightweight mirrored coverage in [tests/run-regression-tests.mjs](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/run-regression-tests.mjs),
- AX quota-rotation behavior in [tests/ax-intent.test.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/ax-intent.test.js) where appropriate.

Opt-in live scripts may remain documented, but they are not the required regression gate for this feature package.

---

## Definition of Done

The repaired `003` package is complete only when:

- `spec.md`, `plan.md`, `tasks.md`, and all `tasks/WP*.md` files match the repo’s current v3.0.1 artifact rules,
- top-level docs no longer encode state in checkboxes or frontmatter lanes,
- every WP points to real repo files that now exist,
- the dependency chain is explicit and parseable,
- the plan and tasks stay within the feature spec and current repo seams,
- the event log records that the planning artifacts were regenerated after structured review.
