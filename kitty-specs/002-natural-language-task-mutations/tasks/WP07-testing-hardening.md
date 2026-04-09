---
work_package_id: WP07
title: Testing & Hardening
dependencies:
- WP06
requirement_refs:
- FR-005
- FR-006
- FR-007
- FR-008
base_branch: 002-natural-language-task-mutations-WP07-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T071
- T072
- T073
- T074
phase: Phase 6 - Regression & Hardening
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQT
owned_files:
- kitty-specs/002-natural-language-task-mutations/plan.md
- kitty-specs/002-natural-language-task-mutations/spec.md
- tests/pipeline-harness.js
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP07
---

# Work Package Prompt: WP07 - Testing & Hardening

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

- Finish the feature with regression coverage that proves the repaired mutation path works end to end through existing repo surfaces.
- Add explicit coverage for fail-closed cases: ambiguity, not-found, underspecified references, and mixed create+mutation inputs.
- Assert the observability contract promised by the spec so debugging a skipped mutation remains practical.
- Remove stale comments, fixtures, and harness assumptions left by the broken earlier task package so `001` and `002` read as one coherent pipeline.

## Context & Constraints

- Implementation command: `spec-kitty implement WP07 --base WP06`
- Canonical references:
  - `kitty-specs/002-natural-language-task-mutations/spec.md`
  - `kitty-specs/002-natural-language-task-mutations/plan.md`
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - `tests/pipeline-harness.js`
  - `services/pipeline.js`
  - `services/pipeline-observability.js`
  - `bot/commands.js`
  - `bot/callbacks.js`
- Prefer extending the current regression surfaces over creating large new integration, load, or benchmark suites.
- Do not reopen scope by adding new commands, new task types, or second-pass UX experiments.
- This package is the final stabilization pass for the accepted spec, not a place to redesign the feature.
- Logging assertions should be robust enough to protect the required signal without over-coupling tests to unstable formatting details.

## Subtasks & Detailed Guidance

### Subtask T071 - Add end-to-end mutation regressions in the current test surfaces
- **Purpose**: Prove the accepted happy paths work through the actual repo seams: free-form message -> pipeline -> adapter-backed mutation -> terse Telegram confirmation.
- **Steps**:
  1. Extend `tests/regression.test.js` with end-to-end free-form mutation cases for update, complete, and delete.
  2. Use the existing pipeline harness and bot-facing surfaces instead of creating a second testing stack.
  3. Cover exact-match success for at least one rename or due-date update.
  4. Cover exact-match success for completion.
  5. Cover a safe delete case where the target is clearly resolved.
  6. Ensure `tests/run-regression-tests.mjs` exercises or includes the new cases in the lightweight suite.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - `tests/pipeline-harness.js` if small harness additions are needed
- **Tests / Acceptance Cues**:
  - Successful update/complete/delete flows should end with terse confirmations.
  - Existing `001` task-creation regressions should still pass unchanged.
- **Guardrails**:
  - Do not split these into a separate large integration directory unless the existing surfaces become unmaintainable.

### Subtask T072 - Add fail-closed coverage for mixed and underspecified mutation requests
- **Purpose**: Protect the trust boundary of the feature by locking the non-happy paths into regression tests.
- **Steps**:
  1. Add regression coverage for mixed create+mutation requests being rejected or declined per current policy.
  2. Add coverage for pronoun-only or underspecified target queries that should not guess.
  3. Add coverage for ambiguous matches that require clarification instead of mutation.
  4. Add coverage for not-found results.
  5. Ensure delete remains fail-closed when resolution is uncertain.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Tests / Acceptance Cues**:
  - No out-of-scope request should produce an adapter write.
  - Ambiguous or pronoun-only requests should stay on the clarification or decline path.
- **Guardrails**:
  - Do not “fix” these cases by expanding scope to batch or mixed-intent orchestration.

### Subtask T073 - Assert logs and diagnostics for mutation intent and resolution outcomes
- **Purpose**: Enforce `FR-007` so future debugging can reconstruct what happened during mutation resolution.
- **Steps**:
  1. Identify the current observability surface used by the pipeline for structured mutation diagnostics.
  2. Add assertions that successful or skipped mutation requests emit the required high-signal fields: mutation intent, candidate metadata or counts, chosen target when present, and skipped reason when no write occurs.
  3. Keep assertions structural where possible rather than depending on exact prose.
  4. Cover at least one successful path and one skipped path.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `services/pipeline-observability.js` only if small test hooks or exported helpers are needed
- **Tests / Acceptance Cues**:
  - A reviewer should be able to tell from logs why a mutation happened or why it was skipped.
  - Diagnostics should remain present for ambiguity and not-found flows.
- **Guardrails**:
  - Do not add a new logging subsystem just to make tests easier.

### Subtask T074 - Clean up stale comments, fixtures, and harness assumptions
- **Purpose**: Remove misleading leftovers from the earlier broken task package so future implementation and review work reads against the repaired design only.
- **Steps**:
  1. Audit comments and fixtures touched by `002` planning that still mention out-of-scope concepts such as `reschedule`, extra commands, or unsupported infrastructure.
  2. Update or remove stale harness assumptions that expect nonexistent modules or second-path behavior.
  3. Keep cleanup tightly scoped to mutation-flow consistency and test readability.
  4. Leave the repo in a state where `001` and `002` share one coherent mutation pipeline story.
- **Files to Touch**:
  - `tests/pipeline-harness.js`
  - `tests/regression.test.js`
  - Any nearby fixture or helper files only if they still encode stale assumptions
- **Tests / Acceptance Cues**:
  - No local mutation-related test fixture should reference unsupported command surfaces or nonexistent modules.
  - The regression suite should read as one consistent story from resolver through callback resume.
- **Guardrails**:
  - Do not broaden this into unrelated cleanup across the repository.

## Definition of Done

- The current regression surfaces cover exact-match success, ambiguity, not-found, mixed-intent rejection, and callback-resume mutation flows.
- Observability assertions protect the required mutation diagnostics.
- Stale comments and fixtures from the broken previous package are removed or corrected.
- The repaired `002` package ends in a review-ready, scope-disciplined state.

## Activity Log

- 2026-04-01: WP regenerated after review-first audit; prior prompt replaced because it introduced unsupported load tests, extra test packages, and infrastructure beyond the accepted scope.
