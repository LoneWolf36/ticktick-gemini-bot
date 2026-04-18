---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-18T22:30:00Z"
---

# Cavekit Overview

## Project

**ticktick-gemini** — A behavioral support system for task execution. A Telegram bot powered by Gemini AI that helps the user act on what matters, reduce procrastination, and build better judgment over time through TickTick task management integration.

Governing document: `context/refs/product-vision.md`

## Domain Index

| Domain | Cavekit File | Requirements | Complexity | Description |
|--------|-------------|-------------|------------|-------------|
| Task Pipeline | cavekit-task-pipeline.md | 14 | complex | Core task capture, mutation, intent extraction, normalization, adapter |
| Pipeline Hardening | cavekit-pipeline-hardening.md | 12 | complex | Testing harness, failure classification, retry/rollback, observability |
| Cleanup | cavekit-cleanup.md | 5 | quick | Dead code removal, docs alignment, env standardization |
| Checklists | cavekit-checklists.md | 7 | medium | Checklist extraction, subtask creation, disambiguation |
| Briefings | cavekit-briefings.md | 15 | complex | Daily/weekly summaries, end-of-day reflection, scheduler |
| Prioritization | cavekit-prioritization.md | 12 | complex | Leverage-based ranking, source register, rationale |
| Work Style | cavekit-work-style.md | 13 | complex | Tone modes (standard/focus/urgent), prompt augmentation, intervention rules |
| Behavioral Memory | cavekit-behavioral-memory.md | 15 | complex | Signal classification, pattern detection, privacy, retention, user controls |

**Totals: 8 domains, 93 requirements**

## Cross-Reference Map

| Domain A | Interacts With | Interaction Type |
|----------|---------------|-----------------|
| Task Pipeline | Pipeline Hardening | hardening wraps pipeline with resilience |
| Task Pipeline | Checklists | checklists extend pipeline create path |
| Task Pipeline | Work Style | response verbosity respects work-style |
| Task Pipeline | Prioritization | project resolution consults ranking |
| Task Pipeline | Behavioral Memory | logs feed derived metadata only |
| Pipeline Hardening | Task Pipeline | tests exercise pipeline paths |
| Checklists | Task Pipeline | extends AX action shape |
| Briefings | Prioritization | task selection uses ranking |
| Briefings | Behavioral Memory | pattern callouts in summaries |
| Briefings | Work Style | tone/verbosity adaptation |
| Prioritization | Behavioral Memory | optional behavioral signal input |
| Work Style | Briefings | mode controls summary behavior |
| Behavioral Memory | Briefings | patterns consumed by summaries |
| Behavioral Memory | Work Style | intervention rules, surfacing delegation |

## Dependency Graph

```
Tier 0 (no dependencies):
  ├── Task Pipeline (foundation — everything depends on this)
  └── Work Style (state management contract)

Tier 1 (depends on Tier 0):
  ├── Pipeline Hardening (depends on Task Pipeline)
  ├── Checklists (depends on Task Pipeline)
  └── Behavioral Memory (depends on signal capture from pipeline + work-style intervention rules)

Tier 2 (depends on Tier 0 + 1):
  ├── Prioritization (depends on Task Pipeline + optional Behavioral Memory)
  └── Briefings (depends on Task Pipeline + Prioritization + Work Style + optional Behavioral Memory)

Tier 3 (depends on everything):
  └── Cleanup (depends on all other domains being stable)
```

## Migration Notes

Migrated from `kitty-specs/` (spec-kitty format) to `context/kits/` (cavekit format) on 2026-04-18.

**Source mapping:**
- 001-task-operations-pipeline + 002-natural-language-task-mutations → cavekit-task-pipeline.md
- 003-pipeline-hardening-and-regression → cavekit-pipeline-hardening.md
- 004-post-migration-cleanup → cavekit-cleanup.md
- 005-checklist-subtask-support → cavekit-checklists.md
- 006-briefing-weekly-modernization → cavekit-briefings.md
- 007-execution-prioritization-foundations → cavekit-prioritization.md
- 008-work-style-and-urgent-mode → cavekit-work-style.md
- 009-behavioral-signals-and-memory → cavekit-behavioral-memory.md

**Reference materials preserved in `context/refs/`:**
- research, data-model, quickstart docs from 003, 006, 007
- OpenAPI specs, JSON schemas, CSV registers
- Product Vision, Glossary
- Pipeline harness, acceptance matrix, baseline tests

**Original specs archived at `kitty-specs.archived/`**
