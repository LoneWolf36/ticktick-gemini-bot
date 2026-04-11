---
work_package_id: WP02
title: Redis Storage Layer
dependencies:
- WP01
requirement_refs:
- FR-004
- FR-005
- FR-006
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T008
- T009
- T010
- T011
- T012
- T013
phase: Phase 2 - Retention-Bounded Storage
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMZK4VQERH6AB2FE18C
owned_files:
- services/store.js
- services/behavioral-store.js
- tests/regression.test.js
wp_code: WP02
---

# Work Package Prompt: WP02 - Redis Storage Layer

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

Persist behavioral signals with a strict 30-day window and per-user key scope while keeping local JSON fallback behavior simple for the personal MVP.

**Independent test**: Storage tests prove writes use scoped keys, reads filter by window, and expired or skipped data is unavailable.

Success looks like:
- Signals expire after 30 days.
- Keys are scoped by user id.
- Storage failures do not block task execution.

## Context and Constraints

- Mission: `009-behavioral-signals-and-memory`
- Canonical spec: `kitty-specs/009-behavioral-signals-and-memory/spec.md`
- Canonical plan: `kitty-specs/009-behavioral-signals-and-memory/plan.md`
- Canonical task list: `kitty-specs/009-behavioral-signals-and-memory/tasks.md`
- Implementation command: `spec-kitty implement WP02 --mission 009-behavioral-signals-and-memory`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- services/store.js
- services/behavioral-store.js
- tests/regression.test.js

## Subtasks and Detailed Guidance

### Subtask T008 - Create behavioral store module

**Purpose**: Keep signal storage isolated.

**Required work**:
- Export `writeSignal`, `getSignals`, `getPatterns`, `setPatterns`, and `clearAll`.
- Use existing store/Redis conventions.
- Avoid direct Redis calls outside module.

**Acceptance checks**:
- Module API is narrow.
- No cross-module duplicate Redis logic.
- Unit tests can mock it.

### Subtask T009 - Implement 30-day TTL writes

**Purpose**: Enforce retention.

**Required work**:
- Write signals with 30-day expiry.
- Use Redis expiration or equivalent JSON cleanup.
- Store only allowed metadata fields.

**Acceptance checks**:
- New signal expires after 30 days.
- No raw task text stored.
- Write result is observable.

### Subtask T010 - Implement read window filtering

**Purpose**: Avoid stale behavior claims.

**Required work**:
- Return only signals since requested timestamp.
- Default to 30 days.
- Handle missing data as empty.

**Acceptance checks**:
- Old signals are excluded.
- Missing store returns empty array.
- No exception reaches user flow.

### Subtask T011 - Implement pattern cache read/write

**Purpose**: Avoid recomputing patterns unnecessarily.

**Required work**:
- Store derived patterns separately from raw signals.
- Mark cache as recomputable.
- Do not keep raw sensitive text.

**Acceptance checks**:
- Pattern cache can be cleared/recomputed.
- No TTL confusion with signal retention.
- Output shape is tested.

### Subtask T012 - Enforce user-scoped keys

**Purpose**: Prevent cross-user leakage even in future small-group use.

**Required work**:
- Use `user:{userId}:behavioral:*` keys.
- Centralize key construction.
- Test isolation between two user ids.

**Acceptance checks**:
- User A cannot read user B signals.
- Key format is consistent.
- No global behavioral key is used.

### Subtask T013 - Add mocked storage tests

**Purpose**: Verify retention and isolation.

**Required work**:
- Mock Redis or store backend.
- Test write/read/filter/clear.
- Test storage failure handling.

**Acceptance checks**:
- Tests pass without Redis service.
- Failure path is non-blocking.
- Isolation is asserted.

## Risks and Mitigations

- Risk: multi-tenant overengineering. Mitigation: use simple user-scoped keys needed by current bot only.
- Risk: Render filesystem fallback confusion. Mitigation: keep Redis primary for deployed ephemeral storage.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
