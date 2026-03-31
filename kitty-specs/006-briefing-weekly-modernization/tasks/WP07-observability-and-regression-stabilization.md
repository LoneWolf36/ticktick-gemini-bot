---
work_package_id: WP07
title: Observability and Regression Stabilization
dependencies:
- WP05
- WP06
base_branch: 006-briefing-weekly-modernization-WP05
base_commit: b063d36809c6b27c372d2ded77e5dc264ec06ed1
created_at: '2026-03-13T18:16:49.563968+00:00'
subtasks:
- T032
- T033
- T034
- T035
- T036
phase: Phase 4 - Stabilization
requirement_refs:
- FR-003
- FR-006
- FR-007
---

# Work Package Prompt: WP07 - Observability and Regression Stabilization

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

- Finish the feature with shared diagnostics, cross-path parity coverage, quickstart validation, and removal of dead legacy daily/weekly code.
- Normalize observability so manual and scheduled summary execution can be compared without reading raw output strings.
- Treat this package as the stabilization gate before review, not as a place to invent new feature behavior.
- Leave the repo with one clear summary path for daily and weekly surfaces and no misleading legacy comments or helpers.

## Context & Constraints

- Implementation command: after WP05 and WP06 are merged into the shared baseline, run `spec-kitty implement WP07 --base WP06`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `kitty-specs/006-briefing-weekly-modernization/quickstart.md`
  - `.kittify/memory/constitution.md`
- Start only after manual and scheduler integration work is in place.
- Land parity coverage before removing dead code.
- Keep this package narrowly focused on validation, diagnostics, and cleanup.

## Subtasks & Detailed Guidance

### Subtask T032 - Normalize summary diagnostics field names across manual and scheduled execution
- **Purpose**: Make summary execution inspectable through one stable diagnostics vocabulary across both entry points.
- **Steps**:
  1. Audit the diagnostics currently returned or logged by the shared summary surface and adapters.
  2. Normalize field names to the agreed data-model shape, such as `entryPoint`, `kind`, `sourceCounts`, `degraded`, `degradedReason`, `formatterVersion`, and `deliveryStatus`.
  3. Remove duplicate or near-duplicate field names that would make parity checks noisy.
  4. Keep naming changes narrow and update consuming tests in the same package.
- **Files**:
  - `services/summary-surfaces/index.js`
  - `bot/commands.js`
  - `services/scheduler.js`
  - `tests/regression.test.js`
- **Parallel?**: No.
- **Notes**:
  - Keep naming consistent with the contract and data model rather than whatever happened to emerge during earlier implementation.
  - Avoid introducing vendor-specific telemetry vocabulary.

### Subtask T033 - Log source counts, degraded reasons, structured summary objects, and formatting decisions before delivery
- **Purpose**: Fulfill the inspectability requirement with logs that explain what happened before Telegram delivery.
- **Steps**:
  1. Ensure manual and scheduler paths both log the same diagnostic fields before sending output.
  2. Include source counts, degraded reasons, structured summary snapshots, and formatter decisions.
  3. Ensure delivery failures update diagnostics or logs with a clear terminal status.
  4. Keep logs structured enough that parity debugging does not require reading the final rendered string.
- **Files**:
  - `services/summary-surfaces/index.js`
  - `bot/commands.js`
  - `services/scheduler.js`
- **Parallel?**: No.
- **Notes**:
  - Do not log secrets, tokens, or raw sensitive content from task descriptions.
  - Prefer shared logging helpers only if they reduce duplication without creating a new abstraction layer.

### Subtask T034 - Add cross-path parity regressions comparing manual and scheduled behavior for equivalent inputs
- **Purpose**: Prove that both delivery paths use the same summary core and only diverge where the plan explicitly allows it.
- **Steps**:
  1. Add regressions that compare manual and scheduled daily outputs for the same task and state snapshot.
  2. Add regressions that compare manual and scheduled weekly outputs for the same task/history snapshot.
  3. Allow the scheduler-only pending-review wrapper as the one explicit delivery difference.
  4. Assert shared diagnostics fields and structured summary shapes match across paths.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel?**: No.
- **Notes**:
  - Keep parity fixtures deterministic and easy to inspect.
  - These tests are the cleanup gate for T036.

### Subtask T035 - Validate quickstart scenarios and patch stale implementation notes or comments
- **Purpose**: Align the implemented feature with the reviewer-facing validation document and remove misleading guidance in code comments.
- **Steps**:
  1. Run the validation flow from `kitty-specs/006-briefing-weekly-modernization/quickstart.md`.
  2. Patch any stale comments, docstrings, or inline notes that still describe a legacy free-form daily or weekly path.
  3. Update quickstart-adjacent notes only where implementation reality changed or became clearer.
  4. Keep documentation edits tightly scoped to `006`.
- **Files**:
  - `kitty-specs/006-briefing-weekly-modernization/quickstart.md` only if implementation requires a precise update
  - `bot/commands.js`
  - `services/gemini.js`
  - `services/scheduler.js`
  - `services/summary-surfaces/`
- **Parallel?**: No.
- **Notes**:
  - Do not rewrite the plan or spec here.
  - If quickstart validation exposes a real code gap, fix the code first and then correct any stale documentation.

### Subtask T036 - Remove obsolete legacy daily/weekly prompt-only helpers or dead code once parity coverage passes
- **Purpose**: Leave one authoritative summary path in the codebase and eliminate maintenance traps.
- **Steps**:
  1. Identify legacy daily and weekly helpers that are no longer used after WP05 and WP06.
  2. Confirm parity regressions are passing before deleting or collapsing them.
  3. Remove dead exports, obsolete prompt templates, and misleading wrapper code tied to the old string-only summary path.
  4. Preserve any still-valid shared helpers, such as urgent-mode prompt notes, only if the new structured path still depends on them.
- **Files**:
  - `services/gemini.js`
  - `bot/commands.js`
  - `services/scheduler.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - Favor deleting dead code over keeping compatibility shims that no longer serve a caller.
  - Review deletions carefully so unrelated AI or pipeline flows are not affected.

## Test Strategy

- Required commands:
  - `node tests/run-regression-tests.mjs`
  - `node --test tests/regression.test.js`
- Optional confidence commands after core regressions pass:
  - `node tests/e2e-live-checklist.mjs`
  - `node tests/e2e-live-ticktick.mjs`
- Mandatory coverage:
  - shared diagnostics naming
  - cross-path parity for daily and weekly
  - delivery-failure visibility
  - no remaining dead legacy summary path

## Risks & Mitigations

- **Risk**: Cleanup removes code that still supports an active path.
  - **Mitigation**: Gate cleanup behind parity regressions and remove only clearly unreferenced legacy helpers.
- **Risk**: Logging becomes noisy or inconsistent rather than useful.
  - **Mitigation**: Normalize field names first, then keep logs scoped to summary composition and delivery outcome.
- **Risk**: Quickstart validation drifts from real behavior.
  - **Mitigation**: Use this package to reconcile code and reviewer-facing validation together.

## Review Guidance

- Confirm diagnostics naming is shared across manual and scheduled entry points.
- Confirm parity regressions prove the shared summary core is actually shared.
- Confirm quickstart scenarios remain accurate after implementation.
- Confirm dead legacy daily/weekly summary code was removed only after tests made the new path safe.

## Activity Log

- 2026-03-12T21:27:55Z - system - lane=planned - Prompt generated.

---

### Updating Lane Status

Use `spec-kitty agent tasks move-task <WPID> --to <lane> --note "message"` or edit the frontmatter plus append a new activity log entry.

**Valid lanes**: `planned`, `doing`, `for_review`, `done`
- 2026-03-13T18:16:50Z – Codex – shell_pid=33552 – lane=doing – Assigned agent via workflow command
- 2026-03-13T18:17:30Z – Codex – shell_pid=33552 – lane=doing – Blocked: WP07 depends on WP05 and WP06 merged into the shared baseline, but WP06 is back in planned with requested fixes and auto-merge-base creation failed on tests/regression.test.js. Proceeding from the WP05 base would mix unresolved scheduler work into the stabilization package.
- 2026-03-13T18:49:50Z – Codex – shell_pid=33552 – lane=for_review – Ready for review: normalized diagnostics/logging, added manual-vs-scheduler parity regressions, removed legacy summary wrappers, and validated quickstart expectations
- 2026-03-13T19:32:13Z – Codex – shell_pid=13648 – lane=doing – Started review via workflow command
- 2026-03-13T19:34:03Z – Codex – shell_pid=13648 – lane=done – Review passed: diagnostics/logging normalized, manual and scheduler parity regressions verified, legacy summary wrappers removed; dependency code from WP05/WP06 present in reviewed branch stack; no dependents
