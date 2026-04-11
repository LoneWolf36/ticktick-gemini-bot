# Feature Specification: Briefing and Weekly Pipeline Modernization

**Feature Branch**: `006-briefing-weekly-modernization`
**Created**: 2026-03-10
**Status**: Draft
**Mission**: software-dev
**Input**: `/briefing` and `/weekly` were intentionally left on the legacy Gemini path during `001`. This feature moves them onto shared structured modules and deterministic formatting without overcommitting to richer behavioral intelligence in the same step.

## Product Vision Alignment Contract

This specification is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature makes morning and weekly surfaces trustworthy, brief, and action-oriented. Summaries are only useful if they help the user return to what matters without reading a report.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Daily briefing should usually surface no more than three meaningful tasks, with at least one long-term-goal-aligned action when available.
- Weekly output must separate factual history from behavioral interpretation and avoid unsupported pattern claims reserved for behavioral memory.
- Fallbacks must be honest about sparse data and still give a small next action instead of pretending certainty.

**Reject or revise this artifact if**:
- Briefing output becomes verbose, generic, or motivational filler.
- Weekly summaries infer avoidance patterns without enough evidence or without the 009 privacy/confidence contract.
- Formatting depends on model prose instead of deterministic rendering for stable Telegram output.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission creates the main behavioral support surfaces: morning start, daily plan, weekly review, and end-of-day reflection. It must feel like a trusted assistant that helps the user return to what matters. It must stay cognitively light: no interrogation, no generic productivity lecture, no fabricated insight from sparse data.

### Required Product Behavior For This Mission

- Morning check asks only what is needed to understand energy, constraints, and intent for today.
- Daily planning usually surfaces no more than three tasks and includes meaningful long-term-goal work when available.
- End-of-day reflection is brief, context-aware, and non-punitive when the user was irregular, travelling, or social.
- Sparse data produces honest low-confidence language or silence rather than overconfident coaching.

### Cross-Mission Dependency And Drift Risk

This mission depends on reliable task operations from 001-005 and ranking from 007. It is one of the primary user-visible proofs that the product is behavioral support, not a passive list manager.

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

## Clarifications

### Session 2026-03-12

- Q: How strict should the structured summary schema contract be? -> A: Only top-level sections are fixed; inner fields may evolve.
- Q: When processed-task history is sparse or missing, what should `/weekly` do? -> A: Send a reduced weekly digest using available current-task data and explicitly note missing history.
- Q: Which stable top-level sections should tests and formatters rely on for this feature? -> A: Use command-specific but policy-aligned sections: `/briefing` uses `focus`, `priorities`, `why_now`, `start_now`, `notices`; `/weekly` uses `progress`, `carry_forward`, `next_focus`, `watchouts`, `notices`.
- Q: What is allowed inside `/weekly.watchouts` for this feature? -> A: Only evidence-backed execution risks from current tasks or processed history, plus explicit missing-data notices; no behavioral interpretation.

## User Scenarios & Testing

### User Story 1 - Structured Daily Briefing (Priority: P1)

The user runs `/briefing` and receives a compact morning plan produced through a structured summarization path instead of a legacy free-form prompt.

**Why this priority**: The daily briefing is a core product surface and should not live on a different architectural path from the rest of the system.

**Independent Test**: Run `/briefing` against a representative task set and verify the output shape, logging, and reliability behavior are deterministic.

**Acceptance Scenarios**:

1. **Given** active tasks exist, **When** the user runs `/briefing`, **Then** the system produces a structured daily summary object and formats it into a concise Telegram-safe response
2. **Given** the task set is sparse or ambiguous, **When** the briefing is generated, **Then** the formatter still returns a useful compact plan without hallucinated urgency or filler
3. **Given** a structured daily briefing is produced, **When** formatter and regression tests inspect it, **Then** they can rely on the stable top-level sections `focus`, `priorities`, `why_now`, `start_now`, and `notices`
4. **Given** the user has not yet provided morning context, **When** the user runs `/briefing`, **Then** the system asks a quick check (1-2 questions about energy, constraints, intent) before producing the plan
5. **Given** the user responds to the morning check-in, **When** the briefing is generated, **Then** the plan incorporates the user's current energy and constraints
6. **Given** the ranking engine returns more than 3 high-priority candidates, **When** the daily briefing is generated, **Then** the system surfaces no more than 3 tasks, with at least one aligned with long-term goals

---

### User Story 2 - Structured Weekly Review (Priority: P1)

The user runs `/weekly` and receives a weekly digest generated through a structured analysis plus deterministic formatter path.

**Why this priority**: Weekly review quality affects long-horizon trust and should be inspectable before formatting.

**Independent Test**: Run `/weekly` with current tasks and processed-task history and verify the output contains the expected sections and honest fallbacks.

**Acceptance Scenarios**:

1. **Given** processed-task history exists, **When** the user runs `/weekly`, **Then** the result includes structured weekly summary fields before Telegram formatting
2. **Given** the weekly input is sparse, **When** the review is generated, **Then** the output remains honest and compact instead of fabricating metrics or certainty
3. **Given** processed-task history is sparse or missing, **When** the user runs `/weekly`, **Then** the system sends a reduced weekly digest built from available current-task data and explicitly notes that history-backed insights are unavailable
4. **Given** a structured weekly review is produced, **When** formatter and regression tests inspect it, **Then** they can rely on the stable top-level sections `progress`, `carry_forward`, `next_focus`, `watchouts`, and `notices`
5. **Given** `/weekly` includes a `watchouts` section, **When** the summary is generated, **Then** `watchouts` contains only evidence-backed execution risks or explicit missing-data notices and does not include behavioral interpretation

---

### User Story 4 - Daily End-of-Day Reflection (Priority: P1)

At the end of the day, the system provides a brief reflection (1-2 minutes) with lightweight stats and context-aware tone.

**Why this priority**: The Product Vision requires a daily close-out that helps the user see their day honestly — not as a judgment, but as a mirror. This builds the behavioral feedback loop.

**Independent Test**: Run `/daily_close` (or equivalent) and verify the output includes brief reflection, lightweight stats, and context-appropriate tone.

**Acceptance Scenarios**:

1. **Given** the user completed meaningful work, **When** the end-of-day reflection runs, **Then** the tone is gentle, acknowledges progress without cheerleading, and includes lightweight stats (tasks completed, patterns detected)
2. **Given** the user had a neutral day with mixed results, **When** the end-of-day reflection runs, **Then** the tone is balanced, neither praising nor critical, and presents facts honestly
3. **Given** the user clearly avoided important work, **When** the end-of-day reflection runs, **Then** the tone is more direct, surfaces the avoidance pattern factually, and does not soften the truth
4. **Given** the user skipped interaction for days (traveling, busy), **When** the end-of-day reflection runs, **Then** the system does not punish inconsistency, keeps the reflection brief, and remains useful
5. **Given** the user's day was too short for meaningful patterns, **When** the end-of-day reflection runs, **Then** the system keeps it minimal (stats only, no forced insight)

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
- If processed-task history is sparse or absent, the weekly summary should send a reduced digest from available current-task data and explicitly note the missing history.
- If current tasks or processed history do not support a watchout with clear evidence, the weekly summary should omit that watchout rather than infer a behavioral pattern.
- If extraction fails during scheduled sends, the scheduler should log and skip safely without crashing the bot.
- If the user has not interacted with the system for several days, the morning check-in should be even lighter (1 question max) and the briefing should acknowledge the gap without making it a big deal.
- If the end-of-day reflection has no meaningful data (user did nothing or skipped the day), output minimal stats only — do not fabricate patterns or insights.
- If the user is traveling or has limited availability, the morning check-in should ask about constraints explicitly and adjust the daily plan accordingly.

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
- **FR-004a**: `/briefing` and `/weekly` MUST each expose a stable set of top-level summary sections for formatter and test consumption, while allowing inner fields within those sections to evolve without changing the contract for this feature
- **FR-004b**: The stable `/briefing` top-level sections for this feature MUST be `focus`, `priorities`, `why_now`, `start_now`, and `notices`
- **FR-004c**: The stable `/weekly` top-level sections for this feature MUST be `progress`, `carry_forward`, `next_focus`, `watchouts`, and `notices`
- **FR-005**: Summary modules MUST fail honestly when input data is sparse, missing, or extraction confidence is low
- **FR-005a**: When processed-task history is sparse or missing, `/weekly` MUST still produce a reduced digest from available current-task data and explicitly indicate that history-backed insights are unavailable
- **FR-005b**: `/weekly.watchouts` MUST be limited to evidence-backed execution risks from current task state or processed-task history, plus explicit missing-data notices, and MUST NOT introduce behavioral interpretation in this feature
- **FR-006**: Logging MUST capture source inputs, structured summary outputs, formatting decisions, and delivery failures
- **FR-007**: User-facing briefing and weekly messages MUST remain concise and Telegram-safe after formatting
- **FR-008**: Recommendation and reflection policy used by these summaries MUST be inherited from the shared foundation specs rather than invented locally. Urgent task classification for reminder purposes MUST use the shared urgency utility from `008-work-style-and-urgent-mode`; this feature does NOT reimplement urgency logic and queries the shared utility to determine which tasks are urgent.
- **FR-009**: The system MUST provide a daily end-of-day reflection surface with brief reflection (1-2 minutes), lightweight stats, and context-aware tone (gentle/balanced/direct based on day's outcomes)
- **FR-010**: The daily briefing MUST surface no more than three tasks, with at least one aligned with long-term goals
- **FR-011**: When the user has not provided morning context, the system MAY ask 1-2 quick check questions (energy, constraints, intent) before generating the daily plan
- **FR-012**: The end-of-day reflection MUST NOT punish the user for irregular use — it should remain useful without demanding perfect daily consistency

### Key Entities

- **Briefing Summary Object**: Structured daily-plan output before Telegram formatting
- **Weekly Summary Object**: Structured weekly-review output before Telegram formatting
- **Schema Contract**: A fixed top-level section contract for each summary object, with inner field details intentionally left flexible for later foundation work
- **Briefing Section Contract**: `focus`, `priorities`, `why_now`, `start_now`, and `notices`
- **Weekly Section Contract**: `progress`, `carry_forward`, `next_focus`, `watchouts`, and `notices`
- **Watchouts**: Evidence-backed execution risks or explicit missing-data notices for the weekly review, excluding behavioral interpretation in this feature
- **Summary Formatter**: Deterministic renderer that turns structured summary objects into Telegram-ready markdown

## Success Criteria

- **SC-001**: `/briefing` and `/weekly` no longer depend on legacy free-form prompt methods for core logic
- **SC-002**: Command and scheduler paths share the same summarization pipeline
- **SC-003**: Logs and tests can inspect structured summary output before formatting
- **SC-004**: Summary quality improves without introducing local policy drift or fabricated certainty

## Assumptions

- Later foundation specs will define ranking, state, and reflection policy more precisely than this migration track should
- Legacy tone can be preserved in formatter rules even though generation moves to structured modules
