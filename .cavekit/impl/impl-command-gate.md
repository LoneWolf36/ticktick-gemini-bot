---
created: "2026-03-31T00:00:00Z"
last_edited: "2026-03-31T00:00:00Z"
---
# Implementation Tracking: Command Safety Gate

| Task | Status | Notes |
|------|--------|-------|
| T-101 | DONE | PreToolUse hook scaffold: bp_command_gate reads JSON stdin or args, returns approve/block JSON |
| T-102 | DONE | Built-in allowlist (50+ safe executables, git subcommands) and blocklist (14 regex patterns) |
| T-103 | DONE | Config schema: command_gate (all/interactive/off), model, timeout, user allowlist/blocklist |
| T-104 | DONE | Fast-path classifier: bp_gate_fast_classify checks allowlist→blocklist→user lists→UNKNOWN |
| T-105 | DONE | Claude permission integration: BP_HOOK_ALREADY_ALLOWED/BLOCKED env vars, skip gate if set |
| T-106 | DONE | Command normalizer: strips paths, quotes, subshells, hashes for cache keying |
| T-107 | DONE | Codex safety classification: structured JSON prompt, parses safe/severity/reason |
| T-108 | DONE | Pattern-based verdict cache: bash3-compatible temp file, keyed on normalized command |
| T-109 | DONE | Graceful degradation: passthrough on Codex unavailable, timeout, or parse failure |
| T-110 | DONE | User-extensible allowlist/blocklist via command_gate_allowlist/blocklist config keys |
