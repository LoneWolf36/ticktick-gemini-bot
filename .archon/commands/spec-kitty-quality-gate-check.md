---
description: Hard gate check — blocks workflow on YAGNI or Product Vision violations
argument-hint: <mission-slug>
---

# Quality Gate Check

**Input**: $ARGUMENTS

## Purpose

This is a **HARD BLOCK**. If the checks below fail, the workflow MUST stop. This prevents YAGNI violations and Product Vision drift from silently accumulating across missions.

## Gate 1: YAGNI Violations (BLOCKER)

Scan the codebase for forbidden MVP patterns. The MVP is for 1 user — these features are explicitly out of scope:

### 1.1 Authentication / Multi-tenant scaffolding
```bash
# Check for USER auth frameworks (NOT service OAuth like TickTick integration)
grep -rn "requireAuth\|passport\|auth.*middleware\|session.*store\|jwt.*verify\|isAuthenticated.*=\|protect.*route\|auth.*guard" --include="*.js" --include="*.ts" services/ bot/ 2>/dev/null | grep -v "node_modules" | grep -v "\.test" | grep -v "ticktick.*oauth\|TICKTICK.*OAUTH"
```

If found:
- Output: `YAGNI_AUTH_VIOLATION: <files and lines>`
- Exit code: **1** (hard block)

### 1.2 Billing / Payment infrastructure
```bash
grep -rn "stripe\|subscription.*plan\|pricing.*tier\|billing.*cycle\|payment.*gateway\|checkout.*session" --include="*.js" --include="*.ts" services/ bot/ 2>/dev/null | grep -v "node_modules" | grep -v "\.test"
```

If found:
- Output: `YAGNI_BILLING_VIOLATION: <files and lines>`
- Exit code: **1** (hard block)

### 1.3 Rate limiting / Throttling
```bash
# Check for rate-limiting PACKAGE imports (NOT defensive retry logic)
grep -rn "express-rate-limit\|slow\.down\|rate-limit-redis\|express-brute" --include="*.js" --include="*.ts" services/ bot/ 2>/dev/null | grep -v "node_modules" | grep -v "\.test"
```

If found:
- Output: `YAGNI_RATE_LIMIT_VIOLATION: <files and lines>`
- Exit code: **1** (hard block)

### 1.4 Over-engineering indicators (WARNING — requires human judgment)
```bash
# Flag patterns that MAY indicate overengineering — agent must justify, not auto-block
grep -rn "abstract class\|extends.*Factory\|implements.*Strategy\|class.*Provider" --include="*.js" --include="*.ts" services/ bot/ 2>/dev/null | grep -v "node_modules" | grep -v "\.test"
```

If found:
- Output: `YAGNI_OVERENGINEERING_SUSPECTED: <patterns found> — architecture review must justify why multiple implementations exist`
- Exit code: **0** (warning — does NOT block, but will be flagged in review artifacts)

## Gate 2: Product Vision Violations (BLOCKER)

Check that the feature aligns with "behavioral support system for task execution" — NOT a task manager.

### 2.1 Busywork enablement (WARNING — flagged for review, not auto-blocked)
Check if the feature adds bulk operations. The architecture review agent must assess whether these have execution context.

```bash
grep -rn "bulk.*create\|bulk.*update\|bulk.*move\|mass.*edit\|multi.*select" --include="*.js" --include="*.ts" services/ bot/ 2>/dev/null | grep -v "node_modules" | grep -v "\.test"
```

If found:
- Output: `VISION_BUSYWORK_SUSPECTED: <files> — architecture review must verify execution context exists`
- Exit code: **0** (warning — does NOT block, review agent assesses)

### 2.2 Passive management patterns (WARNING — flagged for review, not auto-blocked)
Count org-only features vs execution-focused features in the NEW code (git diff).

```bash
cd /home/lonewolf09/Documents/Projects/ticktick-gemini
NEW_FILES=$(git diff --name-only HEAD~3..HEAD 2>/dev/null | grep -E '\.(js|ts)$' | grep -v '\.test' | tr '\n' ' ')
if [ -n "$NEW_FILES" ]; then
  ORG_COUNT=$(grep -l "addTag\|removeTag\|renameProject\|moveProject\|setPriority" $NEW_FILES 2>/dev/null | wc -l)
  EXEC_COUNT=$(grep -l "procrastinat\|executionPriority\|dailyBrief\|accountability" $NEW_FILES 2>/dev/null | wc -l)
  if [ "$ORG_COUNT" -gt 0 ] && [ "$EXEC_COUNT" -eq 0 ]; then
    echo "VISION_PASSIVE_MGMT_SUSPECTED: ${ORG_COUNT} new files with org-only patterns, no execution focus"
    # Exit 0 — warning only, review agent must assess intent
  fi
fi
```

## Gate 3: DRY Violations (WARNING — not a hard block, but reported)

Check for obvious duplication (>50 line clones in new code):

```bash
cd /home/lonewolf09/Documents/Projects/ticktick-gemini
BASELINE_FILE=".archon/quality-gate-jscpd-baseline"
jscp_output=$(npx jscpd --min-lines 50 --min-tokens 200 --reporters console 2>/dev/null || true)
new_clones=$(echo "$jscp_output" | grep -c "Clone found" || echo "0")
baseline_clones=0
[ -f "$BASELINE_FILE" ] && baseline_clones=$(cat "$BASELINE_FILE")
```

If `new_clones > baseline_clones + 5`:
- Output: `DRY_WARNING: ${new_clones} duplication clusters (baseline was ${baseline_clones})`
- Exit code: **0** (warning only — does NOT block)

## Output

If ALL gates pass:
```
GATE_PASSED: No YAGNI or Product Vision violations detected
```
Exit code: **0**

If ANY gate fails:
```
GATE_FAILED
<specific violation details>
```
Exit code: **1** (workflow will be cancelled via `cancel:` node)

## Notes

- This command scans the ACTUAL code on disk, not the agent's claims
- Grep patterns are conservative — they flag potential violations for review
- If a legitimate use case exists (e.g., auth for TickTick OAuth, not user auth), the agent should document why it's not a violation and re-run
