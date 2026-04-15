# Usage Guide

How to set up, run, customize, and recover the Archon Spec-Kitty Workflow system on any project.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Applying to a New Project](#applying-to-a-new-project)
- [Customizing the Workflow YAML](#customizing-the-workflow-yaml)
- [Running the Workflow](#running-the-workflow)
- [Crash Recovery Procedures](#crash-recovery-procedures)
- [Monitoring & Notifications](#monitoring--notifications)
- [Log Management](#log-management)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

| Tool | Version | Purpose |
|------|---------|---------|
| **Archon CLI** | Latest | DAG workflow executor (`archon run`) |
| **Qwen Coder** (or your LLM) | Configured model | Code generation and review agent |
| **Spec Kitty** | v3.1.1+ | Mission/WP definition and state tracking |
| **Git** | 2.30+ | Version control, commit tracking |
| **Node.js** | 18+ | Helper scripts (checkpoint manager, synthesizer) |
| **jq** | 1.6+ | JSON parsing in recovery/monitoring scripts |

### Recommended

| Tool | Purpose |
|------|---------|
| **tmux** or **screen** | Keep monitor script running across sessions |
| **Telegram Bot** | Real-time notifications (optional but recommended) |
| **curl** | Telegram API fallback |

### Verification

```bash
# Check Archon CLI
archon --version

# Check Spec Kitty
spec-kitty --version

# Check Qwen
qwen --version

# Check Node.js
node --version  # Should be 18+

# Check jq
jq --version    # Should be 1.6+
```

---

## Applying to a New Project

### Step 1: Copy the `.archon` Directory

```bash
# From your project root
cp -r /path/to/archon-spec-kitty-workflow/.archon ./
```

This gives you the skeleton:
```
.archon/
├── config.yaml              # Edit this for your provider/model
├── workflow-config.example.json
├── workflow-config.schema.json
├── workflows/
├── commands/
├── scripts/
├── checkpoints/             # Will be populated at runtime
└── artifacts/               # Will be populated at runtime
```

### Step 2: Configure Archon

Edit `.archon/config.yaml`:

```yaml
worktree:
  baseBranch: main  # Your default branch name

ai:
  provider: your-provider     # e.g., openai, anthropic, qwen
  model: your-model-name      # e.g., gpt-4, claude-sonnet, coder-model

docs:
  path: docs/  # Where to write generated docs
```

### Step 3: Create Workflow Configuration

```bash
cp .archon/workflow-config.example.json .archon/workflow-config.json
```

Edit `workflow-config.json`:

**Update the project section:**
```json
{
  "project": {
    "root": ".",
    "specDirectory": "kitty-specs",    // Where your Spec Kitty missions live
    "baseBranch": "main",
    "validationCommands": [
      "npm test",                       // Your project's test commands
      "npm run lint"
    ],
    "commitTemplate": {
      "conventionalCommits": true,
      "coAuthors": []
    }
  }
}
```

**Update the missions section:**

Map your actual Spec Kitty missions and WPs:

```json
{
  "missions": [
    {
      "id": "001",
      "slug": "your-mission-slug",
      "workPackages": [
        {
          "id": "WP01",
          "file": "tasks/WP01-some-feature.md",
          "dependencies": [],
          "skipIfComplete": true
        }
      ]
    }
  ]
}
```

**Customize review agents:**

Replace the skill IDs with agents available in your project:

```json
{
  "review": {
    "agents": [
      {
        "id": "your-review-agent-1",
        "skill": "your-review-skill-1",
        "weight": 0.25,
        "mandatory": true,
        "fallback": "your-fallback-skill-1"
      }
      // ... more agents
    ]
  }
}
```

### Step 4: Define Your Workflow YAML

Create a workflow definition in `.archon/workflows/`:

```bash
cp .archon/workflows/spec-kitty-wp-implement.yaml .archon/workflows/my-project-workflow.yaml
```

See [Customizing the Workflow YAML](#customizing-the-workflow-yaml) below.

### Step 5: Set Up Monitoring (Optional)

```bash
# Copy monitoring scripts
cp /path/to/archon-spec-kitty-workflow/scripts/monitor-archon.sh ./scripts/
cp /path/to/archon-spec-kitty-workflow/scripts/rotate-archon-logs.sh ./scripts/
chmod +x scripts/monitor-archon.sh scripts/rotate-archon-logs.sh

# Configure Telegram (optional)
# Add to your .env file:
# TELEGRAM_BOT_TOKEN=your-bot-token
# TELEGRAM_CHAT_ID=your-chat-id
```

### Step 6: Set Up Environment

```bash
cp workflow.env.example .archon/workflow.env
# Edit with your project paths and notification settings
```

---

## Customizing the Workflow YAML

### Anatomy of a Workflow

```yaml
name: my-workflow-name
description: |
  What this workflow does.
  Include input format and usage notes.

nodes:
  - id: unique-node-id
    timeout: 3600000        # Timeout in milliseconds
    depends_on: []          # List of node IDs that must complete first
    bash: |                 # Command to execute
      set -euo pipefail
      # Your commands here
      echo "Node executing"
```

### Common Patterns

#### Pattern 1: Implement → Validate → Review

```yaml
nodes:
  - id: impl-wp01
    timeout: 7200000
    depends_on: []
    bash: |
      archon run spec-kitty-implement my-mission WP01

  - id: validate-wp01
    timeout: 1800000
    depends_on: [impl-wp01]
    bash: |
      archon run spec-kitty-validate my-mission WP01

  - id: review-wp01
    timeout: 3600000
    depends_on: [validate-wp01]
    bash: |
      archon run spec-kitty-review my-mission WP01
```

#### Pattern 2: Parallel Branches

```yaml
nodes:
  - id: branch-a
    depends_on: [setup]
    bash: |
      echo "Running branch A"

  - id: branch-b
    depends_on: [setup]    # Same dependency → runs in parallel with branch-a
    bash: |
      echo "Running branch B"

  - id: merge-point
    depends_on: [branch-a, branch-b]  # Waits for BOTH
    bash: |
      echo "Both branches complete"
```

#### Pattern 3: Review + Synthesize + Fix

```yaml
nodes:
  # 5 parallel review agents
  - id: review-architecture
    depends_on: [validate]
    bash: archon run spec-kitty-review-architecture my-mission

  - id: review-security
    depends_on: [validate]
    bash: archon run spec-kitty-review-security my-mission

  - id: review-ai
    depends_on: [validate]
    bash: archon run spec-kitty-review-ai my-mission

  - id: review-backend
    depends_on: [validate]
    bash: archon run spec-kitty-review-backend my-mission

  - id: review-code-quality
    depends_on: [validate]
    bash: archon run spec-kitty-review-code-quality my-mission

  # Synthesize all reviews
  - id: synthesize
    depends_on: [review-architecture, review-security, review-ai, review-backend, review-code-quality]
    bash: archon run spec-kitty-synthesize-review my-mission

  # Implement fixes
  - id: fix-issues
    depends_on: [synthesize]
    bash: archon run spec-kitty-implement-review-fixes my-mission

  # Re-verify fixes
  - id: reverify
    depends_on: [fix-issues]
    bash: archon run spec-kitty-review-fixes my-mission

  # Checkpoint
  - id: checkpoint
    depends_on: [reverify]
    bash: archon run spec-kitty-checkpoint-save my-mission
```

### Workflow Naming Convention

Use kebab-case and prefix with the mission type:

- `spec-kitty-wp-implement` — Single WP implementation
- `spec-kitty-missions-complete` — Full multi-mission DAG
- `fix-issue` — Bug fix workflow

### Parameterizing Nodes

Nodes can use `$ARGUMENTS` and `$ARTIFACTS_DIR` variables:

```yaml
nodes:
  - id: implement
    bash: |
      prompt_path="$ARGUMENTS"
      qwen -y -p "$(cat $prompt_path)"
```

Run with:
```bash
archon run -f .archon/workflows/my-workflow.yaml "path/to/prompt.md"
```

---

## Running the Workflow

### Full Execution

```bash
archon run -f .archon/workflows/spec-kitty-missions-complete.yaml
```

### Single Mission

```bash
archon run -f .archon/workflows/spec-kitty-wp-implement.yaml "path/to/wp-prompt.md"
```

### With Custom Config

```bash
archon run -f .archon/workflows/my-workflow.yaml \
  --config .archon/workflow-config.json
```

### Dry Run (Validate Only)

```bash
# Validate workflow YAML syntax
node .archon/scripts/config-validator.js .archon/workflows/my-workflow.yaml
```

### Monitoring During Execution

In a **separate terminal** (use `tmux`):

```bash
# Start the monitor
./scripts/monitor-archon.sh 180  # Check every 3 minutes

# Monitor will:
# - Track git commits in real-time
# - Detect stuck nodes (>10 min with no progress)
# - Send Telegram notifications for failures/milestones
# - Save emergency state on Ctrl+C
```

---

## Crash Recovery Procedures

### Scenario 1: Process Crashed (Most Common)

The workflow process died unexpectedly (OOM, power loss, network partition).

```bash
# Step 1: Run recovery
archon run spec-kitty-recovery-init spec-kitty-missions-complete

# Step 2: Review the output
# It will show:
#   - What was completed since last checkpoint
#   - Which node to resume from
#   - How many nodes will be skipped

# Step 3: Resume the workflow
archon run -f .archon/workflows/spec-kitty-missions-complete.yaml
# The executor reads the updated checkpoint and skips completed nodes
```

### Scenario 2: Review Gate Failed

A WP failed review and the fix cycle exhausted all attempts.

```bash
# Step 1: Check the synthesis report
cat .archon/artifacts/synthesis-review-{mission-slug}.md

# Step 2: Review the fix attempt artifacts
cat .archon/artifacts/review-fix-attempt-*.md

# Step 3: Manually fix the blockers
# (The synthesis report lists P0 blockers — fix these first)

# Step 4: Commit your fixes
git add -A && git commit -m "fix({mission}): manual review blockers for WP##"

# Step 5: Move WP back to review lane
spec-kitty agent tasks move-task WP## --to for_review --mission {mission-slug}

# Step 6: Re-run the review gate only
archon run spec-kitty-review {mission-slug} WP##
```

### Scenario 3: Stuck Node (No Progress)

The monitor detected a node running for >10 minutes with no commits or file changes.

```bash
# Step 1: Check what the agent is doing
tail -50 /tmp/archon-workflow-run*.log | grep -v "heartbeat\|loop_node"

# Step 2: Check if the agent is asking a question
tail -50 /tmp/archon-workflow-run*.log | grep -i "could you\|please\|which\|clarify"

# Step 3: If genuinely stuck, kill the current node
# Find the Archon process
ps aux | grep archon

# Kill it
kill <PID>

# Step 4: Run recovery
archon run spec-kitty-recovery-init spec-kitty-missions-complete

# Step 5: Resume
archon run -f .archon/workflows/spec-kitty-missions-complete.yaml
```

### Scenario 4: Corrupted Checkpoint

The checkpoint file exists but contains inconsistent data.

```bash
# Step 1: Check checkpoint integrity
cat .archon/checkpoints/current-state.json | jq .

# Step 2: If corrupted, delete it (recovery will fall back to git + status events)
rm .archon/checkpoints/current-state.json

# Step 3: Run recovery
archon run spec-kitty-recovery-init spec-kitty-missions-complete

# The recovery will:
# - Detect no checkpoint file
# - Scan all status.events.jsonl for completed WPs
# - Scan git log for WP commits
# - Determine resume point from those two sources
```

### Scenario 5: Fresh Start (No Prior State)

```bash
# Just run the workflow from scratch
archon run -f .archon/workflows/spec-kitty-missions-complete.yaml

# Recovery will detect no checkpoint and start from the first node
```

### Recovery Output Example

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

Checkpoint updated: .archon/checkpoints/current-state.json
```

---

## Monitoring & Notifications

### Monitor Script

`scripts/monitor-archon.sh` — Autonomous progress monitor with Telegram notifications.

```bash
# Start monitoring (default: 3-minute interval)
./scripts/monitor-archon.sh

# Custom interval (60 seconds)
./scripts/monitor-archon.sh 60

# In tmux (recommended for long runs)
tmux new -s archon-monitor
./scripts/monitor-archon.sh 180
# Ctrl+B, D to detach
```

### What the Monitor Tracks

| Metric | Threshold | Action |
|--------|-----------|--------|
| **New commits** | Any | Logs commit hash and message |
| **File modifications** | Any | Lists changed files |
| **Stuck detection** | >10 min on same node, no commits | WARNING notification + auto-diagnostic |
| **Process death** | Archon process not found | CRITICAL notification + recovery instructions |
| **Node failures** | Any `dag_node_failed` log entry | Logs failure details |
| **Milestones** | Every 10 nodes completed | INFO notification with progress summary |
| **Total completion** | All 126 nodes done | Final summary notification |

### Telegram Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Get the bot token
3. Add your chat ID (send a message to your bot, then visit `https://api.telegram.org/bot<token>/getUpdates`)

```bash
# Add to your .env file
echo 'TELEGRAM_BOT_TOKEN=123456:ABC-xyz' >> .env
echo 'TELEGRAM_CHAT_ID=123456789' >> .env
```

### Notification Rate Limiting

Notifications are rate-limited to **once per 5 minutes** to avoid flooding your chat. All notifications (even rate-limited ones) are logged to:

```
/tmp/archon-notifications.log
```

### Emergency State Save

When you interrupt the monitor (Ctrl+C), it saves an emergency snapshot:

```
/tmp/archon-monitor-exit-<timestamp>/
├── archon-workflow-run*.log  # Latest log
├── commits.txt               # Last 10 commits
└── status.txt                # Git status
```

---

## Log Management

### Log Files

```
/tmp/archon-workflow-run*.log       # Workflow execution logs
/tmp/archon-notifications.log        # Telegram notification log (rate-limited entries included)
/tmp/archon-last-notify              # Timestamp of last notification (rate limiting)
```

### Log Rotation

`scripts/rotate-archon-logs.sh` — Prevents disk exhaustion from long-running workflow logs.

```bash
# Run manually
./scripts/rotate-archon-logs.sh

# Or set up a cron job (daily)
0 2 * * * /path/to/scripts/rotate-archon-logs.sh
```

**Rotation rules:**

| Log Size | Action |
|----------|--------|
| < 1 MB | No action |
| 1-5 MB | Truncate to last 5000 lines |
| 5-10 MB | Compress to `.gz` archive, truncate to empty |
| > 10 MB | Emergency: compress, keep last 2000 lines, truncate |

Archives older than 7 days are automatically deleted.

---

## Troubleshooting

### Workflow Won't Start

**Symptom**: `archon run` fails immediately with no node execution.

```bash
# Check workflow YAML syntax
node -e "const yaml = require('yaml'); console.log(yaml.parse(require('fs').readFileSync('.archon/workflows/my-workflow.yaml', 'utf8')))"

# Check Archon config
cat .archon/config.yaml

# Verify Spec Kitty missions exist
ls kitty-specs/*/spec.md 2>/dev/null || echo "No missions found"

# Check provider connectivity
qwen -m coder-model -p "test"  # Should return a response
```

### Node Times Out

**Symptom**: A node exceeds its timeout and fails.

```bash
# Check the log for what the node was doing
grep "nodeId" /tmp/archon-workflow-run*.log | tail -20

# Increase the timeout in the workflow YAML
# Change: timeout: 3600000 (1 hour)
# To:     timeout: 7200000 (2 hours)

# Or simplify the node's task (split into smaller nodes)
```

### Review Agent Fails

**Symptom**: One or more review agents fail/timeout.

```bash
# Check which agents failed
grep -i "agent.*failed\|agent.*timeout" /tmp/archon-workflow-run*.log

# Check the synthesis report
cat .archon/artifacts/synthesis-review-*.md

# If backup agents also fail:
# 1. Check circuit breaker status
grep -i "circuit.*breaker\|escalation" /tmp/archon-workflow-run*.log

# 2. Manual intervention required
# - Review the blockers listed in the synthesis report
# - Fix them manually
# - Re-run the review gate
```

### Checkpoint Not Updating

**Symptom**: Recovery shows 0 commits since checkpoint, but work was done.

```bash
# Check git log
git log --oneline -20

# Check if commits have the expected author
git log --author="Bot" --oneline -20

# If commits exist but aren't by the expected author, recovery won't count them
# Solution: ensure commit author matches what recovery searches for

# Check status events
for f in kitty-specs/*/status.events.jsonl; do
  echo "=== $(dirname $f) ==="
  tail -5 "$f"
done
```

### Telegram Notifications Not Working

**Symptom**: Monitor runs but no Telegram messages arrive.

```bash
# Check credentials
grep TELEGRAM .env

# Test Telegram connectivity
curl -s "https://api.telegram.org/bot<YOUR_TOKEN>/getMe"

# Check the notification log (all notifications are logged even if Telegram fails)
cat /tmp/archon-notifications.log

# Check rate limiting
cat /tmp/archon-last-notify
# If the timestamp is recent (< 5 min ago), you're being rate-limited
```

### Disk Space Running Low

**Symptom**: `/tmp` filling up during long workflow runs.

```bash
# Check log sizes
du -sh /tmp/archon-workflow-run*.log

# Rotate immediately
./scripts/rotate-archon-logs.sh

# Check other temp files
du -sh /tmp/archon-* 2>/dev/null

# Clean up old files
rm -f /tmp/archon-workflow-run*.log.2026*  # Old compressed logs
rm -f /tmp/archon-monitor-exit-*           # Old emergency snapshots
```

### Workflow Completed But Validation Fails

**Symptom**: All nodes report completed, but something seems wrong.

```bash
# Run global validation
archon run spec-kitty-validate-full

# Check final checkpoint
cat .archon/checkpoints/current-state.json | jq .

# Compare against status events
for f in kitty-specs/*/status.events.jsonl; do
  echo "=== $(dirname $f) ==="
  grep '"to_lane".*"done"' "$f" | wc -l
  echo "WPs done"
done

# Check git log for any uncommitted changes
git status --short
```

---

## Configuration Reference

### workflow-config.json Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `project.root` | string | Yes | `"."` | Project root directory |
| `project.specDirectory` | string | Yes | `"kitty-specs"` | Where Spec Kitty missions live |
| `project.baseBranch` | string | Yes | `"master"` | Default git branch |
| `project.validationCommands` | string[] | No | `[]` | Commands to run after each WP |
| `missions[].id` | string | Yes | — | Mission ID (matches Spec Kitty) |
| `missions[].slug` | string | Yes | — | Mission URL-safe slug |
| `missions[].workPackages[].id` | string | Yes | — | WP ID (e.g., "WP01") |
| `missions[].workPackages[].dependencies` | string[] | No | `[]` | WP IDs this depends on |
| `missions[].workPackages[].skipIfComplete` | boolean | No | `false` | Skip if already in "done" lane |
| `review.agents[].id` | string | Yes | — | Unique agent ID |
| `review.agents[].skill` | string | Yes | — | Skill/command to invoke |
| `review.agents[].weight` | number | Yes | `0.1` | Weight for weighted quorum |
| `review.agents[].mandatory` | boolean | Yes | `false` | Must pass for quorum |
| `review.agents[].fallback` | string | No | — | Backup skill if primary fails |
| `review.quorum.minimumPassing` | number | Yes | `3` | Minimum agents that must pass |
| `review.quorum.mandatoryMustPass` | boolean | Yes | `true` | Mandatory agents must pass |
| `review.timeout` | number | No | `600` | Agent timeout in seconds |
| `review.parallelLimit` | number | No | `5` | Max concurrent agents |
| `resilience.retry.maxAttempts` | number | No | `3` | Max retry attempts per node |
| `resilience.checkpoint.enabled` | boolean | No | `true` | Enable checkpointing |
| `resilience.checkpoint.maxFixAttempts` | number | No | `3` | Max fix cycle attempts |
| `ai.provider` | string | No | `"qwen"` | LLM provider name |
| `ai.model` | string | No | `"coder-model"` | LLM model name |

### workflow.env Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROJECT_DIR` | Yes | — | Absolute path to project root |
| `ARCHON_DIR` | Yes | — | Absolute path to Archon installation |
| `LOG_FILE` | No | `/tmp/archon-workflow.log` | Workflow log file path |
| `TELEGRAM_BOT_TOKEN` | No | — | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | No | — | Telegram chat ID for notifications |
| `MONITOR_INTERVAL` | No | `180` | Monitor check interval (seconds) |
| `MAX_STUCK_MINUTES` | No | `10` | Threshold for stuck detection |
