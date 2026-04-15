---
description: Product Vision alignment review for a completed Spec Kitty feature
argument-hint: <mission-slug>
---

# Product Vision Alignment Review: Spec Kitty Feature

**Input**: $ARGUMENTS

---

## Your Mission

Review whether the implemented feature aligns with the Product Vision: this is a **behavioral support system**, not a passive task manager. It must help the user execute what matters, reduce procrastination, and gently rewire unhelpful patterns.

---

## Phase 1: LOAD PRODUCT VISION

### 1.1 Read Product Vision

```bash
cat "Product Vision and Behavioural Scope.md"
```

Key principles:
- **Core problem**: User creates tasks but doesn't execute them, focuses on busywork
- **System should help**: Stop mistaking motion for progress, stop over-planning as avoidance, keep returning to what matters
- **Should feel like**: Trusted assistant, coach willing to be assertive, knows when to challenge
- **Should NOT feel like**: Passive list manager, generic reminder app, blindly accepts first input

---

## Phase 2: BEHAVIORAL ALIGNMENT CHECK

### 2.1 Execution Focus

Does the feature:
- ✅ Help the user **execute** important work?
- ✅ Reduce friction between intention and action?
- ✅ Keep attention on meaningful tasks?

Or does it:
- ❌ Encourage more task creation/grooming?
- ❌ Reward organizing without executing?
- ❌ Add complexity to the task system itself?

### 2.2 Trust and Honesty

Check for:
- Does the system fail closed when uncertain?
- Are inferences labeled as weak vs. confident?
- Does it ask clarifying questions instead of guessing?
- Would the user trust this behavior?

### 2.3 Cognitive Load

Assess:
- Are confirmations terse and action-oriented?
- Is the system an execution aid or another inbox?
- Does it reduce or increase decision fatigue?

---

## Phase 3: ANTI-PATTERN DETECTION

### 3.1 Busywork Enablement

Red flags:
- Features that help reorganize without executing
- Cosmetic task cleanup encouragement
- Motion presented as progress

### 3.2 Passive Manager Behavior

Red flags:
- Accepting all user input without question
- No challenge to low-priority focus
- Generic reminder behavior

### 3.3 Over-Planning Support

Red flags:
- Making it easier to plan than to do
- Encouraging task decomposition for its own sake
- Planning tools without execution linkage

---

## Phase 4: WRITE PRODUCT VISION REVIEW

Write to `$ARTIFACTS_DIR/review-product-vision-{mission-slug}.md`:

```markdown
# Product Vision Alignment Review: {mission-slug}

**Date**: {YYYY-MM-DD}
**Reviewer**: Product Vision Agent

## Summary
{Does this feature serve the Product Vision?}

## Execution Focus
| Question | Assessment | Evidence |
|----------|-----------|----------|
| Helps execute vs. organize? | ✅/⚠️/❌ | {why} |
| Reduces friction to action? | ✅/⚠️/❌ | {why} |
| Keeps focus on what matters? | ✅/⚠️/❌ | {why} |

## Trust and Honesty
| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Fails closed on uncertainty | | |
| Labels weak inferences | | |
| Asks vs. guesses | | |

## Cognitive Load
| Aspect | Assessment | Notes |
|--------|-----------|-------|
| Confirmations terse | ✅/⚠️/❌ | |
| Reduces decision fatigue | ✅/⚠️/❌ | |
| Execution aid, not inbox | ✅/⚠️/❌ | |

## Anti-Patterns
| Pattern | Present? | Evidence |
|---------|----------|----------|
| Busywork enablement | Yes/No | {where} |
| Passive management | Yes/No | {where} |
| Over-planning support | Yes/No | {where} |

## Blockers
{Product Vision violations that must be fixed}
```

---

## Success Criteria

- **VISION_LOADED**: Product Vision understood and applied
- **EXECUTION_FOCUSED**: Feature helps execute, not just organize
- **TRUST_BUILT**: System honest about uncertainty
- **COGNITIVE_LOAD_LOW**: System aids execution without adding complexity
- **NO_ANTIPATTERNS**: No busywork, passive management, or over-planning
- **REPORT_WRITTEN**: Review saved to artifacts
