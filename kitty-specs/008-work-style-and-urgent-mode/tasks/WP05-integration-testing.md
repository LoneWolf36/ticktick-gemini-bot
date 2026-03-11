---
work_package_id: WP05
title: Integration & E2E Testing
lane: "doing"
dependencies: []
base_branch: master
base_commit: a7e40ce9ab69c2f3af0395628c36671f211e65d2
created_at: '2026-03-11T14:33:29.547519+00:00'
subtasks:
- T013
- T014
- T015
phase: Phase 3 - Integration
assignee: ''
agent: ''
shell_pid: "10544"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-11T05:44:14Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
---

# Work Package Prompt: WP05 – Integration & E2E Testing

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

- Verify the end-to-end flow of the urgent mode feature.
- Ensure tests validate the acceptance criteria defined in `spec.md`.

## Context & Constraints

- Reference prerequisite work and related documents.
- Link to supporting specs: `kitty-specs/008-work-style-and-urgent-mode/plan.md`, `kitty-specs/008-work-style-and-urgent-mode/tasks.md`.
- Requires WP02, WP03, and WP04 to be complete.

## Subtasks & Detailed Guidance

### Subtask T013 – Write E2E test for User Story 1 (toggle behavior)
- **Purpose**: Verify that turning urgent mode on changes the output and turning it off reverts it.
- **Steps**:
  1. Open `tests/e2e-live-ticktick.mjs` (or a dedicated integration test file).
  2. Write a test case that sends `/urgent on`, verifies the reply, requests a recommendation, and verifies the changed tone.
  3. Send `/urgent off` and verify the output returns to normal.
- **Files**: `tests/e2e-live-ticktick.mjs`
- **Parallel?**: No.

### Subtask T014 – Write E2E test for User Story 2 (humane default)
- **Purpose**: Verify that the system defaults to humane mode without explicit configuration.
- **Steps**:
  1. Ensure the user's urgent mode state is cleared from Redis.
  2. Request a recommendation.
  3. Verify the output matches the standard humane tone.
- **Files**: `tests/e2e-live-checklist.mjs`
- **Parallel?**: No.

### Subtask T015 – Write E2E test for User Story 3 (briefing reminders)
- **Purpose**: Verify that active urgent mode triggers reminders in briefings.
- **Steps**:
  1. Set urgent mode to `true` in Redis.
  2. Trigger the briefing generation function (or send `/briefing`).
  3. Assert that the output contains the specific reminder string.
- **Files**: `tests/e2e-live-checklist.mjs` (or an appropriate test file)
- **Parallel?**: No.

## Test Strategy

- Run the full test suite (`npm test`).

## Risks & Mitigations

- Risk: E2E tests might be flaky if reliant on external AI. Mitigation: Use predictable prompts or mock the AI response where necessary, focusing on whether the correct prompt augmentations were sent.

## Review Guidance

- Ensure tests leave the system in a clean state (e.g., reset urgent mode to false after testing).

## Activity Log

- 2026-03-11T05:44:14Z – system – lane=planned – Prompt created.
