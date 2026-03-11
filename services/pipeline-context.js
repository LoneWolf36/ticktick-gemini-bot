import crypto from 'crypto';
import { getUserTimezone } from './user-settings.js';

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

const DEFAULT_ENTRY_POINT = 'unknown';
const DEFAULT_MODE = 'default';

function coerceDate(value, fallback) {
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return fallback instanceof Date ? fallback : new Date();
}

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

function normalizeProjects(projects) {
    if (!Array.isArray(projects)) return [];
    return projects;
}

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

    return { ok: errors.length === 0, errors };
}

export function createPipelineContextBuilder({
    adapter,
    timezone = getUserTimezone(),
    now = () => new Date(),
    requestIdFactory = () => crypto.randomUUID(),
} = {}) {
    if (!adapter) {
        throw new Error('Pipeline context builder requires a TickTick adapter');
    }

    const buildRequestContext = async (userMessage, options = {}) => {
        if (options.timezone && options.timezone !== timezone) {
            console.warn(`[PipelineContext] Ignoring caller timezone "${options.timezone}" in favor of "${timezone}".`);
        }
        const resolvedNow = coerceDate(options.currentDate ?? options.now, now());
        const currentDate = formatCurrentDate(resolvedNow, timezone);

        const context = {
            requestId: options.requestId || requestIdFactory(),
            entryPoint: options.entryPoint || DEFAULT_ENTRY_POINT,
            mode: options.mode || DEFAULT_MODE,
            userMessage,
            currentDate,
            timezone,
            availableProjects: normalizeProjects(await adapter.listProjects()),
            existingTask: options.existingTask || null,
        };

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

        return context;
    };

    return { buildRequestContext };
}
