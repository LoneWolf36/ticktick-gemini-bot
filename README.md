# Archon Spec-Kitty Workflow

**Production-hardened DAG workflow for executing spec-kitty missions with multi-agent review gates, crash recovery, and quality enforcement.**

Born from a laptop crash. Hardened by 126+ DAG nodes executed across 9 spec-kitty missions. Designed to be cloned and adapted by any team that runs multi-agent code generation workflows.

---

## Quick Start (3 Steps)

### 1. Clone & Install

```bash
git clone <this-repo>.git
cd archon-spec-kitty-workflow
```

Ensure you have:
- **Archon CLI** — the workflow executor (`archon run`)
- **Spec Kitty** — missions defined in `kitty-specs/` with `status.events.jsonl`
- **Qwen Coder** (or your LLM provider) — configured in `.archon/config.yaml`

### 2. Configure

```bash
cp .archon/workflow-config.example.json .archon/workflow-config.json
# Edit for your project: missions, WPs, review agents, retry settings
```

See [`workflow-config.example.json`](.archon/workflow-config.example.json) for the full schema.

### 3. Execute

```bash
# Run the full DAG
archon run -f .archon/workflows/spec-kitty-missions-complete.yaml

# Or recover from a crash
archon run spec-kitty-recovery-init spec-kitty-missions-complete
```

The workflow executes missions as a DAG — each WP goes through **implement → validate → review (5 parallel agents) → synthesize → fix → re-verify → checkpoint**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     ARCHON WORKFLOW EXECUTOR                     │
│                        (DAG Scheduler)                           │
└───────────────┬─────────────────────────────────┬───────────────┘
                │                                 │
     ┌──────────▼──────────┐           ┌─────────▼──────────┐
     │   Mission Phase 1   │           │   Mission Phase 2   │
     │  (WP01 Implement)   │──────────▶│  (WP02 Implement)   │
     └──────────┬──────────┘           └─────────┬────────────┘
                │                                 │
     ┌──────────▼─────────────────────────────────▼──────────┐
     │              REVIEW GATE (Parallel × 5)                │
     │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
     │  │Architect │ │ Security │ │ AI Eng   │ │Backend   │ │
     │  │Reviewer  │ │ Auditor  │ │          │ │ Dev      │ │
     │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
     │  └──────────┐                                         │
     │  │Code Review│   ← 5th agent                          │
     │  └──────────┘                                         │
     └──────────┬────────────────────────────────────────────┘
                │
     ┌──────────▼──────────┐
     │   SYNTHESIZE        │ ← Merge all reviews, prioritize
     │   (P0/P1/P2)        │   blockers vs warnings
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │   FIX CYCLE         │ ← Implement fixes, re-run tests
     │   (up to 3 attempts)│
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │   RE-VERIFY         │ ← Run review gate again on fixes
     │   (quorum check)    │
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │   CHECKPOINT        │ ← Save state, update status events
     │   (per-WP)          │   commit to git
     └─────────────────────┘
```

### Crash Recovery Flow

```
CRASH DETECTED
    │
    ├── Source 1: .archon/checkpoints/current-state.json
    │   └── Last completed node, timestamp, phase
    │
    ├── Source 2: kitty-specs/*/status.events.jsonl
    │   └── WP lane transitions (planned → done)
    │
    └── Source 3: git log --author="Bot"
        └── Commits with WP references
            │
            ▼
    CROSS-REFERENCE ALL THREE
    │
    ├── Nodes completed in ALL sources → SKIP
    ├── Nodes completed in SOME sources → VERIFY
    └── Nodes completed in NO sources → EXECUTE
            │
            ▼
    Resume from first incomplete node
```

---

## Key Features

| Feature | What It Does | Why It Matters |
|---------|-------------|----------------|
| **DAG Execution** | Nodes run in dependency order with parallel branches | Correctness without unnecessary serialization |
| **Multi-Agent Review** | 5 parallel agents review each WP with weighted quorum | Catches architecture, security, quality, and vision issues |
| **Crash Recovery** | 3-source cross-reference (checkpoint + git + status events) | Survives OOM kills, power loss, network failures |
| **Per-WP Checkpoints** | State saved after every WP, not just phases | Minimal rework after crash |
| **Circuit Breaker** | Auto-pauses after N agent failures, escalates to human | Prevents infinite retry loops |
| **Review Synthesis** | Merges parallel reviews into prioritized P0/P1/P2 fix list | Actionable output, not noise |
| **Fix Cycle** | Up to 3 automated fix attempts with re-verification | Self-healing without human intervention |
| **Log Rotation** | Automatic compression + truncation of workflow logs | Prevents disk exhaustion during long runs |
| **Telegram Monitoring** | Real-time notifications for failures, stuck detection, milestones | Know when to step in without watching a terminal |

---

## What This Is (And Isn't)

**This IS:**
- A workflow execution framework for spec-driven development
- A multi-agent review system with quality gates
- A crash recovery system for long-running autonomous workflows

**This is NOT:**
- A task manager or project management tool
- A replacement for Spec Kitty (it executes Spec Kitty missions)
- A CI/CD system (though it integrates with one)
- A generic DAG executor (it's purpose-built for spec-kitty)

---

## Detailed Documentation

| Document | What's In It |
|----------|-------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | DAG model, review gates, crash recovery, known limitations |
| [`docs/USAGE-GUIDE.md`](docs/USAGE-GUIDE.md) | Step-by-step setup, customization, recovery procedures, monitoring |

---

## Repository Structure

```
.archon/
├── config.yaml                    # Archon CLI config (provider, model, worktree)
├── workflow-config.example.json   # Workflow configuration template (copy this)
├── workflow-config.schema.json    # JSON Schema for validation
├── workflows/                     # DAG workflow definitions (YAML)
│   ├── spec-kitty-wp-implement.yaml
│   ├── spec-kitty-missions-complete.yaml
│   └── ...
├── commands/                      # Archon command definitions (markdown)
│   ├── spec-kitty-recovery-init.md
│   ├── spec-kitty-checkpoint-save.md
│   ├── spec-kitty-synthesize-review.md
│   ├── spec-kitty-implement-review-fixes.md
│   └── ... (25+ commands)
├── scripts/                       # Helper scripts (Node.js)
│   ├── checkpoint-manager.js
│   ├── config-validator.js
│   ├── escalation-handler.js
│   └── review-synthesizer.js
├── checkpoints/                   # Runtime state (gitignored)
└── artifacts/                     # Review reports, synthesis docs (gitignored)

scripts/
├── monitor-archon.sh              # Autonomous progress monitor + Telegram alerts
└── rotate-archon-logs.sh          # Log rotation to prevent disk exhaustion

kitty-specs/                       # Spec Kitty missions (source of truth for WP state)
└── 001-*/status.events.jsonl      # Event-sourced WP lane transitions
```

---

## License

MIT — use it, adapt it, break it, fix it.
