---
created: "2026-03-17T12:00:00Z"
last_edited: "2026-03-17T12:00:00Z"
---

# Review Findings

| Finding | Severity | File | Status | Task |
|---------|----------|------|--------|------|
| F-001: Tick loop is a no-op | P0 | internal/tui/app.go:213-214 | NEW | T-043 |
| F-002: Tab components not connected to App | P0 | internal/tui/app.go:75-93 | NEW | T-044 |
| F-003: ActionOpen never handled | P0 | internal/tui/app.go:109-174 | NEW | T-045 |
| F-004: AutoYes never instantiated or called | P1 | internal/tui/app.go | NEW | T-043 |
| F-005: UpdateProgress never called | P1 | internal/tui/app.go:213-214 | NEW | T-043 |
| F-006: ActionPush/Checkout/Resume never handled | P1 | internal/tui/app.go:109-174 | NEW | T-046, T-047 |
| F-007: FrontierPicker never instantiated | P1 | internal/tui/app.go:75-93 | NEW | T-049 |
| F-008: ActionScrollUp/Down never handled | P1 | internal/tui/app.go:109-174 | NEW | T-048 |
| F-009: Session load doesn't validate existence | P1 | internal/session/persistence.go:49-63 | NEW | T-050 |
| F-010: --autoyes flag not parsed | P1 | cmd/cavekit/main.go:62-67 | NEW | T-051 |
| F-011: Instance list missing branch/diff stats | P2 | internal/tui/instancelist.go:76-105 | NEW | T-053 |
| F-012: Status command shows paths not progress | P2 | cmd/cavekit/main.go:76-105 | NEW | T-052 |
| F-013: Menu doesn't adapt to context | P2 | internal/tui/menu.go:44-48 | NEW | T-055 |
| F-014: DiffTab scroll position never applied | P2 | internal/tui/difftab.go:42-67 | NEW | T-054 |
| F-015: Missing preflight for program | P3 | cmd/cavekit/main.go:142-150 | NEW | T-056 |
| F-016: TerminalTab inconsistent session naming | P3 | internal/tui/terminaltab.go:26-37 | NEW | — |
