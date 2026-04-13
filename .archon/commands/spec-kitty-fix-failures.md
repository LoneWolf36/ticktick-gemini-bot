---
description: Fix pre-existing test failures starting with lowest complexity
argument-hint: <mission-slug> [complexity:low|medium|high|all]
---

# Fix Pre-existing Test Failures

**Input**: $ARGUMENTS

## Purpose

Systematically fix pre-existing test failures, starting with the lowest-complexity quick wins. Each fix is committed separately with a clear message.

## Phase 1: Parse Arguments

Extract:
- Mission slug (first argument)
- Complexity filter (second argument, default: "low")

## Phase 2: Read Failure Ledger

Read `.archon/technical-debt/failures.jsonl`. Filter entries by:
- `status: "tracked"` (not already fixed or deferred)
- `complexity: <filter>` (or "all" for no filter)

If no entries match: output `{"status": "no_failures_to_fix", "filter": "<complexity>"}` and exit.

## Phase 3: Fix Each Failure

For each failure in the filtered list:

1. **Read the test file** and understand the failure
2. **Read the error message** from the catalog
3. **Identify the root cause** — is it a bad assertion? Missing mock? Wrong expectation?
4. **Implement the minimal fix** — change ONLY what's needed to make the test pass
5. **Run the specific test** to verify the fix:
   ```bash
   node --test tests/path/to/test-file.js 2>&1 | grep -E "pass|fail"
   ```
6. **If the test passes**: commit the fix
   ```bash
   git add -A
   git commit -m "fix(tests): fix {test_name} — {one-line description}

   Root cause: {explanation}
   Fix: {what was changed}
   
   Co-Authored-By: Codex GPT-5 <noreply@openai.com>"
   ```
7. **Update the ledger**: change status to "fixed", set `fixed_in_wp` to current WP or phase

## Phase 4: Verify No Regressions

After all fixes:
```bash
npm test 2>&1 | tail -5
node tests/run-regression-tests.mjs 2>&1 | tail -5
```

Verify:
- Fixed tests now pass
- No NEW failures introduced
- Pre-existing failure count decreased by the number of fixes

## Phase 5: Report Results

Output:
```
=== Fix Summary ===
Fixes attempted: X
Fixes successful: Y
Fixes failed: Z (need investigation)
New failures introduced: 0 ← must be 0
Remaining pre-existing failures: N

Commits:
- {commit hash}: fix(tests): {message}
- ...

Ledger updated: .archon/technical-debt/failures.jsonl
================
```

## Rules

- Fix ONLY the identified failure — do not refactor unrelated code
- If a fix is not straightforward (takes > 5 minutes), skip it and note "needs investigation"
- Never change test expectations to match broken behavior — fix the code, not the test
- If a test is fundamentally wrong (testing the wrong thing), fix the test AND note it
