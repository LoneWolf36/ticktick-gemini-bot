---
description: Review PR changes against project standards
argument-hint: (reads PR info from artifacts)
---

# Review

**Input**: $ARGUMENTS

---

## Your Mission

Review the pull request changes against project standards and best practices.

This is a **Node.js** TickTick + Gemini bot project.

---

## Phase 1: GATHER CONTEXT

### 1.1 Read PR Diff

```bash
gh pr diff
```

### 1.2 Read Implementation Artifacts

```bash
cat $ARTIFACTS_DIR/implementation.md 2>/dev/null || echo "No implementation artifact"
cat $ARTIFACTS_DIR/plan.md 2>/dev/null || echo "No plan artifact"
cat $ARTIFACTS_DIR/validation.md 2>/dev/null || echo "No validation report"
```

### 1.3 Read Project Conventions

```bash
cat AGENTS.md 2>/dev/null || echo "No AGENTS.md"
cat GEMINI.md 2>/dev/null || echo "No GEMINI.md"
```

---

## Phase 2: REVIEW CHECKLIST

### 2.1 Code Quality

- [ ] **Linting**: Code passes `npm run lint`
- [ ] **Consistency**: Matches existing code style
- [ ] **Error Handling**: Proper try/catch and error responses
- [ ] **No Secrets**: No hardcoded API keys, tokens, or credentials

### 2.2 Architecture

- [ ] **Modularity**: Code is well-organized and modular
- [ ] **Bot Commands**: New commands follow existing patterns in `bot/`
- [ ] **Services**: New services follow existing patterns in `services/`
- [ ] **API Usage**: Gemini API calls handle rate limits and errors

### 2.3 Testing

- [ ] **Test Coverage**: New functionality has test coverage
- [ ] **Edge Cases**: Error paths and edge cases handled

### 2.4 General

- [ ] **Commit Messages**: Include Co-Authored-By line
- [ ] **Code Style**: Matches existing codebase style
- [ ] **No Refactoring**: Only changed what's necessary
- [ ] **Documentation**: Comments/docs for complex logic

---

## Phase 3: WRITE REVIEW

Write findings to `$ARTIFACTS_DIR/review.md`:

```markdown
# Code Review Report

**Date**: {YYYY-MM-DD}

## Findings

### CRITICAL (must fix)
- {issue description with file:line}

### HIGH (should fix)
- {issue description}

### MEDIUM (consider fixing)
- {issue description}

### LOW (nice to have)
- {issue description}

## Positive Notes
- {what's done well}

## Overall Assessment
{PASS | NEEDS_CHANGES | BLOCKED}

{Summary of review}
```

---

## Success Criteria

- **REVIEW_COMPLETE**: All checklist items checked
- **ARTIFACT_WRITTEN**: Review saved to `$ARTIFACTS_DIR/review.md`
- **FINDINGS_CATEGORIZED**: Issues ranked by severity
