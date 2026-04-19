---
created: "2026-04-19T00:00:00Z"
last_edited: "2026-04-19T01:00:00Z"
source: "archon workflow run cavekit-validate"
---

# Cavekit Validate Follow-Ups — 2026-04-19

## Findings Summary

1. Validation reported **93 total requirements, 0 done, 93 pending, 78 blocked** because every Cavekit acceptance checkbox is still unchecked.
2. The validation workflow is internally inconsistent: it is described as read-only but instructs the agent to write `gap-analysis.md`, and the expected artifact file was not created.
3. The workflow had to fall back to the main checkout for `context/kits/` because the Archon worktree path did not contain the expected kit tree.
4. Validation ranked these as immediate roots:
   - `cavekit-task-pipeline R1`
   - `cavekit-task-pipeline R4`
   - `cavekit-work-style R1`
5. Dependency modeling drift exists between `context/kits/cavekit-overview.md` and `context/kits/cavekit-behavioral-memory.md`.
6. Potential drift found in live code/tooling:
   - `/reorg` command path in `bot/commands.js`
   - reorg generation in `services/gemini.js`
   - `reorgSchema` in `services/schemas.js`
   - live harness in `tests/e2e-live-ticktick.mjs`
   - Archon command/workflow files under `.archon/`

## File-Level Action Items Added

- `context/kits/cavekit-overview.md`
  - audit migrated checkbox status
  - reconcile overview-tier dependencies with per-requirement dependencies
  - decide tooling-drift handling model
- `context/kits/cavekit-task-pipeline.md`
  - prioritize R1 and R4 audit/implementation
- `context/kits/cavekit-work-style.md`
  - prioritize R1 audit/implementation
- `context/kits/cavekit-behavioral-memory.md`
  - resolve R1 dependency mismatch vs overview tier graph
- `context/kits/cavekit-cleanup.md`
  - decide reorg-path ownership vs retirement
  - decide tooling exclusion vs tooling kit
- `context/kits/cavekit-pipeline-hardening.md`
  - map or explicitly exclude the live TickTick E2E harness
- `.archon/workflows/cavekit-validate.yaml`
  - resolve read-only vs artifact-write contradiction
  - resolve kit path source for validation runs
- `.archon/workflows/cavekit-build.yaml`
- `.archon/workflows/cavekit-refactor.yaml`
- `.archon/commands/cavekit-read-kit.md`
- `.archon/commands/cavekit-karpathy-check.md`
  - decide whether tooling files should be excluded from product drift checks or tracked by a tooling kit
- `bot/commands.js`
- `services/gemini.js`
- `services/schemas.js`
  - mark `/reorg` flow as needing spec coverage or removal
- `tests/e2e-live-ticktick.mjs`
  - mark live harness as needing kit mapping or explicit exclusion
- `context/kits/cavekit-checklists.md`
- `tests/e2e-live-checklist.mjs`
  - map the checklist live harness to explicit checklist/hardening coverage or document exclusion
- `commands/save-checkpoint.js`
  - classify checkpoint tooling under the same tooling-ownership decision as `.archon/` files

## Execution Plan

### Phase 1 — Fix validation signal quality
1. Update `.archon/workflows/cavekit-validate.yaml` so output behavior matches read-only semantics and kit lookup uses the intended checkout path.
2. Decide how validation should classify `.archon/` tooling files.

### Phase 2 — Reconcile spec status
1. Audit current implementation against `cavekit-task-pipeline R1`, `R4`, and `cavekit-work-style R1`.
2. Mark completed acceptance criteria in the relevant kits.
3. Reconcile `cavekit-overview.md` with per-requirement dependency declarations.

### Phase 3 — Resolve drift ✅ COMPLETED

Decisions applied 2026-04-19:
1. `/reorg` → **kept + spec'd** as R16 Guided Reorg in `cavekit-task-pipeline.md`.
2. `/menu`, `/scan`, `/pending`, `/undo` → **kept + spec'd** as R15 Command Surfaces in `cavekit-task-pipeline.md`.
3. Rate limiter → **removed** from `bot/commands.js` (YAGNI for 1-user MVP; out-of-scope per task-pipeline kit).
4. `tests/e2e-live-ticktick.mjs` → **mapped** as optional live smoke-test harness complementing R6's offline harness in `cavekit-pipeline-hardening.md`.
5. `tests/e2e-live-checklist.mjs` → **excluded** from drift checks (mocked logic validator, redundant with regression tests).
6. `.archon/` tooling + `commands/save-checkpoint.js` → **excluded** from product drift checks as dev tooling (rule documented in `cavekit-overview.md`).
7. TODO comments added to `bot/commands.js`, `services/gemini.js`, `services/schemas.js`, `tests/e2e-live-ticktick.mjs`, `tests/e2e-live-checklist.mjs`, `commands/save-checkpoint.js` for traceability.
8. Validation action items updated in all affected kits to mark resolved items `[x]`.

### Phase 4 — Re-run validation
1. Run `archon workflow run cavekit-validate --cwd /home/lonewolf09/Documents/Projects/ticktick-gemini` again.
2. Confirm artifact/report behavior, reduced drift noise, and updated progress numbers.
