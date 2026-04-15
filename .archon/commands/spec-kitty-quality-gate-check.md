---
description: Hard quality gate for Spec Kitty missions before Archon allows execution.
argument-hint: <project-root> <kitty-specs-dir> <product-vision-path> <mission-selector> <mode>
---

# Spec Kitty Quality Gate Check

**Input:** `$ARGUMENTS`

Default values when omitted:

- `project_root`: current repository root
- `kitty_specs_dir`: `kitty-specs`
- `product_vision_path`: `Product Vision and Behavioural Scope.md`
- `mission_selector`: `all-active`
- `mode`: `dry-run`

This command is read-only. It checks whether Archon may safely orchestrate Spec
Kitty. It must not start implementation and must not edit mission state.

## Gate 1: Provider Policy

The retained Archon workflow surface must use Codex only.

```bash
rg "codex|gpt-5.4|gpt-5.4-mini" .archon/workflows .archon/commands
```

Expected:

- The active workflow uses `provider: codex`.
- Low-risk scan/classification nodes use `gpt-5.4-mini`.
- High-risk product-vision and execution decisions use `gpt-5.4`.

## Gate 2: Spec Kitty State Integrity

For each selected active mission under `${kitty_specs_dir}`:

1. Parse `status.events.jsonl` as JSONL.
2. Flag malformed JSON.
3. Flag `done` events with evidence shapes that crash Spec Kitty.
4. Mark the mission `untrusted` if any event cannot be consumed by Spec Kitty.

Use the Spec Kitty APIs only after the JSONL scan says the mission is safe to
probe:

```bash
spec-kitty orchestrator-api mission-state --mission <mission-slug>
spec-kitty orchestrator-api list-ready --mission <mission-slug>
spec-kitty next --mission <mission-slug> --json
```

If any command crashes, mark the mission `blocked-state`.

## Gate 3: Product Vision

Read the configured product vision document and block work that drifts toward:

- Generic task manager behavior.
- Passive list management.
- Busywork optimization without execution support.
- SaaS scaffolding not required by an accepted spec.

## Gate 4: YAGNI

For the TickTick-Gemini MVP, flag new or changed code that introduces:

- User auth or multi-tenant scaffolding.
- Billing or pricing infrastructure.
- Rate limiting packages unrelated to existing defensive retries.
- Large abstractions that are not required by the current WP.

## Gate 5: Test Readiness

Run the configured validation command only when `mode` is `audit` or `execute`.
In `dry-run`, report the command that would run.

Default:

```bash
node tests/run-regression-tests.mjs
```

## Required Output

Return a machine-readable summary:

```json
{
  "mode": "dry-run",
  "missions": [
    {
      "mission": "002-natural-language-task-mutations",
      "trust": "untrusted",
      "state_integrity": "fail",
      "spec_kitty_probe": "skipped",
      "blocking_findings": []
    }
  ],
  "execution_allowed": false
}
```
