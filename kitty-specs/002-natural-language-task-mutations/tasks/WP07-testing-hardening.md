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

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature reduces task-maintenance friction while protecting trust: the user can clean up or complete work quickly, but the system must never mutate the wrong task just to appear helpful.

**Implementation must**:
- Resolve exactly one target before any update, completion, or deletion.
- Ask narrow clarification questions when target confidence is low or when pronouns and fuzzy references create ambiguity.
- Keep mutation confirmations terse so the task system remains an execution aid rather than another inbox to read.

**Implementation must not**:
- Any bulk or multi-target mutation is introduced without an accepted spec.
- A delete or complete operation proceeds on fuzzy confidence alone.
- The user is forced into command syntax for clear natural-language maintenance.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission gives the user a low-friction way to correct, complete, reschedule, or delete existing work by language. It exists to reduce task-management overhead, not to encourage endless list grooming. It must fail closed when target identity or intent is uncertain, because confident mutation of the wrong task is worse than asking a short clarification.

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

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
End-to-end mutation regressions, fail-closed coverage (mixed/underspecified requests), observability assertions for mutation diagnostics, and cleanup of stale comments/fixtures from the earlier broken task package.

#### What's Actually Done:
Not started. Regenerated after previous version introduced load tests, extra test packages, and infrastructure work beyond accepted scope.

#### Gaps Found:
- Not started. This is the final stabilization pass for spec 002. It depends on ALL previous WPs (WP01-WP06) being complete.
- Previous version had significant scope creep (load tests = infrastructure work).

#### Product Vision Alignment Issues:
- Aligned. Fail-closed coverage protects against the Product Vision's biggest failure mode: "wrong task selection, wrong prioritization, too much confidence in the wrong direction."
- Observability assertions support debugging when the system gives wrong guidance.

#### Recommendations:
- Blocking on WP01-WP06. This is the final quality gate for the entire mutation feature. The regenerated scope correctly focuses on regression coverage and cleanup, not new features.
