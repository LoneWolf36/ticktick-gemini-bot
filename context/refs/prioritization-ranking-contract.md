# Prioritization Ranking Contract

Version: 1.0.0
Last updated: 2026-04-21
Owner: `services/execution-prioritization.js`

## Purpose

Define the canonical inputs and outputs for deterministic task ranking so downstream consumers share one contract.

## Input Signals

The ranking engine accepts normalized task candidates plus ranking context.

### Normalized task candidate

Required contract fields:
- `taskId`
- `title`
- `content`
- `projectId`
- `projectName`
- `priority`
- `dueDate`
- `repeatFlag`
- `taskAgeDays`
- `status`
- `source`
- `containsSensitiveContent`

Signal meanings:
- `dueDate`: urgency signal
- `priority`: explicit TickTick priority field
- `projectId` / `projectName`: project context signal
- `repeatFlag`: recurrence signal
- `taskAgeDays`: task age / staleness signal
- `title` / `content`: rationale and theme matching inputs
- `status`: active-task filter

### Ranking context

Required contract fields:
- `goalThemeProfile`
- `nowIso`
- `workStyleMode`
- `urgentMode`
- `behavioralInferenceThreshold`
- `stateSource`

User context enters ranking through `goalThemeProfile`, which is derived from declared goals in user context.

## Output Contract

Ranking returns a recommendation result with:
- `topRecommendation`: highest-ranked item or `null`
- `ranked`: ordered list with rationale per item via ranking decisions
- `degraded`: whether ranking confidence is degraded
- `degradedReason`: explicit reason when degraded
- `context`: resolved ranking context used for the computation

Each ranking decision must include:
- `taskId`
- `rank`
- `scoreBand`
- `rationaleCode`
- `rationaleText`
- `inferenceConfidence`
- `exceptionApplied`
- `exceptionReason`
- `fallbackUsed`

## Versioning Policy

- Backward-compatible field additions increment the minor version.
- Breaking field removals or semantic changes increment the major version.
- Editorial clarifications increment the patch version.

## Change Log

- 1.0.0 — 2026-04-21: Initial versioned contract created from live implementation in `services/execution-prioritization.js`, including explicit recurrence and task-age candidate fields plus structured ranking output.
