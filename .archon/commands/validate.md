---
description: Run full validation suite (lint, type check, tests)
argument-hint: (no arguments)
---

# Validate

**Input**: $ARGUMENTS

---

## Your Mission

Run comprehensive validation checks on the project to ensure code quality, type safety, and test coverage.

This is a **Node.js** project with a TickTick + Gemini bot.

---

## Phase 1: LINT

### 1.1 Run Linter

```bash
npm run lint
```

---

## Phase 2: TYPE CHECK

### 2.1 TypeScript Check (if applicable)

```bash
npx tsc --noEmit
```

If no TypeScript files, skip this step.

---

## Phase 3: TESTS

### 3.1 Run Test Suite

```bash
npm test
```

---

## Phase 4: REPORT RESULTS

Write validation results to `$ARTIFACTS_DIR/validation.md`:

```markdown
# Validation Report

**Date**: {YYYY-MM-DD}

## Results

| Check | Command | Result | Notes |
|-------|---------|--------|-------|
| Lint | `npm run lint` | Pass/Fail | {errors if any} |
| Type Check | `tsc --noEmit` | Pass/Fail/Skipped | {errors if any} |
| Tests | `npm test` | Pass/Fail | {N passed, N failed} |

## Summary
{Overall status: ALL GREEN or issues found}

## Issues Found
{List any failures with error messages}
```

---

## Success Criteria

- **ALL_GREEN**: All validation checks pass
- **ARTIFACT_WRITTEN**: Report saved to `$ARTIFACTS_DIR/validation.md`

If any checks fail, document the failures clearly but continue the workflow.
