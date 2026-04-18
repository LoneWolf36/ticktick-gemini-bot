---
created: "2026-03-17T12:00:00Z"
last_edited: "2026-03-19T00:00:00Z"
---
# Implementation Tracking: CLI

| Task | Status | Notes |
|------|--------|-------|
| T-051 | DONE | Parse --autoyes/-y flag in runMonitor, pass to tui.Run. |
| T-052 | DONE | Status command computes progress from site+impl files via computeWorktreeProgress(). |
| T-056 | DONE | Preflight checks program binary (claude by default) via LookPath. |
| T-001 | DONE | Go module init: go.mod with github.com/JuliusBrussee/cavekit, bubbletea/lipgloss deps, cmd/cavekit/main.go. |
| T-039 | DONE | Monitor command: `cavekit` or `cavekit monitor` launches TUI. --program and --autoyes flags. Preflight checks. Loads persisted instances. |
| T-040 | DONE | Status command: `cavekit status` prints per-worktree progress with icon and done/total counts. |
| T-041 | DONE | Kill command: kills tmux sessions, removes worktrees, clears state, reports counts. |
| T-042 | DONE | Debug/reset/version commands. `cavekit debug` prints state path, `cavekit reset` clears state, `cavekit version` prints version. |
