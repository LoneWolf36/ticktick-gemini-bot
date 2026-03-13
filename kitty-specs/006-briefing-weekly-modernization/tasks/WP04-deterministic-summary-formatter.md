---
work_package_id: WP04
title: Deterministic Summary Formatter
lane: "for_review"
dependencies:
- WP01
base_branch: 006-briefing-weekly-modernization-WP01
base_commit: 81b1897ea138b8870e8750afd02aeab81961dc52
created_at: '2026-03-13T17:26:56.015642+00:00'
subtasks:
- T017
- T018
- T019
- T020
- T021
phase: Phase 2 - Parallel Core
assignee: ''
agent: "codex"
shell_pid: "28472"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-12T21:27:55Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-001
- FR-002
- FR-004
- FR-007
---

# Work Package Prompt: WP04 - Deterministic Summary Formatter

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task.**

- **Has review feedback?** Check the `review_status` field above. If it says `has_feedback`, read the Review Feedback section immediately.
- **You must address all feedback** before the work is complete.
- **Mark as acknowledged** when you begin addressing review feedback.
- **Report progress** by appending Activity Log entries in chronological order.

---

## Review Feedback

> Populated by `/spec-kitty.review` when changes are requested.

*[This section is empty initially. If reviewers add items here later, each item becomes mandatory implementation scope.]*  

---

## Markdown Formatting

Wrap HTML/XML tags in backticks: `` `<div>` ``, `` `<script>` ``  
Use language identifiers in fenced code blocks.

---

## Objectives & Success Criteria

- Render both structured summary kinds into deterministic Telegram-safe output with stable section order.
- Preserve recognizable headers and urgent-mode reminder semantics without leaving final copy generation to Gemini.
- Keep formatter ownership narrow: rendering only, no raw-task inspection and no policy recomputation.
- Provide formatter-focused regressions so downstream integration work can rely on stable output invariants.

## Context & Constraints

- Implementation command: `spec-kitty implement WP04 --base WP01`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `kitty-specs/006-briefing-weekly-modernization/quickstart.md`
  - `.kittify/memory/constitution.md`
- Start from the fixed top-level section contracts defined in WP01. Do not rename or collapse sections here.
- Preserve tone closely. This package may standardize rendering, but it must not introduce a broad copy rewrite.
- `services/summary-surfaces/summary-formatter.js` must accept structured summary objects only. It must not inspect raw tasks, processed history, or ranking internals.

## Subtasks & Detailed Guidance

### Subtask T017 - Implement the daily section renderer in `services/summary-surfaces/summary-formatter.js`
- **Purpose**: Turn the structured daily summary into a stable Telegram message body that preserves the clarified section order and current surface feel.
- **Steps**:
  1. Add a daily formatter entry point in `services/summary-surfaces/summary-formatter.js`.
  2. Render daily sections in fixed order: `focus`, `priorities`, `why_now`, `start_now`, `notices`.
  3. Render empty or reduced sections compactly rather than inventing filler copy.
  4. Keep headings and labels close to the existing daily surface so output diffs stay reviewable.
  5. Return a structured render result that can surface `telegramSafe` and `tonePreserved` diagnostics.
- **Files**:
  - `services/summary-surfaces/summary-formatter.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - The formatter should accept a normalized summary object, not a raw Gemini response.
  - Keep daily output compact and ADHD-friendly; avoid verbose connective prose.

### Subtask T018 - Implement the weekly section renderer in `services/summary-surfaces/summary-formatter.js`
- **Purpose**: Render the weekly structured summary with deterministic ordering and explicit fallback visibility.
- **Steps**:
  1. Add a weekly formatter entry point in `services/summary-surfaces/summary-formatter.js`.
  2. Render weekly sections in fixed order: `progress`, `carry_forward`, `next_focus`, `watchouts`, `notices`.
  3. Ensure reduced-digest and missing-history cases still render a coherent weekly output without losing sections.
  4. Keep `watchouts` factual in presentation; do not reframe them into behavioral commentary during rendering.
- **Files**:
  - `services/summary-surfaces/summary-formatter.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - Avoid reviving prompt-era labels such as `AVOIDANCE` or `NEEDLE-MOVER RATIO`.
  - Weekly rendering should make the missing-history notice easy to spot without dominating the whole message.

### Subtask T019 - Preserve headers and urgent-mode reminder semantics through `bot/utils.js`
- **Purpose**: Keep recognizable surface identity and urgent-mode behavior while moving final rendering into deterministic code.
- **Steps**:
  1. Reuse `formatBriefingHeader` and `appendUrgentModeReminder` from `bot/utils.js` where possible.
  2. Decide one clear ownership boundary for header and reminder application so manual and scheduled paths do not double-append them.
  3. If `bot/utils.js` needs a small helper adjustment, keep it additive and backward-safe.
  4. Preserve the existing daily and weekly header semantics and the urgent reminder wording as closely as possible.
- **Files**:
  - `services/summary-surfaces/summary-formatter.js`
  - `services/summary-surfaces/index.js`
  - `bot/utils.js`
- **Parallel?**: No.
- **Notes**:
  - This package may centralize header/reminder application, but it should not change unrelated formatting helpers.
  - Preserve the current urgent reminder visibility on both daily and weekly surfaces.

### Subtask T020 - Add Telegram-safety guards and stable order rules
- **Purpose**: Make formatter output safe for Telegram delivery and stable enough for regression comparisons.
- **Steps**:
  1. Ensure section order is deterministic for both summary kinds.
  2. Avoid unsupported heading syntax, unstable whitespace, or accidental HTML collisions in rendered text.
  3. Reuse existing safety helpers such as `parseTelegramMarkdownToHTML` and `truncateMessage` where they fit the chosen boundary.
  4. Normalize blank lines, bullet output, and reduced-content rendering so identical inputs produce identical message bodies.
  5. Surface `telegramSafe` and related diagnostics without coupling formatter code to transport.
- **Files**:
  - `services/summary-surfaces/summary-formatter.js`
  - `bot/utils.js`
- **Parallel?**: No.
- **Notes**:
  - Keep the formatter transport-aware enough for Telegram constraints, but not coupled to `ctx.reply` or `bot.api.sendMessage`.
  - Stable ordering is a hard acceptance criterion because later parity checks depend on it.

### Subtask T021 - Add formatter-focused regression fixtures and assertions
- **Purpose**: Freeze visible output invariants before adapter work starts wiring the renderer into commands and scheduler jobs.
- **Steps**:
  1. Add regression fixtures for representative daily and weekly structured summaries.
  2. Assert fixed section order and recognizable header/reminder behavior.
  3. Assert reduced-digest weekly output remains factual and compact.
  4. Assert formatter output is safe for `replyWithMarkdown` and `sendWithMarkdown` paths.
  5. Keep assertions focused on deterministic rendering, not on re-testing summary composition logic already covered by WP02 and WP03.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel?**: No.
- **Notes**:
  - These tests should make output drift obvious without freezing every punctuation choice.
  - Separate formatter fixtures from composer fixtures where possible to reduce merge conflicts later.

## Test Strategy

- Required commands:
  - `node tests/run-regression-tests.mjs`
  - `node --test tests/regression.test.js`
- Mandatory coverage:
  - deterministic daily section rendering
  - deterministic weekly section rendering
  - urgent reminder and header preservation
  - Telegram-safety and stable ordering

## Risks & Mitigations

- **Risk**: Formatter work turns into an unbounded copy cleanup.
  - **Mitigation**: Treat wording changes as regression-sensitive and preserve existing surface identity.
- **Risk**: Header/reminder logic gets applied twice in some paths.
  - **Mitigation**: Pick one ownership boundary for those helpers and encode it in tests.
- **Risk**: Telegram parsing breaks on edge formatting.
  - **Mitigation**: Keep output deterministic and validate with existing markdown-to-HTML helpers in regression tests.

## Review Guidance

- Confirm formatter code does not inspect raw tasks, processed history, or ranking objects.
- Confirm section order is fixed and aligns with the clarified spec contracts.
- Confirm headers and urgent reminders remain recognizable and are applied exactly once.
- Confirm formatter regressions isolate rendering concerns from summary-composition concerns.

## Activity Log

- 2026-03-12T21:27:55Z - system - lane=planned - Prompt generated.

---

### Updating Lane Status

Use `spec-kitty agent tasks move-task <WPID> --to <lane> --note "message"` or edit the frontmatter plus append a new activity log entry.

**Valid lanes**: `planned`, `doing`, `for_review`, `done`
- 2026-03-13T17:26:57Z – codex – shell_pid=28472 – lane=doing – Assigned agent via workflow command
- 2026-03-13T17:38:33Z – codex – shell_pid=28472 – lane=for_review – Ready for review: deterministic daily/weekly formatter with header/reminder, telegram-safe diagnostics, formatter regression coverage
