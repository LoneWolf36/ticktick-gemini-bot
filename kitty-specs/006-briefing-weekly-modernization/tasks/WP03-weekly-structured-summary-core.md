---
work_package_id: WP03
title: Weekly Structured Summary Core
lane: planned
dependencies:
- WP01
subtasks:
- T011
- T012
- T013
- T014
- T015
- T016
phase: Phase 2 - Parallel Core
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-12T21:19:42Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-002
- FR-004
- FR-005
- FR-007
- FR-008
---

# Work Package Prompt: WP03 - Weekly Structured Summary Core

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

- Move weekly generation off the legacy free-form final-string path and onto a structured weekly summary object.
- Guarantee the weekly summary exposes `progress`, `carry_forward`, `next_focus`, `watchouts`, and `notices` before formatting.
- Implement the clarified reduced-digest path for sparse or missing processed history.
- Enforce the non-behavioral, evidence-backed watchout boundary in code and tests.

## Context & Constraints

- Implementation command: `spec-kitty implement WP03 --base WP01`
- Canonical references:
  - `kitty-specs/006-briefing-weekly-modernization/spec.md`
  - `kitty-specs/006-briefing-weekly-modernization/plan.md`
  - `kitty-specs/006-briefing-weekly-modernization/research.md`
  - `kitty-specs/006-briefing-weekly-modernization/data-model.md`
  - `kitty-specs/006-briefing-weekly-modernization/contracts/summary-surfaces.openapi.yaml`
  - `.kittify/memory/constitution.md`
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
