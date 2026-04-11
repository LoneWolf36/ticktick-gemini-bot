---
work_package_id: WP02
title: Normalizer Checklist Validation
dependencies:
- WP01
requirement_refs:
- FR-002
- FR-006
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T021
- T022
- T023
- T024
- T025
- T026
phase: Phase 2 - Checklist Normalization
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RP
owned_files:
- services/normalizer.js
- tests/normalizer.test.js
- tests/regression.test.js
wp_code: WP02
---

# Work Package Prompt: WP02 - Normalizer Checklist Validation

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

Clean and validate checklist items so only useful execution steps reach the adapter.

**Independent test**: Normalizer tests prove item cleaning, capping, sort order assignment, empty-item dropping, and backwards compatibility.

Success looks like:
- Checklist items are cleaned separately from parent titles.
- The normalizer does not preserve planning noise as execution steps.
- Normalized output is stable for adapter tests.

## Context and Constraints

- Mission: `005-checklist-subtask-support`
- Canonical spec: `kitty-specs/005-checklist-subtask-support/spec.md`
- Canonical plan: `kitty-specs/005-checklist-subtask-support/plan.md`
- Canonical task list: `kitty-specs/005-checklist-subtask-support/tasks.md`
- Implementation command: `spec-kitty implement WP02 --mission 005-checklist-subtask-support`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- services/normalizer.js
- tests/normalizer.test.js
- tests/regression.test.js

## Subtasks and Detailed Guidance

### Subtask T021 - Create checklist normalization helper

**Purpose**: Keep checklist cleaning localized.

**Required work**:
- Add `_normalizeChecklistItems()`.
- Accept raw AX `checklistItems`.
- Return clean items or an empty array.

**Acceptance checks**:
- Helper is unit-testable.
- Ordinary actions ignore absent field.
- No adapter mapping occurs here.

### Subtask T022 - Clean item text

**Purpose**: Remove friction without changing meaning.

**Required work**:
- Trim whitespace and obvious filler.
- Drop empty titles.
- Truncate around 50 characters at a word boundary.

**Acceptance checks**:
- Empty items are dropped.
- Long items are shortened predictably.
- Meaningful references are not over-cleaned.

### Subtask T023 - Cap checklist length

**Purpose**: Prevent task clutter and API risk.

**Required work**:
- Cap at 30 items.
- Log truncation with counts.
- Avoid prompting unless AX marked ambiguity.

**Acceptance checks**:
- More than 30 items never reach adapter.
- Truncation is observable in logs.
- User copy stays compact.

### Subtask T024 - Assign sort order

**Purpose**: Preserve intended execution order.

**Required work**:
- Assign zero-based sort order when absent.
- Normalize numeric sort orders if present.
- Keep item order stable.

**Acceptance checks**:
- Items have deterministic order.
- Sort order is test-covered.
- No random ordering appears.

### Subtask T025 - Validate normalized items

**Purpose**: Protect the adapter boundary.

**Required work**:
- Require non-empty title.
- Default `status` to 0.
- Reject unsupported nested checklist structures.

**Acceptance checks**:
- Adapter receives valid flat items only.
- Nested items are flattened or rejected per spec.
- Invalid items are logged.

### Subtask T026 - Attach items to normalized action

**Purpose**: Pass validated checklist data through the existing contract.

**Required work**:
- Add `checklistItems` to normalized create actions.
- Leave update/complete/delete unaffected.
- Preserve existing content handling.

**Acceptance checks**:
- Create actions carry clean items.
- Non-create actions do not unexpectedly gain items.
- Regression tests pass.

## Risks and Mitigations

- Risk: useful detail is stripped. Mitigation: conservative cleaning and word-boundary truncation.
- Risk: parent and item title rules get confused. Mitigation: separate helper and tests.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
