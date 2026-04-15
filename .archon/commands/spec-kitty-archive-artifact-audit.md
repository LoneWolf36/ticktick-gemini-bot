---
description: One-time project-local artifact audit for archived Function Inception Spec Kitty missions.
argument-hint: [archive-path]
---

# Spec Kitty Archive Artifact Audit

Default archive path:

```text
/home/lonewolf09/Documents/Projects/function-inception-agent/kitty-specs/archive
```

This command is project-local and read-only. It audits archived Function
Inception mission artifacts as historical records only.

## Hard Rules

- Do not call `spec-kitty next` on archived missions.
- Do not call `spec-kitty orchestrator-api` on archived missions.
- Do not add archive execution mode to reusable workflows.
- Do not classify archived artifacts as executable readiness.
- Do not edit live or archived mission status files.

## Audit Checks

For each archived mission directory, report whether these artifacts exist:

- `spec.md`
- `plan.md`
- `tasks/WP*.md`
- `status.events.jsonl`

Also report:

- Missing task directories.
- Missing status files.
- Malformed JSONL lines.
- Whether the archive is useful as an artifact-shape portability sample.

## Required Output

Return JSON only:

```json
{
  "archive_path": "/home/lonewolf09/Documents/Projects/function-inception-agent/kitty-specs/archive",
  "executable": false,
  "missions": []
}
```
