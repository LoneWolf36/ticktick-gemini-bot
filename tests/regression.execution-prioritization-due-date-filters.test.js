import test from 'node:test';
import assert from 'node:assert/strict';

import { createGoalThemeProfile, buildRankingContext, normalizePriorityCandidate } from '../services/execution-prioritization.js';
import { rankPriorityCandidatesForTest } from './helpers/regression-fixtures.js';

test('ranking filter drops tasks with invalid dueDate (NaN parse)', () => {
    const candidates = [
        normalizePriorityCandidate({
            id: 'task-invalid-date',
            title: 'Invalid date task',
            projectName: 'Career',
            dueDate: 'not-a-date',
            status: 0
        }),
        normalizePriorityCandidate({
            id: 'task-valid',
            title: 'Valid task',
            projectName: 'Career',
            dueDate: '2026-05-10T12:00:00Z',
            status: 0
        })
    ];
    const context = buildRankingContext({
        goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
        nowIso: '2026-05-04T12:00:00Z'
    });

    const result = rankPriorityCandidatesForTest(candidates, context);

    const rankedIds = result.ranked.map((d) => d.taskId);
    assert.ok(!rankedIds.includes('task-invalid-date'), 'task with invalid dueDate should be dropped');
    assert.ok(rankedIds.includes('task-valid'), 'task with valid dueDate should be included');
});

test('ranking filter keeps tasks due exactly at 14-day boundary', () => {
    const nowIso = '2026-05-04T12:00:00Z';
    const candidates = [
        normalizePriorityCandidate({
            id: 'task-boundary',
            title: 'Boundary task',
            projectName: 'Career',
            dueDate: '2026-05-18T12:00:00Z', // Exactly 14 days from now
            status: 0
        })
    ];
    const context = buildRankingContext({
        goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
        nowIso
    });

    const result = rankPriorityCandidatesForTest(candidates, context);

    const rankedIds = result.ranked.map((d) => d.taskId);
    assert.ok(rankedIds.includes('task-boundary'), 'task due exactly at 14-day boundary should be kept');
});

test('ranking filter keeps tasks with empty string dueDate', () => {
    const candidates = [
        normalizePriorityCandidate({
            id: 'task-empty-date',
            title: 'Empty date task',
            projectName: 'Admin',
            dueDate: '',
            status: 0
        })
    ];
    const context = buildRankingContext({
        goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
        nowIso: '2026-05-04T12:00:00Z'
    });

    const result = rankPriorityCandidatesForTest(candidates, context);

    const rankedIds = result.ranked.map((d) => d.taskId);
    assert.ok(rankedIds.includes('task-empty-date'), 'task with empty dueDate should be kept');
});
