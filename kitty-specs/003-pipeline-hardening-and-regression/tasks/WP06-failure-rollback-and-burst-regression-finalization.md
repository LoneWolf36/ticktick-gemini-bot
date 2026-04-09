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
