---
work_package_id: WP01
title: Signal Classifier Core
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
- T007
phase: Phase 1 - Signal Taxonomy and Capture
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMZK4VQERH6AB2FE18C
owned_files:
- services/behavioral-signals.js
- services/ticktick-adapter.js
- tests/regression.test.js
wp_code: WP01
---

# Work Package Prompt: WP01 - Signal Classifier Core

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

Define and implement the passive-default signal classifier that observes task events without changing user-facing behavior.

**Independent test**: Classifier tests prove each supported signal fires only from allowed metadata and never stores raw task titles or message text.

Success looks like:
- Signals are metadata-only.
- Classifier failures never block task writes.
- Taxonomy maps directly to procrastination and execution patterns from the product vision.

## Context and Constraints

- Mission: `009-behavioral-signals-and-memory`
- Canonical spec: `kitty-specs/009-behavioral-signals-and-memory/spec.md`
- Canonical plan: `kitty-specs/009-behavioral-signals-and-memory/plan.md`
- Canonical task list: `kitty-specs/009-behavioral-signals-and-memory/tasks.md`
- Implementation command: `spec-kitty implement WP01 --mission 009-behavioral-signals-and-memory`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- services/behavioral-signals.js
- services/ticktick-adapter.js
- tests/regression.test.js

## Subtasks and Detailed Guidance

### Subtask T001 - Define signal taxonomy

**Purpose**: Name only the signals required for behavior support.

**Required work**:
- Define postpone, scope_change, decomposition, planning_heavy, completion, creation, and deletion.
- Document trigger conditions and forbidden raw fields.
- Map each signal to a product-vision pattern.

**Acceptance checks**:
- Taxonomy is explicit.
- No raw title/message fields are allowed.
- Signals support procrastination or prioritization insight.

### Subtask T002 - Implement classifier entry point

**Purpose**: Provide one pure classification function.

**Required work**:
- Accept task mutation event metadata.
- Return zero or more signal objects.
- Avoid side effects inside classifier.

**Acceptance checks**:
- Classifier is pure.
- Unsupported events return empty list.
- Output shape is test-covered.

### Subtask T003 - Implement postpone detection

**Purpose**: Detect repeated delay without judging a single action.

**Required work**:
- Compare due date before/after.
- Emit category/project-level metadata only.
- Avoid raw title storage.

**Acceptance checks**:
- Forward due-date move emits postpone.
- No change emits nothing.
- Signal excludes raw task title.

### Subtask T004 - Implement scope change detection

**Purpose**: Notice planning churn and redefinition.

**Required work**:
- Detect material description or checklist size changes.
- Classify wording-only versus scope_change.
- Use lengths/counts rather than raw text.

**Acceptance checks**:
- Large changes emit signal.
- Small wording changes are separated.
- No raw description is stored.

### Subtask T005 - Implement decomposition detection

**Purpose**: Recognize task breakdown behavior.

**Required work**:
- Detect subtasks added or tasks split if event metadata supports it.
- Keep one-level signal semantics.
- Avoid interpreting decomposition as good or bad at signal time.

**Acceptance checks**:
- Subtask creation emits decomposition.
- No behavioral judgment appears in signal.
- Edge cases are tested.

### Subtask T006 - Wire classifier non-blockingly

**Purpose**: Observe writes without risking task execution.

**Required work**:
- Call classifier from adapter mutation paths.
- Catch/log classifier failures.
- Never throw classifier failure to user.

**Acceptance checks**:
- Task mutation succeeds even if classifier fails.
- Failure is logged.
- No extra user message appears.

### Subtask T007 - Add classifier tests

**Purpose**: Lock privacy and trigger behavior.

**Required work**:
- Test match, non-match, and edge cases for each rule.
- Assert no raw titles/messages in output.
- Mock adapter event inputs.

**Acceptance checks**:
- Every rule is covered.
- Privacy boundary is asserted.
- Regression suite passes.

## Risks and Mitigations

- Risk: overcollection. Mitigation: signal objects use enumerated categories and counts only.
- Risk: classifier blocks mutations. Mitigation: catch and log failures.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
