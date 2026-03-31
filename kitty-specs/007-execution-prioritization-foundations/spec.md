# Feature Specification: Execution Prioritization Foundations

**Feature Branch**: `007-execution-prioritization-foundations`  
**Created**: 2026-03-10  
**Status**: Accepted  
**Mission**: software-dev  
**Input**: Product-direction reset for an ADHD-oriented execution layer on top of TickTick. The system should optimize for meaningful progress without becoming paternalistic or admin-first.

## User Scenarios & Testing

### User Story 1 - Recommend Meaningful Next Work (Priority: P1)

The user asks what to do next and the system recommends work that is aligned with user-owned goals and consequential life themes instead of rewarding inbox cleanup or task-system polishing.

**Why this priority**: This is the clearest product-level distinction from a normal task manager.

**Independent Test**: Provide a representative task set with high-leverage work, urgent work, and low-value admin work, then verify the top recommendation favors meaningful progress by default.

**Acceptance Scenarios**:

1. **Given** the user has high-leverage goal-aligned work and several low-value admin tasks, **When** the system ranks next actions, **Then** the goal-aligned work is recommended ahead of the admin tasks by default
2. **Given** a task is tied to a meaningful user-owned theme and another task is merely organizational, **When** the system ranks next actions, **Then** the meaningful task is favored unless a stronger urgency or blocker exception applies

---

### User Story 2 - Preserve Recovery-Aware Ranking (Priority: P1)

The system can still recommend recovery, maintenance, or enabling work when that is the best path to protect execution capacity or remove a real blocker.

**Why this priority**: A leverage-first assistant that ignores human constraints will feel punishing and unrealistic.

**Independent Test**: Provide a task set where deep work exists but the best next action is a smaller enabling or maintenance task, then verify the system can justify recommending it.

**Acceptance Scenarios**:

1. **Given** the user has a meaningful long-term task but also an urgent maintenance task that must happen first, **When** the system ranks next actions, **Then** the urgent maintenance task can rank first without redefining the product as admin-first
2. **Given** the best next action is a lower-friction enabling step that unlocks deeper work, **When** the system ranks next actions, **Then** the enabling step can be recommended ahead of the deeper task with a clear rationale

---

### User Story 3 - Explain Why This Task Is Next (Priority: P2)

The user can understand why a task was recommended without needing to inspect opaque scores or a hidden value system.

**Why this priority**: Trust requires legible reasoning, especially if the product claims to optimize for bigger goals.

**Independent Test**: Request a recommendation and verify the system returns a concise rationale that references leverage, urgency, blocker removal, or execution fit.

**Acceptance Scenarios**:

1. **Given** a top-ranked recommendation is returned, **When** the user views the recommendation, **Then** the system includes a concise explanation of why it outranked other available work
2. **Given** the system recommends a maintenance or enabling task over a deeper task, **When** the recommendation is shown, **Then** the explanation makes the exception legible rather than arbitrary

## Edge Cases

- If no active task clearly maps to a user-owned goal or theme, the system should still rank useful work but must not pretend to see leverage that is not there.
- If all high-leverage tasks are blocked, the system should surface an unblocking or substitute action instead of empty advice.
- If a low-value task is genuinely urgent, urgency can create an exception without making the task strategically important.

## Requirements

### Functional Requirements

- **FR-001**: System MUST treat meaningful progress toward user-owned long-term goals as the primary optimization target for recommendation ranking
- **FR-002**: System MUST use `goals + urgency + consequential life themes` as the default source of truth for what counts as meaningful work
- **FR-003**: Consequential life themes MAY include financial and career themes, but MUST also allow health, recovery, personal commitments, and enabling responsibilities when user context supports them
- **FR-004**: System MUST apply a leverage-first ranking policy, then adjust within that policy using current work-style state and urgent-mode status
- **FR-005**: System MUST be allowed to rank recovery, maintenance, or enabling work ahead of deeper work when doing so protects execution capacity, removes a real blocker, or satisfies an urgent real-world requirement
- **FR-006**: System MUST NOT optimize for task-system beautification, categorization, or inbox-clearing behavior when higher-leverage work is available
- **FR-007**: System MUST provide a short human-readable rationale for top-ranked recommendations
- **FR-008**: System MUST support recommendation output even when user state is unknown
- **FR-009**: System MUST degrade honestly when leverage is ambiguous rather than pretending false precision
- **FR-010**: Downstream features that recommend, summarize, or coach MUST inherit this ranking policy rather than defining local alternative priorities

### Key Entities

- **User-Owned Goal Theme**: A user-relevant direction that gives work meaning, such as career progress, financial stability, health, recovery, or personal commitments
- **Priority Candidate**: A task or next action under consideration for recommendation
- **Enabling Work**: A lower-friction task that unlocks, protects, or meaningfully supports higher-leverage work
- **Ranking Rationale**: A concise explanation of why a recommended task is the best next move right now

## Success Criteria

- **SC-001**: When high-leverage work and low-value admin work coexist, the system recommends the meaningful work first by default
- **SC-002**: The system can explain each top recommendation in plain language without exposing internal scoring mechanics
- **SC-003**: Recovery, maintenance, and enabling work are surfaced only when they are the best realistic next step, not as a default escape hatch from meaningful work
- **SC-004**: Downstream features can use one shared prioritization policy rather than inventing inconsistent local heuristics

## Assumptions

- Goals and themes begin as user-owned context rather than system-imposed judgments about what should matter
- Financial and career themes are useful defaults, but they are not a complete value system for the product
- This spec governs recommendation behavior, not task storage, reflection memory, or user-state capture by itself
