---
description: Create an implementation plan for a feature
argument-hint: <feature-description|issue-number>
---

# Plan Feature

**Input**: $ARGUMENTS

---

## Your Mission

Explore the codebase and create a detailed implementation plan for the requested feature.

This is a **TickTick + Gemini bot project** with:
- **Server**: `server.js`, `src/`, `services/`
- **Bot logic**: `bot/`
- **Tests**: `tests/`
- **Contracts**: `contracts/`

---

## Phase 1: EXPLORE

### 1.1 Understand the Request

Parse $ARGUMENTS to determine what feature is being requested. If it references a GitHub issue number, fetch it:

```bash
gh issue view {number} --json title,body,labels,comments
```

### 1.2 Map the Codebase

Explore relevant parts of the codebase:

```bash
# Project structure
find . -type f -name "*.js" -o -name "*.ts" -o -name "*.json" | grep -v node_modules | head -40

# Key directories
ls -la src/ 2>/dev/null || echo "No src dir"
ls -la bot/ 2>/dev/null || echo "No bot dir"
ls -la services/ 2>/dev/null || echo "No services dir"
ls -la tests/ 2>/dev/null || echo "No tests dir"
```

Read key files to understand the current architecture:
- `AGENTS.md` — project conventions
- `GEMINI.md` — Gemini-specific configuration
- `package.json` — dependencies and scripts
- `server.js` — main server entry point

### 1.3 Identify Touch Points

Determine which components need to change:
- **New bot commands?** → `bot/` directory
- **New API endpoints?** → `src/` routes
- **New services?** → `services/` directory
- **Contract changes?** → `contracts/` directory
- **Tests?** → `tests/` directory

---

## Phase 2: PLAN

### 2.1 Write Implementation Plan

Write to `$ARTIFACTS_DIR/plan.md` with this structure:

```markdown
# Implementation Plan: {Feature Title}

**Issue**: #{number} (if applicable)
**Date**: {YYYY-MM-DD}

## Overview
{2-3 sentence description of what we're building and why}

## Architecture
{Brief description of how this fits into the existing system}

## Tasks

### Task 1: {Title}
- **Files**: `src/...`, `tests/...`
- **Description**: {What to do}
- **Details**: {Specific implementation notes}

### Task 2: {Title}
...

## Validation Commands

Run these after implementation to verify:

```bash
# Lint
npm run lint

# Type check (if applicable)
npx tsc --noEmit

# Tests
npm test
```

## Risks & Considerations
- {Any risks, backward compatibility, API rate limits}
```

---

## Phase 3: OUTPUT

Print a summary of the plan to the user:

```markdown
## Plan Created

**Feature**: {title}
**Tasks**: {N} tasks identified

| # | Task | Files |
|---|------|-------|
| 1 | ... | `src/...` |
| 2 | ... | `bot/...` |

### Next Step
Proceed to implementation or continue the workflow.
```

---

## Success Criteria

- **PLAN_WRITTEN**: Detailed plan at `$ARTIFACTS_DIR/plan.md`
- **TASKS_DEFINED**: Each task has target files and description
- **VALIDATION_DEFINED**: Commands listed for post-implementation verification
