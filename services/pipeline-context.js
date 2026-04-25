import crypto from 'crypto';
import { getUserTimezone } from './user-settings.js';

/**
 * List of required fields for a valid pipeline request context.
 * @type {string[]}
 */
const REQUIRED_FIELDS = [
    'requestId',
    'entryPoint',
    'mode',
    'userMessage',
    'currentDate',
    'timezone',
    'availableProjects',
    'existingTask',
];

/** @type {string} */
const DEFAULT_ENTRY_POINT = 'unknown';
/** @type {string} */
const DEFAULT_MODE = 'default';
/** @type {string} */
const DEFAULT_WORK_STYLE_MODE = 'standard';

/**
 * Clones a value using structuredClone or JSON fallback.
 * @param {*} value - The value to clone
 * @returns {*} Cloned value
 */
function cloneValue(value) {
    if (value === undefined) return undefined;
    if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}

/**
 * Recursively freezes an object and its nested properties.
 * @param {*} value - The value to freeze
 * @param {WeakSet} [seen] - Set to track visited objects for circular references
 * @returns {*} Frozen value
 */
function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);

    Object.freeze(value);
    for (const nested of Object.values(value)) {
        deepFreeze(nested, seen);
    }
    return value;
}

/**
 * Keys containing potentially sensitive user data that should be redacted in diagnostics.
 * @type {Set<string>}
 */
const PRIVACY_REDACTION_KEYS = new Set([
    'userMessage',
    'title',
    'content',
    'description',
    'desc',
    'originalTitle',
    'originalContent',
    'targetQuery',
    'existingTaskContent',
]);

/**
 * Sanitizes an object for diagnostics by redacting sensitive keys.
 * @param {*} value - The object to sanitize
 * @returns {*} Sanitized object
 */
function sanitizePipelineDiagnosticValue(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizePipelineDiagnosticValue(entry));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }

    const sanitized = {};
    for (const [key, nested] of Object.entries(value)) {
        if (PRIVACY_REDACTION_KEYS.has(key) && typeof nested === 'string' && nested.length > 0) {
            sanitized[key] = '<redacted>';
            if (key === 'userMessage' || key === 'targetQuery') {
                sanitized[`${key}Length`] = nested.length;
            }
            continue;
        }
        sanitized[key] = sanitizePipelineDiagnosticValue(nested);
    }
    return sanitized;
}

/**
 * Creates a deep clone of a pipeline value.
 * @param {*} value - Value to snapshot
 * @returns {*} Cloned value
 */
export function snapshotPipelineValue(value) {
    return cloneValue(value);
}

/**
 * Creates a redacted deep clone of a pipeline value for logging.
 * @param {*} value - Value to snapshot
 * @returns {*} Redacted clone
 */
export function snapshotPrivacySafePipelineValue(value) {
    return cloneValue(sanitizePipelineDiagnosticValue(value));
}

/**
 * Redacts sensitive info and freezes a pipeline context for diagnostics.
 * @param {Object} context - Pipeline context
 * @returns {Object} Sanitized and frozen context
 */
export function sanitizePipelineContextForDiagnostics(context) {
    return deepFreeze(snapshotPrivacySafePipelineValue(context));
}

/**
 * Updates a pipeline context using a draft/updater pattern and freezes the result.
 * @param {Object} context - Current pipeline context
 * @param {Function} updater - Function that receives a mutable draft
 * @returns {Object} Updated and frozen context
 */
export function updatePipelineContext(context, updater) {
    const draft = cloneValue(context);
    updater(draft);
    return deepFreeze(draft);
}

/**
 * Creates the initial lifecycle state for a new pipeline request.
 * @param {Object} baseContext - The base request context
 * @returns {Object} Initial lifecycle state
 */
function createLifecycleState(baseContext) {
    return {
        request: {
            metadata: {
                requestId: baseContext.requestId,
                correlationId: baseContext.correlationId,
                entryPoint: baseContext.entryPoint,
                mode: baseContext.mode,
                workStyleMode: baseContext.workStyleMode,
                currentDate: baseContext.currentDate,
                timezone: baseContext.timezone,
            },
            userMessageLength: baseContext.userMessage?.length || 0,
            availableProjects: snapshotPrivacySafePipelineValue(baseContext.availableProjects),
            availableProjectNames: snapshotPrivacySafePipelineValue(baseContext.availableProjectNames),
            existingTask: snapshotPrivacySafePipelineValue(baseContext.existingTask),
            activeTasks: snapshotPrivacySafePipelineValue(baseContext.activeTasks),
            checklistContext: snapshotPrivacySafePipelineValue(baseContext.checklistContext),
        },
        ax: {
            status: 'pending',
            intentOutput: null,
            failure: null,
        },
        normalize: {
            status: 'pending',
            normalizedActions: [],
            validActions: [],
            invalidActions: [],
        },
        execute: {
            status: 'pending',
            requests: [],
            results: [],
            failures: [],
            rollbackFailures: [],
        },
        validationFailures: [],
        timing: {
            requestStartedAt: null,
            requestCompletedAt: null,
            totalDurationMs: null,
            stages: {},
        },
        result: {
            status: 'pending',
            type: null,
            summary: null,
            failureClass: null,
            rolledBack: false,
        },
    };
}

/**
 * Normalizes and validates checklist context metadata.
 * @param {Object} value - Raw checklist context
 * @returns {Object|null} Normalized checklist context or null
 */
function normalizeChecklistContext(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const hasChecklist = typeof value.hasChecklist === 'boolean' ? value.hasChecklist : null;
    const clarificationQuestion = typeof value.clarificationQuestion === 'string'
        && value.clarificationQuestion.trim()
        ? value.clarificationQuestion.trim()
        : null;

    if (hasChecklist === null && clarificationQuestion === null) {
        return null;
    }

    return {
        hasChecklist,
        clarificationQuestion,
    };
}

/**
 * Coerces a value to a Date object.
 * @param {*} value - Value to coerce
 * @param {Date} fallback - Fallback Date if coercion fails
 * @returns {Date}
 */
function coerceDate(value, fallback) {
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return fallback instanceof Date ? fallback : new Date();
}

/**
 * Formats a Date as a YYYY-MM-DD string in a specific timezone.
 * @param {Date} date - Date to format
 * @param {string} timezone - Target IANA timezone
 * @returns {string} Formatted date string
 */
function formatCurrentDate(date, timezone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const get = (type) => parts.find(p => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Checks if a string is in YYYY-MM-DD format.
 * @param {string} value - String to check
 * @returns {boolean}
 */
function isDateOnlyString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Ensures projects value is an array.
 * @param {*} projects - Raw projects value
 * @returns {Array}
 */
function normalizeProjects(projects) {
    if (!Array.isArray(projects)) return [];
    return projects;
}

/**
 * Extracts non-empty project names from an array of project objects.
 * @param {Array} projects - Array of project objects
 * @returns {string[]} Array of project names
 */
function deriveProjectNames(projects) {
    return projects
        .map((project) => project?.name)
        .filter((name) => typeof name === 'string' && name.trim());
}

/**
 * Validates a pipeline context object against required fields and types.
 * @param {Object} context - The context to validate
 * @returns {{ ok: boolean, errors: string[] }} Validation result
 */
export function validatePipelineContext(context) {
    const errors = [];
    if (!context || typeof context !== 'object') {
        return { ok: false, errors: ['context must be an object'] };
    }

    for (const field of REQUIRED_FIELDS) {
        if (!(field in context)) {
            errors.push(`missing field: ${field}`);
        }
    }

    if (typeof context.requestId !== 'string' || !context.requestId.trim()) {
        errors.push('requestId must be a non-empty string');
    }

    if (typeof context.entryPoint !== 'string' || !context.entryPoint.trim()) {
        errors.push('entryPoint must be a non-empty string');
    }

    if (typeof context.mode !== 'string' || !context.mode.trim()) {
        errors.push('mode must be a non-empty string');
    }

    if (typeof context.userMessage !== 'string' || !context.userMessage.trim()) {
        errors.push('userMessage must be a non-empty string');
    }

    if (typeof context.currentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(context.currentDate)) {
        errors.push('currentDate must be a YYYY-MM-DD string');
    }

    if (typeof context.timezone !== 'string' || !context.timezone.trim()) {
        errors.push('timezone must be a non-empty string');
    }

    if (!Array.isArray(context.availableProjects)) {
        errors.push('availableProjects must be an array');
    }

    const existingTask = context.existingTask;
    if (existingTask !== null && existingTask !== undefined && typeof existingTask !== 'object') {
        errors.push('existingTask must be an object or null');
    }

    const checklistContext = context.checklistContext;
    if (checklistContext !== undefined && checklistContext !== null) {
        if (typeof checklistContext !== 'object' || Array.isArray(checklistContext)) {
            errors.push('checklistContext must be an object or null');
        } else {
            if ('hasChecklist' in checklistContext && checklistContext.hasChecklist !== null && typeof checklistContext.hasChecklist !== 'boolean') {
                errors.push('checklistContext.hasChecklist must be a boolean or null');
            }
            if ('clarificationQuestion' in checklistContext
                && checklistContext.clarificationQuestion !== null
                && typeof checklistContext.clarificationQuestion !== 'string') {
                errors.push('checklistContext.clarificationQuestion must be a string or null');
            }
        }
    }

    if ('correlationId' in context && context.correlationId !== context.requestId) {
        errors.push('correlationId must match requestId');
    }

    if ('lifecycle' in context) {
        if (!context.lifecycle || typeof context.lifecycle !== 'object' || Array.isArray(context.lifecycle)) {
            errors.push('lifecycle must be an object');
        } else {
            if (!context.lifecycle.request || typeof context.lifecycle.request !== 'object' || Array.isArray(context.lifecycle.request)) {
                errors.push('lifecycle.request must be an object');
            }
            if (!context.lifecycle.ax || typeof context.lifecycle.ax !== 'object' || Array.isArray(context.lifecycle.ax)) {
                errors.push('lifecycle.ax must be an object');
            }
            if (!context.lifecycle.normalize || typeof context.lifecycle.normalize !== 'object' || Array.isArray(context.lifecycle.normalize)) {
                errors.push('lifecycle.normalize must be an object');
            }
            if (!context.lifecycle.execute || typeof context.lifecycle.execute !== 'object' || Array.isArray(context.lifecycle.execute)) {
                errors.push('lifecycle.execute must be an object');
            }
            if (!Array.isArray(context.lifecycle?.validationFailures)) {
                errors.push('lifecycle.validationFailures must be an array');
            }
            if (!context.lifecycle.timing || typeof context.lifecycle.timing !== 'object' || Array.isArray(context.lifecycle.timing)) {
                errors.push('lifecycle.timing must be an object');
            }
            if (!context.lifecycle.result || typeof context.lifecycle.result !== 'object' || Array.isArray(context.lifecycle.result)) {
                errors.push('lifecycle.result must be an object');
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

/**
 * Creates a pipeline context builder for generating request contexts.
 * @param {Object} options
 * @param {TickTickAdapter} options.adapter - TickTick adapter instance
 * @param {string} [options.timezone] - Default IANA timezone
 * @param {Function} [options.now] - Function returning current Date
 * @param {Function} [options.requestIdFactory] - Function generating unique request IDs
 * @returns {{ buildRequestContext: Function }} Context builder instance
 */
export function createPipelineContextBuilder({
    adapter,
    timezone = getUserTimezone(),
    now = () => new Date(),
    requestIdFactory = () => crypto.randomUUID(),
} = {}) {
    if (!adapter) {
        throw new Error('Pipeline context builder requires a TickTick adapter');
    }

    /**
     * Builds a full request context for a pipeline execution.
     * @param {string} userMessage - The user's input message
     * @param {Object} [options] - Build options (mode, entryPoint, etc.)
     * @returns {Promise<Object>} Frozen pipeline request context
     */
    const buildRequestContext = async (userMessage, options = {}) => {
        if (options.timezone && options.timezone !== timezone) {
            console.warn(`[PipelineContext] Ignoring caller timezone "${options.timezone}" in favor of "${timezone}".`);
        }
        const requestedCurrentDate = options.currentDate ?? options.now;
        const resolvedNow = coerceDate(requestedCurrentDate, now());
        const currentDate = isDateOnlyString(requestedCurrentDate)
            ? requestedCurrentDate
            : formatCurrentDate(resolvedNow, timezone);
        const providedProjects = Array.isArray(options.availableProjects)
            ? options.availableProjects
            : (Array.isArray(options.projects) ? options.projects : null);
        const availableProjects = normalizeProjects(providedProjects ?? await adapter.listProjects());
        const providedActiveTasks = Array.isArray(options.activeTasks)
            ? options.activeTasks
            : null;
        const activeTasks = providedActiveTasks ?? await adapter.listActiveTasks();
        const checklistContext = normalizeChecklistContext(
            options.checklistContext ?? {
                hasChecklist: options.hasChecklist,
                clarificationQuestion: options.clarificationQuestion,
            }
        );

        const requestId = options.requestId || requestIdFactory();
        const workStyleMode = typeof options.workStyleMode === 'string' && options.workStyleMode.trim()
            ? options.workStyleMode.trim().toLowerCase()
            : DEFAULT_WORK_STYLE_MODE;

        const context = {
            requestId,
            correlationId: requestId,
            entryPoint: options.entryPoint || DEFAULT_ENTRY_POINT,
            mode: options.mode || DEFAULT_MODE,
            workStyleMode,
            userMessage,
            currentDate,
            timezone,
            availableProjects: snapshotPipelineValue(availableProjects),
            availableProjectNames: snapshotPipelineValue(deriveProjectNames(availableProjects)),
            existingTask: snapshotPipelineValue(options.existingTask || null),
            activeTasks: snapshotPipelineValue(activeTasks),
            checklistContext: snapshotPipelineValue(checklistContext),
        };

        context.lifecycle = createLifecycleState(context);

        const strict = options.strictContext ?? (process.env.NODE_ENV !== 'production');
        const validation = validatePipelineContext(context);
        if (!validation.ok) {
            const summary = 'Invalid pipeline request context';
            const message = strict
                ? `${summary}: ${validation.errors.join('; ')}`
                : summary;
            const error = new Error(message);
            error.code = 'PIPELINE_CONTEXT_INVALID';
            error.details = validation;
            throw error;
        }

        return deepFreeze(context);
    };

    return { buildRequestContext };
}
