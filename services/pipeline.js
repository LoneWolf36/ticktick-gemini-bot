/**
 * services/pipeline.js
 * Orchestrates the full task processing flow:
 * Message -> Intent Extraction -> Normalization -> TickTick Adapter Execution
 */
import {
    createPipelineContextBuilder,
    snapshotPipelineValue,
    snapshotPrivacySafePipelineValue,
    sanitizePipelineContextForDiagnostics,
    updatePipelineContext,
    validatePipelineContext,
} from './pipeline-context.js';
import { createPipelineObservability } from './pipeline-observability.js';
import { QuotaExhaustedError } from './intent-extraction.js';
import { AIHardQuotaError, AIServiceUnavailableError, AIInvalidKeyError } from './gemini.js';
import { resolveTarget, buildClarificationPrompt } from './task-resolver.js';
import { buildMutationConfirmationMessage } from './shared-utils.js';
import { assertValidOperationReceipt } from './operation-receipt.js';

/**
 * Failure classes for pipeline errors.
 * @type {Record<string, string>}
 */
const FAILURE_CLASSES = {
    QUOTA: 'quota',
    MALFORMED_INTENT: 'malformed_intent',
    VALIDATION: 'validation',
    ADAPTER: 'adapter',
    ROLLBACK: 'rollback',
    UNEXPECTED: 'unexpected',
};

/**
 * Failure categories for classifying error severity and retryability.
 * @type {Record<string, string>}
 */
const FAILURE_CATEGORIES = {
    TRANSIENT: 'transient',
    PERMANENT: 'permanent',
    PARTIAL: 'partial',
};

/**
 * Failure classes for individual action execution.
 * @type {Record<string, string>}
 */
const ACTION_FAILURE_CLASSES = {
    NONE: 'none',
    VALIDATION: 'validation',
    ADAPTER: 'adapter',
    ROLLBACK: 'rollback',
};

/**
 * Reasons for a request being classified as non-task.
 * @type {Record<string, string>}
 */
const NON_TASK_REASONS = {
    EMPTY_INTENTS: 'empty_intents',
};

/**
 * User-facing messages for different failure classes.
 * @type {Record<string, string>}
 */
const USER_FAILURE_MESSAGES = {
    [FAILURE_CLASSES.QUOTA]: '⚠️ AI quota exhausted. Try again shortly.',
    [FAILURE_CLASSES.MALFORMED_INTENT]: '⚠️ I could not understand that request. Please rephrase.',
    [FAILURE_CLASSES.VALIDATION]: '⚠️ I could not validate the task details. Please clarify and retry.',
    [FAILURE_CLASSES.ADAPTER]: '⚠️ Task updates failed. Please retry shortly.',
    [FAILURE_CLASSES.ROLLBACK]: '⚠️ Task updates partially failed. Please check your tasks.',
    [FAILURE_CLASSES.UNEXPECTED]: '⚠️ An unexpected error occurred while processing your request.',
};

function getSafeErrorName(error) {
    return typeof error?.name === 'string' && error.name.trim()
        ? error.name.trim()
        : 'Error';
}

/**
 * Parses a non-negative integer from an environment variable with a fallback.
 * @param {string|undefined} value - Raw string value
 * @param {number} fallback - Fallback value
 * @returns {number} Parsed integer or fallback
 */
function parseNonNegativeIntEnv(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Gets the retry configuration for the pipeline from environment variables.
 * @returns {{ maxRetries: number, baseDelayMs: number, maxDelayMs: number }}
 */
function getPipelineRetryConfig() {
    const maxRetries = parseNonNegativeIntEnv(process.env.PIPELINE_TRANSIENT_MAX_RETRIES, 1);
    const baseDelayMs = parseNonNegativeIntEnv(process.env.PIPELINE_TRANSIENT_BASE_DELAY_MS, 250);
    const maxDelayMs = Math.max(
        baseDelayMs,
        parseNonNegativeIntEnv(process.env.PIPELINE_TRANSIENT_MAX_DELAY_MS, 4000),
    );
    return { maxRetries, baseDelayMs, maxDelayMs };
}

/**
 * Normalizes retry delay to milliseconds.
 * @param {number|undefined} retryAfterMs - Delay in milliseconds
 * @param {string|undefined} retryAt - ISO date string
 * @returns {number|null} Delay in milliseconds or null
 */
function normalizeRetryDelayMs(retryAfterMs, retryAt) {
    if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
        return Math.floor(retryAfterMs);
    }
    if (typeof retryAt === 'string') {
        const parsed = Date.parse(retryAt);
        if (!Number.isNaN(parsed)) return Math.max(0, parsed - Date.now());
    }
    return null;
}

const MUTATION_COMMAND_PATTERN = /^(make|set|mark|change|update|move|reschedule|schedule)\b/i;

function isPriorityMutationMessage(message) {
    return /\b(high|highest|low|lowest|medium|normal)\s+priority\b/i.test(message || '')
        || /\bpriority\s+(to\s+)?(high|highest|low|lowest|medium|normal)\b/i.test(message || '');
}

function hasMutationPayload(intent) {
    return intent?.priority != null
        || intent?.dueDate != null
        || intent?.projectHint != null
        || intent?.repeatHint != null
        || intent?.repeatFlag != null;
}

function repairMutationShapedCreateIntents(intents, userMessage) {
    if (!Array.isArray(intents) || intents.length !== 1) return intents;
    const [intent] = intents;
    if (intent?.type !== 'create' || typeof intent.title !== 'string' || !intent.title.trim()) return intents;
    if (!MUTATION_COMMAND_PATTERN.test(userMessage || '')) return intents;
    if (!hasMutationPayload(intent) && !isPriorityMutationMessage(userMessage)) return intents;

    return [{
        ...intent,
        type: 'update',
        targetQuery: intent.targetQuery || intent.title,
        title: null,
        confidence: Math.min(1, Math.max(intent.confidence ?? 0.75, 0.75)),
        repairedFromType: 'create',
        repairReason: 'mutation_shaped_create',
    }];
}

function buildOperationReceipt(context, {
    status,
    scope,
    command,
    operationType,
    nextAction,
    changed,
    dryRun,
    applied,
    fallbackUsed,
    message,
    errorClass = null,
    destination = undefined,
    confirmation = undefined,
    succeeded = undefined,
    failed = undefined,
    rolledBack = undefined,
}) {
    const receipt = {
        status,
        scope,
        command,
        operationType,
        nextAction,
        changed,
        dryRun,
        applied,
        fallbackUsed,
        message,
        traceId: context?.requestId || 'unknown-trace',
        ...(errorClass ? { errorClass } : {}),
        ...(destination !== undefined ? { destination } : {}),
        ...(confirmation !== undefined ? { confirmation } : {}),
        ...(Number.isInteger(succeeded) ? { succeeded } : {}),
        ...(Number.isInteger(failed) ? { failed } : {}),
        ...(Number.isInteger(rolledBack) ? { rolledBack } : {}),
        ...(applied ? { results: [{ status: 'succeeded' }] } : {}),
    };

    return assertValidOperationReceipt(receipt);
}

function buildTerminalTelemetryMetadata(context, receipt, extra = {}) {
    return {
        requestId: context?.requestId ?? null,
        entryPoint: context?.entryPoint ?? null,
        command: receipt?.command ?? null,
        operationType: receipt?.operationType ?? null,
        actionCount: Number.isInteger(extra.actionCount) ? extra.actionCount : null,
        receiptStatus: receipt?.status ?? null,
        status: receipt?.status ?? null,
        scope: receipt?.scope ?? null,
        dryRun: receipt?.dryRun ?? null,
        applied: receipt?.applied ?? null,
        changed: receipt?.changed ?? null,
        destinationConfidence: receipt?.destination?.confidence ?? null,
        errorClass: receipt?.errorClass ?? null,
        succeeded: Number.isInteger(receipt?.succeeded) ? receipt.succeeded : null,
        failed: Number.isInteger(receipt?.failed) ? receipt.failed : null,
        rolledBack: Number.isInteger(receipt?.rolledBack) ? receipt.rolledBack : null,
        localQueueCount: Number.isInteger(extra.localQueueCount) ? extra.localQueueCount : null,
        deferredQueueCount: Number.isInteger(extra.deferredQueueCount) ? extra.deferredQueueCount : null,
        fallbackUsed: receipt?.fallbackUsed ?? null,
    };
}

async function emitTerminalOperationTelemetry(telemetry, context, receipt, extra = {}) {
    if (!telemetry?.emit || !receipt) return;

    const terminalStatus = ['blocked', 'deferred', 'failed', 'busy'].includes(receipt.status)
        ? 'failure'
        : 'success';

    await telemetry.emit(context, {
        eventType: 'pipeline.operation.terminal',
        step: 'result',
        status: terminalStatus,
        metadata: buildTerminalTelemetryMetadata(context, receipt, extra),
    });
}

function resolveReceiptCommand(context) {
    const entryPoint = String(context?.entryPoint || '').toLowerCase();
    const mode = String(context?.mode || '').toLowerCase();
    if (entryPoint.includes('scan') || mode === 'scan') return 'scan';
    if (entryPoint.includes('review') || mode === 'review') return 'review';
    if (entryPoint.includes('status')) return 'status';
    if (entryPoint.includes('pending')) return 'pending';
    if (entryPoint.includes('scheduler')) return 'scheduler';
    if (entryPoint.includes('deferred')) return 'scheduler';
    if (entryPoint.includes('callback')) return 'callback';
    return 'freeform';
}

function resolveReceiptDestinationForPendingMutation(action, context) {
    if (!['create', 'update'].includes(action?.type)) return undefined;

    const availableProjects = Array.isArray(context?.availableProjects) ? context.availableProjects : [];
    if (action.projectId) {
        const project = availableProjects.find(candidate => candidate?.id === action.projectId);
        return project?.id ? { confidence: 'configured', projectId: project.id } : undefined;
    }

    const projectHint = typeof action.projectHint === 'string' ? action.projectHint.trim().toLowerCase() : '';
    if (!projectHint) return undefined;

    const project = availableProjects.find(candidate => (
        candidate?.name?.trim().toLowerCase() === projectHint
    ));

    return project?.id ? { confidence: 'configured', projectId: project.id } : undefined;
}

function resolveReceiptDestinationForCreate(action, context) {
    if (action?.type !== 'create') return undefined;

    if (action.projectResolution?.confidence === 'ambiguous') {
        return {
            confidence: 'ambiguous',
            choices: action.projectResolution.choices,
        };
    }

    if (action.projectId) {
        const availableProjects = Array.isArray(context?.availableProjects) ? context.availableProjects : [];
        const project = availableProjects.find(candidate => candidate?.id === action.projectId);
        return project?.id ? { confidence: action.projectResolution?.confidence || 'configured', projectId: project.id } : undefined;
    }

    return action.projectResolution?.confidence === 'missing'
        ? { confidence: 'missing' }
        : undefined;
}

function inferOperationType(actions = []) {
    const types = Array.isArray(actions) ? actions.map(action => action?.type).filter(Boolean) : [];
    const allowed = new Set(['create', 'update', 'complete', 'delete', 'review', 'scan', 'sync', 'none']);
    const filtered = types.filter(type => allowed.has(type));
    if (filtered.length === 1) return filtered[0];
    if (filtered.length === 0) return 'none';
    const uniqueTypes = new Set(filtered);
    return uniqueTypes.size === 1 ? filtered[0] : 'none';
}

function mapFailureClassToErrorClass(failureClass, details = {}) {
    if (failureClass === FAILURE_CLASSES.VALIDATION) return 'validation';
    if (failureClass === FAILURE_CLASSES.QUOTA) return 'model_unavailable';
    if (details?.deferredIntent) return 'ticktick_unavailable';
    if (failureClass === FAILURE_CLASSES.ADAPTER) return 'ticktick_unavailable';
    return 'unknown';
}

function mapTerminalFailureClassToErrorClass(failureClass, terminalFailure = {}) {
    if (failureClass === FAILURE_CLASSES.VALIDATION) {
        return 'validation';
    }
    if (failureClass === FAILURE_CLASSES.QUOTA) return 'model_unavailable';
    if (failureClass === FAILURE_CLASSES.ADAPTER) return 'ticktick_unavailable';
    if (failureClass === FAILURE_CLASSES.ROLLBACK) return 'routing';
    if (failureClass === FAILURE_CLASSES.UNEXPECTED) return 'unknown';
    if (terminalFailure?.retryable === false && terminalFailure?.stage === 'intent') return 'model_unavailable';
    return 'unknown';
}

function didFailureChangeExternalState({ failureClass, details = {}, rolledBack = false } = {}) {
    if (details?.deferredIntent) return true;
    if (failureClass === FAILURE_CLASSES.ROLLBACK) return true;
    if (Array.isArray(details?.rollbackFailures) && details.rollbackFailures.length > 0) return true;
    if (rolledBack) return false;

    const successCount = Number.isInteger(details?.successCount) ? details.successCount : 0;
    return details?.partialFailure === true && successCount > 0;
}

/**
 * Formats a retry delay as a human-readable ETA (e.g., "5s", "2m", "1h").
 * @param {number|undefined} retryAfterMs - Delay in milliseconds
 * @param {string|undefined} retryAt - ISO date string
 * @returns {string|null} Formatted ETA or null
 */
function formatRetryEta(retryAfterMs, retryAt) {
    const ms = normalizeRetryDelayMs(retryAfterMs, retryAt);
    if (!Number.isFinite(ms)) return null;
    const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.ceil(totalSeconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    return `${hours}h`;
}

/**
 * Extracts structured metadata from an adapter error.
 * @param {Error|string|null} errorOrMessage - The error to extract from
 * @returns {{ code: string|null, statusCode: number|null, retryAfterMs: number, retryAt: string, isQuotaExhausted: boolean }}
 */
function extractAdapterErrorMeta(errorOrMessage) {
    if (!errorOrMessage || typeof errorOrMessage === 'string') return {};
    return {
        code: errorOrMessage.code || null,
        statusCode: errorOrMessage.statusCode || null,
        retryAfterMs: errorOrMessage.retryAfterMs,
        retryAt: errorOrMessage.retryAt,
        isQuotaExhausted: errorOrMessage.isQuotaExhausted === true,
    };
}

/**
 * Classifies an adapter failure into a failure category (transient vs permanent).
 * @param {Error|string} errorOrMessage - The error to classify
 * @returns {string} Failure category
 */
function classifyAdapterFailureCategory(errorOrMessage = '') {
    const meta = extractAdapterErrorMeta(errorOrMessage);
    if (meta.code === 'PERMISSION_DENIED' || meta.code === 'AUTH_ERROR' || meta.code === 'NOT_FOUND' || meta.code === 'ALREADY_COMPLETED') {
        return FAILURE_CATEGORIES.PERMANENT;
    }
    if (meta.code === 'NETWORK_ERROR' || meta.code === 'SERVER_ERROR') {
        return FAILURE_CATEGORIES.TRANSIENT;
    }
    if (meta.isQuotaExhausted || meta.code === 'RATE_LIMIT_QUOTA_EXHAUSTED' || meta.code === 'QUOTA_EXHAUSTED') {
        return FAILURE_CATEGORIES.PERMANENT;
    }
    if (meta.code === 'RATE_LIMITED' || meta.statusCode === 429) {
        return FAILURE_CATEGORIES.TRANSIENT;
    }

    const normalized = String(typeof errorOrMessage === 'string' ? errorOrMessage : errorOrMessage?.message || '').toLowerCase();

    if (/(timeout|timed out|rate limit|too many requests|\b429\b|temporar|econnreset|eai_again|network|\b502\b|\b503\b|\b504\b)/i.test(normalized)) {
        return FAILURE_CATEGORIES.TRANSIENT;
    }

    if (/(invalid|missing project|project .*not found|could not resolve project|permission denied|forbidden|already completed|unsupported|not found|requires)/i.test(normalized)) {
        return FAILURE_CATEGORIES.PERMANENT;
    }

    return FAILURE_CATEGORIES.TRANSIENT;
}

/**
 * Derives the overall failure category from pipeline state.
 * @param {Object} params
 * @param {string} params.failureClass - Primary failure class
 * @param {string} [params.failureCategory] - Explicitly provided category
 * @param {Object} [params.details] - Additional failure details
 * @param {boolean} [params.rolledBack] - Whether changes were rolled back
 * @param {boolean} [params.retryable] - Whether the failure is retryable
 * @returns {string} Resolved failure category
 */
function deriveFailureCategory({ failureClass, failureCategory, details, rolledBack = false, retryable = true }) {
    if (failureCategory) return failureCategory;
    if (rolledBack || details?.partialFailure || failureClass === FAILURE_CLASSES.ROLLBACK) {
        return FAILURE_CATEGORIES.PARTIAL;
    }

    switch (failureClass) {
        case FAILURE_CLASSES.QUOTA:
            return FAILURE_CATEGORIES.TRANSIENT;
        case FAILURE_CLASSES.MALFORMED_INTENT:
        case FAILURE_CLASSES.VALIDATION:
            return FAILURE_CATEGORIES.PERMANENT;
        case FAILURE_CLASSES.ADAPTER:
            return details?.adapterFailureCategory || (retryable ? FAILURE_CATEGORIES.TRANSIENT : FAILURE_CATEGORIES.PERMANENT);
        case FAILURE_CLASSES.UNEXPECTED:
        default:
            return retryable ? FAILURE_CATEGORIES.TRANSIENT : FAILURE_CATEGORIES.PERMANENT;
    }
}

/**
 * Builds a user-facing failure message from pipeline failure state.
 * @param {Object} params
 * @param {string} params.failureClass - Primary failure class
 * @param {string} params.failureCategory - Resolved failure category
 * @param {Object} [params.details] - Additional failure details
 * @param {boolean} params.rolledBack - Whether changes were rolled back
 * @returns {string} User-facing confirmation text
 */
function buildUserFailureMessage({ failureClass, failureCategory, details, rolledBack }) {
    if (failureCategory === FAILURE_CATEGORIES.PARTIAL) {
        const successCount = Number.isInteger(details?.successCount) ? details.successCount : null;
        const failureCount = Number.isInteger(details?.failureCount) ? details.failureCount : null;
        const summary = successCount !== null && failureCount !== null
            ? `${successCount} succeeded, ${failureCount} failed.`
            : 'Some tasks succeeded and some failed.';
        const succeededTitles = Array.isArray(details?.succeededTitles) ? details.succeededTitles.filter(Boolean) : [];
        const failedTitles = Array.isArray(details?.failedTitles) ? details.failedTitles.filter(Boolean) : [];
        const succeededHint = succeededTitles.length > 0
            ? (rolledBack
                ? ` Rolled back: ${succeededTitles.slice(0, 2).join(', ')}.`
                : ` Success: ${succeededTitles.slice(0, 2).join(', ')}.`)
            : '';
        const failedHint = failedTitles.length > 0 ? ` Failed: ${failedTitles.slice(0, 2).join(', ')}.` : '';

        return rolledBack
            ? `⚠️ Task updates partially failed: ${summary}${succeededHint}${failedHint} Earlier successful changes were rolled back.`
            : `⚠️ Task updates partially failed: ${summary}${succeededHint}${failedHint} Please review your tasks.`;
    }

    if (failureClass === FAILURE_CLASSES.ADAPTER && failureCategory === FAILURE_CATEGORIES.TRANSIENT) {
        const adapterError = details?.adapterError || {};
        const isRateLimited = adapterError.statusCode === 429 || adapterError.code === 'RATE_LIMITED';
        if (isRateLimited) {
            const eta = formatRetryEta(adapterError.retryAfterMs, adapterError.retryAt);
            return eta
                ? `⚠️ TickTick is temporarily rate-limiting requests. Please retry in about ${eta}.`
                : '⚠️ TickTick is temporarily rate-limiting requests. Please retry shortly.';
        }
        return '⚠️ Temporary task update failure. Please retry shortly.';
    }

    if (failureClass === FAILURE_CLASSES.ADAPTER && failureCategory === FAILURE_CATEGORIES.PERMANENT) {
        const adapterError = details?.adapterError || {};
        if (adapterError.isQuotaExhausted || adapterError.code === 'RATE_LIMIT_QUOTA_EXHAUSTED' || adapterError.code === 'QUOTA_EXHAUSTED') {
            const eta = formatRetryEta(adapterError.retryAfterMs, adapterError.retryAt);
            return eta
                ? `⚠️ TickTick quota is exhausted. Please retry in about ${eta}.`
                : '⚠️ TickTick quota is exhausted right now. Please retry later.';
        }
        if (adapterError.code === 'PERMISSION_DENIED' || adapterError.code === 'AUTH_ERROR') {
            return '⚠️ Permission denied for this task action.';
        }
        if (adapterError.code === 'NOT_FOUND') {
            return '⚠️ Target task not found. It may have been removed already.';
        }
        if (adapterError.code === 'ALREADY_COMPLETED') {
            return '⚠️ Task is already completed.';
        }
        return '⚠️ Task update could not be applied. Please correct the task details and retry.';
    }

    return USER_FAILURE_MESSAGES[failureClass] || USER_FAILURE_MESSAGES[FAILURE_CLASSES.UNEXPECTED];
}

/**
 * Resolves whether dev/debug mode is active from context or environment.
 * @param {Object} context - Pipeline request context
 * @returns {boolean}
 */
function resolveDevMode(context) {
    const mode = (context?.mode || '').toLowerCase();
    if (['dev', 'development', 'debug', 'diagnostic', 'test'].includes(mode)) return true;
    const explicitDebug = String(process.env.DEBUG_RECEIPTS || '').toLowerCase();
    const debugReceiptsEnabled = ['1', 'true', 'yes', 'on'].includes(explicitDebug);
    return process.env.NODE_ENV === 'development' && debugReceiptsEnabled;
}

/**
 * Builds a structured pipeline failure result object.
 * @param {Object} context - Pipeline request context
 * @param {Object} params - Failure parameters
 * @returns {Object} Pipeline result of type 'error'
 */
function buildFailureResult(context, {
    failureClass,
    failureCategory = null,
    stage,
    summary,
    error,
    details,
    userMessage,
    developerMessage,
    retryable = true,
    rolledBack = false,
    dryRun = false,
    results = [],
    intents = null,
    normalizedActions = null,
}) {
    const isDevMode = resolveDevMode(context);
    const diagnostics = [];
    const resolvedFailureCategory = deriveFailureCategory({
        failureClass,
        failureCategory,
        details,
        rolledBack,
        retryable,
    });

    if (failureClass) diagnostics.push(`failure_class: ${failureClass}`);
    if (resolvedFailureCategory) diagnostics.push(`failure_category: ${resolvedFailureCategory}`);
    if (stage) diagnostics.push(`failure_stage: ${stage}`);
    if (summary) diagnostics.push(summary);
    if (developerMessage) diagnostics.push(developerMessage);
    if (error?.message) diagnostics.push(error.message);
    if (details?.diagnostics && Array.isArray(details.diagnostics)) {
        diagnostics.push(...details.diagnostics);
    }
    if (details?.validationErrors && Array.isArray(details.validationErrors)) {
        for (const entry of details.validationErrors) {
            if (Array.isArray(entry)) {
                const compact = entry.filter(Boolean).join('; ');
                diagnostics.push(compact ? `validation_error: ${compact}` : 'validation_error: (empty)');
            } else if (typeof entry === 'string') {
                diagnostics.push(`validation_error: ${entry}`);
            }
        }
    }
    if (details?.failures && Array.isArray(details.failures)) {
        for (const failure of details.failures) {
            if (!failure || typeof failure !== 'object') continue;
            const parts = [];
            if (failure.type) parts.push(`type=${failure.type}`);
            if (failure.title) parts.push(`title="${failure.title}"`);
            if (failure.taskId) parts.push(`taskId=${failure.taskId}`);
            if (failure.message) parts.push(`message="${failure.message}"`);
            if (typeof failure.attempt === 'number') parts.push(`attempt=${failure.attempt}`);
            diagnostics.push(`adapter_failure: ${parts.join(' | ')}`);
        }
    }
    if (details?.rollbackFailures && Array.isArray(details.rollbackFailures)) {
        for (const failure of details.rollbackFailures) {
            if (!failure || typeof failure !== 'object') continue;
            const parts = [];
            if (typeof failure.actionIndex === 'number') parts.push(`actionIndex=${failure.actionIndex}`);
            if (failure.rollbackType) parts.push(`rollbackType=${failure.rollbackType}`);
            if (failure.message) parts.push(`message="${failure.message}"`);
            diagnostics.push(`rollback_failure: ${parts.join(' | ')}`);
        }
    }

    const confirmationText = userMessage || buildUserFailureMessage({
        failureClass,
        failureCategory: resolvedFailureCategory,
        details,
        rolledBack,
    });
    const failureDeveloperMessage = developerMessage || summary || error?.message || null;
    const changed = didFailureChangeExternalState({ failureClass, details, rolledBack });
    const receiptStatus = details?.deferredIntent ? 'deferred' : (dryRun ? 'blocked' : 'failed');
    const succeeded = Number.isInteger(details?.successCount) ? details.successCount : undefined;
    const failed = Number.isInteger(details?.failureCount) ? details.failureCount : undefined;
    const rolledBackCount = Number.isInteger(details?.rolledBackCount)
        ? details.rolledBackCount
        : undefined;

    return {
        type: 'error',
        results,
        operationReceipt: buildOperationReceipt(context, {
            status: receiptStatus,
            scope: details?.deferredIntent ? 'deferred_queue' : 'system',
            command: resolveReceiptCommand(context),
            operationType: inferOperationType(normalizedActions || []),
            nextAction: details?.deferredIntent ? 'wait' : (retryable ? 'retry' : 'none'),
            changed,
            dryRun,
            applied: false,
            fallbackUsed: !!details?.deferredIntent,
            message: details?.deferredIntent
                ? 'Task intent saved for deferred retry.'
                : (dryRun ? 'Task execution blocked.' : 'Task execution failed.'),
            errorClass: mapFailureClassToErrorClass(failureClass, details),
            ...(succeeded !== undefined ? { succeeded } : {}),
            ...(failed !== undefined ? { failed } : {}),
            ...(rolledBackCount !== undefined ? { rolledBack: rolledBackCount } : {}),
        }),
        failure: {
            class: failureClass,
            failureClass,
            failureCategory: resolvedFailureCategory,
            stage,
            summary: summary || null,
            details: details || null,
            userMessage: confirmationText,
            developerMessage: failureDeveloperMessage,
            requestId: context?.requestId || null,
            retryable,
            rolledBack,
        },
        confirmationText,
        errors: isDevMode ? diagnostics : [],
        diagnostics: isDevMode ? diagnostics : [],
        requestId: context?.requestId || null,
        entryPoint: context?.entryPoint || null,
        mode: context?.mode || null,
        workStyleMode: context?.workStyleMode || null,
        checklistContext: context?.checklistContext || null,
        isDevMode,
        intents,
        normalizedActions,
    };
}

function attachPipelineContext(result, context) {
    return {
        ...result,
        pipelineContext: context ? sanitizePipelineContextForDiagnostics(context) : null,
    };
}

function finalizePipelineContext(context, requestStartedAt, {
    resultType,
    status,
    summary = null,
    failureClass = null,
    rolledBack = false,
    validationFailures,
}) {
    const completedAt = Date.now();
    return updatePipelineContext(context, (draft) => {
        if (validationFailures !== undefined) {
            draft.lifecycle.validationFailures = snapshotPipelineValue(validationFailures);
        }
        draft.lifecycle.result = {
            status,
            type: resultType,
            summary,
            failureClass,
            rolledBack,
        };
        draft.lifecycle.timing.requestCompletedAt = new Date(completedAt).toISOString();
        draft.lifecycle.timing.totalDurationMs = completedAt - requestStartedAt;
        draft.lifecycle.timing.stages.result = {
            startedAt: new Date(completedAt).toISOString(),
            durationMs: 0,
            status,
        };
    });
}

function buildNonTaskResult(context, reason, details = null) {
    const userMessage = (context?.userMessage || '').trim().toLowerCase();
    const isGreeting = /^(hi|hey|hello|howdy|greetings|good\s*(morning|afternoon|evening|night)|how are you|what'?s up)\b/.test(userMessage);
    const confirmationText = isGreeting
        ? 'Hi. No task created.'
        : 'Got it — no actionable tasks detected.';

    return {
        type: 'non-task',
        results: [],
        errors: [],
        confirmationText,
        nonTaskReason: reason,
        nonTaskDetails: details,
        requestId: context?.requestId || null,
        entryPoint: context?.entryPoint || null,
        mode: context?.mode || null,
        workStyleMode: context?.workStyleMode || null,
        checklistContext: context?.checklistContext || null,
    };
}

function buildClarificationResult(context, resolverResult) {
    const clarificationPrompt = buildClarificationPrompt(resolverResult, { workStyleMode: context?.workStyleMode });
    return {
        type: 'clarification',
        results: [],
        errors: [],
        confirmationText: clarificationPrompt,
        clarification: {
            candidates: resolverResult.candidates,
            reason: resolverResult.reason,
        },
        requestId: context?.requestId || null,
        entryPoint: context?.entryPoint || null,
        mode: context?.mode || null,
        workStyleMode: context?.workStyleMode || null,
        checklistContext: context?.checklistContext || null,
    };
}

function buildNotFoundResult(context, reason) {
    return {
        type: 'not-found',
        results: [],
        errors: [],
        confirmationText: `Couldn't find a matching task for that request.`,
        notFound: {
            reason,
        },
        requestId: context?.requestId || null,
        entryPoint: context?.entryPoint || null,
        mode: context?.mode || null,
        workStyleMode: context?.workStyleMode || null,
        checklistContext: context?.checklistContext || null,
    };
}

function isUrgentWorkStyle(context) {
    return context?.workStyleMode === 'urgent';
}

function updateChecklistContext(context, metadata = {}) {
    if (!context || typeof context !== 'object') return context;

    const existing = context.checklistContext && typeof context.checklistContext === 'object'
        ? context.checklistContext
        : {};

    const next = {
        hasChecklist: typeof metadata.hasChecklist === 'boolean'
            ? metadata.hasChecklist
            : (typeof existing.hasChecklist === 'boolean' ? existing.hasChecklist : null),
        clarificationQuestion: typeof metadata.clarificationQuestion === 'string'
            && metadata.clarificationQuestion.trim()
            ? metadata.clarificationQuestion.trim()
            : (typeof existing.clarificationQuestion === 'string' && existing.clarificationQuestion.trim()
                ? existing.clarificationQuestion.trim()
                : null),
    };

    const resolvedChecklistContext = next.hasChecklist === null && next.clarificationQuestion === null
        ? null
        : next;

    return updatePipelineContext(context, (draft) => {
        draft.checklistContext = snapshotPipelineValue(resolvedChecklistContext);
        draft.lifecycle.request.checklistContext = snapshotPipelineValue(resolvedChecklistContext);
    });
}

function isQuotaFailure(error) {
    if (!error) return false;
    if (error instanceof QuotaExhaustedError) return true;
    if (error instanceof AIHardQuotaError) return true;
    if (error instanceof AIServiceUnavailableError) return true;
    if (error instanceof AIInvalidKeyError) return true;
    const msg = error.message || '';
    return msg.includes('QUOTA_EXHAUSTED') || msg.includes('API_KEYS_UNAVAILABLE');
}

function isMalformedIntentPayload(intents) {
    if (!Array.isArray(intents)) return true;
    return intents.some(intent => !intent || typeof intent !== 'object' || Array.isArray(intent));
}

function isCreateClarificationIntent(intent) {
    if (!intent || typeof intent !== 'object') return false;
    if (intent.type !== 'create') return false;
    if (intent.clarification === true) return true;
    return typeof intent.clarificationQuestion === 'string' && intent.clarificationQuestion.trim().length > 0;
}

function pickCreateClarificationQuestion(intents, context) {
    for (const intent of intents) {
        if (typeof intent?.clarificationQuestion === 'string' && intent.clarificationQuestion.trim()) {
            return intent.clarificationQuestion.trim();
        }
    }

    return isUrgentWorkStyle(context)
        ? 'Need one detail: what task should I create from unclear part?'
        : 'I created the clear task. What exactly should I create from the unclear part?';
}

function isLikelyBatchMutationIntent(intent, userMessage = '') {
    if (!intent || typeof intent !== 'object') return false;
    if (!['update', 'complete', 'delete'].includes(intent.type)) return false;

    const target = String(intent.targetQuery || intent.title || '').toLowerCase();
    const rawMessage = String(userMessage || '').toLowerCase();
    const source = `${target} ${rawMessage}`;

    const hasPluralTaskReference = /\btasks\b/.test(source);
    const hasBulkQuantifier = /\b(all|every)\b/.test(source);
    const hasBulkVerb = /\b(move|reschedule|complete|finish|delete|remove|update)\s+all\b/.test(source);

    return (hasPluralTaskReference && hasBulkQuantifier) || hasBulkVerb;
}

function buildMutationBoundaryMessage(reason, context) {
    if (reason === 'mixed_create_and_mutation') {
        return isUrgentWorkStyle(context)
            ? 'One instruction only. Do create or mutation, not both.'
            : 'I can do create or mutate in one request, not both. Send one simpler instruction.';
    }

    if (reason === 'multiple_mutations' || reason === 'batch_mutation_not_supported') {
        return isUrgentWorkStyle(context)
            ? 'One target only. Name one task to change.'
            : 'I can only mutate one task per request. Name a single task and try again.';
    }

    return USER_FAILURE_MESSAGES[FAILURE_CLASSES.VALIDATION];
}

function createExecutionRecord(action, index) {
    return {
        index,
        action,
        attempts: 0,
        status: 'failed',
        result: null,
        errorMessage: null,
        failureClass: ACTION_FAILURE_CLASSES.NONE,
        rollbackStep: null,
    };
}

function buildSnapshot(task) {
    if (!task || typeof task !== 'object') return null;
    return {
        id: task.id,
        projectId: task.projectId ?? null,
        title: task.title || '',
        content: task.content ?? null,
        priority: task.priority ?? null,
        dueDate: task.dueDate ?? null,
        repeatFlag: task.repeatFlag ?? null,
        status: task.status ?? null,
    };
}

function snapshotToTaskPayload(snapshot) {
    return {
        title: snapshot?.title || '',
        content: snapshot?.content ?? null,
        priority: snapshot?.priority ?? null,
        dueDate: snapshot?.dueDate ?? null,
        projectId: snapshot?.projectId ?? null,
        repeatFlag: snapshot?.repeatFlag ?? null,
    };
}

function buildRollbackStep(action, index, executionResult, snapshot) {
    switch (action.type) {
        case 'create':
            if (!executionResult?.id) return null;
            return {
                type: 'delete_created',
                targetTaskId: executionResult.id,
                targetProjectId: executionResult.projectId ?? action.projectId ?? null,
                payload: {},
                sourceActionIndex: index,
            };
        case 'update':
            if (!snapshot?.id) return null;
            return {
                type: 'restore_updated',
                targetTaskId: executionResult?.id || action.taskId || snapshot.id,
                targetProjectId: executionResult?.projectId ?? action.projectId ?? snapshot.projectId ?? null,
                payload: {
                    snapshot,
                    currentTaskId: executionResult?.id || action.taskId || snapshot.id,
                    currentProjectId: executionResult?.projectId ?? action.projectId ?? snapshot.projectId ?? null,
                },
                sourceActionIndex: index,
            };
        case 'delete':
            if (!snapshot?.id) return null;
            return {
                type: 'recreate_deleted',
                targetTaskId: snapshot.id,
                targetProjectId: snapshot.projectId ?? null,
                payload: { snapshot },
                sourceActionIndex: index,
            };
        case 'complete':
            if (!snapshot?.id) return null;
            return {
                type: 'uncomplete_task',
                targetTaskId: snapshot.id,
                targetProjectId: snapshot.projectId ?? null,
                payload: { snapshot },
                sourceActionIndex: index,
            };
        default:
            return null;
    }
}

async function capturePreWriteSnapshot(action, adapter) {
    if (!action?.taskId) return null;

    switch (action.type) {
        case 'update':
        case 'delete':
        case 'complete': {
            const projectId = action.originalProjectId || action.projectId;
            if (!projectId) {
                throw new Error(`Cannot capture pre-write snapshot for ${action.type} without a projectId`);
            }
            const snapshot = await adapter.getTaskSnapshot(action.taskId, projectId);
            return buildSnapshot(snapshot);
        }
        default:
            return null;
    }
}

async function executeAction(action, adapter, options = {}) {
    switch (action.type) {
        case 'create':
            return adapter.createTask(action);
        case 'update':
            return adapter.updateTask(action.taskId, action, options);
        case 'complete':
            return adapter.completeTask(action.taskId, action.originalProjectId || action.projectId, action.userId, options);
        case 'delete':
            return adapter.deleteTask(action.taskId, action.originalProjectId || action.projectId, action.userId, options);
        default:
            throw new Error(`Unsupported action type: ${action.type}`);
    }
}

async function executeRollbackStep(step, adapter) {
    switch (step?.type) {
        case 'delete_created':
            if (!step.targetTaskId || !step.targetProjectId) {
                throw new Error('Rollback delete_created requires targetTaskId and targetProjectId');
            }
            return adapter.deleteTask(step.targetTaskId, step.targetProjectId);
        case 'restore_updated': {
            const snapshot = step.payload?.snapshot || null;
            const currentTaskId = step.payload?.currentTaskId || step.targetTaskId;
            const currentProjectId = step.payload?.currentProjectId || step.targetProjectId;

            if (!snapshot?.id) {
                throw new Error('Rollback restore_updated requires a pre-write snapshot');
            }

            if (currentTaskId && currentTaskId !== snapshot.id) {
                if (!currentProjectId) {
                    throw new Error('Rollback restore_updated requires currentProjectId for moved tasks');
                }
                await adapter.deleteTask(currentTaskId, currentProjectId);
                return adapter.createTask(snapshotToTaskPayload(snapshot));
            }

            return adapter.restoreTask(snapshot.id, snapshot);
        }
        case 'recreate_deleted': {
            const snapshot = step.payload?.snapshot || null;
            if (!snapshot?.id) {
                throw new Error('Rollback recreate_deleted requires a pre-delete snapshot');
            }
            return adapter.createTask(snapshotToTaskPayload(snapshot));
        }
        case 'uncomplete_task':
            throw new Error('Rollback unsupported for complete actions: TickTick does not expose a reliable reopen path.');
        default:
            throw new Error(`Unsupported rollback step: ${step?.type || 'unknown'}`);
    }
}

function buildExecutionFailure(action, message, attempt, adapterError = null) {
    const meta = extractAdapterErrorMeta(adapterError);
    return {
        type: action?.type || 'unknown',
        title: action?.title || null,
        taskId: action?.taskId || null,
        message,
        attempt,
        failureCategory: classifyAdapterFailureCategory(adapterError || message),
        code: meta.code || null,
        statusCode: meta.statusCode || null,
        retryAfterMs: meta.retryAfterMs,
        retryAt: meta.retryAt,
        isQuotaExhausted: meta.isQuotaExhausted,
    };
}

function appendUnexecutedActionsAsFailures({
    actions,
    startIndex,
    results,
    errors,
    failures,
    failedActionLabels,
}) {
    for (let pendingIndex = startIndex; pendingIndex < actions.length; pendingIndex++) {
        const pendingAction = actions[pendingIndex];
        const pendingRecord = createExecutionRecord(pendingAction, pendingIndex);
        pendingRecord.status = 'failed';
        pendingRecord.failureClass = ACTION_FAILURE_CLASSES.ADAPTER;
        pendingRecord.errorMessage = 'Not executed due to earlier failure in this request.';
        pendingRecord.attempts = 0;
        results.push(pendingRecord);
        errors.push(`${pendingAction.type} failed: Not executed due to earlier failure in this request.`);
        failures.push(buildExecutionFailure(pendingAction, pendingRecord.errorMessage, 0));
        failedActionLabels.push(getActionLabel(pendingAction));
    }
}

function getActionLabel(action) {
    if (!action || typeof action !== 'object') return 'task';
    if (typeof action.title === 'string' && action.title.trim()) return action.title.trim();
    if (typeof action.taskId === 'string' && action.taskId.trim()) return `task ${action.taskId.trim()}`;
    return action.type || 'task';
}

function calculatePipelineBackoffMs(attempt, retryConfig) {
    const base = retryConfig.baseDelayMs * (2 ** Math.max(0, attempt - 1));
    return Math.min(base, retryConfig.maxDelayMs);
}

async function sleep(ms) {
    const wait = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    if (wait <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * Create a pipeline instance that orchestrates intent extraction, normalization,
 * and TickTick adapter execution.
 *
 * @param {Object} options
 * @param {Object} options.intentExtractor - Intent extractor with `extractIntents(message, opts)` method
 * @param {Object} options.normalizer - Normalizer module with `normalize(action, tasks, projects, opts)` method
 * @param {TickTickAdapter} options.adapter - TickTick adapter instance
 * @param {Object} [options.observability] - Optional observability emitter (see createPipelineObservability)
 * @returns {{ processMessage: Function, getTelemetry: Function }}
 *   - `processMessage(userMessage, options?)` → `{ type: 'task'|'preview'|'blocked'|'info'|'error', confirmationText, taskId?, diagnostics?, ... }`
 *   - `getTelemetry()` → the observability instance for this pipeline
 */
export function createPipeline({ intentExtractor, normalizer, adapter, observability, deferIntent, defaultProjectName = null } = {}) {
    const contextBuilder = createPipelineContextBuilder({ adapter });
    const telemetry = observability || createPipelineObservability();

    function buildContextValidationError(errors) {
        const summary = 'Invalid pipeline request context';
        const message = errors.length > 0 ? `${summary}: ${errors.join('; ')}` : summary;
        const error = new Error(message);
        error.code = 'PIPELINE_CONTEXT_INVALID';
        error.details = { ok: false, errors };
        return error;
    }

    function resolveProvidedContext(userMessage, options = {}) {
        const providedContext = options.requestContext;
        if (!providedContext) return null;
        const validation = validatePipelineContext(providedContext);
        if (!validation.ok) {
            throw buildContextValidationError(validation.errors);
        }
        if (providedContext.userMessage !== userMessage) {
            throw buildContextValidationError(['requestContext.userMessage must match processMessage userMessage']);
        }
        return providedContext;
    }

    function shouldDeferIntent(terminalFailure) {
        if (!terminalFailure || typeof terminalFailure !== 'object') return false;
        if (terminalFailure.failureClass !== FAILURE_CLASSES.ADAPTER) return false;
        if (terminalFailure.failureCategory !== FAILURE_CATEGORIES.TRANSIENT) return false;
        if (terminalFailure.rolledBack) return false;
        if (Number.isInteger(terminalFailure.successCount) && terminalFailure.successCount > 0) return false;
        return true;
    }

    async function persistDeferredIntent({ context, intents, normalizedActions, terminalFailure }) {
        if (typeof deferIntent !== 'function') return null;
        if (!shouldDeferIntent(terminalFailure)) return null;
        const payload = {
            requestId: context?.requestId || null,
            entryPoint: context?.entryPoint || null,
            mode: context?.mode || null,
            workStyleMode: context?.workStyleMode || null,
            userMessage: context?.userMessage || null,
            intents: snapshotPipelineValue(intents),
            normalizedActions: snapshotPipelineValue(normalizedActions),
            failure: {
                class: terminalFailure.failureClass,
                category: terminalFailure.failureCategory,
                stage: terminalFailure.stage || 'adapter',
                summary: terminalFailure.summary || null,
                adapterError: snapshotPipelineValue(terminalFailure.details?.adapterError || null),
            },
            deferredAt: new Date().toISOString(),
        };
        try {
            return await deferIntent(payload);
        } catch (error) {
            console.error('[Pipeline] Failed to persist deferred intent:', getSafeErrorName(error));
            return null;
        }
    }

    async function persistDeferredAiQuotaIntent({ userMessage, context }) {
        if (typeof deferIntent !== 'function') return null;
        const payload = {
            requestId: context?.requestId || null,
            entryPoint: context?.entryPoint || null,
            mode: context?.mode || null,
            workStyleMode: context?.workStyleMode || null,
            userMessage: userMessage || context?.userMessage || null,
            failureType: 'ai_quota',
            failureReason: 'ai_quota',
            retryCount: 0,
            nextAttemptAt: new Date(Date.now() + 60 * 1000).toISOString(),
            deferredAt: new Date().toISOString(),
        };
        try {
            return await deferIntent(payload);
        } catch (error) {
            console.error(`[Pipeline] Failed to persist deferred AI quota intent: ${getSafeErrorName(error)}`);
            return null;
        }
    }

    async function processMessage(userMessage, options = {}) {
        const isDryRun = options.dryRun === true;
        const blockedActionTypes = new Set(options.blockedActionTypes || []);
        let context;
        let requestStartedAt = Date.now();

        try {
            context = resolveProvidedContext(userMessage, options)
                || await contextBuilder.buildRequestContext(userMessage, options);
            requestStartedAt = Date.now();
            context = updatePipelineContext(context, (draft) => {
                draft.lifecycle.timing.requestStartedAt = new Date(requestStartedAt).toISOString();
                draft.lifecycle.timing.stages.request = {
                    startedAt: new Date(requestStartedAt).toISOString(),
                    durationMs: null,
                    status: 'start',
                };
            });

            await telemetry.emit(context, {
                eventType: 'pipeline.request.received',
                step: 'request',
                status: 'start',
                metadata: {
                    mode: context.mode,
                },
            });

            console.log(`[Pipeline:${context.requestId}] Processing message (${context.userMessage?.length || 0} chars)`);

            const intentStartedAt = Date.now();
            let intents;

            try {
                intents = await intentExtractor.extractIntents(context.userMessage, {
                    currentDate: context.currentDate,
                    availableProjects: context.availableProjectNames,
                    requestId: context.requestId,
                    existingTask: context.existingTask,
                });
            } catch (error) {
                const failureClass = isQuotaFailure(error) ? FAILURE_CLASSES.QUOTA : FAILURE_CLASSES.UNEXPECTED;
                context = updatePipelineContext(context, (draft) => {
                    draft.lifecycle.intent.status = 'failure';
                    draft.lifecycle.intent.failure = {
                        failureClass,
                        errorName: getSafeErrorName(error),
                    };
                    draft.lifecycle.timing.stages.intent = {
                        startedAt: new Date(intentStartedAt).toISOString(),
                        durationMs: Date.now() - intentStartedAt,
                        status: 'failure',
                    };
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.intent.failed',
                    step: 'intent',
                    status: 'failure',
                    durationMs: Date.now() - intentStartedAt,
                    failureClass,
                    metadata: {
                        errorName: getSafeErrorName(error),
                    },
                });
                throw error;
            }

            if (isMalformedIntentPayload(intents)) {
                console.warn(`[Pipeline:${context.requestId}] Malformed intent extraction output.`);
                context = updatePipelineContext(context, (draft) => {
                    draft.lifecycle.intent.status = 'failure';
                    draft.lifecycle.intent.intentOutput = snapshotPrivacySafePipelineValue(intents);
                    draft.lifecycle.intent.failure = {
                        failureClass: FAILURE_CLASSES.MALFORMED_INTENT,
                        message: 'Malformed intent extraction output.',
                    };
                    draft.lifecycle.timing.stages.intent = {
                        startedAt: new Date(intentStartedAt).toISOString(),
                        durationMs: Date.now() - intentStartedAt,
                        status: 'failure',
                    };
                });
                const failureResult = buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.MALFORMED_INTENT,
                    stage: 'intent',
                    summary: 'Malformed intent extraction output.',
                    details: {
                        receivedType: Array.isArray(intents) ? 'array' : typeof intents,
                    },
                    dryRun: isDryRun,
                    retryable: true,
                });
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'error',
                    status: 'failure',
                    summary: 'Malformed intent extraction output.',
                    failureClass: FAILURE_CLASSES.MALFORMED_INTENT,
                    rolledBack: false,
                });

                await telemetry.emit(context, {
                    eventType: 'pipeline.intent.failed',
                    step: 'intent',
                    status: 'failure',
                    durationMs: Date.now() - intentStartedAt,
                    failureClass: FAILURE_CLASSES.MALFORMED_INTENT,
                    metadata: {
                        receivedType: Array.isArray(intents) ? 'array' : typeof intents,
                    },
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: FAILURE_CLASSES.MALFORMED_INTENT,
                    rolledBack: false,
                });
                return attachPipelineContext(failureResult, context);
            }

            context = updatePipelineContext(context, (draft) => {
                draft.lifecycle.intent.status = 'success';
                draft.lifecycle.intent.intentOutput = snapshotPrivacySafePipelineValue(intents);
                draft.lifecycle.intent.failure = null;
                draft.lifecycle.timing.stages.intent = {
                    startedAt: new Date(intentStartedAt).toISOString(),
                    durationMs: Date.now() - intentStartedAt,
                    status: 'success',
                };
            });

            const intentDurationMs = Date.now() - intentStartedAt;
            await telemetry.emit(context, {
                eventType: 'pipeline.intent.completed',
                step: 'intent',
                status: 'success',
                durationMs: intentDurationMs,
                metadata: {
                    intentCount: intents.length,
                    checklistIntentCount: intents.filter(i => Array.isArray(i.checklistItems) && i.checklistItems.length > 0).length,
                    totalExtractedChecklistItems: intents.reduce((sum, i) => sum + (Array.isArray(i.checklistItems) ? i.checklistItems.length : 0), 0),
                    checklistIntentShape: intents
                        .map((intent, intentIndex) => ({
                            intentIndex,
                            checklistItemCount: Array.isArray(intent?.checklistItems) ? intent.checklistItems.length : 0,
                        }))
                        .filter((entry) => entry.checklistItemCount > 0),
                },
            });
            if (typeof telemetry.emitLatencyHistogram === 'function') {
                telemetry.emitLatencyHistogram({ stage: 'intent_extraction', durationMs: intentDurationMs });
            }

            if (intents.length === 0) {
                const userMessageText = (userMessage || '').toLowerCase();
                const hasActionVerb = /\b(add|create|move|complete|delete|schedule|priority|update|rename|done|finish)\b/.test(userMessageText);
                const hasDateOrTime = /\b(today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|am|pm|morning|afternoon|evening|\d{1,2}[:/]\d{2}|\d{4}-\d{2}-\d{2})\b/.test(userMessageText);
                const looksTaskLike = hasActionVerb || hasDateOrTime;

                if (looksTaskLike) {
                    console.log(`[Pipeline:${context.requestId}] No intents extracted but message looks task-like. Returning clarification.`);
                    const clarificationResult = {
                        type: 'clarification',
                        results: [],
                        errors: [],
                        confirmationText: "I couldn't parse that clearly. Try rephrasing with a specific action like 'create task...' or 'move X to project Y'.",
                        clarification: {
                            reason: 'empty_intents_task_like',
                        },
                        requestId: context.requestId || null,
                        entryPoint: context.entryPoint || null,
                        mode: context.mode || null,
                        workStyleMode: context.workStyleMode || null,
                        checklistContext: context.checklistContext || null,
                    };
                    context = finalizePipelineContext(context, requestStartedAt, {
                        resultType: 'clarification',
                        status: 'success',
                        summary: 'empty_intents_task_like',
                    });
                    await telemetry.emit(context, {
                        eventType: 'pipeline.request.completed',
                        step: 'result',
                        status: 'success',
                        durationMs: Date.now() - requestStartedAt,
                        metadata: {
                            type: 'clarification',
                            reason: 'empty_intents_task_like',
                        },
                    });
                    return attachPipelineContext(clarificationResult, context);
                }

                console.log(`[Pipeline:${context.requestId}] No intents extracted. Routing as non-task.`);
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'non-task',
                    status: 'success',
                    summary: NON_TASK_REASONS.EMPTY_INTENTS,
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.completed',
                    step: 'result',
                    status: 'success',
                    durationMs: Date.now() - requestStartedAt,
                    metadata: {
                        type: 'non-task',
                        reason: NON_TASK_REASONS.EMPTY_INTENTS,
                    },
                });
                return attachPipelineContext(buildNonTaskResult(context, NON_TASK_REASONS.EMPTY_INTENTS), context);
            }

            intents = repairMutationShapedCreateIntents(intents, context.userMessage);

            let deferredCreateFragmentClarification = null;
            const createClarificationIntents = intents.filter(intent => isCreateClarificationIntent(intent));
            const isCreateOnlyMessage = intents.every(intent => intent?.type === 'create');

            if (isCreateOnlyMessage && createClarificationIntents.length > 0) {
                const executableCreateIntents = intents.filter(intent => !isCreateClarificationIntent(intent));
                const clarificationQuestion = pickCreateClarificationQuestion(createClarificationIntents, context);
                const clarificationFragments = createClarificationIntents.map((intent) => ({
                    title: intent?.title || null,
                    clarificationQuestion: typeof intent?.clarificationQuestion === 'string' ? intent.clarificationQuestion : null,
                }));

                deferredCreateFragmentClarification = {
                    question: clarificationQuestion,
                    fragments: clarificationFragments,
                };

                if (executableCreateIntents.length === 0) {
                    const clarificationResult = {
                        type: 'clarification',
                        results: [],
                        errors: [],
                        confirmationText: clarificationQuestion,
                        clarification: {
                            reason: 'ambiguous_create_fragment',
                            fragments: clarificationFragments,
                        },
                        requestId: context.requestId || null,
                        entryPoint: context.entryPoint || null,
                        mode: context.mode || null,
                        workStyleMode: context.workStyleMode || null,
                        checklistContext: context.checklistContext || null,
                    };

                    context = finalizePipelineContext(context, requestStartedAt, {
                        resultType: 'clarification',
                        status: 'success',
                        summary: 'ambiguous_create_fragment',
                    });

                    await telemetry.emit(context, {
                        eventType: 'pipeline.request.completed',
                        step: 'result',
                        status: 'success',
                        durationMs: Date.now() - requestStartedAt,
                        metadata: {
                            type: 'clarification',
                            reason: 'ambiguous_create_fragment',
                        },
                    });

                    return attachPipelineContext(clarificationResult, context);
                }

                intents = executableCreateIntents;
            }

            // Checklist/multi-task classification: detect ambiguous structure requests
            const hasChecklist = intents.some(i => Array.isArray(i.checklistItems) && i.checklistItems.length > 0);
            const hasMultipleCreates = intents.filter(i => i.type === 'create').length > 1;
            context = updateChecklistContext(context, { hasChecklist });

            if (hasChecklist && hasMultipleCreates) {
                // Check if user already provided a preference (clarification resume path)
                const userPreference = options.checklistPreference || null;
                const userSkipped = options.skipChecklist === true;

                if (userSkipped) {
                    // User chose "single task" — drop checklist intent, keep first create
                    console.log(`[Pipeline:${context.requestId}] User skipped checklist clarification — creating single task only.`);
                    const firstCreate = intents.find(i => i.type === 'create');
                    if (firstCreate) {
                        // Remove checklist items from the intent
                        delete firstCreate.checklistItems;
                    }
                    // Continue processing with modified intents
                } else if (userPreference === 'checklist') {
                    // User chose checklist mode — merging creates into single task.
                    console.log(`[Pipeline:${context.requestId}] User chose checklist mode — merging creates into single task.`);
                    const checklistItems = [];
                    let mergedProjectHint = null;
                    for (const intent of intents) {
                        if (Array.isArray(intent.checklistItems) && intent.checklistItems.length > 0) {
                            checklistItems.push(...intent.checklistItems);
                        } else if (intent.type === 'create' && intent.title) {
                            // Convert standalone create into checklist item
                            checklistItems.push({ title: intent.title, sortOrder: checklistItems.length });
                        }
                        if (!mergedProjectHint && intent.projectHint) {
                            mergedProjectHint = intent.projectHint;
                        }
                    }
                    // Replace intents with single checklist create
                    const mergedIntent = {
                        type: 'create',
                        title: checklistItems[0]?.title || 'Checklist',
                        checklistItems,
                    };
                    if (mergedProjectHint) {
                        mergedIntent.projectHint = mergedProjectHint;
                    }
                    intents = [mergedIntent];
                } else if (userPreference === 'separate') {
                    // User chose separate tasks — strip checklist, keep all creates
                    console.log(`[Pipeline:${context.requestId}] User chose separate tasks — keeping all creates.`);
                    for (const intent of intents) {
                        delete intent.checklistItems;
                    }
                    // Continue processing with modified intents
                } else {
                    // No preference provided — ask for clarification
                    console.warn(`[Pipeline:${context.requestId}] Ambiguous checklist/multi-task request — asking for clarification.`);
                    const clarificationQuestion = isUrgentWorkStyle(context)
                        ? 'Checklist or separate tasks?'
                        : 'I noticed your message could be one task with sub-steps, or several separate tasks. Which did you mean?';
                    context = updateChecklistContext(context, { clarificationQuestion });
                    const clarificationResult = {
                        type: 'clarification',
                        results: [],
                        errors: [],
                        confirmationText: clarificationQuestion,
                        clarification: {
                            candidates: intents,
                            reason: 'ambiguous_checklist_vs_multi_task',
                        },
                        requestId: context.requestId || null,
                        entryPoint: context.entryPoint || null,
                        mode: context.mode || null,
                        checklistContext: context.checklistContext || null,
                    };
                    context = finalizePipelineContext(context, requestStartedAt, {
                        resultType: 'clarification',
                        status: 'success',
                        summary: 'ambiguous_checklist_vs_multi_task',
                    });

                    await telemetry.emit(context, {
                        eventType: 'pipeline.request.completed',
                        step: 'result',
                        status: 'success',
                        durationMs: Date.now() - requestStartedAt,
                        metadata: {
                            type: 'clarification',
                            reason: 'ambiguous_checklist_vs_multi_task',
                        },
                    });
                    return attachPipelineContext(clarificationResult, context);
                }
            }

            // Mutation routing: detect mutation intents and resolve targets
            const mutationTypes = ['update', 'complete', 'delete'];
            const hasMutation = intents.some(i => mutationTypes.includes(i.type));
            const hasCreate = intents.some(i => i.type === 'create');
            const mutationIntents = intents.filter(i => mutationTypes.includes(i.type));

            if (hasMutation && hasCreate) {
                // Mixed create+mutation: out of scope for v1
                console.warn(`[Pipeline:${context.requestId}] Mixed create+mutation request rejected.`);
                context = updatePipelineContext(context, (draft) => {
                    draft.lifecycle.validationFailures = snapshotPipelineValue(['mixed_create_and_mutation']);
                });
                const failureResult = buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    stage: 'mutation-routing',
                    summary: 'Mixed create+mutation request is out of scope.',
                    details: {
                        intentTypes: intents.map(i => i.type),
                    },
                    userMessage: buildMutationBoundaryMessage('mixed_create_and_mutation', context),
                    dryRun: isDryRun,
                    retryable: true,
                });
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'error',
                    status: 'failure',
                    summary: 'Mixed create+mutation request is out of scope.',
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    validationFailures: ['mixed_create_and_mutation'],
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    metadata: {
                        reason: 'mixed_create_and_mutation',
                    },
                });
                return attachPipelineContext(failureResult, context);
            }

            if (mutationIntents.length === 1 && isLikelyBatchMutationIntent(mutationIntents[0], context.userMessage)) {
                console.warn(`[Pipeline:${context.requestId}] Batch-style single mutation request rejected.`);
                context = updatePipelineContext(context, (draft) => {
                    draft.lifecycle.validationFailures = snapshotPipelineValue(['batch_mutation_not_supported']);
                });
                const failureResult = buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    stage: 'mutation-routing',
                    summary: 'Batch mutation request is out of scope.',
                    details: {
                        intentTypes: intents.map(i => i.type),
                        targetQueryPresent: Boolean(mutationIntents[0]?.targetQuery),
                    },
                    userMessage: buildMutationBoundaryMessage('batch_mutation_not_supported', context),
                    dryRun: isDryRun,
                    retryable: true,
                });
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'error',
                    status: 'failure',
                    summary: 'Batch mutation request is out of scope.',
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    validationFailures: ['batch_mutation_not_supported'],
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    metadata: {
                        reason: 'batch_mutation_not_supported',
                    },
                });
                return attachPipelineContext(failureResult, context);
            }

            let resolvedTask = null;
            let resolvedTaskContent = null;

            if (hasMutation) {
                const mutationIntent = intents.find(i => mutationTypes.includes(i.type));
                const targetQuery = mutationIntent?.targetQuery || null;

                // Use active tasks from context (populated by pipeline-context builder)
                const activeTasks = context.activeTasks || [];

                // If the intent already has a resolved taskId (from test harnesses or direct calls), use it
                if (mutationIntent?.taskId) {
                    resolvedTask = {
                        id: mutationIntent.taskId,
                        projectId: mutationIntent.originalProjectId || mutationIntent.projectId || null,
                        title: mutationIntent.title || null,
                    };
                    // Try to get content from active tasks
                    resolvedTaskContent = activeTasks.find(t => t.id === resolvedTask.id)?.content ?? null;
                } else if (targetQuery && !options.skipClarification) {
                    const resolveStartedAt = Date.now();
                    const resolverResult = resolveTarget({ targetQuery, activeTasks, recentTask: context.existingTask });

                    await telemetry.emit(context, {
                        eventType: 'pipeline.resolve.completed',
                        step: 'resolve',
                        status: resolverResult.status === 'resolved' ? 'success' : 'failure',
                        durationMs: Date.now() - resolveStartedAt,
                        metadata: {
                            targetQueryLength: targetQuery.length,
                            resultStatus: resolverResult.status,
                            candidateCount: resolverResult.candidates.length,
                        },
                    });

                    if (resolverResult.status === 'clarification') {
                        context = finalizePipelineContext(context, requestStartedAt, {
                            resultType: 'clarification',
                            status: 'success',
                            summary: resolverResult.reason,
                        });
                        return attachPipelineContext(buildClarificationResult(context, resolverResult), context);
                    }

                    if (resolverResult.status === 'not_found') {
                        context = finalizePipelineContext(context, requestStartedAt, {
                            resultType: 'not-found',
                            status: 'success',
                            summary: resolverResult.reason,
                        });
                        return attachPipelineContext(buildNotFoundResult(context, resolverResult.reason), context);
                    }

                    // resolved
                    resolvedTask = {
                        id: resolverResult.selected.taskId,
                        projectId: resolverResult.selected.projectId,
                        title: resolverResult.selected.title,
                    };
                    resolvedTaskContent = activeTasks.find(t => t.id === resolvedTask.id)?.content ?? null;

                    // ─── Destructive/Non-Exact Mutation Confirmation Gate ───
                    // When the resolver finds a match but it's not exact (prefix,
                    // contains, token_overlap, fuzzy, coreference), require explicit
                    // user confirmation before executing the mutation.
                    if (!options.skipMutationConfirmation && resolverResult.selected.matchConfidence !== 'exact') {
                        const targetTitle = resolverResult.selected.title || resolvedTask.title;
                        const pendingConfirmation = {
                            actionType: mutationIntent.type,
                            targetQuery: targetQuery,
                            matchedTask: {
                                taskId: resolverResult.selected.taskId,
                                projectId: resolverResult.selected.projectId,
                                title: targetTitle,
                            },
                            matchConfidence: resolverResult.selected.matchConfidence,
                            matchType: resolverResult.selected.matchType,
                            score: resolverResult.selected.score,
                            reason: resolverResult.reason,
                        };

                        context = finalizePipelineContext(context, requestStartedAt, {
                            resultType: 'pending-confirmation',
                            status: 'success',
                            summary: `non-exact_match_${resolverResult.selected.matchConfidence}`,
                        });

                        await telemetry.emit(context, {
                            eventType: 'pipeline.resolve.pending_confirmation',
                            step: 'resolve',
                            status: 'confirmation_needed',
                            durationMs: Date.now() - resolveStartedAt,
                            metadata: {
                                matchConfidence: resolverResult.selected.matchConfidence,
                                matchType: resolverResult.selected.matchType,
                                score: resolverResult.selected.score,
                                actionType: mutationIntent.type,
                            },
                        });

                        const receiptDestination = resolveReceiptDestinationForPendingMutation(mutationIntent, context);
                        const shouldAttachOperationReceipt = !['create', 'update'].includes(mutationIntent.type) || !!receiptDestination;
                        const terminalReceipt = shouldAttachOperationReceipt
                            ? buildOperationReceipt(context, {
                                status: 'pending_confirmation',
                                scope: 'local_review_queue',
                                command: resolveReceiptCommand(context),
                                operationType: mutationIntent.type,
                                nextAction: 'apply',
                                changed: false,
                                dryRun: false,
                                applied: false,
                                fallbackUsed: false,
                                message: 'Confirmation required before mutation can be applied.',
                                ...(receiptDestination ? { destination: receiptDestination } : {}),
                                confirmation: {
                                    target: { taskId: resolverResult.selected.taskId },
                                    outcome: 'Confirm this task mutation before applying it.',
                                },
                            })
                            : {
                                status: 'pending_confirmation',
                                scope: 'local_review_queue',
                                command: resolveReceiptCommand(context),
                                operationType: mutationIntent.type,
                                nextAction: 'apply',
                                changed: false,
                                dryRun: false,
                                applied: false,
                                fallbackUsed: false,
                                message: 'Confirmation required before mutation can be applied.',
                                traceId: context?.requestId || 'unknown-trace',
                                confirmation: {
                                    target: { taskId: resolverResult.selected.taskId },
                                    outcome: 'Confirm this task mutation before applying it.',
                                },
                            };
                        await emitTerminalOperationTelemetry(telemetry, context, terminalReceipt, {
                            actionCount: 1,
                        });

                        return attachPipelineContext({
                            type: 'pending-confirmation',
                            results: [],
                            errors: [],
                            confirmationText: buildMutationConfirmationMessage(pendingConfirmation, { workStyleMode: context.workStyleMode }),
                            pendingConfirmation,
                            ...(shouldAttachOperationReceipt ? { operationReceipt: terminalReceipt } : {}),
                            requestId: context.requestId || null,
                            entryPoint: context.entryPoint || null,
                            mode: context.mode || null,
                            workStyleMode: context.workStyleMode || null,
                            checklistContext: context.checklistContext || null,
                        }, context);
                    }

                    // Enrich the mutation intent with resolved context
                    mutationIntent.taskId = resolvedTask.id;
                    mutationIntent.resolvedTaskId = resolvedTask.id;
                    if (resolvedTask.projectId) {
                        mutationIntent.originalProjectId = resolvedTask.projectId;
                    }
                } else if (targetQuery && options.skipClarification && context.existingTask?.id) {
                    // Clarification resume: user selected a candidate, skip re-resolution
                    resolvedTask = context.existingTask;
                    resolvedTaskContent = activeTasks.find(t => t.id === resolvedTask.id)?.content ?? null;
                    mutationIntent.taskId = resolvedTask.id;
                    mutationIntent.resolvedTaskId = resolvedTask.id;
                    if (resolvedTask.projectId) {
                        mutationIntent.originalProjectId = resolvedTask.projectId;
                    }
                    console.log(`[Pipeline:${context.requestId}] Clarification resume: using pre-resolved task id=${resolvedTask.id}`);
                } else {
                    // No targetQuery and no taskId — try to use existingTask from context
                    if (context.existingTask?.id) {
                        resolvedTask = context.existingTask;
                        resolvedTaskContent = context.existingTask?.content ?? null;
                    }
                }
            }

            const defaultProjectMatches = defaultProjectName
                ? context.availableProjects.filter(p => p?.name?.toLowerCase() === defaultProjectName?.toLowerCase())
                : [];
            let defaultProjectId = defaultProjectMatches.length === 1 ? defaultProjectMatches[0].id : null;
            const defaultProjectResolution = defaultProjectMatches.length > 1
                ? {
                    confidence: 'ambiguous',
                    choices: defaultProjectMatches.map(project => ({ projectId: project.id, projectName: project.name })),
                }
                : defaultProjectId
                    ? { confidence: 'configured', projectId: defaultProjectId }
                    : { confidence: 'missing' };

            if (defaultProjectName && defaultProjectResolution.confidence === 'missing') {
                console.warn(`[Pipeline:${context.requestId}] Default project "${defaultProjectName}" not found. Blocking create actions without a resolved destination.`);
            } else if (defaultProjectName && defaultProjectResolution.confidence === 'ambiguous') {
                console.warn(`[Pipeline:${context.requestId}] Default project "${defaultProjectName}" is ambiguous. Blocking create actions without a unique destination.`);
            }

            const normOptions = {
                projects: context.availableProjects,
                defaultProjectId,
                defaultProjectResolution,
                existingTask: resolvedTask || context.existingTask,
                existingTaskContent: resolvedTaskContent || context.existingTask?.content || null,
                timezone: context.timezone,
                currentDate: context.currentDate,
            };

            const normalizeStartedAt = Date.now();
            const hasNormalizeActionBatch = typeof normalizer?.normalizeActionBatch === 'function';
            const hasValidateMutationBatch = typeof normalizer?.validateMutationBatch === 'function';
            const normalizedBatch = hasNormalizeActionBatch
                ? normalizer.normalizeActionBatch(intents, normOptions)
                : { actions: normalizer.normalizeActions(intents, normOptions), batchError: null };
            const normalizedActions = Array.isArray(normalizedBatch?.actions) ? normalizedBatch.actions : [];
            const batchValidation = normalizedBatch.batchError
                ? { valid: false, reason: normalizedBatch.batchError }
                : (hasValidateMutationBatch
                    ? normalizer.validateMutationBatch(normalizedActions)
                    : { valid: true, reason: null });

            if (!batchValidation.valid) {
                const reason = batchValidation.reason || 'unsupported_batch';
                context = updatePipelineContext(context, (draft) => {
                    draft.lifecycle.normalize.status = 'failure';
                    draft.lifecycle.normalize.normalizedActions = snapshotPrivacySafePipelineValue(normalizedActions);
                    draft.lifecycle.validationFailures = snapshotPipelineValue([reason]);
                    draft.lifecycle.timing.stages.normalize = {
                        startedAt: new Date(normalizeStartedAt).toISOString(),
                        durationMs: Date.now() - normalizeStartedAt,
                        status: 'failure',
                    };
                });
                const failureResult = buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    stage: 'normalize',
                    summary: `Unsupported action batch: ${reason}`,
                    details: {
                        reason,
                    },
                    userMessage: buildMutationBoundaryMessage(reason, context),
                    dryRun: isDryRun,
                    retryable: true,
                });
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'error',
                    status: 'failure',
                    summary: `Unsupported action batch: ${reason}`,
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    validationFailures: [reason],
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    metadata: {
                        reason,
                    },
                });
                return attachPipelineContext(failureResult, context);
            }

            const validActions = normalizedActions.filter(a => a.valid);
            const invalidActions = normalizedActions.filter(a => !a.valid);
            const blockedMutationDestinationActions = validActions.filter(action =>
                ['update', 'complete', 'delete'].includes(action.type) &&
                action.projectHint &&
                (!action.projectResolution || ['missing', 'ambiguous'].includes(action.projectResolution.confidence)),
            );
            context = updatePipelineContext(context, (draft) => {
                draft.lifecycle.normalize.status = 'success';
                draft.lifecycle.normalize.normalizedActions = snapshotPrivacySafePipelineValue(normalizedActions);
                draft.lifecycle.normalize.validActions = snapshotPrivacySafePipelineValue(validActions);
                draft.lifecycle.normalize.invalidActions = snapshotPrivacySafePipelineValue(invalidActions);
                draft.lifecycle.validationFailures = snapshotPipelineValue(invalidActions.map(a => a.validationErrors).flat());
                draft.lifecycle.timing.stages.normalize = {
                    startedAt: new Date(normalizeStartedAt).toISOString(),
                    durationMs: Date.now() - normalizeStartedAt,
                    status: 'success',
                };
            });

            const normalizeDurationMs = Date.now() - normalizeStartedAt;
            await telemetry.emit(context, {
                eventType: 'pipeline.normalize.completed',
                step: 'normalize',
                status: 'success',
                durationMs: normalizeDurationMs,
                metadata: {
                    normalizedCount: normalizedActions.length,
                    validCount: validActions.length,
                    invalidCount: invalidActions.length,
                    checklistActionCount: validActions.filter(a => Array.isArray(a.checklistItems) && a.checklistItems.length > 0).length,
                    totalNormalizedChecklistItems: validActions.reduce((sum, a) => sum + (Array.isArray(a.checklistItems) ? a.checklistItems.length : 0), 0),
                    checklistActionShape: validActions
                        .map((action, actionIndex) => ({
                            actionIndex,
                            sourceIntentIndex: Number.isInteger(action?._index) ? action._index : null,
                            checklistItemCount: Array.isArray(action?.checklistItems) ? action.checklistItems.length : 0,
                        }))
                        .filter((entry) => entry.checklistItemCount > 0),
                },
            });
            if (typeof telemetry.emitLatencyHistogram === 'function') {
                telemetry.emitLatencyHistogram({ stage: 'normalization', durationMs: normalizeDurationMs });
            }

            if (invalidActions.length > 0) {
                console.warn(
                    `[Pipeline:${context.requestId}] Filtered out ${invalidActions.length} invalid actions:`,
                    invalidActions.map(a => a.validationErrors),
                );
            }

            if (validActions.length === 0 && invalidActions.length > 0) {
                const failureResult = buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    stage: 'normalize',
                    summary: 'All intents failed validation.',
                    details: {
                        validationErrors: invalidActions.map(a => a.validationErrors),
                    },
                    dryRun: isDryRun,
                    retryable: true,
                });
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'error',
                    status: 'failure',
                    summary: 'All intents failed validation.',
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    validationFailures: invalidActions.map(a => a.validationErrors).flat(),
                });

                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                });
                return attachPipelineContext(failureResult, context);
            }

            if (validActions.length === 0) {
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'non-task',
                    status: 'success',
                    summary: 'no_valid_actions_after_normalization',
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.completed',
                    step: 'result',
                    status: 'success',
                    durationMs: Date.now() - requestStartedAt,
                    metadata: {
                        type: 'non-task',
                        reason: NON_TASK_REASONS.EMPTY_INTENTS,
                        note: 'No valid actions after normalization.',
                    },
                });
                return attachPipelineContext(buildNonTaskResult(context, NON_TASK_REASONS.EMPTY_INTENTS, {
                    note: 'No valid actions after normalization.',
                }), context);
            }

            if (blockedMutationDestinationActions.length > 0) {
                const confirmationText = 'Blocked — no safe TickTick destination found for mutation. Choose an exact project or remove the project hint, then retry.';
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'blocked',
                    status: 'failure',
                    summary: 'missing_project_destination',
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    validationFailures: ['missing_project_destination'],
                });
                const terminalReceipt = buildOperationReceipt(context, {
                    status: 'blocked',
                    scope: 'system',
                    command: resolveReceiptCommand(context),
                    operationType: blockedMutationDestinationActions[0].type,
                    nextAction: 'retry',
                    changed: false,
                    dryRun: isDryRun,
                    applied: false,
                    fallbackUsed: false,
                    message: confirmationText,
                    errorClass: 'validation',
                    destination: { confidence: 'missing' },
                });
                await emitTerminalOperationTelemetry(telemetry, context, terminalReceipt, {
                    actionCount: blockedMutationDestinationActions.length,
                });

                return attachPipelineContext({
                    type: 'blocked',
                    status: 'blocked',
                    results: [],
                    errors: ['missing_project_destination'],
                    confirmationText,
                    operationReceipt: terminalReceipt,
                    requestId: context.requestId,
                    entryPoint: context.entryPoint,
                    mode: context.mode,
                    workStyleMode: context.workStyleMode || null,
                    checklistContext: context.checklistContext || null,
                    warnings: ['missing_project_destination'],
                    dryRun: isDryRun,
                    applied: false,
                    changed: false,
                }, context);
            }

            const pendingCreateDestination = validActions.find(action => action.type === 'create' && action.projectResolution?.confidence === 'ambiguous');
            if (pendingCreateDestination) {
                const destination = resolveReceiptDestinationForCreate(pendingCreateDestination, context);
                const confirmationText = 'Blocked — ambiguous project destination. Choose an exact project name or restore a unique default project, then retry.';

                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'blocked',
                    status: 'failure',
                    summary: 'ambiguous_project_destination',
                });

                const terminalReceipt = buildOperationReceipt(context, {
                    status: 'blocked',
                    scope: 'system',
                    command: resolveReceiptCommand(context),
                    operationType: 'create',
                    nextAction: 'retry',
                    changed: false,
                    dryRun: isDryRun,
                    applied: false,
                    fallbackUsed: false,
                    message: confirmationText,
                    errorClass: 'validation',
                    destination: destination || { confidence: 'ambiguous', choices: pendingCreateDestination.projectResolution?.choices || [] },
                });
                await emitTerminalOperationTelemetry(telemetry, context, terminalReceipt, {
                    actionCount: 1,
                });

                return attachPipelineContext({
                    type: 'blocked',
                    status: 'blocked',
                    results: [],
                    errors: ['ambiguous_project_destination'],
                    confirmationText,
                    operationReceipt: terminalReceipt,
                    requestId: context.requestId,
                    entryPoint: context.entryPoint,
                    mode: context.mode,
                    workStyleMode: context.workStyleMode || null,
                    checklistContext: context.checklistContext || null,
                    warnings: ['ambiguous_project_destination'],
                    dryRun: isDryRun,
                    applied: false,
                    changed: false,
                }, context);
            }

            const createActionsMissingDestination = validActions.filter(action => action.type === 'create' && !action.projectId);
            if (createActionsMissingDestination.length > 0) {
                const confirmationText = 'Blocked — no safe TickTick destination found. Choose a project or restore an Inbox/default project, then retry.';
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'blocked',
                    status: 'failure',
                    summary: 'missing_project_destination',
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    validationFailures: ['missing_project_destination'],
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    metadata: {
                        reason: 'missing_project_destination',
                        type: 'blocked',
                        actionCount: createActionsMissingDestination.length,
                        dryRun: isDryRun,
                    },
                });
                const terminalReceipt = buildOperationReceipt(context, {
                    status: 'blocked',
                    scope: 'system',
                    command: resolveReceiptCommand(context),
                    operationType: 'create',
                    nextAction: 'retry',
                    changed: false,
                    dryRun: isDryRun,
                    applied: false,
                    fallbackUsed: false,
                    message: confirmationText,
                    errorClass: 'validation',
                    destination: { confidence: 'missing' },
                });
                await emitTerminalOperationTelemetry(telemetry, context, terminalReceipt, {
                    actionCount: createActionsMissingDestination.length,
                });

                return attachPipelineContext({
                    type: 'blocked',
                    status: 'blocked',
                    results: [],
                    errors: ['missing_project_destination'],
                    confirmationText,
                    operationReceipt: terminalReceipt,
                    requestId: context.requestId,
                    entryPoint: context.entryPoint,
                    mode: context.mode,
                    workStyleMode: context.workStyleMode || null,
                    checklistContext: context.checklistContext || null,
                    warnings: invalidActions.map(a => a.validationErrors).flat(),
                    dryRun: isDryRun,
                    applied: false,
                    changed: false,
                }, context);
            }

            if (isDryRun) {
                const dryRunConfirmationText = `Preview only — nothing changed. ${validActions.length} action(s) ready for review.`;
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'preview',
                    status: 'success',
                    summary: 'dry_run',
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.completed',
                    step: 'result',
                    status: 'success',
                    durationMs: Date.now() - requestStartedAt,
                    metadata: {
                        type: 'preview',
                        actionCount: validActions.length,
                        dryRun: true,
                        changed: false,
                    },
                });
                const terminalReceipt = buildOperationReceipt(context, {
                    status: 'preview',
                    scope: 'preview',
                    command: resolveReceiptCommand(context),
                    operationType: inferOperationType(validActions),
                    nextAction: 'apply',
                    changed: false,
                    dryRun: true,
                    applied: false,
                    fallbackUsed: false,
                    message: dryRunConfirmationText,
                });
                await emitTerminalOperationTelemetry(telemetry, context, terminalReceipt, {
                    actionCount: validActions.length,
                });

                return attachPipelineContext({
                    type: 'preview',
                    status: 'preview',
                    actions: validActions,
                    results: [],
                    errors: [],
                    confirmationText: dryRunConfirmationText,
                    operationReceipt: terminalReceipt,
                    requestId: context.requestId,
                    entryPoint: context.entryPoint,
                    mode: context.mode,
                    workStyleMode: context.workStyleMode || null,
                    checklistContext: context.checklistContext || null,
                    warnings: invalidActions.map(a => a.validationErrors).flat(),
                    checklistMetadata: validActions
                        .filter(a => Array.isArray(a.checklistItems) && a.checklistItems.length > 0)
                        .map(a => ({ actionIndex: a._index ?? null, checklistItemCount: a.checklistItems.length })),
                    dryRun: true,
                    applied: false,
                    changed: false,
                }, context);
            }

            const skippedActions = [];
            const executableActions = validActions.filter(a => {
                if (blockedActionTypes.has(a.type)) {
                    skippedActions.push(a);
                    return false;
                }
                return true;
            });

            // Strip title/content from update actions when applyMode is metadata-only.
            // This prevents title rewrites and content rewrites, allowing only metadata
            // changes (priority, project, schedule) to pass through.
            if (options.applyMode === 'metadata-only') {
                for (const a of executableActions) {
                    if (a.type === 'update') {
                        delete a.title;
                        delete a.content;
                    }
                }
            }

            const executionResult = await _executeActions(executableActions, adapter, context, telemetry);
            context = updatePipelineContext(context, (draft) => {
                draft.lifecycle.execute.status = executionResult.terminalFailure ? 'failure' : 'success';
                draft.lifecycle.execute.requests = snapshotPrivacySafePipelineValue(executionResult.executionRequests);
                draft.lifecycle.execute.results = snapshotPrivacySafePipelineValue(executionResult.executionResults);
                draft.lifecycle.execute.failures = snapshotPrivacySafePipelineValue(executionResult.failures);
                draft.lifecycle.execute.rollbackFailures = snapshotPrivacySafePipelineValue(executionResult.rollbackFailures);
                draft.lifecycle.timing.stages.execute = {
                    startedAt: new Date(executionResult.executeStartedAt).toISOString(),
                    durationMs: executionResult.durationMs,
                    status: executionResult.terminalFailure ? 'failure' : 'success',
                };
            });
            if (typeof telemetry.emitLatencyHistogram === 'function') {
                telemetry.emitLatencyHistogram({ stage: 'execution', durationMs: executionResult.durationMs });
            }

            if (executionResult.terminalFailure) {
                const deferredIntent = await persistDeferredIntent({
                    context,
                    intents,
                    normalizedActions: validActions,
                    terminalFailure: executionResult.terminalFailure,
                });

                if (deferredIntent) {
                    executionResult.terminalFailure.details = {
                        ...(executionResult.terminalFailure.details || {}),
                        deferredIntent,
                    };
                    executionResult.terminalFailure.userMessage = '⚠️ TickTick API is unavailable right now. Parsed intent was saved for retry.';
                }

                const terminalReceipt = {
                    status: deferredIntent ? 'deferred' : 'failed',
                    scope: deferredIntent ? 'deferred_queue' : 'system',
                    command: resolveReceiptCommand(context),
                    operationType: inferOperationType(validActions),
                    nextAction: deferredIntent ? 'wait' : 'retry',
                    changed: !!deferredIntent,
                    dryRun: isDryRun,
                    applied: false,
                    fallbackUsed: !!deferredIntent,
                    message: deferredIntent
                        ? 'Parsed intent was saved for retry.'
                        : 'Task updates failed.',
                    errorClass: mapTerminalFailureClassToErrorClass(
                        executionResult.terminalFailure.failureClass,
                        executionResult.terminalFailure,
                    ),
                    failed: Number.isInteger(executionResult.terminalFailure.failureCount)
                        ? executionResult.terminalFailure.failureCount
                        : null,
                    rolledBack: !!executionResult.terminalFailure.rolledBack,
                };
                await emitTerminalOperationTelemetry(telemetry, context, terminalReceipt, {
                    actionCount: validActions.length,
                });

                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'error',
                    status: 'failure',
                    summary: executionResult.terminalFailure.summary,
                    failureClass: executionResult.terminalFailure.failureClass,
                    rolledBack: executionResult.terminalFailure.rolledBack,
                    validationFailures: context.lifecycle.validationFailures,
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: executionResult.terminalFailure.failureClass,
                    rolledBack: executionResult.terminalFailure.rolledBack,
                    metadata: {
                        actionIndex: executionResult.terminalFailure.actionIndex,
                        attempts: executionResult.terminalFailure.attempts,
                    },
                });

                return attachPipelineContext(buildFailureResult(context, {
                    failureClass: executionResult.terminalFailure.failureClass,
                    stage: executionResult.terminalFailure.stage,
                    summary: executionResult.terminalFailure.summary,
                    userMessage: executionResult.terminalFailure.userMessage,
                    developerMessage: executionResult.terminalFailure.developerMessage,
                    details: {
                        ...(executionResult.terminalFailure.details || {}),
                        failures: executionResult.failures,
                        rollbackFailures: executionResult.rollbackFailures,
                        successCount: executionResult.terminalFailure.successCount,
                        failureCount: executionResult.terminalFailure.failureCount,
                        partialFailure: executionResult.terminalFailure.failureCategory === FAILURE_CATEGORIES.PARTIAL,
                    },
                    retryable: executionResult.terminalFailure.retryable,
                    rolledBack: executionResult.terminalFailure.rolledBack,
                    dryRun: isDryRun,
                    results: executionResult.results,
                    intents,
                    normalizedActions: validActions,
                }), context);
            }

            const allErrors = [
                ...invalidActions.map(a => a.validationErrors.join(', ')),
                ...executionResult.errors,
            ];

            const successCount = Number.isInteger(executionResult.successCount)
                ? executionResult.successCount
                : executionResult.results.filter(r => r.status === 'succeeded').length;

            const baseConfirmationText = _buildConfirmation(executionResult.results, executionResult.errors, context);
            const confirmationText = deferredCreateFragmentClarification
                ? `${baseConfirmationText}\n\n${deferredCreateFragmentClarification.question}`
                : baseConfirmationText;
            const terminalReceipt = buildOperationReceipt(context, successCount > 0 ? {
                status: 'applied',
                scope: 'ticktick_live',
                command: resolveReceiptCommand(context),
                operationType: inferOperationType(validActions),
                nextAction: 'none',
                changed: true,
                dryRun: false,
                applied: true,
                fallbackUsed: false,
                message: `Applied ${successCount} task action${successCount === 1 ? '' : 's'}.`,
                succeeded: successCount,
            } : {
                status: skippedActions.length > 0 ? 'blocked' : 'failed',
                scope: 'system',
                command: resolveReceiptCommand(context),
                operationType: inferOperationType(validActions),
                nextAction: skippedActions.length > 0 ? 'retry' : 'none',
                changed: false,
                dryRun: false,
                applied: false,
                fallbackUsed: false,
                message: skippedActions.length > 0
                    ? 'No executable actions were available.'
                    : 'No task actions were applied.',
            });
            await emitTerminalOperationTelemetry(telemetry, context, terminalReceipt, {
                actionCount: validActions.length,
            });
            context = finalizePipelineContext(context, requestStartedAt, {
                resultType: 'task',
                status: 'success',
                summary: 'task_execution_completed',
                validationFailures: context.lifecycle.validationFailures,
            });

            await telemetry.emit(context, {
                eventType: 'pipeline.request.completed',
                step: 'result',
                status: 'success',
                durationMs: Date.now() - requestStartedAt,
                metadata: {
                    type: 'task',
                    actionCount: validActions.length,
                    checklistActionCount: validActions.filter(a => Array.isArray(a.checklistItems) && a.checklistItems.length > 0).length,
                },
            });

            return attachPipelineContext({
                type: 'task',
                actions: validActions,
                results: executionResult.results,
                errors: allErrors,
                skippedActions,
                confirmationText,
                operationReceipt: terminalReceipt,
                requestId: context.requestId,
                entryPoint: context.entryPoint,
                mode: context.mode,
                workStyleMode: context.workStyleMode || null,
                checklistContext: context.checklistContext || null,
                warnings: invalidActions.map(a => a.validationErrors).flat(),
                checklistMetadata: validActions
                    .filter(a => Array.isArray(a.checklistItems) && a.checklistItems.length > 0)
                    .map(a => ({ actionIndex: a._index ?? null, checklistItemCount: a.checklistItems.length })),
                ...(deferredCreateFragmentClarification ? {
                    clarification: {
                        reason: 'ambiguous_create_fragment',
                        fragments: deferredCreateFragmentClarification.fragments,
                    },
                } : {}),
            }, context);
        } catch (error) {
            let failureClass = FAILURE_CLASSES.UNEXPECTED;
            let stage = 'pipeline';
            let summary = 'Unhandled pipeline error.';
            let deferredAiQuotaIntent = null;

            if (error?.code === 'PIPELINE_CONTEXT_INVALID') {
                failureClass = FAILURE_CLASSES.VALIDATION;
                stage = 'context';
                summary = 'Invalid pipeline request context.';
            } else if (error instanceof AIHardQuotaError) {
                failureClass = FAILURE_CLASSES.QUOTA;
                stage = 'intent';
                summary = 'AI hard quota exhausted after configured key rotation.';
                deferredAiQuotaIntent = isDryRun ? null : await persistDeferredAiQuotaIntent({ userMessage, context });
            } else if (error instanceof AIServiceUnavailableError) {
                failureClass = FAILURE_CLASSES.QUOTA;
                stage = 'intent';
                summary = 'AI service unavailable after model fallback chain exhausted.';
                deferredAiQuotaIntent = isDryRun ? null : await persistDeferredAiQuotaIntent({ userMessage, context });
            } else if (error instanceof AIInvalidKeyError) {
                failureClass = FAILURE_CLASSES.QUOTA;
                stage = 'intent';
                summary = 'AI API keys invalid or expired.';
            } else if (isQuotaFailure(error)) {
                failureClass = FAILURE_CLASSES.QUOTA;
                stage = 'intent';
                summary = 'AI quota exhausted after configured key rotation.';
            }

            console.error(`[Pipeline] Unhandled pipeline error: ${getSafeErrorName(error)}`);

            if (context) {
                const terminalReceipt = buildOperationReceipt(context, {
                    status: deferredAiQuotaIntent ? 'deferred' : (isDryRun ? 'blocked' : 'failed'),
                    scope: deferredAiQuotaIntent ? 'deferred_queue' : 'system',
                    command: resolveReceiptCommand(context),
                    operationType: 'none',
                    nextAction: deferredAiQuotaIntent ? 'wait' : (isDryRun ? 'retry' : (failureClass === FAILURE_CLASSES.QUOTA ? 'wait' : 'retry')),
                    changed: !!deferredAiQuotaIntent,
                    dryRun: isDryRun,
                    applied: false,
                    fallbackUsed: !!deferredAiQuotaIntent,
                    message: deferredAiQuotaIntent
                        ? 'Parsed intent was saved for retry.'
                        : 'Task processing failed.',
                    errorClass: mapFailureClassToErrorClass(failureClass, { deferredIntent: deferredAiQuotaIntent }),
                });
                await emitTerminalOperationTelemetry(telemetry, context, terminalReceipt, {
                    actionCount: Number.isInteger(context?.lifecycle?.normalizedActions?.length)
                        ? context.lifecycle.normalizedActions.length
                        : null,
                });
                context = finalizePipelineContext(context, requestStartedAt, {
                    resultType: 'error',
                    status: 'failure',
                    summary,
                    failureClass,
                    rolledBack: false,
                    validationFailures: context.lifecycle.validationFailures,
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass,
                    rolledBack: false,
                    metadata: {
                        errorName: getSafeErrorName(error),
                        deferredAiQuota: !!deferredAiQuotaIntent,
                    },
                });
            }

            return attachPipelineContext(buildFailureResult(context, {
                failureClass,
                stage,
                summary,
                error,
                userMessage: deferredAiQuotaIntent
                    ? 'AI temporarily unavailable. I\'ll retry this in a few minutes.'
                    : undefined,
                details: deferredAiQuotaIntent ? { deferredIntent: deferredAiQuotaIntent } : undefined,
                dryRun: isDryRun,
                retryable: failureClass !== FAILURE_CLASSES.MALFORMED_INTENT,
            }), context);
        }
    }

    async function _executeActions(actions, adapter, context, telemetry) {
        const executeStartedAt = Date.now();
        const retryConfig = getPipelineRetryConfig();
        const results = [];
        const errors = [];
        const failures = [];
        const rollbackFailures = [];
        const successfulRecords = [];
        const executionRequests = [];
        const executionResults = [];
        const succeededActionLabels = [];
        const failedActionLabels = [];
        const maxAttempts = retryConfig.maxRetries + 1;

        console.log(`[Pipeline:${context.requestId}] Executing ${actions.length} valid action(s).`);

        for (let index = 0; index < actions.length; index++) {
            const action = actions[index];
            const record = createExecutionRecord(action, index);

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                record.attempts = attempt;
                executionRequests.push(snapshotPipelineValue({
                    phase: 'execute',
                    actionIndex: index,
                    attempt,
                    action,
                }));

                try {
                    const preWriteSnapshot = await capturePreWriteSnapshot(action, adapter);
                    const result = await executeAction(action, adapter, { verifyAfterWrite: true });
                    executionResults.push(snapshotPipelineValue({
                        phase: 'execute',
                        actionIndex: index,
                        attempt,
                        status: 'success',
                        actionType: action.type,
                        result,
                    }));
                    record.result = result;
                    record.rollbackStep = buildRollbackStep(action, index, result, preWriteSnapshot);
                    record.status = 'succeeded';
                    record.failureClass = ACTION_FAILURE_CLASSES.NONE;
                    record.errorMessage = null;
                    successfulRecords.push(record);
                    succeededActionLabels.push(getActionLabel(action));

                    console.log(`[Pipeline:${context.requestId}] ✅ ${action.type.toUpperCase()} successful: taskId=${result?.id || action.taskId || 'n/a'}`);
                    await telemetry.emit(context, {
                        eventType: 'pipeline.execute.succeeded',
                        step: 'execute',
                        status: 'success',
                        actionType: action.type,
                        attempt,
                        rolledBack: false,
                        metadata: {
                            actionIndex: index,
                            checklistItemCount: Array.isArray(action.checklistItems) ? action.checklistItems.length : null,
                            adapterChecklistPayloadCount: Array.isArray(action.checklistItems)
                                ? action.checklistItems.length
                                : null,
                        },
                    });
                    break;
                } catch (err) {
                    const message = err?.message || 'Unknown adapter failure';
                    const adapterError = extractAdapterErrorMeta(err);
                    const adapterFailureCategory = classifyAdapterFailureCategory(err || message);
                    const isAdapterRateLimited = adapterError.statusCode === 429
                        || adapterError.code === 'RATE_LIMITED'
                        || adapterError.code === 'RATE_LIMIT_QUOTA_EXHAUSTED';
                    executionResults.push(snapshotPipelineValue({
                        phase: 'execute',
                        actionIndex: index,
                        attempt,
                        status: 'failure',
                        actionType: action.type,
                        errorMessage: message,
                        errorCode: adapterError.code || null,
                        statusCode: adapterError.statusCode || null,
                        retryAfterMs: adapterError.retryAfterMs,
                        retryAt: adapterError.retryAt,
                        isQuotaExhausted: adapterError.isQuotaExhausted,
                        willRetry: adapterFailureCategory === FAILURE_CATEGORIES.TRANSIENT && attempt < maxAttempts && !isAdapterRateLimited,
                        failureCategory: adapterFailureCategory,
                    }));
                    record.errorMessage = message;
                    record.failureClass = ACTION_FAILURE_CLASSES.ADAPTER;

                    console.error(`[Pipeline:${context.requestId}] ❌ API Failure during ${action.type} (attempt ${attempt}):`, message);
                    await telemetry.emit(context, {
                        eventType: 'pipeline.execute.failed',
                        step: 'execute',
                        status: 'failure',
                        failureClass: FAILURE_CLASSES.ADAPTER,
                        actionType: action.type,
                        attempt,
                        rolledBack: false,
                        metadata: {
                            actionIndex: index,
                            willRetry: adapterFailureCategory === FAILURE_CATEGORIES.TRANSIENT && attempt < maxAttempts && !isAdapterRateLimited,
                            failureCategory: adapterFailureCategory,
                            errorCode: adapterError.code || null,
                            statusCode: adapterError.statusCode || null,
                            retryAfterMs: adapterError.retryAfterMs,
                            retryAt: adapterError.retryAt,
                            isQuotaExhausted: adapterError.isQuotaExhausted,
                        },
                    });

                    if (adapterFailureCategory === FAILURE_CATEGORIES.TRANSIENT && attempt < maxAttempts && !isAdapterRateLimited) {
                        await sleep(calculatePipelineBackoffMs(attempt, retryConfig));
                        continue;
                    }

                    record.status = 'failed';
                    errors.push(`${action.type} failed: ${message}`);
                    failures.push(buildExecutionFailure(action, message, attempt, err));
                    failedActionLabels.push(getActionLabel(action));
                    results.push(record);

                    appendUnexecutedActionsAsFailures({
                        actions,
                        startIndex: index + 1,
                        results,
                        errors,
                        failures,
                        failedActionLabels,
                    });

                    if (successfulRecords.length === 0) {
                        return {
                            executeStartedAt,
                            durationMs: Date.now() - executeStartedAt,
                            executionRequests,
                            executionResults,
                            results,
                            errors,
                            failures,
                            rollbackFailures,
                            successCount: 0,
                            failureCount: failures.length,
                            terminalFailure: {
                                failureClass: FAILURE_CLASSES.ADAPTER,
                                failureCategory: adapterFailureCategory,
                                stage: 'adapter',
                                summary: 'Task execution failed before rollback could run.',
                                userMessage: buildUserFailureMessage({
                                    failureClass: FAILURE_CLASSES.ADAPTER,
                                    failureCategory: adapterFailureCategory,
                                    details: {
                                        successCount: 0,
                                        failureCount: failures.length,
                                        adapterError,
                                        succeededTitles: succeededActionLabels,
                                        failedTitles: failedActionLabels,
                                    },
                                    rolledBack: false,
                                }),
                                developerMessage: `Action ${index} (${action.type}) failed after ${attempt} attempt(s): ${message}`,
                                retryable: adapterFailureCategory === FAILURE_CATEGORIES.TRANSIENT,
                                rolledBack: false,
                                actionIndex: index,
                                attempts: attempt,
                                successCount: 0,
                                failureCount: failures.length,
                                details: {
                                    adapterError,
                                    succeededTitles: succeededActionLabels,
                                    failedTitles: failedActionLabels,
                                },
                            },
                        };
                    }

                    const rollbackResult = await rollbackSuccessfulActions(
                        successfulRecords,
                        adapter,
                        context,
                        telemetry,
                        rollbackFailures,
                        executionRequests,
                        executionResults,
                    );

                    if (rollbackResult.allSucceeded) {
                        return {
                            executeStartedAt,
                            durationMs: Date.now() - executeStartedAt,
                            executionRequests,
                            executionResults,
                            results,
                            errors,
                            failures,
                            rollbackFailures,
                            successCount: 0,
                            failureCount: failures.length,
                            terminalFailure: {
                                failureClass: FAILURE_CLASSES.ADAPTER,
                                failureCategory: FAILURE_CATEGORIES.PARTIAL,
                                stage: 'adapter',
                                summary: 'Task execution failed after retry. Earlier successful writes were rolled back.',
                                userMessage: buildUserFailureMessage({
                                    failureClass: FAILURE_CLASSES.ADAPTER,
                                    failureCategory: FAILURE_CATEGORIES.PARTIAL,
                                    details: {
                                        partialFailure: true,
                                        successCount: rollbackResult.recordsInOriginalOrder.length,
                                        failureCount: failures.length,
                                        succeededTitles: succeededActionLabels,
                                        failedTitles: failedActionLabels,
                                    },
                                    rolledBack: true,
                                }),
                                developerMessage: `Action ${index} (${action.type}) failed after ${attempt} attempt(s). Rollback succeeded for ${rollbackResult.recordsInOriginalOrder.length} earlier action(s).`,
                                retryable: true,
                                rolledBack: true,
                                actionIndex: index,
                                attempts: attempt,
                                successCount: rollbackResult.recordsInOriginalOrder.length,
                                failureCount: failures.length,
                                details: {
                                    succeededTitles: succeededActionLabels,
                                    failedTitles: failedActionLabels,
                                    rolledBackCount: rollbackResult.recordsInOriginalOrder.filter(
                                        (record) => record?.status === 'rolled_back',
                                    ).length,
                                },
                            },
                        };
                    }

                    return {
                        executeStartedAt,
                        durationMs: Date.now() - executeStartedAt,
                        executionRequests,
                        executionResults,
                        results,
                        errors,
                        failures,
                        rollbackFailures,
                        successCount: 0,
                        failureCount: failures.length,
                        terminalFailure: {
                            failureClass: FAILURE_CLASSES.ROLLBACK,
                            failureCategory: FAILURE_CATEGORIES.PARTIAL,
                            stage: 'rollback',
                            summary: 'Task execution failed after retry, and rollback was incomplete.',
                            userMessage: buildUserFailureMessage({
                                failureClass: FAILURE_CLASSES.ROLLBACK,
                                failureCategory: FAILURE_CATEGORIES.PARTIAL,
                                details: {
                                    partialFailure: true,
                                    successCount: rollbackResult.recordsInOriginalOrder.length,
                                    failureCount: failures.length,
                                    succeededTitles: succeededActionLabels,
                                    failedTitles: failedActionLabels,
                                    rolledBackCount: rollbackResult.recordsInOriginalOrder.length,
                                },
                                rolledBack: false,
                            }),
                            developerMessage: `Action ${index} (${action.type}) failed after ${attempt} attempt(s). Rollback failed for ${rollbackFailures.length} earlier action(s).`,
                            retryable: false,
                            rolledBack: false,
                            actionIndex: index,
                            attempts: attempt,
                            successCount: rollbackResult.recordsInOriginalOrder.length,
                            failureCount: failures.length,
                            details: {
                                succeededTitles: succeededActionLabels,
                                failedTitles: failedActionLabels,
                                rolledBackCount: rollbackResult.recordsInOriginalOrder.filter(
                                    (record) => record?.status === 'rolled_back',
                                ).length,
                            },
                        },
                    };
                }
            }

            if (!results.includes(record)) {
                results.push(record);
            }
        }

        return {
            executeStartedAt,
            durationMs: Date.now() - executeStartedAt,
            executionRequests,
            executionResults,
            results,
            errors,
            failures,
            rollbackFailures,
            successCount: results.filter(r => r.status === 'succeeded').length,
            failureCount: 0,
            terminalFailure: null,
        };
    }

    async function rollbackSuccessfulActions(
        successfulRecords,
        adapter,
        context,
        telemetry,
        rollbackFailures,
        executionRequests,
        executionResults,
    ) {
        const recordsInOriginalOrder = [...successfulRecords].sort((left, right) => left.index - right.index);
        const recordsInRollbackOrder = [...recordsInOriginalOrder].reverse();

        for (const record of recordsInRollbackOrder) {
            const rollbackStep = record.rollbackStep;

            if (!rollbackStep) {
                record.status = 'rollback_failed';
                record.failureClass = ACTION_FAILURE_CLASSES.ROLLBACK;
                record.errorMessage = `No rollback step recorded for action ${record.index}`;
                rollbackFailures.push({
                    actionIndex: record.index,
                    rollbackType: null,
                    message: record.errorMessage,
                });

                await telemetry.emit(context, {
                    eventType: 'pipeline.rollback.failed',
                    step: 'rollback',
                    status: 'failure',
                    failureClass: FAILURE_CLASSES.ROLLBACK,
                    actionType: record.action.type,
                    attempt: 1,
                    rolledBack: false,
                    metadata: {
                        actionIndex: record.index,
                        rollbackType: null,
                    },
                });
                continue;
            }

            try {
                executionRequests.push(snapshotPipelineValue({
                    phase: 'rollback',
                    actionIndex: record.index,
                    attempt: 1,
                    rollbackStep,
                }));
                await executeRollbackStep(rollbackStep, adapter);
                executionResults.push(snapshotPipelineValue({
                    phase: 'rollback',
                    actionIndex: record.index,
                    attempt: 1,
                    status: 'success',
                    rollbackType: rollbackStep.type,
                }));
                record.status = 'rolled_back';
                record.failureClass = ACTION_FAILURE_CLASSES.NONE;
                record.errorMessage = null;

                await telemetry.emit(context, {
                    eventType: 'pipeline.rollback.succeeded',
                    step: 'rollback',
                    status: 'success',
                    actionType: record.action.type,
                    attempt: 1,
                    rolledBack: true,
                    metadata: {
                        actionIndex: record.index,
                        rollbackType: rollbackStep.type,
                    },
                });
            } catch (error) {
                executionResults.push(snapshotPipelineValue({
                    phase: 'rollback',
                    actionIndex: record.index,
                    attempt: 1,
                    status: 'failure',
                    rollbackType: rollbackStep.type,
                    errorMessage: error.message,
                }));
                record.status = 'rollback_failed';
                record.failureClass = ACTION_FAILURE_CLASSES.ROLLBACK;
                record.errorMessage = error.message;
                rollbackFailures.push({
                    actionIndex: record.index,
                    rollbackType: rollbackStep.type,
                    message: error.message,
                });

                await telemetry.emit(context, {
                    eventType: 'pipeline.rollback.failed',
                    step: 'rollback',
                    status: 'failure',
                    failureClass: FAILURE_CLASSES.ROLLBACK,
                    actionType: record.action.type,
                    attempt: 1,
                    rolledBack: false,
                    metadata: {
                        actionIndex: record.index,
                        rollbackType: rollbackStep.type,
                        message: error.message,
                    },
                });
            }
        }

        return {
            recordsInOriginalOrder,
            allSucceeded: rollbackFailures.length === 0,
        };
    }

    function _buildConfirmation(results, errors, context = null) {
        const successful = results.filter(r => r.status === 'succeeded');
        const failed = results.filter(r => r.status === 'failed' || r.status === 'rollback_failed');
        const urgentMode = isUrgentWorkStyle(context);

        if (successful.length === 0 && failed.length > 0) {
            return `⚠️ All ${failed.length} action(s) failed.`;
        }

        let text = '';

        const created = successful.filter(r => r.action.type === 'create');
        const updated = successful.filter(r => r.action.type === 'update');
        const completed = successful.filter(r => r.action.type === 'complete');
        const deleted = successful.filter(r => r.action.type === 'delete');

        if (successful.length === 1 && created.length === 1) {
            const checklistCount = Array.isArray(created[0].action.checklistItems)
                ? created[0].action.checklistItems.length
                : 0;
            const checklistSuffix = checklistCount > 0 ? ` (${checklistCount} items)` : '';
            text = urgentMode
                ? `${created[0].action.title}${checklistSuffix}`
                : `Created: ${created[0].action.title}${checklistSuffix}`;
        } else {
            const parts = [];
            if (created.length > 0) parts.push(urgentMode ? `Created ${created.length}` : `Created ${created.length} tasks`);
            if (updated.length > 0) parts.push(urgentMode ? `Updated ${updated.length}` : `Updated ${updated.length} task(s)`);
            if (completed.length > 0) parts.push(urgentMode ? `Completed ${completed.length}` : `Completed ${completed.length} task(s)`);
            if (deleted.length > 0) parts.push(urgentMode ? `Deleted ${deleted.length}` : `Deleted ${deleted.length} task(s)`);

            text = urgentMode ? `Done. ${parts.join(', ')}` : `${parts.join(', ')}`;
        }

        if (errors && errors.length > 0) {
            text += urgentMode
                ? `\n⚠️ ${failed.length} skipped/failed.`
                : `\n⚠️ ${failed.length} action(s) skipped or failed.`;
        }

        return text;
    }

    /**
     * Builds a request context then runs processMessage — canonical
     * context-wired entry point.  All bot handlers, callbacks, and
     * scheduler poll paths should call this instead of duplicating
     * the createRequestContext → processMessage dance locally.
     */
    async function processMessageWithContext(userMessage, options = {}) {
        if (!options.existingTask && options.recentTask) {
            options = { ...options, existingTask: options.recentTask };
        }
        const requestContext = await contextBuilder.buildRequestContext(userMessage, options);
        return processMessage(userMessage, { ...options, requestContext });
    }

    return {
        processMessage,
        processMessageWithContext,
        createRequestContext: (userMessage, options = {}) => contextBuilder.buildRequestContext(userMessage, options),
    };
}
