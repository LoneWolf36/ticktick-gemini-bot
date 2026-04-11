---
work_package_id: WP07
title: Observability and Regression Stabilization
dependencies:
- WP05
- WP06
requirement_refs:
- FR-003
- FR-006
- FR-007
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
- tests/e2e-live-checklist.mjs
- tests/e2e-live-ticktick.mjs
- tests/regression.test.js
- tests/regression.test.js.
- tests/run-regression-tests.mjs
wp_code: WP07
---

# Work Package Prompt: WP07 - Observability and Regression Stabilization

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

- Finish the feature with shared diagnostics, cross-path parity coverage, quickstart validation, and removal of dead legacy daily/weekly code.
- Normalize observability so manual and scheduled summary execution can be compared without reading raw output strings.
- Treat this package as the stabilization gate before review, not as a place to invent new feature behavior.
- Leave the repo with one clear summary path for daily and weekly surfaces and no misleading legacy comments or helpers.

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

- Implementation command: after WP05 and WP06 are merged into the shared baseline, run `spec-kitty implement WP07 --base WP06`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `kitty-specs/006-briefing-weekly-modernization/quickstart.md`
  - `.kittify/memory/charter.md`
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

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Normalize diagnostics field names, log source counts/degraded reasons/structured summaries before delivery, add cross-path parity regressions, validate quickstart, remove dead legacy code.

#### What's Actually Done:
Marked done after initial blocking (WP06 wasn't merged). All 5 subtasks completed. Diagnostics normalized, parity regressions added, legacy wrappers removed, quickstart validated.

#### Gaps Found:
- No gaps. The WP was initially blocked correctly (waiting for WP05/WP06), then completed once dependencies were ready. Good dependency discipline.

#### Product Vision Alignment Issues:
- Aligned. Cross-path parity regressions ensure the system behaves consistently whether triggered manually or by scheduler — supporting trust through predictability.
- Removing dead legacy code reduces maintenance burden and prevents confusion.

#### Recommendations:
- No action needed. Clean stabilization WP.
