---
created: "2026-03-17T00:00:00Z"
last_edited: "2026-03-17T00:00:00Z"
---
# Implementation Tracking: Worktree

| Task | Status | Notes |
|------|--------|-------|
| T-004 | DONE | Worktree create/detect/remove with canonical path and branch naming. internal/worktree/worktree.go. |
| T-012 | DONE | DiffStat (files/insertions/deletions) and raw Diff output. internal/worktree/diff.go. |
| T-013 | DONE | DiscoverAll scans sibling dirs for cavekit worktrees. Detects Ralph Loop marker. internal/worktree/discover.go. |
| T-028 | DONE | Push: git add -A, commit, push --set-upstream origin HEAD. internal/worktree/push.go. |
