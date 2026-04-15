# Archon Usage Guide

This repository keeps a minimal Archon surface focused on one reusable workflow:

- [spec-kitty-quality-gate.yaml](</home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/workflows/spec-kitty-quality-gate.yaml>)
- [spec-kitty-quality-gate-check.md](</home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/commands/spec-kitty-quality-gate-check.md>)
- [spec-kitty-reconcile-untrusted.md](</home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/commands/spec-kitty-reconcile-untrusted.md>)
- [spec-kitty-002-009.json](</home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/reconciliation/spec-kitty-002-009.json>)

The older multi-mission universal DAG, recovery helpers, review-loop commands, and template artifacts were removed after the quality-gate workflow became the only supported Archon entry point.

## Purpose

The workflow answers one question: can Archon safely start Spec Kitty execution for the selected missions?

It does not implement work packages.
It does not mutate `status.events.jsonl`.
It does not replace Spec Kitty lifecycle commands.

## Prerequisites

- `archon`
- `spec-kitty`
- `node`
- repository checkout at the project root

## Run The Workflow

Dry run:

```bash
archon run -f .archon/workflows/spec-kitty-quality-gate.yaml
```

Audit mode:

```bash
archon run -f .archon/workflows/spec-kitty-quality-gate.yaml \
  mode=audit
```

Execute mode:

```bash
archon run -f .archon/workflows/spec-kitty-quality-gate.yaml \
  mode=execute
```

Optional inputs:

- `project_root`
- `kitty_specs_dir`
- `product_vision_path`
- `mission_selector`
- `mode`
- `validation_command`
- `reconciliation_status_path`

Example:

```bash
archon run -f .archon/workflows/spec-kitty-quality-gate.yaml \
  mission_selector=007-execution-prioritization-foundations \
  mode=audit
```

## Run The Commands

Quality-gate command:

```bash
archon validate commands spec-kitty-quality-gate-check
```

Reconciliation audit:

```bash
archon run spec-kitty-reconcile-untrusted 002-natural-language-task-mutations
```

## What The Workflow Checks

1. Mission discovery under `kitty-specs/`
2. `status.events.jsonl` integrity
3. Spec Kitty API probes
4. Risk classification
5. Product vision drift
6. Final execution decision

For missions `002-009`, trust is also gated by the reconciliation file in `.archon/reconciliation/`.

## Operating Rules

- `dry-run` never allows execution.
- `audit` never allows execution.
- `execute` may allow execution only when state integrity, reconciliation, Spec Kitty probes, and product-vision checks all pass.
- Archon remains a gatekeeper only. Spec Kitty remains the authority for implementation, review, merge, and mission state.

## Verification

Workflow validation:

```bash
archon validate workflows spec-kitty-quality-gate
```

Command validation:

```bash
archon validate commands spec-kitty-quality-gate-check
```

Repository regression check:

```bash
node tests/run-regression-tests.mjs
```
