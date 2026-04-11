# Work Packages: Behavioral Signals and Memory

**Spec**: 009-behavioral-signals-and-memory
**Created**: 2026-03-10

---

## Product Vision Alignment Contract

This work-package task list is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature lets the assistant become a mirror over time. It may notice procrastination patterns, but it must be privacy-bounded, confidence-gated, and adaptive instead of intrusive or judgmental.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Store only behavioral metadata needed for patterns; avoid raw task titles, raw messages, or unnecessary personal text.
- Expose only standard- or high-confidence patterns; weak inferences stay internal or are omitted.
- Intervene gradually: silent signals first, direct call-outs only when repeated evidence justifies them, and strict commands only in urgent mode.

**Reject or revise this artifact if**:
- The system stores more private data than needed for the behavior-change loop.
- Low-confidence patterns appear in summaries or coaching as fact.
- Repeated ignored guidance causes louder escalation instead of backing off or adapting.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission gives the assistant memory as a behavioral mirror, not as surveillance and not as raw conversation storage. It must learn derived patterns such as postponement, task switching, over-planning, busywork preference, and repeated avoidance. It must be inspectable, resettable, retention-bound, and confidence-gated.

### Required Product Behavior For This Mission

- Behavioral memory stores derived metadata and pattern signals, not raw task titles, raw descriptions, or raw user messages as long-term memory.
- Insights are surfaced only when confidence and usefulness justify them; weak inference is labelled or withheld.
- The user can inspect, reset, and understand what the system has inferred.
- The system adapts guidance over time, including reducing task count, changing presentation, or backing off when the current style does not help.

### Cross-Mission Dependency And Drift Risk

This mission depends on all previous missions. It closes the 001-009 product loop by turning reliable task execution, planning, prioritization, and intervention history into privacy-aware behavioral support.

### Evidence Required Before Any WP Approval

Every implement-review cycle for this mission must produce reviewer-visible evidence for all of the following:

1. The specific Product Vision clause or behavioral scope section served by the change.
2. The local FR, NFR, plan step, task, or WP requirement implemented by the change.
3. The concrete user-visible behavior that changed, including whether the change affects capture, clarification, planning, ranking, intervention, reflection, recovery, or behavioral memory.
4. The anti-drift rule the change preserves: not a passive task manager, not generic reminders, not over-planning support, not busywork optimization, not false certainty, and not SaaS scope expansion.
5. The automated test, regression script, manual transcript, or inspection evidence that proves the behavior.
6. The downstream missions that rely on this behavior and what would break if it drifted.

### Complete 001-009 Acceptance Criteria

After all WPs in missions 001 through 009 have passed implementation, review, and mission-level acceptance, the integrated product must satisfy every item below. If any item is not demonstrably true, the 001-009 chain is not complete.

1. The user can capture clear, vague, multi-task, checklist, recurring, and mutation requests safely through the accepted pipeline without legacy path drift.
2. Ambiguous or destructive actions clarify or fail closed instead of guessing.
3. The daily plan usually contains no more than three tasks, is realistic for the user context, and includes long-term-goal work when such work exists and is plausible.
4. The system distinguishes important work from low-value busywork and actively avoids rewarding motion-as-progress.
5. Urgent mode is temporary, minimal, direct, and action-oriented; it is not the default tone and it does not mutate TickTick state unless the user explicitly asks for a task operation.
6. Weak behavioral or priority inference is never presented as fact. The assistant asks, labels uncertainty, or stays quiet.
7. Behavioral memory stores derived signals only, uses retention limits, and supports inspection/reset so memory remains a coaching aid rather than surveillance.
8. Morning start stays short; end-of-day reflection stays brief, context-aware, and non-punitive.
9. Ignored guidance causes adaptation or backing off, not louder nagging.
10. The implementation avoids MVP scope creep: no auth, billing, rate limiting, multi-tenant isolation, or SaaS infrastructure unless an accepted spec explicitly requires it.
11. User-facing copy is compact, concrete, non-judgmental, and oriented toward the next useful action.
12. No raw user message, raw task title, or raw task description is persisted in long-term behavioral memory.

### Mandatory Rejection Conditions

A reviewer must reject or reopen work in this mission if any of these are true:

- The change can pass local tests while still encouraging list management instead of task execution.
- The assistant accepts the user's first input as correct when the spec requires challenge, clarification, or safe failure.
- The change increases verbosity, ceremony, or planning overhead without improving action clarity or prioritization.
- The change optimizes low-value tasks, cosmetic organization, or generic reminders while ignoring meaningful progress.
- The change presents weak inference as certainty or invents goals, constraints, priorities, or behavioral patterns.
- The change stores raw user/task content in behavioral memory or logs where the mission only allows derived signals.
- The change introduces auth, billing, rate limiting, multi-tenant isolation, or platform-scale infrastructure not accepted by spec.
- The reviewer cannot trace the change from Product Vision -> spec/plan/task -> code/docs -> test evidence.

### Claim Boundary

When this mission is marked done, the claim is not merely that its files changed or tests passed. The claim is that this mission now contributes its defined role to the complete behavioral support system. The stronger statement, "after running 001 through 009 the product exactly matches the vision", is only valid when every mission enforces this contract, every WP has review evidence, and a final mission review confirms spec-to-code-to-test-to-product-vision fidelity across the whole chain.

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
**Dependencies**: WP01, WP02, WP03, WP04, WP05, WP06
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
