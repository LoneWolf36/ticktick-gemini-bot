---
work_package_id: WP03
title: Failure Classification, Quota Semantics, and Story 2 User Messaging
dependencies:
- WP01
requirement_refs:
- FR-003
- FR-004
- FR-007
- FR-010
base_branch: 003-pipeline-hardening-and-regression-WP03-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T009
- T010
- T011
phase: Phase 3 - Failure Semantics
authoritative_surface: kitty-specs/003-pipeline-hardening-and-regression/
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQV
owned_files:
- kitty-specs/003-pipeline-hardening-and-regression/plan.md
- kitty-specs/003-pipeline-hardening-and-regression/spec.md
wp_code: WP03
---

# Work Package Prompt: WP03 - Failure Classification, Quota Semantics, and Story 2 User Messaging

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task.**

- **Has review feedback?** Check the current review state before starting.
- **Address all review feedback** before marking the package complete.
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

- Classify pipeline failures explicitly instead of routing everything through a generic error path.
- Preserve request context through configured-key rotation before surfacing quota failure.
- Render failures deterministically with development-detailed diagnostics and compact user-facing messaging.
- Keep the failure envelope stable enough for direct regression assertions.

## Context & Constraints

- Implementation command: `spec-kitty implement WP03 --base WP01`
- Canonical references:
  - `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
  - `services/pipeline.js`
  - `services/ax-intent.js`
  - `services/gemini.js`
  - `bot/commands.js`
  - `services/scheduler.js`
- Keep the Gemini key manager as the existing configured-key rotation authority where possible.
- Do not conflate empty intent extraction with destructive failure behavior.
- Preserve request IDs and entry-point metadata while failures move across stages.
- Do not create a second caller-specific failure renderer if the pipeline can own it.

## Subtasks & Detailed Guidance

### Subtask T009 - Introduce explicit pipeline failure classes
- **Purpose**: Replace broad catch-all behavior with a stable failure taxonomy at the pipeline boundary.
- **Steps**:
  1. Review the existing `task` / `non-task` / `error` result envelope in `services/pipeline.js`.
  2. Make malformed AX output, validation failure, adapter failure, rollback failure, quota failure, and unexpected exceptions classifiable through stable fields.
  3. Keep non-task routing distinct from true failure routing.
  4. Preserve deterministic fields needed by tests: failure class, stage, compact message, diagnostics where appropriate.
- **Files to Touch**:
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Failure classes are explicit and predictable.
  - Non-task messages do not accidentally masquerade as failures.
- **Guardrails**:
  - Favor a small stable taxonomy over speculative one-off classes.

### Subtask T010 - Implement configured-key rotation before terminal quota failure
- **Purpose**: Ensure the active Gemini key is not treated as the only recovery path.
- **Steps**:
  1. Review quota and invalid-key handling across `services/ax-intent.js` and `services/gemini.js`.
  2. Keep the configured-key rotation authority in the existing Gemini path.
  3. Ensure `services/pipeline.js` sees a terminal `quota` outcome only after the configured alternatives are exhausted.
  4. Preserve request context while retries happen.
- **Files to Touch**:
  - `services/ax-intent.js`
  - `services/gemini.js`
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Terminal quota failure happens only after alternate configured keys are exhausted.
  - Request metadata survives the retry path.
- **Guardrails**:
  - Do not duplicate key-rotation logic in the pipeline if it can remain in the current Gemini key manager.

### Subtask T011 - Add mode-aware failure message rendering
- **Purpose**: Honor the clarified requirement that development mode may be detailed while user-facing mode remains compact.
- **Steps**:
  1. Keep failure text rendering close to the pipeline result envelope.
  2. Render compact user-facing text by failure class.
  3. Preserve richer diagnostics in development-oriented modes for validation, adapter, and malformed AX failures.
  4. Keep message shape deterministic enough for regression assertions.
- **Files to Touch**:
  - `services/pipeline.js`
  - `bot/commands.js` only if caller cleanup is needed
- **Tests / Acceptance Cues**:
  - User mode stays compact.
  - Development-oriented modes expose enough structured detail to debug.
- **Guardrails**:
  - Do not leak raw stack traces into user-facing responses.

## Definition of Done

- The pipeline emits explicit failure classes.
- Configured-key rotation happens before terminal quota failure.
- Failure messages are deterministic and mode-aware.
- The failure envelope is stable enough for direct regression coverage.

## Activity Log

- 2026-04-01: WP regenerated after audit; prior prompt replaced because it retained obsolete task-history state and needed to be recast into the current review-oriented format.
