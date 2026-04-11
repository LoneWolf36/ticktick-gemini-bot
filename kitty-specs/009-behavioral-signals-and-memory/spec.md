# Feature Specification: Behavioral Signals and Memory

**Feature Branch**: `009-behavioral-signals-and-memory`  
**Created**: 2026-03-10  
**Status**: Draft  
**Mission**: software-dev  
**Input**: Product-direction reset for passive-default anti-procrastination support with a public-product privacy boundary.

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

## Edge Cases

- If signal data is missing, stale, corrupt, or reset, reflection surfaces should fail open and omit the callout.
- If the same behavior could reflect legitimate replanning rather than avoidance, the system should use observational language and omit low-confidence interpretations.
- If a user requests deletion shortly after a pattern was surfaced, the system should clear retained behavioral memory deterministically and stop reusing it.

## Requirements

### Functional Requirements

- **FR-000**: Behavioral pattern surfacing MUST delegate to the weak inference surfacing rules defined in 008-work-style-and-urgent-mode. This spec (009) owns signal capture, retention windows, and privacy boundaries only — NOT pattern interpretation or user-facing surfacing language.
- **FR-001**: Anti-procrastination support MUST remain passive by default in v1
- **FR-002**: The long-term behavioral memory store MUST retain derived signals plus the explicitly enumerated minimal semantic metadata only
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
