---
description: Architecture review for a completed Spec Kitty feature
argument-hint: <mission-slug> (e.g., 002-natural-language-task-mutations)
---

# Architecture Review: Spec Kitty Feature

**Input**: $ARGUMENTS

---

## Your Mission

Perform a rigorous architecture review of the recently implemented Spec Kitty feature. You are checking for YAGNI violations, DRY compliance, overengineering, and architectural drift.

This is a **behavioral support system** — architecture must serve the product vision, not become an end in itself.

---

## Phase 1: LOAD CONTEXT

### 1.1 Read Project Architecture

```bash
cat AGENTS.md
```

Key architecture principles:
- **YAGNI**: Build only what is needed today. No auth, billing, rate limiting, or multi-tenant isolation yet
- **DRY**: Extract shared utilities when duplication is clearly harmful (>50 lines or >3 call sites)
- **Simplicity First**: Prefer JSON files over databases, direct API calls over framework wrappers
- **Single Responsibility**: Telegram interaction in `bot/`, integrations in `services/`

### 1.2 Read Feature Spec

Find and read the mission spec:
```bash
cat kitty-specs/{mission-slug}/spec.md
cat kitty-specs/{mission-slug}/plan.md
```

### 1.3 Identify What Changed

```bash
git diff --stat HEAD~5..HEAD -- '*.js' '*.mjs' 2>/dev/null || echo "Checking all recent changes"
```

---

## Phase 2: REVIEW — YAGNI Compliance

### 2.1 Check for Speculative Features

For each new file or major module:
1. Does it implement an accepted spec requirement?
2. Is it referenced by live entry points (bot commands, pipeline)?
3. Would removing it break any user-facing behavior?

**Red flags:**
- Utility modules with no callers
- Abstraction layers with single implementation
- "Future-proof" interfaces not needed today
- Auth, billing, rate limiting code (MVP-forbidden)

### 2.2 Check for Placeholder Code

- TODO comments for future features not in accepted specs
- Empty functions/classes "for later"
- Configuration for features not being built

**Verdict**: If found, note as blocker unless placeholder serves current documented spec need.

---

## Phase 3: REVIEW — DRY Compliance

### 3.1 Identify Duplication

Look for:
- Copy-pasted logic (>50 lines similar)
- Repeated patterns across 3+ call sites
- Similar error handling, validation, or formatting

**Acceptable:**
- 2-line patterns unlikely to change
- Framework boilerplate (imports, exports)

**Unacceptable:**
- Business logic duplicated across files
- Same validation in multiple places without extraction
- Identical error formatting in 3+ handlers

### 3.2 Check Helper Extraction

If duplication exists:
- Was a helper extracted? If not, why?
- Is the helper >50 lines or called from >3 places?
- Would extraction improve readability without adding indirection?

---

## Phase 4: REVIEW — Overengineering Check

### 4.1 Complexity Audit

For each new module:
1. Can you explain its purpose in one sentence?
2. Does it have a single clear responsibility?
3. Would a junior developer understand it in 5 minutes?

**Red flags:**
- Abstract base classes with one subclass
- Factory patterns with one product
- Event emitters for synchronous flow control
- Strategy pattern with one strategy
- Generic utilities nobody uses yet

### 4.2 Simplicity Assessment

Rate the implementation:
- **Simple**: Does one thing, obvious how it works, minimal code
- **Reasonable**: Clear purpose, some indirection but justified
- **Complex**: Multiple abstraction layers, hard to trace flow
- **Overengineered**: Design patterns stacked, future-proofing evident

---

## Phase 5: REVIEW — Architecture Consistency

### 5.1 File Organization

Verify:
- New services are in `services/`
- Bot behavior is in `bot/`
- No new top-level directories without justification
- Test files match source file locations

### 5.2 Import Patterns

Check:
- ESM imports only (no require())
- No circular dependencies
- Relative imports within module boundaries

### 5.3 Module Boundaries

Ensure:
- Services don't import from bot/
- Tests don't import unexported internals
- No direct TickTick client calls from bot handlers

---

## Phase 6: WRITE REVIEW REPORT

Write to `$ARTIFACTS_DIR/review-architecture-{mission-slug}.md`:

```markdown
# Architecture Review: {mission-slug}

**Date**: {YYYY-MM-DD}
**Reviewer**: Architecture Agent

## Summary
{2-3 sentence overview of architecture quality}

## YAGNI Compliance
| Item | Status | Notes |
|------|--------|-------|
| {module/file} | ✅/⚠️/❌ | {explanation} |

## DRY Compliance
| Duplication Found | Location | Severity | Recommendation |
|------------------|----------|----------|----------------|
| {description} | {files} | Low/Med/High | {action} |

## Complexity Assessment
| Module | Rating | Notes |
|--------|--------|-------|
| {module} | Simple/Reasonable/Complex/Overengineered | {why} |

## Architecture Consistency
| Check | Pass/Fail | Details |
|-------|-----------|---------|
| File organization | | |
| Import patterns | | |
| Module boundaries | | |

## Blockers
{List any architecture issues that MUST be fixed before proceeding}

## Recommendations
{Non-blocking suggestions for future improvement}
```

---

## Success Criteria

- **CONTEXT_LOADED**: AGENTS.md and mission spec read
- **YAGNI_CHECKED**: No speculative features found
- **DRY_CHECKED**: Duplication identified and addressed
- **COMPLEXITY_AUDITED**: Overengineering flagged if present
- **ARCHITECTURE_CONSISTENT**: File organization and imports match conventions
- **REPORT_WRITTEN**: Review saved to artifacts directory
