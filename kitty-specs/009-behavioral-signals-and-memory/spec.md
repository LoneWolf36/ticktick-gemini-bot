# Feature Specification: Behavioral Signals and Memory

**Feature Branch**: `009-behavioral-signals-and-memory`
**Created**: 2026-03-10
**Status**: Draft
**Mission**: software-dev
**Input**: Product-direction reset for passive-default anti-procrastination support with a public-product privacy boundary.

## Product Vision Alignment Contract

This specification is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature lets the assistant become a mirror over time. It may notice procrastination patterns, but it must be privacy-bounded, confidence-gated, and adaptive instead of intrusive or judgmental.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Store only behavioral metadata needed for patterns; avoid raw task titles, raw messages, or unnecessary personal text.
- Expose only standard- or high-confidence patterns; weak inferences stay internal or are omitted.
- Intervene gradually: silent signals first, direct call-outs only when repeated evidence justifies them, and strict commands only in urgent mode.

**Reject or revise this artifact if**:
- The system stores more private data than needed for the behavior-change loop.
- Low-confidence patterns appear in summaries or coaching as fact.
- Repeated ignored guidance causes louder escalation instead of backing off or adapting.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission gives the assistant memory as a behavioral mirror, not as surveillance and not as raw conversation storage. It must learn derived patterns such as postponement, task switching, over-planning, busywork preference, and repeated avoidance. It must be inspectable, resettable, retention-bound, and confidence-gated.

### Required Product Behavior For This Mission

- Behavioral memory stores derived metadata and pattern signals, not raw task titles, raw descriptions, or raw user messages as long-term memory.
- Insights are surfaced only when confidence and usefulness justify them; weak inference is labelled or withheld.
- The user can inspect, reset, and understand what the system has inferred.
- The system adapts guidance over time, including reducing task count, changing presentation, or backing off when the current style does not help.

### Cross-Mission Dependency And Drift Risk

This mission depends on all previous missions. It closes the 001-009 product loop by turning reliable task execution, planning, prioritization, and intervention history into privacy-aware behavioral support.

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

### User Story 1 - Passive Reflection Without Surveillance Creep (Priority: P1)

The system can surface useful planning-drift or avoidance patterns in reflection surfaces such as daily and weekly summaries without retaining a long-term archive of raw user text.

**Why this priority**: The product needs enough behavioral memory to help, but not enough retention to become intrusive or hard to trust.

**Independent Test**: Generate representative task-management activity, then verify the system can surface a concrete passive reflection using retained signals while storing no long-term raw messages or raw task titles.

**Acceptance Scenarios**:

1. **Given** the user repeatedly reorganizes work without meaningful execution, **When** a summary is generated, **Then** the system can surface an observational pattern using retained signals rather than raw conversational replay
2. **Given** the system lacks enough confidence to support a behavioral interpretation, **When** a summary is generated, **Then** the pattern is omitted rather than weakly guessed

---

### User Story 2 - User Can Inspect And Reset Behavioral Memory (Priority: P1)

The user can view a plain-language summary of retained behavioral memory and clear it without needing to inspect internal scoring or raw event history.

**Why this priority**: For a public-product posture, behavioral memory must remain legible and user-controlled.

**Independent Test**: Create signal history, request a memory summary, reset it, and verify the retained behavioral state is cleared.

**Acceptance Scenarios**:

1. **Given** behavioral signals exist, **When** the user requests a memory summary, **Then** the system explains the retained memory in plain language without exposing implementation internals
2. **Given** behavioral signals exist, **When** the user resets behavioral memory, **Then** retained behavioral history is cleared and future reflections stop referencing the cleared window

---

### User Story 3 - Privacy-Safe Retention Window (Priority: P1)

The system retains only the minimum signal history needed for short learning loops and weekly reflection, then expires it predictably.

**Why this priority**: Too little memory creates noisy guidance; too much creates a deep behavioral archive the product does not need.

**Independent Test**: Populate signal history, advance beyond the retention window, and verify expired signals no longer appear in memory summaries or passive reflections.

**Acceptance Scenarios**:

1. **Given** behavioral signals older than 30 days exist, **When** the retention window is evaluated, **Then** those signals no longer participate in summaries
2. **Given** recent behavioral signals exist inside the retention window, **When** summaries are generated, **Then** only the retained window is considered

## Pattern Detection

The following behavioral patterns are detected from task-management signals. Pattern interpretation and surfacing language follow the weak inference rules defined in 008-work-style-and-urgent-mode.

### Pattern 1: Snooze Spiral
- **What it looks like**: User postpones or snoozes the same task 3 or more times without meaningful progress.
- **Why it matters**: Repeated postponement indicates the task may be too large, poorly defined, or misaligned with current motivation.
- **System could**: "This task has been rescheduled 3 times. Want to break it into a smaller first step or move it to someday?"

### Pattern 2: Commitment Overloader
- **What it looks like**: User creates 15+ tasks in a single day but consistently completes around 6 or fewer.
- **Why it matters**: Over-commitment leads to guilt loops and erodes trust in the planning system.
- **System could**: "You've added 18 tasks today. Your typical completion rate is about 6 per day. Want to pick a daily top 3 and park the rest?"

### Pattern 3: Stale Task Museum
- **What it looks like**: Tasks remain untouched for 30+ days with no progress markers.
- **Why it matters**: Accumulated stale tasks create visual noise and cognitive drag, making the task list feel overwhelming.
- **System could**: "You have 12 tasks untouched for over 30 days. Want to review and archive what no longer matters?"

### Pattern 4: Quick Win Addiction
- **What it looks like**: User consistently completes only small, low-effort tasks while larger, higher-impact tasks accumulate.
- **Why it matters**: Busywork replacing important work creates the illusion of productivity without meaningful progress.
- **System could**: "You've completed 8 small tasks this week but the 2 high-impact ones are still waiting. Want to tackle one of those first today?"

### Pattern 5: Vague Task Writer
- **What it looks like**: User creates tasks with one-word or extremely vague titles ("report", "email", "plan") that lack actionability.
- **Why it matters**: Vague tasks are harder to start and more likely to be avoided because the next action is unclear.
- **System could**: "Some tasks this week are pretty short — 'report', 'plan'. Want to clarify what 'done' looks like for each?"

### Pattern 6: Deadline Daredevil
- **What it looks like**: User consistently completes tasks in the hours immediately before or after their deadline.
- **Why it matters**: Chronic last-minute execution increases stress and risk of quality issues.
- **System could**: "You tend to finish tasks right at the deadline. Want to try setting earlier personal deadlines to give yourself a buffer?"

### Pattern 7: Category Avoidance
- **What it looks like**: User systematically avoids completing tasks of a specific type or domain (e.g., admin tasks, financial tasks, health tasks).
- **Why it matters**: Avoiding entire categories creates hidden bottlenecks and anxiety that compound over time.
- **System could**: "You haven't completed any admin tasks in 3 weeks, but 5 are waiting. Is there one that's particularly unpleasant? Want to pair it with something you enjoy?"

### Pattern 8: Planning-Without-Execution
- **What it looks like**: User creates elaborate plans, detailed breakdowns, or unrealistically ambitious task lists but does not complete the actual work. This manifests in two sub-types:
  - **Type A — Planning as Avoidance**: User creates detailed plans (multiple sub-steps, extensive notes, complex breakdowns) but takes no action on execution. The planning itself provides a dopamine hit of "making progress." Detection: 3+ plans with detailed breakdowns (>5 sub-steps or >200 characters of planning notes) and 0% task completion within 7 days.
  - **Type B — Ambitious Overload**: User creates unrealistically large plans — "learn Python, build app, launch business" in a single week. Plans are 10+ tasks across 3+ domains. These plans are never executed because they're overwhelming. Detection: 10+ tasks created in a single day or week, spanning 3+ projects/categories, with <30% completion rate.
- **Why it matters**: Both sub-types are forms of avoidance. Type A lets the user feel productive through planning alone. Type B sets the user up for failure by planning beyond capacity. Both are explicitly called out in the Product Vision: "stop over-planning as a form of avoidance" and "creating ambitious plans without execution."
- **System could (Type A)**: "You've created detailed plans for 3 projects this week but haven't started execution on any of them. Want to pick one and take the first step?"
- **System could (Type B)**: "This week's plan includes 12 major tasks across 4 projects. Based on your typical completion rate, that's about 3 weeks of work. Want to focus on the top 3 and move the rest to 'someday'?"

## Edge Cases

- If signal data is missing, stale, corrupt, or reset, reflection surfaces should fail open and omit the callout.
- If the same behavior could reflect legitimate replanning rather than avoidance, the system should use observational language and omit low-confidence interpretations.
- If a user requests deletion shortly after a pattern was surfaced, the system should clear retained behavioral memory deterministically and stop reusing it.
- If the system detects over-planning behavior (Pattern 8), the signal is captured without surfacing language. The pattern surfacing rules in spec 008 (weak inference behavior) determine the appropriate intervention — which should balance planning with execution rather than prohibiting planning entirely.

## Requirements

### Functional Requirements

- **FR-000**: Behavioral pattern surfacing MUST delegate to the weak inference surfacing rules defined in 008-work-style-and-urgent-mode. This spec (009) owns signal capture, retention windows, and privacy boundaries only — NOT pattern interpretation or user-facing surfacing language.
- **FR-001**: Anti-procrastination support MUST remain passive by default in v1
- **FR-002**: The long-term behavioral memory store MUST retain derived signals plus the explicitly enumerated minimal semantic metadata only. Detected pattern types include: (1) Snooze Spiral — repeated postponement, (2) Commitment Overloader — task creation far exceeding completion, (3) Stale Task Museum — long-untouched tasks, (4) Quick Win Addiction — small-task bias, (5) Vague Task Writer — non-actionable task titles, (6) Deadline Daredevil — chronic last-minute execution, (7) Category Avoidance — systematic domain avoidance, and (8) Planning-Without-Execution — elaborate planning or ambitious overload without follow-through (with sub-types Type A: Planning as Avoidance, Type B: Ambitious Overload).
- **FR-003**: Long-term behavioral memory MUST NOT retain raw user messages, raw task titles, free-form conversational archives, or open-ended semantic summaries for this feature
- **FR-004**: The allowed long-term semantic metadata set MUST be limited to planning-vs-execution label, wording-only edit vs scope change, decomposition change, and domain or theme tags
- **FR-005**: Behavioral signals MUST be retained for 30 days by default and then excluded from future summaries
- **FR-006**: The 30-day window MUST be treated as the default short-loop learning horizon, not as a justification for deeper archival behavior
- **FR-007**: Low-confidence behavioral interpretations MUST be omitted from summaries rather than surfaced speculatively
- **FR-008**: Behavioral reflections MUST use observational language and MUST NOT make diagnostic, moral, or character-based claims
- **FR-009**: The behavioral-signal layer MUST be non-blocking; task capture and mutation flows MUST continue working even if this layer is unavailable
- **FR-010**: Users MUST be able to view a plain-language summary of retained behavioral memory
- **FR-011**: Users MUST be able to reset retained behavioral memory and receive deterministic deletion behavior for the retained window
- **FR-012**: The behavioral memory model MUST be tenant-scoped from day one, even if the initial deployment has one primary user
- **FR-013**: Reflection surfaces MUST be able to recompute useful output from live task state plus retained aggregates rather than requiring a permanent behavioral archive
- **FR-014**: Operational logs and behavioral memory MUST remain distinct concerns so debugging does not silently expand the long-term privacy boundary

### Key Entities

- **Behavioral Signal**: A retained, privacy-bounded record of task-management behavior such as task churn, scope change, or planning-heavy activity
- **Minimal Semantic Metadata**: The explicitly limited meaning layer retained with behavioral signals
- **Memory Summary**: A plain-language explanation of what behavioral memory the system currently retains
- **Retention Window**: The time-bounded period during which behavioral signals remain eligible for reflection use

## Success Criteria

- **SC-001**: The system can surface passive behavioral reflections without retaining a long-term raw-text archive
- **SC-002**: Behavioral reflections disappear when confidence is too low or the retained window has expired
- **SC-003**: Users can understand and reset behavioral memory without needing an expert view of internal scoring
- **SC-004**: The product maintains a trust-preserving privacy boundary while still supporting weekly and short-loop reflection

## Assumptions

- Richer debugging or audit context, if ever needed, should be short-lived and must not redefine the long-term privacy boundary
- Reflection quality in v1 matters more than exhaustive behavioral forensics
- This spec governs memory and privacy policy, while ranking and current-state policy are defined in separate foundational specs
