import { selectBehavioralPatternsForSummary } from './behavioral-pattern-notices.js';

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function asActiveTasks(tasks = []) {
    return toArray(tasks).filter((task) => task && (task.status === 0 || task.status === undefined));
}

function asProcessedHistory(processedHistory = []) {
    return toArray(processedHistory).filter((entry) => entry && typeof entry === 'object');
}

export function buildReflectionRecomputeContext({
    activeTasks = [],
    behavioralPatterns = [],
    processedHistory = [],
    historyAvailable = true,
    context = {},
    sparseHistoryThreshold = 2,
} = {}) {
    const normalizedTasks = asActiveTasks(activeTasks);
    const normalizedHistory = asProcessedHistory(processedHistory);
    const available = historyAvailable === true;
    const historyIsSparse = available && normalizedHistory.length < sparseHistoryThreshold;
    const selectedPatterns = selectBehavioralPatternsForSummary(behavioralPatterns, {
        nowIso: context.generatedAtIso,
    });

    return {
        needsRecompute: !available || historyIsSparse,
        historyAvailable: available,
        historyIsSparse,
        activeTaskCount: normalizedTasks.length,
        processedHistoryCount: normalizedHistory.length,
        retainedPatternCount: selectedPatterns.length,
        hasRetainedAggregates: selectedPatterns.length > 0,
    };
}

export function buildReflectionRecomputeNotice(recomputeContext = {}, { surface = 'weekly' } = {}) {
    if (recomputeContext.needsRecompute !== true) {
        return null;
    }

    const windowLabel = `${Math.max(1, Number.parseInt(process.env.BEHAVIORAL_SIGNAL_RETENTION_DAYS || '30', 10) || 30)}-day`;
    if (recomputeContext.hasRetainedAggregates === true) {
        return {
            code: 'delivery_context',
            message: `${surface === 'daily_close' ? 'Daily close' : 'Weekly review'} context was recomputed from live tasks plus retained ${windowLabel} behavioral aggregates.`,
            severity: 'info',
            evidence_source: 'behavioral_memory',
        };
    }

    return {
        code: 'delivery_context',
        message: `${surface === 'daily_close' ? 'Daily close' : 'Weekly review'} context was recomputed from live tasks because retained aggregates were unavailable.`,
        severity: 'info',
        evidence_source: 'tasks',
    };
}
