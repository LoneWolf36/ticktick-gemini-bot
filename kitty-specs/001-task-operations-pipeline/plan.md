# 001-task-operations-pipeline Implementation Plan

**Feature**: Task Operations Pipeline
**Created**: 2026-03-08
**Status**: Ready for Implementation

## Overview
This plan details the implementation of the new task operations pipeline, replacing prompt-heavy freeform logic with AX structured extraction, deterministic normalization, and a direct REST API TickTick adapter.

## Alignment Decisions
- **TickTick Integration**: Direct REST API Adapter (refactoring `services/ticktick.js` rather than using the MCP server).
- **AX Quota Management**: Wrap AX execution inside the existing `gemini.js` key rotation/quota management logic to survive free-tier limits.
- **Migration Strategy**: Clean cut. Replace old `runTaskIntake` and task parsing logic entirely without a fallback.
- **Command Scope**: Migrate `/scan` and `/review` to AX and the new Adapter because they mutate state. Leave `/briefing` and `/weekly` on the legacy `gemini.js` for now to limit scope.

## Phase 1: TickTick Adapter (Foundations)
- [ ] Refactor `services/ticktick.js` into a compliant adapter module (`TickTickAdapter`).
- [ ] Expose strict interface matching FR-015: `createTask`, `updateTask`, `completeTask`, `deleteTask`, `listProjects`, `findProjectByName`, `createTasksBatch`.
- [ ] Keep existing infrastructure intact: OAuth2 token refresh, retry with exponential backoff, cache invalidation, and project-move transactional rollback.

## Phase 2: AX and Normalizer Layer
- [ ] Add AX (`@ax-llm/ax`) to the project dependencies.
- [ ] Configure AX with `apiKey` callback that delegates to the existing key rotation logic (AX supports `apiKey: () => Promise<string>`, called per request).
- [ ] Add quota-exhaustion error handler: when AX throws after exhausting its built-in retries, mark the active key unavailable and rotate to the next key.
- [ ] Define AX signatures (intents) matching the `Intent Action` spec: `type`, `title`, `content`, `priority`, `projectHint`, `dueDate`, `repeatHint`, `splitStrategy`.
- [ ] Create the Deterministic Normalizer module to convert an `Intent Action` to a `Normalized Action`:
  - Apply title limits (truncate).
  - Strip motivational/filler content.
  - Convert `repeatHint` to TickTick compatible `repeatFlag` (RRULE).
  - Resolve `projectHint` to a concrete TickTick Project ID using the cached project list.
  - Preserve existing task content during updates (append/improve, never overwrite) per FR-007.
- [ ] Wire single-task creation (Telegram DM → AX → Normalizer → Adapter → TickTick) as vertical smoke test.

## Phase 3: Pipeline Integration
- [ ] Migrate Telegram direct message task creation to the new AX -> Normalizer -> Adapter pipeline.
- [ ] Migrate `bot/commands.js` (specifically `/scan` and `/review` flows via `runTaskIntake`) to use the new pipeline.
- [ ] Hook up `autoApply` and inline callback actions to use the new `TickTickAdapter`.
- [ ] Implement graceful API failure handling (FR-016): when TickTick REST API is unavailable, preserve parsed intent and notify the user without losing data.

## Phase 4: Verification and Clean Up
- [ ] Execute E2E manual testing via Telegram interface (test creation, split tasks, recurrence mapping).
- [ ] Remove legacy `converseSchema` and `gemini.converse()` task creation logic entirely.
- [ ] Remove legacy `ANALYZE_PROMPT` usage where replaced by AX.
