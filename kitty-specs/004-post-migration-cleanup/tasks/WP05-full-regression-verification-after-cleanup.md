---
work_package_id: WP05
title: Full Regression Verification After Cleanup
dependencies:
- WP01
- WP02
- WP03
- WP04
requirement_refs:
- FR-004
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T017
- T018
- T019
- T020
- T021
phase: Phase 4 - Test Suite Verification
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQW
owned_files:
- tests/run-regression-tests.mjs
- tests/regression.test.js
- tests/e2e-live-checklist.mjs
- tests/e2e-live-ticktick.mjs
wp_code: WP05
---

# Work Package Prompt: WP05 - Full Regression Verification After Cleanup

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This cleanup matters because stale docs and dead paths create false confidence and wasted work. The cleanup must make the codebase easier to use for one personal behavioral assistant, not expand infrastructure for hypothetical scale.

**Implementation must**:
- Remove or label legacy paths only after proving they are dead or intentionally retained for a current behavior.
- Update docs so future work stays centered on behavioral execution support, not generic task management.
- Keep configuration and onboarding clear enough that the assistant can be run and validated without adding mental overhead.

**Implementation must not**:
- The cleanup removes a still-live path such as a briefing, weekly, or reorg helper without replacement.
- Documentation claims shipped behavioral capabilities that do not exist.
- The work adds new infrastructure, auth, billing, or multi-user abstractions unrelated to the accepted scope.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission removes stale implementation and documentation paths that would let future agents build against the wrong product. It is a drift-prevention mission: if legacy add-task behavior remains authoritative anywhere, implementers can accidentally preserve a generic task-manager pathway instead of the behavioral support system.

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

## Objectives and Success Criteria

Verify the cleanup did not break the assistant and that stale references were removed only where safe.

**Independent test**: Regression commands pass and grep checks prove removed legacy references are absent from production code unless explicitly documented as retained.

Success looks like:
- Regression suite passes after cleanup.
- Live test scripts parse without requiring real API calls.
- Grep verification is recorded in final notes.

## Context and Constraints

- Mission: `004-post-migration-cleanup`
- Canonical spec: `kitty-specs/004-post-migration-cleanup/spec.md`
- Canonical plan: `kitty-specs/004-post-migration-cleanup/plan.md`
- Canonical task list: `kitty-specs/004-post-migration-cleanup/tasks.md`
- Implementation command: `spec-kitty implement WP05 --mission 004-post-migration-cleanup`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- tests/run-regression-tests.mjs
- tests/regression.test.js
- tests/e2e-live-checklist.mjs
- tests/e2e-live-ticktick.mjs

## Subtasks and Detailed Guidance

### Subtask T017 - Run baseline regression commands

**Purpose**: Know the starting test state.

**Required work**:
- Run `node tests/run-regression-tests.mjs`.
- Run `node --test tests/regression.test.js` if subprocess support is available.
- Record failures before making them implementation blockers.

**Acceptance checks**:
- Baseline result is recorded.
- Any pre-existing failure is distinguished from cleanup regression.
- No live API call is made.

### Subtask T018 - Re-run after dead-code removal

**Purpose**: Catch accidental breakage early.

**Required work**:
- Run the same regression commands after WP01.
- If a test fails because removed code was live, restore or adapt with explicit justification.
- Keep changes scoped.

**Acceptance checks**:
- Post-WP01 regression state is known.
- No silent breakage is ignored.
- Restored code is commented if intentionally retained.

### Subtask T019 - Run final regression suite

**Purpose**: Confirm artifact and codebase readiness.

**Required work**:
- Run final regression commands after all cleanup WPs.
- Collect output for final report.
- Do not claim completion without verification.

**Acceptance checks**:
- Final regression commands pass or failures are fully explained.
- Output is summarized in the final handoff.
- No hidden long-running sessions remain.

### Subtask T020 - Run legacy pattern grep verification

**Purpose**: Prove stale code references are gone or documented.

**Required work**:
- Search production code for legacy task path symbols.
- Exclude specs and historical docs from zero-reference claims.
- Document allowed exceptions.

**Acceptance checks**:
- Production grep result is clean or exceptions are named.
- Spec markdown references are not confused with live code.
- Final report includes the grep result.

### Subtask T021 - Verify live E2E scripts parse

**Purpose**: Check opt-in scripts remain syntactically valid without hitting live APIs.

**Required work**:
- Use Node syntax or module-load checks that do not call TickTick.
- Confirm direct client usage comments exist.
- Do not require credentials.

**Acceptance checks**:
- Scripts parse or load safely.
- No live API request is made.
- Any load blocker is documented.

## Risks and Mitigations

- Risk: live tests require credentials. Mitigation: load or syntax-check scripts only; do not call live APIs.
- Risk: grep sees spec markdown references. Mitigation: production-code grep excludes `kitty-specs/`.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
