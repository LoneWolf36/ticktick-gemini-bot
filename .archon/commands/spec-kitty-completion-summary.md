---
description: Generate completion summary for all missions
argument-hint: (no arguments)
---

# Completion Summary

**Input**: $ARGUMENTS

---

## Your Mission

Generate a comprehensive completion summary for all executed Spec Kitty missions.

---

## Phase 1: GATHER DATA

### 1.1 Git Statistics

```bash
echo "=== Commits ==="
git log --oneline --no-merges | head -50

echo ""
echo "=== Files Changed ==="
git diff --stat HEAD~50..HEAD 2>/dev/null | tail -30

echo ""
echo "=== Lines of Code ==="
git diff --stat HEAD~50..HEAD 2>/dev/null | tail -1
```

### 1.2 Test Statistics

```bash
echo "=== Test Results ==="
node --test tests/*.test.js 2>&1 | tail -5

echo ""
echo "=== Regression Results ==="
node tests/run-regression-tests.mjs 2>&1 | tail -5
```

### 1.3 Mission Status

For each mission 001-009:
```bash
for mission in kitty-specs/*/; do
  mission_name=$(basename "$mission")
  done_count=$(grep -c '"to_lane":"done"' "$mission/status.events.jsonl" 2>/dev/null || echo 0)
  echo "${mission_name}: ${done_count} WPs done"
done
```

---

## Phase 2: GENERATE SUMMARY

Write to `$ARTIFACTS_DIR/completion-summary.md`:

```markdown
# Spec Kitty Missions 001-009 — Completion Summary

**Date**: {YYYY-MM-DD}
**Workflow**: spec-kitty-missions-complete

## Executive Summary

{2-3 sentence overview of what was accomplished}

## Mission Status

| Mission | WPs Done | Total WPs | Status |
|---------|----------|-----------|--------|
| 001 | 7/7 | 7 | ✅ Complete |
| 002 | {N}/7 | 7 | ✅/⚠️ |
| 003 | {N}/6 | 6 | ✅/⚠️ |
| 004 | {N}/5 | 5 | ✅/⚠️ |
| 005 | {N}/6 | 6 | ✅/⚠️ |
| 006 | {N}/7 | 7 | ✅/⚠️ |
| 007 | 4/4 | 4 | ✅ Complete |
| 008 | {N}/5 | 5 | ✅/⚠️ |
| 009 | {N}/7 | 7 | ✅/⚠️ |
| **Total** | **{N}/49** | **49** | |

## Key Implementations

### Feature 002: Natural Language Task Mutations
- {What was added}
- {User-facing behavior change}

### Feature 003: Pipeline Hardening
- {What was added}

{Continue for each feature...}

## Statistics

- **Commits**: {N}
- **Files changed**: {N}
- **Lines added**: {N}
- **Lines removed**: {N}
- **Tests added**: {N}
- **Test pass rate**: {N}%

## Quality Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Lint errors | 0 | 0 | — |
| Test failures | {N} | {N} | {+/0/-} |
| Code duplication | {N}% | {N}% | {+/0/-} |

## Product Vision Alignment

{Summary of how the system now better serves the behavioral support goals}

## Remaining Work

{Any WPs not completed, with reasons}

## Next Steps

{Recommended follow-up work}
```

---

## Success Criteria

- **DATA_GATHERED**: Git, test, and mission stats collected
- **SUMMARY_GENERATED**: Comprehensive completion summary written
- **OUTPUT_TO_USER**: Summary displayed to user
