---
description: Implement fix for GitHub issue — code changes, validation, commit
argument-hint: (reads investigation/plan from $ARTIFACTS_DIR/investigation.md)
---

# Fix Issue

**Input**: $ARGUMENTS

---

## Your Mission

Execute the fix based on the investigation report or implementation plan from `$ARTIFACTS_DIR/investigation.md`.

**Golden Rule**: Address the root cause identified in the investigation. Don't apply band-aid fixes.

---

## Phase 1: LOAD INVESTIGATION

### 1.1 Read Investigation Report

```bash
cat $ARTIFACTS_DIR/investigation.md
```

Extract:
- Root cause analysis
- Files to modify (with line numbers)
- Fix plan
- Validation commands

### 1.2 Verify Investigation Matches Codebase

Read the files mentioned in the investigation and confirm the root cause still exists.

**If root cause already fixed**, note it and check if additional work is still needed.

---

## Phase 2: GIT CHECK

### 2.1 Ensure Clean State

```bash
git branch --show-current
git status --porcelain
git fetch origin
```

If working directory is dirty, commit or stash first.

---

## Phase 3: IMPLEMENT FIX

### 3.1 Execute Fix

For each file to modify:

1. **Read current file** — understand current state
2. **Apply the fix** — follow the investigation plan
3. **Run quick validation**:
   - Lint: `npm run lint`
   - Type check: `npx tsc --noEmit` (if applicable)

### 3.2 Fix Rules

**DO:**
- Address the root cause
- Add regression tests
- Match existing code style exactly
- Add JSDoc/types for new code
- Handle errors properly

**DON'T:**
- Refactor unrelated code
- Add "improvements" not related to the fix
- Change formatting of untouched lines
- Expose API keys or secrets

### 3.3 Node.js Guidelines

- Use consistent module patterns (CommonJS or ESM as project uses)
- Handle async errors properly
- Use environment variables for secrets

---

## Phase 4: VALIDATE

### 4.1 Run Full Validation Suite

```bash
npm run lint
npx tsc --noEmit 2>/dev/null || echo "No TS check"
npm test
```

### 4.2 Fix Any Failures

If any check fails:
1. Analyze the error
2. Fix the issue
3. Re-run until all green

---

## Phase 5: COMMIT

### 5.1 Stage and Commit

```bash
git add -A
git status
git commit -m "$(cat <<'EOF'
fix: {brief description of the fix}

{Root cause}

{What was changed to fix it}

Fixes #{issue_number}
Co-Authored-By: Codex GPT-5 <noreply@openai.com>
EOF
)"
```

---

## Phase 6: WRITE ARTIFACT

Write to `$ARTIFACTS_DIR/implementation.md`:

```markdown
# Fix Implementation Report

**Issue**: {title}
**Date**: {YYYY-MM-DD}

## Root Cause
{What was causing the problem}

## Fix Applied

| File | Action | Description |
|------|--------|-------------|
| `src/x.js` | UPDATE | {what changed} |

## Validation Results

| Check | Result |
|-------|--------|
| Lint | Pass/Fail |
| Type Check | Pass/Fail |
| Tests | {N passed, N failed} |

## Regression Test
{Description of test added to prevent recurrence}
```

---

## Success Criteria

- **ROOT_CAUSE_FIXED**: Investigation findings addressed
- **VALIDATION_GREEN**: All checks pass
- **COMMITTED**: Changes committed with proper message
- **ARTIFACT_WRITTEN**: Implementation report at `$ARTIFACTS_DIR/implementation.md`
