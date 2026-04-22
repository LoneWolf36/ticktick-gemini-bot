---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-22T00:55:00Z"
source_specs: ["001-task-operations-pipeline", "002-natural-language-task-mutations"]
complexity: "complex"
---

# Cavekit: Task Pipeline

## Scope

Core task capture and mutation through a structured pipeline. Covers intent extraction from natural-language Telegram messages (via AX), deterministic normalization, single-adapter TickTick execution, and conservative target resolution for mutations. This domain owns the entire path from user message to TickTick write.

See `context/refs/product-vision.md` for governing behavioral scope.

## Requirements

### R1: Structured Intent Extraction
**Description:** System extracts structured intent from free-form Telegram messages using AX, producing typed action objects.
**Acceptance Criteria:**
- [x] AX produces action objects with: `type`, `title`, `content`, `priority`, `projectHint`, `dueDate`, `repeatHint`, `splitStrategy`, `confidence`
- [x] Given "Book dentist appointment Thursday", AX outputs a create action with title "Book dentist appointment" and dueDate for next Thursday
- [x] Given "Buy groceries", AX outputs a create action with no due date and default project
- [x] Given "hello" (non-task content), the system does not create a task and responds conversationally
**Dependencies:** none

### R2: Multi-Task Parsing
**Description:** System supports extracting multiple independent actions from a single user message.
**Acceptance Criteria:**
- [ ] Given "book flight, pack bag, and call uber friday", three separate create actions are extracted with correct individual titles and dates
- [ ] Given a message with one clear task and one ambiguous fragment, the clear task is created silently and a focused clarification is asked for the ambiguous part
**Dependencies:** R1

### R3: Deterministic Normalization
**Description:** All AX output is deterministically normalized before execution: title truncation, content suppression, recurrence-hint-to-repeatFlag conversion, due-date expansion, project resolution.
**Acceptance Criteria:**
- [x] Titles are short, verb-led, free from dates, priorities, project names, or leaked user context
- [x] Titles never exceed configured character limit; excess detail moves to content or is dropped
- [x] Content contains only useful references (URLs, locations, instructions) — no coaching prose, motivational filler, or analysis noise
- [x] AX output with invalid fields, low confidence, or malformed data is rejected; bot asks user to rephrase
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
- [ ] Given "practice DSA every weekday", one recurring task with weekday repeatFlag is created
- [ ] Given "call mom every Sunday", one recurring task with weekly-Sunday repeatFlag is created
- [ ] Given "run daily", one recurring task with daily repeatFlag is created
- [ ] Given conflicting recurrence signals ("every weekday but only on Tuesday"), the system asks for clarification
**Dependencies:** R3

### R6: Multi-Day Splitting
**Description:** When the user names distinct dates for separate sessions, the system creates separate one-off tasks rather than a recurring task.
**Acceptance Criteria:**
- [ ] Given "study system design monday tuesday and wednesday", three tasks are created with respective due dates
- [ ] Given "gym mon wed fri" (ambiguous recurrence vs multi-day), the system creates three one-off tasks or asks whether the user means recurring
**Dependencies:** R3

### R7: Project Resolution
**Description:** Project/category is resolved deterministically against known TickTick projects with safe fallback.
**Acceptance Criteria:**
- [ ] Given projects "Work", "Personal", "Health" exist and user sends "submit quarterly report", task is assigned to "Work"
- [ ] Given ambiguous category, system falls back to safe default project and logs ambiguity
- [ ] Given user names a project that does not exist, system uses default project and informs user
**Dependencies:** R4

### R8: Terse Responses
**Description:** User-facing responses for task operations are terse confirmations. No verbose analysis output.
**Acceptance Criteria:**
- [ ] Clear single-task creates return "Created: {title}"
- [ ] Multi-task creates return "Created {N} tasks"
- [ ] Response verbosity respects current work-style state (see cavekit-work-style)
- [ ] Clarification prompts are narrow and specific — never multi-paragraph
**Dependencies:** none

### R9: Free-Form Mutation Intent
**Description:** System extracts mutation intent (update, complete, delete) from natural language using AX structured output.
**Acceptance Criteria:**
- [ ] Given "move buy groceries to tomorrow", system extracts update intent with target "buy groceries" and new due date
- [ ] Given "done buy groceries", system extracts completion intent
- [ ] Given "delete old wifi task", system extracts deletion intent
- [ ] Given "rename netflix task to finish system design notes", system extracts title-update intent
**Dependencies:** R1

### R10: Conservative Target Resolution
**Description:** Mutations resolve exactly one target task before execution. System asks follow-up when resolution is ambiguous.
**Acceptance Criteria:**
- [ ] Given "Call mom" and "Call mom about insurance" exist, "done call mom" triggers clarification — not a guess
- [ ] Given single exact title match plus fuzzy matches, exact match wins without follow-up
- [ ] Given no task matches, system returns "task not found" and performs no write
- [ ] Pronoun references like "move that one to Friday" trigger follow-up rather than guesswork
- [ ] Delete operations fail closed when resolution is uncertain
**Dependencies:** R4, R9

### R11: Mutation Content Preservation
**Description:** Updates preserve existing task content unless user explicitly requests a content change. Adapter owns the single merge path.
**Acceptance Criteria:**
- [ ] Updating due date on a task with existing notes preserves all notes
- [ ] Pipeline code does not pass already-merged content back into `adapter.updateTask`
- [ ] Existing content is preserved as-is unless adapter merge appends genuinely new content below `\n---\n`
**Dependencies:** R4

### R12: Privacy-Aware Pipeline Logging
**Description:** Full pipeline is logged with privacy-aware diagnostics. Logs do not persist raw user messages in long-term behavioral memory.
**Acceptance Criteria:**
- [ ] Logs capture: request metadata, AX intent output, normalized actions, adapter requests, adapter results, validation failures, timing
- [ ] Mutation logs capture: intent, candidate targets, final chosen target, reason for skip
- [ ] Adapter operation logs are consumed by pipeline observability for end-to-end failure tracing
- [ ] Logs and behavioral signals do NOT persist raw user messages, raw task titles, or raw task descriptions unless explicit debug-only transient mode
**Dependencies:** none

### R13: Extremely Long Message Handling
**Description:** AX extracts intent from 500+ word messages and enforcer enforces title/content limits.
**Acceptance Criteria:**
- [ ] Given a very long message, AX extracts intent and normalizer enforces length limits
**Dependencies:** R1, R3

### R14: Single-Target Mutation Boundary
**Description:** v1 applies mutations to one resolved target per action only. No batch mutations.
**Acceptance Criteria:**
- [ ] Batch mutations ("move all gym tasks to next week") are rejected with guidance to use single-target requests
- [ ] Mixed create+mutate in one message is rejected; system asks for simpler instruction
**Dependencies:** R10

### R15: Command Surfaces
**Description:** User-facing Telegram commands provide manual intake, review, rollback, and operational surfaces that complement the free-form pipeline.
**Acceptance Criteria:**
- [x] `/scan` manually polls TickTick for new tasks and processes them through the pipeline in batches
- [x] `/pending` re-surfaces tasks that were parked during scan or review for user decision
- [x] `/review` walks unreviewed tasks through the same review flow when the user explicitly requests it
- [x] `/undo` reverts the last auto-applied task mutation (title, project, priority, or schedule)
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

- [x] R1 (Structured Intent Extraction): all 4 ACs implemented and verified. AX field validation enforced via `R1_INTENT_ACTION_FIELDS`, dentist/groceries/hello regression tests pass in both full and lightweight suites.
- [x] R3 (Deterministic Normalization): `services/normalizer.js` deterministically strips title noise, normalizes repeat/project/date fields, suppresses filler content, and rejects malformed data paths; `tests/normalizer.test.js` covers title, content, checklist, recurrence, and truncation behavior directly.
- [x] R4 (Single TickTick Adapter): all 3 ACs implemented and verified. All production writes route through adapter, read-only display flows remain allowed per repo guidance, live harnesses were updated, and adapter failure preserves parsed intent with `intents` + `normalizedActions` in failure result.
- [x] R15 (Command Surfaces): `/scan`, `/pending`, `/review`, `/undo`, `/menu`, `/status`, and `/reset` are implemented in `bot/commands.js` and now checked explicitly.
- [x] Drift rate limiter: removed 2026-04-19 (YAGNI for 1-user MVP; listed as out-of-scope here).
- [x] R16 (Guided Reorg): `/reorg` fetch/refine/apply/cancel flow, schema-backed actions, and policy sweep are implemented and now checked explicitly.
- [x] R17 (Autonomous Poll Auto-Apply): scheduler polling, auto-apply notifications, status/docs/config exposure, and quota/auth parking behavior are now owned explicitly instead of inferred from status/config references.
- [x] Validation-facing comments in live harnesses and reorg services were updated to reflect their final Cavekit ownership/exclusion status.

## Changelog
- 2026-04-22: R3 completed — deterministic normalization now has direct code and regression evidence for title cleanup, filler suppression, project/date/repeat handling, and malformed-input rejection.
- 2026-04-20: R17 completed — autonomous poll auto-apply policy is explicitly owned, documented, and mapped to scheduler/status behavior.
- 2026-04-20: R15 and R16 completed — command surfaces are explicitly checked, reorg flow is fully mapped, and remaining auto-apply ownership is isolated as the next signal cleanup item.
- 2026-04-19: R1 and R4 completed — AX field validation, regression coverage, adapter boundary enforcement, intent preservation on failure.
- 2026-04-18: Migrated from kitty-specs 001-task-operations-pipeline and 002-natural-language-task-mutations
