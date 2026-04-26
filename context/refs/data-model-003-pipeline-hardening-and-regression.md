# Data Model: 003 Pipeline Hardening and Regression

## Purpose

This model defines the contracts needed to harden the live `AX -> normalizer -> TickTickAdapter` execution path. It formalizes request context, execution records, rollback state, and telemetry signals so the feature can be implemented and tested without changing the existing architectural boundary.

## Current Source Objects

### Pipeline Entry Inputs

Observed in `server.js`, `bot/commands.js`, `services/scheduler.js`, and `services/pipeline.js`.

Core inputs today:
- `userMessage`
- optional `existingTask`
- optional timezone or date context
- adapter project lookup results

### Intent Extraction Action

Observed in `services/intent-extraction.js`.

Current extracted fields:
- `type`
- `title`
- `content`
- `priority`
- `projectHint`
- `dueDate`
- `repeatHint`
- `splitStrategy`
- `confidence`

### Normalized Action

Observed in `services/normalizer.js`.

Current normalized fields:
- `type`
- `taskId`
- `originalProjectId`
- `title`
- `content`
- `priority`
- `projectId`
- `dueDate`
- `repeatFlag`
- `splitStrategy`
- `valid`
- `validationErrors`

## Proposed Domain Objects

### PipelineRequestContext

Canonical execution context assembled before AX extraction.

Fields:
- `requestId: string`
- `entryPoint: string`
- `mode: string`
- `userMessage: string`
- `currentDate: string`
- `timezone: string`
- `availableProjects: ProjectRef[]`
- `existingTask: ExistingTaskSnapshot | null`

Validation rules:
- `entryPoint` must be a non-empty string. Call sites may pass raw values such as `telegram:freeform`, `telegram:scan`, `telegram:review`, `scheduler:poll`, `manual_command`, or test-only values such as `regression`.
- `mode` must be a non-empty string. Current live modes include `interactive`, `scan`, `review`, `poll`, and dev/debug aliases used to toggle diagnostic output.
- `timezone` must come from stored user context, not an environment default chosen at execution time.
- `currentDate` must be formatted before AX runs so relative dates are deterministic.
- `currentDate` is normalized to `YYYY-MM-DD` before AX runs, even when the incoming value starts as a timestamp.
- `requestId` must be present on every request for observability correlation.

### ProjectRef

Minimal project metadata exposed to AX and normalization.

Fields:
- `id: string`
- `name: string`

### ExistingTaskSnapshot

Task state captured before mutation when updating, completing, or deleting an existing task.

Fields:
- `id: string`
- `projectId: string | null`
- `title: string`
- `content: string | null`
- `priority: 0 | 1 | 3 | 5 | null`
- `dueDate: string | null`
- `repeatFlag: string | null`
- `status: number | null`

Usage:
- Supports normalization decisions.
- Provides rollback preimage data for compensating actions.

### NormalizedPipelineAction

Execution-ready action after deterministic normalization.

Fields:
- `type: "create" | "update" | "complete" | "delete"`
- `taskId: string | null`
- `originalProjectId: string | null`
- `title: string | null`
- `content: string | null`
- `priority: 0 | 1 | 3 | 5 | null`
- `projectId: string | null`
- `dueDate: string | null`
- `repeatFlag: string | null`
- `valid: boolean`
- `validationErrors: string[]`

### ActionExecutionRecord

Per-action runtime result inside one pipeline request.

Fields:
- `index: number`
- `action: NormalizedPipelineAction`
- `attempts: number`
- `status: "succeeded" | "failed" | "rolled_back" | "rollback_failed"`
- `result: object | null`
- `errorMessage: string | null`
- `failureClass: "none" | "validation" | "adapter" | "rollback"`
- `rollbackStep: RollbackStep | null`

Rules:
- `attempts` is capped at `2` for the clarified "retry once" policy.
- Every successful write must record enough information to attempt compensation later in the request.

### RollbackStep

Compensating write to undo one successful action after a later unrecoverable failure.

Fields:
- `type: "delete_created" | "restore_updated" | "uncomplete_task" | "recreate_deleted"`
- `targetTaskId: string`
- `targetProjectId: string | null`
- `payload: object`
- `sourceActionIndex: number`

Notes:
- `delete_created` compensates a successful `create`.
- `restore_updated` uses the pre-write snapshot for a successful `update`.
- `uncomplete_task` is only valid if the adapter exposes a reversible completion path or an equivalent restore action is defined during implementation.
- `recreate_deleted` requires a pre-delete snapshot of task fields.

### PipelineFailure

Terminal request failure envelope.

Fields:
- `failureClass: "quota" | "malformed_ax" | "validation" | "adapter" | "rollback" | "unexpected"`
- `class: same as failureClass`
- `stage: string | null`
- `summary: string | null`
- `details: object | null`
- `userMessage: string`
- `developerMessage: string | null`
- `requestId: string`
- `retryable: boolean`
- `rolledBack: boolean`

### PipelineResult

Final result returned by `processMessage()`.

Fields:
- `type: "task" | "non-task" | "error"`
- `requestId: string`
- `results: ActionExecutionRecord[]`
- `errors: string[]`
- `confirmationText: string`
- `entryPoint: string | null`
- `mode: string | null`
- `actions?: NormalizedPipelineAction[]`
- `warnings?: string[]`
- `failure?: PipelineFailure`
- `diagnostics?: string[]`
- `isDevMode?: boolean`
- `nonTaskReason?: string`
- `nonTaskDetails?: object | null`

State expectations:
- `non-task` means AX produced no actionable intent or all actions failed validation without writes.
- `error` means the request terminated in a classified failure envelope.
- `task` can include rolled-back writes, but final success is only valid when no unrecovered failure remains.
- `actions` is present on `task` results, not on `non-task` or `error` results.
- `nonTaskReason` and `nonTaskDetails` are present on `non-task` results.
- `failure`, `diagnostics`, and `isDevMode` are present on `error` results.

### TelemetryEvent

Structured event emitted by logs, metrics hooks, and tracing scaffolding.

Fields:
- `eventType: string`
- `timestamp: string`
- `requestId: string`
- `entryPoint: string`
- `step: "request" | "ax" | "normalize" | "execute" | "rollback" | "result"`
- `status: "start" | "success" | "failure"`
- `durationMs: number | null`
- `failureClass: string | null`
- `actionType: "create" | "update" | "complete" | "delete" | null`
- `attempt: number | null`
- `metadata: object`

## Relationships

- One `PipelineRequestContext` produces zero or more AX intent actions.
- AX intent actions become zero or more `NormalizedPipelineAction` objects after normalization.
- Each normalized action produces one `ActionExecutionRecord`.
- A successful execution record may have one `RollbackStep`.
- One request ends in one `PipelineResult`.
- Multiple `TelemetryEvent` records are emitted for a single request and share the same `requestId`.

## Lifecycle

Request lifecycle:
1. `received`
2. `intent_extracted` or `non_task`
3. `normalized`
4. `executing`
5. `completed`

Failure lifecycle:
1. `received`
2. `intent_failed` or `execution_failed`
3. optional `retrying`
4. optional `rollback_in_progress`
5. `rollback_completed` or `rollback_failed`
6. `request_failed`

## Explicit Non-Goals

- No multi-user tenancy model is introduced in this feature.
- No new external telemetry vendor is required in this feature.
- No direct TickTick client calls are allowed outside the adapter.
- No change to the model's core extraction responsibility; AX still emits intent actions, not final execution policy.
