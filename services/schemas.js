// ─── Gemini Response Schemas ──────────────────────────────────
//
// RETAINED SCOPE: This module exports structured JSON schemas used
// by Gemini's responseSchema config for the briefing, weekly, and
// summary models. These schemas enforce strict JSON output
// from Gemini's structured generation API.
//
// Primary schemas: briefingSummarySchema, weeklySummarySchema.
// Supporting constants: notice codes, severities, evidence sources.
//
// These are NOT task-writing schemas. They govern summary output
// from the briefing, weekly, and daily close commands only.
import { Type as SchemaType } from '@google/genai';

/**
 * Section keys for daily briefing summaries.
 * @type {string[]}
 */
export const BRIEFING_SUMMARY_SECTION_KEYS = Object.freeze(['focus', 'priorities', 'why_now', 'start_now', 'notices']);

/**
 * Section keys for weekly summaries.
 * @type {string[]}
 */
export const WEEKLY_SUMMARY_SECTION_KEYS = Object.freeze([
    'progress',
    'carry_forward',
    'next_focus',
    'watchouts',
    'notices'
]);

/**
 * Section keys for daily close summaries.
 * @type {string[]}
 */
export const DAILY_CLOSE_SUMMARY_SECTION_KEYS = Object.freeze(['stats', 'reflection', 'reset_cue', 'notices']);

/**
 * Valid codes for summary notices.
 * @type {string[]}
 */
export const SUMMARY_NOTICE_CODES = Object.freeze([
    'sparse_tasks',
    'sparse_day',
    'irregular_use',
    'missing_history',
    'degraded_ranking',
    'ranking_trend',
    'behavioral_pattern',
    'urgent_mode_active',
    'engagement_pattern',
    'delivery_context'
]);

/**
 * Severity levels for summary notices.
 * @type {string[]}
 */
export const SUMMARY_NOTICE_SEVERITIES = Object.freeze(['info', 'warning']);

/**
 * Evidence sources for summary notices.
 * @type {string[]}
 */
export const SUMMARY_NOTICE_EVIDENCE_SOURCES = Object.freeze([
    'tasks',
    'processed_history',
    'ranking',
    'behavioral_memory',
    'state',
    'system'
]);

/**
 * Evidence sources for weekly watchouts.
 * @type {string[]}
 */
export const WEEKLY_WATCHOUT_EVIDENCE_SOURCES = Object.freeze(['current_tasks', 'processed_history', 'missing_data']);

// ─── Intent Action Schemas ─────────────────────────────────────
//
// SCOPED FOR INTENT EXTRACTION: These schemas validate the
// structured output from Gemini's intent extraction pipeline.
// They govern create/update/complete/delete actions including
// checklist subtask support.

/**
 * Maximum number of checklist items allowed in a single create action.
 * Prevents brain-dump overload and keeps checklists execution-friendly.
 */
export const MAX_CHECKLIST_ITEMS = 30;

/**
 * Shape descriptor for checklist items in extracted intent output.
 * Used by validateIntentAction to check checklistItems arrays.
 */
export const CHECKLIST_ITEM_SHAPE = Object.freeze({
    title: { type: 'string', required: true, description: 'Short, actionable checklist step title' },
    status: { type: 'string', enum: ['completed', 'incomplete'], description: 'Item completion status' },
    sortOrder: { type: 'number', description: 'Display order within checklist' }
});

const summaryNoticeSchema = {
    type: SchemaType.OBJECT,
    properties: {
        code: { type: SchemaType.STRING, enum: SUMMARY_NOTICE_CODES },
        message: { type: SchemaType.STRING },
        severity: { type: SchemaType.STRING, enum: SUMMARY_NOTICE_SEVERITIES },
        evidence_source: { type: SchemaType.STRING, enum: SUMMARY_NOTICE_EVIDENCE_SOURCES }
    },
    required: ['code', 'message', 'severity', 'evidence_source']
};

const briefingPriorityItemSchema = {
    type: SchemaType.OBJECT,
    properties: {
        task_id: { type: SchemaType.STRING },
        title: { type: SchemaType.STRING },
        project_name: { type: SchemaType.STRING, nullable: true },
        due_date: { type: SchemaType.STRING, nullable: true },
        priority_label: { type: SchemaType.STRING, enum: ['low', 'medium', 'high', 'none'], nullable: true },
        rationale_text: { type: SchemaType.STRING }
    },
    required: ['task_id', 'title', 'rationale_text']
};

const weeklyCarryForwardItemSchema = {
    type: SchemaType.OBJECT,
    properties: {
        task_id: { type: SchemaType.STRING, nullable: true },
        title: { type: SchemaType.STRING },
        reason: { type: SchemaType.STRING }
    },
    required: ['title', 'reason']
};

const weeklyWatchoutSchema = {
    type: SchemaType.OBJECT,
    properties: {
        label: { type: SchemaType.STRING },
        evidence: { type: SchemaType.STRING },
        evidence_source: { type: SchemaType.STRING, enum: WEEKLY_WATCHOUT_EVIDENCE_SOURCES }
    },
    required: ['label', 'evidence', 'evidence_source']
};

/**
 * Gemini response schema for briefing summaries.
 */
export const briefingSummarySchema = {
    type: SchemaType.OBJECT,
    properties: {
        focus: { type: SchemaType.STRING },
        priorities: { type: SchemaType.ARRAY, items: briefingPriorityItemSchema },
        why_now: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        start_now: { type: SchemaType.STRING },
        notices: { type: SchemaType.ARRAY, items: summaryNoticeSchema }
    },
    required: BRIEFING_SUMMARY_SECTION_KEYS
};

/**
 * Gemini response schema for weekly summaries.
 */
export const weeklySummarySchema = {
    type: SchemaType.OBJECT,
    properties: {
        progress: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        carry_forward: { type: SchemaType.ARRAY, items: weeklyCarryForwardItemSchema },
        next_focus: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        watchouts: { type: SchemaType.ARRAY, items: weeklyWatchoutSchema },
        notices: { type: SchemaType.ARRAY, items: summaryNoticeSchema }
    },
    required: WEEKLY_SUMMARY_SECTION_KEYS
};

/**
 * Gemini response schema for daily close summaries.
 */
export const dailyCloseSummarySchema = {
    type: SchemaType.OBJECT,
    properties: {
        stats: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        reflection: { type: SchemaType.STRING },
        reset_cue: { type: SchemaType.STRING },
        notices: { type: SchemaType.ARRAY, items: summaryNoticeSchema }
    },
    required: DAILY_CLOSE_SUMMARY_SECTION_KEYS
};
