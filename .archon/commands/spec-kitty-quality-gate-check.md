---
description: Reusable quality gate for Spec Kitty missions before Archon allows execution.
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
- `allow_spec_kitty_probes`: `false`

This command is read-only. It checks whether Archon may safely orchestrate Spec
Kitty. It must not start implementation and must not edit mission state.

Run the active workflow with the current Archon CLI:

```bash
archon workflow run spec-kitty-quality-gate "project_root=${project_root} kitty_specs_dir=${kitty_specs_dir} product_vision_path=${product_vision_path} mission_selector=${mission_selector} mode=${mode} allow_spec_kitty_probes=false"
```

## Gate 1: Provider Policy

The retained Archon workflow surface must use Codex only.

```bash
rg "codex|gpt-5.4|gpt-5.4-mini" .archon/workflows .archon/commands
```

Expected:

- The active workflow uses `provider: codex`.
- Low-risk scan/classification nodes use `gpt-5.4-mini`.
- High-risk product-vision and execution decisions use `gpt-5.4`.
- No active workflow or command references non-Codex providers.

## Gate 2: Archon And Spec Kitty Health

Validate the active workflow and command before trusting any result:

```bash
archon validate workflows spec-kitty-quality-gate
archon validate commands spec-kitty-quality-gate-check
spec-kitty --version
```

Expected:

- The active workflow validates.
- This command validates.
- Spec Kitty reports version `3.1.4`.

## Gate 3: Spec Kitty State Integrity

For each selected active mission under `${kitty_specs_dir}`:

1. Parse `status.events.jsonl` as JSONL.
2. Flag malformed JSON.
3. Flag `done` events with evidence shapes that crash Spec Kitty.
4. Mark the mission `untrusted` if any event cannot be consumed by Spec Kitty.
5. Treat missions `002-009` as blocked unless the reconciliation status file records both `verified: true` and `trust: trusted`.

Spec Kitty probe commands are reported by default, not executed, because some
read-like Spec Kitty commands can materialize status files. Execute them only
with an explicit `allow_spec_kitty_probes=true` opt-in after the JSONL scan says
the mission is safe to probe:

```bash
spec-kitty orchestrator-api mission-state --mission <mission-slug>
spec-kitty orchestrator-api list-ready --mission <mission-slug>
spec-kitty next --mission <mission-slug> --json
```

If any command crashes, mark the mission `blocked-state`.

Archon may read mission state, but Spec Kitty remains the lifecycle authority.
Never write `status.events.jsonl` from an Archon command.

## Gate 4: Spec/Code Audit

For every selected mission, compare mission artifacts with repository reality:

- `spec.md` exists and contains requirements or acceptance criteria.
- `plan.md` exists and describes implementation or validation.
- `tasks/WP*.md` exists for executable work.
- Code-bearing missions have test evidence before trust is granted.
- Requested work does not conflict with the accepted architecture.

Flag work as `blocked-spec-code-drift` when status files claim readiness that is
not supported by specs, work packages, code, or tests.

## Gate 5: Product Vision

When a product vision path is supplied, read it and block work that drifts toward:

- Generic task manager behavior.
- Passive list management.
- Busywork optimization without execution support.
- SaaS scaffolding not required by an accepted spec.

When the path is omitted, skip the product-vision gate explicitly instead of
failing the workflow.

## Gate 6: YAGNI

For the TickTick-Gemini MVP, flag new or changed code that introduces:

- User auth or multi-tenant scaffolding.
- Billing or pricing infrastructure.
- Rate limiting packages unrelated to existing defensive retries.
- Large abstractions that are not required by the current WP.

## Gate 7: Mode And Test Readiness

Supported modes:

- `dry-run`: always reports `execution_allowed: false`.
- `enforce`: may report `execution_allowed: true` only when every gate passes.

In `dry-run`, report the configured validation command. In `enforce`, run or
require the validation command before any execution is allowed.

Default:

```bash
node tests/run-regression-tests.mjs
```

## Required Output

Return a machine-readable summary:

```json
{
  "mode": "dry-run",
  "required_models": {
    "low_risk": "gpt-5.4-mini",
    "high_risk": "gpt-5.4"
  },
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
