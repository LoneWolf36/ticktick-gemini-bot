Yes — here is the revised implementation plan I would use after stepping back and correcting the architecture around your constitution, the failure analysis, and your newer decision to use AX plus a TickTick MCP adapter instead of growing more prompt-heavy custom plumbing.
This version narrows the first milestone to the highest-leverage path, replaces prompt-centric parsing with a typed AX intent layer, and treats TickTick operations as an integration boundary rather than a place to keep accumulating bespoke code.

## Revised plan

# Realign TickTick-Gemini Bot into an ADHD-Friendly Execution Assistant

## Purpose

The current system drifts because too much product behavior lives inside prompts, while deterministic guardrails, recurring-task support, truthful review logic, and ADHD-friendly focus scaffolding are either weak or missing.
This plan realigns the app around three principles: silent and trustworthy task creation, deterministic control outside the LLM, and lower custom integration burden by using AX for structured LLM programming and a direct REST API adapter for TickTick operations.

## Product target

The system should behave as an ADHD-friendly execution assistant that silently converts natural-language Telegram messages into clean TickTick tasks, prefers TickTick-native recurrence when intent is clear, keeps daily focus constrained and useful, and escalates overdue work in a predictable, non-noisy way.
It should reduce clutter, reduce choice overload, and increase trust by never inventing completions, never leaking user context into titles, and never requiring unnecessary manual review for straightforward task creation.

## Scope of this feature

This implementation plan focuses first on the task creation and task execution boundary, because that is where the most severe trust-breaking failures currently occur.
The immediate goal is not to redesign every assistant behavior at once, but to establish a stable architectural foundation that later phases can use for overdue escalation, daily briefings, and weekly accountability.

### In scope

- Replace prompt-heavy freeform task creation logic with an AX-based typed intent extraction layer.
- Introduce a TickTick adapter boundary by refactoring `services/ticktick.js` for task and project operations, ensuring zero direct API logic lives outside this contract.
- Keep deterministic normalization and validation inside the application, including title limits, content suppression, recurrence mapping, date expansion, and project/category resolution.
- Support silent task creation, multi-task parsing, recurrence detection, multi-day splitting, and sensible priority/category defaults.
- Add observability and regression tests around the parsing-to-action pipeline.

### Out of scope for this first slice

- Full redesign of morning briefings, weekly accountability, focus mode, and progress tracking.
- Broad migration of every existing Gemini workflow to AX in one step.
- Multi-user support.

## Architectural decisions

### 1. Use AX as the LLM orchestration layer

AX is the preferred runtime layer for this project because it fits the existing Node.js/ESM codebase and supports structured LLM programming, validation, tool usage, and provider flexibility without introducing a second language runtime into the main application.
AX will be used to convert messy Telegram input into typed intent objects, not to own business rules or final execution decisions.

### 2. Use a direct REST API TickTick adapter

TickTick operations should move behind a thin local adapter that wraps the direct REST API (`services/ticktick.js`) for task CRUD, project lookup, subtasks, priorities, reminders, and recurring rules. This leverages your existing battle-tested OAuth2, retry, and transaction rollback logic while preserving an internal contract you control.
The app should not scatter direct TickTick API behavior across commands and prompts once this adapter exists.

### 3. Keep deterministic logic in-app

The constitution explicitly requires deterministic validation, workflows, and state management outside the LLM, so the application must still own title length caps, content filtering, repeat-hint normalization, due-date expansion, allowed actions, and safety checks before any task reaches TickTick.
This rule is non-negotiable because the existing failures came from trusting prompt/schema hints where hard enforcement was required.

### 4. Prefer recurrence hints plus server-side mapping

The model should emit a recurrence hint such as `daily`, `weekdays`, `weekly`, or `every monday`, while the application converts that hint into a valid TickTick `repeatFlag` format before calling the adapter.
This preserves control and avoids relying on the model to generate raw recurrence rules correctly every time.

## Target architecture

The new task-creation flow should be: Telegram message -> AX intent extraction -> deterministic normalization and validation -> TickTick adapter -> TickTick.
This architecture keeps the LLM responsible for interpretation, keeps the app responsible for rules and safety, and keeps the integration layer responsible for external task operations.

### AX intent contract

AX should produce a typed object that supports at least these action fields: `type`, `title`, `content`, `priority`, `projectHint`, `dueDate`, `repeatHint`, `splitStrategy`, and `confidence`, plus a terse machine-oriented summary for logging.
The output should support multiple actions from a single message so the bot can correctly parse inputs like “book flight, pack bag, and call uber friday” into separate tasks.

### Deterministic normalizer

After AX returns actions, a normalization layer should enforce hard rules before execution.
That layer should truncate overly long titles, strip user-context leakage patterns, suppress empty or noisy content, normalize project/category names, convert recurrence hints into `repeatFlag`, and expand multi-day tasks into separate dated actions where the message expresses distinct days rather than true recurrence.

### TickTick adapter contract

The local TickTick adapter should expose a narrow interface such as `createTask`, `updateTask`, `completeTask`, `listProjects`, `findProjectByName`, and `createTasksBatch` when beneficial.
Internally, that adapter wraps the raw REST calls handled by the `TickTickClient`, but the rest of the app should depend only on the adapter contract so that you preserve testability and isolation.

## Implementation phases

### Phase 0: Update architectural baseline

Revise the constitution and project index so they reflect AX as the preferred LLM orchestration layer and the TickTick adapter boundary as the preferred integration path.
Also update README-level architecture notes so future agent sessions no longer assume `gemini.js` prompt editing is the primary way to change behavior.

### Phase 1: Introduce the TickTick adapter boundary

Create a dedicated TickTick adapter module in the app that becomes the only place allowed to create, update, complete, or look up TickTick tasks and projects.
Start with task creation, project lookup, recurrence submission, and completion support, because those are the core flows your current analysis shows are either missing or fragile.

### Phase 2: Replace freeform parsing with AX intent extraction

Build a dedicated AX program for freeform Telegram task creation that outputs structured actions instead of free-form conversational text.
The prompt/program contract should explicitly support silent creation, multiple tasks in one message, recurrence intent, multi-day splitting, and minimal content generation.

### Phase 3: Build the normalization and safety layer

Add a deterministic post-AX normalization stage that applies hard caps and cleanup before any execution happens.
This stage should include title hard-capping, content suppression, recurrence mapping, due-date/date-range expansion, invalid-action rejection, and fallback behavior when project resolution is ambiguous.

### Phase 4: Wire execution through the adapter

Replace the current create-task execution path so normalized actions are executed through the adapter rather than through scattered direct TickTick logic.
Keep a small response surface to the user, such as “Created 3 tasks,” unless something is genuinely ambiguous or blocked.

### Phase 5: Add observability and regression coverage

Instrument the new pipeline so logs capture the raw user request, AX intent output, normalized actions, adapter requests, adapter results, and validation failures.
Add regression tests around messy real-world inputs because the constitution explicitly prioritizes validation against incomplete, ambiguous, and multi-intent inputs.

## Detailed work packages

### WP01: Architectural refactor boundary

Create the TickTick adapter module and route the current create-task path through it behind a feature flag or controlled integration switch.
Acceptance criteria: no direct TickTick create logic remains outside the adapter for the refactored path, and the app still boots and passes the current regression baseline.

### WP02: AX parser program

Implement an AX-based task-intent program for Telegram freeform input.
Acceptance criteria: it emits structured multi-action outputs for single-task, multi-task, recurring, and multi-day messages without conversational filler.

### WP03: Normalization and recurrence mapping

Implement the deterministic normalization layer with title limits, content suppression, recurrence mapping, and day-specific expansion.
Acceptance criteria: long or malformed titles are capped, recurrence hints are converted safely, and unknown recurrence values are rejected rather than sent through as garbage.

### WP04: Project/category resolution

Add deterministic project lookup and matching rules so task categorization stops depending purely on LLM phrasing.
Acceptance criteria: known categories are resolved reliably, ambiguous matches are logged, and failures fall back to a safe default instead of silent misclassification.

### WP05: Silent response contract

Reduce user-facing creation responses to terse confirmations and explicit error messages only when needed.
Acceptance criteria: clean task creation no longer produces verbose analysis-style output and does not ask unnecessary questions.

### WP06: Test and observability pack

Add integration-style regression tests and logging around the full parse-normalize-execute chain.
Acceptance criteria: the new path is covered by tests for recurrence, multi-day splitting, multi-task parsing, title explosion prevention, and content-noise suppression.

## Behavioral rules

Task titles must be short, verb-led where possible, and free from dates, priorities, project names, or leaked user-context content.
Task content must only preserve useful references such as URLs, locations, or specific instructions, and must never contain coaching prose, motivational filler, or analysis-card noise.

Recurrence should be preferred when the user clearly expresses repeated intent such as daily, weekdays, weekly, or every Monday.
Multi-day splitting should be used when the user names distinct dates or days for separate one-off sessions rather than describing a true recurring habit.

The system should remain silent by default for clear task-creation requests, returning only a terse success response.
Follow-up questions should only appear when a request is genuinely ambiguous in a way that would create the wrong tasks.

## Verification plan

### Automated verification

Add regression tests for title truncation, context-leak stripping, recurrence-hint mapping, multi-day expansion, empty-content suppression, and adapter payload correctness.
Add parser tests for realistic messy messages such as “practice DSA every weekday,” “plan Toast recruiter interview,” and “study system design monday tuesday and wednesday.”

### Manual verification

Verify that recurring requests create a single recurring TickTick task rather than multiple manual copies when the user clearly intends recurrence.
Verify that messages with multiple one-off actions become separate clean tasks with proper ordering and sane category selection.
Verify that long or noisy model outputs never reach TickTick unchanged.

## Risks and mitigations

The main risk is replacing too much at once and losing a working baseline.
Mitigation: introduce AX and the TickTick adapter only for the task-creation path first, keep the old path behind a fallback during migration, and defer briefing/accountability redesign until this path is stable.

The second risk is assuming structured model output is enough by itself.
Mitigation: retain hard validation and rejection logic exactly because the original system already proved prompt/schema hints are not sufficient.

## Success criteria

This phase is successful when natural-language Telegram messages create clean TickTick tasks silently, recurrence works, multi-day intent is handled correctly, titles remain short and safe, and the bot no longer produces verbose creation noise.
It is also successful when task creation becomes architecturally boring: AX handles interpretation, your code handles rules, and the adapter handles TickTick operations.

## What changed from the previous plan

The biggest change is that this is no longer a “tighten `gemini.js` prompt and extend the existing handler” plan.
It is now an architecture-first plan that moves intent parsing into AX, isolates external task plumbing into a strict TickTick adapter contract over the REST API, and moves product rules into deterministic code, which is much more aligned with your constitution and the actual failure modes you observed.

## Next step

The right next action is to replace your current `implementation_plan.md` with this version and then split it into Spec Kitty work packages in the order of adapter boundary, AX parser, normalization layer, execution wiring, and tests.