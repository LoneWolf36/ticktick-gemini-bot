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

## Phase 1: LINT

### 1.1 Run Linter

```bash
npm run lint 2>&1 || echo "Lint check completed (check output above)"
```

**Must pass with zero errors and zero warnings.**

**If lint fails:**
1. Run `npm run lint:fix` for auto-fixable issues
2. Manually fix remaining issues
3. Re-run lint
4. Proceed only when clean

---

## Phase 2: TESTS

### 2.1 Run Unit Tests

```bash
node --test tests/*.test.js 2>&1 | tail -30 || echo "Tests completed (check output above)"
```

**All NEW tests must pass.** Pre-existing failures should be noted but not block progress.

### 2.2 Run Regression Tests

```bash
node tests/run-regression-tests.mjs 2>&1 | tail -20 || echo "Regression tests completed"
```

**No NEW failures** should be introduced. Pre-existing regression failures are acceptable if count doesn't increase.

---

## Phase 3: DUPLICATION CHECK

### 3.1 Check for Code Duplication

```bash
# Run JSCPD if available
npx jscpd --config .jscpd.json 2>/dev/null || echo "Duplication check skipped (no config)"
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
| Lint | `npm run lint` | Pass/Fail | {errors if any} |
| Unit Tests | `node --test` | Pass/Fail | {N passed, N failed} |
| Regression | `run-regression-tests.mjs` | Pass/Fail | {baseline vs current} |
| Duplication | `jscpd` | Pass/Fail/Skipped | {duplication %} |

## New Test Coverage
{Describe what new tests were added or updated}

## Pre-existing Failures
{List any pre-existing test failures that are unrelated to this WP}

## Summary
{Overall status: ALL GREEN or issues found}

## Blockers
{List any issues that should block proceeding}
```

---

## Success Criteria

- **ALL_GREEN**: All validation checks pass OR pre-existing failures are documented
- **NO_NEW_FAILURES**: No new test failures introduced
- **ARTIFACT_WRITTEN**: Report saved to `$ARTIFACTS_DIR/validation-{wp-id}.md`
