---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-21T13:45:00Z"
source_specs: ["007-execution-prioritization-foundations"]
complexity: "complex"
---

# Cavekit: Prioritization

## Scope

Execution prioritization engine: leverage-based ranking of tasks, source register for ranking inputs, ranking contracts, exceptions and rationale, and integration seams with other domains. This domain determines which tasks matter most and why.

See `context/refs/research-007-execution-prioritization-foundations.md` for research.
See `context/refs/data-model-007-execution-prioritization-foundations.md` for data model.
See `context/refs/source-register.csv` for input source register.
See `context/refs/evidence-log.csv` for evidence tracking.

## Requirements

### R1: Ranking Contract and Inputs
**Description:** A ranking contract defines what inputs feed the prioritization engine and what outputs it produces.
**Acceptance Criteria:**
- [x] Ranking contract specifies: input signals (due date, priority field, project, recurrence, task age, user context), output (ordered list with rationale per item)
- [x] Input sources are catalogued in `context/refs/source-register.csv`
- [x] Contract is versioned and changes are logged
**Dependencies:** none

### R2: Core Leverage Ranking Engine
**Description:** Engine computes a leverage-based ranking that distinguishes important long-term work from busywork.
**Acceptance Criteria:**
- [x] Ranking distinguishes important work from low-value busywork
- [x] Ranking actively avoids rewarding motion-as-progress
- [x] Long-term-goal tasks are surfaced when they exist and are plausible, not only when they're urgent
- [x] Ranking produces at most 3 top items for daily planning (aligns with briefing constraint)
- [x] Ranking is deterministic for the same input state
**Dependencies:** R1

### R3: Ranking Confidence and Uncertainty
**Description:** Ranking engine expresses confidence levels and handles uncertainty honestly.
**Acceptance Criteria:**
- [ ] When confidence is high, ranking is presented without hedging
- [ ] When confidence is low (insufficient data, conflicting signals), ranking either omits weak items or labels uncertainty
- [ ] Weak behavioral or priority inference is never presented as fact
- [ ] System asks directly or fails closed when confidence is low
**Dependencies:** R2

### R4: Exceptions and Rationale
**Description:** Ranking supports exceptions (user-forced priority overrides) and provides rationale for rankings.
**Acceptance Criteria:**
- [ ] User can override ranking for a specific task ("make X top priority")
- [ ] Overrides are time-bounded or explicit — they don't silently persist forever
- [ ] Rationale is available for each ranked item explaining why it's ranked where it is
- [ ] Rationale uses observational language, not diagnostic claims
**Dependencies:** R2

### R5: Integration Seam: Briefing Surfaces
**Description:** Ranking output feeds daily and weekly summary surfaces.
**Acceptance Criteria:**
- [ ] Daily briefing consumes ranking output for task selection
- [ ] Weekly summary can reference ranking trends
- [ ] If ranking engine is unavailable, briefing falls back to due-date ordering gracefully
**Dependencies:** R2, cavekit-briefings R10

### R6: Integration Seam: Project Resolution
**Description:** Project resolution in the task pipeline can consult ranking for priority context.
**Acceptance Criteria:**
- [x] Project resolution priority follows the ranking policy when available
- [x] When ranking is unavailable, project resolution uses its own defaults
**Dependencies:** R2, cavekit-task-pipeline R7

### R7: Ranking Observability
**Description:** Ranking decisions are logged with evidence for tracing.
**Acceptance Criteria:**
- [ ] Each ranking computation logs: input state, computed scores, final ordering, rationale
- [ ] Evidence is tracked per `context/refs/evidence-log.csv`
- [ ] Logs do not persist raw task content in long-term behavioral memory
**Dependencies:** R2

### R8: Behavioral Signal Consumption
**Description:** Ranking engine can optionally consume behavioral signals from cavekit-behavioral-memory for pattern-informed prioritization.
**Acceptance Criteria:**
- [ ] If behavioral data shows a task category is consistently avoided, ranking can factor this in
- [ ] Behavioral signal consumption is optional — ranking works without it
- [ ] Low-confidence behavioral signals are not used for ranking adjustments
**Dependencies:** cavekit-behavioral-memory R1

### R9: Anti-Busywork Guardrails
**Description:** Ranking engine has explicit guardrails against optimizing for busywork.
**Acceptance Criteria:**
- [ ] Quick-win tasks do not dominate the top of the ranking unless genuinely important
- [ ] Task count is never a ranking signal (more tasks ≠ more productive)
- [ ] Planning-heavy tasks without execution evidence are deprioritized
**Dependencies:** R2

### R10: Regression Coverage
**Description:** Ranking engine has automated tests for core scenarios.
**Acceptance Criteria:**
- [ ] Test: mix of urgent and important tasks produces important-first ranking
- [ ] Test: all low-priority tasks produces honest "nothing critical" output
- [ ] Test: override forces specific task to top
- [ ] Test: determinism — same input produces same output on repeated runs
**Dependencies:** R2

### R11: MVP Scope Boundary
**Description:** Ranking stays within MVP scope — no ML models, no user profiling, no multi-user comparison.
**Acceptance Criteria:**
- [x] Ranking uses heuristic rules, not trained ML models
- [x] No cross-user data comparison
- [x] No external API calls for ranking computation
**Dependencies:** none

### R12: User Goal Awareness
**Description:** Ranking is aware of long-term user goals when declared, incorporating them into leverage assessment.
**Acceptance Criteria:**
- [x] If user has declared goals (stored in product context), ranking considers goal-aligned tasks as higher leverage
- [x] If no goals are declared, ranking works on task-level signals alone without penalty
**Dependencies:** R2

## Out of Scope

- ML-based ranking models
- Cross-user ranking comparison
- Automated goal detection (goals must be user-declared)
- Real-time ranking updates (ranking is computed at summary/briefing time)

## Cross-References

- See also: cavekit-briefings.md (consumes ranking for task selection)
- See also: cavekit-task-pipeline.md (project resolution consults ranking)
- See also: cavekit-behavioral-memory.md (optional behavioral signal input)
- See also: cavekit-work-style.md (urgent mode may affect ranking presentation)

## Validation Action Items — 2026-04-20

- [x] Audit R2 (Core Leverage Ranking Engine): `services/execution-prioritization.js` scores candidates with explicit goal-alignment, urgency, blocker-removal, and capacity-protection rules; `rankPriorityCandidates(...)` sorts deterministically and returns a bounded ranked list that briefing surfaces cap to 3 items.
- [x] Audit R6 (Project Resolution): `inferProjectIdFromTask(...)` consults ranking-derived priority context when available, then falls back to built-in project fragment defaults when ranking context is degraded or insufficient.
- [x] Audit R11 (MVP Scope Boundary): ranking remains local heuristic code in `services/execution-prioritization.js` with no ML model calls, no cross-user comparison, and no external ranking API dependency.
- [x] Audit R12 (User Goal Awareness): `createGoalThemeProfile(...)` parses declared goals from product context and `assessCandidate(...)` boosts matching tasks without penalizing degraded/no-goal cases.
- [x] Audit R1 (Ranking Contract and Inputs): `context/refs/prioritization-ranking-contract.md` now defines the canonical ranking inputs/outputs and version history; `context/refs/source-register.csv` now catalogs current repo-relative evidence sources; `services/execution-prioritization.js` exposes recurrence (`repeatFlag`) and task-age (`taskAgeDays`) fields in the normalized candidate contract.
- [ ] Keep R4, R5, R7, R8, R9, and R10 unchecked pending explicit override, trend, observability, behavioral-input, anti-planning-bias, and full regression evidence.

## Changelog
- 2026-04-20: R2, R6, R11, and R12 completed — ranking now has audited leverage scoring, project-resolution integration, explicit MVP boundaries, and declared-goal awareness.
- 2026-04-21: R1 completed — ranking contract is now versioned in refs, source register paths are current, and normalized candidate inputs explicitly include recurrence and task-age fields.
- 2026-04-18: Migrated from kitty-specs 007-execution-prioritization-foundations
