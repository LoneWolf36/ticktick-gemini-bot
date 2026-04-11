---
work_package_id: WP03
title: 'Normalizer: Title, Content & Recurrence'
dependencies: []
base_branch: master
base_commit: 0f42d9bc6193d92f754291f4095b071b21db9797
created_at: '2026-03-10T15:08:33.444300+00:00'
subtasks: [T013, T014, T015, T016]
authoritative_surface: src/
execution_mode: code_change
mission_id: 01KNT55PMWQ9GQH7JH6E61VDZD
owned_files:
- src/**
wp_code: WP03
---

# WP03 — Normalizer: Title, Content & Recurrence

## Objective

Build the deterministic normalizer module (`services/normalizer.js`) that transforms raw AX intent actions into clean, validated, execution-ready normalised actions. This WP covers the core transformations: title cleaning, content filtering, and recurrence conversion.

## Implementation Command

```bash
spec-kitty implement WP03
```

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature protects the task-writing path so the assistant can turn natural language into clean TickTick actions without leaking context, inflating titles, adding unnecessary commentary, or creating task clutter that makes execution harder.

**Implementation must**:
- Keep task creation and mutation cognitively light: short confirmations, no analysis unless needed, and no extra decision burden for clear requests.
- Prefer correctness over confidence: ambiguous task intent, project choice, recurrence, or mutation target must clarify or fail closed instead of guessing.
- Preserve the single structured path AX intent -> normalizer -> TickTick adapter so future behavioral features can reason about actions consistently.

**Implementation must not**:
- The implementation restores prompt-only task execution, bypasses the adapter, or lets model prose decide writes directly.
- The implementation creates verbose coaching around straightforward task writes.
- The implementation makes more tasks when one correct task or one clarification would better support execution.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission is the safe execution foundation. It turns Telegram language into reliable TickTick task writes through the accepted path: AX intent -> normalizer -> ticktick-adapter. Its value is not task storage by itself; its value is reducing friction without creating clutter, wrong tasks, inflated tasks, or silent data loss. It must keep clear task capture terse and dependable so later behavioral guidance can rely on accurate task state.

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

## Context

**Current state**: Normalisation is scattered across `bot/commands.js`:
- `normalizeActionChanges` (lines 652-818) — handles title, content, dates, priority
- `normalizeActionType` (lines 592-601) — maps action type aliases
- `resolveDueDate` (lines 613-650) — date parsing

These will be replaced by a single `normalizer.js` module.

**Key rules from spec**:
- FR-006: Titles MUST be short, verb-led, free from dates/priorities/project names/leaked context
- FR-007: Content MUST only contain useful references (URLs, locations, instructions) and MUST preserve existing content during updates
- FR-008: Recurrence must produce a single recurring task with proper `repeatFlag`, not manual copies

---

## Subtask T013: Create Normalizer Module Structure

**Purpose**: Establish the module with its entry point function and internal helper architecture.

**Steps**:
1. Create `services/normalizer.js`
2. Define and export:
   ```javascript
   export function normalizeAction(intentAction, options = {}) { ... }
   export function normalizeActions(intentActions, options = {}) { ... }
   ```
3. `options` shape:
   ```javascript
   {
     maxTitleLength: 80,              // configurable title limit
     currentDate: new Date(),          // for relative date expansion
     timezone: 'Europe/Dublin',        // for date calculations
     existingTaskContent: null,        // for content preservation (FR-007)
     projects: [],                     // cached project list for resolution
     defaultProjectId: null            // fallback project
   }
   ```
4. `normalizeAction` returns a `NormalizedAction`:
   ```javascript
   {
     type: 'create' | 'update' | 'complete' | 'delete',
     title: string,
     content: string | null,
     priority: 0 | 1 | 3 | 5 | null,
     projectId: string | null,
     dueDate: string | null,           // ISO date string
     repeatFlag: string | null,        // RRULE string
     valid: boolean,                   // validation result
     validationErrors: string[]        // reasons if invalid
   }
   ```
5. `normalizeActions` calls `normalizeAction` for each intent, handling `splitStrategy` expansion

**Files**:
- `services/normalizer.js` (new, ~40 lines for structure)

**Validation**:
- [ ] Module exports both functions
- [ ] Returns structured NormalizedAction objects
- [ ] Unknown input fields are ignored (not passed through)

---

## Subtask T014: Title Normalization

**Purpose**: Clean task titles to be short, verb-led, and free from noise per FR-006.

**Steps**:
1. Add `_normalizeTitle(rawTitle, maxLength)` internal function
2. Transformations (in order):
   a. Trim whitespace
   b. Capitalise first letter
   c. Strip leading articles ("a ", "the ", "an ") if followed by a verb
   d. Strip date references embedded in title (e.g., "Buy groceries tomorrow" → "Buy groceries")
   e. Strip priority markers (e.g., "URGENT: Fix bug" → "Fix bug")
   f. Strip project/category prefixes (e.g., "[Work] Submit report" → "Submit report")
   g. Strip leaked context (personal details, excessive adjectives)
   h. Truncate to `maxLength` characters, breaking at word boundary
   i. If truncated, suffix with "…" (within limit)
3. Return cleaned title

**Regex patterns to strip**:
```javascript
const DATE_PATTERNS = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+\w+|this\s+\w+)\b/gi;
const PRIORITY_PATTERNS = /^(urgent|important|critical|asap|high priority)[:\s-]*/i;
const BRACKET_PREFIX = /^\[.*?\]\s*/;
```

**Files**:
- `services/normalizer.js` (~40 lines)

**Edge Cases**:
- Title is already clean: return as-is
- Title is only a date ("tomorrow"): return empty → validation fail
- Title after stripping is empty: return original title (don't strip)
- Very short title ("gym"): capitalise → "Gym" (acceptable)

**Validation**:
- [ ] "Book dentist appointment Thursday" → "Book dentist appointment"
- [ ] "URGENT: Fix login bug" → "Fix login bug"
- [ ] "[Work] Submit quarterly report" → "Submit quarterly report"
- [ ] "Buy groceries" → "Buy groceries" (untouched)
- [ ] Long title (100+ chars) → truncated at word boundary with "…"

---

## Subtask T015: Content Normalization

**Purpose**: Filter new incoming task content to keep only useful references (URLs, locations, instructions) and strip motivational/coaching filler per FR-007. The normalizer does not merge with existing TickTick descriptions; adapter `updateTask` owns that merge.

**Steps**:
1. Add `_normalizeContent(rawContent)` internal function, or keep any existing-content argument strictly as a read-only duplicate-detection hint. It must not produce pre-merged content for the adapter.
2. Content cleaning:
   a. Strip motivational phrases: "You've got this!", "Stay focused!", "Remember your goals", etc.
   b. Strip coaching prose: "This is important because...", "Consider breaking this down..."
   c. Strip analysis noise: "Priority justification: ...", "This aligns with..."
   d. Preserve: URLs (http/https), locations, specific instructions, technical details
   e. Preserve: Sub-step lists that are actionable
3. Content preservation handoff (FR-007) for updates:
   a. If `rawContent` cleans down to useful new content, return that cleaned new content only.
   b. If `rawContent` is filler/noise, return `null` so existing content remains unchanged.
   c. Do not append existing content, add separators, or create a combined description in the normalizer.
4. Return cleaned new content (or `null` if empty after cleaning)

**Filler patterns to strip**:
```javascript
const FILLER_PATTERNS = [
  /you('ve| have) got this!?/gi,
  /stay (focused|motivated|on track)!?/gi,
  /remember (your|to|that).*$/gim,
  /this (is important|aligns|helps|supports).*$/gim,
  /priority (justification|reasoning|rationale):.*$/gim,
  /consider (breaking|splitting|starting).*$/gim,
];
```

**Files**:
- `services/normalizer.js` (~50 lines)

**Edge Cases**:
- Content is entirely filler: return `null`
- Content has a URL buried in filler: extract and keep URL
- Existing content has formatting: adapter preserves formatting exactly during its merge.
- New content duplicates existing: normalizer may return `null` if duplicate evidence is available; adapter must still guard against duplication.

**Validation**:
- [ ] Content with only URLs → URLs preserved
- [ ] Content with "You've got this! Check https://example.com" → "https://example.com"
- [ ] Update preserves existing content when new content is noise by returning `null` and letting the adapter keep the current description
- [ ] Clean content passes through unchanged

---

## Subtask T016: RepeatHint → RepeatFlag (RRULE) Conversion

**Purpose**: Convert natural-language recurrence hints from AX output into TickTick-compatible `repeatFlag` strings (RRULE format).

**Steps**:
1. Add `_convertRepeatHint(repeatHint)` internal function
2. Mapping table:
   ```javascript
   const REPEAT_MAPPINGS = {
     'daily':     'RRULE:FREQ=DAILY;INTERVAL=1',
     'weekdays':  'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
     'weekends':  'RRULE:FREQ=WEEKLY;BYDAY=SA,SU',
     'weekly':    'RRULE:FREQ=WEEKLY;INTERVAL=1',
     'biweekly':  'RRULE:FREQ=WEEKLY;INTERVAL=2',
     'monthly':   'RRULE:FREQ=MONTHLY;INTERVAL=1',
     'yearly':    'RRULE:FREQ=YEARLY;INTERVAL=1',
   };
   ```
3. Day-specific patterns:
   ```javascript
   // "every monday" → RRULE:FREQ=WEEKLY;BYDAY=MO
   // "every tuesday and thursday" → RRULE:FREQ=WEEKLY;BYDAY=TU,TH
   // "every sunday" → RRULE:FREQ=WEEKLY;BYDAY=SU
   ```
   - Parse day names from hint
   - Map to RRULE `BYDAY` codes: MO, TU, WE, TH, FR, SA, SU
4. If `repeatHint` is `null`/empty, return `null` (not recurring)
5. If `repeatHint` doesn't match any pattern, return `null` and log a warning

**Files**:
- `services/normalizer.js` (~45 lines)

**Edge Cases**:
- "every other day" → `RRULE:FREQ=DAILY;INTERVAL=2`
- "twice a week" → ambiguous, return `null` + log warning
- "every weekday" → synonym for "weekdays"
- Mixed case: "Every Monday" → normalise to lowercase first

**Validation**:
- [ ] "daily" → `RRULE:FREQ=DAILY;INTERVAL=1`
- [ ] "weekdays" → `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`
- [ ] "every sunday" → `RRULE:FREQ=WEEKLY;BYDAY=SU`
- [ ] "every tuesday and thursday" → `RRULE:FREQ=WEEKLY;BYDAY=TU,TH`
- [ ] null input → null output
- [ ] Unrecognised pattern → null + console warning

---

## Definition of Done

- [ ] `services/normalizer.js` exports `normalizeAction` and `normalizeActions`
- [ ] Titles are short, verb-led, noise-free per FR-006
- [ ] Content is filtered to useful references only per FR-007
- [ ] Content preservation works during updates (existing content not overwritten)
- [ ] RepeatHint converts to valid RRULE strings for TickTick
- [ ] Unknown/unrecognised inputs degrade gracefully (return null, not crash)

## Risks

- **Regex over-stripping**: Date or filler patterns may match legitimate content — needs careful testing
- **RRULE compatibility**: TickTick may have specific RRULE requirements beyond standard — verify with API docs
- **Content merge complexity**: The normalizer must not perform the merge. Merge complexity belongs to `TickTickAdapter.updateTask`, which has current task state.

## Reviewer Guidance

- Test title normalisation with real user messages from production logs
- Verify RRULE output matches what TickTick actually accepts
- Check content handoff scenarios: new useful content passes through cleaned, noise returns `null`, duplicate evidence does not cause pre-merged output

## Activity Log

- 2026-03-10T15:08:38Z – Gemini – shell_pid=14756 – lane=doing – Assigned agent via workflow command
- 2026-03-10T15:09:07Z – Gemini – shell_pid=14756 – lane=for_review – Moved to for_review
- 2026-03-10T15:11:34Z – Gemini – shell_pid=25264 – lane=doing – Started review via workflow command
- 2026-03-10T15:17:57Z – Gemini – shell_pid=25264 – lane=done – Review passed: Normalizer correctly handles title cleaning, content filtering, and recurrence conversion as per spec.

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
The deterministic normalizer module (services/normalizer.js) handling title cleaning (FR-006), content filtering (FR-007), content preservation for updates, and repeatHint-to-RRULE conversion.

#### What's Actually Done:
Marked done. normalizer.js created with normalizeAction/normalizeActions, title cleaning, content filtering, and recurrence conversion. Review passed without issues.

#### Gaps Found:
- No significant gaps. The WP is well-scoped and the review confirmed alignment with spec.
- Content preservation logic overlaps with WP01's adapter.updateTask content merge — this is a known design tension (see WP01 review Issue 2).

#### Product Vision Alignment Issues:
- Strongly aligned. Title cleaning and content filtering directly support "correctness matters more than confidence" and "the system should be cognitively light" — stripping noise from task titles reduces mental load.
- Content preservation prevents data loss, supporting trust in the system.
- RRULE conversion supports the Product Vision's need to handle recurring patterns without manual overhead.

#### Recommendations:
- No immediate action needed. The content preservation ownership between normalizer and adapter should be resolved at the pipeline level (WP05) to prevent double-merge scenarios.

#### Closure Added 2026-04-11:
- The current mission documents now resolve this ownership: the normalizer cleans new incoming content only, the pipeline passes that cleaned content unchanged, and `TickTickAdapter.updateTask` performs the only merge with existing TickTick content.
