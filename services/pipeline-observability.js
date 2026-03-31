const ENTRY_POINT_ALIASES = {
    telegram: 'telegram_message',
    telegram_message: 'telegram_message',
    telegram_review: 'telegram_review',
    scheduler: 'scheduler',
    manual_command: 'manual_command',
};

function normalizeEntryPoint(entryPoint, mode) {
    if (entryPoint === 'telegram') {
        if (mode === 'scan' || mode === 'review') return 'telegram_review';
        return 'telegram_message';
    }

    return ENTRY_POINT_ALIASES[entryPoint] || 'manual_command';
}

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

export function createPipelineObservability({
    eventSink = null,
    metricSink = null,
    traceSink = null,
    logger = console,
    now = () => new Date(),
} = {}) {
    async function emit(context, payload) {
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
        await emitToSink(eventSink, 'emit', event);
        await emitToSink(metricSink, 'increment', `pipeline.${event.step}.${event.status}`, 1, event);
        await emitToSink(traceSink, 'addEvent', event.eventType, event);
        return event;
    }

    return {
        emit,
        normalizeEntryPoint,
    };
}
