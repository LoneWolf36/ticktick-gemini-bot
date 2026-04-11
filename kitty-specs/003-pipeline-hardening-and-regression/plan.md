# 003-pipeline-hardening-and-regression Implementation Plan

**Feature**: Core Pipeline Hardening and Regression
**Created**: 2026-04-01
**Status**: Ready for Implementation
**Mission**: software-dev
**Input**: Accepted `spec.md`, the live `001` pipeline architecture, and the current repo seams already carrying `003` hardening behavior

---

## Product Vision Alignment Contract

This implementation plan is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

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
