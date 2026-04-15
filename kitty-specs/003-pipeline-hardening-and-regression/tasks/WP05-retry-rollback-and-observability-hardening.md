---
work_package_id: WP05
title: Retry, Rollback, and Observability Hardening
dependencies:
- WP01
- WP03
requirement_refs:
- FR-007
- FR-008
- FR-009
base_branch: 003-pipeline-hardening-and-regression-WP05-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T013
- T014
- T015
- T016
phase: Phase 4 - Execution Hardening
authoritative_surface: kitty-specs/003-pipeline-hardening-and-regression/
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQV
owned_files:
- kitty-specs/003-pipeline-hardening-and-regression/contracts/telemetry-events.schema.json
- kitty-specs/003-pipeline-hardening-and-regression/plan.md
- kitty-specs/003-pipeline-hardening-and-regression/spec.md
wp_code: WP05
agent: "reconciliation-audit"
shell_pid: "audit-2026-04-15"
---

# Work Package Prompt: WP05 - Retry, Rollback, and Observability Hardening

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

- Track every executed action explicitly.
- Retry one failed action once, then roll back earlier successful writes through compensating adapter calls.
- Emit request-correlated telemetry across request stages without breaking the adapter boundary.
- Keep rollback behavior honest and explicitly classifiable when compensation is partial or unsupported.

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

- Implementation command: `spec-kitty implement WP05 --base WP03`
- Canonical references:
  - `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/contracts/telemetry-events.schema.json`
  - `services/pipeline.js`
  - `services/pipeline-observability.js`
  - `services/ticktick-adapter.js`
  - `services/ticktick.js`
- Rollback must stay above `TickTickAdapter`; do not bypass the adapter boundary.
- Observability remains vendor-neutral and local/no-op by default.
- Request IDs must flow through telemetry and execution records consistently.
- Build on WP03 failure classes rather than creating a competing result model.

## Subtasks & Detailed Guidance

### Subtask T013 - Add execution records and rollback-step capture
- **Purpose**: Make action-by-action execution inspectable and reversible.
- **Steps**:
  1. Extend pipeline execution bookkeeping to create one execution record per normalized action.
  2. Capture attempt count, execution status, failure class, and rollback metadata.
  3. Record enough pre-write state for later compensation, especially for update, delete, and complete flows.
  4. Keep the execution-record contract stable enough for direct regression assertions.
- **Files to Touch**:
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Every executed action has a stable execution record.
  - Rollback steps are explicit rather than inferred from logs.
- **Guardrails**:
  - Do not store more snapshot data than later compensation actually needs.

### Subtask T014 - Implement retry-once then rollback orchestration
- **Purpose**: Enforce the clarified multi-action failure policy without breaking the adapter boundary.
- **Steps**:
  1. Add bounded retry behavior for action failures in multi-action requests.
  2. If retry still fails, walk prior successful actions in reverse order and execute compensating adapter operations.
  3. Define compensation strategies deliberately for create, update, complete, and delete.
  4. Keep unsupported compensation cases explicit rather than silent.
- **Files to Touch**:
  - `services/pipeline.js`
  - `services/ticktick-adapter.js` only if existing restore/read helpers need small expansion
- **Tests / Acceptance Cues**:
  - Retry occurs once.
  - Failed retries trigger rollback of prior successful writes.
  - Unsupported compensation paths surface as explicit rollback problems.
- **Guardrails**:
  - Do not pretend transactionality TickTick cannot provide.

### Subtask T015 - Classify rollback outcomes and summaries
- **Purpose**: Ensure partial failure states are honest and deterministic.
- **Steps**:
  1. Distinguish adapter failure before rollback, rollback success after retry failure, and rollback failure during compensation.
  2. Surface deterministic summary fields and messages for rollback-aware outcomes.
  3. Keep developer diagnostics rich enough to inspect which action failed and which rollback steps ran.
  4. Reuse the WP03 failure model rather than creating a separate rollback output path.
- **Files to Touch**:
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Rollback outcomes are explicit and classifiable.
  - Caller code cannot mistake a rollback-heavy failure for success.
- **Guardrails**:
  - Do not split rollback messaging into a second caller-owned rendering layer.

### Subtask T016 - Add structured observability hooks
- **Purpose**: Make the hardened pipeline inspectable without vendor lock-in.
- **Steps**:
  1. Keep structured event emission aligned with `telemetry-events.schema.json`.
  2. Emit request, AX, normalization, execution, rollback, and terminal-result events through `services/pipeline-observability.js`.
  3. Include stable correlation fields such as request ID, step, status, failure class, action type, attempt count, and rollback state.
  4. Keep sink integration optional and safe as a no-op.
- **Files to Touch**:
  - `services/pipeline-observability.js`
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Request-correlated observability events can be asserted without a real vendor sink.
  - Entry-point normalization and event structure remain stable.
- **Guardrails**:
  - Do not add a mandatory telemetry dependency for this feature.

## Definition of Done

- Per-action execution records exist and capture rollback metadata.
- Retry-once then rollback behavior is explicit and adapter-safe.
- Rollback outcomes are classified deterministically.
- Structured observability hooks exist through the pipeline observability surface.

## Activity Log

- 2026-04-01: WP regenerated after audit; prior prompt replaced because it still embedded obsolete task-lane history instead of the current review-oriented format.

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Per-action execution records, retry-once then rollback orchestration, rollback outcome classification, structured observability hooks aligned with telemetry schema.

#### What's Actually Done:
Not started. Depends on WP01 and WP03.

#### Gaps Found:
- Not started. This is the most complex WP in spec 003 — retry + rollback + observability. Well-guardrailed: rollback stays above adapter boundary, no vendor lock-in.

#### Product Vision Alignment Issues:
- Strongly aligned. Rollback prevents partial failures from corrupting the user's task state — critical for trust. "If the system keeps giving wrong suggestions, the user will stop trusting it."
- Execution records support transparency about what the system did and why.

#### Recommendations:
- Blocking on WP01 and WP03. The guardrails are good: "Do not pretend transactionality TickTick cannot provide."
