---
description: Implement fixes from review findings
argument-hint: <mission-slug>
---

# Implement Review Fixes

**Input**: $ARGUMENTS

---

## Your Mission

Fix all P0 (blocker) and P1 (warning) issues identified in the review synthesis.

---

## Phase 1: LOAD SYNTHESIS

Read `$ARTIFACTS_DIR/synthesis-review-{mission-slug}.md`

Extract the prioritized fix list.

---

## Phase 2: FIX P0 BLOCKERS

For each P0 item:
1. Read the relevant code
2. Understand the issue from the review
3. Implement the minimal fix
4. Verify the fix doesn't break existing behavior

**Rules:**
- Fix ONLY the identified issue
- Do not refactor unrelated code
- Do not "improve" beyond fixing the blocker

---

## Phase 3: FIX P1 WARNINGS

For each P1 item:
1. Read the relevant code
2. Implement the fix if straightforward
3. If complex, note it and move on (P1s are warnings, not blockers)

---

## Phase 4: COMMIT FIXES

```bash
git add -A
git diff --cached --stat
git commit -m "fix({mission}): address review findings

{Summary of fixes}

Blockers fixed:
- {issue 1}
- {issue 2}

Co-Authored-By: Codex GPT-5 <noreply@openai.com>"
```

---

## Success Criteria

- **P0_FIXED**: All blockers addressed
- **P1_ADDRESSED**: Warnings fixed or noted
- **VALIDATED**: Changes don't break existing behavior
- **COMMITTED**: Fixes committed with clear message
