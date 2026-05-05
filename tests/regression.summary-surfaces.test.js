import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { appendUrgentModeReminder, parseTelegramMarkdownToHTML } from '../services/shared-utils.js';
import { registerCommands } from '../bot/commands.js';
import { GeminiAnalyzer, buildWorkStylePromptNote } from '../services/gemini.js';
import {
    createIntentExtractor,
    detectWorkStyleModeIntent,
    QuotaExhaustedError
} from '../services/intent-extraction.js';
import { createPipeline } from '../services/pipeline.js';
import { createPipelineObservability } from '../services/pipeline-observability.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import * as store from '../services/store.js';
import * as executionPrioritization from '../services/execution-prioritization.js';
import { AUTHORIZED_CHAT_ID } from '../services/shared-utils.js';
import {
    runDailyBriefingJob,
    runWeeklyDigestJob,
    SCHEDULER_NOTIFICATION_TYPES,
    shouldSuppressScheduledNotification
} from '../services/scheduler.js';
import {
    BRIEFING_SUMMARY_SECTION_KEYS,
    DAILY_CLOSE_SUMMARY_SECTION_KEYS,
    WEEKLY_SUMMARY_SECTION_KEYS,
    buildSummaryLogPayload,
    composeBriefingSummary,
    composeDailyCloseSummary,
    composeWeeklySummary,
    formatSummary,
    normalizeWeeklyWatchouts
} from '../services/summary-surfaces/index.js';
import { formatNotices } from '../services/summary-surfaces/summary-formatter.js';
import { buildBehavioralPatternNotice } from '../services/summary-surfaces/behavioral-pattern-notices.js';
import { createPipelineHarness, DEFAULT_PROJECTS, DEFAULT_ACTIVE_TASKS } from './pipeline-harness.js';
import {
    buildRankingContext,
    buildRecommendationResult,
    createGoalThemeProfile,
    createRankingDecision,
    normalizePriorityCandidate
} from '../services/execution-prioritization.js';

import {
    rankPriorityCandidatesForTest,
    buildSummaryActiveTasksFixture,
    buildSummaryProcessedHistoryFixture,
    buildSummaryResolvedStateFixture,
    buildSummaryRankingFixture,
    buildDailySummaryFixture,
    buildWeeklySummaryFixture,
    buildDailyCloseProcessedHistoryFixture,
    buildDailyCloseSummaryFixture
} from './helpers/regression-fixtures.js';

test('summary fixtures expose deterministic normal sparse and degraded inputs', () => {
    const normalTasks = buildSummaryActiveTasksFixture();
    const sparseTasks = buildSummaryActiveTasksFixture({ variant: 'sparse' });
    const degradedTasks = buildSummaryActiveTasksFixture({ variant: 'degraded-ranking' });
    const normalHistory = buildSummaryProcessedHistoryFixture();
    const sparseHistory = buildSummaryProcessedHistoryFixture({ variant: 'sparse' });
    const missingHistory = buildSummaryProcessedHistoryFixture({ variant: 'missing' });
    const urgentState = buildSummaryResolvedStateFixture({ urgentMode: true });
    const ranking = buildSummaryRankingFixture(normalTasks, { degraded: true });

    assert.equal(normalTasks.length, 3);
    assert.equal(normalTasks[0].id, 'task-focus');
    assert.equal(sparseTasks.length, 1);
    assert.equal(
        degradedTasks.every((task) => task.priority === 0),
        true
    );
    assert.equal(normalHistory.length, 2);
    assert.equal(sparseHistory.length, 1);
    assert.equal(missingHistory.length, 0);
    assert.equal(urgentState.urgentMode, true);
    assert.equal(ranking.degraded, true);
    assert.equal(ranking.degradedReason, 'ranking inputs incomplete');
});

test('composeBriefingSummary always returns fixed briefing top-level sections', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture();
    const result = composeBriefingSummary({ context, activeTasks, rankingResult });

    assert.deepEqual(Object.keys(result.summary), BRIEFING_SUMMARY_SECTION_KEYS);
    assert.equal(Array.isArray(result.summary.priorities), true);
    assert.equal(Array.isArray(result.summary.why_now), true);
    assert.equal(Array.isArray(result.summary.notices), true);
});

test('composeBriefingSummary prefers structured model focus and priorities', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture();
    const modelSummary = {
        focus: 'Ship the architecture PR before low-leverage work.',
        priorities: [
            {
                task_id: activeTasks[0].id,
                title: '',
                project_name: null,
                due_date: null,
                priority_label: 'core_goal',
                rationale_text: 'Directly moves the core goal.'
            }
        ],
        why_now: ['Directly moves the core goal.'],
        start_now: 'Open the PR checklist and draft the next commit.',
        notices: []
    };

    const result = composeBriefingSummary({
        context,
        activeTasks,
        rankingResult,
        modelSummary
    });

    assert.equal(result.summary.focus, modelSummary.focus);
    assert.equal(result.summary.priorities[0].task_id, activeTasks[0].id);
    assert.equal(result.summary.priorities[0].title, activeTasks[0].title);
    assert.equal(result.summary.start_now, modelSummary.start_now);
});

test('composeBriefingSummary adds sparse-task notices without filler', () => {
    const activeTasks = buildSummaryActiveTasksFixture({ variant: 'sparse' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture();
    const modelSummary = {
        focus: '',
        priorities: [],
        why_now: [],
        start_now: '',
        notices: []
    };

    const result = composeBriefingSummary({
        context,
        activeTasks,
        rankingResult,
        modelSummary
    });

    assert.equal(result.summary.priorities.length, 1);
    assert.ok(result.summary.notices.some((notice) => notice.code === 'sparse_tasks'));
});

test('composeBriefingSummary adds degraded-ranking notice when ranking is degraded', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks, { degraded: true });
    const context = buildSummaryResolvedStateFixture();
    const modelSummary = {
        focus: 'Keep momentum on ranked work.',
        priorities: [],
        why_now: [],
        start_now: 'Open the top task and take the first step.',
        notices: []
    };

    const result = composeBriefingSummary({
        context,
        activeTasks,
        rankingResult,
        modelSummary
    });

    assert.ok(result.summary.notices.some((notice) => notice.code === 'degraded_ranking'));
});

test('composeBriefingSummary falls back to due-date ordering when ranking is unavailable', () => {
    const activeTasks = [
        {
            id: 'task-undated',
            title: 'Undated cleanup',
            status: 0,
            dueDate: null,
            priority: 1,
            projectName: 'Admin'
        },
        {
            id: 'task-later',
            title: 'Later due task',
            status: 0,
            dueDate: '2026-03-24',
            priority: 3,
            projectName: 'Career'
        },
        {
            id: 'task-sooner',
            title: 'Sooner due task',
            status: 0,
            dueDate: '2026-03-22',
            priority: 1,
            projectName: 'Career'
        }
    ];
    const context = buildSummaryResolvedStateFixture();

    const result = composeBriefingSummary({
        context,
        activeTasks,
        rankingResult: null
    });

    assert.deepEqual(
        result.summary.priorities.map((item) => item.task_id),
        ['task-sooner', 'task-later', 'task-undated']
    );
});

test('composeBriefingSummary consumes ranking output for task selection', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const context = buildSummaryResolvedStateFixture();
    const rankingResult = {
        ranked: [
            createRankingDecision({
                taskId: activeTasks[2].id,
                rank: 1,
                rationaleCode: 'goal_alignment',
                rationaleText: 'Directly moves the core goal.'
            }),
            createRankingDecision({
                taskId: activeTasks[0].id,
                rank: 2,
                rationaleCode: 'urgency',
                rationaleText: 'Due soon.'
            })
        ]
    };

    const result = composeBriefingSummary({
        context,
        activeTasks,
        rankingResult
    });

    assert.equal(result.summary.priorities[0].task_id, activeTasks[2].id);
    assert.equal(result.summary.priorities[0].rationale_text, 'Directly moves the core goal.');
});

test('composeBriefingSummary can surface fresh high-confidence behavioral patterns', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture(),
        generatedAtIso: '2026-04-22T12:00:00Z'
    };

    const result = composeBriefingSummary({
        context,
        activeTasks,
        rankingResult,
        behavioralPatterns: [
            {
                type: 'snooze_spiral',
                confidence: 'high',
                eligibleForSurfacing: true,
                signalCount: 4,
                windowStart: '2026-04-20T10:00:00Z',
                windowEnd: '2026-04-22T09:00:00Z'
            }
        ]
    });

    const notice = result.summary.notices.find((item) => item.code === 'behavioral_pattern');
    assert.ok(notice);
    assert.equal(notice.evidence_source, 'behavioral_memory');
    assert.match(notice.message, /postpones|rescheduling/i);
});

test('composeWeeklySummary always returns fixed weekly top-level sections', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildSummaryProcessedHistoryFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly'
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory,
        historyAvailable: true,
        rankingResult
    });

    assert.deepEqual(Object.keys(result.summary), WEEKLY_SUMMARY_SECTION_KEYS);
    assert.equal(Array.isArray(result.summary.progress), true);
    assert.equal(Array.isArray(result.summary.watchouts), true);
    assert.equal(Array.isArray(result.summary.notices), true);
});

test('composeWeeklySummary uses structured model summary but keeps next_focus grounded', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildSummaryProcessedHistoryFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly'
    };
    const modelSummary = {
        progress: ['Completed: Shipped weekly architecture PR'],
        carry_forward: [
            {
                task_id: 'task-support',
                title: 'Prepare system design notes',
                reason: 'Still open with planned follow-up.'
            }
        ],
        next_focus: ['Random model suggestion'],
        watchouts: [
            {
                label: 'Overdue tasks accumulating',
                evidence: '1 active task is overdue right now.',
                evidence_source: 'current_tasks'
            }
        ],
        notices: [
            {
                code: 'delivery_context',
                message: 'Model summary received.',
                severity: 'info',
                evidence_source: 'system'
            }
        ]
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory,
        historyAvailable: true,
        rankingResult,
        modelSummary
    });

    assert.ok(result.summary.progress.includes('Completed: Shipped weekly architecture PR'));
    assert.equal(result.summary.next_focus.includes('Random model suggestion'), false);
    assert.equal(result.summary.next_focus[0], activeTasks[0].title);
});

test('composeWeeklySummary covers completed work deferred work and upcoming preview', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildSummaryProcessedHistoryFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly'
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory,
        historyAvailable: true,
        rankingResult
    });

    assert.ok(result.summary.progress.some((line) => /Completed: Completed resume update/.test(line)));
    assert.ok(result.summary.carry_forward.some((item) => /Deferred mock interview/.test(item.title)));
    assert.ok(result.summary.carry_forward.some((item) => /Deferred or rescheduled this week/.test(item.reason)));
    assert.ok(result.summary.next_focus.includes('Ship weekly architecture PR'));
});

test('composeWeeklySummary can reference ranking trends in notices', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildSummaryProcessedHistoryFixture();
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly'
    };
    const rankingResult = {
        ranked: [
            createRankingDecision({
                taskId: activeTasks[0].id,
                rank: 1,
                rationaleCode: 'goal_alignment',
                rationaleText: 'Directly moves the core goal.'
            }),
            createRankingDecision({
                taskId: activeTasks[1].id,
                rank: 2,
                rationaleCode: 'goal_alignment',
                rationaleText: 'Keeps the main goal moving.'
            }),
            createRankingDecision({
                taskId: activeTasks[2].id,
                rank: 3,
                rationaleCode: 'urgency',
                rationaleText: 'Due soon.'
            })
        ]
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory,
        historyAvailable: true,
        rankingResult
    });

    const rankingNotice = result.summary.notices.find((notice) => notice.code === 'ranking_trend');
    assert.ok(rankingNotice);
    assert.match(rankingNotice.message, /ranking trends toward goal-aligned work/i);
    assert.equal(rankingNotice.evidence_source, 'ranking');
});

test('composeWeeklySummary can surface behavioral pattern notices when available', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildSummaryProcessedHistoryFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly',
        generatedAtIso: '2026-04-22T12:00:00Z'
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory,
        historyAvailable: true,
        rankingResult,
        behavioralPatterns: [
            {
                type: 'planning_without_execution_type_a',
                confidence: 'standard',
                eligibleForSurfacing: true,
                signalCount: 3,
                windowStart: '2026-04-19T08:00:00Z',
                windowEnd: '2026-04-21T18:00:00Z'
            }
        ]
    });

    const notice = result.summary.notices.find((item) => item.code === 'behavioral_pattern');
    assert.ok(notice);
    assert.equal(notice.evidence_source, 'behavioral_memory');
    assert.match(notice.message, /planning|execution/i);
});

test('summary surfaces omit low-confidence or stale behavioral patterns gracefully', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildSummaryProcessedHistoryFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly',
        generatedAtIso: '2026-04-22T12:00:00Z'
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory,
        historyAvailable: true,
        rankingResult,
        behavioralPatterns: [
            {
                type: 'snooze_spiral',
                confidence: 'low',
                eligibleForSurfacing: false,
                signalCount: 2,
                windowStart: '2026-04-20T08:00:00Z',
                windowEnd: '2026-04-21T08:00:00Z'
            },
            {
                type: 'planning_without_execution_type_b',
                confidence: 'high',
                eligibleForSurfacing: true,
                signalCount: 12,
                windowStart: '2026-02-01T08:00:00Z',
                windowEnd: '2026-02-05T08:00:00Z'
            }
        ]
    });

    assert.equal(
        result.summary.notices.some((item) => item.code === 'behavioral_pattern'),
        false
    );
    assert.ok(result.formattedText.length > 0);
});

test('behavioral pattern notices omit low-confidence ambiguous patterns', () => {
    const notice = buildBehavioralPatternNotice(
        [
            {
                type: 'snooze_spiral',
                confidence: 'low',
                eligibleForSurfacing: false,
                signalCount: 2,
                windowStart: '2026-04-20T08:00:00Z',
                windowEnd: '2026-04-22T10:00:00Z'
            }
        ],
        { nowIso: '2026-04-22T12:00:00Z' }
    );

    assert.equal(notice, null);
});

test('behavioral pattern notices stay silent until repeated evidence threshold is met', () => {
    const notice = buildBehavioralPatternNotice(
        [
            {
                type: 'planning_without_execution_type_a',
                confidence: 'standard',
                eligibleForSurfacing: true,
                signalCount: 2,
                windowStart: '2026-04-20T08:00:00Z',
                windowEnd: '2026-04-22T10:00:00Z'
            }
        ],
        { nowIso: '2026-04-22T12:00:00Z' }
    );

    assert.equal(notice, null);
});

test('weekly summary urgent mode does not lower behavioral callout threshold', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildSummaryProcessedHistoryFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture({ urgentMode: true }),
        kind: 'weekly',
        generatedAtIso: '2026-04-22T12:00:00Z'
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory,
        historyAvailable: true,
        rankingResult,
        behavioralPatterns: [
            {
                type: 'planning_without_execution_type_b',
                confidence: 'high',
                eligibleForSurfacing: true,
                signalCount: 3,
                uniqueDomains: 3,
                windowStart: '2026-04-20T08:00:00Z',
                windowEnd: '2026-04-22T10:00:00Z'
            }
        ]
    });

    assert.equal(
        result.summary.notices.some((item) => item.code === 'behavioral_pattern'),
        false
    );
    assert.equal(
        result.summary.notices.some((item) => item.code === 'urgent_mode_active'),
        true
    );
});

test('composeWeeklySummary stays observational and scannable', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildSummaryProcessedHistoryFixture({ variant: 'repeated_ignored' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly'
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory,
        historyAvailable: true,
        rankingResult
    });
    const formatted = formatSummary({ kind: 'weekly', summary: result.summary, context }).text;

    assert.ok(
        result.summary.watchouts.every(
            (item) => !/lazy|avoidance|character|diagnostic/i.test(`${item.label} ${item.evidence}`)
        )
    );
    assert.ok(result.summary.notices.every((notice) => !/lazy|avoidance|character|diagnostic/i.test(notice.message)));
    assert.ok(formatted.includes('**Progress**'));
    assert.ok(formatted.includes('**Carry forward**'));
    assert.ok(formatted.includes('**Next focus**'));
    assert.ok(formatted.includes('**Watchouts**'));
    const sectionCount = (formatted.match(/^\*\*[^\n]+\*\*$/gm) || []).length;
    assert.ok(sectionCount <= 5);
});

test('composeWeeklySummary reduces digest and adds missing history notice when history is missing', () => {
    const activeTasks = buildSummaryActiveTasksFixture({ variant: 'sparse' });
    const processedHistory = [];
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly'
    };
    const modelSummary = {
        progress: ['Completed: Placeholder progress'],
        watchouts: [
            {
                label: 'Dropped tasks this week',
                evidence: '1 processed item was dropped.',
                evidence_source: 'processed_history'
            }
        ]
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory,
        historyAvailable: false,
        rankingResult,
        modelSummary
    });

    assert.equal(result.summary.progress.length, 0);
    assert.ok(result.summary.carry_forward.length > 0);
    assert.ok(result.summary.next_focus.length > 0);
    assert.ok(result.summary.notices.some((notice) => notice.code === 'missing_history'));
});

test('composeWeeklySummary recomputes context from live tasks plus retained aggregates when history is missing', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly',
        generatedAtIso: '2026-04-22T12:00:00Z'
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory: [],
        historyAvailable: false,
        rankingResult,
        behavioralPatterns: [
            {
                type: 'snooze_spiral',
                confidence: 'high',
                eligibleForSurfacing: true,
                signalCount: 4,
                windowStart: '2026-04-20T10:00:00Z',
                windowEnd: '2026-04-22T09:00:00Z'
            }
        ]
    });

    const recomputeNotice = result.summary.notices.find((notice) => notice.code === 'delivery_context');
    assert.ok(recomputeNotice);
    assert.equal(recomputeNotice.evidence_source, 'behavioral_memory');
    assert.match(recomputeNotice.message, /recomputed from live tasks/i);
    assert.ok(result.summary.notices.some((notice) => notice.code === 'behavioral_pattern'));
    assert.ok(result.summary.carry_forward.length > 0);
    assert.ok(result.summary.next_focus.length > 0);
});

test('composeWeeklySummary drops watchouts without evidence backing', () => {
    const activeTasks = buildSummaryActiveTasksFixture().map((task) => ({
        ...task,
        dueDate: '2026-03-20'
    }));
    const processedHistory = [];
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly'
    };
    const modelSummary = {
        watchouts: [
            {
                label: 'Dropped tasks this week',
                evidence: '1 processed item was dropped.',
                evidence_source: 'processed_history'
            },
            {
                label: 'History unavailable',
                evidence: 'Processed-task history was unavailable.',
                evidence_source: 'missing_data'
            }
        ]
    };

    const result = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory,
        historyAvailable: true,
        rankingResult,
        modelSummary
    });

    assert.equal(result.summary.watchouts.length, 0);
});

test('weekly watchout normalization rejects behavioral labels and strips prompt-era fields', () => {
    const watchouts = normalizeWeeklyWatchouts([
        {
            label: 'avoidance',
            evidence: 'A delayed critical task appears in history.',
            evidence_source: 'processed_history',
            callout: 'legacy behavioral field'
        },
        {
            label: 'Overdue tasks accumulating',
            evidence: '3 active tasks are overdue.',
            evidence_source: 'current_tasks',
            avoidance: 'legacy field should be removed',
            callout: 'legacy field should be removed'
        }
    ]);

    assert.equal(watchouts.length, 1);
    assert.equal(watchouts[0].label, 'Overdue tasks accumulating');
    assert.equal(Object.hasOwn(watchouts[0], 'avoidance'), false);
    assert.equal(Object.hasOwn(watchouts[0], 'callout'), false);
});

test('formatSummary renders fixed section order across briefing and weekly variants', () => {
    const cases = [
        {
            kind: 'briefing',
            summary: buildDailySummaryFixture(),
            context: { workStyleMode: store.MODE_STANDARD, urgentMode: false },
            header: 'MORNING BRIEFING',
            sectionOrder: ['**Focus**', '**Top priorities**', '**Why it matters**', '**First action**', '**Notes**'],
            mustContain: [],
            assertExtra: (result) => {
                assert.equal(result.tonePreserved, true);
            }
        },
        {
            kind: 'weekly',
            summary: buildWeeklySummaryFixture(),
            context: { urgentMode: false },
            header: 'WEEKLY ACCOUNTABILITY REVIEW',
            sectionOrder: ['**Progress**', '**Carry forward**', '**Next focus**', '**Watchouts**', '**Notes**'],
            mustContain: ['**Overdue tasks accumulating**', '> 2 active tasks are overdue right now.'],
            assertExtra: () => {}
        }
    ];

    for (const scenario of cases) {
        const result = formatSummary({
            kind: scenario.kind,
            summary: scenario.summary,
            context: scenario.context
        });
        const positions = scenario.sectionOrder.map((label) => result.text.indexOf(label));

        assert.ok(result.text.includes(scenario.header));
        for (const snippet of scenario.mustContain) {
            assert.ok(result.text.includes(snippet));
        }
        assert.ok(positions.every((pos) => pos >= 0));
        assert.deepEqual(
            [...positions].sort((a, b) => a - b),
            positions
        );
        assert.equal(result.telegramSafe, true);
        scenario.assertExtra(result);
    }
});

test('formatSummary keeps empty sections compact and Telegram-safe', () => {
    const daily = buildDailySummaryFixture({ variant: 'empty' });
    const weekly = buildWeeklySummaryFixture({ variant: 'reduced' });
    const dailyResult = formatSummary({ kind: 'briefing', summary: daily, context: {} });
    const weeklyResult = formatSummary({ kind: 'weekly', summary: weekly, context: {} });

    assert.match(dailyResult.text, /\*\*Focus\*\*: None/);
    assert.equal(dailyResult.text.includes('**Top priorities**'), false);
    assert.equal(dailyResult.text.includes('Keep momentum on your top task.'), false);
    assert.match(weeklyResult.text, /\*\*Progress\*\*:\n- None/);
    assert.match(weeklyResult.text, /\*\*Carry forward\*\*:\n- None/);
    assert.equal(weeklyResult.text.includes('**Next focus**'), false);
    assert.match(weeklyResult.text, /\*\*Watchouts\*\*:\n- None/);
    assert.match(weeklyResult.text, /⚠️ \*\*Processed-task history was unavailable\.\*\*/);

    const dailyHtml = parseTelegramMarkdownToHTML(dailyResult.text);
    const weeklyHtml = parseTelegramMarkdownToHTML(weeklyResult.text);
    assert.match(dailyHtml, /<b>Focus<\/b>/);
    assert.match(weeklyHtml, /<b>Progress<\/b>/);
});

test('composeDailyCloseSummary always returns fixed daily-close top-level sections', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildDailyCloseProcessedHistoryFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture({ kind: 'daily_close' });

    const result = composeDailyCloseSummary({
        context,
        activeTasks,
        processedHistory,
        rankingResult
    });

    assert.deepEqual(Object.keys(result.summary), DAILY_CLOSE_SUMMARY_SECTION_KEYS);
    assert.equal(Array.isArray(result.summary.stats), true);
    assert.equal(Array.isArray(result.summary.notices), true);
});

test('composeDailyCloseSummary acknowledges meaningful progress without cheerleading', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildDailyCloseProcessedHistoryFixture({ variant: 'meaningful' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture({ kind: 'daily_close' });

    const result = composeDailyCloseSummary({
        context,
        activeTasks,
        processedHistory,
        rankingResult
    });

    assert.ok(result.summary.stats.includes('Completed: `2`'));
    assert.match(result.summary.reflection, /meaningful work/i);
    assert.match(result.summary.reset_cue, /Tomorrow’s restart/i);
});

test('composeDailyCloseSummary stays minimal and non-punitive for irregular use', () => {
    const activeTasks = buildSummaryActiveTasksFixture({ variant: 'sparse' });
    const processedHistory = buildDailyCloseProcessedHistoryFixture({ variant: 'irregular' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture({ kind: 'daily_close' }),
        generatedAtIso: '2026-03-13T21:00:00Z'
    };

    const result = composeDailyCloseSummary({
        context,
        activeTasks,
        processedHistory,
        rankingResult
    });

    assert.equal(result.summary.reflection, '');
    assert.ok(result.summary.notices.some((notice) => notice.code === 'irregular_use'));
    assert.ok(result.summary.notices.some((notice) => notice.code === 'sparse_day'));
    assert.equal(/punish|failure|lazy/i.test(result.formattedText), false);
});

test('composeDailyCloseSummary can recompute no-activity reflection from live tasks plus retained aggregates', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture({ kind: 'daily_close' }),
        generatedAtIso: '2026-04-22T12:00:00Z'
    };

    const result = composeDailyCloseSummary({
        context,
        activeTasks,
        processedHistory: [],
        rankingResult,
        behavioralPatterns: [
            {
                type: 'planning_without_execution_type_a',
                confidence: 'high',
                eligibleForSurfacing: true,
                signalCount: 4,
                windowStart: '2026-04-20T08:00:00Z',
                windowEnd: '2026-04-22T10:00:00Z'
            }
        ]
    });

    const recomputeNotice = result.summary.notices.find((notice) => notice.code === 'delivery_context');
    assert.ok(recomputeNotice);
    assert.equal(recomputeNotice.evidence_source, 'behavioral_memory');
    assert.match(result.summary.reflection, /retained 30-day behavioral aggregates/i);
    assert.ok(result.summary.notices.some((notice) => notice.code === 'behavioral_pattern'));
});

test('composeDailyCloseSummary can surface fresh standard/high-confidence behavioral pattern notice', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildDailyCloseProcessedHistoryFixture({ variant: 'meaningful' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture({ kind: 'daily_close' }),
        generatedAtIso: '2026-04-22T12:00:00Z'
    };

    const result = composeDailyCloseSummary({
        context,
        activeTasks,
        processedHistory,
        rankingResult,
        behavioralPatterns: [
            {
                type: 'planning_without_execution_type_a',
                confidence: 'high',
                eligibleForSurfacing: true,
                signalCount: 4,
                windowStart: '2026-04-20T08:00:00Z',
                windowEnd: '2026-04-22T10:00:00Z'
            }
        ]
    });

    const notice = result.summary.notices.find((item) => item.code === 'behavioral_pattern');
    assert.ok(notice);
    assert.equal(notice.evidence_source, 'behavioral_memory');
    assert.match(notice.message, /planning|execution/i);
});

test('behavioral pattern notices stay observational across surfaced pattern types', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const processedHistory = buildSummaryProcessedHistoryFixture();
    const dailyCloseHistory = buildDailyCloseProcessedHistoryFixture({ variant: 'meaningful' });
    const disallowedTone = /diagnos|disorder|syndrome|moral|shame|blame|character|lazy|fault|bad person/i;
    const cases = [
        {
            type: 'snooze_spiral',
            confidence: 'high',
            signalCount: 4,
            windowStart: '2026-04-20T08:00:00Z',
            windowEnd: '2026-04-22T10:00:00Z',
            expectedCue: /postpon|reschedul/i
        },
        {
            type: 'planning_without_execution_type_a',
            confidence: 'standard',
            signalCount: 3,
            windowStart: '2026-04-20T08:00:00Z',
            windowEnd: '2026-04-22T10:00:00Z',
            expectedCue: /planning|execution|breakdown/i
        },
        {
            type: 'planning_without_execution_type_b',
            confidence: 'high',
            signalCount: 12,
            windowStart: '2026-04-20T08:00:00Z',
            windowEnd: '2026-04-22T10:00:00Z',
            expectedCue: /completion|plan|finish|focus/i
        }
    ];

    for (const behavioralPattern of cases) {
        const briefing = composeBriefingSummary({
            context: {
                ...buildSummaryResolvedStateFixture(),
                generatedAtIso: '2026-04-22T12:00:00Z'
            },
            activeTasks,
            rankingResult,
            behavioralPatterns: [{ ...behavioralPattern, eligibleForSurfacing: true }]
        });
        const weekly = composeWeeklySummary({
            context: {
                ...buildSummaryResolvedStateFixture(),
                kind: 'weekly',
                generatedAtIso: '2026-04-22T12:00:00Z'
            },
            activeTasks,
            processedHistory,
            historyAvailable: true,
            rankingResult,
            behavioralPatterns: [{ ...behavioralPattern, eligibleForSurfacing: true }]
        });
        const dailyClose = composeDailyCloseSummary({
            context: {
                ...buildSummaryResolvedStateFixture({ kind: 'daily_close' }),
                generatedAtIso: '2026-04-22T12:00:00Z'
            },
            activeTasks,
            processedHistory: dailyCloseHistory,
            rankingResult,
            behavioralPatterns: [{ ...behavioralPattern, eligibleForSurfacing: true }]
        });

        for (const summary of [briefing.summary, weekly.summary, dailyClose.summary]) {
            const notice = summary.notices.find((item) => item.code === 'behavioral_pattern');
            assert.ok(notice);
            assert.equal(notice.evidence_source, 'behavioral_memory');
            assert.match(notice.message, behavioralPattern.expectedCue);
            assert.equal(disallowedTone.test(notice.message), false);
        }
    }
});

test('composeDailyCloseSummary omits low-confidence stale invalid behavioral patterns and still renders', () => {
    const activeTasks = buildSummaryActiveTasksFixture({ variant: 'sparse' });
    const processedHistory = buildDailyCloseProcessedHistoryFixture({ variant: 'backoff' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
        ...buildSummaryResolvedStateFixture({ kind: 'daily_close' }),
        generatedAtIso: '2026-04-22T12:00:00Z'
    };

    const result = composeDailyCloseSummary({
        context,
        activeTasks,
        processedHistory,
        rankingResult,
        behavioralPatterns: [
            {
                type: 'snooze_spiral',
                confidence: 'low',
                eligibleForSurfacing: false,
                signalCount: 2,
                windowStart: '2026-04-20T08:00:00Z',
                windowEnd: '2026-04-21T08:00:00Z'
            },
            {
                type: 'planning_without_execution_type_b',
                confidence: 'high',
                eligibleForSurfacing: true,
                signalCount: 10,
                windowStart: '2026-02-01T08:00:00Z',
                windowEnd: '2026-02-05T08:00:00Z'
            },
            {
                type: 'unknown_pattern',
                confidence: 'standard',
                eligibleForSurfacing: true,
                signalCount: 3
            }
        ]
    });

    assert.equal(
        result.summary.notices.some((item) => item.code === 'behavioral_pattern'),
        false
    );
    assert.ok(result.formattedText.length > 0);
});

test('formatSummary renders daily-close sections in fixed order and keeps output Telegram-safe', () => {
    const summary = buildDailyCloseSummaryFixture();
    const { text, telegramSafe } = formatSummary({
        kind: 'daily_close',
        summary,
        context: { urgentMode: false }
    });

    const sectionOrder = ['**Stats**', '**Reflection**', '**Reset cue**', '**Notes**'];
    const positions = sectionOrder.map((label) => text.indexOf(label));

    assert.ok(text.includes('END-OF-DAY REFLECTION'));
    assert.ok(positions.every((pos) => pos >= 0));
    assert.deepEqual(
        [...positions].sort((a, b) => a - b),
        positions
    );
    assert.equal(telegramSafe, true);
});

test('formatSummary is deterministic for identical daily-close input', () => {
    const summary = buildDailyCloseSummaryFixture();
    const context = { workStyleMode: store.MODE_STANDARD, urgentMode: false };

    const first = formatSummary({ kind: 'daily_close', summary, context });
    const second = formatSummary({ kind: 'daily_close', summary, context });

    assert.deepEqual(second, first);
});

test('daily-close formatter uses compact concrete non-judgmental copy', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildDailyCloseProcessedHistoryFixture({ variant: 'backoff' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture({ kind: 'daily_close' });

    const result = composeDailyCloseSummary({
        context,
        activeTasks,
        processedHistory,
        rankingResult
    });
    const formatted = formatSummary({ kind: 'daily_close', summary: result.summary, context }).text;

    assert.match(
        result.summary.reflection,
        /Keep tomorrow smaller|choose one smaller restart step|choose the first restart step/
    );
    assert.equal(/ignored repeatedly|lazy|failure|punish|character/i.test(result.summary.reflection), false);
    const sentenceCount = result.summary.reflection
        .split(/[.!?]+/)
        .map((part) => part.trim())
        .filter(Boolean).length;
    assert.ok(sentenceCount <= 2);
    assert.ok(formatted.includes('**Reflection**'));
    assert.ok(formatted.includes('**Reset cue**'));
});

test('briefing summary reports TickTick fetch failure and still delivers fallback output', () => {
    const context = {
        ...buildSummaryResolvedStateFixture(),
        ticktickFetchFailed: true
    };

    const result = composeBriefingSummary({
        context,
        activeTasks: [],
        rankingResult: null
    });

    assert.equal(result.summary.focus, 'No active tasks right now.');
    assert.ok(result.summary.notices.some((notice) => notice.code === 'delivery_context'));
    assert.ok(result.formattedText.includes('MORNING BRIEFING'));
});

test('briefing summary keeps degraded recommendations intentionally minimal', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks, { degraded: true });
    const context = buildSummaryResolvedStateFixture();

    const result = composeBriefingSummary({
        context,
        activeTasks,
        rankingResult
    });

    assert.equal(result.summary.priorities.length, 0);
    assert.equal(result.summary.why_now.length, 0);
    assert.ok(!result.formattedText.includes('**Top priorities**'));
});

test('daily briefing output is deterministic for fixed input', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture();

    const first = composeBriefingSummary({ context, activeTasks, rankingResult });
    const second = composeBriefingSummary({ context, activeTasks, rankingResult });

    assert.deepEqual(second.summary, first.summary);
    assert.equal(second.formattedText, first.formattedText);
});

test('weekly summary handles empty partial and full week scenarios', () => {
    const context = {
        ...buildSummaryResolvedStateFixture(),
        kind: 'weekly'
    };
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);

    const emptyWeek = composeWeeklySummary({
        context,
        activeTasks: [],
        processedHistory: [],
        historyAvailable: true,
        rankingResult: { ranked: [] }
    });
    const partialWeek = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory: buildSummaryProcessedHistoryFixture({ variant: 'sparse' }),
        historyAvailable: true,
        rankingResult
    });
    const fullWeek = composeWeeklySummary({
        context,
        activeTasks,
        processedHistory: buildSummaryProcessedHistoryFixture(),
        historyAvailable: true,
        rankingResult
    });

    assert.equal(Array.isArray(emptyWeek.summary.progress), true);
    assert.ok(partialWeek.summary.carry_forward.length >= 1);
    assert.ok(fullWeek.summary.progress.length >= partialWeek.summary.progress.length);
});

test('daily close handles zero-activity and high-activity days', () => {
    const context = buildSummaryResolvedStateFixture({ kind: 'daily_close' });
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);

    const zeroActivity = composeDailyCloseSummary({
        context,
        activeTasks,
        processedHistory: [],
        rankingResult
    });
    const highActivity = composeDailyCloseSummary({
        context,
        activeTasks,
        processedHistory: buildDailyCloseProcessedHistoryFixture({ variant: 'meaningful' }),
        rankingResult
    });

    assert.equal(typeof zeroActivity.summary.reflection, 'string');
    assert.match(highActivity.summary.reflection, /meaningful work/i);
});

test('formatNotices joins lines with newline (not bullet dashes)', () => {
    const notices = [
        { message: 'TickTick sync delayed', severity: 'warning' },
        { message: '3 tasks rescheduled', severity: 'info' }
    ];
    const result = formatNotices(notices);
    assert.equal(result, '⚠️ **TickTick sync delayed**\nℹ️ 3 tasks rescheduled');
    assert.doesNotMatch(result, /^- /m, 'notices must not have dash prefix');
});

test('formatNotices handles empty or missing input', () => {
    assert.equal(formatNotices([]), '');
    assert.equal(formatNotices(), '');
    assert.equal(formatNotices(null), '');
    assert.equal(formatNotices([{ message: '', severity: 'info' }]), '');
});

test('composeBriefingSummary deduplicates modelSummary priorities by task_id', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture();
    const modelSummary = {
        focus: 'Test dedup focus',
        priorities: [
            {
                task_id: activeTasks[0].id,
                title: 'First occurrence',
                rationale_text: 'Should be kept'
            },
            {
                task_id: activeTasks[1].id,
                title: 'Unique task',
                rationale_text: 'Unique entry'
            },
            {
                task_id: activeTasks[0].id,
                title: 'Duplicate of first',
                rationale_text: 'Should be dropped'
            }
        ],
        why_now: [],
        start_now: '',
        notices: []
    };

    const result = composeBriefingSummary({
        context,
        activeTasks,
        rankingResult,
        modelSummary
    });

    // Only 2 unique task_ids should survive dedup (plus possible fallback fill)
    const taskIds = result.summary.priorities.map((p) => p.task_id);
    const uniqueTaskIds = new Set(taskIds);
    assert.ok(uniqueTaskIds.has(activeTasks[0].id));
    assert.ok(uniqueTaskIds.has(activeTasks[1].id));
    assert.equal(uniqueTaskIds.size, taskIds.length, 'no duplicate task_id in priorities');
});

test('composeBriefingSummary filters out modelSummary priorities with invalid task_ids', () => {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture();
    const phantomId = 'nonexistent-task-id';
    const modelSummary = {
        focus: 'Test validation focus',
        priorities: [
            {
                task_id: activeTasks[0].id,
                title: 'Real task',
                rationale_text: 'This task exists'
            },
            {
                task_id: phantomId,
                title: 'Phantom task',
                rationale_text: 'This task does not exist'
            }
        ],
        why_now: [],
        start_now: '',
        notices: []
    };

    const result = composeBriefingSummary({
        context,
        activeTasks,
        rankingResult,
        modelSummary
    });

    // Phantom task_id must be filtered out entirely
    assert.equal(result.summary.priorities.some((p) => p.task_id === phantomId), false);
    // Real task_id should still appear (possibly with fallback fill)
    assert.ok(result.summary.priorities.some((p) => p.task_id === activeTasks[0].id));
});

test('/briefing command attaches "Show more" inline keyboard button', async () => {
    const handlers = { commands: new Map(), callbacks: [], events: [] };
    const bot = {
        command(name, handler) {
            handlers.commands.set(name, handler);
            return this;
        },
        callbackQuery(pattern, handler) {
            handlers.callbacks.push({ pattern, handler });
            return this;
        },
        on(eventName, handler) {
            handlers.events.push({ eventName, handler });
            return this;
        }
    };

    const summaryCalls = [];
    const orderedTasks = [
        { id: 'bt1', title: 'Briefing task 1', priority: 5, dueDate: null },
        { id: 'bt2', title: 'Briefing task 2', priority: 3, dueDate: null }
    ];
    const ranking = {
        ranked: [
            { taskId: 'bt1', score: 9, rationaleText: 'Core goal alignment' },
            { taskId: 'bt2', score: 5, rationaleText: 'Some rationale' }
        ]
    };

    registerCommands(
        bot,
        {
            isAuthenticated: () => true,
            getCacheAgeSeconds: () => null,
            getAuthUrl: () => 'https://example.test/auth',
            getAllTasks: async () => [],
            getAllTasksCached: async () => [],
            getLastFetchedProjects: () => []
        },
        {
            isQuotaExhausted: () => false,
            quotaResumeTime: () => null,
            activeKeyInfo: () => null,
            generateDailyBriefingSummary: async (_tasks, options) => {
                summaryCalls.push(options);
                return {
                    formattedText: '**☀️ MORNING BRIEFING**\n\n**Focus**: Test focus',
                    orderedTasks,
                    ranking
                };
            }
        },
        {
            listActiveTasks: async () => [],
            listProjects: async () => []
        },
        {}
    );

    const briefingHandler = handlers.commands.get('briefing');
    assert.equal(typeof briefingHandler, 'function');

    const replyOpts = [];
    const userId = AUTHORIZED_CHAT_ID || `briefing-showmore-${Date.now()}`;
    await briefingHandler({
        chat: { id: userId },
        from: { id: userId },
        reply: async (msg, opts) => { replyOpts.push({ msg, opts }); }
    });

    // Verify options include keyboard
    assert(replyOpts.length > 0, 'should have replied');
    const lastReply = replyOpts[replyOpts.length - 1];
    assert(lastReply.opts, 'should have options');
    assert(lastReply.opts.reply_markup, 'should have reply_markup with keyboard');

    // Verify store has expansion data
    const expansion = store.getPendingBriefingExpansion();
    assert(expansion, 'should store briefing expansion data');
    assert.equal(expansion.kind, 'briefing');
    assert.equal(expansion.orderedTasks.length, 2);
    assert.equal(expansion.ranking.length, 2);
    assert(expansion.expansionId, 'should have expansionId');

    // Clean up
    await store.clearPendingBriefingExpansion();
});
