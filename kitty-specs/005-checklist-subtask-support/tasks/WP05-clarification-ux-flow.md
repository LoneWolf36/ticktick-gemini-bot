---
work_package_id: WP05
title: Clarification UX Flow
dependencies:
- WP04
requirement_refs:
- FR-003
- FR-005
- FR-006
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T051
- T052
- T053
- T054
- T055
- T056
phase: Phase 5 - Telegram Clarification UX
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RP
owned_files:
- bot/commands.js
- bot/callbacks.js
- services/store.js
- tests/regression.test.js
wp_code: WP05
---

# Work Package Prompt: WP05 - Clarification UX Flow

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature helps convert vague or compound intentions into a single executable task with useful sub-steps when that reduces procrastination. It must not confuse checklists with independent tasks or turn brain dumps into clutter.

**Implementation must**:
- Distinguish one parent task with sub-steps from several independent tasks; ask if uncertain.
- Keep checklist items practical and short enough to support execution, not planning theater.
- Use TickTick native checklist `items` only through the structured create path and verify the live API before relying on undocumented assumptions.

**Implementation must not**:
- The system creates a long checklist when separate tasks or a clarification would better fit execution.
- Checklist support mutates existing checklist items before a separate spec defines that behavior.
- The implementation encourages over-planning by preserving every raw brainstorm fragment as a subtask.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission makes tasks more executable by supporting checklist/subtask breakdown where the user is really describing one outcome with multiple steps. It must not explode one intention into noisy task clutter. It must distinguish checklist, multi-task, and clarification cases so the system improves action clarity without rewarding over-planning.

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

## Objectives and Success Criteria

Ask the user a quick, low-friction question when checklist intent is ambiguous, then resume safely without turning clarification into another planning burden.

**Independent test**: Bot tests prove ambiguous requests produce one narrow question, user replies resume execution, and ignored clarifications do not create unsafe writes.

Success looks like:
- Clarification copy is short.
- Pending state has a TTL.
- Fallback remains conservative.

## Context and Constraints

- Mission: `005-checklist-subtask-support`
- Canonical spec: `kitty-specs/005-checklist-subtask-support/spec.md`
- Canonical plan: `kitty-specs/005-checklist-subtask-support/plan.md`
- Canonical task list: `kitty-specs/005-checklist-subtask-support/tasks.md`
- Implementation command: `spec-kitty implement WP05 --mission 005-checklist-subtask-support`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- bot/commands.js
- bot/callbacks.js
- services/store.js
- tests/regression.test.js

## Subtasks and Detailed Guidance

### Subtask T051 - Handle clarification result in bot layer

**Purpose**: Send the question instead of executing.

**Required work**:
- Detect pipeline `clarification` result.
- Send the question as a Telegram reply.
- Do not show internal confidence or schemas.

**Acceptance checks**:
- User receives one short question.
- No task write occurs before answer.
- Internal details are hidden.

### Subtask T052 - Persist pending clarification

**Purpose**: Survive process restarts and avoid in-memory state.

**Required work**:
- Store original message, question, and safe fallback metadata.
- Add TTL, for example 24 hours.
- Scope by user id.

**Acceptance checks**:
- Pending state persists safely.
- Expired clarifications are ignored.
- No cross-user access is possible.

### Subtask T053 - Resume after user reply

**Purpose**: Complete the intended action after clarification.

**Required work**:
- Recognize replies to pending clarification.
- Re-run or constrain pipeline with clarified intent.
- Clear pending state after resolution.

**Acceptance checks**:
- Reply creates correct task shape.
- Pending state clears.
- Unrelated messages do not corrupt state.

### Subtask T054 - Implement conservative fallback

**Purpose**: Avoid blocking the user indefinitely.

**Required work**:
- If the user ignores the question and sends unrelated work, skip or create a plain parent task only when safe.
- Never create a long inferred checklist after ignored clarification.
- Log fallback decision.

**Acceptance checks**:
- Ignored clarification does not create unsafe checklist.
- Fallback is documented and test-covered.
- User copy remains compact.

### Subtask T055 - Add optional inline buttons

**Purpose**: Reduce friction for common answers if consistent with existing UI.

**Required work**:
- Add buttons such as `Checklist`, `Separate tasks`, and `Skip` only if the repo already supports callback patterns cleanly.
- Keep text reply as primary path.
- Do not make buttons required for correctness.

**Acceptance checks**:
- Buttons are optional.
- Text-only flow works.
- Callback handling is tested if added.

### Subtask T056 - Log clarification lifecycle

**Purpose**: Make ambiguity handling inspectable.

**Required work**:
- Log question sent, reply received, fallback, skip, and expiry.
- Avoid raw sensitive message logging beyond existing policy.
- Use existing observability helpers.

**Acceptance checks**:
- Lifecycle events are traceable.
- No private overlogging.
- Logs support debugging.

## Risks and Mitigations

- Risk: clarification increases friction. Mitigation: ask only when confidence is low and keep answer options simple.
- Risk: pending state survives too long. Mitigation: TTL and reset on unrelated messages.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
