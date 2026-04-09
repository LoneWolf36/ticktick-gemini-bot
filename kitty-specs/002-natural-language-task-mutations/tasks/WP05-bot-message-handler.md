---
work_package_id: WP05
title: Bot Message Handler
dependencies:
- WP04
requirement_refs:
- FR-003
- FR-006
- FR-007
- FR-008
base_branch: 002-natural-language-task-mutations-WP05-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T051
- T052
- T053
- T054
phase: Phase 4 - Telegram Delivery
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQT
owned_files:
- kitty-specs/002-natural-language-task-mutations/plan.md
- kitty-specs/002-natural-language-task-mutations/spec.md
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP05
---

# Work Package Prompt: WP05 - Bot Message Handler

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

- Extend the existing free-form Telegram entrypoint so it can surface mutation clarification and not-found outcomes cleanly.
- Keep the command surface unchanged; this package is about the existing catch-all path only.
- Persist pending clarification state in the existing store so callbacks can resume safely later.
- Keep user-facing copy terse and specific, not explanatory.

## Context & Constraints

- Implementation command: `spec-kitty implement WP05 --base WP04`
- Canonical references:
  - `kitty-specs/002-natural-language-task-mutations/spec.md`
  - `kitty-specs/002-natural-language-task-mutations/plan.md`
  - `bot/commands.js`
  - `services/store.js`
  - `bot/utils.js`
  - `tests/regression.test.js`
- Do not add `/done`, `/delete`, or `/undo`.
- Do not create a new session-store subsystem.
- Keep clarification state in `services/store.js` with the same persistence model the repo already uses.
- Free-form handling should continue to respect urgent-mode toggles and current auth checks.

## Subtasks & Detailed Guidance

### Subtask T051 - Extend the free-form handler to render mutation `clarification` and `not-found` results
- **Purpose**: Let the current catch-all message path present mutation outcomes beyond the existing `task`/`non-task`/`error` cases.
- **Steps**:
  1. Update the free-form `bot.on('message:text', ...)` path in `bot/commands.js`.
  2. Add explicit handling for pipeline `clarification` results.
  3. Add explicit handling for pipeline `not-found` results.
  4. Preserve existing handling for `task`, `non-task`, and `error`.
  5. Keep confirmation text terse and Telegram-safe.
- **Files to Touch**:
  - `bot/commands.js`
- **Tests / Acceptance Cues**:
  - Ambiguous mutation requests should now produce a clarification response rather than a generic error.
  - Not-found mutation requests should not fall back to conversational handling.
- **Guardrails**:
  - Do not move resolver logic into the bot layer.

### Subtask T052 - Add a minimal mutation candidate keyboard helper
- **Purpose**: Prepare a safe inline-button surface for ambiguous results without building a second callback framework.
- **Steps**:
  1. Add or extend a helper in `bot/utils.js` or another existing bot utility surface.
  2. Render a short list of candidate tasks using compact button labels.
  3. Use callback payloads that fit the existing Telegram limits and callback conventions.
  4. Include a cancel option.
- **Files to Touch**:
  - `bot/utils.js` and/or `bot/commands.js`
- **Tests / Acceptance Cues**:
  - Candidate buttons should be stable and concise.
  - Long titles should be truncated predictably.
- **Guardrails**:
  - Do not create a large new UI abstraction just for these buttons.

### Subtask T053 - Extend `services/store.js` with pending mutation clarification state
- **Purpose**: Persist the minimum state needed to resume a mutation after the user clicks a candidate or cancel.
- **Steps**:
  1. Add a narrow pending-mutation structure to the shared store.
  2. Key the state by the minimum identity needed to avoid cross-chat leakage.
  3. Persist enough context to resume safely: request identity, candidate list, original intent summary, and expiration metadata if needed.
  4. Add helper functions rather than mutating store internals ad hoc in the bot layer.
- **Files to Touch**:
  - `services/store.js`
- **Tests / Acceptance Cues**:
  - The bot should be able to save and retrieve one pending clarification safely.
  - State should be clearable after success, cancel, or expiry.
- **Guardrails**:
  - Keep this state narrowly scoped; do not turn the store into a generic workflow engine.

### Subtask T054 - Add regression coverage for the free-form handler mutation outcomes
- **Purpose**: Lock the Telegram entrypoint behavior before callback resume work begins.
- **Steps**:
  1. Add regression coverage for ambiguous mutation requests.
  2. Add regression coverage for not-found requests.
  3. Add regression coverage for the stored clarification handoff.
  4. Preserve current create-path and non-task behavior in the same handler.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Tests / Acceptance Cues**:
  - The handler should still process normal create requests and urgent-mode toggles correctly.
  - Clarification should not be mistaken for an error path.
- **Guardrails**:
  - Keep the tests close to current bot-entry regressions instead of inventing a large new bot test harness.

## Definition of Done

- The free-form Telegram handler supports `clarification` and `not-found`.
- Candidate keyboard rendering exists and is terse.
- Pending clarification state is persisted through `services/store.js`.
- Regressions lock the handler behavior without changing the command surface.

## Activity Log

- 2026-04-01: WP regenerated after review-first audit; prior prompt replaced because it invented extra command surfaces and a new session subsystem.
