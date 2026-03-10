---
work_package_id: WP03
title: 'Normalizer: Title, Content & Recurrence'
lane: "done"
dependencies: []
base_branch: master
base_commit: 0f42d9bc6193d92f754291f4095b071b21db9797
created_at: '2026-03-10T15:08:33.444300+00:00'
subtasks: [T013, T014, T015, T016]
shell_pid: "25264"
agent: "Gemini"
reviewed_by: "TickTick Bot"
review_status: "approved"
history:
- date: '2026-03-09'
  action: created
  by: spec-kitty.tasks
---

# WP03 — Normalizer: Title, Content & Recurrence

## Objective

Build the deterministic normalizer module (`services/normalizer.js`) that transforms raw AX intent actions into clean, validated, execution-ready normalised actions. This WP covers the core transformations: title cleaning, content filtering, and recurrence conversion.

## Implementation Command

```bash
spec-kitty implement WP03
```

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

**Purpose**: Filter task content to keep only useful references (URLs, locations, instructions) and strip motivational/coaching filler per FR-007.

**Steps**:
1. Add `_normalizeContent(rawContent, existingContent)` internal function
2. Content cleaning:
   a. Strip motivational phrases: "You've got this!", "Stay focused!", "Remember your goals", etc.
   b. Strip coaching prose: "This is important because...", "Consider breaking this down..."
   c. Strip analysis noise: "Priority justification: ...", "This aligns with..."
   d. Preserve: URLs (http/https), locations, specific instructions, technical details
   e. Preserve: Sub-step lists that are actionable
3. Content preservation (FR-007) for updates:
   a. If `existingContent` is provided and `rawContent` differs:
      - Check if new content adds value (not just noise)
      - If yes: append new content below existing, separated by "\n---\n"
      - If no (only filler): keep existing content unchanged
   b. If `existingContent` is null/empty: use cleaned `rawContent`
4. Return cleaned/merged content (or `null` if empty after cleaning)

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
- Existing content has formatting: preserve formatting exactly
- New content duplicates existing: skip duplication

**Validation**:
- [ ] Content with only URLs → URLs preserved
- [ ] Content with "You've got this! Check https://example.com" → "https://example.com"
- [ ] Update preserves existing content when new content is noise
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
- **Content merge complexity**: Merging logic must handle various formatting (markdown, plain text, lists)

## Reviewer Guidance

- Test title normalisation with real user messages from production logs
- Verify RRULE output matches what TickTick actually accepts
- Check content preservation scenarios: existing content + new useful content, existing + noise, existing + duplicate

## Activity Log

- 2026-03-10T15:08:38Z – Gemini – shell_pid=14756 – lane=doing – Assigned agent via workflow command
- 2026-03-10T15:09:07Z – Gemini – shell_pid=14756 – lane=for_review – Moved to for_review
- 2026-03-10T15:11:34Z – Gemini – shell_pid=25264 – lane=doing – Started review via workflow command
- 2026-03-10T15:17:57Z – Gemini – shell_pid=25264 – lane=done – Review passed: Normalizer correctly handles title cleaning, content filtering, and recurrence conversion as per spec.
