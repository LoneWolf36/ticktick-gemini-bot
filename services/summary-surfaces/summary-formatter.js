function renderList(items = [], formatter = (value) => value) {
    const normalized = (Array.isArray(items) ? items : [])
        .map((item) => formatter(item))
        .filter(Boolean);

    if (normalized.length === 0) return '- None';
    return normalized.map((line) => `- ${line}`).join('\n');
}

function renderNumberedList(items = []) {
    const normalized = (Array.isArray(items) ? items : []).filter(Boolean);
    if (normalized.length === 0) return '1. None';
    return normalized.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function formatNotices(notices = []) {
    return renderList(notices, (notice) => {
        const message = notice?.message || '';
        if (!message) return null;
        const severity = notice?.severity === 'warning' ? 'Warning' : 'Info';
        return `[${severity}] ${message}`;
    });
}

function formatBriefing(summary = {}) {
    const priorities = renderNumberedList(
        (Array.isArray(summary.priorities) ? summary.priorities : []).map((item) => {
            const title = item?.title || 'Untitled task';
            const rationale = item?.rationale_text ? ` (${item.rationale_text})` : '';
            return `${title}${rationale}`;
        }),
    );

    return [
        `**Focus**: ${summary.focus || 'Keep momentum on your top task.'}`,
        `**Priorities**:\n${priorities}`,
        `**Why now**:\n${renderList(summary.why_now)}`,
        `**Start now**: ${summary.start_now || 'Open your highest-impact task and begin.'}`,
        `**Notices**:\n${formatNotices(summary.notices)}`,
    ].join('\n\n').trim();
}

function formatWeekly(summary = {}) {
    const carryForward = renderList(summary.carry_forward, (item) => {
        if (!item?.title) return null;
        if (!item.reason) return item.title;
        return `${item.title} (${item.reason})`;
    });

    const watchouts = renderList(summary.watchouts, (item) => {
        if (!item?.label || !item?.evidence) return null;
        return `${item.label}: ${item.evidence}`;
    });

    return [
        `**Progress**:\n${renderList(summary.progress)}`,
        `**Carry forward**:\n${carryForward}`,
        `**Next focus**:\n${renderNumberedList(summary.next_focus)}`,
        `**Watchouts**:\n${watchouts}`,
        `**Notices**:\n${formatNotices(summary.notices)}`,
    ].join('\n\n').trim();
}

export function formatSummary({ kind, summary = {} } = {}) {
    if (kind === 'weekly') {
        return formatWeekly(summary);
    }

    return formatBriefing(summary);
}
