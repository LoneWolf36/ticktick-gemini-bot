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

function buildReflection({ todayHistory = [], activeTasks = [] } = {}) {
    const approvedCount = todayHistory.filter((entry) => entry.approved === true).length;
    const skippedCount = todayHistory.filter((entry) => entry.skipped === true).length;
    const droppedCount = todayHistory.filter((entry) => entry.dropped === true).length;
    const highPriorityOpenCount = activeTasks.filter((task) => (task.priority || 0) >= 3).length;

    if (todayHistory.length === 0) {
        return '';
    }

    if (approvedCount >= 2 && approvedCount >= skippedCount + droppedCount) {
        return 'You moved meaningful work today. Keep the close-out factual and light.';
    }

    if (approvedCount === 0 && highPriorityOpenCount > 0 && skippedCount + droppedCount >= 2) {
        return 'Important work stayed open today. Name the blocker plainly and choose the first restart step.';
    }

    if (approvedCount > 0 && skippedCount + droppedCount > 0) {
        return 'Today was mixed: some progress landed, and some work stayed open. Close on one concrete restart step.';
    }

    return 'The day was light on hard evidence. Keep the reflection brief and reset around one concrete next step.';
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
    const model = normalizeModelSummary(modelSummary || {});

    return {
        stats: model.stats.length > 0 ? model.stats : buildStats({ todayHistory, activeTasks: normalizedActiveTasks }),
        reflection: model.reflection || buildReflection({ todayHistory, activeTasks: normalizedActiveTasks }),
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
