---
work_package_id: WP02
title: Entry-Point Context Wiring
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
- FR-005
- FR-006
base_branch: 003-pipeline-hardening-and-regression-WP02-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T005
- T006
- T007
phase: Phase 2 - Story 1 Context Wiring
authoritative_surface: kitty-specs/003-pipeline-hardening-and-regression/
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQV
owned_files:
- kitty-specs/003-pipeline-hardening-and-regression/plan.md
- kitty-specs/003-pipeline-hardening-and-regression/spec.md
wp_code: WP02
---

# Work Package Prompt: WP02 - Entry-Point Context Wiring

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

- Push the canonical request-context contract through every live pipeline entry point.
- Remove per-caller request-time timezone and project-shaping logic from Telegram and scheduler callers.
- Keep caller code thin and compatible with the current repository architecture.
- Preserve current user-facing behavior unless the accepted spec requires change.

## Context & Constraints

- Implementation command: `spec-kitty implement WP02 --base WP01`
- Canonical references:
  - `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
  - `bot/commands.js`
  - `services/scheduler.js`
  - `server.js`
  - `services/pipeline.js`
  - `services/pipeline-context.js`
  - `services/user-settings.js`
- This package is wiring only. It should not redesign failure classes or rollback behavior.
- Use the shared context builder from WP01 instead of duplicating defaulting in callers.
- Preserve existing batching and scheduler behavior while removing context drift.

## Subtasks & Detailed Guidance

### Subtask T005 - Update Telegram command entry points
- **Purpose**: Remove context drift from free-form, `/scan`, and `/review` pipeline execution in `bot/commands.js`.
- **Steps**:
  1. Inspect each `pipeline.processMessage(...)` call in `bot/commands.js`.
  2. Replace per-caller request-time timezone or project shaping with canonical context usage from WP01.
  3. Keep entry-point labels explicit enough for later observability.
  4. Preserve existing-task snapshots where scan/review flows depend on them.
- **Files to Touch**:
  - `bot/commands.js`
  - `services/pipeline.js` only if call signatures need cleanup
- **Tests / Acceptance Cues**:
  - Telegram entry points supply stable `entryPoint`, `mode`, and request metadata.
  - Callers no longer own request-time timezone fallbacks.
- **Guardrails**:
  - Do not duplicate context assembly inside each command handler.

### Subtask T006 - Update scheduler and bootstrap wiring
- **Purpose**: Ensure scheduled processing uses the same canonical context contract as Telegram-driven execution.
- **Steps**:
  1. Inspect pipeline calls in `services/scheduler.js`.
  2. Remove scheduler-local authority over request-time timezone and rely on canonical context assembly.
  3. Update any wiring in `server.js` only as needed to keep pipeline creation compatible.
  4. Preserve current polling, briefing, and digest scheduling behavior.
- **Files to Touch**:
  - `services/scheduler.js`
  - `server.js`
  - `services/pipeline.js` if small wiring cleanup is needed
- **Tests / Acceptance Cues**:
  - Scheduler-driven pipeline calls use explicit request metadata and canonical timezone sourcing.
  - Existing scheduler job behavior remains intact.
- **Guardrails**:
  - Do not let scheduler code become a second context-builder implementation.

### Subtask T007 - Unify per-request project lookup and AX-facing project names
- **Purpose**: Make project context consistent between extraction and normalization.
- **Steps**:
  1. Review how project lists are fetched and passed through the pipeline today.
  2. Ensure available project names are derived once per request from the canonical project objects.
  3. Ensure the same project objects continue forward into normalization.
  4. Keep caching or list-fetch behavior inside existing adapter/TickTick layers rather than callers.
- **Files to Touch**:
  - `services/pipeline.js`
  - `services/ax-intent.js`
  - `services/normalizer.js`
  - `services/ticktick-adapter.js` only if a small helper is needed
- **Tests / Acceptance Cues**:
  - AX and normalization consume one coherent project list per request.
  - No caller-specific project-name shaping remains.
- **Guardrails**:
  - This task is about consistency, not broad caching redesign.

## Definition of Done

- Telegram and scheduler entry points use the canonical context contract.
- Request-time timezone resolution is no longer caller-specific.
- Project lookup and AX-facing project names are consistent per request.
- Caller code is thinner and less likely to drift from the pipeline contract.

## Activity Log

- 2026-04-01: WP regenerated after audit; prior prompt replaced because it retained mixed-era task history instead of the current review-oriented prompt structure.
