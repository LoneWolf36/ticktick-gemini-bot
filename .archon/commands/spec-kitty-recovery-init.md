---
description: Initialize crash recovery — cross-reference checkpoints, git state, and status events
argument-hint: <workflow-name>
---

# Recovery Initialization

**Input**: $ARGUMENTS

---

## Purpose

When the workflow executor starts, this command determines where to resume from by cross-referencing three sources of truth:

1. `.archon/checkpoints/current-state.json` — last saved checkpoint
2. `kitty-specs/*/status.events.jsonl` — WP completion events
3. `git log` — actual commits since last checkpoint

This command is idempotent and read-only until Phase 5 (checkpoint update). It does **not** execute any workflow nodes — it only determines the resume point and updates the checkpoint to reflect reality.

---

## Phase 1: Load Last Checkpoint

Read `.archon/checkpoints/current-state.json`. Extract:

```bash
CHECKPOINT_FILE=".archon/checkpoints/current-state.json"

if [ ! -f "$CHECKPOINT_FILE" ]; then
  echo '{"error": "no_checkpoint", "resume_from": "f002-wp02-implement", "reason": "No checkpoint file exists — starting from beginning"}'
  exit 0
fi

LAST_COMPLETED_PHASE=$(jq -r '.lastCompletedPhase // empty' "$CHECKPOINT_FILE")
LAST_COMPLETED_MISSION=$(jq -r '.lastCompletedMission // empty' "$CHECKPOINT_FILE")
LAST_UPDATED_AT=$(jq -r '.lastUpdatedAt // empty' "$CHECKPOINT_FILE")
LAST_COMPLETED_NODE=$(jq -r '.lastCompletedNodeId // empty' "$CHECKPOINT_FILE")
RECOVERY_RUN=$(jq -r '.recoveryRun // false' "$CHECKPOINT_FILE")
STATUS=$(jq -r '.status // "unknown"' "$CHECKPOINT_FILE")
```

If `lastUpdatedAt` exists, calculate staleness:

```bash
if [ -n "$LAST_UPDATED_AT" ]; then
  LAST_TS=$(date -d "$LAST_UPDATED_AT" +%s 2>/dev/null || date -u +%s)
  NOW_TS=$(date -u +%s)
  STALE_MINUTES=$(( (NOW_TS - LAST_TS) / 60 ))
  echo "Checkpoint age: ${STALE_MINUTES} minutes"
fi
```

---

## Phase 2: Cross-Reference Git State

Run git log to find commits made by the workflow since the checkpoint:

```bash
if [ -n "$LAST_UPDATED_AT" ]; then
  echo "=== Git Commits Since Checkpoint ==="
  COMMITS_JSON=$(git log --since="$LAST_UPDATED_AT" --oneline --format="%h|%s|%aI" --author="TickTick Bot" 2>/dev/null || true)

  COMMIT_COUNT=0
  WP_COMMITS=""

  while IFS='|' read -r hash msg date; do
    [ -z "$hash" ] && continue
    COMMIT_COUNT=$((COMMIT_COUNT + 1))

    # Extract WP from commit messages matching feat({mission}): implement WP{NN}
    if echo "$msg" | grep -qP 'implement WP\d+'; then
      WP_NUM=$(echo "$msg" | grep -oP 'WP\d+')
      # Extract mission from commit scope
      MISSION_SCOPE=$(echo "$msg" | grep -oP 'feat\(\K[^)]+' || echo "unknown")
      WP_COMMITS="${WP_COMMITS}{\"wp\":\"${WP_NUM}\",\"commit\":\"${hash}\",\"mission\":\"${MISSION_SCOPE}\",\"msg\":\"${msg}\"},"
      echo "  Found WP commit: ${WP_NUM} (${hash}) — ${MISSION_SCOPE}"
    fi
  done <<< "$COMMITS_JSON"

  echo "Total workflow commits: $COMMIT_COUNT"

  # Remove trailing comma
  WP_COMMITS="[${WP_COMMITS%,}]"
else
  COMMIT_COUNT=0
  WP_COMMITS="[]"
  echo "No checkpoint timestamp — skipping git comparison"
fi
```

---

## Phase 3: Cross-Reference Status Events

For each mission's `status.events.jsonl`, find WPs that have been marked as "done":

```bash
echo "=== WP Completion Status ==="

# Build a map of mission_slug -> done WPs
declare -A MISSION_DONE_WPS
declare -A MISSION_DIR_MAP

for events_file in kitty-specs/*/status.events.jsonl; do
  [ -f "$events_file" ] || continue

  mission_dir=$(basename "$(dirname "$events_file")")
  MISSION_DIR_MAP["$mission_dir"]="$events_file"

  # Find all events with "to_lane": "done" (not from migration/finalize-tasks actors)
  done_wps=$(grep '"to_lane"\s*:\s*"done"' "$events_file" \
    | grep -v '"actor"\s*:\s*"migration"' \
    | grep -v '"actor"\s*:\s*"finalize-tasks"' \
    | grep -oP '"wp_id"\s*:\s*"WP\d+"' \
    | grep -oP 'WP\d+' \
    | sort -u \
    | tr '\n' ',' | sed 's/,$//')

  if [ -n "$done_wps" ]; then
    MISSION_DONE_WPS["$mission_dir"]="$done_wps"
    echo "  $mission_dir: done=[$done_wps]"
  else
    echo "  $mission_dir: done=[]"
  fi
done
```

Build a comprehensive done-WP map for cross-referencing with the workflow DAG:

```bash
# Map mission directories to workflow phase prefixes
declare -A MISSION_TO_PHASE
MISSION_TO_PHASE["002-natural-language-task-mutations"]="f002"
MISSION_TO_PHASE["003-pipeline-hardening-and-regression"]="f003"
MISSION_TO_PHASE["004-post-migration-cleanup"]="f004"
MISSION_TO_PHASE["005-checklist-subtask-support"]="f005"
MISSION_TO_PHASE["006-briefing-weekly-modernization"]="f006"
MISSION_TO_PHASE["008-work-style-and-urgent-mode"]="f008"
MISSION_TO_PHASE["009-behavioral-signals-and-memory"]="f009"

# Build JSON of all completed nodes based on status events
COMPLETED_NODES_JSON="["
for mission_dir in "${!MISSION_DONE_WPS[@]}"; do
  phase_prefix="${MISSION_TO_PHASE[$mission_dir]}"
  [ -z "$phase_prefix" ] && continue

  done_wps="${MISSION_DONE_WPS[$mission_dir]}"
  IFS=',' read -ra WP_ARRAY <<< "$done_wps"

  for wp in "${WP_ARRAY[@]}"; do
    wp_num=$(echo "$wp" | grep -oP '\d+')
    # Each completed WP means these nodes are done:
    # - {phase}-wp{NN}-implement
    # - {phase}-wp{NN}-validate
    # - {phase}-wp{NN}-checkpoint
    COMPLETED_NODES_JSON="${COMPLETED_NODES_JSON}\"${phase_prefix}-wp${wp_num}-implement\",\"${phase_prefix}-wp${wp_num}-validate\",\"${phase_prefix}-wp${wp_num}-checkpoint\","
  done
done
COMPLETED_NODES_JSON="[${COMPLETED_NODES_JSON%,}]"
```

---

## Phase 4: Determine Resume Node

Parse the workflow YAML to build the dependency graph and find the resume point:

```bash
WORKFLOW_FILE=".archon/workflows/spec-kitty-missions-complete.yaml"

# Extract all node IDs and their dependencies from the YAML
# Output format: node_id|dep1,dep2,dep3
NODE_DEPS=$(grep -E '^\s+- id:|^\s+depends_on:' "$WORKFLOW_FILE" \
  | paste - - \
  | sed 's/.*- id: //' \
  | sed 's/depends_on: \[//' \
  | sed 's/\]//' \
  | sed 's/, /,/g' \
  | sed 's/^[[:space:]]*//' \
  | tr -s ' ')

# For each node, determine if it's completed:
# A node is completed if:
#   (a) It's a checkpoint node whose WP is in status events "done" list, OR
#   (b) There's a git commit for it since the checkpoint, OR
#   (c) It appears in the checkpoint file as lastCompletedNodeId

# Find the last completed node by walking the dependency chain
# Priority: status events > git commits > checkpoint file
LAST_ACTUAL_NODE=""
NEXT_NODE=""
SKIPPED_NODES="["
SKIPPED_COUNT=0
REASON=""

# Walk through nodes in dependency order
while IFS=' ' read -r node_id deps; do
  [ -z "$node_id" ] && continue

  # Check if this node is completed
  IS_COMPLETED=false

  # Check against completed nodes from status events
  if echo "$COMPLETED_NODES_JSON" | grep -q "\"$node_id\""; then
    IS_COMPLETED=true
  fi

  # Check against git commit WPs
  if [ "$WP_COMMITS" != "[]" ]; then
    wp_match=$(echo "$WP_COMMITS" | grep -oP "\"wp\":\"WP\d+\"" | head -1)
    if [ -n "$wp_match" ]; then
      wp_in_node=$(echo "$node_id" | grep -oP 'wp\d+' || true)
      if [ -n "$wp_in_node" ]; then
        # Check if this specific WP has a git commit
        wp_num=$(echo "$wp_in_node" | grep -oP '\d+')
        if echo "$WP_COMMITS" | grep -q "\"WP${wp_num}\""; then
          IS_COMPLETED=true
        fi
      fi
    fi
  fi

  # Check against checkpoint
  if [ -n "$LAST_COMPLETED_NODE" ] && [ "$LAST_COMPLETED_NODE" != "null" ]; then
    # If node is before or equal to last checkpoint node in dependency order
    if [[ "$node_id" == "$LAST_COMPLETED_NODE" ]]; then
      IS_COMPLETED=true
    fi
  fi

  if $IS_COMPLETED; then
    LAST_ACTUAL_NODE="$node_id"
    SKIPPED_NODES="${SKIPPED_NODES}\"${node_id}\","
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  else
    # This is the first incomplete node — our resume point
    if [ -z "$NEXT_NODE" ]; then
      NEXT_NODE="$node_id"
      REASON="First node after last completed: ${LAST_ACTUAL_NODE:-none}"
    fi
  fi
done <<< "$NODE_DEPS"

# If all nodes are completed, there's nothing to resume
if [ -z "$NEXT_NODE" ]; then
  NEXT_NODE="complete"
  REASON="All nodes appear to be completed — workflow may be finished"
fi

SKIPPED_NODES="${SKIPPED_NODES%,}]"
```

---

## Phase 5: Update Checkpoint

Write an updated `.archon/checkpoints/current-state.json` reflecting the recovery analysis:

```bash
CHECKPOINT_DIR=".archon/checkpoints"
mkdir -p "$CHECKPOINT_DIR"

CURRENT_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$CHECKPOINT_DIR/current-state.json" <<EOJSON
{
  "version": 2,
  "workflow": "spec-kitty-missions-complete",
  "recoveryRun": true,
  "previousState": {
    "lastCompletedPhase": "${LAST_COMPLETED_PHASE:-unknown}",
    "lastCompletedMission": "${LAST_COMPLETED_MISSION:-unknown}",
    "lastUpdatedAt": "${LAST_UPDATED_AT:-unknown}",
    "status": "${STATUS:-unknown}"
  },
  "lastCompletedNodeId": "${LAST_ACTUAL_NODE:-none}",
  "resumeFromNodeId": "${NEXT_NODE}",
  "skippedNodes": ${SKIPPED_NODES},
  "skippedNodeCount": ${SKIPPED_COUNT},
  "commitsSinceCheckpoint": ${COMMIT_COUNT},
  "wpCommits": ${WP_COMMITS},
  "lastUpdatedAt": "${CURRENT_TIMESTAMP}",
  "status": "resumed",
  "recoverySummary": {
    "checkpointAgeMinutes": ${STALE_MINUTES:-0},
    "newWPsDiscovered": $((SKIPPED_COUNT)),
    "resumeReason": "${REASON}"
  }
}
EOJSON

echo "Checkpoint updated: $CHECKPOINT_DIR/current-state.json"
```

---

## Output

Print a recovery summary:

```
=== CRASH RECOVERY SUMMARY ===
Workflow:          spec-kitty-missions-complete
Last checkpoint:   ${LAST_UPDATED_AT:-N/A} (${STALE_MINUTES:-0} minutes ago)
Previous status:   ${STATUS:-unknown}

Commits since checkpoint: ${COMMIT_COUNT}
WPs completed since checkpoint:
$(echo "$WP_COMMITS" | jq -r '.[] | "  - \(.wp) (\(.commit)) [\(.mission)]"' 2>/dev/null || echo "  (none detected)")

Resuming from:     ${NEXT_NODE}
Nodes to skip (already done): ${SKIPPED_COUNT}
Reason:            ${REASON}
==============================
```

Output the recovery decision as JSON for workflow executor consumption:

```json
{
  "resume_from": "${NEXT_NODE}",
  "skipped_nodes": ${SKIPPED_NODES},
  "skipped_count": ${SKIPPED_COUNT},
  "reason": "${REASON}",
  "checkpoint": "updated",
  "status": "ready_to_resume"
}
```

---

## Success Criteria

- **CHECKPOINT_LOADED**: Last checkpoint file read (or graceful handling if missing)
- **GIT_CROSSED_REFERENCED**: Workflow commits identified since checkpoint
- **STATUS_EVENTS_CROSSED_REFERENCED**: WP completion status determined from all missions
- **RESUME_NODE_IDENTIFIED**: Clear resume point determined with reasoning
- **CHECKPOINT_UPDATED**: current-state.json updated with recovery metadata
- **SUMMARY_PRINTED**: Human-readable recovery summary displayed

---

## Edge Cases

### No checkpoint file exists
- Resume from first node: `f002-wp02-implement`
- Reason: "No checkpoint found — fresh start"

### Checkpoint exists but timestamp is very old (>24 hours)
- Still cross-reference git and status events
- Mark as `staleCheckpoint: true` in output
- Trust git commits and status events over the checkpoint's `lastCompletedPhase`

### Git commits exist but status events don't reflect them
- Prioritize git commits as the source of truth
- Flag as `statusEventSyncNeeded: true`
- The workflow should update status events before resuming

### All nodes appear completed
- Set `resumeFromNodeId: "complete"`
- Recommend running global validation to confirm
- Do not modify any source files

### Status events show more done than git commits
- Status events are the authoritative source (they record WP lane transitions)
- Git commits may have been squashed or rebased
- Trust status events for node completion, git commits for audit trail
