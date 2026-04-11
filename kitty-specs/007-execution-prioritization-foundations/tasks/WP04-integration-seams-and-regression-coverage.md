---
work_package_id: WP04
title: Integration Seams and Regression Coverage
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- FR-010
subtasks:
- T014
- T015
- T016
- T017
- T018
phase: Phase 4 - Adoption and Verification
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RR
owned_files:
- kitty-specs/007-execution-prioritization-foundations/data-model.md
- kitty-specs/007-execution-prioritization-foundations/research.md
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP04
---

# Work Package Prompt: WP04 - Integration Seams and Regression Coverage

## Objectives and Success Criteria

- Add a thin consumer seam so downstream recommendation or summary code can call the shared ranking service.
- Reduce local policy drift by narrowing duplicated helpers where safe.
- Lock the shared behavior down with regression coverage and adoption notes.

Success looks like:
- at least one consumer surface can use the shared service
- downstream inheritance is asserted in tests
- adjacent tracks can adopt the module without redefining its core policy

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature is the policy core of the product vision: the assistant must help the user stop mistaking motion for progress and consistently identify work that actually matters.

**Implementation must**:
- Rank leverage, goal alignment, and consequential progress ahead of low-value busywork by default.
- Use honest degraded behavior when the system cannot know what matters; ask or expose uncertainty rather than inventing precision.
- Allow exceptions only for clearly justified blockers, urgent real-world constraints, or capacity protection.

**Implementation must not**:
- The ranking model optimizes for due dates, small-task count, or completion volume over meaningful progress.
- The implementation hard-codes the user’s values instead of consuming explicit goal context.
- The rationale hides uncertainty behind confident coaching language.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission is the judgment engine for what matters. It must prevent the product's biggest failure mode: confidently steering the user toward the wrong work. Ranking must favor leverage, long-term goals, due pressure, and realistic execution while suppressing busywork that merely feels productive.

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

## Context and Constraints

- This package depends on WP01, WP02, and WP03.
- Do not fully rewrite `/briefing` or `/weekly` here.
- Do not add behavioral memory, privacy retention, or stronger coaching policies.

Primary files:
- `bot/commands.js`
- `services/gemini.js`
- `services/scheduler.js`
- `tests/`

## Subtasks and Detailed Guidance

### Subtask T014 - Add a thin consumer integration seam
- **Purpose**: Make the ranking engine usable by existing recommendation surfaces.
- **Steps**:
  1. Identify one narrow consumer path, likely a recommendation-oriented helper or summary-preparation seam.
  2. Route that seam through the shared prioritization module.
  3. Keep the integration incremental rather than rewriting multiple surfaces at once.
- **Files**:
  - `services/gemini.js`
  - `bot/commands.js`
  - `services/scheduler.js` if needed
- **Parallel**: No.
- **Notes**: The goal is adoption readiness, not full migration.

### Subtask T015 - Narrow duplicated local helpers
- **Purpose**: Reduce policy drift between the shared service and legacy local heuristics.
- **Steps**:
  1. Identify the lowest-risk duplicated helpers in `bot/commands.js` and `services/gemini.js`.
  2. Replace or narrow them so they either call the shared service or are clearly fallback-only.
  3. Preserve sensitive-content guards and other unrelated protections.
- **Files**:
  - `bot/commands.js`
  - `services/gemini.js`
- **Parallel**: No.
- **Notes**: Do not remove safety logic that is not actually ranking policy.

### Subtask T016 - Add downstream inheritance regressions
- **Purpose**: Prove that consumers stop inventing local prioritization behavior.
- **Steps**:
  1. Add tests that assert a consumer path uses shared ranking outputs.
  2. Add tests that meaningful work remains ahead of admin work in consumer-facing results.
  3. Keep fixtures narrow and deterministic.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, after T014 is in place.
- **Notes**: Prefer targeted assertions over brittle large-output snapshots.

### Subtask T017 - Add unknown-state and degraded-path regressions
- **Purpose**: Protect the feature boundary with `008`.
- **Steps**:
  1. Add tests where no fresh explicit state exists.
  2. Verify recommendation output still returns with honest degradation markers.
  3. Verify urgent-mode and work-style are treated as optional modifiers rather than owned state.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, after T014 is in place.
- **Notes**: These tests should guard against accidental scope creep into `008`.

### Subtask T018 - Update adoption notes for adjacent tracks
- **Purpose**: Make later implementation work less likely to reintroduce drift.
- **Steps**:
  1. Update relevant docs or artifacts with adoption guidance for `006`, `008`, and `009`.
  2. Tighten any example context notes only if necessary to support the new contract.
  3. Keep the guidance concise and anchored to the existing feature artifacts.
- **Files**:
  - `kitty-specs/007-execution-prioritization-foundations/research.md`
  - `kitty-specs/007-execution-prioritization-foundations/data-model.md`
  - `services/user_context.example.js` only if required
- **Parallel**: Yes.
- **Notes**: Prefer documentation updates over speculative code changes if no direct consumer needs the extra behavior yet.

## Risks and Mitigations

- **Risk**: This package balloons into full migration work for summary surfaces.
- **Mitigation**: Limit changes to seam creation, helper narrowing, and tests.
- **Risk**: Regression tests accidentally lock in current prompt wording.
- **Mitigation**: Assert policy behavior and structured outputs, not exact prose beyond small rationale snippets.

## Review Guidance

- Verify the shared service is actually being consumed by at least one surface.
- Verify duplicated heuristics are reduced without breaking unrelated safeguards.
- Verify the tests protect feature boundaries with `006`, `008`, and `009`.

## Activity Log

- 2026-03-10T23:54:11Z - system - lane=planned - Prompt created.
- 2026-03-11T03:44:16Z – codex – lane=done – Implemented and committed on feature branch
