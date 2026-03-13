function asActiveTasks(tasks = []) {
    return (Array.isArray(tasks) ? tasks : [])
        .filter((task) => task && (task.status === 0 || task.status === undefined));
}

function asProcessedHistory(processedHistory = []) {
    return (Array.isArray(processedHistory) ? processedHistory : []).filter(Boolean);
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

    if (!historyAvailable) {
        watchouts.push({
            label: 'History unavailable',
            evidence: 'Processed-task history was unavailable for this cycle.',
            evidence_source: 'missing_data',
        });
    }

    return watchouts;
}

function buildNotices({ activeTasks = [], historyAvailable = true, context = {}, rankingResult = null }) {
    const notices = [];

    if (activeTasks.length < 2) {
        notices.push({
            code: 'sparse_tasks',
            message: 'Active task set is sparse, so weekly recommendations are intentionally compact.',
            severity: 'info',
            evidence_source: 'tasks',
        });
    }

    if (!historyAvailable) {
        notices.push({
            code: 'missing_history',
            message: 'Processed-task history was unavailable, so progress is based on current-task evidence.',
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

    if (context.urgentMode === true) {
        notices.push({
            code: 'urgent_mode_active',
            message: 'Urgent mode is active and may bias weekly next-focus ordering.',
            severity: 'info',
            evidence_source: 'state',
        });
    }

    return notices;
}

export function composeWeeklySummarySections({
    activeTasks = [],
    processedHistory = [],
    historyAvailable = true,
    rankingResult = null,
    context = {},
} = {}) {
    const normalizedTasks = asActiveTasks(activeTasks);
    const normalizedHistory = asProcessedHistory(processedHistory);

    return {
        progress: buildProgress(normalizedHistory, historyAvailable),
        carry_forward: buildCarryForward(normalizedTasks),
        next_focus: buildNextFocus(normalizedTasks, rankingResult),
        watchouts: buildWatchouts({
            activeTasks: normalizedTasks,
            processedHistory: normalizedHistory,
            historyAvailable,
            context,
        }),
        notices: buildNotices({
            activeTasks: normalizedTasks,
            historyAvailable,
            context,
            rankingResult,
        }),
    };
}
