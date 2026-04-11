---
work_package_id: WP01
title: State Management Contract
dependencies: []
base_branch: master
base_commit: 50c1642627d0e5fa1fc224c01c79180363d207a8
created_at: '2026-03-11T13:21:39.210279+00:00'
subtasks:
- T001
- T002
- T003
phase: Phase 1 - Foundation
authoritative_surface: kitty-specs/008-work-style-and-urgent-mode/
execution_mode: code_change
mission_id: 01KNT55PMZK4VQERH6AB2FE18B
owned_files:
- kitty-specs/008-work-style-and-urgent-mode/plan.md
- kitty-specs/008-work-style-and-urgent-mode/tasks.md
wp_code: WP01
---

# Work Package Prompt: WP01 – State Management Contract

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

- Establish Redis persistence for urgent mode state.
- Define a getter/setter contract in `services/store.js`.
- Ensure the default state (Humane Mode ON, Urgent Mode OFF) is handled correctly when state is missing.

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
- 2026-03-11T13:21:42Z – codex – shell_pid=26716 – lane=doing – Assigned agent via workflow command
- 2026-03-11T13:27:40Z – codex – shell_pid=26716 – lane=for_review – Ready for review: added urgent mode Redis contract, default false fallback, and regression coverage
- 2026-03-11T15:03:03Z – codex – shell_pid=21648 – lane=doing – Started review via workflow command
- 2026-03-11T15:03:45Z – codex – shell_pid=21648 – lane=done – Review passed: urgent-mode store contract defaults false, persists correctly, and regression coverage validates schema and state transitions
