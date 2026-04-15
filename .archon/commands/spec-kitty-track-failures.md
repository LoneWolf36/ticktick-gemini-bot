---
description: Catalog all pre-existing test failures for tracking and prioritization
argument-hint: <mission-slug>
---

# Track Pre-existing Test Failures

**Input**: $ARGUMENTS

## CRITICAL BOUNDARIES — READ FIRST

**Your job is OBSERVE and REPORT only.** You are a catalog, not a fixer.

**MUST NOT**:
- Modify any test files
- Modify any source code
- Attempt to fix failures
- Skip or comment out tests
- Re-run tests after the initial catalog run
- Ask the user for input — use the mission slug from the workflow context, or "technical-debt-baseline" if unknown

**MUST**:
- Run tests ONCE
- Parse the output
- Classify each failure
- Write the report
- Update the ledger
- Print the summary
- EXIT

## Phase 1: Run Test Suite (ONCE)

```bash
cd /home/lonewolf09/Documents/Projects/ticktick-gemini

# Run unit tests — capture raw output
node --test tests/*.test.js > /tmp/test-output-unit.txt 2>&1 || true

# Run regression tests — capture raw output  
node tests/run-regression-tests.mjs > /tmp/test-output-regression.txt 2>&1 || true
```

Do NOT re-run tests. Do NOT attempt to fix failures. Do NOT skip tests.

## Phase 2: Extract Failing Tests

From the captured test output files, extract:
- Test name/description (the string passed to `test('...')`)
- File path
- Error message (first 200 chars)
- Error type (assertion failure, timeout, reference error, etc.)

## Phase 3: Classify as Pre-existing vs New

Read `.archon/technical-debt/failures.jsonl` (if it exists). For each failing test:
- If the test name exists in the ledger → **pre-existing**
- If the test name does NOT exist in the ledger → **NEW failure** (regression!)

For NEW failures, output this JSON and STOP — do NOT attempt to fix:
```json
{"status": "REGRESSION_DETECTED", "new_failures": [...]}
```

## Phase 4: Estimate Complexity

For each pre-existing failure, estimate fix complexity:
- **low**: Single-line fix, obvious cause (wrong assertion, missing mock)
- **medium**: Requires understanding multiple files, refactoring a small section
- **high**: Requires architectural change, new feature, or deep investigation

## Phase 5: Write Report

Create `.archon/artifacts/failure-catalog-{slug}.md`:

```markdown
# Failure Catalog — {slug}

**Date**: {ISO timestamp}
**Total failures**: {count}
**Pre-existing**: {count}
**New (regressions)**: {count}

## Pre-existing Failures

| # | Test | File | Error | Complexity | First Seen |
|---|------|------|-------|------------|------------|
| 1 | ... | ... | ... | low | 2026-04-13 |

## New Failures (BLOCKERS)

{If any: list them with full error details}

## Summary

- {X} low-complexity (quick wins)
- {Y} medium-complexity
- {Z} high-complexity
```

Use the mission slug from the `$ARGUMENTS` parameter. If empty, use "technical-debt-baseline".

## Phase 6: Update Ledger

Append NEW entries only to `.archon/technical-debt/failures.jsonl`:
```json
{"test_name": "...", "file": "...", "error_summary": "...", "first_seen": "2026-04-13T...", "last_seen": "2026-04-13T...", "complexity": "low|medium|high", "status": "tracked", "fixed_in_wp": null, "cataloged_by_mission": "phase-0-technical-debt"}
```

Do NOT modify existing entries. Do NOT update timestamps on existing entries.

## Phase 7: Print Summary and EXIT

Print exactly:
```
=== Failure Catalog Summary ===
Total failures: X
  Pre-existing: Y (low: N, medium: N, high: N)
  New (REGRESSION): Z ← BLOCKER if > 0
Catalog saved to: .archon/artifacts/failure-catalog-{slug}.md
Ledger updated: .archon/technical-debt/failures.jsonl
================================
```

Then STOP. Do NOT run validation. Do NOT fix anything. Do NOT ask questions.
