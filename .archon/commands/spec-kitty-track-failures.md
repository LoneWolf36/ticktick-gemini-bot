---
description: Catalog all pre-existing test failures for tracking and prioritization
argument-hint: <mission-slug>
---

# Track Pre-existing Test Failures

**Input**: $ARGUMENTS

## Purpose

Systematically catalog ALL failing tests — distinguishing pre-existing failures from new ones introduced by recent changes. This creates a persistent technical debt ledger that prevents failures from being silently accepted as "normal."

## Phase 1: Run Full Test Suite

```bash
cd /home/lonewolf09/Documents/Projects/ticktick-gemini

# Unit tests
npm test 2>&1 | tee /tmp/test-output-unit.txt

# Regression tests  
node tests/run-regression-tests.mjs 2>&1 | tee /tmp/test-output-regression.txt
```

## Phase 2: Extract Failing Tests

From the test output, extract:
- Test file path
- Test name/description
- Error message (first 200 chars)
- Error type (assertion failure, timeout, syntax error, etc.)

## Phase 3: Classify as Pre-existing vs New

Read `.archon/technical-debt/failures.jsonl` (if it exists). For each failing test:
- If the test name exists in the ledger → **pre-existing**
- If the test name does NOT exist in the ledger → **NEW failure** (regression!)

For NEW failures:
- Output: `{"status": "REGRESSION_DETECTED", "new_failures": [...], "action": "block_and_fix_immediately"}`
- A new test failure is a blocker — the workflow should NOT proceed until it's fixed

## Phase 4: Estimate Complexity

For each pre-existing failure, estimate fix complexity:
- **low**: Single-line fix, obvious cause (e.g., wrong assertion, missing mock)
- **medium**: Requires understanding multiple files, refactoring a small section
- **high**: Requires architectural change, new feature, or deep investigation

## Phase 5: Write Report

Create `.archon/artifacts/failure-catalog-{mission-slug}.md`:

```markdown
# Failure Catalog — {mission-slug}

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

## Phase 6: Update Ledger

Append to `.archon/technical-debt/failures.jsonl`:
```json
{"test_name": "...", "file": "...", "error_summary": "...", "first_seen": "2026-04-13T...", "complexity": "low|medium|high", "status": "tracked", "fixed_in_wp": null}
```

For tests already in the ledger: update nothing (preserve original `first_seen`).

## Output

Print summary:
```
=== Failure Catalog Summary ===
Total failures: X
  Pre-existing: Y (low: N, medium: N, high: N)
  New (REGRESSION): Z ← BLOCKER if > 0
Catalog saved to: .archon/artifacts/failure-catalog-{slug}.md
Ledger updated: .archon/technical-debt/failures.jsonl
================================
```
