## Modules

<dl>
<dt><a href="#module_behavioral-signals">behavioral-signals</a></dt>
<dd><p>Behavioral Signal Classifier — passive observation of task events.</p>
<p>Observes task mutations and emits derived behavioral signals based ONLY
on metadata (dates, counts, categories). NEVER stores raw task titles,
descriptions, or message text.</p>
<p>Low-level signals capture derived task events.
Pattern signals classify the 8 behavioral-memory pattern families using
derived metadata only — never raw titles, descriptions, or message text.</p>
</dd>
<dt><a href="#module_services/reorg-executor">services/reorg-executor</a></dt>
<dd><p>Reorg action executor — single action dispatch against the TickTick adapter.</p>
<p>Extracted from bot/commands.js executeActions(). Handles create, update,
complete, and drop action types for Gemini reorg proposals and policy sweeps.
Returns structured results; caller persists state (undo logs, processed marks).</p>
</dd>
<dt><a href="#module_services/undo-executor">services/undo-executor</a></dt>
<dd><p>Undo execution helpers — revert pipeline mutations through the TickTick adapter.</p>
<p>Moved from bot/utils.js to eliminate the passthrough re-export layer.
These helpers are consumed by bot/commands.js (/undo command) and
bot/callbacks.js (undo:last inline button). Both call executeUndoBatch directly.</p>
</dd>
</dl>

## Classes

<dl>
<dt><a href="#GeminiAnalyzer">GeminiAnalyzer</a></dt>
<dd><p>Gemini AI analysis and generation engine.
Handles model initialization, API key rotation, and summary generation.</p>
</dd>
<dt><a href="#QuotaExhaustedError">QuotaExhaustedError</a></dt>
<dd><p>Error thrown when all API keys have been exhausted due to daily quota limits.</p>
</dd>
<dt><a href="#TickTickAdapter">TickTickAdapter</a></dt>
<dd><p>TickTick Adapter - Narrow interface for all TickTick REST API interactions.
Wraps TickTickClient with validation, error classification, and structured logging.</p>
</dd>
<dt><a href="#TickTickClient">TickTickClient</a></dt>
<dd><p>Entry point for TickTick API client.</p>
</dd>
</dl>

## Constants

<dl>
<dt><a href="#INTENT_EXTRACTION_PROMPT">INTENT_EXTRACTION_PROMPT</a></dt>
<dd><p>System prompt for Gemini-based intent extraction.
This prompt was preserved from the original framework instruction text.</p>
</dd>
<dt><a href="#intentActionSchema">intentActionSchema</a></dt>
<dd><p>Response schema for Gemini intent extraction.
Uses Google GenAI schema format.</p>
</dd>
<dt><a href="#OPERATION_RECEIPT_VALUES">OPERATION_RECEIPT_VALUES</a></dt>
<dd><p>OperationReceipt is the shared outcome contract for user-visible operation state.
It describes what happened after execution logic has already decided the outcome;
it must not own orchestration, routing, or mutation decisions.</p>
</dd>
<dt><a href="#REQUIRED_FIELDS">REQUIRED_FIELDS</a> : <code>Array.&lt;string&gt;</code></dt>
<dd><p>List of required fields for a valid pipeline request context.</p>
</dd>
<dt><a href="#DEFAULT_ENTRY_POINT">DEFAULT_ENTRY_POINT</a> : <code>string</code></dt>
<dd></dd>
<dt><a href="#DEFAULT_MODE">DEFAULT_MODE</a> : <code>string</code></dt>
<dd></dd>
<dt><a href="#DEFAULT_WORK_STYLE_MODE">DEFAULT_WORK_STYLE_MODE</a> : <code>string</code></dt>
<dd></dd>
<dt><a href="#PRIVACY_REDACTION_KEYS">PRIVACY_REDACTION_KEYS</a> : <code>Set.&lt;string&gt;</code></dt>
<dd><p>Keys containing potentially sensitive user data that should be redacted in diagnostics.</p>
</dd>
<dt><a href="#MAX_RECENT_LATENCIES">MAX_RECENT_LATENCIES</a> : <code>Record.&lt;string, string&gt;</code></dt>
<dd><p>Aliases for mapping internal entry point names to display names.</p>
</dd>
<dt><a href="#FAILURE_CLASSES">FAILURE_CLASSES</a> : <code>Record.&lt;string, string&gt;</code></dt>
<dd><p>Failure classes for pipeline errors.</p>
</dd>
<dt><a href="#FAILURE_CATEGORIES">FAILURE_CATEGORIES</a> : <code>Record.&lt;string, string&gt;</code></dt>
<dd><p>Failure categories for classifying error severity and retryability.</p>
</dd>
<dt><a href="#ACTION_FAILURE_CLASSES">ACTION_FAILURE_CLASSES</a> : <code>Record.&lt;string, string&gt;</code></dt>
<dd><p>Failure classes for individual action execution.</p>
</dd>
<dt><a href="#NON_TASK_REASONS">NON_TASK_REASONS</a> : <code>Record.&lt;string, string&gt;</code></dt>
<dd><p>Reasons for a request being classified as non-task.</p>
</dd>
<dt><a href="#USER_FAILURE_MESSAGES">USER_FAILURE_MESSAGES</a> : <code>Record.&lt;string, string&gt;</code></dt>
<dd><p>User-facing messages for different failure classes.</p>
</dd>
<dt><a href="#reorgSchema">reorgSchema</a></dt>
<dd><p>Gemini response schema for reorganization proposals.
Cavekit ownership: Task Pipeline R16 (Guided Reorg).</p>
</dd>
<dt><a href="#BRIEFING_SUMMARY_SECTION_KEYS">BRIEFING_SUMMARY_SECTION_KEYS</a> : <code>Array.&lt;string&gt;</code></dt>
<dd><p>Section keys for daily briefing summaries.</p>
</dd>
<dt><a href="#WEEKLY_SUMMARY_SECTION_KEYS">WEEKLY_SUMMARY_SECTION_KEYS</a> : <code>Array.&lt;string&gt;</code></dt>
<dd><p>Section keys for weekly summaries.</p>
</dd>
<dt><a href="#DAILY_CLOSE_SUMMARY_SECTION_KEYS">DAILY_CLOSE_SUMMARY_SECTION_KEYS</a> : <code>Array.&lt;string&gt;</code></dt>
<dd><p>Section keys for daily close summaries.</p>
</dd>
<dt><a href="#SUMMARY_NOTICE_CODES">SUMMARY_NOTICE_CODES</a> : <code>Array.&lt;string&gt;</code></dt>
<dd><p>Valid codes for summary notices.</p>
</dd>
<dt><a href="#SUMMARY_NOTICE_SEVERITIES">SUMMARY_NOTICE_SEVERITIES</a> : <code>Array.&lt;string&gt;</code></dt>
<dd><p>Severity levels for summary notices.</p>
</dd>
<dt><a href="#SUMMARY_NOTICE_EVIDENCE_SOURCES">SUMMARY_NOTICE_EVIDENCE_SOURCES</a> : <code>Array.&lt;string&gt;</code></dt>
<dd><p>Evidence sources for summary notices.</p>
</dd>
<dt><a href="#WEEKLY_WATCHOUT_EVIDENCE_SOURCES">WEEKLY_WATCHOUT_EVIDENCE_SOURCES</a> : <code>Array.&lt;string&gt;</code></dt>
<dd><p>Evidence sources for weekly watchouts.</p>
</dd>
<dt><a href="#MAX_CHECKLIST_ITEMS">MAX_CHECKLIST_ITEMS</a></dt>
<dd><p>Maximum number of checklist items allowed in a single create action.
Prevents brain-dump overload and keeps checklists execution-friendly.</p>
</dd>
<dt><a href="#CHECKLIST_ITEM_SHAPE">CHECKLIST_ITEM_SHAPE</a></dt>
<dd><p>Shape descriptor for checklist items in extracted intent output.
Used by validateIntentAction to check checklistItems arrays.</p>
</dd>
<dt><a href="#briefingSummarySchema">briefingSummarySchema</a></dt>
<dd><p>Gemini response schema for briefing summaries.</p>
</dd>
<dt><a href="#weeklySummarySchema">weeklySummarySchema</a></dt>
<dd><p>Gemini response schema for weekly summaries.</p>
</dd>
<dt><a href="#dailyCloseSummarySchema">dailyCloseSummarySchema</a></dt>
<dd><p>Gemini response schema for daily close summaries.</p>
</dd>
<dt><a href="#PRIORITY_MAP">PRIORITY_MAP</a> : <code>Object.&lt;string, number&gt;</code></dt>
<dd><p>Priority map from Gemini labels to TickTick priority integers.</p>
</dd>
<dt><a href="#PRIORITY_EMOJI">PRIORITY_EMOJI</a> : <code>Object.&lt;number, string&gt;</code></dt>
<dd><p>Mapping of TickTick priority numbers to emoji representations.</p>
</dd>
<dt><a href="#PRIORITY_LABEL">PRIORITY_LABEL</a> : <code>Object.&lt;number, string&gt;</code></dt>
<dd><p>Mapping of TickTick priority numbers to user-facing labels.</p>
</dd>
<dt><a href="#AUTHORIZED_CHAT_ID">AUTHORIZED_CHAT_ID</a> : <code>number</code> | <code>null</code></dt>
<dd><p>The authorized Telegram chat ID from environment variables.</p>
</dd>
<dt><a href="#USER_TZ">USER_TZ</a> : <code>string</code></dt>
<dd><p>The user&#39;s timezone, resolved from the canonical getUserTimezone().</p>
</dd>
<dt><a href="#MUTATION_TYPE_LABELS">MUTATION_TYPE_LABELS</a> : <code>Object.&lt;string, string&gt;</code></dt>
<dd><p>Maps mutation action types to user-facing labels.
Centralized to prevent duplication across pipeline and shared-utils.</p>
</dd>
<dt><a href="#MUTATION_CONFIRMATION_TTL_MS">MUTATION_CONFIRMATION_TTL_MS</a></dt>
<dd><p>Mutation confirmation TTL: 10 minutes</p>
</dd>
<dt><a href="#CHECKLIST_CLARIFICATION_TTL_MS">CHECKLIST_CLARIFICATION_TTL_MS</a></dt>
<dd><p>Checklist clarification TTL: 24 hours</p>
</dd>
<dt><a href="#TASK_REFINEMENT_TTL_MS">TASK_REFINEMENT_TTL_MS</a></dt>
<dd><p>Task refinement TTL: 5 minutes</p>
</dd>
<dt><a href="#RECENT_TASK_CONTEXT_TTL_MS">RECENT_TASK_CONTEXT_TTL_MS</a></dt>
<dd><p>Recent task context TTL: 10 minutes</p>
</dd>
<dt><a href="#EXACT_SCORE">EXACT_SCORE</a> : <code>number</code></dt>
<dd><p>Match score for an exact string match.</p>
</dd>
<dt><a href="#PREFIX_SCORE">PREFIX_SCORE</a> : <code>number</code></dt>
<dd><p>Match score for a prefix match.</p>
</dd>
<dt><a href="#CONTAINS_SCORE">CONTAINS_SCORE</a> : <code>number</code></dt>
<dd><p>Match score for a &quot;contains&quot; match.</p>
</dd>
<dt><a href="#FUZZY_SCORE_MIN">FUZZY_SCORE_MIN</a> : <code>number</code></dt>
<dd><p>Minimum score for a fuzzy match to be considered.</p>
</dd>
<dt><a href="#FUZZY_SCORE_MAX">FUZZY_SCORE_MAX</a> : <code>number</code></dt>
<dd><p>Maximum score for a fuzzy match.</p>
</dd>
<dt><a href="#CLARIFICATION_GAP">CLARIFICATION_GAP</a> : <code>number</code></dt>
<dd><p>Minimum score gap required to avoid clarification when multiple matches exist.</p>
</dd>
<dt><a href="#UNDERSPECIFIED_PRONOUN_QUERY">UNDERSPECIFIED_PRONOUN_QUERY</a> : <code>RegExp</code></dt>
<dd><p>Regex for detecting underspecified pronoun queries.</p>
</dd>
<dt><a href="#PROJECT_CACHE_TTL_MS">PROJECT_CACHE_TTL_MS</a> : <code>number</code></dt>
<dd><p>Project cache TTL in milliseconds.</p>
</dd>
<dt><a href="#VALID_PRIORITIES">VALID_PRIORITIES</a> : <code>Array.&lt;number&gt;</code></dt>
<dd><p>Valid priority values for TickTick API.</p>
</dd>
<dt><a href="#ACTION_VERB_REGEX">ACTION_VERB_REGEX</a> : <code>RegExp</code></dt>
<dd><p>Regex for detecting action verbs at the start of a task title.</p>
</dd>
<dt><a href="#CONTENT_MERGE_SEPARATOR">CONTENT_MERGE_SEPARATOR</a> : <code>string</code></dt>
<dd><p>Separator used when merging task content.</p>
</dd>
<dt><a href="#NETWORK_ERROR_CODES">NETWORK_ERROR_CODES</a> : <code>Set.&lt;string&gt;</code></dt>
<dd><p>Node.js network error codes to be classified as NETWORK_ERROR.</p>
</dd>
<dt><a href="#TYPED_ERROR_CODES">TYPED_ERROR_CODES</a> : <code>Set.&lt;string&gt;</code></dt>
<dd><p>Set of all valid typed error codes.</p>
</dd>
<dt><a href="#PROJECT_POLICY">PROJECT_POLICY</a></dt>
<dd><p>PROJECT_POLICY maps your TickTick projects to behavior categories.
The system uses this to set priority caps and make safe defaults.</p>
<p>Rules:</p>
<ul>
<li>strategic: eligible for Core Goal (priority 5) if action verb + strong evidence</li>
<li>admin: cap at Important (3), default Life Admin (1)</li>
<li>routine: cap at Life Admin (1), never Core Goal</li>
<li>uncategorized (default): cap at Important (3), default Life Admin (1)</li>
</ul>
<p>Project routing is exact-match only.
If no exact configured destination exists, writes stay blocked or omit the
project move rather than guessing Inbox/default.</p>
<p>DEFAULTS: If you omit PROJECT_POLICY entirely, the system falls back to
uncategorized for everything (safe default: priority cap 3, default 1).
If you omit KEYWORDS, VERB_LIST, or SCORING, sensible defaults are used.
Only USER_CONTEXT and USER_TIMEZONE are truly required.</p>
</dd>
<dt><a href="#KEYWORDS">KEYWORDS</a></dt>
<dd><p>KEYWORDS used for intent detection, urgency inference, and follow-up binding.
All hardcoded lists from the codebase are consolidated here.</p>
</dd>
<dt><a href="#VERB_LIST">VERB_LIST</a></dt>
<dd><p>VERBS recognized as action signals in task titles.
Used to distinguish &quot;plan&quot; (vague) from &quot;apply for&quot; (action).
Pipe-delimited string for regex construction.</p>
</dd>
<dt><a href="#SCORING">SCORING</a></dt>
<dd><p>SCORING weights and thresholds used by the priority engine.
All magic numbers from the codebase are extracted here with documentation.</p>
<p>Rationale for defaults:</p>
<ul>
<li>coreGoal weight 36: highest tier, must exceed sum of lower tiers</li>
<li>orderBoosts [8,4,2]: diminishing returns for goal order beyond top 3</li>
<li>urgentModeBoosts high=70: urgent mode should significantly reorder priorities</li>
<li>priorityOverrideScore 10000: ensures manual overrides always win</li>
<li>capacityProtectionScore 120: health/recovery tasks get strong protection</li>
<li>highUrgencyHours 24: due within 24h = high urgency</li>
<li>mediumUrgencyHours 72: due within 72h = medium urgency</li>
</ul>
</dd>
<dt><a href="#safeAnswerCallbackQuery">safeAnswerCallbackQuery</a></dt>
<dd><p>Wraps ctx.answerCallbackQuery with timeout telemetry.</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#createGoalThemeProfile">createGoalThemeProfile(rawContext, [options])</a> ⇒ <code>object</code></dt>
<dd><p>Creates a goal theme profile from raw context.</p>
</dd>
<dt><a href="#normalizePriorityCandidate">normalizePriorityCandidate(task)</a> ⇒ <code>object</code></dt>
<dd><p>Normalizes a TickTick task into a priority candidate.</p>
</dd>
<dt><a href="#buildRankingContext">buildRankingContext([options])</a> ⇒ <code>object</code></dt>
<dd><p>Builds a ranking context from options.</p>
</dd>
<dt><a href="#hasVerb">hasVerb(task, [options])</a> ⇒ <code>string</code></dt>
<dd><p>Infers a priority label (e.g., &#39;core_goal&#39;) from a task.</p>
</dd>
<dt><a href="#inferPriorityLabelFromTask">inferPriorityLabelFromTask(task, [options])</a> ⇒ <code>string</code></dt>
<dd><p>Infers a priority label (e.g., &#39;core_goal&#39;) from a task.</p>
</dd>
<dt><a href="#inferPriorityValueFromTask">inferPriorityValueFromTask(task, [options])</a> ⇒ <code>number</code></dt>
<dd><p>Infers a TickTick priority value (1, 3, 5) from a task.</p>
</dd>
<dt><a href="#inferProjectIdFromTask">inferProjectIdFromTask(task, projects, [options])</a> ⇒ <code>string</code> | <code>null</code></dt>
<dd><p>Infer a project ID for a task from available projects.
Conservative fallback only: exact alias/name match only.</p>
</dd>
<dt><a href="#createRankingDecision">createRankingDecision([decision])</a> ⇒ <code>object</code></dt>
<dd><p>Creates a ranking decision object.</p>
</dd>
<dt><a href="#buildRecommendationResult">buildRecommendationResult([params])</a> ⇒ <code>object</code></dt>
<dd><p>Builds a recommendation result object.</p>
</dd>
<dt><a href="#rankPriorityCandidates">rankPriorityCandidates(input, [maybeContext])</a> ⇒ <code>object</code></dt>
<dd><p>Ranks candidates based on goal alignment and urgency.</p>
</dd>
<dt><a href="#buildWorkStylePromptNote">buildWorkStylePromptNote([workStyleMode])</a> ⇒ <code>string</code></dt>
<dd><p>Builds a prompt note based on the active work style mode.</p>
</dd>
<dt><a href="#detectWorkStyleModeIntent">detectWorkStyleModeIntent(userMessage)</a> ⇒ <code>Object</code> | <code>Object</code> | <code>Object</code> | <code>null</code></dt>
<dd><p>Detects work-style mode intents from user messages.</p>
</dd>
<dt><a href="#validateChecklistItems">validateChecklistItems(items)</a> ⇒ <code>Object</code></dt>
<dd><p>Validates and normalizes checklist items from extracted intent output.
Caps at MAX_CHECKLIST_ITEMS, validates each item has a title,
and strips invalid entries.</p>
</dd>
<dt><a href="#validateIntentAction">validateIntentAction(action, index, [options])</a> ⇒ <code>Object</code></dt>
<dd><p>Validates an intent action object at runtime (defense in depth).
Exported for testing purposes.</p>
</dd>
<dt><a href="#extractIntentsWithGemini">extractIntentsWithGemini(gemini, userMessage, [options])</a> ⇒ <code>Promise.&lt;Array.&lt;object&gt;&gt;</code></dt>
<dd><p>Extracts structured intent actions from a user message using Gemini.</p>
</dd>
<dt><a href="#truncateMessageForExtraction">truncateMessageForExtraction(text, maxChars)</a> ⇒ <code>string</code></dt>
<dd><p>Progressively truncates a long user message to fit within a safe prompt limit.
Strategy: strip examples, strip verbose filler, keep schema + core rules.</p>
</dd>
<dt><a href="#createIntentExtractor">createIntentExtractor(gemini)</a> ⇒ <code>Object</code></dt>
<dd><p>Creates a Gemini-based intent extraction service.</p>
</dd>
<dt><a href="#_coerceDate">_coerceDate()</a></dt>
<dd><p>Gets local current date components formatted by the system timezone.</p>
</dd>
<dt><a href="#_getNowComponents">_getNowComponents()</a></dt>
<dd><p>Gets local current date components formatted by the system timezone.</p>
</dd>
<dt><a href="#_formatISO">_formatISO()</a></dt>
<dd><p>Formats a Date object to TickTick ISO format</p>
</dd>
<dt><a href="#_normalizeTitle">_normalizeTitle(rawTitle, maxLength)</a> ⇒ <code>string</code></dt>
<dd><p>Normalizes a title to be concise, verb-led, and noise-free.</p>
<p>Transformations applied in order:</p>
<ol>
<li>Trim whitespace</li>
<li>Strip bracket prefixes like &quot;[Work] &quot;</li>
<li>Strip priority markers (e.g., &quot;URGENT: &quot;, &quot;Critical - &quot;)</li>
<li>Strip date references (e.g., &quot;tomorrow&quot;, &quot;next week&quot;)</li>
<li>Strip leading articles (&quot;A&quot;, &quot;An&quot;, &quot;The&quot;)</li>
<li>Capitalize first letter (sentence case)</li>
<li>Truncate to maxLength at word boundary with ellipsis</li>
</ol>
</dd>
<dt><a href="#_normalizeContent">_normalizeContent(rawContent, existingContent)</a> ⇒ <code>string</code> | <code>null</code></dt>
<dd><p>Filters content, keeping only useful references (URLs, locations, instructions)
and preserving existing content during updates.</p>
<p>Content cleaning steps:</p>
<ol>
<li>Strip motivational/coaching filler phrases</li>
<li>Strip analysis noise and priority justifications</li>
<li>Preserve URLs, locations, specific instructions, technical details</li>
<li>Preserve actionable sub-step lists</li>
<li>For updates: merge with existing content if new content adds value</li>
</ol>
</dd>
<dt><a href="#_truncateContent">_truncateContent(content, maxLength)</a> ⇒ <code>string</code> | <code>null</code></dt>
<dd><p>Truncates content to a max length at a word boundary.
Adds ellipsis when truncation occurs.</p>
</dd>
<dt><a href="#_contentAddsValue">_contentAddsValue(newContent, existingContent)</a> ⇒ <code>boolean</code></dt>
<dd><p>Determines if new content adds value beyond existing content.
Checks for URLs, locations, instructions, or actionable items not already present.</p>
</dd>
<dt><a href="#_cleanChecklistItemTitle">_cleanChecklistItemTitle(rawTitle)</a> ⇒ <code>string</code> | <code>null</code></dt>
<dd><p>Cleans a single checklist item title.
Trims whitespace, strips filler, truncates at word boundary.</p>
</dd>
<dt><a href="#_normalizeChecklistItems">_normalizeChecklistItems(rawItems)</a> ⇒ <code>Array</code></dt>
<dd><p>Normalizes and validates raw extracted checklist items.</p>
<p>Accept raw extracted checklistItems, return clean items or empty array.
Clean item text — trim, strip filler, drop empty, truncate ~50 chars.
Cap at 30 items, log truncation.
Assign zero-based sort order when absent.
Validate — require non-empty title, default status to 0 (incomplete),
       reject nested checklist structures.</p>
</dd>
<dt><a href="#_convertRepeatHint">_convertRepeatHint(repeatHint)</a> ⇒ <code>string</code> | <code>null</code></dt>
<dd><p>Converts natural-language recurrence hints to RRULE strings.</p>
<p>Supported patterns:</p>
<ul>
<li>Simple: &quot;daily&quot;, &quot;weekdays&quot;, &quot;weekends&quot;, &quot;weekly&quot;, &quot;biweekly&quot;, &quot;monthly&quot;, &quot;yearly&quot;</li>
<li>&quot;every <day>&quot;: &quot;every monday&quot;, &quot;every sunday&quot;</li>
<li>&quot;every <day> and <day>&quot;: &quot;every tuesday and thursday&quot;</li>
<li>&quot;weekly on <day>&quot;: &quot;weekly on monday&quot;, &quot;weekly on friday&quot;</li>
<li>&quot;every other day&quot;: RRULE:FREQ=DAILY;INTERVAL=2</li>
</ul>
</dd>
<dt><a href="#_resolveProject">_resolveProject()</a></dt>
<dd><p>Resolves a project hint string to a concrete TickTick project destination.
Expects a list of projects from the TickTick API.</p>
<p>Resolution order:</p>
<ol>
<li>Exact project ID when hinted</li>
<li>Exactly one exact project-name match when hinted</li>
<li>defaultProjectResolution only when no projectHint exists</li>
<li>defaultProjectId only when no projectHint exists and resolution is not provided</li>
</ol>
</dd>
<dt><a href="#_expandDueDate">_expandDueDate()</a></dt>
<dd><p>Expands relative dates to absolute ISO strings.
Keeps simple relative-date handling inside the normalizer to avoid bot-layer coupling.</p>
</dd>
<dt><a href="#_normalizeContentForMutation">_normalizeContentForMutation(newContent, existingContent)</a> ⇒ <code>string</code> | <code>null</code></dt>
<dd><p>Normalizes content for mutation actions (update/complete/delete).</p>
<p>Preserve existing task content on updates unless the new content adds value.
Only replaces content when the user explicitly provides new content that
adds value beyond the existing description. Otherwise, existing content
is preserved verbatim.</p>
</dd>
<dt><a href="#validateMutationBatch">validateMutationBatch(actions)</a> ⇒ <code>Object</code></dt>
<dd><p>Validates a batch of normalized actions for supported mutation shapes.</p>
<p>Reject mixed create+mutation and multi-mutation batches
that are out of scope for v1 single-target mutation.</p>
</dd>
<dt><a href="#_validateAction">_validateAction()</a></dt>
<dd><p>Validates a normalized action.</p>
<p>Mutation validation:</p>
<ul>
<li>Mutation actions (update/complete/delete) require a resolved taskId.</li>
<li>Fails closed when taskId is missing.</li>
<li>Confidence threshold still applies.</li>
</ul>
</dd>
<dt><a href="#_parseDateList">_parseDateList()</a></dt>
<dd><p>Parses a comma or space separated list of days into an array.</p>
</dd>
<dt><a href="#_resolveActionType">_resolveActionType()</a></dt>
<dd><p>Resolves the action type, auto-switching to &#39;update&#39; if an existing task is provided.</p>
</dd>
<dt><a href="#normalizeAction">normalizeAction()</a></dt>
<dd><p>Normalizes a single intent action.</p>
<p>Mutation support:</p>
<ul>
<li><code>options.resolvedTask</code> carries the resolver&#39;s selected task { id, projectId, title }.</li>
<li><code>options.existingTaskContent</code> preserves the original task description on updates.</li>
<li><code>targetQuery</code> is passed through from extracted intent for logging/diagnostics.</li>
<li>Mutation actions without a resolved taskId fail validation (fail-closed).</li>
</ul>
</dd>
<dt><a href="#normalizeActions">normalizeActions()</a></dt>
<dd><p>Normalizes multiple intent actions, expanding multi-day tasks.</p>
<p>Validates batch shape to reject mixed create+mutation or
multi-mutation requests that are out of scope for v1.</p>
</dd>
<dt><a href="#normalizeActionBatch">normalizeActionBatch()</a></dt>
<dd><p>Normalizes and validates a batch of intent actions.
Returns { actions, batchError } where batchError is set when the
batch shape is unsupported (mixed create+mutation, multi-mutation).</p>
<p>Single entry point for pipeline to normalize and validate batch shape.</p>
</dd>
<dt><a href="#formatBusyLockMessage">formatBusyLockMessage(lockStatus, [label])</a> ⇒ <code>string</code></dt>
<dd><p>Format conservative user-facing copy for a busy intake lock.</p>
</dd>
<dt><a href="#validateOperationReceipt">validateOperationReceipt(receipt)</a> ⇒ <code>Object</code></dt>
<dd><p>Validate an OperationReceipt-like object against stage-1 invariants.</p>
</dd>
<dt><a href="#assertValidOperationReceipt">assertValidOperationReceipt(receipt)</a> ⇒ <code>object</code></dt>
<dd><p>Assert that a candidate receipt satisfies the OperationReceipt contract.</p>
</dd>
<dt><a href="#cloneValue">cloneValue(value)</a> ⇒ <code>*</code></dt>
<dd><p>Clones a value using structuredClone or JSON fallback.</p>
</dd>
<dt><a href="#deepFreeze">deepFreeze(value, [seen])</a> ⇒ <code>*</code></dt>
<dd><p>Recursively freezes an object and its nested properties.</p>
</dd>
<dt><a href="#sanitizePipelineDiagnosticValue">sanitizePipelineDiagnosticValue(value)</a> ⇒ <code>*</code></dt>
<dd><p>Sanitizes an object for diagnostics by redacting sensitive keys.</p>
</dd>
<dt><a href="#snapshotPipelineValue">snapshotPipelineValue(value)</a> ⇒ <code>*</code></dt>
<dd><p>Creates a deep clone of a pipeline value.</p>
</dd>
<dt><a href="#snapshotPrivacySafePipelineValue">snapshotPrivacySafePipelineValue(value)</a> ⇒ <code>*</code></dt>
<dd><p>Creates a redacted deep clone of a pipeline value for logging.</p>
</dd>
<dt><a href="#sanitizePipelineContextForDiagnostics">sanitizePipelineContextForDiagnostics(context)</a> ⇒ <code>Object</code></dt>
<dd><p>Redacts sensitive info and freezes a pipeline context for diagnostics.</p>
</dd>
<dt><a href="#updatePipelineContext">updatePipelineContext(context, updater)</a> ⇒ <code>Object</code></dt>
<dd><p>Updates a pipeline context using a draft/updater pattern and freezes the result.</p>
</dd>
<dt><a href="#createLifecycleState">createLifecycleState(baseContext)</a> ⇒ <code>Object</code></dt>
<dd><p>Creates the initial lifecycle state for a new pipeline request.</p>
</dd>
<dt><a href="#normalizeChecklistContext">normalizeChecklistContext(value)</a> ⇒ <code>Object</code> | <code>null</code></dt>
<dd><p>Normalizes and validates checklist context metadata.</p>
</dd>
<dt><a href="#coerceDate">coerceDate(value, fallback)</a> ⇒ <code>Date</code></dt>
<dd><p>Coerces a value to a Date object.</p>
</dd>
<dt><a href="#formatCurrentDate">formatCurrentDate(date, timezone)</a> ⇒ <code>string</code></dt>
<dd><p>Formats a Date as a YYYY-MM-DD string in a specific timezone.</p>
</dd>
<dt><a href="#isDateOnlyString">isDateOnlyString(value)</a> ⇒ <code>boolean</code></dt>
<dd><p>Checks if a string is in YYYY-MM-DD format.</p>
</dd>
<dt><a href="#normalizeProjects">normalizeProjects(projects)</a> ⇒ <code>Array</code></dt>
<dd><p>Ensures projects value is an array.</p>
</dd>
<dt><a href="#deriveProjectNames">deriveProjectNames(projects)</a> ⇒ <code>Array.&lt;string&gt;</code></dt>
<dd><p>Extracts non-empty project names from an array of project objects.</p>
</dd>
<dt><a href="#validatePipelineContext">validatePipelineContext(context)</a> ⇒ <code>Object</code></dt>
<dd><p>Validates a pipeline context object against required fields and types.</p>
</dd>
<dt><a href="#createPipelineContextBuilder">createPipelineContextBuilder(options)</a> ⇒ <code>Object</code></dt>
<dd><p>Creates a pipeline context builder for generating request contexts.</p>
</dd>
<dt><a href="#normalizeEntryPoint">normalizeEntryPoint(entryPoint, mode)</a> ⇒ <code>string</code></dt>
<dd><p>Normalizes an entry point name based on the execution mode.</p>
</dd>
<dt><a href="#emitConsole">emitConsole(logger, event)</a></dt>
<dd><p>Emits an event to the console logger.</p>
</dd>
<dt><a href="#emitToSink">emitToSink(sink, methodName, ...args)</a> ⇒ <code>Promise.&lt;void&gt;</code></dt>
<dd><p>Emits an event to a sink (function or object with method).</p>
</dd>
<dt><a href="#createPipelineObservability">createPipelineObservability([options])</a> ⇒ <code>Object</code></dt>
<dd><p>Creates a pipeline observability instance for emitting telemetry.</p>
</dd>
<dt><a href="#persistPipelineUndoEntries">persistPipelineUndoEntries(params)</a> ⇒ <code>Promise.&lt;Object&gt;</code></dt>
<dd><p>Persist undo entries for successful pipeline results.
Persistence failure is best-effort only; per-entry errors are collected and never thrown.</p>
</dd>
<dt><a href="#parseNonNegativeIntEnv">parseNonNegativeIntEnv(value, fallback)</a> ⇒ <code>number</code></dt>
<dd><p>Parses a non-negative integer from an environment variable with a fallback.</p>
</dd>
<dt><a href="#getPipelineRetryConfig">getPipelineRetryConfig()</a> ⇒ <code>Object</code></dt>
<dd><p>Gets the retry configuration for the pipeline from environment variables.</p>
</dd>
<dt><a href="#normalizeRetryDelayMs">normalizeRetryDelayMs(retryAfterMs, retryAt)</a> ⇒ <code>number</code> | <code>null</code></dt>
<dd><p>Normalizes retry delay to milliseconds.</p>
</dd>
<dt><a href="#formatRetryEta">formatRetryEta(retryAfterMs, retryAt)</a> ⇒ <code>string</code> | <code>null</code></dt>
<dd><p>Formats a retry delay as a human-readable ETA (e.g., &quot;5s&quot;, &quot;2m&quot;, &quot;1h&quot;).</p>
</dd>
<dt><a href="#extractAdapterErrorMeta">extractAdapterErrorMeta(errorOrMessage)</a> ⇒ <code>Object</code></dt>
<dd><p>Extracts structured metadata from an adapter error.</p>
</dd>
<dt><a href="#classifyAdapterFailureCategory">classifyAdapterFailureCategory(errorOrMessage)</a> ⇒ <code>string</code></dt>
<dd><p>Classifies an adapter failure into a failure category (transient vs permanent).</p>
</dd>
<dt><a href="#deriveFailureCategory">deriveFailureCategory(params)</a> ⇒ <code>string</code></dt>
<dd><p>Derives the overall failure category from pipeline state.</p>
</dd>
<dt><a href="#buildUserFailureMessage">buildUserFailureMessage(params)</a> ⇒ <code>string</code></dt>
<dd><p>Builds a user-facing failure message from pipeline failure state.</p>
</dd>
<dt><a href="#resolveDevMode">resolveDevMode(context)</a> ⇒ <code>boolean</code></dt>
<dd><p>Resolves whether dev/debug mode is active from context or environment.</p>
</dd>
<dt><a href="#buildFailureResult">buildFailureResult(context, params)</a> ⇒ <code>Object</code></dt>
<dd><p>Builds a structured pipeline failure result object.</p>
</dd>
<dt><a href="#createPipeline">createPipeline(options)</a> ⇒ <code>Object</code></dt>
<dd><p>Create a pipeline instance that orchestrates intent extraction, normalization,
and TickTick adapter execution.</p>
</dd>
<dt><a href="#resolveProjectCategory">resolveProjectCategory(projectName)</a> ⇒ <code>Object</code> | <code>null</code></dt>
<dd><p>Resolve a project name or alias to its category configuration.</p>
</dd>
<dt><a href="#resolveProjectCategoryFromPolicy">resolveProjectCategoryFromPolicy(projectName, policy)</a> ⇒ <code>Object</code> | <code>null</code></dt>
<dd><p>Resolve a project name or alias against an explicit policy object.</p>
</dd>
<dt><a href="#getCategoryConfig">getCategoryConfig()</a></dt>
<dd><p>Get the category configuration for a given category key.
Falls back to uncategorized if unknown.</p>
</dd>
<dt><a href="#getConfiguredProjectNames">getConfiguredProjectNames()</a></dt>
<dd><p>Get all configured project names (for inference helpers).</p>
</dd>
<dt><a href="#isConfiguredProject">isConfiguredProject()</a></dt>
<dd><p>Check if a project is explicitly configured.</p>
</dd>
<dt><a href="#shouldSuppressScheduledNotification">shouldSuppressScheduledNotification(workStyleMode, notificationType)</a> ⇒ <code>boolean</code></dt>
<dd><p>Determines if a notification should be suppressed based on current work-style mode.</p>
</dd>
<dt><a href="#shouldSendMissedDelivery">shouldSendMissedDelivery(lastDeliveryIso, scheduledTimeIso, graceWindowMinutes)</a> ⇒ <code>boolean</code></dt>
<dd><p>Check if a scheduled delivery should be sent based on last delivery time and grace window</p>
</dd>
<dt><a href="#buildSchedulingMetadata">buildSchedulingMetadata(scheduleKey, scheduledForIso, graceWindowMinutes)</a> ⇒ <code>Object</code></dt>
<dd><p>Helper to build scheduling metadata context for consistent delivery path</p>
</dd>
<dt><a href="#runDailyBriefingJob">runDailyBriefingJob(deps)</a> ⇒ <code>Promise.&lt;boolean&gt;</code></dt>
<dd><p>Executes the daily briefing job, including task fetch, Gemini summary, and notification.</p>
</dd>
<dt><a href="#runWeeklyDigestJob">runWeeklyDigestJob(deps)</a> ⇒ <code>Promise.&lt;boolean&gt;</code></dt>
<dd><p>Executes the weekly digest job, analyzing processed tasks from the past week.</p>
</dd>
<dt><a href="#retryDeferredIntents">retryDeferredIntents(deps, [options])</a> ⇒ <code>Object</code></dt>
<dd><p>Retry deferred pipeline intents that were saved when the TickTick API
was unavailable (R12 graceful degradation).  Runs on startup and
periodically during the poll cycle.</p>
</dd>
<dt><a href="#runStartupCatchupJobs">runStartupCatchupJobs(services, [config], [options])</a> ⇒ <code>Promise.&lt;{daily: boolean, weekly: boolean}&gt;</code></dt>
<dd><p>Orchestrates catch-up jobs on startup for any missed scheduled deliveries.</p>
</dd>
<dt><a href="#startScheduler">startScheduler(bot, ticktick, gemini, adapter, pipeline, config)</a> ⇒ <code>Promise.&lt;void&gt;</code></dt>
<dd><p>Initializes and starts the cron-based scheduler.</p>
</dd>
<dt><a href="#toArray">toArray(value)</a> ⇒ <code>Array</code></dt>
<dd><p>Safely coerce a value to array. Returns empty array for non-arrays.</p>
</dd>
<dt><a href="#toString">toString(value, [fallback])</a> ⇒ <code>string</code></dt>
<dd><p>Safely extract a non-empty trimmed string, returning fallback otherwise.</p>
</dd>
<dt><a href="#answerCallbackQueryBestEffort">answerCallbackQueryBestEffort(ctx, [options])</a> ⇒ <code>Promise.&lt;(*|null)&gt;</code></dt>
<dd><p>Acknowledge a Telegram callback without failing the business action when the
callback query has already expired.</p>
</dd>
<dt><a href="#asActiveTasks">asActiveTasks([tasks])</a> ⇒ <code>Array</code></dt>
<dd><p>Filter tasks to active ones (status 0 or undefined).</p>
</dd>
<dt><a href="#asProcessedHistory">asProcessedHistory([processedHistory])</a> ⇒ <code>Array</code></dt>
<dd><p>Filter history entries to valid objects.</p>
</dd>
<dt><a href="#mergeNotices">mergeNotices([baseNotices], [modelNotices])</a> ⇒ <code>Array</code></dt>
<dd><p>Merge two notice arrays, deduplicating by <code>code</code>.
Base notices take precedence over model notices for same code.</p>
</dd>
<dt><a href="#isAuthorized">isAuthorized(ctx)</a> ⇒ <code>boolean</code></dt>
<dd><p>Checks if a Telegram context originates from the authorized chat.</p>
</dd>
<dt><a href="#guardAccess">guardAccess(ctx)</a> ⇒ <code>Promise.&lt;boolean&gt;</code></dt>
<dd><p>Guards access to bot commands, replying with a lock message if unauthorized.</p>
</dd>
<dt><a href="#buildUndoEntry">buildUndoEntry(params)</a> ⇒ <code>Object</code></dt>
<dd><p>Builds an undo entry for the state store to allow reverting mutations.</p>
</dd>
<dt><a href="#projectNameFor">projectNameFor()</a></dt>
<dd><p>Display-only project label helper. Never use for write routing.</p>
</dd>
<dt><a href="#buildFieldDiff">buildFieldDiff(snapshot, action, [options])</a> ⇒ <code>Array.&lt;{field:string, label:string, oldValue:string, newValue:string, emoji:string}&gt;</code></dt>
<dd><p>Builds user-facing old-to-new field diffs for task mutations.</p>
</dd>
<dt><a href="#formatFieldDiff">formatFieldDiff(diffs, [options])</a> ⇒ <code>string</code></dt>
<dd><p>Formats task field diffs into compact Telegram-safe lines.</p>
</dd>
<dt><a href="#userNow">userNow()</a> ⇒ <code>Object</code></dt>
<dd><p>Get the user&#39;s current time as date components in their timezone.</p>
</dd>
<dt><a href="#userTodayFormatted">userTodayFormatted()</a></dt>
<dd><p>Format today&#39;s date as &quot;Monday, 21 February 2026&quot; in the user&#39;s timezone</p>
</dd>
<dt><a href="#userLocaleString">userLocaleString(date)</a> ⇒ <code>string</code></dt>
<dd><p>Formats a Date object as a localized string in the user&#39;s timezone.</p>
</dd>
<dt><a href="#userTimeString">userTimeString()</a> ⇒ <code>string</code></dt>
<dd><p>Returns the current time formatted for logs in the user&#39;s timezone.</p>
</dd>
<dt><a href="#atTimeISO">atTimeISO()</a></dt>
<dd><p>Build an ISO datetime string for TickTick, with correct timezone offset</p>
</dd>
<dt><a href="#endOfDayISO">endOfDayISO()</a></dt>
<dd><p>Build an ISO date string at end-of-day</p>
</dd>
<dt><a href="#parseDateStringToTickTickISO">parseDateStringToTickTickISO()</a></dt>
<dd><p>Safely parse a YYYY-MM-DD string into a TickTick ISO string with the current user&#39;s timezone offset
following Postel&#39;s Law to shield against messy LLM output.</p>
</dd>
<dt><a href="#containsSensitiveContent">containsSensitiveContent(text)</a> ⇒ <code>boolean</code></dt>
<dd><p>Conservative sensitive-content detector to prevent destructive rewrites.</p>
</dd>
<dt><a href="#scheduleToDateTime">scheduleToDateTime(bucket, [options])</a> ⇒ <code>string</code> | <code>null</code></dt>
<dd><p>Maps a scheduling bucket (e.g., &#39;today&#39;) to an ISO datetime string.</p>
</dd>
<dt><a href="#scheduleToDate">scheduleToDate(bucket, [options])</a> ⇒ <code>string</code> | <code>null</code></dt>
<dd><p>Alias for scheduleToDateTime that returns a TickTick ISO string.</p>
</dd>
<dt><a href="#buildTickTickUpdate">buildTickTickUpdate(data, [options])</a> ⇒ <code>Object</code></dt>
<dd><p>Builds a TickTick update object for mutations.</p>
</dd>
<dt><a href="#buildTaskCard">buildTaskCard(task, analysis)</a> ⇒ <code>string</code></dt>
<dd><p>Builds a descriptive task card for Telegram display.</p>
</dd>
<dt><a href="#buildTaskCardFromAction">buildTaskCardFromAction(task, action, [projects])</a> ⇒ <code>string</code></dt>
<dd><p>Builds a Telegram review card from a task + normalized action.</p>
</dd>
<dt><a href="#buildImprovedContent">buildImprovedContent(analysis)</a> ⇒ <code>string</code></dt>
<dd><p>Builds the improved task description content from analysis results.</p>
</dd>
<dt><a href="#buildPendingData">buildPendingData(task, analysis, [projects])</a> ⇒ <code>Object</code></dt>
<dd><p>Normalizes task and analysis into a pending task record for the store.</p>
</dd>
<dt><a href="#buildPendingDataFromAction">buildPendingDataFromAction(task, action, [projects])</a> ⇒ <code>Object</code></dt>
<dd><p>Maps a normalized pipeline action to the pending data shape expected by the store and callbacks.</p>
</dd>
<dt><a href="#pendingToAnalysis">pendingToAnalysis(data)</a> ⇒ <code>Object</code></dt>
<dd><p>Maps a stored pending record back to an analysis object shape.</p>
</dd>
<dt><a href="#buildAutoApplyNotification">buildAutoApplyNotification(results, [options])</a> ⇒ <code>string</code> | <code>null</code></dt>
<dd><p>Builds a notification message for auto-applied task updates.
Shows per-task field diffs when available (via <code>diffs</code> array on each result),
falls back to legacy schedule/movedTo format for entries without diffs.
Limits visible tasks to 5 with overflow line.</p>
</dd>
<dt><a href="#sleep">sleep(ms)</a> ⇒ <code>Promise.&lt;void&gt;</code></dt>
<dd><p>Utility to pause execution for a given duration.</p>
</dd>
<dt><a href="#truncateMessage">truncateMessage(text, [limit])</a> ⇒ <code>string</code></dt>
<dd><p>Truncates a message to stay under Telegram&#39;s character limit.</p>
</dd>
<dt><a href="#escapeHTML">escapeHTML(str)</a> ⇒ <code>string</code></dt>
<dd><p>Escapes HTML special characters for safe inclusion in Telegram HTML messages.</p>
</dd>
<dt><a href="#parseTelegramMarkdownToHTML">parseTelegramMarkdownToHTML(text)</a> ⇒ <code>string</code></dt>
<dd><p>Parses basic Telegram Markdown into HTML tags supported by Telegraf/Telegram.</p>
</dd>
<dt><a href="#replyWithMarkdown">replyWithMarkdown(ctx, text, [extra])</a> ⇒ <code>Promise.&lt;Object&gt;</code></dt>
<dd><p>Sends a reply using HTML parse mode, converting Markdown input.</p>
</dd>
<dt><a href="#editWithMarkdown">editWithMarkdown(ctx, text, [extra])</a> ⇒ <code>Promise.&lt;Object&gt;</code></dt>
<dd><p>Edits a message using HTML parse mode, converting Markdown input.</p>
</dd>
<dt><a href="#sendWithMarkdown">sendWithMarkdown(api, chatId, text, [extra])</a> ⇒ <code>Promise.&lt;Object&gt;</code></dt>
<dd><p>Sends a message via Bot API using HTML parse mode, converting Markdown input.</p>
</dd>
<dt><a href="#appendUrgentModeReminder">appendUrgentModeReminder(text, urgentMode)</a> ⇒ <code>string</code></dt>
<dd><p>Appends an urgent mode reminder to the text if urgent mode is active.</p>
</dd>
<dt><a href="#formatBriefingHeader">formatBriefingHeader(params)</a> ⇒ <code>string</code></dt>
<dd><p>Formats a briefing header for various summary surfaces.</p>
</dd>
<dt><a href="#filterProcessedThisWeek">filterProcessedThisWeek(processedTasks, [fallbackKeys])</a> ⇒ <code>Object</code></dt>
<dd><p>Filters processed tasks to include only those from the last 7 days.</p>
</dd>
<dt><a href="#buildQuotaExhaustedMessage">buildQuotaExhaustedMessage(gemini)</a> ⇒ <code>string</code></dt>
<dd><p>Builds a user-friendly message when Gemini AI quota is exhausted.</p>
</dd>
<dt><a href="#formatProcessedTask">formatProcessedTask(task)</a> ⇒ <code>string</code></dt>
<dd><p>Formats a single processed task for summary displays.</p>
</dd>
<dt><a href="#buildMutationConfirmationMessage">buildMutationConfirmationMessage(pendingConfirmation, [options])</a> ⇒ <code>string</code></dt>
<dd><p>Builds a confirmation message for destructive/non-exact mutations.</p>
</dd>
<dt><a href="#buildMutationConfirmationKeyboard">buildMutationConfirmationKeyboard([options])</a> ⇒ <code>InlineKeyboard</code></dt>
<dd><p>Builds an inline keyboard for mutation confirmation.</p>
</dd>
<dt><a href="#truncateCandidateLabel">truncateCandidateLabel(title)</a> ⇒ <code>string</code></dt>
<dd><p>Truncates a task candidate label for inline keyboard display.</p>
</dd>
<dt><a href="#buildMutationCandidateKeyboard">buildMutationCandidateKeyboard(candidates, [options])</a> ⇒ <code>InlineKeyboard</code></dt>
<dd><p>Builds an inline keyboard for selecting mutation candidates.</p>
</dd>
<dt><a href="#buildMutationClarificationMessage">buildMutationClarificationMessage(reason, candidates, intentSummary, [options])</a> ⇒ <code>string</code></dt>
<dd><p>Builds a clarification message for ambiguous task mutations.</p>
</dd>
<dt><a href="#validateChecklistItem">validateChecklistItem(item)</a> ⇒ <code>Object</code> | <code>null</code></dt>
<dd><p>Validates a single checklist item&#39;s structural integrity.
Used by both normalizer (post-cleaning) and adapter (pre-API).</p>
</dd>
<dt><a href="#buildUndoEntryFromRollbackStep">buildUndoEntryFromRollbackStep(rollbackStep, action)</a> ⇒ <code>Object</code></dt>
<dd><p>Builds an undo entry from a pipeline rollbackStep and action.
Maps pipeline rollback types (delete_created, restore_updated, recreate_deleted, uncomplete_task)
to undo entries that can be persisted via store.addUndoEntry and executed by executeUndoEntry.</p>
</dd>
<dt><a href="#buildFreeformReceipt">buildFreeformReceipt(result, [options])</a> ⇒ <code>string</code></dt>
<dd><p>Builds a transparent receipt from a pipeline result for freeform task mutations.
Shows per-action type with title, field diffs for updates, and skipped-action warnings.</p>
</dd>
<dt><a href="#isFollowUpMessage">isFollowUpMessage(text)</a> ⇒ <code>boolean</code></dt>
<dd><p>Detects if a freeform message is likely a follow-up referring to a recent task.</p>
</dd>
<dt><a href="#retryWithBackoff">retryWithBackoff(fn, [options])</a> ⇒ <code>Promise.&lt;*&gt;</code></dt>
<dd><p>Retry an async operation with exponential backoff for transient failures.</p>
</dd>
<dt><a href="#tryAcquireIntakeLock">tryAcquireIntakeLock([options])</a> ⇒ <code>boolean</code></dt>
<dd><p>Try to acquire the shared TickTick intake lock.</p>
<p>The lock prevents overlapping poll/scan/review cycles from mutating the same
TickTick intake stream at once. Expired locks self-heal on the next acquire
attempt instead of blocking forever after a crash.</p>
</dd>
<dt><a href="#releaseIntakeLock">releaseIntakeLock()</a> ⇒ <code>void</code></dt>
<dd><p>Release the shared TickTick intake lock.</p>
<p>Callers should release only locks they acquired. The lock also expires by TTL
as a defensive fallback for process crashes or interrupted async flows.</p>
</dd>
<dt><a href="#getIntakeLockStatus">getIntakeLockStatus([options])</a> ⇒ <code>Object</code> | <code>Object</code></dt>
<dd><p>Get diagnostic metadata for the shared TickTick intake lock.</p>
</dd>
<dt><a href="#getChatId">getChatId()</a> ⇒ <code>number</code> | <code>null</code></dt>
<dd><p>Get the stored Telegram chat ID.</p>
</dd>
<dt><a href="#setChatId">setChatId(id)</a> ⇒ <code>Promise.&lt;void&gt;</code></dt>
<dd><p>Persist a Telegram chat ID to the store.</p>
</dd>
<dt><a href="#getWorkStyleMode">getWorkStyleMode()</a></dt>
<dd><p>Get the current work-style mode for a user.
Returns the active mode, automatically reverting to standard if expired.</p>
</dd>
<dt><a href="#setWorkStyleMode">setWorkStyleMode(userId, mode, options)</a></dt>
<dd><p>Set the work-style mode for a user.
Mode transitions are explicit — never changes without user action or auto-expiry.</p>
</dd>
<dt><a href="#reconcileTaskState">reconcileTaskState()</a> ⇒ <code>Object</code></dt>
<dd><p>Remove pending and failed entries for tasks no longer active in TickTick.</p>
</dd>
<dt><a href="#markTaskFailed">markTaskFailed([retryAfterMs])</a></dt>
<dd><p>Park a task that failed analysis — prevents re-polling until retryAfterMs expires.</p>
</dd>
<dt><a href="#approveTask">approveTask(taskId)</a> ⇒ <code>Promise.&lt;(Object|null)&gt;</code></dt>
<dd><p>Approve a pending task, marking it as processed.
Delegates to resolveTask with status &#39;approve&#39;.</p>
</dd>
<dt><a href="#skipTask">skipTask(taskId)</a> ⇒ <code>Promise.&lt;(Object|null)&gt;</code></dt>
<dd><p>Skip a pending task, marking it as processed without taking action.
Delegates to resolveTask with status &#39;skip&#39;.</p>
</dd>
<dt><a href="#dropTask">dropTask(taskId)</a> ⇒ <code>Promise.&lt;(Object|null)&gt;</code></dt>
<dd><p>Drop a pending task, marking it as processed and deprioritized.
Delegates to resolveTask with status &#39;drop&#39;.</p>
</dd>
<dt><a href="#markTaskStale">markTaskStale(taskId, [data])</a> ⇒ <code>Promise.&lt;void&gt;</code></dt>
<dd><p>Mark a pending task stale after it aged out of active review.
Preserves the pending snapshot, flags the processed entry stale, and removes it from the pending queue.</p>
</dd>
<dt><a href="#getQueueHealthSnapshot">getQueueHealthSnapshot()</a> ⇒ <code>Object</code></dt>
<dd><p>Returns a snapshot of queue health for telemetry.</p>
</dd>
<dt><a href="#setQueueBlocked">setQueueBlocked(isBlocked)</a></dt>
<dd><p>Sets or clears the queue blocked state.</p>
</dd>
<dt><a href="#getPendingBatch">getPendingBatch(options)</a> ⇒ <code>Array</code></dt>
<dd><p>Return a sorted slice of pending tasks.</p>
</dd>
<dt><a href="#getNextPendingTask">getNextPendingTask()</a> ⇒ <code>Array</code> | <code>null</code></dt>
<dd><p>Return the oldest pending task (by sentAt).</p>
</dd>
<dt><a href="#getPendingChecklistClarification">getPendingChecklistClarification()</a> ⇒ <code>Object</code> | <code>null</code></dt>
<dd><p>Gets the pending checklist clarification if it exists and hasn&#39;t expired.</p>
</dd>
<dt><a href="#setPendingChecklistClarification">setPendingChecklistClarification(data)</a> ⇒ <code>Promise.&lt;void&gt;</code></dt>
<dd><p>Stores a pending checklist clarification with automatic timestamp.</p>
</dd>
<dt><a href="#clearPendingChecklistClarification">clearPendingChecklistClarification()</a> ⇒ <code>Promise.&lt;void&gt;</code></dt>
<dd><p>Clears the pending checklist clarification state.</p>
</dd>
<dt><a href="#updateDeferredPipelineIntent">updateDeferredPipelineIntent(updatedEntry)</a></dt>
<dd><p>Update a deferred pipeline intent in place (e.g., increment retry count).</p>
</dd>
<dt><a href="#getUndoBatch">getUndoBatch(batchId)</a> ⇒ <code>Array.&lt;Object&gt;</code></dt>
<dd><p>Get all undo entries sharing a batchId.</p>
</dd>
<dt><a href="#getLastAutoApplyBatch">getLastAutoApplyBatch()</a> ⇒ <code>Array.&lt;Object&gt;</code></dt>
<dd><p>Get all undo entries from the most recent auto-apply batch.
Groups by batchId; if no batchId, falls back to the single most recent auto-apply entry.</p>
</dd>
<dt><a href="#removeUndoEntries">removeUndoEntries(entries)</a></dt>
<dd><p>Remove specific undo entries by reference identity.</p>
</dd>
<dt><a href="#getStats">getStats()</a> ⇒ <code>Object</code></dt>
<dd><p>Get the cumulative stats snapshot.</p>
</dd>
<dt><a href="#updateStats">updateStats(updates)</a> ⇒ <code>Promise.&lt;void&gt;</code></dt>
<dd><p>Merge partial updates into the cumulative stats.</p>
</dd>
<dt><a href="#getProcessedTasks">getProcessedTasks()</a> ⇒ <code>Object.&lt;string, Object&gt;</code></dt>
<dd><p>Get all processed task entries.</p>
</dd>
<dt><a href="#getProcessedCount">getProcessedCount()</a> ⇒ <code>number</code></dt>
<dd><p>Count the total number of processed task entries.</p>
</dd>
<dt><a href="#resetAll">resetAll()</a></dt>
<dd><p>Wipe all data and start fresh</p>
</dd>
<dt><a href="#selectBehavioralPatternsForSummary">selectBehavioralPatternsForSummary([patterns], [options])</a> ⇒ <code>Array.&lt;Object&gt;</code></dt>
<dd><p>Select the most relevant behavioral patterns for a summary surface.</p>
</dd>
<dt><a href="#buildBehavioralPatternNotice">buildBehavioralPatternNotice([patterns], [options])</a> ⇒ <code>Object</code> | <code>null</code></dt>
<dd><p>Build a single summary notice from the most significant behavioral pattern.</p>
</dd>
<dt><a href="#composeBriefingSummarySections">composeBriefingSummarySections(params)</a> ⇒ <code>Object</code></dt>
<dd><p>Compose the individual sections of a daily briefing summary.</p>
</dd>
<dt><a href="#composeDailyCloseSummarySections">composeDailyCloseSummarySections(params)</a> ⇒ <code>Object</code></dt>
<dd><p>Compose the individual sections of a daily close (reflection) summary.</p>
</dd>
<dt><a href="#normalizeWeeklyWatchouts">normalizeWeeklyWatchouts(watchouts)</a> ⇒ <code>Array.&lt;object&gt;</code></dt>
<dd><p>Normalizes weekly watchouts by filtering disallowed labels and missing data.</p>
</dd>
<dt><a href="#normalizeBriefingSummary">normalizeBriefingSummary(summary)</a> ⇒ <code>object</code></dt>
<dd><p>Normalizes a briefing summary object.</p>
</dd>
<dt><a href="#normalizeWeeklySummary">normalizeWeeklySummary(summary)</a> ⇒ <code>object</code></dt>
<dd><p>Normalizes a weekly summary object.</p>
</dd>
<dt><a href="#normalizeDailyCloseSummary">normalizeDailyCloseSummary(summary)</a> ⇒ <code>object</code></dt>
<dd><p>Normalizes a daily close summary object.</p>
</dd>
<dt><a href="#createSummaryDiagnostics">createSummaryDiagnostics(params)</a> ⇒ <code>object</code></dt>
<dd><p>Creates summary diagnostics for observability.</p>
</dd>
<dt><a href="#buildSummaryLogPayload">buildSummaryLogPayload(params)</a> ⇒ <code>object</code></dt>
<dd><p>Builds a summary log payload for telemetry.</p>
</dd>
<dt><a href="#logSummarySurfaceEvent">logSummarySurfaceEvent(params)</a></dt>
<dd><p>Logs a summary surface event to the console.</p>
</dd>
<dt><a href="#composeBriefingSummary">composeBriefingSummary(params)</a> ⇒ <code>object</code></dt>
<dd><p>Stable summary-surface contract for daily briefing composition.</p>
</dd>
<dt><a href="#composeWeeklySummary">composeWeeklySummary(params)</a> ⇒ <code>object</code></dt>
<dd><p>Stable summary-surface contract for weekly review composition.</p>
</dd>
<dt><a href="#composeDailyCloseSummary">composeDailyCloseSummary(params)</a> ⇒ <code>object</code></dt>
<dd><p>Stable summary-surface contract for end-of-day reflection composition.</p>
</dd>
<dt><a href="#deriveInterventionProfile">deriveInterventionProfile([processedHistory], [options])</a> ⇒ <code>Object</code></dt>
<dd><p>Derive an intervention profile based on user&#39;s recent engagement with suggestions.</p>
</dd>
<dt><a href="#buildEngagementPatternNotice">buildEngagementPatternNotice([profile], [options])</a> ⇒ <code>Object</code> | <code>null</code></dt>
<dd><p>Build a summary notice based on the derived intervention profile.</p>
</dd>
<dt><a href="#buildReflectionRecomputeContext">buildReflectionRecomputeContext(params)</a> ⇒ <code>Object</code></dt>
<dd><p>Build context for determining if summary should be recomputed from live tasks.</p>
</dd>
<dt><a href="#buildReflectionRecomputeNotice">buildReflectionRecomputeNotice([recomputeContext], [options])</a> ⇒ <code>Object</code> | <code>null</code></dt>
<dd><p>Build a notice explaining if/why summary context was recomputed.</p>
</dd>
<dt><a href="#formatSummary">formatSummary(params)</a> ⇒ <code>Object</code></dt>
<dd><p>Format a structured summary object into a user-facing string.</p>
</dd>
<dt><a href="#composeWeeklySummarySections">composeWeeklySummarySections(params)</a> ⇒ <code>Object</code></dt>
<dd><p>Compose the individual sections of a weekly review summary.</p>
</dd>
<dt><a href="#normalizeTitle">normalizeTitle(title)</a> ⇒ <code>string</code></dt>
<dd><p>Normalize a title for matching: lowercase, trim, collapse whitespace, strip punctuation.</p>
</dd>
<dt><a href="#levenshteinDistance">levenshteinDistance(a, b)</a> ⇒ <code>number</code></dt>
<dd><p>Compute Levenshtein distance between two strings.</p>
</dd>
<dt><a href="#fuzzyScore">fuzzyScore(a, b)</a> ⇒ <code>number</code></dt>
<dd><p>Compute a fuzzy similarity score between 0 and 1 based on Levenshtein distance.</p>
</dd>
<dt><a href="#matchTypeToConfidence">matchTypeToConfidence(matchType)</a> ⇒ <code>&#x27;exact&#x27;</code> | <code>&#x27;high&#x27;</code> | <code>&#x27;medium&#x27;</code> | <code>&#x27;low&#x27;</code></dt>
<dd><p>Derive matchConfidence tier from matchType string.</p>
</dd>
<dt><a href="#scoreTask">scoreTask(task, normalizedQuery, originalQuery)</a> ⇒ <code>object</code> | <code>null</code></dt>
<dd><p>Score one task against the target query.
Returns a candidate object or null if no meaningful match.</p>
</dd>
<dt><a href="#resolveTarget">resolveTarget(params)</a> ⇒ <code>object</code></dt>
<dd><p>Resolve a target query against a set of active tasks.</p>
</dd>
<dt><a href="#buildClarificationPrompt">buildClarificationPrompt(result)</a> ⇒ <code>string</code></dt>
<dd><p>Build a terse clarification prompt from a clarification result.
Returns a string suitable for user-facing clarification.</p>
</dd>
<dt><a href="#areEquivalentDueDates">areEquivalentDueDates(expected, actual)</a> ⇒ <code>boolean</code></dt>
<dd><p>Compares TickTick due-date values by instant, not string offset.
TickTick may return UTC for a date sent with a local timezone offset.</p>
</dd>
<dt><a href="#buildErrorText">buildErrorText(error)</a> ⇒ <code>string</code></dt>
<dd><p>Extracts and concatenates error message chunks from an error object or API response.</p>
</dd>
<dt><a href="#loadUserContextModule">loadUserContextModule([searchPaths])</a> ⇒ <code>Promise.&lt;{mod: (object|null), source: (string|null), path: (string|null)}&gt;</code></dt>
<dd><p>Load user context module by searching paths in order.
Safe failure: logs exact path on error, continues to next path.
Never throws — returns { mod, source, path } with null mod on complete failure.</p>
</dd>
<dt><a href="#getModuleExport">getModuleExport(mod, key)</a> ⇒ <code>*</code> | <code>undefined</code></dt>
<dd><p>Extract a named export from a loaded module, returning undefined if missing.</p>
</dd>
<dt><a href="#getUserTimezone">getUserTimezone()</a> ⇒ <code>string</code></dt>
<dd><p>Fetches the user&#39;s timezone from user_context, environment, or default.</p>
</dd>
<dt><a href="#getUserTimezoneSource">getUserTimezoneSource()</a> ⇒ <code>&#x27;user_context&#x27;</code> | <code>&#x27;env&#x27;</code> | <code>&#x27;default&#x27;</code></dt>
<dd><p>Identifies the source of the resolved user timezone.</p>
</dd>
<dt><a href="#taskReviewKeyboard">taskReviewKeyboard(taskId, [actionType])</a> ⇒ <code>InlineKeyboard</code></dt>
<dd><p>Build an inline keyboard for task review.</p>
</dd>
<dt><a href="#advanceReviewCard">advanceReviewCard(bot, adapter, pipeline)</a></dt>
<dd><p>Register all inline keyboard callback handlers.</p>
</dd>
<dt><a href="#registerCommands">registerCommands(bot, ticktick, gemini, adapter, pipeline, [config])</a></dt>
<dd><p>Registers operational commands (/start, /menu, /status, /reset) and product surface commands (/scan, /pending, /reorg, /undo, /briefing, /weekly, /daily_close, /memory, /forget, /urgent, /focus, /normal, /mode).</p>
</dd>
<dt><a href="#executeActions">executeActions(actions, adapter, currentTasks, [options])</a> ⇒ <code>Promise.&lt;Object&gt;</code></dt>
<dd><p>Execute a list of structured actions against TickTick.</p>
</dd>
<dt><a href="#createBot">createBot(token, ticktick, gemini, adapter, pipeline, [config])</a> ⇒ <code>Bot</code></dt>
<dd><p>Factory function to create and configure a Telegram bot instance.</p>
</dd>
<dt><a href="#buildFreeformPipelineResultReceipt">buildFreeformPipelineResultReceipt(params)</a> ⇒ <code>Promise.&lt;{text: string, replyExtra: Object, undoCount: number}&gt;</code></dt>
<dd><p>Build a freeform Telegram receipt and persist undo entries when possible.
Safe default: persistence failures log and still return the applied receipt.</p>
</dd>
</dl>

<a name="module_behavioral-signals"></a>

## behavioral-signals
Behavioral Signal Classifier — passive observation of task events.

Observes task mutations and emits derived behavioral signals based ONLY
on metadata (dates, counts, categories). NEVER stores raw task titles,
descriptions, or message text.

Low-level signals capture derived task events.
Pattern signals classify the 8 behavioral-memory pattern families using
derived metadata only — never raw titles, descriptions, or message text.


* [behavioral-signals](#module_behavioral-signals)
    * _static_
        * [.SignalType](#module_behavioral-signals.SignalType) : <code>enum</code>
        * [.classifyTaskEvent(event)](#module_behavioral-signals.classifyTaskEvent) ⇒ <code>Array.&lt;BehavioralSignal&gt;</code>
        * [.deriveSubjectKey(taskId)](#module_behavioral-signals.deriveSubjectKey) ⇒ <code>string</code> \| <code>null</code>
        * [.detectSnoozeSpiral(event)](#module_behavioral-signals.detectSnoozeSpiral) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.detectCommitmentOverloader(event)](#module_behavioral-signals.detectCommitmentOverloader) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.detectStaleTaskMuseum(event)](#module_behavioral-signals.detectStaleTaskMuseum) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.detectQuickWinAddiction(event)](#module_behavioral-signals.detectQuickWinAddiction) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.detectVagueTaskWriter(event)](#module_behavioral-signals.detectVagueTaskWriter) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.detectDeadlineDaredevil(event)](#module_behavioral-signals.detectDeadlineDaredevil) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.detectCategoryAvoidance(event)](#module_behavioral-signals.detectCategoryAvoidance) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.detectPlanningWithoutExecution(event)](#module_behavioral-signals.detectPlanningWithoutExecution) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.detectPostpone(event)](#module_behavioral-signals.detectPostpone) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.detectScopeChange(event)](#module_behavioral-signals.detectScopeChange) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.detectDecomposition(event)](#module_behavioral-signals.detectDecomposition) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
        * [.getSignalRegistry()](#module_behavioral-signals.getSignalRegistry) ⇒ <code>Array.&lt;{type: string, requires: Array.&lt;string&gt;}&gt;</code>
    * _inner_
        * [~POSTPONE](#module_behavioral-signals..POSTPONE)
        * [~SCOPE_CHANGE](#module_behavioral-signals..SCOPE_CHANGE)
        * [~DECOMPOSITION](#module_behavioral-signals..DECOMPOSITION)
        * [~PLANNING_HEAVY](#module_behavioral-signals..PLANNING_HEAVY)
        * [~COMPLETION](#module_behavioral-signals..COMPLETION)
        * [~CREATION](#module_behavioral-signals..CREATION)
        * [~DELETION](#module_behavioral-signals..DELETION)
        * [~SNOOZE_SPIRAL](#module_behavioral-signals..SNOOZE_SPIRAL)
        * [~COMMITMENT_OVERLOADER](#module_behavioral-signals..COMMITMENT_OVERLOADER)
        * [~STALE_TASK_MUSEUM](#module_behavioral-signals..STALE_TASK_MUSEUM)
        * [~QUICK_WIN_ADDICTION](#module_behavioral-signals..QUICK_WIN_ADDICTION)
        * [~VAGUE_TASK_WRITER](#module_behavioral-signals..VAGUE_TASK_WRITER)
        * [~DEADLINE_DAREDEVIL](#module_behavioral-signals..DEADLINE_DAREDEVIL)
        * [~CATEGORY_AVOIDANCE](#module_behavioral-signals..CATEGORY_AVOIDANCE)
        * [~PLANNING_WITHOUT_EXECUTION](#module_behavioral-signals..PLANNING_WITHOUT_EXECUTION)
        * [~BehavioralSignal](#module_behavioral-signals..BehavioralSignal) : <code>Object</code>
        * [~TaskMutationEvent](#module_behavioral-signals..TaskMutationEvent) : <code>Object</code>

<a name="module_behavioral-signals.SignalType"></a>

### behavioral-signals.SignalType : <code>enum</code>
Enumerated signal types the classifier can emit.
Each signal uses only derived metadata — never raw content.

**Kind**: static enum of [<code>behavioral-signals</code>](#module_behavioral-signals)  
**Read only**: true  
<a name="module_behavioral-signals.classifyTaskEvent"></a>

### behavioral-signals.classifyTaskEvent(event) ⇒ <code>Array.&lt;BehavioralSignal&gt;</code>
Classifies a task mutation event into zero or more behavioral signals.

PURE FUNCTION: reads event metadata, returns signal objects.
No I/O, no storage, no logging side effects.

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  
**Returns**: <code>Array.&lt;BehavioralSignal&gt;</code> - Zero or more behavioral signals  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>TaskMutationEvent</code> | Task mutation event |

<a name="module_behavioral-signals.deriveSubjectKey"></a>

### behavioral-signals.deriveSubjectKey(taskId) ⇒ <code>string</code> \| <code>null</code>
Derives a stable subject key from a task ID.

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  
**Returns**: <code>string</code> \| <code>null</code> - SHA-256 hash slice or null if invalid  

| Param | Type | Description |
| --- | --- | --- |
| taskId | <code>string</code> | Raw task identifier |

<a name="module_behavioral-signals.detectSnoozeSpiral"></a>

### behavioral-signals.detectSnoozeSpiral(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects a snooze spiral pattern (repeated postponement).

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>TaskMutationEvent</code> | Task mutation event |

<a name="module_behavioral-signals.detectCommitmentOverloader"></a>

### behavioral-signals.detectCommitmentOverloader(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects commitment overloading (creation volume exceeds completion).

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>TaskMutationEvent</code> | Task mutation event |

<a name="module_behavioral-signals.detectStaleTaskMuseum"></a>

### behavioral-signals.detectStaleTaskMuseum(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects stale tasks (old tasks lingering without progress).

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>TaskMutationEvent</code> | Task mutation event |

<a name="module_behavioral-signals.detectQuickWinAddiction"></a>

### behavioral-signals.detectQuickWinAddiction(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects quick-win addiction (dominance of easy/small tasks).

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>TaskMutationEvent</code> | Task mutation event |

<a name="module_behavioral-signals.detectVagueTaskWriter"></a>

### behavioral-signals.detectVagueTaskWriter(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects vague task writing (low-actionability titles).

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>TaskMutationEvent</code> | Task mutation event |

<a name="module_behavioral-signals.detectDeadlineDaredevil"></a>

### behavioral-signals.detectDeadlineDaredevil(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects deadline daredevil behavior (completion at the edge).

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>TaskMutationEvent</code> | Task mutation event |

<a name="module_behavioral-signals.detectCategoryAvoidance"></a>

### behavioral-signals.detectCategoryAvoidance(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects category avoidance (sustained neglect of a category).

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>TaskMutationEvent</code> | Task mutation event |

<a name="module_behavioral-signals.detectPlanningWithoutExecution"></a>

### behavioral-signals.detectPlanningWithoutExecution(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects planning without execution (heavy planning, low completion).

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>TaskMutationEvent</code> | Task mutation event |

<a name="module_behavioral-signals.detectPostpone"></a>

### behavioral-signals.detectPostpone(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects when a task's due date has been pushed forward.

Fires only on forward moves (later date). No judgment on single moves —
repeated postponement is the pattern to watch, not individual actions.

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type |
| --- | --- |
| event | <code>TaskMutationEvent</code> | 

<a name="module_behavioral-signals.detectScopeChange"></a>

### behavioral-signals.detectScopeChange(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects material changes to task scope based on description length
or checklist size changes. Uses lengths/counts, NOT raw text.

Distinguishes wording-only tweaks from actual scope changes.

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type |
| --- | --- |
| event | <code>TaskMutationEvent</code> | 

<a name="module_behavioral-signals.detectDecomposition"></a>

### behavioral-signals.detectDecomposition(event) ⇒ <code>BehavioralSignal</code> \| <code>null</code>
Detects when a task is being broken down into subtasks.

Fires when subtask count increases. Does NOT judge decomposition as
good or bad at signal time — just records the behavioral pattern.

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  

| Param | Type |
| --- | --- |
| event | <code>TaskMutationEvent</code> | 

<a name="module_behavioral-signals.getSignalRegistry"></a>

### behavioral-signals.getSignalRegistry() ⇒ <code>Array.&lt;{type: string, requires: Array.&lt;string&gt;}&gt;</code>
Returns all supported signal types with their metadata requirements.
Used for introspection, documentation, and test coverage verification.

**Kind**: static method of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..POSTPONE"></a>

### behavioral-signals~POSTPONE
Task due date pushed forward repeatedly — procrastination indicator

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..SCOPE_CHANGE"></a>

### behavioral-signals~SCOPE\_CHANGE
Task description or checklist size changed materially — planning churn

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..DECOMPOSITION"></a>

### behavioral-signals~DECOMPOSITION
Subtasks added or task split — decomposition activity

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..PLANNING_HEAVY"></a>

### behavioral-signals~PLANNING\_HEAVY
Heavy planning activity detected without matching execution

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..COMPLETION"></a>

### behavioral-signals~COMPLETION
Task marked complete — execution signal

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..CREATION"></a>

### behavioral-signals~CREATION
New task created — intention captured

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..DELETION"></a>

### behavioral-signals~DELETION
Task deleted — abandonment or cleanup

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..SNOOZE_SPIRAL"></a>

### behavioral-signals~SNOOZE\_SPIRAL
Repeated postponement candidate

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..COMMITMENT_OVERLOADER"></a>

### behavioral-signals~COMMITMENT\_OVERLOADER
Creation volume materially exceeds completion throughput

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..STALE_TASK_MUSEUM"></a>

### behavioral-signals~STALE\_TASK\_MUSEUM
Very old task continues to linger or only gets touched late

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..QUICK_WIN_ADDICTION"></a>

### behavioral-signals~QUICK\_WIN\_ADDICTION
Small/easy tasks dominate observed behavior

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..VAGUE_TASK_WRITER"></a>

### behavioral-signals~VAGUE\_TASK\_WRITER
Title shape suggests low-actionability

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..DEADLINE_DAREDEVIL"></a>

### behavioral-signals~DEADLINE\_DAREDEVIL
Completion happens only at the deadline edge

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..CATEGORY_AVOIDANCE"></a>

### behavioral-signals~CATEGORY\_AVOIDANCE
One category shows sustained neglect

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..PLANNING_WITHOUT_EXECUTION"></a>

### behavioral-signals~PLANNING\_WITHOUT\_EXECUTION
Planning activity grows without matching execution

**Kind**: inner property of [<code>behavioral-signals</code>](#module_behavioral-signals)  
<a name="module_behavioral-signals..BehavioralSignal"></a>

### behavioral-signals~BehavioralSignal : <code>Object</code>
Signal object shape returned by the classifier.

**Kind**: inner typedef of [<code>behavioral-signals</code>](#module_behavioral-signals)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| type | <code>string</code> | One of SignalType values |
| category | <code>string</code> | Task category if available, else 'unknown' |
| projectId | <code>string</code> \| <code>null</code> | Project ID if available |
| confidence | <code>number</code> | 0.0 to 1.0 confidence in the signal |
| subjectKey | <code>string</code> \| <code>null</code> | Stable derived task key for aggregate detection |
| metadata | <code>object</code> | Derived counts/ deltas only; NEVER raw titles/text |
| timestamp | <code>string</code> | ISO timestamp of the event |

<a name="module_behavioral-signals..TaskMutationEvent"></a>

### behavioral-signals~TaskMutationEvent : <code>Object</code>
Task mutation event passed into the classifier.

**Kind**: inner typedef of [<code>behavioral-signals</code>](#module_behavioral-signals)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| eventType | <code>string</code> | 'create' | 'update' | 'complete' | 'delete' |
| taskId | <code>string</code> | Task identifier |
| [category] | <code>string</code> \| <code>null</code> | Task category if known |
| [projectId] | <code>string</code> \| <code>null</code> | Project ID if known |
| [dueDateBefore] | <code>string</code> \| <code>null</code> | Previous due date (for updates) |
| [dueDateAfter] | <code>string</code> \| <code>null</code> | New due date (for updates) |
| [checklistCountBefore] | <code>number</code> \| <code>null</code> | Previous checklist count |
| [checklistCountAfter] | <code>number</code> \| <code>null</code> | New checklist count |
| [descriptionLengthBefore] | <code>number</code> \| <code>null</code> | Previous description char count |
| [descriptionLengthAfter] | <code>number</code> \| <code>null</code> | New description char count |
| [subtaskCountBefore] | <code>number</code> \| <code>null</code> | Previous subtask count |
| [subtaskCountAfter] | <code>number</code> \| <code>null</code> | New subtask count |
| [titleWordCount] | <code>number</code> \| <code>null</code> | Derived title word count |
| [titleCharacterCount] | <code>number</code> \| <code>null</code> | Derived title length |
| [hasActionVerb] | <code>boolean</code> \| <code>null</code> | Derived actionability heuristic |
| [smallTaskCandidate] | <code>boolean</code> \| <code>null</code> | Derived quick-win heuristic |
| [creationCompletionRatio] | <code>number</code> \| <code>null</code> | Recent creation/completion ratio |
| [recentCreatedCount] | <code>number</code> \| <code>null</code> | Recent created count window |
| [recentCompletedCount] | <code>number</code> \| <code>null</code> | Recent completed count window |
| [taskAgeDays] | <code>number</code> \| <code>null</code> | Age of task in days |
| [categoryOverdueCount] | <code>number</code> \| <code>null</code> | Overdue tasks in same category |
| [categoryStalenessDays] | <code>number</code> \| <code>null</code> | Days since category saw progress |
| [completionLeadTimeHours] | <code>number</code> \| <code>null</code> | Hours before deadline at completion |
| [planningComplexityScore] | <code>number</code> \| <code>null</code> | Derived planning heaviness score |
| [completionRateWindow] | <code>number</code> \| <code>null</code> | Recent completion rate 0..1 |
| [planningSubtypeA] | <code>boolean</code> \| <code>null</code> | Detailed planning without execution marker |
| [planningSubtypeB] | <code>boolean</code> \| <code>null</code> | Overload planning marker |
| timestamp | <code>string</code> | ISO timestamp of the event |

<a name="module_services/reorg-executor"></a>

## services/reorg-executor
Reorg action executor — single action dispatch against the TickTick adapter.

Extracted from bot/commands.js executeActions(). Handles create, update,
complete, and drop action types for Gemini reorg proposals and policy sweeps.
Returns structured results; caller persists state (undo logs, processed marks).


* [services/reorg-executor](#module_services/reorg-executor)
    * _static_
        * [.executeReorgAction(action, task, adapter, [options])](#module_services/reorg-executor.executeReorgAction) ⇒ <code>Promise.&lt;{outcomes: Array.&lt;string&gt;, undoEntry: (Object\|null), taskId: (string\|null), actionType: (string\|null), error: (string\|null)}&gt;</code>
    * _inner_
        * [~resolveDueDate(value, [explicitPriority])](#module_services/reorg-executor..resolveDueDate) ⇒ <code>string</code> \| <code>null</code>
        * [~buildProjectMap([projects])](#module_services/reorg-executor..buildProjectMap) ⇒ <code>Map.&lt;string, string&gt;</code>
        * [~describeUpdateChanges(changes, task, projectMap)](#module_services/reorg-executor..describeUpdateChanges) ⇒ <code>string</code>
        * [~describeCreateDetails(changes, projectMap, resolvedDueDate)](#module_services/reorg-executor..describeCreateDetails) ⇒ <code>string</code>

<a name="module_services/reorg-executor.executeReorgAction"></a>

### services/reorg-executor.executeReorgAction(action, task, adapter, [options]) ⇒ <code>Promise.&lt;{outcomes: Array.&lt;string&gt;, undoEntry: (Object\|null), taskId: (string\|null), actionType: (string\|null), error: (string\|null)}&gt;</code>
Execute a single reorg action against TickTick via the adapter.

Handles action types:
- `create`: Creates a new task via `adapter.createTask`
- `update`: Updates a task via `adapter.updateTask`, returns an undo entry
- `complete`: Completes a task via `adapter.completeTask`
- `drop`: Deprioritizes a task via `adapter.updateTask` (does not delete)

**Kind**: static method of [<code>services/reorg-executor</code>](#module_services/reorg-executor)  
**Returns**: <code>Promise.&lt;{outcomes: Array.&lt;string&gt;, undoEntry: (Object\|null), taskId: (string\|null), actionType: (string\|null), error: (string\|null)}&gt;</code> - Structured result:
  - `outcomes`: Outcome message(s) for the action (may include multiple messages
    e.g. sensitive-content warning + update description)
  - `undoEntry`: Undo entry object for update actions (null otherwise)
  - `taskId`: The task ID involved in the action
  - `actionType`: The action type ('create', 'update', 'complete', 'drop')
  - `error`: Error message if the action failed; null on success  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| action | <code>Object</code> |  | The action to execute ({ type, taskId, changes }) |
| task | <code>Object</code> \| <code>null</code> |  | Current TickTick task object (null for create actions) |
| adapter | <code>Object</code> |  | TickTick adapter instance (createTask, updateTask, completeTask) |
| [options] | <code>Object</code> | <code>{}</code> | Execution options |
| [options.projectMap] | <code>Map.&lt;string, string&gt;</code> |  | Pre-built project ID-to-name map |
| [options.projects] | <code>Array.&lt;Object&gt;</code> |  | Raw project array (fallback for building projectMap) |

<a name="module_services/reorg-executor..resolveDueDate"></a>

### services/reorg-executor~resolveDueDate(value, [explicitPriority]) ⇒ <code>string</code> \| <code>null</code>
Resolve a due date string to TickTick ISO format.
Uses priority-based label mapping for schedule slot resolution.

**Kind**: inner method of [<code>services/reorg-executor</code>](#module_services/reorg-executor)  
**Returns**: <code>string</code> \| <code>null</code> - Resolved ISO due date string, or null if input is empty  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>string</code> \| <code>null</code> \| <code>undefined</code> | Raw due date value |
| [explicitPriority] | <code>number</code> | Priority value guiding label choice (1, 3, 5, etc.) |

<a name="module_services/reorg-executor..buildProjectMap"></a>

### services/reorg-executor~buildProjectMap([projects]) ⇒ <code>Map.&lt;string, string&gt;</code>
Build a project ID-to-name map from a project array.

**Kind**: inner method of [<code>services/reorg-executor</code>](#module_services/reorg-executor)  
**Returns**: <code>Map.&lt;string, string&gt;</code> - Map of project ID to project name  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [projects] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | Array of project objects with `id` and `name` fields |

<a name="module_services/reorg-executor..describeUpdateChanges"></a>

### services/reorg-executor~describeUpdateChanges(changes, task, projectMap) ⇒ <code>string</code>
Describe priority/project/title/due changes for an update action.

**Kind**: inner method of [<code>services/reorg-executor</code>](#module_services/reorg-executor)  
**Returns**: <code>string</code> - Formatted change description (empty string if no changes)  

| Param | Type | Description |
| --- | --- | --- |
| changes | <code>Object</code> | The update changes object |
| task | <code>Object</code> | The current task object for comparison |
| projectMap | <code>Map.&lt;string, string&gt;</code> | Project ID to name map |

<a name="module_services/reorg-executor..describeCreateDetails"></a>

### services/reorg-executor~describeCreateDetails(changes, projectMap, resolvedDueDate) ⇒ <code>string</code>
Describe priority/project/title/due aspects for a create action.

**Kind**: inner method of [<code>services/reorg-executor</code>](#module_services/reorg-executor)  
**Returns**: <code>string</code> - Formatted detail string (empty string if no extras)  

| Param | Type | Description |
| --- | --- | --- |
| changes | <code>Object</code> | The create changes object |
| projectMap | <code>Map.&lt;string, string&gt;</code> | Project ID to name map |
| resolvedDueDate | <code>string</code> \| <code>null</code> | Resolved ISO due date string |

<a name="module_services/undo-executor"></a>

## services/undo-executor
Undo execution helpers — revert pipeline mutations through the TickTick adapter.

Moved from bot/utils.js to eliminate the passthrough re-export layer.
These helpers are consumed by bot/commands.js (/undo command) and
bot/callbacks.js (undo:last inline button). Both call executeUndoBatch directly.


* [services/undo-executor](#module_services/undo-executor)
    * [.formatPipelineFailure(result, [options])](#module_services/undo-executor.formatPipelineFailure) ⇒ <code>string</code>
    * [.executeUndoEntry(entry, adapter)](#module_services/undo-executor.executeUndoEntry) ⇒ <code>Promise.&lt;{reverted: Array.&lt;string&gt;}&gt;</code>
    * [.executeUndoBatch(entries, adapter)](#module_services/undo-executor.executeUndoBatch) ⇒ <code>Promise.&lt;{reverted: Array.&lt;string&gt;, successful: Array.&lt;Object&gt;}&gt;</code>

<a name="module_services/undo-executor.formatPipelineFailure"></a>

### services/undo-executor.formatPipelineFailure(result, [options]) ⇒ <code>string</code>
Format a pipeline error result for user-facing display.

**Kind**: static method of [<code>services/undo-executor</code>](#module_services/undo-executor)  
**Returns**: <code>string</code> - User-safe error message (never leaks internal diagnostics unless isDevMode)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| result | <code>Object</code> |  | Pipeline error result with `confirmationText`, `isDevMode`, `diagnostics` |
| [options] | <code>Object</code> |  |  |
| [options.compact] | <code>boolean</code> | <code>false</code> | When true, collapse newlines to single-line separators |

<a name="module_services/undo-executor.executeUndoEntry"></a>

### services/undo-executor.executeUndoEntry(entry, adapter) ⇒ <code>Promise.&lt;{reverted: Array.&lt;string&gt;}&gt;</code>
Execute a single undo entry against the TickTick adapter.
Handles all rollback types: delete_created, restore_updated, recreate_deleted, uncomplete_task,
plus legacy update-based restore for pre-rollback entries.

**Kind**: static method of [<code>services/undo-executor</code>](#module_services/undo-executor)  
**Returns**: <code>Promise.&lt;{reverted: Array.&lt;string&gt;}&gt;</code> - Array of reverted task titles  

| Param | Type | Description |
| --- | --- | --- |
| entry | <code>Object</code> | Undo entry from the store |
| adapter | [<code>TickTickAdapter</code>](#TickTickAdapter) | TickTick adapter instance |

<a name="module_services/undo-executor.executeUndoBatch"></a>

### services/undo-executor.executeUndoBatch(entries, adapter) ⇒ <code>Promise.&lt;{reverted: Array.&lt;string&gt;, successful: Array.&lt;Object&gt;}&gt;</code>
Execute a batch of undo entries, tolerating individual failures.

**Kind**: static method of [<code>services/undo-executor</code>](#module_services/undo-executor)  

| Param | Type | Description |
| --- | --- | --- |
| entries | <code>Array.&lt;Object&gt;</code> | Undo entries to execute |
| adapter | [<code>TickTickAdapter</code>](#TickTickAdapter) | TickTick adapter instance |

<a name="SCHEDULER_NOTIFICATION_TYPES"></a>

## SCHEDULER\_NOTIFICATION\_TYPES : <code>enum</code>
Enum for scheduler notification types to manage suppression and logging.

**Kind**: global enum  
<a name="ERROR_CODES"></a>

## ERROR\_CODES : <code>enum</code>
Standard error codes used across the adapter and pipeline.

**Kind**: global enum  
**Properties**

| Name | Type | Default |
| --- | --- | --- |
| VALIDATION | <code>string</code> | <code>&quot;VALIDATION_ERROR&quot;</code> | 
| PERMISSION_DENIED | <code>string</code> | <code>&quot;PERMISSION_DENIED&quot;</code> | 
| NOT_FOUND | <code>string</code> | <code>&quot;NOT_FOUND&quot;</code> | 
| ALREADY_COMPLETED | <code>string</code> | <code>&quot;ALREADY_COMPLETED&quot;</code> | 
| NETWORK_ERROR | <code>string</code> | <code>&quot;NETWORK_ERROR&quot;</code> | 
| RATE_LIMITED | <code>string</code> | <code>&quot;RATE_LIMITED&quot;</code> | 
| SERVER_ERROR | <code>string</code> | <code>&quot;SERVER_ERROR&quot;</code> | 
| AUTH_ERROR | <code>string</code> | <code>&quot;AUTH_ERROR&quot;</code> | 
| API_ERROR | <code>string</code> | <code>&quot;API_ERROR&quot;</code> | 

<a name="INTENT_EXTRACTION_PROMPT"></a>

## INTENT\_EXTRACTION\_PROMPT
System prompt for Gemini-based intent extraction.
This prompt was preserved from the original framework instruction text.

**Kind**: global constant  
<a name="intentActionSchema"></a>

## intentActionSchema
Response schema for Gemini intent extraction.
Uses Google GenAI schema format.

**Kind**: global constant  
<a name="OPERATION_RECEIPT_VALUES"></a>

## OPERATION\_RECEIPT\_VALUES
OperationReceipt is the shared outcome contract for user-visible operation state.
It describes what happened after execution logic has already decided the outcome;
it must not own orchestration, routing, or mutation decisions.

**Kind**: global constant  
<a name="REQUIRED_FIELDS"></a>

## REQUIRED\_FIELDS : <code>Array.&lt;string&gt;</code>
List of required fields for a valid pipeline request context.

**Kind**: global constant  
<a name="DEFAULT_ENTRY_POINT"></a>

## DEFAULT\_ENTRY\_POINT : <code>string</code>
**Kind**: global constant  
<a name="DEFAULT_MODE"></a>

## DEFAULT\_MODE : <code>string</code>
**Kind**: global constant  
<a name="DEFAULT_WORK_STYLE_MODE"></a>

## DEFAULT\_WORK\_STYLE\_MODE : <code>string</code>
**Kind**: global constant  
<a name="PRIVACY_REDACTION_KEYS"></a>

## PRIVACY\_REDACTION\_KEYS : <code>Set.&lt;string&gt;</code>
Keys containing potentially sensitive user data that should be redacted in diagnostics.

**Kind**: global constant  
<a name="MAX_RECENT_LATENCIES"></a>

## MAX\_RECENT\_LATENCIES : <code>Record.&lt;string, string&gt;</code>
Aliases for mapping internal entry point names to display names.

**Kind**: global constant  
<a name="FAILURE_CLASSES"></a>

## FAILURE\_CLASSES : <code>Record.&lt;string, string&gt;</code>
Failure classes for pipeline errors.

**Kind**: global constant  
<a name="FAILURE_CATEGORIES"></a>

## FAILURE\_CATEGORIES : <code>Record.&lt;string, string&gt;</code>
Failure categories for classifying error severity and retryability.

**Kind**: global constant  
<a name="ACTION_FAILURE_CLASSES"></a>

## ACTION\_FAILURE\_CLASSES : <code>Record.&lt;string, string&gt;</code>
Failure classes for individual action execution.

**Kind**: global constant  
<a name="NON_TASK_REASONS"></a>

## NON\_TASK\_REASONS : <code>Record.&lt;string, string&gt;</code>
Reasons for a request being classified as non-task.

**Kind**: global constant  
<a name="USER_FAILURE_MESSAGES"></a>

## USER\_FAILURE\_MESSAGES : <code>Record.&lt;string, string&gt;</code>
User-facing messages for different failure classes.

**Kind**: global constant  
<a name="reorgSchema"></a>

## reorgSchema
Gemini response schema for reorganization proposals.Cavekit ownership: Task Pipeline R16 (Guided Reorg).

**Kind**: global constant  
<a name="BRIEFING_SUMMARY_SECTION_KEYS"></a>

## BRIEFING\_SUMMARY\_SECTION\_KEYS : <code>Array.&lt;string&gt;</code>
Section keys for daily briefing summaries.

**Kind**: global constant  
<a name="WEEKLY_SUMMARY_SECTION_KEYS"></a>

## WEEKLY\_SUMMARY\_SECTION\_KEYS : <code>Array.&lt;string&gt;</code>
Section keys for weekly summaries.

**Kind**: global constant  
<a name="DAILY_CLOSE_SUMMARY_SECTION_KEYS"></a>

## DAILY\_CLOSE\_SUMMARY\_SECTION\_KEYS : <code>Array.&lt;string&gt;</code>
Section keys for daily close summaries.

**Kind**: global constant  
<a name="SUMMARY_NOTICE_CODES"></a>

## SUMMARY\_NOTICE\_CODES : <code>Array.&lt;string&gt;</code>
Valid codes for summary notices.

**Kind**: global constant  
<a name="SUMMARY_NOTICE_SEVERITIES"></a>

## SUMMARY\_NOTICE\_SEVERITIES : <code>Array.&lt;string&gt;</code>
Severity levels for summary notices.

**Kind**: global constant  
<a name="SUMMARY_NOTICE_EVIDENCE_SOURCES"></a>

## SUMMARY\_NOTICE\_EVIDENCE\_SOURCES : <code>Array.&lt;string&gt;</code>
Evidence sources for summary notices.

**Kind**: global constant  
<a name="WEEKLY_WATCHOUT_EVIDENCE_SOURCES"></a>

## WEEKLY\_WATCHOUT\_EVIDENCE\_SOURCES : <code>Array.&lt;string&gt;</code>
Evidence sources for weekly watchouts.

**Kind**: global constant  
<a name="MAX_CHECKLIST_ITEMS"></a>

## MAX\_CHECKLIST\_ITEMS
Maximum number of checklist items allowed in a single create action.Prevents brain-dump overload and keeps checklists execution-friendly.

**Kind**: global constant  
<a name="CHECKLIST_ITEM_SHAPE"></a>

## CHECKLIST\_ITEM\_SHAPE
Shape descriptor for checklist items in extracted intent output.Used by validateIntentAction to check checklistItems arrays.

**Kind**: global constant  
<a name="briefingSummarySchema"></a>

## briefingSummarySchema
Gemini response schema for briefing summaries.

**Kind**: global constant  
<a name="weeklySummarySchema"></a>

## weeklySummarySchema
Gemini response schema for weekly summaries.

**Kind**: global constant  
<a name="dailyCloseSummarySchema"></a>

## dailyCloseSummarySchema
Gemini response schema for daily close summaries.

**Kind**: global constant  
<a name="PRIORITY_MAP"></a>

## PRIORITY\_MAP : <code>Object.&lt;string, number&gt;</code>
Priority map from Gemini labels to TickTick priority integers.

**Kind**: global constant  
<a name="PRIORITY_EMOJI"></a>

## PRIORITY\_EMOJI : <code>Object.&lt;number, string&gt;</code>
Mapping of TickTick priority numbers to emoji representations.

**Kind**: global constant  
<a name="PRIORITY_LABEL"></a>

## PRIORITY\_LABEL : <code>Object.&lt;number, string&gt;</code>
Mapping of TickTick priority numbers to user-facing labels.

**Kind**: global constant  
<a name="AUTHORIZED_CHAT_ID"></a>

## AUTHORIZED\_CHAT\_ID : <code>number</code> \| <code>null</code>
The authorized Telegram chat ID from environment variables.

**Kind**: global constant  
<a name="USER_TZ"></a>

## USER\_TZ : <code>string</code>
The user's timezone, resolved from the canonical getUserTimezone().

**Kind**: global constant  
<a name="MUTATION_TYPE_LABELS"></a>

## MUTATION\_TYPE\_LABELS : <code>Object.&lt;string, string&gt;</code>
Maps mutation action types to user-facing labels.
Centralized to prevent duplication across pipeline and shared-utils.

**Kind**: global constant  
<a name="MUTATION_CONFIRMATION_TTL_MS"></a>

## MUTATION\_CONFIRMATION\_TTL\_MS
Mutation confirmation TTL: 10 minutes

**Kind**: global constant  
<a name="CHECKLIST_CLARIFICATION_TTL_MS"></a>

## CHECKLIST\_CLARIFICATION\_TTL\_MS
Checklist clarification TTL: 24 hours

**Kind**: global constant  
<a name="TASK_REFINEMENT_TTL_MS"></a>

## TASK\_REFINEMENT\_TTL\_MS
Task refinement TTL: 5 minutes

**Kind**: global constant  
<a name="RECENT_TASK_CONTEXT_TTL_MS"></a>

## RECENT\_TASK\_CONTEXT\_TTL\_MS
Recent task context TTL: 10 minutes

**Kind**: global constant  
<a name="EXACT_SCORE"></a>

## EXACT\_SCORE : <code>number</code>
Match score for an exact string match.

**Kind**: global constant  
<a name="PREFIX_SCORE"></a>

## PREFIX\_SCORE : <code>number</code>
Match score for a prefix match.

**Kind**: global constant  
<a name="CONTAINS_SCORE"></a>

## CONTAINS\_SCORE : <code>number</code>
Match score for a "contains" match.

**Kind**: global constant  
<a name="FUZZY_SCORE_MIN"></a>

## FUZZY\_SCORE\_MIN : <code>number</code>
Minimum score for a fuzzy match to be considered.

**Kind**: global constant  
<a name="FUZZY_SCORE_MAX"></a>

## FUZZY\_SCORE\_MAX : <code>number</code>
Maximum score for a fuzzy match.

**Kind**: global constant  
<a name="CLARIFICATION_GAP"></a>

## CLARIFICATION\_GAP : <code>number</code>
Minimum score gap required to avoid clarification when multiple matches exist.

**Kind**: global constant  
<a name="UNDERSPECIFIED_PRONOUN_QUERY"></a>

## UNDERSPECIFIED\_PRONOUN\_QUERY : <code>RegExp</code>
Regex for detecting underspecified pronoun queries.

**Kind**: global constant  
<a name="PROJECT_CACHE_TTL_MS"></a>

## PROJECT\_CACHE\_TTL\_MS : <code>number</code>
Project cache TTL in milliseconds.

**Kind**: global constant  
<a name="VALID_PRIORITIES"></a>

## VALID\_PRIORITIES : <code>Array.&lt;number&gt;</code>
Valid priority values for TickTick API.

**Kind**: global constant  
<a name="ACTION_VERB_REGEX"></a>

## ACTION\_VERB\_REGEX : <code>RegExp</code>
Regex for detecting action verbs at the start of a task title.

**Kind**: global constant  
<a name="CONTENT_MERGE_SEPARATOR"></a>

## CONTENT\_MERGE\_SEPARATOR : <code>string</code>
Separator used when merging task content.

**Kind**: global constant  
<a name="NETWORK_ERROR_CODES"></a>

## NETWORK\_ERROR\_CODES : <code>Set.&lt;string&gt;</code>
Node.js network error codes to be classified as NETWORK_ERROR.

**Kind**: global constant  
<a name="TYPED_ERROR_CODES"></a>

## TYPED\_ERROR\_CODES : <code>Set.&lt;string&gt;</code>
Set of all valid typed error codes.

**Kind**: global constant  
<a name="PROJECT_POLICY"></a>

## PROJECT\_POLICY
PROJECT_POLICY maps your TickTick projects to behavior categories.
The system uses this to set priority caps and make safe defaults.

Rules:
- strategic: eligible for Core Goal (priority 5) if action verb + strong evidence
- admin: cap at Important (3), default Life Admin (1)
- routine: cap at Life Admin (1), never Core Goal
- uncategorized (default): cap at Important (3), default Life Admin (1)

Project routing is exact-match only.
If no exact configured destination exists, writes stay blocked or omit the
project move rather than guessing Inbox/default.

DEFAULTS: If you omit PROJECT_POLICY entirely, the system falls back to
uncategorized for everything (safe default: priority cap 3, default 1).
If you omit KEYWORDS, VERB_LIST, or SCORING, sensible defaults are used.
Only USER_CONTEXT and USER_TIMEZONE are truly required.

**Kind**: global constant  
<a name="KEYWORDS"></a>

## KEYWORDS
KEYWORDS used for intent detection, urgency inference, and follow-up binding.
All hardcoded lists from the codebase are consolidated here.

**Kind**: global constant  
<a name="VERB_LIST"></a>

## VERB\_LIST
VERBS recognized as action signals in task titles.
Used to distinguish "plan" (vague) from "apply for" (action).
Pipe-delimited string for regex construction.

**Kind**: global constant  
<a name="SCORING"></a>

## SCORING
SCORING weights and thresholds used by the priority engine.
All magic numbers from the codebase are extracted here with documentation.

Rationale for defaults:
- coreGoal weight 36: highest tier, must exceed sum of lower tiers
- orderBoosts [8,4,2]: diminishing returns for goal order beyond top 3
- urgentModeBoosts high=70: urgent mode should significantly reorder priorities
- priorityOverrideScore 10000: ensures manual overrides always win
- capacityProtectionScore 120: health/recovery tasks get strong protection
- highUrgencyHours 24: due within 24h = high urgency
- mediumUrgencyHours 72: due within 72h = medium urgency

**Kind**: global constant  
<a name="safeAnswerCallbackQuery"></a>

## safeAnswerCallbackQuery
Wraps ctx.answerCallbackQuery with timeout telemetry.

**Kind**: global constant  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Grammy context |
| [options] | <code>Object</code> | answerCallbackQuery options |

<a name="createGoalThemeProfile"></a>

## createGoalThemeProfile(rawContext, [options]) ⇒ <code>object</code>
Creates a goal theme profile from raw context.

**Kind**: global function  
**Returns**: <code>object</code> - Goal theme profile  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| rawContext | <code>string</code> |  | Raw text context containing GOALS section |
| [options] | <code>object</code> | <code>{}</code> | Profile options |
| [options.source] | <code>string</code> | <code>&quot;&#x27;fallback&#x27;&quot;</code> | Data source identifier |

<a name="normalizePriorityCandidate"></a>

## normalizePriorityCandidate(task) ⇒ <code>object</code>
Normalizes a TickTick task into a priority candidate.

**Kind**: global function  
**Returns**: <code>object</code> - Normalized candidate  

| Param | Type | Description |
| --- | --- | --- |
| task | <code>object</code> | Raw TickTick task object |

<a name="buildRankingContext"></a>

## buildRankingContext([options]) ⇒ <code>object</code>
Builds a ranking context from options.

**Kind**: global function  
**Returns**: <code>object</code> - Ranking context  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>object</code> | <code>{}</code> | Ranking options |

<a name="hasVerb"></a>

## hasVerb(task, [options]) ⇒ <code>string</code>
Infers a priority label (e.g., 'core_goal') from a task.

**Kind**: global function  
**Returns**: <code>string</code> - Priority label  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| task | <code>object</code> |  | Normalized task or candidate |
| [options] | <code>object</code> | <code>{}</code> | Ranking options |

<a name="inferPriorityLabelFromTask"></a>

## inferPriorityLabelFromTask(task, [options]) ⇒ <code>string</code>
Infers a priority label (e.g., 'core_goal') from a task.

**Kind**: global function  
**Returns**: <code>string</code> - Priority label  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| task | <code>object</code> |  | Normalized task or candidate |
| [options] | <code>object</code> | <code>{}</code> | Ranking options |

<a name="inferPriorityValueFromTask"></a>

## inferPriorityValueFromTask(task, [options]) ⇒ <code>number</code>
Infers a TickTick priority value (1, 3, 5) from a task.

**Kind**: global function  
**Returns**: <code>number</code> - Priority value  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| task | <code>object</code> |  | Normalized task or candidate |
| [options] | <code>object</code> | <code>{}</code> | Ranking options |

<a name="inferProjectIdFromTask"></a>

## inferProjectIdFromTask(task, projects, [options]) ⇒ <code>string</code> \| <code>null</code>
Infer a project ID for a task from available projects.
Conservative fallback only: exact alias/name match only.

**Kind**: global function  
**Returns**: <code>string</code> \| <code>null</code> - Project ID or null.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| task | <code>object</code> |  | Normalized task or candidate. |
| projects | <code>Array.&lt;object&gt;</code> |  | Available projects. |
| [options] | <code>object</code> | <code>{}</code> | Ranking options. |

<a name="createRankingDecision"></a>

## createRankingDecision([decision]) ⇒ <code>object</code>
Creates a ranking decision object.

**Kind**: global function  
**Returns**: <code>object</code> - Ranking decision  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [decision] | <code>object</code> | <code>{}</code> | Raw decision properties |

<a name="buildRecommendationResult"></a>

## buildRecommendationResult([params]) ⇒ <code>object</code>
Builds a recommendation result object.

**Kind**: global function  
**Returns**: <code>object</code> - Recommendation result  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [params] | <code>object</code> | <code>{}</code> | Result parameters |

<a name="rankPriorityCandidates"></a>

## rankPriorityCandidates(input, [maybeContext]) ⇒ <code>object</code>
Ranks candidates based on goal alignment and urgency.

**Kind**: global function  
**Returns**: <code>object</code> - Recommendation result  

| Param | Type | Description |
| --- | --- | --- |
| input | <code>object</code> \| <code>Array.&lt;object&gt;</code> | List of candidates or input object with context |
| [maybeContext] | <code>object</code> | Ranking context if input is a list |

<a name="buildWorkStylePromptNote"></a>

## buildWorkStylePromptNote([workStyleMode]) ⇒ <code>string</code>
Builds a prompt note based on the active work style mode.

**Kind**: global function  
**Returns**: <code>string</code> - Prompt augmentation string  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [workStyleMode] | <code>string</code> | <code>&quot;store.MODE_STANDARD&quot;</code> | The active work style mode |

<a name="detectWorkStyleModeIntent"></a>

## detectWorkStyleModeIntent(userMessage) ⇒ <code>Object</code> \| <code>Object</code> \| <code>Object</code> \| <code>null</code>
Detects work-style mode intents from user messages.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| userMessage | <code>string</code> | The user's message text |

<a name="validateChecklistItems"></a>

## validateChecklistItems(items) ⇒ <code>Object</code>
Validates and normalizes checklist items from extracted intent output.
Caps at MAX_CHECKLIST_ITEMS, validates each item has a title,
and strips invalid entries.

**Kind**: global function  
**Returns**: <code>Object</code> - Validation result  

| Param | Type | Description |
| --- | --- | --- |
| items | <code>Array</code> | Raw checklist items from extracted output |

<a name="validateIntentAction"></a>

## validateIntentAction(action, index, [options]) ⇒ <code>Object</code>
Validates an intent action object at runtime (defense in depth).
Exported for testing purposes.

**Kind**: global function  
**Returns**: <code>Object</code> - Validation result with error messages  

| Param | Type | Description |
| --- | --- | --- |
| action | <code>object</code> | The action object to validate |
| index | <code>number</code> | The index of the action in the array |
| [options] | <code>object</code> | Validation options |
| [options.requireR1Fields] | <code>boolean</code> | Whether to require the R1 action field set |

<a name="extractIntentsWithGemini"></a>

## extractIntentsWithGemini(gemini, userMessage, [options]) ⇒ <code>Promise.&lt;Array.&lt;object&gt;&gt;</code>
Extracts structured intent actions from a user message using Gemini.

**Kind**: global function  
**Returns**: <code>Promise.&lt;Array.&lt;object&gt;&gt;</code> - Array of validated intent actions  
**Throws**:

- [<code>QuotaExhaustedError</code>](#QuotaExhaustedError) When all API keys are exhausted
- <code>Error</code> When generation fails or validation fails


| Param | Type | Description |
| --- | --- | --- |
| gemini | [<code>GeminiAnalyzer</code>](#GeminiAnalyzer) | GeminiAnalyzer instance |
| userMessage | <code>string</code> | The user's natural language message |
| [options] | <code>object</code> | Extraction options |
| [options.currentDate] | <code>string</code> | Current date for context (e.g., "2026-03-31") |
| [options.availableProjects] | <code>Array.&lt;string&gt;</code> | List of available project names |
| [options.requestId] | <code>string</code> | Optional request ID for logging |

<a name="truncateMessageForExtraction"></a>

## truncateMessageForExtraction(text, maxChars) ⇒ <code>string</code>
Progressively truncates a long user message to fit within a safe prompt limit.
Strategy: strip examples, strip verbose filler, keep schema + core rules.

**Kind**: global function  
**Returns**: <code>string</code> - Truncated text  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| text | <code>string</code> |  | Original user message |
| maxChars | <code>number</code> | <code>4000</code> | Maximum characters to keep |

<a name="createIntentExtractor"></a>

## createIntentExtractor(gemini) ⇒ <code>Object</code>
Creates a Gemini-based intent extraction service.

**Kind**: global function  
**Returns**: <code>Object</code> - Intent extraction service  

| Param | Type | Description |
| --- | --- | --- |
| gemini | [<code>GeminiAnalyzer</code>](#GeminiAnalyzer) | GeminiAnalyzer instance |

<a name="_coerceDate"></a>

## \_coerceDate()
Gets local current date components formatted by the system timezone.

**Kind**: global function  
<a name="_getNowComponents"></a>

## \_getNowComponents()
Gets local current date components formatted by the system timezone.

**Kind**: global function  
<a name="_formatISO"></a>

## \_formatISO()
Formats a Date object to TickTick ISO format

**Kind**: global function  
<a name="_normalizeTitle"></a>

## \_normalizeTitle(rawTitle, maxLength) ⇒ <code>string</code>
Normalizes a title to be concise, verb-led, and noise-free.

Transformations applied in order:
1. Trim whitespace
2. Strip bracket prefixes like "[Work] "
3. Strip priority markers (e.g., "URGENT: ", "Critical - ")
4. Strip date references (e.g., "tomorrow", "next week")
5. Strip leading articles ("A", "An", "The")
6. Capitalize first letter (sentence case)
7. Truncate to maxLength at word boundary with ellipsis

**Kind**: global function  
**Returns**: <code>string</code> - Cleaned title  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| rawTitle | <code>string</code> |  | The raw title from extracted intent |
| maxLength | <code>number</code> | <code>100</code> | Maximum character limit (default 100) |

<a name="_normalizeContent"></a>

## \_normalizeContent(rawContent, existingContent) ⇒ <code>string</code> \| <code>null</code>
Filters content, keeping only useful references (URLs, locations, instructions)
and preserving existing content during updates.

Content cleaning steps:
1. Strip motivational/coaching filler phrases
2. Strip analysis noise and priority justifications
3. Preserve URLs, locations, specific instructions, technical details
4. Preserve actionable sub-step lists
5. For updates: merge with existing content if new content adds value

**Kind**: global function  
**Returns**: <code>string</code> \| <code>null</code> - Cleaned content or null if empty  

| Param | Type | Description |
| --- | --- | --- |
| rawContent | <code>string</code> \| <code>null</code> | Raw content from extracted intent |
| existingContent | <code>string</code> \| <code>null</code> | Existing task content (for updates) |

<a name="_truncateContent"></a>

## \_truncateContent(content, maxLength) ⇒ <code>string</code> \| <code>null</code>
Truncates content to a max length at a word boundary.
Adds ellipsis when truncation occurs.

**Kind**: global function  
**Returns**: <code>string</code> \| <code>null</code> - Truncated content or null  

| Param | Type | Description |
| --- | --- | --- |
| content | <code>string</code> \| <code>null</code> | Content to truncate |
| maxLength | <code>number</code> | Maximum character length |

<a name="_contentAddsValue"></a>

## \_contentAddsValue(newContent, existingContent) ⇒ <code>boolean</code>
Determines if new content adds value beyond existing content.
Checks for URLs, locations, instructions, or actionable items not already present.

**Kind**: global function  
**Returns**: <code>boolean</code> - True if new content adds value  

| Param | Type | Description |
| --- | --- | --- |
| newContent | <code>string</code> | New content to evaluate |
| existingContent | <code>string</code> | Existing content to compare against |

<a name="_cleanChecklistItemTitle"></a>

## \_cleanChecklistItemTitle(rawTitle) ⇒ <code>string</code> \| <code>null</code>
Cleans a single checklist item title.
Trims whitespace, strips filler, truncates at word boundary.

**Kind**: global function  
**Returns**: <code>string</code> \| <code>null</code> - Cleaned title or null if empty  

| Param | Type | Description |
| --- | --- | --- |
| rawTitle | <code>string</code> | Raw item title |

<a name="_normalizeChecklistItems"></a>

## \_normalizeChecklistItems(rawItems) ⇒ <code>Array</code>
Normalizes and validates raw extracted checklist items.

Accept raw extracted checklistItems, return clean items or empty array.
Clean item text — trim, strip filler, drop empty, truncate ~50 chars.
Cap at 30 items, log truncation.
Assign zero-based sort order when absent.
Validate — require non-empty title, default status to 0 (incomplete),
       reject nested checklist structures.

**Kind**: global function  
**Returns**: <code>Array</code> - Clean, validated checklist items (may be empty)  

| Param | Type | Description |
| --- | --- | --- |
| rawItems | <code>Array</code> \| <code>null</code> | Raw checklistItems from extracted intent |

<a name="_convertRepeatHint"></a>

## \_convertRepeatHint(repeatHint) ⇒ <code>string</code> \| <code>null</code>
Converts natural-language recurrence hints to RRULE strings.

Supported patterns:
- Simple: "daily", "weekdays", "weekends", "weekly", "biweekly", "monthly", "yearly"
- "every <day>": "every monday", "every sunday"
- "every <day> and <day>": "every tuesday and thursday"
- "weekly on <day>": "weekly on monday", "weekly on friday"
- "every other day": RRULE:FREQ=DAILY;INTERVAL=2

**Kind**: global function  
**Returns**: <code>string</code> \| <code>null</code> - RRULE string or null if unrecognized  

| Param | Type | Description |
| --- | --- | --- |
| repeatHint | <code>string</code> \| <code>null</code> | Natural language recurrence hint |

<a name="_resolveProject"></a>

## \_resolveProject()
Resolves a project hint string to a concrete TickTick project destination.
Expects a list of projects from the TickTick API.

Resolution order:
1. Exact project ID when hinted
2. Exactly one exact project-name match when hinted
3. defaultProjectResolution only when no projectHint exists
4. defaultProjectId only when no projectHint exists and resolution is not provided

**Kind**: global function  
<a name="_expandDueDate"></a>

## \_expandDueDate()
Expands relative dates to absolute ISO strings.
Keeps simple relative-date handling inside the normalizer to avoid bot-layer coupling.

**Kind**: global function  
<a name="_normalizeContentForMutation"></a>

## \_normalizeContentForMutation(newContent, existingContent) ⇒ <code>string</code> \| <code>null</code>
Normalizes content for mutation actions (update/complete/delete).

Preserve existing task content on updates unless the new content adds value.
Only replaces content when the user explicitly provides new content that
adds value beyond the existing description. Otherwise, existing content
is preserved verbatim.

**Kind**: global function  
**Returns**: <code>string</code> \| <code>null</code> - Preserved or merged content  

| Param | Type | Description |
| --- | --- | --- |
| newContent | <code>string</code> \| <code>null</code> | New content from mutation intent |
| existingContent | <code>string</code> \| <code>null</code> | Current task content |

<a name="validateMutationBatch"></a>

## validateMutationBatch(actions) ⇒ <code>Object</code>
Validates a batch of normalized actions for supported mutation shapes.

Reject mixed create+mutation and multi-mutation batches
that are out of scope for v1 single-target mutation.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| actions | <code>Array.&lt;object&gt;</code> | Normalized actions to validate |

<a name="_validateAction"></a>

## \_validateAction()
Validates a normalized action.

Mutation validation:
- Mutation actions (update/complete/delete) require a resolved taskId.
- Fails closed when taskId is missing.
- Confidence threshold still applies.

**Kind**: global function  
<a name="_parseDateList"></a>

## \_parseDateList()
Parses a comma or space separated list of days into an array.

**Kind**: global function  
<a name="_resolveActionType"></a>

## \_resolveActionType()
Resolves the action type, auto-switching to 'update' if an existing task is provided.

**Kind**: global function  
<a name="normalizeAction"></a>

## normalizeAction()
Normalizes a single intent action.

Mutation support:
- `options.resolvedTask` carries the resolver's selected task { id, projectId, title }.
- `options.existingTaskContent` preserves the original task description on updates.
- `targetQuery` is passed through from extracted intent for logging/diagnostics.
- Mutation actions without a resolved taskId fail validation (fail-closed).

**Kind**: global function  
<a name="normalizeActions"></a>

## normalizeActions()
Normalizes multiple intent actions, expanding multi-day tasks.

Validates batch shape to reject mixed create+mutation or
multi-mutation requests that are out of scope for v1.

**Kind**: global function  
<a name="normalizeActionBatch"></a>

## normalizeActionBatch()
Normalizes and validates a batch of intent actions.
Returns { actions, batchError } where batchError is set when the
batch shape is unsupported (mixed create+mutation, multi-mutation).

Single entry point for pipeline to normalize and validate batch shape.

**Kind**: global function  
<a name="formatBusyLockMessage"></a>

## formatBusyLockMessage(lockStatus, [label]) ⇒ <code>string</code>
Format conservative user-facing copy for a busy intake lock.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| lockStatus | <code>object</code> |  | Intake lock status. |
| [lockStatus.owner] | <code>string</code> |  | Lock owner label. |
| [lockStatus.acquiredAt] | <code>number</code> |  | Lock acquisition timestamp. |
| [label] | <code>string</code> | <code>&quot;&#x27;operation&#x27;&quot;</code> | Human-readable surface label. |

<a name="validateOperationReceipt"></a>

## validateOperationReceipt(receipt) ⇒ <code>Object</code>
Validate an OperationReceipt-like object against stage-1 invariants.

**Kind**: global function  
**Returns**: <code>Object</code> - Validation result.  

| Param | Type | Description |
| --- | --- | --- |
| receipt | <code>object</code> | Candidate receipt. |

<a name="assertValidOperationReceipt"></a>

## assertValidOperationReceipt(receipt) ⇒ <code>object</code>
Assert that a candidate receipt satisfies the OperationReceipt contract.

**Kind**: global function  
**Returns**: <code>object</code> - The original receipt when valid.  
**Throws**:

- <code>TypeError</code> When the receipt violates the contract.


| Param | Type | Description |
| --- | --- | --- |
| receipt | <code>object</code> | Candidate receipt. |

<a name="cloneValue"></a>

## cloneValue(value) ⇒ <code>\*</code>
Clones a value using structuredClone or JSON fallback.

**Kind**: global function  
**Returns**: <code>\*</code> - Cloned value  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | The value to clone |

<a name="deepFreeze"></a>

## deepFreeze(value, [seen]) ⇒ <code>\*</code>
Recursively freezes an object and its nested properties.

**Kind**: global function  
**Returns**: <code>\*</code> - Frozen value  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | The value to freeze |
| [seen] | <code>WeakSet</code> | Set to track visited objects for circular references |

<a name="sanitizePipelineDiagnosticValue"></a>

## sanitizePipelineDiagnosticValue(value) ⇒ <code>\*</code>
Sanitizes an object for diagnostics by redacting sensitive keys.

**Kind**: global function  
**Returns**: <code>\*</code> - Sanitized object  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | The object to sanitize |

<a name="snapshotPipelineValue"></a>

## snapshotPipelineValue(value) ⇒ <code>\*</code>
Creates a deep clone of a pipeline value.

**Kind**: global function  
**Returns**: <code>\*</code> - Cloned value  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | Value to snapshot |

<a name="snapshotPrivacySafePipelineValue"></a>

## snapshotPrivacySafePipelineValue(value) ⇒ <code>\*</code>
Creates a redacted deep clone of a pipeline value for logging.

**Kind**: global function  
**Returns**: <code>\*</code> - Redacted clone  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | Value to snapshot |

<a name="sanitizePipelineContextForDiagnostics"></a>

## sanitizePipelineContextForDiagnostics(context) ⇒ <code>Object</code>
Redacts sensitive info and freezes a pipeline context for diagnostics.

**Kind**: global function  
**Returns**: <code>Object</code> - Sanitized and frozen context  

| Param | Type | Description |
| --- | --- | --- |
| context | <code>Object</code> | Pipeline context |

<a name="updatePipelineContext"></a>

## updatePipelineContext(context, updater) ⇒ <code>Object</code>
Updates a pipeline context using a draft/updater pattern and freezes the result.

**Kind**: global function  
**Returns**: <code>Object</code> - Updated and frozen context  

| Param | Type | Description |
| --- | --- | --- |
| context | <code>Object</code> | Current pipeline context |
| updater | <code>function</code> | Function that receives a mutable draft |

<a name="createLifecycleState"></a>

## createLifecycleState(baseContext) ⇒ <code>Object</code>
Creates the initial lifecycle state for a new pipeline request.

**Kind**: global function  
**Returns**: <code>Object</code> - Initial lifecycle state  

| Param | Type | Description |
| --- | --- | --- |
| baseContext | <code>Object</code> | The base request context |

<a name="normalizeChecklistContext"></a>

## normalizeChecklistContext(value) ⇒ <code>Object</code> \| <code>null</code>
Normalizes and validates checklist context metadata.

**Kind**: global function  
**Returns**: <code>Object</code> \| <code>null</code> - Normalized checklist context or null  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>Object</code> | Raw checklist context |

<a name="coerceDate"></a>

## coerceDate(value, fallback) ⇒ <code>Date</code>
Coerces a value to a Date object.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | Value to coerce |
| fallback | <code>Date</code> | Fallback Date if coercion fails |

<a name="formatCurrentDate"></a>

## formatCurrentDate(date, timezone) ⇒ <code>string</code>
Formats a Date as a YYYY-MM-DD string in a specific timezone.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted date string  

| Param | Type | Description |
| --- | --- | --- |
| date | <code>Date</code> | Date to format |
| timezone | <code>string</code> | Target IANA timezone |

<a name="isDateOnlyString"></a>

## isDateOnlyString(value) ⇒ <code>boolean</code>
Checks if a string is in YYYY-MM-DD format.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>string</code> | String to check |

<a name="normalizeProjects"></a>

## normalizeProjects(projects) ⇒ <code>Array</code>
Ensures projects value is an array.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| projects | <code>\*</code> | Raw projects value |

<a name="deriveProjectNames"></a>

## deriveProjectNames(projects) ⇒ <code>Array.&lt;string&gt;</code>
Extracts non-empty project names from an array of project objects.

**Kind**: global function  
**Returns**: <code>Array.&lt;string&gt;</code> - Array of project names  

| Param | Type | Description |
| --- | --- | --- |
| projects | <code>Array</code> | Array of project objects |

<a name="validatePipelineContext"></a>

## validatePipelineContext(context) ⇒ <code>Object</code>
Validates a pipeline context object against required fields and types.

**Kind**: global function  
**Returns**: <code>Object</code> - Validation result  

| Param | Type | Description |
| --- | --- | --- |
| context | <code>Object</code> | The context to validate |

<a name="createPipelineContextBuilder"></a>

## createPipelineContextBuilder(options) ⇒ <code>Object</code>
Creates a pipeline context builder for generating request contexts.

**Kind**: global function  
**Returns**: <code>Object</code> - Context builder instance  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>Object</code> |  |
| options.adapter | [<code>TickTickAdapter</code>](#TickTickAdapter) | TickTick adapter instance |
| [options.timezone] | <code>string</code> | Default IANA timezone |
| [options.now] | <code>function</code> | Function returning current Date |
| [options.requestIdFactory] | <code>function</code> | Function generating unique request IDs |

<a name="createPipelineContextBuilder..buildRequestContext"></a>

### createPipelineContextBuilder~buildRequestContext(userMessage, [options]) ⇒ <code>Promise.&lt;Object&gt;</code>
Builds a full request context for a pipeline execution.

**Kind**: inner method of [<code>createPipelineContextBuilder</code>](#createPipelineContextBuilder)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - Frozen pipeline request context  

| Param | Type | Description |
| --- | --- | --- |
| userMessage | <code>string</code> | The user's input message |
| [options] | <code>Object</code> | Build options (mode, entryPoint, etc.) |

<a name="normalizeEntryPoint"></a>

## normalizeEntryPoint(entryPoint, mode) ⇒ <code>string</code>
Normalizes an entry point name based on the execution mode.

**Kind**: global function  
**Returns**: <code>string</code> - Normalized entry point name  

| Param | Type | Description |
| --- | --- | --- |
| entryPoint | <code>string</code> | Raw entry point name |
| mode | <code>string</code> | Execution mode (e.g., 'scan', 'review') |

<a name="emitConsole"></a>

## emitConsole(logger, event)
Emits an event to the console logger.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| logger | <code>Object</code> | Logger instance with log/error methods |
| event | <code>Object</code> | The event object to log |

<a name="emitToSink"></a>

## emitToSink(sink, methodName, ...args) ⇒ <code>Promise.&lt;void&gt;</code>
Emits an event to a sink (function or object with method).

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| sink | <code>function</code> \| <code>Object</code> | The destination sink |
| methodName | <code>string</code> | Method to call on the sink object |
| ...args | <code>\*</code> | Arguments to pass to the sink |

<a name="createPipelineObservability"></a>

## createPipelineObservability([options]) ⇒ <code>Object</code>
Creates a pipeline observability instance for emitting telemetry.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> |  |  |
| [options.eventSink] | <code>function</code> \| <code>Object</code> |  | Sink for full events |
| [options.metricSink] | <code>function</code> \| <code>Object</code> |  | Sink for metrics |
| [options.traceSink] | <code>function</code> \| <code>Object</code> |  | Sink for traces |
| [options.logger] | <code>Object</code> | <code>console</code> | Console logger instance |
| [options.now] | <code>function</code> |  | Function returning current Date |


* [createPipelineObservability([options])](#createPipelineObservability) ⇒ <code>Object</code>
    * [~emit(context, payload)](#createPipelineObservability..emit) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [~emitLatencyHistogram(payload)](#createPipelineObservability..emitLatencyHistogram)

<a name="createPipelineObservability..emit"></a>

### createPipelineObservability~emit(context, payload) ⇒ <code>Promise.&lt;Object&gt;</code>
Emits a telemetry event for a pipeline step.

**Kind**: inner method of [<code>createPipelineObservability</code>](#createPipelineObservability)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - The emitted event object  

| Param | Type | Description |
| --- | --- | --- |
| context | <code>Object</code> | Pipeline request context |
| payload | <code>Object</code> | Event data |

<a name="createPipelineObservability..emitLatencyHistogram"></a>

### createPipelineObservability~emitLatencyHistogram(payload)
Emits a latency histogram event for a pipeline stage.

**Kind**: inner method of [<code>createPipelineObservability</code>](#createPipelineObservability)  

| Param | Type | Description |
| --- | --- | --- |
| payload | <code>Object</code> | Event payload |
| payload.stage | <code>string</code> | Stage name |
| payload.durationMs | <code>number</code> | Duration in milliseconds |

<a name="persistPipelineUndoEntries"></a>

## persistPipelineUndoEntries(params) ⇒ <code>Promise.&lt;Object&gt;</code>
Persist undo entries for successful pipeline results.
Persistence failure is best-effort only; per-entry errors are collected and never thrown.

**Kind**: global function  
**Returns**: <code>Promise.&lt;Object&gt;</code> - Persistence summary.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>Object</code> |  |  |
| params.result | <code>Object</code> |  | Pipeline result containing results[]. |
| params.store | <code>Object</code> |  | Store module with addUndoEntry(). |
| [params.userId] | <code>string</code> \| <code>number</code> |  | Optional user id attached to undo entries. |
| [params.batchPrefix] | <code>string</code> | <code>&quot;&#x27;undo&#x27;&quot;</code> | Prefix for generated batch id. |

<a name="parseNonNegativeIntEnv"></a>

## parseNonNegativeIntEnv(value, fallback) ⇒ <code>number</code>
Parses a non-negative integer from an environment variable with a fallback.

**Kind**: global function  
**Returns**: <code>number</code> - Parsed integer or fallback  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>string</code> \| <code>undefined</code> | Raw string value |
| fallback | <code>number</code> | Fallback value |

<a name="getPipelineRetryConfig"></a>

## getPipelineRetryConfig() ⇒ <code>Object</code>
Gets the retry configuration for the pipeline from environment variables.

**Kind**: global function  
<a name="normalizeRetryDelayMs"></a>

## normalizeRetryDelayMs(retryAfterMs, retryAt) ⇒ <code>number</code> \| <code>null</code>
Normalizes retry delay to milliseconds.

**Kind**: global function  
**Returns**: <code>number</code> \| <code>null</code> - Delay in milliseconds or null  

| Param | Type | Description |
| --- | --- | --- |
| retryAfterMs | <code>number</code> \| <code>undefined</code> | Delay in milliseconds |
| retryAt | <code>string</code> \| <code>undefined</code> | ISO date string |

<a name="formatRetryEta"></a>

## formatRetryEta(retryAfterMs, retryAt) ⇒ <code>string</code> \| <code>null</code>
Formats a retry delay as a human-readable ETA (e.g., "5s", "2m", "1h").

**Kind**: global function  
**Returns**: <code>string</code> \| <code>null</code> - Formatted ETA or null  

| Param | Type | Description |
| --- | --- | --- |
| retryAfterMs | <code>number</code> \| <code>undefined</code> | Delay in milliseconds |
| retryAt | <code>string</code> \| <code>undefined</code> | ISO date string |

<a name="extractAdapterErrorMeta"></a>

## extractAdapterErrorMeta(errorOrMessage) ⇒ <code>Object</code>
Extracts structured metadata from an adapter error.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| errorOrMessage | <code>Error</code> \| <code>string</code> \| <code>null</code> | The error to extract from |

<a name="classifyAdapterFailureCategory"></a>

## classifyAdapterFailureCategory(errorOrMessage) ⇒ <code>string</code>
Classifies an adapter failure into a failure category (transient vs permanent).

**Kind**: global function  
**Returns**: <code>string</code> - Failure category  

| Param | Type | Description |
| --- | --- | --- |
| errorOrMessage | <code>Error</code> \| <code>string</code> | The error to classify |

<a name="deriveFailureCategory"></a>

## deriveFailureCategory(params) ⇒ <code>string</code>
Derives the overall failure category from pipeline state.

**Kind**: global function  
**Returns**: <code>string</code> - Resolved failure category  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>Object</code> |  |
| params.failureClass | <code>string</code> | Primary failure class |
| [params.failureCategory] | <code>string</code> | Explicitly provided category |
| [params.details] | <code>Object</code> | Additional failure details |
| [params.rolledBack] | <code>boolean</code> | Whether changes were rolled back |
| [params.retryable] | <code>boolean</code> | Whether the failure is retryable |

<a name="buildUserFailureMessage"></a>

## buildUserFailureMessage(params) ⇒ <code>string</code>
Builds a user-facing failure message from pipeline failure state.

**Kind**: global function  
**Returns**: <code>string</code> - User-facing confirmation text  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>Object</code> |  |
| params.failureClass | <code>string</code> | Primary failure class |
| params.failureCategory | <code>string</code> | Resolved failure category |
| [params.details] | <code>Object</code> | Additional failure details |
| params.rolledBack | <code>boolean</code> | Whether changes were rolled back |

<a name="resolveDevMode"></a>

## resolveDevMode(context) ⇒ <code>boolean</code>
Resolves whether dev/debug mode is active from context or environment.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| context | <code>Object</code> | Pipeline request context |

<a name="buildFailureResult"></a>

## buildFailureResult(context, params) ⇒ <code>Object</code>
Builds a structured pipeline failure result object.

**Kind**: global function  
**Returns**: <code>Object</code> - Pipeline result of type 'error'  

| Param | Type | Description |
| --- | --- | --- |
| context | <code>Object</code> | Pipeline request context |
| params | <code>Object</code> | Failure parameters |

<a name="createPipeline"></a>

## createPipeline(options) ⇒ <code>Object</code>
Create a pipeline instance that orchestrates intent extraction, normalization,and TickTick adapter execution.

**Kind**: global function  
**Returns**: <code>Object</code> - - `processMessage(userMessage, options?)` → `{ type: 'task'|'preview'|'blocked'|'info'|'error', confirmationText, taskId?, diagnostics?, ... }`
  - `getTelemetry()` → the observability instance for this pipeline  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>Object</code> |  |
| options.intentExtractor | <code>Object</code> | Intent extractor with `extractIntents(message, opts)` method |
| options.normalizer | <code>Object</code> | Normalizer module with `normalize(action, tasks, projects, opts)` method |
| options.adapter | [<code>TickTickAdapter</code>](#TickTickAdapter) | TickTick adapter instance |
| [options.observability] | <code>Object</code> | Optional observability emitter (see createPipelineObservability) |

<a name="createPipeline..processMessageWithContext"></a>

### createPipeline~processMessageWithContext()
Builds a request context then runs processMessage — canonicalcontext-wired entry point.  All bot handlers, callbacks, andscheduler poll paths should call this instead of duplicatingthe createRequestContext → processMessage dance locally.

**Kind**: inner method of [<code>createPipeline</code>](#createPipeline)  
<a name="resolveProjectCategory"></a>

## resolveProjectCategory(projectName) ⇒ <code>Object</code> \| <code>null</code>
Resolve a project name or alias to its category configuration.

**Kind**: global function  

| Param | Type |
| --- | --- |
| projectName | <code>string</code> | 

<a name="resolveProjectCategoryFromPolicy"></a>

## resolveProjectCategoryFromPolicy(projectName, policy) ⇒ <code>Object</code> \| <code>null</code>
Resolve a project name or alias against an explicit policy object.

**Kind**: global function  

| Param | Type |
| --- | --- |
| projectName | <code>string</code> | 
| policy | <code>object</code> \| <code>null</code> | 

<a name="getCategoryConfig"></a>

## getCategoryConfig()
Get the category configuration for a given category key.
Falls back to uncategorized if unknown.

**Kind**: global function  
<a name="getConfiguredProjectNames"></a>

## getConfiguredProjectNames()
Get all configured project names (for inference helpers).

**Kind**: global function  
<a name="isConfiguredProject"></a>

## isConfiguredProject()
Check if a project is explicitly configured.

**Kind**: global function  
<a name="shouldSuppressScheduledNotification"></a>

## shouldSuppressScheduledNotification(workStyleMode, notificationType) ⇒ <code>boolean</code>
Determines if a notification should be suppressed based on current work-style mode.

**Kind**: global function  
**Returns**: <code>boolean</code> - True if suppressed  

| Param | Type | Description |
| --- | --- | --- |
| workStyleMode | <code>string</code> | Current mode (standard/focus/urgent) |
| notificationType | <code>string</code> | Type from SCHEDULER_NOTIFICATION_TYPES |

<a name="shouldSendMissedDelivery"></a>

## shouldSendMissedDelivery(lastDeliveryIso, scheduledTimeIso, graceWindowMinutes) ⇒ <code>boolean</code>
Check if a scheduled delivery should be sent based on last delivery time and grace window

**Kind**: global function  
**Returns**: <code>boolean</code> - Whether delivery should be sent  

| Param | Type | Description |
| --- | --- | --- |
| lastDeliveryIso | <code>string</code> \| <code>null</code> | ISO timestamp of last delivery |
| scheduledTimeIso | <code>string</code> | ISO timestamp when delivery was scheduled for |
| graceWindowMinutes | <code>number</code> | Grace window in minutes |

<a name="buildSchedulingMetadata"></a>

## buildSchedulingMetadata(scheduleKey, scheduledForIso, graceWindowMinutes) ⇒ <code>Object</code>
Helper to build scheduling metadata context for consistent delivery path

**Kind**: global function  
**Returns**: <code>Object</code> - Scheduling metadata context  

| Param | Type | Description |
| --- | --- | --- |
| scheduleKey | <code>string</code> | Identifier for the schedule (e.g., 'daily-briefing') |
| scheduledForIso | <code>string</code> | When the delivery was scheduled for |
| graceWindowMinutes | <code>number</code> | Configured grace window |

<a name="runDailyBriefingJob"></a>

## runDailyBriefingJob(deps) ⇒ <code>Promise.&lt;boolean&gt;</code>
Executes the daily briefing job, including task fetch, Gemini summary, and notification.

**Kind**: global function  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - True if successful  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| deps | <code>Object</code> |  |  |
| deps.bot | <code>Object</code> |  | Bot instance |
| deps.ticktick | <code>Object</code> |  | TickTick client |
| deps.gemini | <code>Object</code> |  | Gemini service |
| deps.adapter | <code>Object</code> |  | TickTick adapter |
| [deps.config] | <code>Object</code> | <code>{}</code> | Job configuration |

<a name="runWeeklyDigestJob"></a>

## runWeeklyDigestJob(deps) ⇒ <code>Promise.&lt;boolean&gt;</code>
Executes the weekly digest job, analyzing processed tasks from the past week.

**Kind**: global function  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - True if successful  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| deps | <code>Object</code> |  |  |
| deps.bot | <code>Object</code> |  | Bot instance |
| deps.ticktick | <code>Object</code> |  | TickTick client |
| deps.gemini | <code>Object</code> |  | Gemini service |
| deps.adapter | <code>Object</code> |  | TickTick adapter |
| [deps.processedTasks] | <code>Object</code> |  | Map of processed tasks (defaults to store) |
| [deps.config] | <code>Object</code> | <code>{}</code> | Job configuration |

<a name="retryDeferredIntents"></a>

## retryDeferredIntents(deps, [options]) ⇒ <code>Object</code>
Retry deferred pipeline intents that were saved when the TickTick APIwas unavailable (R12 graceful degradation).  Runs on startup andperiodically during the poll cycle.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| deps | <code>Object</code> |  |  |
| deps.adapter | <code>Object</code> |  | TickTick adapter (used to probe API health) |
| deps.pipeline | <code>Object</code> |  | Pipeline instance (processMessageWithContext) |
| [deps.bot] | <code>Object</code> |  | Bot instance for user notification |
| [options] | <code>Object</code> |  |  |
| [options.maxRetries] | <code>number</code> | <code>5</code> | Max intents to retry per invocation |

<a name="runStartupCatchupJobs"></a>

## runStartupCatchupJobs(services, [config], [options]) ⇒ <code>Promise.&lt;{daily: boolean, weekly: boolean}&gt;</code>
Orchestrates catch-up jobs on startup for any missed scheduled deliveries.

**Kind**: global function  
**Returns**: <code>Promise.&lt;{daily: boolean, weekly: boolean}&gt;</code> - Results of catch-up attempts  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| services | <code>Object</code> |  | Service dependencies |
| [config] | <code>Object</code> | <code>{}</code> | Scheduler configuration |
| [options] | <code>Object</code> |  | Optional timing overrides for testing |

<a name="startScheduler"></a>

## startScheduler(bot, ticktick, gemini, adapter, pipeline, config) ⇒ <code>Promise.&lt;void&gt;</code>
Initializes and starts the cron-based scheduler.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| bot | <code>Object</code> | Bot instance |
| ticktick | <code>Object</code> | TickTick client |
| gemini | <code>Object</code> | Gemini service |
| adapter | <code>Object</code> | TickTick adapter |
| pipeline | <code>Object</code> | Pipeline instance |
| config | <code>Object</code> | Scheduler configuration |

<a name="toArray"></a>

## toArray(value) ⇒ <code>Array</code>
Safely coerce a value to array. Returns empty array for non-arrays.

**Kind**: global function  

| Param | Type |
| --- | --- |
| value | <code>\*</code> | 

<a name="toString"></a>

## toString(value, [fallback]) ⇒ <code>string</code>
Safely extract a non-empty trimmed string, returning fallback otherwise.

**Kind**: global function  

| Param | Type | Default |
| --- | --- | --- |
| value | <code>\*</code> |  | 
| [fallback] | <code>string</code> | <code>&quot;&#x27;&#x27;&quot;</code> | 

<a name="answerCallbackQueryBestEffort"></a>

## answerCallbackQueryBestEffort(ctx, [options]) ⇒ <code>Promise.&lt;(\*\|null)&gt;</code>
Acknowledge a Telegram callback without failing the business action when the
callback query has already expired.

**Kind**: global function  
**Returns**: <code>Promise.&lt;(\*\|null)&gt;</code> - Telegram response or null when the ACK is expired  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| ctx | <code>Object</code> |  | Grammy context |
| [options] | <code>Object</code> | <code>{}</code> | answerCallbackQuery options |

<a name="asActiveTasks"></a>

## asActiveTasks([tasks]) ⇒ <code>Array</code>
Filter tasks to active ones (status 0 or undefined).

**Kind**: global function  

| Param | Type | Default |
| --- | --- | --- |
| [tasks] | <code>Array</code> | <code>[]</code> | 

<a name="asProcessedHistory"></a>

## asProcessedHistory([processedHistory]) ⇒ <code>Array</code>
Filter history entries to valid objects.

**Kind**: global function  

| Param | Type | Default |
| --- | --- | --- |
| [processedHistory] | <code>Array</code> | <code>[]</code> | 

<a name="mergeNotices"></a>

## mergeNotices([baseNotices], [modelNotices]) ⇒ <code>Array</code>
Merge two notice arrays, deduplicating by `code`.
Base notices take precedence over model notices for same code.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [baseNotices] | <code>Array</code> | <code>[]</code> | System-generated notices (higher priority) |
| [modelNotices] | <code>Array</code> | <code>[]</code> | Model-generated notices |

<a name="isAuthorized"></a>

## isAuthorized(ctx) ⇒ <code>boolean</code>
Checks if a Telegram context originates from the authorized chat.

**Kind**: global function  
**Returns**: <code>boolean</code> - True if authorized or no restriction set  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Telegram context object |

<a name="guardAccess"></a>

## guardAccess(ctx) ⇒ <code>Promise.&lt;boolean&gt;</code>
Guards access to bot commands, replying with a lock message if unauthorized.

**Kind**: global function  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - True if authorized, false otherwise  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Telegram context object |

<a name="buildUndoEntry"></a>

## buildUndoEntry(params) ⇒ <code>Object</code>
Builds an undo entry for the state store to allow reverting mutations.

**Kind**: global function  
**Returns**: <code>Object</code> - A structured undo log entry  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>Object</code> |  |  |
| params.source | <code>Object</code> |  | The original task or state before mutation |
| params.action | <code>string</code> |  | The type of action performed (e.g., 'update', 'move') |
| [params.applied] | <code>Object</code> | <code>{}</code> | The specific fields applied during mutation |
| [params.appliedTaskId] | <code>string</code> \| <code>null</code> | <code>null</code> | The ID of the task after mutation (if different) |

<a name="projectNameFor"></a>

## projectNameFor()
Display-only project label helper. Never use for write routing.

**Kind**: global function  
<a name="buildFieldDiff"></a>

## buildFieldDiff(snapshot, action, [options]) ⇒ <code>Array.&lt;{field:string, label:string, oldValue:string, newValue:string, emoji:string}&gt;</code>
Builds user-facing old-to-new field diffs for task mutations.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| snapshot | <code>Object</code> \| <code>null</code> |  | Task state before mutation |
| action | <code>Object</code> \| <code>null</code> |  | Normalized action or proposed mutation |
| [options] | <code>Object</code> |  |  |
| [options.projects] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | Known TickTick projects for names |

<a name="formatFieldDiff"></a>

## formatFieldDiff(diffs, [options]) ⇒ <code>string</code>
Formats task field diffs into compact Telegram-safe lines.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| diffs | <code>Array.&lt;Object&gt;</code> |  | Output from buildFieldDiff |
| [options] | <code>Object</code> |  |  |
| [options.urgentMode] | <code>boolean</code> | <code>false</code> | Use shorter labels |

<a name="userNow"></a>

## userNow() ⇒ <code>Object</code>
Get the user's current time as date components in their timezone.

**Kind**: global function  
<a name="userTodayFormatted"></a>

## userTodayFormatted()
Format today's date as "Monday, 21 February 2026" in the user's timezone

**Kind**: global function  
<a name="userLocaleString"></a>

## userLocaleString(date) ⇒ <code>string</code>
Formats a Date object as a localized string in the user's timezone.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted locale string  

| Param | Type | Description |
| --- | --- | --- |
| date | <code>Date</code> \| <code>string</code> \| <code>number</code> | The date to format |

<a name="userTimeString"></a>

## userTimeString() ⇒ <code>string</code>
Returns the current time formatted for logs in the user's timezone.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted time string  
<a name="atTimeISO"></a>

## atTimeISO()
Build an ISO datetime string for TickTick, with correct timezone offset

**Kind**: global function  
<a name="endOfDayISO"></a>

## endOfDayISO()
Build an ISO date string at end-of-day

**Kind**: global function  
<a name="parseDateStringToTickTickISO"></a>

## parseDateStringToTickTickISO()
Safely parse a YYYY-MM-DD string into a TickTick ISO string with the current user's timezone offset
following Postel's Law to shield against messy LLM output.

**Kind**: global function  
<a name="containsSensitiveContent"></a>

## containsSensitiveContent(text) ⇒ <code>boolean</code>
Conservative sensitive-content detector to prevent destructive rewrites.

**Kind**: global function  
**Returns**: <code>boolean</code> - True if text likely contains secrets or sensitive info  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | The text to check |

<a name="scheduleToDateTime"></a>

## scheduleToDateTime(bucket, [options]) ⇒ <code>string</code> \| <code>null</code>
Maps a scheduling bucket (e.g., 'today') to an ISO datetime string.

**Kind**: global function  
**Returns**: <code>string</code> \| <code>null</code> - ISO datetime string for TickTick or null  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| bucket | <code>string</code> |  | The scheduling bucket ('today', 'tomorrow', 'this-week', 'next-week') |
| [options] | <code>Object</code> |  |  |
| [options.priorityLabel] | <code>string</code> | <code>&quot;&#x27;important&#x27;&quot;</code> | Priority label to determine time slot |

<a name="scheduleToDate"></a>

## scheduleToDate(bucket, [options]) ⇒ <code>string</code> \| <code>null</code>
Alias for scheduleToDateTime that returns a TickTick ISO string.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| bucket | <code>string</code> | Scheduling bucket |
| [options] | <code>Object</code> | Options passed to scheduleToDateTime |

<a name="buildTickTickUpdate"></a>

## buildTickTickUpdate(data, [options]) ⇒ <code>Object</code>
Builds a TickTick update object for mutations.

**Kind**: global function  
**Returns**: <code>Object</code> - Structured TickTick update payload  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| data | <code>Object</code> |  | The source data for update |
| [options] | <code>Object</code> |  |  |
| [options.applyMode] | <code>string</code> | <code>&quot;&#x27;full&#x27;&quot;</code> | Mutation mode ('full' or 'metadata-only') |
| [options.priorityLabel] | <code>string</code> | <code>&quot;&#x27;important&#x27;&quot;</code> | Priority label for scheduling |

<a name="buildTaskCard"></a>

## buildTaskCard(task, analysis) ⇒ <code>string</code>
Builds a descriptive task card for Telegram display.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted Telegram message string  

| Param | Type | Description |
| --- | --- | --- |
| task | <code>Object</code> | Original TickTick task object |
| analysis | <code>Object</code> | Gemini analysis object |

<a name="buildTaskCardFromAction"></a>

## buildTaskCardFromAction(task, action, [projects]) ⇒ <code>string</code>
Builds a Telegram review card from a task + normalized action.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted Telegram message string  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| task | <code>Object</code> |  | Original TickTick task object |
| action | <code>Object</code> |  | Normalized pipeline action |
| [projects] | <code>Array</code> | <code>[]</code> | List of available TickTick projects |

<a name="buildImprovedContent"></a>

## buildImprovedContent(analysis) ⇒ <code>string</code>
Builds the improved task description content from analysis results.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted content string  

| Param | Type | Description |
| --- | --- | --- |
| analysis | <code>Object</code> | Gemini analysis object |

<a name="buildPendingData"></a>

## buildPendingData(task, analysis, [projects]) ⇒ <code>Object</code>
Normalizes task and analysis into a pending task record for the store.

**Kind**: global function  
**Returns**: <code>Object</code> - Structured pending task record  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| task | <code>Object</code> |  | Original TickTick task |
| analysis | <code>Object</code> |  | Gemini analysis |
| [projects] | <code>Array</code> | <code>[]</code> | List of available TickTick projects |

<a name="buildPendingDataFromAction"></a>

## buildPendingDataFromAction(task, action, [projects]) ⇒ <code>Object</code>
Maps a normalized pipeline action to the pending data shape expected by the store and callbacks.

**Kind**: global function  
**Returns**: <code>Object</code> - Structured pending task record  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| task | <code>Object</code> |  | Original TickTick task |
| action | <code>Object</code> |  | Normalized pipeline action |
| [projects] | <code>Array</code> | <code>[]</code> | List of available TickTick projects |

<a name="pendingToAnalysis"></a>

## pendingToAnalysis(data) ⇒ <code>Object</code>
Maps a stored pending record back to an analysis object shape.

**Kind**: global function  
**Returns**: <code>Object</code> - Reconstructed Gemini analysis object  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Object</code> | Stored pending task data |

<a name="buildAutoApplyNotification"></a>

## buildAutoApplyNotification(results, [options]) ⇒ <code>string</code> \| <code>null</code>
Builds a notification message for auto-applied task updates.
Shows per-task field diffs when available (via `diffs` array on each result),
falls back to legacy schedule/movedTo format for entries without diffs.
Limits visible tasks to 5 with overflow line.

**Kind**: global function  
**Returns**: <code>string</code> \| <code>null</code> - Formatted notification or null if no results  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| results | <code>Array.&lt;Object&gt;</code> |  | List of auto-applied results |
| [options] | <code>Object</code> |  |  |
| [options.hasSkippedActions] | <code>boolean</code> | <code>false</code> | Whether destructive actions were skipped |

<a name="sleep"></a>

## sleep(ms) ⇒ <code>Promise.&lt;void&gt;</code>
Utility to pause execution for a given duration.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| ms | <code>number</code> | Milliseconds to sleep |

<a name="truncateMessage"></a>

## truncateMessage(text, [limit]) ⇒ <code>string</code>
Truncates a message to stay under Telegram's character limit.

**Kind**: global function  
**Returns**: <code>string</code> - Truncated text  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| text | <code>string</code> |  | Text to truncate |
| [limit] | <code>number</code> | <code>3800</code> | Character limit |

<a name="escapeHTML"></a>

## escapeHTML(str) ⇒ <code>string</code>
Escapes HTML special characters for safe inclusion in Telegram HTML messages.

**Kind**: global function  
**Returns**: <code>string</code> - Escaped string  

| Param | Type | Description |
| --- | --- | --- |
| str | <code>string</code> | String to escape |

<a name="parseTelegramMarkdownToHTML"></a>

## parseTelegramMarkdownToHTML(text) ⇒ <code>string</code>
Parses basic Telegram Markdown into HTML tags supported by Telegraf/Telegram.

**Kind**: global function  
**Returns**: <code>string</code> - HTML formatted text  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | Markdown text |

<a name="replyWithMarkdown"></a>

## replyWithMarkdown(ctx, text, [extra]) ⇒ <code>Promise.&lt;Object&gt;</code>
Sends a reply using HTML parse mode, converting Markdown input.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| ctx | <code>Object</code> |  | Telegram context |
| text | <code>string</code> |  | Markdown text |
| [extra] | <code>Object</code> | <code>{}</code> | Additional message options |

<a name="editWithMarkdown"></a>

## editWithMarkdown(ctx, text, [extra]) ⇒ <code>Promise.&lt;Object&gt;</code>
Edits a message using HTML parse mode, converting Markdown input.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| ctx | <code>Object</code> |  | Telegram context |
| text | <code>string</code> |  | Markdown text |
| [extra] | <code>Object</code> | <code>{}</code> | Additional message options |

<a name="sendWithMarkdown"></a>

## sendWithMarkdown(api, chatId, text, [extra]) ⇒ <code>Promise.&lt;Object&gt;</code>
Sends a message via Bot API using HTML parse mode, converting Markdown input.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| api | <code>Object</code> |  | Telegraf/Grammy API instance |
| chatId | <code>number</code> \| <code>string</code> |  | Target chat ID |
| text | <code>string</code> |  | Markdown text |
| [extra] | <code>Object</code> | <code>{}</code> | Additional message options |

<a name="appendUrgentModeReminder"></a>

## appendUrgentModeReminder(text, urgentMode) ⇒ <code>string</code>
Appends an urgent mode reminder to the text if urgent mode is active.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | Original message text |
| urgentMode | <code>boolean</code> | Whether urgent mode is active |

<a name="formatBriefingHeader"></a>

## formatBriefingHeader(params) ⇒ <code>string</code>
Formats a briefing header for various summary surfaces.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted header  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>Object</code> |  |
| params.kind | <code>string</code> | Briefing kind ('daily', 'daily_close', 'weekly') |

<a name="filterProcessedThisWeek"></a>

## filterProcessedThisWeek(processedTasks, [fallbackKeys]) ⇒ <code>Object</code>
Filters processed tasks to include only those from the last 7 days.

**Kind**: global function  
**Returns**: <code>Object</code> - Filtered map  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| processedTasks | <code>Object</code> |  | Map of processed tasks |
| [fallbackKeys] | <code>Array.&lt;string&gt;</code> | <code>[]</code> | Keys to check for date if reviewedAt is missing |

<a name="buildQuotaExhaustedMessage"></a>

## buildQuotaExhaustedMessage(gemini) ⇒ <code>string</code>
Builds a user-friendly message when Gemini AI quota is exhausted.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| gemini | <code>Object</code> | Gemini service instance |

<a name="formatProcessedTask"></a>

## formatProcessedTask(task) ⇒ <code>string</code>
Formats a single processed task for summary displays.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted line  

| Param | Type | Description |
| --- | --- | --- |
| task | <code>Object</code> | Processed task record |

<a name="buildMutationConfirmationMessage"></a>

## buildMutationConfirmationMessage(pendingConfirmation, [options]) ⇒ <code>string</code>
Builds a confirmation message for destructive/non-exact mutations.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted confirmation message  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| pendingConfirmation | <code>Object</code> \| <code>null</code> |  | The pendingConfirmation object from pipeline result |
| [options] | <code>Object</code> |  |  |
| [options.workStyleMode] | <code>string</code> | <code>&quot;&#x27;standard&#x27;&quot;</code> | Current work-style mode |

<a name="buildMutationConfirmationKeyboard"></a>

## buildMutationConfirmationKeyboard([options]) ⇒ <code>InlineKeyboard</code>
Builds an inline keyboard for mutation confirmation.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> |  |  |
| [options.includeCancel] | <code>boolean</code> | <code>true</code> | Whether to include a cancel button |

<a name="truncateCandidateLabel"></a>

## truncateCandidateLabel(title) ⇒ <code>string</code>
Truncates a task candidate label for inline keyboard display.

**Kind**: global function  
**Returns**: <code>string</code> - Truncated title  

| Param | Type | Description |
| --- | --- | --- |
| title | <code>string</code> | Task title |

<a name="buildMutationCandidateKeyboard"></a>

## buildMutationCandidateKeyboard(candidates, [options]) ⇒ <code>InlineKeyboard</code>
Builds an inline keyboard for selecting mutation candidates.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| candidates | <code>Array.&lt;Object&gt;</code> |  | List of task candidates |
| [options] | <code>Object</code> |  |  |
| [options.intentSummary] | <code>string</code> \| <code>null</code> | <code>null</code> | Optional summary of the user intent |
| [options.includeCancel] | <code>boolean</code> | <code>true</code> | Whether to include a cancel button |

<a name="buildMutationClarificationMessage"></a>

## buildMutationClarificationMessage(reason, candidates, intentSummary, [options]) ⇒ <code>string</code>
Builds a clarification message for ambiguous task mutations.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted message  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| reason | <code>string</code> |  | The reason clarification is needed |
| candidates | <code>Array.&lt;Object&gt;</code> |  | The task candidates found |
| intentSummary | <code>string</code> \| <code>null</code> |  | Summary of what the user wants to do |
| [options] | <code>Object</code> |  |  |
| [options.workStyleMode] | <code>string</code> | <code>&quot;&#x27;standard&#x27;&quot;</code> | Current work-style mode |

<a name="validateChecklistItem"></a>

## validateChecklistItem(item) ⇒ <code>Object</code> \| <code>null</code>
Validates a single checklist item's structural integrity.
Used by both normalizer (post-cleaning) and adapter (pre-API).

**Kind**: global function  
**Returns**: <code>Object</code> \| <code>null</code> - Validated item with {title, status, sortOrder} or null if invalid  

| Param | Type | Description |
| --- | --- | --- |
| item | <code>Object</code> \| <code>null</code> | Raw or cleaned checklist item |

<a name="buildUndoEntryFromRollbackStep"></a>

## buildUndoEntryFromRollbackStep(rollbackStep, action) ⇒ <code>Object</code>
Builds an undo entry from a pipeline rollbackStep and action.
Maps pipeline rollback types (delete_created, restore_updated, recreate_deleted, uncomplete_task)
to undo entries that can be persisted via store.addUndoEntry and executed by executeUndoEntry.

**Kind**: global function  
**Returns**: <code>Object</code> - Undo entry object with rollbackType, snapshot, batchId-compatible fields  

| Param | Type | Description |
| --- | --- | --- |
| rollbackStep | <code>Object</code> | Pipeline rollback step from result.results[].rollbackStep |
| action | <code>Object</code> | The normalized action that was executed |

<a name="buildFreeformReceipt"></a>

## buildFreeformReceipt(result, [options]) ⇒ <code>string</code>
Builds a transparent receipt from a pipeline result for freeform task mutations.
Shows per-action type with title, field diffs for updates, and skipped-action warnings.

**Kind**: global function  
**Returns**: <code>string</code> - Formatted receipt text (Markdown)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| result | <code>Object</code> |  | Pipeline result object with results[] and skippedActions[] |
| [options] | <code>Object</code> |  |  |
| [options.projects] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | Known TickTick projects for name resolution in diffs |

<a name="isFollowUpMessage"></a>

## isFollowUpMessage(text) ⇒ <code>boolean</code>
Detects if a freeform message is likely a follow-up referring to a recent task.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| text | <code>string</code> | The user's message |

<a name="retryWithBackoff"></a>

## retryWithBackoff(fn, [options]) ⇒ <code>Promise.&lt;\*&gt;</code>
Retry an async operation with exponential backoff for transient failures.

**Kind**: global function  
**Returns**: <code>Promise.&lt;\*&gt;</code> - Result of fn  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| fn | <code>function</code> |  | Async function to retry |
| [options] | <code>Object</code> |  |  |
| [options.maxRetries] | <code>number</code> | <code>2</code> | Max retry attempts |
| [options.baseDelayMs] | <code>number</code> | <code>1000</code> | Initial delay in ms |
| [options.isRetryable] | <code>function</code> |  | Predicate to determine if error is retryable |

<a name="tryAcquireIntakeLock"></a>

## tryAcquireIntakeLock([options]) ⇒ <code>boolean</code>
Try to acquire the shared TickTick intake lock.

The lock prevents overlapping poll/scan/review cycles from mutating the same
TickTick intake stream at once. Expired locks self-heal on the next acquire
attempt instead of blocking forever after a crash.

**Kind**: global function  
**Returns**: <code>boolean</code> - True when acquired; false when another unexpired owner holds it.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> |  |  |
| [options.owner] | <code>string</code> | <code>&quot;&#x27;unknown&#x27;&quot;</code> | Human-readable lock owner for diagnostics. |
| [options.ttlMs] | <code>number</code> | <code>300000</code> | Lock time-to-live in milliseconds. |
| [options.now] | <code>number</code> | <code>Date.now()</code> | Current timestamp override for tests. |

<a name="releaseIntakeLock"></a>

## releaseIntakeLock() ⇒ <code>void</code>
Release the shared TickTick intake lock.

Callers should release only locks they acquired. The lock also expires by TTL
as a defensive fallback for process crashes or interrupted async flows.

**Kind**: global function  
<a name="getIntakeLockStatus"></a>

## getIntakeLockStatus([options]) ⇒ <code>Object</code> \| <code>Object</code>
Get diagnostic metadata for the shared TickTick intake lock.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> |  |  |
| [options.now] | <code>number</code> | <code>Date.now()</code> | Current timestamp override for tests. |

<a name="getChatId"></a>

## getChatId() ⇒ <code>number</code> \| <code>null</code>
Get the stored Telegram chat ID.

**Kind**: global function  
**Returns**: <code>number</code> \| <code>null</code> - Chat ID or null if not set  
<a name="setChatId"></a>

## setChatId(id) ⇒ <code>Promise.&lt;void&gt;</code>
Persist a Telegram chat ID to the store.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>number</code> | Telegram chat ID |

<a name="getWorkStyleMode"></a>

## getWorkStyleMode()
Get the current work-style mode for a user.Returns the active mode, automatically reverting to standard if expired.

**Kind**: global function  
<a name="setWorkStyleMode"></a>

## setWorkStyleMode(userId, mode, options)
Set the work-style mode for a user.Mode transitions are explicit — never changes without user action or auto-expiry.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| userId | <code>string</code> |  |
| mode | <code>string</code> | One of MODE_STANDARD, MODE_FOCUS, MODE_URGENT |
| options | <code>object</code> |  |
| [options.expiresAt] | <code>number</code> | Optional absolute expiry timestamp (ms since epoch) |
| [options.expiryMs] | <code>number</code> | Optional relative expiry duration (ms from now) |
| [options.reason] | <code>string</code> | Optional operational telemetry reason for the transition |

<a name="reconcileTaskState"></a>

## reconcileTaskState() ⇒ <code>Object</code>
Remove pending and failed entries for tasks no longer active in TickTick.

**Kind**: global function  
<a name="markTaskFailed"></a>

## markTaskFailed([retryAfterMs])
Park a task that failed analysis — prevents re-polling until retryAfterMs expires.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [retryAfterMs] | <code>number</code> | <code>7200000</code> | — ms to park (default 2h; callers can pass quota-aligned duration) |

<a name="approveTask"></a>

## approveTask(taskId) ⇒ <code>Promise.&lt;(Object\|null)&gt;</code>
Approve a pending task, marking it as processed.
Delegates to resolveTask with status 'approve'.

**Kind**: global function  
**Returns**: <code>Promise.&lt;(Object\|null)&gt;</code> - The processed task entry, or null if not pending  

| Param | Type | Description |
| --- | --- | --- |
| taskId | <code>string</code> | Task ID to approve |

<a name="skipTask"></a>

## skipTask(taskId) ⇒ <code>Promise.&lt;(Object\|null)&gt;</code>
Skip a pending task, marking it as processed without taking action.
Delegates to resolveTask with status 'skip'.

**Kind**: global function  
**Returns**: <code>Promise.&lt;(Object\|null)&gt;</code> - The processed task entry, or null if not pending  

| Param | Type | Description |
| --- | --- | --- |
| taskId | <code>string</code> | Task ID to skip |

<a name="dropTask"></a>

## dropTask(taskId) ⇒ <code>Promise.&lt;(Object\|null)&gt;</code>
Drop a pending task, marking it as processed and deprioritized.
Delegates to resolveTask with status 'drop'.

**Kind**: global function  
**Returns**: <code>Promise.&lt;(Object\|null)&gt;</code> - The processed task entry, or null if not pending  

| Param | Type | Description |
| --- | --- | --- |
| taskId | <code>string</code> | Task ID to drop |

<a name="markTaskStale"></a>

## markTaskStale(taskId, [data]) ⇒ <code>Promise.&lt;void&gt;</code>
Mark a pending task stale after it aged out of active review.
Preserves the pending snapshot, flags the processed entry stale, and removes it from the pending queue.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| taskId | <code>string</code> |  | Task ID to mark stale. |
| [data] | <code>Object</code> | <code>{}</code> | Extra metadata to merge into the processed entry. |

<a name="getQueueHealthSnapshot"></a>

## getQueueHealthSnapshot() ⇒ <code>Object</code>
Returns a snapshot of queue health for telemetry.

**Kind**: global function  
<a name="setQueueBlocked"></a>

## setQueueBlocked(isBlocked)
Sets or clears the queue blocked state.

**Kind**: global function  

| Param | Type |
| --- | --- |
| isBlocked | <code>boolean</code> | 

<a name="getPendingBatch"></a>

## getPendingBatch(options) ⇒ <code>Array</code>
Return a sorted slice of pending tasks.

**Kind**: global function  
**Returns**: <code>Array</code> - Array of [taskId, data] tuples  

| Param | Type | Default |
| --- | --- | --- |
| options | <code>Object</code> |  | 
| [options.limit] | <code>number</code> | <code>5</code> | 
| [options.sortBy] | <code>string</code> | <code>&quot;&#x27;sentAt&#x27;&quot;</code> | 

<a name="getNextPendingTask"></a>

## getNextPendingTask() ⇒ <code>Array</code> \| <code>null</code>
Return the oldest pending task (by sentAt).

**Kind**: global function  
**Returns**: <code>Array</code> \| <code>null</code> - [taskId, data] or null  
<a name="getPendingChecklistClarification"></a>

## getPendingChecklistClarification() ⇒ <code>Object</code> \| <code>null</code>
Gets the pending checklist clarification if it exists and hasn't expired.

**Kind**: global function  
**Returns**: <code>Object</code> \| <code>null</code> - Pending clarification data with {originalMessage, intents, chatId, userId, createdAt}, or null if none/expired  
<a name="setPendingChecklistClarification"></a>

## setPendingChecklistClarification(data) ⇒ <code>Promise.&lt;void&gt;</code>
Stores a pending checklist clarification with automatic timestamp.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Object</code> | Clarification data |
| data.originalMessage | <code>string</code> | The original user message that triggered clarification |
| data.intents | <code>Array</code> | Summary of extracted intents |
| [data.chatId] | <code>number</code> \| <code>null</code> | Telegram chat ID for cross-chat validation |
| [data.userId] | <code>number</code> \| <code>null</code> | Telegram user ID for cross-user validation |
| [data.entryPoint] | <code>string</code> | Pipeline entry point for resume routing |
| [data.mode] | <code>string</code> | Pipeline mode for resume routing |

<a name="clearPendingChecklistClarification"></a>

## clearPendingChecklistClarification() ⇒ <code>Promise.&lt;void&gt;</code>
Clears the pending checklist clarification state.

**Kind**: global function  
<a name="updateDeferredPipelineIntent"></a>

## updateDeferredPipelineIntent(updatedEntry)
Update a deferred pipeline intent in place (e.g., increment retry count).

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| updatedEntry | <code>Object</code> | Entry with updated fields (must have id) |

<a name="getUndoBatch"></a>

## getUndoBatch(batchId) ⇒ <code>Array.&lt;Object&gt;</code>
Get all undo entries sharing a batchId.

**Kind**: global function  
**Returns**: <code>Array.&lt;Object&gt;</code> - Array of undo entries with matching batchId  

| Param | Type | Description |
| --- | --- | --- |
| batchId | <code>string</code> | The batch identifier |

<a name="getLastAutoApplyBatch"></a>

## getLastAutoApplyBatch() ⇒ <code>Array.&lt;Object&gt;</code>
Get all undo entries from the most recent auto-apply batch.Groups by batchId; if no batchId, falls back to the single most recent auto-apply entry.

**Kind**: global function  
**Returns**: <code>Array.&lt;Object&gt;</code> - Array of undo entries from the same batch  
<a name="removeUndoEntries"></a>

## removeUndoEntries(entries)
Remove specific undo entries by reference identity.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| entries | <code>Array.&lt;Object&gt;</code> | Entries to remove |

<a name="getStats"></a>

## getStats() ⇒ <code>Object</code>
Get the cumulative stats snapshot.

**Kind**: global function  
<a name="updateStats"></a>

## updateStats(updates) ⇒ <code>Promise.&lt;void&gt;</code>
Merge partial updates into the cumulative stats.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| updates | <code>Object</code> | Partial stats object with fields to update |

<a name="getProcessedTasks"></a>

## getProcessedTasks() ⇒ <code>Object.&lt;string, Object&gt;</code>
Get all processed task entries.

**Kind**: global function  
**Returns**: <code>Object.&lt;string, Object&gt;</code> - Map of taskId → processed task entry  
<a name="getProcessedCount"></a>

## getProcessedCount() ⇒ <code>number</code>
Count the total number of processed task entries.

**Kind**: global function  
<a name="resetAll"></a>

## resetAll()
Wipe all data and start fresh

**Kind**: global function  
<a name="selectBehavioralPatternsForSummary"></a>

## selectBehavioralPatternsForSummary([patterns], [options]) ⇒ <code>Array.&lt;Object&gt;</code>
Select the most relevant behavioral patterns for a summary surface.

**Kind**: global function  
**Returns**: <code>Array.&lt;Object&gt;</code> - Sorted and filtered patterns.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [patterns] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | List of raw behavioral patterns. |
| [options] | <code>Object</code> | <code>{}</code> | Options. |
| [options.nowIso] | <code>string</code> | <code>null</code> | Current timestamp for freshness check. |

<a name="buildBehavioralPatternNotice"></a>

## buildBehavioralPatternNotice([patterns], [options]) ⇒ <code>Object</code> \| <code>null</code>
Build a single summary notice from the most significant behavioral pattern.

**Kind**: global function  
**Returns**: <code>Object</code> \| <code>null</code> - Notice object or null if no pattern is eligible.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [patterns] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | List of raw behavioral patterns. |
| [options] | <code>Object</code> | <code>{}</code> | Options. |
| [options.nowIso] | <code>string</code> | <code>null</code> | Current timestamp. |

<a name="composeBriefingSummarySections"></a>

## composeBriefingSummarySections(params) ⇒ <code>Object</code>
Compose the individual sections of a daily briefing summary.

**Kind**: global function  
**Returns**: <code>Object</code> - Object containing focus, priorities, why_now, start_now, and notices sections.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>Object</code> |  | Composition parameters. |
| [params.activeTasks] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | Current active tasks. |
| [params.behavioralPatterns] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | Behavioral patterns. |
| [params.rankingResult] | <code>Object</code> \| <code>null</code> | <code></code> | Prioritization results. |
| [params.context] | <code>Object</code> | <code>{}</code> | Request context. |
| [params.modelSummary] | <code>Object</code> \| <code>null</code> | <code></code> | Raw summary from Gemini. |

<a name="composeDailyCloseSummarySections"></a>

## composeDailyCloseSummarySections(params) ⇒ <code>Object</code>
Compose the individual sections of a daily close (reflection) summary.

**Kind**: global function  
**Returns**: <code>Object</code> - Object containing stats, reflection, reset_cue, and notices sections.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>Object</code> |  | Composition parameters. |
| [params.context] | <code>Object</code> | <code>{}</code> | Request context. |
| [params.activeTasks] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | Current active tasks. |
| [params.behavioralPatterns] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | Behavioral patterns. |
| [params.processedHistory] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | History of processed tasks. |
| [params.rankingResult] | <code>Object</code> \| <code>null</code> | <code></code> | Prioritization results. |
| [params.modelSummary] | <code>Object</code> \| <code>null</code> | <code></code> | Raw summary from Gemini. |

<a name="normalizeWeeklyWatchouts"></a>

## normalizeWeeklyWatchouts(watchouts) ⇒ <code>Array.&lt;object&gt;</code>
Normalizes weekly watchouts by filtering disallowed labels and missing data.

**Kind**: global function  
**Returns**: <code>Array.&lt;object&gt;</code> - Normalized watchouts  

| Param | Type | Description |
| --- | --- | --- |
| watchouts | <code>Array.&lt;object&gt;</code> | Raw watchout items |

<a name="normalizeBriefingSummary"></a>

## normalizeBriefingSummary(summary) ⇒ <code>object</code>
Normalizes a briefing summary object.

**Kind**: global function  
**Returns**: <code>object</code> - Normalized briefing summary  

| Param | Type | Description |
| --- | --- | --- |
| summary | <code>object</code> | Raw summary |

<a name="normalizeWeeklySummary"></a>

## normalizeWeeklySummary(summary) ⇒ <code>object</code>
Normalizes a weekly summary object.

**Kind**: global function  
**Returns**: <code>object</code> - Normalized weekly summary  

| Param | Type | Description |
| --- | --- | --- |
| summary | <code>object</code> | Raw summary |

<a name="normalizeDailyCloseSummary"></a>

## normalizeDailyCloseSummary(summary) ⇒ <code>object</code>
Normalizes a daily close summary object.

**Kind**: global function  
**Returns**: <code>object</code> - Normalized daily close summary  

| Param | Type | Description |
| --- | --- | --- |
| summary | <code>object</code> | Raw summary |

<a name="createSummaryDiagnostics"></a>

## createSummaryDiagnostics(params) ⇒ <code>object</code>
Creates summary diagnostics for observability.

**Kind**: global function  
**Returns**: <code>object</code> - Summary diagnostics  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>object</code> | Diagnostic parameters |

<a name="buildSummaryLogPayload"></a>

## buildSummaryLogPayload(params) ⇒ <code>object</code>
Builds a summary log payload for telemetry.

**Kind**: global function  
**Returns**: <code>object</code> - Log payload  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>object</code> | Log parameters |

<a name="logSummarySurfaceEvent"></a>

## logSummarySurfaceEvent(params)
Logs a summary surface event to the console.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>object</code> | Log parameters |

<a name="composeBriefingSummary"></a>

## composeBriefingSummary(params) ⇒ <code>object</code>
Stable summary-surface contract for daily briefing composition.

**Kind**: global function  
**Returns**: <code>object</code> - Composed briefing result  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>object</code> | Briefing parameters |

<a name="composeWeeklySummary"></a>

## composeWeeklySummary(params) ⇒ <code>object</code>
Stable summary-surface contract for weekly review composition.

**Kind**: global function  
**Returns**: <code>object</code> - Composed weekly review result  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>object</code> | Weekly review parameters |

<a name="composeDailyCloseSummary"></a>

## composeDailyCloseSummary(params) ⇒ <code>object</code>
Stable summary-surface contract for end-of-day reflection composition.

**Kind**: global function  
**Returns**: <code>object</code> - Composed daily close result  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>object</code> | Daily close parameters |

<a name="deriveInterventionProfile"></a>

## deriveInterventionProfile([processedHistory], [options]) ⇒ <code>Object</code>
Derive an intervention profile based on user's recent engagement with suggestions.

**Kind**: global function  
**Returns**: <code>Object</code> - Intervention profile object.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [processedHistory] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | History of processed tasks. |
| [options] | <code>Object</code> | <code>{}</code> | Options. |
| [options.generatedAtIso] | <code>string</code> | <code>null</code> | Reference timestamp. |
| [options.lookbackDays] | <code>number</code> | <code>7</code> | Days to look back. |

<a name="buildEngagementPatternNotice"></a>

## buildEngagementPatternNotice([profile], [options]) ⇒ <code>Object</code> \| <code>null</code>
Build a summary notice based on the derived intervention profile.

**Kind**: global function  
**Returns**: <code>Object</code> \| <code>null</code> - Notice object or null if no intervention is triggered.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [profile] | <code>Object</code> | <code>{}</code> | Result from deriveInterventionProfile. |
| [options] | <code>Object</code> | <code>{}</code> | Options. |
| [options.workStyleMode] | <code>string</code> | <code>&quot;&#x27;standard&#x27;&quot;</code> | Current work style mode. |

<a name="buildReflectionRecomputeContext"></a>

## buildReflectionRecomputeContext(params) ⇒ <code>Object</code>
Build context for determining if summary should be recomputed from live tasks.

**Kind**: global function  
**Returns**: <code>Object</code> - Recompute context object.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>Object</code> |  | Context parameters. |
| [params.activeTasks] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | List of active tasks. |
| [params.behavioralPatterns] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | List of behavioral patterns. |
| [params.processedHistory] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | History of processed tasks. |
| [params.historyAvailable] | <code>boolean</code> | <code>true</code> | Whether history is accessible. |
| [params.context] | <code>Object</code> | <code>{}</code> | Request context. |
| [params.sparseHistoryThreshold] | <code>number</code> | <code>2</code> | Count below which history is considered sparse. |

<a name="buildReflectionRecomputeNotice"></a>

## buildReflectionRecomputeNotice([recomputeContext], [options]) ⇒ <code>Object</code> \| <code>null</code>
Build a notice explaining if/why summary context was recomputed.

**Kind**: global function  
**Returns**: <code>Object</code> \| <code>null</code> - Notice object or null if no recompute happened.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [recomputeContext] | <code>Object</code> | <code>{}</code> | Result from buildReflectionRecomputeContext. |
| [options] | <code>Object</code> | <code>{}</code> | Options. |
| [options.surface] | <code>string</code> | <code>&quot;&#x27;weekly&#x27;&quot;</code> | Summary surface name. |

<a name="formatSummary"></a>

## formatSummary(params) ⇒ <code>Object</code>
Format a structured summary object into a user-facing string.

**Kind**: global function  
**Returns**: <code>Object</code> - Formatted result containing `text` and metadata.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>Object</code> |  | Formatting parameters. |
| params.kind | <code>string</code> |  | Summary kind (briefing, weekly, daily_close). |
| [params.summary] | <code>Object</code> | <code>{}</code> | The structured summary object. |
| [params.context] | <code>Object</code> | <code>{}</code> | Request context (for urgent mode reminders). |

<a name="composeWeeklySummarySections"></a>

## composeWeeklySummarySections(params) ⇒ <code>Object</code>
Compose the individual sections of a weekly review summary.

**Kind**: global function  
**Returns**: <code>Object</code> - Object containing progress, carry_forward, next_focus, watchouts, and notices sections.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>Object</code> |  | Composition parameters. |
| [params.modelSummary] | <code>Object</code> | <code>{}</code> | Raw summary generated by Gemini. |
| [params.activeTasks] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | Current active tasks. |
| [params.behavioralPatterns] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | Behavioral patterns. |
| [params.processedHistory] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | History of processed tasks. |
| [params.historyAvailable] | <code>boolean</code> | <code>true</code> | Whether history is accessible. |
| [params.rankingResult] | <code>Object</code> \| <code>null</code> | <code></code> | Results from the prioritization engine. |
| [params.context] | <code>Object</code> | <code>{}</code> | Request context. |

<a name="normalizeTitle"></a>

## normalizeTitle(title) ⇒ <code>string</code>
Normalize a title for matching: lowercase, trim, collapse whitespace, strip punctuation.

**Kind**: global function  

| Param | Type |
| --- | --- |
| title | <code>string</code> | 

<a name="levenshteinDistance"></a>

## levenshteinDistance(a, b) ⇒ <code>number</code>
Compute Levenshtein distance between two strings.

**Kind**: global function  

| Param | Type |
| --- | --- |
| a | <code>string</code> | 
| b | <code>string</code> | 

<a name="fuzzyScore"></a>

## fuzzyScore(a, b) ⇒ <code>number</code>
Compute a fuzzy similarity score between 0 and 1 based on Levenshtein distance.

**Kind**: global function  

| Param | Type |
| --- | --- |
| a | <code>string</code> | 
| b | <code>string</code> | 

<a name="matchTypeToConfidence"></a>

## matchTypeToConfidence(matchType) ⇒ <code>&#x27;exact&#x27;</code> \| <code>&#x27;high&#x27;</code> \| <code>&#x27;medium&#x27;</code> \| <code>&#x27;low&#x27;</code>
Derive matchConfidence tier from matchType string.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| matchType | <code>string</code> | One of: exact, prefix, contains, coreference, token_overlap, fuzzy, underspecified |

<a name="scoreTask"></a>

## scoreTask(task, normalizedQuery, originalQuery) ⇒ <code>object</code> \| <code>null</code>
Score one task against the target query.
Returns a candidate object or null if no meaningful match.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| task | <code>object</code> | { id, projectId, title, ... } |
| normalizedQuery | <code>string</code> |  |
| originalQuery | <code>string</code> |  |

<a name="resolveTarget"></a>

## resolveTarget(params) ⇒ <code>object</code>
Resolve a target query against a set of active tasks.

**Kind**: global function  
**Returns**: <code>object</code> - Resolver result: { status, selected, candidates, reason }  

| Param | Type | Description |
| --- | --- | --- |
| params | <code>object</code> |  |
| params.targetQuery | <code>string</code> | The user's reference to the target task |
| params.activeTasks | <code>Array.&lt;object&gt;</code> | Current tasks from TickTick, each with { id, projectId, title, ... } |

<a name="buildClarificationPrompt"></a>

## buildClarificationPrompt(result) ⇒ <code>string</code>
Build a terse clarification prompt from a clarification result.
Returns a string suitable for user-facing clarification.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>object</code> | A resolver result with status 'clarification' |

<a name="areEquivalentDueDates"></a>

## areEquivalentDueDates(expected, actual) ⇒ <code>boolean</code>
Compares TickTick due-date values by instant, not string offset.
TickTick may return UTC for a date sent with a local timezone offset.

**Kind**: global function  

| Param | Type |
| --- | --- |
| expected | <code>string</code> \| <code>null</code> \| <code>undefined</code> | 
| actual | <code>string</code> \| <code>null</code> \| <code>undefined</code> | 

<a name="buildErrorText"></a>

## buildErrorText(error) ⇒ <code>string</code>
Extracts and concatenates error message chunks from an error object or API response.

**Kind**: global function  
**Returns**: <code>string</code> - Concatenated error text in lowercase  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>Error</code> \| <code>object</code> | The error object to parse |

<a name="loadUserContextModule"></a>

## loadUserContextModule([searchPaths]) ⇒ <code>Promise.&lt;{mod: (object\|null), source: (string\|null), path: (string\|null)}&gt;</code>
Load user context module by searching paths in order.
Safe failure: logs exact path on error, continues to next path.
Never throws — returns { mod, source, path } with null mod on complete failure.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [searchPaths] | <code>Array.&lt;string&gt;</code> | <code>DEFAULT_SEARCH_PATHS</code> | Ordered paths to search (injectable for tests) |

<a name="getModuleExport"></a>

## getModuleExport(mod, key) ⇒ <code>\*</code> \| <code>undefined</code>
Extract a named export from a loaded module, returning undefined if missing.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| mod | <code>object</code> \| <code>null</code> | Module object from loadUserContextModule |
| key | <code>string</code> | Named export name |

<a name="getUserTimezone"></a>

## getUserTimezone() ⇒ <code>string</code>
Fetches the user's timezone from user_context, environment, or default.

**Kind**: global function  
**Returns**: <code>string</code> - Timezone string (e.g., 'Europe/Dublin')  
<a name="getUserTimezoneSource"></a>

## getUserTimezoneSource() ⇒ <code>&#x27;user\_context&#x27;</code> \| <code>&#x27;env&#x27;</code> \| <code>&#x27;default&#x27;</code>
Identifies the source of the resolved user timezone.

**Kind**: global function  
**Returns**: <code>&#x27;user\_context&#x27;</code> \| <code>&#x27;env&#x27;</code> \| <code>&#x27;default&#x27;</code> - Timezone source  
<a name="taskReviewKeyboard"></a>

## taskReviewKeyboard(taskId, [actionType]) ⇒ <code>InlineKeyboard</code>
Build an inline keyboard for task review.

**Kind**: global function  
**Returns**: <code>InlineKeyboard</code> - Grammy inline keyboard instance.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| taskId | <code>string</code> |  | The TickTick task ID. |
| [actionType] | <code>string</code> | <code>&quot;&#x27;update&#x27;&quot;</code> | The action type: 'update', 'complete', or 'delete'. |

<a name="advanceReviewCard"></a>

## advanceReviewCard(bot, adapter, pipeline)
Register all inline keyboard callback handlers.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| bot | <code>Bot</code> | Grammy bot instance. |
| adapter | [<code>TickTickAdapter</code>](#TickTickAdapter) | TickTick adapter instance. |
| pipeline | <code>Object</code> | Pipeline instance. |

<a name="registerCommands"></a>

## registerCommands(bot, ticktick, gemini, adapter, pipeline, [config])
Registers operational commands (/start, /menu, /status, /reset) and product surface commands (/scan, /pending, /reorg, /undo, /briefing, /weekly, /daily_close, /memory, /forget, /urgent, /focus, /normal, /mode).

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| bot | <code>Bot</code> |  | Grammy bot instance. |
| ticktick | [<code>TickTickClient</code>](#TickTickClient) |  | TickTick client instance. |
| gemini | [<code>GeminiAnalyzer</code>](#GeminiAnalyzer) |  | Gemini client instance. |
| adapter | [<code>TickTickAdapter</code>](#TickTickAdapter) |  | TickTick adapter instance. |
| pipeline | <code>Object</code> |  | Pipeline instance. |
| [config] | <code>Object</code> | <code>{}</code> | Bot configuration options. |

<a name="executeActions"></a>

## executeActions(actions, adapter, currentTasks, [options]) ⇒ <code>Promise.&lt;Object&gt;</code>
Execute a list of structured actions against TickTick.

**Kind**: global function  
**Returns**: <code>Promise.&lt;Object&gt;</code> - Object containing `outcomes` (string array), `hasUndoableActions` (boolean), `executionSummary` (counts), and `operationReceipt` (receipt object).  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| actions | <code>Array.&lt;Object&gt;</code> |  | Array of action objects (create, update, drop, complete). |
| adapter | [<code>TickTickAdapter</code>](#TickTickAdapter) |  | The adapter to execute writes. |
| currentTasks | <code>Array.&lt;Object&gt;</code> |  | Snapshot of active tasks for lookup. |
| [options] | <code>Object</code> | <code>{}</code> | Execution options. |

<a name="createBot"></a>

## createBot(token, ticktick, gemini, adapter, pipeline, [config]) ⇒ <code>Bot</code>
Factory function to create and configure a Telegram bot instance.

**Kind**: global function  
**Returns**: <code>Bot</code> - Configured Grammy bot instance.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| token | <code>string</code> |  | Telegram bot token. |
| ticktick | [<code>TickTickClient</code>](#TickTickClient) |  | Low-level TickTick client. |
| gemini | [<code>GeminiAnalyzer</code>](#GeminiAnalyzer) |  | Gemini AI client. |
| adapter | [<code>TickTickAdapter</code>](#TickTickAdapter) |  | Structured adapter for TickTick writes. |
| pipeline | <code>Object</code> |  | Processing pipeline for task mutations. |
| [config] | <code>Object</code> | <code>{}</code> | Optional configuration for bot behavior. |

<a name="buildFreeformPipelineResultReceipt"></a>

## buildFreeformPipelineResultReceipt(params) ⇒ <code>Promise.&lt;{text: string, replyExtra: Object, undoCount: number}&gt;</code>
Build a freeform Telegram receipt and persist undo entries when possible.
Safe default: persistence failures log and still return the applied receipt.

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>Object</code> |  |  |
| params.result | <code>Object</code> |  | Pipeline result for a successful freeform mutation. |
| [params.store] | <code>Object</code> |  | Store module with addUndoEntry(). |
| [params.userId] | <code>string</code> \| <code>number</code> |  | User id used only for undo entry grouping. |
| [params.projects] | <code>Array.&lt;Object&gt;</code> | <code>[]</code> | Known TickTick projects for receipt diffs. |

