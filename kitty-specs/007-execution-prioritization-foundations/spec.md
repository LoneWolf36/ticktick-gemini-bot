# Feature Specification: Execution Prioritization Foundations

**Feature Branch**: `007-execution-prioritization-foundations`
**Created**: 2026-03-10
**Status**: Accepted
**Mission**: software-dev
**Input**: Product-direction reset for an ADHD-oriented execution layer on top of TickTick. The system should optimize for meaningful progress without becoming paternalistic or admin-first.

## Product Vision Alignment Contract

This specification is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature is the policy core of the product vision: the assistant must help the user stop mistaking motion for progress and consistently identify work that actually matters.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Rank leverage, goal alignment, and consequential progress ahead of low-value busywork by default.
- Use honest degraded behavior when the system cannot know what matters; ask or expose uncertainty rather than inventing precision.
- Allow exceptions only for clearly justified blockers, urgent real-world constraints, or capacity protection.

**Reject or revise this artifact if**:
- The ranking model optimizes for due dates, small-task count, or completion volume over meaningful progress.
- The implementation hard-codes the user’s values instead of consuming explicit goal context.
- The rationale hides uncertainty behind confident coaching language.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission is the judgment engine for what matters. It must prevent the product's biggest failure mode: confidently steering the user toward the wrong work. Ranking must favor leverage, long-term goals, due pressure, and realistic execution while suppressing busywork that merely feels productive.

### Required Product Behavior For This Mission

- The active plan is capped and focused, usually no more than three tasks.
- At least one long-term-goal-aligned task is favored when available and plausible for the day.
- Low-priority busywork is deprioritized when higher-leverage work exists.
- When metadata is weak, ranking degrades honestly and avoids pretending to know more than it does.

### Cross-Mission Dependency And Drift Risk

This mission depends on task state from 001-005 and feeds 006 daily planning, 008 urgent mode, and 009 behavioral reflection. If this mission is wrong, the whole product can become motion-as-progress automation.

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

### User Story 1 - Recommend Meaningful Next Work (Priority: P1)

The user asks what to do next and the system recommends work that is aligned with user-owned goals and consequential life themes instead of rewarding inbox cleanup or task-system polishing.

**Why this priority**: This is the clearest product-level distinction from a normal task manager.

**Independent Test**: Provide a representative task set with high-leverage work, urgent work, and low-value admin work, then verify the top recommendation favors meaningful progress by default.

**Acceptance Scenarios**:

1. **Given** the user has high-leverage goal-aligned work and several low-value admin tasks, **When** the system ranks next actions, **Then** the goal-aligned work is recommended ahead of the admin tasks by default
2. **Given** a task is tied to a meaningful user-owned theme and another task is merely organizational, **When** the system ranks next actions, **Then** the meaningful task is favored unless a stronger urgency or blocker exception applies
3. **Given** more than 3 tasks rank above the baseline, **When** the user asks for the daily plan, **Then** the system returns exactly 3 tasks, with at least one aligned with long-term goals, and notes that additional candidates are available if requested
4. **Given** fewer than 3 tasks are meaningfully rankable, **When** the user asks for the daily plan, **Then** the system returns only the rankable tasks without padding or fabrication

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
- What happens when the ranking engine has more than 3 high-confidence candidates? The system caps output at 3 and makes the rest available on request. The user should not feel like they're missing out — the cap is a focus tool, not a hiding tool.

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
- **FR-011**: Work-style state and urgent-mode state MUST be resolved through the state resolver defined in 008-work-style-and-urgent-mode. This spec (007) consumes resolved state but does not own state persistence or toggle logic.
- **FR-012**: The ranking engine MUST cap its daily plan output to a maximum of 3 recommended tasks, with at least one task aligned with user-owned goals. When the user explicitly requests more (e.g., "show me everything") or urgent mode is active, the ranking engine MAY surface additional ranked candidates beyond 3, but the briefing display layer (spec 006) retains the right to cap displayed tasks unless the user has explicitly requested the full list.

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
