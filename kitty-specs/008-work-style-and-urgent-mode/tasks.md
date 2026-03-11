---
description: "Work package task list template for feature implementation"
---

# Work Packages: Work Style and Urgent Mode

**Inputs**: Design documents from `/kitty-specs/008-work-style-and-urgent-mode/`
**Prerequisites**: plan.md, spec.md

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
- [ ] T004 [P] Add `/urgent [on|off]` command handler to `bot/commands.js`.
- [ ] T005 [P] Wire command to `store.setUrgentMode(userId, value)`.
- [ ] T006 [P] Add natural language intent parsing for urgent mode toggle in `services/ax-intent.js` (optional but recommended for robustness).

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
- [ ] T007 [P] Fetch `urgent_mode` state before calling Gemini in `services/gemini.js`.
- [ ] T008 [P] Inject urgent mode instructions into the system prompt (e.g., "Use direct language, prioritize high-impact tasks").
- [ ] T009 [P] Update `services/execution-prioritization.js` to apply urgent-aware ordering logic without mutating underlying TickTick data.

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
- [ ] T010 [P] Fetch `urgent_mode` state in `services/scheduler.js` (daily/weekly jobs).
- [ ] T011 [P] Append a reminder string (e.g., "⚠️ Urgent mode is currently active.") to the briefing payload if true.
- [ ] T012 [P] Ensure manual `/briefing` commands in `bot/commands.js` also include the reminder.

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
- [ ] T013 Write E2E test for User Story 1 (toggle behavior) in `tests/e2e-live-ticktick.mjs`.
- [ ] T014 Write E2E test for User Story 2 (humane default) in `tests/e2e-live-checklist.mjs`.
- [ ] T015 Write E2E test for User Story 3 (briefing reminders).

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
