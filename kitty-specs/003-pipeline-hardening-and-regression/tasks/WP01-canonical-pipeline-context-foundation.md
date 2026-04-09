---
work_package_id: WP01
title: Canonical Pipeline Context Foundation
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-007
- FR-008
base_branch: master
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T001
- T002
- T003
- T004
phase: Phase 1 - Context Foundation
authoritative_surface: kitty-specs/003-pipeline-hardening-and-regression/
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQV
owned_files:
- kitty-specs/003-pipeline-hardening-and-regression/plan.md
- kitty-specs/003-pipeline-hardening-and-regression/spec.md
wp_code: WP01
---

# Work Package Prompt: WP01 - Canonical Pipeline Context Foundation

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

- Establish one canonical request-context contract for all pipeline execution paths.
- Remove ad-hoc field drift between the pipeline, AX extraction, and normalization.
- Make request metadata explicit enough to support later failure classification, rollback, and observability work.
- Keep the hardening work on the current architecture instead of introducing a second context path.

## Context & Constraints

- Implementation command: `spec-kitty implement WP01`
- Canonical references:
  - `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
  - `services/pipeline.js`
  - `services/pipeline-context.js`
  - `services/user-settings.js`
  - `services/ax-intent.js`
  - `services/normalizer.js`
- Treat `services/user-settings.js` as the canonical timezone source used by context assembly.
- Preserve the write boundary: `AX -> normalizer -> TickTickAdapter`.
- Do not move context assembly back into Telegram handlers or scheduler code.
- Do not introduce a second settings/config module for request-time timezone resolution.

## Subtasks & Detailed Guidance

### Subtask T001 - Define canonical request-context assembly
- **Purpose**: Make `services/pipeline-context.js` the single source of truth for what enters the pipeline.
- **Steps**:
  1. Confirm the canonical context shape includes `requestId`, `entryPoint`, `mode`, `userMessage`, `currentDate`, `timezone`, `availableProjects`, `availableProjectNames`, and `existingTask`.
  2. Keep derived-field assembly in the context builder instead of spreading it across callers.
  3. Ensure deterministic overrides for tests remain possible through injected `requestId` and date inputs.
  4. Keep the builder narrow: assemble, normalize, and validate context only.
- **Files to Touch**:
  - `services/pipeline-context.js`
  - `services/pipeline.js` if context-builder integration needs adjustment
- **Tests / Acceptance Cues**:
  - Missing required fields fail cleanly in development-oriented modes.
  - The context builder can be reused by bot, scheduler, and harness callers.
- **Guardrails**:
  - Do not let the builder fetch unrelated runtime state or render user messages.

### Subtask T002 - Align AX extraction with canonical context
- **Purpose**: Ensure AX receives the same extraction inputs on every call path.
- **Steps**:
  1. Review which context fields AX actually consumes today.
  2. Make `services/pipeline.js` translate the canonical request context into AX input intentionally rather than forwarding loose options.
  3. Keep the AX-facing project-name list derived from the canonical project objects.
  4. Preserve current key-rotation behavior; this task is about context contract, not quota policy.
- **Files to Touch**:
  - `services/pipeline.js`
  - `services/ax-intent.js`
- **Tests / Acceptance Cues**:
  - AX calls receive stable `currentDate`, `availableProjects`, and `requestId`-relevant context where expected.
  - Telegram and harness callers no longer depend on caller-specific AX option shaping.
- **Guardrails**:
  - Avoid widening the AX contract beyond fields the pipeline already owns.

### Subtask T003 - Align normalization with canonical context
- **Purpose**: Make date expansion and project resolution consume the same context contract as AX extraction.
- **Steps**:
  1. Review how normalization currently consumes timezone, current date, projects, and existing task state.
  2. Replace any ad-hoc option plumbing in `services/pipeline.js` with fields drawn from the canonical request context.
  3. Ensure existing task snapshots and project lookup data remain available without callers shaping them manually.
  4. Keep normalization deterministic and free of request-time fetching.
- **Files to Touch**:
  - `services/pipeline.js`
  - `services/normalizer.js`
- **Tests / Acceptance Cues**:
  - Relative-date and project-resolution behavior consume the canonical context shape instead of parallel option bags.
  - Existing task-aware normalization paths remain intact.
- **Guardrails**:
  - Do not let normalization reach outward for timezone or project lists on its own.

### Subtask T004 - Add fail-fast context validation and development diagnostics
- **Purpose**: Catch contract drift early instead of letting it surface as downstream extraction or normalization bugs.
- **Steps**:
  1. Keep validation logic inside the context-builder surface.
  2. Ensure development-oriented modes surface missing or malformed context fields explicitly.
  3. Keep production/user behavior non-destructive and deterministic.
  4. Make validation failures easy to assert in later regression work.
- **Files to Touch**:
  - `services/pipeline-context.js`
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Invalid context produces a stable error path or diagnostics surface.
  - Future contract drift is easier to detect from tests.
- **Guardrails**:
  - Do not build a second validation layer in every caller.

## Definition of Done

- `services/pipeline-context.js` is the canonical request-context assembly path.
- AX extraction and normalization consume the same context contract.
- Canonical timezone sourcing is explicit and centralized.
- Development-oriented validation catches missing or drifted fields early.

## Activity Log

- 2026-04-01: WP regenerated after audit; prior prompt replaced because it still reflected older Spec Kitty task-history conventions instead of the current v3 review-oriented prompt format.
