---
work_package_id: WP02
title: Telegram Bot Interface
lane: "doing"
dependencies: []
base_branch: 008-work-style-and-urgent-mode-WP01
base_commit: 048768441e961fd93cb481a838bec21993dfc2d2
created_at: '2026-03-11T13:31:21.965873+00:00'
subtasks:
- T004
- T005
- T006
phase: Phase 2 - Parallel Execution
assignee: ''
agent: ''
shell_pid: "26188"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-11T05:44:14Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
---

# Work Package Prompt: WP02 – Telegram Bot Interface

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately (right below this notice).
- **You must address all feedback** before your work is complete. Feedback items are your implementation TODO list.
- **Mark as acknowledged**: When you understand the feedback and begin addressing it, update `review_status: acknowledged` in the frontmatter.
- **Report progress**: As you address each feedback item, update the Activity Log explaining what you changed.

---

## Review Feedback

> **Populated by `/spec-kitty.review`** – Reviewers add detailed feedback here when work needs changes. Implementation must address every item listed below before returning for re-review.

*[This section is empty initially. Reviewers will populate it if the work is returned from review. If you see feedback here, treat each item as a must-do before completion.]*

---

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

### Subtask T004 – Add `/urgent [on|off]` command handler
- **Purpose**: Provide a direct command to toggle the state.
- **Steps**:
  1. Open `bot/commands.js`.
  2. Register a new command `/urgent` using Grammy.
  3. Parse the argument (`on` or `off`). If missing, reply with usage instructions or toggle the current state.
  4. Provide a clear text reply confirming the new state (e.g., "Urgent mode activated. I'll prioritize immediate deadlines.").
- **Files**: `bot/commands.js`
- **Parallel?**: Yes.

### Subtask T005 – Wire command to `store.setUrgentMode(userId, value)`
- **Purpose**: Persist the toggle action to Redis.
- **Steps**:
  1. In the new `/urgent` handler in `bot/commands.js`, call `store.setUrgentMode(userId, true/false)`.
  2. Handle potential Redis errors gracefully, notifying the user if the state couldn't be saved.
- **Files**: `bot/commands.js`
- **Parallel?**: Yes.

### Subtask T006 – Natural language intent (Optional but recommended)
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

- 2026-03-11T05:44:14Z – system – lane=planned – Prompt created.
