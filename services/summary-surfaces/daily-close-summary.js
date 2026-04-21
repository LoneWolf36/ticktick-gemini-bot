import { buildEngagementPatternNotice, deriveInterventionProfile } from './intervention-profile.js';

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
    return toArray(processedHistory).filter((entry) => entry && typeof entry === 'object');
}

const REFLECTION_TEMPLATES = {
    BACKOFF_STANDARD: 'Several suggested tasks stayed open repeatedly. Keep tomorrow smaller or pause instead of escalating.',
    BACKOFF_URGENT: 'Several suggested tasks stayed open repeatedly. Cut scope and choose one restart step instead of pushing harder.',
    DIRECT_CALLOUT: 'A few suggested tasks stayed open repeatedly. Name the friction once and choose one smaller restart step.',
    NO_ACTIVITY: '',
    MEANINGFUL_PROGRESS: 'You moved meaningful work today. Keep the close-out factual and light.',
    IMPORTANT_WORK_OPEN: 'Important work stayed open today. Name the blocker plainly and choose the first restart step.',
    MIXED_DAY: 'Today was mixed: some progress landed, and some work stayed open. Close on one concrete restart step.',
    LIGHT_EVIDENCE: 'The day was light on hard evidence. Keep the reflection brief and reset around one concrete next step.',
};

function toDayKey(value, timezone = 'UTC') {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(parsed);
}

function filterEntriesForDay(processedHistory = [], { generatedAtIso, timezone } = {}) {
    const targetDay = toDayKey(generatedAtIso || new Date().toISOString(), timezone || 'UTC');
    if (!targetDay) return [];

    return processedHistory.filter((entry) => {
        const base = entry.reviewedAt || entry.processedAt || entry.sentAt || null;
        return toDayKey(base, timezone || 'UTC') === targetDay;
    });
}

function getMostRecentProcessedEntry(processedHistory = []) {
    return processedHistory
        .map((entry) => ({
            entry,
            at: new Date(entry.reviewedAt || entry.processedAt || entry.sentAt || 0).getTime(),
        }))
        .filter((item) => Number.isFinite(item.at) && item.at > 0)
        .sort((a, b) => b.at - a.at)[0]?.entry || null;
}

function buildStats({ todayHistory = [], activeTasks = [] } = {}) {
    const approvedCount = todayHistory.filter((entry) => entry.approved === true).length;
    const skippedCount = todayHistory.filter((entry) => entry.skipped === true).length;
    const droppedCount = todayHistory.filter((entry) => entry.dropped === true).length;

    return [
        `Completed: ${approvedCount}`,
        `Skipped: ${skippedCount}`,
        `Dropped: ${droppedCount}`,
        `Still open: ${activeTasks.length}`,
    ];
}

function buildReflection({ todayHistory = [], activeTasks = [], interventionProfile = null, context = {} } = {}) {
    const approvedCount = todayHistory.filter((entry) => entry.approved === true).length;
    const skippedCount = todayHistory.filter((entry) => entry.skipped === true).length;
    const droppedCount = todayHistory.filter((entry) => entry.dropped === true).length;
    const highPriorityOpenCount = activeTasks.filter((task) => (task.priority || 0) >= 3).length;

    if (interventionProfile?.shouldBackOff === true) {
        return context.workStyleMode === 'urgent'
            ? REFLECTION_TEMPLATES.BACKOFF_URGENT
            : REFLECTION_TEMPLATES.BACKOFF_STANDARD;
    }

    if (interventionProfile?.directCalloutAllowed === true) {
        return REFLECTION_TEMPLATES.DIRECT_CALLOUT;
    }

    if (todayHistory.length === 0) {
        return REFLECTION_TEMPLATES.NO_ACTIVITY;
    }

    if (approvedCount >= 2 && approvedCount >= skippedCount + droppedCount) {
        return REFLECTION_TEMPLATES.MEANINGFUL_PROGRESS;
    }

    if (approvedCount === 0 && highPriorityOpenCount > 0 && skippedCount + droppedCount >= 2) {
        return REFLECTION_TEMPLATES.IMPORTANT_WORK_OPEN;
    }

    if (approvedCount > 0 && skippedCount + droppedCount > 0) {
        return REFLECTION_TEMPLATES.MIXED_DAY;
    }

    return REFLECTION_TEMPLATES.LIGHT_EVIDENCE;
}

function buildResetCue({ activeTasks = [], rankingResult = null, todayHistory = [] } = {}) {
    const ranked = Array.isArray(rankingResult?.ranked) ? rankingResult.ranked : [];
    const byTaskId = new Map(activeTasks.map((task) => [task.id || task.taskId, task]));
    const topRankedTask = ranked.length > 0 ? byTaskId.get(ranked[0].taskId) : null;
    const targetTask = topRankedTask || activeTasks[0] || null;

    if (!targetTask) {
        return todayHistory.length === 0
            ? 'If today was disrupted or offline, restart tomorrow with one concrete task.'
            : 'No clear carry-forward task is open. Keep tomorrow lightweight and specific.';
    }

    return `Tomorrow’s restart: begin with “${targetTask.title || 'Untitled task'}” and finish the first executable step.`;
}

function buildNotices({ processedHistory = [], todayHistory = [], context = {} } = {}) {
    const notices = [];
    const interventionProfile = deriveInterventionProfile(processedHistory, {
        generatedAtIso: context.generatedAtIso,
    });

    if (todayHistory.length <= 1) {
        notices.push({
            code: 'sparse_day',
            message: 'The day has thin evidence, so this reflection stays minimal.',
            severity: 'info',
            evidence_source: 'processed_history',
        });
    }

    const mostRecent = getMostRecentProcessedEntry(processedHistory);
    const generatedAt = new Date(context.generatedAtIso || new Date().toISOString()).getTime();
    const mostRecentAt = mostRecent
        ? new Date(mostRecent.reviewedAt || mostRecent.processedAt || mostRecent.sentAt || 0).getTime()
        : 0;
    const dayGapMs = generatedAt && mostRecentAt ? generatedAt - mostRecentAt : 0;

    if (todayHistory.length === 0 && dayGapMs > 36 * 60 * 60 * 1000) {
        notices.push({
            code: 'irregular_use',
            message: 'Recent interaction has been uneven, so this close-out avoids over-reading the gap.',
            severity: 'info',
            evidence_source: 'processed_history',
        });
    }

    const engagementNotice = buildEngagementPatternNotice(interventionProfile, {
        workStyleMode: context.workStyleMode,
    });
    if (engagementNotice) {
        notices.push(engagementNotice);
    }

    return notices;
}

function normalizeModelSummary(summary = {}) {
    return {
        stats: toArray(summary.stats).map((item) => toString(item)).filter(Boolean),
        reflection: toString(summary.reflection, ''),
        reset_cue: toString(summary.reset_cue, ''),
        notices: toArray(summary.notices).map((notice) => ({
            code: toString(notice?.code, ''),
            message: toString(notice?.message, ''),
            severity: toString(notice?.severity, ''),
            evidence_source: toString(notice?.evidence_source, ''),
        })),
    };
}

function mergeNotices(baseNotices = [], modelNotices = []) {
    const merged = [];
    const seen = new Set();

    for (const notice of [...baseNotices, ...modelNotices]) {
        if (!notice?.code || seen.has(notice.code)) continue;
        seen.add(notice.code);
        merged.push(notice);
    }

    return merged;
}

export function composeDailyCloseSummarySections({
    context = {},
    activeTasks = [],
    processedHistory = [],
    rankingResult = null,
    modelSummary = null,
} = {}) {
    const normalizedActiveTasks = asActiveTasks(activeTasks);
    const normalizedProcessedHistory = asProcessedHistory(processedHistory);
    const todayHistory = filterEntriesForDay(normalizedProcessedHistory, context);
    const interventionProfile = deriveInterventionProfile(normalizedProcessedHistory, {
        generatedAtIso: context.generatedAtIso,
    });
    const model = normalizeModelSummary(modelSummary || {});

    return {
        stats: model.stats.length > 0 ? model.stats : buildStats({ todayHistory, activeTasks: normalizedActiveTasks }),
        reflection: model.reflection || buildReflection({
            todayHistory,
            activeTasks: normalizedActiveTasks,
            interventionProfile,
            context,
        }),
        reset_cue: model.reset_cue || buildResetCue({
            activeTasks: normalizedActiveTasks,
            rankingResult,
            todayHistory,
        }),
        notices: mergeNotices(
            buildNotices({ processedHistory: normalizedProcessedHistory, todayHistory, context }),
            model.notices,
        ),
    };
}
