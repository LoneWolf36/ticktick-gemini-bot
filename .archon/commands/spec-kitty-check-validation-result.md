# spec-kitty-check-validation-result

Check whether the most recent `spec-kitty-validate-full` (or `spec-kitty-validate`) node passed or failed, and output structured result for conditional workflow routing.

## Purpose

This command acts as a **conditional gate** between validation and fallback nodes. It prevents unconditional execution of expensive `spec-kitty-implement-review-fixes` when validation has already passed.

## When to Use

- Immediately after any `spec-kitty-validate-full` or `spec-kitty-validate` node
- Before a `spec-kitty-implement-review-fixes` fallback node
- In workflow YAML nodes that need to decide whether to run fixes

## How It Works

1. Reads the most recent validation output from the workflow execution context
2. Parses the validation result for pass/fail status
3. If **passed**: outputs `{"status": "passed", "action": "skip"}` — signals downstream fallback nodes to skip
4. If **failed**: outputs `{"status": "failed", "failures": [...]}` — passes failure details to fallback for targeted fixes

## Usage

```bash
spec-kitty-check-validation-result [--mission <slug>]
```

### Flags

| Flag | Description |
|------|-------------|
| `--mission <slug>` | Optional. Mission slug to scope validation result lookup (e.g., `002-nlp-mutations`). If omitted, uses the most recent validation result across all missions. |

## Output Format

### On Validation Pass
```json
{
  "validation_status": "passed",
  "action": "skip_fallback",
  "message": "All validation checks passed. No fixes required."
}
```

### On Validation Failure
```json
{
  "validation_status": "failed",
  "action": "run_fallback",
  "failures": [
    {
      "category": "test",
      "detail": "3 regression tests failing in tests/regression.test.js"
    },
    {
      "category": "lint",
      "detail": "2 lint warnings in services/pipeline.js"
    }
  ],
  "message": "Validation failed with 2 issue categories. Fallback fixes required."
}
```

## Workflow Integration

In workflow YAML, use as follows:

```yaml
- id: fXXX-final-validation
  command: spec-kitty-validate-full
  depends_on: [fXXX-fixes-checkpoint]
  context: fresh

- id: fXXX-check-validation-result
  command: spec-kitty-check-validation-result
  depends_on: [fXXX-final-validation]
  context: fresh

- id: fXXX-validation-fallback
  command: spec-kitty-implement-review-fixes
  depends_on: [fXXX-check-validation-result]
  trigger_rule: all_done
  context: fresh
```

The fallback node should inspect the `validation_status` field from the check node's output:
- If `passed`: log skip message, exit immediately
- If `failed`: parse `failures` array and apply targeted fixes

## Implementation Notes

- This command is **read-only** — it does not modify files or git state
- It should execute quickly (< 5 seconds) as it only parses existing validation output
- The validation result is typically available in the workflow node execution context or can be read from the most recent `spec-kitty-validate*` command output
- If no validation result is found, output `{"status": "unknown", "action": "run_fallback", "message": "No validation result found. Running fallback as precaution."}`
