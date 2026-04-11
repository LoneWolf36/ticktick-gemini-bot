---
work_package_id: WP06
title: Clarification UI Flow
dependencies:
- WP05
requirement_refs:
- FR-003
- FR-006
- FR-008
- FR-009
base_branch: 002-natural-language-task-mutations-WP06-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T061
- T062
- T063
- T064
phase: Phase 5 - Clarification Resume
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQT
owned_files:
- kitty-specs/002-natural-language-task-mutations/plan.md
- kitty-specs/002-natural-language-task-mutations/spec.md
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP06
---

# Work Package Prompt: WP06 - Clarification UI Flow

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

- Extend the existing callback surface so a user can choose among ambiguous mutation candidates without creating a second execution path.
- Resume the chosen mutation through the same pipeline and normalizer path that handles free-form messages.
- Clear pending clarification state deterministically on success, cancel, stale selection, or expiry.
- Keep callback payloads, user-facing copy, and control flow compact enough for Telegram constraints and the current bot architecture.

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

- Implementation command: `spec-kitty implement WP06 --base WP05`
- Canonical references:
  - `kitty-specs/002-natural-language-task-mutations/spec.md`
  - `kitty-specs/002-natural-language-task-mutations/plan.md`
  - `bot/callbacks.js`
  - `bot/utils.js`
  - `bot/commands.js`
  - `services/store.js`
  - `services/pipeline.js`
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- Reuse the callback registration style already established in `bot/callbacks.js`.
- Do not call adapter write methods directly from the mutation callback path.
- Do not create a second callback router, background workflow system, or callback-specific mutation engine.
- Any selected candidate must re-enter the pipeline or a small shared helper that preserves the same validation and normalization guarantees as the free-form path.
- Pending clarification state must stay tightly scoped by user/chat/request so a stale tap cannot mutate the wrong task.

## Subtasks & Detailed Guidance

### Subtask T061 - Add `mutate:` callback handling in `bot/callbacks.js`
- **Purpose**: Accept candidate-selection and cancel callbacks for ambiguous mutation requests using the existing grammY callback registration style.
- **Steps**:
  1. Review current callback patterns in `bot/callbacks.js` (`a:`, `s:`, `d:`) and reuse their auth and duplicate-handling style where it fits.
  2. Add one narrow callback family for pending mutation clarification, using compact Telegram-safe payloads.
  3. Parse the callback payload into either a candidate selection or a cancel action.
  4. Load pending clarification state from `services/store.js`.
  5. Fail safely when state is missing, mismatched, or already consumed.
  6. Keep `answerCallbackQuery()` behavior prompt and terse.
- **Files to Touch**:
  - `bot/callbacks.js`
  - `services/store.js` if callback lookup helpers are needed
- **Tests / Acceptance Cues**:
  - Valid selection callbacks reach the resume path.
  - Cancel callbacks do not execute any mutation.
  - Duplicate taps do not cause duplicate mutation attempts.
- **Guardrails**:
  - Do not introduce long callback payloads that exceed Telegram limits.
  - Do not encode full task objects into callback data.

### Subtask T062 - Resume the chosen mutation through the pipeline with resolved task context
- **Purpose**: Ensure a user selection still goes through the accepted `AX intent -> normalizer -> TickTickAdapter` safety path rather than bypassing it in the callback layer.
- **Steps**:
  1. Identify the smallest shared helper or pipeline entry pattern that can resume a pending mutation after the user chooses a candidate.
  2. Reconstruct the original mutation request using the stored pending clarification state plus the chosen candidate.
  3. Inject the resolved task context in the approved way for this codebase instead of calling adapter writes directly from `bot/callbacks.js`.
  4. Preserve the same terse confirmation style already used for successful free-form task results.
  5. Ensure delete remains fail-closed if the stored state is incomplete or inconsistent.
  6. Clear pending state only after the resume flow reaches a terminal outcome.
- **Files to Touch**:
  - `bot/callbacks.js`
  - `bot/commands.js` if a shared pipeline helper is the cleanest seam
  - `services/pipeline.js` only if a small resume-oriented entry is truly required
- **Tests / Acceptance Cues**:
  - Selecting a candidate should lead to the same final mutation result shape as a direct exact-match request.
  - Update, complete, and delete should each resume safely through the chosen target.
  - No callback path should call `adapter.updateTask()`, `completeTask()`, or `deleteTask()` directly.
- **Guardrails**:
  - Do not build a second mutation execution path in the bot layer.
  - Do not weaken validation just because the target is now chosen.

### Subtask T063 - Implement safe cancel, stale-selection, and expired-state handling
- **Purpose**: Keep clarification UX safe under real Telegram conditions: delayed taps, repeated taps, and lost state.
- **Steps**:
  1. Extend `services/store.js` helpers so pending mutation clarifications can be cleared and marked stale or consumed predictably.
  2. Handle explicit cancel actions with terse acknowledgment and cleanup.
  3. Handle missing or expired pending state with a short “try again” style response that performs no mutation.
  4. Reject selections from the wrong chat/user/request context.
  5. Prevent reused callback presses from replaying a completed mutation.
  6. Keep the failure behavior consistent with the feature’s fail-closed safety rules.
- **Files to Touch**:
  - `services/store.js`
  - `bot/callbacks.js`
- **Tests / Acceptance Cues**:
  - Cancel clears pending state and edits or replies with a terse cancellation message.
  - Stale callbacks do not mutate anything and return a short safe response.
  - Cross-chat or mismatched-user selections are rejected.
- **Guardrails**:
  - Do not leave orphaned pending clarification state after terminal outcomes.
  - Do not rely on in-memory assumptions that break when Redis or file persistence reloads state.

### Subtask T064 - Add callback/resume regression coverage in the existing regression surfaces
- **Purpose**: Lock the clarification-resume behavior into the same regression surfaces that already protect the bot and pipeline.
- **Steps**:
  1. Extend `tests/regression.test.js` with callback-driven clarification resume cases.
  2. Extend `tests/run-regression-tests.mjs` only as needed to include the new behavior in the lightweight suite.
  3. Cover candidate selection success for at least one update and one complete or delete scenario.
  4. Cover cancel handling.
  5. Cover stale or already-consumed callback behavior.
  6. Assert that store cleanup occurs for success, cancel, and stale flows.
- **Files to Touch**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - `services/store.js` test helpers if needed
- **Tests / Acceptance Cues**:
  - Callback resume should not regress the existing approve/skip/drop callback flows.
  - Mutation clarification tests should use the same harness style as the rest of the repo instead of inventing a new callback-only test suite.
- **Guardrails**:
  - Keep the regression surface focused on user-visible behavior and state transitions, not fragile implementation trivia.

## Definition of Done

- `bot/callbacks.js` supports the mutation clarification callback family.
- Candidate selection resumes through the accepted pipeline path instead of direct adapter writes.
- Cancel, stale, expired, and duplicate callback scenarios fail safely and clear state correctly.
- Regression coverage protects the clarification resume flow in the existing test surfaces.

## Activity Log

- 2026-04-01: WP regenerated after review-first audit; prior prompt replaced because it introduced a separate clarification module, oversized testing scope, and direct callback mutation behavior.

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Add callback handling for mutation clarification selection. Resume chosen mutation through the pipeline (not direct adapter writes). Implement safe cancel, stale-selection, and expired-state handling. Add regression coverage.

#### What's Actually Done:
Not started. Regenerated after previous version introduced a separate clarification module (violating single-module principle), oversized testing, and direct adapter writes from callbacks (bypassing safety pipeline).

#### Gaps Found:
- Not started. The previous version had three significant scope errors, all corrected.
- Depends on WP05 (bot message handler).

#### Product Vision Alignment Issues:
- Strongly aligned. The requirement that callbacks re-enter through the pipeline (AX → normalizer → adapter) rather than bypassing it is critical for "correctness matters more than confidence" — no shortcuts around safety gates.
- Cancel/stale/expired handling prevents the system from acting on stale user intent, supporting trust.
- Cross-chat/user rejection prevents data leakage, supporting security.

#### Recommendations:
- Blocking on WP05. The regenerated scope is well-constrained with explicit guardrails against second execution paths.
