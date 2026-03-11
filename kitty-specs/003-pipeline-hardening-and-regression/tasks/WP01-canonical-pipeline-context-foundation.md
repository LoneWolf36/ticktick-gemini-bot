---
work_package_id: WP01
title: Canonical Pipeline Context Foundation
lane: "doing"
dependencies: []
base_branch: master
base_commit: 8c54eceaa745a46db9622848e7ddf85b8336c0d6
created_at: '2026-03-11T18:06:41.078668+00:00'
subtasks:
- T001
- T002
- T003
- T004
phase: Phase 1 - Context Foundation
assignee: ''
agent: "Codex"
shell_pid: "23616"
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
- FR-007
- FR-008
---

# Work Package Prompt: WP01 - Canonical Pipeline Context Foundation

## Objectives and Success Criteria

- Establish one canonical request context for all pipeline execution paths.
- Remove ad-hoc context-field drift between pipeline, AX extraction, and normalization.
- Make request metadata explicit enough to support later failure classification, rollback, and observability work.

Success looks like:
- one clearly named context shape at the pipeline boundary
- consistent fields for `requestId`, `entryPoint`, `mode`, `currentDate`, canonical timezone, project metadata, and existing task snapshots
- fail-fast validation when a caller omits required fields in development mode
- downstream work packages can build on this contract without guessing field names or ownership

## Context and Constraints

- Implementation command: `spec-kitty implement WP01`
- This is the foundation package. Downstream packages assume it is complete.
- The feature spec requires one canonical timezone source from stored user context, not per-caller environment defaults.
- Keep the architecture boundary intact: `AX -> normalizer -> TickTickAdapter`.
- Do not introduce a new runtime, orchestration framework, or external telemetry vendor here.

Relevant documents:
- `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
- `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
- `kitty-specs/003-pipeline-hardening-and-regression/research.md`
- `kitty-specs/003-pipeline-hardening-and-regression/data-model.md`
- `.kittify/memory/constitution.md`

Relevant code:
- `services/pipeline.js`
- `services/ax-intent.js`
- `services/normalizer.js`
- `services/ticktick-adapter.js`
- `bot/commands.js`
- `services/scheduler.js`
- `server.js`

Hard constraints:
- Preserve the adapter as the only write boundary.
- Keep deterministic logic in application code rather than pushing validation or defaulting into prompts.
- The request context must be reusable by Telegram, scheduler, and future direct callers.

## Subtasks and Detailed Guidance

### Subtask T001 - Define canonical request-context assembly
- **Purpose**: Create the single source of truth for what a pipeline request contains before AX extraction starts.
- **Steps**:
  1. Decide whether the context builder belongs inside `services/pipeline.js` or in a new helper module under `services/`.
  2. Define a stable object shape aligned with `data-model.md`:
     - `requestId`
     - `entryPoint`
     - `mode`
     - `userMessage`
     - `currentDate`
     - `timezone`
     - `availableProjects`
     - `existingTask`
  3. Make the pipeline own assembly of any derived fields that do not belong in callers.
  4. Keep the builder narrow: it should assemble and validate context, not execute writes or render user messages.
- **Files**:
  - `services/pipeline.js`
  - optionally a new helper such as `services/pipeline-context.js`
- **Parallel**: No.
- **Notes**:
  - Favor explicit field names over generic `options`.
  - Make request IDs deterministic enough for tests to override while still defaulting safely in production.
  - If a helper module is introduced, keep its exports named and minimal.

### Subtask T002 - Align AX extraction with canonical context
- **Purpose**: Ensure AX receives the same contextual inputs on every call path so extraction stops depending on caller quirks.
- **Steps**:
  1. Update the `services/ax-intent.js` interface expectations to accept the canonical context fields it actually needs.
  2. Make `services/pipeline.js` translate the canonical request context into the AX input shape intentionally rather than forwarding loosely structured options.
  3. Be explicit about which fields AX consumes today:
     - current date
     - available project names
     - user message
     - any other required extraction hints
  4. If timezone is not directly consumed by AX today, keep it in canonical context anyway so downstream normalization and observability remain aligned.
- **Files**:
  - `services/ax-intent.js`
  - `services/pipeline.js`
- **Parallel**: Yes, after T001 defines field names.
- **Notes**:
  - Avoid widening the AX contract unnecessarily.
  - Preserve current key-rotation behavior; this package is about context shape, not failure semantics.

### Subtask T003 - Align normalization with canonical context
- **Purpose**: Make date expansion and project resolution consume the same context contract as AX extraction.
- **Steps**:
  1. Review how `services/normalizer.js` currently uses `timezone`, `currentDate`, `projects`, and `existingTask`.
  2. Replace any ad-hoc option plumbing in `services/pipeline.js` with fields derived from the canonical request context.
  3. Ensure existing task content, original project ID, and project lookup data are still available to normalization without callers having to shape them manually.
  4. Keep normalization deterministic and testable; do not make it reach outward to fetch state on its own.
- **Files**:
  - `services/normalizer.js`
  - `services/pipeline.js`
- **Parallel**: Yes, after T001 defines the shared context.
- **Notes**:
  - The canonical timezone must remain the one from stored user context, not whichever timezone happened to be passed by a caller.
  - Preserve `TickTickAdapter` project lookup as the source for canonical project metadata.

### Subtask T004 - Add contract validation and development diagnostics
- **Purpose**: Catch context drift early instead of letting it surface as vague runtime behavior later.
- **Steps**:
  1. Add a validation step near the start of pipeline execution that asserts required context fields are present and correctly shaped.
  2. Keep the failure behavior mode-aware:
     - development mode can include detailed diagnostics
     - user-facing mode should remain compact once WP03 lands
  3. Prefer explicit error messages that name the missing or malformed field.
  4. Add internal comments only where the validation flow would otherwise be hard to follow.
- **Files**:
  - `services/pipeline.js`
  - optionally `services/pipeline-context.js`
- **Parallel**: No.
- **Notes**:
  - This should support later contract-drift regression tests.
  - Do not swallow validation failures silently; they should be classifiable downstream.

## Test Strategy

- Add or update direct tests only if the context contract can be validated cleanly at this layer without duplicating the fuller regressions planned in later packages.
- At minimum, keep the design compatible with later tests asserting:
  - canonical timezone presence
  - request ID presence
  - stable AX input shape
  - stable normalization option shape

Suggested commands for later verification:
- `node tests/run-regression-tests.mjs`
- `node --test tests/regression.test.js`

## Risks and Mitigations

- **Risk**: The context builder becomes a dumping ground for unrelated logic.
  - **Mitigation**: Restrict it to assembly, defaulting, and validation only.
- **Risk**: Callers keep passing loose `timezone` options and bypass the canonical contract.
  - **Mitigation**: Route all callers through one helper and remove duplicate field assembly where possible.
- **Risk**: Request IDs become hard to control in tests.
  - **Mitigation**: Allow injected request IDs in tests while defaulting them safely at runtime.

## Review Guidance

- Verify there is one obvious canonical request-context shape.
- Verify AX and normalization consume it intentionally, not incidentally.
- Verify no caller still owns authoritative timezone logic after this package.
- Verify the adapter boundary remains untouched.

## Activity Log

- 2026-03-11T17:18:05Z - system - lane=planned - Prompt created.
- 2026-03-11T18:06:51Z – Codex – shell_pid=23616 – lane=doing – Assigned agent via workflow command
