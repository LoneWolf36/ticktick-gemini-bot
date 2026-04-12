---
description: Test coverage review for a completed Spec Kitty feature
argument-hint: <mission-slug>
---

# Test Coverage Review: Spec Kitty Feature

**Input**: $ARGUMENTS

---

## Your Mission

Review test coverage quality for the recently implemented feature. Check behavioral contract coverage, edge cases, regression safety, and test maintainability.

---

## Phase 1: COVERAGE ANALYSIS

### 1.1 Identify New Code

```bash
git diff HEAD~5..HEAD -- '*.js' '*.mjs' --stat 2>/dev/null | tail -20
```

### 1.2 Map Tests to Implementation

For each new/modified source file:
1. Find corresponding test file(s)
2. Count test cases added
3. Identify untested code paths

---

## Phase 2: BEHAVIORAL CONTRACT COVERAGE

### 2.1 Happy Path Tests

Verify tests cover:
- Normal successful operation
- Expected input variations
- User-facing behavior matches spec

### 2.2 Edge Cases

Check tests for:
- Empty inputs
- Extremely long inputs
- Special characters and Unicode
- Missing optional fields
- Boundary conditions

### 2.3 Error Paths

Verify tests cover:
- API failures
- Network timeouts
- Invalid data from upstream
- Malformed user input

---

## Phase 3: REGRESSION SAFETY

### 3.1 Regression Test Suite

```bash
node tests/run-regression-tests.mjs 2>&1 | tail -10
```

**Verify:**
- No existing tests were removed
- No existing behavior was broken
- Test count increased or stayed same (acceptable if refactoring)

### 3.2 Test Maintainability

Check tests for:
- Clear test names describing behavior (not implementation)
- Minimal test setup/teardown
- No shared mutable state between tests
- Tests run independently

---

## Phase 4: WRITE TEST REVIEW

Write to `$ARTIFACTS_DIR/review-testing-{mission-slug}.md`:

```markdown
# Test Coverage Review: {mission-slug}

**Date**: {YYYY-MM-DD}
**Reviewer**: Testing Agent

## Summary
{Overall test quality assessment}

## Coverage Analysis
| Source File | Test File | Coverage Quality | Gaps |
|-------------|-----------|-----------------|------|
| {file.js} | {file.test.js} | High/Med/Low | {missing cases} |

## Behavioral Contracts
| Contract | Tested? | Evidence |
|----------|---------|----------|
| {behavior description} | Yes/No | {test name} |

## Edge Cases Covered
- [ ] Empty inputs
- [ ] Long inputs
- [ ] Special characters
- [ ] Missing fields
- [ ] Boundary conditions

## Error Paths Covered
- [ ] API failures
- [ ] Network issues
- [ ] Invalid data
- [ ] Malformed input

## Regression Status
- Pre-existing test count: {N}
- Current test count: {N}
- New failures introduced: {N}

## Blockers
{List critical test coverage gaps that must be addressed}
```

---

## Success Criteria

- **HAPPY_PATH_COVERED**: Normal operation tested
- **EDGE_CASES_COVERED**: Boundary conditions tested
- **ERROR_PATHS_COVERED**: Failure scenarios tested
- **REGRESSION_SAFE**: No existing tests broken
- **REPORT_WRITTEN**: Test review saved to artifacts
