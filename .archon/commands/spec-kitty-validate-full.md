---
description: Run full validation suite across all dimensions
argument-hint: (no arguments)
---

# Full Validation

**Input**: $ARGUMENTS

---

## Your Mission

Run the complete validation suite to ensure everything is green before proceeding to the next feature.

---

## Phase 1: LINT

```bash
npm run lint 2>&1 | tail -10 || echo "Lint completed"
```

---

## Phase 2: TESTS

```bash
node --test tests/*.test.js 2>&1 | tail -15 || echo "Tests completed"
```

---

## Phase 3: REGRESSION

```bash
node tests/run-regression-tests.mjs 2>&1 | tail -10 || echo "Regression completed"
```

---

## Phase 4: REPORT

Write to `$ARTIFACTS_DIR/validation-full.md`:

```markdown
# Full Validation Report

**Date**: {YYYY-MM-DD}

| Check | Result | Details |
|-------|--------|---------|
| Lint | Pass/Fail | |
| Unit Tests | {N} passed, {N} failed | |
| Regression | {N} passed, {N} failed | |
| Baseline Failures | {N} pre-existing | |

## Status: ALL GREEN / ISSUES FOUND
```

---

## Success Criteria

- **ALL_GREEN**: No new failures introduced
- **REPORT_WRITTEN**: Validation saved to artifacts
