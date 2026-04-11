---
work_package_id: WP02
title: Core Leverage Ranking Engine
dependencies:
- WP01
requirement_refs:
- FR-004
- FR-006
- FR-008
- FR-009
subtasks:
- T005
- T006
- T007
- T008
- T009
phase: Phase 2 - Core Policy Engine
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RR
owned_files:
- kitty-specs/007-execution-prioritization-foundations/plan.md
- kitty-specs/007-execution-prioritization-foundations/spec.md
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP02
---

# Work Package Prompt: WP02 - Core Leverage Ranking Engine

## Objectives and Success Criteria

- Implement the pure shared ranking service in `services/`.
- Rank meaningful progress ahead of low-value admin by default.
- Support honest fallback behavior and unknown-state-safe inputs.

Success looks like:
- a stable exported ranking function
- deterministic outputs for the same inputs
- baseline unit tests for leverage ordering and degraded fallback behavior

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

- This package depends on the contract from WP01.
- Keep the module pure. No Telegram, Redis, scheduler, or TickTick API side effects.
- The engine should accept optional modifiers, but it must not own the resolver for work style or urgent mode.

Relevant files:
- `services/gemini.js`
- `bot/commands.js`
- `kitty-specs/007-execution-prioritization-foundations/spec.md`
- `kitty-specs/007-execution-prioritization-foundations/plan.md`

## Subtasks and Detailed Guidance

### Subtask T005 - Create the shared prioritization module
- **Purpose**: Establish the implementation home for all ranking behavior.
- **Steps**:
  1. Add `services/execution-prioritization.js`.
  2. Export a small API, such as `rankPriorityCandidates(...)`.
  3. Keep helper functions local unless they are clearly reusable.
- **Files**:
  - `services/execution-prioritization.js`
- **Parallel**: No.
- **Notes**: Follow the repo's ESM conventions and keep names domain-specific.

### Subtask T006 - Implement leverage-first assessment
- **Purpose**: Encode the default ranking policy required by the spec.
- **Steps**:
  1. Score or classify candidates by explicit goal alignment, urgency, and consequential life-theme fit.
  2. Ensure low-value admin is not promoted over meaningful work when meaningful work is available.
  3. Keep the logic inspectable and avoid prompt-only hidden rules.
- **Files**:
  - `services/execution-prioritization.js`
- **Parallel**: No.
- **Notes**: The exact numeric scoring strategy is less important than stable and testable ordering behavior.

### Subtask T007 - Implement honest fallback behavior
- **Purpose**: Avoid false precision when leverage is ambiguous.
- **Steps**:
  1. Detect when explicit goal/theme information is missing or weak.
  2. Fall back to urgency and consequence instead of pretending strong strategic insight.
  3. Mark degraded output explicitly in the result object.
- **Files**:
  - `services/execution-prioritization.js`
- **Parallel**: No.
- **Notes**: Reuse existing keyword heuristics only as fallback behavior, and mark them as such.

### Subtask T008 - Support unknown-state-safe inputs
- **Purpose**: Keep the engine usable before `008` lands.
- **Steps**:
  1. Accept work-style mode and urgent-mode as optional inputs.
  2. Treat missing state as `unknown` plus safe defaults.
  3. Ensure missing state does not block recommendation output.
- **Files**:
  - `services/execution-prioritization.js`
- **Parallel**: No.
- **Notes**: This package should not define freshness or state precedence rules.

### Subtask T009 - Add baseline unit tests
- **Purpose**: Prove the default policy works before exception handling is layered in.
- **Steps**:
  1. Add focused tests for meaningful-work-over-admin ranking.
  2. Add tests for degraded output when goals are ambiguous.
  3. Keep fixtures small and legible.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - or a new ranking-specific test file if that fits the repo better
- **Parallel**: Yes, after the exported API is stable.
- **Notes**: Prefer tests that assert ordering and rationale codes over brittle full-text outputs.

## Risks and Mitigations

- **Risk**: Existing reorg heuristics become a shadow ranking engine.
- **Mitigation**: Keep current heuristics behind a single fallback path and prepare later consumers to call this module.
- **Risk**: Unknown-state support quietly imports `008` behavior.
- **Mitigation**: Restrict this package to optional input handling only.

## Review Guidance

- Verify the engine is pure and deterministic.
- Verify degraded paths are explicit.
- Verify low-value admin does not outrank meaningful work by default.

## Activity Log

- 2026-03-10T23:54:11Z - system - lane=planned - Prompt created.
- 2026-03-11T03:44:16Z – codex – lane=done – Implemented and committed on feature branch

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Pure ranking engine in services/execution-prioritization.js. Leverage-first assessment (meaningful work over admin). Honest fallback when goals missing. Unknown-state-safe inputs. Baseline tests.

#### What's Actually Done:
Marked done. No review feedback recorded.

#### Gaps Found:
- No review feedback. The WP scope is well-constrained: pure function, no side effects, deterministic outputs.

#### Product Vision Alignment Issues:
- This is THE Product Vision WP. "Prioritization is one of the core things the system must do well." The leverage-first ranking (meaningful progress over low-value admin) directly addresses "stop mistaking motion for progress."
- Honest fallback when goals are missing prevents "pretending certainty" about what matters.
- Unknown-state-safe inputs ensure the ranking works even before spec 008 (work style) lands.

#### Recommendations:
- No action needed. Core policy engine WP.
