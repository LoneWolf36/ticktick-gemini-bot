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

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature reduces task-maintenance friction while protecting trust: the user can clean up or complete work quickly, but the system must never mutate the wrong task just to appear helpful.

**Implementation must**:
- Resolve exactly one target before any update, completion, or deletion.
- Ask narrow clarification questions when target confidence is low or when pronouns and fuzzy references create ambiguity.
- Keep mutation confirmations terse so the task system remains an execution aid rather than another inbox to read.

**Implementation must not**:
- Any bulk or multi-target mutation is introduced without an accepted spec.
- A delete or complete operation proceeds on fuzzy confidence alone.
- The user is forced into command syntax for clear natural-language maintenance.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission gives the user a low-friction way to correct, complete, reschedule, or delete existing work by language. It exists to reduce task-management overhead, not to encourage endless list grooming. It must fail closed when target identity or intent is uncertain, because confident mutation of the wrong task is worse than asking a short clarification.

### Required Implementer Evidence

The implementer must leave enough evidence for review to answer all of the following without guessing:

1. Which Product Vision clause or behavioral scope section does this WP serve?
2. Which FR, NFR, plan step, task entry, or acceptance criterion does the implementation satisfy?
3. What user-visible behavior changes because of this WP?
4. How does the change reduce procrastination, improve task clarity, improve prioritization, improve recovery/trust, or improve behavioral awareness?
5. What does the implementation deliberately avoid so it does not become a passive task manager, generic reminder app, over-planning assistant, busywork optimizer, or judgmental boss?
6. What automated tests, regression checks, manual transcripts, or static inspections prove the intended behavior?
7. Which later mission or WP depends on this behavior, and what drift would it create downstream if implemented incorrectly?

### Required Reviewer Checks

The reviewer must reject the WP unless all of the following are true:

- The behavior is traceable from Product Vision -> mission spec -> plan/tasks -> WP instructions -> implementation evidence.
- The change preserves the accepted architecture and does not bypass canonical paths defined by earlier missions.
- The user-facing result is concise, concrete, and action-oriented unless the spec explicitly requires reflection or clarification.
- Ambiguity, low confidence, and missing context are handled honestly rather than hidden behind confident output.
- The change does not add MVP-forbidden platform scope such as auth, billing, rate limiting, or multi-tenant isolation.
- Tests or equivalent evidence cover the behavioral contract, not just the happy-path technical operation.
- Any completed-WP edits preserve Spec Kitty frontmatter and event-sourced status history; changed behavior is documented rather than silently rewritten.

### Drift Rejection Triggers

Reject, reopen, or move work back to planned if this WP enables any of the following:

- The assistant helps the user organize more without helping them execute what matters.
- The assistant chooses or mutates tasks confidently when it should clarify, fail closed, or mark inference as weak.
- The assistant rewards low-value busywork, cosmetic cleanup, or motion-as-progress.
- The assistant becomes verbose, punitive, generic, or motivational in a way the Product Vision explicitly rejects.
- The implementation stores raw user/task content where only derived behavioral metadata is allowed.
- The change creates a second implementation path that future agents could use instead of the accepted pipeline.
- The reviewer cannot state why this WP is necessary for the final 001-009 product.

### Done-State And Future Rework Note

If this WP is already marked done, this contract does not rewrite Spec Kitty history. It governs future audits, reopened work, bug fixes, and final mission review. If any later change alters the behavior described here, the WP may be moved back to planned or reopened so the implement-review loop can re-establish product-vision fidelity.

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

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Extend free-form Telegram handler for clarification/not-found outcomes. Add minimal mutation candidate keyboard helper. Persist pending clarification state in store. Add regression coverage.

#### What's Actually Done:
Not started. Regenerated after previous version invented /done, /delete, /undo commands and a new session-store subsystem — both out of scope.

#### Gaps Found:
- Not started. Previous scope significantly exceeded the spec by adding new command surfaces. The regenerated version correctly restricts to the existing catch-all path only.
- Depends on WP04 (pipeline integration).

#### Product Vision Alignment Issues:
- Strongly aligned. The clarification keyboard flow is exactly the "collaborative when uncertain" behavior the Product Vision requires — presenting candidates and letting the user choose.
- Persisting pending state supports async interaction without forcing immediate decisions, keeping the system "cognitively light."
- Terse, specific copy matches the Product Vision's "minimal verbosity" requirement.

#### Recommendations:
- Blocking on WP04. The regenerated scope is well-disciplined and focused on the minimal surface needed.
