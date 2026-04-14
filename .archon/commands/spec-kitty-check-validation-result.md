---
description: Check validation result and gate fallback execution
argument-hint: [--mission <slug>]
---

# Check Validation Result

**Input**: $ARGUMENTS

---

## Purpose

This command acts as a **conditional gate** between validation and fallback nodes. It prevents unconditional execution of expensive `spec-kitty-implement-review-fixes` when validation has already passed.

Reads the most recent validation output from `$ARTIFACTS_DIR` and outputs structured JSON indicating pass/fail status.

---

## How It Works

1. Scans `$ARTIFACTS_DIR` for the most recent validation report file
2. Parses the file for pass/fail indicators in the Results table or Status line
3. Outputs structured JSON for downstream conditional routing

---

## Execution

```bash
set -euo pipefail

# Parse optional --mission flag
MISSION_SLUG=""
if [[ "$ARGUMENTS" =~ --mission[[:space:]]+([^[:space:]]+) ]]; then
  MISSION_SLUG="\${BASH_REMATCH[1]}"
fi

echo "=== Checking Validation Result ==="

# Find the most recent validation report
VALIDATION_FILE=""
if [ -n "$MISSION_SLUG" ]; then
  # Scope to specific mission
  VALIDATION_FILE=$(ls -t "$ARTIFACTS_DIR"/validation-*"$MISSION_SLUG"*.md "$ARTIFACTS_DIR"/validation-full.md 2>/dev/null | head -1 || true)
else
  # Use most recent across all missions
  VALIDATION_FILE=$(ls -t "$ARTIFACTS_DIR"/validation-*.md 2>/dev/null | head -1 || true)
fi

if [ -z "$VALIDATION_FILE" ] || [ ! -f "$VALIDATION_FILE" ]; then
  # No validation file found — run fallback as precaution
  cat <<'EOF'
{
  "validation_status": "unknown",
  "action": "run_fallback",
  "failures": [],
  "message": "No validation result found. Running fallback as precaution."
}
EOF
  exit 0
fi

echo "Reading: $(basename "$VALIDATION_FILE")"

# Parse the validation file for results
CONTENT=$(cat "$VALIDATION_FILE")

# Check for overall status indicators
HAS_FAILURES=false
FAILURE_CATEGORIES=()

# Check lint result
if echo "$CONTENT" | grep -q "| Lint | Fail"; then
  HAS_FAILURES=true
  LINT_DETAIL=$(echo "$CONTENT" | grep -A1 "| Lint |" | tail -1 || echo "Lint errors detected")
  FAILURE_CATEGORIES+=("{\"category\": \"lint\", \"detail\": \"$LINT_DETAIL\"}")
fi

# Check unit tests result
if echo "$CONTENT" | grep -q "| Unit Tests | Fail"; then
  HAS_FAILURES=true
  TEST_DETAIL=$(echo "$CONTENT" | grep -A1 "| Unit Tests |" | tail -1 || echo "Unit tests failed")
  FAILURE_CATEGORIES+=("{\"category\": \"test\", \"detail\": \"$TEST_DETAIL\"}")
fi

# Check regression result
if echo "$CONTENT" | grep -q "| Regression | Fail"; then
  HAS_FAILURES=true
  REG_DETAIL=$(echo "$CONTENT" | grep -A1 "| Regression |" | tail -1 || echo "Regression failures detected")
  FAILURE_CATEGORIES+=("{\"category\": \"regression\", \"detail\": \"$REG_DETAIL\"}")
fi

# Check duplication result
if echo "$CONTENT" | grep -q "| Duplication | Fail"; then
  HAS_FAILURES=true
  DUP_DETAIL=$(echo "$CONTENT" | grep -A1 "| Duplication |" | tail -1 || echo "Duplication issues detected")
  FAILURE_CATEGORIES+=("{\"category\": \"duplication\", \"detail\": \"$DUP_DETAIL\"}")
fi

# Also check for "ISSUES FOUND" status line
if echo "$CONTENT" | grep -q "ISSUES FOUND"; then
  HAS_FAILURES=true
fi

# Build output JSON
if [ "$HAS_FAILURES" = false ]; then
  # All checks passed
  cat <<'EOF'
{
  "validation_status": "passed",
  "action": "skip_fallback",
  "failures": [],
  "message": "All validation checks passed. No fixes required."
}
EOF
else
  # Build failures array
  FAILURES_JSON="["
  for i in "${!FAILURE_CATEGORIES[@]}"; do
    if [ $i -gt 0 ]; then
      FAILURES_JSON+=","
    fi
    FAILURES_JSON+="${FAILURE_CATEGORIES[$i]}"
  done
  FAILURES_JSON+="]"

  FAILURE_COUNT=${#FAILURE_CATEGORIES[@]}
  cat <<EOF
{
  "validation_status": "failed",
  "action": "run_fallback",
  "failures": $FAILURES_JSON,
  "message": "Validation failed with $FAILURE_COUNT issue categories. Fallback fixes required."
}
EOF
fi
```

---

## Output Format

### On Validation Pass
```json
{
  "validation_status": "passed",
  "action": "skip_fallback",
  "failures": [],
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

### On No Validation Found
```json
{
  "validation_status": "unknown",
  "action": "run_fallback",
  "failures": [],
  "message": "No validation result found. Running fallback as precaution."
}
```

---

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

The fallback node MUST:
1. Read the output from this check node
2. If `validation_status` is `passed`: log skip message, exit immediately
3. If `validation_status` is `failed`: parse `failures` array and apply targeted fixes
4. If `validation_status` is `unknown`: proceed with comprehensive fixes as precaution

---

## Success Criteria

- **RESULT_PARSED**: Validation output successfully parsed
- **OUTPUT_WRITTEN**: Structured JSON written to stdout
- **FAST_EXECUTION**: Completed in < 5 seconds (read-only operation)
