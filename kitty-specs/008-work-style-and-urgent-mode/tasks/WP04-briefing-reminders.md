---
work_package_id: "WP04"
subtasks:
  - "T010"
  - "T011"
  - "T012"
title: "Briefing Reminders"
phase: "Phase 2 - Parallel Execution"
lane: "planned"  # DO NOT EDIT - use: spec-kitty agent tasks move-task <WPID> --to <lane>
assignee: ""      # Optional friendly name when in doing/for_review
agent: ""         # CLI agent identifier (claude, codex, etc.)
shell_pid: ""     # PID captured when the task moved to the current lane
review_status: "" # empty | has_feedback | acknowledged (populated by reviewers/implementers)
reviewed_by: ""   # Agent ID of the reviewer (if reviewed)
history:
  - timestamp: "2026-03-11T05:44:14Z"
    lane: "planned"
    agent: "system"
    shell_pid: ""
    action: "Prompt generated via /spec-kitty.tasks"
---

# Work Package Prompt: WP04 – Briefing Reminders

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

- Append a clear, visible reminder to daily and weekly briefings when urgent mode is active.
- Ensure the reminder disappears when urgent mode is turned off.

## Context & Constraints

- Reference prerequisite work and related documents.
- Link to supporting specs: `kitty-specs/008-work-style-and-urgent-mode/plan.md`, `kitty-specs/008-work-style-and-urgent-mode/tasks.md`.
- Requires the contract from WP01 (`store.getUrgentMode`).

## Subtasks & Detailed Guidance

### Subtask T010 – Fetch `urgent_mode` state in `services/scheduler.js`
- **Purpose**: Retrieve the user's urgent mode state from Redis before generating a scheduled briefing.
- **Steps**:
  1. Open `services/scheduler.js`.
  2. Inside the daily and weekly cron jobs, fetch `store.getUrgentMode(userId)`.
- **Files**: `services/scheduler.js`
- **Parallel?**: Yes.

### Subtask T011 – Append briefing reminder
- **Purpose**: Add the text reminder to the scheduled briefing message.
- **Steps**:
  1. If `urgent_mode` is true, append a string like "\n\n⚠️ **Urgent mode is currently active.**" to the final message text sent to the user.
- **Files**: `services/scheduler.js`
- **Parallel?**: Yes.

### Subtask T012 – Append manual briefing reminder
- **Purpose**: Ensure the reminder also appears when the user explicitly requests a briefing via `/briefing`.
- **Steps**:
  1. Open `bot/commands.js`.
  2. In the `/briefing` command handler, fetch `getUrgentMode(userId)`.
  3. If true, append the same reminder string to the reply.
- **Files**: `bot/commands.js`
- **Parallel?**: Yes.

## Test Strategy

- Mock `getUrgentMode` to return `true` and trigger a manual `/briefing`. Verify the reminder is present.
- Mock `getUrgentMode` to return `false` and trigger a manual `/briefing`. Verify the reminder is absent.

## Risks & Mitigations

- Risk: Formatting issues with the appended string. Mitigation: Test rendering in Telegram.

## Review Guidance

- Check that both scheduled and manual briefings include the reminder logic.

## Activity Log

- 2026-03-11T05:44:14Z – system – lane=planned – Prompt created.