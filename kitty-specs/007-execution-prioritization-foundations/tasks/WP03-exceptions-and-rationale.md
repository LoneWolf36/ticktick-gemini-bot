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
