---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-18T22:30:00Z"
source_specs: ["009-behavioral-signals-and-memory"]
complexity: "complex"
---

# Cavekit: Behavioral Memory

## Scope

Signal classification, pattern detection, privacy-bounded memory storage, retention windows, user inspection/reset controls, and integration with summary surfaces. This domain enables the assistant to notice behavioral patterns over time while maintaining strict privacy boundaries.

See `context/refs/product-vision.md` for the governing behavioral philosophy.

## Requirements

### R1: Signal Classifier Core
**Description:** A classifier identifies behavioral patterns from task management activity.
**Acceptance Criteria:**
- [ ] Classifier detects 8 pattern types: (1) Snooze Spiral — repeated postponement, (2) Commitment Overloader — creation far exceeding completion, (3) Stale Task Museum — long-untouched tasks, (4) Quick Win Addiction — small-task bias, (5) Vague Task Writer — non-actionable titles, (6) Deadline Daredevil — chronic last-minute execution, (7) Category Avoidance — systematic domain avoidance, (8) Planning-Without-Execution — elaborate planning or overload without follow-through (sub-types: Type A Planning as Avoidance, Type B Ambitious Overload)
- [ ] Each detected pattern has a confidence score
- [ ] Classifier operates on derived signals only — never raw message text
**Dependencies:** none

### R2: Redis Storage Layer
**Description:** Behavioral signals are stored in Redis with time-bounded retention.
**Acceptance Criteria:**
- [ ] Signals are stored with: timestamp, pattern type, confidence, derived metadata
- [ ] Storage is tenant-scoped from day one (even with single user)
- [ ] Storage interface supports write, read, delete, and time-range queries
- [ ] Storage does NOT accept raw user messages, raw task titles, or free-form text
**Dependencies:** R1

### R3: Pattern Detection Engine
**Description:** Engine aggregates signals over time to detect sustained behavioral patterns.
**Acceptance Criteria:**
- [ ] Patterns are detected from signal aggregates, not single events
- [ ] Pattern 8 Type A detection: 3+ plans with detailed breakdowns (>5 sub-steps or >200 characters) and 0% completion within 7 days
- [ ] Pattern 8 Type B detection: 10+ tasks created in a single day/week, spanning 3+ projects/categories, with <30% completion rate
- [ ] Snooze Spiral detection: same task postponed 3+ times
- [ ] Detected patterns have confidence levels: low, standard, high
- [ ] Only standard- or high-confidence patterns are eligible for surfacing
**Dependencies:** R1, R2

### R4: Privacy Tier Manager
**Description:** Strict privacy boundaries govern what is stored and surfaced.
**Acceptance Criteria:**
- [ ] Long-term memory stores ONLY: derived signals, pattern types, confidence scores, and the explicitly enumerated minimal semantic metadata
- [ ] Allowed semantic metadata: planning-vs-execution label, wording-only edit vs scope change, decomposition change, domain/theme tags
- [ ] Long-term memory MUST NOT store: raw user messages, raw task titles, free-form conversational archives, open-ended semantic summaries
- [ ] Operational logs and behavioral memory are distinct concerns — debugging does not expand the privacy boundary
- [ ] Behavioral memory model is tenant-scoped from day one
**Dependencies:** R2

### R5: Retention Windows
**Description:** Behavioral signals have a 30-day default retention window.
**Acceptance Criteria:**
- [ ] Signals are retained for 30 days by default, then excluded from future summaries
- [ ] 30-day window is the default short-loop learning horizon, not a justification for deeper archival
- [ ] Expired signals are not deleted immediately but are excluded from all query results and patterns
- [ ] Retention window is configurable
**Dependencies:** R2

### R6: Summary Surface Integration
**Description:** Behavioral patterns are consumable by briefing and reflection surfaces.
**Acceptance Criteria:**
- [ ] Briefing surfaces can query active patterns with confidence >= standard
- [ ] Weekly summary can include observational behavioral callouts
- [ ] End-of-day reflection can reference today's behavioral signals
- [ ] If signal data is missing, stale, corrupt, or reset, surfaces fail open — omit the callout, don't crash
- [ ] Low-confidence interpretations are OMITTED from summaries rather than surfaced speculatively
**Dependencies:** R3, cavekit-briefings R9

### R7: Behavioral Reflection Language
**Description:** All behavioral reflections use observational language — no diagnostic, moral, or character-based claims.
**Acceptance Criteria:**
- [ ] System says "You've postponed this task 3 times" not "You're procrastinating"
- [ ] System says "Some tasks this week are vague" not "You have a focus problem"
- [ ] If same behavior could be legitimate replanning vs avoidance, system uses observational language and omits low-confidence interpretations
**Dependencies:** R1, R6

### R8: User Inspection Controls
**Description:** Users can view a plain-language summary of retained behavioral memory.
**Acceptance Criteria:**
- [ ] User can request a memory summary via command (e.g., /memory or "what do you remember about me")
- [ ] Summary is plain-language and understandable without expert knowledge of internal scoring
- [ ] Summary shows: active patterns, retention window, last signal date
**Dependencies:** R2, R4

### R9: User Reset Controls
**Description:** Users can reset retained behavioral memory with deterministic deletion.
**Acceptance Criteria:**
- [ ] User can request deletion via command (e.g., /forget or "clear my memory")
- [ ] Deletion is deterministic — all retained signals within the window are cleared
- [ ] After reset, no previously stored pattern influences future summaries
- [ ] If user requests deletion shortly after a pattern was surfaced, system clears retained memory and stops reusing it
**Dependencies:** R2, R8

### R10: Non-Blocking Architecture
**Description:** The behavioral-signal layer is non-blocking; task capture and mutation flows continue working even if this layer is unavailable.
**Acceptance Criteria:**
- [ ] Pipeline operates normally when behavioral layer is down
- [ ] Signal write failures are logged but do not surface to the user
- [ ] No pipeline operation waits synchronously for behavioral signal writes
**Dependencies:** none

### R11: Recomputable Reflections
**Description:** Reflection surfaces can recompute useful output from live task state plus retained aggregates rather than requiring a permanent archive.
**Acceptance Criteria:**
- [ ] Daily and weekly reflections can reconstruct context from current TickTick state + 30-day aggregates
- [ ] No permanent behavioral archive is needed beyond the retention window
**Dependencies:** R5, R6

### R12: Passive-by-Default Anti-Procrastination
**Description:** Anti-procrastination support remains passive by default in v1.
**Acceptance Criteria:**
- [ ] System captures signals but does not proactively intervene in v1 unless surfacing rules allow it
- [ ] Intervention graduation follows cavekit-work-style R7: silent signals first, direct call-outs only with repeated evidence
- [ ] Pattern surfacing delegates to weak-inference rules in cavekit-work-style
**Dependencies:** R1, cavekit-work-style R7

### R13: Over-Planning Detection
**Description:** System detects over-planning as a specific behavioral signal.
**Acceptance Criteria:**
- [ ] Planning-Without-Execution signal is captured without surfacing language
- [ ] Pattern surfacing respects cavekit-work-style rules for weak inference
- [ ] System balances planning with execution guidance rather than prohibiting planning entirely
**Dependencies:** R1, R3

### R14: Testing and Privacy Audit
**Description:** Comprehensive testing ensures privacy boundaries are enforced and patterns work correctly.
**Acceptance Criteria:**
- [ ] Test: signal storage contains only allowed fields — no raw text leaks
- [ ] Test: 31-day-old signals are excluded from query results
- [ ] Test: user reset clears all signals within retention window
- [ ] Test: pattern detection produces expected patterns for known input sequences
- [ ] Test: missing behavioral layer does not block pipeline operations
- [ ] Test: low-confidence patterns are omitted from surfacing
**Dependencies:** R1 through R13

### R15: Edge Case Handling
**Description:** Behavioral memory edge cases are handled cleanly.
**Acceptance Criteria:**
- [ ] If the same behavior could reflect legitimate replanning rather than avoidance, observational language is used and low-confidence interpretations are omitted
- [ ] If user requests deletion shortly after a pattern was surfaced, system clears memory deterministically and stops reusing it
- [ ] If signal data is corrupt or in unexpected format, system fails open and omits behavioral callouts
**Dependencies:** R3, R4

## Out of Scope

- Deep behavioral profiling beyond the 8 defined patterns
- Cross-user behavioral comparison
- ML-based behavioral prediction
- Permanent behavioral archive beyond the retention window
- Rich debugging audit context that would expand the privacy boundary

## Cross-References

- See also: cavekit-briefings.md (consumes behavioral patterns for callouts)
- See also: cavekit-work-style.md (intervention graduation rules, weak inference protection)
- See also: cavekit-prioritization.md (optional behavioral signal input for ranking)
- See also: cavekit-task-pipeline.md (pipeline logging boundary)

## Changelog
- 2026-04-18: Migrated from kitty-specs 009-behavioral-signals-and-memory
