---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-19T02:00:00Z"
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
- [ ] `/urgent` activates urgent mode with auto-expiry timer
- [ ] `/focus` activates focus mode (minimal interruptions)
- [ ] `/normal` returns to standard mode
- [ ] Natural language like "I'm in a rush" or "focus time" also triggers appropriate mode
- [ ] Mode activation returns terse confirmation with current state and expiry (if applicable)
- [ ] User can query current mode with `/mode` or "what mode am I in"
**Dependencies:** R1

### R3: AI Prompt Augmentation
**Description:** The active work-style mode augments AI prompts to adjust response tone, length, and assertiveness.
**Acceptance Criteria:**
- [ ] Standard mode: balanced tone, normal verbosity, suggestions framed as options
- [ ] Focus mode: minimal interruptions, shorter responses, only surface critical items
- [ ] Urgent mode: direct and assertive tone, shortest possible responses, action-oriented, no pleasantries
- [ ] Urgent mode does NOT mutate TickTick state unless the user explicitly asks for a task operation
- [ ] Urgent mode is not the default tone — it is temporary and reverts automatically
**Dependencies:** R1

### R4: Briefing and Reminder Adaptation
**Description:** Briefings and reminders adapt to the current work-style state.
**Acceptance Criteria:**
- [ ] In urgent mode: daily briefing is reduced to top 1-2 items with no elaboration
- [ ] In focus mode: scheduled briefings are suppressed; only available via manual command
- [ ] In standard mode: full briefing as defined in cavekit-briefings
- [ ] Scheduled reminders respect focus mode suppression
- [ ] End-of-day reflection adapts verbosity to current mode
**Dependencies:** R1, cavekit-briefings R13

### R5: Assertiveness Boundaries
**Description:** Even in urgent mode, the assistant maintains trust boundaries.
**Acceptance Criteria:**
- [ ] Assertiveness is evidence-based: system can be direct only when evidence justifies it
- [ ] Urgent mode does not override clarification requirements for ambiguous task mutations
- [ ] Urgent mode user-facing copy remains non-judgmental
- [ ] The system never invents urgency — it reflects user-invoked urgency only
**Dependencies:** R3

### R6: Weak Inference Protection
**Description:** All work-style modes protect against presenting weak inference as fact.
**Acceptance Criteria:**
- [ ] In all modes, weak behavioral or priority inference is never presented as fact
- [ ] System asks, labels uncertainty, or stays quiet when confidence is low
- [ ] Urgent mode does not lower the confidence threshold for behavioral claims
**Dependencies:** R3

### R7: Intervention Escalation Rules
**Description:** The system's intervention behavior follows a graduated approach tied to evidence strength.
**Acceptance Criteria:**
- [ ] Silent signals first (deprioritize item without comment)
- [ ] Direct call-outs only when repeated evidence justifies them
- [ ] Strict commands only in user-invoked urgent mode
- [ ] Ignored guidance causes adaptation or backing off, not louder nagging
- [ ] System adapts to user's engagement pattern over time
**Dependencies:** R1, R6

### R8: Mode Transition Edge Cases
**Description:** Edge cases in mode transitions are handled gracefully.
**Acceptance Criteria:**
- [ ] If user activates urgent mode while already in urgent mode, timer resets
- [ ] If urgent mode expires during an active conversation, system silently transitions back without interrupting
- [ ] If bot restarts, mode state is restored from persistent storage
- [ ] Mixed signals ("I'm in a rush but let's plan carefully") default to standard mode with a clarification
**Dependencies:** R1, R2

### R9: Privacy in Mode Context
**Description:** Work-style mode itself is not treated as behavioral data for memory purposes.
**Acceptance Criteria:**
- [ ] Mode activation/deactivation is logged for debugging but not stored as behavioral memory
- [ ] Mode history is operational telemetry, not a behavioral signal
**Dependencies:** cavekit-behavioral-memory R1

### R10: Response Verbosity Calibration
**Description:** All user-facing surfaces respect the work-style verbosity setting.
**Acceptance Criteria:**
- [ ] Task creation confirmations shorten in urgent mode
- [ ] Clarification questions compress in urgent mode (but still ask when needed)
- [ ] Error messages stay clear regardless of mode
- [ ] Summary surfaces adjust per cavekit-briefings R13
**Dependencies:** R3

### R11: Focus Mode Behavior
**Description:** Focus mode reduces interruptions while maintaining safety.
**Acceptance Criteria:**
- [ ] Scheduled notifications are suppressed in focus mode
- [ ] User-initiated requests are still answered normally
- [ ] Critical alerts (if any) still surface in focus mode
- [ ] Focus mode has optional auto-expiry (default off — user must manually deactivate)
**Dependencies:** R1, R2

### R12: Urgent Mode Content Rules
**Description:** Urgent mode changes presentation but not substance.
**Acceptance Criteria:**
- [ ] Urgent mode does not skip validation or safety checks
- [ ] Urgent mode does not auto-proceed on ambiguous mutations
- [ ] Urgent mode does not present less-confident information as more confident
- [ ] Urgent mode strips only formatting niceties, not substantive content
**Dependencies:** R3, R5

### R13: Integration Testing
**Description:** Mode switching and its effects on all surfaces are tested end-to-end.
**Acceptance Criteria:**
- [ ] Test: switch to urgent mode → verify briefing shortens
- [ ] Test: switch to focus mode → verify scheduled notifications suppress
- [ ] Test: urgent mode expiry → verify auto-return to standard
- [ ] Test: mode persistence across restart
- [ ] Test: task creation confirmation adapts to each mode
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

- [x] Audit R1 (State Management Contract): all 5 ACs implemented. Three-mode enum (`MODE_STANDARD`, `MODE_FOCUS`, `MODE_URGENT`) in `services/store.js`, explicit transitions via `setWorkStyleMode()`, configurable auto-expiry for urgent mode (default 2h via `DEFAULT_URGENT_EXPIRY_MS`), backward-compatible `getUrgentMode`/`setUrgentMode` delegates to new system, Redis and file persistence both supported.
- [x] Downstream dependencies R2-R13 now unblocked by R1 completion.

## Changelog
- 2026-04-19: R1 completed — three-mode state contract, explicit transitions, configurable urgent auto-expiry, shared getter/setter interface.
- 2026-04-18: Migrated from kitty-specs 008-work-style-and-urgent-mode
