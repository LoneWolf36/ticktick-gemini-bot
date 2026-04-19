---
description: Enforce Karpathy guardrails before and after implementation
argument-hint: <phase: pre-code | post-code>
---

<!-- ACTION ITEM (cavekit-validate 2026-04-19): this Archon command was flagged as unmapped tooling drift. Decide whether tooling commands belong in a dedicated kit or should be excluded from product drift checks. -->

# Karpathy Guardrail Check

**Phase**: $ARGUMENTS (default: pre-code)

---

## Pre-Code Check (before implementation)

Answer each question. If ANY answer is "no" or unclear, STOP and fix before proceeding.

### 1. Think Before Coding
- [ ] Have I stated my assumptions explicitly?
- [ ] If multiple interpretations exist, have I presented them?
- [ ] If a simpler approach exists, have I said so?
- [ ] Is anything unclear that I should ask about?

### 2. Simplicity First
- [ ] Am I building only what was asked?
- [ ] No abstractions for single-use code?
- [ ] No speculative "flexibility" or "configurability"?
- [ ] Could this be simpler? If 200 lines could be 50, rewrite.

### 3. Surgical Changes
- [ ] Does every planned change trace to a requirement or acceptance criterion?
- [ ] Am I matching existing style and conventions?
- [ ] Am I avoiding changes to adjacent code?

---

## Post-Code Check (after implementation)

Re-read the diff and answer:

### 4. Verify Your Work
- [ ] Did I change anything I wasn't asked to?
- [ ] Did I test beyond the happy path?
- [ ] Do success criteria from the requirement hold?
- [ ] Would a senior engineer say this is overcomplicated?

### Verdict

If all checks pass: **GUARDRAILS PASS** — proceed.
If any check fails: **GUARDRAILS FAIL** — list what needs fixing.
