---
description: Synthesize findings from all parallel review agents
argument-hint: <mission-slug>
---

# Synthesize Review Findings

**Input**: $ARGUMENTS

---

## Your Mission

Read all parallel review reports and synthesize them into a single actionable document with prioritized fixes.

---

## Phase 1: GATHER REVIEWS

Read all review files from `$ARTIFACTS_DIR/`:
```bash
ls $ARTIFACTS_DIR/review-*{mission-slug}*.md 2>/dev/null
```

Expected reviews:
- `review-architecture-{mission-slug}.md`
- `review-security-{mission-slug}.md`
- `review-testing-{mission-slug}.md`
- `review-product-vision-{mission-slug}.md`
- `review-code-quality-{mission-slug}.md`

---

## Phase 2: CATEGORIZE FINDINGS

### 2.1 Extract Blockers

From each review, collect items marked as **blockers** or **critical**. These MUST be fixed.

### 2.2 Extract Warnings

Collect items marked as **warnings** or **should fix**. These SHOULD be fixed.

### 2.3 Extract Informational

Collect items marked as **informational** or **nice to fix**. Optional improvements.

---

## Phase 3: PRIORITIZE

Create prioritized fix list:

| Priority | Review Source | Issue | Files | Effort |
|----------|--------------|-------|-------|--------|
| P0 | {review} | {blocker} | {files} | S/M/L |
| P1 | {review} | {warning} | {files} | S/M/L |
| P2 | {review} | {info} | {files} | S/M/L |

---

## Phase 4: WRITE SYNTHESIS

Write to `$ARTIFACTS_DIR/synthesis-review-{mission-slug}.md`:

```markdown
# Review Synthesis: {mission-slug}

**Date**: {YYYY-MM-DD}

## Summary
{Overall assessment in 2-3 sentences}

## Stats
- Reviews completed: 5/5
- Blockers found: {N}
- Warnings found: {N}
- Informational: {N}

## Prioritized Fix List

### P0 — Blockers (Must Fix)
| # | Source | Issue | Files |
|---|--------|-------|-------|
| 1 | {review} | {issue} | {files} |

### P1 — Warnings (Should Fix)
| # | Source | Issue | Files |
|---|--------|-------|-------|

### P2 — Informational (Nice to Fix)
| # | Source | Issue | Files |
|---|--------|-------|-------|

## Recommendation
{PROCEED to fixes if blockers exist, or APPROVE if no blockers}
```

---

## Success Criteria

- **ALL_REVIEWS_READ**: All 5 review files processed
- **FINDINGS_EXTRACTED**: Blockers, warnings, informational categorized
- **PRIORITIZED**: Fix list ordered by priority
- **SYNTHESIS_WRITTEN**: Summary saved to artifacts
