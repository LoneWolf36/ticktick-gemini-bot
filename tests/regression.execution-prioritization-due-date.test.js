import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRankingContext, createGoalThemeProfile, normalizePriorityCandidate } from '../services/execution-prioritization.js';
import { rankPriorityCandidatesForTest } from './helpers/regression-fixtures.js';

test('execution prioritization boosts tasks due today above overdue same-priority tasks', () => {
    const nowIso = '2026-05-05T10:00:00Z';
    const context = buildRankingContext({
        goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
        nowIso
    });
    const candidates = [
        normalizePriorityCandidate({
            id: 'task-due-today-p1',
            title: 'Submit timesheet',
            projectName: 'Admin',
            priority: 1,
            dueDate: '2026-05-05',
            status: 0
        }),
        normalizePriorityCandidate({
            id: 'task-overdue-p1',
            title: 'Pay electricity bill',
            projectName: 'Admin',
            priority: 1,
            dueDate: '2026-05-03',
            status: 0
        }),
        normalizePriorityCandidate({
            id: 'task-due-today-p3',
            title: 'Review project proposal',
            projectName: 'Career',
            priority: 3,
            dueDate: '2026-05-05',
            status: 0
        })
    ];

    const result = rankPriorityCandidatesForTest(candidates, context);

    const todayP1 = result.ranked.find((d) => d.taskId === 'task-due-today-p1');
    const overdueP1 = result.ranked.find((d) => d.taskId === 'task-overdue-p1');
    const todayP3 = result.ranked.find((d) => d.taskId === 'task-due-today-p3');

    const idxTodayP1 = result.ranked.indexOf(todayP1);
    const idxOverdueP1 = result.ranked.indexOf(overdueP1);
    assert.ok(idxTodayP1 < idxOverdueP1);

    const idxTodayP3 = result.ranked.indexOf(todayP3);
    assert.ok(idxTodayP3 < idxTodayP1);

    assert.ok(todayP1.rank < overdueP1.rank);
});
