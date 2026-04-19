---
created: "2026-03-17T00:00:00Z"
last_edited: "2026-03-19T00:00:00Z"
---
# Implementation Tracking: Session

| Task | Status | Notes |
|------|--------|-------|
| T-007 | DONE | Instance model with Status enum, progress fields, JSON tags. internal/session package. |
| T-020 | DONE | Session lifecycle: Create/Start (worktree+tmux+build cmd)/Pause/Resume/Kill. internal/session/lifecycle.go. |
| T-021 | DONE | Save/Load JSON state at ~/.cavekit/state.json. internal/session/persistence.go. |
| T-022 | DONE | AutoYes: monitor pane for permission/trust prompts, auto-send Enter. internal/session/autoyes.go. |
| T-023 | DONE | Progress integration: UpdateProgress reads site+impl to populate instance fields. internal/session/progress.go. |
| T-034 | DONE | StaggeredLauncher: configurable delay between instance launches, first immediate. internal/session/stagger.go. |
