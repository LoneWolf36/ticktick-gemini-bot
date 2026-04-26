---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-22T22:15:00Z"
source_specs: ["008-work-style-and-urgent-mode"]
complexity: "complex"
---

# Cavekit: Work Style

## Scope

Tone state management (standard, focus, urgent), Telegram bot interface for mode switching, AI prompt augmentation based on active mode, briefing/reminder adaptation, and integration testing. This domain controls how assertive and verbose the assistant is at any given time.

## Requirements

### R1: State Management Contract
**Description:** A persistent state object tracks the current work-style mode with transition rules.
**Acceptance Criteria:**
- [x] State has three modes: `standard` (default), `focus`, `urgent`
- [x] State persists across bot restarts (stored in Redis or file-backed config)
- [x] Mode transitions are explicit — mode never changes without user action or auto-expiry
- [x] Urgent mode has a configurable auto-expiry (default 2 hours)
- [x] Mode state is queryable by all other domains via a shared interface
**Dependencies:** none

### R2: Telegram Bot Interface
**Description:** User can switch modes via natural language or slash commands through Telegram.
**Acceptance Criteria:**
- [x] `/urgent` activates urgent mode with auto-expiry timer
- [x] `/focus` activates focus mode (minimal interruptions)
- [x] `/normal` returns to standard mode
- [x] Natural language like "I'm in a rush" or "focus time" also triggers appropriate mode
- [x] Mode activation returns terse confirmation with current state and expiry (if applicable)
- [x] User can query current mode with `/mode` or "what mode am I in"
**Dependencies:** R1

### R3: AI Prompt Augmentation
**Description:** The active work-style mode augments AI prompts to adjust response tone, length, and assertiveness.
**Acceptance Criteria:**
- [x] Standard mode: balanced tone, normal verbosity, suggestions framed as options
- [x] Focus mode: minimal interruptions, shorter responses, only surface critical items
- [x] Urgent mode: direct and assertive tone, shortest possible responses, action-oriented, no pleasantries
- [x] Urgent mode does NOT mutate TickTick state unless the user explicitly asks for a task operation
- [x] Urgent mode is not the default tone — it is temporary and reverts automatically
**Dependencies:** R1

### R4: Briefing and Reminder Adaptation
**Description:** Briefings and reminders adapt to the current work-style state.
**Acceptance Criteria:**
- [x] In urgent mode: daily briefing is reduced to top 1-2 items with no elaboration
- [x] In focus mode: scheduled briefings are suppressed; only available via manual command
- [x] In standard mode: full briefing as defined in cavekit-briefings
- [x] Scheduled reminders respect focus mode suppression
- [x] End-of-day reflection adapts verbosity to current mode
**Dependencies:** R1, cavekit-briefings R13

### R5: Assertiveness Boundaries
**Description:** Even in urgent mode, the assistant maintains trust boundaries.
**Acceptance Criteria:**
- [x] Assertiveness is evidence-based: system can be direct only when evidence justifies it
- [x] Urgent mode does not override clarification requirements for ambiguous task mutations
- [x] Urgent mode user-facing copy remains non-judgmental
- [x] The system never invents urgency — it reflects user-invoked urgency only
**Dependencies:** R3

### R6: Weak Inference Protection
**Description:** All work-style modes protect against presenting weak inference as fact.
**Acceptance Criteria:**
- [x] In all modes, weak behavioral or priority inference is never presented as fact
- [x] System asks, labels uncertainty, or stays quiet when confidence is low
- [x] Urgent mode does not lower the confidence threshold for behavioral claims
**Dependencies:** R3

### R7: Intervention Escalation Rules
**Description:** The system's intervention behavior follows a graduated approach tied to evidence strength.
**Acceptance Criteria:**
- [x] Silent signals first (deprioritize item without comment)
- [x] Direct call-outs only when repeated evidence justifies them
- [x] Strict commands only in user-invoked urgent mode
- [x] Ignored guidance causes adaptation or backing off, not louder nagging
- [x] System adapts to user's engagement pattern over time
**Dependencies:** R1, R6

### R8: Mode Transition Edge Cases
**Description:** Edge cases in mode transitions are handled gracefully.
**Acceptance Criteria:**
- [x] If user activates urgent mode while already in urgent mode, timer resets
- [x] If urgent mode expires during an active conversation, system silently transitions back without interrupting
- [x] If bot restarts, mode state is restored from persistent storage
- [x] Mixed signals ("I'm in a rush but let's plan carefully") default to standard mode with a clarification
**Dependencies:** R1, R2

### R9: Privacy in Mode Context
**Description:** Work-style mode itself is not treated as behavioral data for memory purposes.
**Acceptance Criteria:**
- [x] Mode activation/deactivation is logged for debugging but not stored as behavioral memory
- [x] Mode history is operational telemetry, not a behavioral signal
**Dependencies:** cavekit-behavioral-memory R1

### R10: Response Verbosity Calibration
**Description:** All user-facing surfaces respect the work-style verbosity setting.
**Acceptance Criteria:**
- [x] Task creation confirmations shorten in urgent mode
- [x] Clarification questions compress in urgent mode (but still ask when needed)
- [x] Error messages stay clear regardless of mode
- [x] Summary surfaces adjust per cavekit-briefings R13
**Dependencies:** R3

### R11: Focus Mode Behavior
**Description:** Focus mode reduces interruptions while maintaining safety.
**Acceptance Criteria:**
- [x] Scheduled notifications are suppressed in focus mode
- [x] User-initiated requests are still answered normally
- [x] Critical alerts (if any) still surface in focus mode
- [x] Focus mode has optional auto-expiry (default off — user must manually deactivate)
**Dependencies:** R1, R2

### R12: Urgent Mode Content Rules
**Description:** Urgent mode changes presentation but not substance.
**Acceptance Criteria:**
- [x] Urgent mode does not skip validation or safety checks
- [x] Urgent mode does not auto-proceed on ambiguous mutations
- [x] Urgent mode does not present less-confident information as more confident
- [x] Urgent mode strips only formatting niceties, not substantive content
**Dependencies:** R3, R5

### R13: Integration Testing
**Description:** Mode switching and its effects on all surfaces are tested end-to-end.
**Acceptance Criteria:**
- [x] Test: switch to urgent mode → verify briefing shortens
- [x] Test: switch to focus mode → verify scheduled notifications suppress
- [x] Test: urgent mode expiry → verify auto-return to standard
- [x] Test: mode persistence across restart
- [x] Test: task creation confirmation adapts to each mode
**Dependencies:** R1 through R12

## Out of Scope

- User-defined custom modes beyond the three preset modes
- Client-side mode indicators (no UI beyond Telegram)
- Team-level mode synchronization
- Automatic mode detection from user behavior (modes are user-invoked only)

## Cross-References

- See also: cavekit-task-pipeline.md (response verbosity)
- See also: cavekit-briefings.md (summary adaptation by mode)
- See also: cavekit-behavioral-memory.md (mode is operational, not behavioral)
- See also: cavekit-prioritization.md (urgent mode may affect ranking presentation)

## Validation Action Items — 2026-04-19

- [x] Audit R1 (State Management Contract): all 5 ACs implemented. Three-mode enum (`MODE_STANDARD`, `MODE_FOCUS`, `MODE_URGENT`) in `services/store.js`, explicit transitions via `setWorkStyleMode()`, configurable auto-expiry for urgent mode (default 2h via `DEFAULT_URGENT_EXPIRY_MS`), no legacy urgent-mode getters/setters remain, Redis and file persistence both supported.
- [x] Audit R2 (Telegram Bot Interface): `/urgent`, `/focus`, `/normal`, `/mode`, and natural-language mode triggers now route through the unified work-style mode contract in `bot/commands.js` + `services/intent-extraction.js`.
- [x] Audit R3 (AI Prompt Augmentation): `services/gemini.js` now emits explicit standard/focus/urgent prompt notes via `buildWorkStylePromptNote()`, including urgent-mode tone limits and non-mutation guardrails.
- [x] Audit R4 (Briefing and Reminder Adaptation): urgent briefings render only the top 1-2 priorities without elaboration, focus mode suppresses scheduled daily/weekly briefings in `services/scheduler.js`, standard mode keeps the full briefing surface, and end-of-day reflections now shorten by mode in `services/summary-surfaces/summary-formatter.js`.
- [x] Audit R5 (Assertiveness Boundaries): urgent-mode prompt copy is now explicitly evidence-based, non-judgmental, clarification-preserving, and limited to user-invoked urgency only; ambiguous mutation tests still return clarification while urgent mode is active.
- [x] Audit R6 (Weak Inference Protection): prioritization now labels degraded/weak recommendations explicitly, work-style prompt notes instruct the model to label uncertainty or stay quiet when confidence is low, and urgent mode keeps the same strong inference threshold instead of upgrading weak behavioral claims.
- [x] Audit R7 (Intervention Escalation Rules): engagement adaptation now stays silent on isolated ignored guidance, surfaces observational notices only after repeated evidence, uses stricter wording only in urgent mode, and backs off instead of escalating when ignored guidance persists.
- [x] Audit R8 (Mode Transition Edge Cases): re-applying urgent mode rewrites the expiry timestamp, expired urgent sessions silently fall back to standard on read, persistent storage restores mode state after restart, and mixed urgent/planning signals now default to standard mode with clarification.
- [x] Audit R9 (Privacy in Mode Context): work-style transitions now emit explicit operational telemetry logs, no mode-history store was added, and behavioral signal classification ignores any mode metadata instead of treating it as memory-worthy data.
- [x] Audit R10 (Response Verbosity Calibration): pipeline confirmations and clarification prompts now compress in urgent mode, command handlers pass current work-style mode into freeform/scan/review pipeline calls, failure copy remains equally clear across modes, and weekly summaries now shorten in urgent mode to match cavekit-briefings R13.
- [x] Audit R11 (Focus Mode Behavior): scheduler now suppresses non-critical scheduled notifications in focus mode while still allowing critical alerts, manual briefing requests still answer normally in focus mode, and focus mode keeps manual deactivation by default while supporting optional explicit expiry.
- [x] Audit R12 (Urgent Mode Content Rules): urgent-mode prompt notes now explicitly preserve validation/safety checks and substantive content, ambiguous mutations still return clarification instead of auto-proceeding, weak-confidence guidance remains labeled via R6 rules, and urgent weekly formatting trims only carry-forward/notices while preserving core progress, focus, and watchout content.
- [x] Audit R13 (Integration Testing): regression and lightweight suites now cover urgent briefing shortening, focus-mode scheduled suppression, urgent expiry back to standard, fresh-import persistence, and task confirmation adaptation by mode end-to-end.
- [x] Validation traceability: command/scheduler mode behavior coverage is explicitly tracked in `tests/regression.work-style-commands-scheduler.test.js`.

## Changelog
- 2026-04-20: R13 completed — end-to-end tests now cover mode switching, suppression, expiry, persistence, and confirmation adaptation.
- 2026-04-20: R12 completed — urgent mode now explicitly preserves safety checks, ambiguity handling, confidence limits, and substantive weekly content while trimming niceties.
- 2026-04-20: R11 completed — focus mode now suppresses non-critical scheduled notifications, preserves manual request behavior, and keeps optional expiry default-off.
- 2026-04-20: R10 completed — urgent confirmations/clarifications compress, error copy stays clear, and weekly summaries now shorten in urgent mode.
- 2026-04-19: R9 completed — work-style transitions log as operational telemetry only, not behavioral memory or signals.
- 2026-04-19: R8 completed — urgent timer resets on reactivation, expiry stays silent, persisted state survives restarts, and mixed signals clarify back to standard.
- 2026-04-19: R7 completed — engagement notices now graduate from silence to repeated-evidence call-outs, then back off instead of escalating.
- 2026-04-19: R6 completed — weak inference is labeled explicitly, low-confidence urgency stays tentative, and urgent mode no longer lowers behavioral inference thresholds.
- 2026-04-19: R5 completed — evidence-based urgent assertiveness, non-judgmental copy, and clarification preserved for ambiguous mutations.
- 2026-04-19: R4 completed — urgent briefing reduction, focus-mode scheduler suppression, mode-aware daily-close verbosity.
- 2026-04-19: R2 completed — Telegram mode commands, natural-language mode triggers, terse mode status/expiry replies, legacy urgent getters/setters removed.
- 2026-04-19: R3 completed — mode-specific AI prompt augmentation for standard, focus, and urgent states.
- 2026-04-19: R1 completed — three-mode state contract, explicit transitions, configurable urgent auto-expiry, shared getter/setter interface.
- 2026-04-18: Migrated from kitty-specs 008-work-style-and-urgent-mode
