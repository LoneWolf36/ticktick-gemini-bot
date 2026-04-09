---
work_package_id: WP01
title: Task Resolver Core
dependencies: []
requirement_refs:
- FR-002
- FR-003
- FR-008
- FR-009
base_branch: master
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T011
- T012
- T013
- T014
- T015
phase: Phase 1 - Parallel Foundations
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQT
owned_files:
- kitty-specs/001-task-operations-pipeline/spec.md
- kitty-specs/002-natural-language-task-mutations/plan.md
- kitty-specs/002-natural-language-task-mutations/spec.md
- src/...
- tests/pipeline-harness.js
- tests/task-resolver.test.js
wp_code: WP01
---

# Work Package Prompt: WP01 - Task Resolver Core

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task.**

- **Has review feedback?** Check the current review status before starting implementation.
- **You must address all review feedback** before marking the work package complete.
- **Report progress** by appending Activity Log entries in chronological order.

---

## Review Feedback

> Populated by `/spec-kitty.review` when changes are requested.

*[This section is empty initially. Any later feedback becomes mandatory scope.]*  

---

## Markdown Formatting

Wrap HTML/XML tags in backticks: `` `<div>` ``, `` `<script>` ``  
Use language identifiers in fenced code blocks.

---

## Objectives & Success Criteria

- Create one deterministic resolver module that takes a mutation `targetQuery` plus active tasks and returns one of three outcomes: `resolved`, `clarification`, or `not_found`.
- Bias toward safety: exact title matches should win immediately, while fuzzy handling must stay conservative and test-backed.
- Make the resolver output directly consumable by `services/pipeline.js` so later packages do not need another translation layer.
- Freeze the resolver contract with focused unit tests before any pipeline wiring starts.

## Context & Constraints

- Implementation command: `spec-kitty implement WP01`
- Canonical references:
  - `kitty-specs/002-natural-language-task-mutations/spec.md`
  - `kitty-specs/002-natural-language-task-mutations/plan.md`
  - `kitty-specs/001-task-operations-pipeline/spec.md`
  - `services/pipeline.js`
  - `services/ticktick.js`
  - `tests/pipeline-harness.js`
- This package may add `services/task-resolver.js` and `tests/task-resolver.test.js`.
- Do not create a generic matching framework, plugin registry, or `src/` tree.
- Keep the matching contract explainable in code and in tests; avoid “magic confidence” that is not encoded as named constants.
- Resolver output should keep enough evidence for later logging: selected candidate, candidate list, and skip reason.

## Subtasks & Detailed Guidance

### Subtask T011 - Create `services/task-resolver.js` and the shared resolver data contract
- **Purpose**: Establish the one new module this feature needs and define the output shape downstream code will rely on.
- **Steps**:
  1. Create `services/task-resolver.js` as a small function-based module.
  2. Add title-normalization helpers local to the resolver unless they are clearly reusable elsewhere in this repo.
  3. Define candidate objects with stable fields such as `taskId`, `projectId`, `title`, `score`, and `matchType`.
  4. Define resolver result objects with stable fields such as `status`, `selected`, `candidates`, and `reason`.
  5. Export a narrow API; do not expose half-finished internal helpers that later WPs will not need.
- **Files to Touch**:
  - `services/task-resolver.js`
- **Tests / Acceptance Cues**:
  - Downstream code should be able to branch on `status` without guessing field presence.
  - Candidate objects should preserve the original task title for user-facing clarification later.
- **Guardrails**:
  - No direct TickTick API calls belong here.
  - No store access belongs here.

### Subtask T012 - Implement exact, prefix, contains, and conservative fuzzy matching
- **Purpose**: Encode the deterministic matching stages that make safe auto-resolution possible.
- **Steps**:
  1. Implement exact title comparison after normalization.
  2. Implement prefix and contains matching for near-literal references.
  3. Implement a conservative fuzzy matcher suitable for close typos or small phrasing drift.
  4. Keep all thresholds as named constants in the module.
  5. Ensure task ordering is deterministic when multiple candidates share the same score.
- **Files to Touch**:
  - `services/task-resolver.js`
- **Tests / Acceptance Cues**:
  - Exact match must outrank every non-exact match.
  - Small typos such as dropped letters should produce candidates without silently outranking a true exact match.
  - Duplicate or near-duplicate titles should remain distinguishable in the result set.
- **Guardrails**:
  - Do not add NLP heuristics beyond string matching in this package.
  - Do not auto-resolve broad fuzzy matches just because a candidate exists.

### Subtask T013 - Implement resolver decision rules for `resolved`, `clarification`, and `not_found`
- **Purpose**: Turn candidate scoring into a safe execution decision aligned with the accepted spec.
- **Steps**:
  1. Return `resolved` when there is one exact match.
  2. Return `resolved` for non-exact matches only when there is one clear winner and no close rival.
  3. Return `clarification` when multiple plausible candidates remain.
  4. Return `not_found` when no candidate reaches the minimum plausible threshold.
  5. Include a machine-readable `reason` for all non-`resolved` results.
- **Files to Touch**:
  - `services/task-resolver.js`
- **Tests / Acceptance Cues**:
  - `done call mom` with `Call mom` and `Call mom about insurance` should become `clarification`.
  - A nonexistent target should become `not_found` with no selected task.
  - Delete safety should rely on the same `clarification` vs `resolved` contract, not on a separate delete-only branch here.
- **Guardrails**:
  - Do not hardcode Telegram copy in the resolver.
  - Keep delete-specific messaging for later layers; only return neutral reasons here.

### Subtask T014 - Add focused resolver unit coverage in `tests/task-resolver.test.js`
- **Purpose**: Lock the resolver before pipeline integration starts.
- **Steps**:
  1. Add tests for normalization and candidate shaping.
  2. Add tests for exact, prefix, contains, and fuzzy scenarios.
  3. Add tests for ambiguity and not-found outcomes.
  4. Add tests for repeated titles, punctuation differences, and case differences.
  5. Keep the test data small but representative of the real task titles seen in this repo.
- **Files to Touch**:
  - `tests/task-resolver.test.js`
- **Tests / Acceptance Cues**:
  - The file should run under `node --test`.
  - Tests should assert stable `status`, `reason`, and selected candidate IDs rather than fuzzy prose.
- **Guardrails**:
  - Avoid synthetic benchmark assertions here; the goal is correctness first.

### Subtask T015 - Freeze resolver fixtures and downstream consumption assumptions
- **Purpose**: Make later WPs depend on one resolver contract instead of reinterpreting candidate structures ad hoc.
- **Steps**:
  1. Add a small representative task fixture set that downstream tests can reuse.
  2. Document the expected resolver output shape in comments close to the export surface.
  3. Ensure the resolver result keeps enough data for later logging and user-facing clarification text.
  4. Confirm that downstream packages can treat `resolved`, `clarification`, and `not_found` as the only public result states.
- **Files to Touch**:
  - `services/task-resolver.js`
  - `tests/task-resolver.test.js`
- **Tests / Acceptance Cues**:
  - No downstream package should need to inspect internal scoring arrays beyond the exported candidate list.
  - Test fixtures should be reusable from regression tests without copy-paste drift.
- **Guardrails**:
  - Keep this as contract hardening, not as a second integration package.

## Definition of Done

- `services/task-resolver.js` exists and exports one stable resolver surface.
- Unit tests cover exact, fuzzy, ambiguous, and not-found behaviors.
- Resolver outcomes are machine-readable and suitable for later pipeline logging.
- No repo-path drift (`src/...`) or speculative infrastructure is introduced.

## Activity Log

- 2026-04-01: WP regenerated after review-first audit; prior prompt replaced because it drifted from the repo structure and current Spec Kitty contract.
