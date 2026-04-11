---
work_package_id: WP04
title: Deterministic Summary Formatter
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
- FR-004
- FR-007
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
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RQ
owned_files:
- kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml
- kitty-specs/006-briefing-weekly-modernization/data-model.md
- kitty-specs/006-briefing-weekly-modernization/plan.md
- kitty-specs/006-briefing-weekly-modernization/quickstart.md
- kitty-specs/006-briefing-weekly-modernization/research.md
- kitty-specs/006-briefing-weekly-modernization/spec.md
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP04
---

# Work Package Prompt: WP04 - Deterministic Summary Formatter

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task.**

- **Has review feedback?** Check Spec Kitty status and event history before starting. If feedback exists, read the Review Feedback section immediately.
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

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature makes morning and weekly surfaces trustworthy, brief, and action-oriented. Summaries are only useful if they help the user return to what matters without reading a report.

**Implementation must**:
- Daily briefing should usually surface no more than three meaningful tasks, with at least one long-term-goal-aligned action when available.
- Weekly output must separate factual history from behavioral interpretation and avoid unsupported pattern claims reserved for behavioral memory.
- Fallbacks must be honest about sparse data and still give a small next action instead of pretending certainty.

**Implementation must not**:
- Briefing output becomes verbose, generic, or motivational filler.
- Weekly summaries infer avoidance patterns without enough evidence or without the 009 privacy/confidence contract.
- Formatting depends on model prose instead of deterministic rendering for stable Telegram output.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission creates the main behavioral support surfaces: morning start, daily plan, weekly review, and end-of-day reflection. It must feel like a trusted assistant that helps the user return to what matters. It must stay cognitively light: no interrogation, no generic productivity lecture, no fabricated insight from sparse data.

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

## Context & Constraints

- Implementation command: `spec-kitty implement WP04 --base WP01`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `kitty-specs/006-briefing-weekly-modernization/quickstart.md`
  - `.kittify/memory/charter.md`
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
- 2026-03-13T17:39:40Z – codex – shell_pid=31572 – lane=doing – Started review via workflow command
- 2026-03-13T17:41:44Z – codex – shell_pid=31572 – lane=done – Review passed: no WP04 findings; formatter diff verified against stacked base WP01, dependency coupling matches code, dependents WP05 and WP06 remain planned

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Deterministic Telegram-safe renderer for both daily and weekly summaries. Preserve headers and urgent-mode reminders. Telegram-safety guards. Formatter-focused regressions.

#### What's Actually Done:
Marked done. All 5 subtasks completed. Review passed with no findings.

#### Gaps Found:
- No gaps. Clean formatter WP. The guardrail that formatters accept structured objects only (not raw tasks) maintains clean module boundaries.

#### Product Vision Alignment Issues:
- Aligned. Deterministic rendering prevents unpredictable output that could confuse users. Compact rendering for empty sections supports "minimally verbose."
- Urgent reminder preservation supports the urgent mode feature from spec 008.

#### Recommendations:
- No action needed.
