# Data Model: 006 Briefing and Weekly Pipeline Modernization

## Purpose

This model defines the internal contracts for shared daily and weekly summary surfaces. It formalizes source inputs, fixed top-level section contracts, formatter output, and diagnostics so `/briefing` and `/weekly` can move off the legacy free-form Gemini path without diverging across manual and scheduled entry points.

## Current Source Objects

### TickTick Task

Observed across `services/ticktick-adapter.js`, `bot/commands.js`, and `services/scheduler.js`.

Core fields used by current summary paths:
- `id`
- `title`
- `content`
- `projectId`
- `projectName`
- `priority`
- `dueDate`
- `status`

### Processed Task History Entry

Observed in `services/store.js`, `bot/utils.js`, and the current `/weekly` command and scheduler flow.

Core fields used today:
- `originalTitle`
- `approved`
- `skipped`
- `dropped`
- `reviewedAt`
- `sentAt`
- `suggestedPriority`
- `priorityEmoji`

### RecommendationResult

Observed in `services/execution-prioritization.js`.

Current fields already suitable for briefing input:
- `topRecommendation`
- `ranked`
- `degraded`
- `degradedReason`
- `context`

## Proposed Domain Objects

### SummaryRequestContext

Shared request metadata for any summary surface.

Fields:
- `kind: "briefing" | "weekly"`
- `entryPoint: "manual_command" | "scheduler"`
- `userId: string | number | null`
- `generatedAtIso: string`
- `timezone: string | null`
- `urgentMode: boolean`
- `tonePolicy: "preserve_existing"`

Validation rules:
- `kind` and `entryPoint` are required for every request.
- `urgentMode` must be explicit even when false.
- `tonePolicy` stays fixed in this feature so copy drift is reviewable.

### SummarySourceSnapshot

Canonical source data assembled before summary composition.

Fields:
- `activeTasks: PriorityCandidate[]`
- `processedHistory: ProcessedTaskHistoryEntry[]`
- `rankingResult: RecommendationResult | null`
- `historyAvailable: boolean`
- `sourceCounts: { activeTasks: number, processedHistory: number }`

Usage:
- `briefing` depends on `activeTasks` and `rankingResult`.
- `weekly` depends on `activeTasks`, `processedHistory`, and may use `rankingResult` for `next_focus`.

Rules:
- `processedHistory` may be empty, but `historyAvailable` must explicitly mark whether weekly history-backed insights are actually available.

### SummaryNotice

Structured note surfaced inside the fixed `notices` section.

Fields:
- `code: "sparse_tasks" | "missing_history" | "degraded_ranking" | "urgent_mode_active" | "delivery_context"`
- `message: string`
- `severity: "info" | "warning"`
- `evidenceSource: "tasks" | "processed_history" | "state" | "system"`

Rules:
- Notices are the contract-level place for missing-data caveats and urgent-mode reminders.
- `notices` may be empty, but the top-level section always exists.

### BriefingPriorityItem

Structured item inside the `priorities` section.

Fields:
- `taskId: string`
- `title: string`
- `projectName: string | null`
- `dueDate: string | null`
- `priorityLabel: string | null`
- `rationaleText: string`

Note:
- Inner fields may evolve as long as the `priorities` top-level section remains stable.

### BriefingSummary

Structured output before formatting for `/briefing`.

Fields:
- `focus: string`
- `priorities: BriefingPriorityItem[]`
- `why_now: string[]`
- `start_now: string`
- `notices: SummaryNotice[]`

Validation rules:
- All five top-level sections are always present.
- Sparse data may reduce `priorities` or `why_now`, but must not remove top-level sections.
- `start_now` must remain actionable and concise.

### WeeklyCarryForwardItem

Structured item inside `carry_forward`.

Fields:
- `taskId: string | null`
- `title: string`
- `reason: string`

### WeeklyWatchout

Evidence-backed execution risk inside `watchouts`.

Fields:
- `label: string`
- `evidence: string`
- `evidenceSource: "current_tasks" | "processed_history" | "missing_data"`
- `behavioralInterpretationAllowed: false`

Rules:
- A watchout must be omitted when evidence is not strong enough.
- `behavioralInterpretationAllowed` is invariant false for this feature to prevent scope bleed into `009`.

### WeeklySummary

Structured output before formatting for `/weekly`.

Fields:
- `progress: string[]`
- `carry_forward: WeeklyCarryForwardItem[]`
- `next_focus: string[]`
- `watchouts: WeeklyWatchout[]`
- `notices: SummaryNotice[]`

Validation rules:
- All five top-level sections are always present.
- When history is sparse or missing, `progress` may be shorter and `notices` must include a missing-history notice.
- `watchouts` must only contain evidence-backed execution risks or missing-data notices.

### SummaryRenderResult

Deterministic formatter output.

Fields:
- `kind: "briefing" | "weekly"`
- `formattedText: string`
- `telegramSafe: boolean`
- `tonePreserved: boolean`
- `appliedNoticeCodes: string[]`

Usage:
- Returned by the formatter and asserted in formatter-focused tests.

### SummaryDiagnostics

Inspectable execution record for logging and parity checks.

Fields:
- `entryPoint: "manual_command" | "scheduler"`
- `kind: "briefing" | "weekly"`
- `sourceCounts: { activeTasks: number, processedHistory: number }`
- `degraded: boolean`
- `degradedReason: string | null`
- `formatterVersion: string`
- `deliveryStatus: "not_sent" | "sent" | "delivery_failed"`

Notes:
- Supports FR-006 without introducing vendor-specific telemetry.

## Relationships

- One `SummaryRequestContext` plus one `SummarySourceSnapshot` produces exactly one structured summary object.
- A `BriefingSummary` contains zero or more `BriefingPriorityItem` and zero or more `SummaryNotice`.
- A `WeeklySummary` contains zero or more `WeeklyCarryForwardItem`, zero or more `WeeklyWatchout`, and zero or more `SummaryNotice`.
- One structured summary plus its context produces one `SummaryRenderResult`.
- One summary execution may emit one `SummaryDiagnostics` record before delivery and update it after delivery outcome is known.

## Lifecycle

1. Entry point collects tasks, processed history, and resolved state.
2. Shared summary surface assembles `SummaryRequestContext` and `SummarySourceSnapshot`.
3. Daily or weekly builder produces a structured summary object with fixed top-level sections.
4. Deterministic formatter produces Telegram-safe output.
5. Entry point sends or replies with the formatted text.
6. Diagnostics record source counts, degraded reason, summary contract version, and delivery outcome.

## Explicit Non-Goals

- No behavioral memory or interpretive avoidance analysis in `watchouts`.
- No new persistence layer or summary cache.
- No public HTTP API commitment; contracts in `contracts/` are internal design artifacts.
- No generic report DSL or plugin system beyond the small summary surface module split.
