---
work_package_id: WP04
title: Integration Seams and Regression Coverage
lane: "done"
dependencies:
- WP01
- WP02
- WP03
subtasks:
- T014
- T015
- T016
- T017
- T018
phase: Phase 4 - Adoption and Verification
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
- FR-010
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
