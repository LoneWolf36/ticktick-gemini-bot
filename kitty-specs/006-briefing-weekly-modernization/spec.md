# Feature Specification: Briefing and Weekly Pipeline Modernization

**Feature Branch**: `006-briefing-weekly-modernization`  
**Created**: 2026-03-10  
**Status**: Draft  
**Mission**: software-dev  
**Input**: `/briefing` and `/weekly` were intentionally left on the legacy Gemini path during `001`. This feature moves them onto shared structured modules and deterministic formatting without overcommitting to richer behavioral intelligence in the same step.

## User Scenarios & Testing

### User Story 1 - Structured Daily Briefing (Priority: P1)

The user runs `/briefing` and receives a compact morning plan produced through a structured summarization path instead of a legacy free-form prompt.

**Why this priority**: The daily briefing is a core product surface and should not live on a different architectural path from the rest of the system.

**Independent Test**: Run `/briefing` against a representative task set and verify the output shape, logging, and reliability behavior are deterministic.

**Acceptance Scenarios**:

1. **Given** active tasks exist, **When** the user runs `/briefing`, **Then** the system produces a structured daily summary object and formats it into a concise Telegram-safe response
2. **Given** the task set is sparse or ambiguous, **When** the briefing is generated, **Then** the formatter still returns a useful compact plan without hallucinated urgency or filler

---

### User Story 2 - Structured Weekly Review (Priority: P1)

The user runs `/weekly` and receives a weekly digest generated through a structured analysis plus deterministic formatter path.

**Why this priority**: Weekly review quality affects long-horizon trust and should be inspectable before formatting.

**Independent Test**: Run `/weekly` with current tasks and processed-task history and verify the output contains the expected sections and honest fallbacks.

**Acceptance Scenarios**:

1. **Given** processed-task history exists, **When** the user runs `/weekly`, **Then** the result includes structured weekly summary fields before Telegram formatting
2. **Given** the weekly input is sparse, **When** the review is generated, **Then** the output remains honest and compact instead of fabricating metrics or certainty

---

### User Story 3 - Shared Architecture Across Command And Scheduler Paths (Priority: P1)

Manual commands and scheduled jobs use the same summary modules.

**Why this priority**: Otherwise the bot keeps two accountability architectures and drift becomes permanent.

**Independent Test**: Compare command and scheduler execution paths for `/briefing` and `/weekly` and verify shared modules are used.

**Acceptance Scenarios**:

1. **Given** a manual `/briefing` request and the scheduled morning briefing run against the same data, **When** both execute, **Then** they use the same structured summarization path
2. **Given** a manual `/weekly` request and the scheduled weekly digest run against the same data, **When** both execute, **Then** they use the same structured summarization path

## Edge Cases

- If there are too few active tasks for a normal briefing, the formatter should degrade gracefully without filler.
- If processed-task history is sparse or absent, the weekly summary should stay honest and compact.
- If extraction fails during scheduled sends, the scheduler should log and skip safely without crashing the bot.

## Out Of Scope

- Rich behavioral reflection logic beyond what later foundation specs explicitly authorize
- Local ranking heuristics that bypass the shared prioritization policy
- New coaching tone, stronger intervention, or inference-heavy behavior changes

## Requirements

### Functional Requirements

- **FR-001**: `/briefing` MUST move off the legacy free-form Gemini prompt path onto a structured extraction plus deterministic formatting path
- **FR-002**: `/weekly` MUST move off the legacy free-form Gemini prompt path onto a structured extraction plus deterministic formatting path
- **FR-003**: Manual command execution and scheduled execution MUST share the same briefing and weekly summarization modules
- **FR-004**: Structured daily and weekly summary objects MUST be inspectable before formatting
- **FR-005**: Summary modules MUST fail honestly when input data is sparse, missing, or extraction confidence is low
- **FR-006**: Logging MUST capture source inputs, structured summary outputs, formatting decisions, and delivery failures
- **FR-007**: User-facing briefing and weekly messages MUST remain concise and Telegram-safe after formatting
- **FR-008**: Recommendation and reflection policy used by these summaries MUST be inherited from the shared foundation specs rather than invented locally

### Key Entities

- **Briefing Summary Object**: Structured daily-plan output before Telegram formatting
- **Weekly Summary Object**: Structured weekly-review output before Telegram formatting
- **Summary Formatter**: Deterministic renderer that turns structured summary objects into Telegram-ready markdown

## Success Criteria

- **SC-001**: `/briefing` and `/weekly` no longer depend on legacy free-form prompt methods for core logic
- **SC-002**: Command and scheduler paths share the same summarization pipeline
- **SC-003**: Logs and tests can inspect structured summary output before formatting
- **SC-004**: Summary quality improves without introducing local policy drift or fabricated certainty

## Assumptions

- Later foundation specs will define ranking, state, and reflection policy more precisely than this migration track should
- Legacy tone can be preserved in formatter rules even though generation moves to structured modules
