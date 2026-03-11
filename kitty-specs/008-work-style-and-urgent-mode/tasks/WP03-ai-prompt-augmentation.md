---
work_package_id: WP03
title: AI Prompt Augmentation
lane: "planned"
dependencies:
- WP01
base_branch: 008-work-style-and-urgent-mode-WP01
base_commit: 048768441e961fd93cb481a838bec21993dfc2d2
created_at: '2026-03-11T13:31:21.976739+00:00'
subtasks:
- T007
- T008
- T009
phase: Phase 2 - Parallel Execution
assignee: ''
agent: "codex"
shell_pid: "14884"
review_status: "acknowledged"
reviewed_by: "TickTick Bot"
review_feedback_file: "C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP03.md"
history:
- timestamp: '2026-03-11T05:44:14Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
---

# Work Package Prompt: WP03 – AI Prompt Augmentation

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately (right below this notice).
- **You must address all feedback** before your work is complete. Feedback items are your implementation TODO list.
- **Mark as acknowledged**: When you understand the feedback and begin addressing it, update `review_status: acknowledged` in the frontmatter.
- **Report progress**: As you address each feedback item, update the Activity Log explaining what you changed.

---

## Review Feedback

**Reviewed by**: TickTick Bot
**Status**: ❌ Changes Requested
**Date**: 2026-03-11
**Feedback file**: `C:\Users\Huzefa Khan\AppData\Local\Temp\spec-kitty-review-feedback-WP03.md`

**Issue 1**: WP03's dependency metadata does not match the actual code coupling. [WP03-ai-prompt-augmentation.md](C:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/kitty-specs/008-work-style-and-urgent-mode/tasks/WP03-ai-prompt-augmentation.md) declares `dependencies: []` at line 5, but the same file is based on `008-work-style-and-urgent-mode-WP01` at line 6 and explicitly says it requires the WP01 `store.getUrgentMode` contract at line 63. The implementation also depends on that contract in [gemini.js](C:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/.worktrees/008-work-style-and-urgent-mode-WP03/services/gemini.js#L209). This breaks dependency checking and merge sequencing. Update the WP frontmatter so WP01 is declared as a dependency.

**Dependent check**: [WP05-integration-testing.md](C:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/kitty-specs/008-work-style-and-urgent-mode/tasks/WP05-integration-testing.md#L63) depends on WP03 in its prompt text and is currently in review/active review flow. If WP03 changes, rebase that worktree with `cd C:\Users\Huzefa Khan\Downloads\Gmail\ticktick-gemini\.worktrees\008-work-style-and-urgent-mode-WP05 && git rebase 008-work-style-and-urgent-mode-WP03`.


## Markdown Formatting
Wrap HTML/XML tags in backticks: `` `<div>` ``, `` `<script>` ``
Use language identifiers in code blocks: ````python`, ````bash`

---

## Objectives & Success Criteria

- Adjust Gemini AI's tone and task ordering when urgent mode is active.
- Ensure TickTick data is NEVER modified by this mode change.

## Context & Constraints

- Reference prerequisite work and related documents.
- Link to supporting specs: `kitty-specs/008-work-style-and-urgent-mode/plan.md`, `kitty-specs/008-work-style-and-urgent-mode/tasks.md`.
- Requires the contract from WP01 (`store.getUrgentMode`).

## Subtasks & Detailed Guidance

### Subtask T007 – Fetch `urgent_mode` state before calling Gemini
- **Purpose**: Retrieve the user's urgent mode state from Redis before making an AI request.
- **Steps**:
  1. Open `services/gemini.js` (or relevant pipeline runner).
  2. Inject a call to `store.getUrgentMode(userId)`.
  3. Pass this boolean into the prompt generation logic.
- **Files**: `services/gemini.js`
- **Parallel?**: Yes.

### Subtask T008 – Inject urgent mode instructions into the system prompt
- **Purpose**: Instruct Gemini to adopt a sharper tone.
- **Steps**:
  1. Open `services/gemini.js` where the system prompt is assembled.
  2. If `urgent_mode` is true, append instructions: "The user is in URGENT MODE. Use direct, sharp language. Prioritize immediate, high-impact tasks. Do not soften your tone."
- **Files**: `services/gemini.js`
- **Parallel?**: Yes.

### Subtask T009 – Update `services/execution-prioritization.js` to apply urgent-aware ordering
- **Purpose**: Sort tasks differently when in urgent mode.
- **Steps**:
  1. Open `services/execution-prioritization.js`.
  2. Pass `urgent_mode` into the sorting function.
  3. If true, increase the weight of tasks with impending deadlines or high priority flags in the final recommended order.
  4. CRITICAL: Ensure `ticktick-adapter.js` is NOT modified to save these new weights/priorities back to TickTick.
- **Files**: `services/execution-prioritization.js`
- **Parallel?**: Yes.

## Test Strategy

- Mock `getUrgentMode` to return `true` and verify the AI output has a sharper tone and different task ordering.

## Risks & Mitigations

- Risk: Accidental modification of TickTick data. Mitigation: Double-check that changes only affect the string output presented to the user.

## Review Guidance

- Verify that no data-mutating API calls to TickTick are added.

## Activity Log

- 2026-03-11T05:44:14Z – system – lane=planned – Prompt created.
- 2026-03-11T13:31:22Z – codex-wp03 – shell_pid=26664 – lane=doing – Assigned agent via workflow command
- 2026-03-11T13:51:40Z – codex-wp03 – shell_pid=26664 – lane=for_review – Ready for review: urgent-aware Gemini prompts, state resolution, and ranking adjustments
- 2026-03-11T15:03:57Z – codex – shell_pid=14884 – lane=doing – Started review via workflow command
- 2026-03-11T15:07:57Z – codex – shell_pid=14884 – lane=planned – Moved to planned
