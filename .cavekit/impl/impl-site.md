---
created: "2026-03-17T00:00:00Z"
last_edited: "2026-03-19T00:00:00Z"
---
# Implementation Tracking: Site

| Task | Status | Notes |
|------|--------|-------|
| T-005 | DONE | Site discovery in context/sites/ and context/frontiers/ (legacy). Canonical name derivation matching bash sed chain. |
| T-006 | DONE | Site markdown parsing: task IDs, tier structure, table rows with blockedBy/effort. internal/site/parser.go. |
| T-014 | DONE | Task status tracking from impl-*.md files with word boundary matching. ComputeProgress for aggregates. internal/site/tracking.go. |
| T-015 | DONE | Site status classification: done/in-progress/available with Ralph Loop detection. internal/site/status.go. |
| T-017 | DONE | Progress summary string: "{icon} {name} {done}/{total} [{currentTask}]". internal/site/progress.go. |
| T-016 | DONE | Multi-candidate ranking: score 3 (active loop) > 2 (worktree/incomplete) > 1. Filter fail-fast, alphabetical tie-break. internal/site/ranking.go. |
