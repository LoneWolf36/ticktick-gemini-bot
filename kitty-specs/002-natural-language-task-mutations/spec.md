# Feature Specification: Single-Target Natural-Language Task Mutations

**Feature Branch**: `002-natural-language-task-mutations`  
**Created**: 2026-03-10  
**Status**: Accepted  
**Mission**: software-dev  
**Input**: Follow-on scope from `001-task-operations-pipeline`. Task creation is structured; update, complete, and delete need a safe mutation path for one clearly resolved target at a time.

## User Scenarios & Testing

### User Story 1 - Free-Form Task Updates (Priority: P1)

The user sends a natural-language instruction like "move buy groceries to tomorrow" or "rename netflix task to finish system design notes" and the system updates the intended TickTick task through the structured mutation pipeline.

**Why this priority**: Natural-language mutation lowers management overhead and keeps task upkeep on the same friction-reducing path as creation.

**Independent Test**: Seed a known task list, send update instructions, and verify the correct task is mutated with a terse confirmation.

**Acceptance Scenarios**:

1. **Given** a task "Buy groceries" exists, **When** the user sends "move buy groceries to tomorrow", **Then** the task due date is updated to tomorrow and the bot replies with "Updated: Buy groceries"
2. **Given** a task "Netflix task" exists, **When** the user sends "rename netflix task to finish system design notes", **Then** the matching task title is updated and unrelated content remains preserved
3. **Given** a task exists, **When** the user sends "make resume task high priority", **Then** the task priority is updated through the adapter and the bot returns a terse confirmation

---

### User Story 2 - Free-Form Completion And Deletion (Priority: P1)

The user sends "done buy groceries" or "delete old wifi task" and the system resolves one safe target before routing completion or deletion through the adapter.

**Why this priority**: Completion and deletion are core operations, but trust collapses quickly if the wrong task is mutated.

**Independent Test**: Seed tasks, send complete and delete instructions, and verify the correct task is changed in TickTick.

**Acceptance Scenarios**:

1. **Given** a task "Buy groceries" exists, **When** the user sends "done buy groceries", **Then** the task is marked complete and the bot replies with "Completed: Buy groceries"
2. **Given** a task "Old wifi task" exists, **When** the user sends "delete old wifi task", **Then** the task is deleted and the bot replies with "Deleted: Old wifi task"
3. **Given** the user issues a delete instruction for a task that cannot be resolved to one safe target, **When** matching remains ambiguous, **Then** no deletion occurs and the bot asks a narrow clarification question

---

### User Story 3 - Conservative Target Resolution (Priority: P1)

When multiple tasks could match the user's instruction, the system asks a focused follow-up rather than mutating the wrong task.

**Why this priority**: Mutation mistakes are more expensive than creation mistakes, especially for delete flows.

**Independent Test**: Seed overlapping task titles and verify the system declines to mutate until the target is unambiguous.

**Acceptance Scenarios**:

1. **Given** tasks "Call mom" and "Call mom about insurance" exist, **When** the user sends "done call mom", **Then** the bot asks which task to complete instead of guessing
2. **Given** a single exact title match exists and several fuzzy matches exist, **When** the user sends a mutation request, **Then** the exact match wins without a follow-up question
3. **Given** no task matches the user's instruction, **When** the user sends a mutation request, **Then** the bot returns a clear "task not found" response and performs no write

## Edge Cases

- Pronoun-based references such as "move that one to Friday" should trigger follow-up rather than guesswork.
- If the target task was already completed or deleted externally, the adapter failure should be surfaced clearly.
- If mutation intent and create intent are mixed in one message, the system may reject the combined request and ask for a simpler instruction until multi-action orchestration is specified separately.

## Out Of Scope

- Batch mutations such as "move all gym tasks to next week"
- High-risk bulk delete flows
- Rich mixed-action requests that combine create and mutate behavior in one message

## Requirements

### Functional Requirements

- **FR-001**: System MUST extract free-form mutation intent for `update`, `complete`, and `delete` using AX structured output
- **FR-002**: System MUST resolve target tasks deterministically from the current TickTick task set before executing any mutation
- **FR-003**: System MUST prefer exact title matches before fuzzy matches and MUST ask a follow-up question when multiple plausible targets remain
- **FR-004**: System MUST route all successful mutations through `TickTickAdapter`
- **FR-005**: Update flows MUST preserve existing task content unless the user explicitly requests a content change
- **FR-006**: User-facing confirmations MUST remain terse and clarification prompts MUST stay narrow
- **FR-007**: Logging MUST capture mutation intent, candidate targets, the final chosen target, and the reason a mutation was skipped
- **FR-008**: Delete operations MUST fail closed when resolution is uncertain
- **FR-009**: This feature MUST apply to one resolved target per mutation action in v1

### Key Entities

- **Mutation Intent**: A structured request describing an update, completion, or deletion
- **Task Resolver**: A deterministic matching component that maps one mutation intent to one concrete TickTick task ID or no action
- **Resolved Mutation Action**: A validated mutation action ready for adapter execution

## Success Criteria

- **SC-001**: Free-form update requests succeed for exact-match tasks without requiring command syntax
- **SC-002**: Completion and deletion mutate only the intended task and never act when resolution remains ambiguous
- **SC-003**: Mutation confirmations remain terse and mutation clarifications remain specific
- **SC-004**: Logs make it possible to reconstruct how the target task was selected or why the system declined to act

## Assumptions

- The current adapter methods for `updateTask`, `completeTask`, and `deleteTask` remain the only mutation write surface
- Single-target mutation is the right trust boundary for the first release; batch mutation can be revisited later as a separate spec
