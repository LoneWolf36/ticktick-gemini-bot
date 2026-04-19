---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-19T00:45:00Z"
source_specs: ["005-checklist-subtask-support"]
complexity: "medium"
---

# Cavekit: Checklists

## Scope

Checklist/subtask extraction, creation, and clarification for create-time task operations. Extends the task pipeline's Intent Action shape with an optional `checklistItems` field. Covers distinguishing checklist intent from multi-task intent.

## Requirements

### R1: Checklist Intent Extraction
**Description:** AX extraction supports an optional `checklistItems` field for create actions.
**Acceptance Criteria:**
- [ ] Given "plan trip: book flights, pack bags, renew travel card", AX extracts one create action with `checklistItems: [{title: "Book flights"}, {title: "Pack bags"}, {title: "Renew travel card"}]`
- [ ] Given a long task with primary objective and sub-steps, primary objective becomes title and sub-steps become checklist items
- [ ] Checklist item objects have `{ title, status?, sortOrder? }`
- [ ] This extension does not affect mutation actions from cavekit-task-pipeline
**Dependencies:** cavekit-task-pipeline R1

### R2: Checklist vs Multi-Task Disambiguation
**Description:** System explicitly distinguishes checklist intent (one task with sub-items) from multi-task intent (separate standalone tasks).
**Acceptance Criteria:**
- [ ] Given "plan trip: book flights, pack bags", one parent task with checklist items is created
- [ ] Given "book flights, pack bags, and call uber friday", separate standalone tasks are created
- [ ] Given ambiguous phrasing where checklist vs multi-task cannot be safely distinguished, system asks a clarification question or falls back to plain task creation conservatively
**Dependencies:** R1, cavekit-task-pipeline R2

### R3: Checklist Item Normalization
**Description:** Normalizer cleans checklist item text separately from parent task title normalization.
**Acceptance Criteria:**
- [ ] Checklist item titles are cleaned independently from parent title
- [ ] Deeply nested steps flatten to one checklist level in v1
- [ ] If more checklist items than TickTick supports comfortably, system caps or truncates with logging rather than failing silently
**Dependencies:** R1

### R4: Adapter Checklist Creation
**Description:** TickTickAdapter supports creating tasks with checklist items.
**Acceptance Criteria:**
- [ ] Adapter `createTask` accepts optional `checklistItems` array and maps it to TickTick API payload
- [ ] Created task in TickTick has the correct checklist items visible
**Dependencies:** cavekit-task-pipeline R4

### R5: Terse Checklist Confirmations
**Description:** User-facing confirmations mention checklist work tersely without dumping every checklist item.
**Acceptance Criteria:**
- [ ] Confirmation says something like "Created: Plan trip (3 items)" — not listing every sub-item
**Dependencies:** cavekit-task-pipeline R8

### R6: Checklist Pipeline Logging
**Description:** Logging includes extracted checklist items, normalized checklist items, and adapter payload mapping.
**Acceptance Criteria:**
- [ ] Logs show extracted checklist items from AX
- [ ] Logs show normalized checklist items after cleaning
- [ ] Logs show adapter payload mapping for checklist creation
**Dependencies:** cavekit-task-pipeline R12

### R7: Regression Coverage
**Description:** Checklist flows have dedicated test coverage in the pipeline harness.
**Acceptance Criteria:**
- [ ] Test: checklist intent creates parent task with items
- [ ] Test: multi-task intent creates separate tasks (not checklist)
- [ ] Test: ambiguous intent triggers clarification
- [ ] Test: over-limit checklist items are truncated
- [ ] Existing pipeline tests continue to pass
**Dependencies:** cavekit-pipeline-hardening R6

## Out of Scope

- Updating checklist items on existing tasks
- Checklist replace and delete semantics on existing tasks
- Nested subtasks beyond one checklist depth
- Checklist mutation in 002's mutation flows

## Cross-References

- See also: cavekit-task-pipeline.md (checklist extends the create path defined here)
- See also: cavekit-pipeline-hardening.md (regression coverage)

## Validation Action Items — 2026-04-19

- [x] `tests/e2e-live-checklist.mjs` excluded from drift checks — it is a mocked logic validator redundant with `regression.test.js`, kept only for interactive debugging.

## Changelog
- 2026-04-18: Migrated from kitty-specs 005-checklist-subtask-support
