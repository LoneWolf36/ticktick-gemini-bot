# 005-checklist-subtask-support Implementation Plan

**Feature**: Checklist Subtask Support (Create-Time)
**Created**: 2026-04-11
**Status**: Ready for Implementation
**Mission**: software-dev
**Input**: Refined `spec.md` with key decisions on LLM-driven intent detection, TickTick API checklist format, clarification UX, and extraction caps

---

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

## Constitution Check

No constitution file found at `.kittify/memory/constitution.md`. This plan follows the repo's AGENTS.md conventions and spec-kitty v3.1.1 contract:
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
- [ ] Constitution check: N/A (no constitution file exists)
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
