# Data Model: 007 Execution Prioritization Foundations

## Purpose

This model defines the minimum shared contract needed for leverage-first ranking. It is intentionally narrower than the later state and memory features. `008` extends ranking with work-style and urgent-mode state. `009` extends summary and reflection behavior with privacy-bounded behavioral signals.

## Current Source Objects

### TickTick Task

Observed across `ticktick-adapter.js`, `commands.js`, and test fixtures.

Core fields used by current policy:
- `id`
- `title`
- `content`
- `projectId`
- `projectName`
- `priority`
- `dueDate`
- `status`

### User Context

Current source is `USER_CONTEXT`, loaded from `services/user_context.js` or the `USER_CONTEXT` environment variable. It already contains ordered goals and behavioral notes, but it is stored as free-form text rather than a typed object.

### Project

Project metadata is used mainly for leaving Inbox safely and mapping work into higher-level buckets:
- `id`
- `name`

## Proposed Shared Domain Objects

### GoalThemeProfile

Represents explicit user-owned meaning used by the ranking engine.

Fields:
- `rawContext: string`
- `themes: GoalTheme[]`
- `source: "user_context" | "env" | "fallback"`
- `confidence: "explicit" | "weak"`

### GoalTheme

Represents one user-owned direction or consequential life theme.

Fields:
- `key: string`
- `label: string`
- `kind: "career" | "financial" | "health" | "recovery" | "personal" | "custom"`
- `priorityOrder: number | null`
- `active: boolean`

### PriorityCandidate

Normalized task-like input to the ranking engine.

Fields:
- `taskId: string`
- `title: string`
- `content: string`
- `projectId: string | null`
- `projectName: string | null`
- `priority: 0 | 1 | 3 | 5 | null`
- `dueDate: string | null`
- `status: number | null`
- `source: "ticktick"`
- `containsSensitiveContent: boolean`

### CandidateAssessment

Internal evaluation result for a candidate before final ordering.

Fields:
- `taskId: string`
- `goalAlignment: "high" | "medium" | "low" | "unknown"`
- `themeMatches: string[]`
- `urgency: "high" | "medium" | "low" | "unknown"`
- `leverage: "high" | "medium" | "low" | "unknown"`
- `maintenanceType: "none" | "maintenance" | "recovery" | "enabling"`
- `exceptionReason: "none" | "blocker" | "urgent_requirement" | "capacity_protection"`
- `fallbackUsed: boolean`

### RankingContext

All non-task inputs required to rank candidates.

Fields:
- `goalThemeProfile: GoalThemeProfile`
- `nowIso: string`
- `workStyleMode: "gentle" | "standard" | "focused" | "unknown"`
- `urgentMode: boolean`
- `stateSource: "none" | "explicit" | "fallback"`

Notes:
- In `007`, `workStyleMode` should default to `unknown` and `urgentMode` should default to `false` unless explicitly supplied.
- `008` becomes the owner of how these values are resolved.

### RankingDecision

Final ranked output for one candidate.

Fields:
- `taskId: string`
- `rank: number`
- `scoreBand: "top" | "high" | "medium" | "low"`
- `rationaleCode: "goal_alignment" | "urgency" | "blocker_removal" | "capacity_protection" | "fallback"`
- `rationaleText: string`
- `exceptionApplied: boolean`
- `fallbackUsed: boolean`

### RecommendationResult

Top-level return object from the shared prioritization service.

Fields:
- `topRecommendation: RankingDecision | null`
- `ranked: RankingDecision[]`
- `degraded: boolean`
- `degradedReason: "none" | "unknown_goals" | "ambiguous_leverage" | "no_candidates"`

## Explicit Non-Goals For This Model

- No long-term behavioral archive or derived avoidance history in this feature.
- No multi-field self-report schema for energy, focus, or urgency.
- No requirement to rewrite task content in order to produce ranking or rationale.
- No prompt-only hidden scoring model that cannot be inspected in tests.

## Integration Notes

- `services/gemini.js` should eventually consume `RecommendationResult` instead of embedding local prioritization rules in prompts.
- `bot/commands.js` policy sweep should depend on the shared service for fallback ranking and project/priority repairs.
- `services/scheduler.js` should use the same ranking output indirectly through shared briefing and weekly modules.
