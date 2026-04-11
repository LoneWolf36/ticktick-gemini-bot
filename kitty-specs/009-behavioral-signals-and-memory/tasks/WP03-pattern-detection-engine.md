---
work_package_id: WP03
title: Pattern Detection Engine
dependencies:
- WP01
- WP02
requirement_refs:
- FR-007
- FR-008
- FR-009
- FR-010
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T014
- T015
- T016
- T017
- T018
- T019
- T020
- T021
- T022
phase: Phase 3 - Confidence-Gated Pattern Detection
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMZK4VQERH6AB2FE18C
owned_files:
- services/behavioral-patterns.js
- tests/regression.test.js
wp_code: WP03
---

# Work Package Prompt: WP03 - Pattern Detection Engine

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

Detect repeated behavior patterns only when evidence is strong enough to support useful reflection.

**Independent test**: Synthetic datasets prove each pattern fires at threshold, stays silent below threshold, and labels weak inference as internal-only.

Success looks like:
- Patterns are evidence-backed.
- Weak inference is not user-facing.
- Pattern output uses confidence and evidence counts.

## Context and Constraints

- Mission: `009-behavioral-signals-and-memory`
- Canonical spec: `kitty-specs/009-behavioral-signals-and-memory/spec.md`
- Canonical plan: `kitty-specs/009-behavioral-signals-and-memory/plan.md`
- Canonical task list: `kitty-specs/009-behavioral-signals-and-memory/tasks.md`
- Implementation command: `spec-kitty implement WP03 --mission 009-behavioral-signals-and-memory`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- services/behavioral-patterns.js
- tests/regression.test.js

## Subtasks and Detailed Guidance

### Subtask T014 - Implement Snooze Spiral detector

**Purpose**: Detect repeated postponement.

**Required work**:
- Count 3+ postpone signals for different tasks in 30 days.
- Return confidence and evidence count.
- Avoid raw task titles.

**Acceptance checks**:
- Threshold dataset fires.
- Below threshold does not.
- Evidence excludes raw text.

### Subtask T015 - Implement Commitment Overloader detector

**Purpose**: Detect creation without completion.

**Required work**:
- Compare created count to completed count per day.
- Use conservative threshold like 15+ created and low completion.
- Return ratio metadata.

**Acceptance checks**:
- Synthetic overload fires.
- Normal busy day does not.
- Output includes ratio only.

### Subtask T016 - Implement Stale Task Museum detector

**Purpose**: Detect old untouched task inventory.

**Required work**:
- Use task age and no-event metadata.
- Count stale tasks over 30 days.
- Avoid naming tasks.

**Acceptance checks**:
- Stale count fires at threshold.
- Recently touched tasks excluded.
- No titles stored.

### Subtask T017 - Implement Quick Win Addiction detector

**Purpose**: Detect small-task avoidance patterns.

**Required work**:
- Compare small completions to planned meaningful work where metadata exists.
- Treat missing estimate as unknown, not small.
- Return weak inference when evidence is limited.

**Acceptance checks**:
- Strong synthetic pattern fires.
- Insufficient metadata is weak or silent.
- No false precision.

### Subtask T018 - Implement Vague Task Writer detector

**Purpose**: Detect vague task creation.

**Required work**:
- Use title-shape metadata or token counts, not raw title text.
- Threshold at repeated vague creates.
- Return category/evidence counts only.

**Acceptance checks**:
- Vague pattern fires at threshold.
- One-off vague task is weak or silent.
- No raw titles.

### Subtask T019 - Implement Deadline Daredevil detector

**Purpose**: Detect last-minute completion trend.

**Required work**:
- Compare completion timing to due dates.
- Use 14-day window.
- Require repeated evidence.

**Acceptance checks**:
- Repeated late completions fire.
- Mixed behavior does not overstate.
- Confidence is explicit.

### Subtask T020 - Implement Category Avoidance detector

**Purpose**: Detect avoided categories without shaming.

**Required work**:
- Compare postpone to completion ratio by category.
- Require 3x relative pattern.
- Output category identifier only if non-sensitive.

**Acceptance checks**:
- Synthetic category avoidance fires.
- Small sample is weak or silent.
- Sensitive category handling respects privacy tier.

### Subtask T021 - Implement confidence model

**Purpose**: Gate user-facing insight.

**Required work**:
- Return `pattern`, `confidence`, `evidence_count`, `isHighConfidence`, `isWeakInference`.
- Define standard/high thresholds.
- Mark 1-2 signal inferences internal-only.

**Acceptance checks**:
- Confidence is deterministic.
- Weak inference is not user-facing.
- Tests cover threshold edges.

### Subtask T022 - Add pattern tests

**Purpose**: Prevent false positives.

**Required work**:
- Create synthetic datasets for each detector.
- Test fire, no-fire, and borderline cases.
- Assert privacy-safe output.

**Acceptance checks**:
- Every detector has threshold tests.
- No raw text appears in output.
- Regression suite passes.

## Risks and Mitigations

- Risk: false pattern claims damage trust. Mitigation: strict thresholds and omitted weak output.
- Risk: pattern names feel judgmental. Mitigation: user-facing formatter owns neutral language.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
