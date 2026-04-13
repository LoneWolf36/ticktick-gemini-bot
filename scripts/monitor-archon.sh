#!/usr/bin/env bash
# monitor-archon.sh — Autonomous workflow progress monitor with Telegram notifications
# Usage: ./monitor-archon.sh [interval_seconds]
# Default interval: 180 seconds (3 minutes)

set -uo pipefail

PROJECT_DIR="/home/lonewolf09/Documents/Projects/ticktick-gemini"
ARCHON_DIR="/home/lonewolf09/Documents/Projects/Archon"
LOG_FILE="/tmp/archon-workflow-run4.log"
INTERVAL="${1:-180}"
MAX_STUCK_MINUTES=10

# ── Load Telegram credentials from .env ──
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(grep -E 'TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID' "$PROJECT_DIR/.env" | xargs 2>/dev/null)
fi

# ── Rate limiting for Telegram notifications ──
NOTIFY_COOLDOWN=300  # 5 minutes
LAST_NOTIFY_FILE="/tmp/archon-last-notify"

send_notification() {
    local severity="$1"
    local message="$2"

    # Check rate limit
    if [ -f "$LAST_NOTIFY_FILE" ]; then
        local last_notify
        last_notify=$(cat "$LAST_NOTIFY_FILE" 2>/dev/null || echo 0)
        local now
        now=$(date +%s)
        local elapsed=$((now - last_notify))
        if [ "$elapsed" -lt "$NOTIFY_COOLDOWN" ]; then
            echo "  [Notification rate-limited: ${elapsed}s/${NOTIFY_COOLDOWN}s cooldown]"
            # Still log to file even when rate-limited
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] [RATE-LIMITED] [${severity}] ${message}" >> /tmp/archon-notifications.log
            return 0
        fi
    fi

    # Update last notify time
    date +%s > "$LAST_NOTIFY_FILE"

    # Call the archon notification command
    cd "$PROJECT_DIR"
    archon run spec-kitty-notify "${severity}: ${message}" 2>/dev/null || {
        # Fallback: direct curl to Telegram API
        local token="${TELEGRAM_BOT_TOKEN:-}"
        local chat_id="${TELEGRAM_CHAT_ID:-}"
        if [ -n "$token" ] && [ -n "$chat_id" ]; then
            local emoji=""
            case "$severity" in
                CRITICAL) emoji="🚨 " ;;
                WARNING)  emoji="⚠️ " ;;
                INFO)     emoji="ℹ️ " ;;
            esac
            curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" \
                -d "chat_id=${chat_id}" \
                -d "text=${emoji}${message}" \
                -d "parse_mode=Markdown" 2>/dev/null || {
                    echo "  [Telegram fallback also failed — logging to file]"
                    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${severity}] ${message}" >> /tmp/archon-notifications.log
                }
        else
            echo "  [Telegram credentials not configured — logging to file]"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${severity}] ${message}" >> /tmp/archon-notifications.log
        fi
    }
}

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}=== Archon Workflow Monitor ===$(date '+ %H:%M:%S')${NC}"
echo "Monitoring every ${INTERVAL}s, max stuck: ${MAX_STUCK_MINUTES}m"
echo ""

# ── Capture baseline ──
cd "$PROJECT_DIR"
BASELINE_COMMIT=$(git rev-parse HEAD)
BASELINE_TIME=$(date +%s)
BASELINE_MODIFIED=$(git status --short 2>/dev/null | grep -c "^.M\|^M.\|^A.\|^..A" || echo 0)
NODES_DONE=$(grep -c "dag_node_completed" "$LOG_FILE" 2>/dev/null || echo 0)
CURRENT_NODE=$(tail -30 "$LOG_FILE" 2>/dev/null | grep "dag_node_started" | tail -1 | grep -oP 'nodeId":"[^"]+' | cut -d'"' -f3 || echo "unknown")

echo "BASELINE: commit=${BASELINE_COMMIT:0:8} modified=$BASELINE_MODIFIED nodes_done=$NODES_DONE current=$CURRENT_NODE"
echo ""

# ── Monitoring loop ──
CHECK_COUNT=0
LAST_COMMIT_CHANGE_TIME=$BASELINE_TIME
LAST_NODE=""
LAST_NODE_START=$(date +%s)
LAST_NODES_NOTIFIED=0

# Send workflow start notification
WORKFLOW_NAME=$(grep -oP '"workflow_name"[[:space:]]*:[[:space:]]*"[^"]+"' "$LOG_FILE" 2>/dev/null | tail -1 | cut -d'"' -f4 || echo "Archon DAG")
INITIAL_NODE_COUNT=$(grep -c "dag_node_started" "$LOG_FILE" 2>/dev/null || echo 0)
send_notification "INFO" "🚀 Archon workflow started — ${WORKFLOW_NAME}, ${INITIAL_NODE_COUNT} nodes"

while true; do
    CHECK_COUNT=$((CHECK_COUNT + 1))
    sleep "$INTERVAL" &
    WAIT_PID=$!
    
    # Print progress dots during wait
    for i in $(seq 1 $((INTERVAL / 30))); do
        sleep 30
        if ! kill -0 $WAIT_PID 2>/dev/null; then break; fi
        printf "."
    done
    wait $WAIT_PID 2>/dev/null
    printf "\n"
    
    cd "$PROJECT_DIR"
    NOW=$(date +%s)
    NEW_COMMIT=$(git rev-parse HEAD)
    NEW_MODIFIED=$(git status --short 2>/dev/null | grep -c "^.M\|^M.\|^A.\|^..A" || echo 0)
    NODES_DONE=$(grep -c "dag_node_completed" "$LOG_FILE" 2>/dev/null || echo 0)
    
    # Find current node
    NEW_NODE=$(tail -30 "$LOG_FILE" 2>/dev/null | grep "dag_node_started" | tail -1 | grep -oP 'nodeId":"[^"]+' | cut -d'"' -f3 || echo "unknown")
    
    # Track node change time
    if [ "$NEW_NODE" != "$LAST_NODE" ] && [ -n "$NEW_NODE" ] && [ "$NEW_NODE" != "unknown" ]; then
        LAST_NODE="$NEW_NODE"
        LAST_NODE_START=$NOW
        echo -e "${GREEN}NODE CHANGED${NC} → $NEW_NODE"
    fi
    
    # Calculate metrics
    MINUTES_SINCE_BASELINE=$(( (NOW - BASELINE_TIME) / 60 ))
    MINUTES_ON_CURRENT_NODE=$(( (NOW - LAST_NODE_START) / 60 ))
    
    # Check for new commits
    NEW_COMMITS=""
    if [ "$NEW_COMMIT" != "$BASELINE_COMMIT" ]; then
        NEW_COMMITS=$(git log --oneline $BASELINE_COMMIT..$NEW_COMMIT 2>/dev/null | head -5)
        BASELINE_COMMIT=$NEW_COMMIT
        LAST_COMMIT_CHANGE_TIME=$NOW
        echo -e "${GREEN}NEW COMMIT(S):${NC}"
        echo "$NEW_COMMITS" | while read line; do echo "  $line"; done
    fi
    
    # Check for new file modifications
    FILES_CHANGED=$((NEW_MODIFIED - BASELINE_MODIFIED))
    if [ "$FILES_CHANGED" -gt 0 ]; then
        echo -e "${YELLOW}FILES CHANGED:${NC} +$FILES_CHANGED new modifications"
        git status --short 2>/dev/null | grep "^.M\|^M.\|^A." | grep -v "report/" | head -5 | while read line; do echo "  $line"; done
        BASELINE_MODIFIED=$NEW_MODIFIED
    fi
    
    # Check for failures in log
    FAILURES=$(tail -30 "$LOG_FILE" 2>/dev/null | grep -c "dag_node_failed" || echo 0)
    if [ "$FAILURES" -gt 0 ]; then
        echo -e "${RED}FAILURE DETECTED:${NC}"
        tail -30 "$LOG_FILE" 2>/dev/null | grep "dag_node_failed" | tail -3
    fi

    # Check for workflow process death (crash detection)
    ARCHON_PID=$(pgrep -f "archon.*run\|archon.*execute" 2>/dev/null | head -1 || echo "")
    if [ -n "$ARCHON_PID" ]; then
        # Process exists — check if it's actually alive or zombie
        if ! kill -0 "$ARCHON_PID" 2>/dev/null; then
            echo -e "${RED}🚨 WORKFLOW CRASHED:${NC} process $ARCHON_PID terminated unexpectedly"
            send_notification "CRITICAL" "WORKFLOW CRASHED — process terminated. Recovery info: run \`bash scripts/workflow-recovery.sh\`"
        fi
    else
        # No Archon process found at all — might have crashed before we started monitoring
        RECENT_CRASH=$(tail -50 "$LOG_FILE" 2>/dev/null | grep -c "error\|fatal\|crash\|exception\|traceback" || echo 0)
        if [ "$RECENT_CRASH" -gt 2 ]; then
            echo -e "${RED}🚨 POSSIBLE CRASH:${NC} Multiple error indicators in log, no running process found"
            send_notification "CRITICAL" "WORKFLOW CRASHED — process terminated. Recovery info: run \`bash scripts/workflow-recovery.sh\`"
        fi
    fi
    
    # Stuck detection
    STUCK=false
    if [ "$NEW_COMMIT" = "$(git rev-parse HEAD)" ] && [ "$FILES_CHANGED" -le 0 ] && [ "$MINUTES_ON_CURRENT_NODE" -ge "$MAX_STUCK_MINUTES" ]; then
        STUCK=true
        echo -e "${RED}⚠️  STUCK:${NC} Node $NEW_NODE running for ${MINUTES_ON_CURRENT_NODE}m with no commits or file changes"

        # Send Telegram notification (rate-limited)
        send_notification "WARNING" "Workflow stuck on node ${NEW_NODE} for ${MINUTES_ON_CURRENT_NODE}m — emergency state saved to ${PROJECT_DIR}"

        # Auto-diagnostic
        echo -e "${CYAN}DIAGNOSTIC:${NC}"
        QWEN_CPU=$(ps aux 2>/dev/null | grep "qwen.*coder" | grep -v grep | head -1 | awk '{print $3}')
        QWEN_RSS=$(ps aux 2>/dev/null | grep "qwen.*coder" | grep -v grep | head -1 | awk '{print int($6/1024)"MB"}')
        echo "  Qwen: CPU=${QWEN_CPU}% RSS=${QWEN_RSS:-unknown}"
        echo "  Node: $NEW_NODE (${MINUTES_ON_CURRENT_NODE}m)"
        echo "  Nodes completed: $NODES_DONE / 126"
        
        # Check what Qwen is actually doing
        RECENT_LOG=$(tail -20 "$LOG_FILE" 2>/dev/null | grep -v "heartbeat\|loop_node" | tail -5)
        if echo "$RECENT_LOG" | grep -qi "could you\|please\|which\|clarif\|confirm"; then
            echo -e "${YELLOW}  Qwen appears to be asking a question${NC}"
            tail -20 "$LOG_FILE" 2>/dev/null | grep -i "could you\|please\|which\|clarif\|confirm" | tail -2
        fi
        
        # Test auto-discovery
        echo -e "${CYAN}  Auto-discovery test:${NC}"
        FOUND_WP=false
        for f in kitty-specs/*/status.events.jsonl; do
            mission=$(basename $(dirname $f))
            for wp in $(grep -oP '"wp_id"[[:space:]]*:[[:space:]]*"WP[0-9]+"' "$f" | grep -oP 'WP[0-9]+' | sort -u); do
                last_lane=$(grep "$wp" "$f" | grep -oP '"to_lane"[[:space:]]*:[[:space:]]*"[a-zA-Z_]+"' | tail -1 | grep -oP '[a-zA-Z_]+"$' | tr -d '"')
                if [ "$last_lane" = "planned" ]; then
                    wp_file=$(find "kitty-specs/$mission/tasks" -name "*${wp}*.md" -type f 2>/dev/null | head -1)
                    if [ -n "$wp_file" ]; then
                        echo "  Next pending: $mission $wp → $(basename $wp_file)"
                        FOUND_WP=true
                        break 2
                    fi
                fi
            done
        done
        if [ "$FOUND_WP" = "false" ]; then
            echo "  WARNING: No pending WPs found by auto-discovery!"
        fi
    fi
    
    # Progress summary
    if [ "$STUCK" = "false" ]; then
        VERB="PROGRESS"
        COLOR=$GREEN
        if [ -z "$NEW_COMMITS" ] && [ "$FILES_CHANGED" -le 0 ]; then
            VERB="WAITING"
            COLOR=$YELLOW
        fi
        echo -e "${COLOR}CHECK #${CHECK_COUNT} — ${VERB}${NC} | ${MINUTES_SINCE_BASELINE}m elapsed | node=$NEW_NODE | commits_since_start=$(git rev-list --count $BASELINE_COMMIT..HEAD 2>/dev/null || echo 0) | nodes_done=$NODES_DONE/126"

        # Detect phase completion (node count milestones)
        TOTAL_COMMITS=$(git rev-list --count $BASELINE_COMMIT..HEAD 2>/dev/null || echo 0)
        if [ "$NODES_DONE" -gt 0 ] && [ "$NODES_DONE" -ne "$LAST_NODES_NOTIFIED" ] 2>/dev/null; then
            # Check if we hit a milestone (every 10 nodes)
            if [ $((NODES_DONE % 10)) -eq 0 ] && [ "$NODES_DONE" -gt 0 ]; then
                COMMITS_THIS_PHASE=$(git rev-list --count $BASELINE_COMMIT..HEAD 2>/dev/null || echo 0)
                send_notification "INFO" "Phase progress — ${NODES_DONE} nodes complete, ${COMMITS_THIS_PHASE} commits, ${MINUTES_SINCE_BASELINE}m elapsed"
                LAST_NODES_NOTIFIED=$NODES_DONE
            fi
        fi

        # Detect total completion
        if [ "$NODES_DONE" -ge 126 ]; then
            DURATION_HOURS=$((MINUTES_SINCE_BASELINE / 60))
            DURATION_MINS=$((MINUTES_SINCE_BASELINE % 60))
            TOTAL_FINAL_COMMITS=$(git rev-list --count $BASELINE_COMMIT..HEAD 2>/dev/null || echo 0)
            send_notification "INFO" "🎉 All missions complete! Summary: ${NODES_DONE} nodes, ${TOTAL_FINAL_COMMITS} commits, ${DURATION_HOURS}h ${DURATION_MINS}m"
            echo -e "${GREEN}🎉 ALL MISSIONS COMPLETE!${NC} Notified via Telegram"
            # Prevent repeated completion notifications
            LAST_NODES_NOTIFIED=9999
        fi
    fi
    
    echo "---"
done
