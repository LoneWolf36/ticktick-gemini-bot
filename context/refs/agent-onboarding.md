# Agent Onboarding

## Source-of-Truth Order

When understanding the codebase, consult sources in this priority order:

1. **`AGENTS.md`** — Repository guidelines, architecture principles, guardrails, workflow rules. Highest authority if docs conflict.
2. **`context/refs/agent-onboarding.md`** (this file) — Curated navigation, key flows, and quick-reference tables.
3. **`context/kits/`** — Cavekit domain kits with R-numbered requirements (canonical spec source).
4. **Source files + nearby tests** — Behavior truth. Always read before editing.
5. **`context/refs/codebase-function-map.md`** — Generated export/signature index. Use for symbol discovery, not behavior inference.
6. **Local `docs/api/` from `npm run docs:typedoc`** — Deep API fallback only. Generated locally, ignored by git.

**Rule**: Never write code from generated docs alone. Use generated artifacts to find symbols; use kits, source, and tests to understand behavior.

---

## File Navigation Table

| File | Purpose |
|------|---------|
| `services/pipeline.js` | Main write-path orchestrator: message → intent → normalize → adapter |
| `services/intent-extraction.js` | Gemini-based intent extraction from natural language |
| `services/normalizer.js` | Deterministic normalization of intents → TickTick actions |
| `services/ticktick-adapter.js` | Executes actions against TickTick API (retry, rollback, OAuth refresh) |
| `services/ticktick.js` | Low-level TickTick API client (CRUD, OAuth, filter, move) |
| `services/gemini.js` | Gemini AI client (briefing, digest, chat, intent extraction) |
| `services/task-resolver.js` | Resolves natural-language task references → TickTick task IDs |
| `services/shared-utils.js` | Shared labels, keyboards, message builders, date helpers |
| `services/undo-executor.js` | Executes undo rollback entries against the TickTick adapter |
| `services/store.js` | State persistence (Redis or JSON file). Pending tasks, modes, clarifications |
| `services/scheduler.js` | Cron jobs: polling, briefings, deferred retry |
| `services/project-policy.js` | Configurable project categories, priorities, scoring |
| `services/pipeline-context.js` | Pipeline context construction and lifecycle management |
| `bot/commands.js` | Telegram slash command handlers + free-form message handler |
| `bot/callbacks.js` | Inline keyboard callback handlers (approve, skip, confirm, cancel) |
| `bot/index.js` | Bot factory. Configures Telegraf instance |

---

## Key Flows

### Free-Form Write Path

```
Telegram message text
  → bot/commands.js catch-all handler
    → processPipelineMessage(userMessage, options)
      → pipeline.js processMessage()
        1. Build request context (pipeline-context.js)
        2. Extract intents (intent-extraction.js → Gemini)
        3. Normalize intents (normalizer.js)
        4. For mutations: resolve target task (task-resolver.js)
        5. Execute actions (ticktick-adapter.js)
      ← Result: { type: 'task'|'clarification'|'not-found'|'pending-confirmation'|'non-task'|'error' }
    → Handle result: reply, persist state, show keyboards
```

### Mutation Confirmation Gate

```
User sends: "delete groceries task"
  → Pipeline resolves via task-resolver.js
  → If matchConfidence !== 'exact' (prefix/contains/fuzzy/coreference):
    → Returns { type: 'pending-confirmation', pendingConfirmation: {...} }
    → Bot handler persists state via store.setPendingMutationConfirmation()
    → Shows Confirm/Cancel keyboard
  → User taps Confirm (mut:confirm callback):
    → Validates auth, pending exists, TTL (10min)
    → Clears pending (duplicate-tap guard)
    → Resumes pipeline with skipMutationConfirmation: true
    → Executes the mutation
  → User taps Cancel (mut:confirm:cancel callback):
    → Clears pending, edits message with cancellation notice
  → Gate bypassed for:
    - Exact matches (matchConfidence === 'exact')
    - Pre-resolved taskId (mutationIntent.taskId exists)
    - Clarification resume (skipClarification: true)
    - Confirmed callback resume (skipMutationConfirmation: true)
```

### Mutation Clarification Flow

Used when intent is ambiguous (multiple similar task titles):

```
User sends: "update meeting task"
  → Pipeline resolver returns { status: 'clarification', candidates: [...] }
  → Bot shows candidate keyboard
  → User picks a candidate (mut:pick:ID callback)
    → Persists state in store.getPendingMutationClarification()
    → Resumes pipeline with skipClarification: true + existingTask
```

### TickTick Client Boundary

- **Never call `services/ticktick.js` directly from bot handlers.**
- Always route through `createPipeline().processMessage()` or `ticktick-adapter.js`.
- Exceptions: read-only display commands (`/pending`, `/status`) may read directly.

### Summary Surfaces

Summary composition lives in `services/summary-surfaces/`. Entry points:
- `bot/commands.js` → `/briefing`, `/weekly`, `/daily_close` commands
- `services/scheduler.js` → automated daily/weekly delivery

---

## Pipeline Result Types

| Type | Meaning | Contains |
|------|---------|----------|
| `task` | Actions executed successfully | `actions`, `results`, `confirmationText` |
| `error` | Pipeline failure | `failure.class`, `failure.details`, `confirmationText` |
| `clarification` | Ambiguity: user must pick one | `clarification.candidates`, `confirmationText` |
| `not-found` | No matching task | `notFound.reason` |
| `non-task` | No actionable intent detected | `confirmationText` |
| `pending-confirmation` | Non-exact mutation needs user confirm | `pendingConfirmation` block |

---

## Store Pending-State Table

| Key | TTL | Used For | Getter | Setter | Clearer |
|-----|-----|----------|--------|-------|---------|
| `pendingMutationClarification` | 10min (local constant) | Candidate selection for ambiguous task refs | `getPendingMutationClarification()` | `setPendingMutationClarification(data)` | `clearPendingMutationClarification()` |
| `pendingMutationConfirmation` | `MUTATION_CONFIRMATION_TTL_MS` (10min) | Confirm/cancel for non-exact mutations | `getPendingMutationConfirmation()` (with TTL cleanup) | `setPendingMutationConfirmation(data)` | `clearPendingMutationConfirmation()` |
| `pendingChecklistClarification` | `CHECKLIST_CLARIFICATION_TTL_MS` (24h) | Checklist vs separate-tasks choice | `getPendingChecklistClarification()` (TTL cleanup) | `setPendingChecklistClarification(data)` | `clearPendingChecklistClarification()` |
| `pendingTaskRefinement` | `TASK_REFINEMENT_TTL_MS` (5min) | Force-reply refinement on pending task | `getPendingTaskRefinement()` (TTL cleanup) | `setPendingTaskRefinement(data)` | `clearPendingTaskRefinement()` |
| `recentTaskContext` | `RECENT_TASK_CONTEXT_TTL_MS` (10min) | Last touched task for follow-ups | `getRecentTaskContext(userId)` (TTL cleanup) | `setRecentTaskContext(userId, data)` | `clearRecentTaskContext(userId)` |

---

## Callback Data Namespaces

| Pattern | Handler | Purpose |
|---------|---------|---------|
| `a:{taskId}` | Approve | Apply pending review changes |
| `s:{taskId}` | Skip | Keep original, skip review |
| `d:{taskId}` | Drop | Delete task |
| `r:{taskId}` | Refine | Open force-reply refinement |
| `review:stop` | Stop review | End review session |
| `mut:pick:{taskId}` | Mutation pick | Select task from clarification candidates |
| `mut:cancel` | Mut cancel | Cancel mutation clarification |
| `mut:confirm` | Confirm gate | Confirm non-exact mutation |
| `mut:confirm:cancel` | Confirm cancel | Cancel non-exact mutation confirmation |
| `menu:{cmd}` | Menu shortcut | Route to command handler |
| `cl:{preference}` | Checklist pick | Choose checklist/separate/skip |

---

## Safe Defaults & Privacy Notes

- **Missing config** → safe default (priority cap 3, default 1, standard mode)
- **Ambiguous target** → clarification, never best-guess mutation
- **Non-exact match** → user confirmation required
- **Scan/review** `pending-confirmation` → fail-closed: marks task processed without mutation
- **No raw task text** stored in behavioral memory (only derived signal types)
- **Never hardcode** user names, project names, food names, locations in source code
- **User-specific rules** belong in `user_context.js` / `PROJECT_POLICY`, not in source heuristics

---

## What To Do Before Editing

1. **Read `AGENTS.md`** cover-to-cover (at least guardrails 1-11)
2. **Read the relevant Cavekit kit** in `context/kits/` for the domain you're changing
3. **Consult `context/refs/codebase-function-map.md`** when locating exports or public signatures
4. **Read the file you plan to edit** with `Read` tool — never guess indentation
5. **Read or search nearby tests** before adding new test files
6. **Write a plan** per Guardrail #1 (Mandatory Plan Before Coding)
7. **Run `npm test`** before declaring done

---

## Quick Reference: Exported Constants (shared-utils)

| Export | Type | Description |
|--------|------|-------------|
| `MUTATION_TYPE_LABELS` | `Object` | Maps action types to user labels (`delete`→`Delete`, etc.) |
| `MATCH_TYPE_LABELS` | `Object` | Maps match types to descriptions (`prefix`→`partial name match`, etc.) |
| `PRIORITY_MAP` | `Object` | Gemini priority labels → TickTick priority ints |
| `PRIORITY_EMOJI` | `Object` | TickTick priority ints → emoji |
| `PRIORITY_LABEL` | `Object` | TickTick priority ints → user-facing labels |
| `AUTHORIZED_CHAT_ID` | `number|null` | Authorized Telegram chat ID from env |
| `USER_TZ` | `string` | User timezone from env or default |
