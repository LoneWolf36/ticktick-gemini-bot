---
work_package_id: WP01
title: Canonical Pipeline Context Foundation
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-007
- FR-008
base_branch: master
base_commit: 111cae226a11249ff7a2270848cd289dfdd6b596
created_at: '2026-04-01T00:22:34+01:00'
subtasks:
- T001
- T002
- T003
- T004
phase: Phase 1 - Context Foundation
authoritative_surface: kitty-specs/003-pipeline-hardening-and-regression/
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQV
owned_files:
- kitty-specs/003-pipeline-hardening-and-regression/plan.md
- kitty-specs/003-pipeline-hardening-and-regression/spec.md
wp_code: WP01
---

# Work Package Prompt: WP01 - Canonical Pipeline Context Foundation

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

- Establish one canonical request-context contract for all pipeline execution paths.
- Remove ad-hoc field drift between the pipeline, AX extraction, and normalization.
- Make request metadata explicit enough to support later failure classification, rollback, and observability work.
- Keep the hardening work on the current architecture instead of introducing a second context path.

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

- Implementation command: `spec-kitty implement WP01`
- Canonical references:
  - `kitty-specs/003-pipeline-hardening-and-regression/spec.md`
  - `kitty-specs/003-pipeline-hardening-and-regression/plan.md`
  - `services/pipeline.js`
  - `services/pipeline-context.js`
  - `services/user-settings.js`
  - `services/ax-intent.js`
  - `services/normalizer.js`
- Treat `services/user-settings.js` as the canonical timezone source used by context assembly.
- Preserve the write boundary: `AX -> normalizer -> TickTickAdapter`.
- Do not move context assembly back into Telegram handlers or scheduler code.
- Do not introduce a second settings/config module for request-time timezone resolution.

## Subtasks & Detailed Guidance

### Subtask T001 - Define canonical request-context assembly
- **Purpose**: Make `services/pipeline-context.js` the single source of truth for what enters the pipeline.
- **Steps**:
  1. Confirm the canonical context shape includes `requestId`, `entryPoint`, `mode`, `userMessage`, `currentDate`, `timezone`, `availableProjects`, `availableProjectNames`, and `existingTask`.
  2. Keep derived-field assembly in the context builder instead of spreading it across callers.
  3. Ensure deterministic overrides for tests remain possible through injected `requestId` and date inputs.
  4. Keep the builder narrow: assemble, normalize, and validate context only.
- **Files to Touch**:
  - `services/pipeline-context.js`
  - `services/pipeline.js` if context-builder integration needs adjustment
- **Tests / Acceptance Cues**:
  - Missing required fields fail cleanly in development-oriented modes.
  - The context builder can be reused by bot, scheduler, and harness callers.
- **Guardrails**:
  - Do not let the builder fetch unrelated runtime state or render user messages.

### Subtask T002 - Align AX extraction with canonical context
- **Purpose**: Ensure AX receives the same extraction inputs on every call path.
- **Steps**:
  1. Review which context fields AX actually consumes today.
  2. Make `services/pipeline.js` translate the canonical request context into AX input intentionally rather than forwarding loose options.
  3. Keep the AX-facing project-name list derived from the canonical project objects.
  4. Preserve current key-rotation behavior; this task is about context contract, not quota policy.
- **Files to Touch**:
  - `services/pipeline.js`
  - `services/ax-intent.js`
- **Tests / Acceptance Cues**:
  - AX calls receive stable `currentDate`, `availableProjects`, and `requestId`-relevant context where expected.
  - Telegram and harness callers no longer depend on caller-specific AX option shaping.
- **Guardrails**:
  - Avoid widening the AX contract beyond fields the pipeline already owns.

### Subtask T003 - Align normalization with canonical context
- **Purpose**: Make date expansion and project resolution consume the same context contract as AX extraction.
- **Steps**:
  1. Review how normalization currently consumes timezone, current date, projects, and existing task state.
  2. Replace any ad-hoc option plumbing in `services/pipeline.js` with fields drawn from the canonical request context.
  3. Ensure existing task snapshots and project lookup data remain available without callers shaping them manually.
  4. Keep normalization deterministic and free of request-time fetching.
- **Files to Touch**:
  - `services/pipeline.js`
  - `services/normalizer.js`
- **Tests / Acceptance Cues**:
  - Relative-date and project-resolution behavior consume the canonical context shape instead of parallel option bags.
  - Existing task-aware normalization paths remain intact.
- **Guardrails**:
  - Do not let normalization reach outward for timezone or project lists on its own.

### Subtask T004 - Add fail-fast context validation and development diagnostics
- **Purpose**: Catch contract drift early instead of letting it surface as downstream extraction or normalization bugs.
- **Steps**:
  1. Keep validation logic inside the context-builder surface.
  2. Ensure development-oriented modes surface missing or malformed context fields explicitly.
  3. Keep production/user behavior non-destructive and deterministic.
  4. Make validation failures easy to assert in later regression work.
- **Files to Touch**:
  - `services/pipeline-context.js`
  - `services/pipeline.js`
- **Tests / Acceptance Cues**:
  - Invalid context produces a stable error path or diagnostics surface.
  - Future contract drift is easier to detect from tests.
- **Guardrails**:
  - Do not build a second validation layer in every caller.

## Definition of Done

- `services/pipeline-context.js` is the canonical request-context assembly path.
- AX extraction and normalization consume the same context contract.
- Canonical timezone sourcing is explicit and centralized.
- Development-oriented validation catches missing or drifted fields early.

## Activity Log

- 2026-04-01: WP regenerated after audit; prior prompt replaced because it still reflected older Spec Kitty task-history conventions instead of the current v3 review-oriented prompt format.

---

## Review Comments (Added 2026-04-11)

### Status: Not Started
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Establish services/pipeline-context.js as the single source of truth for pipeline request context. Align AX extraction and normalization with the same context contract. Add fail-fast context validation.

#### What's Actually Done:
Not started. WP was regenerated to match v3 format. No implementation events in status.events.jsonl beyond the plan creation.

#### Gaps Found:
- Not started. This is the foundation for the entire hardening spec (003). All subsequent WPs depend on this context contract.
- Well-scoped: context assembly only, no behavior changes.

#### Product Vision Alignment Issues:
- Aligned. Explicit context contracts prevent silent data drift that could lead to wrong suggestions — supporting "correctness matters more than confidence."
- Centralized timezone sourcing ensures consistent date handling, preventing confusing user-facing errors.

#### Recommendations:
- Blocking prerequisite for WP02-WP06 of spec 003. Should be implemented first.
- The WP prompt is well-structured after regeneration with clear guardrails.
