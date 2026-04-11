---
description: "Work package task list template for feature implementation"
---

# Work Packages: Work Style and Urgent Mode

**Inputs**: Design documents from `/kitty-specs/008-work-style-and-urgent-mode/`
**Prerequisites**: plan.md, spec.md

## Product Vision Alignment Contract

This work-package task list is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature controls intervention level. Normal mode must stay humane and cognitively light; urgent mode is a temporary escalation for immediate clarity, not a permanent personality change.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Default to normal humane guidance and urgent mode off unless explicitly set or strongly justified by accepted logic.
- Urgent mode may change tone and ordering, but must not mutate TickTick data or become noisy.
- Return to lighter guidance when the urgent condition is resolved or when confidence is low.

**Reject or revise this artifact if**:
- The assistant becomes a judgmental boss or escalates repeatedly after being ignored.
- Urgent mode is inferred weakly and then treated as fact.
- State management makes future simplification harder without product value.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission defines the product's tone under pressure. The default system should be humane, collaborative, and calm. Urgent mode is a temporary escalation for overwhelm, limited time, or high-confidence stuck patterns. It must be direct without becoming a judgmental boss, and it must back off or soften when inference is weak or guidance is ignored.

### Required Product Behavior For This Mission

- Urgent mode produces minimal, direct, action-oriented guidance and never becomes the default personality.
- The system challenges the user only when confidence and context justify it.
- Repeated ignored guidance causes adaptation or backing off, not louder escalation.
- Urgent mode and intervention copy do not mutate TickTick data unless an explicit task operation is requested through accepted flows.

### Cross-Mission Dependency And Drift Risk

This mission depends on task reliability from 001-005, daily surfaces from 006, and ranking from 007. It also provides intervention evidence and style constraints for 009 behavioral memory.

### Evidence Required Before Any WP Approval

Every implement-review cycle for this mission must produce reviewer-visible evidence for all of the following:

1. The specific Product Vision clause or behavioral scope section served by the change.
2. The local FR, NFR, plan step, task, or WP requirement implemented by the change.
3. The concrete user-visible behavior that changed, including whether the change affects capture, clarification, planning, ranking, intervention, reflection, recovery, or behavioral memory.
4. The anti-drift rule the change preserves: not a passive task manager, not generic reminders, not over-planning support, not busywork optimization, not false certainty, and not SaaS scope expansion.
5. The automated test, regression script, manual transcript, or inspection evidence that proves the behavior.
6. The downstream missions that rely on this behavior and what would break if it drifted.

### Complete 001-009 Acceptance Criteria

After all WPs in missions 001 through 009 have passed implementation, review, and mission-level acceptance, the integrated product must satisfy every item below. If any item is not demonstrably true, the 001-009 chain is not complete.

1. The user can capture clear, vague, multi-task, checklist, recurring, and mutation requests safely through the accepted pipeline without legacy path drift.
2. Ambiguous or destructive actions clarify or fail closed instead of guessing.
3. The daily plan usually contains no more than three tasks, is realistic for the user context, and includes long-term-goal work when such work exists and is plausible.
4. The system distinguishes important work from low-value busywork and actively avoids rewarding motion-as-progress.
5. Urgent mode is temporary, minimal, direct, and action-oriented; it is not the default tone and it does not mutate TickTick state unless the user explicitly asks for a task operation.
6. Weak behavioral or priority inference is never presented as fact. The assistant asks, labels uncertainty, or stays quiet.
7. Behavioral memory stores derived signals only, uses retention limits, and supports inspection/reset so memory remains a coaching aid rather than surveillance.
8. Morning start stays short; end-of-day reflection stays brief, context-aware, and non-punitive.
9. Ignored guidance causes adaptation or backing off, not louder nagging.
10. The implementation avoids MVP scope creep: no auth, billing, rate limiting, multi-tenant isolation, or SaaS infrastructure unless an accepted spec explicitly requires it.
11. User-facing copy is compact, concrete, non-judgmental, and oriented toward the next useful action.
12. No raw user message, raw task title, or raw task description is persisted in long-term behavioral memory.

### Mandatory Rejection Conditions

A reviewer must reject or reopen work in this mission if any of these are true:

- The change can pass local tests while still encouraging list management instead of task execution.
- The assistant accepts the user's first input as correct when the spec requires challenge, clarification, or safe failure.
- The change increases verbosity, ceremony, or planning overhead without improving action clarity or prioritization.
- The change optimizes low-value tasks, cosmetic organization, or generic reminders while ignoring meaningful progress.
- The change presents weak inference as certainty or invents goals, constraints, priorities, or behavioral patterns.
- The change stores raw user/task content in behavioral memory or logs where the mission only allows derived signals.
- The change introduces auth, billing, rate limiting, multi-tenant isolation, or platform-scale infrastructure not accepted by spec.
- The reviewer cannot trace the change from Product Vision -> spec/plan/task -> code/docs -> test evidence.

### Claim Boundary

When this mission is marked done, the claim is not merely that its files changed or tests passed. The claim is that this mission now contributes its defined role to the complete behavioral support system. The stronger statement, "after running 001 through 009 the product exactly matches the vision", is only valid when every mission enforces this contract, every WP has review evidence, and a final mission review confirms spec-to-code-to-test-to-product-vision fidelity across the whole chain.

## Work Package WP01: State Management Contract (Priority: P0)

**Goal**: Establish Redis persistence for urgent mode state and define the getter/setter contract.
**Independent Test**: Can set and retrieve urgent mode state via `store.js` tests. Default fallback (Humane ON, Urgent OFF) is handled correctly when state is missing.
**Prompt**: `kitty-specs/008-work-style-and-urgent-mode/tasks/WP01-state-management-contract.md`

**Requirements Refs**: FR-001, FR-002, FR-005, FR-011

### Included Subtasks
- [x] T001 Implement `getUrgentMode(userId)` in `services/store.js` with default fallback.
- [x] T002 Implement `setUrgentMode(userId, boolean)` in `services/store.js`.
- [x] T003 Update Redis schema/documentation in `store.js` comments.

### Implementation Notes
- Modify `services/store.js` to add the new getter and setter methods.
- Ensure `getUrgentMode` defaults to `false` if the key does not exist.
- Use a Redis key pattern like `user:{userId}:urgent_mode`.

### Parallel Opportunities
- None (foundational).

### Dependencies
- None.

### Estimated Prompt Size
~200 lines

---

## Work Package WP02: Telegram Bot Interface (Priority: P1)

**Goal**: Allow users to toggle urgent mode via Telegram commands.
**Independent Test**: Sending `/urgent on` or `/urgent off` updates the state in Redis and replies with confirmation.
**Prompt**: `kitty-specs/008-work-style-and-urgent-mode/tasks/WP02-telegram-bot-interface.md`

**Requirements Refs**: FR-003, FR-005, SC-001

### Included Subtasks
- [x] T004 [P] Add `/urgent [on|off]` command handler to `bot/commands.js`.
- [x] T005 [P] Wire command to `store.setUrgentMode(userId, value)`.
- [x] T006 [P] Add natural language intent parsing for urgent mode toggle in `services/ax-intent.js` (optional but recommended for robustness).

### Implementation Notes
- Modify `bot/commands.js` to register the new command.
- Provide clear feedback to the user when the mode is changed (e.g., "Urgent mode activated.").

### Parallel Opportunities
- Can be implemented in parallel with WP03 and WP04.

### Dependencies
- Depends on WP01.

### Estimated Prompt Size
~250 lines

---

## Work Package WP03: AI Prompt Augmentation (Priority: P1)

**Goal**: Adjust Gemini AI's tone and task ordering when urgent mode is active.
**Independent Test**: With urgent mode mocked as ON, the AI pipeline generates more direct recommendations and prioritizes differently.
**Prompt**: `kitty-specs/008-work-style-and-urgent-mode/tasks/WP03-ai-prompt-augmentation.md`

**Requirements Refs**: FR-004, FR-009, FR-010, FR-012, FR-013, FR-014, SC-001

### Included Subtasks
- [x] T007 [P] Fetch `urgent_mode` state before calling Gemini in `services/gemini.js`.
- [x] T008 [P] Inject urgent mode instructions into the system prompt (e.g., "Use direct language, prioritize high-impact tasks").
- [x] T009 [P] Update `services/execution-prioritization.js` to apply urgent-aware ordering logic without mutating underlying TickTick data.

### Implementation Notes
- The AI prompt should explicitly instruct the model to adopt a sharper tone.
- Task ordering logic should prioritize items with impending deadlines or high priority flags more aggressively when urgent mode is on.
- Ensure TickTick API calls (via `ticktick-adapter.js`) are NOT modified to alter actual task data.

### Parallel Opportunities
- Can be implemented in parallel with WP02 and WP04.

### Dependencies
- Depends on WP01.

### Estimated Prompt Size
~300 lines

---

## Work Package WP04: Briefing Reminders (Priority: P1)

**Goal**: Remind users in daily and weekly briefings if urgent mode is active.
**Independent Test**: When generating a briefing with urgent mode ON, the output includes a visible reminder.
**Prompt**: `kitty-specs/008-work-style-and-urgent-mode/tasks/WP04-briefing-reminders.md`

**Requirements Refs**: FR-006, FR-007, FR-008, SC-002

### Included Subtasks
- [x] T010 [P] Fetch `urgent_mode` state in `services/scheduler.js` (daily/weekly jobs).
- [x] T011 [P] Append a reminder string (e.g., "⚠️ Urgent mode is currently active.") to the briefing payload if true.
- [x] T012 [P] Ensure manual `/briefing` commands in `bot/commands.js` also include the reminder.

### Implementation Notes
- The reminder should be prominent but not disruptive.
- It must only appear if the state is `true`.

### Parallel Opportunities
- Can be implemented in parallel with WP02 and WP03.

### Dependencies
- Depends on WP01.

### Estimated Prompt Size
~250 lines

---

## Work Package WP05: Integration & E2E Testing (Priority: P0)

**Goal**: Verify the end-to-end flow of the urgent mode feature.
**Independent Test**: Running the E2E test suite validates all acceptance criteria.
**Prompt**: `kitty-specs/008-work-style-and-urgent-mode/tasks/WP05-integration-testing.md`

**Requirements Refs**: SC-001, SC-002, SC-003, SC-004, FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014

### Included Subtasks
- [x] T013 Write E2E test for User Story 1 (toggle behavior) in `tests/e2e-live-ticktick.mjs`.
- [x] T014 Write E2E test for User Story 2 (humane default) in `tests/e2e-live-checklist.mjs`.
- [x] T015 Write E2E test for User Story 3 (briefing reminders).

### Implementation Notes
- Ensure tests run cleanly and do not leave residual test state in Redis.

### Parallel Opportunities
- None (Integration).

### Dependencies
- Depends on WP02, WP03, WP04.

### Estimated Prompt Size
~250 lines

---

## Dependency & Execution Summary

- **Sequence**: WP01 → (WP02, WP03, WP04) → WP05
- **Parallelization**: WP02, WP03, and WP04 can be executed simultaneously by different agents.
- **MVP Scope**: WP01, WP02, WP03, WP04.

---

## Subtask Index (Reference)

| Subtask ID | Summary | Work Package | Priority | Parallel? |
|------------|---------|--------------|----------|-----------|
| T001       | getUrgentMode store method | WP01         | P0       | No        |
| T002       | setUrgentMode store method | WP01         | P0       | No        |
| T003       | Document Redis schema | WP01         | P0       | No        |
| T004       | Add /urgent command | WP02         | P1       | Yes       |
| T005       | Wire command to store | WP02         | P1       | Yes       |
| T006       | Natural language intent | WP02         | P1       | Yes       |
| T007       | Fetch state for Gemini | WP03         | P1       | Yes       |
| T008       | Inject prompt instructions | WP03         | P1       | Yes       |
| T009       | Urgent-aware ordering | WP03         | P1       | Yes       |
| T010       | Fetch state for scheduler | WP04         | P1       | Yes       |
| T011       | Append briefing reminder | WP04         | P1       | Yes       |
| T012       | Append manual briefing reminder | WP04         | P1       | Yes       |
| T013       | E2E test User Story 1 | WP05         | P0       | No        |
| T014       | E2E test User Story 2 | WP05         | P0       | No        |
| T015       | E2E test User Story 3 | WP05         | P0       | No        |

<!-- status-model:start -->
## Canonical Status (Generated)
- WP01: done
- WP02: done
- WP03: done
- WP04: done
- WP05: done
<!-- status-model:end -->
