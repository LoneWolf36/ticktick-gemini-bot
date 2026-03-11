# Tasks Directory

This directory contains work package prompt files for `003-pipeline-hardening-and-regression`.

## Directory Structure

```text
tasks/
|- WP01-canonical-pipeline-context-foundation.md
|- WP02-entry-point-context-wiring-and-story-1-validation.md
|- WP03-failure-classification-quota-semantics-and-story-2-user-messaging.md
|- WP04-retry-rollback-and-observability-hardening.md
|- WP05-direct-regression-harness-and-burst-concurrency-coverage.md
`- README.md
```

All work package files stay flat in `tasks/`. Lane status is tracked in YAML frontmatter, not by subdirectory.

## Valid Lanes

- `planned`
- `doing`
- `for_review`
- `done`

## Moving Between Lanes

Use the CLI so frontmatter and activity log stay in sync:

```bash
spec-kitty agent tasks move-task <WPID> --to <lane>
```

Example:

```bash
spec-kitty agent tasks move-task WP01 --to doing
```
