---
work_package_id: WP02
title: AX Setup & Intent Extraction
lane: "doing"
dependencies: []
base_branch: master
base_commit: 3e20ce79dbdc55b31b87b5b6a086204d766a45ef
created_at: '2026-03-10T14:44:32.241030+00:00'
subtasks: [T009, T010, T011, T012]
shell_pid: "9964"
history:
- date: '2026-03-09'
  action: created
  by: spec-kitty.tasks
---

# WP02 — AX Setup & Intent Extraction

## Objective

Integrate the AX library (`@ax-llm/ax`) with the Google Gemini provider to replace the legacy `gemini.converse()` approach for task intent extraction. AX must produce structured, typed intent objects from natural-language Telegram messages, supporting multi-action output.

## Implementation Command

```bash
spec-kitty implement WP02
```

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
