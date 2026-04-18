# Work Packages: Natural-Language Task Mutations

**Inputs**: `spec.md`, `plan.md`, and the implemented `001-task-operations-pipeline` surfaces in `services/`, `bot/`, and `tests/`
**Prerequisites**: `spec.md`, `plan.md`, and the current post-`001` codebase on `master`

**Tests**: Required. This feature changes the mutation path for existing tasks and must ship with resolver, pipeline, bot, callback, and regression coverage.

**Organization**: Fine-grained subtasks (`Txxx`) roll up into work packages (`WPxx`). Only WP01 and WP02 are parallel foundations. All later WPs are sequential and build directly on the existing pipeline.

**Prompt Files**: Each work package references a matching prompt file in `kitty-specs/002-natural-language-task-mutations/tasks/`. This checklist file is the dependency map; the prompt files carry the detailed implementation guidance.

---

## Product Vision Alignment Contract

This work-package task list is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature reduces task-maintenance friction while protecting trust: the user can clean up or complete work quickly, but the system must never mutate the wrong task just to appear helpful.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Resolve exactly one target before any update, completion, or deletion.
- Ask narrow clarification questions when target confidence is low or when pronouns and fuzzy references create ambiguity.
- Keep mutation confirmations terse so the task system remains an execution aid rather than another inbox to read.

**Reject or revise this artifact if**:
- Any bulk or multi-target mutation is introduced without an accepted spec.
- A delete or complete operation proceeds on fuzzy confidence alone.
- The user is forced into command syntax for clear natural-language maintenance.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission gives the user a low-friction way to correct, complete, reschedule, or delete existing work by language. It exists to reduce task-management overhead, not to encourage endless list grooming. It must fail closed when target identity or intent is uncertain, because confident mutation of the wrong task is worse than asking a short clarification.

### Required Product Behavior For This Mission

- Natural-language mutations identify the correct target task or ask for clarification instead of guessing.
- Completion, deletion, update, schedule, and recurrence changes preserve user intent and avoid destructive side effects.
- The system remains concise and operational; it does not turn updates into planning sessions unless ambiguity requires it.
- Mutation behavior supports trust: the user can quickly correct the plan without being punished by extra ceremony.

### Cross-Mission Dependency And Drift Risk

This mission depends on 001 task operations and feeds every later surface that assumes the user can keep task state current without manual TickTick cleanup.

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

## Work Package WP01: Task Resolver Core (Priority: P0)

**Goal**: Create the deterministic resolver that maps one user-supplied `targetQuery` to one active TickTick task, a clarification set, or a not-found result.
**Independent Test**: Resolver unit tests prove exact-match preference, conservative fuzzy handling, ambiguity detection, and not-found behavior without touching the pipeline.
**Prompt**: `kitty-specs/002-natural-language-task-mutations/tasks/WP01-task-resolver-core.md`
**Estimated Prompt Size**: ~320 lines

**Requirements Refs**: FR-002, FR-003, FR-008, FR-009

### Included Subtasks
- [x] T011 Create `services/task-resolver.js` with task-title normalization and reusable candidate-shaping helpers
- [x] T012 Implement exact, prefix, contains, and conservative fuzzy scoring over active task titles
- [x] T013 Implement resolver decision rules that return `resolved`, `clarification`, or `not_found`
- [x] T014 Add focused resolver unit coverage in `tests/task-resolver.test.js`
- [x] T015 Freeze resolver output contracts and edge-case fixtures used by downstream pipeline tests

### Implementation Notes
- This is the only truly new service module in the feature.
- Resolver output must be shaped for direct pipeline consumption, not for a future abstract matching framework.
- Exact match wins immediately; fuzzy handling must stay conservative and explainable in tests.

### Parallel Opportunities
- Runs in parallel with WP02.

**Dependencies**: None.

### Risks & Mitigations
- Risk: Over-aggressive fuzzy matching mutates the wrong task.
- Mitigation: Bias toward clarification, encode thresholds as named constants, and test close-title collisions explicitly.

---

## Work Package WP02: AX Mutation Intent Extension (Priority: P0)

**Goal**: Extend AX extraction and runtime validation so mutation actions carry `targetQuery` while preserving current create-flow compatibility.
**Independent Test**: AX unit coverage proves create actions still validate, while mutation actions emit `targetQuery` plus only the change fields the user actually requested.
**Prompt**: `kitty-specs/002-natural-language-task-mutations/tasks/WP02-ax-mutation-intent.md`
**Estimated Prompt Size**: ~300 lines

**Requirements Refs**: FR-001, FR-006, FR-009

### Included Subtasks
- [x] T021 Extend `services/ax-intent.js` instructions so mutation actions emit `targetQuery` instead of overloading `title` as the lookup key
- [x] T022 Update runtime validation so required fields differ correctly for create vs update/complete/delete actions
- [x] T023 Add mutation-focused AX examples for rename, due-date change, priority update, completion, deletion, and mixed-intent rejection cues
- [x] T024 Add mutation extraction coverage in `tests/ax-intent.test.js`
- [x] T025 Preserve backwards compatibility for current create-path tests and existing update/complete/delete harness scenarios

### Implementation Notes
- Do not introduce a separate `extractMutationIntents()` service unless the existing `extractIntents()` surface cannot be extended safely.
- Keep the mutation action shape close to the current normalizer contract: `targetQuery` plus top-level change fields.
- `reschedule` is out of scope and must not appear anywhere in the regenerated package.

### Parallel Opportunities
- Runs in parallel with WP01.

**Dependencies**: None.

### Risks & Mitigations
- Risk: AX emits mutation actions that still require a title even when the user only wants complete/delete.
- Mitigation: Split create-vs-mutation validation rules and lock them with targeted tests.

---

## Work Package WP03: Mutation Normalizer (Priority: P1)

**Goal**: Extend the existing normalizer so resolved mutation intents become valid write actions without losing existing-task context or content-preservation guarantees.
**Independent Test**: Normalizer tests prove resolved mutation intents require task context, preserve content on update by default, and reject unsupported mixed or underspecified mutation shapes.
**Prompt**: `kitty-specs/002-natural-language-task-mutations/tasks/WP03-mutation-normalizer.md`
**Estimated Prompt Size**: ~300 lines

**Requirements Refs**: FR-001, FR-005, FR-009

### Included Subtasks
- [x] T031 Extend `services/normalizer.js` so resolved mutation intents normalize through the existing action pipeline without a second normalizer stack
- [x] T032 Require mutation actions to carry resolved `taskId` and project context before they can become valid write actions
- [x] T033 Preserve existing content on update unless the user explicitly requests replacement, staying aligned with current adapter merge semantics
- [x] T034 Reject unsupported mutation shapes such as mixed create+mutation, multiple mutation actions, or unresolved pronoun-only references

### Implementation Notes
- Do not create `services/mutation-normalizer.js`.
- Keep content-preservation semantics aligned with the current `TickTickAdapter.updateTask()` contract.
- The normalizer should remain the safety gate between AX output and adapter writes.

### Parallel Opportunities
- None. This package assumes WP01 and WP02 contracts are in place.

**Dependencies**: WP01, WP02.

### Risks & Mitigations
- Risk: Normalizer and adapter disagree about merge behavior.
- Mitigation: Treat current adapter semantics as the source of truth and encode that contract in tests.

---

## Work Package WP04: Pipeline Integration (Priority: P1)

**Goal**: Add adapter-backed task listing, target resolution, mutation routing, and new pipeline result types without replacing the existing `001` execution path.
**Independent Test**: Pipeline regressions prove a free-form mutation request can become `task`, `clarification`, or `not-found`, and that successful writes still reuse `_executeActions()`.
**Prompt**: `kitty-specs/002-natural-language-task-mutations/tasks/WP04-pipeline-integration.md`
**Estimated Prompt Size**: ~360 lines

**Requirements Refs**: FR-002, FR-003, FR-004, FR-006, FR-007, FR-008, FR-009

### Included Subtasks
- [x] T041 Add a thin read seam to `services/ticktick-adapter.js` for listing active tasks used by resolution
- [x] T042 Extend `services/pipeline-context.js` and `tests/pipeline-harness.js` to carry available-task inputs and mutation-resolution metadata
- [x] T043 Extend `services/pipeline.js` to identify single mutation requests, reject out-of-scope mixed requests, resolve the target, and execute the resolved action
- [x] T044 Add explicit `clarification` and `not-found` pipeline result types with terse confirmation text and diagnostics
- [x] T045 Add pipeline regression coverage for exact-match success, ambiguity fail-closed, not-found, and mixed-intent rejection

### Implementation Notes
- Successful writes must still go through the existing `_executeActions()` and rollback machinery.
- Do not create a second pipeline or move Telegram logic into the service layer.
- Logging should use the existing observability path instead of inventing a new logger service.

### Parallel Opportunities
- None.

**Dependencies**: WP03.

### Risks & Mitigations
- Risk: task listing bypasses the adapter and recreates the pre-001 scattered API problem.
- Mitigation: expose one small adapter read helper instead of reading from `TickTickClient` in bot handlers.

---

## Work Package WP05: Bot Message Handler (Priority: P1)

**Goal**: Update the free-form Telegram entrypoint so it can surface `clarification` and `not-found` mutation results while keeping the existing command surface unchanged.
**Independent Test**: Bot-layer regressions prove free-form messages now handle `task`, `clarification`, `not-found`, `non-task`, and `error` results correctly without adding new commands.
**Prompt**: `kitty-specs/002-natural-language-task-mutations/tasks/WP05-bot-message-handler.md`
**Estimated Prompt Size**: ~300 lines

**Requirements Refs**: FR-003, FR-006, FR-007, FR-008

### Included Subtasks
- [x] T051 Extend the free-form handler in `bot/commands.js` to render mutation `clarification` and `not-found` results
- [x] T052 Add a minimal mutation-candidate keyboard helper using existing grammY patterns and current callback conventions
- [x] T053 Extend `services/store.js` with pending mutation clarification state so request context survives between message and callback
- [x] T054 Add regression coverage for handler behavior, including ambiguous queries, missing tasks, and terse confirmations

### Implementation Notes
- No new `/done`, `/delete`, or `/undo` commands.
- Keep user-facing text terse and specific; the bot should not narrate resolver internals.
- Store state should be scoped tightly enough to reject stale or cross-chat selections safely.

### Parallel Opportunities
- None.

**Dependencies**: WP04.

### Risks & Mitigations
- Risk: clarification state leaks across chats or requests.
- Mitigation: key stored state by chat/user/request and clear it on success, cancel, or expiry.

---

## Work Package WP06: Clarification UI Flow (Priority: P1)

**Goal**: Add callback-based clarification resume so the user can choose among ambiguous candidates and continue through the same pipeline safely.
**Independent Test**: Callback regressions prove selecting a candidate resumes the mutation, cancel clears pending state, and stale selections fail safely.
**Prompt**: `kitty-specs/002-natural-language-task-mutations/tasks/WP06-clarification-ui-flow.md`
**Estimated Prompt Size**: ~300 lines

**Requirements Refs**: FR-003, FR-006, FR-008, FR-009

### Included Subtasks
- [x] T061 Add `mutate:` callback handling in `bot/callbacks.js` using the stored pending clarification state
- [x] T062 Resume the chosen mutation through the pipeline with resolved task context instead of mutating directly in the callback layer
- [x] T063 Implement safe cancel, stale-selection, and expired-state handling with terse user feedback
- [x] T064 Add callback/resume regression coverage in the existing regression surfaces

### Implementation Notes
- The callback layer should choose or cancel; the pipeline should still own normalization and execution.
- Keep callback payloads compact and Telegram-safe.
- Clear pending state deterministically after resume, cancel, or invalid selection.

### Parallel Opportunities
- None.

**Dependencies**: WP05.

### Risks & Mitigations
- Risk: callback handlers bypass pipeline safety checks.
- Mitigation: make callbacks only re-enter the pipeline with the chosen task, never call adapter writes directly.

---

## Work Package WP07: Testing & Hardening (Priority: P2)

**Goal**: Finish the feature with end-to-end mutation regressions, observability assertions, and cleanup of stale assumptions introduced by the old broken task package.
**Independent Test**: The full regression suite covers free-form update/complete/delete, exact-match success, ambiguity fail-closed, not-found behavior, and logging of resolver decisions.
**Prompt**: `kitty-specs/002-natural-language-task-mutations/tasks/WP07-testing-hardening.md`
**Estimated Prompt Size**: ~280 lines

**Requirements Refs**: FR-005, FR-006, FR-007, FR-008

### Included Subtasks
- [x] T071 Add end-to-end mutation regressions in `tests/regression.test.js` and `tests/run-regression-tests.mjs`
- [x] T072 Add coverage for mixed create+mutation rejection and underspecified references such as pronoun-only target queries
- [x] T073 Assert that logs and diagnostics capture mutation intent, candidate sets, chosen target, and skipped reasons
- [x] T074 Clean up stale comments, fixtures, and harness assumptions so `001` and `002` share one coherent mutation path

### Implementation Notes
- Prefer extending the current regression surfaces over adding large new test packages.
- Keep stabilization work tied to the accepted spec; do not reopen scope.
- This package is the final guardrail before `/spec-kitty.review`, not a place to invent additional UX.

### Parallel Opportunities
- None.

**Dependencies**: WP06.

### Risks & Mitigations
- Risk: feature lands with happy-path coverage only.
- Mitigation: make ambiguity, not-found, and fail-closed delete behavior first-class regression cases.
