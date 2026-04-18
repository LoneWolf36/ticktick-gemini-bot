---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-18T22:30:00Z"
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
- [ ] A shared interface defines: data input shape, rendering output shape, delivery channel, and scheduling metadata
- [ ] Daily, weekly, and end-of-day surfaces all implement this shared interface
- [ ] Contract is defined in `context/refs/summary-surfaces.openapi.yaml`
**Dependencies:** none

### R2: Daily Structured Summary
**Description:** Morning briefing delivers a short, actionable daily plan focused on 1-3 tasks.
**Acceptance Criteria:**
- [ ] Daily plan contains at most 3 tasks by default
- [ ] Plan is realistic for user context (not aspirational overload)
- [ ] Plan includes long-term-goal work when such work exists and is plausible
- [ ] Morning start stays short — no multi-paragraph motivational content
- [ ] Plan distinguishes important work from low-value busywork
- [ ] If no tasks are due or relevant, summary says so concisely rather than inventing work
**Dependencies:** R1

### R3: Weekly Structured Summary
**Description:** Weekly summary provides a higher-level view of completed, deferred, and upcoming work with patterns.
**Acceptance Criteria:**
- [ ] Weekly summary covers: completed tasks, deferred/rescheduled tasks, upcoming week preview
- [ ] Summary highlights patterns (e.g., consistently deferred categories) using observational language only
- [ ] Summary does not make diagnostic or character-based claims about the user
- [ ] Summary stays brief and scannable
**Dependencies:** R1

### R4: Deterministic Summary Formatter
**Description:** Summary rendering is deterministic — same input data always produces same formatted output.
**Acceptance Criteria:**
- [ ] Formatter produces consistent output across identical input data
- [ ] Formatting follows a template rather than free-form LLM generation
- [ ] User-facing copy is compact, concrete, non-judgmental, and oriented toward the next useful action
**Dependencies:** R1

### R5: Manual Command Integration
**Description:** Summaries are accessible via manual bot commands (e.g., /briefing, /weekly) in addition to scheduled delivery.
**Acceptance Criteria:**
- [ ] `/briefing` command triggers the daily summary immediately
- [ ] `/weekly` command triggers the weekly summary immediately
- [ ] Manual invocation produces the same output as scheduled delivery for the same data
**Dependencies:** R1, R2, R3, R4

### R6: Scheduler Integration and Delivery Parity
**Description:** Summaries are scheduled for delivery at configured times via the existing scheduler.
**Acceptance Criteria:**
- [ ] Daily briefing is scheduled for configured morning time
- [ ] Weekly summary is scheduled for configured weekly time
- [ ] Scheduled delivery uses the same rendering path as manual commands
- [ ] Scheduler handles missed windows (e.g., bot was down) by delivering on next startup if within grace period
**Dependencies:** R5

### R7: End-of-Day Reflection
**Description:** End-of-day reflection surface provides brief, context-aware closure.
**Acceptance Criteria:**
- [ ] Reflection stays brief — maximum 3-4 sentences
- [ ] Reflection is context-aware: references what was actually done today, not generic platitudes
- [ ] Reflection is non-punitive: describes what happened, does not judge
- [ ] If behavioral signals are available (from cavekit-behavioral-memory), reflection may include one observational callout
- [ ] If no tasks were completed or attempted, reflection says so briefly and does not invent positive spin
**Dependencies:** R1, R4

### R8: Summary Observability
**Description:** Summary generation and delivery are logged for debugging and regression.
**Acceptance Criteria:**
- [ ] Logs capture: summary type, trigger (manual/scheduled), input data shape, rendering time, delivery status
- [ ] Failed deliveries are logged with reason (channel unavailable, rendering error)
- [ ] Telemetry does not persist raw task titles in long-term storage
**Dependencies:** none

### R9: Behavioral Signal Integration (Read-Only)
**Description:** Summary surfaces can consume behavioral signals from cavekit-behavioral-memory for pattern callouts.
**Acceptance Criteria:**
- [ ] Daily and weekly summaries can read behavioral pattern data if available
- [ ] Missing or stale signal data causes graceful omission — summary renders without callout rather than failing
- [ ] Low-confidence behavioral patterns are omitted from summaries
**Dependencies:** cavekit-behavioral-memory R1

### R10: Summary Prioritization
**Description:** Daily summary task selection respects the prioritization ranking from cavekit-prioritization.
**Acceptance Criteria:**
- [ ] Tasks are ordered by leverage/priority ranking when available
- [ ] If ranking is unavailable, summary falls back to due-date ordering
**Dependencies:** cavekit-prioritization R1

### R11: Ignored Guidance Adaptation
**Description:** If user consistently ignores briefing suggestions, the system adapts rather than escalating.
**Acceptance Criteria:**
- [ ] Ignored guidance causes adaptation or backing off, not louder nagging
- [ ] System does not add urgency markers to previously ignored items
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
- [ ] In urgent mode, summaries are even shorter and more direct
- [ ] In standard mode, summaries follow the default compact style
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

## Changelog
- 2026-04-18: Migrated from kitty-specs 006-briefing-weekly-modernization
