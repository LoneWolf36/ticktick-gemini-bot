#!/usr/bin/env bash
# workflow-recovery.sh — Check recovery state and determine resume point
# Usage: bash scripts/workflow-recovery.sh [--workflow <name>]
set -euo pipefail

PROJECT_DIR="/home/lonewolf09/Documents/Projects/ticktick-gemini"
cd "$PROJECT_DIR"

WORKFLOW_NAME="${1:-cavekit-build}"
CHECKPOINT_FILE=".archon/checkpoints/current-state.json"
WORKFLOW_FILE=".archon/workflows/${WORKFLOW_NAME}.yaml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         WORKFLOW CRASH RECOVERY CHECKER                  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ──────────────────────────────────────────────────────────────
# 1. Show current checkpoint
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}=== Current Checkpoint ===${NC}"
if [ -f "$CHECKPOINT_FILE" ]; then
  LAST_UPDATED=$(jq -r '.lastUpdatedAt // empty' "$CHECKPOINT_FILE" 2>/dev/null)
  LAST_PHASE=$(jq -r '.lastCompletedPhase // "none"' "$CHECKPOINT_FILE" 2>/dev/null)
  LAST_MISSION=$(jq -r '.lastCompletedMission // "none"' "$CHECKPOINT_FILE" 2>/dev/null)
  STATUS=$(jq -r '.status // "unknown"' "$CHECKPOINT_FILE" 2>/dev/null)
  RECOVERY_RUN=$(jq -r '.recoveryRun // false' "$CHECKPOINT_FILE" 2>/dev/null)
  VERSION=$(jq -r '.version // 1' "$CHECKPOINT_FILE" 2>/dev/null)

  echo "  File:          $CHECKPOINT_FILE"
  echo "  Version:       $VERSION"
  echo "  Last phase:    $LAST_PHASE"
  echo "  Last mission:  $LAST_MISSION"
  echo "  Status:        $STATUS"
  echo "  Updated at:    ${LAST_UPDATED:-N/A}"
  echo "  Recovery run:  $RECOVERY_RUN"

  if [ -n "$LAST_UPDATED" ]; then
    LAST_TS=$(date -d "$LAST_UPDATED" +%s 2>/dev/null || echo "0")
    NOW_TS=$(date -u +%s)
    STALE_MINUTES=$(( (NOW_TS - LAST_TS) / 60 ))
    STALE_HOURS=$(( STALE_MINUTES / 60 ))
    STALE_DAYS=$(( STALE_HOURS / 24 ))

    if [ "$STALE_DAYS" -gt 0 ]; then
      echo -e "  Age:           ${RED}${STALE_DAYS}d ${STALE_HOURS}h ${STALE_MINUTES}m${NC}"
    elif [ "$STALE_HOURS" -gt 0 ]; then
      echo -e "  Age:           ${YELLOW}${STALE_HOURS}h ${STALE_MINUTES}m${NC}"
    else
      echo -e "  Age:           ${GREEN}${STALE_MINUTES}m${NC}"
    fi
  fi

  # Show previous state if this was a recovery run
  if [ "$RECOVERY_RUN" = "true" ]; then
    PREV_PHASE=$(jq -r '.previousState.lastCompletedPhase // "N/A"' "$CHECKPOINT_FILE")
    PREV_MISSION=$(jq -r '.previousState.lastCompletedMission // "N/A"' "$CHECKPOINT_FILE")
    PREV_TS=$(jq -r '.previousState.lastUpdatedAt // "N/A"' "$CHECKPOINT_FILE")
    echo ""
    echo "  (Previous state before recovery: phase=$PREV_PHASE, mission=$PREV_MISSION, updated=$PREV_TS)"
  fi
else
  echo -e "  ${RED}No checkpoint found — workflow has never been checkpointed${NC}"
fi
echo ""

# ──────────────────────────────────────────────────────────────
# 2. Show git commits since checkpoint timestamp
# ──────────────────────────────────────────────────────────────
if [ -n "${LAST_UPDATED:-}" ]; then
  echo -e "${BLUE}=== Git Commits Since Checkpoint ===${NC}"
  COMMITS=$(git log --since="$LAST_UPDATED" --oneline --author="TickTick Bot" 2>/dev/null || true)
  if [ -n "$COMMITS" ]; then
    echo "$COMMITS" | head -20
    TOTAL=$(echo "$COMMITS" | wc -l)
    if [ "$TOTAL" -gt 20 ]; then
      echo "  ... and $((TOTAL - 20)) more commits"
    fi
    echo -e "  ${GREEN}Total: $TOTAL commits${NC}"
  else
    echo "  (No commits since checkpoint timestamp)"
  fi
  echo ""
fi

# Show all recent workflow-related commits (last 10 regardless of checkpoint)
echo -e "${BLUE}=== Recent Workflow Commits (last 10) ===${NC}"
RECENT=$(git log --oneline --author="TickTick Bot" -10 2>/dev/null || true)
if [ -n "$RECENT" ]; then
  echo "$RECENT"
else
  echo "  (No workflow commits found)"
fi
echo ""

# ──────────────────────────────────────────────────────────────
# 3. Show WP completion status from status events
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}=== WP Completion Status ===${NC}"

# Mission directory -> workflow phase prefix mapping
declare -A MISSION_TO_PHASE
MISSION_TO_PHASE["001-task-operations-pipeline"]="f001"
MISSION_TO_PHASE["002-natural-language-task-mutations"]="f002"
MISSION_TO_PHASE["003-pipeline-hardening-and-regression"]="f003"
MISSION_TO_PHASE["004-post-migration-cleanup"]="f004"
MISSION_TO_PHASE["005-checklist-subtask-support"]="f005"
MISSION_TO_PHASE["006-briefing-weekly-modernization"]="f006"
MISSION_TO_PHASE["007-execution-prioritization-foundations"]="f007"
MISSION_TO_PHASE["008-work-style-and-urgent-mode"]="f008"
MISSION_TO_PHASE["009-behavioral-signals-and-memory"]="f009"

TOTAL_DONE=0

for events_file in kitty-specs/*/status.events.jsonl; do
  [ -f "$events_file" ] || continue

  mission_dir=$(basename "$(dirname "$events_file")")
  phase_prefix="${MISSION_TO_PHASE[$mission_dir]:-?}"

  # Count done WPs (exclude migration and finalize-tasks bootstrap events)
  # Use || true to prevent pipefail from killing the script when grep finds no matches
  done_wps=$(grep '"to_lane"[[:space:]]*:[[:space:]]*"done"' "$events_file" 2>/dev/null \
    | grep -v '"actor"[[:space:]]*:[[:space:]]*"migration"' \
    | grep -v '"actor"[[:space:]]*:[[:space:]]*"finalize-tasks"' \
    | grep -oE '"wp_id"[[:space:]]*:[[:space:]]*"WP[0-9]+"' \
    | grep -oE 'WP[0-9]+' \
    | sort -u \
    | tr '\n' ' ' || true)

  planned_wps=$(grep '"to_lane"[[:space:]]*:[[:space:]]*"planned"' "$events_file" 2>/dev/null \
    | grep -oE '"wp_id"[[:space:]]*:[[:space:]]*"WP[0-9]+"' \
    | grep -oE 'WP[0-9]+' \
    | sort -u \
    | tr '\n' ' ' || true)

  done_count=0
  if [ -n "$done_wps" ]; then
    done_count=$(echo "$done_wps" | wc -w)
  fi
  TOTAL_DONE=$((TOTAL_DONE + done_count))

  # Color code: green if all done, yellow if in progress, red if none
  if [ "$done_count" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} $mission_dir (phase: $phase_prefix)"
    echo "      done=[$done_wps]"
  else
    echo -e "  ${YELLOW}○${NC} $mission_dir (phase: $phase_prefix)"
  fi
  if [ -n "$planned_wps" ]; then
    echo "      planned=[$planned_wps]"
  fi
done

echo ""
echo -e "  ${GREEN}Total WPs completed: $TOTAL_DONE${NC}"
echo ""

# ──────────────────────────────────────────────────────────────
# 4. Determine recommended resume point
# ──────────────────────────────────────────────────────────────
echo -e "${BLUE}=== Recommended Resume Point ===${NC}"

if [ ! -f "$WORKFLOW_FILE" ]; then
  echo -e "  ${RED}Workflow file not found: $WORKFLOW_FILE${NC}"
  exit 1
fi

# Extract node IDs from the workflow in order
# Each "- id:" line should be its own entry
mapfile -t ALL_NODES < <(grep -E '^[[:space:]]+- id:' "$WORKFLOW_FILE" | sed 's/.*- id:[[:space:]]*//' | sed 's/[[:space:]]*$//')

if [ ${#ALL_NODES[@]} -eq 0 ]; then
  echo -e "  ${RED}No nodes found in workflow file${NC}"
  exit 1
fi

echo "  Total workflow nodes: ${#ALL_NODES[@]}"
echo ""

# Build set of completed nodes from status events
declare -A COMPLETED_NODE_SET
for events_file in kitty-specs/*/status.events.jsonl; do
  [ -f "$events_file" ] || continue
  mission_dir=$(basename "$(dirname "$events_file")")
  phase_prefix="${MISSION_TO_PHASE[$mission_dir]:-}"
  [ -z "$phase_prefix" ] && continue

  done_wps=$(grep '"to_lane"[[:space:]]*:[[:space:]]*"done"' "$events_file" 2>/dev/null \
    | grep -v '"actor"[[:space:]]*:[[:space:]]*"migration"' \
    | grep -v '"actor"[[:space:]]*:[[:space:]]*"finalize-tasks"' \
    | grep -oE '"wp_id"[[:space:]]*:[[:space:]]*"WP[0-9]+"' \
    | grep -oE 'WP[0-9]+' \
    | sort -u || true)

  for wp in $done_wps; do
    wp_num=$(echo "$wp" | grep -oE '[0-9]+')
    # Mark all three node types as completed
    COMPLETED_NODE_SET["${phase_prefix}-wp${wp_num}-implement"]=1
    COMPLETED_NODE_SET["${phase_prefix}-wp${wp_num}-validate"]=1
    COMPLETED_NODE_SET["${phase_prefix}-wp${wp_num}-checkpoint"]=1
  done
done

# Also mark review and checkpoint phase-completion nodes as done
# if all WPs for that phase are done
declare -A PHASE_WP_COUNTS
PHASE_WP_COUNTS["f002"]=6   # WP02-WP07
PHASE_WP_COUNTS["f003"]=5   # WP01-WP04, WP06
PHASE_WP_COUNTS["f004"]=5   # WP01-WP05
PHASE_WP_COUNTS["f005"]=6   # WP01-WP06
PHASE_WP_COUNTS["f008"]=1   # WP03
PHASE_WP_COUNTS["f006"]=2   # WP02, WP06
PHASE_WP_COUNTS["f009"]=7   # WP01-WP07

# Count done WPs per phase
declare -A PHASE_DONE_COUNTS
for key in "${!COMPLETED_NODE_SET[@]}"; do
  if [[ "$key" =~ ^(f[0-9]+)-wp([0-9]+)-implement$ ]]; then
    phase="${BASH_REMATCH[1]}"
    count=${PHASE_DONE_COUNTS[$phase]:-0}
    PHASE_DONE_COUNTS[$phase]=$((count + 1))
  fi
done

# For each phase, if all WPs are done, mark review and phase-checkpoint nodes
for phase in f002 f003 f004 f005 f006 f008 f009; do
  done_count=${PHASE_DONE_COUNTS[$phase]:-0}
  expected=${PHASE_WP_COUNTS[$phase]:-0}

  if [ "$done_count" -ge "$expected" ] && [ "$expected" -gt 0 ]; then
    # Mark phase review nodes as completed
    if [ "$phase" = "f006" ]; then
      # Combined review for 006+008
      COMPLETED_NODE_SET["f006-008-review-architecture"]=1
      COMPLETED_NODE_SET["f006-008-review-security"]=1
      COMPLETED_NODE_SET["f006-008-review-testing"]=1
      COMPLETED_NODE_SET["f006-008-review-product-vision"]=1
      COMPLETED_NODE_SET["f006-008-review-code-quality"]=1
      COMPLETED_NODE_SET["f006-008-synthesize-review"]=1
      COMPLETED_NODE_SET["f006-008-review-checkpoint"]=1
      COMPLETED_NODE_SET["f006-008-implement-fixes"]=1
      COMPLETED_NODE_SET["f006-008-fixes-checkpoint"]=1
      COMPLETED_NODE_SET["f006-008-final-validation"]=1
      COMPLETED_NODE_SET["f006-008-check-validation-result"]=1
      COMPLETED_NODE_SET["f006-008-validation-fallback"]=1
      COMPLETED_NODE_SET["f006-008-checkpoint"]=1
    else
      COMPLETED_NODE_SET["${phase}-review-architecture"]=1
      COMPLETED_NODE_SET["${phase}-review-security"]=1
      COMPLETED_NODE_SET["${phase}-review-testing"]=1
      COMPLETED_NODE_SET["${phase}-review-product-vision"]=1
      COMPLETED_NODE_SET["${phase}-review-code-quality"]=1
      COMPLETED_NODE_SET["${phase}-synthesize-review"]=1
      COMPLETED_NODE_SET["${phase}-review-checkpoint"]=1
      COMPLETED_NODE_SET["${phase}-implement-fixes"]=1
      COMPLETED_NODE_SET["${phase}-fixes-checkpoint"]=1
      COMPLETED_NODE_SET["${phase}-final-validation"]=1
      COMPLETED_NODE_SET["${phase}-check-validation-result"]=1
      COMPLETED_NODE_SET["${phase}-validation-fallback"]=1
      COMPLETED_NODE_SET["${phase}-checkpoint"]=1
    fi
  fi
done

# Walk through nodes in order to find resume point
RESUME_NODE=""
LAST_COMPLETED=""
SKIPPED=0
SKIPPED_LIST=""

for node in "${ALL_NODES[@]}"; do
  if [[ -n "${COMPLETED_NODE_SET[$node]:-}" ]]; then
    LAST_COMPLETED="$node"
    SKIPPED=$((SKIPPED + 1))
    if [ -n "$SKIPPED_LIST" ]; then
      SKIPPED_LIST="${SKIPPED_LIST}, ${node}"
    else
      SKIPPED_LIST="$node"
    fi
  else
    if [ -z "$RESUME_NODE" ]; then
      RESUME_NODE="$node"
    fi
  fi
done

# If no incomplete node found, check if global validation nodes are done
if [ -z "$RESUME_NODE" ]; then
  # Check global nodes
  for node in global-regression global-summary; do
    if [[ -z "${COMPLETED_NODE_SET[$node]:-}" ]]; then
      RESUME_NODE="$node"
      break
    else
      LAST_COMPLETED="$node"
      SKIPPED=$((SKIPPED + 1))
    fi
  done
fi

# Output results
if [ -n "$RESUME_NODE" ]; then
  echo -e "  Last completed:  ${GREEN}${LAST_COMPLETED:-none}${NC}"
  echo -e "  Resume from:     ${GREEN}${RESUME_NODE}${NC}"
  echo -e "  Nodes to skip:   ${YELLOW}${SKIPPED}${NC}"
  echo ""
  if [ "$SKIPPED" -gt 0 ]; then
    echo "  Skipped nodes (first 10):"
    echo "$SKIPPED_LIST" | tr ',' '\n' | head -10 | while read -r n; do
      echo "    - $(echo "$n" | tr -d ' ')"
    done
    if [ "$SKIPPED" -gt 10 ]; then
      echo "    ... and $((SKIPPED - 10)) more"
    fi
  fi
else
  echo -e "  ${GREEN}All workflow nodes appear completed!${NC}"
  echo "  Recommend running global validation to confirm."
  echo "  Last completed: $LAST_COMPLETED"
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    RECOVERY SUMMARY                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Workflow:          $WORKFLOW_NAME"
if [ -n "${LAST_UPDATED:-}" ]; then
  echo "  Last checkpoint:   ${LAST_UPDATED} (${STALE_MINUTES:-0} minutes ago)"
else
  echo "  Last checkpoint:   N/A (no checkpoint)"
fi
echo "  Total WPs done:    $TOTAL_DONE"
echo "  Resume from:       ${RESUME_NODE:-ALL COMPLETE}"
echo "  Skip nodes:        $SKIPPED"
echo ""
echo "  To resume execution, run the workflow executor with:"
echo "    --resume-from $RESUME_NODE"
echo ""
