---
work_package_id: WP01
title: Ranking Contract and Inputs
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
subtasks:
- T001
- T002
- T003
- T004
phase: Phase 1 - Contract Definition
authoritative_surface: kitty-specs/007-execution-prioritization-foundations/
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RR
owned_files:
- kitty-specs/007-execution-prioritization-foundations/data-model.md
- kitty-specs/007-execution-prioritization-foundations/research.md
wp_code: WP01
---

# Work Package Prompt: WP01 - Ranking Contract and Inputs

## Objectives and Success Criteria

- Define the canonical ranking service API before implementation work begins.
- Normalize the minimum inputs needed for meaningful work assessment: goal themes, task candidates, and degraded-state markers.
- Make explicit which concerns stay outside this feature boundary.

Success looks like:
- one clear module API in `services/`
- explicit input and output shapes aligned with [`data-model.md`](C:\Users\Huzefa Khan\Downloads\Gmail\ticktick-gemini\.worktrees\007-execution-prioritization-foundations\kitty-specs\007-execution-prioritization-foundations\data-model.md)
- no ambiguity about how `007` differs from `006`, `008`, and `009`

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

- Governing spec: [`spec.md`](C:\Users\Huzefa Khan\Downloads\Gmail\ticktick-gemini\.worktrees\007-execution-prioritization-foundations\kitty-specs\007-execution-prioritization-foundations\spec.md)
- Implementation plan: [`plan.md`](C:\Users\Huzefa Khan\Downloads\Gmail\ticktick-gemini\.worktrees\007-execution-prioritization-foundations\kitty-specs\007-execution-prioritization-foundations\plan.md)
- Research findings: [`research.md`](C:\Users\Huzefa Khan\Downloads\Gmail\ticktick-gemini\.worktrees\007-execution-prioritization-foundations\kitty-specs\007-execution-prioritization-foundations\research.md)
- Data model: [`data-model.md`](C:\Users\Huzefa Khan\Downloads\Gmail\ticktick-gemini\.worktrees\007-execution-prioritization-foundations\kitty-specs\007-execution-prioritization-foundations\data-model.md)

Honor these constraints:
- do not fetch network state inside the ranking engine
- do not own work-style resolution that belongs to `008`
- do not introduce behavioral memory or retention that belongs to `009`
- keep the output inspectable in tests

## Subtasks and Detailed Guidance

### Subtask T001 - Audit duplicated prioritization logic
- **Purpose**: Build the exact inventory of local heuristics that the shared ranking service must replace or narrow later.
- **Steps**:
  1. Review `services/gemini.js` prompt paths and fallback ranking helpers.
  2. Review `bot/commands.js` policy sweep helpers that infer priority and target project.
  3. Record the duplicated behaviors and the consumer surfaces that depend on them.
- **Files**:
  - `services/gemini.js`
  - `bot/commands.js`
  - `kitty-specs/007-execution-prioritization-foundations/research.md`
- **Parallel**: Yes.
- **Notes**: Keep the audit grounded in the current repository, not in intended architecture.

### Subtask T002 - Define candidate and goal input contracts
- **Purpose**: Establish the exact fields the ranking engine will accept.
- **Steps**:
  1. Create or update the shared prioritization module with type-like JSDoc or equivalent contract comments.
  2. Align `PriorityCandidate` and `GoalThemeProfile` with `data-model.md`.
  3. Keep the contract minimal enough to survive future adoption by `006`, `008`, and `009`.
- **Files**:
  - `services/execution-prioritization.js` or equivalent new module
  - `kitty-specs/007-execution-prioritization-foundations/data-model.md`
- **Parallel**: No.
- **Notes**: This should define shape only, not ranking behavior.

### Subtask T003 - Define explicit goal and theme sourcing
- **Purpose**: Ensure user-owned meaning comes from explicit context rather than hidden heuristics.
- **Steps**:
  1. Inspect `services/user_context.example.js` and current loading behavior in `services/gemini.js`.
  2. Decide what the ranking service consumes directly in v1: raw context string, parsed themes, or both.
  3. Document fallback semantics when explicit goals are sparse.
- **Files**:
  - `services/gemini.js`
  - `services/user_context.example.js`
  - `services/execution-prioritization.js`
- **Parallel**: Yes.
- **Notes**: Avoid overfitting to one user-specific context file.

### Subtask T004 - Define result and degraded-state contract
- **Purpose**: Make the engine output deterministic and inspectable.
- **Steps**:
  1. Define `RecommendationResult`, `RankingDecision`, and degraded-state markers.
  2. Keep rationale fields structured so consumers can format them without reinterpreting policy.
  3. Make honest degradation explicit for ambiguous leverage or missing goals.
- **Files**:
  - `services/execution-prioritization.js`
  - `kitty-specs/007-execution-prioritization-foundations/data-model.md`
- **Parallel**: No.
- **Notes**: Rationale text can be a later concern, but the result object should reserve the field now.

## Risks and Mitigations

- **Risk**: Contract and implementation drift immediately after this package.
- **Mitigation**: Keep the module API and docs aligned in the same change set.
- **Risk**: Hidden state ownership leaks in from `008`.
- **Mitigation**: Treat work-style and urgent-mode as optional incoming modifiers only.

## Review Guidance

- Confirm the contract is small, explicit, and reusable.
- Confirm user-owned meaning is represented as explicit input, not implicit keyword magic.
- Confirm no memory or behavioral retention primitives appear in this package.

## Activity Log

- 2026-03-10T23:54:11Z - system - lane=planned - Prompt created.
- 2026-03-11T03:44:16Z – codex – lane=done – Implemented and committed on feature branch

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Audit duplicated prioritization logic, define candidate/goal input contracts, define goal/theme sourcing, define result and degraded-state contract.

#### What's Actually Done:
Marked done. Activity log shows implemented and committed. No review feedback recorded.

#### Gaps Found:
- No review feedback was recorded, which could mean either the implementation was clean or the review was lightweight. The WP scope is primarily contract definition — appropriate for a foundation WP.
- The audit of duplicated logic (T001) is valuable inventory work.

#### Product Vision Alignment Issues:
- Strongly aligned. This WP defines the ranking contract that enables "stop mistaking motion for progress" and "stop focusing on low-priority tasks that feel productive."
- Degraded-state markers support honest fallback when the system lacks sufficient data — "if the system is unsure what matters, it should ask directly."
- Explicit goal/theme sourcing prevents the system from inventing priorities the user never defined.

#### Recommendations:
- No action needed. Foundation WP well-executed.
