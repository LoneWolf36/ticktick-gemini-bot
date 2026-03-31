# Implementation Plan: Work Style and Urgent Mode

**Branch**: `008-work-style-and-urgent-mode` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/kitty-specs/008-work-style-and-urgent-mode/spec.md`

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

## Constitution Check

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
src/
├── bot/
│   ├── commands.js      # Register /urgent toggle command
│   └── callbacks.js     # Handle inline keyboard toggle if used
├── services/
│   ├── store.js         # Redis persistence for urgent mode state
│   ├── gemini.js        # Apply urgent mode tone/ordering to AI prompts
│   └── scheduler.js     # Append urgent mode reminders to scheduled briefings
└── tests/
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