---
work_package_id: WP01
title: Foundation - Shared Summary Surface Contracts
lane: "for_review"
dependencies: []
base_branch: master
base_commit: aae6aa2d3d95386d8c29718b8302d2a2248d5467
created_at: '2026-03-13T16:52:10.205876+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
phase: Phase 1 - Foundation
assignee: ''
agent: "Codex"
shell_pid: "2764"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-12T21:19:42Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-003
- FR-004
- FR-008
---

# Work Package Prompt: WP01 - Foundation - Shared Summary Surface Contracts

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task.**

- **Has review feedback?** Check the `review_status` field above. If it says `has_feedback`, read the Review Feedback section immediately.
- **You must address all feedback** before the work is complete.
- **Mark as acknowledged** when you begin addressing review feedback.
- **Report progress** by appending Activity Log entries in chronological order.

---

## Review Feedback

> Populated by `/spec-kitty.review` when changes are requested.

*[This section is empty initially. If reviewers add items here later, each item becomes mandatory implementation scope.]*  

---

## Markdown Formatting

Wrap HTML/XML tags in backticks: `` `<div>` ``, `` `<script>` ``  
Use language identifiers in fenced code blocks.

---

## Objectives & Success Criteria

- Establish the minimal `services/summary-surfaces/` module boundary that all later work packages share.
- Encode the fixed top-level section contracts in code so later work cannot silently drift.
- Create deterministic test fixtures and contract checks that let downstream streams branch without rediscovering the schema.
- Keep the foundation lean: no new framework, no new storage, no command/scheduler rewrites yet.

## Context & Constraints

- Implementation command: `spec-kitty implement WP01`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `kitty-specs/006-briefing-weekly-modernization/quickstart.md`
  - `.kittify/memory/constitution.md`
- The clarified section contracts are fixed:
  - `/briefing`: `focus`, `priorities`, `why_now`, `start_now`, `notices`
  - `/weekly`: `progress`, `carry_forward`, `next_focus`, `watchouts`, `notices`
- Keep weekly watchouts non-behavioral and evidence-backed.
- Avoid overengineering. The acceptable new surface area here is the small `services/summary-surfaces/` folder plus the minimum shared schema/helpers needed to support it.

## Subtasks & Detailed Guidance

### Subtask T001 - Create the shared summary surface folder and export seams
- **Purpose**: Give every downstream package a stable module boundary so work can split by file instead of colliding in `services/gemini.js`.
- **Steps**:
  1. Create `services/summary-surfaces/index.js`.
  2. Create `services/summary-surfaces/briefing-summary.js`.
  3. Create `services/summary-surfaces/weekly-summary.js`.
  4. Create `services/summary-surfaces/summary-formatter.js`.
  5. Keep the files function-based; do not introduce classes or a generic plugin registry.
  6. Export final function names now, even if some implementations stay thin until later packages.
- **Files**:
  - `services/summary-surfaces/index.js`
  - `services/summary-surfaces/briefing-summary.js`
  - `services/summary-surfaces/weekly-summary.js`
  - `services/summary-surfaces/summary-formatter.js`
- **Parallel?**: No. This is the root seam all later work depends on.
- **Notes**:
  - Prefer small named exports such as `composeBriefingSummary`, `composeWeeklySummary`, and `formatSummary`.
  - This package should not wire `bot/commands.js` or `services/scheduler.js` to the new surface yet.

### Subtask T002 - Define shared summary schemas and contract helpers
- **Purpose**: Turn the clarified section contract into code-level invariants before any behavior-specific logic lands.
- **Steps**:
  1. Add or extend structured response schemas in `services/schemas.js` for daily and weekly summaries.
  2. Encode required top-level sections for both summary kinds.
  3. Add shared helpers in `services/summary-surfaces/index.js` or a small local helper block that normalize missing sections into empty arrays or safe strings.
  4. Ensure weekly watchout helpers accept only evidence-backed values and never expose prompt-era fields such as `avoidance` or `callout`.
  5. Keep nested fields intentionally light; freeze top-level sections, not every possible inner key.
- **Files**:
  - `services/schemas.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No. Downstream packages need this exact shape.
- **Notes**:
  - Match the contract file in `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`.
  - Treat the data model as canonical for field meaning and invariants.

### Subtask T003 - Create reusable summary fixtures and builders for tests
- **Purpose**: Make downstream TDD practical by giving every stream consistent input builders for tasks, processed history, and resolved state.
- **Steps**:
  1. Add fixture builders for active tasks with normal, sparse, and degraded-ranking cases.
  2. Add processed-history builders that can represent normal weekly history, sparse history, and missing-history scenarios.
  3. Add resolved-state helpers for urgent mode on/off without depending on live store state.
  4. Keep fixtures deterministic and local to existing regression entry points unless a tiny shared test helper is clearly cleaner.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - optional small helper addition in `tests/pipeline-harness.js` only if it materially reduces duplication
- **Parallel?**: Yes, after T002 defines the contract surface.
- **Notes**:
  - Do not add live API dependencies.
  - Fixtures should map directly to quickstart scenarios so later validation stays consistent.

### Subtask T004 - Add contract-first regression checks
- **Purpose**: Enforce the section contract and scope boundary before feature behavior becomes more complex.
- **Steps**:
  1. Add regression checks that assert the daily summary surface always exposes `focus`, `priorities`, `why_now`, `start_now`, and `notices`.
  2. Add regression checks that assert the weekly summary surface always exposes `progress`, `carry_forward`, `next_focus`, `watchouts`, and `notices`.
  3. Add a boundary test showing weekly watchouts cannot carry behavior labels or unsupported prompt-era fields.
  4. Keep the checks focused on contract shape and scope boundary, not on final copy.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel?**: Yes, after T003.
- **Notes**:
  - These tests should pass with the foundation implementation, not stay intentionally failing.
  - They become the base safety net for WP02, WP03, and WP04.

### Subtask T005 - Freeze import seams and temporary orchestration hooks
- **Purpose**: Make later work packages safe to branch by agreeing on stable entry points and dependency flow now.
- **Steps**:
  1. Expose the final orchestration function names from `services/summary-surfaces/index.js`.
  2. Define the minimum argument contract those functions will accept based on `data-model.md`.
  3. Leave behavior-specific content shaping for later packages, but make the import and call pattern final.
  4. Add concise comments only where the temporary seam would otherwise be ambiguous.
- **Files**:
  - `services/summary-surfaces/index.js`
  - `services/summary-surfaces/briefing-summary.js`
  - `services/summary-surfaces/weekly-summary.js`
  - `services/summary-surfaces/summary-formatter.js`
- **Parallel?**: No. This closes the foundation package.
- **Notes**:
  - The goal is branch-safe interfaces, not complete behavior.
  - Avoid fake abstraction layers such as strategy registries or generic report factories.

## Test Strategy

- Required commands:
  - `node tests/run-regression-tests.mjs`
  - `node --test tests/regression.test.js`
- Mandatory assertions:
  - fixed top-level section presence
  - weekly watchout scope boundary
  - deterministic fixture/builders for later packages

## Risks & Mitigations

- **Risk**: The foundation grows into an overdesigned framework.
  - **Mitigation**: Limit new code to the four summary-surface files plus targeted schema/test helpers.
- **Risk**: Later packages redefine interfaces anyway.
  - **Mitigation**: Freeze export names and contract tests in this package.
- **Risk**: Test builders become coupled to implementation details.
  - **Mitigation**: Keep builders focused on public contract inputs and outputs only.

## Review Guidance

- Confirm the new module split is minimal and local to `services/summary-surfaces/`.
- Confirm contract tests exist and pass before any command/scheduler wiring begins.
- Confirm no new public API, persistence layer, or behaviorally loaded weekly fields were introduced.
- Confirm downstream packages can branch from this package without redefining schemas or import names.

## Activity Log

- 2026-03-12T21:19:42Z - system - lane=planned - Prompt generated.

---

### Updating Lane Status

Use `spec-kitty agent tasks move-task <WPID> --to <lane> --note "message"` or edit the frontmatter plus append a new activity log entry.

**Valid lanes**: `planned`, `doing`, `for_review`, `done`
- 2026-03-13T16:52:12Z – Codex – shell_pid=2764 – lane=doing – Assigned agent via workflow command
- 2026-03-13T17:00:21Z – Codex – shell_pid=2764 – lane=for_review – Ready for review: shared summary surface seams, schemas, fixtures, and contract tests are implemented and passing
