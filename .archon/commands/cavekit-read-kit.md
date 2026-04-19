---
description: Read a Cavekit domain kit and extract the next actionable R-requirement
argument-hint: <kit name or R-number>
---

<!-- ACTION ITEM (cavekit-validate 2026-04-19): this Archon command was flagged as unmapped tooling drift. Decide whether tooling commands belong in a dedicated kit or should be excluded from product drift checks. -->

# Read Cavekit Domain Kit

**Input**: $ARGUMENTS

---

## Step 1: Read AGENTS.md

Read `AGENTS.md` for project conventions. If `.codex/skills/karpathy-guardrails/SKILL.md` exists, read that too.

## Step 2: Find the Kit

```bash
ls context/kits/cavekit-*.md 2>/dev/null || echo "No kits found"
```

**Resolution rules:**
- If `$ARGUMENTS` is a kit name → read that kit directly
- If `$ARGUMENTS` is an R-number (e.g. R03) → search all kits with `grep -l "R03" context/kits/cavekit-*.md`
- If `$ARGUMENTS` is empty → read `context/kits/cavekit-overview.md` and pick the first kit with unchecked requirements

## Step 3: Extract Requirement

Scan the kit for the first requirement marked `[ ]` whose dependencies are `[x]`.

## Step 4: Output

Write to `$ARTIFACTS_DIR/kit-requirement.md`:

```markdown
# Target Requirement

**Kit**: {kit filename}
**Requirement**: {R-number} - {title}
**Acceptance Criteria**:
- AC1: {criterion}
- AC2: {criterion}

**Dependencies**: {R-deps or "None"}
**Complexity**: {quick/medium/complex}
**Files likely involved**: {grep results}
```
