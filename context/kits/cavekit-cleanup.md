---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-22T01:35:00Z"
source_specs: ["004-post-migration-cleanup"]
complexity: "quick"
---

# Cavekit: Cleanup

## Scope

Post-migration cleanup: dead code removal, documentation alignment, env-var standardization, and full regression verification after the pipeline migration from legacy to structured path.

## Requirements

### R1: Dead Code Removal
**Description:** Legacy task-creation and mutation paths that are replaced by the structured pipeline must be removed.
**Acceptance Criteria:**
- [x] All legacy prompt-based task creation code is removed
- [x] All legacy direct-API-call mutation code is removed
- [x] Legacy boundary points are documented explaining what was removed and why
- [x] No orphaned imports, unused exports, or dead helper functions remain
**Dependencies:** none

### R2: README and Architecture Documentation
**Description:** README and architecture docs are updated to reflect the structured pipeline.
**Acceptance Criteria:**
- [x] README describes the current AX → normalizer → adapter pipeline
- [x] Architecture diagram (if present) reflects current data flow
- [x] Setup instructions reference current env vars and dependencies
**Dependencies:** R1

### R3: Agent and Deployment Documentation
**Description:** Agent configuration docs (AGENTS.md, CLAUDE.md, GEMINI.md) and deployment docs (render.yaml) are updated.
**Acceptance Criteria:**
- [x] Agent docs describe available commands and their pipeline integration
- [x] Deployment docs reflect current service dependencies
- [x] No references to removed legacy paths remain in agent docs
**Dependencies:** R1

### R4: Env-Var Standardization
**Description:** Environment variables are standardized and context templates are updated.
**Acceptance Criteria:**
- [x] All env vars follow a consistent naming convention
- [x] `.env.example` and `workflow.env.example` are aligned with current code
- [x] No unused env vars remain in examples
- [x] Context templates reference correct current env vars
**Dependencies:** R1

### R5: Full Regression Verification
**Description:** Full regression suite passes after all cleanup changes.
**Acceptance Criteria:**
- [ ] All existing tests pass with no skip or xfail additions
- [ ] Pipeline harness tests from cavekit-pipeline-hardening pass
- [ ] No new test failures introduced by cleanup
- [ ] Manual smoke test of core create/update/complete/delete flows passes
**Dependencies:** R1, R2, R3, R4

## Out of Scope

- New feature development
- Architectural refactoring beyond dead-code removal
- Performance optimization

## Cross-References

- See also: cavekit-task-pipeline.md (the pipeline that replaced legacy paths)
- See also: cavekit-pipeline-hardening.md (regression suite this cleanup must not break)

## Validation Action Items — 2026-04-19

- [x] `/reorg` drift resolved: mapped to R16 Guided Reorg in `cavekit-task-pipeline.md`.
- [x] `reorgSchema` in `services/schemas.js` + `generateReorgProposal` in `services/gemini.js` — both belong to R16 Guided Reorg; no longer drift.
- [x] Tooling exclusion rule decided: `.archon/` workflows/commands are dev tooling, excluded from product drift checks. See `context/kits/cavekit-overview.md` for the rule.
- [x] Checkpoint tooling (`commands/save-checkpoint.js`, `commands/README.md`) removed — `docs/ARCHITECTURE.md` no longer contains legacy checkpoint references.
- [x] Orphaned `tasks/WP*.md` prompt copies removed — canonical versions live under `kitty-specs.archived/`.
- [x] Rate limiter removed from `bot/commands.js` (YAGNI for 1-user MVP).
- [x] Audit R1 (Dead Code Removal): legacy prompt-driven task-writing paths are gone; retained direct adapter calls in `bot/commands.js` (`/undo`, `executeActions`) and `bot/callbacks.js` (approve/drop callbacks) are explicitly documented operational or reorg boundaries rather than orphaned legacy writers, and no orphaned imports or dead helper exports were introduced by the pipeline migration.

## Changelog
- 2026-04-18: Migrated from kitty-specs 004-post-migration-cleanup
- 2026-04-22: R1 completed — legacy prompt-writing paths are removed, retained operational mutation boundaries are documented, and cleanup validation no longer treats them as orphaned drift.
