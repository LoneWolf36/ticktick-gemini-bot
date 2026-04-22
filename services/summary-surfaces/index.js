import {
    BRIEFING_SUMMARY_SECTION_KEYS,
    DAILY_CLOSE_SUMMARY_SECTION_KEYS,
    SUMMARY_NOTICE_CODES,
    SUMMARY_NOTICE_EVIDENCE_SOURCES,
    SUMMARY_NOTICE_SEVERITIES,
    WEEKLY_SUMMARY_SECTION_KEYS,
    WEEKLY_WATCHOUT_EVIDENCE_SOURCES,
} from '../schemas.js';
import { composeBriefingSummarySections } from './briefing-summary.js';
import { composeDailyCloseSummarySections } from './daily-close-summary.js';
import { composeWeeklySummarySections } from './weekly-summary.js';
import { formatSummary, SUMMARY_FORMATTER_VERSION } from './summary-formatter.js';

const BRIEFING_KIND = 'briefing';
const DAILY_CLOSE_KIND = 'daily_close';
const WEEKLY_KIND = 'weekly';
const ENTRY_POINT_VALUES = new Set(['manual_command', 'scheduler']);
const TONE_POLICY_VALUES = new Set(['preserve_existing']);
const DELIVERY_CHANNEL_VALUES = new Set(['telegram']);
const DISALLOWED_WATCHOUT_LABELS = new Set(['avoidance', 'callout']);
const WORK_STYLE_MODE_VALUES = new Set(['standard', 'focus', 'urgent']);

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

function normalizeScheduleMetadata(rawContext = {}, entryPoint = 'manual_command') {
    const schedulingMetadata = rawContext.schedulingMetadata || rawContext.scheduling_metadata || {};
    const triggerKind = schedulingMetadata.triggerKind || schedulingMetadata.trigger_kind;

    return {
        triggerKind: triggerKind === 'scheduled' || entryPoint === 'scheduler' ? 'scheduled' : 'manual',
        scheduleKey: schedulingMetadata.scheduleKey || schedulingMetadata.schedule_key || null,
        scheduledForIso: schedulingMetadata.scheduledForIso || schedulingMetadata.scheduled_for_iso || null,
        graceWindowMinutes: Number.isInteger(schedulingMetadata.graceWindowMinutes)
            ? schedulingMetadata.graceWindowMinutes
            : Number.isInteger(schedulingMetadata.grace_window_minutes)
                ? schedulingMetadata.grace_window_minutes
                : null,
    };
}

function normalizeSummaryRequestContext(kind, rawContext = {}) {
    const entryPoint = rawContext.entryPoint || rawContext.entry_point;
    const tonePolicy = rawContext.tonePolicy || rawContext.tone_policy;
    const workStyleMode = rawContext.workStyleMode || rawContext.work_style_mode;
    const deliveryChannel = rawContext.deliveryChannel || rawContext.delivery_channel;
    const normalizedEntryPoint = ENTRY_POINT_VALUES.has(entryPoint) ? entryPoint : 'manual_command';

    return {
        kind: kind === WEEKLY_KIND
            ? WEEKLY_KIND
            : kind === DAILY_CLOSE_KIND
                ? DAILY_CLOSE_KIND
                : BRIEFING_KIND,
        entryPoint: normalizedEntryPoint,
        userId: rawContext.userId ?? rawContext.user_id ?? null,
        generatedAtIso: rawContext.generatedAtIso || rawContext.generated_at_iso || new Date().toISOString(),
        timezone: rawContext.timezone || null,
        workStyleMode: WORK_STYLE_MODE_VALUES.has(workStyleMode) ? workStyleMode : 'standard',
        urgentMode: rawContext.urgentMode === true || rawContext.urgent_mode === true,
        deliveryChannel: DELIVERY_CHANNEL_VALUES.has(deliveryChannel) ? deliveryChannel : 'telegram',
        schedulingMetadata: normalizeScheduleMetadata(rawContext, normalizedEntryPoint),
        tonePolicy: TONE_POLICY_VALUES.has(tonePolicy) ? tonePolicy : 'preserve_existing',
    };
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

function hasWatchoutShape(item = {}) {
    return typeof item === 'object' && item !== null;
}

function isBehaviorLabel(label = '') {
    return DISALLOWED_WATCHOUT_LABELS.has(label.toLowerCase());
}

export function normalizeWeeklyWatchouts(watchouts = []) {
    return toArray(watchouts)
        .filter(hasWatchoutShape)
        .map((watchout) => {
            const label = toString(watchout.label);
            const evidence = toString(watchout.evidence);
            const evidenceSource = WEEKLY_WATCHOUT_EVIDENCE_SOURCES.includes(watchout.evidence_source)
                ? watchout.evidence_source
                : null;

            if (!label || !evidence || !evidenceSource) return null;
            if (isBehaviorLabel(label)) return null;
            if (evidenceSource === 'missing_data') return null;

            return {
                label,
                evidence,
                evidence_source: evidenceSource,
            };
        })
        .filter(Boolean);
}

export function normalizeBriefingSummary(summary = {}) {
    return {
        focus: toString(summary.focus, ''),
        priorities: toArray(summary.priorities).map((item) => ({
            task_id: toString(item?.task_id, 'unknown-task'),
            title: toString(item?.title, 'Untitled task'),
            project_name: item?.project_name ?? null,
            due_date: item?.due_date ?? null,
            priority_label: item?.priority_label ?? null,
            rationale_text: toString(item?.rationale_text, 'High-impact active work.'),
        })),
        why_now: toArray(summary.why_now).map((item) => toString(item)).filter(Boolean),
        start_now: toString(summary.start_now, ''),
        notices: toArray(summary.notices).map((notice) => normalizeSummaryNotice(notice)),
    };
}

export function normalizeWeeklySummary(summary = {}) {
    return {
        progress: toArray(summary.progress).map((item) => toString(item)).filter(Boolean),
        carry_forward: toArray(summary.carry_forward).map((item) => ({
            task_id: item?.task_id ?? null,
            title: toString(item?.title, 'Untitled task'),
            reason: toString(item?.reason, 'Needs an explicit plan for next week.'),
        })),
        next_focus: toArray(summary.next_focus).map((item) => toString(item)).filter(Boolean),
        watchouts: normalizeWeeklyWatchouts(summary.watchouts),
        notices: toArray(summary.notices).map((notice) => normalizeSummaryNotice(notice)),
    };
}

export function normalizeDailyCloseSummary(summary = {}) {
    return {
        stats: toArray(summary.stats).map((item) => toString(item)).filter(Boolean),
        reflection: toString(summary.reflection, ''),
        reset_cue: toString(summary.reset_cue, ''),
        notices: toArray(summary.notices).map((notice) => normalizeSummaryNotice(notice)),
    };
}

function hasAllSections(summary = {}, requiredSections = []) {
    return requiredSections.every((section) => Object.hasOwn(summary, section));
}

function ensureBriefingSections(summary = {}) {
    const normalized = normalizeBriefingSummary(summary);
    if (hasAllSections(normalized, BRIEFING_SUMMARY_SECTION_KEYS)) {
        return normalized;
    }

    return {
        focus: normalized.focus || '',
        priorities: normalized.priorities || [],
        why_now: normalized.why_now || [],
        start_now: normalized.start_now || '',
        notices: normalized.notices || [],
    };
}

function ensureWeeklySections(summary = {}) {
    const normalized = normalizeWeeklySummary(summary);
    if (hasAllSections(normalized, WEEKLY_SUMMARY_SECTION_KEYS)) {
        return normalized;
    }

    return {
        progress: normalized.progress || [],
        carry_forward: normalized.carry_forward || [],
        next_focus: normalized.next_focus || [],
        watchouts: normalized.watchouts || [],
        notices: normalized.notices || [],
    };
}

function ensureDailyCloseSections(summary = {}) {
    const normalized = normalizeDailyCloseSummary(summary);
    if (hasAllSections(normalized, DAILY_CLOSE_SUMMARY_SECTION_KEYS)) {
        return normalized;
    }

    return {
        stats: normalized.stats || [],
        reflection: normalized.reflection || '',
        reset_cue: normalized.reset_cue || '',
        notices: normalized.notices || [],
    };
}

function buildSourceCounts({ activeTasks = [], processedHistory = [] }) {
    return {
        activeTasks: toArray(activeTasks).length,
        processedHistory: toArray(processedHistory).length,
    };
}

function isTelegramSafe(text = '') {
    return !/(^|\n)\s*#{1,3}\s+/m.test(text);
}

export function createSummaryDiagnostics({
    context = {},
    activeTasks = [],
    processedHistory = [],
    rankingResult = null,
    formattedText = '',
    formattedResult = null,
} = {}) {
    const normalizedContext = normalizeSummaryRequestContext(context.kind, context);
    const tonePreserved = formattedResult?.tonePreserved ?? true;
    const telegramSafe = typeof formattedResult?.telegramSafe === 'boolean'
        ? formattedResult.telegramSafe
        : isTelegramSafe(formattedText);

    return {
        kind: normalizedContext.kind,
        entryPoint: normalizedContext.entryPoint,
        deliveryChannel: normalizedContext.deliveryChannel,
        schedulingMetadata: normalizedContext.schedulingMetadata,
        sourceCounts: buildSourceCounts({ activeTasks, processedHistory }),
        degraded: rankingResult?.degraded === true,
        degradedReason: rankingResult?.degradedReason || null,
        formatterVersion: formattedResult?.formatterVersion || SUMMARY_FORMATTER_VERSION,
        formattingDecisions: {
            telegramSafe,
            tonePreserved,
            urgentReminderApplied: formattedResult?.urgentReminderApplied === true,
            truncated: formattedResult?.truncated === true,
        },
        deliveryStatus: 'composed',
    };
}

export function buildSummaryLogPayload({
    context = {},
    result = null,
    deliveryStatus = 'composed',
    error = null,
    extra = {},
} = {}) {
    const diagnostics = result?.diagnostics
        ? {
            ...result.diagnostics,
            deliveryStatus,
        }
        : {
            kind: context.kind || BRIEFING_KIND,
            entryPoint: context.entryPoint || 'manual_command',
            sourceCounts: buildSourceCounts({}),
            degraded: false,
            degradedReason: null,
            formatterVersion: SUMMARY_FORMATTER_VERSION,
            formattingDecisions: null,
            deliveryStatus,
        };

    return {
        kind: diagnostics.kind,
        entryPoint: diagnostics.entryPoint,
        userId: context.userId ?? null,
        summary: result?.summary || null,
        diagnostics,
        error: error ? { message: error.message } : null,
        ...extra,
    };
}

export function logSummarySurfaceEvent({
    context = {},
    result = null,
    deliveryStatus = 'composed',
    error = null,
    extra = {},
} = {}) {
    const payload = buildSummaryLogPayload({
        context,
        result,
        deliveryStatus,
        error,
        extra,
    });
    console.log(`[SummarySurface:${payload.kind}] ${JSON.stringify(payload)}`);
}

/**
 * Stable summary-surface contract for daily briefing composition.
 */
export function composeBriefingSummary({
    context = {},
    activeTasks = [],
    behavioralPatterns = [],
    rankingResult = null,
    modelSummary = null,
} = {}) {
    const normalizedContext = normalizeSummaryRequestContext(BRIEFING_KIND, context);
    const summary = ensureBriefingSections(
        composeBriefingSummarySections({
            context: normalizedContext,
            activeTasks: toArray(activeTasks),
            behavioralPatterns: toArray(behavioralPatterns),
            rankingResult,
            modelSummary,
        }),
    );
    const formattedResult = formatSummary({ kind: BRIEFING_KIND, summary, context: normalizedContext });
    const formattedText = formattedResult.text;
    const diagnostics = createSummaryDiagnostics({
        context: normalizedContext,
        activeTasks,
        processedHistory: [],
        rankingResult,
        formattedText,
        formattedResult,
    });

    return {
        summary,
        formattedText,
        diagnostics,
    };
}

/**
 * Stable summary-surface contract for weekly review composition.
 */
export function composeWeeklySummary({
    context = {},
    activeTasks = [],
    behavioralPatterns = [],
    processedHistory = [],
    historyAvailable = true,
    rankingResult = null,
    modelSummary = {},
} = {}) {
    const normalizedContext = normalizeSummaryRequestContext(WEEKLY_KIND, context);
    const summary = ensureWeeklySections(
        composeWeeklySummarySections({
            context: normalizedContext,
            activeTasks: toArray(activeTasks),
            behavioralPatterns: toArray(behavioralPatterns),
            processedHistory: toArray(processedHistory),
            historyAvailable: historyAvailable === true,
            rankingResult,
            modelSummary,
        }),
    );
    const formattedResult = formatSummary({ kind: WEEKLY_KIND, summary, context: normalizedContext });
    const formattedText = formattedResult.text;
    const diagnostics = createSummaryDiagnostics({
        context: normalizedContext,
        activeTasks,
        processedHistory,
        rankingResult,
        formattedText,
        formattedResult,
    });

    return {
        summary,
        formattedText,
        diagnostics,
    };
}

/**
 * Stable summary-surface contract for end-of-day reflection composition.
 */
export function composeDailyCloseSummary({
    context = {},
    activeTasks = [],
    processedHistory = [],
    rankingResult = null,
    modelSummary = null,
} = {}) {
    const normalizedContext = normalizeSummaryRequestContext(DAILY_CLOSE_KIND, context);
    const summary = ensureDailyCloseSections(
        composeDailyCloseSummarySections({
            context: normalizedContext,
            activeTasks: toArray(activeTasks),
            processedHistory: toArray(processedHistory),
            rankingResult,
            modelSummary,
        }),
    );
    const formattedResult = formatSummary({ kind: DAILY_CLOSE_KIND, summary, context: normalizedContext });
    const formattedText = formattedResult.text;
    const diagnostics = createSummaryDiagnostics({
        context: normalizedContext,
        activeTasks,
        processedHistory,
        rankingResult,
        formattedText,
        formattedResult,
    });

    return {
        summary,
        formattedText,
        diagnostics,
    };
}

export {
    BRIEFING_SUMMARY_SECTION_KEYS,
    DAILY_CLOSE_SUMMARY_SECTION_KEYS,
    WEEKLY_SUMMARY_SECTION_KEYS,
    formatSummary,
};
