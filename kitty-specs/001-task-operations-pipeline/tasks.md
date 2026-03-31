# Task Operations Pipeline — Work Packages

**Feature**: 001-task-operations-pipeline
**Created**: 2026-03-09
**Total Subtasks**: 31
**Total Work Packages**: 7
**Estimated Effort**: Medium-Complex

---

## Phase 1: TickTick Adapter (Foundations)

### WP01 — TickTick Adapter Module (~500 lines)

**Goal**: Refactor `services/ticktick.js` into a compliant adapter that exposes the FR-015 interface and centralises all TickTick REST API interactions.

**Priority**: P1 — Foundation for all subsequent work
**Dependencies**: None
**Parallelisable with**: WP02, WP03

**Requirement Refs**: FR-004, FR-005, FR-014, FR-015, FR-016

**Included Subtasks**:
- [x] **T001** [P] — Create `services/ticktick-adapter.js` class wrapping existing `TickTickClient`
- [x] **T002** [P] — Implement `listProjects()` with result caching for the project map
- [x] **T003** [P] — Implement `findProjectByName(name)` with deterministic + fuzzy matching
- [x] **T004** [P] — Implement `createTask(normalizedAction)` mapping normalised fields to TickTick API format
- [x] **T005** [P] — Implement `createTasksBatch(normalizedActions)` with per-item error handling
- [x] **T006** [P] — Implement `updateTask(taskId, normalizedAction)` with content preservation (FR-007)
- [x] **T007** [P] — Implement `completeTask(taskId)` and `deleteTask(taskId)`
- [x] **T008** — Add structured pipeline logging for all adapter operations (FR-014)

**Implementation Sketch**:
1. Create `TickTickAdapter` class that takes a `TickTickClient` instance in constructor
2. Expose narrow public API matching FR-015
3. Internal methods handle field mapping (normalised → API shape)
4. All methods log: operation type, input, result, timing
5. Error handling wraps TickTick errors into adapter-level errors with context

**Risks**:
- Content preservation logic during updates is nuanced — must merge not overwrite
- Batch creation may hit rate limits — needs per-item error isolation

**Prompt file**: `tasks/WP01-ticktick-adapter.md`

---

## Phase 2: AX and Normalizer Layer

### WP02 — AX Setup & Intent Extraction (~300 lines)

**Goal**: Integrate AX (`@ax-llm/ax`) with Gemini provider and key rotation, producing structured intent objects from natural-language messages.

**Priority**: P1 — Core extraction engine
**Dependencies**: None
**Parallelisable with**: WP01, WP03

**Requirement Refs**: FR-001, FR-002

**Included Subtasks**:
- [x] **T009** — Add `@ax-llm/ax` to project dependencies
- [x] **T010** — Create `services/ax-intent.js` with AX + Gemini provider configured via `apiKey` callback for key rotation
- [x] **T011** — Define AX signature matching Intent Action spec: `type`, `title`, `content`, `priority`, `projectHint`, `dueDate`, `repeatHint`, `splitStrategy`, `confidence`
- [x] **T012** — Add quota-exhaustion error handler: on AX failure after retries, mark key unavailable and rotate

**Implementation Sketch**:
1. Install AX, create module that initialises AxAI with Gemini provider
2. `apiKey` callback delegates to existing `GeminiAnalyzer._keys` rotation
3. Define typed signature for intent extraction (supports multi-action output)
4. Export `extractIntents(userMessage, currentTasks)` function

**Risks**:
- AX Gemini provider integration is new — verify apiKey callback support
- Multi-action extraction quality depends on prompt/signature design

**Prompt file**: `tasks/WP02-ax-intent-extraction.md`

---

### WP03 — Normalizer: Title, Content & Recurrence (~350 lines)

**Goal**: Build the deterministic normalizer module that cleans AX output — title truncation, content filtering, and recurrence conversion.

**Priority**: P1 — Quality gate between AI and execution
**Dependencies**: None
**Parallelisable with**: WP01, WP02

**Requirement Refs**: FR-003, FR-006, FR-007, FR-008

**Included Subtasks**:
- [x] **T012**: Create `services/normalizer.js` with module structure.
- [x] **T013**: Implement `_normalizeTitle` (cleaning, verb prefix, casing).
- [x] **T014**: Implement `_normalizeContent` (preserving sensible existing descriptions without rewriting).
- [x] **T015**: Implement `_convertRepeatHint` (hint to strict `RRULE` mapping using date-fns or static map).

**Implementation Sketch**:
1. Module exports `normalizeAction(intent, options)` and `normalizeActions(intents, options)`
2. Title normalizer: regex + rules-based, max chars configurable
3. Content normalizer: allowlist approach (keep URLs, locations, instructions; drop everything else unless explicitly useful)
4. Recurrence converter: map natural-language hints to TickTick RRULE format

**Risks**:
- Recurrence edge cases (e.g., "every other Tuesday") may need iteration
- Content preservation during updates requires access to existing task content

**Prompt file**: `tasks/WP03-normalizer-title-content-recurrence.md`

---

### WP04 — Normalizer: Project Resolution, Dates & Validation (~300 lines)

**Goal**: Complete the normalizer with project resolution, date expansion, split strategy handling, and validation.

**Priority**: P1 — Completes the normalisation pipeline
**Dependencies**: WP01 (needs adapter for project list), WP03 (extends normalizer module)

**Requirement Refs**: FR-003, FR-009, FR-010, FR-013

**Included Subtasks**:
- [x] **T017** — Implement `projectHint` → `projectId` resolution using cached project list from adapter
- [x] **T018** [P] — Implement `dueDate` expansion: relative dates (today, tomorrow, next Thursday) → absolute ISO dates
- [x] **T019** — Implement `splitStrategy` handling: multi-task splitting and multi-day splitting (FR-009)
- [x] **T020** — Implement validation gate: reject actions with invalid fields, low confidence, malformed data (FR-013)

**Implementation Sketch**:
1. Project resolution: fuzzy match `projectHint` against project names, fall back to default
2. Date expansion: parse relative expressions to absolute using `USER_TIMEZONE`
3. Split strategy: when `splitStrategy` = `multi-day`, duplicate normalised action per distinct date; when N intents, keep as separate actions
4. Validation: check required fields present, confidence above threshold, field values within allowed ranges

**Risks**:
- Date parsing for relative expressions ("next Thursday", "this Friday") is locale/timezone-sensitive
- Multi-day vs recurrence distinction must align with AX intent output quality

**Prompt file**: `tasks/WP04-normalizer-resolution-validation.md`

---

## Phase 3: Pipeline Integration

### WP05 — Pipeline Orchestrator & Telegram Integration (~400 lines)

**Goal**: Wire all layers (AX → Normalizer → Adapter) into a single pipeline module and connect it to the Telegram DM handler.

**Priority**: P1 — Makes the feature work end-to-end
**Dependencies**: WP01, WP02, WP03, WP04

**Requirement Refs**: FR-004, FR-011, FR-012, FR-014, FR-016

**Included Subtasks**:
- [x] **T021** — Create `services/pipeline.js` orchestrator: message → AX → normalise → adapter → result
- [x] **T022** — Integrate pipeline with Telegram DM handler in `bot/index.js` (replace legacy `converse` path)
- [x] **T026** — Implement graceful API failure handling (FR-016): preserve parsed intent on TickTick unavailability, notify user
- [x] **T027** — Wire terse confirmation responses (FR-011): replace verbose analysis with short confirmations

**Implementation Sketch**:
1. `pipeline.js` exports `processMessage(userMessage, { ticktickAdapter, axIntent, normalizer })`
2. Returns `{ success, actions[], confirmationText, errors[] }`
3. Telegram handler calls pipeline instead of `gemini.converse()` for task-related messages
4. On TickTick API failure: return parsed intents to user with "saved but not synced" message
5. Confirmation messages: "Created: {title}" / "Created {n} tasks" / "Updated: {title}"

**Risks**:
- Message routing: distinguishing task-intent messages from conversational/coaching messages
- Error accumulation across pipeline stages needs clean aggregation

**Prompt file**: `tasks/WP05-pipeline-orchestrator.md`

---

### WP06 — Command Migration: /scan & /review (~300 lines)

**Goal**: Migrate `/scan` and `/review` commands from legacy Gemini analysis to the new AX → Normalizer → Adapter pipeline.

**Priority**: P2 — Required for full coverage
**Dependencies**: WP05

**Requirement Refs**: FR-004, FR-005

**Included Subtasks**:
- [x] **T023** — Migrate `/scan` command to use new pipeline (replace `runTaskIntake` legacy path)
- [x] **T024** — Migrate `/review` command to use new pipeline
- [x] **T025** — Hook `autoApply` and inline callback actions to use `TickTickAdapter` instead of direct client calls

**Implementation Sketch**:
1. `/scan`: Replace `runTaskIntake` call with pipeline invocation for each unreviewed task
2. `/review`: Route through pipeline for task mutations
3. `autoApply`: Change to call `ticktickAdapter.updateTask()` instead of direct `ticktick.updateTask()`
4. Callbacks: Route approval/skip/drop through adapter

**Risks**:
- /scan batching logic may need adjustment for pipeline's per-message model
- autoApply has edge cases around project moves and rollbacks

**Prompt file**: `tasks/WP06-command-migration.md`

---

## Phase 4: Verification and Cleanup

### WP07 — Legacy Cleanup (~250 lines)

**Goal**: Remove dead code paths replaced by the new pipeline: legacy schemas, prompts, and inline normalisation logic.

**Priority**: P3 — Polish and housekeeping
**Dependencies**: WP06

**Requirement Refs**: FR-005

**Included Subtasks**:
- [x] **T028** — Remove legacy `converseSchema` and `gemini.converse()` task creation logic
- [x] **T029** — Remove legacy `ANALYZE_PROMPT` usage where replaced by AX
- [x] **T030** — Remove `executeActions` inline normalisation functions now handled by `normalizer.js`
- [x] **T031** — Clean up `bot/commands.js`: remove dead imports, unused helpers, stale comments

**Implementation Sketch**:
1. Identify all `converseSchema` references → remove from `schemas.js` and `gemini.js`
2. Identify `ANALYZE_PROMPT` references used for task flows → remove (preserve for /briefing, /weekly)
3. Remove `normalizeActionType`, `normalizeActionChanges`, `resolveDueDate`, etc. from `commands.js` where superseded
4. Verify no remaining direct `ticktick.*Task()` calls outside adapter

**Risks**:
- Must not break `/briefing` and `/weekly` which stay on legacy gemini.js
- `executeActions` may have shared helpers needed by non-migrated flows

**Prompt file**: `tasks/WP07-legacy-cleanup.md`

---

## Summary

| WP | Title | Subtasks | Est. Lines | Phase | Dependencies |
|----|-------|----------|-----------|-------|-------------|
| WP01 | TickTick Adapter | 8 | ~500 | 1 | None |
| WP02 | AX Intent Extraction | 4 | ~300 | 2 | None |
| WP03 | Normalizer: Title/Content/Recurrence | 4 | ~350 | 2 | None |
| WP04 | Normalizer: Resolution/Validation | 4 | ~300 | 2 | WP01, WP03 |
| WP05 | Pipeline Orchestrator | 4 | ~400 | 3 | WP01-04 |
| WP06 | Command Migration | 3 | ~300 | 3 | WP05 |
| WP07 | Legacy Cleanup | 4 | ~250 | 4 | WP06 |

**Parallelisation highlights**: WP01, WP02, WP03 can run in parallel.

**MVP scope**: WP01 + WP02 + WP03 + WP04 + WP05 = end-to-end task creation via Telegram DM.

<!-- status-model:start -->
## Canonical Status (Generated)
- WP01: done
- WP02: done
- WP03: done
- WP04: done
- WP05: done
- WP06: done
- WP07: done
<!-- status-model:end -->
