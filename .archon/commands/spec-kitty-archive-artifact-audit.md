---
description: One-time artifact-shape audit for archived Spec Kitty missions.
argument-hint: [archive-path]
---

# Spec Kitty Archive Artifact Audit

Default archive path:

```text
/home/lonewolf09/Documents/Projects/function-inception-agent/kitty-specs/archive
```

This command is for artifact audit only.

## Hard Rules

- Do not call `spec-kitty next` on archived missions.
- Do not call `spec-kitty orchestrator-api` on archived missions.
- Do not add archive execution mode to reusable workflows.
- Do not classify archive artifacts as executable readiness.

## Audit Checks

For each archived mission directory, report whether these exist:

- `spec.md`
- `plan.md`
- `tasks/WP*.md`
- `status.events.jsonl`

Also report:

- Missing task directories.
- Missing status files.
- Malformed JSONL.
- Whether the archive is useful as an artifact-shape portability sample.

## Required Output

Return JSON:

```json
{
  "archive_path": "/home/lonewolf09/Documents/Projects/function-inception-agent/kitty-specs/archive",
  "executable": false,
  "missions": []
}
```
