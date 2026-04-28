# Architecture

## Current State

The project uses **Cavekit** for spec-driven development.

### Development Framework: Cavekit

Domain kits live in `context/kits/`. See `context/kits/cavekit-overview.md` for the full domain index, cross-reference map, and dependency graph.

### Pipeline Architecture

```
Telegram Message
    → Bot Handler (bot/commands.js, bot/callbacks.js)
    → Pipeline (services/pipeline.js)
    → Intent Extraction (services/intent-extraction.js)
    → Normalizer (services/normalizer.js)
    → TickTick Adapter (services/ticktick-adapter.js)
    → TickTick REST API

Parallel non-write paths:
    Scheduler (services/scheduler.js)
    → Daily briefing / Weekly digest / Polling notifications
    → Telegram only (no TickTick mutation)
```

See `AGENTS.md` for the full service module descriptions.

## Historical Notes

- Legacy prompt-driven write paths were removed. Current write behavior is centralized in intent extraction → normalizer → adapter for deterministic, auditable mutations.
