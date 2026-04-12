---
description: Security review for a completed Spec Kitty feature
argument-hint: <mission-slug>
---

# Security Review: Spec Kitty Feature

**Input**: $ARGUMENTS

---

## Your Mission

Perform a security review of the recently implemented Spec Kitty feature. Check for secrets exposure, input validation, authentication patterns, and OWASP Top 10 risks relevant to a Node.js Telegram bot.

---

## Phase 1: SECRETS AUDIT

### 1.1 Check for Exposed Credentials

```bash
git diff HEAD~10..HEAD -- '*.js' '*.mjs' '*.json' '*.yaml' '*.yml' '.env*' 2>/dev/null | grep -iE '(key|secret|token|password|api_)' | head -20
```

**Must pass:**
- No hardcoded API keys, tokens, or secrets
- No credentials in commit messages
- Environment variables used for all secrets

### 1.2 Environment Variable Usage

Check that secrets are accessed via `process.env`:
- TickTick API credentials
- Telegram bot token
- Redis connection strings (if applicable)
- Any third-party API keys

---

## Phase 2: INPUT VALIDATION

### 2.1 User Input Handling

For all Telegram message handlers and command inputs:
1. Is user input sanitized before use?
2. Are there injection risks (command injection, SQL if using DB)?
3. Is input length bounded?

### 2.2 Task Data Validation

When processing task titles, descriptions, dates:
- Are they validated before passing to TickTick API?
- Can user input cause malformed API requests?
- Are error responses handled gracefully?

---

## Phase 3: AUTHORIZATION CHECKS

### 3.1 User Identity Verification

- Does the bot verify the message sender is the authorized user?
- Are there any endpoints that could be abused by unauthorized users?
- Is chat ID validation enforced?

---

## Phase 4: ERROR HANDLING SECURITY

### 4.1 Information Leakage

Check error messages sent to users:
- Do they expose internal architecture?
- Do they leak stack traces or file paths?
- Are API errors handled with generic user-facing messages?

---

## Phase 5: WRITE SECURITY REPORT

Write to `$ARTIFACTS_DIR/review-security-{mission-slug}.md`:

```markdown
# Security Review: {mission-slug}

**Date**: {YYYY-MM-DD}
**Reviewer**: Security Agent

## Summary
{Overall security posture assessment}

## Findings

### Critical (Must Fix)
| Issue | Location | Risk | Fix |
|-------|----------|------|-----|
| {description} | {file:line} | {impact} | {remediation} |

### Warning (Should Fix)
| Issue | Location | Risk | Fix |
|-------|----------|------|-----|

### Informational (Nice to Fix)
| Issue | Location | Notes |
|-------|----------|-------|

## Checks Performed
- [ ] No secrets exposed in code or commits
- [ ] User input properly sanitized
- [ ] Authorization enforced on sensitive operations
- [ ] Error messages don't leak internal info
- [ ] API keys stored in environment variables only

## Blockers
{List critical security issues that must be fixed before proceeding}
```

---

## Success Criteria

- **SECRETS_CHECKED**: No credentials exposed in code or commits
- **INPUT_VALIDATED**: All user input sanitized and bounded
- **AUTH_ENFORCED**: User identity verified where needed
- **ERRORS_SAFE**: Error messages don't leak internal state
- **REPORT_WRITTEN**: Security review saved to artifacts
