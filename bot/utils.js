// Bot-layer utilities — Telegram-specific formatting and output wrappers
// Re-exports all shared domain utilities from services/shared-utils.js for backward compatibility
export {
    PRIORITY_MAP,
    PRIORITY_EMOJI,
    PRIORITY_LABEL,
    AUTHORIZED_CHAT_ID,
    isAuthorized,
    guardAccess,
    buildUndoEntry,
    USER_TZ,
    userNow,
    userTodayFormatted,
    userLocaleString,
    userTimeString,
    parseDateStringToTickTickISO,
    containsSensitiveContent,
    scheduleToDateTime,
    scheduleToDate,
    buildTickTickUpdate,
    buildTaskCard,
    buildImprovedContent,
    buildPendingData,
    buildPendingDataFromAction,
    pendingToAnalysis,
    buildTaskCardFromAction,
    buildAutoApplyNotification,
    sleep,
    truncateMessage,
    escapeHTML,
    parseTelegramMarkdownToHTML,
    replyWithMarkdown,
    editWithMarkdown,
    sendWithMarkdown,
    appendUrgentModeReminder,
    formatBriefingHeader,
    filterProcessedThisWeek,
    buildQuotaExhaustedMessage,
    formatProcessedTask,
    buildMutationCandidateKeyboard,
    buildMutationClarificationMessage,
    retryWithBackoff,
} from '../services/shared-utils.js';

/**
 * Format a pipeline error result for user-facing display.
 *
 * @param {Object} result - Pipeline error result with `confirmationText`, `isDevMode`, `diagnostics`
 * @param {Object} [options]
 * @param {boolean} [options.compact=false] - When true, collapse newlines to single-line separators
 * @returns {string} User-safe error message (never leaks internal diagnostics unless isDevMode)
 */
export function formatPipelineFailure(result, { compact = false } = {}) {
    if (!result) return '⚠️ Pipeline failed.';
    const diagnostics = result.isDevMode && Array.isArray(result.diagnostics) && result.diagnostics.length > 0
        ? `\n\n${result.diagnostics.join('\n')}`
        : '';
    const message = `${result.confirmationText || '⚠️ Pipeline failed.'}${diagnostics}`;
    return compact ? message.replace(/\n+/g, ' | ') : message;
}
