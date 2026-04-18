# Architecture

## Current State

The project has transitioned from Archon + Spec Kitty to **Cavekit** for spec-driven development.

### Development Framework: Cavekit

Domain kits live in `context/kits/`. See `context/kits/cavekit-overview.md` for the full domain index, cross-reference map, and dependency graph.

### Pipeline Architecture

```
Telegram Message
    → Bot Handler (bot/commands.js, bot/callbacks.js)
    → Pipeline (services/pipeline.js)
    → AX Intent Extraction (services/ax-intent.js)
    → Normalizer (services/normalizer.js)
    → TickTick Adapter (services/ticktick-adapter.js)
    → TickTick REST API
```

See `AGENTS.md` for the full service module descriptions.

## Historical Notes

- **2026-04-18**: Migrated from Spec Kitty + Archon to Cavekit. Legacy Archon workflows, quality gates, and reconciliation files were removed. Original spec-kitty artifacts are archived in `kitty-specs.archived/`.
