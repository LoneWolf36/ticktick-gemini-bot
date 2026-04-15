# 001-task-operations-pipeline Implementation Plan

**Feature**: Task Operations Pipeline
**Created**: 2026-03-08
**Status**: Ready for Implementation

## Product Vision Alignment Contract

This implementation plan is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature protects the task-writing path so the assistant can turn natural language into clean TickTick actions without leaking context, inflating titles, adding unnecessary commentary, or creating task clutter that makes execution harder.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Keep task creation and mutation cognitively light: short confirmations, no analysis unless needed, and no extra decision burden for clear requests.
- Prefer correctness over confidence: ambiguous task intent, project choice, recurrence, or mutation target must clarify or fail closed instead of guessing.
- Preserve the single structured path AX intent -> normalizer -> TickTick adapter so future behavioral features can reason about actions consistently.

**Reject or revise this artifact if**:
- The implementation restores prompt-only task execution, bypasses the adapter, or lets model prose decide writes directly.
- The implementation creates verbose coaching around straightforward task writes.
- The implementation makes more tasks when one correct task or one clarification would better support execution.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission is the safe execution foundation. It turns Telegram language into reliable TickTick task writes through the accepted path: AX intent -> normalizer -> ticktick-adapter. Its value is not task storage by itself; its value is reducing friction without creating clutter, wrong tasks, inflated tasks, or silent data loss. It must keep clear task capture terse and dependable so later behavioral guidance can rely on accurate task state.

### Required Product Behavior For This Mission

- Clear create/update/delete/complete requests are executed with minimal user friction and no coaching theatre.
- Vague or structurally risky writes are normalized into cleaner task data without inventing priorities, goals, or behavioral meaning.
- Existing task content is preserved by a single adapter-owned merge path; normalizer and pipeline must not pre-merge content or create duplicate separators.
- Operation diagnostics are privacy-aware and usable by later observability without persisting raw user text as behavioral memory.

### Cross-Mission Dependency And Drift Risk

Everything after 001 depends on this foundation. If this mission writes the wrong task, loses context, or accepts malformed operations, later planning, ranking, urgent mode, and behavioral memory will optimize around false state.

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

## Overview
This plan details the implementation of the new task operations pipeline, replacing prompt-heavy freeform logic with AX structured extraction, deterministic normalization, and a direct REST API TickTick adapter.

## Alignment Decisions
- **TickTick Integration**: Direct REST API Adapter (refactoring `services/ticktick.js` rather than using the MCP server).
- **AX Quota Management**: Wrap AX execution inside the existing `gemini.js` key rotation/quota management logic to survive free-tier limits.
- **Migration Strategy**: Clean cut. Replace old `runTaskIntake` and task parsing logic entirely without a fallback.
- **Command Scope**: Migrate `/scan` and `/review` to AX and the new Adapter because they mutate state. Leave `/briefing` and `/weekly` on the legacy `gemini.js` for now to limit scope.

## Implementation Status

**All phases completed.** See `tasks.md` and `status.events.jsonl` for completed work package details.

### Completed Work Summary

All WPs in mission 001 have been implemented, tested, and recorded:

- **WP01** — Foundations (TickTick adapter refactor)
- **WP02** — AX intent extraction and normalizer layer
- **WP03** — Pipeline integration (Telegram → AX → Normalizer → Adapter)
- **WP04** — Verification, cleanup, and legacy path removal

### Original Plan (Archived for Reference)

### Phase 1: TickTick Adapter (Foundations)
- Refactor `services/ticktick.js` into a compliant adapter module (`TickTickAdapter`).
- Expose strict interface matching FR-015: `createTask`, `updateTask`, `completeTask`, `deleteTask`, `listProjects`, `findProjectByName`, `createTasksBatch`.
- Keep existing infrastructure intact: OAuth2 token refresh, retry with exponential backoff, cache invalidation, and project-move transactional rollback.

### Phase 2: AX and Normalizer Layer
- Add AX (`@ax-llm/ax`) to the project dependencies.
- Configure AX with `apiKey` callback that delegates to the existing key rotation logic (AX supports `apiKey: () => Promise<string>`, called per request).
- Add quota-exhaustion error handler: when AX throws after exhausting its built-in retries, mark the active key unavailable and rotate to the next key.
- Define AX signatures (intents) matching the `Intent Action` spec: `type`, `title`, `content`, `priority`, `projectHint`, `dueDate`, `repeatHint`, `splitStrategy`.
- Create the Deterministic Normalizer module to convert an `Intent Action` to a `Normalized Action`:
  - Apply title limits (truncate).
  - Strip motivational/filler content.
  - Convert `repeatHint` to TickTick compatible `repeatFlag` (RRULE).
  - Resolve `projectHint` to a concrete TickTick Project ID using the cached project list.
  - Clean only the new incoming content. The adapter is the single owner of merging cleaned content with existing TickTick content per FR-007.
- Wire single-task creation (Telegram DM → AX → Normalizer → Adapter → TickTick) as vertical smoke test.

### Phase 3: Pipeline Integration
- Migrate Telegram direct message task creation to the new AX -> Normalizer -> Adapter pipeline.
- Migrate `bot/commands.js` (specifically `/scan` and `/review` flows via `runTaskIntake`) to use the new pipeline.
- Hook up `autoApply` and inline callback actions to use the new `TickTickAdapter`.
- Consume adapter operation logs in the pipeline observability path so FR-014 diagnostics show request stage, adapter stage, result, timing, and failure class without persisting raw user/task text.
- Implement graceful API failure handling (FR-016): when TickTick REST API is unavailable, preserve parsed intent and notify the user without losing data.

### Phase 4: Verification and Clean Up
- Execute E2E manual testing via Telegram interface (test creation, split tasks, recurrence mapping).
- Remove legacy `converseSchema` and `gemini.converse()` task creation logic entirely.
- Remove legacy `ANALYZE_PROMPT` usage where replaced by AX.
