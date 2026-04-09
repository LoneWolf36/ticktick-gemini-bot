# 002-natural-language-task-mutations Implementation Plan

**Feature**: Single-Target Natural-Language Task Mutations  
**Created**: 2026-04-01  
**Status**: Ready for Implementation  
**Mission**: software-dev  
**Input**: Accepted `spec.md`, review-first audit, and the implemented `001-task-operations-pipeline` codebase

---

## Overview

This feature adds a safe natural-language mutation path for existing tasks by extending the already-implemented `001` pipeline rather than creating a second stack. The repo already has adapter-backed `updateTask`, `completeTask`, and `deleteTask`. What is missing is:

1. extracting a mutation request with a user-supplied target reference,
2. resolving that reference to one concrete active TickTick task,
3. failing closed when resolution is ambiguous or missing,
4. surfacing clarification through Telegram without leaving the adapter/pipeline contract.

The regenerated plan is intentionally narrow and tracks the current repo shape:

- extend `services/ax-intent.js`; do not create `src/...` modules,
- extend `services/normalizer.js`; do not introduce a second mutation normalizer stack,
- extend `services/pipeline.js` and `services/pipeline-context.js`; do not replace them,
- add one new resolver module, `services/task-resolver.js`,
- use `services/store.js` for pending clarification state,
- keep all successful writes on `TickTickAdapter`,
- add regression coverage in the existing test surfaces plus a small focused resolver test file.

---

## Confirmed Scope Guardrails

These constraints were explicitly locked before regeneration and are mandatory implementation boundaries:

- Source of truth for artifact shape: the repo’s current Spec Kitty v3.0.1 contract.
- Feature scope: `update`, `complete`, and `delete` only.
- No extra command surface such as `/done`, `/delete`, or `/undo`.
- No `reschedule` mutation type.
- No webhook invalidation, session-store subsystem, rate-limiter subsystem, or new logger module.
- No new parallel architecture besides the one new resolver module needed for deterministic matching.
- Mixed create-and-mutate requests remain out of scope and should be rejected with a terse “simpler instruction” response path.

---

## Existing Code Baseline from 001

The plan assumes these implemented seams are real and should be extended in place:

- [services/ax-intent.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/ax-intent.js): AX extraction and runtime validation.
- [services/normalizer.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/normalizer.js): normalized action shaping and validation.
- [services/pipeline.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/pipeline.js): request orchestration, execution, rollback, and result building.
- [services/pipeline-context.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/pipeline-context.js): request context builder.
- [services/ticktick-adapter.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/ticktick-adapter.js): all write operations and task snapshots.
- [bot/commands.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/bot/commands.js): current free-form Telegram entrypoint.
- [bot/callbacks.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/bot/callbacks.js): existing inline callback patterns.
- [services/store.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/services/store.js): persistent bot state.

---

## Design Decisions

### Mutation Intent Shape

Mutation actions should extend the existing AX action shape instead of replacing it with a nested payload format. For mutation actions, AX should emit:

- `type`: `update` | `complete` | `delete`
- `targetQuery`: the user’s reference to the existing task
- optional mutation fields already understood by the pipeline and normalizer (`title`, `content`, `priority`, `projectHint`, `dueDate`, `repeatHint`)
- `confidence`

This keeps the contract close to the current normalizer and avoids a second translation layer.

### Resolution Policy

- Exact title match wins immediately.
- Non-exact matching stays conservative and only auto-resolves when there is one clear winner and no close rival.
- Ambiguous results become a `clarification` pipeline result.
- Zero plausible results become a `not-found` pipeline result.
- Delete never executes unless the resolver produces one safe target.

### Telegram Clarification Flow

- Free-form messages continue to enter through `bot/commands.js`.
- Clarification options are delivered as inline buttons.
- Pending clarification state is stored in `services/store.js`.
- Callback handling is implemented in `bot/callbacks.js`.
- Selecting a candidate resumes the mutation through the pipeline rather than bypassing it.

---

## Work Package Strategy

Only WP01 and WP02 are parallel foundations. Everything else is sequential.

1. **WP01** builds the deterministic resolver.
2. **WP02** extends AX and validation contracts for mutation intent shape.
3. **WP03** locks mutation-specific normalization rules on top of WP01 and WP02.
4. **WP04** integrates task listing, resolver usage, and new pipeline result types.
5. **WP05** updates the Telegram free-form handler and persistent clarification state.
6. **WP06** wires callback-based clarification resume.
7. **WP07** hardens regressions, observability, and cleanup.

This matches the required dependency chain: WP01 and WP02 parallel, then WP03 → WP04 → WP05 → WP06 → WP07.

---

## Work Package Summary

| WP | Title | Depends On | Parallel? | Primary Files |
|----|-------|------------|-----------|---------------|
| WP01 | Task Resolver Core | None | Yes | `services/task-resolver.js`, `tests/task-resolver.test.js` |
| WP02 | AX Mutation Intent Extension | None | Yes | `services/ax-intent.js`, `tests/ax-intent.test.js` |
| WP03 | Mutation Normalizer | WP01, WP02 | No | `services/normalizer.js`, `tests/normalizer.test.js` |
| WP04 | Pipeline Integration | WP03 | No | `services/ticktick-adapter.js`, `services/pipeline-context.js`, `services/pipeline.js`, `tests/pipeline-harness.js` |
| WP05 | Bot Message Handler | WP04 | No | `bot/commands.js`, `services/store.js` |
| WP06 | Clarification UI Flow | WP05 | No | `bot/callbacks.js`, `bot/utils.js`, `services/store.js` |
| WP07 | Testing & Hardening | WP06 | No | `tests/regression.test.js`, `tests/run-regression-tests.mjs` |

---

## Implementation Constraints

- Keep the new code surface minimal. The only truly new service module should be `services/task-resolver.js`.
- Do not create any `src/` tree, extra logger service, session store, rate limiter, or webhook infrastructure.
- Do not bypass `TickTickAdapter` for successful writes.
- Reads needed for resolution may be exposed through a thin adapter helper rather than calling `TickTickClient` from bot handlers.
- Mixed create+mutation or multi-mutation requests should be rejected early and explicitly as out of scope for v1.
- Clarification state must be persisted in the existing store, not in ephemeral in-memory maps inside the bot layer.

---

## Testing Strategy

Testing remains anchored in the repo’s current test surfaces:

- focused resolver unit coverage in [tests/task-resolver.test.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/task-resolver.test.js),
- AX and normalizer mutation coverage in [tests/ax-intent.test.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/ax-intent.test.js) and [tests/normalizer.test.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/normalizer.test.js),
- pipeline and bot regressions in [tests/regression.test.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/regression.test.js) and [tests/run-regression-tests.mjs](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/run-regression-tests.mjs),
- harness updates in [tests/pipeline-harness.js](/home/lonewolf09/Documents/Projects/ticktick-gemini/tests/pipeline-harness.js).

There is no load-test package, benchmark package, or extra command suite in scope for this regenerated plan.

---

## Definition of Done

The regenerated package should be considered complete only when:

- all WP frontmatter matches the repo’s current v3.0.1 contract,
- every WP points to real repo files and implemented seams,
- the dependency chain is explicit and parseable,
- prompt files stay within the enforced sizing rules,
- the plan does not introduce scope beyond the accepted spec,
- the event log records that the planning artifacts were regenerated after review.
