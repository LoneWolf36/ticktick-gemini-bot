---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-23T01:45:00Z"
source_specs: ["006-briefing-weekly-modernization"]
complexity: "complex"
---

# Cavekit: Briefings

## Scope

Daily and weekly summary surfaces, end-of-day reflection, deterministic summary formatting, scheduler integration, manual command integration, and observability for summary delivery. This domain owns all time-scheduled informational surfaces the assistant delivers to the user.

See `context/refs/research-006-briefing-weekly-modernization.md` for research.
See `context/refs/data-model-006-briefing-weekly-modernization.md` for data model.
See `context/refs/summary-surfaces.openapi.yaml` for API contracts.

## Requirements

### R1: Shared Summary Surface Contracts
**Description:** All summary surfaces (daily, weekly, end-of-day) share a common contract for data retrieval, rendering, and delivery.
**Acceptance Criteria:**
- [x] A shared interface defines: data input shape, rendering output shape, delivery channel, and scheduling metadata
- [x] Daily, weekly, and end-of-day surfaces all implement this shared interface
- [x] Contract is defined in `context/refs/summary-surfaces.openapi.yaml`
**Dependencies:** none

### R2: Daily Structured Summary
**Description:** Morning briefing delivers a short, actionable daily plan focused on 1-3 tasks.
**Acceptance Criteria:**
- [x] Daily plan contains at most 3 tasks by default
- [x] Plan is realistic for user context (not aspirational overload)
- [x] Plan includes long-term-goal work when such work exists and is plausible
- [x] Morning start stays short — no multi-paragraph motivational content
- [x] Plan distinguishes important work from low-value busywork
- [x] If no tasks are due or relevant, summary says so concisely rather than inventing work
**Dependencies:** R1

### R3: Weekly Structured Summary
**Description:** Weekly summary provides a higher-level view of completed, deferred, and upcoming work with patterns.
**Acceptance Criteria:**
- [x] Weekly summary covers: completed tasks, deferred/rescheduled tasks, upcoming week preview
- [x] Summary highlights patterns (e.g., consistently deferred categories) using observational language only
- [x] Summary does not make diagnostic or character-based claims about the user
- [x] Summary stays brief and scannable
**Dependencies:** R1

### R4: Deterministic Summary Formatter
**Description:** Summary rendering is deterministic — same input data always produces same formatted output.
**Acceptance Criteria:**
- [x] Formatter produces consistent output across identical input data
- [x] Formatting follows a template rather than free-form LLM generation
- [x] User-facing copy is compact, concrete, non-judgmental, and oriented toward the next useful action
**Dependencies:** R1

### R5: Manual Command Integration
**Description:** Summaries are accessible via manual bot commands (e.g., /briefing, /weekly) in addition to scheduled delivery.
**Acceptance Criteria:**
- [x] `/briefing` command triggers the daily summary immediately
- [x] `/weekly` command triggers the weekly summary immediately
- [x] Manual invocation produces the same output as scheduled delivery for the same data
**Dependencies:** R1, R2, R3, R4

### R6: Scheduler Integration and Delivery Parity
**Description:** Summaries are scheduled for delivery at configured times via the existing scheduler.
**Acceptance Criteria:**
- [x] Daily briefing is scheduled for configured morning time
- [x] Weekly summary is scheduled for configured weekly time
- [x] Scheduled delivery uses the same rendering path as manual commands
- [x] Scheduler handles missed windows (e.g., bot was down) by delivering on next startup if within grace period
**Dependencies:** R5

### R7: End-of-Day Reflection
**Description:** End-of-day reflection surface provides brief, context-aware closure.
**Acceptance Criteria:**
- [x] Reflection stays brief — maximum 3-4 sentences
- [x] Reflection is context-aware: references what was actually done today, not generic platitudes
- [x] Reflection is non-punitive: describes what happened, does not judge
- [x] If behavioral signals are available (from cavekit-behavioral-memory), reflection may include one observational callout
- [x] If no tasks were completed or attempted, reflection says so briefly and does not invent positive spin
**Dependencies:** R1, R4

### R8: Summary Observability
**Description:** Summary generation and delivery are logged for debugging and regression.
**Acceptance Criteria:**
- [x] Logs capture: summary type, trigger (manual/scheduled), input data shape, rendering time, delivery status
- [x] Failed deliveries are logged with reason (channel unavailable, rendering error)
- [x] Telemetry does not persist raw task titles in long-term storage
**Dependencies:** none

### R9: Behavioral Signal Integration (Read-Only)
**Description:** Summary surfaces can consume behavioral signals from cavekit-behavioral-memory for pattern callouts.
**Acceptance Criteria:**
- [x] Daily and weekly summaries can read behavioral pattern data if available
- [x] Missing or stale signal data causes graceful omission — summary renders without callout rather than failing
- [x] Low-confidence behavioral patterns are omitted from summaries
**Dependencies:** cavekit-behavioral-memory R1

### R10: Summary Prioritization
**Description:** Daily summary task selection respects the prioritization ranking from cavekit-prioritization.
**Acceptance Criteria:**
- [x] Tasks are ordered by leverage/priority ranking when available
- [x] If ranking is unavailable, summary falls back to due-date ordering
**Dependencies:** cavekit-prioritization R1

### R11: Ignored Guidance Adaptation
**Description:** If user consistently ignores briefing suggestions, the system adapts rather than escalating.
**Acceptance Criteria:**
- [x] Ignored guidance causes adaptation or backing off, not louder nagging
- [x] System does not add urgency markers to previously ignored items
**Dependencies:** none

### R12: Summary Delivery Edge Cases
**Description:** Edge cases in summary delivery are handled gracefully.
**Acceptance Criteria:**
- [ ] If TickTick data fetch fails, summary reports the fetch failure and delivers what it can
- [ ] If user has zero tasks, summary says so concisely
- [ ] If multiple summaries queue (e.g., daily + weekly on same morning), they are delivered as separate messages
- [ ] Summary does not duplicate content between daily and weekly when delivered on the same day
**Dependencies:** R6

### R13: Work-Style Awareness
**Description:** Summary tone and verbosity respect the current work-style setting.
**Acceptance Criteria:**
- [x] In urgent mode, summaries are even shorter and more direct
- [x] In standard mode, summaries follow the default compact style
**Dependencies:** cavekit-work-style R1

### R14: Summary Content Quality
**Description:** All summary surfaces maintain the product vision's content quality standards.
**Acceptance Criteria:**
- [ ] Summaries prefer fewer correct recommendations over many plausible ones
- [ ] Summaries do not optimize for motion, task count, or planning volume
- [ ] Summaries do not present weak inference as certainty
**Dependencies:** none

### R15: Regression Stabilization
**Description:** Summary surfaces have dedicated regression tests.
**Acceptance Criteria:**
- [ ] Daily summary produces deterministic output for fixed input data
- [ ] Weekly summary handles empty-week, full-week, and partial-week scenarios
- [ ] End-of-day reflection handles zero-activity and high-activity days
- [ ] Scheduler missed-window recovery is tested
**Dependencies:** R6, R7

## Out of Scope

- User-configurable summary templates
- Rich media in summaries (charts, graphs)
- Cross-user summary comparison
- Summary analytics dashboard

## Cross-References

- See also: cavekit-task-pipeline.md (task data source for summaries)
- See also: cavekit-prioritization.md (ranking informs summary task selection)
- See also: cavekit-behavioral-memory.md (behavioral signals for pattern callouts)
- See also: cavekit-work-style.md (tone and verbosity)

## Validation Action Items — 2026-04-20

- [x] Audit R1 (Shared Summary Surface Contracts): composeBriefingSummary, composeWeeklySummary, and composeDailyCloseSummary all share the same context/output contract, and `context/refs/summary-surfaces.openapi.yaml` now defines briefing, weekly, and daily-close request/response shapes with delivery channel and scheduling metadata.
- [x] Audit R2 (Daily Structured Summary): daily briefing now caps priorities at 3, preserves plausible goal-aligned work when ranking provides it, keeps formatting terse, and returns a concise no-relevant-tasks message instead of inventing work.
- [x] Audit R3 (Weekly Structured Summary): weekly summaries now surface completed work, deferred/rescheduled carry-forward items, and upcoming focus together, while keeping watchouts and notices observational rather than diagnostic.
- [x] Audit R4 (Deterministic Summary Formatter): daily-close rendering now uses explicit deterministic templates, repeated formatting of identical input returns identical output, and reflection copy stays compact, concrete, non-judgmental, and restart-oriented.
- [x] Audit R5 (Manual Command Integration): `bot/commands.js` exposes `/briefing` and `/weekly`, and regression tests verify manual vs scheduler parity for `generateDailyBriefingSummary(...)` and `generateWeeklyDigestSummary(...)` given the same snapshot.
- [x] Audit R6 (Scheduler Integration and Delivery Parity): `services/scheduler.js` schedules daily and weekly summary jobs through the same `generateDailyBriefingSummary(...)` / `generateWeeklyDigestSummary(...)` rendering path used by manual commands, now attaches scheduler metadata to those requests, and `tests/regression.scheduler-grace-window.test.js` covers startup grace-window catch-up, duplicate suppression, and scheduled-context parity.
- [x] Audit R7 (End-of-Day Reflection): `composeDailyCloseSummary(...)` builds short, factual, non-punitive reflection copy from same-day processed history and open-task state, including sparse-day and irregular-use fail-open behavior, and `bot/commands.js` wires `/daily_close` as the manual command entrypoint for that same surface.
- [x] Audit R8 (Summary Observability): `services/summary-surfaces/index.js` now logs summary kind, trigger, source-count input shape, scheduling metadata, render time, delivery status, and failure reason through `buildSummaryLogPayload(...)` / `logSummarySurfaceEvent(...)` while emitting only `summaryShape` metadata instead of raw summary content; `tests/regression.execution-prioritization.test.js` and `tests/regression.work-style-commands-scheduler.test.js` cover the normalized diagnostics payload and scheduler delivery metadata.
- [x] Audit R9 (Behavioral Signal Integration): `services/gemini.js` resolves behavioral patterns read-only, `services/summary-surfaces/index.js` passes them into briefing and weekly surfaces, `services/summary-surfaces/behavioral-pattern-notices.js` omits stale or low-confidence patterns, and `tests/regression.summary-surfaces.test.js` covers both surfaced and gracefully omitted callouts.
- [x] Audit R10 (Summary Prioritization): `services/gemini.js` ranks active tasks before composing the briefing surface, `services/summary-surfaces/briefing-summary.js` consumes ranked tasks when available, and `tests/regression.summary-surfaces.test.js` covers both ranking-backed task selection and due-date fallback when ranking is unavailable.
- [x] Audit R11 (Ignored Guidance Adaptation): `services/summary-surfaces/intervention-profile.js` derives repeated-ignore/backoff profiles from processed-history signals, summary surfaces consume those notices, and `tests/regression.adapter-execution-reorg.test.js` covers both repeated-ignore callouts and daily-close backoff behavior without escalating urgency.
- [x] Audit R13 (Work-Style Awareness): `formatSummary(...)` shortens briefing, weekly, and daily-close outputs in urgent mode while preserving the standard compact default style.
- [ ] Keep R12, R14, and R15 unchecked pending edge-case and regression evidence.

## Changelog
- 2026-04-23: R8 completed — summary-surface telemetry now records type, trigger, input shape, render time, and delivery status with explicit failure reasons while omitting raw summary/task content from logged payloads.
- 2026-04-23: R10 completed — briefing task selection now explicitly consumes ranking output when available and falls back to due-date ordering when ranking is unavailable, with direct regression evidence.
- 2026-04-23: R6 completed — scheduled daily and weekly summaries now carry scheduler metadata through the shared rendering path, and startup grace-window catch-up is covered by dedicated scheduler regression tests.
- 2026-04-22: R11 completed — repeated ignored guidance now triggers smaller-step or backoff messaging instead of escalating urgency, with regression coverage across weekly and daily-close summary surfaces.
- 2026-04-22: R9 completed — briefing and weekly summary surfaces now consume behavioral-memory patterns read-only, while stale or low-confidence patterns are omitted gracefully.
- 2026-04-22: Clarified ownership — `/daily_close` in `bot/commands.js` is the manual command surface for Briefings R7, while `/start` remains an operational bootstrap surface.
- 2026-04-20: R5, R7, and R13 completed — manual summary commands, end-of-day reflection behavior, and work-style-aware formatting now have direct code and regression evidence.
- 2026-04-20: R4 completed — deterministic daily-close formatting is now explicitly tested and reflection copy stays compact, concrete, and non-judgmental.
- 2026-04-20: R3 completed — weekly summary now preserves completed work, deferred or rescheduled carry-forward, observational pattern notes, and concise scannability.
- 2026-04-20: R2 completed — daily briefing now caps to 3 tasks, preserves plausible goal work, filters busywork from the default shortlist, and stays concise when nothing relevant is active.
- 2026-04-20: R1 completed — shared summary contract now explicitly covers all three surfaces, delivery channel, and scheduling metadata.
- 2026-04-18: Migrated from kitty-specs 006-briefing-weekly-modernization
