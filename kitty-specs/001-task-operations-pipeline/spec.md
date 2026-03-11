# Feature Specification: Task Operations Pipeline

**Feature Branch**: `001-task-operations-pipeline`
**Created**: 2026-03-08
**Status**: Accepted
**Mission**: software-dev
**Input**: Revised Implementation Plan - replace prompt-heavy freeform task logic with AX + deterministic normalization + direct REST API TickTick adapter pipeline

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Silent Single-Task Creation (Priority: P1)

The user sends a plain Telegram message like "Book dentist appointment Thursday" and the system silently creates a clean TickTick task with the title "Book dentist appointment", due date set to Thursday, placed in the right project, with no verbose response.

**Why this priority**: This is the most common interaction and the one where trust-breaking failures occurred most often (verbose analysis output, leaked context in titles, broken recurrence). Fixing this path alone delivers the majority of user value.

**Independent Test**: Can be tested by sending a single natural-language message and verifying the resulting TickTick task has a clean title, correct due date, and appropriate project, with only a terse confirmation returned.

**Acceptance Scenarios**:

1. **Given** the bot is running and connected, **When** the user sends "Book dentist appointment Thursday", **Then** a TickTick task is created with title "Book dentist appointment", due date set to the next Thursday, and the bot replies with a short confirmation like "Created: Book dentist appointment"
2. **Given** the bot is running, **When** the user sends "Buy groceries", **Then** a task is created with title "Buy groceries", no due date, default project, and a terse confirmation
3. **Given** the bot is running, **When** the user sends a message with a very long description, **Then** the title is truncated to the configured maximum and excess detail is moved to content (if useful) or dropped

---

### User Story 2 - Multi-Task Creation from Single Message (Priority: P1)

The user sends a message containing multiple tasks like "book flight, pack bag, and call uber friday" and the system creates separate TickTick tasks for each one.

**Why this priority**: Equally critical as single-task creation. Users with ADHD frequently brain-dump multiple tasks in one message. Failing to split them creates incorrect or merged tasks.

**Independent Test**: Send a multi-intent message and verify each intent becomes a separate task with its own clean title, correct date (if specified), and appropriate project.

**Acceptance Scenarios**:

1. **Given** the bot is running, **When** the user sends "book flight, pack bag, and call uber friday", **Then** three separate tasks are created: "Book flight", "Pack bag", "Call Uber" (the last with due date Friday), and a terse summary response like "Created 3 tasks"
2. **Given** the bot is running, **When** the user sends a message with one clear task and one ambiguous fragment, **Then** the clear task is created silently and the bot asks a focused clarification question only for the ambiguous part

---

### User Story 3 - Recurring Task Creation (Priority: P1)

The user sends "practice DSA every weekday" and the system creates a single recurring TickTick task with a proper `repeatFlag` for weekdays, rather than creating five separate tasks.

**Why this priority**: Recurrence handling was a major failure point. Creating manual copies instead of a recurring task breaks TickTick's native scheduling and causes task clutter.

**Independent Test**: Send a message with clear recurrence intent and verify exactly one TickTick task is created with the correct `repeatFlag` value.

**Acceptance Scenarios**:

1. **Given** the bot is running, **When** the user sends "practice DSA every weekday", **Then** a single recurring task is created with title "Practice DSA" and `repeatFlag` configured for weekdays (Mon-Fri)
2. **Given** the bot is running, **When** the user sends "call mom every Sunday", **Then** a single recurring task is created with `repeatFlag` set to weekly on Sunday
3. **Given** the bot is running, **When** the user sends "run daily", **Then** a single recurring task is created with `repeatFlag` set to daily

---

### User Story 4 - Multi-Day Splitting (Priority: P2)

The user sends "study system design monday tuesday and wednesday" and the system creates three separate one-off tasks (one per day) rather than a recurring task, because the user named distinct dates, not a repeating pattern.

**Why this priority**: Distinguishing between recurrence and multi-day intent prevents incorrect task organization. Less frequent than pure recurrence but important for correctness.

**Independent Test**: Send a multi-day message and verify separate dated tasks are created rather than a recurring task.

**Acceptance Scenarios**:

1. **Given** the bot is running, **When** the user sends "study system design monday tuesday and wednesday", **Then** three tasks are created: "Study system design" with due dates for next Monday, Tuesday, and Wednesday respectively
2. **Given** the bot is running, **When** the user sends "gym mon wed fri", **Then** the system distinguishes this from recurrence and creates three separate one-off tasks (or, if ambiguous, asks whether the user means recurring or one-off)

---

### User Story 5 - Task Update via Adapter (Priority: P2)

The user requests an update to an existing task (e.g., change due date, update priority, rename) and the system applies the update through the TickTick adapter.

**Why this priority**: Updates are a core task operation. Routing them through the adapter ensures consistency and testability.

**Independent Test**: Request a specific task update and verify the TickTick task is modified correctly through the adapter.

**Acceptance Scenarios**:

1. **Given** a task "Buy groceries" exists, **When** the user sends "move buy groceries to tomorrow", **Then** the task's due date is updated to tomorrow via the adapter and a terse confirmation is returned
2. **Given** a task exists, **When** the user sends an update with invalid data (e.g., nonsensical priority), **Then** the normalizer rejects the update and the bot informs the user clearly

---

### User Story 6 - Task Completion via Adapter (Priority: P2)

The user marks a task as completed and the system routes the completion through the TickTick adapter.

**Why this priority**: Completion is essential for the accountability loop. Must work through the adapter contract.

**Independent Test**: Complete a known task and verify it is marked complete in TickTick.

**Acceptance Scenarios**:

1. **Given** a task "Buy groceries" exists, **When** the user sends "done buy groceries", **Then** the task is marked complete via the adapter and a terse confirmation is returned

---

### User Story 7 - Task Deletion via Adapter (Priority: P3)

The user deletes a task through the system and the deletion routes through the TickTick adapter.

**Why this priority**: Deletion is lower frequency but must still go through the adapter contract for consistency.

**Independent Test**: Delete a known task and verify it no longer exists in TickTick.

**Acceptance Scenarios**:

1. **Given** a task "Buy groceries" exists, **When** the user sends "delete buy groceries", **Then** the task is deleted via the adapter and a confirmation is returned

---

### User Story 8 - Project and Category Resolution (Priority: P2)

When the user mentions a project or category (explicitly or implicitly), the system resolves it deterministically against known TickTick projects rather than relying purely on LLM output.

**Why this priority**: Misclassification was a known failure mode. Deterministic resolution prevents silent misrouting of tasks.

**Independent Test**: Send a message with an implicit or explicit project reference and verify the task lands in the correct project.

**Acceptance Scenarios**:

1. **Given** projects "Work", "Personal", "Health" exist in TickTick, **When** the user sends "submit quarterly report", **Then** the task is assigned to the "Work" project based on deterministic resolution
2. **Given** the user sends a task with an ambiguous category, **Then** the system falls back to a safe default project and logs the ambiguity
3. **Given** the user explicitly names a project that does not exist, **Then** the system uses the default project and informs the user

---

### Edge Cases

- What happens when the TickTick REST API is unavailable? The system should fail gracefully with a user-facing error message and not lose the parsed intent.
- What happens when AX returns a malformed or low-confidence intent? The normalizer rejects it and the bot asks the user to rephrase.
- What happens when a message contains zero actionable task content (e.g., "hello")? The system should not create a task and should respond conversationally.
- What happens when the user sends a message with conflicting recurrence signals (e.g., "every weekday but only on Tuesday")? The system should ask for clarification.
- What happens when the user sends an extremely long message (500+ words)? AX should extract intent and the normalizer should enforce title/content limits.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST extract structured intent from free-form Telegram messages using AX, producing typed action objects with at minimum: `type`, `title`, `content`, `priority`, `projectHint`, `dueDate`, `repeatHint`, `splitStrategy`, and `confidence`
- **FR-002**: System MUST support multiple actions from a single user message (multi-task parsing)
- **FR-003**: System MUST deterministically normalize all AX output before execution, including title truncation, content suppression, recurrence-hint-to-repeatFlag conversion, due-date expansion, and project resolution
- **FR-004**: System MUST route all TickTick operations (create, update, complete, delete) through a single TickTick adapter module backed by the direct REST API
- **FR-005**: System MUST NOT scatter direct TickTick API calls outside the adapter
- **FR-006**: Task titles MUST be short, verb-led, and free from dates, priorities, project names, or leaked user context
- **FR-007**: Task content MUST only contain useful references (URLs, locations, instructions) and MUST NOT contain coaching prose, motivational filler, or analysis noise. If a task has previous content within it, then it must be preserved as is or with better formatting and not overwritten.
- **FR-008**: System MUST create a single recurring TickTick task (with proper `repeatFlag`) when the user expresses recurring intent, not multiple manual copies
- **FR-009**: System MUST create separate one-off tasks when the user names distinct dates for separate sessions (multi-day splitting)
- **FR-010**: System MUST resolve project/category deterministically against known TickTick projects, falling back to a safe default when resolution is ambiguous
- **FR-011**: System MUST respond silently (terse confirmation only) for clear task operations and MUST NOT produce verbose analysis output
- **FR-012**: System MUST ask follow-up questions only when a request is genuinely ambiguous in a way that would create incorrect tasks
- **FR-013**: System MUST validate AX output before execution and reject actions with invalid fields, low confidence, or malformed data
- **FR-014**: System MUST log the full pipeline: raw user request, AX intent output, normalized actions, adapter requests, adapter results, and validation failures
- **FR-015**: The TickTick adapter MUST expose a narrow interface: `createTask`, `updateTask`, `completeTask`, `deleteTask`, `listProjects`, `findProjectByName`, and optionally `createTasksBatch`
- **FR-016**: System MUST handle TickTick REST API unavailability gracefully without losing parsed intent

### Key Entities

- **Intent Action**: A structured object produced by AX representing a single user intent (type, title, content, priority, projectHint, dueDate, repeatHint, splitStrategy, confidence)
- **Normalized Action**: A validated and cleaned version of an Intent Action, ready for execution (title truncated, content filtered, repeatHint converted to repeatFlag, project resolved to ID)
- **TickTick Adapter**: The single module through which all TickTick operations flow, internally wrapping the direct REST API
- **Project Map**: A cached deterministic mapping of known TickTick project names to IDs, used for resolution

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Natural-language Telegram messages produce clean TickTick tasks silently in under 5 seconds end-to-end
- **SC-002**: Task titles never exceed the configured character limit and never contain dates, priorities, or leaked user context
- **SC-003**: Recurring intent (daily, weekdays, weekly, every X) produces exactly one recurring TickTick task rather than manual copies
- **SC-004**: Multi-day intent produces separate correctly-dated one-off tasks
- **SC-005**: Multi-task messages produce the correct number of separate clean tasks
- **SC-006**: All TickTick operations (create, update, complete, delete) flow through the adapter with no direct API calls elsewhere in the codebase
- **SC-007**: The bot's user-facing responses for task operations are terse confirmations, not verbose analysis prose
- **SC-008**: The full pipeline is observable via logs: from raw input through intent extraction, normalization, adapter call, to result
- **SC-009**: Project/category resolution succeeds deterministically for known projects and falls back safely for unknown ones

## Assumptions

- AX supports the Gemini API provider and can produce structured typed outputs within the Node.js/ESM stack
- The existing TickTick API client handles OAuth2, retry backoff, and project-move rollbacks effectively and can be refactored into the required adapter contract
- The current single-user scope means no concurrent operation conflicts need to be handled
- Existing bot commands (/scan, /pending, /briefing, etc.) will continue to work during migration; only the task-creation path changes initially, with update/complete/delete following
