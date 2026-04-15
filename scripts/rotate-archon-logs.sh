#!/usr/bin/env bash
# rotate-archon-logs.sh — Rotate workflow log files to prevent disk exhaustion
set -euo pipefail

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}=== Archon Log Rotation ===$(date '+ %H:%M:%S')${NC}"
echo ""

FILES_CHECKED=0
FILES_ROTATED=0
FILES_ARCHIVED=0
FILES_REMOVED=0
SPACE_SAVED=0

# Process all workflow log files
for logfile in /tmp/archon-workflow-run*.log; do
    [ -f "$logfile" ] || continue
    FILES_CHECKED=$((FILES_CHECKED + 1))

    filesize=$(stat -c%s "$logfile" 2>/dev/null || echo 0)
    filesize_mb=$((filesize / 1024 / 1024))

    if [ "$filesize_mb" -ge 10 ]; then
        # Emergency: > 10MB — compress and truncate
        timestamp=$(date +%Y%m%d%H%M%S)
        archive="${logfile}.${timestamp}.gz"
        gzip -c "$logfile" > "$archive"
        tail -2000 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
        saved=$((filesize_mb - $(stat -c%s "$logfile" 2>/dev/null || echo 0) / 1024 / 1024))
        SPACE_SAVED=$((SPACE_SAVED + saved))
        FILES_ROTATED=$((FILES_ROTATED + 1))
        FILES_ARCHIVED=$((FILES_ARCHIVED + 1))
        echo -e "${RED}EMERGENCY:${NC} $logfile (${filesize_mb}MB) → compressed + truncated (saved ~${saved}MB)"

    elif [ "$filesize_mb" -ge 5 ]; then
        # Compress and archive
        timestamp=$(date +%Y%m%d%H%M%S)
        archive="${logfile}.${timestamp}.gz"
        gzip -c "$logfile" > "$archive"
        saved=$filesize_mb
        SPACE_SAVED=$((SPACE_SAVED + saved))
        truncate -s 0 "$logfile"
        FILES_ROTATED=$((FILES_ROTATED + 1))
        FILES_ARCHIVED=$((FILES_ARCHIVED + 1))
        echo -e "${YELLOW}ARCHIVED:${NC} $logfile (${filesize_mb}MB) → compressed to $(basename $archive)"

    elif [ "$filesize_mb" -ge 1 ]; then
        # Truncate to last 5000 lines
        old_size=$filesize_mb
        tail -5000 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
        new_size=$(stat -c%s "$logfile" 2>/dev/null || echo 0)
        new_size_mb=$((new_size / 1024 / 1024))
        saved=$((old_size - new_size_mb))
        SPACE_SAVED=$((SPACE_SAVED + saved))
        FILES_ROTATED=$((FILES_ROTATED + 1))
        echo -e "${GREEN}TRUNCATED:${NC} $logfile (${old_size}MB → ${new_size_mb}MB, last 5000 lines kept)"
    fi
done

# Clean old archives (> 7 days)
while IFS= read -r old_file; do
    [ -z "$old_file" ] && continue
    rm -f "$old_file"
    FILES_REMOVED=$((FILES_REMOVED + 1))
    echo -e "${CYAN}REMOVED:${NC} $old_file (older than 7 days)"
done < <(find /tmp -name "archon-workflow-run*.log.*.gz" -mtime +7 2>/dev/null)

# Summary
echo ""
echo "=== Log Rotation Summary ==="
echo "Files checked:  $FILES_CHECKED"
echo "Files rotated:  $FILES_ROTATED"
echo "Files archived: $FILES_ARCHIVED"
echo "Files removed:  $FILES_REMOVED"
echo "Space saved:    ~${SPACE_SAVED}MB"
echo "============================"
