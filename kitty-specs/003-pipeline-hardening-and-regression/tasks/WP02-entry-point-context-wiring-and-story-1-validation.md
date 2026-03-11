---
work_package_id: WP02
title: Entry-Point Context Wiring and Story 1 Validation
lane: planned
dependencies:
- WP01
subtasks:
- T005
- T006
- T007
- T008
phase: Phase 2 - Story 1 Context Wiring
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-11T17:18:05Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-001
- FR-002
- FR-005
- FR-006
---

# Work Package Prompt: WP02 - Entry-Point Context Wiring and Story 1 Validation

## Objectives and Success Criteria

- Push the canonical request-context contract through every live pipeline entry point.
- Eliminate direct per-caller timezone defaults from free-form, scan, review, and scheduler-triggered pipeline calls.
- Prove Story 1 works via direct pipeline regressions for relative dates and project hints.

Success looks like:
- Telegram and scheduler entry points all pass the same context fields
- current date and canonical timezone are present regardless of caller
- AX receives available project names consistently
- direct regression tests prove relative-date and project-hint resolution through the live pipeline path

## Context and Constraints

- Implementation command: `spec-kitty implement WP02 --base WP01`
- This package depends on the request-context contract from WP01.
- It should not redesign failure classes or rollback behavior; that belongs to later packages.
- Current repo hotspots still use `process.env.USER_TIMEZONE || 'Europe/Dublin'` in several pipeline call sites. Those must stop being authoritative for request-time resolution.

Relevant documents:
- `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
- `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
- `kitty-specs/003-pipeline-hardening-and-regression/research.md`
- `kitty-specs/003-pipeline-hardening-and-regression/quickstart.md`

Relevant code:
- `bot/commands.js`
- `services/scheduler.js`
- `server.js`
- `services/pipeline.js`
- `services/ax-intent.js`
- `services/normalizer.js`
- `services/gemini.js`
- `services/user_context.example.js`
- `tests/regression.test.js`
- `tests/run-regression-tests.mjs`

Key story requirements:
- Story 1 requires current date, canonical timezone, and available projects to be present for extraction and normalization.
- The canonical timezone must come from stored user context, not whichever environment fallback was easiest to reach.

## Subtasks and Detailed Guidance

### Subtask T005 - Update Telegram command entry points
- **Purpose**: Remove per-handler timezone drift from Telegram-driven pipeline execution.
- **Steps**:
  1. Inspect the free-form, `/scan`, and `/review` calls to `pipeline.processMessage(...)` in `bot/commands.js`.
  2. Replace direct `process.env.USER_TIMEZONE` fallbacks with the canonical context assembly introduced in WP01.
  3. Tag each caller with a stable `entryPoint` value so later observability can distinguish them.
  4. Preserve existing task snapshots for scan/review-style flows that mutate existing TickTick tasks.
- **Files**:
  - `bot/commands.js`
  - `services/pipeline.js`
- **Parallel**: Yes.
- **Notes**:
  - Keep the user-facing bot behavior unchanged unless the new contract requires a small compatibility adjustment.
  - Avoid duplicating context construction inside each command handler.

### Subtask T006 - Update scheduler and bootstrap wiring
- **Purpose**: Ensure scheduled processing uses the same canonical context fields as Telegram entry points.
- **Steps**:
  1. Inspect pipeline calls in `services/scheduler.js`.
  2. Remove scheduler-local authority over timezone and treat it as a pipeline input sourced from the canonical contract.
  3. Update any bootstrap or helper wiring in `server.js` that needs to pass execution mode, stored context access, or request metadata into the pipeline layer.
  4. Keep scheduled polling behavior compatible with current batching and quota-avoidance flow.
- **Files**:
  - `services/scheduler.js`
  - `server.js`
  - `services/pipeline.js`
- **Parallel**: Yes.
- **Notes**:
  - The scheduler may still carry infrastructure defaults, but request-time canonical timezone resolution should happen through the hardened contract.
  - Do not break current polling, daily briefing, or weekly digest behavior while plumbing context changes.

### Subtask T007 - Unify project lookup and AX-facing project names
- **Purpose**: Make project context deterministic and avoid drift between what AX sees and what normalization resolves.
- **Steps**:
  1. Review how `services/pipeline.js` currently fetches projects and derives default project IDs.
  2. Ensure available project names are fetched once per request and passed to AX in the intended shape.
  3. Ensure the same fetched project objects are passed forward into normalization.
  4. Keep any caching behavior inside existing adapter or TickTick layers rather than reintroducing per-caller logic.
- **Files**:
  - `services/pipeline.js`
  - `services/ticktick-adapter.js`
  - `services/ax-intent.js`
  - `services/normalizer.js`
- **Parallel**: No.
- **Notes**:
  - This is about consistency, not aggressive optimization.
  - If project name normalization is needed, keep it explicit and local to the pipeline contract.

### Subtask T008 - Add Story 1 direct regression coverage
- **Purpose**: Prove the context contract actually fixes relative-date and project-hint behavior through the live pipeline path.
- **Steps**:
  1. Add or update direct pipeline tests that cover a message like `"book dentist thursday"` using the canonical timezone from stored context.
  2. Add or update tests that prove available project names reach AX and that normalization resolves the intended project.
  3. Prefer mocked AX and adapter dependencies over live API calls.
  4. Assert contract behavior, not incidental console output.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel**: Yes, once the request-context shape is stable.
- **Notes**:
  - Keep fixtures small and readable.
  - Use exact dates or injected `currentDate` where needed so tests stay deterministic.

## Test Strategy

- Required:
  - direct pipeline regression for relative-date resolution
  - direct pipeline regression for project-hint resolution
- Prefer mocked doubles for:
  - AX extraction output
  - project lists
  - adapter behavior

Verification commands:
- `node tests/run-regression-tests.mjs`
- `node --test tests/regression.test.js`

## Risks and Mitigations

- **Risk**: Telegram and scheduler callers still diverge because one path bypasses the shared context helper.
  - **Mitigation**: Make `pipeline.processMessage(...)` normalize its incoming options immediately and keep callers thin.
- **Risk**: Project lists are fetched multiple times or reshaped inconsistently.
  - **Mitigation**: Fetch once per request in the pipeline and reuse that data for both AX and normalization.
- **Risk**: Tests assert brittle string formatting instead of actual context behavior.
  - **Mitigation**: Assert exact canonical fields, resolved dates, and resolved project IDs.

## Review Guidance

- Verify `bot/commands.js` no longer owns authoritative timezone resolution for pipeline requests.
- Verify scheduler-triggered processing uses the same context field names as Telegram calls.
- Verify Story 1 regressions exercise the pipeline directly rather than helper-only behavior.
- Verify project lookup is performed once per request and reused consistently.

## Activity Log

- 2026-03-11T17:18:05Z - system - lane=planned - Prompt created.
