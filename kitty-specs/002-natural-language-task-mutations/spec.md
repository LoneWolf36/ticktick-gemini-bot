# Feature Specification: Single-Target Natural-Language Task Mutations

**Feature Branch**: `002-natural-language-task-mutations`
**Created**: 2026-03-10
**Status**: Accepted
**Mission**: software-dev
**Input**: Follow-on scope from `001-task-operations-pipeline`. Task creation is structured; update, complete, and delete need a safe mutation path for one clearly resolved target at a time.

## Product Vision Alignment Contract

This specification is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature reduces task-maintenance friction while protecting trust: the user can clean up or complete work quickly, but the system must never mutate the wrong task just to appear helpful.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Resolve exactly one target before any update, completion, or deletion.
- Ask narrow clarification questions when target confidence is low or when pronouns and fuzzy references create ambiguity.
- Keep mutation confirmations terse so the task system remains an execution aid rather than another inbox to read.

**Reject or revise this artifact if**:
- Any bulk or multi-target mutation is introduced without an accepted spec.
- A delete or complete operation proceeds on fuzzy confidence alone.
- The user is forced into command syntax for clear natural-language maintenance.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission gives the user a low-friction way to correct, complete, reschedule, or delete existing work by language. It exists to reduce task-management overhead, not to encourage endless list grooming. It must fail closed when target identity or intent is uncertain, because confident mutation of the wrong task is worse than asking a short clarification.

### Required Product Behavior For This Mission

- Natural-language mutations identify the correct target task or ask for clarification instead of guessing.
- Completion, deletion, update, schedule, and recurrence changes preserve user intent and avoid destructive side effects.
- The system remains concise and operational; it does not turn updates into planning sessions unless ambiguity requires it.
- Mutation behavior supports trust: the user can quickly correct the plan without being punished by extra ceremony.

### Cross-Mission Dependency And Drift Risk

This mission depends on 001 task operations and feeds every later surface that assumes the user can keep task state current without manual TickTick cleanup.

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
- If the target task was already completed or deleted externally, the adapter failure should be surfaced clearly; adapter failures during mutation are handled per the hardened failure paths defined in `003-pipeline-hardening-and-regression` FR-003 and FR-004.
- If mutation intent and create intent are mixed in one message, the system may reject the combined request and ask for a simpler instruction until multi-action orchestration is specified separately.

## Out Of Scope

- Batch mutations such as "move all gym tasks to next week"
- High-risk bulk delete flows
- Rich mixed-action requests that combine create and mutate behavior in one message
- Mutating checklist items on existing tasks (see `005-checklist-subtask-support` for create-time checklist scope; mutation semantics are deferred)

## Requirements

### Functional Requirements

- **FR-001**: System MUST extract free-form mutation intent for `update`, `complete`, and `delete` using AX structured output
- **FR-002**: System MUST resolve target tasks deterministically from the current TickTick task set before executing any mutation
- **FR-003**: System MUST prefer exact title matches before fuzzy matches and MUST ask a follow-up question when multiple plausible targets remain
- **FR-004**: System MUST route all successful mutations through `TickTickAdapter`; mutation actions flow through the same pipeline contract defined in `001-task-operations-pipeline` FR-004
- **FR-005**: Update flows MUST preserve existing task content unless the user explicitly requests a content change
- **FR-006**: User-facing confirmations MUST remain terse and clarification prompts MUST stay narrow; response verbosity respects the current work-style state defined in `008-work-style-and-urgent-mode`
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
