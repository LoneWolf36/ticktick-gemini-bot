---
work_package_id: WP05
title: Summary Surface Integration
dependencies:
- WP03
- WP04
requirement_refs:
- FR-008
- FR-009
- FR-010
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T028
- T029
- T030
- T031
- T032
- T033
phase: Phase 5 - Reflection Surfaces
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMZK4VQERH6AB2FE18C
owned_files:
- services/summary-surfaces/briefing-summary.js
- services/summary-surfaces/weekly-summary.js
- services/behavioral-insights.js
- tests/regression.test.js
wp_code: WP05
---

# Work Package Prompt: WP05 - Summary Surface Integration

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

Inject only confidence-backed behavioral insights into daily and weekly summaries using observational language that supports behavior change without judgment.

**Independent test**: Summary tests prove high-confidence patterns appear neutrally, weak patterns are omitted, and skip tier suppresses insights.

Success looks like:
- Insights are optional and omitted cleanly.
- Language is observational and brief.
- Daily output remains action-oriented.

## Context and Constraints

- Mission: `009-behavioral-signals-and-memory`
- Canonical spec: `kitty-specs/009-behavioral-signals-and-memory/spec.md`
- Canonical plan: `kitty-specs/009-behavioral-signals-and-memory/plan.md`
- Canonical task list: `kitty-specs/009-behavioral-signals-and-memory/tasks.md`
- Implementation command: `spec-kitty implement WP05 --mission 009-behavioral-signals-and-memory`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- services/summary-surfaces/briefing-summary.js
- services/summary-surfaces/weekly-summary.js
- services/behavioral-insights.js
- tests/regression.test.js

## Subtasks and Detailed Guidance

### Subtask T028 - Create behavioral insights module

**Purpose**: Prepare summary-safe insight objects.

**Required work**:
- Export `getInsightsForSummary(userId, summaryType)`.
- Pull patterns through privacy gate.
- Return small array of summary-safe insights.

**Acceptance checks**:
- Insights are confidence-filtered.
- No raw signal details exposed.
- No insights returns empty array.

### Subtask T029 - Filter by confidence

**Purpose**: Keep weak inference out of user-facing copy.

**Required work**:
- Include standard/high confidence only.
- Drop weak inference.
- Preserve logs for internal debugging if safe.

**Acceptance checks**:
- Weak patterns omitted.
- High-confidence patterns included.
- Tests cover thresholds.

### Subtask T030 - Format observational language

**Purpose**: Avoid shame or boss-like tone.

**Required work**:
- Use neutral phrasing such as `I noticed...`.
- Avoid labels like addiction in user copy.
- Keep insight under one or two short lines.

**Acceptance checks**:
- Copy is neutral.
- Copy is compact.
- No internal confidence scores shown.

### Subtask T031 - Integrate daily briefing

**Purpose**: Add insight only when it helps today.

**Required work**:
- Append or blend insight into daily summary only when present.
- Do not exceed the daily focus constraint.
- Omit section cleanly when empty.

**Acceptance checks**:
- Daily briefing stays short.
- No empty heading appears.
- At least one action remains clear.

### Subtask T032 - Integrate weekly digest

**Purpose**: Reflect patterns over time.

**Required work**:
- Add concise patterns section when evidence exists.
- Keep watchouts evidence-backed.
- Do not infer beyond stored signals.

**Acceptance checks**:
- Weekly patterns are grounded.
- Missing data notice is honest.
- No weak inference appears.

### Subtask T033 - Add summary tests

**Purpose**: Verify user-facing behavior.

**Required work**:
- Test pattern appears with neutral copy.
- Test low confidence omitted.
- Test skip tier suppresses insights.

**Acceptance checks**:
- All branches tested.
- Telegram copy remains safe.
- Regression suite passes.

## Risks and Mitigations

- Risk: summaries become long. Mitigation: cap insight count and omit low-confidence items.
- Risk: output feels judgmental. Mitigation: formatter uses neutral phrasing.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
