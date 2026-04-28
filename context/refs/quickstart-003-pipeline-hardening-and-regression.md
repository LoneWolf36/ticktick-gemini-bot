# Quickstart: 003 Pipeline Hardening and Regression

## Purpose

Use this guide after implementation to verify that the hardened pipeline behaves correctly across direct pipeline tests, entry-point wiring, rollback paths, and observability signals.

## Prerequisites

- Install dependencies with `npm install`.
- Keep live TickTick and Gemini credentials out of the verification flow unless you are intentionally running opt-in live checks.
- Prefer mocked regression paths for routine validation.

## Verification Flow

### 1. Run the serial regression suite

```bash
npm run test:regression
```

Expected:
- Direct pipeline regressions pass for create, update, complete, delete, non-task, validation failure, adapter failure, and quota rotation.
- No live API credentials are required for the mocked cases.

### 2. Enforce regression file size guard

```bash
npm run check:test-sizes
```

Expected:
- Split domain suites remain below the max-lines threshold.
- New coverage gets added to the relevant regression domain file instead of a single monolith.

### 3. Validate canonical context propagation

Check:
- `server.js`, `bot/commands.js`, and `services/scheduler.js` all assemble the same pipeline request context.
- The timezone used for relative-date expansion comes from stored user context.
- Intent extraction receives `currentDate`, canonical timezone context, and available project names on every call path.

### 4. Validate retry and rollback behavior

Check with focused mocks:
- A multi-action request retries one failed action exactly once.
- If the retry still fails, prior successful writes are compensated through `TickTickAdapter`.
- The final result is a failure with rollback status, not a misleading partial success.

### 5. Validate quota and malformed intent extraction handling

Check with focused mocks:
- When one Gemini key is exhausted, the pipeline attempts another configured key before failing.
- Malformed or empty intent extraction output produces a non-destructive failure path instead of an unhandled exception.
- User-facing failure text stays compact while development mode preserves diagnostic detail.

### 6. Validate observability output

Check:
- Each request has a stable `requestId`.
- Structured telemetry events are emitted for request start, intent extraction, normalization, execution, rollback, and terminal outcome.
- Metrics hooks and tracing scaffolding receive the same failure class and duration data used in logs.

### 7. Validate burst behavior

Check with mocked dependencies:
- Tens of concurrent requests complete deterministically.
- Correlation IDs remain unique per request.
- Failures in one request do not corrupt neighboring request results.

## Recommended Manual Smoke Cases

- `"book dentist thursday"` resolves using the stored user timezone.
- A message with no actionable intent returns `non-task`.
- A multi-action request with a forced adapter failure retries once, rolls back prior writes, and reports failure correctly.
- A quota exhaustion mock rotates keys before surfacing failure.
