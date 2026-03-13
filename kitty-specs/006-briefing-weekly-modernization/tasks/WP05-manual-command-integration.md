---
work_package_id: WP05
title: Manual Command Integration
lane: "done"
dependencies:
- WP02
- WP03
- WP04
base_branch: 006-briefing-weekly-modernization-WP05-merge-base
base_commit: 662cc0a43dcb0690276ca1de62f0a31ace368336
created_at: '2026-03-13T17:42:37.016796+00:00'
subtasks:
- T022
- T023
- T024
- T025
- T026
phase: Phase 3 - Surface Adapters
assignee: ''
agent: "codex"
shell_pid: "26620"
review_status: "approved"
reviewed_by: "TickTick Bot"
history:
- timestamp: '2026-03-12T21:27:55Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-006
- FR-007
---

# Work Package Prompt: WP05 - Manual Command Integration

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

- Move manual `/briefing` and `/weekly` handlers onto the shared summary surface created by WP02, WP03, and WP04.
- Preserve current auth, quota, and user-facing error behavior while removing direct dependence on legacy string-only Gemini methods.
- Make manual command behavior inspectable by logging structured summaries and formatter diagnostics before delivery.
- Keep command-layer code thin so summary policy stays centralized in the shared summary surface.

## Context & Constraints

- Implementation command: after WP02, WP03, and WP04 are merged into the shared baseline, run `spec-kitty implement WP05 --base WP04`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `kitty-specs/006-briefing-weekly-modernization/quickstart.md`
  - `.kittify/memory/constitution.md`
- This package is manual-command only. Do not refactor scheduler jobs here.
- Preserve tone closely. The manual handlers should keep recognizable output and not introduce extra coach-like copy.
- Treat `/briefing` and `/weekly` as one package so manual surfaces cannot drift from each other.

## Subtasks & Detailed Guidance

### Subtask T022 - Replace `/briefing` command execution in `bot/commands.js`
- **Purpose**: Move manual daily execution to the shared summary surface while preserving the surrounding Telegram command flow.
- **Steps**:
  1. Find the `/briefing` handler in `bot/commands.js`.
  2. Keep the current access, TickTick auth, and progress-message behavior unless a small cleanup is needed to support the shared surface.
  3. Replace direct `gemini.generateDailyBriefing(...)` usage with the shared summary-surface entry point from `services/summary-surfaces/index.js`.
  4. Pass the context needed for daily composition, including `entryPoint`, `userId`, urgent mode, and fetched tasks.
  5. Reply with the shared formatted output instead of constructing the old string pipeline locally.
- **Files**:
  - `bot/commands.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - Keep `/briefing` command-level responsibilities limited to gating, data loading, and delivery.
  - Do not duplicate formatter logic inside the handler.

### Subtask T023 - Replace `/weekly` command execution in `bot/commands.js`
- **Purpose**: Move manual weekly execution to the shared summary surface with the clarified reduced-digest behavior.
- **Steps**:
  1. Find the `/weekly` handler in `bot/commands.js`.
  2. Keep current access checks and progress messaging.
  3. Replace direct `gemini.generateWeeklyDigest(...)` usage with the shared weekly summary-surface entry point.
  4. Continue loading processed-task history through the existing store helpers and `filterProcessedThisWeek`.
  5. Pass explicit history availability metadata so sparse-history behavior is inspectable.
  6. Reply with the shared formatted weekly output.
- **Files**:
  - `bot/commands.js`
  - `services/summary-surfaces/index.js`
  - `bot/utils.js`
- **Parallel?**: No.
- **Notes**:
  - Keep weekly handler logic thin; it should not re-shape `watchouts` or fallback notices itself.
  - Preserve weekly headers and urgent reminder behavior through the shared formatter path chosen in WP04.

### Subtask T024 - Preserve auth, quota, and user-facing error handling while removing legacy string-only path dependence
- **Purpose**: Make the migration safe for users and reviewers by preserving the current manual command guardrails.
- **Steps**:
  1. Preserve `guardAccess` and TickTick authentication behavior for both manual commands.
  2. Preserve existing quota messaging and fail-fast behavior where it applies today.
  3. Preserve reply delivery semantics through `replyWithMarkdown`.
  4. Keep thrown errors localized to the handler and avoid leaking raw structured objects to the user on failure.
  5. Remove or isolate any remaining command-local dependence on legacy daily or weekly plain-text methods.
- **Files**:
  - `bot/commands.js`
  - `bot/utils.js`
  - `services/gemini.js` only if a temporary compatibility wrapper must be retired
- **Parallel?**: No.
- **Notes**:
  - Do not change free-form message handling, `/scan`, `/review`, or pipeline behavior here.
  - Scope is limited to manual `/briefing` and `/weekly`.

### Subtask T025 - Log structured summary output plus formatter decisions in manual command paths
- **Purpose**: Make manual summary execution auditable without requiring reviewers to infer behavior from the final string alone.
- **Steps**:
  1. Log summary diagnostics returned from the shared summary surface before delivery.
  2. Log source counts, degraded reasons, and the structured summary object or a safe serialized snapshot.
  3. Use the shared field names from the data model so scheduler logging can match later.
  4. Keep logs concise and avoid leaking secrets or transport-level noise.
- **Files**:
  - `bot/commands.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - Prefer one consistent log shape for both `/briefing` and `/weekly`.
  - Logging is part of the acceptance surface for FR-006, not an optional extra.

### Subtask T026 - Add manual command regression coverage for shared-surface use and tone-sensitive invariants
- **Purpose**: Lock the manual integration so later scheduler work can target parity against a stable command baseline.
- **Steps**:
  1. Update existing `registerCommands` regression coverage to mock the shared summary surface rather than the old plain-text daily and weekly methods.
  2. Assert `/briefing` and `/weekly` handlers call the shared summary surface and send the formatted output.
  3. Assert recognizable headers and urgent reminder behavior remain visible.
  4. Assert auth and quota paths still short-circuit appropriately.
  5. Keep tests local to manual command behavior and avoid duplicating scheduler assertions.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - `bot/commands.js`
- **Parallel?**: No.
- **Notes**:
  - Several existing regressions already touch `/briefing`; update them carefully rather than replacing broad unrelated coverage.
  - Reviewers should be able to inspect manual-path diffs without spelunking the scheduler code.

## Test Strategy

- Required commands:
  - `node tests/run-regression-tests.mjs`
  - `node --test tests/regression.test.js`
- Mandatory coverage:
  - `/briefing` uses shared summary surface
  - `/weekly` uses shared summary surface
  - auth and quota guards remain intact
  - recognizable tone, header, and urgent reminder invariants hold

## Risks & Mitigations

- **Risk**: Manual handlers keep one foot in the old plain-text path.
  - **Mitigation**: Replace both `/briefing` and `/weekly` in the same package and update tests to mock the new seam.
- **Risk**: Command-layer code starts owning summary policy.
  - **Mitigation**: Limit handlers to gating, data loading, logging, and delivery.
- **Risk**: Logging becomes inconsistent across daily and weekly manual paths.
  - **Mitigation**: Use one diagnostics shape tied to the shared summary surface.

## Review Guidance

- Confirm both manual commands import and use the shared summary surface rather than direct legacy Gemini string methods.
- Confirm current auth, quota, and user-facing error behavior remains intact.
- Confirm structured summary output and diagnostics are logged before reply delivery.
- Confirm manual regressions cover both daily and weekly paths without pulling scheduler concerns into this package.

## Activity Log

- 2026-03-12T21:27:55Z - system - lane=planned - Prompt generated.

---

### Updating Lane Status

Use `spec-kitty agent tasks move-task <WPID> --to <lane> --note "message"` or edit the frontmatter plus append a new activity log entry.

**Valid lanes**: `planned`, `doing`, `for_review`, `done`
- 2026-03-13T17:42:38Z – codex – shell_pid=26620 – lane=doing – Assigned agent via workflow command
- 2026-03-13T17:55:57Z – codex – shell_pid=26620 – lane=done – Review passed: manual /briefing and /weekly use shared summary surfaces; auth/quota behavior preserved; diagnostics logging and regression coverage verified; dependent WP07 remains planned
- 2026-03-13T17:56:24Z – codex – shell_pid=26620 – lane=for_review – Ready for review: wire manual briefing/weekly to shared summary surface, add logging + tests
- 2026-03-13T19:36:51Z – codex – shell_pid=26620 – lane=done – Review passed: manual /briefing and /weekly use shared summary surfaces; auth/quota behavior preserved; diagnostics logging and regression coverage verified
