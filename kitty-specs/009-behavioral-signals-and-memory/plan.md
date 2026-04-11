# Implementation Plan: Behavioral Signals and Memory

**Spec**: 009-behavioral-signals-and-memory  
**Branch**: `009-behavioral-signals-and-memory`  
**Mission**: software-dev  
**Created**: 2026-03-10  

---

## Technical Context

### What Exists

| Component | Location | Relevance |
|-----------|----------|-----------|
| TickTickAdapter | `services/ticktick-adapter.js` | Performs task mutations (create, update, complete, postpone, delete). This is the event source. |
| Pipeline | `services/pipeline.js` | Orchestrates AX intent → normalizer → adapter. All task changes flow through here. |
| Store | `services/store.js` | Redis-backed state store with file fallback. Already uses `ioredis` with tenant-scoped keys (`user:{userId}:...`). |
| Scheduler | `services/scheduler.js` | Runs daily briefing and weekly digest. These are the summary surfaces that will consume behavioral patterns. |
| Bot commands | `bot/commands.js`, `bot/callbacks.js` | Telegram handlers. Will need new commands for inspect/reset behavioral memory. |
| Redis | `ioredis` in `package.json`, `REDIS_URL` env var | Already wired for cloud persistence. Will reuse the same connection. |

### What Needs to Be Built

| Component | Purpose | New File(s) |
|-----------|---------|-------------|
| Signal Classifier | Rule-based classifier that listens to task mutation events and emits behavioral signals | `services/behavioral/signal-classifier.js` |
| Redis Storage Layer | Dedicated Redis namespace for behavioral signals with 30-day TTL | `services/behavioral/behavioral-store.js` |
| Pattern Detection Engine | Evaluates stored signals against the top 7 behavioral patterns | `services/behavioral/pattern-engine.js` |
| Privacy Tier Manager | Controls signal collection per user (default/opt-in/skip) | `services/behavioral/privacy-manager.js` |
| Summary Surface Integration | Injects detected patterns into daily/weekly summaries | `services/summary-surfaces/behavioral-insights.js` |
| User Controls | Telegram commands for inspect and reset | `bot/behavioral-commands.js` |

---

## Design Decisions

### 1. Signal Generation Mechanism

**Decision**: Rule-based classifier hooked into the adapter's mutation layer, not the bot's message layer.

**Rationale**:
- The adapter already knows *what* changed (create, update, complete, postpone, delete) and has the before/after task state.
- Rule-based classification avoids LLM cost and latency for every mutation.
- Signals are derived from *behavior* (how tasks change), not from *content* (what tasks say). This respects the privacy constraint of not storing raw task titles or messages.

**Signal Schema** (stored, not raw text):
```
{
  userId,
  signalType,          // e.g., "postpone", "scope_change", "decomposition"
  taskCategory,        // e.g., "work", "health", "life_admin" — never raw title
  timestamp,
  metadata: {          // minimal semantic metadata only (FR-004)
    editType,          // "wording_only" | "scope_change" | null
    decompositionDelta // tasks_added | tasks_removed | 0
  }
}
```

### 2. Storage Choice

**Decision**: Redis with 30-day TTL, tenant-scoped keys. Reuse the existing `ioredis` connection from `store.js`.

**Rationale**:
- Redis is already a project dependency and deployed on Render.
- TTL-based expiration matches the 30-day retention window (FR-005) without manual cleanup.
- Key pattern `user:{userId}:behavioral:signals` keeps data tenant-scoped (FR-012).
- The existing file-based fallback in `store.js` is NOT reused for behavioral data — behavioral signals are ephemeral by design and should simply degrade gracefully if Redis is unavailable (FR-009).

**Key Schema**:
```
user:{userId}:behavioral:signals        → JSON array (signals for current window)
user:{userId}:behavioral:patterns       → JSON object (detected patterns with confidence)
user:{userId}:behavioral:privacy_tier   → string ("default" | "sensitive" | "skip")
```

### 3. Privacy Approach

**Decision**: Three-tier model with non-sensitive as default.

| Tier | Behavior | What's Stored |
|------|----------|---------------|
| **default** (opt-out) | Collects non-sensitive signals only | Signal type, category, timestamp, minimal metadata |
| **sensitive** (opt-in) | Collects additional signals (e.g., time-of-day patterns) | Everything in default + timing patterns |
| **skip** | No collection | Nothing |

**Rationale**:
- Default collection preserves the product's passive value (FR-001).
- Opt-in for sensitive data respects user autonomy.
- Skip tier gives users a clean off-ramp (FR-011).
- No raw text is ever stored regardless of tier (FR-003).

### 4. Pattern Confidence Model

**Decision**: Dual-threshold approach — either 3 corroborating signals OR 1 high-confidence signal.

**Rationale**:
- 3 corroborating signals prevents false positives from single anomalous events.
- 1 high-confidence signal catches obvious patterns (e.g., 15+ tasks created in one day is unambiguous).
- Weak inferences (1-2 signals, low confidence) are computed internally but never surfaced in summaries (FR-007).

### 5. Non-Blocking Guarantee

**Decision**: The behavioral layer is a fire-and-forget side effect. If it fails, task mutations proceed normally.

**Rationale**:
- FR-009 explicitly requires the behavioral layer to be non-blocking.
- All signal emission is wrapped in try/catch with error logging but no rethrow.
- Summary surfaces check for pattern availability before referencing them — fail open, omit the callout.

---

## Implementation Phases

### Phase 1: Signal Classifier Core (WP01)

**Goal**: Hook into the adapter's mutation layer and emit structured behavioral signals for every task change.

**Sequencing rationale**: Everything else depends on signals existing. This is the foundation.

**Scope**:
- Create the signal classifier module
- Wire it into the TickTickAdapter's mutation methods
- Define the signal taxonomy (postpone, scope_change, decomposition, planning_heavy, etc.)
- Write unit tests for each rule

**Exit criteria**: Every task mutation emits a signal (or correctly emits nothing if the change is noise).

### Phase 2: Redis Storage Layer (WP02)

**Goal**: Persist signals in Redis with 30-day TTL and tenant-scoped keys.

**Sequencing rationale**: Signals need somewhere to live before patterns can be detected.

**Scope**:
- Create the behavioral store module
- Implement write path with TTL
- Implement read path with window filtering
- Implement prune/expire logic (belt-and-suspenders on top of Redis TTL)
- Write unit tests with mocked Redis

**Exit criteria**: Signals are stored with correct TTL, retrievable by user, and auto-expire after 30 days.

### Phase 3: Pattern Detection Engine (WP03)

**Goal**: Evaluate stored signals against the top 7 behavioral patterns and produce confidence-scored detections.

**Sequencing rationale**: Needs signals in storage (WP01 + WP02) before patterns can be evaluated.

**Scope**:
- Implement each of the 7 pattern detectors
- Implement the confidence model (3-signal threshold + high-confidence shortcut)
- Implement weak inference marking (computed but not surfaced)
- Write unit tests for each pattern with synthetic signal data

**Exit criteria**: Given known signal datasets, each pattern correctly fires or stays silent at the right confidence threshold.

### Phase 4: Privacy Tier Manager (WP04)

**Goal**: Control signal collection per user based on their privacy tier preference.

**Sequencing rationale**: Privacy controls gate both collection (WP01) and storage (WP02), but are simplest to implement after the core pipeline works.

**Scope**:
- Create the privacy manager module
- Implement tier check in the signal classifier's emission path
- Implement tier storage/retrieval in Redis
- Write unit tests for each tier's behavior

**Exit criteria**: Users in "skip" tier generate zero signals. Users in "sensitive" tier generate additional signals. Default tier works out of the box.

### Phase 5: Summary Surface Integration (WP05)

**Goal**: Inject detected behavioral patterns into daily and weekly summary generation.

**Sequencing rationale**: Needs patterns detected (WP03) and privacy checked (WP04) before summaries can reference them.

**Scope**:
- Create the behavioral insights module for summary surfaces
- Integrate with the daily briefing generator
- Integrate with the weekly digest generator
- Ensure observational language in all output (FR-008)
- Write integration tests for summary output

**Exit criteria**: Daily and weekly summaries include behavioral insights when confidence is sufficient, and omit them cleanly when it isn't.

### Phase 6: User Controls (WP06)

**Goal**: Telegram commands for inspecting and resetting behavioral memory.

**Sequencing rationale**: Needs the full pipeline (WP01–WP05) working so users have something meaningful to inspect and reset.

**Scope**:
- Create `/behavior` command for memory summary
- Create `/reset_behavior` command for clearing memory
- Implement plain-language output (no implementation internals exposed)
- Write integration tests for inspect and reset flows

**Exit criteria**: User can view a plain-language summary of retained behavioral memory and clear it with a single command.

### Phase 7: Testing & Privacy Audit (WP07)

**Goal**: End-to-end regression tests and a privacy audit to verify no raw text leaks into storage.

**Sequencing rationale**: Final gate before shipping. Needs all other phases complete.

**Scope**:
- Add regression tests to `tests/regression.test.js`
- Audit all storage paths to confirm no raw task titles or messages are stored
- Verify 30-day expiration behavior
- Verify non-blocking guarantee under failure conditions
- Document the privacy boundary for future maintainers

**Exit criteria**: All regression tests pass. Privacy audit confirms FR-002 through FR-004. Non-blocking behavior verified under simulated Redis failure.

---

## Testing Strategy

### Unit Tests

| Component | What to Test | Approach |
|-----------|-------------|----------|
| Signal Classifier | Each rule fires correctly; no signals for noise changes | Synthetic task mutation objects |
| Behavioral Store | Write, read, TTL, tenant isolation | Mocked ioredis client |
| Pattern Engine | Each pattern fires/stays silent with known datasets | Pre-built signal fixtures |
| Privacy Manager | Each tier's collection behavior | Mocked classifier + store |

### Integration Tests

| Flow | What to Verify |
|------|---------------|
| Mutation → Signal → Storage → Pattern → Summary | End-to-end signal flow with real Redis (test instance) |
| Daily briefing includes behavioral insight | Summary output contains pattern description in observational language |
| `/behavior` command returns plain-language summary | No implementation internals exposed |
| `/reset_behavior` clears all signals | Subsequent summaries omit behavioral content |

### Regression Tests

| Scenario | Expected Behavior |
|----------|------------------|
| Redis unavailable during mutation | Task mutation succeeds; signal silently dropped |
| Signals older than 30 days | Not included in pattern evaluation or summaries |
| Low-confidence pattern | Computed internally but omitted from summary output |
| User in "skip" tier | Zero signals generated, zero storage writes |
| Raw task title in signal metadata | **FAIL** — privacy audit catch |

### Privacy Audit Checklist

- [ ] No raw task titles in any Redis key or value
- [ ] No raw user messages in any stored data
- [ ] No free-form conversational archives retained
- [ ] Only enumerated minimal semantic metadata stored (FR-004)
- [ ] 30-day TTL enforced at Redis level AND application level
- [ ] Reset command clears all behavioral data for the user
- [ ] "Skip" tier produces zero writes

---

## Dependency Graph

```
WP01 (Signal Classifier) ──┬──→ WP02 (Redis Storage)
                            │
                            └──→ WP04 (Privacy Manager)
                                       │
WP02 ──────────────────────────────────┘
         │
         └──→ WP03 (Pattern Engine)
                    │
                    └──→ WP05 (Summary Integration)
                              │
WP04 ─────────────────────────┘
         │
         └──→ WP06 (User Controls)
                    │
WP05 ───────────────┘
         │
         └──→ WP07 (Testing & Audit)
```

**Parallel opportunities**:
- WP01 and WP04 can be developed in parallel (privacy manager only needs the signal schema, not the full classifier).
- WP05 and WP06 can be developed in parallel once WP03 and WP04 are done.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Signal classifier emits too many signals (noise) | Pattern engine produces false positives | Start conservative — only emit signals for unambiguous mutations |
| Redis TTL drift | Signals persist beyond 30 days | Dual defense: Redis TTL + application-level prune on read |
| Summary language feels judgmental | User trust erosion | All output uses observational language ("I noticed…") not diagnostic language ("You have a problem with…") |
| Privacy tier not checked before write | Sensitive data collected without consent | Privacy check is the first line in the signal emission path |
