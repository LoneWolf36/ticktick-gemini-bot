# spec-kitty-notify — Telegram Notification Command

Sends a notification to the user's Telegram chat with severity-based formatting and rate limiting.

## Usage

```bash
archon run spec-kitty-notify "$ARGUMENTS"
```

## Input Format

`$ARGUMENTS` should be a string in the format: `"{severity}: {message}"`

Where severity is one of: `CRITICAL`, `WARNING`, `INFO`

Examples:
- `"CRITICAL: Workflow crashed — process terminated"`
- `"WARNING: Stuck on node WP03 for 15m"`
- `"INFO: Phase planning complete — 12 nodes done"`

## Implementation

```bash
#!/usr/bin/env bash
set -uo pipefail

ARGUMENTS="${1:-}"

if [ -z "$ARGUMENTS" ]; then
    echo "Usage: archon run spec-kitty-notify \"{severity}: {message}\""
    exit 1
fi

# Parse severity and message
SEVERITY=$(echo "$ARGUMENTS" | cut -d: -f1 | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')
MESSAGE=$(echo "$ARGUMENTS" | cut -d: -f2- | sed 's/^ *//')

# Validate severity
case "$SEVERITY" in
    CRITICAL|WARNING|INFO) ;;
    *) SEVERITY="INFO" ;;
esac

# Format message with emoji prefix
case "$SEVERITY" in
    CRITICAL) FORMATTED="🚨 *${SEVERITY}*\n\n${MESSAGE}" ;;
    WARNING)  FORMATTED="⚠️ *${SEVERITY}*\n\n${MESSAGE}" ;;
    INFO)     FORMATTED="ℹ️ *${SEVERITY}*\n\n${MESSAGE}" ;;
esac

# Add timestamp and hostname
FORMATTED="${FORMATTED}\n\n\`$(date '+%Y-%m-%d %H:%M:%S')\` — $(hostname)"

# ── Rate limiting ──
RATE_LIMIT_FILE="/tmp/archon-notify-cooldown"
RATE_LIMIT_SECONDS=300  # 5 minutes

if [ -f "$RATE_LIMIT_FILE" ]; then
    LAST_NOTIFY=$(cat "$RATE_LIMIT_FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    ELAPSED=$((NOW - LAST_NOTIFY))
    if [ "$ELAPSED" -lt "$RATE_LIMIT_SECONDS" ]; then
        echo "[Notify rate-limited: ${ELAPSED}s/${RATE_LIMIT_SECONDS}s cooldown]"
        # Still log to file even if rate-limited
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [RATE-LIMITED] [${SEVERITY}] ${MESSAGE}" >> /tmp/archon-notifications.log
        exit 0
    fi
fi

# Update rate limit timestamp
date +%s > "$RATE_LIMIT_FILE"

# ── Send via Telegram Bot API ──
TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"

TELEGRAM_SUCCESS=false

if [ -n "$TOKEN" ] && [ -n "$CHAT_ID" ]; then
    HTTP_CODE=$(curl -s -o /tmp/telegram-response.json -w "%{http_code}" \
        -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{
            \"chat_id\": \"${CHAT_ID}\",
            \"text\": \"$(echo -e "$FORMATTED")\",
            \"parse_mode\": \"Markdown\",
            \"disable_web_page_preview\": true
        }" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
        TELEGRAM_SUCCESS=true
        echo "[Notification sent via Telegram: ${SEVERITY}]"
    else
        ERROR_MSG=""
        if [ -f /tmp/telegram-response.json ]; then
            ERROR_MSG=$(cat /tmp/telegram-response.json 2>/dev/null | grep -oP '"description"\s*:\s*"[^"]+"' | head -1 || echo "")
        fi
        echo "[Telegram API error: HTTP ${HTTP_CODE} ${ERROR_MSG}]"
    fi
else
    echo "[Telegram credentials not configured — missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID]"
fi

# ── Fallback: log to file if Telegram failed ──
if [ "$TELEGRAM_SUCCESS" = "false" ]; then
    LOG_FILE="/tmp/archon-notifications.log"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${SEVERITY}] ${MESSAGE}" >> "$LOG_FILE"
    echo "[Notification logged to ${LOG_FILE}]"
fi

# Cleanup
rm -f /tmp/telegram-response.json
```

## Rate Limiting Behavior

- Maximum 1 notification per 5 minutes (300 seconds)
- Rate-limited notifications are still logged to `/tmp/archon-notifications.log`
- Rate limit state stored in `/tmp/archon-notify-cooldown` (Unix timestamp)
- To bypass rate limit manually: `rm /tmp/archon-notify-cooldown`

## Error Handling

| Error Condition | Behavior |
|----------------|----------|
| Invalid/missing token | Logs to file, prints error message |
| Network timeout | Logs to file, prints error message |
| Invalid chat_id | Logs to file, prints API error |
| Rate limit exceeded | Skips Telegram, logs to file only |
| Missing credentials | Logs to file only |

## Security Notes

- Token and chat_id read from environment variables only — never hardcoded
- Response JSON written to `/tmp/` and cleaned up immediately
- No sensitive data logged to notification log file
- Markdown parse mode used for formatting — ensure messages don't contain unescaped Markdown special characters that could break parsing
