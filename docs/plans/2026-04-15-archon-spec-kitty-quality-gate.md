# Archon Spec Kitty Quality Gate Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a lean, reusable Archon workflow that gates Spec Kitty execution with state integrity checks, spec/code audits, product-vision compliance, and Codex-only model routing.

**Architecture:** Archon orchestrates and gates; Spec Kitty remains the only owner of mission state, worktrees, WP lifecycle, reviews, and merges. The workflow is reusable across projects that have Spec Kitty missions plus a product vision document, while keeping TickTick-Gemini-specific reconciliation as a project-local audit phase.

**Tech Stack:** Archon YAML workflows, Archon command markdown, Spec Kitty v3.1.4 CLI/orchestrator-api, Codex provider only, `gpt-5.4-mini`, `gpt-5.4`, Node.js regression tests.

---

## Task 1: Record The Plan Artifact

Create this plan file at `docs/plans/2026-04-15-archon-spec-kitty-quality-gate.md`, verify it exists, and commit it as documentation.

## Task 2: Quarantine Unsafe Archon Surfaces

Disable or replace hard-coded mission completion workflows, remove active Qwen usage, and replace manual `status.events.jsonl` mutation with Spec Kitty-owned lifecycle instructions.

Files:

- `.archon/workflows/spec-kitty-missions-complete.yaml`
- `.archon/workflows/spec-kitty-complete-missions-001-to-009.yaml`
- `.archon/workflows/spec-kitty-wp-implement.yaml`
- `.archon/workflows/feature-dev.yaml`
- `.archon/workflows/fix-issue.yaml`
- `.archon/commands/spec-kitty-implement.md`
- `.archon/commands/spec-kitty-quality-gate-check.md`

Acceptance:

- No active workflow or command uses Qwen.
- No active command appends directly to `status.events.jsonl`.
- Spec Kitty owns all WP state transitions.

## Task 3: Fix Archon Workflow Configuration

Update `.archon/workflow-config.json` so it uses Codex defaults, absolute project-root resolution, no stale WP filenames, and no more than ten review agents.

Acceptance:

- `node .archon/scripts/config-validator.js` exits `0`.
- Config warnings are acceptable only when they document dynamic mission discovery.

## Task 4: Create The Reusable Quality Gate Workflow

Create `.archon/workflows/spec-kitty-quality-gate.yaml`.

Inputs:

- `project_root`, default `/home/lonewolf09/Documents/Projects/ticktick-gemini`
- `kitty_specs_dir`, default `kitty-specs`
- `product_vision_path`, default `Product Vision and Behavioural Scope.md`
- `mission_selector`, default `all-active`
- `mode`, default `dry-run`
- `validation_command`, default `node tests/run-regression-tests.mjs`

Model routing:

- `gpt-5.4-mini`: classifiers, artifact scans, state scans, low-risk work.
- `gpt-5.4`: high-risk gates, product-vision compliance, important review decisions.

Acceptance:

- The workflow has no archive execution mode.
- `dry-run` and `audit` modes never start implementation.
- `execute` mode requires trusted state, clean audit evidence, and Spec Kitty lifecycle commands.

## Task 5: Add TickTick-Gemini Mission Reconciliation Audit

Create `.archon/commands/spec-kitty-reconcile-untrusted.md`.

Policy:

- Treat `002-009` as untrusted until each mission passes event integrity, spec/plan/WP mapping, FR-to-code evidence, tests, and product-vision compliance.
- Preserve known findings: `002` has implementation evidence but malformed status; `003` has implementation evidence but a failing rollback-classification regression.

Acceptance:

- The command is read-only.
- The output classifies each mission as `trusted` or `untrusted` with blocking evidence.

## Task 6: Handle Status Repair Safely

Create `.archon/commands/spec-kitty-status-repair-plan.md`.

Policy:

- Generate repair manifests only.
- Prefer Spec Kitty repair/recover/doctor tools before manual repair.
- Never silently edit `status.events.jsonl`.

## Task 7: Add One-Time Archive Artifact Audit

Create `.archon/commands/spec-kitty-archive-artifact-audit.md`.

Policy:

- Audit `/home/lonewolf09/Documents/Projects/function-inception-agent/kitty-specs/archive` as artifacts only.
- Do not call `spec-kitty next` or `orchestrator-api` on archived missions.
- Do not add permanent archive mode to the reusable workflow.

## Task 8: Final Dry Run

Run:

```bash
spec-kitty --version
rg "qwen|Qwen" .archon
node .archon/scripts/config-validator.js
node --test tests/task-resolver.test.js tests/ax-intent.test.js tests/normalizer.test.js tests/pipeline-context.test.js
node tests/run-regression-tests.mjs
```

Acceptance:

- Spec Kitty reports `3.1.4`.
- No active Archon workflow or command references Qwen.
- Config validation passes.
- Targeted tests pass.
- Regression tests pass before any untrusted mission is accepted. If regression tests fail, record the exact blocker and keep affected missions untrusted.
