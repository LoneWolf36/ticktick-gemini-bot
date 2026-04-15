---
work_package_id: WP03
title: Failure Classification, Quota Semantics, and Story 2 User Messaging
dependencies:
- WP01
requirement_refs:
- FR-003
- FR-004
- FR-007
- FR-010
base_branch: 003-pipeline-hardening-and-regression-WP03-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T009
- T010
- T011
phase: Phase 3 - Failure Semantics
authoritative_surface: kitty-specs/003-pipeline-hardening-and-regression/
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQV
owned_files:
- kitty-specs/003-pipeline-hardening-and-regression/plan.md
- kitty-specs/003-pipeline-hardening-and-regression/spec.md
wp_code: WP03
agent: "reconciliation-audit"
shell_pid: "audit-2026-04-15"
---

# Work Package Prompt: WP03 - Failure Classification, Quota Semantics, and Story 2 User Messaging

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task.**

- **Has review feedback?** Check the current review state before starting.
- **Address all review feedback** before marking the package complete.
- **Report progress** by appending Activity Log entries in chronological order.

---

## Review Feedback

> Populated by `/spec-kitty.review` when changes are requested.

*[This section is empty initially. Any later feedback becomes mandatory scope.]*

---

## Markdown Formatting

Wrap HTML/XML tags in backticks: `` `<div>` ``, `` `<script>` ``
Use language identifiers in fenced code blocks.

---

## Objectives & Success Criteria

- Classify pipeline failures explicitly instead of routing everything through a generic error path.
- Preserve request context through configured-key rotation before surfacing quota failure.
- Render failures deterministically with development-detailed diagnostics and compact user-facing messaging.
- Keep the failure envelope stable enough for direct regression assertions.

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature makes the behavioral assistant dependable under failure. If the pipeline breaks, the user loses trust and returns to manual over-planning, so failures must be compact, honest, logged, and non-destructive.

**Implementation must**:
- Handle malformed model output, quota exhaustion, adapter failure, and partial multi-action failures without losing context or silently corrupting tasks.
- Keep user-facing failures compact while preserving enough developer diagnostics to fix root causes.
- Test the live architecture directly, especially paths that affect user trust: create, mutate, clarify, fail closed, and roll back.

**Implementation must not**:
- The pipeline returns misleading success after partial failure.
- Diagnostics leak into user-facing Telegram copy.
- Regression tests mainly exercise dead legacy helpers instead of the structured path.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission protects trust when model calls, TickTick calls, parsing, context, or downstream services fail. The product vision requires correctness over confidence. This mission must make failures honest, recoverable, and cognitively light instead of hiding uncertainty or leaving the user with a broken invisible workflow.

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

## Context & Constraints

- Implementation command: `spec-kitty implement WP03 --base WP01`
- Canonical references:
  - `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
  - `services/pipeline.js`
  - `services/ax-intent.js`
  - `services/gemini.js`
  - `bot/commands.js`
  - `services/scheduler.js`
- Keep the Gemini key manager as the existing configured-key rotation authority where possible.
- Do not conflate empty intent extraction with destructive failure behavior.
- Preserve request IDs and entry-point metadata while failures move across stages.
- Do not create a second caller-specific failure renderer if the pipeline can own it.

## Subtasks & Detailed Guidance

### Subtask T009 - Introduce explicit pipeline failure classes
- **Purpose**: Replace broad catch-all behavior with a stable failure taxonomy at the pipeline boundary.
- **Steps**:
  1. Review the existing `task` / `non-task` / `error` result envelope in `services/pipeline.js`.
  2. Make malformed AX output, validation failure, adapter failure, rollback failure, quota failure, and unexpected exceptions classifiable through stable fields.
  3. Keep non-task routing distinct from true failure routing.
  4. Preserve deterministic fields needed by tests: failure class, stage, compact message, diagnostics where appropriate.
- **Files to Touch**:
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Failure classes are explicit and predictable.
  - Non-task messages do not accidentally masquerade as failures.
- **Guardrails**:
  - Favor a small stable taxonomy over speculative one-off classes.

### Subtask T010 - Implement configured-key rotation before terminal quota failure
- **Purpose**: Ensure the active Gemini key is not treated as the only recovery path.
- **Steps**:
  1. Review quota and invalid-key handling across `services/ax-intent.js` and `services/gemini.js`.
  2. Keep the configured-key rotation authority in the existing Gemini path.
  3. Ensure `services/pipeline.js` sees a terminal `quota` outcome only after the configured alternatives are exhausted.
  4. Preserve request context while retries happen.
- **Files to Touch**:
  - `services/ax-intent.js`
  - `services/gemini.js`
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Terminal quota failure happens only after alternate configured keys are exhausted.
  - Request metadata survives the retry path.
- **Guardrails**:
  - Do not duplicate key-rotation logic in the pipeline if it can remain in the current Gemini key manager.

### Subtask T011 - Add mode-aware failure message rendering
- **Purpose**: Honor the clarified requirement that development mode may be detailed while user-facing mode remains compact.
- **Steps**:
  1. Keep failure text rendering close to the pipeline result envelope.
  2. Render compact user-facing text by failure class.
  3. Preserve richer diagnostics in development-oriented modes for validation, adapter, and malformed AX failures.
  4. Keep message shape deterministic enough for regression assertions.
- **Files to Touch**:
  - `services/pipeline.js`
  - `bot/commands.js` only if caller cleanup is needed
- **Tests / Acceptance Cues**:
  - User mode stays compact.
  - Development-oriented modes expose enough structured detail to debug.
- **Guardrails**:
  - Do not leak raw stack traces into user-facing responses.

## Definition of Done

- The pipeline emits explicit failure classes.
- Configured-key rotation happens before terminal quota failure.
- Failure messages are deterministic and mode-aware.
- The failure envelope is stable enough for direct regression coverage.

## Activity Log

- 2026-04-01: WP regenerated after audit; prior prompt replaced because it retained obsolete task-history state and needed to be recast into the current review-oriented format.

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Explicit failure classes, key rotation before terminal quota failure, mode-aware failure messaging (compact for users, detailed for dev mode).

#### What's Actually Done:
Not started. Depends on WP01.

#### Gaps Found:
- Not started. Well-scoped: failure semantics only, no UX redesign.

#### Product Vision Alignment Issues:
- Strongly aligned. Failure classification prevents the system from pretending everything is fine when it isn't — core to "honest about uncertainty."
- Mode-aware messaging support the Product Vision's dual identity (personal tool now, potentially multi-user later).

#### Recommendations:
- Blocking on WP01. Good scope discipline.
