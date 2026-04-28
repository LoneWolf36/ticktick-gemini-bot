import { buildBehavioralPatternNotice } from './behavioral-pattern-notices.js';

function asActiveTasks(tasks = []) {
    return (Array.isArray(tasks) ? tasks : [])
        .filter((task) => task && (task.status === 0 || task.status === undefined));
}

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

function toPriorityLabel(priority) {
    if (priority === 5) return 'core_goal';
    if (priority === 3) return 'high';
    if (priority === 1) return 'medium';
    return null;
}

function parseDueDate(value) {
    if (typeof value !== 'string' || value.trim().length === 0) return Number.POSITIVE_INFINITY;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function sortTasksByDueDate(activeTasks = []) {
    return activeTasks
        .map((task, index) => ({ task, index, dueAt: parseDueDate(task?.dueDate) }))
        .sort((left, right) => {
            if (left.dueAt !== right.dueAt) return left.dueAt - right.dueAt;
            return left.index - right.index;
        })
        .map(({ task }) => task);
}

function buildPriorityItems(activeTasks = [], ranking = []) {
    const byTaskId = new Map(activeTasks.map((task) => [task.id || task.taskId, task]));
    const rankedItems = (Array.isArray(ranking) ? ranking : [])
        .map((decision) => {
            const task = byTaskId.get(decision.taskId);
            if (!task) return null;

            return {
                task_id: task.id || task.taskId || decision.taskId,
                title: task.title || 'Untitled task',
                project_name: task.projectName || null,
                due_date: task.dueDate || null,
                priority_label: toPriorityLabel(task.priority),
                rationale_code: decision.rationaleCode || null,
                rationale_text: decision.rationaleText || decision.rationaleCode || 'High-impact active work.',
            };
        })
        .filter(Boolean);

    if (rankedItems.length > 0) {
        return rankedItems.slice(0, 3);
    }

    return sortTasksByDueDate(activeTasks).slice(0, 3).map((task) => ({
        task_id: task.id || task.taskId || 'unknown-task',
        title: task.title || 'Untitled task',
        project_name: task.projectName || null,
        due_date: task.dueDate || null,
        priority_label: toPriorityLabel(task.priority),
        rationale_code: null,
        rationale_text: 'High-impact active work.',
    }));
}

function limitRecommendationsForConfidence(priorities = [], rankingResult = null) {
    const normalized = Array.isArray(priorities) ? priorities.filter(Boolean) : [];
    if (normalized.length === 0) return [];
    if (rankingResult?.degraded === true) {
        return normalized.slice(0, 1);
    }
    return normalized.slice(0, 3);
}

function ensureGoalAlignedPriority(priorities = [], fallbackPriorities = []) {
    const normalized = Array.isArray(priorities) ? priorities.filter(Boolean) : [];
    const goalCandidate = (Array.isArray(fallbackPriorities) ? fallbackPriorities : [])
        .find((item) => item?.rationale_code === 'goal_alignment');

    if (!goalCandidate) return normalized.slice(0, 3);
    if (normalized.some((item) => item?.task_id === goalCandidate.task_id || item?.rationale_code === 'goal_alignment')) {
        return normalized.slice(0, 3);
    }

    if (normalized.length < 3) {
        return [goalCandidate, ...normalized].slice(0, 3);
    }

    return [goalCandidate, ...normalized.filter((item) => item?.task_id !== goalCandidate.task_id).slice(0, 2)];
}

function buildNotices({ activeTasks = [], behavioralPatterns = [], context = {}, rankingResult = null }) {
    const notices = [];

    if (activeTasks.length < 2) {
        notices.push({
            code: 'sparse_tasks',
            message: 'Task list is sparse, so this briefing keeps focus tight.',
            severity: 'info',
            evidence_source: 'tasks',
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

    if (context.ticktickFetchFailed === true) {
        notices.push({
            code: 'delivery_context',
            message: 'TickTick fetch failed, so this briefing uses partial local context only.',
            severity: 'warning',
            evidence_source: 'system',
        });
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
            message: 'Urgent mode is active and biasing the plan toward immediate execution.',
            severity: 'info',
            evidence_source: 'state',
        });
    }

    return notices;
}

function normalizeModelSummary(summary = {}) {
    return {
        focus: toString(summary.focus, ''),
        priorities: toArray(summary.priorities).map((item) => ({
            task_id: toString(item?.task_id, ''),
            title: toString(item?.title, ''),
            project_name: item?.project_name ?? null,
            due_date: item?.due_date ?? null,
            priority_label: item?.priority_label ?? null,
            rationale_text: toString(item?.rationale_text, ''),
        })),
        why_now: toArray(summary.why_now).map((item) => toString(item)).filter(Boolean),
        start_now: toString(summary.start_now, ''),
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

    for (const notice of baseNotices) {
        if (!notice?.code) continue;
        if (seen.has(notice.code)) continue;
        seen.add(notice.code);
        merged.push(notice);
    }

    for (const notice of modelNotices) {
        if (!notice?.code) continue;
        if (seen.has(notice.code)) continue;
        seen.add(notice.code);
        merged.push(notice);
    }

    return merged;
}

function deduplicateStrings(items) {
    return [...new Set((Array.isArray(items) ? items : []).filter((s) => typeof s === 'string'))];
}

function deduplicateNoticesByMessage(notices) {
    const seen = new Set();
    return (Array.isArray(notices) ? notices : []).filter((notice) => {
        if (!notice || typeof notice.message !== 'string') return false;
        if (seen.has(notice.message)) return false;
        seen.add(notice.message);
        return true;
    });
}

function mergePriorities({
    modelPriorities = [],
    fallbackPriorities = [],
    activeTasks = [],
} = {}) {
    const byTaskId = new Map(activeTasks.map((task) => [task.id || task.taskId, task]));
    const fallbackByTaskId = new Map(fallbackPriorities.map((item) => [item.task_id, item]));
    const merged = [];
    const seen = new Set();

    for (const item of modelPriorities) {
        const taskId = item.task_id;
        if (taskId && seen.has(taskId)) continue;
        const task = taskId ? byTaskId.get(taskId) : null;
        const fallback = taskId ? fallbackByTaskId.get(taskId) : null;

        const normalized = {
            task_id: toString(taskId, fallback?.task_id || 'unknown-task'),
            title: toString(item.title, task?.title || fallback?.title || 'Untitled task'),
            project_name: item.project_name ?? task?.projectName ?? fallback?.project_name ?? null,
            due_date: item.due_date ?? task?.dueDate ?? fallback?.due_date ?? null,
            priority_label: item.priority_label ?? toPriorityLabel(task?.priority) ?? fallback?.priority_label ?? null,
            rationale_text: toString(item.rationale_text, fallback?.rationale_text || 'High-impact active work.'),
        };

        if (normalized.task_id) seen.add(normalized.task_id);
        merged.push(normalized);
    }

    for (const fallback of fallbackPriorities) {
        if (merged.length >= 3) break;
        if (seen.has(fallback.task_id)) continue;
        seen.add(fallback.task_id);
        merged.push(fallback);
    }

    if (merged.length === 0) {
        return fallbackPriorities.slice(0, 3);
    }

    return merged.slice(0, 3);
}

/**
 * Compose the individual sections of a daily briefing summary.
 *
 * @param {Object} params - Composition parameters.
 * @param {Object[]} [params.activeTasks=[]] - Current active tasks.
 * @param {Object[]} [params.behavioralPatterns=[]] - Behavioral patterns.
 * @param {Object|null} [params.rankingResult=null] - Prioritization results.
 * @param {Object} [params.context={}] - Request context.
 * @param {Object|null} [params.modelSummary=null] - Raw summary from Gemini.
 * @returns {Object} Object containing focus, priorities, why_now, start_now, and notices sections.
 */
export function composeBriefingSummarySections({
    activeTasks = [],
    behavioralPatterns = [],
    rankingResult = null,
    context = {},
    modelSummary = null,
} = {}) {
    const normalizedTasks = asActiveTasks(activeTasks);
    const ranking = Array.isArray(rankingResult?.ranked) ? rankingResult.ranked : [];
    const fallbackPriorities = buildPriorityItems(normalizedTasks, ranking);
    const fallbackTopPriority = fallbackPriorities[0];

    const fallbackFocus = fallbackTopPriority
        ? `Ship ${fallbackTopPriority.title} before lower-leverage tasks.`
        : 'Pick one concrete task and finish its first meaningful step.';

    const fallbackWhyNow = fallbackPriorities
        .map((item) => item.rationale_text)
        .filter((value, index, all) => value && all.indexOf(value) === index)
        .slice(0, 3);

    const fallbackStartNow = fallbackTopPriority
        ? `Open "${fallbackTopPriority.title}" and finish the first executable sub-step.`
        : 'Review active tasks, select one high-impact action, and begin immediately.';

    const modelNormalized = normalizeModelSummary(modelSummary || {});
    const priorities = limitRecommendationsForConfidence(ensureGoalAlignedPriority(mergePriorities({
        modelPriorities: modelNormalized.priorities,
        fallbackPriorities,
        activeTasks: normalizedTasks,
    }), fallbackPriorities), rankingResult);
    const topPriority = priorities[0];

    if (normalizedTasks.length === 0) {
        return {
            focus: 'No active tasks right now.',
            priorities: [],
            why_now: [],
            start_now: 'No briefing actions right now.',
            notices: mergeNotices(
                buildNotices({ activeTasks: normalizedTasks, behavioralPatterns, context, rankingResult }),
                modelNormalized.notices,
            ),
        };
    }

    const shouldSkipRanking = rankingResult?.degraded === true || rankingResult?.ranked?.length === 0;

    let focus = modelNormalized.focus || fallbackFocus;
    let whyNow = modelNormalized.why_now.length > 0 ? modelNormalized.why_now : fallbackWhyNow;
    let startNow = modelNormalized.start_now || fallbackStartNow;
    let finalPriorities = priorities;

    if (shouldSkipRanking) {
        finalPriorities = [];
        whyNow = [];
    }

    return {
        focus,
        priorities: finalPriorities,
        why_now: deduplicateStrings(whyNow),
        start_now: startNow,
        notices: deduplicateNoticesByMessage(mergeNotices(
            buildNotices({ activeTasks: normalizedTasks, behavioralPatterns, context, rankingResult }),
            modelNormalized.notices,
        )),
    };
}
