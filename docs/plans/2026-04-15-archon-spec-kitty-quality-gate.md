# Archon Spec Kitty Quality Gate Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task after leaving Plan Mode.

**Goal:** Build a lean, reusable Archon workflow that gates Spec Kitty execution with state integrity checks, spec/code audits, product-vision compliance, and Codex-only model routing.

**Architecture:** Archon should orchestrate and gate; Spec Kitty remains the only owner of mission state, worktrees, WP lifecycle, reviews, and merges. The workflow should be reusable across projects that have Spec Kitty missions plus a product vision document, while keeping TickTick-Gemini-specific reconciliation as a project-local audit phase.

**Tech Stack:** Archon YAML workflows, Archon command markdown, Spec Kitty v3.1.4 CLI/orchestrator-api, Codex provider only, `gpt-5.4-mini`, `gpt-5.4`, Node.js regression tests.

**Plan Output Target:** [docs/plans/2026-04-15-archon-spec-kitty-quality-gate.md](/home/lonewolf09/Documents/Projects/ticktick-gemini/docs/plans/2026-04-15-archon-spec-kitty-quality-gate.md)

---

## Task 1: Record The Plan Artifact

**Files:**

* Create: [docs/plans/2026-04-15-archon-spec-kitty-quality-gate.md](/home/lonewolf09/Documents/Projects/ticktick-gemini/docs/plans/2026-04-15-archon-spec-kitty-quality-gate.md)

**Step 1: Create the plan file**

Create the file with this implementation plan exactly, then use it as the source of truth for execution.

**Step 2: Verify the plan exists**

Run:

```bash
test -f docs/plans/2026-04-15-archon-spec-kitty-quality-gate.md
```

Expected: exit code `0`.

**Step 3: Commit**

```bash
git add docs/plans/2026-04-15-archon-spec-kitty-quality-gate.md
git commit -m "docs: plan archon spec kitty quality gate"
```

Expected: one documentation-only commit.

---

## Task 2: Quarantine Unsafe Archon Surfaces

**Files:**

* Modify: [`.archon/workflows/spec-kitty-missions-complete.yaml`](/home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/workflows/spec-kitty-missions-complete.yaml)
* Modify: [`.archon/workflows/spec-kitty-complete-missions-001-to-009.yaml`](/home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/workflows/spec-kitty-complete-missions-001-to-009.yaml)
* Modify: [`.archon/commands/spec-kitty-implement.md`](/home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/commands/spec-kitty-implement.md)
* Modify: [`.archon/commands/spec-kitty-quality-gate-check.md`](/home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/commands/spec-kitty-quality-gate-check.md)

**Step 1: Remove active use of hard-coded mission completion workflows**

Disable or archive the two large hard-coded mission workflows from active Archon discovery. Do not delete useful notes yet; either rename them to a clearly inactive extension or move their useful observations into the new plan/workflow comments.

Expected behavior: Archon no longer treats either file as an executable active workflow.

**Step 2: Replace unsafe manual state mutation command**

Update `spec-kitty-implement.md` so it no longer:

* Greps for next planned WP.
* Implements directly without Spec Kitty start commands.
* Appends to `status.events.jsonl`.
* Marks WPs done.

The command must instead state:

* Query next work through `spec-kitty next --mission <slug> --json`.
* Start/transition work through Spec Kitty CLI or `orchestrator-api`.
* Never write mission status files directly.

**Step 3: Parameterize quality gate command**

Remove TickTick-Gemini-only hard-coded paths from `spec-kitty-quality-gate-check.md`. It should accept:

* `project_root`
* `kitty_specs_dir`
* `product_vision_path`
* `mission_selector`
* `mode`

Defaults may point to the current repo, but the command must be reusable.

**Step 4: Verify no active direct state mutation remains**

Run:

```bash
rg "status\\.events\\.jsonl|append|cat >>|echo .*done|qwen" .archon
```

Expected:

* No active workflow or command contains `qwen`.
* No active command appends directly to `status.events.jsonl`.
* Inactive archived notes may mention old behavior only if clearly marked non-executable.

**Step 5: Commit**

```bash
git add .archon/workflows .archon/commands
git commit -m "chore: quarantine unsafe spec kitty archon workflows"
```

---

## Task 3: Fix Archon Workflow Configuration

**Files:**

* Modify: [`.archon/workflow-config.json`](/home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/workflow-config.json)

**Step 1: Reduce invalid review agent config**

Fix the schema error where `/review/agents` exceeds Archon’s `maxItems: 10`.

Expected: maximum 10 review agents.

**Step 2: Fix path resolution assumptions**

Ensure project paths resolve from `/home/lonewolf09/Documents/Projects/ticktick-gemini`, not from `.archon`.

Expected: no generated reference points to `.archon/kitty-specs/...`.

**Step 3: Remove stale mission/WP filename assumptions**

Do not list hard-coded WP files that do not exist. Mission discovery should happen dynamically from `kitty-specs`.

**Step 4: Commit**

```bash
git add .archon/workflow-config.json
git commit -m "fix: align archon config with spec kitty"
```

---

## Task 4: Add The Reusable Quality Gate Workflow

**Files:**

* Create: [`.archon/workflows/spec-kitty-quality-gate.yaml`](/home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/workflows/spec-kitty-quality-gate.yaml)
* Create: [`.archon/commands/spec-kitty-quality-gate-check.md`](/home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/commands/spec-kitty-quality-gate-check.md)

**Step 1: Create reusable quality gate workflow**

The workflow must:

* Use Codex only.
* Default to `gpt-5.4-mini` for discovery/triage and `gpt-5.4` for high-risk checks.
* Support `dry-run` and `enforce` mode.
* Discover active missions from `kitty-specs`.
* Check mission state integrity before any implementation.
* Validate Spec Kitty version and Archon workflow health.
* Refuse to mutate `status.events.jsonl`.

**Step 2: Add command surface**

Create the command so it accepts the reusable parameters:

* `project_root`
* `kitty_specs_dir`
* `product_vision_path`
* `mission_selector`
* `mode`

The command should invoke the workflow without embedding TickTick-Gemini-only assumptions.

**Step 3: Commit**

```bash
git add .archon/workflows/spec-kitty-quality-gate.yaml .archon/commands/spec-kitty-quality-gate-check.md
git commit -m "feat: add reusable spec kitty quality gate"
```

---

## Task 5: Add Mission Discovery And State Integrity Checks

**Files:**

* Modify: [`.archon/workflows/spec-kitty-quality-gate.yaml`](/home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/workflows/spec-kitty-quality-gate.yaml)

**Step 1: Discover active missions safely**

The workflow should inspect `kitty-specs` and identify active missions dynamically.

Expected:

* No hard-coded mission list.
* No dependence on `.archon` for mission truth.
* No inference from stale `done` events alone.

**Step 2: Validate mission state integrity**

The workflow should verify:

* Status files exist where expected.
* Event histories are coherent.
* Claimed work packages are consistent with mission state.
* Suspicious or malformed events are flagged, not trusted.

**Step 3: Separate lifecycle authority from Archon**

Archon may read mission state, but Spec Kitty remains the authority for lifecycle transitions.

Expected: the workflow never writes mission state files directly.

**Step 4: Commit**

```bash
git add .archon/workflows/spec-kitty-quality-gate.yaml
git commit -m "feat: add spec kitty mission integrity checks"
```

---

## Task 6: Add Product-Vision And Spec/Code Audit Phases

**Files:**

* Modify: [`.archon/workflows/spec-kitty-quality-gate.yaml`](/home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/workflows/spec-kitty-quality-gate.yaml)

**Step 1: Check product-vision compliance**

If a `product_vision_path` is supplied, compare the mission/workflow intent against the product vision document.

Expected:

* Misaligned work is flagged.
* Scope drift is reported before implementation.
* The workflow can run without this check when the path is omitted.

**Step 2: Add spec/code audit phase**

The workflow should check whether the requested work is grounded in actual code and specs, not just task state.

Expected:

* It should detect when a mission is blocked by missing code readiness.
* It should detect when a change request conflicts with the repository’s accepted architecture.

**Step 3: Keep the audit reusable**

Do not hard-code TickTick-Gemini specifics into the workflow logic unless they are passed through parameters.

**Step 4: Commit**

```bash
git add .archon/workflows/spec-kitty-quality-gate.yaml
git commit -m "feat: add vision and spec code audit phases"
```

---

## Task 7: Add Archive Artifact Audit As One-Time Project-Local Mode

**Files:**

* Create: [`.archon/commands/spec-kitty-archive-artifact-audit.md`](/home/lonewolf09/Documents/Projects/ticktick-gemini/.archon/commands/spec-kitty-archive-artifact-audit.md)

**Step 1: Add a one-time artifact audit command**

This command should audit the archived Function Inception missions as artifacts only.

Expected:

* It does not call `spec-kitty next`.
* It does not call `orchestrator-api`.
* It does not mutate live mission state.
* It records only audit observations.

**Step 2: Keep it clearly project-local**

This command is for the current repository’s archive review only, not a reusable cross-project workflow.

**Step 3: Commit**

```bash
git add .archon/commands/spec-kitty-archive-artifact-audit.md
git commit -m "feat: add one-time spec kitty archive artifact audit"
```

---

## Task 8: Final Dry Run

**Files:**

* Use active `.archon` workflow and commands only.

**Step 1: Confirm versions**

Run:

```bash
spec-kitty --version
```

Expected: `3.1.4`.

**Step 2: Confirm no Qwen remains active**

Run:

```bash
rg "qwen" .archon
```

Expected: no active workflow or command usage.

**Step 3: Validate Archon workflows**

Run the Archon workflow validator.

Expected: all active workflows pass.

**Step 4: Run quality gate in dry-run mode**

Run the new workflow in `dry-run` mode against TickTick-Gemini.

Expected:

* Discovers active missions.
* Flags `002-009` as untrusted.
* Does not mutate mission state.
* Does not start implementation.
* Reports current bad event lines and test blockers.

**Step 5: Run one-time archive audit**

Run the archive audit against:

```bash
/home/lonewolf09/Documents/Projects/function-inception-agent/kitty-specs/archive
```

Expected:

* Reports artifact structure.
* Does not call `spec-kitty next`.
* Does not call `orchestrator-api`.

**Step 6: Run tests**

Run:

```bash
node --test tests/task-resolver.test.js tests/ax-intent.test.js tests/normalizer.test.js tests/pipeline-context.test.js
npm run test:regression
```

Expected final acceptance:

* Targeted tests pass.
* Regression tests pass, or the plan records exactly which mission remains blocked.

**Step 7: Commit**

```bash
git add .archon docs/plans
git commit -m "test: dry run archon spec kitty quality gate"
```

---

## Acceptance Criteria

The implementation is complete when:

* Active `.archon` workflows use Codex only.
* `gpt-5.4-mini` is used for classifiers, scans, and low-risk work.
* `gpt-5.4` is used for high-risk gates and important review decisions.
* No active workflow references `qwen`.
* No active command writes directly to `status.events.jsonl`.
* Spec Kitty remains the lifecycle authority.
* `002-009` are blocked until reconciled.
* `002` and `003` are audited against actual code, not status files alone.
* Function-inception archive missions are audited as artifacts only.
* The reusable workflow remains project-local until validated beyond TickTick-Gemini.
* Archon workflow validation passes.
* TickTick-Gemini regression tests pass before any untrusted mission is accepted.

## Defaults And Non-Goals

Default decisions:

* Do not move the workflow into `/home/lonewolf09/Documents/Projects/Archon/` yet.
* Do not add permanent archive support.
* Do not run a fixed reviewer swarm per WP.
* Do not trust malformed `done` events.
* Do not repair Spec Kitty status silently.

Non-goals:

* Replacing Spec Kitty.
* Rewriting Spec Kitty mission state by hand inside Archon.
* Implementing all `002-009` feature repairs in this workflow task.
* Optimizing for many users, auth, billing, or unrelated product architecture.
