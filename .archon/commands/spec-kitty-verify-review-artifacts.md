---
description: Verify that all 5 review agents produced substantive output artifacts
argument-hint: <mission-slug>
---

# Verify Review Artifacts

**Input**: $ARGUMENTS

## Purpose

After the 5 parallel review agents complete (architecture, security, testing, product vision, code quality), verify that each produced a substantive output artifact. This prevents the synthesis node from running on empty or missing review data.

## Phase 1: Define Expected Artifacts

For mission slug `$ARGUMENTS`, check these 5 files in `.archon/artifacts/`:

1. `review-architecture-{mission-slug}.md`
2. `review-security-{mission-slug}.md`
3. `review-testing-{mission-slug}.md`
4. `review-product-vision-{mission-slug}.md`
5. `review-code-quality-{mission-slug}.md`

## Phase 2: Verify Each Artifact

For each artifact:

1. **Check existence**: File must exist
2. **Check size**: File must be > 100 characters (not just "no issues found")
3. **Check content**: File must contain at least one of:
   - A heading (`#` or `##`)
   - A finding (any text with "issue", "risk", "concern", "strength", "recommendation")
   - A code reference (file path or function name)

## Phase 3: Report Results

Output JSON:

```json
{
  "status": "complete" | "incomplete",
  "artifacts_checked": 5,
  "artifacts_valid": <count>,
  "missing": ["<list of missing or empty artifacts>"],
  "action": "proceed_to_synthesis" | "rerun_missing_reviews"
}
```

## Phase 4: Wait for Late Artifacts (Optional)

If any artifacts are missing, poll every 10 seconds for up to 5 minutes (30 polls). An artifact may be late if the review agent is still running.

After timeout: report final results.

## Success Criteria

- **ALL_5_PRESENT**: Every review artifact file exists and has substantive content
- **READY_FOR_SYNTHESIS**: All 5 verified → synthesis can proceed
- **INCOMPLETE_DETECTED**: Missing artifacts reported for manual intervention
