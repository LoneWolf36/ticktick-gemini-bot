---
work_package_id: WP04
title: Pipeline Checklist Integration
dependencies:
- WP03
requirement_refs:
- FR-003
- FR-006
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T041
- T042
- T043
- T044
- T045
- T046
phase: Phase 4 - Pipeline Integration
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RP
owned_files:
- services/pipeline.js
- services/pipeline-context.js
- services/pipeline-observability.js
- tests/regression.test.js
wp_code: WP04
---

# Work Package Prompt: WP04 - Pipeline Checklist Integration

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature helps convert vague or compound intentions into a single executable task with useful sub-steps when that reduces procrastination. It must not confuse checklists with independent tasks or turn brain dumps into clutter.

**Implementation must**:
- Distinguish one parent task with sub-steps from several independent tasks; ask if uncertain.
- Keep checklist items practical and short enough to support execution, not planning theater.
- Use TickTick native checklist `items` only through the structured create path and verify the live API before relying on undocumented assumptions.

**Implementation must not**:
- The system creates a long checklist when separate tasks or a clarification would better fit execution.
- Checklist support mutates existing checklist items before a separate spec defines that behavior.
- The implementation encourages over-planning by preserving every raw brainstorm fragment as a subtask.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission makes tasks more executable by supporting checklist/subtask breakdown where the user is really describing one outcome with multiple steps. It must not explode one intention into noisy task clutter. It must distinguish checklist, multi-task, and clarification cases so the system improves action clarity without rewarding over-planning.

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

Pass checklist and clarification results through the existing pipeline without creating a second orchestration path.

**Independent test**: Pipeline tests prove checklist request creates one parent task with items, multi-task request creates separate tasks, and ambiguous request asks a clarification.

Success looks like:
- Checklist flow uses AX -> normalizer -> adapter.
- Clarification is a first-class non-write result.
- Telemetry captures counts and decisions.

## Context and Constraints

- Mission: `005-checklist-subtask-support`
- Canonical spec: `kitty-specs/005-checklist-subtask-support/spec.md`
- Canonical plan: `kitty-specs/005-checklist-subtask-support/plan.md`
- Canonical task list: `kitty-specs/005-checklist-subtask-support/tasks.md`
- Implementation command: `spec-kitty implement WP04 --mission 005-checklist-subtask-support`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- services/pipeline.js
- services/pipeline-context.js
- services/pipeline-observability.js
- tests/regression.test.js

## Subtasks and Detailed Guidance

### Subtask T041 - Carry checklist metadata in pipeline context

**Purpose**: Make checklist decisions inspectable.

**Required work**:
- Add optional checklist metadata to request/result context.
- Avoid storing raw unnecessary text.
- Keep default path unchanged.

**Acceptance checks**:
- Context supports checklist metadata.
- Absent metadata remains valid.
- No private overcollection.

### Subtask T042 - Pass normalized items to adapter

**Purpose**: Complete the structured data path.

**Required work**:
- Ensure normalized create actions retain `checklistItems`.
- Call adapter create with those items.
- Guard with `Array.isArray`.

**Acceptance checks**:
- Checklist items reach adapter only after normalization.
- Undefined items do not break execution.
- Tests verify handoff.

### Subtask T043 - Handle clarification flag

**Purpose**: Ask instead of guessing when structure is ambiguous.

**Required work**:
- Return `clarification` result before any write.
- Include short `clarificationQuestion`.
- Preserve fallback metadata only if safe.

**Acceptance checks**:
- Ambiguous input performs no write.
- Question is narrow.
- Result is test-covered.

### Subtask T044 - Define clarification result type

**Purpose**: Make bot handling explicit.

**Required work**:
- Add `clarification` alongside `task`, `non-task`, and `error`.
- Document required fields.
- Keep existing result types unchanged.

**Acceptance checks**:
- Result union is clear.
- Existing callers continue to work.
- Clarification tests pass.

### Subtask T045 - Add checklist telemetry

**Purpose**: Diagnose flow without verbosity.

**Required work**:
- Emit extracted count, normalized count, and adapter mapping status.
- Do not emit raw task text unless existing logging already does so safely.
- Classify ambiguity separately from failure.

**Acceptance checks**:
- Telemetry distinguishes checklist, multi-task, and clarification.
- No new privacy leak is introduced.
- Logs support debugging.

### Subtask T046 - Add pipeline regression tests

**Purpose**: Lock end-to-end behavior through mocked dependencies.

**Required work**:
- Test checklist creates one parent with items.
- Test multi-task still creates separate tasks.
- Test ambiguous input returns clarification.

**Acceptance checks**:
- All three regression scenarios pass.
- External APIs are mocked.
- No existing regression is weakened.

## Risks and Mitigations

- Risk: result type breaks bot handler. Mitigation: add explicit handling and regression coverage.
- Risk: checklist metadata bloats context. Mitigation: pass only counts and normalized items.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
