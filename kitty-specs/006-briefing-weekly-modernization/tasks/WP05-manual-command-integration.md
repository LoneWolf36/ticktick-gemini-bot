---
work_package_id: WP05
title: Manual Command Integration
dependencies:
- WP02
- WP03
- WP04
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-006
- FR-007
base_branch: 006-briefing-weekly-modernization-WP05-merge-base
base_commit: 662cc0a43dcb0690276ca1de62f0a31ace368336
created_at: '2026-03-13T17:42:37.016796+00:00'
subtasks:
- T022
- T023
- T024
- T025
- T026
phase: Phase 3 - Surface Adapters
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
wp_code: WP05
---

# Work Package Prompt: WP05 - Manual Command Integration

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

- Move manual `/briefing` and `/weekly` handlers onto the shared summary surface created by WP02, WP03, and WP04.
- Preserve current auth, quota, and user-facing error behavior while removing direct dependence on legacy string-only Gemini methods.
- Make manual command behavior inspectable by logging structured summaries and formatter diagnostics before delivery.
- Keep command-layer code thin so summary policy stays centralized in the shared summary surface.

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

- Implementation command: after WP02, WP03, and WP04 are merged into the shared baseline, run `spec-kitty implement WP05 --base WP04`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `kitty-specs/006-briefing-weekly-modernization/quickstart.md`
  - `.kittify/memory/charter.md`
- This package is manual-command only. Do not refactor scheduler jobs here.
- Preserve tone closely. The manual handlers should keep recognizable output and not introduce extra coach-like copy.
- Treat `/briefing` and `/weekly` as one package so manual surfaces cannot drift from each other.

## Subtasks & Detailed Guidance

### Subtask T022 - Replace `/briefing` command execution in `bot/commands.js`
- **Purpose**: Move manual daily execution to the shared summary surface while preserving the surrounding Telegram command flow.
- **Steps**:
  1. Find the `/briefing` handler in `bot/commands.js`.
  2. Keep the current access, TickTick auth, and progress-message behavior unless a small cleanup is needed to support the shared surface.
  3. Replace direct `gemini.generateDailyBriefing(...)` usage with the shared summary-surface entry point from `services/summary-surfaces/index.js`.
  4. Pass the context needed for daily composition, including `entryPoint`, `userId`, urgent mode, and fetched tasks.
  5. Reply with the shared formatted output instead of constructing the old string pipeline locally.
- **Files**:
  - `bot/commands.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - Keep `/briefing` command-level responsibilities limited to gating, data loading, and delivery.
  - Do not duplicate formatter logic inside the handler.

### Subtask T023 - Replace `/weekly` command execution in `bot/commands.js`
- **Purpose**: Move manual weekly execution to the shared summary surface with the clarified reduced-digest behavior.
- **Steps**:
  1. Find the `/weekly` handler in `bot/commands.js`.
  2. Keep current access checks and progress messaging.
  3. Replace direct `gemini.generateWeeklyDigest(...)` usage with the shared weekly summary-surface entry point.
  4. Continue loading processed-task history through the existing store helpers and `filterProcessedThisWeek`.
  5. Pass explicit history availability metadata so sparse-history behavior is inspectable.
  6. Reply with the shared formatted weekly output.
- **Files**:
  - `bot/commands.js`
  - `services/summary-surfaces/index.js`
  - `bot/utils.js`
- **Parallel?**: No.
- **Notes**:
  - Keep weekly handler logic thin; it should not re-shape `watchouts` or fallback notices itself.
  - Preserve weekly headers and urgent reminder behavior through the shared formatter path chosen in WP04.

### Subtask T024 - Preserve auth, quota, and user-facing error handling while removing legacy string-only path dependence
- **Purpose**: Make the migration safe for users and reviewers by preserving the current manual command guardrails.
- **Steps**:
  1. Preserve `guardAccess` and TickTick authentication behavior for both manual commands.
  2. Preserve existing quota messaging and fail-fast behavior where it applies today.
  3. Preserve reply delivery semantics through `replyWithMarkdown`.
  4. Keep thrown errors localized to the handler and avoid leaking raw structured objects to the user on failure.
  5. Remove or isolate any remaining command-local dependence on legacy daily or weekly plain-text methods.
- **Files**:
  - `bot/commands.js`
  - `bot/utils.js`
  - `services/gemini.js` only if a temporary compatibility wrapper must be retired
- **Parallel?**: No.
- **Notes**:
  - Do not change free-form message handling, `/scan`, `/review`, or pipeline behavior here.
  - Scope is limited to manual `/briefing` and `/weekly`.

### Subtask T025 - Log structured summary output plus formatter decisions in manual command paths
- **Purpose**: Make manual summary execution auditable without requiring reviewers to infer behavior from the final string alone.
- **Steps**:
  1. Log summary diagnostics returned from the shared summary surface before delivery.
  2. Log source counts, degraded reasons, and the structured summary object or a safe serialized snapshot.
  3. Use the shared field names from the data model so scheduler logging can match later.
  4. Keep logs concise and avoid leaking secrets or transport-level noise.
- **Files**:
  - `bot/commands.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - Prefer one consistent log shape for both `/briefing` and `/weekly`.
  - Logging is part of the acceptance surface for FR-006, not an optional extra.

### Subtask T026 - Add manual command regression coverage for shared-surface use and tone-sensitive invariants
- **Purpose**: Lock the manual integration so later scheduler work can target parity against a stable command baseline.
- **Steps**:
  1. Update existing `registerCommands` regression coverage to mock the shared summary surface rather than the old plain-text daily and weekly methods.
  2. Assert `/briefing` and `/weekly` handlers call the shared summary surface and send the formatted output.
  3. Assert recognizable headers and urgent reminder behavior remain visible.
  4. Assert auth and quota paths still short-circuit appropriately.
  5. Keep tests local to manual command behavior and avoid duplicating scheduler assertions.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
  - `bot/commands.js`
- **Parallel?**: No.
- **Notes**:
  - Several existing regressions already touch `/briefing`; update them carefully rather than replacing broad unrelated coverage.
  - Reviewers should be able to inspect manual-path diffs without spelunking the scheduler code.

## Test Strategy

- Required commands:
  - `node tests/run-regression-tests.mjs`
  - `node --test tests/regression.test.js`
- Mandatory coverage:
  - `/briefing` uses shared summary surface
  - `/weekly` uses shared summary surface
  - auth and quota guards remain intact
  - recognizable tone, header, and urgent reminder invariants hold

## Risks & Mitigations

- **Risk**: Manual handlers keep one foot in the old plain-text path.
  - **Mitigation**: Replace both `/briefing` and `/weekly` in the same package and update tests to mock the new seam.
- **Risk**: Command-layer code starts owning summary policy.
  - **Mitigation**: Limit handlers to gating, data loading, logging, and delivery.
- **Risk**: Logging becomes inconsistent across daily and weekly manual paths.
  - **Mitigation**: Use one diagnostics shape tied to the shared summary surface.

## Review Guidance

- Confirm both manual commands import and use the shared summary surface rather than direct legacy Gemini string methods.
- Confirm current auth, quota, and user-facing error behavior remains intact.
- Confirm structured summary output and diagnostics are logged before reply delivery.
- Confirm manual regressions cover both daily and weekly paths without pulling scheduler concerns into this package.

## Activity Log

- 2026-03-12T21:27:55Z - system - lane=planned - Prompt generated.

---

### Updating Lane Status

Use `spec-kitty agent tasks move-task <WPID> --to <lane> --note "message"` or edit the frontmatter plus append a new activity log entry.

**Valid lanes**: `planned`, `doing`, `for_review`, `done`
- 2026-03-13T17:42:38Z – codex – shell_pid=26620 – lane=doing – Assigned agent via workflow command
- 2026-03-13T17:55:57Z – codex – shell_pid=26620 – lane=done – Review passed: manual /briefing and /weekly use shared summary surfaces; auth/quota behavior preserved; diagnostics logging and regression coverage verified; dependent WP07 remains planned
- 2026-03-13T17:56:24Z – codex – shell_pid=26620 – lane=for_review – Ready for review: wire manual briefing/weekly to shared summary surface, add logging + tests
- 2026-03-13T19:36:51Z – codex – shell_pid=26620 – lane=done – Review passed: manual /briefing and /weekly use shared summary surfaces; auth/quota behavior preserved; diagnostics logging and regression coverage verified

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Migrate /briefing and /weekly commands to shared summary surfaces. Preserve auth/quota/error handling. Add structured logging. Add regression coverage.

#### What's Actually Done:
Marked done after two review cycles. All 5 subtasks completed. Auth/quota preserved, diagnostics logging added, regressions verified.

#### Gaps Found:
- No gaps. Clean integration. Had one review cycle that went to "done" then back to "for_review" for additional verification — good diligence.

#### Product Vision Alignment Issues:
- Aligned. Thin command handlers that delegate to shared summary surfaces keep the system maintainable and consistent — supporting "the system should feel intelligent."

#### Recommendations:
- No action needed.
