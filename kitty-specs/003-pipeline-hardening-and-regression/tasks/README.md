# Tasks Directory

This directory contains work-package prompt files for `003-pipeline-hardening-and-regression`.

## Directory Structure

```text
tasks/
|- WP01-canonical-pipeline-context-foundation.md
|- WP02-entry-point-context-wiring.md
|- WP03-failure-classification-quota-semantics-and-story-2-user-messaging.md
|- WP04-direct-pipeline-harness-and-story-1-coverage.md
|- WP05-retry-rollback-and-observability-hardening.md
|- WP06-failure-rollback-and-burst-regression-finalization.md
`- README.md
```

All work-package files stay flat in `tasks/`.

## Spec Kitty v3 Notes

- Work-package state is tracked in `../status.events.jsonl`, not in frontmatter lanes.
- WP frontmatter is minimal and should only include the current v3 fields:
  - `work_package_id`
  - `title`
  - `dependencies`
  - `subtasks`
  - `base_branch`
  - `base_commit`
  - `created_at`
  - `phase`
  - `requirement_refs`
- Review feedback belongs in the body of each WP prompt, not in deprecated frontmatter keys.

## Usage

- Treat `tasks.md` as the dependency map for the feature.
- Treat each `WP*.md` file as the implementation prompt for that work package.
- Treat `../status.events.jsonl` as the source of truth for workflow state.
