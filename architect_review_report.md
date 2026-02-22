# TickTick Gemini Bot — Full Architect Review

> Cross-project synthesis from individual file reviews of all 10 source files.
> Report only — no code suggestions.

---

## A. Fully Working End-to-End

These paths are complete, wired up, and functional when TickTick is authenticated and Gemini quota is available:

| Feature | Path | Notes |
|---|---|---|
| **OAuth flow** | [server.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/server.js) → `ticktick.exchangeCode()` → `token.json` | Token saved, success HTML shown |
| **`/start`** | Sets `chatId` in store, sends welcome | Simple, solid |
| **`/status`** | Reads store stats + auth state | Pure read, no API calls |
| **`/scan` (happy path)** | Fetch tasks → filter unknown → Gemini analyze → send cards → await buttons | Batched (5), 3s delay, quota parking |
| **Approve / Skip / Drop buttons** | [callbacks.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/callbacks.js) → store mutation → TickTick update (approve only) | Buttons correctly disappear after action |
| **`/undo`** | Reads undo log → writes original values back to TickTick | Linear undo (stack-based) |
| **`/briefing`** | Fetch all tasks → Gemini briefing → Telegram message | Single API + single Gemini call |
| **`/weekly`** | Fetch all tasks + processed → Gemini digest → Telegram | Two data sources combined |
| **Free-form chat** | Fetch tasks + projects → Gemini 2.5-flash → coach or action | Can update TickTick via [executeActions()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#359-403) |
| **Scheduled poll** | Cron every N min → same as `/scan` path | Quota parking, batch limit, auth guard |
| **Scheduled briefing/digest** | Cron daily/weekly → same as manual commands | Auth + quota guards present |
| **Store persistence** | Write-through to file or Redis on every mutation | Survives restarts (when writes succeed) |
| **`/reset CONFIRM`** | Wipes store, preserves `chatId` | Confirmation required |
| **User context** | Loaded from [user_context.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/user_context.js) → injected into all 4 prompts | Filled out with real personal data |

---

## B. Half-Built or Has a Gap

| Area | What's There | What's Missing |
|---|---|---|
| **Token refresh** | Token is stored (file or env var) | No refresh token logic. When token expires, full manual re-auth required. No programmatic recovery. |
| **Quota guard consistency** | [analyzeTask()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/gemini.js#197-245) checks [isQuotaExhausted()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/gemini.js#185-194). Scheduler poll and daily briefing cron check it. | `/briefing` command, `/weekly` command, and free-form handler **do not** check. User gets raw `RESOURCE_EXHAUSTED` error. |
| **Concurrency** | Sequential task processing within a batch | Zero mutex/lock between `/scan`, `/review`, scheduled poll, and free-form. Two concurrent paths can analyze the same task twice. |
| **Task creation/completion** | [createTask()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/ticktick.js#82-85) and [completeTask()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/ticktick.js#90-93) exist in [ticktick.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/ticktick.js) | Never called from anywhere. Bot can read and update tasks but can't create subtasks or mark tasks done — core to the vision. |
| **Store durability** | [save()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#106-118) called on every mutation | No atomicity. Corrupt write = total data loss. [loadFromFile](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#82-99) catch silently resets to defaults. No backup, no WAL. |
| **Pending task overflow** | `/review` checks pending count and redirects | `/scan` and scheduler poll do not. Cards pile up unboundedly while burning Gemini quota on analysis nobody reviews. |
| **TickTick 401 mid-operation** | Token is nulled on 401, error thrown | [getAllTasks()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/ticktick.js#96-123) catches per-project errors and continues. A mid-operation 401 returns partial results with no signal that data is incomplete. |
| **Weekly digest data quality** | Sends all tasks + processed this week | Only `originalTitle` and approve/skip flag are extracted from processed tasks. Full analysis data is available in store but not passed to Gemini. |
| **Store pruning** | [pruneOldEntries(30)](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#289-311) cron at midnight + boot | `processedTasks` grows unbounded between prune runs. `failedTasks` entries only expire on-access for that specific task ID — orphaned entries sit forever. |
| **Undo entry schema** | 3 call sites, 3 different shapes | Approve-button entries lack `applied*` fields. `/undo` shows bare "Reverted" with no detail about what changed. |

---

## C. Confirmed Redundancies

### C1. Code That Does the Same Thing in Two Places

| Redundancy | Locations | Impact |
|---|---|---|
| **`/scan` and `/review` are the same loop** | [commands.js:96-168](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L96-L168) vs [commands.js:278-309](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L278-L309) | Same fetch → filter → batch → [analyzeAndSend()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#407-438) → sleep pattern. `/scan` has quota parking + auto-apply tracking; `/review` has pending check. Neither has both. |
| **[approveTask](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#178-192) / [skipTask](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#193-207) / [dropTask](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#208-222)** | [store.js:178-221](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#L178-L221) | Near-identical: move pending → processed with a flag. [dropTask](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#208-222) increments `tasksSkipped` (copy-paste bug). Could be one function with a `status` parameter. |
| **[executeActions](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#359-403) / [autoApply](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#441-476) undo logging** | [commands.js:371-381](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L371-L381) vs [commands.js:447-460](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L447-L460) vs [callbacks.js:49-56](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/callbacks.js#L49-L56) | Three separate undo entry builders with divergent schemas. |
| **Priority maps** ×4 | [utils.js:6](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/utils.js#L6), [gemini.js:318](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/gemini.js#L318), [gemini.js:368](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/gemini.js#L368), [commands.js:446](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L446) | 4 different priority label/number/emoji maps, none referencing each other. |
| **Briefing/digest header formatting** | [commands.js:248](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L248) + [scheduler.js:146](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/scheduler.js#L146) (briefing), [commands.js:270](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L270) + [scheduler.js:176](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/scheduler.js#L176) (digest) | Same `🌅 MORNING BRIEFING` / `📊 WEEKLY REVIEW` + separator string built inline in two places each. |
| **Weekly date-filter logic** | [commands.js:264-268](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L264-L268) + [scheduler.js:170-174](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/scheduler.js#L170-L174) | Identical "filter processedTasks to last 7 days" loop in both `/weekly` command and weekly cron. |
| **Auth check pattern** | [commands.js:14-25](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L14-L25) + [callbacks.js:7-9, 29-31, 78-79, 96-98](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/callbacks.js#L7-L9) | Same `AUTHORIZED_CHAT_ID` check duplicated across two files with slightly different implementations. |

### C2. Dead Code / Unreachable Paths

| Item | Location | Evidence |
|---|---|---|
| **[bot/messages.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/messages.js)** (entire file) | [messages.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/messages.js) | Zero imports anywhere. [formatTaskCard](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/messages.js#7-47), [formatDailyBriefing](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/messages.js#50-54), [formatWeeklyDigest](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/messages.js#57-61), [formatStatus](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/messages.js#64-84) — all superseded by [utils.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/utils.js) + inline formatting. 91 lines of dead code. |
| **`ticktick.createTask()`** | [ticktick.js:82-84](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/ticktick.js#L82-L84) | Never called. |
| **`ticktick.completeTask()`** | [ticktick.js:90-92](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/ticktick.js#L90-L92) | Never called. |
| **`ticktick.getTask()`** | [ticktick.js:78-80](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/ticktick.js#L78-L80) | Never called. |
| **`PRIORITY_MAP` import in commands.js** | [commands.js:6](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L6) | Imported but never used in that file — only used inside [utils.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/utils.js) itself. |
| **[markTaskProcessed()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#223-231) double purpose** | [store.js:223-230](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#L223-L230) | Used for both auto-apply and freeform-drop, but increments `tasksAnalyzed` (not `tasksProcessed`) — semantic mismatch. Overlaps with [approveTask](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#178-192)/[skipTask](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#193-207)/[dropTask](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#208-222). |

---

## D. Ordered Action Plan (Safest First)

### 1. Safe to Delete — Zero Risk, No User-Visible Change

| # | Action | File(s) | Lines Removed |
|---|---|---|---|
| 1.1 | Delete [bot/messages.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/messages.js) | [messages.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/messages.js) | ~91 lines |
| 1.2 | Remove unused `PRIORITY_MAP` import from [commands.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js) | [commands.js:6](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js#L6) | 1 import |
| 1.3 | Fix [dropTask()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#208-222) incrementing `tasksSkipped` instead of a `tasksDropped` counter | [store.js:218](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#L218) | 1 line (stat name) |

---

### 2. Right-Size — Simplify Without Changing Behaviour

| # | Action | Scope | Rationale |
|---|---|---|---|
| 2.1 | **Merge `/scan` and `/review` into one path** with config flags for pending-gate and quota-parking | [commands.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js) | Eliminates ~50 lines of duplication and ensures both get the same robustness |
| 2.2 | **Unify [approveTask](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#178-192)/[skipTask](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#193-207)/[dropTask](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#208-222)** into a single `resolveTask(taskId, status)` function | [store.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js) | 3 functions → 1, eliminates the `tasksSkipped` copy-paste bug |
| 2.3 | **Consolidate priority maps** into [utils.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/utils.js) exports: `LABEL_TO_NUMBER`, `NUMBER_TO_EMOJI`, `NUMBER_TO_LABEL` | [utils.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/utils.js), [gemini.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/gemini.js), [commands.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js) | 4 scattered maps → 1 source of truth |
| 2.4 | **Extract undo entry builder** into a single `buildUndoEntry(task, appliedChanges, action)` function | [utils.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/utils.js) | 3 divergent schemas → 1 consistent shape |
| 2.5 | **Extract briefing/digest formatting** into shared functions (header + date filter) | [utils.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/utils.js) or new `formatters.js` | Eliminates 2×2 inline duplications |
| 2.6 | **Centralize auth check** into one middleware/helper used by both [commands.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/commands.js) and [callbacks.js](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/bot/callbacks.js) | `bot/` layer | 2 implementations → 1 |

---

### 3. Complete — Build to Reach Stable v1

| # | Action | Why It Matters |
|---|---|---|
| 3.1 | **Add quota guard to `/briefing`, `/weekly`, and free-form handler** | Currently crash with raw API errors when quota is exhausted. 3 lines per handler. |
| 3.2 | **Add pending-count gate to `/scan` and scheduler poll** | Stop burning quota on analysis cards nobody is reviewing. |
| 3.3 | **Add a scan lock** (simple boolean flag) to prevent concurrent `/scan` + poll overlap | Prevents duplicate cards, double quota burn, and double-counted stats. |
| 3.4 | **Add startup validation for TickTick env vars** | `TICKTICK_CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` — fail fast with clear error instead of broken OAuth URL. |
| 3.5 | **Handle partial results from [getAllTasks()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/ticktick.js#96-123)** when token expires mid-operation | Either abort entirely on first 401 (don't return partial data) or return a `{ tasks, errors }` object. |
| 3.6 | **Add atomic file writes** (write to `.tmp`, rename) to prevent store corruption | Single biggest data-loss risk in the project. |
| 3.7 | **Add task list caching with TTL** for the free-form handler | Every message triggers N+1 TickTick API calls. A 60-second cache would eliminate 95% of redundant fetches. |
| 3.8 | **Wire up [createTask()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/ticktick.js#82-85) and [completeTask()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/ticktick.js#90-93)** for the free-form path | Core to your vision — bot should be able to break tasks into subtasks and mark things done. Currently dead code. |
| 3.9 | **Add `failedTasks` cleanup** to the pruning cron | Orphaned entries with expired `retryAfter` only get cleaned when [isTaskKnown()](file:///c:/Users/Huzefa%20Khan/Downloads/Gmail/ticktick-gemini/services/store.js#143-151) is called for that specific ID. Need a sweep. |
