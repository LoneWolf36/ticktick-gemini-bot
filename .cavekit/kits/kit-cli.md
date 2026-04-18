---
created: "2026-03-17T00:00:00Z"
last_edited: "2026-03-19T00:00:00Z"
---

# Spec: CLI Interface

## Scope
The command-line interface that replaces the current `cavekit` bash script. Provides the `cavekit` binary with subcommands for monitor, status, kill, and analytics.

## Requirements

### R1: Binary and Installation
**Description:** A single Go binary named `cavekit` that can be installed via `go install` or downloaded.
**Acceptance Criteria:**
- [ ] Compiles to a single static binary
- [ ] Module path: `github.com/JuliusBrussee/cavekit` (or similar)
- [ ] Supports `go install github.com/JuliusBrussee/cavekit@latest`
- [ ] Binary name is `cavekit` (or `cavekit` to avoid conflict with the existing `cavekit` script)
**Dependencies:** none

### R2: Monitor Command (Default)
**Description:** The primary command that launches the TUI.
**Acceptance Criteria:**
- [ ] `cavekit` or `cavekit monitor` launches the TUI
- [ ] `--program <cmd>` overrides the default program (default: `claude`)
- [ ] `--autoyes` / `-y` enables auto-approval of permission prompts
- [ ] Preflight checks: tmux installed, program (claude) installed, git repo detected
- [ ] Loads persisted instances from previous session
**Dependencies:** R1, cavekit-tui R1

### R3: Status Command
**Description:** Shows site progress without launching the TUI.
**Acceptance Criteria:**
- [ ] `cavekit status` prints per-worktree progress to stdout
- [ ] Format: `{name}: {icon} {done}/{total} tasks done`
- [ ] Works from any terminal (doesn't require the TUI to be running)
- [ ] Exits after printing
**Dependencies:** R1, cavekit-site R3, cavekit-worktree R3

### R4: Kill Command
**Description:** Stops all Cavekit sessions and cleans up.
**Acceptance Criteria:**
- [ ] `cavekit kill` kills all `cavekit_*` tmux sessions
- [ ] Removes all `{project}-cavekit-*` worktrees
- [ ] Deletes all `cavekit/*` branches
- [ ] Cleans up `.claude/ralph-loop.local.md` from project root and worktrees
- [ ] Reports count of killed sessions, cleaned worktrees, deleted branches
**Dependencies:** R1, cavekit-tmux R1, cavekit-worktree R1

### R5: Configuration
**Description:** Persistent configuration for the monitor.
**Acceptance Criteria:**
- [ ] Config file at `~/.cavekit/config.json`
- [ ] Configurable: default_program, stagger_delay, max_instances (default 10)
- [ ] `cavekit debug` prints config paths for troubleshooting
- [ ] `cavekit reset` clears all stored instances
- [ ] `cavekit version` prints the version
**Dependencies:** R1

## Out of Scope
- Analytics command (keep as separate bash script for now)
- Merge command (keep as Claude Code slash command)
- Plugin system

## Cross-References
- See also: cavekit-tui.md (monitor launches TUI)
- See also: cavekit-session.md (persistence paths)

## Changes
- 2026-03-17: R2 acceptance criteria clarified — must parse --autoyes/-y flag and pass to TUI (finding F-010)
- 2026-03-17: R2 acceptance criteria clarified — preflight must check program (claude) is installed (finding F-015)
- 2026-03-17: R3 acceptance criteria clarified — must compute and display progress counts, not just worktree paths (finding F-012)
