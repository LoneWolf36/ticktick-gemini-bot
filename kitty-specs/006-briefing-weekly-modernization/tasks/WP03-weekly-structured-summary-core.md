---
work_package_id: WP03
title: Weekly Structured Summary Core
dependencies:
- WP01
requirement_refs:
- FR-002
- FR-004
- FR-005
- FR-007
- FR-008
base_branch: 006-briefing-weekly-modernization-WP01
base_commit: 81b1897ea138b8870e8750afd02aeab81961dc52
created_at: '2026-03-13T17:27:02.894720+00:00'
subtasks:
- T011
- T012
- T013
- T014
- T015
- T016
phase: Phase 2 - Parallel Core
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RQ
owned_files:
- kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml
- kitty-specs/006-briefing-weekly-modernization/data-model.md
- kitty-specs/006-briefing-weekly-modernization/plan.md
- kitty-specs/006-briefing-weekly-modernization/research.md
- kitty-specs/006-briefing-weekly-modernization/spec.md
- tests/regression.test.js
- tests/run-regression-tests.mjs
wp_code: WP03
---

# Work Package Prompt: WP03 - Weekly Structured Summary Core

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

- Move weekly generation off the legacy free-form final-string path and onto a structured weekly summary object.
- Guarantee the weekly summary exposes `progress`, `carry_forward`, `next_focus`, `watchouts`, and `notices` before formatting.
- Implement the clarified reduced-digest path for sparse or missing processed history.
- Enforce the non-behavioral, evidence-backed watchout boundary in code and tests.

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

- Implementation command: `spec-kitty implement WP03 --base WP01`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `.kittify/memory/charter.md`
- Start from the contracts and export seams established by WP01.
- Do not reintroduce prompt-era fields such as `avoidance`, `needle_mover_ratio`, or `callout`.
- This package owns structured content only. Final Telegram formatting belongs to WP04.

## Subtasks & Detailed Guidance

### Subtask T011 - Implement structured weekly-generation parsing in `services/gemini.js`
- **Purpose**: Replace the current weekly plain-text output path with schema-constrained structured output that the summary surface can normalize.
- **Steps**:
  1. Locate the current `generateWeeklyDigest` flow in `services/gemini.js`.
  2. Replace or augment the weekly response handling so it requests a structured object compatible with WP01's weekly schema.
  3. Keep the current tasks plus processed-history context, but stop treating the model's direct string response as the feature output.
  4. Preserve existing quota, failover, and model-call behavior.
- **Files**:
  - `services/gemini.js`
  - `services/schemas.js`
- **Parallel?**: No.
- **Notes**:
  - Do not let the model own final Telegram formatting.
  - Keep the structured request grounded in real task and history data so weekly output stays inspectable.

### Subtask T012 - Build the weekly summary composer in `services/summary-surfaces/weekly-summary.js`
- **Purpose**: Normalize the structured weekly model response into the fixed contract expected by formatters and tests.
- **Steps**:
  1. Accept structured weekly output plus context from the shared summary surface.
  2. Guarantee the five top-level sections always exist.
  3. Normalize missing or malformed nested values into safe defaults that still satisfy the contract.
  4. Keep nested shapes narrow enough that later specs can refine them without breaking the top-level contract.
- **Files**:
  - `services/summary-surfaces/weekly-summary.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - Weekly composition should remain independent from formatter rules.
  - Keep the contract aligned with `data-model.md` and `summary-surfaces.openapi.yaml`.

### Subtask T013 - Implement reduced-digest behavior when processed history is sparse or missing
- **Purpose**: Honor the clarified fallback rule that weekly output must still be useful and explicit when history-backed insights are not available.
- **Steps**:
  1. Detect sparse or missing processed history explicitly.
  2. Produce a reduced digest derived from available current-task data.
  3. Add a missing-history notice to the `notices` section.
  4. Keep top-level sections present even when content is reduced.
- **Files**:
  - `services/summary-surfaces/weekly-summary.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - Do not skip `/weekly` entirely when history is missing.
  - Reduced digest behavior should stay compact and honest rather than apologetic or verbose.

### Subtask T014 - Enforce evidence-backed watchout filtering
- **Purpose**: Prevent the weekly surface from drifting into behavioral interpretation or unsupported callouts.
- **Steps**:
  1. Define what counts as acceptable evidence for a watchout: current task state, processed-task history, or explicit missing-data context.
  2. Filter out watchouts that do not have a clear evidence source.
  3. Ensure watchouts never label behavior or infer avoidance patterns in this feature.
  4. Preserve missing-data notices through `notices`, not through pseudo-behavioral watchouts.
- **Files**:
  - `services/summary-surfaces/weekly-summary.js`
  - `services/summary-surfaces/index.js`
- **Parallel?**: No.
- **Notes**:
  - This subtask is the main guardrail against scope bleed into `009`.
  - Encode the evidence source cleanly enough for logging and review.

### Subtask T015 - Drive `next_focus` from approved inputs only
- **Purpose**: Keep weekly forward-looking guidance aligned with shared ranking and current task state without inventing new policy.
- **Steps**:
  1. Use current tasks and existing ranking/state inputs to shape `next_focus`.
  2. Avoid any behavioral inference or hidden scoring beyond what current shared policy already provides.
  3. Keep `next_focus` compact and obviously tied to available task data.
- **Files**:
  - `services/summary-surfaces/weekly-summary.js`
  - `services/execution-prioritization.js` only if a small consumer helper is needed
- **Parallel?**: No.
- **Notes**:
  - This is a consumer task, not a ranking-policy redesign.
  - If a helper is added in `services/execution-prioritization.js`, keep it additive and low-risk.

### Subtask T016 - Add weekly fallback and watchout regressions
- **Purpose**: Lock the weekly structured behavior before formatter and adapter wiring begins.
- **Steps**:
  1. Add regression coverage for a normal weekly-history case.
  2. Add regression coverage for sparse-history or missing-history fallback.
  3. Add regression coverage proving watchouts are omitted when evidence is insufficient.
  4. Assert fixed top-level sections in all cases.
- **Files**:
  - `tests/regression.test.js`
  - `tests/run-regression-tests.mjs`
- **Parallel?**: No.
- **Notes**:
  - Keep tests focused on the structured output boundary, not final rendered text.
  - This package should make scope violations obvious in review.

## Test Strategy

- Required commands:
  - `node tests/run-regression-tests.mjs`
  - `node --test tests/regression.test.js`
- Mandatory coverage:
  - normal weekly structured output
  - sparse-history reduced digest
  - missing-history notice
  - watchout evidence boundary

## Risks & Mitigations

- **Risk**: Weekly output revives legacy prompt concepts under new names.
  - **Mitigation**: Enforce contract and boundary through structured-output tests, not just prompt wording.
- **Risk**: Fallback logic removes sections instead of reducing content.
  - **Mitigation**: Assert section presence in every regression case.
- **Risk**: Behavioral interpretation leaks into `watchouts`.
  - **Mitigation**: Treat evidence-backed filtering as a hard acceptance criterion.

## Review Guidance

- Confirm the weekly path no longer depends on a raw final-string response for core logic.
- Confirm sparse-history handling produces a reduced digest and explicit notice rather than silence or fabricated metrics.
- Confirm watchouts remain evidence-backed and non-behavioral.
- Confirm weekly section names match the clarified contract exactly.

## Activity Log

- 2026-03-12T21:19:42Z - system - lane=planned - Prompt generated.

---

### Updating Lane Status

Use `spec-kitty agent tasks move-task <WPID> --to <lane> --note "message"` or edit the frontmatter plus append a new activity log entry.

**Valid lanes**: `planned`, `doing`, `for_review`, `done`
- 2026-03-13T17:27:05Z – codex – shell_pid=25012 – lane=doing – Assigned agent via workflow command
- 2026-03-13T17:45:01Z – codex – shell_pid=25012 – lane=for_review – Ready for review: structured weekly summary output, reduced digest, watchout filtering, regression coverage
- 2026-03-13T17:46:00Z – codex – shell_pid=14756 – lane=doing – Started review via workflow command
- 2026-03-13T17:47:36Z – codex – shell_pid=14756 – lane=done – Review passed: structured weekly summary path verified; WP01 dependency matches code coupling but is not yet merged to master; dependents WP05 doing, WP06 planned

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
Move weekly briefing to structured output (progress/carry_forward/next_focus/watchouts/notices). Implement reduced-digest for sparse history. Enforce evidence-backed watchouts.

#### What's Actually Done:
Marked done. All 6 subtasks completed. Review passed without issues.

#### Gaps Found:
- No gaps. Clean execution. The evidence-backed watchout filtering (T014) is a key guardrail against scope bleed into spec 009.

#### Product Vision Alignment Issues:
- Strongly aligned. Reduced-digest for missing history supports "the system should not punish the user for irregular use."
- Evidence-backed watchouts prevent behavioral interpretation — the system reports facts, not judgments, supporting "It should not feel like a judgmental boss."
- next_focus driven from approved inputs prevents the system from inventing new policy.

#### Recommendations:
- No action needed. Well-executed WP.
