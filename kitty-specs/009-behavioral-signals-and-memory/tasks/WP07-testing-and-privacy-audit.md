---
work_package_id: WP07
title: Testing and Privacy Audit
dependencies:
- WP01
- WP02
- WP03
- WP04
- WP05
- WP06
requirement_refs:
- FR-004
- FR-008
- FR-009
- FR-010
- FR-011
- FR-012
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T039
- T040
- T041
- T042
- T043
- T044
- T045
phase: Phase 7 - End-to-End Verification
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMZK4VQERH6AB2FE18C
owned_files:
- tests/regression.test.js
- tests/run-regression-tests.mjs
- kitty-specs/009-behavioral-signals-and-memory/PRIVACY.md
wp_code: WP07
---

# Work Package Prompt: WP07 - Testing and Privacy Audit

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

Prove the full behavioral-memory loop is useful, non-blocking, retention-bounded, and privacy-safe before any user-facing claim is shipped.

**Independent test**: End-to-end regression and audit checks verify signal capture, pattern detection, summary integration, reset, retention, and privacy boundaries.

Success looks like:
- End-to-end tests cover success and failure.
- Privacy boundary is documented for future review.
- No completion claim is made without regression output.

## Context and Constraints

- Mission: `009-behavioral-signals-and-memory`
- Canonical spec: `kitty-specs/009-behavioral-signals-and-memory/spec.md`
- Canonical plan: `kitty-specs/009-behavioral-signals-and-memory/plan.md`
- Canonical task list: `kitty-specs/009-behavioral-signals-and-memory/tasks.md`
- Implementation command: `spec-kitty implement WP07 --mission 009-behavioral-signals-and-memory`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- tests/regression.test.js
- tests/run-regression-tests.mjs
- kitty-specs/009-behavioral-signals-and-memory/PRIVACY.md

## Subtasks and Detailed Guidance

### Subtask T039 - Add full signal-flow regression

**Purpose**: Verify behavior loop end to end.

**Required work**:
- Simulate task mutations.
- Verify signals are stored.
- Verify patterns and summary insight appear.

**Acceptance checks**:
- Full flow passes with mocks.
- No live API required.
- Insight is grounded in signals.

### Subtask T040 - Add non-blocking failure regression

**Purpose**: Protect task execution from memory failures.

**Required work**:
- Simulate Redis failure during mutation.
- Verify mutation still succeeds.
- Verify failure is logged compactly.

**Acceptance checks**:
- Task write path is not blocked.
- No user-facing memory error appears.
- Failure is observable.

### Subtask T041 - Add retention regression

**Purpose**: Prove stale data is ignored.

**Required work**:
- Seed 31-day-old signals.
- Run pattern detection.
- Verify old signals are excluded.

**Acceptance checks**:
- Expired signals do not influence patterns.
- Boundary date is deterministic.
- Test uses fixed time.

### Subtask T042 - Add weak-inference omission regression

**Purpose**: Protect trust.

**Required work**:
- Seed only weak evidence.
- Generate summary.
- Verify no behavioral insight appears.

**Acceptance checks**:
- Weak inference omitted.
- No empty section appears.
- Internal result still marks weak if inspected.

### Subtask T043 - Audit storage writes

**Purpose**: Verify privacy boundary in code.

**Required work**:
- Scan all behavioral write paths.
- Confirm serialized payload fields.
- Reject raw title/message/description storage.

**Acceptance checks**:
- Audit finds no raw private text writes.
- Allowed metadata fields are enumerated.
- Exceptions require explicit note.

### Subtask T044 - Document privacy boundary

**Purpose**: Make future changes reviewable.

**Required work**:
- Create `PRIVACY.md` in spec directory.
- Document stored data, never-stored data, retention, controls, and verification commands.
- Keep it tied to product vision.

**Acceptance checks**:
- Privacy doc exists.
- Doc is concrete and testable.
- Future reviewers have a checklist.

### Subtask T045 - Run full regression suite

**Purpose**: Verify readiness.

**Required work**:
- Run `node tests/run-regression-tests.mjs`.
- Run `node --test tests/regression.test.js` if supported.
- Summarize output.

**Acceptance checks**:
- Tests pass or failures are explained.
- No live APIs are called.
- Final report includes verification.

## Risks and Mitigations

- Risk: audit becomes checkbox-only. Mitigation: explicitly scan write calls and serialized signal shapes.
- Risk: retention logic has time flakiness. Mitigation: inject fixed clock in tests.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
