---
work_package_id: WP08
title: End-of-Day Reflection Surface Closure
dependencies:
- WP07
requirement_refs:
- FR-004
- FR-007
- FR-009
- FR-012
created_at: '2026-04-18T00:00:00+00:00'
subtasks:
- T037
- T038
- T039
- T040
- T041
- T042
phase: Phase 8 - End-of-Day Reflection Closure
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMYXNH3ATTB29REH4RQ
owned_files:
- services/summary-surfaces/index.js
- services/summary-surfaces/daily-close-summary.js
- services/summary-surfaces/summary-formatter.js
- services/schemas.js
- bot/commands.js
- tests/regression.test.js
- tests/run-regression-tests.mjs
- kitty-specs/006-briefing-weekly-modernization/quickstart.md
wp_code: WP08
---

# Work Package Prompt: WP08 - End-of-Day Reflection Surface Closure

## Product Vision Alignment Gate

This WP exists to close the remaining spec-defined gap in mission `006-briefing-weekly-modernization`: the product vision and `spec.md` promise a brief, context-aware, non-punitive end-of-day reflection surface, but the original implementation breakdown only covered briefing and weekly modernization.

**This WP must:**
- Keep the reflection surface brief, factual, and useful within 1-2 minutes.
- Stay non-punitive for irregular use, travel, disrupted days, or sparse evidence.
- Use the shared summary surface and deterministic formatter rather than reviving a prompt-only path.

**This WP must not:**
- Add behavioral-memory claims, diagnosis, or punitive coaching that belong to later missions.
- Turn reflection into a report card, lecture, or motivational filler block.
- Fork a second summary architecture outside `services/summary-surfaces/`.

## Objectives and Success Criteria

Add the missing `/daily_close` (or explicitly equivalent) reflection surface required by User Story 4 plus FR-009 and FR-012.

**Independent test**: The reflection surface returns lightweight stats, sparse-day fallbacks, and context-appropriate tone without punishing irregular usage.

Success looks like:
- Reflection output is inspectable before formatting.
- Sparse or disrupted days degrade to facts-only output.
- Manual delivery uses the shared summary surface and deterministic formatting path.

## Subtasks and Detailed Guidance

### Subtask T037 - Freeze end-of-day reflection contract

**Purpose**: Avoid inventing the missing surface ad hoc.

**Required work**:
- Define the minimum reflection object shape needed for brief stats, one short reflection line, and notices.
- Update `quickstart.md` acceptance scenarios for reflection.
- Keep the contract minimal and compatible with the existing summary-surface architecture.

### Subtask T038 - Add reflection composer

**Purpose**: Build the structured reflection object before formatting.

**Required work**:
- Add `services/summary-surfaces/daily-close-summary.js`.
- Add any schema helpers needed in `services/schemas.js` and shared exports in `services/summary-surfaces/index.js`.
- Keep the composer evidence-based and sparse-data honest.

### Subtask T039 - Wire `/daily_close` or equivalent manual surface

**Purpose**: Make the reflection surface reachable through the bot.

**Required work**:
- Add or wire the manual end-of-day entry point in `bot/commands.js`.
- Route through the shared summary surface rather than legacy prompt-only logic.
- Preserve existing auth and error-handling conventions.

### Subtask T040 - Preserve sparse-day and irregular-use handling

**Purpose**: Protect trust when the user had little data or inconsistent interaction.

**Required work**:
- Ensure sparse or disrupted days fall back to facts and a small reset cue.
- Do not punish irregular use or fabricate patterns.
- Keep tone brief and non-judgmental.

### Subtask T041 - Extend deterministic formatting for reflection

**Purpose**: Keep reflection Telegram-safe and regression-stable.

**Required work**:
- Extend `summary-formatter.js` only as far as needed for the new reflection surface.
- Keep section order and wording deterministic.
- Avoid filler, cheerleading, or moral framing.

### Subtask T042 - Add regression coverage

**Purpose**: Lock the reflection behavior against future drift.

**Required work**:
- Add coverage for meaningful-progress, mixed-results, avoidance-pattern, irregular-use, and sparse-data days.
- Verify the reflection surface remains brief and non-punitive.
- Ensure external dependencies stay mocked.

## Review Guidance

Reject this WP if it adds punishment, verbosity, unsupported behavioral inference, or a second summary path. Approve only if the end-of-day reflection promise from `spec.md` becomes real in code, tests, and shared architecture.
