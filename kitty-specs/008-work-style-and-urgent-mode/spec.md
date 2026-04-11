# Feature Specification: Work Style and Urgent Mode

**Feature Branch**: `008-work-style-and-urgent-mode`
**Created**: 2026-03-10
**Status**: In Review
**Mission**: software-dev
**Input**: Define the explicit user-state model for recommendations: a single humane work-style mode, manual urgent-mode toggle, and weak inference fallback that never escalates intervention on its own.

## Clarifications

### Session 2026-03-11
- Q: How does the user manually toggle urgent mode? -> A: inline keyboard or telegram command
- Q: Where is the user's explicit work-style state and urgent mode state persisted? -> A: Redis (In-memory)
- Q: Does turning on "urgent mode" modify any data in TickTick itself? -> A: Only Internal Output
- Q: If the state is missing from Redis (e.g. first run or cache cleared), what are the explicit "safe defaults"? -> A: Humane ON, Urgent OFF

### Session 2026-04-11 (Spec Review)
- Q: What tone should urgent mode use? -> A: Minimal and action-oriented. Short, sharp, low cognitive load. Example: "Interview prep → first. Groceries → after. Call mom → when free. Execute." Optionally layer structured prioritization if multiple tasks, but avoid motivational or heavy scheduling tones.
- Q: How should weak inferences behave? -> A: Hybrid approach. Default: apply weak inferences internally (reprioritize tasks, suggest alternatives, adjust reminders) without telling the user. Selective surfacing: if a pattern persists (e.g., repeated postponements), surface gently in a non-assumptive, supportive way. Example: "I noticed this task has been postponed a few times—would you like to adjust it or make it easier to start?" Avoid total silence—missed opportunity to help if pattern persists.
- Q: Who owns urgent reminders in briefings? -> A: Shared utility model. The definition of "urgent" (rules, thresholds, prioritization) lives in a single shared module/service. Summary system (006) focuses on recap + reflection. Urgent mode system (008) focuses on real-time prioritization. Both query the same utility, neither reimplements or owns urgency itself.

## Urgency Utility Ownership Model

Urgency is a cross-cutting concern. This feature establishes a **shared urgency utility** that both spec 006 (briefing/weekly) and spec 008 (urgent mode) query, ensuring consistent urgency semantics without duplication.

### Ownership Boundaries

| System | Owns | Queries Urgency Utility |
|---|---|---|---|
| **Shared Urgency Utility** | Rules for what "urgent" means: thresholds, prioritization rules, task classification logic | — |
| **008 — Urgent Mode** | Real-time prioritization, urgent-mode toggle state, direct tone modulation | ✅ Reads urgency classifications to order/surface tasks |
| **006 — Briefing/Weekly** | Recap structure, reflection formatting, weekly digest generation | ✅ Reads urgency classifications to flag urgent items in summaries |

### Contract

- The urgency utility exposes a function (e.g., `classifyUrgency(task)`) that returns a structured urgency level per task.
- Neither 006 nor 008 reimplements urgency logic—both call the shared utility.
- 008 applies urgency classifications in real-time recommendation ordering with urgent-mode tone.
- 006 applies urgency classifications in briefing/weekly summaries for visibility and flagging.
- Urgent-mode *tone* (minimal, action-oriented) is owned by 008 and does not leak into 006's recap-style summaries.

### Shared Urgency Utility Interface

The shared urgency utility exposes the following contract:

```
classifyUrgency(task, context) → { level, reason }
```

Where:
- `level`: One of 'none', 'low', 'medium', 'high', 'critical'
- `reason`: Brief explanation of why the task has this urgency level
- `task`: The task object to classify
- `context`: Current work-style state (humane/urgent mode, goals, deadlines)

Both spec 006 (briefing reminders) and spec 008 (urgent mode task ordering) query this utility. Neither reimplements urgency logic.

## Urgent Mode Tone Definition

Urgent mode uses a **minimal, action-oriented** tone. It reduces cognitive load, removes filler, and communicates priority through brevity and structure.

### Tone Characteristics

- **Short sentences.** No motivational language. No softening.
- **Arrow-based ordering.** Use `→` to signal sequence and priority.
- **Category-aware when multiple tasks exist.** Optionally group by urgency tier, but keep labels terse.
- **No scheduling pressure.** Avoid "you should," "consider," "it might be good to."

### Examples: Normal vs Urgent Tone

| Scenario | Humane Mode (Normal) | Urgent Mode |
|---|---|---|
| 3 tasks due today | "You've got a few things on deck today. I'd suggest starting with the interview prep since it's time-sensitive. Groceries can wait until later, and calling mom fits best when you've got a free moment." | "Interview prep → first. Groceries → after. Call mom → when free." |
| Overloaded day, 6 tasks | "Looks like a busy day. Let's focus on the top 2–3 that matter most and leave the rest for later if needed. Want me to suggest a order?" | "Client deck → now. Tax docs → before 3pm. Rest → push or delegate." |
| No urgent tasks | "Nothing time-critical today. Good day to chip away at backlogged items or take a breather." | "No hard deadlines today. Clear backlog or rest." |

### What Urgent Mode Does NOT Do

- Does NOT say: "You've got this! Let's crush it today! 💪"
- Does NOT say: "I'd recommend starting with X because it seems most important, but of course you know your schedule best..."
- Does NOT manufacture false urgency when no tasks are time-sensitive.
- Does NOT modify TickTick data (tags, dates, priorities). Only affects the bot's internal output.

## Weak Inference Behavior

Weak inferences are signals the system derives from user behavior patterns (postponements, avoidance, repeated rescheduling) that are not strong enough to warrant direct intervention but may inform recommendation framing.

### Default Behavior: Internal Only

By default, weak inferences are applied **silently and internally**:
- Reprioritize tasks based on inferred patterns
- Suggest alternative tasks when the user repeatedly postpones
- Adjust reminder timing without announcing the change
- **Do not tell the user** about every inference—avoid noise and analysis paralysis

### Selective Surfacing: Persistent Patterns

If a weak inference pattern **persists across multiple occurrences** (e.g., a task postponed 3+ times), the system surfaces it **gently and supportively**:

**Rules for surfacing:**
1. **Pattern threshold:** The behavior must repeat (e.g., 2+ postponements of the same task, or a consistent avoidance pattern across similar tasks).
2. **Non-assumptive language:** Frame as observation, not diagnosis. Use "I noticed…" not "You keep avoiding…"
3. **Supportive, not prescriptive:** Offer options, don't demand action.
4. **Once per pattern instance:** Surface once per pattern cycle. Don't repeat the same observation in every briefing.

### Surfacing Examples

| Situation | What the System Says |
|---|---|
| Task postponed 3 times | "I noticed 'Write report' has been pushed a few times. Would you like to break it into smaller steps, adjust the deadline, or park it for now?" |
| Repeatedly skipping gym tasks | "Gym tasks have come up a few times without getting done. Want to try shorter home workouts instead, or is now not the right season for this?" |
| Consistent evening postponements | "Evening tasks have been sliding lately. Should we shift your focus to mornings, or is this a lower-energy period?" |

### What Weak Inference Does NOT Do

- Does NOT auto-enable urgent mode
- Does NOT intensify intervention beyond the user's chosen state
- Does NOT override explicit humane or urgent-mode state
- Does NOT remain totally silent if a persistent pattern emerges (missed opportunity to help)
- Does NOT surface every single inference—only persistent patterns

## User Scenarios & Testing

### User Story 1 - Manual Urgent Mode Changes Recommendation Behavior (Priority: P1)

The user can manually turn urgent mode on when they need a sharper operating posture, and recommendation surfaces immediately reflect that change in both ordering and tone until the user turns urgent mode off.

**Why this priority**: Manual urgent mode is the clearest high-agency state change in this feature. If it is ambiguous or inconsistent, the rest of the state model becomes hard to trust.

**Independent Test**: Enable urgent mode, request a recommendation or summary, confirm ordering and wording change, then disable urgent mode and confirm the system returns to normal behavior.

**Acceptance Scenarios**:

1. **Given** urgent mode is off, **When** the user manually turns urgent mode on (via Telegram command or inline keyboard), **Then** the next recommendation applies urgent-aware ordering and minimal, action-oriented language without changing the underlying prioritization contract
2. **Given** urgent mode is on, **When** the user manually turns urgent mode off (via Telegram command or inline keyboard), **Then** the next recommendation no longer applies urgent-mode ordering or urgent-mode tone

---

### User Story 2 - Humane Mode Is The Stable Default Work Style (Priority: P1)

The user operates with one explicit persistent work style in v1, called humane mode, so the product can preserve a clear default posture without forcing users to manage multiple modes.

**Why this priority**: The feature should reduce ambiguity, not create a mini control panel. A single explicit humane mode keeps the state model legible while still making room for urgent mode as a separate manual overlay.

**Independent Test**: Request recommendations and confirm that, absent urgent mode, the system uses the humane state contract consistently across recommendation surfaces.

**Acceptance Scenarios**:

1. **Given** the user has not activated urgent mode, **When** a recommendation surface runs, **Then** the system resolves work style to the explicit humane mode and uses that as the active baseline
2. **Given** the user asks what their current recommendation posture is, **When** the state is described, **Then** the system can explain that humane mode is the active baseline and urgent mode is a separate manual override

---

### User Story 3 - Briefing And Weekly Surfaces Keep Urgent State Visible (Priority: P1)

The user receives daily and weekly briefing surfaces that visibly remind them when urgent mode is still active, so urgent mode cannot silently linger in the background.

**Why this priority**: Manual urgent mode is only trustworthy if the user can reliably notice that it remains on across recurring surfaces.

**Independent Test**: Leave urgent mode on, generate daily and weekly briefings, and verify each one includes a clear reminder that urgent mode is active.

**Acceptance Scenarios**:

1. **Given** urgent mode is active, **When** the daily briefing is generated, **Then** the briefing explicitly reminds the user that urgent mode is still active
2. **Given** urgent mode is active, **When** the weekly briefing is generated, **Then** the briefing explicitly reminds the user that urgent mode is still active
3. **Given** urgent mode is not active, **When** daily or weekly briefing surfaces are generated, **Then** they do not include a stale urgent-mode reminder

---

### User Story 4 - Urgency Utility Is Shared Across Features (Priority: P1)

Both the urgent mode system (008) and the briefing/weekly system (006) query the same urgency classification utility, ensuring consistent urgency semantics without either feature reimplementing urgency logic.

**Why this priority**: Without a shared utility, urgency rules diverge between features, creating inconsistent behavior and duplicated maintenance.

**Independent Test**: Classify a set of tasks through the urgency utility, verify both 008's recommendation ordering and 006's briefing output use the same urgency labels for the same tasks.

**Acceptance Scenarios**:

1. **Given** a task classified as urgent by the shared utility, **When** 008 generates a recommendation, **Then** the task appears in urgent-priority position
2. **Given** the same task classified as urgent, **When** 006 generates a briefing, **Then** the task is flagged as urgent in the summary output
3. **Given** the urgency utility is updated with new classification rules, **When** both 008 and 006 run, **Then** both reflect the updated rules without separate changes

---

### User Story 5 - Weak Inferences Surface Supportively When Patterns Persist (Priority: P2)

When the system detects a persistent behavioral pattern (e.g., repeated postponements), it surfaces a gentle, non-assumptive observation that offers support without prescribing action.

**Why this priority:** Weak inferences that remain entirely silent miss opportunities to help. Surfacing persistent patterns supportively builds trust without overstepping.

**Independent Test**: Simulate a task being postponed multiple times, verify the system surfaces a gentle observation after the pattern threshold is met, and verify the language is non-assumptive and offers options.

**Acceptance Scenarios**:

1. **Given** a task has been postponed 2+ times, **When** the next recommendation runs, **Then** the system surfaces a gentle observation with supportive options
2. **Given** a weak inference is detected but the pattern has not persisted, **When** recommendations run, **Then** the inference is applied internally without surfacing to the user
3. **Given** a pattern was surfaced once, **When** the same pattern recurs in the next cycle, **Then** the system does not repeat the identical observation unless the pattern has worsened or changed

## Edge Cases

- If work-style state is missing, unknown, or not yet persisted, recommendation surfaces should still return usable output using safe defaults rather than failing closed.
- If urgent mode is active but a user has little actionable work, the system should still stay honest rather than manufacturing intensity or false deadlines.
- If weak inference suggests the user may be overloaded or avoiding work, the system may soften fallback framing but must not silently enable urgent mode or intensify intervention beyond the user's explicit state choice.
- If daily or weekly briefings run while urgent mode is active for an extended period, the reminder should stay visible each time rather than appearing once and then disappearing.
- If the urgency utility is unavailable or returns an error, both 008 and 006 should degrade gracefully using task metadata directly rather than failing output.
- If a weak inference pattern is surfaced but the user takes no action, the system should not escalate or repeat the observation aggressively.

## Out Of Scope

- Multiple selectable work styles in v1
- Auto-enabling urgent mode based on inferred user behavior
- Behavioral-memory rules that override explicit state
- Replacing the shared prioritization contract defined in `007-execution-prioritization-foundations`
- Local briefing or weekly heuristics that bypass the shared summary surfaces defined in `006-briefing-weekly-modernization`
- The urgency utility owning briefing tone or urgent-mode tone—it classifies urgency only, does not modulate voice

## Requirements

### Functional Requirements

- **FR-001**: The system MUST define one explicit work-style mode in v1 called humane mode
- **FR-002**: Humane mode MUST act as the baseline recommendation posture when urgent mode is not active
- **FR-003**: The system MUST provide urgent mode as a separate manual toggle that users can turn on and off directly
- **FR-004**: When urgent mode is active, recommendation behavior MUST change in both task ordering and recommendation tone. This MUST only affect the bot's internal output and MUST NOT modify any data (tags, dates, priorities) in TickTick itself.
- **FR-005**: Urgent mode MUST remain active until the user manually turns it off
- **FR-006**: Daily briefing surfaces MUST remind the user when urgent mode is active
- **FR-007**: Weekly briefing surfaces MUST remind the user when urgent mode is active
- **FR-008**: Urgent-mode reminders MUST disappear once urgent mode is turned off
- **FR-009**: Weak inference MAY inform low-confidence fallback framing, but it MUST NOT activate urgent mode, intensify intervention, or create a stronger state than the user explicitly chose
- **FR-010**: The state resolver for work style and urgent mode MUST be owned by this feature and passed into shared recommendation surfaces rather than reimplemented separately inside ranking, mutation, briefing, or weekly flows
- **FR-011**: If work-style or urgent-mode state is missing or unknown (e.g. from Redis), recommendation surfaces MUST fail honestly and continue with safe defaults (Humane Mode ON, Urgent Mode OFF) rather than stopping output
- **FR-012**: The v1 state model MUST remain limited to humane mode plus the separate urgent-mode overlay
- **FR-013**: Behavioral signals or memory-derived reflections defined by other features MUST NOT override explicit humane or urgent-mode state in v1
- **FR-014**: Manual and scheduled recommendation surfaces MUST apply the same resolved work-style and urgent-mode contract so the user does not see conflicting behavior across touchpoints
- **FR-015**: The system MUST provide a shared urgency utility module that classifies task urgency. Both this feature (008) and the briefing/weekly feature (006) MUST query this utility rather than reimplementing urgency logic
- **FR-016**: Urgent mode tone MUST be minimal and action-oriented: short sentences, arrow-based ordering, no motivational language, no false urgency when no tasks are time-sensitive
- **FR-017**: Weak inferences MUST be applied internally by default without surfacing to the user. When a behavioral pattern persists (e.g., repeated postponements), the system MUST surface a gentle, non-assumptive observation with supportive options
- **FR-018**: Weak inference surfacing MUST occur at most once per pattern cycle and MUST NOT repeat aggressively if the user takes no action

### Key Entities

- **Work Style State**: The explicit user-owned baseline recommendation posture, limited to humane mode in v1. Persisted in Redis.
- **Urgent Mode State**: The separate manual override indicating whether urgent mode is currently active. Persisted in Redis.
- **Resolved Recommendation State**: The combined state passed into shared recommendation surfaces after baseline work style and urgent-mode status are reconciled
- **Urgent Reminder**: A user-facing indicator in recurring briefing surfaces that urgent mode is still active
- **Shared Urgency Utility**: A module that classifies task urgency (rules, thresholds, prioritization). Queried by both 008 and 006. Owned by neither—shared infrastructure.
- **Weak Inference Signal**: A low-confidence behavioral pattern derived from user actions (postponements, avoidance). Applied internally by default; surfaced selectively when persistent.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can turn urgent mode on or off in one explicit action and see the changed recommendation behavior on the next relevant surface
- **SC-002**: Every daily or weekly briefing generated while urgent mode is active includes a clear urgent-mode reminder
- **SC-003**: Recommendation surfaces continue returning usable output when work-style state is missing or uncertain, without auto-enabling urgent mode
- **SC-004**: The v1 state model remains understandable in plain language as one humane baseline plus one manual urgent overlay
- **SC-005**: Both 008 (urgent mode) and 006 (briefing/weekly) classify the same tasks with the same urgency labels when querying the shared urgency utility
- **SC-006**: Urgent mode recommendations match the minimal, action-oriented tone definition—verified by tone examples in acceptance tests
- **SC-007**: Weak inferences are applied silently internally and surfaced only when a persistent pattern meets the surfacing threshold, with language that is non-assumptive and supportive

## Assumptions

- The shared ranking contract from `007-execution-prioritization-foundations` remains the underlying policy engine, while this feature owns only state resolution and modifier precedence
- Daily and weekly briefing delivery surfaces continue to be owned by `006-briefing-weekly-modernization`, but they must consume this feature's resolved state and reminder rules
- Passive behavioral reflections from `009-behavioral-signals-and-memory` may coexist with this feature later, but they do not redefine or silently override explicit user state in v1
- The shared urgency utility is implemented as a standalone module with a stable interface (e.g., `classifyUrgency(task) → { level, reason }`) that both 006 and 008 import without coupling to each other
