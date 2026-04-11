---
description: Implement feature tasks from plan artifact — code changes, validation, commit
argument-hint: (reads plan from $ARTIFACTS_DIR/plan.md)
---

# Implement Feature

**Input**: $ARGUMENTS

---

## Your Mission

Execute the implementation plan from `$ARTIFACTS_DIR/plan.md`.

**Golden Rule**: Follow the plan. If something seems wrong, validate first — don't silently deviate.

---

## Phase 1: LOAD

### 1.1 Load Plan

```bash
cat $ARTIFACTS_DIR/plan.md
```

Extract:
- List of tasks with target files
- Validation commands
- Any architecture notes

### 1.2 Verify Plan Matches Codebase

For each file mentioned in the plan, read the current version and confirm the plan's assumptions are still valid.

**If significant drift detected**, note it in the implementation report.

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

## Phase 3: IMPLEMENT

### 3.1 Execute Each Task

For each task in the plan:

1. **Read target files** — understand current state
2. **Implement the change** — follow the plan exactly
3. **Run quick validation** after each task:
   - Lint: `npm run lint`
   - Type check: `npx tsc --noEmit` (if applicable)

### 3.2 Implementation Rules

**DO:**
- Follow plan steps in order
- Match existing code style exactly
- Add JSDoc/types for new code
- Write tests for new functionality
- Handle errors gracefully

**DON'T:**
- Refactor unrelated code
- Add "improvements" not in the plan
- Change formatting of untouched lines
- Expose API keys or secrets in code

### 3.3 Node.js/JavaScript Guidelines

- Use consistent module patterns (CommonJS or ESM as project uses)
- Add JSDoc comments for exported functions
- Handle async errors properly
- Use environment variables for secrets, never hardcode

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
feat: {brief feature description}

{Summary of what was implemented}

Tasks completed:
- {Task 1}
- {Task 2}

Co-Authored-By: Codex GPT-5 <noreply@openai.com>
EOF
)"
```

---

## Phase 6: WRITE ARTIFACT

Write to `$ARTIFACTS_DIR/implementation.md`:

```markdown
# Implementation Report

**Feature**: {title}
**Date**: {YYYY-MM-DD}

## Tasks Completed

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | {task} | `src/...` | Done |

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/x.js` | CREATE/UPDATE | {what changed} |

## Validation Results

| Check | Result |
|-------|--------|
| Lint | Pass/Fail |
| Type Check | Pass/Fail |
| Tests | {N passed, N failed} |

## Deviations from Plan
{If none: "Implementation matched the plan exactly."}
{If any: describe what changed and why}
```

---

## Success Criteria

- **ALL_TASKS_DONE**: Every plan task implemented
- **VALIDATION_GREEN**: All checks pass
- **COMMITTED**: Changes committed with proper message
- **ARTIFACT_WRITTEN**: Implementation report at `$ARTIFACTS_DIR/implementation.md`
