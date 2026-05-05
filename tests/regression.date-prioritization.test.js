import test from 'node:test';
import assert from 'node:assert/strict';

import { getLocalDateKey, isSameLocalDate } from '../services/date-utils.js';
import { buildRankingContext, createGoalThemeProfile, normalizePriorityCandidate } from '../services/execution-prioritization.js';
import { rankPriorityCandidatesForTest } from './helpers/regression-fixtures.js';

test('date utilities resolve local date keys in Europe/Dublin without UTC drift', () => {
    const nowIso = '2026-05-05T13:00:00.000+0100';
    const dueDate = '2026-05-04T23:00:00.000+0000';

    assert.equal(getLocalDateKey(dueDate, 'Europe/Dublin'), '2026-05-05');
    assert.equal(getLocalDateKey(nowIso, 'Europe/Dublin'), '2026-05-05');
    assert.equal(isSameLocalDate(dueDate, nowIso, 'Europe/Dublin'), true);
    assert.equal(getLocalDateKey('not-a-date', 'Europe/Dublin'), null);
    assert.equal(isSameLocalDate('not-a-date', nowIso, 'Europe/Dublin'), false);
});

test('execution prioritization treats Dublin due dates as due today in local time only', () => {
    const candidates = [
        normalizePriorityCandidate({
            id: 'task-due-today',
            title: 'Complete one scenario of system design',
            dueDate: '2026-05-04T23:00:00.000+0000',
            status: 0
        }),
        normalizePriorityCandidate({
            id: 'task-no-due',
            title: 'Fix notes cleanup',
            status: 0
        })
    ];

    const context = buildRankingContext({
        goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
        nowIso: '2026-05-05T13:00:00.000+0100'
    });

    const result = rankPriorityCandidatesForTest(candidates, context);
    assert.equal(result.ranked[0].taskId, 'task-due-today');
    assert.equal(result.ranked[1].taskId, 'task-no-due');
    assert.equal(result.ranked[1].rationaleCode, 'fallback');
});
