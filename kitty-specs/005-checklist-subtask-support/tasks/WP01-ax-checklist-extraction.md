---
work_package_id: WP01
title: AX Checklist Extraction
dependencies: []
requirement_refs:
- FR-001
- FR-003
- FR-006
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T011
- T012
- T013
- T014
- T015
- T016
phase: Phase 1 - Checklist Intent Contract
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RP
owned_files:
- services/ax-intent.js
- services/schemas.js
- tests/ax-intent.test.js
- tests/regression.test.js
wp_code: WP01
---

# Work Package Prompt: WP01 - AX Checklist Extraction

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

Extend AX intent extraction so checklist intent is represented separately from independent multi-task intent and ambiguous cases become clarification requests.

**Independent test**: AX tests prove checklist intent emits `checklistItems`, multi-task intent emits separate create actions, and ambiguous intent emits a clarification question.

Success looks like:
- Checklist and multi-task intent are distinct in the output contract.
- Ambiguity produces a narrow question instead of a guessed write.
- Existing create flows still pass without checklist fields.

## Context and Constraints

- Mission: `005-checklist-subtask-support`
- Canonical spec: `kitty-specs/005-checklist-subtask-support/spec.md`
- Canonical plan: `kitty-specs/005-checklist-subtask-support/plan.md`
- Canonical task list: `kitty-specs/005-checklist-subtask-support/tasks.md`
- Implementation command: `spec-kitty implement WP01 --mission 005-checklist-subtask-support`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- services/ax-intent.js
- services/schemas.js
- tests/ax-intent.test.js
- tests/regression.test.js

## Subtasks and Detailed Guidance

### Subtask T011 - Extend AX checklist examples

**Purpose**: Teach the extractor when a message is one parent task with sub-steps.

**Required work**:
- Add explicit checklist versus multi-task examples.
- Include ambiguous examples that ask for clarification.
- Preserve existing create and mutation examples.

**Acceptance checks**:
- Examples cover checklist, multi-task, and ambiguous inputs.
- Prompt remains concise enough for normal use.
- Existing extraction tests still pass.

### Subtask T012 - Add checklistItems output field

**Purpose**: Represent sub-steps without overloading existing task arrays.

**Required work**:
- Add `checklistItems` to create actions.
- Use `{ title, status?, sortOrder? }` shape.
- Keep absent field valid for ordinary tasks.

**Acceptance checks**:
- Create action schema supports checklist items.
- No existing create action is required to include items.
- Field name does not conflict with TickTick `items` payload.

### Subtask T013 - Add clarification output fields

**Purpose**: Make uncertainty explicit.

**Required work**:
- Add `clarification` boolean and `clarificationQuestion` string.
- Use them only for ambiguity that cannot be resolved safely.
- Keep question short and user-facing.

**Acceptance checks**:
- Ambiguous checklist/multi-task input does not execute.
- Clarification question is narrow.
- Logs can distinguish clarification from failure.

### Subtask T014 - Validate checklist item structure

**Purpose**: Fail closed before normalization.

**Required work**:
- Validate array structure and title presence.
- Cap raw items at 30.
- Mark invalid actions as non-executable.

**Acceptance checks**:
- Malformed checklist output is rejected.
- Large item arrays are capped or invalidated deterministically.
- Validation failures are compact for users.

### Subtask T015 - Add extraction tests

**Purpose**: Lock intent discrimination.

**Required work**:
- Add tests for checklist, multi-task, ambiguous, and ordinary create messages.
- Use deterministic mocked model output where possible.
- Assert compatibility with current pipeline expectations.

**Acceptance checks**:
- Tests cover all intent branches.
- No live LLM call is required.
- Regression suite still passes.

### Subtask T016 - Preserve backward compatibility

**Purpose**: Avoid breaking normal task creation.

**Required work**:
- Run existing create-path tests.
- Check missing `checklistItems` does not change output.
- Do not change mutation behavior in this WP.

**Acceptance checks**:
- Existing create tests pass.
- Mutation tests are unaffected.
- No extra user prompt appears for ordinary tasks.

## Risks and Mitigations

- Risk: the model over-classifies brain dumps as checklists. Mitigation: few-shot examples and clarification fallback.
- Risk: schema drift. Mitigation: tests lock the output shape.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
