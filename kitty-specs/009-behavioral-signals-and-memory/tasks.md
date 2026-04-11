# Work Packages: Behavioral Signals and Memory

**Spec**: 009-behavioral-signals-and-memory  
**Created**: 2026-03-10  

---

## WP01: Signal Classifier Core

**Title**: Rule-based classifier for task mutation events  
**Dependencies**: None  
**Complexity**: Medium  

### Subtasks

| # | Subtask | Acceptance Criteria |
|---|---------|---------------------|
| 1.1 | Define signal taxonomy | Document lists all signal types (postpone, scope_change, decomposition, planning_heavy, completion, creation, deletion) with trigger conditions. |
| 1.2 | Implement classifier entry point | Function accepts a task mutation event (type, before, after) and returns zero or more signal objects. |
| 1.3 | Implement postpone detection rule | Emits a "postpone" signal when a task's due date is moved forward. Includes category, not title. |
| 1.4 | Implement scope change detection rule | Emits a "scope_change" signal when task description length changes by >30% or subtasks are added/removed. Classifies as "wording_only" or "scope_change". |
| 1.5 | Implement decomposition detection rule | Emits a "decomposition" signal when a task is split into subtasks or subtasks are converted to standalone tasks. |
| 1.6 | Wire classifier into TickTickAdapter | Every mutation path (create, update, complete, postpone, delete) calls the classifier. Failures are caught and logged — never thrown. |
| 1.7 | Unit tests for each rule | Each rule is tested with: (a) a matching mutation that fires the signal, (b) a non-matching mutation that fires nothing, (c) an edge case (minimal change). |

---

## WP02: Redis Storage Layer

**Title**: Signal persistence with 30-day TTL and tenant-scoped keys  
**Dependencies**: WP01  
**Complexity**: Low  

### Subtasks

| # | Subtask | Acceptance Criteria |
|---|---------|---------------------|
| 2.1 | Create behavioral store module | Module exports `writeSignal`, `getSignals`, `getPatterns`, `setPatterns`, `clearAll` functions. |
| 2.2 | Implement write path with TTL | `writeSignal` stores a signal under `user:{userId}:behavioral:signals` with a 30-day TTL. Uses Redis `EXPIRE` or `SETEX`. |
| 2.3 | Implement read path with window filtering | `getSignals(userId, since)` returns only signals within the requested time window. Defaults to last 30 days. |
| 2.4 | Implement pattern read/write | `getPatterns` and `setPatterns` read/write the pattern cache under `user:{userId}:behavioral:patterns`. No TTL — patterns are recomputed, not expired. |
| 2.5 | Implement tenant-scoped key generation | All keys follow the `user:{userId}:behavioral:*` pattern. No cross-tenant data leakage possible. |
| 2.6 | Unit tests with mocked Redis | Tests verify: write stores correct key, read filters by window, tenant isolation (user A cannot see user B's signals). |

---

## WP03: Pattern Detection Engine

**Title**: Detect top 7 behavioral patterns from stored signals  
**Dependencies**: WP01, WP02  
**Complexity**: High  

### Subtasks

| # | Subtask | Acceptance Criteria |
|---|---------|---------------------|
| 3.1 | Implement Snooze Spiral detector | Fires when a user has 3+ postpone signals for different tasks within the 30-day window. Returns confidence score. |
| 3.2 | Implement Commitment Overloader detector | Fires when a user creates 15+ tasks in a single day but completes ~6 or fewer. Returns completion ratio. |
| 3.3 | Implement Stale Task Museum detector | Fires when a user has 30+ tasks untouched (no update, no complete, no postpone) for 30+ days. Returns count of stale tasks. |
| 3.4 | Implement Quick Win Addiction detector | Fires when a user's completed tasks are disproportionately small (<5 min estimated or single-word titles) compared to planned work. |
| 3.5 | Implement Vague Task Writer detector | Fires when >50% of a user's created tasks have one-word titles. Uses category, not raw title text — counts only. |
| 3.6 | Implement Deadline Daredevil detector | Fires when a user consistently completes tasks on or after their due date (no early completions) over a 14-day window. |
| 3.7 | Implement Category Avoidance detector | Fires when a user has tasks in a specific category that are postponed 3+ times more than completed, relative to other categories. |
| 3.8 | Implement confidence model | Each pattern returns `{ pattern, confidence, evidence_count, isHighConfidence, isWeakInference }`. High confidence = 1 strong signal. Standard confidence = 3+ corroborating signals. Weak inference = 1-2 signals, marked as internal-only. |
| 3.9 | Unit tests with synthetic datasets | Each pattern is tested with: (a) dataset that should fire it, (b) dataset that should not, (c) borderline dataset at the confidence threshold. |

---

## WP04: Privacy Tier Manager

**Title**: Default/opt-in/skip privacy controls per user  
**Dependencies**: WP01  
**Complexity**: Low  

### Subtasks

| # | Subtask | Acceptance Criteria |
|---|---------|---------------------|
| 4.1 | Create privacy manager module | Module exports `getTier`, `setTier`, `shouldCollectSignal`, `shouldCollectSensitiveSignal` functions. |
| 4.2 | Implement tier storage | Tier stored under `user:{userId}:behavioral:privacy_tier` in Redis. Defaults to "default" when not set. |
| 4.3 | Implement collection gate | `shouldCollectSignal(userId)` returns false for "skip" tier, true for "default" and "sensitive". `shouldCollectSensitiveSignal` returns true only for "sensitive". |
| 4.4 | Integrate gate into signal classifier | Classifier checks `shouldCollectSignal` before emitting. If false, returns empty array immediately. |
| 4.5 | Unit tests for each tier | Tests verify: "skip" produces zero writes, "default" produces non-sensitive signals, "sensitive" produces all signals. |

---

## WP05: Summary Surface Integration

**Title**: Inject behavioral patterns into daily and weekly summaries  
**Dependencies**: WP03, WP04  
**Complexity**: Medium  

### Subtasks

| # | Subtask | Acceptance Criteria |
|---|---------|---------------------|
| 5.1 | Create behavioral insights module | Module exports `getInsightsForSummary(userId, summaryType)` function. Returns array of pattern descriptions in observational language. |
| 5.2 | Implement confidence filter for output | Only patterns with standard or high confidence are included. Weak inferences are excluded from output. |
| 5.3 | Implement observational language formatter | Each pattern description uses neutral, observational phrasing (e.g., "I noticed several tasks have been rescheduled recently" — not "You keep procrastinating"). |
| 5.4 | Integrate into daily briefing generator | Daily briefing calls `getInsightsForSummary` and appends behavioral insights when available. Omits section cleanly when no patterns detected. |
| 5.5 | Integrate into weekly digest generator | Weekly digest calls `getInsightsForSummary` and includes a "Patterns This Week" section when patterns are detected. |
| 5.6 | Integration tests for summary output | Tests verify: (a) patterns appear in summary with correct language, (b) no patterns appear when confidence is low, (c) no patterns appear when user is in "skip" tier. |

---

## WP06: User Controls

**Title**: Telegram commands for inspecting and resetting behavioral memory  
**Dependencies**: WP04, WP05  
**Complexity**: Low  

### Subtasks

| # | Subtask | Acceptance Criteria |
|---|---------|---------------------|
| 6.1 | Implement `/behavior` command | Returns a plain-language summary of retained behavioral memory. Lists active patterns detected. Exposes no implementation internals (no signal counts, no confidence scores). |
| 6.2 | Implement `/reset_behavior` command | Clears all behavioral signals and patterns for the user. Confirms reset with a simple acknowledgment message. |
| 6.3 | Implement tier change command | `/privacy default|sensitive|skip` allows users to change their privacy tier. Confirms the change and explains what it means. |
| 6.4 | Register commands with Telegram API | New commands appear in the bot's command list alongside existing commands. |
| 6.5 | Integration tests for inspect flow | Test verifies: generate signals → call `/behavior` → response contains pattern description → call `/reset_behavior` → call `/behavior` → response confirms no retained memory. |

---

## WP07: Testing & Privacy Audit

**Title**: End-to-end regression tests and privacy boundary verification  
**Dependencies**: WP01–WP06  
**Complexity**: Medium  

### Subtasks

| # | Subtask | Acceptance Criteria |
|---|---------|---------------------|
| 7.1 | Add end-to-end regression test: full signal flow | Simulates task mutations through the adapter → verifies signals appear in Redis → verifies patterns are detected → verifies summary includes insights. |
| 7.2 | Add regression test: non-blocking under failure | Simulates Redis unavailability during mutation → verifies task mutation succeeds → verifies no error propagates to the user. |
| 7.3 | Add regression test: 30-day expiration | Populates signals with timestamps 31 days old → verifies patterns do not include them → verifies summary does not reference them. |
| 7.4 | Add regression test: low-confidence omission | Populates signals that produce weak inferences only → verifies summary omits behavioral insights entirely. |
| 7.5 | Privacy audit: scan all storage writes | Reviews every `writeSignal` call and Redis write to confirm no raw task titles, messages, or free-form text is stored. Only enumerated metadata types are written. |
| 7.6 | Privacy audit: document the boundary | Writes a `PRIVACY.md` file in the spec directory documenting: what is stored, what is never stored, retention window, user controls, and how to verify compliance for future changes. |
| 7.7 | Run full regression suite | All existing tests in `tests/regression.test.js` and `tests/run-regression-tests.mjs` pass with no new failures introduced. |

---

## Execution Order

```
Phase 1: WP01 (Signal Classifier Core)
Phase 2: WP02 (Redis Storage Layer)
Phase 3: WP03 (Pattern Detection Engine)
Phase 4: WP04 (Privacy Tier Manager) — can start parallel to WP02
Phase 5: WP05 (Summary Surface Integration)
Phase 6: WP06 (User Controls)
Phase 7: WP07 (Testing & Privacy Audit)
```

**Critical path**: WP01 → WP02 → WP03 → WP05 → WP07  
**Parallel track**: WP04 can begin after WP01; WP06 can begin after WP04 + WP05.
