import {
    appendUrgentModeReminder,
    formatBriefingHeader,
    parseTelegramMarkdownToHTML,
    truncateMessage,
} from '../shared-utils.js';

const EMPTY_LABEL = 'None';
export const SUMMARY_FORMATTER_VERSION = 'summary-formatter.v1';

function normalizeInline(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (/^#{3,}\s*$/.test(normalized)) return '';
    return normalized.replace(/^#{1,6}\s+/, '').trim();
}

function normalizeListItem(value) {
    const normalized = normalizeInline(value);
    if (!normalized) return '';
    return normalized
        .replace(/^\s*[-*]\s+/, '')
        .replace(/^\s*\d+\.\s+/, '')
        .trim();
}

function renderList(items = [], emptyLabel = EMPTY_LABEL) {
    const normalized = (Array.isArray(items) ? items : [])
        .map((item) => normalizeListItem(item))
        .filter(Boolean);

    if (normalized.length === 0) return `- ${emptyLabel}`;
    return normalized.map((line) => `- ${line}`).join('\n');
}

function renderNumberedList(items = [], emptyLabel = EMPTY_LABEL) {
    const normalized = (Array.isArray(items) ? items : [])
        .map((item) => normalizeListItem(item))
        .filter(Boolean);
    if (normalized.length === 0) return `1. ${emptyLabel}`;
    return normalized.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function formatNotices(notices = []) {
    const lines = (Array.isArray(notices) ? notices : [])
        .map((notice) => {
            const message = normalizeInline(notice?.message);
            if (!message) return '';
            const severity = notice?.severity === 'warning' ? 'Warning' : 'Info';
            return `[${severity}] ${message}`;
        })
        .filter(Boolean);

    return renderList(lines);
}

function formatBriefing(summary = {}, context = {}) {
    const urgentMode = context.workStyleMode === 'urgent' || context.urgentMode === true;
    const priorities = (Array.isArray(summary.priorities) ? summary.priorities : [])
        .map((item) => {
            const title = normalizeInline(item?.title) || 'Untitled task';
            const rationale = normalizeInline(item?.rationale_text);
            if (urgentMode) return title;
            return rationale ? `${title} (${rationale})` : title;
        });

    const focus = normalizeInline(summary.focus) || EMPTY_LABEL;
    const startNow = normalizeInline(summary.start_now) || EMPTY_LABEL;

    if (urgentMode) {
        return [
            `**Focus**: ${focus}`,
            `**Priorities**:\n${renderNumberedList(priorities.slice(0, 2))}`,
            `**Start now**: ${startNow}`,
        ].join('\n\n').trim();
    }

    return [
        `**Focus**: ${focus}`,
        `**Priorities**:\n${renderNumberedList(priorities)}`,
        `**Why now**:\n${renderList(summary.why_now)}`,
        `**Start now**: ${startNow}`,
        `**Notices**:\n${formatNotices(summary.notices)}`,
    ].join('\n\n').trim();
}

function formatWeekly(summary = {}, context = {}) {
    const urgentMode = context.workStyleMode === 'urgent' || context.urgentMode === true;
    const carryForward = (Array.isArray(summary.carry_forward) ? summary.carry_forward : [])
        .map((item) => {
            const title = normalizeInline(item?.title);
            if (!title) return '';
            const reason = normalizeInline(item?.reason);
            return reason ? `${title} (${reason})` : title;
        })
        .filter(Boolean);

    const watchouts = (Array.isArray(summary.watchouts) ? summary.watchouts : [])
        .map((item) => {
            const label = normalizeInline(item?.label);
            const evidence = normalizeInline(item?.evidence);
            if (!label || !evidence) return '';
            return `${label}: ${evidence}`;
        })
        .filter(Boolean);

    if (urgentMode) {
        return [
            `**Progress**:\n${renderList((Array.isArray(summary.progress) ? summary.progress : []).slice(0, 2))}`,
            `**Next focus**:\n${renderNumberedList((Array.isArray(summary.next_focus) ? summary.next_focus : []).slice(0, 2))}`,
            `**Watchouts**:\n${renderList(watchouts)}`,
        ].join('\n\n').trim();
    }

    return [
        `**Progress**:\n${renderList(summary.progress)}`,
        `**Carry forward**:\n${renderList(carryForward)}`,
        `**Next focus**:\n${renderNumberedList(summary.next_focus)}`,
        `**Watchouts**:\n${renderList(watchouts)}`,
        `**Notices**:\n${formatNotices(summary.notices)}`,
    ].join('\n\n').trim();
}

function formatDailyClose(summary = {}, context = {}) {
    const reflection = normalizeInline(summary.reflection) || EMPTY_LABEL;
    const resetCue = normalizeInline(summary.reset_cue) || EMPTY_LABEL;

    if (context.workStyleMode === 'urgent') {
        return [
            `**Reflection**: ${reflection}`,
            `**Reset cue**: ${resetCue}`,
        ].join('\n\n').trim();
    }

    if (context.workStyleMode === 'focus') {
        return [
            `**Stats**:\n${renderList((Array.isArray(summary.stats) ? summary.stats : []).slice(0, 2))}`,
            `**Reflection**: ${reflection}`,
            `**Reset cue**: ${resetCue}`,
        ].join('\n\n').trim();
    }

    return [
        `**Stats**:\n${renderList(summary.stats)}`,
        `**Reflection**: ${reflection}`,
        `**Reset cue**: ${resetCue}`,
        `**Notices**:\n${formatNotices(summary.notices)}`,
    ].join('\n\n').trim();
}

function isTelegramSafe(text = '') {
    return !/(^|\n)\s*#{1,6}\s+/m.test(text);
}

function applyBriefingHeader({ kind }) {
    if (kind === 'weekly') {
        return formatBriefingHeader({ kind: 'weekly' });
    }
    if (kind === 'daily_close') {
        return formatBriefingHeader({ kind: 'daily_close' });
    }
    return formatBriefingHeader({ kind: 'daily' });
}

function applyUrgentReminder(text, urgentMode) {
    if (urgentMode !== true) return text;
    if (/urgent mode is currently active/i.test(text)) return text;
    return appendUrgentModeReminder(text, true);
}

function buildRenderResult({ kind, body, context = {} }) {
    const header = applyBriefingHeader({ kind });
    const combined = `${header}${body}`.trim();
    const urgentReminderApplied = context.urgentMode === true && !/urgent mode is currently active/i.test(combined);
    const withReminder = applyUrgentReminder(combined, context.urgentMode);
    const truncated = truncateMessage(withReminder);
    parseTelegramMarkdownToHTML(truncated);

    return {
        text: truncated,
        telegramSafe: isTelegramSafe(truncated),
        tonePreserved: true,
        urgentReminderApplied,
        truncated: truncated !== withReminder,
        formatterVersion: SUMMARY_FORMATTER_VERSION,
    };
}

/**
 * Format a structured summary object into a user-facing string.
 *
 * @param {Object} params - Formatting parameters.
 * @param {string} params.kind - Summary kind (briefing, weekly, daily_close).
 * @param {Object} [params.summary={}] - The structured summary object.
 * @param {Object} [params.context={}] - Request context (for urgent mode reminders).
 * @returns {Object} Formatted result containing `text` and metadata.
 */
export function formatSummary({ kind, summary = {}, context = {} } = {}) {
    if (kind === 'weekly') {
        const body = formatWeekly(summary, context);
        return buildRenderResult({ kind: 'weekly', body, context });
    }

    if (kind === 'daily_close') {
        const body = formatDailyClose(summary, context);
        return buildRenderResult({ kind: 'daily_close', body, context });
    }

    const body = formatBriefing(summary, context);
    return buildRenderResult({ kind: 'briefing', body, context });
}
