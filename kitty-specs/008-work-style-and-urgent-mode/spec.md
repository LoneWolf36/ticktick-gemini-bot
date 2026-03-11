# Feature Specification: Work Style and Urgent Mode

**Feature Branch**: `008-work-style-and-urgent-mode`  
**Created**: 2026-03-10  
**Status**: Draft  
**Mission**: software-dev  
**Input**: Define the explicit user-state model for recommendations: a single humane work-style mode, manual urgent-mode toggle, and weak inference fallback that never escalates intervention on its own.

## User Scenarios & Testing

### User Story 1 - Manual Urgent Mode Changes Recommendation Behavior (Priority: P1)

The user can manually turn urgent mode on when they need a sharper operating posture, and recommendation surfaces immediately reflect that change in both ordering and tone until the user turns urgent mode off.

**Why this priority**: Manual urgent mode is the clearest high-agency state change in this feature. If it is ambiguous or inconsistent, the rest of the state model becomes hard to trust.

**Independent Test**: Enable urgent mode, request a recommendation or summary, confirm ordering and wording change, then disable urgent mode and confirm the system returns to normal behavior.

**Acceptance Scenarios**:

1. **Given** urgent mode is off, **When** the user manually turns urgent mode on, **Then** the next recommendation applies urgent-aware ordering and more direct language without changing the underlying prioritization contract
2. **Given** urgent mode is on, **When** the user manually turns urgent mode off, **Then** the next recommendation no longer applies urgent-mode ordering or urgent-mode tone

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

## Edge Cases

- If work-style state is missing, unknown, or not yet persisted, recommendation surfaces should still return usable output using safe defaults rather than failing closed.
- If urgent mode is active but a user has little actionable work, the system should still stay honest rather than manufacturing intensity or false deadlines.
- If weak inference suggests the user may be overloaded or avoiding work, the system may soften fallback framing but must not silently enable urgent mode or intensify intervention.
- If daily or weekly briefings run while urgent mode is active for an extended period, the reminder should stay visible each time rather than appearing once and then disappearing.

## Out Of Scope

- Multiple selectable work styles in v1
- Auto-enabling urgent mode based on inferred user behavior
- Behavioral-memory rules that override explicit state
- Replacing the shared prioritization contract defined in `007-execution-prioritization-foundations`
- Local briefing or weekly heuristics that bypass the shared summary surfaces defined in `006-briefing-weekly-modernization`

## Requirements

### Functional Requirements

- **FR-001**: The system MUST define one explicit work-style mode in v1 called humane mode
- **FR-002**: Humane mode MUST act as the baseline recommendation posture when urgent mode is not active
- **FR-003**: The system MUST provide urgent mode as a separate manual toggle that users can turn on and off directly
- **FR-004**: When urgent mode is active, recommendation behavior MUST change in both task ordering and recommendation tone
- **FR-005**: Urgent mode MUST remain active until the user manually turns it off
- **FR-006**: Daily briefing surfaces MUST remind the user when urgent mode is active
- **FR-007**: Weekly briefing surfaces MUST remind the user when urgent mode is active
- **FR-008**: Urgent-mode reminders MUST disappear once urgent mode is turned off
- **FR-009**: Weak inference MAY inform low-confidence fallback framing, but it MUST NOT activate urgent mode, intensify intervention, or create a stronger state than the user explicitly chose
- **FR-010**: The state resolver for work style and urgent mode MUST be owned by this feature and passed into shared recommendation surfaces rather than reimplemented separately inside ranking, mutation, briefing, or weekly flows
- **FR-011**: If work-style or urgent-mode state is missing or unknown, recommendation surfaces MUST fail honestly and continue with safe defaults rather than stopping output
- **FR-012**: The v1 state model MUST remain limited to humane mode plus the separate urgent-mode overlay
- **FR-013**: Behavioral signals or memory-derived reflections defined by other features MUST NOT override explicit humane or urgent-mode state in v1
- **FR-014**: Manual and scheduled recommendation surfaces MUST apply the same resolved work-style and urgent-mode contract so the user does not see conflicting behavior across touchpoints

### Key Entities

- **Work Style State**: The explicit user-owned baseline recommendation posture, limited to humane mode in v1
- **Urgent Mode State**: The separate manual override indicating whether urgent mode is currently active
- **Resolved Recommendation State**: The combined state passed into shared recommendation surfaces after baseline work style and urgent-mode status are reconciled
- **Urgent Reminder**: A user-facing indicator in recurring briefing surfaces that urgent mode is still active

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can turn urgent mode on or off in one explicit action and see the changed recommendation behavior on the next relevant surface
- **SC-002**: Every daily or weekly briefing generated while urgent mode is active includes a clear urgent-mode reminder
- **SC-003**: Recommendation surfaces continue returning usable output when work-style state is missing or uncertain, without auto-enabling urgent mode
- **SC-004**: The v1 state model remains understandable in plain language as one humane baseline plus one manual urgent overlay

## Assumptions

- The shared ranking contract from `007-execution-prioritization-foundations` remains the underlying policy engine, while this feature owns only state resolution and modifier precedence
- Daily and weekly briefing delivery surfaces continue to be owned by `006-briefing-weekly-modernization`, but they must consume this feature's resolved state and reminder rules
- Passive behavioral reflections from `009-behavioral-signals-and-memory` may coexist with this feature later, but they do not redefine or silently override explicit user state in v1
