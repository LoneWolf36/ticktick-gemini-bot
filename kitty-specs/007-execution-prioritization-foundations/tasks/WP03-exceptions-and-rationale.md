---
work_package_id: WP03
title: Exceptions and Rationale
dependencies:
- WP02
requirement_refs:
- FR-005
- FR-007
subtasks:
- T010
- T011
- T012
- T013
phase: Phase 3 - Recovery-Aware Overrides
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RR
owned_files:
- kitty-specs/007-execution-prioritization-foundations/data-model.md
- kitty-specs/007-execution-prioritization-foundations/plan.md
- kitty-specs/007-execution-prioritization-foundations/research.md
- kitty-specs/007-execution-prioritization-foundations/spec.md
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP03
---

# Work Package Prompt: WP03 - Exceptions and Rationale

## Objectives and Success Criteria

- Allow maintenance, recovery, and enabling work to outrank deeper work only when the exception is justified.
- Produce short rationale output that explains why the recommendation won.
- Keep exceptions structured enough for downstream consumers to inspect and format.

Success looks like:
- explicit exception reason codes
- concise rationale text derived from structured decisions
- regression coverage for justified exception cases

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

- This package depends on the core engine from WP02.
- Do not transform the product into admin-first ranking.
- Do not introduce stronger intervention tone or behavioral judgments; those boundaries remain downstream constraints.

Supporting docs:
- `kitty-specs/007-execution-prioritization-foundations/spec.md`
- `kitty-specs/007-execution-prioritization-foundations/plan.md`
- `kitty-specs/007-execution-prioritization-foundations/research.md`

## Subtasks and Detailed Guidance

### Subtask T010 - Implement recovery and enabling exceptions
- **Purpose**: Capture the narrow cases where lower-friction work should outrank deeper work.
- **Steps**:
  1. Model blocker removal, urgent real-world requirements, and capacity protection explicitly.
  2. Apply exceptions only after default leverage ordering is evaluated.
  3. Keep exception handling deterministic and testable.
- **Files**:
  - `services/execution-prioritization.js`
- **Parallel**: No.
- **Notes**: Avoid catch-all exception branches that silently weaken the whole policy.

### Subtask T011 - Encode explicit exception reasons
- **Purpose**: Let downstream consumers know whether an override occurred and why.
- **Steps**:
  1. Add exception reason fields to the result object.
  2. Keep allowed values narrow and aligned with the spec.
  3. Ensure non-exception recommendations report `none` cleanly.
- **Files**:
  - `services/execution-prioritization.js`
  - `kitty-specs/007-execution-prioritization-foundations/data-model.md`
- **Parallel**: Yes, once T010 starts stabilizing.
- **Notes**: Use codes first; text comes next.

### Subtask T012 - Generate deterministic rationale text
- **Purpose**: Convert structured ranking decisions into a short user-facing explanation.
- **Steps**:
  1. Create a small rationale builder that maps codes and flags to text.
  2. Keep the wording concise and non-moralizing.
  3. Make rationale generation independent of Gemini prompt wording.
- **Files**:
  - `services/execution-prioritization.js`
- **Parallel**: Yes, after T011 is stable.
- **Notes**: Consumers should be able to render either the text or the structured fields.

### Subtask T013 - Add exception regression coverage
- **Purpose**: Prevent exception logic from regressing into arbitrary overrides.
- **Steps**:
  1. Add tests for blocker removal outranking deep work.
  2. Add tests for urgent maintenance outranking deeper work when justified.
  3. Add tests for capacity protection or enabling-step scenarios.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - or a new ranking-specific test file
- **Parallel**: Yes, after the result shape is stable.
- **Notes**: Test both ordering and rationale output.

## Risks and Mitigations

- **Risk**: Exception handling becomes a loophole that promotes admin work too often.
- **Mitigation**: Keep reasons explicit and test representative counterexamples.
- **Risk**: Rationale text drifts from actual ranking behavior.
- **Mitigation**: Generate text from result codes, not separate prompt logic.

## Review Guidance

- Verify exception handling is narrow and justified.
- Verify rationale wording is concise and legible.
- Verify tests cover both exception and non-exception paths.

## Activity Log

- 2026-03-10T23:54:11Z - system - lane=planned - Prompt created.
- 2026-03-11T03:44:16Z – codex – lane=done – Implemented and committed on feature branch
