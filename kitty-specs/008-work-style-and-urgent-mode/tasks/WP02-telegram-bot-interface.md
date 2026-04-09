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

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately (right below this notice).
- **You must address all feedback** before your work is complete. Feedback items are your implementation TODO list.
- **Mark as acknowledged**: When you understand the feedback and begin addressing it, update `review_status: acknowledged` in the frontmatter.
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
