# Feature Specification: Checklist Creation Support

**Feature Branch**: `005-checklist-subtask-support`  
**Created**: 2026-03-10  
**Status**: Draft  
**Mission**: software-dev  
**Input**: The README promises sub-steps, but the structured pipeline currently supports only top-level task fields. This feature adds create-time checklist extraction without expanding into full checklist-editing workflows yet.

## User Scenarios & Testing

### User Story 1 - Create A Task With Checklist Items (Priority: P1)

The user sends a request like "plan trip: book flights, pack bags, renew travel card" and the system creates one TickTick task with checklist items instead of one long noisy title.

**Why this priority**: This restores a useful advertised behavior and supports overwhelm reduction without forcing extra manual structuring.

**Independent Test**: Send a task request containing clear sub-steps and verify one parent task is created with the expected checklist items.

**Acceptance Scenarios**:

1. **Given** the user sends "plan trip: book flights, pack bags, renew travel card", **When** the pipeline executes, **Then** one parent task is created with three checklist items
2. **Given** the user sends a long task with both primary objective and sub-steps, **When** the title is normalized, **Then** the primary objective becomes the title and the sub-steps become checklist items

---

### User Story 2 - Distinguish Checklists From Multi-Task Splits (Priority: P1)

The system distinguishes between one task with sub-items and multiple standalone tasks.

**Why this priority**: Without explicit rules, the extractor will blur decomposition and independent intent, which creates the wrong TickTick shape.

**Independent Test**: Compare inputs that should become one parent task with checklist items against inputs that should become multiple standalone tasks.

**Acceptance Scenarios**:

1. **Given** the user sends "plan trip: book flights, pack bags", **When** the pipeline executes, **Then** one task with checklist items is created
2. **Given** the user sends "book flights, pack bags, and call uber friday", **When** the pipeline executes, **Then** separate standalone tasks are created instead of one checklist task
3. **Given** the phrasing is ambiguous, **When** the system cannot safely distinguish checklist intent from multi-task intent, **Then** it asks a clarification question or falls back to plain task creation conservatively

## Edge Cases

- If AX emits more checklist items than TickTick supports comfortably, the system should cap or truncate with logging rather than fail silently.
- Deeply nested steps should flatten to one checklist level in v1.
- Checklist item text should be cleaned separately from the parent task title.

## Out Of Scope

- Updating checklist items on existing tasks
- Checklist replace and delete semantics on existing tasks
- Nested subtasks beyond one checklist depth

## Requirements

### Functional Requirements

- **FR-001**: AX extraction MUST support an optional checklist field for create actions
- **FR-002**: The normalizer MUST clean checklist item text separately from parent task title normalization
- **FR-003**: The pipeline MUST distinguish checklist intent from multi-task intent using explicit rules and clarification when ambiguity remains
- **FR-004**: `TickTickAdapter` MUST support creating tasks with checklist items
- **FR-005**: User-facing confirmations MUST mention checklist work tersely without dumping every checklist item into the reply
- **FR-006**: Logging MUST include extracted checklist items, normalized checklist items, and adapter payload mapping

### Key Entities

- **Checklist Intent**: A structured list of sub-steps associated with one parent task create action
- **Normalized Checklist Item**: A cleaned, validated, single-level checklist line ready for TickTick payload mapping

## Success Criteria

- **SC-001**: Complex task requests can create one parent task with checklist items instead of collapsing into poor top-level tasks
- **SC-002**: The system can reliably tell the difference between checklist intent and independent multi-task intent
- **SC-003**: README-level promise of sub-steps is backed by the structured create path

## Assumptions

- The TickTick API surface used by the adapter can represent checklist items on create requests
- Existing-task checklist mutation, if still desired, should be specified separately once create-time checklist support is stable
