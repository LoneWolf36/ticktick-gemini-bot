# Codebase Function Map

> Auto-generated registry of all exported functions, classes, and constants.
> Last updated: 2026-04-25

---

## Root

### `server.js`
Main entry point. Initializes Express, TickTick client, Gemini analyzer, AX key manager, pipeline, scheduler, and Telegram bot.

---

## Bot (`bot/`)

### `bot/index.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `createBot` | `(token, ticktick, gemini, adapter, pipeline, config)` | Factory for Grammy bot instance |

### `bot/commands.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `registerCommands` | `(bot, ticktick, gemini, adapter, pipeline, config)` | Registers all slash commands (`/scan`, `/briefing`, `/reorg`, etc.) |
| `executeActions` | `(actions, adapter, currentTasks, options)` | Applies batch mutations from pipeline results |

### `bot/callbacks.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `registerCallbacks` | `(bot, adapter, pipeline)` | Handles inline keyboard interactions (Approve/Skip/Drop) |

### `bot/utils.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `formatPipelineFailure` | `(result, options)` | Formats pipeline errors for Telegram display |

---

## Services (`services/`)

### `services/pipeline.js`
*Orchestrates: message -> AX intent -> normalization -> adapter execution.*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `createPipeline` | `({ axIntent, normalizer, adapter, observability, deferIntent })` | Factory returning `processMessage(userMessage, options)` and `getTelemetry()` |

**Internal**: `FAILURE_CLASSES`, retry logic, rollback orchestration, non-task/clarification routing.

### `services/ax-intent.js`
*Extracts structured intent actions from natural language via Gemini + AX framework.*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `createAxIntent` | `(keyManager)` | Factory returning `extractIntents(userMessage, options)` |
| `detectWorkStyleModeIntent` | `(userMessage)` | Regex detection for standard/focus/urgent mode switches |
| `validateChecklistItems` | `(items)` | Validates and caps checklist subtasks |
| `validateIntentAction` | `(action, index, options)` | Runtime validation of extracted intent objects |
| `QuotaExhaustedError` | class | Custom error for API key exhaustion |

### `services/normalizer.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `normalizeAction` | `(intentAction, options)` | Maps raw AI intent to TickTick-compatible fields (repeatHint -> RRULE, etc.) |
| `normalizeActions` | `(intentActions, options)` | Batch normalization |

### `services/ticktick-adapter.js`
*High-level TickTick operations with validation, error classification, behavioral signal emission.*

| Export | Type | Purpose |
|--------|------|---------|
| `TickTickAdapter` | class | |
| `.createTask` | `(normalizedAction)` | Validates and creates task |
| `.updateTask` | `(taskId, normalizedAction)` | Updates task fields with content merge |
| `.completeTask` | `(taskId, projectId)` | Marks task done |
| `.deleteTask` | `(taskId, projectId)` | Permanently removes task |
| `.listActiveTasks` | `(forceRefresh)` | Fetches all incomplete tasks |
| `.findProjectByName` | `(nameHint)` | Fuzzy matching for project resolution |
| `.getTaskSnapshot` | `(taskId, projectId)` | Captures state for rollback |

### `services/ticktick.js`
*Low-level API client with OAuth2, token persistence, raw HTTP.*

| Export | Type | Purpose |
|--------|------|---------|
| `TickTickClient` | class | |
| `.getAuthUrl` | `()` | OAuth2 authorization URL |
| `.exchangeCode` | `(code)` | Exchange auth code for tokens |
| `.getProjects` | `()` | Fetch all projects |
| `.getProjectWithTasks` | `(projectId)` | Fetch project with tasks |
| `.createTask` | `(taskData)` | Raw task creation |
| `.updateTask` | `(taskId, taskData)` | Raw task update |
| `.getAllTasks` | `()` | Aggregates tasks across all projects |
| `._refreshAccessToken` | `()` | Automatic token refresh |

### `services/gemini.js`
*AI analyzer for briefings, digests, reorg proposals.*

| Export | Type | Purpose |
|--------|------|---------|
| `GeminiAnalyzer` | class | |
| `.generateDailyBriefingSummary` | `(tasks, options)` | Structured morning plan |
| `.generateWeeklyDigestSummary` | `(allTasks, processed, options)` | Accountability review |
| `.generateReorgProposal` | `(tasks, projects, refinement)` | System-wide cleanup proposal |
| `.buildWorkStylePromptNote` | `(mode)` | Prompt augmentations per mode |
| `USER_CONTEXT` | constant | Loaded user context |
| `USER_CONTEXT_SOURCE` | constant | Source of user context |

### `services/store.js`
*Persistence layer (Redis or JSON file fallback).*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `MODE_STANDARD` | constant | `'standard'` |
| `MODE_FOCUS` | constant | `'focus'` |
| `MODE_URGENT` | constant | `'urgent'` |
| `getWorkStyleMode` | `()` | Current mode |
| `setWorkStyleMode` | `(mode)` | Persist mode |
| `markTaskProcessed` | `(taskId, ...)` | Track processed tasks |
| `getPendingTasks` | `()` | Unprocessed task queue |
| `appendBehavioralSignals` | `(signals)` | Store behavioral signals |
| `addUndoEntry` | `(entry)` | Push undo stack |
| `getLastUndoEntry` | `()` | Pop undo stack |
| `appendDeferredPipelineIntent` | `(intent)` | Store deferred intent (R12) |
| `getDeferredPipelineIntents` | `()` | Retrieve deferred intents |
| `removeDeferredPipelineIntent` | `(id)` | Remove deferred intent |

### `services/scheduler.js`
*Cron-driven read-only jobs: polling, briefings, digests, store pruning.*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `SCHEDULER_NOTIFICATION_TYPES` | constant (frozen) | Keys: `DAILY_BRIEFING`, `WEEKLY_DIGEST`, etc. |
| `shouldSuppressScheduledNotification` | `(workStyleMode, notificationType)` | Focus mode suppression logic |
| `shouldSendMissedDelivery` | `(lastDeliveryIso, scheduledTimeIso, options)` | Catch-up delivery logic |
| `buildSchedulingMetadata` | `(scheduleKey, scheduledForIso, graceWindowMinutes)` | Structured delivery metadata |
| `runDailyBriefingJob` | `(deps)` | Orchestrates daily briefing |
| `runWeeklyDigestJob` | `(deps)` | Orchestrates weekly digest |
| `runStartupCatchupJobs` | `(deps, config, options)` | Missed job catch-up on boot |
| `startScheduler` | `(bot, ticktick, gemini, adapter, pipeline, config)` | Main entry: cron setup + polling |
| `DEFAULT_GRACE_WINDOW_MINUTES` | constant | `15` |
| `WEEKLY_DIGEST_HOUR` | constant | `20` |

**Internal**: `getZonedClockParts(date, timezone)`, `computeCatchupScheduledForIso(params)`, `processPipelineMessage(userMessage, options)`.

### `services/pipeline-context.js`
*Request context construction and lifecycle tracking.*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `snapshotPipelineValue` | `(value)` | Deep clone |
| `snapshotPrivacySafePipelineValue` | `(value)` | Clone + redact sensitive fields |
| `sanitizePipelineContextForDiagnostics` | `(context)` | Frozen, redacted snapshot |
| `updatePipelineContext` | `(context, updater)` | Functional update pattern |
| `validatePipelineContext` | `(context)` | Validates required fields/types |
| `createPipelineContextBuilder` | `(deps)` | Factory for `buildRequestContext` |
| `REQUIRED_FIELDS` | constant | Required context fields |
| `PRIVACY_REDACTION_KEYS` | constant | Keys to redact |

### `services/pipeline-observability.js`
*Pipeline execution metrics and logging.*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `createPipelineObservability` | `(options)` | Factory for `emit` function |
| `ENTRY_POINT_ALIASES` | constant | Canonical telemetry key map |

### `services/schemas.js`
*Gemini `responseSchema` objects and validation constants.*

| Export | Type | Purpose |
|--------|------|---------|
| `reorgSchema` | schema | Reorg proposal response shape |
| `briefingSummarySchema` | schema | Briefing response shape |
| `weeklySummarySchema` | schema | Weekly digest response shape |
| `dailyCloseSummarySchema` | schema | Daily close response shape |
| `BRIEFING_SUMMARY_SECTION_KEYS` | constant | Required briefing keys |
| `WEEKLY_SUMMARY_SECTION_KEYS` | constant | Required weekly keys |
| `DAILY_CLOSE_SUMMARY_SECTION_KEYS` | constant | Required daily close keys |
| `SUMMARY_NOTICE_CODES` | constant | Notice type enum |
| `SUMMARY_NOTICE_SEVERITIES` | constant | Notice severity enum |
| `SUMMARY_NOTICE_EVIDENCE_SOURCES` | constant | Evidence source enum |
| `MAX_CHECKLIST_ITEMS` | constant | `30` |
| `CHECKLIST_ITEM_SHAPE` | constant | Checklist validation descriptor |

### `services/task-resolver.js`
*Resolves natural language task references to TickTick IDs.*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `resolveTarget` | `({ targetQuery, activeTasks })` | Maps string query to task ID or clarification |
| `buildClarificationPrompt` | `(result, options)` | User-facing text for ambiguous matches |
| `EXACT_SCORE` | constant | `100` |
| `PREFIX_SCORE` | constant | `80` |
| `CONTAINS_SCORE` | constant | `60` |
| `CLARIFICATION_GAP` | constant | `15` |

**Internal**: `normalizeTitle`, `levenshteinDistance`, `fuzzyScore`, `scoreTask`.

### `services/shared-utils.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `PRIORITY_MAP` | constant | TickTick priority mapping |
| `PRIORITY_EMOJI` | constant | Priority display emoji |
| `USER_TZ` | constant | User timezone string |
| `parseDateStringToTickTickISO` | `(dateStr)` | Date string to TickTick ISO |
| `buildTaskCard` | `(task, ...)` | Telegram task card formatter |
| `truncateMessage` | `(msg, ...)` | Message length limiter |
| `escapeHTML` | `(str)` | HTML entity escaping |
| `replyWithMarkdown` | `(ctx, text)` | Telegram markdown reply helper |

### `services/user-settings.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `getUserTimezone` | `()` | Timezone from user_context / ENV / default |
| `getUserTimezoneSource` | `()` | Where timezone was loaded from |
| `DEFAULT_TIMEZONE` | constant | `'Europe/Dublin'` |

### `services/behavioral-signals.js`
*Signal classification and emission from task mutation events.*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `SignalType` | constant (enum) | 15 signal types (POSTPONE, SNOOZE_SPIRAL, etc.) |
| `classifyTaskEvent` | `(event)` | Maps TaskMutationEvent to BehavioralSignal array |
| `deriveSubjectKey` | `(taskId)` | SHA-256 hash (16 chars) for privacy |
| `detectSnoozeSpiral` | `(event)` | Repeated postponement detection |
| `detectCommitmentOverloader` | `(event)` | Creation > completion detection |
| `detectStaleTaskMuseum` | `(event)` | 30/60-day old task detection |
| `detectQuickWinAddiction` | `(event)` | Small/easy task dominance |
| `detectVagueTaskWriter` | `(event)` | Low-actionability title detection |
| `detectDeadlineDaredevil` | `(event)` | Last-minute completion |
| `detectCategoryAvoidance` | `(event)` | Sustained category neglect |
| `detectPlanningWithoutExecution` | `(event)` | Planning churn detection |
| `detectPostpone` | `(event)` | Forward due-date move |
| `detectScopeChange` | `(event)` | Material description/checklist changes |
| `detectDecomposition` | `(event)` | Task splitting detection |
| `getSignalRegistry` | `()` | Supported signal types + metadata |

### `services/behavioral-patterns.js`
*Pattern detection from aggregated signals.*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `PatternConfidence` | constant (enum) | `LOW`, `STANDARD`, `HIGH` |
| `BehavioralPatternType` | constant (enum) | `SNOOZE_SPIRAL`, `PLANNING_TYPE_A`, `PLANNING_TYPE_B` |
| `detectBehavioralPatterns` | `(signals, options)` | Main detection logic |
| `RETENTION_DAYS` | constant | Default `30` |

**Internal**: `buildSnoozePatterns`, `buildTypeAPattern`, `buildTypeBPattern`.

### `services/execution-prioritization.js`
*Leverage-based task ranking with goal awareness and anti-busywork guards.*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `createGoalThemeProfile` | `(rawContext, options)` | Parses goals into keyword themes |
| `normalizePriorityCandidate` | `(task)` | Maps TickTick task to internal candidate |
| `buildRankingContext` | `(options)` | Initializes ranking context |
| `rankPriorityCandidates` | `(input, maybeContext)` | Main scoring and ordering engine |
| `inferPriorityLabelFromTask` | `(task)` | Heuristic priority label |
| `inferPriorityValueFromTask` | `(task)` | Heuristic priority value |
| `inferProjectIdFromTask` | `(task)` | Heuristic project ID |

**Internal**: `assessCandidate`, `goalAlignmentWeight`, `quickWinPenalty`.
**Constants**: `CAREER_KEYWORDS`, `FINANCIAL_KEYWORDS`, `HEALTH_KEYWORDS`, etc.

---

## Summary Surfaces (`services/summary-surfaces/`)

### `services/summary-surfaces/index.js`
*Composition entry points and context normalization.*

| Export | Signature | Purpose |
|--------|-----------|---------|
| `composeBriefingSummary` | `(params)` | High-level briefing composition |
| `composeWeeklySummary` | `(params)` | High-level weekly composition |
| `composeDailyCloseSummary` | `(params)` | High-level daily close composition |
| `logSummarySurfaceEvent` | `(params)` | Standardized summary logging |
| `normalizeBriefingSummary` | `(raw)` | Sanitizes model output |
| `normalizeWeeklySummary` | `(raw)` | Sanitizes model output |
| `normalizeDailyCloseSummary` | `(raw)` | Sanitizes model output |

**Internal**: `normalizeSummaryRequestContext`, `createSummaryDiagnostics`.

### `services/summary-surfaces/briefing-summary.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `composeBriefingSummarySections` | `(params)` | Merges model output with system fallbacks |

**Internal**: `buildPriorityItems`, `buildNotices`.

### `services/summary-surfaces/weekly-summary.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `composeWeeklySummarySections` | `(params)` | Weekly review sections |

**Internal**: `buildProgress`, `buildDeferredCarryForward`, `buildRankingTrendNotice`.

### `services/summary-surfaces/daily-close-summary.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `composeDailyCloseSummarySections` | `({ context, activeTasks, behavioralPatterns, processedHistory, rankingResult, modelSummary })` | Daily close-out content |

**Internal**: `buildStats`, `buildReflection`, `buildResetCue`, `buildNotices`.

### `services/summary-surfaces/reflection-recompute.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `buildReflectionRecomputeContext` | `({ activeTasks, behavioralPatterns, processedHistory, historyAvailable, context })` | Determines if context needs recomputing |
| `buildReflectionRecomputeNotice` | `(recomputeContext, { surface })` | Notice explaining recomputed context |

### `services/summary-surfaces/summary-formatter.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `SUMMARY_FORMATTER_VERSION` | constant | `'summary-formatter.v1'` |
| `formatSummary` | `({ kind, summary, context })` | Formats weekly/daily_close/briefing into Telegram-ready objects |

**Internal**: `formatBriefing`, `formatWeekly`, `formatDailyClose`, `renderList`, `renderNumberedList`, `buildRenderResult`.

### `services/summary-surfaces/intervention-profile.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `deriveInterventionProfile` | `(processedHistory, { generatedAtIso, lookbackDays })` | Analyzes interaction history for engagement level |
| `buildEngagementPatternNotice` | `(profile, { workStyleMode })` | Coaching notices from intervention profile |

### `services/summary-surfaces/behavioral-pattern-notices.js`
| Export | Signature | Purpose |
|--------|-----------|---------|
| `selectBehavioralPatternsForSummary` | `(patterns, { nowIso })` | Filters/ranks patterns by confidence and freshness |
| `buildBehavioralPatternNotice` | `(patterns, { nowIso })` | Structured notice for top-ranked pattern |

**Internal**: `describePattern`, `hasRepeatedEvidence`.

---

## Data Flow

```
User message (Telegram)
  |
  v
bot/commands.js  ──>  services/pipeline.js
                          |
                          ├── services/ax-intent.js      (extract intents)
                          ├── services/normalizer.js      (normalize to TickTick fields)
                          └── services/ticktick-adapter.js (execute mutations)
                                   |
                                   └── services/ticktick.js (raw API calls)

Scheduler (cron)
  |
  v
services/scheduler.js
  ├── services/gemini.js                    (AI summaries)
  ├── services/execution-prioritization.js  (ranking)
  ├── services/summary-surfaces/            (composition + formatting)
  ├── services/behavioral-signals.js        (signal classification)
  └── services/behavioral-patterns.js       (pattern detection)

State
  └── services/store.js  (Redis or JSON file)
```
