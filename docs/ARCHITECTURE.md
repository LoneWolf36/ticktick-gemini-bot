# Architecture

Deep dive into how the Archon Spec-Kitty Workflow system works — the DAG execution model, review gates, crash recovery, and the trade-offs we made.

---

## Table of Contents

- [DAG Execution Model](#dag-execution-model)
- [Review Gate Flow](#review-gate-flow)
- [Crash Recovery](#crash-recovery)
- [Checkpoint Strategy](#checkpoint-strategy)
- [Quality Gates](#quality-gates)
- [Known Limitations](#known-limitations)

---

## DAG Execution Model

### Overview

The workflow is defined as a **Directed Acyclic Graph (DAG)** in YAML. Each node represents a unit of work (implement a WP, validate it, run reviews, save checkpoint). Nodes declare their dependencies — the executor runs nodes in topological order, parallelizing where dependencies allow.

### Node Definition

```yaml
nodes:
  - id: f002-wp02-implement
    timeout: 7200000  # 2 hours in milliseconds
    depends_on: []
    bash: |
      # Command to execute (runs in a subprocess)
      archon run spec-kitty-implement 002-natural-language-task-mutations WP02

  - id: f002-wp02-validate
    timeout: 1800000
    depends_on: [f002-wp02-implement]
    bash: |
      archon run spec-kitty-validate 002-natural-language-task-mutations WP02

  - id: f002-wp02-review
    timeout: 3600000
    depends_on: [f002-wp02-validate]
    bash: |
      archon run spec-kitty-review-architecture 002-natural-language-task-mutations
```

### Execution Rules

1. **Dependency ordering**: Nodes run only after all `depends_on` nodes complete successfully.
2. **Parallel execution**: Nodes with no mutual dependencies run in parallel (up to `parallelLimit`).
3. **Timeout enforcement**: Each node has a hard timeout. Exceeding it triggers the retry/circuit breaker.
4. **Failure propagation**: If a node fails and all retries are exhausted, dependent nodes are skipped unless a fix cycle intervenes.
5. **Checkpoint gating**: After each WP's review+fix cycle, a checkpoint node saves state before moving to the next WP.

### DAG Structure Per Mission

```
Mission N
├── WP01
│   ├── implement ──▶ validate ──▶ review (parallel × 5)
│   │                                    │
│   │                              synthesize
│   │                                    │
│   │                              fix (×3 max)
│   │                                    │
│   │                              re-verify
│   │                                    │
│   └────────────────────────────── checkpoint ──┐
│                                                 │
├── WP02 ────────────────────────────────────────┘
│   └── (same flow, depends on WP01 checkpoint)
│
└── WP03
    └── (same flow, depends on WP02 checkpoint)
```

### Workflow File Location

Workflow definitions live in `.archon/workflows/`. The active production workflow is `spec-kitty-missions-complete.yaml` (126 nodes across 9 missions). Template files (`.bak`) are reference only.

---

## Review Gate Flow

### The Problem

A single LLM reviewing its own (or another LLM's) code will miss issues. Different agents have different blind spots. The solution: **parallel diverse review, then synthesize**.

### Flow

```
Implementation Complete
        │
        ▼
┌──────────────────────────────────────────┐
│         PARALLEL REVIEW (×5)             │
│                                          │
│  Agent 1: Architect Review               │
│  Agent 2: Security Auditor               │
│  Agent 3: AI Engineer                    │
│  Agent 4: Backend Dev Guidelines         │
│  Agent 5: Code Reviewer                  │
│                                          │
│  All run simultaneously (parallelLimit: 5)│
│  Each has a timeout (default: 600s)      │
└───────────────┬──────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│          REVIEW SYNTHESIS                │
│                                          │
│  • Read all 5 review reports             │
│  • Categorize: Blockers / Warnings / Info│
│  • Prioritize by severity + effort       │
│  • Output: synthesis-review-{mission}.md │
└───────────────┬──────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│           FIX CYCLE                      │
│                                          │
│  • Implement P0 fixes (blockers)         │
│  • Implement P1 fixes (warnings)         │
│  • Run tests                             │
│  • Commit changes                        │
│  • Max 3 attempts                        │
└───────────────┬──────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│         RE-VERIFICATION                  │
│                                          │
│  • Run review gate again on fixes only   │
│  • Quorum check: minimum 3 agents pass   │
│  • Mandatory agents must pass            │
│  • If fail → back to fix cycle (max 3)   │
└───────────────┬──────────────────────────┘
                │
           Pass? ├── Yes ──▶ CHECKPOINT
                │
                └── No  ──▶ CIRCUIT BREAKER
                             (escalate to human)
```

### Agent Configuration

Review agents are defined in `workflow-config.json`:

```json
{
  "review": {
    "agents": [
      {
        "id": "architect-review",
        "skill": "architect-review",
        "weight": 0.25,
        "mandatory": true,
        "tags": ["architecture", "design-patterns", "scalability"],
        "fallback": "senior-architect"
      },
      {
        "id": "security-auditor",
        "skill": "security-auditor",
        "weight": 0.25,
        "mandatory": true,
        "tags": ["security", "auth", "owasp"],
        "fallback": "backend-security-coder"
      }
      // ... 3 more primary agents + 6 backup agents
    ]
  }
}
```

**Primary agents** (6): Run in parallel for every review gate. Each has a skill ID, weight, mandatory flag, and fallback skill.

**Backup agents** (6): Activated when a primary agent fails or times out. Same structure, lower priority.

### Quorum Rules

```json
{
  "quorum": {
    "minimumPassing": 3,
    "mandatoryMustPass": true,
    "weightedThreshold": 0.6,
    "useWeighted": false
  }
}
```

- **minimumPassing**: At least 3 agents must approve.
- **mandatoryMustPass**: All agents with `mandatory: true` must approve (currently architect + security).
- **weightedThreshold**: If `useWeighted: true`, the sum of passing agent weights must exceed 0.6. Currently disabled — we use simple quorum.

### Review Categories

| Agent | Reviews For | Blocker Examples |
|-------|------------|-----------------|
| **Architect Review** | Design patterns, modularity, dependency direction, YAGNI violations | Circular dependencies, leaked abstractions, over-engineering |
| **Security Auditor** | OWASP Top 10, auth, input validation, secrets handling | Hardcoded tokens, missing input sanitization, injection vectors |
| **AI Engineer** | LLM integration, prompt quality, cost efficiency, structured outputs | Unbounded token usage, missing error handling on AI calls |
| **Backend Dev** | API design, error handling, database patterns, service layer | N+1 queries, missing error boundaries, tight coupling |
| **Code Reviewer** | Clean code, SOLID, test coverage, naming | Duplicated logic, untested paths, unclear naming |

---

## Crash Recovery

### Why Three Sources?

No single source of truth is reliable enough for a workflow that runs for hours across dozens of nodes:

| Source | Strength | Weakness |
|--------|----------|----------|
| **Checkpoint file** | Fast to read, structured, has timestamps | Stale if process crashed before writing |
| **Status events** (`status.events.jsonl`) | Authoritative for WP state, event-sourced | Doesn't track individual DAG nodes |
| **Git log** | Immutable audit trail, has actual code changes | Commits may be squashed/rebased, losing granularity |

### Recovery Algorithm

The `spec-kitty-recovery-init` command:

```
Phase 1: Load last checkpoint (.archon/checkpoints/current-state.json)
    │
    ├── If no checkpoint → resume from first node
    └── Calculate checkpoint age (staleness flag if >24h)

Phase 2: Cross-reference git state
    │
    ├── git log --since=<checkpoint_timestamp> --author="Bot"
    ├── Parse commit messages for WP references (feat(...): implement WP##)
    └── Build map: WP number → commit hash → mission

Phase 3: Cross-reference status events
    │
    ├── For each kitty-specs/*/status.events.jsonl:
    │   └── Find all events with "to_lane": "done"
    ├── Build map: mission directory → done WPs
    └── Map to DAG node names (e.g., WP02 done → f002-wp02-implement, validate, checkpoint all done)

Phase 4: Determine resume node
    │
    ├── Walk DAG nodes in dependency order
    ├── For each node, check if completed in ANY source:
    │   ├── Priority 1: Status events (most authoritative for WP completion)
    │   ├── Priority 2: Git commits (code was written)
    │   └── Priority 3: Checkpoint file (last known state)
    ├── First incomplete node → RESUME FROM HERE
    └── If all nodes complete → resumeFromNodeId: "complete"

Phase 5: Update checkpoint
    │
    ├── Write new current-state.json with:
    │   ├── recoveryRun: true
    │   ├── resumeFromNodeId: "<determined node>"
    │   ├── skippedNodes: [list of nodes to skip]
    │   ├── commitsSinceCheckpoint: <count>
    │   └── recoverySummary: {staleness, new WPs discovered, reason}
    └── Print human-readable summary
```

### Example Recovery Output

```
=== CRASH RECOVERY SUMMARY ===
Workflow:          spec-kitty-missions-complete
Last checkpoint:   2026-04-10T14:32:00Z (187 minutes ago)
Previous status:   in_progress

Commits since checkpoint: 14
WPs completed since checkpoint:
  - WP03 (a1b2c3d) [002-natural-language-task-mutations]
  - WP04 (e4f5g6h) [002-natural-language-task-mutations]

Resuming from:     f002-wp05-implement
Nodes to skip (already done): 38
Reason:            First node after last completed: f002-wp04-checkpoint
==============================
```

### What Happens After Recovery

The workflow executor reads the updated checkpoint and:
1. Skips all nodes in `skippedNodes` (marks them as completed without executing)
2. Starts execution at `resumeFromNodeId`
3. Continues normally from there

### Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| No checkpoint file exists | Resume from first node, reason: "No checkpoint found — fresh start" |
| Checkpoint is stale (>24h) | Trust git commits and status events over checkpoint's `lastCompletedPhase` |
| Git commits exist but status events don't reflect them | Prioritize git commits, flag `statusEventSyncNeeded: true` |
| Status events show more done than git commits | Trust status events (they record lane transitions), git commits for audit trail only |
| All nodes appear completed | Set `resumeFromNodeId: "complete"`, recommend global validation |

---

## Checkpoint Strategy

### Granularity

Checkpoints are saved **per WP**, not per phase or per mission. This means:

- After each WP's review+fix cycle completes, a checkpoint node saves state
- If a crash occurs mid-WP, only that WP's work is lost (not the entire mission)
- Typical WP takes 30-90 minutes — checkpoint granularity limits rework to that window

### What Gets Saved

Each checkpoint captures:

```json
{
  "version": 2,
  "workflow": "spec-kitty-missions-complete",
  "lastCompletedNodeId": "f002-wp04-checkpoint",
  "lastCompletedPhase": "f002",
  "lastCompletedMission": "002-natural-language-task-mutations",
  "lastUpdatedAt": "2026-04-10T14:32:00Z",
  "status": "in_progress",
  "git": {
    "branch": "master",
    "head_commit": "a1b2c3d",
    "last_commit_msg": "feat(002): implement WP04 — normalizer repeatHint support"
  },
  "test_status": "all passed",
  "recoveryRun": false
}
```

### Checkpoint Retention

- `retentionDays: 30` — Checkpoint files older than 30 days are eligible for cleanup
- `snapshotBeforeFix: true` — A snapshot is saved before each fix cycle (so failed fixes don't corrupt the good state)
- `maxFixAttempts: 3` — After 3 fix attempts without passing review, the circuit breaker trips

### Location

```
.archon/checkpoints/
├── current-state.json          # Active checkpoint (recovery reads this)
├── phase-f002.json             # Phase-level checkpoint (supplementary)
├── phase-f003.json
└── ...
```

---

## Quality Gates

### What Gets Checked

After each WP implementation, the following gates are enforced:

| Gate | Type | Enforced By | What It Checks |
|------|------|-------------|---------------|
| **Validation** | Structural | `spec-kitty-validate` | Tests pass, files exist, WP prompt requirements met |
| **Architecture Review** | Soft (agent judgment) | `architect-review` skill | Design patterns, modularity, YAGNI compliance |
| **Security Review** | Soft (agent judgment) | `security-auditor` skill | OWASP Top 10, input validation, secrets |
| **AI/LLM Review** | Soft (agent judgment) | `ai-engineer` skill | Prompt quality, cost, structured output correctness |
| **Backend Review** | Soft (agent judgment) | `backend-dev-guidelines` skill | API design, error handling, DB patterns |
| **Code Quality Review** | Soft (agent judgment) | `code-reviewer` skill | Clean code, SOLID, test coverage |
| **Product Vision Alignment** | Structural | `spec-kitty-review-product-vision` | Behavioral scope matches product vision doc |
| **Testing Review** | Soft (agent judgment) | `spec-kitty-review-testing` | Test coverage, regression suite updated |

### Structural vs Soft Gates

**Structural gates** are binary — they either pass or fail based on concrete criteria:
- Tests must pass (exit code 0)
- Required files must exist
- WP must be moved to `for_review` lane in Spec Kitty

**Soft gates** depend on LLM agent judgment — they produce findings (blockers/warnings/info) but the synthesis step decides what's actually blocking:
- Architecture quality
- Security posture
- Code cleanliness

### Quorum Enforcement

For soft gates, the quorum rules apply:
- Minimum 3 of 5 agents must approve
- Mandatory agents (architect + security) must approve
- If quorum not met → fix cycle → re-verify

---

## Known Limitations

This section exists because **honest documentation is better than impressive documentation**. Here's what the system doesn't do well, and what we know is fragile.

### 1. Soft Gates Are Really Soft

The review gates depend on LLM agents making judgment calls. There's no automated way to verify that "architecture is good" — it's an agent's opinion. In practice:
- Different agents may disagree on what's a blocker vs a warning
- The synthesis step tries to reconcile, but it's also an LLM making calls
- **Mitigation**: Mandatory agents (architect + security) have higher weight, and the quorum requires 3/5 agreement. This catches most issues but not all.

### 2. LLM Nondeterminism

The same WP implementation prompt may produce different code on different runs. This means:
- Fix cycles may not converge (different fixes each time)
- Re-verification may pass or fail inconsistently
- **Mitigation**: Temperature is set to 0.2 (low but not zero). Fix cycles cap at 3 attempts. Circuit breaker trips if agents keep failing.

### 3. Single-Process Execution

The workflow executor runs as a single process. If it dies (OOM, power loss, network partition), everything stops until recovery runs. There's no:
- Distributed execution
- Heartbeat-based auto-recovery (the monitor script detects death but doesn't auto-restart)
- **Mitigation**: Crash recovery is robust (3-source cross-reference). Monitor script sends Telegram alerts on crash.

### 4. No Built-In Rollback

The rollback strategy is `git-stash` — which means "undo uncommitted changes." It does NOT:
- Revert committed changes
- Rollback database state (if the WP touched external systems)
- **Mitigation**: Each WP commits independently. If a WP breaks something, `git revert` the specific commit.

### 5. Monitor Script Is Manual

`scripts/monitor-archon.sh` must be started manually. It doesn't:
- Auto-start with the workflow
- Survive terminal sessions (use `tmux` or `screen`)
- Have its own health check
- **Mitigation**: It's a simple bash script — easy to restart if it dies.

### 6. Log Files Go to /tmp

Workflow logs write to `/tmp/archon-workflow-run*.log`. On some systems:
- `/tmp` is cleared on reboot (logs lost)
- `/tmp` has limited space (log rotation handles this, but emergency >10MB logs can fill it before rotation)
- **Mitigation**: Log rotation script (`rotate-archon-logs.sh`) runs automatically. Emergency compression kicks in at 10MB.

### 7. Review Agents Can Timeout

Each agent has a 600-second timeout. For large WPs or slow LLM providers:
- Agents may timeout before completing review
- Backup agents activate (same timeout applies)
- If all agents timeout → circuit breaker
- **Mitigation**: `parallelLimit: 5` prevents overwhelming the LLM provider. Timeout is configurable per workflow.

### 8. No Multi-Tenant Support

This workflow was built for a single user on a single project. It does NOT support:
- Multiple projects simultaneously
- Different teams with different review standards
- Shared execution across machines
- **Mitigation**: The config is parameterized — you can run separate instances for separate projects.

### 9. Spec Kitty Dependency

The workflow assumes Spec Kitty manages WP state via `status.events.jsonl`. If you're not using Spec Kitty:
- Recovery won't cross-reference status events (only checkpoint + git)
- WP lane transitions won't be tracked
- You'd need to adapt the recovery command to use your own state tracking
- **Mitigation**: Checkpoint file and git log work independently of Spec Kitty.

### 10. Telegram Notifications Are Best-Effort

The monitor script sends Telegram notifications but:
- Rate-limits to once per 5 minutes (you won't get every event)
- Falls back to file logging if Telegram API is unreachable
- Requires manual `.env` configuration
- **Mitigation**: All notifications are also logged to `/tmp/archon-notifications.log` for post-hoc review.
