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
