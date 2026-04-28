---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-25T12:10:00Z"
source_specs: ["001-task-operations-pipeline", "002-natural-language-task-mutations"]
complexity: "complex"
---

# Cavekit: Task Pipeline

## Scope

Core task capture and mutation through a structured pipeline. Covers intent extraction from natural-language Telegram messages (via intent extraction), deterministic normalization, single-adapter TickTick execution, and conservative target resolution for mutations. This domain owns the entire path from user message to TickTick write.

See `context/refs/product-vision.md` for governing behavioral scope.

## Requirements

### R1: Structured Intent Extraction
**Description:** System extracts structured intent from free-form Telegram messages using intent extraction, producing typed action objects.
**Acceptance Criteria:**
- [x] Intent extraction produces action objects with: `type`, `title`, `content`, `priority`, `projectHint`, `dueDate`, `repeatHint`, `splitStrategy`, `confidence`
- [x] Given "Book dentist appointment Thursday", intent extraction outputs a create action with title "Book dentist appointment" and dueDate for next Thursday
- [x] Given "Buy groceries", intent extraction outputs a create action with no due date and default project
- [x] Given "hello" (non-task content), the system does not create a task and responds conversationally
**Dependencies:** none

### R2: Multi-Task Parsing
**Description:** System supports extracting multiple independent actions from a single user message.
**Acceptance Criteria:**
- [x] Given "book flight, pack bag, and call uber friday", three separate create actions are extracted with correct individual titles and dates
- [x] Given a message with one clear task and one ambiguous fragment, the clear task is created silently and a focused clarification is asked for the ambiguous part
**Dependencies:** R1

### R3: Deterministic Normalization
**Description:** All extracted intent output is deterministically normalized before execution: title truncation, content suppression, recurrence-hint-to-repeatFlag conversion, due-date expansion, project resolution.
**Acceptance Criteria:**
- [x] Titles are short, verb-led, free from dates, priorities, project names, or leaked user context
- [x] Titles never exceed configured character limit; excess detail moves to content or is dropped
- [x] Content contains only useful references (URLs, locations, instructions) — no coaching prose, motivational filler, or analysis noise
- [x] Extracted intent output with invalid fields, low confidence, or malformed data is rejected; bot asks user to rephrase
**Dependencies:** R1

### R4: Single TickTick Adapter
**Description:** All TickTick operations (create, update, complete, delete) flow through a single adapter module backed by the direct REST API.
**Acceptance Criteria:**
- [x] Adapter exposes: `createTask`, `updateTask`, `completeTask`, `deleteTask`, `listProjects`, `findProjectByName`, optionally `createTasksBatch`
- [x] No direct TickTick API write calls exist outside the adapter in the codebase; read-only display flows may call the low-level client directly
- [x] Adapter handles API unavailability gracefully without losing parsed intent
**Dependencies:** none

### R5: Recurring Task Creation
**Description:** Recurring intent produces a single recurring TickTick task with proper `repeatFlag`, not multiple manual copies.
**Acceptance Criteria:**
- [x] Given "practice DSA every weekday", one recurring task with weekday repeatFlag is created
- [x] Given "call mom every Sunday", one recurring task with weekly-Sunday repeatFlag is created
- [x] Given "run daily", one recurring task with daily repeatFlag is created
- [x] Given conflicting recurrence signals ("every weekday but only on Tuesday"), the system asks for clarification
**Dependencies:** R3

### R6: Multi-Day Splitting
**Description:** When the user names distinct dates for separate sessions, the system creates separate one-off tasks rather than a recurring task.
**Acceptance Criteria:**
- [x] Given "study system design monday tuesday and wednesday", three tasks are created with respective due dates
- [x] Given "gym mon wed fri" (ambiguous recurrence vs multi-day), the system creates three one-off tasks or asks whether the user means recurring
**Dependencies:** R3

### R7: Project Resolution
**Description:** Project/category is resolved deterministically against known TickTick projects with safe fallback.
**Acceptance Criteria:**
- [x] Given projects "Work", "Personal", "Health" exist and user sends "submit quarterly report", task is assigned to "Work"
- [x] Given ambiguous category, system falls back to safe default project and logs ambiguity
- [x] Given user names a project that does not exist, system uses default project and informs user
**Dependencies:** R4

### R8: Terse Responses
**Description:** User-facing responses for task operations are terse confirmations. No verbose analysis output.
**Acceptance Criteria:**
- [x] Clear single-task creates return "Created: {title}"
- [x] Multi-task creates return "Created {N} tasks"
- [x] Response verbosity respects current work-style state (see cavekit-work-style)
- [x] Clarification prompts are narrow and specific — never multi-paragraph
**Dependencies:** none

### R9: Free-Form Mutation Intent
**Description:** System extracts mutation intent (update, complete, delete) from natural language using structured intent extraction output.
**Acceptance Criteria:**
- [x] Given "move buy groceries to tomorrow", system extracts update intent with target "buy groceries" and new due date
- [x] Given "done buy groceries", system extracts completion intent
- [x] Given "delete old wifi task", system extracts deletion intent
- [x] Given "rename netflix task to finish system design notes", system extracts title-update intent
**Dependencies:** R1

### R10: Conservative Target Resolution
**Description:** Mutations resolve exactly one target task before execution. System asks follow-up when resolution is ambiguous.
**Acceptance Criteria:**
- [x] Given "Call mom" and "Call mom about insurance" exist, "done call mom" triggers clarification — not a guess
- [x] Given single exact title match plus fuzzy matches, exact match wins without follow-up
- [x] Given no task matches, system returns "task not found" and performs no write
- [x] Pronoun references like "move that one to Friday" trigger follow-up rather than guesswork
- [x] Delete operations fail closed when resolution is uncertain
**Dependencies:** R4, R9

### R11: Mutation Content Preservation
**Description:** Updates preserve existing task content unless user explicitly requests a content change. Adapter owns the single merge path.
**Acceptance Criteria:**
- [x] Updating due date on a task with existing notes preserves all notes
- [x] Pipeline code does not pass already-merged content back into `adapter.updateTask`
- [x] Existing content is preserved as-is unless adapter merge appends genuinely new content below `\n---\n`
**Dependencies:** R4

### R12: Privacy-Aware Pipeline Logging
**Description:** Full pipeline is logged with privacy-aware diagnostics. Logs do not persist raw user messages in long-term behavioral memory.
**Acceptance Criteria:**
- [x] Logs capture: request metadata, intent extraction output, normalized actions, adapter requests, adapter results, validation failures, timing
- [x] Mutation logs capture: intent, candidate targets, final chosen target, reason for skip
- [x] Adapter operation logs are consumed by pipeline observability for end-to-end failure tracing
- [x] Logs and behavioral signals do NOT persist raw user messages, raw task titles, or raw task descriptions unless explicit debug-only transient mode
**Dependencies:** none

### R13: Extremely Long Message Handling
**Description:** Intent extraction extracts intent from 500+ word messages and enforcer enforces title/content limits.
**Acceptance Criteria:**
- [x] Given a very long message, intent extraction extracts intent and normalizer enforces length limits
**Dependencies:** R1, R3

### R14: Single-Target Mutation Boundary
**Description:** v1 applies mutations to one resolved target per action only. No batch mutations.
**Acceptance Criteria:**
- [x] Batch mutations ("move all gym tasks to next week") are rejected with guidance to use single-target requests
- [x] Mixed create+mutate in one message is rejected; system asks for simpler instruction
**Dependencies:** R10

### R15: Command Surfaces
**Description:** User-facing Telegram commands provide manual intake, review, rollback, and operational surfaces that complement the free-form pipeline.
**Acceptance Criteria:**
- [x] `/scan` manually polls TickTick for new tasks and processes them through the pipeline in batches
- [x] `/pending` re-surfaces tasks that were parked during scan or review for user decision
- [x] `/review` walks unreviewed tasks through the same review flow when the user explicitly requests it
- [x] `/undo` reverts the last auto-applied task mutation (title, project, priority, or schedule). Registered as `/undo` slash command in `server.js` `TELEGRAM_COMMANDS` array.
- [x] `/menu` provides an inline keyboard for quick access to primary commands
- [x] `/status` reports bot connection, quota, cache, and review-state health without mutating TickTick
- [x] `/reset` wipes bot-local state only after explicit confirmation and never mutates TickTick tasks
**Dependencies:** R4, R9, R10

### R16: Guided Reorg
**Description:** System generates AI-driven task restructuring proposals (project moves, priority changes, inbox cleanup) and lets the user apply, refine, or cancel them.
**Acceptance Criteria:**
- [x] `/reorg` fetches all tasks and projects, then produces a structured proposal with summary, actions, and clarification questions
- [x] Proposal actions support create, update, complete, and drop types against existing TickTick tasks
- [x] User can apply the proposal (executes actions via adapter), refine it (sends refinement to AI), or cancel it
- [x] Reorg refinement state persists across messages and resumes correctly
- [x] Policy sweep appends inferred priority/project fixes to reorg actions when `enforcePolicySweep` is enabled
**Dependencies:** R4

### R17: Autonomous Poll Auto-Apply
**Description:** Scheduler-driven autonomous intake is an explicit product surface: newly discovered tasks are processed through the shared pipeline, surfaced operationally, and fail safely when auth or quota blocks execution.
**Acceptance Criteria:**
- [x] Scheduler polling sends newly discovered tasks through the shared pipeline in bounded batches instead of a separate write path
- [x] Auto-applied batches produce a compact user notification and respect focus-mode suppression rules for non-critical scheduled notifications
- [x] Operational surfaces and deployment/docs expose `AUTO_APPLY_LIFE_ADMIN`, `AUTO_APPLY_DROPS`, and `AUTO_APPLY_MODE` as the autonomous-intake policy settings
- [x] Quota exhaustion or expired auth parks/suppresses autonomous intake with explicit user-facing notification instead of silent failure
**Dependencies:** R4, R15

## Out of Scope

- Batch mutations ("move all gym tasks to next week")
- High-risk bulk delete flows
- Rich mixed-action requests combining create and mutate in one message
- Mutating checklist items on existing tasks (see cavekit-checklists for create-time scope)
- Auth, billing, rate limiting, multi-tenant isolation

## Cross-References

- See also: cavekit-checklists.md (create-time checklist items use this pipeline)
- See also: cavekit-pipeline-hardening.md (failure handling, retry, rollback)
- See also: cavekit-work-style.md (response verbosity respects work-style state)
- See also: cavekit-prioritization.md (project resolution priority follows ranking policy)
- See also: cavekit-behavioral-memory.md (logs feed derived metadata only, not raw text)

## Validation Action Items — 2026-04-19

- [x] R1 (Structured Intent Extraction): all 4 ACs implemented and verified. Intent extraction field validation enforced via `R1_INTENT_ACTION_FIELDS`, dentist/groceries/hello regression tests pass in both full and lightweight suites.
- [x] R2 (Multi-Task Parsing): `services/pipeline.js` now preserves canonical multi-create execution, splits clear create intents from ambiguous create fragments, executes only the clear creates, and surfaces the remaining focused clarification through both pipeline and bot command flows; `tests/regression.pipeline-multi-create-clarification.test.js` plus `tests/regression.work-style-commands-scheduler.test.js` cover canonical multi-create, mixed clear+ambiguous fragments, pure ambiguous clarification, and checklist non-regression.
- [x] R3 (Deterministic Normalization): `services/normalizer.js` deterministically strips title noise, normalizes repeat/project/date fields, suppresses filler content, and rejects malformed data paths; `tests/normalizer.test.js` covers title, content, checklist, recurrence, and truncation behavior directly.
- [x] R4 (Single TickTick Adapter): all 3 ACs implemented and verified. All production writes route through adapter, read-only display flows remain allowed per repo guidance, live harnesses were updated, and adapter failure preserves parsed intent with `intents` + `normalizedActions` in failure result.
- [x] R8 (Terse Responses): `services/pipeline.js` now uses exact terse create confirmations (`Created: {title}` and `Created {N} tasks`), urgent mode continues to compress output without skipping content, and `tests/regression.adapter-execution-reorg.test.js` plus `tests/regression.pipeline-multi-create-clarification.test.js` cover single-create, multi-create, work-style verbosity, and narrow clarification behavior.
- [x] R13 (Extremely Long Message Handling): `services/normalizer.js` now enforces a bounded content cap in addition to existing title limits, `tests/regression.long-message-handling.test.js` proves the intent extraction seam still accepts 500+ word input, and the same focused suite verifies normalized title/content stay within enforced limits.
- [x] R15 (Command Surfaces): `/scan`, `/pending`, `/review`, `/undo`, `/menu`, `/status`, and `/reset` are implemented in `bot/commands.js` and now checked explicitly.
- [x] R10 (Conservative Target Resolution): `services/task-resolver.js` resolves exact/prefix/contains/fuzzy matches conservatively, `services/pipeline.js` routes mutation intents through clarification/not-found handling before execution, `tests/task-resolver.test.js` covers fail-closed ambiguity cases, and `tests/regression.pipeline-hardening-mutation.test.js` covers pronoun references, exact-match wins, not-found, and delete safety.
- [x] R9 (Free-Form Mutation Intent): `services/intent-extraction.js` now includes explicit free-form mutation mapping guidance/examples for update/complete/delete/rename phrasing, and `tests/intent-extraction.test.js` covers extraction-shape regressions for "move buy groceries to tomorrow", "done buy groceries", "delete old wifi task", and "rename netflix task to finish system design notes".
- [x] R12 (Privacy-Aware Pipeline Logging): `services/pipeline.js`, `services/pipeline-context.js`, and `services/pipeline-observability.js` now keep request/intent/action tracing while redacting raw user messages, task titles, task descriptions, and target queries from lifecycle snapshots, observability sink contexts, and console/telemetry metadata; `tests/regression.pipeline-logging-privacy.test.js` plus `tests/pipeline-context.test.js` cover telemetry, lifecycle, and console privacy boundaries.
- [x] Drift rate limiter: removed 2026-04-19 (YAGNI for 1-user MVP; listed as out-of-scope here).
- [x] R16 (Guided Reorg): `/reorg` fetch/refine/apply/cancel flow, schema-backed actions, and policy sweep are implemented and now checked explicitly.
- [x] R17 (Autonomous Poll Auto-Apply): scheduler polling, auto-apply notifications, status/docs/config exposure, and quota/auth parking behavior are now owned explicitly instead of inferred from status/config references.
- [x] Validation-facing comments in live harnesses and reorg services were updated to reflect their final Cavekit ownership/exclusion status.

## Changelog
- 2026-04-25: R9 completed — intent extraction mutation guidance now includes canonical free-form update/complete/delete/rename examples and focused intent extraction regression coverage verifies expected structured shapes for all four R9 acceptance prompts.
- 2026-04-24: R13 completed — long-message intake now keeps intent extraction intact for 500+ word inputs while the normalizer enforces bounded title and content lengths via focused regression coverage.
- 2026-04-24: R8 completed — task-operation confirmations now use exact terse create copy, urgent mode keeps the shorter variant, and clarification prompts remain narrow without drifting into multi-paragraph output.
- 2026-04-23: R2 completed — the pipeline now executes clear create actions from multi-task input while surfacing focused clarification for ambiguous create fragments, preserves canonical multi-create parsing, and keeps checklist clarification behavior fail-closed.
- 2026-04-23: R12 completed — pipeline diagnostics now preserve request/intent/action tracing while redacting raw user messages, raw task titles, raw task descriptions, and target queries from lifecycle snapshots, observability sink contexts, and console telemetry.
- 2026-04-22: R3 completed — deterministic normalization now has direct code and regression evidence for title cleanup, filler suppression, project/date/repeat handling, and malformed-input rejection.
- 2026-04-22: R10 completed — mutation target resolution now fails closed on ambiguity, prefers exact matches over fuzzier candidates, returns not-found without writes, and requires clarification for pronoun-only or unsafe delete references.
- 2026-04-20: R17 completed — autonomous poll auto-apply policy is explicitly owned, documented, and mapped to scheduler/status behavior.
- 2026-04-20: R15 and R16 completed — command surfaces are explicitly checked, reorg flow is fully mapped, and remaining auto-apply ownership is isolated as the next signal cleanup item.
- 2026-04-19: R1 and R4 completed — intent extraction field validation, regression coverage, adapter boundary enforcement, intent preservation on failure.
- 2026-04-18: Migrated from kitty-specs 001-task-operations-pipeline and 002-natural-language-task-mutations
