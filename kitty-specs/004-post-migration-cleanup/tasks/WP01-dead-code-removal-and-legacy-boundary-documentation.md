---
work_package_id: WP01
title: Dead Code Removal and Legacy Boundary Documentation
dependencies: []
requirement_refs:
- FR-003
- FR-004
- FR-005
base_branch: kitty/mission-004-post-migration-cleanup
base_commit: 3f0c32fb48b97538447208d172f1a260ade8ffc9
created_at: '2026-04-15T17:45:53.049482+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
phase: Phase 1 - Legacy Code Removal
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQW
owned_files:
- bot/commands.js
- services/gemini.js
- services/schemas.js
- tests/e2e-live-checklist.mjs
- tests/e2e-live-ticktick.mjs
wp_code: WP01
---

# Work Package Prompt: WP01 - Dead Code Removal and Legacy Boundary Documentation

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

Remove truly dead pre-migration task paths and document any intentionally retained legacy helpers so future work does not revive behavior that undermines the structured assistant.

**Independent test**: A grep audit plus regression run proves that removed legacy paths have no production callers and that intentionally retained paths are clearly labeled.

Success looks like:
- Dead production references to replaced task-writing helpers are gone.
- Retained helpers have clear comments explaining current scope.
- No user-facing behavior changes except removal of truly dead paths.

## Context and Constraints

- Mission: `004-post-migration-cleanup`
- Canonical spec: `kitty-specs/004-post-migration-cleanup/spec.md`
- Canonical plan: `kitty-specs/004-post-migration-cleanup/plan.md`
- Canonical task list: `kitty-specs/004-post-migration-cleanup/tasks.md`
- Implementation command: `spec-kitty implement WP01 --mission 004-post-migration-cleanup`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- bot/commands.js
- services/gemini.js
- services/schemas.js
- tests/e2e-live-checklist.mjs
- tests/e2e-live-ticktick.mjs

## Subtasks and Detailed Guidance

### Subtask T001 - Run legacy reference audit

**Purpose**: Find stale implementation surfaces before deleting anything.

**Required work**:
- Search production `.js` and `.mjs` files for `converse`, `converseSchema`, `ANALYZE_PROMPT`, `analyzeTask`, and `runTaskIntake`.
- Classify each hit as dead, live legacy, or spec/test-only.
- Record allowed live exceptions in comments or docs.

**Acceptance checks**:
- Audit distinguishes production code from spec markdown.
- No deletion is made without a caller classification.
- Allowed exceptions are explicit.

### Subtask T002 - Remove dead imports and exports

**Purpose**: Delete only code with no live production caller.

**Required work**:
- Remove unused schema exports, helper imports, and orphaned functions found by T001.
- Keep shared Gemini infrastructure that still powers briefing, weekly, or reorg.
- Run syntax and regression checks after removals.

**Acceptance checks**:
- No import errors remain.
- Regression suite still passes.
- Removed code has no production caller.

### Subtask T003 - Document retained policy-sweep helper scope

**Purpose**: Prevent future agents from treating retained helpers as the primary task-writing path.

**Required work**:
- Add a short inline scope comment to `executeActions()` if still retained.
- State that primary task creation/mutation uses AX -> normalizer -> adapter.
- Name the retained flow that still needs the helper.

**Acceptance checks**:
- Comment is near the retained helper.
- Comment explains why the helper is not dead.
- No broad behavior changes are introduced.

### Subtask T004 - Document live E2E adapter bypasses

**Purpose**: Avoid confusing opt-in live API tests with production write paths.

**Required work**:
- Add comments to live E2E scripts where direct TickTick client usage is intentional.
- Clarify that tests are opt-in and not a bot execution path.
- Avoid changing test semantics unless required by syntax checks.

**Acceptance checks**:
- Comments exist in both live E2E scripts if direct client usage remains.
- Tests still load.
- No secrets or tokens are added.

### Subtask T005 - Audit reorg Gemini helpers

**Purpose**: Keep only live reorg helpers and label their scope.

**Required work**:
- Review `_buildFallbackReorgProposal` and `_normalizeReorgProposal` usage.
- Keep and comment helpers if the reorg flow still depends on them.
- Remove only if fully superseded and covered by tests.

**Acceptance checks**:
- Reorg helper status is explicit.
- No live reorg behavior is broken.
- Regression tests cover the retained or removed path.

## Risks and Mitigations

- Risk: removing a helper still needed by briefing, weekly, or reorg. Mitigation: grep callers first and run regression tests after each removal.
- Risk: cleanup becomes broad refactor. Mitigation: remove only proven dead code and comment live exceptions.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
