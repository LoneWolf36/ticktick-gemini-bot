# 004-post-migration-cleanup Implementation Plan

**Feature**: Post-Migration Cleanup
**Created**: 2026-03-10
**Status**: Draft

## Technical Context

Specs 001-003 shipped a new structured pipeline (AX intent extraction → deterministic normalizer → TickTick adapter) that replaced the legacy `gemini.converse()` and `executeActions()` task-creation paths. Spec 002 added natural-language task mutations through the same pipeline. Spec 003 hardened the pipeline contract and added regression coverage.

After these migrations, several artifacts remain in an inconsistent state:

**Legacy code still present:**
- `executeActions()` in `bot/commands.js` — originally a Gemini-suggested-action executor, now only used by the `/scan` command's policy-sweep path for reorg follow-up actions. It is no longer the primary task-creation path but remains a live helper for reorg/analysis flows.
- Test harnesses (`tests/e2e-live-checklist.mjs`, `tests/e2e-live-ticktick.mjs`) call `ticktick.createTask()`, `ticktick.updateTask()`, etc. directly on the `TickTickClient` rather than through `TickTickAdapter`. These are opt-in live tests, not production paths, but they bypass the adapter contract.
- `services/gemini.js` no longer exports `converseSchema`, `converse()`, `analyzeTask()`, or `ANALYZE_PROMPT` — these were already cleaned up in spec 001 WP07. However, `GeminiAnalyzer` still carries `_prepareBriefingTasks`, `_buildFallbackReorgProposal`, `_normalizeReorgProposal`, and other reorg-specific helpers that may overlap with newer structured-summary surfaces (spec 006).

**Documentation gaps:**
- `README.md` still lists `/scan` as "Analyze new tasks (batched, 5 at a time)" — the command now routes through the AX pipeline, not legacy Gemini analysis. The description is functionally accurate but the architecture diagram and "Key Design Decisions" section do not mention the AX → Normalizer → Adapter pipeline.
- `README.md` architecture diagram shows `TickTick API → Scheduler → Gemini 2.5 Flash → Telegram Bot` which omits the pipeline entirely. It describes the pre-migration shape.
- `AGENTS.md` references `kitty-specs/001-task-operations-pipeline/` as storing "the active spec, plan, and work-package notes" — but specs 002, 003, and beyond also exist. The project structure section does not reflect `services/ax-intent.js`, `services/normalizer.js`, `services/pipeline.js`, or `services/ticktick-adapter.js`.
- `render.yaml` lists `GEMINI_API_KEY` as an env var but the code now also supports `GEMINI_API_KEYS` (comma-separated, for key rotation). The env var table is incomplete.
- No `kitty-specs` status events files exist for specs 001-003 — the WP status is tracked in `tasks.md` status-model blocks but not in canonical `status/events.jsonl` files.

**Configuration patterns to review:**
- `GEMINI_API_KEY` (singular, legacy) vs `GEMINI_API_KEYS` (plural, current) — both are accepted in `server.js` for backward compatibility. The singular form should be deprecated or documented as an alias.
- `services/user_context.example.js` may not reflect the current shape of context expected by the pipeline (goal theme profiles, execution prioritization).
- `BOT_MODE`, `AUTO_APPLY_LIFE_ADMIN`, `AUTO_APPLY_DROPS`, `AUTO_APPLY_MODE` are documented in `render.yaml` but not all are described in `README.md`.

## Design Decisions

### What to Keep vs Remove

| Artifact | Decision | Rationale |
|----------|----------|-----------|
| `executeActions()` in commands.js | **Keep, but scope** | Still used by `/scan` for reorg policy-sweep actions. Document its narrowed role. |
| Direct TickTick client calls in E2E tests | **Keep, but document** | These are opt-in live tests that validate the raw API, not production paths. Mark them explicitly as "bypass adapter by design". |
| `GeminiAnalyzer` reorg helpers | **Audit against spec 006** | Spec 006 (briefing/weekly modernization) may supersede `_buildFallbackReorgProposal` and `_normalizeReorgProposal`. De-duplicate once spec 006 lands. For this cleanup, mark them as "shared with reorg flow" in comments. |
| `GEMINI_API_KEY` (singular) env var | **Keep as alias** | Backward compatibility. Document it as an alias for single-key setups. |
| Legacy architecture diagram in README | **Replace** | The current diagram is pre-migration. Update to show the pipeline. |
| `kitty-specs/001/` plan.md TODO checkboxes | **Reconcile** | All WPs are marked done. Stale unchecked items in the original plan should be closed out. |

### Documentation Strategy

1. **README.md**: Update architecture diagram and description to reflect the AX → Normalizer → Adapter pipeline. Keep feature descriptions accurate but do not over-document internal mechanics.
2. **AGENTS.md**: Update project structure to list all current service modules. Update the "active spec" reference to point to the full kitty-specs directory, not just 001.
3. **render.yaml**: Add missing env vars (`GEMINI_API_KEYS`, `BOT_MODE`, `AUTO_APPLY_*`) to the env var table.
4. **Inline code comments**: Add brief scope comments to `executeActions()` and E2E test direct API calls to explain why they bypass the adapter.

## Implementation Phases

### Phase 1: Legacy Code Audit and Removal
Search the codebase for all remaining references to pre-migration patterns (`converse`, `converseSchema`, `ANALYZE_PROMPT`, `analyzeTask`, `runTaskIntake`). Confirm each is either dead code (remove it) or still live (document its scope with an inline comment). Remove any truly dead imports, helpers, and exports.

### Phase 2: Documentation Updates
Update `README.md` architecture diagram and key design decisions to reflect the current pipeline. Update `AGENTS.md` project structure section to list all current modules. Update `render.yaml` env var documentation. Reconcile stale track state in spec 001 plan artifacts.

### Phase 3: Configuration Cleanup
Standardize env var documentation across `README.md`, `.env.example`, and `render.yaml`. Add inline scope documentation for `executeActions()` and E2E test direct API calls. Ensure `user_context.example.js` reflects the current expected shape.

### Phase 4: Test Suite Verification
Run the full regression suite and verify all tests pass after cleanup. Verify that removed code was truly dead (no test failures). Add a test or assertion if any cleanup revealed a gap.

## Testing Strategy

- **Before cleanup**: Run `node tests/run-regression-tests.mjs` and `node --test tests/regression.test.js` to establish a baseline. All tests must pass before any changes.
- **During cleanup**: After each removal of dead code, re-run the regression suite to confirm no behavioral regressions.
- **After cleanup**: Run the full regression suite again. Verify the E2E live checklist scripts still load and parse correctly (they are opt-in and not run in CI, but should not be broken).
- **Documentation verification**: Manually review that README claims match implemented behavior. Cross-reference each command listed in README with its actual implementation in `bot/commands.js`.
- **Grep audits**: After cleanup, run targeted searches for removed patterns to confirm zero remaining references.
