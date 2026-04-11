# 002-natural-language-task-mutations Implementation Plan

**Feature**: Single-Target Natural-Language Task Mutations
**Created**: 2026-04-01
**Status**: Ready for Implementation
**Mission**: software-dev
**Input**: Accepted `spec.md`, review-first audit, and the implemented `001-task-operations-pipeline` codebase

---

## Product Vision Alignment Contract

This implementation plan is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature reduces task-maintenance friction while protecting trust: the user can clean up or complete work quickly, but the system must never mutate the wrong task just to appear helpful.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Resolve exactly one target before any update, completion, or deletion.
- Ask narrow clarification questions when target confidence is low or when pronouns and fuzzy references create ambiguity.
- Keep mutation confirmations terse so the task system remains an execution aid rather than another inbox to read.

**Reject or revise this artifact if**:
- Any bulk or multi-target mutation is introduced without an accepted spec.
- A delete or complete operation proceeds on fuzzy confidence alone.
- The user is forced into command syntax for clear natural-language maintenance.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission gives the user a low-friction way to correct, complete, reschedule, or delete existing work by language. It exists to reduce task-management overhead, not to encourage endless list grooming. It must fail closed when target identity or intent is uncertain, because confident mutation of the wrong task is worse than asking a short clarification.

### Required Product Behavior For This Mission

- Natural-language mutations identify the correct target task or ask for clarification instead of guessing.
- Completion, deletion, update, schedule, and recurrence changes preserve user intent and avoid destructive side effects.
- The system remains concise and operational; it does not turn updates into planning sessions unless ambiguity requires it.
- Mutation behavior supports trust: the user can quickly correct the plan without being punished by extra ceremony.

### Cross-Mission Dependency And Drift Risk

This mission depends on 001 task operations and feeds every later surface that assumes the user can keep task state current without manual TickTick cleanup.

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
