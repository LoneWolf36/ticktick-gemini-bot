# Post-Migration Cleanup — Work Packages

**Feature**: 004-post-migration-cleanup
**Created**: 2026-03-10
**Total Subtasks**: 15
**Total Work Packages**: 4
**Estimated Effort**: Low-Complexity

---

## Phase 1: Legacy Code Removal

### WP01 — Dead Code Removal and Legacy Boundary Documentation

**Goal**: Remove truly dead code paths from the pre-migration era and document the scope of remaining legacy helpers that are intentionally retained.

**Priority**: P1 — Foundation for clean codebase
**Dependencies**: None
**Parallelisable with**: WP02

**Requirement Refs**: FR-003, FR-004, FR-005

**Included Subtasks**:
- [ ] **T001** — Grep audit: search for `converse`, `converseSchema`, `ANALYZE_PROMPT`, `analyzeTask`, `runTaskIntake` across all `.js`/`.mjs` files. Remove any dead references found in production code (not spec markdown files).
- [ ] **T002** — Remove dead imports and exports uncovered by the grep audit: unused helper functions, stale schema imports, and orphaned utility functions that have no remaining callers.
- [ ] **T003** — Add inline scope comment to `executeActions()` in `bot/commands.js` documenting its narrowed role as a reorg policy-sweep helper (not the primary task-creation path).
- [ ] **T004** — Add inline scope comments to E2E live test files (`tests/e2e-live-checklist.mjs`, `tests/e2e-live-ticktick.mjs`) documenting that direct `TickTickClient` calls are intentional (opt-in live API validation, not production paths).
- [ ] **T005** — Audit `GeminiAnalyzer` reorg helpers (`_buildFallbackReorgProposal`, `_normalizeReorgProposal`) against spec 006. Add "shared with reorg flow" comments if still live, or remove if fully superseded by structured-summary surfaces.

**Acceptance Criteria**:
- AC-001: Zero production-code references to `converse`, `converseSchema`, `ANALYZE_PROMPT`, `analyzeTask`, or `runTaskIntake` remain (spec markdown files excluded).
- AC-002: `executeActions()` has an inline comment explaining its current scope and why it is retained.
- AC-003: E2E live test files have comments documenting their intentional adapter bypass.
- AC-004: All regression tests pass after removals.

**Complexity**: Low

---

## Phase 2: Documentation Updates

### WP02 — README and Architecture Documentation

**Goal**: Update `README.md` to reflect the current AX → Normalizer → Adapter pipeline architecture.

**Priority**: P1 — Primary maintainer-facing documentation
**Dependencies**: WP01 (know what was removed)
**Parallelisable with**: WP03

**Requirement Refs**: FR-001, FR-002

**Included Subtasks**:
- [ ] **T006** — Replace the architecture diagram with one that shows the pipeline: `Telegram message → AX intent extraction → Deterministic normalizer → TickTick adapter → TickTick API`, with the scheduler and Gemini briefing/weekly flows shown as parallel paths.
- [ ] **T007** — Update the "Key Design Decisions" section to mention the AX pipeline, deterministic normalization, and adapter-centric writes. Remove or update any decisions that describe pre-migration behavior.
- [ ] **T008** — Review each command listed in the Telegram Commands table and verify its description matches current implementation. Update `/scan` description if needed.
- [ ] **T009** — Reconcile spec 001 plan.md: close out any stale unchecked TODO items now that all WPs are marked done.

**Acceptance Criteria**:
- AC-005: README architecture diagram accurately depicts the current pipeline.
- AC-006: Key Design Decisions section references the AX pipeline and adapter contract.
- AC-007: All command descriptions match actual behavior.
- AC-008: Spec 001 plan.md has no misleading unchecked items for completed work.

**Complexity**: Low

### WP03 — AGENTS.md and render.yaml Documentation

**Goal**: Update repository guidelines and deployment env var documentation to reflect current module structure and configuration.

**Priority**: P2 — Internal maintainer docs
**Dependencies**: WP01
**Parallelisable with**: WP02

**Requirement Refs**: FR-001

**Included Subtasks**:
- [ ] **T010** — Update AGENTS.md "Project Structure & Module Organization" to list all current service modules: `ax-intent.js`, `normalizer.js`, `pipeline.js`, `ticktick-adapter.js`, `execution-prioritization.js`, `pipeline-context.js`, `pipeline-observability.js`, `schemas.js`.
- [ ] **T011** — Update AGENTS.md reference from "kitty-specs/001-task-operations-pipeline/ stores the active spec" to reference the full kitty-specs directory and note that multiple specs exist.
- [ ] **T012** — Add missing env vars to render.yaml documentation: `GEMINI_API_KEYS` (plural, for key rotation), `BOT_MODE`, `AUTO_APPLY_LIFE_ADMIN`, `AUTO_APPLY_DROPS`, `AUTO_APPLY_MODE`.
- [ ] **T013** — Update `.env.example` comments to clarify `GEMINI_API_KEY` (singular, legacy alias) vs `GEMINI_API_KEYS` (plural, recommended for rotation).

**Acceptance Criteria**:
- AC-009: AGENTS.md project structure lists all current service modules.
- AC-010: render.yaml env var table includes all vars used by server.js.
- AC-011: `.env.example` documents both key env vars and their relationship.

**Complexity**: Low

---

## Phase 3: Configuration Cleanup

### WP04 — Env Var Standardization and Context Template Update

**Goal**: Standardize environment variable documentation and ensure the user context template reflects the current expected shape.

**Priority**: P2 — Developer experience and onboarding
**Dependencies**: WP02, WP03
**Parallelisable with**: None (follows doc updates)

**Requirement Refs**: FR-001, FR-004

**Included Subtasks**:
- [ ] **T014** — Ensure `.env.example`, `README.md` setup section, and `render.yaml` env var table are consistent: same vars, same descriptions, same defaults. No var should appear in one place but not the others.
- [ ] **T015** — Review `services/user_context.example.js` and update its template content to reflect the current shape expected by the pipeline (goal theme profiles, execution prioritization hints, behavioral patterns). Add comments explaining each section.
- [ ] **T016** — Verify `server.js` env var validation (`REQUIRED_VARS`) aligns with what is documented as required vs optional in README and render.yaml.

**Acceptance Criteria**:
- AC-012: Every env var in `server.js` appears in `.env.example`, `README.md`, and `render.yaml` with consistent documentation.
- AC-013: `user_context.example.js` has up-to-date template content and section comments.
- AC-014: Required vs optional vars are clearly distinguished across all three docs.

**Complexity**: Low

---

## Phase 4: Test Suite Verification

### WP05 — Full Regression Verification After Cleanup

**Goal**: Run the complete test suite after all cleanup changes and verify nothing is broken. Add coverage for any gaps revealed during cleanup.

**Priority**: P1 — Safety net
**Dependencies**: WP01, WP02, WP03, WP04
**Parallelisable with**: None

**Requirement Refs**: FR-004

**Included Subtasks**:
- [ ] **T017** — Run baseline: execute `node tests/run-regression-tests.mjs` and `node --test tests/regression.test.js` before any changes. Record pass/fail status.
- [ ] **T018** — After WP01 dead-code removal, re-run regression suite. Confirm no failures from removed code. If any test breaks, either restore the code or update the test.
- [ ] **T019** — After all phases complete, run final regression suite. All tests must pass.
- [ ] **T020** — Run grep verification for removed patterns (`converse`, `converseSchema`, `ANALYZE_PROMPT`, `analyzeTask`, `runTaskIntake`) across production code to confirm zero remaining references.
- [ ] **T021** — Verify E2E live test scripts (`tests/e2e-live-checklist.mjs`, `tests/e2e-live-ticktick.mjs`) still load and parse without syntax errors (do not run against live API — just confirm module resolution).

**Acceptance Criteria**:
- AC-015: Full regression suite passes after all cleanup changes.
- AC-016: Zero production-code references to removed legacy patterns remain.
- AC-017: E2E live test scripts load without errors.
- AC-018: Documentation changes (README, AGENTS.md, render.yaml) are internally consistent — no contradictions between files.

**Complexity**: Low

---

## Summary

| WP | Title | Subtasks | Phase | Dependencies | Complexity |
|----|-------|----------|-------|-------------|------------|
| WP01 | Dead Code Removal & Legacy Boundaries | 5 | 1 | None | Low |
| WP02 | README & Architecture Docs | 4 | 2 | WP01 | Low |
| WP03 | AGENTS.md & render.yaml | 4 | 2 | WP01 | Low |
| WP04 | Env Var & Context Standardization | 3 | 3 | WP02, WP03 | Low |
| WP05 | Regression Verification | 5 | 4 | WP01-04 | Low |

**Parallelisation highlights**: WP02 and WP03 can run in parallel after WP01 completes.

**MVP scope**: WP01 + WP02 + WP05 = dead code removed, docs updated, tests passing.

**Risk assessment**: Low risk — no behavioral changes, only removal of dead code and documentation updates. The main risk is accidentally removing code that is still used; this is mitigated by running the regression suite after each removal.
