---
description: Code quality review for a completed Spec Kitty feature
argument-hint: <mission-slug>
---

# Code Quality Review: Spec Kitty Feature

**Input**: $ARGUMENTS

---

## Your Mission

Review code quality, naming, structure, comments, and maintainability of the recently implemented feature against the project's coding standards.

---

## Phase 1: CODING STANDARDS

### 1.1 Check Style Compliance

```bash
npm run lint 2>&1 | tail -15
```

### 1.2 Naming Review

For all new identifiers:
- **Functions**: camelCase, verb-first (`resolveTask`, not `taskResolver`)
- **Classes**: PascalCase (`TaskResolver`, not `task_resolver`)
- **Constants**: UPPER_SNAKE_CASE (`EXACT_SCORE`, not `exactScore`)
- **Files**: kebab-case (`task-resolver.js`, not `taskResolver.js`)

### 1.3 Code Structure

Check:
- Functions are focused (<50 lines ideal, <100 max)
- Files have single responsibility
- No god objects or utility dumping grounds
- Early returns instead of deep nesting

---

## Phase 2: DOCUMENTATION

### 2.1 JSDoc Coverage

Exported functions should have:
- Brief description
- Parameter types and descriptions
- Return type
- Exceptions thrown

### 2.2 Inline Comments

Check comments explain **WHY**, not **WHAT**:
- ✅ `// Levenshtein distance handles transpositions that simple substring misses`
- ❌ `// Loop through array` (obvious from code)

---

## Phase 3: ERROR HANDLING

### 3.1 Error Patterns

Verify:
- Errors are caught at system boundaries
- Error messages are actionable
- No silent failures (errors swallowed without logging)
- Rejection reasons are machine-readable for pipeline use

---

## Phase 4: WRITE CODE QUALITY REVIEW

Write to `$ARTIFACTS_DIR/review-code-quality-{mission-slug}.md`:

```markdown
# Code Quality Review: {mission-slug}

**Date**: {YYYY-MM-DD}
**Reviewer**: Code Quality Agent

## Summary
{Overall code quality assessment}

## Standards Compliance
| Check | Pass/Fail | Details |
|-------|-----------|---------|
| Lint clean | | |
| Naming conventions | | |
| File organization | | |
| Indentation/formatting | | |

## Code Structure
| Module | Function Focus | Single Responsibility | Nesting Depth |
|--------|---------------|----------------------|---------------|
| {module} | Good/Med/Poor | Yes/No | 1/2/3+ levels |

## Documentation
| Element | JSDoc | Inline Comments (Why) | Clarity |
|---------|-------|----------------------|---------|
| {function} | Yes/No | Good/Poor | Clear/Unclear |

## Error Handling
| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Boundary errors caught | | |
| Messages actionable | | |
| No silent failures | | |
| Machine-readable reasons | | |

## Blockers
{Code quality issues that must be fixed before proceeding}
```

---

## Success Criteria

- **STANDARDS_MET**: Lint clean, naming correct, formatting consistent
- **STRUCTURE_GOOD**: Functions focused, files single-purpose, nesting shallow
- **DOCUMENTED**: JSDoc on exports, comments explain why
- **ERRORS_HANDLED**: Boundaries protected, messages useful, no silent failures
- **REPORT_WRITTEN**: Review saved to artifacts
