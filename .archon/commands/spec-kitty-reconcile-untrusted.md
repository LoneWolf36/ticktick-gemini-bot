---
description: Read-only reconciliation audit for untrusted TickTick-Gemini Spec Kitty missions.
argument-hint: [mission-selector]
---

# Spec Kitty Reconcile Untrusted Missions

Treat TickTick-Gemini missions `002-009` as untrusted until each mission passes
status integrity, spec/code fidelity, test evidence, and product-vision review.

This command is read-only.

## Required Checks

For each selected mission:

1. Parse `status.events.jsonl` and report malformed or Spec-Kitty-incompatible events.
2. Map `spec.md` requirements to `plan.md`, `tasks/WP*.md`, code evidence, and tests.
3. Classify each requirement as:
   - `implemented`
   - `partially implemented`
   - `missing`
   - `stale-test`
   - `unverifiable`
4. Run or request these validation commands:

```bash
node --test tests/task-resolver.test.js tests/ax-intent.test.js tests/normalizer.test.js tests/pipeline-context.test.js
node tests/run-regression-tests.mjs
```

## Known Baseline Findings

- `002-natural-language-task-mutations`: implementation evidence exists, but status history is malformed.
- `003-pipeline-hardening-and-regression`: implementation evidence exists, but the regression suite has failed on rollback classification and must be reconciled before trust.
- `004-009`: untrusted until audited, regardless of prior `done` events.

## Required Output

Return JSON:

```json
{
  "mission": "003-pipeline-hardening-and-regression",
  "trust": "trusted",
  "status_integrity": "pass",
  "spec_code_fidelity": "pass",
  "tests": "pass",
  "blocking_findings": [],
  "repair_recommendations": []
}
```
