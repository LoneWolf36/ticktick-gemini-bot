# 005-checklist-subtask-support Implementation Plan

**Feature**: Checklist Subtask Support (Create-Time)
**Created**: 2026-04-11
**Status**: Ready for Implementation
**Mission**: software-dev
**Input**: Refined `spec.md` with key decisions on LLM-driven intent detection, TickTick API checklist format, clarification UX, and extraction caps

---

## Product Vision Alignment Contract

This implementation plan is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

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

## Overview

This feature adds create-time checklist extraction to the existing AX → Normalizer → Adapter pipeline. When a user sends a request like "plan trip: book flights, pack bags, renew travel card", the system creates one TickTick task with checklist items instead of collapsing everything into one noisy title or spawning independent tasks.

The TickTick API supports checklist items via an `items` array on task creation. Each item has a `title` (required), optional `status` (0 = normal, 1 = completed), `sortOrder`, and date fields. This feature leverages that existing API surface.

Key design decisions:
- **LLM determines checklist intent vs multi-task intent** via AX extraction with explicit instruction patterns
- **TickTick API `items` array** carries checklist items on create (format confirmed via external API research)
- **Clarification via reply message** when intent is ambiguous, with fallback to AI best judgment if user ignores the prompt
- **AX extracts checklist items** in TickTick API-compatible format
- **Reasonable cap** on checklist items (30 default if API limit unknown)

The implementation extends three existing modules (`ax-intent.js`, `normalizer.js`, `ticktick-adapter.js`) and wires them through the pipeline without creating new service layers.

---

## Technical Context

### Existing Pipeline Shape
- `services/ax-intent.js`: AX extraction with LLM-powered intent detection, quota-aware key rotation
- `services/normalizer.js`: Title/content normalization, project resolution, date expansion, repeat-hint conversion
- `services/ticktick-adapter.js`: All TickTick API writes, field validation, error classification
- `services/pipeline.js`: Orchestrates AX → Normalizer → Adapter flow with rollback, observability, and result building

### TickTick API Checklist Format
Confirmed via external API research. Task creation accepts an `items` array:
```json
{
  "title": "Parent Task Title",
  "content": "Optional description",
  "items": [
    {
      "title": "Checklist item 1",
      "status": 0,
      "sortOrder": 0
    },
    {
      "title": "Checklist item 2",
      "status": 0,
      "sortOrder": 1
    }
  ]
}
```

Fields per item:
- `title` (string, required): Checklist item text
- `status` (number, optional): 0 = Normal, 1 = Completed
- `sortOrder` (number, optional): Display order
- `startDate` (string, optional): ISO 8601 format
- `isAllDay` (boolean, optional): All-day flag
- `timeZone` (string, optional): Timezone string
- `completedTime` (string, optional): ISO 8601 completion timestamp

### Constraints
- Out of scope: updating checklist items on existing tasks, nested subtasks, checklist replace/delete semantics
- V1 is create-time only
- Deeply nested steps flatten to one checklist level
- Checklist item text is cleaned separately from parent task title

---

## Charter Check

No charter file was found at `.kittify/memory/charter.md` during planning. This plan follows the repo's AGENTS.md conventions and Spec Kitty v3.1.1 charter contract:
- ESM only, 4-space indentation, semicolons, camelCase for variables/functions
- New checklist flows stay on the existing path: AX intent → normalizer → ticktick-adapter
- No direct TickTick client calls from bot handlers
- Testing anchored in existing regression surfaces

---

## Gate Validation

Before implementation begins:
- [x] Spec.md refined with key decisions documented
- [x] TickTick API checklist format confirmed via external research
- [x] Plan.md created with explicit sequencing and dependency chain
- [x] Tasks.md created with work packages, subtasks, and acceptance criteria
- [ ] Charter check: N/A (no charter file exists at planning time)
- [ ] Review gate: Plan ready for WP prompt generation and implementation

---

## Design Decisions

### Checklist vs Multi-Task Intent Detection
The LLM (via AX) determines whether a request is one task with sub-items or multiple standalone tasks. AX instructions are extended with explicit rules:
- **Checklist intent**: One parent task with an `items` array when sub-steps belong to a single objective (e.g., "plan trip: book flights, pack bags")
- **Multi-task intent**: Multiple independent create actions when items are standalone (e.g., "book flights, pack bags, and call uber friday")
- **Ambiguous**: When the LLM cannot safely distinguish, it emits a `clarification` flag with a question for the user, falling back to plain task creation if ignored

### Checklist Extraction Format
AX emits checklist items in a TickTick API-compatible shape within the action object:
```json
{
  "type": "create",
  "title": "Plan trip",
  "checklistItems": [
    { "title": "Book flights", "status": 0, "sortOrder": 0 },
    { "title": "Pack bags", "status": 0, "sortOrder": 1 }
  ],
  "splitStrategy": "single",
  "confidence": 0.9
}
```

### Normalizer Checklist Validation
The normalizer validates and normalizes checklist items:
- Caps at 30 items (logs warning if truncated)
- Cleans item text (strips filler, ensures non-empty, trims)
- Assigns `sortOrder` sequentially if not provided
- Validates each item has a non-empty `title`
- Parent task title is normalized separately from checklist items

### Adapter Checklist Creation
`TickTickAdapter.createTask()` is extended to accept a `checklistItems` field and map it to the TickTick API `items` array. Field validation is applied per item (title required, status defaults to 0, sortOrder assigned sequentially).

### Clarification UX Flow
When AX detects ambiguous intent:
1. Pipeline returns a `clarification` result type with a question
2. Bot sends the question via Telegram reply
3. User can reply with clarification or ignore it
4. If ignored, the pipeline falls back to the AI's best judgment (conservative: plain task creation)
5. If clarified, the pipeline re-runs with the clarified intent

### Logging
Logging includes:
- Extracted checklist items (raw from AX)
- Normalized checklist items (after validation/cleaning)
- Adapter payload mapping (final `items` array sent to TickTick)

---

## Work Package Strategy

All WPs are sequential to maintain a clean dependency chain:

1. **WP01** extends AX to extract checklist items and detect checklist vs multi-task intent
2. **WP02** extends the normalizer to validate and normalize checklist items
3. **WP03** extends TickTickAdapter to create tasks with checklist items via API
4. **WP04** wires AX → Normalizer → Adapter flow for checklist in the pipeline
5. **WP05** implements the clarification UX flow for ambiguous intent
6. **WP06** adds testing and regression coverage across all surfaces

This produces the dependency chain: WP01 → WP02 → WP03 → WP04 → WP05 → WP06.

---

## Work Package Summary

| WP | Title | Depends On | Primary Files | Complexity |
|----|-------|------------|---------------|------------|
| WP01 | AX Checklist Extraction | None | `services/ax-intent.js`, `services/schemas.js` | Medium |
| WP02 | Normalizer Checklist Validation | WP01 | `services/normalizer.js` | Medium |
| WP03 | TickTickAdapter Checklist Creation | WP02 | `services/ticktick-adapter.js` | Low |
| WP04 | Pipeline Checklist Integration | WP03 | `services/pipeline.js`, `services/pipeline-context.js` | Medium |
| WP05 | Clarification UX Flow | WP04 | `bot/commands.js`, `services/store.js` | High |
| WP06 | Testing & Regression Coverage | WP05 | `tests/regression.test.js`, `tests/run-regression-tests.mjs` | Medium |

---

## Implementation Constraints

- Keep the new code surface minimal. No new service modules beyond extending existing ones.
- Do not create any `src/` tree or additional abstraction layers.
- Do not bypass `TickTickAdapter` for successful writes.
- Checklist creation is v1 only; existing-task checklist mutation is out of scope.
- Mixed create+checklist or multi-checklist requests should be rejected early and explicitly.
- Clarification state must be persisted in the existing store, not in ephemeral in-memory maps.

---

## Testing Strategy

Testing remains anchored in the repo's current test surfaces:

- AX checklist extraction coverage in existing AX test files
- Normalizer checklist validation coverage in existing normalizer test files
- Adapter checklist creation coverage in existing adapter test files
- Pipeline and bot regressions in `tests/regression.test.js` and `tests/run-regression-tests.mjs`
- New focused checklist-specific test scenarios in the existing test files (no separate test file unless needed for isolation)

Test scenarios include:
- Checklist intent vs multi-task intent discrimination
- Checklist item normalization (capping, cleaning, sortOrder assignment)
- Adapter payload mapping to TickTick API `items` format
- Clarification flow (ambiguous intent → question → user reply → re-run)
- Fallback behavior when user ignores clarification
- Edge cases: >30 items, deeply nested steps, empty item text

---

## Definition of Done

The feature should be considered complete only when:

- All WP frontmatter matches the repo's current Spec Kitty v3.1.1 contract
- Every WP points to real repo files and implemented seams
- The dependency chain is explicit and parseable
- Prompt files stay within the enforced sizing rules
- The plan does not introduce scope beyond the accepted spec
- All regression tests pass with checklist scenarios included
- The event log records that the planning artifacts were created after spec refinement

---

## Cost Analysis & Risk Assessment

### Cost Implications
- AX extraction: Minimal additional token cost for checklist item extraction (included in the same LLM call)
- No additional API calls (checklist items are sent in the same task creation request)
- No new external dependencies

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM misclassifies checklist vs multi-task intent | Medium | High | Explicit AX instructions, clarification fallback, regression tests |
| TickTick API rejects `items` array format | Low | High | Validate against confirmed API format, add error handling in adapter |
| Checklist items exceed API limits | Medium | Medium | Cap at 30 items, log warning, truncate gracefully |
| Clarification flow creates user friction | Medium | Medium | Fallback to AI judgment if ignored, keep questions terse |
| Vendor lock-in to TickTick API shape | Low | Low | Isolate `items` mapping in adapter, document the contract |

---

## Concrete Next Steps

1. Generate WP prompt files in `kitty-specs/005-checklist-subtask-support/tasks/`
2. Implement WP01: Extend AX instructions and validation for checklist extraction
3. Implement WP02: Extend normalizer for checklist validation and cleaning
4. Implement WP03: Extend adapter for checklist creation via TickTick API
5. Implement WP04: Wire checklist flow through pipeline
6. Implement WP05: Build clarification UX flow
7. Implement WP06: Add regression test coverage
8. Run full regression suite and verify all scenarios pass
9. Create spec-kitty feature branch and begin WP implementation sequence
