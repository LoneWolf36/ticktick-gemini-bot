---
work_package_id: WP02
title: Daily Structured Summary Core
dependencies:
- WP01
base_branch: 006-briefing-weekly-modernization-WP01
base_commit: 81b1897ea138b8870e8750afd02aeab81961dc52
created_at: '2026-03-13T17:27:18.484669+00:00'
subtasks:
- T006
- T007
- T008
- T009
- T010
phase: Phase 2 - Parallel Core
requirement_refs:
- FR-001
- FR-004
- FR-005
- FR-007
- FR-008
---

# Work Package Prompt: WP02 - Daily Structured Summary Core

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task.**

- **Has review feedback?** Check the `review_status` field above. If it says `has_feedback`, read the Review Feedback section immediately.
- **You must address all feedback** before the work is complete.
- **Mark as acknowledged** when you begin addressing review feedback.
- **Report progress** by appending Activity Log entries in chronological order.

---

## Review Feedback

**Reviewed by**: TickTick Bot
**Status**: ❌ Changes Requested
**Date**: 2026-03-13
**Feedback file**: `C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP02.md`

**Issue 1**: `services/gemini.js:458` changes `generateDailyBriefing()` from returning the rendered daily string to returning a structured object, but the live consumers still treat the result as a string in `bot/commands.js:479` and `services/scheduler.js:193`. That means manual `/briefing` and scheduled daily briefings will concatenate an object into the outgoing message (`[object Object]`) instead of usable text. This is a blocking behavioral regression on the primary surface.

How to fix:
- Either keep `generateDailyBriefing()` returning the legacy string until WP04 wires the formatter, while exposing the structured object through a separate method, or
- Update the call path in a compatible way so the existing `/briefing` and scheduler delivery code receive formatted text instead of the raw object.
- Add a regression that exercises the real daily call boundary instead of only composer-level tests, so this contract mismatch is caught.

Dependent rebase warning:
- WP05 and WP06 depend on WP02. After the fix lands, those agents should rebase with:
  - `cd .worktrees/006-briefing-weekly-modernization-WP05 && git rebase 006-briefing-weekly-modernization-WP02`
  - `cd .worktrees/006-briefing-weekly-modernization-WP06 && git rebase 006-briefing-weekly-modernization-WP02`


## Markdown Formatting

Wrap HTML/XML tags in backticks: `` `<div>` ``, `` `<script>` ``  
Use language identifiers in fenced code blocks.

---

## Objectives & Success Criteria

- Move daily briefing generation off the legacy free-form final-string path and onto a structured summary object.
- Guarantee the daily summary exposes `focus`, `priorities`, `why_now`, `start_now`, and `notices` before formatting.
- Keep daily content aligned with shared ranking policy from `services/execution-prioritization.js`.
- Add honest sparse-data behavior without introducing filler or local ranking heuristics.

## Context & Constraints

- Implementation command: `spec-kitty implement WP02 --base WP01`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `.kittify/memory/constitution.md`
- Start from the contracts and export seams established by WP01. Do not redefine them.
- Preserve tone closely, but do not rely on model-generated final formatting. This package owns structured content, not the final Telegram renderer.
- Daily summary logic must inherit shared prioritization policy and must not re-rank tasks locally.

## Subtasks & Detailed Guidance

### Subtask T006 - Implement structured daily-generation parsing in `services/gemini.js`
- **Purpose**: Replace the current plain-text daily briefing return path with schema-constrained structured output that the summary surface can normalize.
- **Steps**:
  1. Locate the current `generateDailyBriefing` path in `services/gemini.js`.
  2. Replace or augment the daily response handling so it requests a structured object compatible with WP01's daily schema.
  3. Keep the existing ranking preview and active-task context inputs unless a smaller equivalent input clearly preserves the same policy grounding.
  4. Stop treating the model's direct final text as the feature output; the result here should be a structured daily object or an object that can be normalized into one.
  5. Preserve quota, failover, and existing model-call infrastructure.
- **Files**:
  - `services/gemini.js`
  - `services/schemas.js`
- **Parallel?**: No. This is the root of the daily structured path.
- **Notes**:
  - Do not move formatting into `services/gemini.js`.
  - Keep the prompt grounded in ranking output so daily summaries inherit `007` policy rather than inventing local priorities.

### Subtask T007 - Build the daily summary composer in `services/summary-surfaces/briefing-summary.js`
- **Purpose**: Normalize the structured daily model response into the fixed contract expected by formatters and tests.
- **Steps**:
  1. Accept the structured daily model output plus context from the shared summary surface.
  2. Guarantee the five top-level sections always exist.
  3. Normalize missing or malformed nested values into safe defaults that still satisfy the contract.
  4. Keep nested shapes light; the contract guarantee is about stable top-level sections, not exhaustive field freezing.
- **Files**:
  - `services/summary-surfaces/briefing-summary.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - Preserve the exact section names from the clarified spec.
  - The composer should stay free of Telegram formatting concerns.

### Subtask T008 - Wire shared ranking output into daily `focus`, `priorities`, and `why_now`
- **Purpose**: Ensure the daily summary uses the existing prioritization foundation instead of silently reintroducing local heuristics.
- **Steps**:
  1. Pull the ranking result or top recommendation data through the shared daily composition path.
  2. Use ranking rationale to support `focus` and `why_now`.
  3. Use top-ranked candidates to populate `priorities`.
  4. Avoid any second ranking pass inside the daily composer.
  5. If ranking is degraded or sparse, surface that through notices rather than fake certainty.
- **Files**:
  - `services/gemini.js`
  - `services/summary-surfaces/briefing-summary.js`
  - `services/execution-prioritization.js` only if a tiny export/helper adjustment is truly required
- **Parallel?**: No.
- **Notes**:
  - Any change to `services/execution-prioritization.js` must preserve existing consumers.
  - This is a consumer-integration task, not a policy rewrite task.

### Subtask T009 - Implement sparse-task and degraded-ranking notices with actionable `start_now`
- **Purpose**: Make daily fallback behavior honest, compact, and still useful when task data is thin.
- **Steps**:
  1. Define the conditions that count as sparse or degraded for the daily surface.
  2. Emit `notices` when data is thin or ranking confidence is degraded.
  3. Ensure `priorities` and `why_now` shrink cleanly instead of filling with fluff.
  4. Keep `start_now` actionable even in fallback mode; it should still point to a concrete next move or a minimal reset step.
- **Files**:
  - `services/summary-surfaces/briefing-summary.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - The clarified spec explicitly rejects hallucinated urgency or filler.
  - Urgent-mode reminders may be represented through `notices`, but final rendering belongs to WP04.

### Subtask T010 - Add daily structured-output regressions
- **Purpose**: Lock the daily summary behavior at the structured-object boundary before formatter and adapter work lands.
- **Steps**:
  1. Add regression coverage that inspects the structured daily summary before formatting.
  2. Cover a normal ranked-task case.
  3. Cover a sparse-task case.
  4. Cover a degraded-ranking case.
  5. Assert the fixed top-level sections are present in all cases and that notices are used instead of filler.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel?**: No.
- **Notes**:
  - Keep tests local to the daily surface so WP03 and WP04 can evolve independently.
  - Do not assert final Telegram formatting in this package.

## Test Strategy

- Required commands:
  - `node tests/run-regression-tests.mjs`
  - `node --test tests/regression.test.js`
- Mandatory coverage:
  - normal daily structured output
  - sparse-task fallback
  - degraded-ranking notice behavior
  - section contract checks before formatting

## Risks & Mitigations

- **Risk**: Daily summary logic becomes another ranking engine.
  - **Mitigation**: Consume shared ranking output directly and keep the composer focused on section shaping only.
- **Risk**: Sparse-task fallback produces filler.
  - **Mitigation**: Encode explicit notice behavior and cover it in regressions.
- **Risk**: `services/gemini.js` changes destabilize other flows.
  - **Mitigation**: Limit changes to the daily generation path and preserve existing quota/failover behavior.

## Review Guidance

- Confirm the daily path no longer depends on a raw final-string response for core logic.
- Confirm structured daily output is inspectable before formatting.
- Confirm daily section names match the clarified contract exactly.
- Confirm no local ranking heuristics were introduced and sparse-task fallbacks stay honest.

## Activity Log

- 2026-03-12T21:19:42Z - system - lane=planned - Prompt generated.

---

### Updating Lane Status

Use `spec-kitty agent tasks move-task <WPID> --to <lane> --note "message"` or edit the frontmatter plus append a new activity log entry.

**Valid lanes**: `planned`, `doing`, `for_review`, `done`
- 2026-03-13T17:27:21Z – Codex – shell_pid=31664 – lane=doing – Assigned agent via workflow command
- 2026-03-13T17:33:08Z – Codex – shell_pid=31664 – lane=for_review – Ready for review: structured daily Gemini output, composer merging, and daily regression coverage
- 2026-03-13T17:34:07Z – Codex – shell_pid=25588 – lane=doing – Started review via workflow command
- 2026-03-13T17:35:31Z – Codex – shell_pid=25588 – lane=planned – Moved to planned
- 2026-03-13T17:36:31Z – Codex – shell_pid=10136 – lane=doing – Started implementation via workflow command
- 2026-03-13T17:40:24Z – Codex – shell_pid=10136 – lane=for_review – Ready for review: restored daily briefing string compatibility and added live caller regression coverage
- 2026-03-13T17:41:12Z – Codex – shell_pid=31792 – lane=doing – Started review via workflow command
- 2026-03-13T17:41:50Z – Codex – shell_pid=31792 – lane=done – Review passed: daily structured summary core verified; live caller string compatibility restored; dependency check clear; dependents WP05/WP06 still planned
