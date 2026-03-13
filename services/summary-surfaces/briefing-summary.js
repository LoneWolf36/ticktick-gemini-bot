function asActiveTasks(tasks = []) {
    return (Array.isArray(tasks) ? tasks : [])
        .filter((task) => task && (task.status === 0 || task.status === undefined));
}

function toPriorityLabel(priority) {
    if (priority === 5) return 'career-critical';
    if (priority === 3) return 'high';
    if (priority === 1) return 'medium';
    return null;
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
                rationale_text: decision.rationaleText || decision.rationaleCode || 'High-impact active work.',
            };
        })
        .filter(Boolean);

    if (rankedItems.length > 0) {
        return rankedItems.slice(0, 3);
    }

    return activeTasks.slice(0, 3).map((task) => ({
        task_id: task.id || task.taskId || 'unknown-task',
        title: task.title || 'Untitled task',
        project_name: task.projectName || null,
        due_date: task.dueDate || null,
        priority_label: toPriorityLabel(task.priority),
        rationale_text: 'High-impact active work.',
    }));
}

function buildNotices({ activeTasks = [], context = {}, rankingResult = null }) {
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

export function composeBriefingSummarySections({ activeTasks = [], rankingResult = null, context = {} } = {}) {
    const normalizedTasks = asActiveTasks(activeTasks);
    const ranking = Array.isArray(rankingResult?.ranked) ? rankingResult.ranked : [];
    const priorities = buildPriorityItems(normalizedTasks, ranking);
    const topPriority = priorities[0];

    const focus = topPriority
        ? `Ship ${topPriority.title} before lower-leverage tasks.`
        : 'Pick one concrete task and finish its first meaningful step.';

    const whyNow = priorities
        .map((item) => item.rationale_text)
        .filter((value, index, all) => value && all.indexOf(value) === index)
        .slice(0, 3);

    const startNow = topPriority
        ? `Open "${topPriority.title}" and finish the first executable sub-step.`
        : 'Review active tasks, select one high-impact action, and begin immediately.';

    return {
        focus,
        priorities,
        why_now: whyNow,
        start_now: startNow,
        notices: buildNotices({ activeTasks: normalizedTasks, context, rankingResult }),
    };
}
