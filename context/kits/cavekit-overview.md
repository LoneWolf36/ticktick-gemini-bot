---
created: "2026-04-18T22:30:00Z"
last_edited: "2026-04-20T01:45:00Z"
---

# Cavekit Overview

## Project

**ticktick-gemini** — A behavioral support system for task execution. A Telegram bot powered by Gemini AI that helps the user act on what matters, reduce procrastination, and build better judgment over time through TickTick task management integration.

Governing document: `context/refs/product-vision.md`

## Domain Index

| Domain | Cavekit File | Requirements | Complexity | Description |
|--------|-------------|-------------|------------|-------------|
| Task Pipeline | cavekit-task-pipeline.md | 17 | complex | Core task capture, mutation, intent extraction, normalization, adapter, command surfaces, guided reorg, autonomous poll auto-apply |
| Pipeline Hardening | cavekit-pipeline-hardening.md | 12 | complex | Testing harness, failure classification, retry/rollback, observability |
| Cleanup | cavekit-cleanup.md | 5 | quick | Dead code removal, docs alignment, env standardization |
| Checklists | cavekit-checklists.md | 7 | medium | Checklist extraction, subtask creation, disambiguation |
| Briefings | cavekit-briefings.md | 15 | complex | Daily/weekly summaries, end-of-day reflection, scheduler |
| Prioritization | cavekit-prioritization.md | 12 | complex | Leverage-based ranking, source register, rationale |
| Work Style | cavekit-work-style.md | 13 | complex | Tone modes (standard/focus/urgent), prompt augmentation, intervention rules |
| Behavioral Memory | cavekit-behavioral-memory.md | 15 | complex | Signal classification, pattern detection, privacy, retention, user controls |

**Totals: 8 domains, 96 requirements**

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

`Dependencies:` lines inside each requirement are the source of truth. The graph below is a planning view of **root requirements**, not a claim that every requirement in a domain shares the same tier.

```
Tier 0 root requirements (no direct dependencies):
  ├── Task Pipeline R1 (structured intent extraction)
  ├── Task Pipeline R4 (single TickTick adapter)
  ├── Task Pipeline R8 (terse responses)
  ├── Task Pipeline R12 (privacy-aware pipeline logging)
  ├── Work Style R1 (state management contract)
  └── Behavioral Memory R1 (signal classifier core)

Tier 1 domain expansion from those roots:
  ├── Task Pipeline follow-ons (R2, R3, R5, R6, R7, R9, R10, R11, R13, R14)
  ├── Work Style follow-ons (R2-R8, R10-R13)
  ├── Pipeline Hardening (depends on Task Pipeline)
  ├── Checklists (depends on Task Pipeline)
  └── Behavioral Memory follow-ons (R2-R15)

Tier 2 product surfaces:
  ├── Prioritization (depends on Task Pipeline + optional Behavioral Memory)
  └── Briefings (depends on Task Pipeline + Prioritization + Work Style + optional Behavioral Memory)

Tier 3 stabilization:
  └── Cleanup (depends on other domains being stable)
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

## Validation Action Items — 2026-04-19

- [x] Audit all migrated Cavekit kits against implemented code and mark completed acceptance criteria so validation no longer reports 0% progress by default.
- [x] Align dependency planning here with per-requirement `Dependencies:` lines by treating the graph as root-requirement tiers, which resolves the Behavioral Memory R1 and Work Style R1 mismatches surfaced by validation.
- [x] Tooling exclusion rule: `.archon/` workflows/commands are dev tooling, excluded from product drift checks.
- [x] Checkpoint tooling removed (`commands/save-checkpoint.js`, `commands/README.md`) — `docs/ARCHITECTURE.md` stated these were intentionally removed.
- [x] Orphaned `tasks/WP*.md` prompt copies removed — canonical versions live under `kitty-specs.archived/`.
- [x] Requirement count corrected: 93 → 96 (R15 Command Surfaces + R16 Guided Reorg + R17 Autonomous Poll Auto-Apply added to Task Pipeline).
- [x] See `context/plans/cavekit-validate-followups-2026-04-19.md` for sequencing and file ownership.
