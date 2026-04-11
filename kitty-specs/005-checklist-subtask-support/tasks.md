# Work Packages: Checklist Subtask Support

**Inputs**: `spec.md`, `plan.md`, and the implemented `001-task-operations-pipeline` surfaces in `services/`, `bot/`, and `tests/`
**Prerequisites**: `spec.md`, `plan.md`, and the current post-`001` codebase on `master`

**Tests**: Required. This feature changes the create path for tasks and must ship with AX, normalizer, adapter, pipeline, and regression coverage.

**Organization**: Fine-grained subtasks (`Txxx`) roll up into work packages (`WPxx`). All WPs are sequential: WP01 → WP02 → WP03 → WP04 → WP05 → WP06.

**Prompt Files**: Each work package references a matching prompt file in `kitty-specs/005-checklist-subtask-support/tasks/`. This checklist file is the dependency map; the prompt files carry the detailed implementation guidance.

---

## Product Vision Alignment Contract

This work-package task list is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature helps convert vague or compound intentions into a single executable task with useful sub-steps when that reduces procrastination. It must not confuse checklists with independent tasks or turn brain dumps into clutter.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Distinguish one parent task with sub-steps from several independent tasks; ask if uncertain.
- Keep checklist items practical and short enough to support execution, not planning theater.
- Use TickTick native checklist `items` only through the structured create path and verify the live API before relying on undocumented assumptions.

**Reject or revise this artifact if**:
- The system creates a long checklist when separate tasks or a clarification would better fit execution.
- Checklist support mutates existing checklist items before a separate spec defines that behavior.
- The implementation encourages over-planning by preserving every raw brainstorm fragment as a subtask.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission makes tasks more executable by supporting checklist/subtask breakdown where the user is really describing one outcome with multiple steps. It must not explode one intention into noisy task clutter. It must distinguish checklist, multi-task, and clarification cases so the system improves action clarity without rewarding over-planning.

### Required Product Behavior For This Mission

- One outcome with clear component steps becomes one task with checklist items when TickTick support is available.
- Independent outcomes become separate tasks only when that is the user intent and does not create low-value clutter.
- Ambiguous breakdown requests ask concise clarification instead of guessing structure.
- Checklist generation must produce actionable items, not decorative planning artifacts.

### Cross-Mission Dependency And Drift Risk

This mission depends on 001 task creation and 002 update semantics. It feeds 006 daily planning and 007 ranking by making work units clearer and more executable.

### Evidence Required Before Any WP Approval

Every implement-review cycle for this mission must produce reviewer-visible evidence for all of the following:

1. The specific Product Vision clause or behavioral scope section served by the change.
2. The local FR, NFR, plan step, task, or WP requirement implemented by the change.
3. The concrete user-visible behavior that changed, including whether the change affects capture, clarification, planning, ranking, intervention, reflection, recovery, or behavioral memory.
4. The anti-drift rule the change preserves: not a passive task manager, not generic reminders, not over-planning support, not busywork optimization, not false certainty, and not SaaS scope expansion.
5. The automated test, regression script, manual transcript, or inspection evidence that proves the behavior.
6. The downstream missions that rely on this behavior and what would break if it drifted.

### Complete 001-009 Acceptance Criteria

After all WPs in missions 001 through 009 have passed implementation, review, and mission-level acceptance, the integrated product must satisfy every item below. If any item is not demonstrably true, the 001-009 chain is not complete.

1. The user can capture clear, vague, multi-task, checklist, recurring, and mutation requests safely through the accepted pipeline without legacy path drift.
2. Ambiguous or destructive actions clarify or fail closed instead of guessing.
3. The daily plan usually contains no more than three tasks, is realistic for the user context, and includes long-term-goal work when such work exists and is plausible.
4. The system distinguishes important work from low-value busywork and actively avoids rewarding motion-as-progress.
5. Urgent mode is temporary, minimal, direct, and action-oriented; it is not the default tone and it does not mutate TickTick state unless the user explicitly asks for a task operation.
6. Weak behavioral or priority inference is never presented as fact. The assistant asks, labels uncertainty, or stays quiet.
7. Behavioral memory stores derived signals only, uses retention limits, and supports inspection/reset so memory remains a coaching aid rather than surveillance.
8. Morning start stays short; end-of-day reflection stays brief, context-aware, and non-punitive.
9. Ignored guidance causes adaptation or backing off, not louder nagging.
10. The implementation avoids MVP scope creep: no auth, billing, rate limiting, multi-tenant isolation, or SaaS infrastructure unless an accepted spec explicitly requires it.
11. User-facing copy is compact, concrete, non-judgmental, and oriented toward the next useful action.
12. No raw user message, raw task title, or raw task description is persisted in long-term behavioral memory.

### Mandatory Rejection Conditions

A reviewer must reject or reopen work in this mission if any of these are true:

- The change can pass local tests while still encouraging list management instead of task execution.
- The assistant accepts the user's first input as correct when the spec requires challenge, clarification, or safe failure.
- The change increases verbosity, ceremony, or planning overhead without improving action clarity or prioritization.
- The change optimizes low-value tasks, cosmetic organization, or generic reminders while ignoring meaningful progress.
- The change presents weak inference as certainty or invents goals, constraints, priorities, or behavioral patterns.
- The change stores raw user/task content in behavioral memory or logs where the mission only allows derived signals.
- The change introduces auth, billing, rate limiting, multi-tenant isolation, or platform-scale infrastructure not accepted by spec.
- The reviewer cannot trace the change from Product Vision -> spec/plan/task -> code/docs -> test evidence.

### Claim Boundary

When this mission is marked done, the claim is not merely that its files changed or tests passed. The claim is that this mission now contributes its defined role to the complete behavioral support system. The stronger statement, "after running 001 through 009 the product exactly matches the vision", is only valid when every mission enforces this contract, every WP has review evidence, and a final mission review confirms spec-to-code-to-test-to-product-vision fidelity across the whole chain.

## Work Package WP01: AX Checklist Extraction (Priority: P0)

**Goal**: Extend AX intent extraction so the LLM can detect checklist intent vs multi-task intent and emit checklist items in a TickTick API-compatible format.
**Independent Test**: AX unit coverage proves checklist intent emits `checklistItems` array, multi-task intent emits multiple separate create actions, and ambiguous intent emits a `clarification` flag with a user question.
**Prompt**: `kitty-specs/005-checklist-subtask-support/tasks/WP01-ax-checklist-extraction.md`
**Estimated Prompt Size**: ~350 lines
**Estimated Complexity**: Medium

**Requirements Refs**: FR-001, FR-003, FR-006

### Included Subtasks
- [ ] T011 Extend AX instructions in `services/ax-intent.js` to explain checklist vs multi-task intent discrimination with explicit examples
- [ ] T012 Add `checklistItems` field to the AX output schema for create actions (array of `{ title, status?, sortOrder? }`)
- [ ] T013 Add `clarification` flag to AX output shape for ambiguous intent (includes `clarificationQuestion` string)
- [ ] T014 Extend runtime validation in `validateIntentAction()` to validate `checklistItems` array structure and cap at 30 items
- [ ] T015 Add AX extraction test cases for checklist intent, multi-task intent, and ambiguous intent scenarios
- [ ] T016 Preserve backwards compatibility for existing create-path tests (no `checklistItems` still works)

### Implementation Notes
- Extend the existing `gen.setInstruction()` call; do not create a separate checklist extraction LLM call.
- Checklist items should be emitted as `checklistItems` (not `items`) to avoid confusion with other pipeline fields.
- The LLM should use explicit rules: checklist = one parent with sub-steps, multi-task = independent tasks.
- Ambiguous intent: LLM emits `clarification: true` with a `clarificationQuestion` field.

### Parallel Opportunities
- None. This is the foundation WP.

**Dependencies**: None.

### Risks & Mitigations
- Risk: LLM misclassifies checklist vs multi-task intent consistently.
- Mitigation: Explicit few-shot examples in AX instructions, clarification fallback, regression tests with known ambiguous inputs.
- Risk: `checklistItems` array structure validation is too loose.
- Mitigation: Enforce required `title` field, validate max 30 items, log warning on truncation.

---

## Work Package WP02: Normalizer Checklist Validation (Priority: P1)

**Goal**: Extend the normalizer to validate, clean, and normalize checklist items extracted by AX before they reach the adapter.
**Independent Test**: Normalizer tests prove checklist items are cleaned individually, capped at 30, assigned sequential sortOrder, and validated for non-empty titles.
**Prompt**: `kitty-specs/005-checklist-subtask-support/tasks/WP02-normalizer-checklist-validation.md`
**Estimated Prompt Size**: ~300 lines
**Estimated Complexity**: Medium

**Requirements Refs**: FR-002, FR-006

### Included Subtasks
- [ ] T021 Add `_normalizeChecklistItems()` function in `services/normalizer.js` that processes raw `checklistItems` from AX output
- [ ] T022 Clean each checklist item text: trim, strip filler patterns, ensure non-empty, truncate to reasonable length (50 chars)
- [ ] T023 Cap checklist items at 30, log warning if truncated, drop empty items after cleaning
- [ ] T024 Assign sequential `sortOrder` (0-indexed) to all items if not already provided
- [ ] T025 Validate normalized items: each must have non-empty `title`, `status` defaults to 0
- [ ] T026 Integrate checklist normalization into `normalizeAction()` so checklist items are attached to the normalized action

### Implementation Notes
- Checklist item text is cleaned separately from parent task title (different rules, no verb-led requirement).
- Use a shorter max length for checklist items (50 chars) vs parent titles (80-100 chars).
- Log warnings for truncation and dropped items: `[Normalizer] Truncated checklist items from 35 to 30`.
- Parent task title normalization remains unchanged; checklist items get their own cleaning pass.

### Parallel Opportunities
- None. Depends on WP01 AX output shape.

**Dependencies**: WP01.

### Risks & Mitigations
- Risk: Cleaning removes meaningful checklist item content.
- Mitigation: Keep cleaning conservative (trim, strip obvious filler, truncate at word boundary). Test with realistic inputs.
- Risk: Normalizer and AX disagree on item structure.
- Mitigation: Lock the contract in tests: `checklistItems` is an array of `{ title, status, sortOrder }`.

---

## Work Package WP03: TickTickAdapter Checklist Creation (Priority: P1)

**Goal**: Extend `TickTickAdapter.createTask()` to accept normalized `checklistItems` and map them to the TickTick API `items` array format.
**Independent Test**: Adapter unit tests prove `checklistItems` are correctly mapped to `items` array with proper field validation and API payload shape.
**Prompt**: `kitty-specs/005-checklist-subtask-support/tasks/WP03-ticktick-adapter-checklist-creation.md`
**Estimated Prompt Size**: ~250 lines
**Estimated Complexity**: Low

**Requirements Refs**: FR-004, FR-006

### Included Subtasks
- [ ] T031 Extend `TickTickAdapter.createTask()` to accept `checklistItems` field from normalized action
- [ ] T032 Map `checklistItems` to TickTick API `items` array: `{ title, status: 0, sortOrder }` per item
- [ ] T033 Add per-item field validation in adapter: title required, status defaults to 0, sortOrder from item or assigned
- [ ] T034 Log adapter payload mapping: extracted items, normalized items, final `items` array sent to API
- [ ] T035 Add adapter unit test for task creation with checklist items (mock the TickTick client)
- [ ] T036 Preserve backwards compatibility: tasks without `checklistItems` create normally without `items` array

### Implementation Notes
- The TickTick API accepts `items` array on task creation. Confirmed format:
  ```json
  { "title": "Parent", "items": [{ "title": "Item 1", "status": 0, "sortOrder": 0 }] }
  ```
- Validation in adapter is defense-in-depth: normalizer already validated, but adapter should never send malformed payloads.
- Keep logging consistent with existing adapter patterns: `[Adapter] createTask: { title, checklistItemCount, itemsMapped }`.

### Parallel Opportunities
- None. Depends on WP02 normalized output shape.

**Dependencies**: WP02.

### Risks & Mitigations
- Risk: TickTick API rejects `items` array for reasons not caught in validation.
- Mitigation: Add error handling in adapter, classify the error, log the full payload for debugging.
- Risk: Adapter sends `items` array when it shouldn't (e.g., empty array).
- Mitigation: Only include `items` in payload if `checklistItems` is non-empty array with at least one valid item.

---

## Work Package WP04: Pipeline Checklist Integration (Priority: P1)

**Goal**: Wire the AX → Normalizer → Adapter checklist flow through the existing pipeline without breaking the current execution path.
**Independent Test**: Pipeline regression tests prove checklist requests create one parent task with checklist items, multi-task requests create separate tasks, and ambiguous requests produce `clarification` results.
**Prompt**: `kitty-specs/005-checklist-subtask-support/tasks/WP04-pipeline-checklist-integration.md`
**Estimated Prompt Size**: ~320 lines
**Estimated Complexity**: Medium

**Requirements Refs**: FR-003, FR-006

### Included Subtasks
- [ ] T041 Extend `services/pipeline-context.js` to carry checklist metadata in request context (optional: `hasChecklist`, `clarificationQuestion`)
- [ ] T042 Extend `services/pipeline.js` normalizer step to pass checklist items through from normalized actions to adapter
- [ ] T043 Handle `clarification` flag from AX: return `clarification` result type with question text instead of executing
- [ ] T044 Add explicit `clarification` pipeline result type with `clarificationQuestion` and `fallbackAction` fields
- [ ] T045 Add logging for checklist flow: extracted items count, normalized items count, adapter payload mapping
- [ ] T046 Add pipeline regression tests for checklist intent, multi-task intent, and ambiguous intent scenarios

### Implementation Notes
- The pipeline should not change its core orchestration pattern. Checklist items flow through the existing AX → Normalizer → Adapter path.
- Clarification results should be handled by the bot layer (WP05), not by the pipeline itself.
- Logging should use the existing observability path: `telemetry.emit()` with checklist metadata.

### Parallel Opportunities
- None. Depends on WP03 adapter shape.

**Dependencies**: WP03.

### Risks & Mitigations
- Risk: Pipeline breaks when `checklistItems` is undefined (backwards compatibility).
- Mitigation: Guard all checklist access with `Array.isArray(action.checklistItems) && action.checklistItems.length > 0`.
- Risk: Clarification result type breaks existing bot handler.
- Mitigation: Add `clarification` as a new result type alongside `task`, `non-task`, and `error`. Bot handler must handle it explicitly.

---

## Work Package WP05: Clarification UX Flow (Priority: P1)

**Goal**: Implement the clarification UX flow for ambiguous checklist vs multi-task intent, including Telegram reply, pending state, and fallback behavior.
**Independent Test**: Bot-layer tests prove ambiguous requests produce a clarification question, user replies resume the pipeline, and ignored clarifications fall back to AI judgment.
**Prompt**: `kitty-specs/005-checklist-subtask-support/tasks/WP05-clarification-ux-flow.md`
**Estimated Prompt Size**: ~380 lines
**Estimated Complexity**: High

**Requirements Refs**: FR-003, FR-005, FR-006

### Included Subtasks
- [ ] T051 Extend `bot/commands.js` to handle `clarification` pipeline results and send the question via Telegram reply
- [ ] T052 Add pending clarification state to `services/store.js`: store the original message, clarification question, and fallback action
- [ ] T053 Implement user reply handler that resumes the pipeline with the clarified intent (re-runs AX → Normalizer → Adapter)
- [ ] T054 Implement fallback behavior: if user sends a new unrelated message instead of clarifying, execute the fallback action (AI's best judgment)
- [ ] T055 Add inline button support for clarification responses (optional: "Create as checklist", "Create as separate tasks", "Skip")
- [ ] T056 Add logging for clarification flow: question sent, user reply received, fallback executed

### Implementation Notes
- Clarification state must be persisted in `services/store.js`, not in ephemeral in-memory maps.
- Fallback action should be conservative: if the AI guessed "checklist" but user ignored clarification, create as plain task without checklist.
- Keep clarification questions terse: "Did you mean one task with sub-steps, or separate tasks?"
- Inline buttons are optional; text reply should work as the primary path.

### Parallel Opportunities
- None. Depends on WP04 pipeline result types.

**Dependencies**: WP04.

### Risks & Mitigations
- Risk: Clarification flow creates user friction and slows down task creation.
- Mitigation: Fallback to AI judgment if user ignores the question, keep questions terse, add inline buttons for quick response.
- Risk: Pending clarification state is lost on bot restart.
- Mitigation: Persist in `services/store.js` (disk-backed), add TTL for stale pending clarifications (e.g., 24 hours).

---

## Work Package WP06: Testing & Regression Coverage (Priority: P1)

**Goal**: Add comprehensive testing and regression coverage for the entire checklist flow across AX, normalizer, adapter, pipeline, and bot layers.
**Independent Test**: Full regression suite passes with checklist scenarios included, proving no regressions in existing create path and correct behavior for new checklist flow.
**Prompt**: `kitty-specs/005-checklist-subtask-support/tasks/WP06-testing-regression-coverage.md`
**Estimated Prompt Size**: ~300 lines
**Estimated Complexity**: Medium

**Requirements Refs**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006

### Included Subtasks
- [ ] T061 Add AX extraction test cases for checklist intent, multi-task intent, and ambiguous intent in `tests/ax-intent.test.js` (or inline in existing test file)
- [ ] T062 Add normalizer checklist validation tests: cleaning, capping, sortOrder assignment, empty item dropping in `tests/normalizer.test.js`
- [ ] T063 Add adapter checklist creation tests: payload mapping, field validation, backwards compatibility in adapter test surface
- [ ] T064 Add pipeline regression tests for checklist flow, clarification result, and fallback behavior in `tests/regression.test.js`
- [ ] T065 Add bot-layer tests for clarification UX: question sent, reply handled, fallback executed in `tests/regression.test.js`
- [ ] T066 Run full regression suite (`node tests/run-regression-tests.mjs`) and verify all existing tests still pass

### Implementation Notes
- Tests should be added to existing test files where possible. Create new focused test files only if isolation is needed.
- Test realistic user inputs: "plan trip: book flights, pack bags, renew travel card", "buy groceries and call mom friday", ambiguous cases.
- Include edge cases: >30 checklist items, deeply nested steps (flatten to one level), empty item text after cleaning.
- Regression suite must pass with zero failures before merging.

### Parallel Opportunities
- None. All prior WPs must be complete before testing.

**Dependencies**: WP05.

### Risks & Mitigations
- Risk: Regression suite takes too long to run with new checklist tests.
- Mitigation: Keep tests focused and deterministic. Mock external dependencies (TickTick API, Gemini).
- Risk: Flaky tests due to LLM non-determinism in AX extraction.
- Mitigation: Use deterministic mock responses for AX tests, reserve live LLM tests for manual validation only.

---

## Dependency Graph

```
WP01 (AX Checklist Extraction)
  ↓
WP02 (Normalizer Checklist Validation)
  ↓
WP03 (TickTickAdapter Checklist Creation)
  ↓
WP04 (Pipeline Checklist Integration)
  ↓
WP05 (Clarification UX Flow)
  ↓
WP06 (Testing & Regression Coverage)
```

## Primary Files Changed

| File | WPs |
|------|-----|
| `services/ax-intent.js` | WP01 |
| `services/schemas.js` | WP01 |
| `services/normalizer.js` | WP02 |
| `services/ticktick-adapter.js` | WP03 |
| `services/pipeline.js` | WP04 |
| `services/pipeline-context.js` | WP04 |
| `services/store.js` | WP05 |
| `bot/commands.js` | WP05 |
| `tests/regression.test.js` | WP06 |
| `tests/run-regression-tests.mjs` | WP06 |
