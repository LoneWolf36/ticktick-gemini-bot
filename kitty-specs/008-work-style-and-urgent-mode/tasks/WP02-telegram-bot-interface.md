---
work_package_id: WP02
title: Telegram Bot Interface
dependencies:
- WP01
base_branch: 008-work-style-and-urgent-mode-WP01
base_commit: 048768441e961fd93cb481a838bec21993dfc2d2
created_at: '2026-03-11T13:31:21.965873+00:00'
subtasks:
- T004
- T005
- T006
phase: Phase 2 - Parallel Execution
authoritative_surface: kitty-specs/008-work-style-and-urgent-mode/
execution_mode: code_change
mission_id: 01KNT55PMZK4VQERH6AB2FE18B
owned_files:
- kitty-specs/008-work-style-and-urgent-mode/plan.md
- kitty-specs/008-work-style-and-urgent-mode/tasks.md
- kitty-specs/008-work-style-and-urgent-mode/tasks/WP02-telegram-bot-interface.md
- kitty-specs/008-work-style-and-urgent-mode/tasks/WP05-integration-testing.md
wp_code: WP02
---

# Work Package Prompt: WP02 - Telegram Bot Interface

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check Spec Kitty status and event history before starting. If feedback exists, scroll to the **Review Feedback** section immediately (right below this notice).
- **You must address all feedback** before your work is complete. Feedback items are your implementation TODO list.
- **Mark as acknowledged**: When you understand the feedback and begin addressing it, append an Activity Log entry explaining that the feedback is acknowledged.
- **Report progress**: As you address each feedback item, update the Activity Log explaining what you changed.

---

## Review Feedback

**Reviewed by**: TickTick Bot
**Status**: Changes Requested
**Date**: 2026-03-11
**Feedback file**: `C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP02.md`

**Issue 1**: Natural-language urgent-mode toggles are still blocked by TickTick authentication and processed too late in the message handler. In [bot/commands.js](C:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/.worktrees/008-work-style-and-urgent-mode-WP02/bot/commands.js) the auth gate at lines 583-585 runs before urgent-mode detection at lines 617-620, so a message like `turn on urgent mode` returns `TickTick not connected yet` instead of updating the stored mode. Repro: register the `message:text` handler with `ticktick.isAuthenticated() === false` and send `turn on urgent mode`; the only reply is the TickTick auth error. Move urgent-mode detection ahead of the TickTick auth check and ahead of the `Processing...` reply so free-form toggles route to the same store-backed behavior as `/urgent`. Add regression coverage for the unauthenticated free-form path.

**Issue 2**: WP02's declared dependencies do not match the actual code coupling. [WP02-telegram-bot-interface.md](C:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/kitty-specs/008-work-style-and-urgent-mode/tasks/WP02-telegram-bot-interface.md) declares `dependencies: []` at line 5, but the same file says it requires WP01's `store.setUrgentMode` / `store.getUrgentMode` contract at line 64 and is based on `008-work-style-and-urgent-mode-WP01` at line 6. This mismatch breaks review/merge sequencing and makes the dashboard workflow inaccurate. Update the WP metadata so the dependency graph reflects the real prerequisite.

**Dependent check**: [WP05-integration-testing.md](C:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/kitty-specs/008-work-style-and-urgent-mode/tasks/WP05-integration-testing.md) is currently `planned` and explicitly requires WP02/WP03/WP04 in its prompt text (line 59). If WP05 work starts from a branch that already included the current WP02 implementation, rebase it after the fix with `cd C:\Users\Huzefa Khan\Downloads\Gmail\ticktick-gemini\.worktrees\008-work-style-and-urgent-mode-WP05 && git rebase 008-work-style-and-urgent-mode-WP02`.

## Markdown Formatting

Wrap HTML/XML tags in backticks: `` `<div>` ``, `` `<script>` ``
Use language identifiers in code blocks: ````python`, ````bash`

---

## Objectives & Success Criteria

- Allow users to toggle urgent mode via Telegram commands (`/urgent on` or `/urgent off`).
- Ensure the state is persisted in Redis.
- Optionally add natural language intent parsing.

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature controls intervention level. Normal mode must stay humane and cognitively light; urgent mode is a temporary escalation for immediate clarity, not a permanent personality change.

**Implementation must**:
- Default to normal humane guidance and urgent mode off unless explicitly set or strongly justified by accepted logic.
- Urgent mode may change tone and ordering, but must not mutate TickTick data or become noisy.
- Return to lighter guidance when the urgent condition is resolved or when confidence is low.

**Implementation must not**:
- The assistant becomes a judgmental boss or escalates repeatedly after being ignored.
- Urgent mode is inferred weakly and then treated as fact.
- State management makes future simplification harder without product value.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission defines the product's tone under pressure. The default system should be humane, collaborative, and calm. Urgent mode is a temporary escalation for overwhelm, limited time, or high-confidence stuck patterns. It must be direct without becoming a judgmental boss, and it must back off or soften when inference is weak or guidance is ignored.

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

- Reference prerequisite work and related documents.
- Link to supporting specs: `kitty-specs/008-work-style-and-urgent-mode/plan.md`, `kitty-specs/008-work-style-and-urgent-mode/tasks.md`.
- Requires the contract from WP01 (`store.setUrgentMode` and `store.getUrgentMode`).

## Subtasks & Detailed Guidance

### Subtask T004 - Add `/urgent [on|off]` command handler

- **Purpose**: Provide a direct command to toggle the state.
- **Steps**:
  1. Open `bot/commands.js`.
  2. Register a new command `/urgent` using Grammy.
  3. Parse the argument (`on` or `off`). If missing, reply with usage instructions or toggle the current state.
  4. Provide a clear text reply confirming the new state (e.g., "Urgent mode activated. I'll prioritize immediate deadlines.").
- **Files**: `bot/commands.js`
- **Parallel?**: Yes.

### Subtask T005 - Wire command to `store.setUrgentMode(userId, value)`

- **Purpose**: Persist the toggle action to Redis.
- **Steps**:
  1. In the new `/urgent` handler in `bot/commands.js`, call `store.setUrgentMode(userId, true/false)`.
  2. Handle potential Redis errors gracefully, notifying the user if the state couldn't be saved.
- **Files**: `bot/commands.js`
- **Parallel?**: Yes.

### Subtask T006 - Natural language intent (Optional but recommended)

- **Purpose**: Allow users to say "turn on urgent mode".
- **Steps**:
  1. Open `services/ax-intent.js`.
  2. Add an intent category for toggling urgent mode.
  3. Ensure it routes to the same logic as the `/urgent` command.
- **Files**: `services/ax-intent.js`
- **Parallel?**: Yes.

## Test Strategy

- Start the bot locally and send `/urgent on` and `/urgent off`. Verify the replies.

## Risks & Mitigations

- Risk: User sends `/urgent foo`. Mitigation: Default to toggling the current state or reply with clear instructions.

## Review Guidance

- Check that `bot/commands.js` properly requires and uses the updated `store.js` methods.

## Activity Log

- 2026-03-11T05:44:14Z - system - lane=planned - Prompt created.
- 2026-03-11T13:31:25Z - codex-wp02 - shell_pid=26188 - lane=doing - Assigned agent via workflow command
- 2026-03-11T13:51:13Z - codex-wp02 - shell_pid=26188 - lane=for_review - Ready for review: added /urgent command, natural-language toggle detection, and regression coverage
- 2026-03-11T14:06:58Z - codex - shell_pid=27136 - lane=doing - Started review via workflow command
- 2026-03-11T14:09:51Z - codex - shell_pid=27136 - lane=planned - Moved to planned
- 2026-03-11T14:23:11Z - codex - shell_pid=27136 - lane=doing - Addressing review feedback: unauthenticated free-form urgent toggle path and dependency metadata
- 2026-03-11T14:30:00Z - codex - shell_pid=27136 - lane=doing - Acknowledged feedback, moved free-form urgent detection ahead of auth, added unauthenticated regression coverage, and declared WP01 dependency
- 2026-03-11T14:29:13Z – codex – shell_pid=27136 – lane=for_review – Ready for review: fixed unauthenticated free-form urgent toggle path and corrected WP01 dependency metadata
- 2026-03-11T14:30:40Z – codex – shell_pid=12188 – lane=doing – Started review via workflow command
- 2026-03-11T14:32:05Z – codex – shell_pid=12188 – lane=done – Review passed: urgent-mode messages now bypass auth gate, dependency metadata is corrected, and regression coverage verifies the unauthenticated free-form path
