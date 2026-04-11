---
work_package_id: WP04
title: Privacy Tier Manager
dependencies:
- WP01
requirement_refs:
- FR-004
- FR-011
- FR-012
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T023
- T024
- T025
- T026
- T027
phase: Phase 4 - User-Controlled Collection
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMZK4VQERH6AB2FE18C
owned_files:
- services/behavioral-privacy.js
- services/store.js
- tests/regression.test.js
wp_code: WP04
---

# Work Package Prompt: WP04 - Privacy Tier Manager

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature lets the assistant become a mirror over time. It may notice procrastination patterns, but it must be privacy-bounded, confidence-gated, and adaptive instead of intrusive or judgmental.

**Implementation must**:
- Store only behavioral metadata needed for patterns; avoid raw task titles, raw messages, or unnecessary personal text.
- Expose only standard- or high-confidence patterns; weak inferences stay internal or are omitted.
- Intervene gradually: silent signals first, direct call-outs only when repeated evidence justifies them, and strict commands only in urgent mode.

**Implementation must not**:
- The system stores more private data than needed for the behavior-change loop.
- Low-confidence patterns appear in summaries or coaching as fact.
- Repeated ignored guidance causes louder escalation instead of backing off or adapting.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission gives the assistant memory as a behavioral mirror, not as surveillance and not as raw conversation storage. It must learn derived patterns such as postponement, task switching, over-planning, busywork preference, and repeated avoidance. It must be inspectable, resettable, retention-bound, and confidence-gated.

### Required Implementer Evidence

The implementer must leave enough evidence for review to answer all of the following without guessing:

1. Which Product Vision clause or behavioral scope section does this WP serve?
2. Which FR, NFR, plan step, task entry, or acceptance criterion does the implementation satisfy?
3. What user-visible behavior changes because of this WP?
4. How does the change reduce procrastination, improve task clarity, improve prioritization, improve recovery/trust, or improve behavioral awareness?
5. What does the implementation deliberately avoid so it does not become a passive task manager, generic reminder app, over-planning assistant, busywork optimizer, or judgmental boss?
6. What automated tests, regression checks, manual transcripts, or static inspections prove the intended behavior?
7. Which later mission or WP depends on this behavior, and what drift would it create downstream if implemented incorrectly?

### Required Reviewer Checks

The reviewer must reject the WP unless all of the following are true:

- The behavior is traceable from Product Vision -> mission spec -> plan/tasks -> WP instructions -> implementation evidence.
- The change preserves the accepted architecture and does not bypass canonical paths defined by earlier missions.
- The user-facing result is concise, concrete, and action-oriented unless the spec explicitly requires reflection or clarification.
- Ambiguity, low confidence, and missing context are handled honestly rather than hidden behind confident output.
- The change does not add MVP-forbidden platform scope such as auth, billing, rate limiting, or multi-tenant isolation.
- Tests or equivalent evidence cover the behavioral contract, not just the happy-path technical operation.
- Any completed-WP edits preserve Spec Kitty frontmatter and event-sourced status history; changed behavior is documented rather than silently rewritten.

### Drift Rejection Triggers

Reject, reopen, or move work back to planned if this WP enables any of the following:

- The assistant helps the user organize more without helping them execute what matters.
- The assistant chooses or mutates tasks confidently when it should clarify, fail closed, or mark inference as weak.
- The assistant rewards low-value busywork, cosmetic cleanup, or motion-as-progress.
- The assistant becomes verbose, punitive, generic, or motivational in a way the Product Vision explicitly rejects.
- The implementation stores raw user/task content where only derived behavioral metadata is allowed.
- The change creates a second implementation path that future agents could use instead of the accepted pipeline.
- The reviewer cannot state why this WP is necessary for the final 001-009 product.

### Done-State And Future Rework Note

If this WP is already marked done, this contract does not rewrite Spec Kitty history. It governs future audits, reopened work, bug fixes, and final mission review. If any later change alters the behavior described here, the WP may be moved back to planned or reopened so the implement-review loop can re-establish product-vision fidelity.

## Objectives and Success Criteria

Give the user explicit control over behavioral memory collection while preserving a useful default for the personal assistant.

**Independent test**: Tier tests prove skip disables collection, default collects only non-sensitive metadata, and sensitive tier is opt-in.

Success looks like:
- Default is useful but privacy-bounded.
- Skip is absolute.
- Sensitive collection requires explicit opt-in.

## Context and Constraints

- Mission: `009-behavioral-signals-and-memory`
- Canonical spec: `kitty-specs/009-behavioral-signals-and-memory/spec.md`
- Canonical plan: `kitty-specs/009-behavioral-signals-and-memory/plan.md`
- Canonical task list: `kitty-specs/009-behavioral-signals-and-memory/tasks.md`
- Implementation command: `spec-kitty implement WP04 --mission 009-behavioral-signals-and-memory`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- services/behavioral-privacy.js
- services/store.js
- tests/regression.test.js

## Subtasks and Detailed Guidance

### Subtask T023 - Create privacy manager module

**Purpose**: Centralize tier decisions.

**Required work**:
- Export `getTier`, `setTier`, `shouldCollectSignal`, and `shouldCollectSensitiveSignal`.
- Use existing store conventions.
- Keep API small.

**Acceptance checks**:
- Module is isolated.
- No duplicate tier logic.
- Unit tests can mock store.

### Subtask T024 - Implement tier storage

**Purpose**: Persist user preference.

**Required work**:
- Store tier under scoped user key.
- Default to `default` when missing.
- Validate allowed tier values.

**Acceptance checks**:
- Missing tier returns default.
- Invalid tier is rejected.
- Key is user-scoped.

### Subtask T025 - Implement collection gate

**Purpose**: Prevent writes when disabled.

**Required work**:
- Return false for skip.
- Return true for default non-sensitive signals.
- Return true for sensitive only in sensitive tier.

**Acceptance checks**:
- Skip blocks all behavioral writes.
- Default blocks sensitive signals.
- Sensitive allows all specified signals.

### Subtask T026 - Integrate gate into classifier

**Purpose**: Make privacy the first branch.

**Required work**:
- Check tier before emitting or storing signals.
- Return empty array when collection is disabled.
- Log skip without private content if needed.

**Acceptance checks**:
- Skip tier produces no signals.
- Classifier remains non-blocking.
- No hidden behavioral write happens.

### Subtask T027 - Add tier tests

**Purpose**: Lock privacy behavior.

**Required work**:
- Test default, sensitive, and skip.
- Test invalid tier.
- Test integration with signal write path.

**Acceptance checks**:
- All tier cases pass.
- Skip has zero writes.
- Sensitive is opt-in only.

## Risks and Mitigations

- Risk: privacy controls become complex. Mitigation: only three tiers with simple semantics.
- Risk: skip still writes logs. Mitigation: tests assert no behavioral writes.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
