# 004-post-migration-cleanup Implementation Plan

**Feature**: Post-Migration Cleanup
**Created**: 2026-03-10
**Status**: Draft

## Product Vision Alignment Contract

This implementation plan is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This cleanup matters because stale docs and dead paths create false confidence and wasted work. The cleanup must make the codebase easier to use for one personal behavioral assistant, not expand infrastructure for hypothetical scale.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Remove or label legacy paths only after proving they are dead or intentionally retained for a current behavior.
- Update docs so future work stays centered on behavioral execution support, not generic task management.
- Keep configuration and onboarding clear enough that the assistant can be run and validated without adding mental overhead.

**Reject or revise this artifact if**:
- The cleanup removes a still-live path such as a briefing, weekly, or reorg helper without replacement.
- Documentation claims shipped behavioral capabilities that do not exist.
- The work adds new infrastructure, auth, billing, or multi-user abstractions unrelated to the accepted scope.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission removes stale implementation and documentation paths that would let future agents build against the wrong product. It is a drift-prevention mission: if legacy add-task behavior remains authoritative anywhere, implementers can accidentally preserve a generic task-manager pathway instead of the behavioral support system.

### Required Product Behavior For This Mission

- There is one accepted task-writing path, and documentation points agents to that path without ambiguity.
- Deprecated command names, prompt examples, and architectural explanations no longer imply legacy behavior is valid.
- Regression coverage prevents legacy paths from reappearing silently.
- The product stays simple and single-purpose instead of accumulating competing task-entry systems.

### Cross-Mission Dependency And Drift Risk

This mission depends on 001 being the canonical task pipeline. It protects all later missions from implementation drift caused by old docs, old commands, or duplicated write surfaces.

### Evidence Required Before Any WP Approval

Every implement-review cycle for this mission must produce reviewer-visible evidence for all of the following:

1. The specific Product Vision clause or behavioral scope section served by the change.
2. The local FR, NFR, plan step, task, or WP requirement implemented by the change.
3. The concrete user-visible behavior that changed, including whether the change affects capture, clarification, planning, ranking, intervention, reflection, recovery, or behavioral memory.
4. The anti-drift rule the change preserves: not a passive task manager, not generic reminders, not over-planning support, not busywork optimization, not false certainty, and not SaaS scope expansion.
5. The automated test, regression script, manual transcript, or inspection evidence that proves the behavior.
6. The downstream missions that rely on this behavior and what would break if it drifted.

### Complete 001-009 Acceptance Criteria

After all WPs in missions 001 through 009 have passed implementation, review, and mission-level acceptance, the integrated product must satisfy every item below. If any item is not demonstrably true, the 001-009 chain is not complete.

1. The user can capture clear, vague, multi-task, checklist, recurring, and mutation requests safely through the accepted pipeline without legacy path drift.
2. Ambiguous or destructive actions clarify or fail closed instead of guessing.
3. The daily plan usually contains no more than three tasks, is realistic for the user context, and includes long-term-goal work when such work exists and is plausible.
4. The system distinguishes important work from low-value busywork and actively avoids rewarding motion-as-progress.
5. Urgent mode is temporary, minimal, direct, and action-oriented; it is not the default tone and it does not mutate TickTick state unless the user explicitly asks for a task operation.
6. Weak behavioral or priority inference is never presented as fact. The assistant asks, labels uncertainty, or stays quiet.
7. Behavioral memory stores derived signals only, uses retention limits, and supports inspection/reset so memory remains a coaching aid rather than surveillance.
8. Morning start stays short; end-of-day reflection stays brief, context-aware, and non-punitive.
9. Ignored guidance causes adaptation or backing off, not louder nagging.
10. The implementation avoids MVP scope creep: no auth, billing, rate limiting, multi-tenant isolation, or SaaS infrastructure unless an accepted spec explicitly requires it.
11. User-facing copy is compact, concrete, non-judgmental, and oriented toward the next useful action.
12. No raw user message, raw task title, or raw task description is persisted in long-term behavioral memory.

### Mandatory Rejection Conditions

A reviewer must reject or reopen work in this mission if any of these are true:

- The change can pass local tests while still encouraging list management instead of task execution.
- The assistant accepts the user's first input as correct when the spec requires challenge, clarification, or safe failure.
- The change increases verbosity, ceremony, or planning overhead without improving action clarity or prioritization.
- The change optimizes low-value tasks, cosmetic organization, or generic reminders while ignoring meaningful progress.
- The change presents weak inference as certainty or invents goals, constraints, priorities, or behavioral patterns.
- The change stores raw user/task content in behavioral memory or logs where the mission only allows derived signals.
- The change introduces auth, billing, rate limiting, multi-tenant isolation, or platform-scale infrastructure not accepted by spec.
- The reviewer cannot trace the change from Product Vision -> spec/plan/task -> code/docs -> test evidence.

### Claim Boundary

When this mission is marked done, the claim is not merely that its files changed or tests passed. The claim is that this mission now contributes its defined role to the complete behavioral support system. The stronger statement, "after running 001 through 009 the product exactly matches the vision", is only valid when every mission enforces this contract, every WP has review evidence, and a final mission review confirms spec-to-code-to-test-to-product-vision fidelity across the whole chain.

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
