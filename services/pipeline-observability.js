import { sanitizePipelineContextForDiagnostics } from './pipeline-context.js';

/**
 * Aliases for mapping internal entry point names to display names.
 * @type {Record<string, string>}
 */
const ENTRY_POINT_ALIASES = {
    telegram: 'telegram_message',
    telegram_message: 'telegram_message',
    telegram_review: 'telegram_review',
    scheduler: 'scheduler',
    manual_command: 'manual_command',
};

/**
 * Normalizes an entry point name based on the execution mode.
 * @param {string} entryPoint - Raw entry point name
 * @param {string} mode - Execution mode (e.g., 'scan', 'review')
 * @returns {string} Normalized entry point name
 */
function normalizeEntryPoint(entryPoint, mode) {
    if (entryPoint === 'telegram') {
        if (mode === 'scan' || mode === 'review') return 'telegram_review';
        return 'telegram_message';
    }

    return ENTRY_POINT_ALIASES[entryPoint] || 'manual_command';
}

/**
 * Emits an event to the console logger.
 * @param {Object} logger - Logger instance with log/error methods
 * @param {Object} event - The event object to log
 */
function emitConsole(logger, event) {
    if (!logger) return;

    const line = `[PipelineTelemetry] ${JSON.stringify(event)}`;
    if (event.status === 'failure' && typeof logger.error === 'function') {
        logger.error(line);
        return;
    }
    if (typeof logger.log === 'function') {
        logger.log(line);
    }
}

/**
 * Emits an event to a sink (function or object with method).
 * @param {Function|Object} sink - The destination sink
 * @param {string} methodName - Method to call on the sink object
 * @param {...*} args - Arguments to pass to the sink
 * @returns {Promise<void>}
 */
async function emitToSink(sink, methodName, ...args) {
    if (!sink) return;

    if (typeof sink === 'function') {
        await sink(...args);
        return;
    }

    if (typeof sink[methodName] === 'function') {
        await sink[methodName](...args);
    }
}

/**
 * Creates a pipeline observability instance for emitting telemetry.
 * @param {Object} [options]
 * @param {Function|Object} [options.eventSink] - Sink for full events
 * @param {Function|Object} [options.metricSink] - Sink for metrics
 * @param {Function|Object} [options.traceSink] - Sink for traces
 * @param {Object} [options.logger=console] - Console logger instance
 * @param {Function} [options.now] - Function returning current Date
 * @returns {{ emit: Function, normalizeEntryPoint: Function }}
 */
export function createPipelineObservability({
    eventSink = null,
    metricSink = null,
    traceSink = null,
    logger = console,
    now = () => new Date(),
} = {}) {
    /**
     * Emits a telemetry event for a pipeline step.
     * @param {Object} context - Pipeline request context
     * @param {Object} payload - Event data
     * @returns {Promise<Object>} The emitted event object
     */
    async function emit(context, payload) {
        const diagnosticContext = sanitizePipelineContextForDiagnostics(context);
        const event = {
            eventType: payload.eventType,
            timestamp: now().toISOString(),
            requestId: context?.requestId || payload.requestId || 'unknown',
            entryPoint: normalizeEntryPoint(context?.entryPoint, context?.mode),
            step: payload.step,
            status: payload.status,
            durationMs: payload.durationMs ?? null,
            failureClass: payload.failureClass ?? null,
            actionType: payload.actionType ?? null,
            attempt: payload.attempt ?? null,
            rolledBack: payload.rolledBack ?? null,
            metadata: payload.metadata || {},
        };

        emitConsole(logger, event);
        await emitToSink(eventSink, 'emit', event, diagnosticContext);
        await emitToSink(metricSink, 'increment', `pipeline.${event.step}.${event.status}`, 1, event, diagnosticContext);
        await emitToSink(traceSink, 'addEvent', event.eventType, event, diagnosticContext);
        return event;
    }

    /**
     * Emits a latency histogram event for a pipeline stage.
     * @param {Object} payload - Event payload
     * @param {string} payload.stage - Stage name
     * @param {number} payload.durationMs - Duration in milliseconds
     */
    function emitLatencyHistogram({ stage, durationMs }) {
        const bucket = durationMs < 1000 ? '<1s'
            : durationMs < 3000 ? '<3s'
                : durationMs < 6000 ? '<6s'
                    : durationMs < 10000 ? '<10s'
                        : durationMs < 30000 ? '<30s'
                            : '>30s';
        const line = `[PipelineLatency] ${JSON.stringify({ eventType: 'pipeline.latency.histogram', stage, bucket, durationMs })}`;
        if (logger && typeof logger.log === 'function') {
            logger.log(line);
        }
    }

    return {
        emit,
        emitLatencyHistogram,
        normalizeEntryPoint,
    };
}
