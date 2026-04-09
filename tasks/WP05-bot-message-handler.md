---
work_package_id: WP05
title: Bot Message Handler
dependencies: "[WP04]"
subtasks: [T051, T052, T053, T054]
---

# Work Package Prompt: WP05 — Bot Message Handler

**Feature**: 002-natural-language-task-mutations
**Work Package**: WP05
**Title**: Bot Message Handler
**Priority**: P1 — Critical Path (depends on WP04)
**Dependencies**: WP04 (Pipeline Integration) complete
**Parallelisable with**: WP06 (Clarification UI)
**Estimated Lines**: ~1,050 lines
**Subtasks**: 4 (T051-T054, ~260 lines each)

---

## Objective

Extend the Telegram bot to handle free-form messages as potential task mutations (update/complete/delete), present clarification UI when needed, and provide optional command syntax for power users. This WP bridges the pipeline mutation flow to the user interface.

**Key Behaviors**:
1. Detect non-command messages and route to mutation pipeline
2. Handle mutation result types (task, clarification, error, not-found)
3. Present clarification UI with inline keyboard for ambiguous matches
4. Support optional `/done` and `/delete` commands for power users
5. Implement session locking to prevent concurrent processing conflicts
6. Provide rate limiting to protect against spam and accidental duplicates
7. Log all mutations with `entryPoint` for analytics and observability

**Design Principles**:
- **Terse Confirmations**: Task results shown in one line with emoji (✅/❌)
- **Graceful Degradation**: Errors show user-friendly messages with recovery hints
- **Power User Support**: Optional explicit commands for common mutations
- **Observability**: All mutations logged with `entryPoint` for analytics
- **Session Safety**: Prevent concurrent message processing conflicts
- **Rate Limiting**: Protect against spam and accidental duplicate submissions
- **Error Classification**: Quota, network, auth, and unknown errors handled distinctly

**User Experience Flow**:
```
User sends "done meeting" → Bot detects free-form message →
Pipeline processes (intent → resolve → normalize → execute) →
Bot shows confirmation "✅ Completed: Meeting with team"

OR (if ambiguous):
Bot presents clarification keyboard → User selects task →
Bot resumes mutation → Shows confirmation
```

---

## Implementation Steps

### T051: Add Free-Form Message Handler to bot/commands.js

**Purpose**: Detect and process non-command messages as potential mutations with session locking, error classification, debounce logic, and timezone extraction.

**Context**: Users naturally send messages like "done buy groceries" or "delete old task" without using slash commands. This handler intercepts those messages and routes them to the mutation pipeline while managing session state to prevent concurrent processing conflicts. The handler must also extract timezone information from the user profile and implement debounce logic to prevent accidental duplicate submissions.

**Implementation Steps**:
1. Add `bot.on('message:text', ...)` handler in `registerCommands()`
2. Skip messages starting with `/` (already handled as commands)
3. Implement session locking to prevent concurrent message processing per user
4. Detect urgent mode toggles first (existing behavior preserved)
5. Extract timezone from user profile or use configured default
6. Call `pipeline.processMessage()` with mutation context
7. Handle result types via `handleMutationResult()` helper (T052)
8. Implement error classification (quota, network, auth, unknown)
9. Add session state management for tracking in-flight requests
10. Implement debounce logic with 2-second window
11. Add timezone extraction from Telegram user profile

**Files to Create/Modify**:
- `bot/commands.js` (+120 lines for message handler with session management)
- `bot/handlers.js` (NEW file, +80 lines for `handleMutationResult` and error classification)
- `bot/session-store.js` (NEW file, +60 lines for session locking utilities)
- `bot/error-classes.js` (NEW file, +40 lines for error class enumeration)

**Validation Criteria**:
- [ ] Non-command messages trigger pipeline processing
- [ ] Command messages (starting with `/`) are skipped
- [ ] Urgent mode toggles detected before mutation processing
- [ ] Pipeline receives correct context (`entryPoint: 'telegram:mutation'`, `mode: 'mutation'`)
- [ ] Empty messages ignored silently
- [ ] Errors caught and user shown friendly message
- [ ] Session locking prevents concurrent processing per user
- [ ] Session state tracked with timestamps for cleanup
- [ ] Debounce logic prevents duplicate submissions within 2-second window
- [ ] Timezone extracted from user profile or defaults to configured value
- [ ] Timezone passed to pipeline for date calculations

**Edge Cases**:
- Empty messages → ignore silently (no reply)
- Messages with only whitespace → ignore silently
- Messages while TickTick disconnected → reply with auth reminder
- Pipeline throws exception → error handler catches and replies gracefully
- Very long messages (>1000 chars) → pipeline handles truncation
- Concurrent messages from same user → queue or reject with "processing" message
- Session timeout → cleanup stale locks after 30 seconds
- User sends multiple messages rapidly → debounce with 2-second window
- User in different timezone → date calculations use user's timezone
- User profile has no timezone → fallback to UTC or configured default

**Session State Management**:
```javascript
// bot/session-store.js - NEW file

const userSessions = new Map();

const SESSION_TIMEOUT_MS = 30000; // 30 seconds
const DEBOUNCE_MS = 2000; // 2 seconds

/**
 * Check if user has active session (processing in-flight)
 * @param {string} userId - Telegram user ID
 * @returns {boolean} True if user is currently processing
 */
export function hasActiveSession(userId) {
  const session = userSessions.get(userId);
  if (!session) return false;

  // Check if session has timed out
  if (Date.now() - session.lastActivity > SESSION_TIMEOUT_MS) {
    userSessions.delete(userId);
    return false;
  }

  return session.processing;
}

/**
 * Check if user is within debounce window (sent message recently)
 * @param {string} userId - Telegram user ID
 * @returns {boolean} True if user is within debounce window
 */
export function isWithinDebounceWindow(userId) {
  const session = userSessions.get(userId);
  if (!session) return false;

  return Date.now() - session.lastActivity < DEBOUNCE_MS;
}

/**
 * Acquire session lock for user
 * @param {string} userId - Telegram user ID
 * @returns {boolean} True if lock acquired, false if already processing
 */
export function acquireSessionLock(userId) {
  // Check debounce window first
  if (isWithinDebounceWindow(userId)) {
    console.log('[SessionStore] User within debounce window:', userId);
    return false;
  }

  if (hasActiveSession(userId)) {
    console.log('[SessionStore] User already has active session:', userId);
    return false;
  }

  userSessions.set(userId, {
    processing: true,
    lastActivity: Date.now(),
    messageQueue: [],
    lastMessage: null,
  });

  console.log('[SessionStore] Acquired session lock for user:', userId);
  return true;
}

/**
 * Release session lock for user
 * @param {string} userId - Telegram user ID
 */
export function releaseSessionLock(userId) {
  const session = userSessions.get(userId);
  if (session) {
    session.processing = false;
    session.lastActivity = Date.now();
    console.log('[SessionStore] Released session lock for user:', userId);
  }
}

/**
 * Record message activity for user
 * @param {string} userId - Telegram user ID
 * @param {string} message - Message text
 */
export function recordActivity(userId, message) {
  const session = userSessions.get(userId);
  if (session) {
    session.lastActivity = Date.now();
    session.lastMessage = message;
  }
}

/**
 * Get user's last message
 * @param {string} userId - Telegram user ID
 * @returns {string|null} Last message or null
 */
export function getLastMessage(userId) {
  const session = userSessions.get(userId);
  return session?.lastMessage || null;
}

/**
 * Cleanup stale sessions (call periodically)
 * @returns {number} Number of sessions cleaned up
 */
export function cleanupStaleSessions() {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, session] of userSessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      userSessions.delete(userId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log('[SessionStore] Cleaned up', cleaned, 'stale sessions');
  }

  return cleaned;
}

/**
 * Get session count for monitoring
 * @returns {number} Number of active sessions
 */
export function getSessionCount() {
  return userSessions.size;
}

// Run cleanup every minute
const cleanupInterval = setInterval(cleanupStaleSessions, 60000);

// Cleanup on process exit
process.on('exit', () => {
  clearInterval(cleanupInterval);
  userSessions.clear();
  console.log('[SessionStore] Cleanup complete');
});
```

**Timezone Extraction Utility**:
```javascript
// bot/utils.js - Add timezone extraction

/**
 * Extract timezone from Telegram user profile or use configured default
 *
 * Telegram Premium users may have timezone info in their profile.
 * For most users, we fall back to the configured USER_TIMEZONE env var.
 *
 * @param {Object} ctx - Telegram bot context
 * @param {string} defaultTimezone - Configured default timezone
 * @returns {string} Timezone identifier (e.g., 'Europe/Dublin', 'UTC')
 */
export function extractUserTimezone(ctx, defaultTimezone = 'UTC') {
  // Try to get timezone from user profile (Telegram Premium feature)
  // Note: This is not widely available, so we mostly use the default
  const userTimezone = ctx.from?.timezone;

  if (userTimezone && typeof userTimezone === 'number') {
    // Telegram provides timezone offset in hours (-12 to +14)
    // Convert to IANA timezone identifier (approximate)
    const offsetHours = userTimezone;
    const offsetMap = {
      '-11': 'Pacific/Niue',
      '-10': 'Pacific/Honolulu',
      '-9': 'America/Anchorage',
      '-8': 'America/Los_Angeles',
      '-7': 'America/Denver',
      '-6': 'America/Chicago',
      '-5': 'America/New_York',
      '-4': 'America/Halifax',
      '-3': 'America/Sao_Paulo',
      '-2': 'Atlantic/South_Georgia',
      '-1': 'Atlantic/Azores',
      '0': 'UTC',
      '1': 'Europe/Berlin',
      '2': 'Europe/Athens',
      '3': 'Europe/Moscow',
      '4': 'Asia/Dubai',
      '5': 'Asia/Karachi',
      '6': 'Asia/Dhaka',
      '7': 'Asia/Bangkok',
      '8': 'Asia/Shanghai',
      '9': 'Asia/Tokyo',
      '10': 'Australia/Sydney',
      '11': 'Pacific/Noumea',
      '12': 'Pacific/Auckland',
    };

    const ianaTimezone = offsetMap[String(offsetHours)];
    if (ianaTimezone) {
      console.log('[Utils] Extracted timezone from user profile:', ianaTimezone);
      return ianaTimezone;
    }
  }

  // Fallback to configured default
  const configuredTimezone = process.env.USER_TIMEZONE || defaultTimezone;
  console.log('[Utils] Using configured timezone:', configuredTimezone);
  return configuredTimezone;
}

/**
 * Validate timezone identifier
 * @param {string} timezone - Timezone identifier to validate
 * @returns {boolean} True if valid timezone
 */
export function isValidTimezone(timezone) {
  try {
    // Check if timezone is valid by trying to use it
    new Date().toLocaleString('en-US', { timeZone: timezone });
    return true;
  } catch (err) {
    return false;
  }
}
```

**Code Pattern**:
```javascript
// bot/commands.js - Add after existing command registrations
import { handleMutationResult } from './handlers.js';
import { detectUrgentModeIntent, applyUrgentModeState } from './urgent-mode.js';
import { acquireSessionLock, releaseSessionLock, recordActivity, hasActiveSession } from './session-store.js';
import { extractUserTimezone } from './utils.js';
import { classifyError } from './error-classes.js';

export async function registerCommands(bot, pipeline, ticktick) {
    // ... existing command handlers ...

    // NEW: Free-form message handler for mutations
    bot.on('message:text', async (ctx) => {
        const userMessage = ctx.message?.text;
        const userId = String(ctx.from?.id);

        // Ignore empty messages silently
        if (!userMessage || userMessage.trim() === '') {
            console.log('[Bot] Ignored empty message from user:', userId);
            return;
        }

        // Skip command messages (starting with /)
        if (userMessage.startsWith('/')) {
            console.log('[Bot] Skipping command message:', userMessage);
            return;
        }

        // Check for active session (concurrent processing protection)
        if (hasActiveSession(userId)) {
            console.log('[Bot] User already processing, rejecting message:', userId);
            await ctx.reply('⏳ Processing your previous message, please wait...');
            return;
        }

        // Try to acquire session lock (includes debounce check)
        if (!acquireSessionLock(userId)) {
            console.log('[Bot] Could not acquire session lock:', userId);
            await ctx.reply('⏳ Still processing, please wait a moment...');
            return;
        }

        try {
            // Record activity for session tracking
            recordActivity(userId, userMessage);

            // Extract timezone from user profile or use configured default
            const userTimezone = extractUserTimezone(ctx, process.env.USER_TIMEZONE || 'UTC');

            // Detect urgent mode toggles first (priority over mutations)
            const urgentIntent = detectUrgentModeIntent(userMessage);
            if (urgentIntent) {
                console.log('[Bot] Detected urgent mode toggle:', urgentIntent.value);
                await applyUrgentModeState(ctx, urgentIntent.value, {
                    source: 'natural-language',
                    originalMessage: userMessage,
                    timezone: userTimezone,
                });
                return;
            }

            // Process as potential mutation
            console.log('[Bot] Processing mutation message:', userMessage.substring(0, 50));

            const result = await pipeline.processMessage(userMessage, {
                entryPoint: 'telegram:mutation',
                mode: 'mutation',
                availableProjects: ticktick.getLastFetchedProjects(),
                userId: userId,
                timezone: userTimezone,
                currentDate: new Date().toISOString(),
            });

            // Handle result (task, clarification, error, not-found)
            await handleMutationResult(ctx, result, {
                userMessage,
                userId,
                timezone: userTimezone,
            });

        } catch (err) {
            console.error('[Bot] Message handler error:', err.message, err.stack);

            // Classify error for user-friendly message
            const errorClass = classifyError(err);
            console.log('[Bot] Error classified as:', errorClass);

            await handleMutationResult(ctx, {
                type: 'error',
                failure: { class: errorClass, message: err.message },
                confirmationText: err.message,
            }, {
                userMessage,
                userId,
                timezone: 'UTC',
            });
        } finally {
            // Always release session lock
            releaseSessionLock(userId);
        }
    });
}
```

**Testing Notes**:
- Test with various message formats (commands, free-form, empty)
- Verify urgent mode detection takes priority
- Confirm `entryPoint` logged correctly for analytics
- Test error handling with mock pipeline failures
- Test session locking with concurrent message simulation
- Verify session cleanup after timeout
- Test debounce logic with rapid message bursts
- Test timezone extraction with various user profiles
- Test fallback to configured default timezone

---

### T052: Implement Mutation Result Type Handling

**Purpose**: Handle all mutation pipeline result types (task, clarification, error, not-found) with appropriate user-facing responses, complete result type definitions, Telegram inline keyboard specifications, and terseness validation.

**Context**: The pipeline returns different result types based on mutation outcome. Each type requires different user-facing formatting and behavior. This subtask implements comprehensive result handling with proper JSDoc type definitions, error class enumeration, and Telegram-specific formatting utilities.

**Result Type Definitions**:
```javascript
// bot/handlers.js - Result type definitions with JSDoc

/**
 * @typedef {Object} TaskResult
 * @property {'task'} type - Result type identifier
 * @property {string} taskId - TickTick task ID
 * @property {string} taskTitle - Original task title
 * @property {'complete'|'delete'|'update'} mutationType - Type of mutation performed
 * @property {string} confirmationText - Human-readable confirmation message
 * @property {number} [confidence] - Match confidence score (0.0-1.0)
 * @property {Array} [results] - Execution results from adapter
 * @property {Array} [warnings] - Non-blocking warnings from pipeline
 */

/**
 * @typedef {Object} TaskCandidate
 * @property {string} taskId - TickTick task ID
 * @property {string} title - Task title
 * @property {string} [projectName] - Project name if available
 * @property {string} [dueDate] - Due date in ISO format
 * @property {number} confidence - Match confidence score (0.0-1.0)
 */

/**
 * @typedef {Object} ClarificationResult
 * @property {'clarification'} type - Result type identifier
 * @property {Array<TaskCandidate>} candidates - Array of possible matches
 * @property {'complete'|'delete'|'update'} mutationType - Intended mutation type
 * @property {string} targetQuery - Original user query
 * @property {Object} [intent] - Original intent from AX extraction
 */

/**
 * @typedef {'quota'|'network'|'auth'|'not_found'|'validation'|'unexpected'} ErrorClass
 * @description Classification of error types for user-friendly messaging
 */

/**
 * @typedef {Object} ErrorFailure
 * @property {ErrorClass} class - Error classification
 * @property {string} [message] - Original error message
 * @property {boolean} [retryable] - Whether error is retryable
 * @property {string} [code] - Error code if available
 * @property {Object} [details] - Additional error details
 */

/**
 * @typedef {Object} ErrorResult
 * @property {'error'} type - Result type identifier
 * @property {ErrorFailure} failure - Error details
 * @property {string} [confirmationText] - Optional error message from pipeline
 * @property {Error} [originalError] - Original error object for logging
 * @property {Array<string>} [errors] - Developer-mode error diagnostics
 */

/**
 * @typedef {Object} NotFoundResult
 * @property {'not_found'} type - Result type identifier
 * @property {string} targetQuery - Query that was searched
 * @property {Array<TaskCandidate>} [candidates] - Close matches if any
 * @property {'complete'|'delete'|'update'} [mutationType] - Intended mutation type
 */

/**
 * @typedef {TaskResult|ClarificationResult|ErrorResult|NotFoundResult} MutationResult
 * @description Union type of all possible mutation pipeline results
 */

/**
 * @typedef {Object} HandlerContext
 * @property {string} userMessage - Original user message
 * @property {string} userId - Telegram user ID
 * @property {string} timezone - User timezone for date calculations
 */
```

**Error Class Enumeration**:
```javascript
// bot/error-classes.js - NEW file

/**
 * Error class configuration with user messages and retryable flags
 * @enum {{class: ErrorClass, retryable: boolean, userMessage: string, emoji: string}}
 */
export const ERROR_CLASSES = {
  QUOTA: {
    class: 'quota',
    retryable: true,
    userMessage: 'AI quota exhausted. Please try again shortly.',
    emoji: '⚠️',
  },
  NETWORK: {
    class: 'network',
    retryable: true,
    userMessage: 'Network error. Please check your connection and try again.',
    emoji: '🌐',
  },
  AUTH: {
    class: 'auth',
    retryable: false,
    userMessage: 'Authentication required. Please reconnect TickTick.',
    emoji: '🔒',
  },
  NOT_FOUND: {
    class: 'not_found',
    retryable: false,
    userMessage: 'Task not found. Try being more specific.',
    emoji: '❌',
  },
  VALIDATION: {
    class: 'validation',
    retryable: true,
    userMessage: 'Could not validate request. Please rephrase.',
    emoji: '⚠️',
  },
  UNEXPECTED: {
    class: 'unexpected',
    retryable: true,
    userMessage: 'Operation failed. Please try again.',
    emoji: '❌',
  },
};

/**
 * Classify error into user-friendly category
 * @param {Error} err - Error object
 * @returns {ErrorClass} Error classification
 */
export function classifyError(err) {
  if (!err) return 'unexpected';

  const message = (err.message || '').toLowerCase();
  const code = err.code || '';

  // Quota errors
  if (message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('limit') ||
      code === 'QUOTA_EXHAUSTED') {
    return 'quota';
  }

  // Network errors
  if (message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('connect') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ENOTFOUND')) {
    return 'network';
  }

  // Auth errors
  if (message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('token') ||
      message.includes('permission') ||
      message.includes('401') ||
      message.includes('403')) {
    return 'auth';
  }

  // Not found errors
  if (message.includes('not found') ||
      message.includes('not exist') ||
      code === 'NOT_FOUND') {
    return 'not_found';
  }

  // Validation errors
  if (message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('malformed')) {
    return 'validation';
  }

  // Default to unexpected
  return 'unexpected';
}

/**
 * Get user-friendly error message for error class
 * @param {ErrorClass} errorClass - Error classification
 * @returns {{message: string, emoji: string, retryable: boolean}} Error configuration
 */
export function getErrorConfig(errorClass) {
  const config = ERROR_CLASSES[errorClass.toUpperCase()];
  return config || ERROR_CLASSES.UNEXPECTED;
}

/**
 * Check if error is retryable
 * @param {Error} err - Error object
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(err) {
  const errorClass = classifyError(err);
  const config = getErrorConfig(errorClass);
  return config.retryable;
}
```

**Files to Create/Modify**:
- `bot/handlers.js` (NEW file, +180 lines for comprehensive result handling)
- `bot/clarification.js` (NEW file, +100 lines stub for T061)
- `bot/utils.js` (+60 lines for terseness validation and formatting utilities)
- `bot/error-classes.js` (NEW file, +80 lines for error class enumeration)

**Validation Criteria**:
- [ ] `task` results show terse confirmation with ✅ emoji
- [ ] `clarification` results trigger inline keyboard (tested in T061)
- [ ] `error` results show user-friendly message with quota-aware handling
- [ ] `not-found` results suggest alternatives when close matches exist
- [ ] Default case handles non-actionable messages gracefully
- [ ] All responses use `replyWithMarkdown()` for consistent formatting
- [ ] Error classes properly categorized with retryable flags
- [ ] Terseness validation ensures messages under 150 characters
- [ ] Task titles truncated to 50 chars in confirmations
- [ ] All result types logged for observability

**Edge Cases**:
- Quota exhaustion → specific message with retry hint
- Pipeline returns null → generic error message
- Result type unknown → fallback to "not actionable" response
- Network error → suggest checking connection
- Task not found with close matches → show suggestions
- Auth error → provide reconnection instructions
- Very long task titles → truncate to 50 chars in confirmation
- Multiple errors in result → show most relevant error
- Confirmation text missing → build from task title

**Terseness Validation Utility**:
```javascript
// bot/utils.js - Add terseness validation

const MAX_CONFIRMATION_LENGTH = 150;
const MAX_TITLE_DISPLAY = 50;
const MAX_ERROR_LENGTH = 200;

/**
 * Validate that confirmation message is terse (under character limit)
 * @param {string} message - Confirmation message
 * @param {number} [maxLength=MAX_CONFIRMATION_LENGTH] - Maximum length
 * @returns {boolean} True if message meets terseness requirements
 */
export function validateTerseness(message, maxLength = MAX_CONFIRMATION_LENGTH) {
  if (!message) return true;
  return message.length <= maxLength;
}

/**
 * Truncate task title for display with ellipsis
 * @param {string} title - Task title
 * @param {number} [maxLength=MAX_TITLE_DISPLAY] - Maximum length
 * @returns {string} Truncated title
 */
export function truncateTitle(title, maxLength = MAX_TITLE_DISPLAY) {
  if (!title) return '';
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 3) + '...';
}

/**
 * Build terse confirmation message
 * @param {string} emoji - Emoji prefix
 * @param {string} action - Action text (e.g., "Completed", "Deleted")
 * @param {string} title - Task title
 * @returns {string} Formatted confirmation
 */
export function buildTerseConfirmation(emoji, action, title) {
  const truncated = truncateTitle(title);
  const message = `${emoji} ${action}: ${truncated}`;

  if (!validateTerseness(message)) {
    console.warn('[BotUtils] Confirmation message exceeds terseness limit:', message.length, 'chars');
  }

  return message;
}

/**
 * Format error message for user display
 * @param {string} message - Error message
 * @param {ErrorClass} errorClass - Error classification
 * @returns {string} Formatted error message
 */
export function formatErrorMessage(message, errorClass) {
  const config = getErrorConfig(errorClass);
  const truncated = truncateTitle(message, MAX_ERROR_LENGTH);
  return `${config.emoji} **${config.userMessage}**`;
}

/**
 * Reply with Markdown formatting
 * @param {Object} ctx - Telegram bot context
 * @param {string} text - Message text
 * @param {Object} [options] - Additional options
 * @returns {Promise<Object>} Telegram message result
 */
export async function replyWithMarkdown(ctx, text, options = {}) {
  try {
    return await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...options,
    });
  } catch (err) {
    console.warn('[BotUtils] Markdown parse failed, falling back to plain text:', err.message);
    return await ctx.reply(text.replace(/\*\*/g, ''), options);
  }
}

/**
 * Edit message with Markdown formatting
 * @param {Object} ctx - Telegram bot context
 * @param {string} text - Message text
 * @param {Object} [options] - Additional options
 * @returns {Promise<Object>} Telegram message result
 */
export async function editWithMarkdown(ctx, text, options = {}) {
  try {
    return await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...options,
    });
  } catch (err) {
    console.warn('[BotUtils] Edit message failed:', err.message);
    throw err;
  }
}
```

**Code Pattern**:
```javascript
// bot/handlers.js - NEW file
import { sendClarification } from './clarification.js';
import { replyWithMarkdown, buildTerseConfirmation, truncateTitle } from './utils.js';
import { getErrorConfig, classifyError } from './error-classes.js';

/**
 * Handle mutation pipeline result and format user-facing response
 * @param {Object} ctx - Telegram bot context
 * @param {MutationResult} result - Mutation result from pipeline
 * @param {HandlerContext} context - Handler context (userMessage, userId, timezone)
 */
export async function handleMutationResult(ctx, result, context = {}) {
  const { userMessage, userId, timezone } = context;

  // Handle null/undefined result
  if (!result) {
    console.warn('[Handler] Null result received for user:', userId);
    await replyWithMarkdown(ctx, '⚠️ Could not process your request. Please try again.');
    return;
  }

  // Log result for observability
  console.log('[Handler] Processing result type:', result.type, 'for user:', userId);

  switch (result.type) {
    case 'task':
      // Terse confirmation with emoji
      await handleTaskResult(ctx, result);
      break;

    case 'clarification':
      // Delegate to clarification UI (WP06)
      await sendClarification(ctx, result);
      break;

    case 'error':
      // User-friendly error with quota-aware handling
      await handleErrorResponse(ctx, result);
      break;

    case 'not_found':
      // Task not found - suggest alternatives
      await handleNotFoundResponse(ctx, result);
      break;

    default:
      // Unknown result type - fallback
      await ctx.reply('💭 No actionable task detected.');
      console.warn('[Handler] Unknown mutation result type:', result.type);
  }
}

/**
 * Handle successful task mutation result
 * @param {Object} ctx - Telegram bot context
 * @param {TaskResult} result - Task result from pipeline
 */
async function handleTaskResult(ctx, result) {
  const { confirmationText, taskId, mutationType, taskTitle, results } = result;

  // Build terse confirmation with emoji based on mutation type
  const emoji = {
    complete: '✅',
    delete: '🗑️',
    update: '📝',
  }[mutationType] || '✅';

  const action = {
    complete: 'Completed',
    delete: 'Deleted',
    update: 'Updated',
  }[mutationType] || 'Processed';

  // Use provided confirmation text or build from title
  let message;
  if (confirmationText) {
    // Strip common prefixes from confirmation text
    const cleanText = confirmationText.replace(/^(Completed|Deleted|Updated): /i, '');
    message = buildTerseConfirmation(emoji, action, cleanText);
  } else if (taskTitle) {
    message = buildTerseConfirmation(emoji, action, taskTitle);
  } else {
    message = `${emoji} ${action}: Task`;
  }

  await replyWithMarkdown(ctx, message);

  // Log for observability
  console.log('[Handler] Task mutation completed:', {
    type: mutationType,
    taskId,
    userId: ctx.from?.id,
  });
}

/**
 * Handle error result with user-friendly messaging
 * @param {Object} ctx - Telegram bot context
 * @param {ErrorResult} result - Error result from pipeline
 */
async function handleErrorResponse(ctx, result) {
  const { failure, confirmationText, errors } = result;
  const errorClass = failure?.class || 'unexpected';

  // Get error class configuration
  const errorConfig = getErrorConfig(errorClass);

  // Build user-friendly message
  let userMessage;
  if (confirmationText) {
    userMessage = confirmationText;
  } else {
    userMessage = errorConfig.userMessage;
  }

  // Add retry hint for retryable errors
  const retryHint = errorConfig.retryable ? '\n\nPlease try again.' : '';
  const fullMessage = `${errorConfig.emoji} **${userMessage}**${retryHint}`;

  await replyWithMarkdown(ctx, fullMessage);

  // Log error for observability (include stack trace in dev mode)
  const isDevMode = process.env.NODE_ENV !== 'production';
  console.error(`[Handler] Error: ${errorClass}`, {
    message: failure?.message,
    code: failure?.code,
    retryable: errorConfig.retryable,
    userId: ctx.from?.id,
    ...(isDevMode && { errors, stack: result.originalError?.stack }),
  });
}

/**
 * Handle not-found result with suggestions
 * @param {Object} ctx - Telegram bot context
 * @param {NotFoundResult} result - Not-found result from pipeline
 */
async function handleNotFoundResponse(ctx, result) {
  const { targetQuery, candidates, mutationType } = result;

  // No matches at all - suggest rephrasing
  if (!candidates || candidates.length === 0) {
    await replyWithMarkdown(ctx,
      `❌ Task not found: "${truncateTitle(targetQuery, 40)}"\n\n` +
      `Try being more specific or check the task name.`
    );
    return;
  }

  // Close matches exist - suggest them
  const topCandidates = candidates.slice(0, 3);
  const suggestions = topCandidates.map(c => `• ${truncateTitle(c.title, 40)}`).join('\n');

  const actionVerb = {
    complete: 'complete',
    delete: 'delete',
    update: 'update',
  }[mutationType] || 'find';

  await replyWithMarkdown(ctx,
    `❌ Task not found: "${truncateTitle(targetQuery, 40)}"\n\n` +
    `Did you mean:\n${suggestions}\n\n` +
    `Reply with the exact task name to ${actionVerb}.`
  );
}

/**
 * Format non-task result (clarification, error, not-found)
 * @param {ClarificationResult|ErrorResult|NotFoundResult} result - Non-task result
 * @returns {string} Formatted message for logging or debugging
 */
export function formatNonTaskResult(result) {
  if (!result) return 'null result';

  switch (result.type) {
    case 'clarification':
      return `Clarification needed: ${result.candidates.length} candidates for "${result.targetQuery}"`;
    case 'error':
      return `Error: ${result.failure?.class} - ${result.confirmationText || 'unknown error'}`;
    case 'not_found':
      return `Not found: "${result.targetQuery}"${result.candidates?.length ? ` (${result.candidates.length} close matches)` : ''}`;
    default:
      return `Unknown result type: ${result.type}`;
  }
}
```

**Telegram Inline Keyboard Specification**:
```javascript
// bot/clarification.js - Inline keyboard spec (stub for T061)

/**
 * Build inline keyboard for clarification UI
 * @param {Array<TaskCandidate>} candidates - Possible matches
 * @param {'complete'|'delete'|'update'} mutationType - Intended mutation
 * @returns {Object} Telegram inline keyboard structure
 */
export function buildClarificationKeyboard(candidates, mutationType) {
  const actionEmoji = {
    complete: '✅',
    delete: '🗑️',
    update: '📝',
  }[mutationType];

  return {
    inline_keyboard: candidates.slice(0, 5).map(candidate => [{
      text: `${actionEmoji} ${candidate.title.slice(0, 40)}${candidate.title.length > 40 ? '...' : ''}`,
      callback_data: `mutate:${candidate.taskId}`,
    }]),
  };
}

/**
 * Send clarification message with inline keyboard
 * @param {Object} ctx - Telegram bot context
 * @param {ClarificationResult} result - Clarification result from pipeline
 */
export async function sendClarification(ctx, result) {
  const { candidates, mutationType, targetQuery } = result;

  const message = `🤔 Multiple tasks match "${targetQuery.slice(0, 40)}${targetQuery.length > 40 ? '...' : ''}"\n\nSelect the correct task:`;

  await ctx.reply(message, {
    reply_markup: buildClarificationKeyboard(candidates, mutationType),
    parse_mode: 'Markdown',
  });
}
```

**Testing Notes**:
- Test each result type with mock pipeline responses
- Verify quota exhaustion shows specific message
- Test not-found with and without close matches
- Confirm emoji correct for each mutation type (complete/delete/update)
- Test terseness validation with long task titles
- Verify error classification works for all error types
- Test inline keyboard rendering with various candidate counts
- Test Markdown parsing with special characters
- Test fallback to plain text when Markdown fails

---

### T053: Add Optional /done and /delete Command Handlers

**Purpose**: Provide power users with explicit command syntax for common mutations, including pending action state management, confirmation timeout logic, rate limiting middleware, and argument parsing with quote support.

**Context**: While free-form messages work for most users, power users prefer explicit commands for common operations. These commands wrap the query in mutation syntax and route through the same pipeline. This subtask adds comprehensive command handling with argument parsing, rate limiting, and undo window support.

**Implementation Steps**:
1. Add `/done <task query>` command handler
2. Add `/delete <task query>` command handler
3. Both commands wrap the message in mutation syntax and call pipeline
4. Include usage hints when called without arguments
5. Respect `guardAccess()` authorization
6. Implement pending action state management in store
7. Add confirmation timeout/expiration logic (5-minute window)
8. Build argument parsing with quote support for multi-word queries
9. Implement rate limiting middleware (3 commands per minute)
10. Document command precedence (commands override free-form)
11. Specify undo window implementation (30-second revert capability)

**Files to Create/Modify**:
- `bot/commands.js` (+150 lines for command handlers with rate limiting)
- `bot/rate-limiter.js` (NEW file, +80 lines for rate limiting middleware)
- `bot/pending-actions.js` (NEW file, +70 lines for pending action state)
- `bot/utils.js` (+50 lines for argument parsing utilities)

**Validation Criteria**:
- [ ] `/done` without args shows usage hint with examples
- [ ] `/done buy groceries` processes as complete mutation
- [ ] `/delete` without args shows usage hint with examples
- [ ] `/delete old task` processes as delete mutation
- [ ] Both commands use correct `entryPoint` for observability
- [ ] Both commands respect `guardAccess()` authorization
- [ ] Errors caught and user shown friendly message
- [ ] Rate limiting prevents spam (3 commands/minute max)
- [ ] Argument parsing handles quoted strings correctly
- [ ] Pending actions expire after 5 minutes
- [ ] Undo window tracked for potential revert

**Edge Cases**:
- Query with special characters → pass through unchanged
- Very long query → pipeline handles truncation
- Task not found → handled by `handleMutationResult()`
- User not authorized → `guardAccess()` prevents processing
- Command called while TickTick disconnected → mutation still processes (pipeline handles auth check)
- Rapid command execution → rate limiter rejects with "slow down" message
- Quoted arguments → parsed as single query string
- Command precedence → explicit commands always processed (never treated as free-form)

**Rate Limiting Middleware**:
```javascript
// bot/rate-limiter.js - NEW file

const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 3; // 3 commands per minute

const userRequestLog = new Map();

/**
 * Check if user is rate limited
 * @param {string} userId - Telegram user ID
 * @returns {boolean} True if user is rate limited
 */
export function isRateLimited(userId) {
  const now = Date.now();
  const userLog = userRequestLog.get(userId) || [];

  // Filter to requests within window
  const recentRequests = userLog.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  // Add current request
  recentRequests.push(now);
  userRequestLog.set(userId, recentRequests);

  return false;
}

/**
 * Get remaining seconds until rate limit resets
 * @param {string} userId - Telegram user ID
 * @returns {number} Seconds until oldest request expires
 */
export function getRateLimitResetTime(userId) {
  const userLog = userRequestLog.get(userId) || [];
  if (userLog.length === 0) return 0;

  const oldestRequest = Math.min(...userLog);
  const resetTime = oldestRequest + RATE_LIMIT_WINDOW_MS;
  const remaining = Math.ceil((resetTime - Date.now()) / 1000);

  return Math.max(0, remaining);
}

/**
 * Record command request for rate limiting
 * @param {string} userId - Telegram user ID
 */
export function recordCommandRequest(userId) {
  const userLog = userRequestLog.get(userId) || [];
  userLog.push(Date.now());
  userRequestLog.set(userId, userLog);
}

/**
 * Cleanup old rate limit entries (call periodically)
 * @returns {number} Number of entries cleaned up
 */
export function cleanupRateLimitEntries() {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, timestamps] of userRequestLog.entries()) {
    const recent = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      userRequestLog.delete(userId);
      cleaned++;
    } else {
      userRequestLog.set(userId, recent);
    }
  }

  if (cleaned > 0) {
    console.log('[RateLimiter] Cleaned up', cleaned, 'stale rate limit entries');
  }

  return cleaned;
}

/**
 * Get rate limit status for user
 * @param {string} userId - Telegram user ID
 * @returns {{limited: boolean, remaining: number, resetSeconds: number}} Rate limit status
 */
export function getRateLimitStatus(userId) {
  const userLog = userRequestLog.get(userId) || [];
  const now = Date.now();
  const recent = userLog.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

  return {
    limited: recent.length >= RATE_LIMIT_MAX_REQUESTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - recent.length),
    resetSeconds: recent.length > 0 ? Math.ceil((Math.min(...recent) + RATE_LIMIT_WINDOW_MS - now) / 1000) : 0,
  };
}

// Run cleanup every 5 minutes
const cleanupInterval = setInterval(cleanupRateLimitEntries, 300000);

// Cleanup on process exit
process.on('exit', () => {
  clearInterval(cleanupInterval);
  userRequestLog.clear();
  console.log('[RateLimiter] Cleanup complete');
});
```

**Pending Action State Management**:
```javascript
// bot/pending-actions.js - NEW file

const PENDING_ACTION_TIMEOUT_MS = 300000; // 5 minutes
const UNDO_WINDOW_MS = 30000; // 30 seconds for undo

const pendingActions = new Map();

/**
 * Store pending action for user
 * @param {string} userId - Telegram user ID
 * @param {Object} action - Pending action details
 * @param {'complete'|'delete'|'update'} action.type - Action type
 * @param {string} action.taskId - Target task ID
 * @param {string} action.query - Original query
 * @param {Object} [action.result] - Pipeline result
 */
export function storePendingAction(userId, action) {
  const now = Date.now();

  pendingActions.set(userId, {
    ...action,
    timestamp: now,
    expiresAt: now + PENDING_ACTION_TIMEOUT_MS,
    undoExpiresAt: now + UNDO_WINDOW_MS,
  });

  console.log('[PendingActions] Stored pending action for user:', userId, 'type:', action.type);
}

/**
 * Get pending action for user
 * @param {string} userId - Telegram user ID
 * @returns {Object|null} Pending action or null if none/expired
 */
export function getPendingAction(userId) {
  const action = pendingActions.get(userId);
  if (!action) return null;

  // Check if expired
  if (Date.now() > action.expiresAt) {
    console.log('[PendingActions] Pending action expired for user:', userId);
    pendingActions.delete(userId);
    return null;
  }

  return action;
}

/**
 * Clear pending action for user
 * @param {string} userId - Telegram user ID
 */
export function clearPendingAction(userId) {
  const had = pendingActions.has(userId);
  pendingActions.delete(userId);

  if (had) {
    console.log('[PendingActions] Cleared pending action for user:', userId);
  }
}

/**
 * Check if action is within undo window
 * @param {string} userId - Telegram user ID
 * @returns {boolean} True if action can be undone
 */
export function isWithinUndoWindow(userId) {
  const action = pendingActions.get(userId);
  if (!action) return false;

  return Date.now() - action.timestamp < UNDO_WINDOW_MS;
}

/**
 * Check if action is expired
 * @param {string} userId - Telegram user ID
 * @returns {boolean} True if action is expired
 */
export function isExpired(userId) {
  const action = pendingActions.get(userId);
  if (!action) return true;

  return Date.now() > action.expiresAt;
}

/**
 * Cleanup expired pending actions (call periodically)
 * @returns {number} Number of actions cleaned up
 */
export function cleanupExpiredActions() {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, action] of pendingActions.entries()) {
    if (now > action.expiresAt) {
      pendingActions.delete(userId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log('[PendingActions] Cleaned up', cleaned, 'expired actions');
  }

  return cleaned;
}

/**
 * Get pending action count for monitoring
 * @returns {number} Number of pending actions
 */
export function getPendingActionCount() {
  return pendingActions.size;
}

// Run cleanup every minute
const cleanupInterval = setInterval(cleanupExpiredActions, 60000);

// Cleanup on process exit
process.on('exit', () => {
  clearInterval(cleanupInterval);
  pendingActions.clear();
  console.log('[PendingActions] Cleanup complete');
});
```

**Argument Parsing Utility**:
```javascript
// bot/utils.js - Add argument parsing

/**
 * Parse command arguments with quote support
 * @param {string} args - Raw argument string
 * @returns {string} Parsed query with quotes removed
 */
export function parseCommandArgs(args) {
  if (!args || args.trim() === '') {
    return '';
  }

  // Remove surrounding quotes if present
  const trimmed = args.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * Validate command query length
 * @param {string} query - User query
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateCommandQuery(query) {
  if (!query || query.trim() === '') {
    return { valid: false, error: 'Query cannot be empty' };
  }

  if (query.length > 200) {
    return { valid: false, error: 'Query too long (max 200 characters)' };
  }

  return { valid: true };
}

/**
 * Build usage hint for command
 * @param {string} command - Command name (done, delete)
 * @returns {string} Usage hint with examples
 */
export function buildUsageHint(command) {
  const examples = {
    done: [
      '/done buy groceries',
      '/done "call mom"',
      '/done meeting with team',
    ],
    delete: [
      '/delete old wifi task',
      '/delete "meeting notes"',
      '/delete grocery list',
    ],
  };

  const commandExamples = examples[command] || examples.done;

  return (
    `Usage: /${command} <task query>\n\n` +
    `Examples:\n` +
    commandExamples.map(ex => `• ${ex}`).join('\n')
  );
}
```

**Code Pattern**:
```javascript
// bot/commands.js - Add after existing handlers including T051 message handler
import { handleMutationResult } from './handlers.js';
import { guardAccess } from './auth.js';
import { isRateLimited, getRateLimitResetTime, recordCommandRequest } from './rate-limiter.js';
import { parseCommandArgs, validateCommandQuery, buildUsageHint } from './utils.js';
import { storePendingAction, clearPendingAction } from './pending-actions.js';

export async function registerCommands(bot, pipeline, ticktick) {
    // ... existing handlers including T051 message handler ...

    // NEW: /done command for completing tasks
    bot.command('done', async (ctx) => {
        if (!await guardAccess(ctx)) return;

        const userId = String(ctx.from?.id);

        // Check rate limiting
        if (isRateLimited(userId)) {
            const resetSeconds = getRateLimitResetTime(userId);
            await ctx.reply(`⏱️ Please wait ${resetSeconds}s before sending another command.`);
            return;
        }

        // Parse arguments with quote support
        const rawQuery = ctx.match || '';
        const query = parseCommandArgs(rawQuery);

        // Validate query
        const validation = validateCommandQuery(query);
        if (!validation.valid) {
            await ctx.reply(
                `❌ ${validation.error}\n\n` +
                buildUsageHint('done')
            );
            return;
        }

        try {
            // Record command for rate limiting
            recordCommandRequest(userId);

            // Wrap in mutation syntax and process
            const result = await pipeline.processMessage(`done ${query}`, {
                entryPoint: 'telegram:command:done',
                mode: 'mutation',
                availableProjects: ticktick.getLastFetchedProjects(),
                userId: userId,
                timezone: process.env.USER_TIMEZONE || 'UTC',
            });

            // Store pending action for potential undo
            if (result.type === 'task') {
                storePendingAction(userId, {
                    type: 'complete',
                    taskId: result.taskId,
                    query: query,
                    result: result,
                });
            }

            await handleMutationResult(ctx, result, {
                userMessage: `done ${query}`,
                userId,
            });
        } catch (err) {
            console.error('/done command error:', err.message, err.stack);
            await ctx.reply('⚠️ Could not process your request. Please try again.');
        }
    });

    // NEW: /delete command for deleting tasks
    bot.command('delete', async (ctx) => {
        if (!await guardAccess(ctx)) return;

        const userId = String(ctx.from?.id);

        // Check rate limiting
        if (isRateLimited(userId)) {
            const resetSeconds = getRateLimitResetTime(userId);
            await ctx.reply(`⏱️ Please wait ${resetSeconds}s before sending another command.`);
            return;
        }

        // Parse arguments with quote support
        const rawQuery = ctx.match || '';
        const query = parseCommandArgs(rawQuery);

        // Validate query
        const validation = validateCommandQuery(query);
        if (!validation.valid) {
            await ctx.reply(
                `❌ ${validation.error}\n\n` +
                buildUsageHint('delete')
            );
            return;
        }

        try {
            // Record command for rate limiting
            recordCommandRequest(userId);

            // Wrap in mutation syntax and process
            const result = await pipeline.processMessage(`delete ${query}`, {
                entryPoint: 'telegram:command:delete',
                mode: 'mutation',
                availableProjects: ticktick.getLastFetchedProjects(),
                userId: userId,
                timezone: process.env.USER_TIMEZONE || 'UTC',
            });

            // Store pending action for potential undo
            if (result.type === 'task') {
                storePendingAction(userId, {
                    type: 'delete',
                    taskId: result.taskId,
                    query: query,
                    result: result,
                });
            }

            await handleMutationResult(ctx, result, {
                userMessage: `delete ${query}`,
                userId,
            });
        } catch (err) {
            console.error('/delete command error:', err.message, err.stack);
            await ctx.reply('⚠️ Could not process your request. Please try again.');
        }
    });

    // Optional: /undo command for reverting recent actions (future enhancement)
    bot.command('undo', async (ctx) => {
        if (!await guardAccess(ctx)) return;

        const userId = String(ctx.from?.id);
        const pendingAction = getPendingAction(userId);

        if (!pendingAction) {
            await ctx.reply('❌ No recent action to undo.');
            return;
        }

        if (!isWithinUndoWindow(userId)) {
            await ctx.reply('❌ Undo window expired (30 seconds).');
            clearPendingAction(userId);
            return;
        }

        // TODO: Implement undo logic (requires pipeline support)
        await ctx.reply('🚧 Undo functionality coming soon.');
        clearPendingAction(userId);
    });
}
```

**Command Precedence Documentation**:
```markdown
## Command Precedence Rules

1. **Commands Always Win**: Messages starting with `/` are ALWAYS treated as commands, never as free-form mutations
2. **Urgent Mode Priority**: Urgent mode toggles detected BEFORE mutation processing (both commands and free-form)
3. **Command Routing**: `/done` and `/delete` wrap query in mutation syntax, route through same pipeline as free-form
4. **Observability**: Commands use distinct `entryPoint` values for analytics:
   - Free-form: `telegram:mutation`
   - /done command: `telegram:command:done`
   - /delete command: `telegram:command:delete`
5. **Rate Limiting**: Only applies to explicit commands, not free-form messages (future: add free-form rate limiting)
6. **Authorization**: Both commands and free-form respect `guardAccess()` authorization
7. **Session Locking**: Both commands and free-form share the same session lock per user
```

**Testing Notes**:
- Test both commands with and without arguments
- Verify usage hints show correct examples
- Confirm `entryPoint` logged as `telegram:command:done` or `telegram:command:delete`
- Test authorization failures with mock `guardAccess()` returning false
- Test with special characters in query (quotes, emojis, unicode)
- Test rate limiting with rapid command bursts
- Test argument parsing with quoted strings
- Test pending action storage and expiration
- Test undo window timing
- Test timezone extraction and passing to pipeline

---

### T054: Write Bot Integration Tests

**Purpose**: Comprehensive test coverage for bot message handler and mutation result handling with complete mock setup, sample fixtures, detailed coverage breakdown, and 80+ complete tests.

**Context**: Bot handlers are critical user-facing code. Comprehensive tests ensure all code paths work correctly and edge cases are handled gracefully. This subtask provides complete test infrastructure with mock objects, pipeline harness integration, and detailed coverage metrics.

**Implementation Steps**:
1. Create `tests/bot-mutation.test.js` with 300+ lines, 80+ tests
2. Test message routing (command vs. free-form)
3. Test result type handling (task, clarification, error, not-found)
4. Test `/done` and `/delete` command handlers
5. Test edge cases (empty messages, quota exhaustion, disconnected state)
6. Test authorization failures
7. Test urgent mode priority over mutations
8. Test session locking and rate limiting
9. Test argument parsing with quotes
10. Test pending action management
11. Document test runner configuration
12. Provide coverage breakdown by function

**Test Structure**:
```javascript
// tests/bot-mutation.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerCommands } from '../bot/commands.js';
import { handleMutationResult } from '../bot/handlers.js';
import { hasActiveSession, acquireSessionLock, releaseSessionLock, cleanupStaleSessions } from '../bot/session-store.js';
import { isRateLimited, getRateLimitResetTime, cleanupRateLimitEntries } from '../bot/rate-limiter.js';
import { parseCommandArgs, validateCommandQuery, buildUsageHint } from '../bot/utils.js';
import { storePendingAction, getPendingAction, clearPendingAction, isWithinUndoWindow } from '../bot/pending-actions.js';
import { classifyError, getErrorConfig, ERROR_CLASSES } from '../bot/error-classes.js';

// ============================================
// Mock Helpers
// ============================================

/**
 * Create mock Telegram bot instance
 * @returns {Object} Mock bot with event handlers
 */
function createMockBot() {
    const handlers = {
        message: [],
        command: {},
        callbackQuery: [],
    };

    return {
        on: (event, handler) => {
            if (event === 'message:text') handlers.message.push(handler);
            if (event === 'callbackQuery') handlers.callbackQuery.push(handler);
        },
        command: (name, handler) => {
            handlers.command[name] = handler;
        },
        getHandlers: () => handlers,
    };
}

/**
 * Create mock Telegram context
 * @param {Object} overrides - Override default mock behavior
 * @returns {Object} Mock context
 */
function createMockContext(overrides = {}) {
    const replies = [];
    const edits = [];

    return {
        message: { text: '' },
        from: { id: 'test-user', username: 'testuser' },
        match: '',
        reply: async (msg, opts) => {
            replies.push({ msg, opts });
            return { message_id: 1 };
        },
        editMessageText: async (msg, opts) => {
            edits.push({ msg, opts });
            return true;
        },
        answerCallbackQuery: async (opts) => {},
        _replies: replies,
        _edits: edits,
        ...overrides,
    };
}

/**
 * Create mock pipeline
 * @param {Object} options - Mock options
 * @returns {Object} Mock pipeline
 */
function createMockPipeline(options = {}) {
    const calls = [];

    return {
        processMessage: async (message, context) => {
            calls.push({ message, context });

            if (options.throwError) {
                throw options.throwError;
            }

            return options.result || { type: 'task', confirmationText: 'Test', mutationType: 'complete' };
        },
        getCalls: () => calls,
    };
}

/**
 * Create mock TickTick adapter
 * @returns {Object} Mock adapter
 */
function createMockTickTick() {
    return {
        getLastFetchedProjects: () => [],
    };
}

// ============================================
// T051: Free-Form Message Handler Tests
// ============================================

test('message handler routes free-form messages to pipeline', async () => {
    const pipeline = createMockPipeline();
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const [messageHandler] = bot.getHandlers().message;
    const ctx = createMockContext({ message: { text: 'done buy groceries' } });

    await messageHandler(ctx);

    const calls = pipeline.getCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].message, 'done buy groceries');
    assert.equal(calls[0].context.mode, 'mutation');
    assert.equal(calls[0].context.entryPoint, 'telegram:mutation');
});

test('message handler ignores command messages', async () => {
    const pipeline = createMockPipeline();
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const [messageHandler] = bot.getHandlers().message;
    const ctx = createMockContext({ message: { text: '/done something' } });

    await messageHandler(ctx);

    const calls = pipeline.getCalls();
    assert.equal(calls.length, 0, 'Pipeline should not be called for commands');
});

test('message handler ignores empty messages', async () => {
    const pipeline = createMockPipeline();
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const [messageHandler] = bot.getHandlers().message;
    const ctx = createMockContext({ message: { text: '' } });

    await messageHandler(ctx);

    const calls = pipeline.getCalls();
    assert.equal(calls.length, 0, 'Pipeline should not be called for empty messages');
});

test('message handler ignores whitespace-only messages', async () => {
    const pipeline = createMockPipeline();
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const [messageHandler] = bot.getHandlers().message;
    const ctx = createMockContext({ message: { text: '   ' } });

    await messageHandler(ctx);

    const calls = pipeline.getCalls();
    assert.equal(calls.length, 0);
});

test('message handler detects urgent mode toggles before mutation', async () => {
    const pipeline = createMockPipeline();
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const [messageHandler] = bot.getHandlers().message;
    const ctx = createMockContext({ message: { text: 'turn on urgent mode' } });

    await messageHandler(ctx);

    // Urgent mode should be detected, mutation not processed
    const calls = pipeline.getCalls();
    assert.equal(calls.length, 0, 'Pipeline should not be called for urgent mode toggles');
});

test('message handler implements session locking', async () => {
    const pipeline = createMockPipeline();
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const [messageHandler] = bot.getHandlers().message;
    const userId = 'test-user-123';

    // First message should process
    const ctx1 = createMockContext({
        message: { text: 'done task 1' },
        from: { id: userId },
    });
    await messageHandler(ctx1);

    // Second message while processing should be rejected
    const ctx2 = createMockContext({
        message: { text: 'done task 2' },
        from: { id: userId },
    });
    await messageHandler(ctx2);

    // Should have reply about processing
    assert.ok(ctx2._replies.some(r => r.msg.includes('Processing') || r.msg.includes('processing')),
        'Should reply with processing message for concurrent request');
});

test('message handler extracts timezone from user profile', async () => {
    const pipeline = createMockPipeline();
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const [messageHandler] = bot.getHandlers().message;
    const ctx = createMockContext({
        message: { text: 'done task' },
        from: { id: 'user-1', timezone: 1 }, // Berlin timezone
    });

    await messageHandler(ctx);

    const calls = pipeline.getCalls();
    assert.equal(calls.length, 1);
    // Timezone should be extracted and passed to pipeline
    assert.ok(calls[0].context.timezone, 'Timezone should be set');
});

// ============================================
// T052: Mutation Result Type Handling Tests
// ============================================

test('handleMutationResult shows terse confirmation for task results', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'task',
        confirmationText: 'Completed: Buy groceries',
        mutationType: 'complete',
        taskId: 't1',
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].msg.includes('✅'), 'Should include checkmark emoji');
    assert.ok(ctx._replies[0].msg.includes('Completed: Buy groceries'));
});

test('handleMutationResult shows delete confirmation with trash emoji', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'task',
        confirmationText: 'Deleted: Old task',
        mutationType: 'delete',
        taskId: 't1',
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].msg.includes('🗑️'), 'Should include trash emoji for delete');
});

test('handleMutationResult shows update confirmation with pencil emoji', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'task',
        confirmationText: 'Updated: Meeting moved to tomorrow',
        mutationType: 'update',
        taskId: 't1',
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].msg.includes('📝'), 'Should include pencil emoji for update');
});

test('handleMutationResult triggers clarification UI for clarification results', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'clarification',
        candidates: [
            { taskId: 't1', title: 'Meeting A' },
            { taskId: 't2', title: 'Meeting B' },
        ],
        mutationType: 'complete',
    });

    // Clarification UI should be sent (tested in T064)
    assert.ok(ctx._replies.length > 0, 'Should send clarification UI');
});

test('handleMutationResult shows quota-aware error messages', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'error',
        failure: { class: 'quota' },
        confirmationText: 'AI quota exhausted',
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].msg.includes('AI quota exhausted'), 'Should mention quota');
    assert.ok(ctx._replies[0].msg.includes('try again'), 'Should suggest retry');
});

test('handleMutationResult shows network error message', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'error',
        failure: { class: 'network' },
        confirmationText: 'Network error',
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].msg.includes('Network error'), 'Should mention network');
    assert.ok(ctx._replies[0].msg.includes('connection'), 'Should suggest checking connection');
});

test('handleMutationResult shows generic error message', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'error',
        failure: { class: 'unknown' },
        confirmationText: 'Something went wrong',
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].msg.includes('❌'), 'Should include error emoji');
    assert.ok(ctx._replies[0].msg.includes('Something went wrong'));
});

test('handleMutationResult shows not-found with suggestions', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'not_found',
        targetQuery: 'nonexistent task',
        candidates: [
            { taskId: 't1', title: 'Existing task 1' },
            { taskId: 't2', title: 'Existing task 2' },
            { taskId: 't3', title: 'Existing task 3' },
        ],
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].msg.includes('nonexistent task'), 'Should mention query');
    assert.ok(ctx._replies[0].msg.includes('Did you mean'), 'Should show suggestions');
    assert.ok(ctx._replies[0].msg.includes('Existing task 1'), 'Should show top candidate');
});

test('handleMutationResult shows not-found without suggestions', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'not_found',
        targetQuery: 'completely unrelated',
        candidates: [],
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].msg.includes('Try being more specific'), 'Should suggest rephrasing');
});

test('handleMutationResult handles null result', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, null);

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].msg.includes('Could not process'), 'Should show error message');
});

// ============================================
// T053: Command Handler Tests
// ============================================

test('/done without args shows usage hint', async () => {
    const pipeline = createMockPipeline();
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const doneHandler = bot.getHandlers().command.done;
    const ctx = createMockContext({ match: '' });

    await doneHandler(ctx);

    assert.ok(ctx._replies[0].msg.includes('Usage'), 'Should show usage hint');
    assert.ok(ctx._replies[0].msg.includes('Examples'), 'Should show examples');
});

test('/done with query processes as complete mutation', async () => {
    const pipeline = createMockPipeline();
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const doneHandler = bot.getHandlers().command.done;
    const ctx = createMockContext({ match: 'buy groceries' });

    await doneHandler(ctx);

    const calls = pipeline.getCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].message, 'done buy groceries');
    assert.equal(calls[0].context.entryPoint, 'telegram:command:done');
});

test('/delete without args shows usage hint', async () => {
    const pipeline = createMockPipeline();
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const deleteHandler = bot.getHandlers().command.delete;
    const ctx = createMockContext({ match: '' });

    await deleteHandler(ctx);

    assert.ok(ctx._replies[0].msg.includes('Usage'), 'Should show usage hint');
    assert.ok(ctx._replies[0].msg.includes('Examples'), 'Should show examples');
});

test('/delete with query processes as delete mutation', async () => {
    const pipeline = createMockPipeline({
        result: { type: 'task', confirmationText: 'Deleted: Old task', mutationType: 'delete' },
    });
    const bot = createMockBot();
    const ticktick = createMockTickTick();

    await registerCommands(bot, pipeline, ticktick);

    const deleteHandler = bot.getHandlers().command.delete;
    const ctx = createMockContext({ match: 'old task' });

    await deleteHandler(ctx);

    const calls = pipeline.getCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].message, 'delete old task');
    assert.equal(calls[0].context.entryPoint, 'telegram:command:delete');
});

// ============================================
// Utility Function Tests
// ============================================

test('parseCommandArgs handles quoted strings', () => {
    assert.equal(parseCommandArgs('"buy groceries"'), 'buy groceries');
    assert.equal(parseCommandArgs("'call mom'"), 'call mom');
    assert.equal(parseCommandArgs('meeting'), 'meeting');
});

test('validateCommandQuery rejects empty query', () => {
    const result = validateCommandQuery('');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('empty'));
});

test('validateCommandQuery rejects long query', () => {
    const longQuery = 'a'.repeat(201);
    const result = validateCommandQuery(longQuery);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('long'));
});

test('validateCommandQuery accepts valid query', () => {
    const result = validateCommandQuery('buy groceries');
    assert.equal(result.valid, true);
});

test('buildUsageHint shows correct examples for done', () => {
    const hint = buildUsageHint('done');
    assert.ok(hint.includes('/done'));
    assert.ok(hint.includes('Examples'));
});

test('buildUsageHint shows correct examples for delete', () => {
    const hint = buildUsageHint('delete');
    assert.ok(hint.includes('/delete'));
    assert.ok(hint.includes('Examples'));
});

// ============================================
// Session Store Tests
// ============================================

test('acquireSessionLock prevents concurrent processing', () => {
    const userId = 'test-user';

    assert.equal(acquireSessionLock(userId), true, 'First lock should succeed');
    assert.equal(acquireSessionLock(userId), false, 'Second lock should fail');

    releaseSessionLock(userId);
});

test('releaseSessionLock allows new lock', () => {
    const userId = 'test-user';

    acquireSessionLock(userId);
    releaseSessionLock(userId);

    assert.equal(acquireSessionLock(userId), true, 'Lock after release should succeed');

    releaseSessionLock(userId);
});

test('hasActiveSession returns correct state', () => {
    const userId = 'test-user';

    assert.equal(hasActiveSession(userId), false, 'No session initially');

    acquireSessionLock(userId);
    assert.equal(hasActiveSession(userId), true, 'Session active after lock');

    releaseSessionLock(userId);
});

// ============================================
// Rate Limiter Tests
// ============================================

test('isRateLimited allows first 3 requests', () => {
    const userId = 'test-user';

    assert.equal(isRateLimited(userId), false);
    assert.equal(isRateLimited(userId), false);
    assert.equal(isRateLimited(userId), false);
    assert.equal(isRateLimited(userId), true, 'Fourth request should be limited');
});

test('getRateLimitResetTime returns seconds until reset', () => {
    const userId = 'test-user-2';

    isRateLimited(userId); // Record first request
    const resetTime = getRateLimitResetTime(userId);

    assert.ok(resetTime > 0, 'Reset time should be positive');
    assert.ok(resetTime <= 60, 'Reset time should be within 60 seconds');
});

// ============================================
// Pending Actions Tests
// ============================================

test('storePendingAction stores action', () => {
    const userId = 'test-user';

    storePendingAction(userId, {
        type: 'complete',
        taskId: 't1',
        query: 'test',
    });

    const action = getPendingAction(userId);
    assert.ok(action);
    assert.equal(action.type, 'complete');
    assert.equal(action.taskId, 't1');

    clearPendingAction(userId);
});

test('getPendingAction returns null for expired action', () => {
    const userId = 'test-user-expired';

    storePendingAction(userId, {
        type: 'delete',
        taskId: 't1',
        query: 'test',
    });

    // Simulate time travel (5+ minutes later)
    const originalNow = Date.now;
    Date.now = () => originalNow() + 6 * 60 * 1000;

    const action = getPendingAction(userId);
    assert.equal(action, null, 'Expired action should return null');

    Date.now = originalNow;
});

test('isWithinUndoWindow returns true for recent actions', () => {
    const userId = 'test-user-undo';

    storePendingAction(userId, {
        type: 'complete',
        taskId: 't1',
        query: 'test',
    });

    assert.equal(isWithinUndoWindow(userId), true, 'Recent action should be within undo window');

    clearPendingAction(userId);
});

// ============================================
// Error Classification Tests
// ============================================

test('classifyError identifies quota errors', () => {
    const err = new Error('QUOTA_EXHAUSTED: All API keys exhausted');
    assert.equal(classifyError(err), 'quota');
});

test('classifyError identifies network errors', () => {
    const err = new Error('Network timeout');
    assert.equal(classifyError(err), 'network');
});

test('classifyError identifies auth errors', () => {
    const err = new Error('Unauthorized: Invalid token');
    assert.equal(classifyError(err), 'auth');
});

test('classifyError identifies not_found errors', () => {
    const err = new Error('Task not found');
    assert.equal(classifyError(err), 'not_found');
});

test('classifyError defaults to unexpected', () => {
    const err = new Error('Random error');
    assert.equal(classifyError(err), 'unexpected');
});

test('getErrorConfig returns correct configuration', () => {
    const config = getErrorConfig('quota');
    assert.equal(config.class, 'quota');
    assert.equal(config.retryable, true);
    assert.ok(config.emoji);
    assert.ok(config.userMessage);
});

test('ERROR_CLASSES has all required error types', () => {
    assert.ok(ERROR_CLASSES.QUOTA);
    assert.ok(ERROR_CLASSES.NETWORK);
    assert.ok(ERROR_CLASSES.AUTH);
    assert.ok(ERROR_CLASSES.NOT_FOUND);
    assert.ok(ERROR_CLASSES.UNEXPECTED);
});
```

**Files to Create**:
- `tests/bot-mutation.test.js` (NEW file, ~300 lines, 80+ tests)

**Validation Criteria**:
- [ ] 80+ tests covering all bot handler scenarios
- [ ] Tests run with `node --test tests/bot-mutation.test.js`
- [ ] All tests pass with zero failures
- [ ] Message routing tested (command vs. free-form)
- [ ] Result type handling tested (task, clarification, error, not-found)
- [ ] Command handlers tested (/done, /delete)
- [ ] Edge cases covered (empty, quota, network, auth)
- [ ] Session locking tested
- [ ] Rate limiting tested
- [ ] Utility functions tested (parsing, validation, formatting)
- [ ] Error classification tested

**Edge Cases**:
- Empty messages → ignored silently
- Whitespace-only messages → ignored silently
- Concurrent messages → session lock prevents processing
- Rapid commands → rate limiter rejects
- Quoted arguments → parsed correctly
- Timezone extraction → uses user profile or default
- Expired pending actions → return null
- Unknown error types → default to unexpected

**Testing Notes**:
- Use mock objects for all external dependencies
- Test each result type independently
- Verify session locking with concurrent simulation
- Test rate limiting with rapid request bursts
- Test utility functions with edge case inputs
- Test error classification with various error messages
- Verify timezone extraction and passing to pipeline
- Test pending action expiration with mocked time

---

## Definition of Done

- [ ] `bot/commands.js` has free-form message handler for mutations
- [ ] `bot/handlers.js` exports `handleMutationResult()` with all result types
- [ ] `bot/session-store.js` implements session locking with debounce
- [ ] `bot/rate-limiter.js` implements rate limiting (3 commands/minute)
- [ ] `bot/pending-actions.js` implements pending action state with 5-minute expiration
- [ ] `bot/error-classes.js` exports error classification utilities
- [ ] `/done` and `/delete` commands implemented with argument parsing
- [ ] Timezone extraction works from user profile or configured default
- [ ] All result types handled (task, clarification, error, not-found)
- [ ] Terseness validation ensures messages under 150 characters
- [ ] Session locking prevents concurrent processing per user
- [ ] Rate limiting prevents command spam
- [ ] 80+ tests covering all scenarios
- [ ] All tests pass with zero failures

## Risks

- **Session memory leak**: Cleanup interval prevents unbounded growth
- **Rate limiting false positives**: 3 commands/minute is generous for normal use
- **Timezone extraction unreliable**: Falls back to configured default
- **Debounce window too short**: 2 seconds balances UX and duplicate prevention

## Reviewer Guidance

- Verify session locking logic handles concurrent requests correctly
- Check rate limiting window and threshold are appropriate
- Confirm timezone extraction has proper fallback
- Test error classification with real error messages
- Verify terseness validation catches long messages

## Activity Log

- Pending implementation
