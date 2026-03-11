---
work_package_id: "WP01"
subtasks:
  - "T001"
  - "T002"
  - "T003"
title: "State Management Contract"
phase: "Phase 1 - Foundation"
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

# Work Package Prompt: WP01 – State Management Contract

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

- Establish Redis persistence for urgent mode state.
- Define a getter/setter contract in `services/store.js`.
- Ensure the default state (Humane Mode ON, Urgent Mode OFF) is handled correctly when state is missing.

## Context & Constraints

- Reference prerequisite work and related documents.
- Link to supporting specs: `kitty-specs/008-work-style-and-urgent-mode/plan.md`, `kitty-specs/008-work-style-and-urgent-mode/tasks.md`.
- Constraints: The default behavior must assume urgent mode is off if the user has never set it or the cache is cleared.

## Subtasks & Detailed Guidance

### Subtask T001 – Implement `getUrgentMode(userId)`
- **Purpose**: Retrieve the user's urgent mode state from Redis.
- **Steps**:
  1. Open `services/store.js`.
  2. Add an async function `getUrgentMode(userId)`.
  3. Fetch the key (e.g., `user:{userId}:urgent_mode`) from Redis.
  4. If the key exists, parse and return its boolean value.
  5. If the key does not exist, return `false` (default: Humane Mode ON, Urgent OFF).
- **Files**: `services/store.js`
- **Parallel?**: No.
- **Notes**: Ensure proper error handling.

### Subtask T002 – Implement `setUrgentMode(userId, boolean)`
- **Purpose**: Persist the user's urgent mode state to Redis.
- **Steps**:
  1. Open `services/store.js`.
  2. Add an async function `setUrgentMode(userId, value)`.
  3. Set the key `user:{userId}:urgent_mode` in Redis with the boolean value.
- **Files**: `services/store.js`
- **Parallel?**: No.

### Subtask T003 – Document Redis schema
- **Purpose**: Document the new state key in the `store.js` schema comments.
- **Steps**:
  1. Open `services/store.js`.
  2. Update the header/documentation comments to include the new `user:{userId}:urgent_mode` key and its expected values.
- **Files**: `services/store.js`
- **Parallel?**: No.

## Test Strategy

- Ensure existing `store.js` tests pass.
- Manually test `getUrgentMode` and `setUrgentMode` to confirm persistence and fallback.

## Risks & Mitigations

- Risk: Redis failure. Mitigation: Existing store patterns handle Redis connection issues gracefully.

## Review Guidance

- Verify that `getUrgentMode` correctly defaults to `false`.
- Ensure the Redis key structure is consistent with other user-related keys.

## Activity Log

- 2026-03-11T05:44:14Z – system – lane=planned – Prompt created.