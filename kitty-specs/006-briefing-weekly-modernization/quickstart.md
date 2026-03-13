# Quickstart: 006 Briefing and Weekly Pipeline Modernization

## Purpose

Use this guide after implementation to verify the shared summary surface, deterministic formatter, and manual/scheduler parity for `/briefing` and `/weekly`.

## Prerequisites

- Install dependencies with `npm install`.
- Prefer mocked regression paths for routine validation.
- Keep live TickTick and Gemini credentials out of the default verification flow unless you are intentionally running the opt-in live scripts.

## Verification Flow

### 1. Run the lightweight regression harness

```bash
node tests/run-regression-tests.mjs
```

Expected:
- Daily and weekly summary contract tests pass.
- Sparse-task and sparse-history fallbacks pass without fabricated output.
- Manual command wiring and scheduler wiring use the shared summary surface.

### 2. Run the Node test suite

```bash
node --test tests/regression.test.js
```

Expected:
- Structured summary objects are asserted before formatting.
- Formatter-specific tests confirm Telegram-safe output and stable section order.
- Command and scheduler parity tests pass for both `/briefing` and `/weekly`.

### 3. Validate the daily briefing contract

Check:
- The structured daily summary exposes `focus`, `priorities`, `why_now`, `start_now`, and `notices`.
- Sparse active-task input yields a reduced but useful briefing with explicit notices instead of filler.
- `start_now` remains concise and actionable.

### 4. Validate the weekly review contract and fallback

Check:
- The structured weekly summary exposes `progress`, `carry_forward`, `next_focus`, `watchouts`, and `notices`.
- Missing or sparse processed-task history yields a reduced digest plus a missing-history notice.
- `watchouts` contains only evidence-backed execution risks or missing-data notices and is omitted when evidence is insufficient.

### 5. Validate formatter output and tone preservation

Check:
- Existing headers and urgent-mode reminders remain recognizable.
- Output stays Telegram-safe and does not introduce `#`, `##`, or `###` headings.
- Wording changes are limited to deterministic formatting or honest fallback notices.

### 6. Validate manual and scheduler parity

Check:
- Given the same task set and state, manual and scheduled daily summaries use the same shared summary module.
- Given the same task set and processed-history snapshot, manual and scheduled weekly summaries use the same shared summary module.
- Scheduler-only delivery wrappers, such as pending-review reminders, remain outside the shared summary contract.

### 7. Validate logging and diagnostics

Check:
- Source counts, degraded reasons, structured summary output, and formatting decisions are logged before delivery.
- Delivery failures for manual and scheduled runs are logged with enough context to compare behavior.
- Structured logs do not require reading the final rendered string to understand why a fallback occurred.

### 8. Optional live smoke validation

Optional commands:

```bash
node tests/e2e-live-checklist.mjs
node tests/e2e-live-ticktick.mjs
```

Use these only when you intentionally want live confidence checks.

Manual smoke ideas:
- Trigger `/briefing` with a normal active-task set and confirm the output remains compact.
- Trigger `/weekly` with missing or thin processed history and confirm the explicit missing-history notice appears.
- Turn urgent mode on and confirm the reminder remains visible on both daily and weekly surfaces.
