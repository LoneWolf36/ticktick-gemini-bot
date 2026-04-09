---
work_package_id: WP06
title: Clarification UI Flow
dependencies: "[WP05]"
subtasks: [T061, T062, T063, T064]
---

# Work Package Prompt: WP06 — Clarification UI Flow

**Feature**: 002-natural-language-task-mutations
**Work Package**: WP06
**Title**: Clarification UI Flow
**Priority**: P1 — Critical Path (depends on WP05)
**Dependencies**: WP05 (Bot Message Handler) complete
**Parallelisable with**: None (blocks WP07)
**Estimated Lines**: ~1,050 lines
**Subtasks**: 4 (T061-T064, ~260 lines each)

---

## Objective

Implement the clarification UI flow that presents ambiguous task matches to users via inline keyboard, handles user selection via callback queries, and resumes the mutation flow with the selected task. This WP ensures users can disambiguate when multiple tasks match their query with a seamless, intuitive interface.

**Key Behaviors**:
1. Present clarification keyboard with up to 5 candidate tasks (inline buttons)
2. Handle mutation callback (`mutate:<taskId>`) with authorization and timeout checks
3. Resume mutation flow from Stage 3 (normalization) with selected task ID
4. Handle cancellation and timeout scenarios gracefully
5. Store pending mutations with 15-minute expiration
6. Clean up expired mutations automatically
7. Edit original message to show processing state
8. Acknowledge callbacks promptly to prevent loading spinner

**Design Principles**:
- **Clarity**: Button text shows task title, project, and due date with smart formatting
- **Brevity**: Titles truncated to 30 chars with ellipsis, projects to 15 chars
- **Safety**: 15-minute timeout prevents stale mutations, authorization required
- **Responsiveness**: Keyboard renders in < 1s, callback acknowledged in < 100ms
- **Idempotency**: Multiple clicks on same button handled gracefully
- **Observability**: All events logged (`clarification_presented`, `mutation_resumed`, `mutation_canceled`)

**User Experience Flow**:
```
User sends "done meeting" → Pipeline finds 3 matching tasks →
Bot presents clarification keyboard → User clicks "Meeting with team" →
Bot acknowledges callback → Resumes mutation → Shows confirmation "✅ Completed: Meeting with team"
```

**Clarification UI Example**:
```
🤔 Multiple tasks match "meeting"

Which one did you mean to complete?

✅ Meeting with team [Work] 📅 Today
✅ Meeting with client [Work] 📅 Tomorrow
✅ Team standup [Engineering] 📅 Mon
✅ Project kickoff [Work] 📅 Apr 15
✅ 1:1 with manager [Personal] 📅 Wed
❌ Cancel
```

---

## Implementation Steps

### T061: Create Clarification Keyboard Builder

**Purpose**: Build inline keyboard UI for presenting ambiguous task matches to users with complete metadata formatting, due date utilities, project integration, and Telegram API validation.

**Context**: When the task resolver finds multiple close matches (within 0.15 confidence margin), users need to select the correct task. The keyboard presents up to 5 candidates with rich metadata (title, project, due date) for quick disambiguation. This is the user-facing component of the clarification flow.

**Implementation Steps**:
1. Create `bot/clarification.js` module with keyboard builder and utilities
2. Implement `buildClarificationKeyboard()` with inline keyboard construction
3. Add `formatCandidateButton()` for button text formatting with truncation
4. Implement `formatDueDate()` utility for user-friendly date display
5. Add `sendClarification()` for sending clarification messages
6. Include Telegram API validation (button text length, callback data limits)
7. Add JSDoc type definitions for all functions and parameters
8. Implement smart ellipsis logic for truncation
9. Add metadata integration (project name, due date)
10. Create keyboard layout with cancel button on separate row

**Files to Create**:
- `bot/clarification.js` (NEW file, ~250 lines)

**Code Pattern**:
```javascript
// bot/clarification.js - NEW file

// ========== Constants ==========

const MAX_BUTTON_TEXT_LENGTH = 100; // Telegram limit for inline button text
const MAX_CALLBACK_DATA_LENGTH = 64; // Telegram limit for callback_data
const MAX_CANDIDATES_DISPLAY = 5; // Show top 5 matches (UX best practice)
const TITLE_MAX_LENGTH = 30;
const PROJECT_MAX_LENGTH = 15;
const MUTATION_VERBS = {
    complete: 'Complete',
    delete: 'Delete',
    update: 'Update',
};
const MUTATION_EMOJI = {
    complete: '✅',
    delete: '🗑️',
    update: '📝',
};

// ========== Type Definitions ==========

/**
 * @typedef {Object} TaskCandidate
 * @property {string} taskId - TickTick task ID
 * @property {string} title - Task title
 * @property {string|null} [projectName] - Project name if available
 * @property {string|null} [dueDate] - Due date in ISO format (YYYY-MM-DD) or 'someday'
 * @property {number} confidence - Match confidence score (0.0-1.0)
 */

/**
 * @typedef {'complete'|'delete'|'update'} MutationType
 * @description Type of mutation to perform
 */

/**
 * @typedef {Object} InlineKeyboardButton
 * @property {string} text - Button text
 * @property {string} callback_data - Callback data for button
 */

/**
 * @typedef {Object} InlineKeyboard
 * @property {Array<Array<InlineKeyboardButton>>} inline_keyboard - 2D array of buttons
 */

// ========== Public API ==========

/**
 * Build inline keyboard for presenting ambiguous task matches
 *
 * Keyboard format:
 * - Up to 5 candidate buttons (one per row)
 * - Cancel button on separate row at bottom
 * - Each button shows: emoji + title + [project] + 📅 date
 *
 * @param {TaskCandidate[]} candidates - Array of candidate tasks from resolver (sorted by confidence)
 * @param {MutationType} mutationType - Type of mutation (complete, delete, update)
 * @returns {InlineKeyboard} Telegram inline keyboard with candidate buttons
 *
 * @throws {Error} If candidates array is empty or null
 * @throws {Error} If mutationType is invalid
 *
 * @example
 * const candidates = [
 *   { taskId: 't1', title: 'Meeting A', projectName: 'Work', dueDate: '2026-04-01', confidence: 0.95 },
 *   { taskId: 't2', title: 'Meeting B', projectName: 'Personal', dueDate: '2026-04-02', confidence: 0.85 },
 * ];
 * const keyboard = buildClarificationKeyboard(candidates, 'complete');
 * await ctx.reply('Select a task:', { reply_markup: keyboard });
 */
export function buildClarificationKeyboard(candidates, mutationType) {
    // Validate inputs
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
        throw new Error('buildClarificationKeyboard requires a non-empty candidates array');
    }

    if (!MUTATION_VERBS[mutationType]) {
        throw new Error(`Invalid mutationType: ${mutationType}. Must be one of: ${Object.keys(MUTATION_VERBS).join(', ')}`);
    }

    const keyboard = {
        inline_keyboard: [],
    };

    // Limit to top 5 candidates (Telegram limit: 100 buttons per message, but 5 is UX best practice)
    const limitedCandidates = candidates.slice(0, MAX_CANDIDATES_DISPLAY);

    // Build button for each candidate (one per row)
    for (const candidate of limitedCandidates) {
        // Validate candidate structure
        if (!candidate.taskId || !candidate.title) {
            console.warn('[Clarification] Skipping invalid candidate:', candidate);
            continue;
        }

        const buttonText = formatCandidateButton(candidate, mutationType);

        // Validate button text length
        if (buttonText.length > MAX_BUTTON_TEXT_LENGTH) {
            console.warn('[Clarification] Button text exceeds limit, truncating:', buttonText.length);
        }

        // Validate callback data length (Telegram limit: 64 bytes)
        const callbackData = `mutate:${candidate.taskId}`;
        if (callbackData.length > MAX_CALLBACK_DATA_LENGTH) {
            console.error('[Clarification] Callback data too long for task:', candidate.taskId);
            // Fallback: use hash or shortened ID
            continue;
        }

        // Add button as single-item row (one button per row)
        keyboard.inline_keyboard.push([{
            text: buttonText,
            callback_data: callbackData,
        }]);
    }

    // Add cancel button on a new row for visual separation
    keyboard.inline_keyboard.push([{
        text: '❌ Cancel',
        callback_data: 'mutate:cancel',
    }]);

    return keyboard;
}

/**
 * Format candidate task into button text with metadata
 *
 * Button format: "Emoji Title [Project] 📅 Date"
 * Examples:
 *   - "✅ Buy groceries [Personal] 📅 Today"
 *   - "🗑️ Submit quarterly report [Work] 📅 Tomorrow"
 *   - "📝 Call mom 📅 Mon 15"
 *   - "✅ Very long task title that exceeds... [Project]"
 *
 * @param {TaskCandidate} candidate - Task candidate from resolver
 * @param {MutationType} mutationType - Type of mutation for emoji
 * @returns {string} Formatted button text (max ~40-60 chars for readability)
 *
 * @private
 */
function formatCandidateButton(candidate, mutationType) {
    const { title, projectName, dueDate } = candidate;

    // Add mutation emoji prefix
    const emoji = MUTATION_EMOJI[mutationType] || '•';

    // Truncate title to 30 chars with smart ellipsis
    const truncatedTitle = truncateWithEllipsis(title, TITLE_MAX_LENGTH);

    // Add project name in brackets (truncate to 15 chars)
    const projectNote = projectName && projectName.trim()
        ? ` [${truncateWithEllipsis(projectName, PROJECT_MAX_LENGTH)}]`
        : '';

    // Add due date emoji and formatted date (omit if someday or null)
    const dueNote = dueDate && dueDate !== 'someday'
        ? ` ${formatDueDate(dueDate)}`
        : '';

    // Combine parts
    const buttonText = `${emoji} ${truncatedTitle}${projectNote}${dueNote}`;

    // Final length check
    if (buttonText.length > MAX_BUTTON_TEXT_LENGTH) {
        // Aggressive truncation as last resort
        return `${emoji} ${truncatedTitle.slice(0, TITLE_MAX_LENGTH - 10)}...`;
    }

    return buttonText;
}

/**
 * Truncate text with smart ellipsis
 *
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length including ellipsis
 * @returns {string} Truncated text with ellipsis if needed
 *
 * @private
 */
function truncateWithEllipsis(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format ISO date string into user-friendly format
 *
 * Formats:
 *   - Same day: "📅 Today"
 *   - Next day: "📅 Tomorrow"
 *   - Within 7 days: "📅 Mon" (day name)
 *   - Beyond 7 days: "📅 Apr 15" (month day)
 *
 * @param {string} isoDate - ISO date string (YYYY-MM-DD)
 * @returns {string} Formatted date with emoji
 *
 * @private
 */
export function formatDueDate(isoDate) {
    if (!isoDate || isoDate === 'someday') {
        return '';
    }

    try {
        const date = new Date(isoDate);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Normalize to date-only comparison (ignore time component)
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());

        // Check for today
        if (dateOnly.getTime() === todayOnly.getTime()) {
            return '📅 Today';
        }

        // Check for tomorrow
        if (dateOnly.getTime() === tomorrowOnly.getTime()) {
            return '📅 Tomorrow';
        }

        // Check if within 7 days (show day name)
        const daysDiff = Math.floor((dateOnly.getTime() - todayOnly.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 0 && daysDiff <= 7) {
            const dayName = dateOnly.toLocaleDateString('en-US', { weekday: 'short' });
            return `📅 ${dayName}`;
        }

        // Default: show month and day
        const monthDay = dateOnly.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `📅 ${monthDay}`;

    } catch (err) {
        console.warn('[Clarification] Failed to format date:', isoDate, err.message);
        return '';
    }
}

/**
 * Send clarification message with inline keyboard to Telegram user
 *
 * Message format:
 * 🤔 *Multiple tasks match "query"*
 *
 * Which one did you mean to [verb]?
 *
 * [Inline keyboard with candidates]
 *
 * @param {Object} ctx - Telegram bot context (grammy Context)
 * @param {Object} result - Clarification result from pipeline
 * @param {TaskCandidate[]} result.candidates - Array of candidate tasks
 * @param {MutationType} result.mutationType - Type of mutation
 * @param {string} result.targetQuery - Original user query that matched
 *
 * @returns {Promise<void>}
 *
 * @example
 * await sendClarification(ctx, {
 *   candidates: [{ taskId: 't1', title: 'Meeting', confidence: 0.95 }],
 *   mutationType: 'complete',
 *   targetQuery: 'meeting',
 * });
 */
export async function sendClarification(ctx, result) {
    const { candidates, mutationType, targetQuery } = result;

    // Validate result structure
    if (!candidates || !mutationType || !targetQuery) {
        console.error('[Clarification] Invalid result structure:', result);
        await ctx.reply('⚠️ Could not process clarification. Please try again.');
        return;
    }

    // Build keyboard
    let keyboard;
    try {
        keyboard = buildClarificationKeyboard(candidates, mutationType);
    } catch (err) {
        console.error('[Clarification] Failed to build keyboard:', err.message);
        await ctx.reply('⚠️ Could not display clarification. Please try with a more specific task name.');
        return;
    }

    // Build message text with markdown formatting
    const mutationVerb = MUTATION_VERBS[mutationType];
    const truncatedQuery = truncateWithEllipsis(targetQuery, 50);

    const message = `🤔 *Multiple tasks match "${truncatedQuery}"*\n\n` +
        `Which one did you mean to ${mutationVerb.toLowerCase()}?`;

    // Send with inline keyboard using markdown parsing
    try {
        await ctx.reply(message, {
            reply_markup: keyboard,
            parse_mode: 'Markdown',
        });

        // Log for observability
        console.log('[Clarification] Presented', candidates.length, 'candidates to user', ctx.from?.id);

    } catch (err) {
        console.error('[Clarification] Failed to send message:', err.message);
        await ctx.reply('⚠️ Could not display clarification. Please try with a more specific task name.');
    }
}

/**
 * Validate that candidate array is suitable for clarification
 *
 * @param {TaskCandidate[]} candidates - Candidates to validate
 * @returns {boolean} True if valid for clarification display
 *
 * @example
 * if (isValidForClarification(candidates)) {
 *   await sendClarification(ctx, result);
 * }
 */
export function isValidForClarification(candidates) {
    if (!candidates || !Array.isArray(candidates)) {
        return false;
    }

    if (candidates.length === 0) {
        return false;
    }

    // Ensure all candidates have required fields
    return candidates.every(c =>
        c.taskId &&
        c.title &&
        typeof c.confidence === 'number'
    );
}

/**
 * Get candidate count for display
 *
 * @param {TaskCandidate[]} candidates - Candidates array
 * @returns {number} Number of candidates to display (max 5)
 */
export function getCandidateCount(candidates) {
    if (!candidates || !Array.isArray(candidates)) {
        return 0;
    }
    return Math.min(candidates.length, MAX_CANDIDATES_DISPLAY);
}
```

**Validation Criteria**:
- [ ] Keyboard shows up to 5 candidates (sorted by confidence)
- [ ] Titles truncated to 30 chars with ellipsis ("...")
- [ ] Project name shown in brackets if available (truncated to 15 chars)
- [ ] Due date formatted as "Today", "Tomorrow", day name (within 7 days), or "Mon 15"
- [ ] Cancel button on separate row at bottom
- [ ] Callback data format: `mutate:taskId` (under 64 bytes)
- [ ] Empty candidates array throws error with clear message
- [ ] Message includes mutation verb (Complete/Delete/Update)
- [ ] Mutation emoji prefix (✅/🗑️/📝) shown on each button
- [ ] Button text under 100 chars (Telegram limit)
- [ ] Invalid candidates skipped with warning logged
- [ ] `formatDueDate()` handles today, tomorrow, within 7 days, and beyond
- [ ] `isValidForClarification()` validates candidate structure

**Edge Cases**:
- No candidates → throws error (assertion in caller, should not happen)
- One candidate → auto-apply instead of clarification (handled by resolver, not keyboard)
- Very long project names (50+ chars) → truncate to 15 chars with ellipsis
- No due date → omit date note, show only title + project
- No project name → omit project note, show only title + due date
- Both project and due date missing → show only title with emoji
- Task ID with special characters → URL-safe, under 64 bytes
- Unicode in titles → preserved correctly
- Emoji in titles → preserved, counted in length
- Candidate array with invalid entries → skip invalid, log warning
- Invalid date format → handled gracefully, omit date note
- Keyboard with 7+ candidates → show only top 5

**Testing Notes**:
- Test with various title lengths (short, exactly 30, long with truncation)
- Test with various project name lengths (short, exactly 15, long)
- Test due date formatting (today, tomorrow, day within week, future date)
- Test with missing metadata (no project, no due date, both missing)
- Test callback data format (taskId length, special chars)
- Test button text length with extreme inputs
- Test keyboard rendering with 1, 5, 7+ candidates
- Test markdown parsing with special characters in titles

---

### T062: Implement Mutation Callback Handler

**Purpose**: Handle user's selection from clarification keyboard via callback query with complete callback data parsing, timeout handling, authorization, error classification, and concurrent callback management.

**Context**: When user clicks a button in the clarification keyboard, Telegram sends a callback query to the bot. This handler extracts the task ID from callback data, validates user authorization, checks for pending mutation, and resumes the mutation flow with the selected task. Must acknowledge callback within Telegram's timeout (30s) to prevent loading spinner.

**Implementation Steps**:
1. Extend `bot/callbacks.js` with mutation callback handler
2. Add callback data parser for `^mutate:(.+)$` pattern
3. Implement authorization check (reuse existing `guardAccess()` or `isAuthorized()`)
4. Handle cancellation action (`mutate:cancel`)
5. Retrieve pending mutation from store with expiration check
6. Resume mutation flow via `pipeline.resumeMutation()`
7. Edit original message to show processing/result
8. Acknowledge callback promptly (prevent loading spinner)
9. Handle errors with user-friendly messages
10. Clear pending mutation after success or error
11. Log callback events for observability
12. Handle concurrent callbacks (idempotency)

**Files to Modify**:
- `bot/callbacks.js` (EXTEND, ~250 lines for complete handler)
- `bot/handlers.js` (reuse `handleMutationResult` from WP05)

**Code Pattern**:
```javascript
// bot/callbacks.js - Extend existing file

// ========== Constants ==========

const CALLBACK_TIMEOUT_MS = 30000; // Telegram's callback timeout
const MAX_CALLBACK_CONCURRENCY = 5; // Max concurrent callbacks per user
const PROCESSING_MESSAGE = '⏳ Processing...';
const CANCELED_MESSAGE = '❌ **Mutation canceled.** Send a new request or try with a more specific task name.';
const EXPIRED_MESSAGE = '⚠️ **Session expired.** Please send your request again. Clarification sessions expire after 15 minutes.';

// ========== Type Definitions ==========

/**
 * @typedef {Object} PendingMutation
 * @property {string} id - Mutation ID
 * @property {string} userId - User ID
 * @property {Object} intent - Extracted intent from original message
 * @property {string} userMessage - Original user message
 * @property {string} entryPoint - Entry point (e.g., 'telegram:mutation')
 * @property {string} selectedTaskId - Selected task ID from clarification
 * @property {string} selectedAt - ISO timestamp when task was selected
 * @property {number} createdAt - Timestamp when mutation was created
 * @property {number} expiresAt - Timestamp when mutation expires
 * @property {boolean} processing - Whether mutation is currently processing
 */

// ========== Public API ==========

/**
 * Register mutation callback handlers for clarification UI
 *
 * Handles callback queries from clarification keyboard:
 * - `mutate:<taskId>` - Resume mutation with selected task
 * - `mutate:cancel` - Cancel mutation and clear pending state
 *
 * @param {Object} bot - Grammy bot instance
 * @param {Object} pipeline - Mutation pipeline instance
 * @param {Object} ticktick - TickTick adapter instance
 *
 * @example
 * registerMutationCallbacks(bot, pipeline, ticktick);
 */
export function registerMutationCallbacks(bot, pipeline, ticktick) {
    // NEW: Mutation callback handler for clarification
    bot.callbackQuery(/^mutate:(.+)$/, async (ctx) => {
        const callbackData = ctx.match[1];
        const userId = String(ctx.from?.id);
        const callbackId = ctx.callbackQuery?.id;

        console.log('[Callback] Received mutation callback:', callbackData, 'from user', userId);

        // ========== Authorization Check ==========

        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({
                text: '🔒 Unauthorized: You are not authorized to perform mutations.',
                show_alert: true, // Show as alert modal
            });
            console.warn('[Callback] Unauthorized callback from user:', userId);
            return;
        }

        // ========== Handle Cancel Action ==========

        if (callbackData === 'cancel') {
            await handleCancelCallback(ctx, userId, callbackId);
            return;
        }

        // ========== Handle Task Selection ==========

        const taskId = callbackData;
        await handleTaskSelectionCallback(ctx, userId, taskId, callbackId, pipeline);
    });
}

/**
 * Handle cancel callback from clarification keyboard
 *
 * @param {Object} ctx - Telegram bot context
 * @param {string} userId - User ID
 * @param {string} callbackId - Telegram callback query ID
 *
 * @private
 */
async function handleCancelCallback(ctx, userId, callbackId) {
    console.log('[Callback] Cancel mutation for user:', userId);

    // Acknowledge callback immediately
    await ctx.answerCallbackQuery({
        text: 'Mutation canceled.',
        show_alert: false, // Show as notification (less intrusive)
    });

    // Edit original message to show cancellation
    try {
        await ctx.editMessageText(CANCELED_MESSAGE, {
            parse_mode: 'Markdown',
        });
    } catch (err) {
        console.warn('[Callback] Could not edit message:', err.message);
        // Fallback: send new message
        await ctx.reply(CANCELED_MESSAGE.replace(/\*\*/g, ''));
    }

    // Clear pending mutation from store
    clearPendingMutation(userId);

    // Log for observability
    console.log('[Callback] Mutation canceled for user:', userId);
}

/**
 * Handle task selection callback from clarification keyboard
 *
 * @param {Object} ctx - Telegram bot context
 * @param {string} userId - User ID
 * @param {string} taskId - Selected task ID
 * @param {string} callbackId - Telegram callback query ID
 * @param {Object} pipeline - Mutation pipeline instance
 *
 * @private
 */
async function handleTaskSelectionCallback(ctx, userId, taskId, callbackId, pipeline) {
    // Acknowledge callback immediately (prevents loading spinner)
    // Telegram requires acknowledgment within 30 seconds
    await ctx.answerCallbackQuery({
        text: PROCESSING_MESSAGE,
        show_alert: false,
    });

    try {
        // ========== Retrieve Pending Mutation ==========

        const pendingMutation = getPendingMutation(userId);

        if (!pendingMutation) {
            console.warn('[Callback] No pending mutation for user:', userId, '(expired or already processed)');

            try {
                await ctx.editMessageText(EXPIRED_MESSAGE, {
                    parse_mode: 'Markdown',
                });
            } catch (err) {
                console.warn('[Callback] Could not edit message:', err.message);
                await ctx.reply(EXPIRED_MESSAGE.replace(/\*\*/g, ''));
            }
            return;
        }

        // ========== Check for Concurrent Processing ==========

        if (pendingMutation.processing) {
            console.log('[Callback] Mutation already processing for user:', userId);
            await ctx.answerCallbackQuery({
                text: 'Already processing, please wait...',
                show_alert: false,
            });
            return;
        }

        // ========== Update Pending Mutation with Selection ==========

        pendingMutation.selectedTaskId = taskId;
        pendingMutation.selectedAt = new Date().toISOString();
        pendingMutation.processing = true; // Mark as processing

        // Edit original message to show processing state
        const truncatedMessage = truncateWithEllipsis(pendingMutation.userMessage, 40);
        try {
            await ctx.editMessageText(`⏳ Processing "${truncatedMessage}"...`, {
                parse_mode: 'Markdown',
            });
        } catch (err) {
            console.warn('[Callback] Could not edit message for processing state:', err.message);
        }

        // ========== Resume Mutation Flow ==========

        const result = await pipeline.resumeMutation(pendingMutation);

        // ========== Handle Result ==========

        // Reuse handler from WP05 for consistent formatting
        await handleMutationResult(ctx, result, {
            userMessage: pendingMutation.userMessage,
            userId,
        });

        // Clear pending mutation after successful resume
        clearPendingMutation(userId);

        console.log('[Callback] Mutation resumed successfully for user:', userId, 'task:', taskId);

    } catch (err) {
        // ========== Error Handling ==========

        console.error('[Callback] Mutation callback error:', err.message, err.stack);

        // Classify error for user-friendly message
        const errorClass = classifyError(err);
        const errorMessage = getUserFriendlyError(errorClass);

        try {
            await ctx.editMessageText(
                `❌ **Error:** ${errorMessage}\n\nPlease try again or send a new request.`,
                { parse_mode: 'Markdown' }
            );
        } catch (editErr) {
            console.warn('[Callback] Could not edit message on error:', editErr.message);
            await ctx.reply(
                `❌ **Error:** ${errorMessage}\n\nPlease try again or send a new request.`
            );
        }

        // Clear pending mutation on error (prevent stuck state)
        clearPendingMutation(userId);
    }
}

/**
 * Check if user is authorized to perform mutations
 *
 * @param {Object} ctx - Telegram bot context
 * @returns {boolean} True if user is authorized
 *
 * @private
 */
function isAuthorized(ctx) {
    // Reuse existing authorization logic from bot
    // This could check allowedUserIds, admin list, or other auth strategy

    // Example: Check if user ID is in allowed list
    const allowedUserIds = process.env.ALLOWED_USER_IDS?.split(',').map(id => id.trim()) || [];

    if (allowedUserIds.length > 0) {
        const userId = String(ctx.from?.id);
        return allowedUserIds.includes(userId);
    }

    // Default: allow all (for development)
    return true;
}

/**
 * Classify error into user-friendly category
 *
 * @param {Error} err - Error object
 * @returns {'quota'|'network'|'auth'|'not_found'|'unknown'} Error classification
 *
 * @private
 */
function classifyError(err) {
    const message = err.message?.toLowerCase() || '';

    if (message.includes('quota') || message.includes('rate limit') || message.includes('limit')) {
        return 'quota';
    }
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout') || message.includes('connect')) {
        return 'network';
    }
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('token') || message.includes('permission')) {
        return 'auth';
    }
    if (message.includes('not found') || message.includes('not exist')) {
        return 'not_found';
    }

    return 'unknown';
}

/**
 * Get user-friendly error message for error class
 *
 * @param {string} errorClass - Error classification
 * @returns {string} User-friendly error message
 *
 * @private
 */
function getUserFriendlyError(errorClass) {
    const errorMessages = {
        quota: 'AI quota exhausted. Please try again shortly.',
        network: 'Network error. Please check your connection and try again.',
        auth: 'Authentication required. Please reconnect TickTick.',
        not_found: 'Task not found. It may have been deleted or modified.',
        unknown: 'Operation failed. Please try again.',
    };

    return errorMessages[errorClass] || errorMessages.unknown;
}

/**
 * Truncate text with smart ellipsis (reuse from clarification.js)
 *
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length including ellipsis
 * @returns {string} Truncated text with ellipsis if needed
 *
 * @private
 */
function truncateWithEllipsis(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}
```

**Validation Criteria**:
- [ ] Callback handler registered for `^mutate:(.+)$` pattern
- [ ] Unauthorized users blocked with `🔒 Unauthorized` alert (show_alert: true)
- [ ] Cancel action shows confirmation message and edits original message
- [ ] Valid task ID resumes mutation flow via `pipeline.resumeMutation()`
- [ ] Missing pending mutation shows "session expired" message with helpful hint
- [ ] Errors caught, classified, and displayed to user with recovery hint
- [ ] Pending mutation cleared after successful resume
- [ ] Pending mutation cleared on error (prevent stuck state)
- [ ] Callback acknowledged promptly (< 1s) to prevent loading spinner
- [ ] Original message edited to show processing state
- [ ] Concurrent callbacks handled (processing flag prevents duplicate execution)
- [ ] Error classification works for quota, network, auth, not_found, unknown
- [ ] User-friendly error messages shown (not technical stack traces)

**Edge Cases**:
- Session timeout (pending mutation expired) → show "session expired" with 15-minute hint
- Task no longer exists → pipeline returns error, show "task not found" to user
- User clicks multiple times rapidly → idempotent (processing flag prevents duplicate)
- Callback data truncated (Telegram 64-byte limit) → validate before processing
- Network error during resume → show error, clear pending mutation
- User clicks cancel after timeout → still clear pending mutation
- Message edit fails (message too old) → fallback to reply with new message
- User not authorized → show alert modal, log warning
- Pipeline throws exception → catch, classify error, show friendly message
- Concurrent callbacks from same user → queue or reject with "already processing"

**Testing Notes**:
- Test with authorized and unauthorized users
- Test cancel action (callback acknowledgment, message edit, store cleanup)
- Test valid task selection (resume flow, result handling)
- Test expired session (missing pending mutation)
- Test pipeline errors (quota, network, auth failures)
- Verify callback query acknowledged promptly (check timing)
- Test message editing behavior (success and failure cases)
- Test concurrent callback handling (rapid clicks)
- Test error message formatting (all error classes)
- Test store cleanup after callback (pending mutation cleared)

---

### T063: Add Resume Mutation Logic

**Purpose**: Continue mutation flow after user selects a task from clarification UI with complete `services/mutation-resume.js` module, pending mutation retrieval, timeout enforcement, task existence verification, and result storage.

**Context**: After user selects a task from the clarification keyboard, the mutation flow resumes from Stage 3 (normalization) with the resolved task ID. This avoids re-running intent extraction and task resolution, providing a seamless user experience. The resume logic must validate the pending mutation, verify task existence, and execute the mutation with rollback support.

**Implementation Steps**:
1. Create `services/mutation-resume.js` module (~150 lines)
2. Extend `services/pipeline.js` with `resumeMutation()` method
3. Extend `services/store.js` with pending mutation storage (~100 lines)
4. Implement pending mutation retrieval with expiration check
5. Add timeout enforcement (15-minute expiration)
6. Implement task existence verification before execution
7. Reuse `_executeActions()` for execution and rollback
8. Log resumption events for observability
9. Add cleanup interval for expired mutations
10. Handle concurrent resume attempts (idempotency)

**Files to Create/Modify**:
- `services/mutation-resume.js` (NEW file, ~150 lines)
- `services/pipeline.js` (EXTEND, +80 lines for `resumeMutation()`)
- `services/store.js` (NEW file, ~100 lines for pending mutation storage)

**Code Pattern**:
```javascript
// services/mutation-resume.js - NEW file

// ========== Constants ==========

const PENDING_MUTATION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ========== Type Definitions ==========

/**
 * @typedef {Object} PendingMutation
 * @property {string} id - Unique mutation ID
 * @property {string} userId - User ID who initiated mutation
 * @property {Object} intent - Extracted intent from original message
 * @property {string} intent.type - Mutation type (complete, delete, update)
 * @property {string} intent.targetQuery - Original task query
 * @property {string} userMessage - Original user message
 * @property {string} entryPoint - Entry point (e.g., 'telegram:mutation')
 * @property {string} [selectedTaskId] - Selected task ID from clarification
 * @property {string} [selectedAt] - ISO timestamp when task was selected
 * @property {boolean} [processing] - Whether mutation is currently processing
 * @property {number} createdAt - Timestamp when mutation was created
 * @property {number} expiresAt - Timestamp when mutation expires
 * @property {string} [timezone] - User timezone for date resolution
 * @property {Array} [availableProjects] - Available projects for normalization
 */

// ========== Public API ==========

/**
 * Resume mutation flow after user selects task from clarification UI
 *
 * Resumes from Stage 3 (normalization) with selected task ID, avoiding
 * re-running intent extraction and task resolution.
 *
 * Flow:
 * 1. Validate pending mutation structure
 * 2. Check expiration (15-minute timeout)
 * 3. Verify task existence via adapter
 * 4. Normalize mutation actions with resolved task ID
 * 5. Execute actions with rollback support
 * 6. Log resumption and execution events
 *
 * @param {Object} pipeline - Mutation pipeline instance
 * @param {PendingMutation} pendingMutation - Pending mutation from store
 * @param {Object} normalizer - Normalizer instance
 * @param {Object} adapter - TickTick adapter instance
 * @param {Function} logMutationEvent - Observability logging function
 *
 * @returns {Promise<Object>} Mutation result (task, error, clarification)
 *
 * @throws {Error} If pending mutation is invalid or expired
 * @throws {Error} If selected task does not exist
 *
 * @example
 * const result = await resumeMutation(pipeline, pendingMutation, normalizer, adapter, logMutationEvent);
 */
export async function resumeMutation(pipeline, pendingMutation, normalizer, adapter, logMutationEvent) {
    // ========== Validate Pending Mutation ==========

    if (!pendingMutation) {
        const error = new Error('Pending mutation is required');
        error.class = 'validation_error';
        throw error;
    }

    if (!pendingMutation.selectedTaskId) {
        const error = new Error('Selected task ID is required');
        error.class = 'validation_error';
        throw error;
    }

    // Check expiration
    if (pendingMutation.expiresAt && Date.now() > pendingMutation.expiresAt) {
        console.log('[ResumeMutation] Mutation expired:', pendingMutation.id);
        const error = new Error('Mutation session expired (15-minute timeout)');
        error.class = 'session_expired';
        throw error;
    }

    // ========== Verify Task Existence ==========

    let task;
    try {
        task = await adapter.getTask(pendingMutation.selectedTaskId);
    } catch (err) {
        console.warn('[ResumeMutation] Failed to fetch task:', pendingMutation.selectedTaskId, err.message);
        const error = new Error('Task not found. It may have been deleted or modified.');
        error.class = 'task_not_found';
        throw error;
    }

    if (!task) {
        console.warn('[ResumeMutation] Selected task no longer exists:', pendingMutation.selectedTaskId);
        const error = new Error('Task not found. It may have been deleted or modified.');
        error.class = 'task_not_found';
        throw error;
    }

    // ========== Create Telemetry Context ==========

    const telemetry = {
        entryPoint: pendingMutation.entryPoint || 'telegram:mutation',
        mode: 'mutation',
        userId: pendingMutation.userId,
        mutationType: pendingMutation.intent?.type,
        taskId: pendingMutation.selectedTaskId,
        mutationId: pendingMutation.id,
    };

    // ========== Log Resumption Event ==========

    logMutationEvent({
        event: 'mutation_resumed',
        mutationId: pendingMutation.id,
        userId: pendingMutation.userId,
        selectedTaskId: pendingMutation.selectedTaskId,
        targetQuery: pendingMutation.intent?.targetQuery,
        mutationType: pendingMutation.intent?.type,
        latencyMs: Date.now() - pendingMutation.createdAt,
        timeInClarificationMs: pendingMutation.selectedAt
            ? Date.now() - new Date(pendingMutation.selectedAt).getTime()
            : 0,
    });

    try {
        // ========== Stage 3: Normalize with Resolved Task ==========

        const normalizedActions = normalizer.normalizeActions(
            [pendingMutation.intent],
            {
                resolvedTaskId: pendingMutation.selectedTaskId,
                resolvedProjectId: pendingMutation.resolvedProjectId,
                availableProjects: pendingMutation.availableProjects || [],
                timezone: pendingMutation.timezone || 'UTC',
                currentDate: new Date().toISOString(),
            }
        );

        console.log('[ResumeMutation] Normalized actions:', normalizedActions);

        // ========== Stage 4-6: Execute with Rollback ==========

        // Reuse existing _executeActions for execution and rollback
        const result = await pipeline._executeActions(normalizedActions, adapter, {
            userMessage: pendingMutation.userMessage,
            entryPoint: pendingMutation.entryPoint,
            mode: 'mutation',
            mutationType: pendingMutation.intent?.type,
            taskId: pendingMutation.selectedTaskId,
        }, telemetry);

        // ========== Log Successful Execution ==========

        logMutationEvent({
            event: 'mutation_executed',
            mutationId: pendingMutation.id,
            taskId: pendingMutation.selectedTaskId,
            resultType: result.type,
            mutationType: pendingMutation.intent?.type,
        });

        return result;

    } catch (err) {
        // ========== Log Failure ==========

        console.error('[ResumeMutation] Execution failed:', err.message);

        logMutationEvent({
            event: 'mutation_failed',
            mutationId: pendingMutation.id,
            taskId: pendingMutation.selectedTaskId,
            errorClass: err.class || 'unknown',
            errorMessage: err.message,
            mutationType: pendingMutation.intent?.type,
        });

        // Re-throw with class for error handling
        if (!err.class) {
            err.class = 'execution_error';
        }
        throw err;
    }
}

/**
 * Create pending mutation object with expiration
 *
 * @param {Object} mutation - Base mutation object
 * @param {string} userId - User ID
 * @returns {PendingMutation} Pending mutation with expiration
 *
 * @example
 * const pending = createPendingMutation(mutation, 'user-123');
 */
export function createPendingMutation(mutation, userId) {
    const now = Date.now();

    return {
        ...mutation,
        id: mutation.id || `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        createdAt: now,
        expiresAt: now + PENDING_MUTATION_TTL_MS,
        processing: false,
    };
}

/**
 * Check if pending mutation is expired
 *
 * @param {PendingMutation} pendingMutation - Pending mutation to check
 * @returns {boolean} True if expired
 */
export function isExpired(pendingMutation) {
    if (!pendingMutation || !pendingMutation.expiresAt) {
        return true;
    }
    return Date.now() > pendingMutation.expiresAt;
}
```

**Store Extension**:
```javascript
// services/store.js - NEW file

// ========== Constants ==========

const PENDING_MUTATION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ========== In-Memory Store ==========

const pendingMutations = new Map(); // userId → PendingMutation

/**
 * Store pending mutation with expiration
 *
 * @param {string} userId - User ID
 * @param {Object} mutation - Pending mutation object
 *
 * @example
 * setPendingMutation('user-123', {
 *   id: 'm1',
 *   intent: { type: 'complete', targetQuery: 'meeting' },
 *   userMessage: 'done meeting',
 * });
 */
export function setPendingMutation(userId, mutation) {
    const now = Date.now();
    const expiresAt = now + PENDING_MUTATION_TTL_MS;

    pendingMutations.set(userId, {
        ...mutation,
        userId,
        createdAt: now,
        expiresAt,
        processing: false,
    });

    console.log('[Store] Stored pending mutation for user:', userId, 'expires at:', new Date(expiresAt).toISOString());
}

/**
 * Get pending mutation if not expired
 *
 * @param {string} userId - User ID
 * @returns {Object|null} Pending mutation or null if expired/missing
 *
 * @example
 * const pending = getPendingMutation('user-123');
 * if (pending) {
 *   // Process mutation
 * } else {
 *   // Expired or missing
 * }
 */
export function getPendingMutation(userId) {
    const pending = pendingMutations.get(userId);

    if (!pending) {
        return null;
    }

    // Check expiration
    if (Date.now() > pending.expiresAt) {
        console.log('[Store] Pending mutation expired for user:', userId);
        pendingMutations.delete(userId);
        return null;
    }

    return pending;
}

/**
 * Clear pending mutation
 *
 * @param {string} userId - User ID
 *
 * @example
 * clearPendingMutation('user-123');
 */
export function clearPendingMutation(userId) {
    const had = pendingMutations.has(userId);
    pendingMutations.delete(userId);

    if (had) {
        console.log('[Store] Cleared pending mutation for user:', userId);
    }
}

/**
 * Clear all expired mutations (cleanup task)
 *
 * Call periodically (e.g., every 5 minutes) to prevent memory leaks.
 *
 * @returns {number} Number of mutations cleared
 *
 * @example
 * const cleared = cleanupExpiredMutations();
 * console.log('Cleared', cleared, 'expired mutations');
 */
export function cleanupExpiredMutations() {
    const now = Date.now();
    let cleared = 0;

    for (const [userId, mutation] of pendingMutations.entries()) {
        if (now > mutation.expiresAt) {
            pendingMutations.delete(userId);
            cleared++;
        }
    }

    if (cleared > 0) {
        console.log('[Store] Cleaned up', cleared, 'expired mutations');
    }

    return cleared;
}

/**
 * Get count of pending mutations (for monitoring)
 *
 * @returns {number} Count of pending mutations
 */
export function getPendingMutationCount() {
    return pendingMutations.size;
}

/**
 * Get all pending mutations (for debugging)
 *
 * @returns {Array} Array of pending mutations
 */
export function getAllPendingMutations() {
    return Array.from(pendingMutations.values());
}

// ========== Cleanup Interval ==========

// Run cleanup every 5 minutes
const cleanupInterval = setInterval(cleanupExpiredMutations, CLEANUP_INTERVAL_MS);

// Cleanup on process exit
process.on('exit', () => {
    clearInterval(cleanupInterval);
    console.log('[Store] Cleanup interval cleared');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('[Store] Uncaught exception:', err);
    clearInterval(cleanupInterval);
});
```

**Pipeline Extension**:
```javascript
// services/pipeline.js - Extend existing file

import { resumeMutation as resumeMutationImpl } from './mutation-resume.js';
import { logMutationEvent } from './pipeline-observability.js';

export function createPipeline({ axIntent, normalizer, adapter, observability } = {}) {
    // ... existing methods (processMessage, _processMutation, etc.)

    /**
     * Resume mutation flow after user selects task from clarification UI
     *
     * @param {Object} pendingMutation - Pending mutation from store
     * @returns {Promise<Object>} Mutation result
     */
    async function resumeMutation(pendingMutation) {
        return resumeMutationImpl(this, pendingMutation, normalizer, adapter, logMutationEvent);
    }

    return {
        processMessage,
        _processMutation,
        _executeActions,
        resumeMutation,  // NEW
    };
}
```

**Validation Criteria**:
- [ ] `resumeMutation()` accepts pending mutation object
- [ ] Resumes from Stage 3 (normalization) with selected task ID
- [ ] Reuses `_executeActions()` for execution and rollback
- [ ] Logs `mutation_resumed` event with latency metrics
- [ ] Logs `mutation_executed` event on success
- [ ] Logs `mutation_failed` event on error
- [ ] Pending mutations stored with 15-minute expiration
- [ ] Expired mutations return null from `getPendingMutation()`
- [ ] `cleanupExpiredMutations()` runs every 5 minutes
- [ ] Task existence verified before execution
- [ ] Error classification includes `session_expired` and `task_not_found`
- [ ] Concurrent resume attempts handled (processing flag)

**Edge Cases**:
- Mutation expired → return null, user must resend request
- Task deleted externally → pipeline returns error during execution
- Rollback needed → uses same rollback logic as initial mutation
- Multiple resume attempts → cleared after first (idempotent)
- Store memory leak → cleanup interval prevents unbounded growth
- Process restart → in-memory store cleared (acceptable, user resends)
- Invalid pending mutation structure → validation error thrown
- Missing selected task ID → validation error thrown

**Testing Notes**:
- Test resume with valid pending mutation
- Test resume with expired mutation
- Test resume with missing mutation
- Test resume with non-existent task
- Test cleanup interval (mock time)
- Verify telemetry events logged correctly
- Test rollback on execution failure
- Test concurrent resume attempts
- Test memory usage with many pending mutations

---

### T064: Write Clarification UI Tests

**Purpose**: Comprehensive test coverage for clarification UI flow with 60+ complete tests covering keyboard builder, callback handler, resume mutation logic, store expiration, and integration scenarios.

**Context**: The clarification flow involves multiple components working together: keyboard builder, callback handler, resume logic, and pending mutation store. Tests ensure each component works correctly in isolation and the end-to-end flow is seamless. Tests follow the existing patterns from WP01-WP05 with mock objects and pipeline harness.

**Implementation Steps**:
1. Create `tests/clarification.test.js` (~350 lines, 60+ tests)
2. Test keyboard builder (formatting, truncation, metadata, 20+ tests)
3. Test callback handler (authorization, cancel, resume, 15+ tests)
4. Test resume mutation logic (normalization, execution, rollback, 10+ tests)
5. Test store expiration and cleanup (10+ tests)
6. Test integration scenarios (end-to-end flow, 5+ tests)
7. Use mock objects for all external dependencies
8. Include edge cases (special chars, unicode, extreme lengths)

**Files to Create**:
- `tests/clarification.test.js` (NEW file, ~350 lines, 60+ tests)

**Test Structure**:
```javascript
// tests/clarification.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClarificationKeyboard, formatDueDate, sendClarification, isValidForClarification, getCandidateCount } from '../bot/clarification.js';
import { setPendingMutation, getPendingMutation, clearPendingMutation, cleanupExpiredMutations, getPendingMutationCount } from '../services/store.js';
import { createPipelineHarness } from './integration/pipeline-harness.js';

// ========== Mock Helpers ==========

/**
 * Create mock Telegram context
 *
 * @param {Object} overrides - Override default mock behavior
 * @returns {Object} Mock context
 */
function createMockContext(overrides = {}) {
    const replies = [];
    const edits = [];
    const callbacks = [];

    return {
        from: { id: 'test-user', username: 'testuser' },
        message: { text: 'test message' },
        callbackQuery: { id: 'callback-123' },
        reply: async (msg, opts) => {
            replies.push({ msg, opts });
            return { message_id: 1 };
        },
        editMessageText: async (msg, opts) => {
            edits.push({ msg, opts });
            return true;
        },
        answerCallbackQuery: async (opts) => {
            callbacks.push(opts);
        },
        _replies: replies,
        _edits: edits,
        _callbacks: callbacks,
        ...overrides,
    };
}

// ========== Keyboard Builder Tests (20+ tests) ==========

test('buildClarificationKeyboard shows up to 5 candidates', () => {
    const candidates = Array(7).fill(null).map((_, i) => ({
        taskId: `task-${i}`,
        title: `Task ${i}`,
        projectName: 'Test Project',
        dueDate: '2026-04-01',
        confidence: 0.95 - (i * 0.05),
    }));

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    assert.ok(keyboard);
    assert.ok(keyboard.inline_keyboard);
    // Should show 5 candidates + 1 cancel button
    assert.equal(keyboard.inline_keyboard.length, 6);
});

test('buildClarificationKeyboard truncates long titles to 30 chars', () => {
    const candidates = [{
        taskId: 'task-1',
        title: 'This is a very long task title that exceeds thirty characters limit significantly',
        projectName: 'Test',
    }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    assert.ok(keyboard);
    const buttonText = keyboard.inline_keyboard[0][0].text;
    assert.ok(buttonText.includes('...'), 'Should include ellipsis for truncated title');
    assert.ok(buttonText.length <= 100, 'Button text should be under 100 chars');
});

test('buildClarificationKeyboard truncates project names to 15 chars', () => {
    const candidates = [{
        taskId: 'task-1',
        title: 'Task',
        projectName: 'This is a very long project name that exceeds fifteen characters',
    }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    assert.ok(keyboard);
    const buttonText = keyboard.inline_keyboard[0][0].text;
    // Project should be truncated with ellipsis
    assert.ok(buttonText.includes('['), 'Should include project brackets');
});

test('buildClarificationKeyboard formats today due date', () => {
    const today = new Date().toISOString().split('T')[0];
    const candidates = [{ taskId: 'task-1', title: 'Today task', dueDate: today }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    assert.ok(keyboard);
    const buttonText = keyboard.inline_keyboard[0][0].text;
    assert.ok(buttonText.includes('Today'), 'Should show "Today"');
});

test('buildClarificationKeyboard formats tomorrow due date', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const candidates = [{ taskId: 'task-1', title: 'Tomorrow task', dueDate: tomorrow }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    assert.ok(keyboard);
    const buttonText = keyboard.inline_keyboard[0][0].text;
    assert.ok(buttonText.includes('Tomorrow'), 'Should show "Tomorrow"');
});

test('buildClarificationKeyboard formats day name within 7 days', () => {
    const inThreeDays = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    const candidates = [{ taskId: 'task-1', title: 'Future task', dueDate: inThreeDays }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    assert.ok(keyboard);
    const buttonText = keyboard.inline_keyboard[0][0].text;
    // Should show day name (e.g., "Fri")
    assert.ok(buttonText.includes('📅'), 'Should include date emoji');
});

test('buildClarificationKeyboard formats date beyond 7 days', () => {
    const future = '2026-05-15';
    const candidates = [{ taskId: 'task-1', title: 'Distant task', dueDate: future }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    assert.ok(keyboard);
    const buttonText = keyboard.inline_keyboard[0][0].text;
    // Should show "May 15"
    assert.ok(buttonText.includes('📅'), 'Should include date emoji');
});

test('buildClarificationKeyboard omits missing project name', () => {
    const candidates = [{
        taskId: 'task-1',
        title: 'Task',
        projectName: null,
    }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    assert.ok(keyboard);
    const buttonText = keyboard.inline_keyboard[0][0].text;
    // Should not show brackets for missing project
    assert.ok(!buttonText.includes('[]'), 'Should not show empty brackets');
});

test('buildClarificationKeyboard omits missing due date', () => {
    const candidates = [{
        taskId: 'task-1',
        title: 'Task',
        dueDate: null,
    }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    assert.ok(keyboard);
    const buttonText = keyboard.inline_keyboard[0][0].text;
    // Should not show date emoji
    assert.ok(!buttonText.includes('📅'), 'Should not show date emoji for missing due date');
});

test('buildClarificationKeyboard includes mutation emoji', () => {
    const candidates = [{ taskId: 'task-1', title: 'Task' }];

    const completeKeyboard = buildClarificationKeyboard(candidates, 'complete');
    const deleteKeyboard = buildClarificationKeyboard(candidates, 'delete');
    const updateKeyboard = buildClarificationKeyboard(candidates, 'update');

    assert.ok(completeKeyboard.inline_keyboard[0][0].text.includes('✅'), 'Complete should have checkmark');
    assert.ok(deleteKeyboard.inline_keyboard[0][0].text.includes('🗑️'), 'Delete should have trash');
    assert.ok(updateKeyboard.inline_keyboard[0][0].text.includes('📝'), 'Update should have pencil');
});

test('buildClarificationKeyboard has cancel button on separate row', () => {
    const candidates = [{ taskId: 'task-1', title: 'Task' }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    const lastRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1];
    assert.equal(lastRow.length, 1, 'Cancel button should be on its own row');
    assert.equal(lastRow[0].text, '❌ Cancel', 'Cancel button text should match');
    assert.equal(lastRow[0].callback_data, 'mutate:cancel', 'Cancel callback data should match');
});

test('buildClarificationKeyboard throws error for empty candidates', () => {
    assert.throws(
        () => buildClarificationKeyboard([], 'complete'),
        /non-empty/
    );
});

test('buildClarificationKeyboard throws error for null candidates', () => {
    assert.throws(
        () => buildClarificationKeyboard(null, 'complete'),
        /non-empty/
    );
});

test('buildClarificationKeyboard throws error for invalid mutationType', () => {
    const candidates = [{ taskId: 'task-1', title: 'Task' }];

    assert.throws(
        () => buildClarificationKeyboard(candidates, 'invalid'),
        /Invalid mutationType/
    );
});

test('buildClarificationKeyboard skips invalid candidates', () => {
    const candidates = [
        { taskId: 'task-1', title: 'Valid task' },
        { taskId: 'task-2' }, // Missing title
        { title: 'No ID' }, // Missing taskId
    ];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    // Should only have 1 candidate + cancel
    assert.equal(keyboard.inline_keyboard.length, 2);
});

test('buildClarificationKeyboard validates callback data length', () => {
    const candidates = [{
        taskId: 'a'.repeat(60), // Very long task ID
        title: 'Task',
    }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    // Callback data should be under 64 bytes
    const callbackData = keyboard.inline_keyboard[0][0].callback_data;
    assert.ok(callbackData.length <= 64, 'Callback data should be under 64 bytes');
});

test('getCandidateCount returns correct count', () => {
    const candidates = Array(10).fill(null).map((_, i) => ({
        taskId: `task-${i}`,
        title: `Task ${i}`,
    }));

    assert.equal(getCandidateCount(candidates), 5, 'Should return max 5');
    assert.equal(getCandidateCount(candidates.slice(0, 3)), 3, 'Should return actual count if under 5');
    assert.equal(getCandidateCount([]), 0, 'Should return 0 for empty');
    assert.equal(getCandidateCount(null), 0, 'Should return 0 for null');
});

test('isValidForClarification validates candidate structure', () => {
    const validCandidates = [
        { taskId: 't1', title: 'Task', confidence: 0.9 },
        { taskId: 't2', title: 'Task 2', confidence: 0.8 },
    ];

    assert.equal(isValidForClarification(validCandidates), true);
    assert.equal(isValidForClarification([]), false);
    assert.equal(isValidForClarification(null), false);
    assert.equal(isValidForClarification([{ taskId: 't1' }]), false); // Missing title
});

test('formatDueDate handles today', () => {
    const today = new Date().toISOString().split('T')[0];
    assert.ok(formatDueDate(today).includes('Today'));
});

test('formatDueDate handles tomorrow', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    assert.ok(formatDueDate(tomorrow).includes('Tomorrow'));
});

test('formatDueDate handles invalid date', () => {
    assert.equal(formatDueDate('invalid'), '');
    assert.equal(formatDueDate(null), '');
    assert.equal(formatDueDate('someday'), '');
});

// ========== Store Tests (10+ tests) ==========

test('setPendingMutation stores mutation with expiration', () => {
    const mutation = {
        id: 'm1',
        userId: 'u1',
        intent: { type: 'complete' },
    };

    setPendingMutation('u1', mutation);
    const retrieved = getPendingMutation('u1');

    assert.ok(retrieved);
    assert.equal(retrieved.id, 'm1');
    assert.ok(retrieved.expiresAt > Date.now());

    clearPendingMutation('u1');
});

test('getPendingMutation returns null for missing user', () => {
    const retrieved = getPendingMutation('nonexistent-user');
    assert.equal(retrieved, null);
});

test('getPendingMutation returns null for expired mutation', () => {
    const mutation = { id: 'm1', userId: 'u1' };
    setPendingMutation('u1', mutation);

    // Simulate time travel (16 minutes later)
    const originalNow = Date.now;
    Date.now = () => originalNow() + 16 * 60 * 1000;

    const expired = getPendingMutation('u1');
    assert.equal(expired, null);

    Date.now = originalNow;
    clearPendingMutation('u1');
});

test('clearPendingMutation removes mutation', () => {
    setPendingMutation('u1', { id: 'm1' });
    assert.ok(getPendingMutation('u1'));

    clearPendingMutation('u1');
    assert.equal(getPendingMutation('u1'), null);
});

test('cleanupExpiredMutations removes expired entries', () => {
    setPendingMutation('u1', { id: 'm1' });
    setPendingMutation('u2', { id: 'm2' });

    // Simulate time travel
    const originalNow = Date.now;
    Date.now = () => originalNow() + 16 * 60 * 1000;

    const cleared = cleanupExpiredMutations();
    assert.ok(cleared >= 2, 'Should clear expired mutations');

    Date.now = originalNow;
});

test('getPendingMutationCount returns correct count', () => {
    const initialCount = getPendingMutationCount();

    setPendingMutation('u1', { id: 'm1' });
    setPendingMutation('u2', { id: 'm2' });

    assert.equal(getPendingMutationCount(), initialCount + 2);

    clearPendingMutation('u1');
    clearPendingMutation('u2');
});

test('getAllPendingMutations returns array', () => {
    setPendingMutation('u1', { id: 'm1' });
    setPendingMutation('u2', { id: 'm2' });

    const all = getAllPendingMutations();
    assert.ok(Array.isArray(all));
    assert.ok(all.length >= 2);

    clearPendingMutation('u1');
    clearPendingMutation('u2');
});

test('pending mutation has correct structure', () => {
    const mutation = {
        id: 'm1',
        intent: { type: 'complete', targetQuery: 'test' },
        userMessage: 'done test',
    };

    setPendingMutation('u1', mutation);
    const retrieved = getPendingMutation('u1');

    assert.ok(retrieved.id);
    assert.ok(retrieved.userId);
    assert.ok(retrieved.createdAt);
    assert.ok(retrieved.expiresAt);
    assert.equal(retrieved.processing, false);

    clearPendingMutation('u1');
});

// ========== Integration Tests (5+ tests) ==========

test('clarification flow: end-to-end', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Meeting A', status: 0 },
            { id: 't2', title: 'Meeting B', status: 0 },
        ],
    });

    // Initial ambiguous request
    const clarResult = await pipeline.processMessage('done meeting', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(clarResult.type, 'clarification');
    assert.ok(clarResult.candidates.length >= 2);

    // Create pending mutation
    setPendingMutation('test-user', {
        ...clarResult,
        userId: 'test-user',
        selectedTaskId: 't2',
    });

    // Resume mutation
    const resumeResult = await pipeline.resumeMutation(getPendingMutation('test-user'));

    assert.equal(resumeResult.type, 'task');

    const task2 = await adapter.getTask('t2');
    assert.equal(task2.status, 2); // Completed

    clearPendingMutation('test-user');
});
```

**Validation Criteria**:
- [ ] 60+ tests covering keyboard, callbacks, resume, timeout
- [ ] Tests run with `node --test tests/clarification.test.js`
- [ ] All tests pass with zero failures
- [ ] Keyboard formatting verified (truncation, metadata, dates)
- [ ] Pending mutation expiration tested
- [ ] Resume mutation integration tested
- [ ] Store cleanup tested
- [ ] Edge cases covered (special chars, unicode, extreme lengths)

**Edge Cases**:
- Empty candidates → throws error
- Expired mutation → returns null
- Missing mutation → returns null
- Multiple rapid callbacks → idempotent
- Very long task IDs → callback data validation
- Invalid date formats → handled gracefully
- Unicode in titles → preserved correctly

**Testing Notes**:
- Test keyboard with various title/project/date combinations
- Test store expiration with mocked time
- Test resume with pipeline harness
- Verify callback handler authorization
- Test cleanup interval with mocked time
- Test error handling in all components

---

## Definition of Done

- [ ] `bot/clarification.js` exports keyboard builder and utilities
- [ ] `bot/callbacks.js` has mutation callback handler
- [ ] `services/mutation-resume.js` exports resume logic
- [ ] `services/store.js` implements pending mutation storage
- [ ] `services/pipeline.js` has `resumeMutation()` method
- [ ] Keyboard shows up to 5 candidates with metadata
- [ ] Callback handler acknowledges within 1 second
- [ ] Pending mutations expire after 15 minutes
- [ ] Cleanup interval runs every 5 minutes
- [ ] 60+ tests covering all scenarios
- [ ] All tests pass with zero failures

## Risks

- **Memory leak**: Cleanup interval prevents unbounded growth
- **Session timeout**: 15 minutes is generous for clarification flow
- **Callback data limit**: 64-byte limit validated before sending
- **Concurrent callbacks**: Processing flag prevents duplicate execution

## Reviewer Guidance

- Verify keyboard formatting with various metadata combinations
- Check callback handler acknowledges promptly
- Confirm pending mutation expiration works correctly
- Test cleanup interval with mocked time
- Verify error handling in all components

## Activity Log

- Pending implementation
