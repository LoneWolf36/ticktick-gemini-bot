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

### 1.1 Check for Expected Review Files

Expected reviews (check each one explicitly):
```bash
MISSION_SLUG="{mission-slug}"
ARTIFACTS_DIR="$ARTIFACTS_DIR"

# Define expected review files
declare -A EXPECTED_REVIEWS
EXPECTED_REVIEWS=(
  ["architecture"]="$ARTIFACTS_DIR/review-architecture-${MISSION_SLUG}.md"
  ["security"]="$ARTIFACTS_DIR/review-security-${MISSION_SLUG}.md"
  ["testing"]="$ARTIFACTS_DIR/review-testing-${MISSION_SLUG}.md"
  ["product-vision"]="$ARTIFACTS_DIR/review-product-vision-${MISSION_SLUG}.md"
  ["code-quality"]="$ARTIFACTS_DIR/review-code-quality-${MISSION_SLUG}.md"
)

# Check which reviews exist
REVIEWS_FOUND=0
REVIEWS_MISSING=0
FOUND_FILES=""
MISSING_REVIEWS=""

for review_type in "${!EXPECTED_REVIEWS[@]}"; do
  file_path="${EXPECTED_REVIEWS[$review_type]}"
  if [ -f "$file_path" ]; then
    echo "✅ Found: review-${review_type}"
    REVIEWS_FOUND=$((REVIEWS_FOUND + 1))
    FOUND_FILES="$FOUND_FILES $file_path"
  else
    echo "❌ Missing: review-${review_type}"
    REVIEWS_MISSING=$((REVIEWS_MISSING + 1))
    MISSING_REVIEWS="$MISSING_REVIEWS $review_type"
  fi
done

echo ""
echo "Review Status: $REVIEWS_FOUND/5 completed, $REVIEWS_MISSING missing"
```

### 1.2 Decide Whether to Proceed or Block

```bash
# Block if critical reviews are missing (security or architecture)
if [ -f "$ARTIFACTS_DIR/review-security-${MISSION_SLUG}.md" ] && \
   [ -f "$ARTIFACTS_DIR/review-architecture-${MISSION_SLUG}.md" ]; then
  echo "✅ Critical reviews present — proceeding with synthesis"
  
  if [ $REVIEWS_MISSING -gt 0 ]; then
    echo "⚠️  WARNING: Missing reviews:$MISSING_REVIEWS"
    echo "   Synthesis will proceed but may be incomplete"
  fi
else
  echo "❌ BLOCKER: Critical reviews missing (security and/or architecture)"
  echo "   Missing:$MISSING_REVIEWS"
  echo "   Cannot proceed without critical reviews"
  exit 1
fi
```

---

## Phase 2: CATEGORIZE FINDINGS

### 2.1 Read Available Reviews

Read each found review file and extract findings:
```bash
# Process each found review
for file_path in $FOUND_FILES; do
  echo "Processing: $(basename "$file_path")"
  # Extract blockers, warnings, and informational items
  # (Implementation depends on review format)
done
```

### 2.2 Extract Blockers

From each review, collect items marked as **blockers** or **critical**. These MUST be fixed.

### 2.3 Extract Warnings

Collect items marked as **warnings** or **should fix**. These SHOULD be fixed.

### 2.4 Extract Informational

Collect items marked as **informational** or **nice to fix**. Optional improvements.

### 2.5 Report Review Completeness

```bash
echo "=== Review Synthesis Status ==="
echo "Reviews found: $REVIEWS_FOUND/5"
echo "Reviews missing: $REVIEWS_MISSING/5"
if [ $REVIEWS_MISSING -gt 0 ]; then
  echo "Missing reviews:$MISSING_REVIEWS"
  echo "⚠️  Synthesis may be incomplete"
fi
```

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

## Review Completeness
- Reviews completed: $REVIEWS_FOUND/5
- Missing reviews:$MISSING_REVIEWS
- ⚠️ Synthesis based on available reviews only

## Summary
{Overall assessment in 2-3 sentences}

## Stats
- Reviews processed: $REVIEWS_FOUND
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
