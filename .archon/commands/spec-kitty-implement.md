---
description: Implement a single Spec Kitty work package from its markdown prompt
argument-hint: <mission-slug> <WP-id> (e.g., 002-natural-language-task-mutations WP02)
---

# Implement Spec Kitty WP

**Input**: $ARGUMENTS

---

## Your Mission

Implement a single Spec Kitty work package with strict adherence to the project's Product Vision, architecture principles, and quality standards.

This is the **TickTick + Gemini behavioral support system** — not a task manager. It helps the user execute what matters, reduce procrastination, and gently rewire unhelpful patterns.

---

## Phase 1: LOAD WP SPEC

### 1.1 Parse Arguments

Extract mission slug and WP ID from $ARGUMENTS:
- Format: `<mission-slug> <WP##>`
- Example: `002-natural-language-task-mutations WP02`

### 1.2 Locate and Read WP Spec

Find the WP markdown file:
```bash
find kitty-specs -name "WP*${WP_ID}*" -type f 2>/dev/null
```

Read the full WP spec. Identify:
- Subtasks (T0XX, T0XY, etc.)
- Files to touch
- Product Vision Alignment Gate requirements
- Implement-Review No-Drift Contract
- Definition of Done
- Guardrails and rejection triggers

### 1.3 Read Project Context

```bash
cat AGENTS.md
```

Key conventions:
- ESM only (import/export)
- 4-space indentation, semicolons
- camelCase variables, PascalCase classes
- Single-purpose files
- Named exports for helpers
- YAGNI: Build only what's needed today
- DRY: Extract shared utilities when duplication is harmful (>50 lines or >3 call sites)
- Simplicity First: Prefer JSON files over databases, direct API calls over wrappers

---

## Phase 2: EXPLORE CODEBASE

### 2.1 Understand Current State

For each file the WP spec says to touch:
1. Read the current file
2. Understand its role in the architecture
3. Identify existing patterns and conventions
4. Note any dependencies or imports needed

### 2.2 Verify Dependencies

Check that any WPs this one depends on are actually complete:
- Read `kitty-specs/{mission}/status.events.jsonl`
- Verify dependency WPs are in "done" lane

---

## Phase 3: IMPLEMENT

### 3.1 Implement Each Subtask

For each subtask in the WP spec:

**DO:**
- Implement ONLY what the subtask specifies
- Follow existing code patterns exactly
- Match the project's coding standards from AGENTS.md
- Write or update tests as required
- Keep changes minimal and focused
- Add JSDoc comments for exported functions
- Handle errors gracefully

**DON'T:**
- Refactor unrelated code
- Add improvements not in the subtask
- Change formatting of lines you didn't modify
- Install new dependencies without justification
- Touch files unrelated to this WP
- Over-engineer — do the simplest thing that satisfies the criteria
- Add SaaS scope, auth, billing, multi-tenant isolation, generic reminder behavior

### 3.2 Product Vision Compliance

During implementation, verify:
- The change supports the behavioral support system (not passive task management)
- The system fails closed when target identity is uncertain
- Mutation confirmations are terse
- The system doesn't reward busywork or motion-as-progress
- Ambiguity and low confidence are handled honestly

### 3.3 After Each File Change

Verify the change compiles/works:
```bash
# Quick syntax check
node -c services/new-file.js 2>/dev/null || echo "Syntax check skipped (not applicable)"
```

---

## Phase 4: VALIDATE

### 4.1 Run Focused Tests

Test the specific files you changed:
```bash
# Run tests for changed modules
node --test tests/related-test-file.test.js 2>/dev/null || echo "No specific tests yet"
```

### 4.2 Fix Test Failures

If tests fail:
1. Read the failure output
2. Determine: bug in your implementation or pre-existing failure?
3. If your bug → fix the implementation (not the test)
4. If pre-existing → note it but don't fix unrelated tests
5. Re-run tests
6. Repeat until green

### 4.3 Commit Changes

```bash
git add -A
git diff --cached --stat
git commit -m "feat({mission}): implement WP{NN} - {wp title}

{Brief description of what was implemented}

Subtasks completed:
- T0XX: {description}
- T0XY: {description}

Files changed:
- {file1} — {what changed}
- {file2} — {what changed}

Co-Authored-By: Codex GPT-5 <noreply@openai.com>"
```

---

## Phase 5: UPDATE WP STATUS

Append to the mission's status.events.jsonl:
```bash
# This will be handled by the workflow's status update mechanism
echo "WP ${WP_ID} implementation complete for mission ${MISSION_SLUG}"
```

---

## Success Criteria

- **WP_SPEC_READ**: Full WP spec understood before any code changes
- **SUBTASKS_DONE**: Every subtask implemented
- **VALIDATION_GREEN**: Tests pass for changed code
- **COMMITTED**: Changes committed with conventional commit message including Co-Authored-By line
- **PRODUCT_VISION_ALIGNED**: Implementation supports behavioral support system goals
- **NO_DRIFT**: No architectural drift from accepted patterns
