# Archon Architecture

## Scope

The repository now uses a minimal Archon architecture.

Archon owns:

- reusable pre-execution gating
- mission discovery
- state-integrity scanning
- reconciliation enforcement for missions `002-009`
- product-vision blocking

Spec Kitty owns:

- mission lifecycle
- worktree lifecycle
- work package execution
- review state
- merge state
- `status.events.jsonl`

## Active Surface

Files that still matter:

- [config.yaml](</home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/config.yaml>)
- [spec-kitty-quality-gate.yaml](</home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/workflows/spec-kitty-quality-gate.yaml>)
- [spec-kitty-quality-gate-check.md](</home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/commands/spec-kitty-quality-gate-check.md>)
- [spec-kitty-reconcile-untrusted.md](</home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/commands/spec-kitty-reconcile-untrusted.md>)
- [spec-kitty-002-009.json](</home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/reconciliation/spec-kitty-002-009.json>)

The prior universal workflow, recovery system, checkpoint scripts, review synthesis helpers, and template artifacts were intentionally removed.

## Workflow Shape

The quality gate has six stages:

1. `discover-missions`
2. `state-integrity-scan`
3. `spec-kitty-api-probe`
4. `risk-classifier`
5. `product-vision-gate`
6. `execution-gate`

This is a read-only control plane. It gathers evidence and emits a decision. It does not implement code.

## Trust Model

Mission trust is derived from three inputs:

- JSONL integrity under `kitty-specs/<mission>/status.events.jsonl`
- Spec Kitty probe success
- reconciliation status for missions `002-009`

If any of those fail, Archon must block execution.

## Product Guardrails

The workflow enforces the repository’s product contract:

- no generic task-manager drift
- no passive list-management drift
- no busywork optimization without execution support
- no SaaS scaffolding outside accepted specs
- no YAGNI violations that widen scope beyond the current mission

## Why The Cleanup Happened

The deleted `.archon` files represented an older design:

- parameterized universal DAG templates
- multi-agent review loops
- checkpoint and crash-recovery orchestration
- generic feature and issue workflows

That surface no longer matched the finalized Archon role in this repository. Keeping it would preserve dead paths and misleading documentation.
