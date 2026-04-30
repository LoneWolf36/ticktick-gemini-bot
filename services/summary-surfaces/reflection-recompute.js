import { selectBehavioralPatternsForSummary } from './behavioral-pattern-notices.js';
import { toArray, asActiveTasks, asProcessedHistory } from '../shared-utils.js';

/**
 * Build context for determining if summary should be recomputed from live tasks.
 *
 * @param {Object} params - Context parameters.
 * @param {Object[]} [params.activeTasks=[]] - List of active tasks.
 * @param {Object[]} [params.behavioralPatterns=[]] - List of behavioral patterns.
 * @param {Object[]} [params.processedHistory=[]] - History of processed tasks.
 * @param {boolean} [params.historyAvailable=true] - Whether history is accessible.
 * @param {Object} [params.context={}] - Request context.
 * @param {number} [params.sparseHistoryThreshold=2] - Count below which history is considered sparse.
 * @returns {Object} Recompute context object.
 */
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

/**
 * Build a notice explaining if/why summary context was recomputed.
 *
 * @param {Object} [recomputeContext={}] - Result from buildReflectionRecomputeContext.
 * @param {Object} [options={}] - Options.
 * @param {string} [options.surface='weekly'] - Summary surface name.
 * @returns {Object|null} Notice object or null if no recompute happened.
 */
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
