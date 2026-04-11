---
work_package_id: WP05
title: Integration & E2E Testing
dependencies:
- WP02
- WP03
- WP04
base_branch: master
base_commit: a7e40ce9ab69c2f3af0395628c36671f211e65d2
created_at: '2026-03-11T14:33:29.547519+00:00'
subtasks:
- T013
- T014
- T015
phase: Phase 3 - Integration
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMZK4VQERH6AB2FE18B
owned_files:
- kitty-specs/008-work-style-and-urgent-mode/plan.md
- kitty-specs/008-work-style-and-urgent-mode/tasks.md
- tests/e2e-live-checklist.mjs
- tests/e2e-live-ticktick.mjs
wp_code: WP05
---

# Work Package Prompt: WP05 – Integration & E2E Testing

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check Spec Kitty status and event history before starting. If feedback exists, scroll to the **Review Feedback** section immediately (right below this notice).
- **You must address all feedback** before your work is complete. Feedback items are your implementation TODO list.
- **Mark as acknowledged**: When you understand the feedback and begin addressing it, append an Activity Log entry explaining that the feedback is acknowledged.
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
- 2026-03-11T14:33:33Z – codex – shell_pid=10544 – lane=doing – Assigned agent via workflow command
- 2026-03-11T14:46:49Z – codex – shell_pid=10544 – lane=for_review – Ready for review: added deterministic urgent-mode integration coverage for toggle behavior, humane default, and briefing reminders
- 2026-03-11T15:06:05Z – codex – shell_pid=25204 – lane=doing – Started review via workflow command
- 2026-03-11T15:53:36Z – codex – shell_pid=25204 – lane=done – Review passed: dependencies declared (WP02-WP04), urgent-mode integration coverage present, regression suites green.
