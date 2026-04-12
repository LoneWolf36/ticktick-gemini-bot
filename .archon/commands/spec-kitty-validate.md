---
description: Run full validation suite for a Spec Kitty feature
argument-hint: (no arguments)
---

# Validate Spec Kitty Feature

**Input**: $ARGUMENTS

---

## Your Mission

Run comprehensive validation checks on the project to ensure code quality, test coverage, and Product Vision alignment after implementing a Spec Kitty work package or feature.

This is a **Node.js behavioral support system** with strict quality standards.

---

## Phase 0: SETUP

### 0.1 Ensure Artifacts Directory Exists

```bash
mkdir -p "$ARTIFACTS_DIR"
echo "✅ Artifacts directory ready: $ARTIFACTS_DIR"
```

---

## Phase 1: LINT

### 1.1 Run Linter with Explicit Pass/Fail Tracking

```bash
echo "=== Running Lint Check ==="
if npm run lint 2>&1; then
  LINT_RESULT="Pass"
  LINT_NOTES="Zero errors and zero warnings"
  echo "✅ Lint check passed"
else
  LINT_RESULT="Fail"
  LINT_NOTES="Lint errors found — see output above"
  echo "❌ Lint check failed"
fi
```

**Must pass with zero errors and zero warnings.**

**If lint fails:**
1. Run `npm run lint:fix` for auto-fixable issues
2. Manually fix remaining issues
3. Re-run lint
4. Proceed only when clean

---

## Phase 2: TESTS

### 2.1 Run Unit Tests with Explicit Pass/Fail Tracking

```bash
echo "=== Running Unit Tests ==="
if node --test tests/*.test.js 2>&1 | tail -30; then
  TEST_RESULT="Pass"
  TEST_NOTES="All tests passed"
  echo "✅ Unit tests passed"
else
  TEST_RESULT="Fail"
  TEST_NOTES="Some tests failed — check output above"
  echo "❌ Unit tests failed"
fi
```

**All NEW tests must pass.** Pre-existing failures should be noted but not block progress.

### 2.2 Run Regression Tests with Explicit Tracking

```bash
echo "=== Running Regression Tests ==="
if node tests/run-regression-tests.mjs 2>&1 | tail -20; then
  REGRESSION_RESULT="Pass"
  REGRESSION_NOTES="No new failures introduced"
  echo "✅ Regression tests passed"
else
  REGRESSION_RESULT="Fail"
  REGRESSION_NOTES="Regression failures detected — check output"
  echo "❌ Regression tests failed"
fi
```

**No NEW failures** should be introduced. Pre-existing regression failures are acceptable if count doesn't increase.

---

## Phase 3: DUPLICATION CHECK

### 3.1 Check for Code Duplication with Explicit Tracking

```bash
echo "=== Running Duplication Check ==="
# Run JSCPD if available
if npx jscpd --config .jscpd.json 2>/dev/null; then
  DUPLICATION_RESULT="Pass"
  DUPLICATION_NOTES="No significant duplication detected"
  echo "✅ Duplication check passed"
else
  DUPLICATION_RESULT="Skipped"
  DUPLICATION_NOTES="JSCPD not configured or failed"
  echo "⚠️  Duplication check skipped (no config)"
fi
```

**No significant new duplication** beyond baseline should be introduced.

---

## Phase 4: REPORT RESULTS

Write validation results to `$ARTIFACTS_DIR/validation-{wp-id}.md`:

```markdown
# Validation Report: WP{NN}

**Date**: {YYYY-MM-DD}
**Mission**: {mission-slug}

## Results

| Check | Command | Result | Notes |
|-------|---------|--------|-------|
| Lint | \`npm run lint\` | $LINT_RESULT | $LINT_NOTES |
| Unit Tests | \`node --test\` | $TEST_RESULT | $TEST_NOTES |
| Regression | \`run-regression-tests.mjs\` | $REGRESSION_RESULT | $REGRESSION_NOTES |
| Duplication | \`jscpd\` | $DUPLICATION_RESULT | $DUPLICATION_NOTES |

## New Test Coverage
{Describe what new tests were added or updated}

## Pre-existing Failures
{List any pre-existing test failures that are unrelated to this WP}

## Summary
Overall status: $LINT_RESULT, $TEST_RESULT, $REGRESSION_RESULT, $DUPLICATION_RESULT

## Blockers
{List any issues that should block proceeding}
```

---

## Success Criteria

- **ALL_GREEN**: All validation checks pass OR pre-existing failures are documented
- **NO_NEW_FAILURES**: No new test failures introduced
- **ARTIFACT_WRITTEN**: Report saved to `$ARTIFACTS_DIR/validation-{wp-id}.md`
