---
work_package_id: WP03
title: AI Prompt Augmentation
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
authoritative_surface: kitty-specs/008-work-style-and-urgent-mode/
execution_mode: code_change
mission_id: 01KNT55PMZK4VQERH6AB2FE18B
owned_files:
- kitty-specs/008-work-style-and-urgent-mode/plan.md
- kitty-specs/008-work-style-and-urgent-mode/tasks.md
- kitty-specs/008-work-style-and-urgent-mode/tasks/WP03-ai-prompt-augmentation.md
- kitty-specs/008-work-style-and-urgent-mode/tasks/WP05-integration-testing.md#L63
wp_code: WP03
---

# Work Package Prompt: WP03 – AI Prompt Augmentation

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check Spec Kitty status and event history before starting. If feedback exists, scroll to the **Review Feedback** section immediately (right below this notice).
- **You must address all feedback** before your work is complete. Feedback items are your implementation TODO list.
- **Mark as acknowledged**: When you understand the feedback and begin addressing it, append an Activity Log entry explaining that the feedback is acknowledged.
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
- 2026-03-11T15:23:28Z – codex – shell_pid=14884 – lane=done – Review passed: urgent-mode prompt weighting depends on the completed WP01 store contract, metadata now declares that dependency, and master regression coverage is green
