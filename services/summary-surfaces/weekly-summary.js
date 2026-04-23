import {
    SUMMARY_NOTICE_CODES,
    SUMMARY_NOTICE_EVIDENCE_SOURCES,
    SUMMARY_NOTICE_SEVERITIES,
    WEEKLY_WATCHOUT_EVIDENCE_SOURCES,
} from '../schemas.js';
import { buildBehavioralPatternNotice } from './behavioral-pattern-notices.js';
import { buildEngagementPatternNotice, deriveInterventionProfile } from './intervention-profile.js';
import { buildReflectionRecomputeContext, buildReflectionRecomputeNotice } from './reflection-recompute.js';

const DISALLOWED_WATCHOUT_LABELS = new Set(['avoidance', 'callout']);

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toString(value, fallback = '') {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) return trimmed;
    }
    return fallback;
}

function asActiveTasks(tasks = []) {
    return toArray(tasks).filter((task) => task && (task.status === 0 || task.status === undefined));
}

function asProcessedHistory(processedHistory = []) {
    return toArray(processedHistory).filter(Boolean);
}

function toIsoDate(value) {
    if (!value || typeof value !== 'string') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
}

function findOverdueTasks(activeTasks = [], generatedAtIso = null) {
    const nowIso = toIsoDate(generatedAtIso) || new Date().toISOString().slice(0, 10);
    return activeTasks.filter((task) => {
        const dueDate = toIsoDate(task.dueDate);
        return dueDate && dueDate < nowIso;
    });
}

function normalizeTextList(items = [], { maxItems = 5 } = {}) {
    return toArray(items)
        .map((item) => toString(item))
        .filter(Boolean)
        .slice(0, maxItems);
}

function normalizeCarryForwardItems(items = [], { maxItems = 3 } = {}) {
    return toArray(items)
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const title = toString(item.title);
            if (!title) return null;
            return {
                task_id: item.task_id ?? item.taskId ?? null,
                title,
                reason: toString(item.reason, 'Still open and needs explicit completion next week.'),
            };
        })
        .filter(Boolean)
        .slice(0, maxItems);
}

function normalizeSummaryNotice(notice = {}) {
    const code = SUMMARY_NOTICE_CODES.includes(notice.code) ? notice.code : 'delivery_context';
    const severity = SUMMARY_NOTICE_SEVERITIES.includes(notice.severity) ? notice.severity : 'info';
    const evidenceSource = SUMMARY_NOTICE_EVIDENCE_SOURCES.includes(notice.evidence_source)
        ? notice.evidence_source
        : 'system';

    return {
        code,
        message: toString(notice.message, 'No additional context provided.'),
        severity,
        evidence_source: evidenceSource,
    };
}

function normalizeNotices(notices = []) {
    return toArray(notices).map((notice) => normalizeSummaryNotice(notice));
}

function hasEvidenceAvailable(source, { activeTasks = [], processedHistory = [], historyAvailable = true }) {
    if (source === 'current_tasks') {
        return activeTasks.length > 0;
    }
    if (source === 'processed_history') {
        return historyAvailable && processedHistory.length > 0;
    }
    if (source === 'missing_data') {
        return historyAvailable !== true;
    }
    return false;
}

function normalizeWatchouts(watchouts = [], evidenceContext = {}) {
    const allowedSources = new Set(WEEKLY_WATCHOUT_EVIDENCE_SOURCES);
    return toArray(watchouts)
        .map((watchout) => {
            if (!watchout || typeof watchout !== 'object') return null;
            const label = toString(watchout.label);
            const evidence = toString(watchout.evidence);
            const evidenceSource = allowedSources.has(watchout.evidence_source) ? watchout.evidence_source : null;
            if (!label || !evidence || !evidenceSource) return null;
            if (DISALLOWED_WATCHOUT_LABELS.has(label.toLowerCase())) return null;
            if (evidenceSource === 'missing_data') return null;
            if (!hasEvidenceAvailable(evidenceSource, evidenceContext)) return null;
            return {
                label,
                evidence,
                evidence_source: evidenceSource,
            };
        })
        .filter(Boolean);
}

function mergeNotices(modelNotices = [], systemNotices = []) {
    const merged = new Map();
    for (const notice of modelNotices) {
        if (notice?.code) merged.set(notice.code, notice);
    }
    for (const notice of systemNotices) {
        if (notice?.code) merged.set(notice.code, notice);
    }
    return [...merged.values()];
}

function mergeWatchouts(modelWatchouts = [], computedWatchouts = []) {
    const merged = [];
    const seen = new Set();
    const addWatchout = (watchout) => {
        if (!watchout) return;
        const key = `${watchout.label}|${watchout.evidence_source}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(watchout);
    };
    modelWatchouts.forEach(addWatchout);
    computedWatchouts.forEach(addWatchout);
    return merged;
}

function buildProgress(processedHistory = [], historyAvailable = true) {
    if (!historyAvailable || processedHistory.length === 0) return [];

    return processedHistory
        .filter((entry) => entry.approved === true && entry.dropped !== true)
        .map((entry) => `Completed: ${entry.originalTitle || 'Untitled task'}`)
        .slice(0, 5);
}

function buildCarryForward(activeTasks = []) {
    return activeTasks.slice(0, 3).map((task) => ({
        task_id: task.id || task.taskId || null,
        title: task.title || 'Untitled task',
        reason: task.dueDate
            ? `Still active with due date ${task.dueDate}.`
            : 'Still open and needs explicit completion next week.',
    }));
}

function buildDeferredCarryForward(processedHistory = [], activeTasks = []) {
    const activeByTitle = new Map(
        activeTasks
            .map((task) => [toString(task.title).toLowerCase(), task])
            .filter(([title]) => Boolean(title)),
    );
    const deferred = [];
    const seenTitles = new Set();

    for (const entry of processedHistory) {
        if (entry?.skipped !== true || entry?.dropped === true) continue;
        const title = toString(entry.originalTitle || entry.title);
        if (!title) continue;

        const normalizedTitle = title.toLowerCase();
        if (seenTitles.has(normalizedTitle)) continue;
        seenTitles.add(normalizedTitle);

        const activeTask = activeByTitle.get(normalizedTitle);
        deferred.push({
            task_id: entry.taskId ?? activeTask?.id ?? activeTask?.taskId ?? null,
            title,
            reason: 'Deferred or rescheduled this week and still needs a concrete next step.',
        });
    }

    if (deferred.length >= 3) {
        return deferred.slice(0, 3);
    }

    for (const item of buildCarryForward(activeTasks)) {
        const normalizedTitle = toString(item.title).toLowerCase();
        if (!normalizedTitle || seenTitles.has(normalizedTitle)) continue;
        deferred.push(item);
        seenTitles.add(normalizedTitle);
        if (deferred.length >= 3) break;
    }

    return deferred;
}

function buildNextFocus(activeTasks = [], rankingResult = null) {
    const ranked = Array.isArray(rankingResult?.ranked) ? rankingResult.ranked : [];
    if (ranked.length > 0) {
        const byTaskId = new Map(activeTasks.map((task) => [task.id || task.taskId, task]));
        const fromRanking = ranked
            .map((decision) => byTaskId.get(decision.taskId))
            .filter(Boolean)
            .map((task) => task.title || 'Untitled task')
            .slice(0, 3);
        if (fromRanking.length > 0) return fromRanking;
    }

    return activeTasks.slice(0, 3).map((task) => task.title || 'Untitled task');
}

function buildWatchouts({ activeTasks = [], processedHistory = [], historyAvailable = true, context = {} }) {
    const watchouts = [];
    const overdueTasks = findOverdueTasks(activeTasks, context.generatedAtIso);
    if (overdueTasks.length > 0) {
        watchouts.push({
            label: 'Overdue tasks accumulating',
            evidence: `${overdueTasks.length} active task(s) are overdue right now.`,
            evidence_source: 'current_tasks',
        });
    }

    const droppedCount = processedHistory.filter((entry) => entry.dropped === true).length;
    if (droppedCount > 0) {
        watchouts.push({
            label: 'Dropped tasks this week',
            evidence: `${droppedCount} processed item(s) were dropped.`,
            evidence_source: 'processed_history',
        });
    }

    return watchouts;
}

function describeRationaleTrend(code) {
    if (code === 'goal_alignment') return 'goal-aligned work';
    if (code === 'urgency') return 'near-term deadlines';
    if (code === 'blocker_removal') return 'blocker-clearing work';
    if (code === 'capacity_protection') return 'capacity protection';
    if (code === 'user_override') return 'explicit manual priorities';
    if (code === 'fallback') return 'fallback ranking heuristics';
    return 'mixed ranking signals';
}

function buildRankingTrendNotice(rankingResult = null) {
    const ranked = Array.isArray(rankingResult?.ranked) ? rankingResult.ranked.slice(0, 3) : [];
    if (ranked.length === 0) return null;

    const counts = new Map();
    for (const decision of ranked) {
        const code = typeof decision?.rationaleCode === 'string' && decision.rationaleCode.trim().length > 0
            ? decision.rationaleCode
            : 'fallback';
        counts.set(code, (counts.get(code) || 0) + 1);
    }

    const ordered = [...counts.entries()].sort((left, right) => right[1] - left[1]);
    const [primaryCode, primaryCount] = ordered[0] || ['fallback', 0];
    const secondaryCode = ordered[1]?.[0] || null;

    return {
        code: 'ranking_trend',
        message: primaryCount >= 2 || !secondaryCode
            ? `Ranking trends toward ${describeRationaleTrend(primaryCode)}.`
            : `Ranking trends blend ${describeRationaleTrend(primaryCode)} with ${describeRationaleTrend(secondaryCode)}.`,
        severity: 'info',
        evidence_source: 'ranking',
    };
}

function buildNotices({
    activeTasks = [],
    behavioralPatterns = [],
    processedHistory = [],
    historyAvailable = true,
    historyIsSparse = false,
    context = {},
    rankingResult = null,
    recomputeContext = null,
} = {}) {
    const notices = [];
    const interventionProfile = deriveInterventionProfile(processedHistory, {
        generatedAtIso: context.generatedAtIso,
    });

    if (activeTasks.length < 2) {
        notices.push({
            code: 'sparse_tasks',
            message: 'Active task set is sparse, so weekly recommendations are intentionally compact.',
            severity: 'info',
            evidence_source: 'tasks',
        });
    }

    if (!historyAvailable || historyIsSparse) {
        notices.push({
            code: 'missing_history',
            message: historyIsSparse
                ? 'Processed-task history is sparse, so weekly insights are intentionally compact.'
                : 'Processed-task history was unavailable, so progress is based on current-task evidence.',
            severity: 'warning',
            evidence_source: 'processed_history',
        });
    }

    if (rankingResult?.degraded) {
        notices.push({
            code: 'degraded_ranking',
            message: rankingResult.degradedReason || 'Priority ranking confidence is degraded.',
            severity: 'warning',
            evidence_source: 'system',
        });
    }

    const rankingTrendNotice = buildRankingTrendNotice(rankingResult);
    if (rankingTrendNotice) {
        notices.push(rankingTrendNotice);
    }

    const behavioralNotice = buildBehavioralPatternNotice(behavioralPatterns, {
        nowIso: context.generatedAtIso,
    });
    if (behavioralNotice) {
        notices.push(behavioralNotice);
    }

    if (context.urgentMode === true) {
        notices.push({
            code: 'urgent_mode_active',
            message: 'Urgent mode is active and may bias weekly next-focus ordering.',
            severity: 'info',
            evidence_source: 'state',
        });
    }

    const engagementNotice = buildEngagementPatternNotice(interventionProfile, {
        workStyleMode: context.workStyleMode,
    });
    if (engagementNotice) {
        notices.push(engagementNotice);
    }

    const recomputeNotice = buildReflectionRecomputeNotice(recomputeContext || {}, { surface: 'weekly' });
    if (recomputeNotice) {
        notices.push(recomputeNotice);
    }

    return notices;
}

function normalizeModelSummary(summary = {}, evidenceContext = {}) {
    return {
        progress: normalizeTextList(summary?.progress, { maxItems: 5 }),
        carry_forward: normalizeCarryForwardItems(summary?.carry_forward, { maxItems: 3 }),
        next_focus: normalizeTextList(summary?.next_focus, { maxItems: 3 }),
        watchouts: normalizeWatchouts(summary?.watchouts, evidenceContext),
        notices: normalizeNotices(summary?.notices),
    };
}

export function composeWeeklySummarySections({
    modelSummary = {},
    activeTasks = [],
    behavioralPatterns = [],
    processedHistory = [],
    historyAvailable = true,
    rankingResult = null,
    context = {},
} = {}) {
    const normalizedTasks = asActiveTasks(activeTasks);
    const normalizedHistory = asProcessedHistory(processedHistory);
    const recomputeContext = buildReflectionRecomputeContext({
        activeTasks: normalizedTasks,
        behavioralPatterns,
        processedHistory: normalizedHistory,
        historyAvailable,
        context,
    });
    const historyIsSparse = recomputeContext.historyIsSparse;

    const normalizedModel = normalizeModelSummary(modelSummary, {
        activeTasks: normalizedTasks,
        processedHistory: normalizedHistory,
        historyAvailable,
    });

    const progress = (normalizedModel.progress.length > 0 && !historyIsSparse && historyAvailable)
        ? normalizedModel.progress
        : buildProgress(normalizedHistory, historyAvailable);
    const carryForward = normalizedModel.carry_forward.length > 0
        ? normalizedModel.carry_forward
        : buildDeferredCarryForward(normalizedHistory, normalizedTasks);
    const nextFocus = buildNextFocus(normalizedTasks, rankingResult);
    const watchouts = mergeWatchouts(
        normalizedModel.watchouts,
        buildWatchouts({
            activeTasks: normalizedTasks,
            processedHistory: normalizedHistory,
            historyAvailable,
            context,
        }),
    );
    const notices = mergeNotices(
        normalizedModel.notices,
        buildNotices({
            activeTasks: normalizedTasks,
            behavioralPatterns,
            processedHistory: normalizedHistory,
            historyAvailable,
            historyIsSparse,
            context,
            rankingResult,
            recomputeContext,
        }),
    );

    return {
        progress,
        carry_forward: carryForward,
        next_focus: nextFocus,
        watchouts,
        notices,
    };
}
