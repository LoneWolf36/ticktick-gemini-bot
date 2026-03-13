import {
    BRIEFING_SUMMARY_SECTION_KEYS,
    SUMMARY_NOTICE_CODES,
    SUMMARY_NOTICE_EVIDENCE_SOURCES,
    SUMMARY_NOTICE_SEVERITIES,
    WEEKLY_SUMMARY_SECTION_KEYS,
    WEEKLY_WATCHOUT_EVIDENCE_SOURCES,
} from '../schemas.js';
import { composeBriefingSummarySections } from './briefing-summary.js';
import { composeWeeklySummarySections } from './weekly-summary.js';
import { formatSummary, SUMMARY_FORMATTER_VERSION } from './summary-formatter.js';

const BRIEFING_KIND = 'briefing';
const WEEKLY_KIND = 'weekly';
const ENTRY_POINT_VALUES = new Set(['manual_command', 'scheduler']);
const TONE_POLICY_VALUES = new Set(['preserve_existing']);
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

function normalizeSummaryRequestContext(kind, rawContext = {}) {
    const entryPoint = rawContext.entryPoint || rawContext.entry_point;
    const tonePolicy = rawContext.tonePolicy || rawContext.tone_policy;

    return {
        kind: kind === WEEKLY_KIND ? WEEKLY_KIND : BRIEFING_KIND,
        entryPoint: ENTRY_POINT_VALUES.has(entryPoint) ? entryPoint : 'manual_command',
        userId: rawContext.userId ?? rawContext.user_id ?? null,
        generatedAtIso: rawContext.generatedAtIso || rawContext.generated_at_iso || new Date().toISOString(),
        timezone: rawContext.timezone || null,
        urgentMode: rawContext.urgentMode === true || rawContext.urgent_mode === true,
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
    rankingResult = null,
    modelSummary = null,
} = {}) {
    const normalizedContext = normalizeSummaryRequestContext(BRIEFING_KIND, context);
    const summary = ensureBriefingSections(
        composeBriefingSummarySections({
            context: normalizedContext,
            activeTasks: toArray(activeTasks),
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

export {
    BRIEFING_SUMMARY_SECTION_KEYS,
    WEEKLY_SUMMARY_SECTION_KEYS,
    formatSummary,
};
