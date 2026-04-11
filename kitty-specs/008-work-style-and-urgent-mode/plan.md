# Implementation Plan: Work Style and Urgent Mode

**Branch**: `008-work-style-and-urgent-mode` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/kitty-specs/008-work-style-and-urgent-mode/spec.md`

## Product Vision Alignment Contract

This implementation plan is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature controls intervention level. Normal mode must stay humane and cognitively light; urgent mode is a temporary escalation for immediate clarity, not a permanent personality change.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Default to normal humane guidance and urgent mode off unless explicitly set or strongly justified by accepted logic.
- Urgent mode may change tone and ordering, but must not mutate TickTick data or become noisy.
- Return to lighter guidance when the urgent condition is resolved or when confidence is low.

**Reject or revise this artifact if**:
- The assistant becomes a judgmental boss or escalates repeatedly after being ignored.
- Urgent mode is inferred weakly and then treated as fact.
- State management makes future simplification harder without product value.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission defines the product's tone under pressure. The default system should be humane, collaborative, and calm. Urgent mode is a temporary escalation for overwhelm, limited time, or high-confidence stuck patterns. It must be direct without becoming a judgmental boss, and it must back off or soften when inference is weak or guidance is ignored.

### Required Product Behavior For This Mission

- Urgent mode produces minimal, direct, action-oriented guidance and never becomes the default personality.
- The system challenges the user only when confidence and context justify it.
- Repeated ignored guidance causes adaptation or backing off, not louder escalation.
- Urgent mode and intervention copy do not mutate TickTick data unless an explicit task operation is requested through accepted flows.

### Cross-Mission Dependency And Drift Risk

This mission depends on task reliability from 001-005, daily surfaces from 006, and ranking from 007. It also provides intervention evidence and style constraints for 009 behavioral memory.

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

## Summary

Implement a new user-state model for recommendations that defines a single "humane" work-style mode as the default, and provides a manual "urgent mode" toggle. The toggle changes the task ordering and recommendation tone via the AI pipeline without modifying underlying TickTick data. Urgent mode state is persisted in Redis, and active urgent mode will trigger reminders in daily and weekly briefings.

## Technical Context

**Language/Version**: Node.js (ESM)
**Primary Dependencies**: Express, Grammy (Telegram Bot), @google/generative-ai, ioredis, node-cron
**Storage**: Redis (via `ioredis`) for user state persistence
**Testing**: Mocha/Chai (E2E tests in `tests/`)
**Target Platform**: Node.js Server / Telegram Bot
**Project Type**: Server/Bot Application
**Performance Goals**: N/A
**Constraints**: Do not modify TickTick data based on urgent mode. Only affect the AI's internal recommendation output.
**Scale/Scope**: Bot layer commands, Redis state persistence, AI prompt augmentation, Briefing generator.

## Charter Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Context Management**: Validated. The state model is kept simple (Humane + Urgent toggle).
- **Security**: Validated. State changes only affect output formatting, no new data exposed.
- **Dependencies**: No new dependencies introduced.

## Project Structure

### Documentation (this feature)

```
kitty-specs/008-work-style-and-urgent-mode/
├── plan.md              # This file
├── spec.md              # Feature specification
└── tasks.md             # Tasks definition (to be generated)
```

### Source Code

```
bot/
├── commands.js      # Register /urgent toggle command
└── callbacks.js     # Handle inline keyboard toggle if used
services/
├── store.js         # Redis persistence for urgent mode state
├── gemini.js        # Apply urgent mode tone/ordering to AI prompts
└── scheduler.js     # Append urgent mode reminders to scheduled briefings
tests/
├── e2e-live-ticktick.mjs  # Add E2E tests for urgent mode toggling and output checking
└── e2e-live-checklist.mjs
```

**Structure Decision**: The feature spans the Bot Layer, Service Layer (Store/State), and AI/Briefing logic. We will modify existing files to inject the state resolution and augment prompts.

## Parallel Work Analysis

*Designed to ensure tasks can be run in parallel by multiple agents.*

### Dependency Graph

```
Phase 1 (Foundation): State Management Contract
        │
        ▼
Phase 2 (Parallel Execution):
  ├─▶ Stream A: Telegram Bot Interface (Commands & Callbacks)
  ├─▶ Stream B: AI Prompt Augmentation (Gemini & Prioritization)
  └─▶ Stream C: Briefing Reminders (Scheduler & Briefing Commands)
        │
        ▼
Phase 3 (Integration & E2E Testing)
```

### Work Distribution

- **Sequential work (Phase 1)**:
  - Define and implement the Redis storage contract in `services/store.js` (or similar state manager) to get/set the `urgent_mode` boolean.
  - Must define the default fallback (Humane ON, Urgent OFF) here.
- **Parallel streams (Phase 2)**:
  - **Agent 1 (Bot UI)**: Modify `bot/commands.js` to add the `/urgent` command (or inline button). Hook it up to the State Management Contract.
  - **Agent 2 (AI Core)**: Modify `services/gemini.js` and `services/execution-prioritization.js` to fetch the urgent state and adjust the system prompts (more direct tone, urgent-aware ordering) when `urgent_mode` is true.
  - **Agent 3 (Briefings)**: Modify `services/scheduler.js` and briefing commands in `bot/commands.js` to append a clear reminder string to the briefing text if `urgent_mode` is true.
- **Sequential work (Phase 3)**:
  - Write E2E tests in `tests/` verifying the scenarios defined in the spec.

### Coordination Points

- **State Contract Sync**: All parallel agents must agree on the Redis getter/setter signatures (e.g., `async getUrgentMode(userId)`, `async setUrgentMode(userId, boolean)`).
- **Integration Testing**: Once Streams A, B, and C are merged, the E2E tests will validate that turning on urgent mode via the bot correctly changes the AI recommendation output and briefing reminders.
