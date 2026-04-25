---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-24T11:15:00Z"
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
- [x] Classifier detects 8 pattern types: (1) Snooze Spiral — repeated postponement, (2) Commitment Overloader — creation far exceeding completion, (3) Stale Task Museum — long-untouched tasks, (4) Quick Win Addiction — small-task bias, (5) Vague Task Writer — non-actionable titles, (6) Deadline Daredevil — chronic last-minute execution, (7) Category Avoidance — systematic domain avoidance, (8) Planning-Without-Execution — elaborate planning or overload without follow-through (sub-types: Type A Planning as Avoidance, Type B Ambitious Overload)
- [x] Each detected pattern has a confidence score
- [x] Classifier operates on derived signals only — never raw message text
**Dependencies:** none

### R2: Redis Storage Layer
**Description:** Behavioral signals are stored in Redis with time-bounded retention.
**Acceptance Criteria:**
- [x] Signals are stored with: timestamp, pattern type, confidence, derived metadata
- [x] Storage is tenant-scoped from day one (even with single user)
- [x] Storage interface supports write, read, delete, and time-range queries
- [x] Storage does NOT accept raw user messages, raw task titles, or free-form text
**Dependencies:** R1

### R3: Pattern Detection Engine
**Description:** Engine aggregates signals over time to detect sustained behavioral patterns.
**Acceptance Criteria:**
- [x] Patterns are detected from signal aggregates, not single events
- [x] Pattern 8 Type A detection: 3+ plans with detailed breakdowns (>5 sub-steps or >200 characters) and 0% completion within 7 days
- [x] Pattern 8 Type B detection: 10+ tasks created in a single day/week, spanning 3+ projects/categories, with <30% completion rate
- [x] Snooze Spiral detection: same task postponed 3+ times
- [x] Detected patterns have confidence levels: low, standard, high
- [x] Only standard- or high-confidence patterns are eligible for surfacing
**Dependencies:** R1, R2

### R4: Privacy Tier Manager
**Description:** Strict privacy boundaries govern what is stored and surfaced.
**Acceptance Criteria:**
- [x] Long-term memory stores ONLY: derived signals, pattern types, confidence scores, and the explicitly enumerated minimal semantic metadata
- [x] Allowed semantic metadata: planning-vs-execution label, wording-only edit vs scope change, decomposition change, domain/theme tags
- [x] Long-term memory MUST NOT store: raw user messages, raw task titles, free-form conversational archives, open-ended semantic summaries
- [x] Operational logs and behavioral memory are distinct concerns — debugging does not expand the privacy boundary
- [x] Behavioral memory model is tenant-scoped from day one
**Dependencies:** R2

### R5: Retention Windows
**Description:** Behavioral signals have a 30-day default retention window.
**Acceptance Criteria:**
- [x] Signals are retained for 30 days by default, then excluded from future summaries
- [x] 30-day window is the default short-loop learning horizon, not a justification for deeper archival
- [x] Expired signals are not deleted immediately but are excluded from all query results and patterns
- [x] Retention window is configurable
**Dependencies:** R2

### R6: Summary Surface Integration
**Description:** Behavioral patterns are consumable by briefing and reflection surfaces.
**Acceptance Criteria:**
- [x] Briefing surfaces can query active patterns with confidence >= standard
- [x] Weekly summary can include observational behavioral callouts
- [x] End-of-day reflection can reference today's behavioral signals
- [x] If signal data is missing, stale, corrupt, or reset, surfaces fail open — omit the callout, don't crash
- [x] Low-confidence interpretations are OMITTED from summaries rather than surfaced speculatively
**Dependencies:** R3, cavekit-briefings R9

### R7: Behavioral Reflection Language
**Description:** All behavioral reflections use observational language — no diagnostic, moral, or character-based claims.
**Acceptance Criteria:**
- [x] System says "You've postponed this task 3 times" not "You're procrastinating"
- [x] System says "Some tasks this week are vague" not "You have a focus problem"
- [x] If same behavior could be legitimate replanning vs avoidance, system uses observational language and omits low-confidence interpretations
**Dependencies:** R1, R6

### R8: User Inspection Controls
**Description:** Users can view a plain-language summary of retained behavioral memory.
**Acceptance Criteria:**
- [x] User can request a memory summary via command (e.g., /memory or "what do you remember about me")
- [x] Summary is plain-language and understandable without expert knowledge of internal scoring
- [x] Summary shows: active patterns, retention window, last signal date
**Dependencies:** R2, R4

### R9: User Reset Controls
**Description:** Users can reset retained behavioral memory with deterministic deletion.
**Acceptance Criteria:**
- [x] User can request deletion via command (e.g., /forget or "clear my memory")
- [x] Deletion is deterministic — all retained signals within the window are cleared
- [x] After reset, no previously stored pattern influences future summaries
- [x] If user requests deletion shortly after a pattern was surfaced, system clears retained memory and stops reusing it
**Dependencies:** R2, R8

### R10: Non-Blocking Architecture
**Description:** The behavioral-signal layer is non-blocking; task capture and mutation flows continue working even if this layer is unavailable.
**Acceptance Criteria:**
- [x] Pipeline operates normally when behavioral layer is down
- [x] Signal write failures are logged but do not surface to the user
- [x] No pipeline operation waits synchronously for behavioral signal writes
**Dependencies:** none

### R11: Recomputable Reflections
**Description:** Reflection surfaces can recompute useful output from live task state plus retained aggregates rather than requiring a permanent archive.
**Acceptance Criteria:**
- [x] Daily and weekly reflections can reconstruct context from current TickTick state + 30-day aggregates
- [x] No permanent behavioral archive is needed beyond the retention window
**Dependencies:** R5, R6

### R12: Passive-by-Default Anti-Procrastination
**Description:** Anti-procrastination support remains passive by default in v1.
**Acceptance Criteria:**
- [x] System captures signals but does not proactively intervene in v1 unless surfacing rules allow it
- [x] Intervention graduation follows cavekit-work-style R7: silent signals first, direct call-outs only with repeated evidence
- [x] Pattern surfacing delegates to weak-inference rules in cavekit-work-style
**Dependencies:** R1, cavekit-work-style R7

### R13: Over-Planning Detection
**Description:** System detects over-planning as a specific behavioral signal.
**Acceptance Criteria:**
- [x] Planning-Without-Execution signal is captured without surfacing language
- [x] Pattern surfacing respects cavekit-work-style rules for weak inference
- [x] System balances planning with execution guidance rather than prohibiting planning entirely
**Dependencies:** R1, R3

### R14: Testing and Privacy Audit
**Description:** Comprehensive testing ensures privacy boundaries are enforced and patterns work correctly.
**Acceptance Criteria:**
- [x] Test: signal storage contains only allowed fields — no raw text leaks
- [x] Test: 31-day-old signals are excluded from query results
- [x] Test: user reset clears all signals within retention window
- [x] Test: pattern detection produces expected patterns for known input sequences
- [x] Test: missing behavioral layer does not block pipeline operations
- [x] Test: low-confidence patterns are omitted from surfacing
**Dependencies:** R1 through R13

### R15: Edge Case Handling
**Description:** Behavioral memory edge cases are handled cleanly.
**Acceptance Criteria:**
- [x] If the same behavior could reflect legitimate replanning rather than avoidance, observational language is used and low-confidence interpretations are omitted
- [x] If user requests deletion shortly after a pattern was surfaced, system clears memory deterministically and stops reusing it
- [x] If signal data is corrupt or in unexpected format, system fails open and omits behavioral callouts
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

## Validation Action Items — 2026-04-19

- [x] R1 intentionally remains a Tier 0 root with `Dependencies: none`, matching the root-requirement dependency graph in `context/kits/cavekit-overview.md`.
- [x] Audit R1 (Signal Classifier Core): `services/behavioral-signals.js` now emits all 8 behavioral-memory pattern families with confidence scores using derived numeric/boolean metadata only; no raw titles or message text cross the classifier boundary.
- [x] Downstream dependencies R2-R15 now unblock from an explicitly implemented R1 root.
- [x] Audit R10 (Non-Blocking Architecture): `services/ticktick-adapter.js` routes create/update/complete/delete observation through `_observeSignals(...)`, catches classifier failures, logs them as `FAILED (non-blocking)`, and never blocks mutation completion on behavioral-signal observation.
- [x] Audit R2 (Redis Storage Layer): `services/store.js` now persists tenant-scoped behavioral signals with write/read/delete/time-range query helpers, validates timestamps/confidence/privacy boundaries, and rejects raw task text fields before storage.
- [x] Audit R3 (Pattern Detection Engine): `services/behavioral-patterns.js` now derives Snooze Spiral and Planning-Without-Execution aggregate patterns from retained signals, assigns low/standard/high confidence, and marks only standard/high confidence patterns as surfacing-eligible.
- [x] Audit R4 (Privacy Tier Manager): `services/store.js` now strips retained behavioral metadata down to minimal semantic flags (`planningSubtypeA/B`, `scopeChange`, `wordingOnlyEdit`, `decompositionChange`), forbids raw task/user text plus raw task IDs, and keeps operational logging separate from long-term behavioral memory.
- [x] Audit R5 (Retention Windows): `services/store.js` now uses a configurable 30-day default retention window for reads/queries while preserving a separate archive horizon; `services/behavioral-patterns.js` excludes expired signals from aggregate pattern output.
- [x] Audit R6 (Summary Surface Integration): `services/gemini.js` now resolves behavioral patterns for daily briefing, weekly digest, and daily-close generation; `services/summary-surfaces/briefing-summary.js`, `weekly-summary.js`, and `daily-close-summary.js` surface only fresh eligible standard/high-confidence behavioral notices via `services/summary-surfaces/behavioral-pattern-notices.js`; `tests/regression.summary-surfaces.test.js` covers daily, weekly, and daily-close callouts plus fail-open omission for stale/low-confidence/invalid data.
- [x] Audit R7 (Behavioral Reflection Language): `services/summary-surfaces/behavioral-pattern-notices.js` now phrases surfaced behavioral notices with concrete observational wording tied to counts/windows instead of diagnostic labels, `tests/regression.summary-surfaces.test.js` locks those notices against moral/character claims across surfaced patterns, and `tests/regression.behavioral-signals.test.js` covers the `GeminiAnalyzer._resolveBehavioralPatterns()` fail-open seam when signal lookup or pattern detection throws.
- [x] Audit R8 (User Inspection Controls): `bot/commands.js` now exposes `/memory`, formats a plain-language summary from retained behavioral patterns, shows the retention window and last retained signal date, omits raw task text, and `tests/regression.behavioral-signals.test.js` covers populated, empty, and fail-open command paths.
- [x] Audit R9 (User Reset Controls): `bot/commands.js` now exposes `/forget`, routes reset through deterministic `store.deleteBehavioralSignals(userId)` deletion, confirms how many retained signals were removed, and `tests/regression.behavioral-signals.test.js` verifies empty-state deletion plus that `/memory` no longer surfaces patterns after reset.
- [x] Audit R11 (Recomputable Reflections): `services/summary-surfaces/reflection-recompute.js` now derives an explicit recomputation seam from live active tasks plus retained behavioral aggregates, `weekly-summary.js` and `daily-close-summary.js` surface recomputed context when processed history is missing or sparse, and `tests/regression.summary-surfaces.test.js` covers both weekly and daily-close reconstruction paths without requiring any permanent archive.
- [x] Audit R12 (Passive-by-Default Anti-Procrastination): `services/summary-surfaces/behavioral-pattern-notices.js` now keeps behavioral surfacing passive-by-default by requiring supported fresh standard/high-confidence patterns plus repeated evidence before any callout appears, urgent mode does not lower that threshold, and `tests/regression.summary-surfaces.test.js` locks the silent-signals-first behavior.
- [x] Audit R13 (Over-Planning Detection): `services/behavioral-signals.js` continues to capture `PLANNING_WITHOUT_EXECUTION` as metadata-only signal output with no surfacing copy, while `services/summary-surfaces/behavioral-pattern-notices.js` balances planning-with-execution guidance for Type A/B patterns and `tests/regression.behavioral-signals.test.js` plus `tests/regression.summary-surfaces.test.js` cover both the signal-only boundary and surfaced over-planning guidance.
- [x] Validation traceability: behavioral-signal coverage is also tracked in `tests/regression.behavioral-signals.test.js` (classifier, storage/privacy boundaries, retention/query behavior, and pattern detection paths tied to this kit's implemented requirements).

## Changelog
- 2026-04-25: R14 and R15 completed — added regression coverage for allowed-field storage shape, 31-day query exclusion, deterministic post-surface `/forget` reset behavior, ambiguity-aware planning pattern downgrading (replanning vs avoidance), and explicit fail-open handling when pattern detection receives corrupt/unexpected signal data.
- 2026-04-24: R13 completed — planning-without-execution remains a metadata-only signal in the classifier, and surfaced over-planning guidance now stays observational, weak-inference-safe, and explicitly execution-balancing rather than anti-planning.
- 2026-04-24: R12 completed — behavioral callouts now stay passive-by-default in v1 by requiring repeated evidence before surfacing, preserving silent-signal-first behavior, and keeping urgent mode from lowering behavioral inference thresholds.
- 2026-04-23: R11 completed — weekly and daily-close reflections now recompute useful context from live active tasks plus retained 30-day behavioral aggregates when processed history is missing or sparse, without introducing any permanent behavioral archive.
- 2026-04-23: R9 completed — `/forget` now clears retained behavioral signals deterministically, confirms removal count, and ensures future memory summaries stop surfacing previously stored patterns after reset.
- 2026-04-23: R8 completed — `/memory` now surfaces a plain-language behavioral memory summary with active patterns, retention window, and last signal date while failing open when lookup is unavailable.
- 2026-04-22: R7 completed — surfaced behavioral notices now use concrete observational wording, low-confidence ambiguous patterns stay omitted, and `_resolveBehavioralPatterns()` has dedicated fail-open regression coverage when behavioral lookup or pattern detection fails.
- 2026-04-22: R6 completed — briefing, weekly, and daily-close summary surfaces now consume retained behavioral patterns read-only, omit low-confidence or stale signals, and fail open when behavioral data is missing or invalid.
- 2026-04-21: R5 completed — behavioral memory now uses a configurable 30-day default query window and excludes expired signals from queries and patterns without immediate hard deletion.
- 2026-04-21: R4 completed — retained behavioral memory now stores only minimal semantic flags plus domain tags and rejects raw text or raw task identifiers.
- 2026-04-21: R3 completed — aggregate pattern engine now detects snooze spirals and planning overload patterns with low/standard/high confidence and surfacing eligibility.
- 2026-04-21: R2 completed — behavioral signals now persist tenant-scoped with privacy validation and time-range query/delete support.
- 2026-04-20: R10 completed — behavioral signal observation is best-effort only and cannot block task mutations.
- 2026-04-20: R1 completed — classifier now emits all 8 pattern families with confidence scores using derived metadata only.
- 2026-04-18: Migrated from kitty-specs 009-behavioral-signals-and-memory
