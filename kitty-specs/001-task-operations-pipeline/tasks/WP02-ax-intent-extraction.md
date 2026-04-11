---
work_package_id: WP02
title: AX Setup & Intent Extraction
dependencies: []
base_branch: master
base_commit: 3e20ce79dbdc55b31b87b5b6a086204d766a45ef
created_at: '2026-03-10T14:44:32.241030+00:00'
subtasks: [T009, T010, T011, T012]
authoritative_surface: src/
execution_mode: code_change
mission_id: 01KNT55PMWQ9GQH7JH6E61VDZD
owned_files:
- src/**
wp_code: WP02
---

# WP02 — AX Setup & Intent Extraction

## Objective

Integrate the AX library (`@ax-llm/ax`) with the Google Gemini provider to replace the legacy `gemini.converse()` approach for task intent extraction. AX must produce structured, typed intent objects from natural-language Telegram messages, supporting multi-action output.

## Implementation Command

```bash
spec-kitty implement WP02
```

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This feature protects the task-writing path so the assistant can turn natural language into clean TickTick actions without leaking context, inflating titles, adding unnecessary commentary, or creating task clutter that makes execution harder.

**Implementation must**:
- Keep task creation and mutation cognitively light: short confirmations, no analysis unless needed, and no extra decision burden for clear requests.
- Prefer correctness over confidence: ambiguous task intent, project choice, recurrence, or mutation target must clarify or fail closed instead of guessing.
- Preserve the single structured path AX intent -> normalizer -> TickTick adapter so future behavioral features can reason about actions consistently.

**Implementation must not**:
- The implementation restores prompt-only task execution, bypasses the adapter, or lets model prose decide writes directly.
- The implementation creates verbose coaching around straightforward task writes.
- The implementation makes more tasks when one correct task or one clarification would better support execution.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission is the safe execution foundation. It turns Telegram language into reliable TickTick task writes through the accepted path: AX intent -> normalizer -> ticktick-adapter. Its value is not task storage by itself; its value is reducing friction without creating clutter, wrong tasks, inflated tasks, or silent data loss. It must keep clear task capture terse and dependable so later behavioral guidance can rely on accurate task state.

### Required Implementer Evidence

The implementer must leave enough evidence for review to answer all of the following without guessing:

1. Which Product Vision clause or behavioral scope section does this WP serve?
2. Which FR, NFR, plan step, task entry, or acceptance criterion does the implementation satisfy?
3. What user-visible behavior changes because of this WP?
4. How does the change reduce procrastination, improve task clarity, improve prioritization, improve recovery/trust, or improve behavioral awareness?
5. What does the implementation deliberately avoid so it does not become a passive task manager, generic reminder app, over-planning assistant, busywork optimizer, or judgmental boss?
6. What automated tests, regression checks, manual transcripts, or static inspections prove the intended behavior?
7. Which later mission or WP depends on this behavior, and what drift would it create downstream if implemented incorrectly?

### Required Reviewer Checks

The reviewer must reject the WP unless all of the following are true:

- The behavior is traceable from Product Vision -> mission spec -> plan/tasks -> WP instructions -> implementation evidence.
- The change preserves the accepted architecture and does not bypass canonical paths defined by earlier missions.
- The user-facing result is concise, concrete, and action-oriented unless the spec explicitly requires reflection or clarification.
- Ambiguity, low confidence, and missing context are handled honestly rather than hidden behind confident output.
- The change does not add MVP-forbidden platform scope such as auth, billing, rate limiting, or multi-tenant isolation.
- Tests or equivalent evidence cover the behavioral contract, not just the happy-path technical operation.
- Any completed-WP edits preserve Spec Kitty frontmatter and event-sourced status history; changed behavior is documented rather than silently rewritten.

### Drift Rejection Triggers

Reject, reopen, or move work back to planned if this WP enables any of the following:

- The assistant helps the user organize more without helping them execute what matters.
- The assistant chooses or mutates tasks confidently when it should clarify, fail closed, or mark inference as weak.
- The assistant rewards low-value busywork, cosmetic cleanup, or motion-as-progress.
- The assistant becomes verbose, punitive, generic, or motivational in a way the Product Vision explicitly rejects.
- The implementation stores raw user/task content where only derived behavioral metadata is allowed.
- The change creates a second implementation path that future agents could use instead of the accepted pipeline.
- The reviewer cannot state why this WP is necessary for the final 001-009 product.

### Done-State And Future Rework Note

If this WP is already marked done, this contract does not rewrite Spec Kitty history. It governs future audits, reopened work, bug fixes, and final mission review. If any later change alters the behavior described here, the WP may be moved back to planned or reopened so the implement-review loop can re-establish product-vision fidelity.

## Context

**Current state**: `services/gemini.js` uses `@google/generative-ai` directly with `converseSchema` for structured output. This works but couples prompt engineering, schema enforcement, and API calls tightly.

**AX advantage**: AX provides typed signatures, automatic structured extraction, built-in retry, and provider abstraction. The `apiKey` callback pattern supports dynamic key rotation.

**Key decision (from plan.md)**: AX must integrate with the existing key rotation logic from `GeminiAnalyzer` — specifically the `_keys` array, `_markActiveKeyUnavailable`, and `_rotateToNextKeyIfAvailable` mechanisms.

**Key files**:
- `services/gemini.js` — existing key rotation logic (lines 201-478)
- `services/schemas.js` — existing `converseSchema` (reference for field design)

---

## Subtask T009: Add @ax-llm/ax Dependency

**Purpose**: Install AX and verify it works in the project's Node.js/ESM environment.

**Steps**:
1. Run `npm install @ax-llm/ax`
2. Verify package installs correctly (no peer dependency conflicts)
3. Verify ESM import works: `import { AxAI, AxSignature } from '@ax-llm/ax'`
4. Check `package.json` has the dependency listed

**Files**:
- `package.json` (modified)
- `package-lock.json` (modified)

**Validation**:
- [ ] `@ax-llm/ax` appears in package.json dependencies
- [ ] Import statement resolves without error in ESM context

---

## Subtask T010: Create AX Intent Module with Gemini Provider

**Purpose**: Create `services/ax-intent.js` that initialises AX with the Gemini provider and delegates API key management to the existing rotation logic.

**Steps**:
1. Create `services/ax-intent.js`
2. Import `AxAI` from `@ax-llm/ax`
3. Create factory function `createAxIntent(keyManager)`:
   - `keyManager` is an object with `{ getActiveKey(), markKeyUnavailable(reason), rotateKey() }`
   - Initialise `AxAI` with Gemini provider:
     ```javascript
     const ai = new AxAI({
       name: 'google-gemini',
       apiKey: () => keyManager.getActiveKey(),
       config: { model: 'gemini-2.0-flash' }
     });
     ```
4. Export the factory function
5. Create a thin `KeyManager` adapter class that wraps `GeminiAnalyzer`'s key rotation methods into the simpler interface above (or accept callbacks)

**Key design**: The `apiKey` callback is called per-request by AX, allowing seamless key rotation without reinitialising AX.

**Files**:
- `services/ax-intent.js` (new, ~60 lines)

**Edge Cases**:
- All keys exhausted: `getActiveKey()` should throw with a clear "quota exhausted" error
- AX retries internally — on final failure, the error bubbles to our handler (T012)

**Validation**:
- [ ] AX initialises without error
- [ ] `apiKey` callback is invoked per-request
- [ ] Different keys can be returned on successive calls

---

## Subtask T011: Define AX Signature for Intent Extraction

**Purpose**: Define the typed AX signature that instructs Gemini to extract structured intent actions from user messages.

**Steps**:
1. In `services/ax-intent.js`, define the intent extraction signature
2. The signature must produce an output matching the `Intent Action` entity from the spec:
   ```
   Input:  userMessage (string), currentDate (string), availableProjects (string[])
   Output: Array of IntentAction objects:
     - type: "create" | "update" | "complete" | "delete"
     - title: string
     - content: string (optional)
     - priority: number (0,1,3,5) (optional)
     - projectHint: string (optional)
     - dueDate: string (optional)
     - repeatHint: string (optional — e.g., "daily", "weekdays", "every tuesday")
     - splitStrategy: "single" | "multi-task" | "multi-day" (optional)
     - confidence: number (0.0-1.0)
   ```
3. Add signature instructions:
   - Extract one action per distinct user intent
   - Use `multi-task` splitStrategy when multiple independent tasks detected
   - Use `multi-day` splitStrategy when distinct days are named (not recurrence)
   - Set `repeatHint` when the user expresses a repeating pattern
   - Keep titles short, verb-first, without dates or project names
   - Set confidence low when intent is ambiguous
4. Add `extractIntents(userMessage, { currentDate, projects })` function that calls AX with the signature

**Files**:
- `services/ax-intent.js` (~80 lines added)

**Validation**:
- [ ] "Book dentist Thursday" → `[{ type: "create", title: "Book dentist", dueDate: "Thursday", confidence: 0.9+ }]`
- [ ] "book flight, pack bag, call uber friday" → 3 separate actions
- [ ] "practice DSA every weekday" → `[{ type: "create", title: "Practice DSA", repeatHint: "weekdays" }]`
- [ ] "hello" → empty actions array or low confidence

---

## Subtask T012: Quota-Exhaustion Error Handler

**Purpose**: When AX throws after exhausting its built-in retries (due to Gemini quota limits), catch the error, mark the active key as unavailable, rotate to the next key, and optionally retry once.

**Steps**:
1. Wrap `extractIntents` call in error handling:
   ```javascript
   try {
     return await ax.generate(signature, input);
   } catch (err) {
     if (isDailyQuotaError(err)) {
       keyManager.markKeyUnavailable('quota');
       const rotated = keyManager.rotateKey();
       if (rotated) {
         // Retry once with new key
         return await ax.generate(signature, input);
       }
       throw new QuotaExhaustedError('All API keys exhausted');
     }
     throw err;
   }
   ```
2. Reuse `_isDailyQuotaError` detection logic from `gemini.js` (check for 429, RESOURCE_EXHAUSTED)
3. Create `QuotaExhaustedError` custom error class for upstream handling

**Files**:
- `services/ax-intent.js` (~30 lines added)

**Edge Cases**:
- Non-quota errors (network, invalid API key): re-throw without rotation
- Already on last key: throw `QuotaExhaustedError` immediately
- AX internal retries may have already attempted the call multiple times

**Validation**:
- [ ] Quota error triggers key rotation
- [ ] Retry succeeds with rotated key
- [ ] QuotaExhaustedError thrown when all keys spent
- [ ] Non-quota errors pass through unchanged

---

## Definition of Done

- [ ] `@ax-llm/ax` installed and importable
- [ ] `services/ax-intent.js` exports `createAxIntent(keyManager)` and `extractIntents(message, options)`
- [ ] AX signature matches Intent Action spec: `type`, `title`, `content`, `priority`, `projectHint`, `dueDate`, `repeatHint`, `splitStrategy`, `confidence`
- [ ] Multi-action extraction works (single message → multiple intents)
- [ ] Key rotation integrates seamlessly with existing `GeminiAnalyzer` infrastructure
- [ ] Quota exhaustion triggers rotation, not a crash

## Risks

- **AX Gemini provider**: Verify `apiKey` callback pattern is supported (confirmed in AX docs)
- **Signature quality**: The output quality depends heavily on the signature prompt — may need iteration
- **Model compatibility**: Ensure `gemini-2.0-flash` works with AX's provider implementation

## Reviewer Guidance

- Check that the AX signature produces well-structured output for the acceptance scenarios in spec.md
- Verify key rotation doesn't leak keys or create race conditions
- Ensure the signature instructions clearly distinguish recurrence vs multi-day

## Activity Log

- 2026-03-10T14:44:39Z – Gemini – shell_pid=9964 – lane=doing – Assigned agent via workflow command
- 2026-03-10T15:04:24Z – Gemini – shell_pid=9964 – lane=for_review – Moved to for_review
- 2026-03-10T15:05:05Z – Gemini – shell_pid=20752 – lane=doing – Started review via workflow command
- 2026-03-10T15:06:15Z – Gemini – shell_pid=20752 – lane=done – Review passed: AX integration with Gemini provider and key rotation implemented correctly. Signature matches spec.

---

## Review Comments (Added 2026-04-11)

### Status: Done
### Alignment with Product Vision: Aligned

#### What This WP Was Supposed to Deliver:
AX library integration replacing legacy gemini.converse() for structured intent extraction. Key rotation, multi-action extraction, quota exhaustion handling, and typed signature matching Intent Action spec.

#### What's Actually Done:
Marked done. AX installed, services/ax-intent.js created with Gemini provider, key rotation integrated, signature defined, quota handler implemented. Review passed without issues.

#### Gaps Found:
- No gaps detected in the WP itself. The WP is well-scoped and cleanly executed.
- The duplicate subtask ID issue (T012 used in both WP02 and WP03) was flagged in WP01 review as a spec-level issue.

#### Product Vision Alignment Issues:
- Strongly aligned. Structured intent extraction is foundational for "correctness matters more than confidence" — AX's confidence scoring and structured output prevent the system from pretending certainty.
- Multi-action extraction supports the Product Vision's need to handle "motivated but scattered" users.

#### Recommendations:
- No action needed. WP02 is well-scoped, well-executed, and cleanly reviewed.

#### Closure Added 2026-04-11:
- The duplicate subtask ID noted in the review comments has been corrected in `tasks.md`: WP02 retains `T012` for quota exhaustion, and WP03 now uses `T013` through `T016`.
