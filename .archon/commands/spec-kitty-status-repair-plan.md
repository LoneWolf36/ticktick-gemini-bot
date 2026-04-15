---
description: Generate a repair manifest for malformed Spec Kitty status events without editing them.
argument-hint: [mission-selector]
---

# Spec Kitty Status Repair Plan

This command plans repairs only. It must not edit `status.events.jsonl`.

## Policy

1. Prefer supported Spec Kitty repair, recover, resume, or doctor commands.
2. If no supported command can repair a malformed event, generate a manifest for explicit human review.
3. Do not mark any mission trusted because a status file was repaired. Trust also requires spec/code/test reconciliation.

## Manifest Fields

For each bad event, report:

```json
{
  "mission": "009-behavioral-signals-and-memory",
  "status_file": "kitty-specs/009-behavioral-signals-and-memory/status.events.jsonl",
  "line": 8,
  "event_type": "done",
  "problem": "done event evidence shape crashes Spec Kitty next",
  "supported_spec_kitty_repair": "unknown",
  "recommended_repair": "replace malformed done evidence with canonical review evidence or reopen WP",
  "code_spec_audit_supports_done": false
}
```

## Hard Stop

If the requested action would directly modify a status file, stop and ask for an
explicit repair task. This command is not that task.
