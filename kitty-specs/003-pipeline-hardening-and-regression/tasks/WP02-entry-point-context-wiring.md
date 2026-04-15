---
work_package_id: WP02
title: Entry-Point Context Wiring
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
- FR-005
- FR-006
base_branch: 003-pipeline-hardening-and-regression-WP02-merge-base
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T005
- T006
- T007
phase: Phase 2 - Story 1 Context Wiring
authoritative_surface: kitty-specs/003-pipeline-hardening-and-regression/
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQV
owned_files:
- kitty-specs/003-pipeline-hardening-and-regression/plan.md
- kitty-specs/003-pipeline-hardening-and-regression/spec.md
wp_code: WP02
agent: "reconciliation-audit"
shell_pid: "audit-2026-04-15"
---

# Work Package Prompt: WP02 - Entry-Point Context Wiring

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

- Push the canonical request-context contract through every live pipeline entry point.
- Remove per-caller request-time timezone and project-shaping logic from Telegram and scheduler callers.
- Keep caller code thin and compatible with the current repository architecture.
- Preserve current user-facing behavior unless the accepted spec requires change.

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

- Implementation command: `spec-kitty implement WP02 --base WP01`
- Canonical references:
  - `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
  - `bot/commands.js`
  - `services/scheduler.js`
  - `server.js`
  - `services/pipeline.js`
  - `services/pipeline-context.js`
  - `services/user-settings.js`
- This package is wiring only. It should not redesign failure classes or rollback behavior.
- Use the shared context builder from WP01 instead of duplicating defaulting in callers.
- Preserve existing batching and scheduler behavior while removing context drift.

## Subtasks & Detailed Guidance

### Subtask T005 - Update Telegram command entry points
- **Purpose**: Remove context drift from free-form, `/scan`, and `/review` pipeline execution in `bot/commands.js`.
- **Steps**:
  1. Inspect each `pipeline.processMessage(...)` call in `bot/commands.js`.
  2. Replace per-caller request-time timezone or project shaping with canonical context usage from WP01.
  3. Keep entry-point labels explicit enough for later observability.
  4. Preserve existing-task snapshots where scan/review flows depend on them.
- **Files to Touch**:
  - `bot/commands.js`
  - `services/pipeline.js` only if call signatures need cleanup
- **Tests / Acceptance Cues**:
  - Telegram entry points supply stable `entryPoint`, `mode`, and request metadata.
  - Callers no longer own request-time timezone fallbacks.
- **Guardrails**:
  - Do not duplicate context assembly inside each command handler.

### Subtask T006 - Update scheduler and bootstrap wiring
- **Purpose**: Ensure scheduled processing uses the same canonical context contract as Telegram-driven execution.
- **Steps**:
  1. Inspect pipeline calls in `services/scheduler.js`.
  2. Remove scheduler-local authority over request-time timezone and rely on canonical context assembly.
  3. Update any wiring in `server.js` only as needed to keep pipeline creation compatible.
  4. Preserve current polling, briefing, and digest scheduling behavior.
- **Files to Touch**:
  - `services/scheduler.js`
  - `server.js`
  - `services/pipeline.js` if small wiring cleanup is needed
- **Tests / Acceptance Cues**:
  - Scheduler-driven pipeline calls use explicit request metadata and canonical timezone sourcing.
  - Existing scheduler job behavior remains intact.
- **Guardrails**:
  - Do not let scheduler code become a second context-builder implementation.

### Subtask T007 - Unify per-request project lookup and AX-facing project names
- **Purpose**: Make project context consistent between extraction and normalization.
- **Steps**:
  1. Review how project lists are fetched and passed through the pipeline today.
  2. Ensure available project names are derived once per request from the canonical project objects.
  3. Ensure the same project objects continue forward into normalization.
  4. Keep caching or list-fetch behavior inside existing adapter/TickTick layers rather than callers.
- **Files to Touch**:
  - `services/pipeline.js`
  - `services/ax-intent.js`
  - `services/normalizer.js`
  - `services/ticktick-adapter.js` only if a small helper is needed
- **Tests / Acceptance Cues**:
  - AX and normalization consume one coherent project list per request.
  - No caller-specific project-name shaping remains.
- **Guardrails**:
  - This task is about consistency, not broad caching redesign.

## Definition of Done

- Telegram and scheduler entry points use the canonical context contract.
- Request-time timezone resolution is no longer caller-specific.
- Project lookup and AX-facing project names are consistent per request.
- Caller code is thinner and less likely to drift from the pipeline contract.

## Activity Log

- 2026-04-01: WP regenerated after audit; prior prompt replaced because it retained mixed-era task history instead of the current review-oriented prompt structure.

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Wire canonical context through all entry points (Telegram commands, scheduler, server.js). Remove per-caller timezone/project shaping. Unify project lookup.

#### What's Actually Done:
Not started. Depends on WP01.

#### Gaps Found:
- Not started. Pure wiring task — well-scoped.

#### Product Vision Alignment Issues:
- Aligned. Consistent context across entry points prevents inconsistent behavior that would erode trust.

#### Recommendations:
- Blocking on WP01. Well-scoped wiring task.
