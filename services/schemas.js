import { SchemaType } from '@google/generative-ai';


export const reorgSchema = {
    type: SchemaType.OBJECT,
    properties: {
        summary: { type: SchemaType.STRING, description: "Brief explanation of what was reorganized and why." },
        questions: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Clarifying questions for ambiguous/high-risk tasks.",
            nullable: true
        },
        actions: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    type: { type: SchemaType.STRING, enum: ["update", "drop", "create", "complete"] },
                    taskId: { type: SchemaType.STRING, nullable: true },
                    changes: {
                        type: SchemaType.OBJECT,
                        properties: {
                            title: { type: SchemaType.STRING, nullable: true },
                            content: { type: SchemaType.STRING, nullable: true },
                            dueDate: { type: SchemaType.STRING, nullable: true },
                            scheduleBucket: { type: SchemaType.STRING, enum: ["today", "tomorrow", "this-week", "next-week", "someday"], nullable: true },
                            projectId: { type: SchemaType.STRING, nullable: true },
                            priority: { type: SchemaType.INTEGER, nullable: true }
                        }
                    }
                },
                required: ["type", "changes"]
            }
        }
    },
    required: ["summary", "actions"]
};

export const BRIEFING_SUMMARY_SECTION_KEYS = Object.freeze([
    'focus',
    'priorities',
    'why_now',
    'start_now',
    'notices',
]);

export const WEEKLY_SUMMARY_SECTION_KEYS = Object.freeze([
    'progress',
    'carry_forward',
    'next_focus',
    'watchouts',
    'notices',
]);

export const SUMMARY_NOTICE_CODES = Object.freeze([
    'sparse_tasks',
    'missing_history',
    'degraded_ranking',
    'urgent_mode_active',
    'delivery_context',
]);

export const SUMMARY_NOTICE_SEVERITIES = Object.freeze(['info', 'warning']);

export const SUMMARY_NOTICE_EVIDENCE_SOURCES = Object.freeze([
    'tasks',
    'processed_history',
    'state',
    'system',
]);

export const WEEKLY_WATCHOUT_EVIDENCE_SOURCES = Object.freeze([
    'current_tasks',
    'processed_history',
    'missing_data',
]);

const summaryNoticeSchema = {
    type: SchemaType.OBJECT,
    properties: {
        code: { type: SchemaType.STRING, enum: SUMMARY_NOTICE_CODES },
        message: { type: SchemaType.STRING },
        severity: { type: SchemaType.STRING, enum: SUMMARY_NOTICE_SEVERITIES },
        evidence_source: { type: SchemaType.STRING, enum: SUMMARY_NOTICE_EVIDENCE_SOURCES },
    },
    required: ['code', 'message', 'severity', 'evidence_source'],
};

const briefingPriorityItemSchema = {
    type: SchemaType.OBJECT,
    properties: {
        task_id: { type: SchemaType.STRING },
        title: { type: SchemaType.STRING },
        project_name: { type: SchemaType.STRING, nullable: true },
        due_date: { type: SchemaType.STRING, nullable: true },
        priority_label: { type: SchemaType.STRING, nullable: true },
        rationale_text: { type: SchemaType.STRING },
    },
    required: ['task_id', 'title', 'rationale_text'],
};

const weeklyCarryForwardItemSchema = {
    type: SchemaType.OBJECT,
    properties: {
        task_id: { type: SchemaType.STRING, nullable: true },
        title: { type: SchemaType.STRING },
        reason: { type: SchemaType.STRING },
    },
    required: ['title', 'reason'],
};

const weeklyWatchoutSchema = {
    type: SchemaType.OBJECT,
    properties: {
        label: { type: SchemaType.STRING },
        evidence: { type: SchemaType.STRING },
        evidence_source: { type: SchemaType.STRING, enum: WEEKLY_WATCHOUT_EVIDENCE_SOURCES },
    },
    required: ['label', 'evidence', 'evidence_source'],
};

export const briefingSummarySchema = {
    type: SchemaType.OBJECT,
    properties: {
        focus: { type: SchemaType.STRING },
        priorities: { type: SchemaType.ARRAY, items: briefingPriorityItemSchema },
        why_now: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        start_now: { type: SchemaType.STRING },
        notices: { type: SchemaType.ARRAY, items: summaryNoticeSchema },
    },
    required: BRIEFING_SUMMARY_SECTION_KEYS,
};

export const weeklySummarySchema = {
    type: SchemaType.OBJECT,
    properties: {
        progress: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        carry_forward: { type: SchemaType.ARRAY, items: weeklyCarryForwardItemSchema },
        next_focus: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        watchouts: { type: SchemaType.ARRAY, items: weeklyWatchoutSchema },
        notices: { type: SchemaType.ARRAY, items: summaryNoticeSchema },
    },
    required: WEEKLY_SUMMARY_SECTION_KEYS,
};
