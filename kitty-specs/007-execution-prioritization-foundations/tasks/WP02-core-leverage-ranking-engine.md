---
work_package_id: WP02
title: Core Leverage Ranking Engine
lane: "done"
dependencies:
- WP01
subtasks:
- T005
- T006
- T007
- T008
- T009
phase: Phase 2 - Core Policy Engine
assignee: ''
agent: "codex"
shell_pid: "11900"
review_status: "approved"
reviewed_by: "TickTick Bot"
history:
- timestamp: '2026-03-10T23:54:11Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-004
- FR-006
- FR-008
- FR-009
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
