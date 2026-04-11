# Feature Specification: Checklist Creation Support

**Feature Branch**: `005-checklist-subtask-support`
**Created**: 2026-03-10
**Status**: Draft
**Mission**: software-dev
**Input**: The README promises sub-steps, but the structured pipeline currently supports only top-level task fields. This feature adds create-time checklist extraction without expanding into full checklist-editing workflows yet.

## Product Vision Alignment Contract

This specification is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature helps convert vague or compound intentions into a single executable task with useful sub-steps when that reduces procrastination. It must not confuse checklists with independent tasks or turn brain dumps into clutter.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Distinguish one parent task with sub-steps from several independent tasks; ask if uncertain.
- Keep checklist items practical and short enough to support execution, not planning theater.
- Use TickTick native checklist `items` only through the structured create path and verify the live API before relying on undocumented assumptions.

**Reject or revise this artifact if**:
- The system creates a long checklist when separate tasks or a clarification would better fit execution.
- Checklist support mutates existing checklist items before a separate spec defines that behavior.
- The implementation encourages over-planning by preserving every raw brainstorm fragment as a subtask.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission makes tasks more executable by supporting checklist/subtask breakdown where the user is really describing one outcome with multiple steps. It must not explode one intention into noisy task clutter. It must distinguish checklist, multi-task, and clarification cases so the system improves action clarity without rewarding over-planning.

### Required Product Behavior For This Mission

- One outcome with clear component steps becomes one task with checklist items when TickTick support is available.
- Independent outcomes become separate tasks only when that is the user intent and does not create low-value clutter.
- Ambiguous breakdown requests ask concise clarification instead of guessing structure.
- Checklist generation must produce actionable items, not decorative planning artifacts.

### Cross-Mission Dependency And Drift Risk

This mission depends on 001 task creation and 002 update semantics. It feeds 006 daily planning and 007 ranking by making work units clearer and more executable.

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

- **FR-000**: The Intent Action shape defined in 001-task-operations-pipeline FR-001 is extended with an optional `checklist: string[]` field for create-type actions only. This extension does not affect mutation actions defined in 002-natural-language-task-mutations.
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
