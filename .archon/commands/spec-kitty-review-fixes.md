---
description: Verify that review fixes actually resolved P0 blockers without introducing overengineering
argument-hint: <mission-slug>
---

# Review Architecture Fixes

**Input**: $ARGUMENTS

## Purpose

After `spec-kitty-implement-review-fixes` runs, verify that the P0 blockers from the review synthesis were ACTUALLY resolved — not papered over with more abstraction. This is the gap that lets overengineering slip through.

## Phase 1: Load Original Blockers

Read `$ARTIFACTS_DIR/synthesis-review-{mission-slug}.md`.

Extract the P0 (blocker) items. If there are zero P0 items, output `{"status": "no_blockers", "action": "proceed"}` and exit.

## Phase 2: Verify Each P0 Was Resolved

For EACH P0 blocker listed in the synthesis:

1. **Identify the issue**: What was the original complaint?
2. **Find the fix**: Look at `git diff HEAD~1..HEAD` (the fix commit)
3. **Verify the fix addresses the complaint**:
   - If the blocker was "YAGNI violation: auth module with no users" → verify auth module was removed or deferred
   - If the blocker was "Overengineering: factory pattern with one product" → verify factory was simplified
   - If the blocker was "Dead code: unused utility module" → verify module was removed
4. **Check for papering over**: Did the fix ADD new complexity while claiming to fix the issue?
   - New abstraction layers?
   - New interfaces with one implementation?
   - New configuration files for a single value?

For each P0, record: `{"blocker": "...", "status": "resolved|papered_over|still_present", "evidence": "..."}`

## Phase 3: Quick Overengineering Check

Run a rapid scan on the diff:

```bash
git diff HEAD~1..HEAD --stat
# Count: new files, new directories, new abstractions
# Red flags: new directory with 1 file, new interface with 1 implementation, new config file for 1 value
```

If the fix added more files than it removed AND the synthesis had YAGNI concerns:
- Output: `{"status": "regression_risk", "added_files": N, "removed_files": M, "action": "escalate_to_human"}`

## Phase 4: Output Decision

```json
{
  "status": "all_resolved" | "blockers_remain" | "regression_risk",
  "blockers_checked": N,
  "blockers_resolved": N,
  "blockers_unresolved": N,
  "details": [...],
  "action": "proceed" | "escalate_to_human"
}
```

## Phase 5: Fail Loudly if Blockers Remain

If ANY P0 blocker is still present or was papered over:

1. Print: `🚨 P0 BLOCKERS NOT RESOLVED in {mission-slug}:`
2. List each unresolved blocker with evidence
3. Output: `{"status": "blockers_remain", "action": "block_pipeline"}`
4. **This should cause the workflow to stop** — the agent running this command must NOT proceed to the next phase

## Success Criteria

- **ALL_P0_RESOLVED**: Every blocker from synthesis was verified as fixed
- **NO_PAPERING_OVER**: Fixes simplified code, didn't add abstraction
- **PROCEED_OR_BLOCK**: Clear decision output for the workflow
