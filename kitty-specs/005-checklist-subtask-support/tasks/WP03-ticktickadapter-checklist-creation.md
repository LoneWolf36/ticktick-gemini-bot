---
work_package_id: WP03
title: TickTickAdapter Checklist Creation
dependencies:
- WP02
requirement_refs:
- FR-004
- FR-006
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T031
- T032
- T033
- T034
- T035
- T036
phase: Phase 3 - Adapter Payload Mapping
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RP
owned_files:
- services/ticktick-adapter.js
- tests/regression.test.js
wp_code: WP03
---

# Work Package Prompt: WP03 - TickTickAdapter Checklist Creation

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

Map normalized checklist items to TickTick create payloads without exposing low-level API details to bot handlers.

**Independent test**: Adapter tests verify checklist items become TickTick `items` payload entries and ordinary creates remain unchanged.

Success looks like:
- The adapter is the only TickTick write surface.
- Payload mapping is logged and testable.
- No malformed item reaches the low-level client.

## Context and Constraints

- Mission: `005-checklist-subtask-support`
- Canonical spec: `kitty-specs/005-checklist-subtask-support/spec.md`
- Canonical plan: `kitty-specs/005-checklist-subtask-support/plan.md`
- Canonical task list: `kitty-specs/005-checklist-subtask-support/tasks.md`
- Implementation command: `spec-kitty implement WP03 --mission 005-checklist-subtask-support`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- services/ticktick-adapter.js
- tests/regression.test.js

## Subtasks and Detailed Guidance

### Subtask T031 - Accept checklistItems in createTask

**Purpose**: Extend the adapter contract narrowly.

**Required work**:
- Update create input shape.
- Keep callers without items compatible.
- Avoid changing mutation methods.

**Acceptance checks**:
- Create accepts optional items.
- No required-field change for ordinary tasks.
- Mutation methods unchanged.

### Subtask T032 - Map to TickTick items payload

**Purpose**: Use native checklist creation.

**Required work**:
- Map each item to `{ title, status, sortOrder }`.
- Include `items` only when non-empty.
- Preserve parent `desc` context.

**Acceptance checks**:
- Payload shape matches expected TickTick format.
- No empty `items` array is sent.
- Parent task fields are unchanged.

### Subtask T033 - Add adapter defense-in-depth validation

**Purpose**: Avoid sending malformed API payloads.

**Required work**:
- Validate item title.
- Default status to 0.
- Normalize or assign sort order.

**Acceptance checks**:
- Malformed items are rejected or dropped before API call.
- Validation result is logged.
- No raw model structure is sent directly.

### Subtask T034 - Log checklist payload mapping

**Purpose**: Make failures debuggable without leaking raw private text unnecessarily.

**Required work**:
- Log item counts and mapping status.
- Avoid logging full raw user messages.
- Include error classification when API rejects payload.

**Acceptance checks**:
- Logs include counts and status.
- Logs avoid unnecessary private text.
- Errors remain traceable.

### Subtask T035 - Add adapter unit tests

**Purpose**: Verify mapping in isolation.

**Required work**:
- Mock the TickTick client.
- Assert `items` payload for checklist creates.
- Assert ordinary creates omit `items`.

**Acceptance checks**:
- Checklist adapter tests pass.
- Backward compatibility test passes.
- No live API required.

### Subtask T036 - Preserve ordinary create behavior

**Purpose**: Avoid regressions in the highest-frequency path.

**Required work**:
- Run existing create regression tests.
- Confirm no change for task without checklist items.
- Keep confirmations terse.

**Acceptance checks**:
- Existing create path passes.
- No extra confirmation copy appears.
- No task title/content regression.

## Risks and Mitigations

- Risk: undocumented API rejects items. Mitigation: keep an opt-in live verification step before production use.
- Risk: empty items array changes behavior. Mitigation: include `items` only when valid non-empty items exist.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
