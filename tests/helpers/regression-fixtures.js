import assert from 'node:assert/strict';
import * as store from '../../services/store.js';
import * as executionPrioritization from '../../services/execution-prioritization.js';

// Search before add. Extend nearby table-driven case before new test block.
export function rankPriorityCandidatesForTest(candidates, context) {
    assert.equal(typeof executionPrioritization.rankPriorityCandidates, 'function');

    try {
        return executionPrioritization.rankPriorityCandidates(candidates, context);
    } catch (error) {
        if (!(error instanceof TypeError)) {
            throw error;
        }
    }

    return executionPrioritization.rankPriorityCandidates({ candidates, context });
}

export function buildSummaryActiveTasksFixture({ variant = 'normal' } = {}) {
    const base = [
        {
            id: 'task-focus',
            title: 'Ship weekly architecture PR',
            projectId: 'career',
            projectName: 'Career',
            priority: 5,
            dueDate: '2026-03-12',
            status: 0
        },
        {
            id: 'task-support',
            title: 'Prepare system design notes',
            projectId: 'career',
            projectName: 'Career',
            priority: 3,
            dueDate: '2026-03-14',
            status: 0
        },
        {
            id: 'task-admin',
            title: 'Pay rent',
            projectId: 'admin',
            projectName: 'Admin',
            priority: 1,
            dueDate: '2026-03-10',
            status: 0
        }
    ];

    if (variant === 'sparse') {
        return [base[0]];
    }

    if (variant === 'degraded-ranking') {
        return base.map((task) => ({ ...task, priority: 0 }));
    }

    return base;
}

export function buildSummaryProcessedHistoryFixture({ variant = 'normal' } = {}) {
    const base = [
        {
            taskId: 'hist-1',
            originalTitle: 'Completed resume update',
            approved: true,
            skipped: false,
            dropped: false,
            reviewedAt: '2026-03-11T09:00:00Z',
            sentAt: '2026-03-11T09:05:00Z',
            suggestedPriority: 5,
            priorityEmoji: '🔴'
        },
        {
            taskId: 'hist-2',
            originalTitle: 'Deferred mock interview',
            approved: false,
            skipped: true,
            dropped: false,
            reviewedAt: '2026-03-11T09:10:00Z',
            sentAt: '2026-03-11T09:15:00Z',
            suggestedPriority: 3,
            priorityEmoji: '🟡'
        }
    ];

    if (variant === 'sparse') {
        return [base[0]];
    }

    if (variant === 'missing') {
        return [];
    }

    if (variant === 'repeated_ignored') {
        return [
            {
                taskId: 'hist-repeat-1',
                originalTitle: 'Skipped architecture draft',
                approved: false,
                skipped: true,
                dropped: false,
                reviewedAt: '2026-03-11T09:00:00Z',
                sentAt: '2026-03-11T09:05:00Z'
            },
            {
                taskId: 'hist-repeat-2',
                originalTitle: 'Dropped interview practice',
                approved: false,
                skipped: false,
                dropped: true,
                reviewedAt: '2026-03-12T09:10:00Z',
                sentAt: '2026-03-12T09:15:00Z'
            },
            {
                taskId: 'hist-repeat-3',
                originalTitle: 'Skipped design follow-up',
                approved: false,
                skipped: true,
                dropped: false,
                reviewedAt: '2026-03-13T09:20:00Z',
                sentAt: '2026-03-13T09:25:00Z'
            }
        ];
    }

    return base;
}

export function buildSummaryResolvedStateFixture({
    kind = 'briefing',
    workStyleMode = store.MODE_STANDARD,
    urgentMode = workStyleMode === store.MODE_URGENT,
    entryPoint = 'manual_command'
} = {}) {
    return {
        kind,
        entryPoint,
        userId: 'summary-fixture-user',
        generatedAtIso: '2026-03-13T08:30:00Z',
        timezone: 'Europe/Dublin',
        workStyleMode,
        urgentMode,
        tonePolicy: 'preserve_existing'
    };
}

export function buildSummaryRankingFixture(activeTasks, { degraded = false } = {}) {
    const ranked = activeTasks.slice(0, 3).map((task, index) => ({
        taskId: task.id,
        rationaleCode: index === 0 ? 'goal_alignment' : 'urgency',
        rationaleText:
            index === 0 ? 'Directly moves the highest-priority goal.' : 'Time-bound execution window is closing.'
    }));

    return {
        ranked,
        topRecommendation: ranked[0] || null,
        degraded,
        degradedReason: degraded ? 'ranking inputs incomplete' : null,
        context: {
            urgentMode: false,
            workStyleMode: 'standard',
            stateSource: 'fixture'
        }
    };
}

export function buildDailySummaryFixture({ variant = 'normal' } = {}) {
    if (variant === 'empty') {
        return {
            focus: '',
            priorities: [],
            why_now: [],
            start_now: '',
            notices: []
        };
    }

    return {
        focus: 'Ship the architecture PR before lower-leverage tasks.',
        priorities: [
            {
                title: 'Ship weekly architecture PR',
                rationale_text: 'Directly moves the highest-priority goal.'
            },
            {
                title: 'Prepare system design notes',
                rationale_text: 'Interview rehearsal window is closing.'
            }
        ],
        why_now: ['Deadline is close.', 'Unblocks review feedback.'],
        start_now: 'Open the PR and list required changes.',
        notices: [
            { severity: 'info', message: 'Task list is sparse, so focus is tight.' },
            { severity: 'warning', message: 'Ranking inputs were incomplete.' }
        ]
    };
}

export function buildWeeklySummaryFixture({ variant = 'normal' } = {}) {
    if (variant === 'reduced') {
        return {
            progress: [],
            carry_forward: [],
            next_focus: [],
            watchouts: [],
            notices: [{ severity: 'warning', message: 'Processed-task history was unavailable.' }]
        };
    }

    return {
        progress: ['Completed architecture PR draft.', 'Closed the interview prep loop.'],
        carry_forward: [{ title: 'Finalize system design notes', reason: 'Needs explicit completion next week.' }],
        next_focus: ['Ship weekly architecture PR', 'Practice system design questions'],
        watchouts: [{ label: 'Overdue tasks accumulating', evidence: '2 active tasks are overdue right now.' }],
        notices: [{ severity: 'info', message: 'Active task set is sparse, so weekly recommendations are compact.' }]
    };
}

export function buildDailyCloseProcessedHistoryFixture({ variant = 'meaningful' } = {}) {
    if (variant === 'irregular') {
        return [
            {
                taskId: 'hist-irregular-1',
                originalTitle: 'Old review artifact',
                approved: true,
                skipped: false,
                dropped: false,
                reviewedAt: '2026-03-09T19:00:00Z'
            }
        ];
    }

    if (variant === 'mixed') {
        return [
            {
                taskId: 'hist-mixed-1',
                originalTitle: 'Completed daily anchor',
                approved: true,
                skipped: false,
                dropped: false,
                reviewedAt: '2026-03-13T18:10:00Z'
            },
            {
                taskId: 'hist-mixed-2',
                originalTitle: 'Skipped admin cleanup',
                approved: false,
                skipped: true,
                dropped: false,
                reviewedAt: '2026-03-13T19:10:00Z'
            }
        ];
    }

    if (variant === 'avoidance') {
        return [
            {
                taskId: 'hist-avoid-1',
                originalTitle: 'Skipped architecture work',
                approved: false,
                skipped: true,
                dropped: false,
                reviewedAt: '2026-03-13T18:00:00Z'
            },
            {
                taskId: 'hist-avoid-2',
                originalTitle: 'Dropped interview prep',
                approved: false,
                skipped: false,
                dropped: true,
                reviewedAt: '2026-03-13T19:00:00Z'
            }
        ];
    }

    if (variant === 'backoff') {
        return [
            {
                taskId: 'hist-backoff-1',
                originalTitle: 'Skipped architecture work',
                approved: false,
                skipped: true,
                dropped: false,
                reviewedAt: '2026-03-13T18:00:00Z'
            },
            {
                taskId: 'hist-backoff-2',
                originalTitle: 'Dropped interview prep',
                approved: false,
                skipped: false,
                dropped: true,
                reviewedAt: '2026-03-13T19:00:00Z'
            },
            {
                taskId: 'hist-backoff-3',
                originalTitle: 'Skipped portfolio revision',
                approved: false,
                skipped: true,
                dropped: false,
                reviewedAt: '2026-03-13T20:00:00Z'
            }
        ];
    }

    if (variant === 'sparse') {
        return [
            {
                taskId: 'hist-sparse-1',
                originalTitle: 'Light check-in only',
                approved: false,
                skipped: true,
                dropped: false,
                reviewedAt: '2026-03-13T20:00:00Z'
            }
        ];
    }

    return [
        {
            taskId: 'hist-day-1',
            originalTitle: 'Shipped architecture PR',
            approved: true,
            skipped: false,
            dropped: false,
            reviewedAt: '2026-03-13T18:00:00Z'
        },
        {
            taskId: 'hist-day-2',
            originalTitle: 'Closed design follow-up',
            approved: true,
            skipped: false,
            dropped: false,
            reviewedAt: '2026-03-13T19:00:00Z'
        }
    ];
}

export function buildDailyCloseSummaryFixture({ variant = 'normal' } = {}) {
    if (variant === 'sparse') {
        return {
            stats: ['Completed: 0', 'Skipped: 1', 'Dropped: 0', 'Still open: 1'],
            reflection: '',
            reset_cue: 'If today was disrupted or offline, restart tomorrow with one concrete task.',
            notices: [{ severity: 'info', message: 'The day has thin evidence, so this reflection stays minimal.' }]
        };
    }

    return {
        stats: ['Completed: 2', 'Skipped: 0', 'Dropped: 0', 'Still open: 3'],
        reflection: 'You moved meaningful work today. Keep the close-out factual and light.',
        reset_cue: 'Tomorrow’s restart: begin with “Ship weekly architecture PR” and finish the first executable step.',
        notices: [{ severity: 'info', message: 'The day has thin evidence, so this reflection stays minimal.' }]
    };
}
