---
work_package_id: WP06
title: Failure, Rollback, and Burst Regression Finalization
dependencies:
- WP03
- WP04
- WP05
requirement_refs:
- FR-003
- FR-004
- FR-005
- FR-006
- FR-007
- FR-008
- FR-009
- FR-010
base_branch: 003-pipeline-hardening-and-regression-WP06-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T012
- T017
- T020
- T021
- T022
phase: Phase 5 - Regression Hardening
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQV
owned_files:
- kitty-specs/003-pipeline-hardening-and-regression/plan.md
- kitty-specs/003-pipeline-hardening-and-regression/spec.md
- tests/e2e-live-checklist.mjs
- tests/e2e-live-ticktick.mjs
- tests/pipeline-harness.js
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP06
---

# Work Package Prompt: WP06 - Failure, Rollback, and Burst Regression Finalization

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task.**

- **Has review feedback?** Check the current review state before starting.
- **Address all review feedback** before marking the package complete.
- **Report progress** by appending Activity Log entries in chronological order.

---

## Review Feedback

> Populated by `/spec-kitty.review` when changes are requested.

*[This section is empty initially. Any later feedback becomes mandatory scope.]*

---

## Markdown Formatting

Wrap HTML/XML tags in backticks: `` `<div>` ``, `` `<script>` ``
Use language identifiers in fenced code blocks.

---

## Objectives & Success Criteria

- Close the loop on hardening by extending the direct harness to cover failure semantics, rollback behavior, observability emission, and small concurrent bursts.
- Keep final regression coverage concentrated in the current direct pipeline test surfaces.
- Leave live-check notes aligned with the hardened contract without making them the required acceptance path.
- Make contract drift fail fast in tests.

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature makes the behavioral assistant dependable under failure. If the pipeline breaks, the user loses trust and returns to manual over-planning, so failures must be compact, honest, logged, and non-destructive.

**Implementation must**:
- Handle malformed model output, quota exhaustion, adapter failure, and partial multi-action failures without losing context or silently corrupting tasks.
- Keep user-facing failures compact while preserving enough developer diagnostics to fix root causes.
- Test the live architecture directly, especially paths that affect user trust: create, mutate, clarify, fail closed, and roll back.

**Implementation must not**:
- The pipeline returns misleading success after partial failure.
- Diagnostics leak into user-facing Telegram copy.
- Regression tests mainly exercise dead legacy helpers instead of the structured path.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission protects trust when model calls, TickTick calls, parsing, context, or downstream services fail. The product vision requires correctness over confidence. This mission must make failures honest, recoverable, and cognitively light instead of hiding uncertainty or leaving the user with a broken invisible workflow.

### Required Implementer Evidence

The implementer must leave enough evidence for review to answer all of the following without guessing:

1. Which Product Vision clause or behavioral scope section does this WP serve?
2. Which FR, NFR, plan step, task entry, or acceptance criterion does the implementation satisfy?
3. What user-visible behavior changes because of this WP?
4. How does the change reduce procrastination, improve task clarity, improve prioritization, improve recovery/trust, or improve behavioral awareness?
5. What does the implementation deliberately avoid so it does not become a passive task manager, generic reminder app, over-planning assistant, busywork optimizer, or judgmental boss?
6. What automated tests, regression checks, manual transcripts, or static inspections prove the intended behavior?
7. Which later mission or WP depends on this behavior, and what drift would it create downstream if implemented incorrectly?

### Required Reviewer Checks

The reviewer must reject the WP unless all of the following are true:

- The behavior is traceable from Product Vision -> mission spec -> plan/tasks -> WP instructions -> implementation evidence.
- The change preserves the accepted architecture and does not bypass canonical paths defined by earlier missions.
- The user-facing result is concise, concrete, and action-oriented unless the spec explicitly requires reflection or clarification.
- Ambiguity, low confidence, and missing context are handled honestly rather than hidden behind confident output.
- The change does not add MVP-forbidden platform scope such as auth, billing, rate limiting, or multi-tenant isolation.
- Tests or equivalent evidence cover the behavioral contract, not just the happy-path technical operation.
- Any completed-WP edits preserve Spec Kitty frontmatter and event-sourced status history; changed behavior is documented rather than silently rewritten.

### Drift Rejection Triggers

Reject, reopen, or move work back to planned if this WP enables any of the following:

- The assistant helps the user organize more without helping them execute what matters.
- The assistant chooses or mutates tasks confidently when it should clarify, fail closed, or mark inference as weak.
- The assistant rewards low-value busywork, cosmetic cleanup, or motion-as-progress.
- The assistant becomes verbose, punitive, generic, or motivational in a way the Product Vision explicitly rejects.
- The implementation stores raw user/task content where only derived behavioral metadata is allowed.
- The change creates a second implementation path that future agents could use instead of the accepted pipeline.
- The reviewer cannot state why this WP is necessary for the final 001-009 product.

### Done-State And Future Rework Note

If this WP is already marked done, this contract does not rewrite Spec Kitty history. It governs future audits, reopened work, bug fixes, and final mission review. If any later change alters the behavior described here, the WP may be moved back to planned or reopened so the implement-review loop can re-establish product-vision fidelity.

## Context & Constraints

- Implementation command: `spec-kitty implement WP06 --base WP05`
- Canonical references:
  - `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
  - `tests/pipeline-harness.js`
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - `tests/e2e-live-ticktick.mjs`
  - `tests/e2e-live-checklist.mjs`
  - `services/pipeline.js`
  - `services/pipeline-observability.js`
- Reuse the direct-pipeline fixtures established in WP04.
- Required regression coverage remains mocked and deterministic.
- Live API scripts stay opt-in and should only be updated as support notes or result-shape compatibility references.

## Subtasks & Detailed Guidance

### Subtask T012 - Add Story 2 failure-path regressions
- **Purpose**: Lock in the hardened failure semantics so they cannot drift silently.
- **Steps**:
  1. Add direct regressions for malformed AX output.
  2. Add direct regressions for empty intents and validation failure.
  3. Add regressions proving configured-key rotation happens before terminal quota failure.
  4. Assert failure class plus message-shape behavior rather than brittle full paragraphs.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Tests / Acceptance Cues**:
  - Story 2 failure behavior is covered directly through the pipeline.
  - Failure assertions remain stable even if wording changes slightly.
- **Guardrails**:
  - Prefer direct pipeline doubles over legacy helper paths.

### Subtask T017 - Add rollback and observability regressions
- **Purpose**: Keep rollback and telemetry behavior from drifting after implementation.
- **Steps**:
  1. Add direct tests for adapter failure after partial success plus successful rollback.
  2. Add direct tests for rollback failure classification.
  3. Add assertions for emitted event structure or observability-hook invocation.
  4. Keep assertions focused on stable contract fields rather than raw log formatting.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Tests / Acceptance Cues**:
  - Request correlation survives retries and rollback.
  - Observability assertions do not depend on a real vendor sink.
- **Guardrails**:
  - Do not broaden this into full logging snapshot tests.

### Subtask T020 - Add direct failure-path regressions
- **Purpose**: Lock in the fail-closed behavior introduced by the hardening work.
- **Steps**:
  1. Add direct tests for malformed AX output, validation failure, adapter failure, and quota rotation before final failure.
  2. Add tests for rollback success and rollback failure using execution-record expectations.
  3. Keep one assertion path for user mode and another for development-oriented mode only where message shape materially differs.
  4. Assert failure classes and rollback markers instead of brittle raw text blobs.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Tests / Acceptance Cues**:
  - Failure semantics are covered directly and comprehensively.
  - Regression failures point at contract drift rather than formatting noise.
- **Guardrails**:
  - Do not duplicate earlier happy-path coverage.

### Subtask T021 - Add burst-concurrency regressions
- **Purpose**: Prove the hardened contract holds under the clarified tens-of-requests scale assumption.
- **Steps**:
  1. Build a mocked burst test that launches tens of pipeline requests concurrently.
  2. Ensure each request gets a distinct request ID or deterministic injected ID.
  3. Assert that one request's failure does not corrupt neighboring outcomes.
  4. Keep the burst test bounded and routine-friendly.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Tests / Acceptance Cues**:
  - Tens-of-requests burst behavior remains isolated and deterministic.
  - Request IDs stay unique and stable.
- **Guardrails**:
  - Do not turn this into performance benchmarking or load infrastructure work.

### Subtask T022 - Update live doubles and hardened-contract notes
- **Purpose**: Keep support scripts and notes aligned with the hardened result contract without making them the required acceptance path.
- **Steps**:
  1. Review `tests/e2e-live-ticktick.mjs` and `tests/e2e-live-checklist.mjs` for assumptions about result shape.
  2. Update any notes or doubles that would confuse future maintainers about the hardened contract.
  3. Keep documentation or support-note changes narrow and directly tied to the accepted feature scope.
  4. Avoid introducing a second test harness through these files.
- **Files to Touch**:
  - `tests/e2e-live-ticktick.mjs`
  - `tests/e2e-live-checklist.mjs`
  - `tests/pipeline-harness.js` only if shared result-shape helpers need minor cleanup
- **Tests / Acceptance Cues**:
  - Future maintainers can run the direct regression suite and optional live checks without rediscovering result-shape assumptions.
  - Support files do not contradict the hardened pipeline contract.
- **Guardrails**:
  - Keep required acceptance centered on mocked direct regressions.

## Definition of Done

- Failure, rollback, and burst-concurrency regressions are covered through the direct pipeline test surfaces.
- Observability emission is asserted structurally.
- Contract drift fails fast in tests.
- Optional live-check files no longer contradict the hardened result contract.

## Activity Log

- 2026-04-01: WP regenerated after audit; prior prompt replaced because it still embedded obsolete lane history instead of the current review-oriented format.

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Final regression coverage for failure paths, rollback, observability, burst concurrency. Update live-check scripts.

#### What's Actually Done:
Not started. Depends on WP03, WP04, WP05.

#### Gaps Found:
- Not started. This is the stabilization gate for spec 003. Well-scoped: test coverage only, no new behavior.

#### Product Vision Alignment Issues:
- Aligned. Burst isolation ensures one request's failure doesn't corrupt others — supporting reliability under real-world conditions.

#### Recommendations:
- Blocking on WP03-WP05. Final quality gate for the hardening spec.
