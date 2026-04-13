---
description: Rotate workflow log files to prevent disk exhaustion
argument-hint: none
---

# Rotate Workflow Logs

**Input**: $ARGUMENTS

## Purpose

Prevent workflow log files from consuming excessive disk space. Long workflow runs (5+ hours, 126+ nodes) can produce 200KB-500KB+ logs. Without rotation, these accumulate over time.

## Phase 1: Find All Workflow Logs

Find all files matching `/tmp/archon-workflow-run*.log`.

## Phase 2: Rotate by Size

For each log file:

- **> 10MB**: Emergency — compress immediately with gzip, truncate original to last 2000 lines
  ```bash
  gzip -c "$logfile" > "${logfile}.$(date +%Y%m%d%H%M%S).gz"
  tail -2000 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
  ```

- **> 5MB**: Compress and archive
  ```bash
  gzip -c "$logfile" > "${logfile}.$(date +%Y%m%d%H%M%S).gz"
  truncate -s 0 "$logfile"
  ```

- **> 1MB**: Truncate to last 5000 lines (preserve recent context)
  ```bash
  tail -5000 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
  ```

- **< 1MB**: Leave alone

## Phase 3: Clean Old Archives

Remove compressed logs (`.gz` files) older than 7 days:
```bash
find /tmp -name "archon-workflow-run*.log.*.gz" -mtime +7 -delete 2>/dev/null
```

## Phase 4: Report Results

Output summary:
```
=== Log Rotation Summary ===
Files checked: X
Files rotated: Y
Files archived: Z
Old files removed: W
Space saved: ~N MB
==========================
```

## Success Criteria

- **ROTATED**: At least one file was processed
- **NO_DATA_LOSS**: Original files are truncated, not deleted (recent context preserved)
- **DISK_CLEANUP**: Old archives removed
