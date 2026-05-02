# TickTick AI Coach — Comprehensive Audit & Engineering Handoff

## Context

This document is a working audit of the TickTick AI Coach system: a Telegram bot that sits on top of TickTick and uses an LLM to interpret user intent, review tasks, and trigger backend actions.

The purpose of this handoff is not cosmetic refinement. It is to help an engineer or agent:
- reproduce the current behavior,
- understand where the system is inconsistent,
- verify the backend against the UI,
- repair the architecture so the user experience becomes trustworthy.

This document is intentionally written as a debug-and-correction blueprint.

---

## 1) What the system is trying to do

The intended product model appears to be:

1. TickTick remains the source of truth for tasks.
2. A Telegram bot acts as the user interface and command surface.
3. An LLM interprets the user's message or command.
4. The backend resolves the intent, ranks or previews tasks, and optionally applies changes to TickTick.
5. The user sees a clean, reassuring experience, with minimal exposure to internal failures.

That model is reasonable. The current problem is not the ambition. The problem is that the system currently mixes:
- source-of-truth state,
- local preview state,
- cached state,
- model fallback state,
- and user-facing state

in ways that are not always clearly separated.

The result is that the user can be shown messages that are technically plausible but not always fully truthful about what happened.

---

## 2) Key verified findings

### 2.1 TickTick remains connected and active
The logs show the backend is connected to TickTick and repeatedly listing active tasks successfully. The system is not dead; it is operating. The service startup logs also show the scheduler is running and task polling is active. fileciteturn0file0

### 2.2 The backend is doing robustness work
The logs show:
- model retries,
- fallback from one Gemini model to another,
- lock-based protection during active operations,
- validation of malformed model output,
- and repeated refreshes of active tasks.

That is a sign of real engineering effort, not a broken prototype. fileciteturn0file0

### 2.3 The local review state and TickTick state can diverge
The screenshots show the bot saying “No tasks pending review” at some moments, and later showing tasks awaiting review. The status screen also shows cases where the local workflow is at zero while TickTick still has active tasks.

This is the main user trust issue:
the UI can suggest the system is done or empty when the backend still has work, or vice versa.

### 2.4 Preview / dry-run behavior is not always visually distinct
Several responses look like task handling has happened, while the logs indicate the operation was still dry-run or preview-only. That means the user can be left uncertain whether TickTick was actually updated.

### 2.5 Inbox resolution is not stable
The logs show the backend explicitly saying Inbox was not found, then falling back to the first available project, “⏱️Routines & Tracking”. That is not a harmless detail; it is a product-level routing decision. If Inbox is expected, the system should either resolve it reliably or fail loudly before applying anything.

---

## 3) Issues by category

## 3.1 Architecture issues

### A. No clean separation between source of truth and working state
The backend appears to be juggling:
- TickTick active tasks,
- local reviewed / pending state,
- deferred queue state,
- preview state,
- and cached summaries.

Those should not bleed into one another.

#### Required architecture
Create a strict state model:

- `source_of_truth`: TickTick
- `working_cache`: local session cache
- `review_queue`: items awaiting user choice
- `operation_state`: idle / scanning / reviewing / applying / blocked / failed
- `delivery_state`: what the user has last been shown

Each state must have a separate owner and separate lifecycle.

#### Accepted supersession note
The implementation later accepted a narrower trust model instead of a literal global state machine: per-operation `OperationReceipt` statuses/scopes plus the durable command sync snapshot. Treat the above as the original audit target, but reconcile it against the shipped architecture in `docs/ARCHITECTURE.md` and the code path that records `lastTickTickSyncAt`, `lastTickTickActiveCount`, `lastSyncSource`, and `stateVersion`.

---

### B. No explicit state machine visible in the product model
The behavior suggests an implicit state machine exists, but it is not modeled strongly enough.

#### Required state machine
```text
IDLE
SCANNING
PREVIEWING
AWAITING_USER_REVIEW
APPLYING
SYNCING
BLOCKED
RETRYING
DEGRADED
ERROR
```

Every UI message and backend response should map to one of these states.

---

### C. Routing fallback is too silent
If Inbox cannot be found, the system should not quietly choose a different project and proceed as if this were routine.

#### Required behavior
- resolve Inbox explicitly,
- if missing, mark the operation as needing confirmation,
- do not auto-route unless user policy explicitly allows fallback routing,
- log the fallback decision with a trace ID,
- show the user a visible routing decision before write.

---

### D. Concurrency handling exists, but is not exposed as a product state
The logs show the system skips polling when an intake lock is already held. That is correct engineering. But the user still needs to know that the system is busy and why a command is not immediately producing a new review item.

#### Required behavior
- one active scan/poll/write operation at a time,
- persistent “busy” indicator,
- last activity timestamp,
- no duplicate task processing while locked.

---

### E. Validation failures are handled internally but not strongly surfaced as recovery states
The backend validates model output and falls back to clarification when the model emits invalid structure. That is the right place for engineering enforcement. The user should not see raw parser messages, but they should not be told that a write happened when the system only recovered into clarification.

#### Required behavior
- catch malformed model output internally,
- log the bug,
- recover into a neutral user-facing clarification state,
- never imply write success if none occurred.

---

## 3.2 Backend issues

### A. Inbox resolution must be verified, not assumed
This is a real backend defect or at least a serious integration gap.

#### Why this matters
- TickTick may expose Inbox differently than expected.
- The adapter may be reading the wrong workspace, account, or project list.
- A hardcoded fallback can hide a genuine integration failure.
- Silent rerouting is dangerous because it changes task placement without a user decision.

#### Required checks
- fetch projects from TickTick on startup,
- identify the true Inbox project by API metadata, not string matching alone,
- cache the resolved project ID,
- invalidate the cache when the account changes,
- test behavior when Inbox is missing, renamed, or duplicated.

---

### B. Dry-run and apply modes need stronger separation
The system often appears to preview tasks, rank them, or show “review” output. That is fine. What must be guaranteed is that the user can tell whether the system is only previewing or has actually written changes to TickTick.

#### Required checks
- every response must declare one of:
  - preview only,
  - applied,
  - blocked,
  - failed,
  - waiting for user confirmation
- never reuse “reviewed” language if no write occurred unless the meaning is formally defined.

---

### C. State reconciliation needs a canonical refresh point
When `/pending`, `/scan`, `/status`, and the poller all operate independently, the UI can become contradictory.

#### Required checks
- one canonical refresh routine,
- one state version number,
- one last-sync timestamp,
- clear cache invalidation rules,
- clear distinction between local queue and TickTick live state.

---

### D. Model fallback is fine, but must be invisible only when the outcome remains stable
The logs show a fallback from one model to another when a 503 occurs. That is acceptable. But the user-facing system should still preserve honest state:
- if fallback produces the same output class, fine,
- if fallback changes confidence or routing, the user should see a neutral state change,
- if fallback leads to a degraded path, the bot should not pretend nothing happened internally.

---

### E. Operation telemetry exists, but should be structured more consistently
There is good logging already, but it should be standardized into a predictable schema.

#### Required telemetry fields
- `trace_id`
- `user_id`
- `command`
- `entry_point`
- `operation_type`
- `state_before`
- `state_after`
- `source_of_truth_count`
- `local_queue_count`
- `dry_run`
- `applied`
- `fallback_used`

Accepted implementation note: terminal operation telemetry is now emitted at the pipeline boundary with receipt-shaped, privacy-safe metadata rather than a global delivery-state machine. Keep the privacy rules above; the modern boundary is the per-operation receipt plus sync snapshot.
- `project_resolution`
- `error_class`
- `latency_ms`

---

## 3.3 Front-end / Telegram UI issues

### A. The UI overuses dense cards and stacked status blocks
The screens show long, text-heavy cards with many repeated states. That makes scanning harder than it needs to be.

#### Required fix
Reduce each card to:
- title,
- current state,
- one-sentence reason,
- one clear next action.

---

### B. The action vocabulary is inconsistent
Different review cards use different labels:
- Apply / Refine / Skip / Delete / Stop
- Complete / Keep / Delete / Stop

That makes the system feel stitched together.

#### Required fix
Standardize action labels and keep them consistent across the entire product.

Suggested:
- `Apply`
- `Edit`
- `Skip`
- `Delete`
- `Stop`

If `Complete` means something different from `Apply`, then it needs a formal definition and should not be used interchangeably.

---

### C. “No tasks” language is too absolute
The UI sometimes says:
- “No tasks to review.”
- “No tasks pending review.”

Yet the backend later shows active tasks and additional review candidates. That wording can be interpreted as final, when it is only true for a narrow slice of state.

#### Required fix
Use scoped wording:
- “No local review items right now.”
- “No pending items in the current queue.”
- “TickTick still has active tasks.”
- “Last sync found X candidates.”

---

### D. Internal diagnostic data leaks into user-facing status
Items like cache age, Gemini key index, and debugging-style status strings are useful to the engineer, but not to the normal user.

#### Required fix
Split into:
- user status view,
- debug view.

Keep user view clean and reassuring.

---

### E. Briefing copy is too long and too argumentative
The morning briefing gives reasons for each priority, but it does so at the cost of clarity. It can feel like the system is trying to justify itself instead of helping the user act.

#### Required fix
Use a simpler structure:
- Focus
- Top 3 priorities
- Why they matter
- First action

---

## 3.4 UX issues

### A. The system does not consistently tell the user what state they are in
The user should always know whether they are:
- viewing a preview,
- approving a change,
- waiting on a scan,
- waiting on sync,
- or seeing the latest backend snapshot.

Right now, the flow often forces the user to infer this.

---

### B. The same command can feel like it has multiple meanings
For example:
- `/scan` can mean “analyze,” “preview,” “refresh,” or “process.”
- `/pending` can mean “local review queue,” “unreviewed tasks,” or “nothing pending.”

That is too ambiguous for a trust-sensitive task system.

#### Required fix
Define the commands precisely:
- `/scan` = fetch and rank candidates
- `/pending` = show local review queue only
- `/status` = show live sync state and backlog
- `/briefing` = show user-facing prioritization summary

---

### C. The product is missing explicit confirmation boundaries
For any action that writes to TickTick:
- show the exact task,
- show the exact project,
- show the exact outcome,
- ask for confirmation if routing is non-obvious.

---

### D. There is no clear “nothing changed” vs “changed” separation
This is one of the most important UX fixes.

#### Required states
- `Preview only — nothing changed`
- `Applied to TickTick`
- `Waiting for confirmation`
- `Blocked by system state`
- `Retrying after temporary issue`

---

## 3.5 Better UI direction without over-engineering

The goal is not to build a heavy dashboard. The goal is to make the Telegram experience feel calm, clear, and trustworthy with very little visual noise.

### A. Use a simple information hierarchy
Each message card should answer, in this order:
1. What is this?
2. What changed?
3. What should I do next?

Do not stack too many reasons, diagnostics, or internal labels in the same card.

#### Preferred pattern
- one short title,
- one short status line,
- one short explanation,
- one primary action row.

Example structure:
- **Task preview**
- `Preview only — nothing changed yet`
- `This is ready to apply to TickTick.`
- `[Apply] [Edit] [Skip]`

---

### B. Keep the main screen minimal and scannable
The current UI has too many competing elements. A better direction is:
- fewer emojis,
- fewer long paragraphs,
- fewer repeated status messages,
- more whitespace between logical blocks,
- clearer separation between command output and task cards.

The user should be able to understand the state in one glance.

---

### C. Use progressive disclosure
Do not show everything at once.

#### Show first
- current state,
- top item,
- primary action.

#### Hide behind expansion or debug mode
- cache age,
- Gemini key index,
- deep telemetry,
- ranking rationale details,
- internal fallback information.

This keeps the normal UX clean while still preserving debugging capability.

---

### D. Make state labels visually distinct
Use consistent labels and let them do the work.

Recommended labels:
- `Preview only`
- `Applied`
- `Waiting for confirmation`
- `Blocked`
- `Syncing`
- `Degraded`

These labels should appear in the same place on every card so the user learns the system quickly.

---

### E. Design for confidence, not excitement
This product should not feel playful or busy. It should feel calm and dependable.

That means:
- use plain language,
- avoid decorative emoji overload,
- avoid long self-justifying copy,
- avoid mixed metaphors across screens,
- keep buttons predictable,
- keep the tone direct.

The user should feel that the bot is a reliable assistant, not a noisy experiment.

---

### F. Prefer short action loops
The best interaction pattern here is:
1. bot shows one clear candidate,
2. user decides,
3. bot confirms exactly what happened,
4. bot moves to the next item.

Do not bundle too many candidates or too much commentary into one screen unless the user explicitly asks for a batch view.

---

### G. Make the status screen a diagnostic summary, not a dump
The status view should answer:
- Is TickTick connected?
- Is the local queue healthy?
- Is a job running?
- Is anything blocked?
- When was the last sync?

It should not try to be a log console.

---

### H. Use restraint in branding and decoration
The product already has enough personality in the task content and prompts. The UI does not need extra visual noise.

A better direction is:
- consistent card shapes,
- stable spacing,
- restrained icons,
- limited emoji use,
- short headers,
- strong text hierarchy.

This will make the bot feel more mature without adding complexity.

---

### I. Make “what happens next” obvious
Every user-visible state should end with one of these:
- “Apply now”
- “Edit before applying”
- “Nothing changed”
- “Waiting for sync”
- “Try again”

If the user has to guess the next step, the design is too vague.

---

### J. Avoid over-engineering the interface
Do not turn this into a dashboard product with endless toggles and panels.

The current system is a Telegram-native assistant. The right direction is not more UI surface area. It is:
- better message shaping,
- cleaner state naming,
- stronger confirmation moments,
- fewer ambiguous outputs,
- and one reliable path through the flow.

The product should feel simple because it is controlled, not because it is underbuilt.
## 3.5 Trust issues

### A. The system sounds more certain than it is
Even when the backend is using fallback logic or preview-only analysis, the surface can still sound decisive.

#### Fix
Tie every major response to a state label.

Example:
- “Preview ready.”
- “Applied.”
- “Waiting for sync.”
- “Blocked.”
- “Needs confirmation.”

---

### B. Silent rerouting is a trust hazard
If Inbox is missing and the system routes elsewhere, the user should be informed before any write happens.

---

### C. Contradictory states break confidence
If the user sees both “No tasks pending review” and “2 tasks awaiting your review” in the same session without a clear sync explanation, the system feels unreliable even if the backend is functioning correctly.

---

## 4) What the agent should test

The agent should not just read code. It should actively reproduce behavior and verify system boundaries.

### Test 1: Inbox resolution
- Start with a connected account.
- Confirm whether Inbox exists in the TickTick project list.
- Force the adapter to resolve Inbox.
- Verify whether it finds the correct project ID.
- If Inbox is missing, confirm whether that is due to API, cache, account mismatch, or parsing.

### Test 2: Fallback routing
- Remove or hide Inbox temporarily.
- Run a task-create flow.
- Verify whether the system silently falls back.
- Confirm whether the user is shown the fallback decision.

### Test 3: Scan vs pending semantics
- Run `/scan`.
- Run `/pending`.
- Run `/status`.
- Compare local queue, backend active tasks, and displayed counts.
- Confirm that the outputs are not contradictory.

### Test 4: Dry-run clarity
- Force preview-only task review.
- Confirm that the UI states it is preview-only.
- Ensure the UI never implies a write occurred.

### Test 5: Lock behavior
- Start a scan.
- Immediately issue another scan or pending command.
- Verify the lock blocks or queues the operation cleanly.
- Ensure the user sees a stable busy message.

### Test 6: Model fallback
- Trigger a model 503 or mock an unavailable response.
- Verify fallback occurs.
- Confirm the user does not see raw internal failure text.
- Verify the final state is still honest.

### Test 7: Malformed output recovery
- Force invalid structured model output.
- Verify validation catches it.
- Confirm it falls back into clarification or safe recovery.
- Ensure no partial write is shown as success.

---

## 5) Required implementation principles

### Principle 1: Truthfulness over optimism
The user can be reassured, but the UI must still be truthful about what state the system is in.

### Principle 2: One visible state at a time
Do not make the user infer whether the system is previewing, applying, locked, or syncing.

### Principle 3: No silent routing for important writes
If the destination project changes, show it.

### Principle 4: Strong separation of concerns
Do not let debug data leak into normal user flows.

### Principle 5: Canonical state ownership
TickTick is the source of truth.
The local layer is cache and orchestration only.

---

## 6) Concrete acceptance criteria

The agent should consider the system corrected only if all of the following are true:

1. Inbox resolution is deterministic and verified.
2. Fallback project routing is never silent for writes.
3. `/scan`, `/pending`, and `/status` cannot contradict one another without an explicit sync explanation.
4. Preview-only actions are never presented as applied actions.
5. Busy / lock states are visible and stable.
6. Malformed model output is handled internally without leaking raw diagnostics to the user.
7. The UI uses consistent action vocabulary.
8. User-facing statuses are short, clear, and scoped.
9. Debug information is separated from normal UX.
10. The backend state machine is explicit and testable.

---

## 7) Final guidance for the agent

Do not treat this as a styling pass.

This is a system correctness pass.

The work is to make the product:
- deterministic,
- traceable,
- state-consistent,
- and trustworthy.

If the system cannot clearly show what is happening, then even a technically successful backend is not enough.

The user must be able to tell:
- what the bot did,
- what it did not do,
- what it is waiting on,
- and where the task actually lives.

That is the standard this system needs to meet.
