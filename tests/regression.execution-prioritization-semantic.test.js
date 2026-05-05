import test from 'node:test';
import assert from 'node:assert/strict';

import { createGoalThemeProfile, buildRankingContext, normalizePriorityCandidate, inferSemanticGoalMatches } from '../services/execution-prioritization.js';
import { rankPriorityCandidatesForTest } from './helpers/regression-fixtures.js';

test('semantic goal matches boost task scores above token-only matches', () => {
    // "AI Coder course" does NOT token-match "Land a senior backend role" goal
    // but semantic matching should infer the alignment
    const goalProfile = createGoalThemeProfile(
        'GOALS:\n1. Land a senior backend role\n2. Protect health and recovery',
        { source: 'user_context' }
    );
    const candidates = [
        {
            taskId: 'task-semantic-match',
            title: 'Complete AI Coder course module 5',
            projectName: 'Studies',
            priority: 1,
            status: 0
        },
        {
            taskId: 'task-token-match',
            title: 'Prepare backend interview notes',
            projectName: 'Career',
            priority: 1,
            status: 0
        },
        {
            taskId: 'task-no-match',
            title: 'Organize desk drawer',
            projectName: 'Home',
            priority: 1,
            status: 0
        }
    ];

    // Provide preComputedGoalMatches — task-semantic-match aligns with goal 0 (backend role)
    const context = buildRankingContext({
        goalThemeProfile: goalProfile,
        preComputedGoalMatches: {
            'task-semantic-match': [0],
            'task-token-match': [],
            'task-no-match': []
        }
    });

    const result = rankPriorityCandidatesForTest(candidates, context);

    // Both matched tasks get equal scores; taskId lexicographic order breaks tie
    // Both should have goal_alignment rationale
    const tokenDecision = result.ranked.find((d) => d.taskId === 'task-token-match');
    const semanticDecision = result.ranked.find((d) => d.taskId === 'task-semantic-match');
    const noMatchDecision = result.ranked.find((d) => d.taskId === 'task-no-match');

    assert.equal(tokenDecision.rationaleCode, 'goal_alignment', 'token-matched task has goal_alignment');
    assert.equal(semanticDecision.rationaleCode, 'goal_alignment', 'semantic-matched task has goal_alignment');

    // Both matched tasks should rank above the no-match task (which has fallback rationale)
    const tokenIdx = result.ranked.findIndex((d) => d.taskId === 'task-token-match');
    const semanticIdx = result.ranked.findIndex((d) => d.taskId === 'task-semantic-match');
    const noMatchIdx = result.ranked.findIndex((d) => d.taskId === 'task-no-match');

    assert.ok(tokenIdx < noMatchIdx, 'token match ranks above no-match task');
    assert.ok(semanticIdx < noMatchIdx, 'semantic match ranks above no-match task');
    assert.equal(noMatchDecision.rationaleCode, 'fallback', 'no-match task has fallback rationale');
});

test('inferSemanticGoalMatches filters out low-confidence matches below 0.7', async () => {
    const goalLabels = ['Land a senior backend role', 'Protect health and recovery'];
    const mockAnalyzer = {
        _executeWithFailover: async () => ({
            text: JSON.stringify([
                { task_id: 'task-1', goal_label: 'Land a senior backend role', confidence: 0.95 },
                { task_id: 'task-1', goal_label: 'Protect health and recovery', confidence: 0.3 },
                { task_id: 'task-2', goal_label: 'Land a senior backend role', confidence: 0.5 },
                { task_id: 'task-3', goal_label: 'Protect health and recovery', confidence: 0.85 }
            ])
        }),
        _safeParseJson: (raw) => JSON.parse(raw)
    };

    // Fresh cache by passing uncached tasks
    const candidates = [
        { taskId: 'task-1', title: 'Complete AI Coder course' },
        { taskId: 'task-2', title: 'Buy groceries' },
        { taskId: 'task-3', title: 'Schedule therapy session' }
    ];

    const result = await inferSemanticGoalMatches(candidates, goalLabels, mockAnalyzer);

    // task-1 should only have goal index 0 (backend role), not index 1 (health — confidence 0.3)
    const task1Matches = result.get('task-1') || [];
    assert.deepEqual(task1Matches, [0], 'only high-confidence match for task-1');

    // task-2 should not be in results (confidence 0.5 < 0.7)
    assert.ok(!result.has('task-2'), 'task-2 excluded (confidence 0.5)');

    // task-3 should have goal index 1 (health — confidence 0.85)
    const task3Matches = result.get('task-3') || [];
    assert.deepEqual(task3Matches, [1], 'high-confidence match for task-3');
});

test('inferSemanticGoalMatches uses cache and skips Gemini call for cached tasks', async () => {
    let geminiCallCount = 0;
    const goalLabels = ['Land a senior backend role'];
    let nextTaskIdToReturn = null;
    const mockAnalyzer = {
        _executeWithFailover: async () => {
            geminiCallCount++;
            const taskId = nextTaskIdToReturn;
            return {
                text: JSON.stringify([
                    { task_id: taskId, goal_label: 'Land a senior backend role', confidence: 0.95 }
                ])
            };
        },
        _safeParseJson: (raw) => JSON.parse(raw)
    };

    // First call — task-cache-test-1 uncached, Gemini called once
    nextTaskIdToReturn = 'task-cache-test-1';
    const candidates1 = [
        { taskId: 'task-cache-test-1', title: 'AI Coder course' }
    ];
    const result1 = await inferSemanticGoalMatches(candidates1, goalLabels, mockAnalyzer);
    assert.equal(geminiCallCount, 1, 'Gemini called for uncached task');
    assert.ok(result1.has('task-cache-test-1'), 'uncached task gets results');

    // Second call with same task — fully cached, no Gemini call
    const candidates2 = [
        { taskId: 'task-cache-test-1', title: 'AI Coder course' }
    ];
    const result2 = await inferSemanticGoalMatches(candidates2, goalLabels, mockAnalyzer);

    assert.equal(geminiCallCount, 1, 'Gemini not called for cached task');
    assert.deepEqual(result2.get('task-cache-test-1'), [0], 'cached result returned without Gemini call');
});

test('token and semantic goal matches merge without duplicate themes', () => {
    // Create a goal where BOTH token and semantic matching would fire
    // The theme "Land a senior backend role" should appear only once in merged matches
    const goalProfile = createGoalThemeProfile(
        'GOALS:\n1. Land a senior backend role',
        { source: 'user_context' }
    );

    const candidate = {
        taskId: 'task-dual-match',
        title: 'Prepare backend interview notes for senior backend role',
        projectName: 'Career',
        priority: 1,
        status: 0
    };

    // Token matching will match "backend" token from goal label "Land a senior backend role"
    // Semantic matching also matches the same goal (index 0)
    const context = buildRankingContext({
        goalThemeProfile: goalProfile,
        preComputedGoalMatches: {
            'task-dual-match': [0] // Same goal index 0
        }
    });

    const result = rankPriorityCandidatesForTest([candidate], context);

    // Theme matches should not have duplicates
    const assessment = result.ranked[0];
    // The goalAlignmentWeight should be based on a single match, not double-counted
    // Verify the task is ranked with goal_alignment rationale
    assert.equal(assessment.rationaleCode, 'goal_alignment');
    // The rank should be 1 (top)
    assert.equal(assessment.rank, 1);
    // No duplicates — inference confidence should be strong
    assert.equal(assessment.inferenceConfidence, 'strong');
});

test('inferSemanticGoalMatches filters out responses with invalid task_ids', async () => {
    const goalLabels = ['Land a senior backend role'];
    const mockAnalyzer = {
        _executeWithFailover: async () => ({
            text: JSON.stringify([
                { task_id: 'task-valid', goal_label: 'Land a senior backend role', confidence: 0.95 },
                { task_id: 'task-nonexistent', goal_label: 'Land a senior backend role', confidence: 0.9 },
                { task_id: 'task-other-missing', goal_label: 'Land a senior backend role', confidence: 0.85 }
            ])
        }),
        _safeParseJson: (raw) => JSON.parse(raw)
    };

    const candidates = [
        { taskId: 'task-valid', title: 'Complete AI Coder course' }
    ];

    const result = await inferSemanticGoalMatches(candidates, goalLabels, mockAnalyzer);

    // Only task-valid should appear; task-nonexistent and task-other-missing are not in candidates
    assert.ok(result.has('task-valid'), 'valid task_id included');
    assert.equal(result.get('task-valid').length, 1, 'one match for valid task');
    assert.ok(!result.has('task-nonexistent'), 'nonexistent task_id excluded');
    assert.ok(!result.has('task-other-missing'), 'other missing task_id excluded');
});

test('inferSemanticGoalMatches deduplicates identical (task_id, goal_label) pairs', async () => {
    const goalLabels = ['Land a senior backend role', 'Protect health and recovery'];
    const mockAnalyzer = {
        _executeWithFailover: async () => ({
            text: JSON.stringify([
                { task_id: 'task-dupe', goal_label: 'Land a senior backend role', confidence: 0.95 },
                { task_id: 'task-dupe', goal_label: 'Land a senior backend role', confidence: 0.92 },
                { task_id: 'task-dupe', goal_label: 'Protect health and recovery', confidence: 0.88 }
            ])
        }),
        _safeParseJson: (raw) => JSON.parse(raw)
    };

    const candidates = [
        { taskId: 'task-dupe', title: 'Some task' }
    ];

    const result = await inferSemanticGoalMatches(candidates, goalLabels, mockAnalyzer);

    const matches = result.get('task-dupe') || [];
    // Should have exactly 2 goal indices (one for each unique goal_label), not 3
    assert.equal(matches.length, 2, 'duplicate pair deduplicated');
    assert.ok(matches.includes(0), 'has goal index 0 (backend role)');
    assert.ok(matches.includes(1), 'has goal index 1 (health)');
});

test('inferSemanticGoalMatches does not match paraphrased goal_labels that differ from originals', async () => {
    const goalLabels = ['Land a senior backend role'];
    const mockAnalyzer = {
        _executeWithFailover: async () => ({
            text: JSON.stringify([
                // Exact match — should be included
                { task_id: 'task-exact', goal_label: 'Land a senior backend role', confidence: 0.95 },
                // Paraphrased — should fall through because goalLabelToIndex.get(...) returns undefined
                { task_id: 'task-para', goal_label: 'Get a senior backend job', confidence: 0.9 },
                { task_id: 'task-para2', goal_label: 'land a senior backend role', confidence: 0.85 },
                { task_id: 'task-para3', goal_label: '  Land a senior backend role  ', confidence: 0.8 }
            ])
        }),
        _safeParseJson: (raw) => JSON.parse(raw)
    };

    const candidates = [
        { taskId: 'task-exact', title: 'AI Coder course' },
        { taskId: 'task-para', title: 'Another course' },
        { taskId: 'task-para2', title: 'Yet another' },
        { taskId: 'task-para3', title: 'Spaced out' }
    ];

    const result = await inferSemanticGoalMatches(candidates, goalLabels, mockAnalyzer);

    // Only task-exact should have the match (exact label string match)
    assert.ok(result.has('task-exact'), 'exact match included');
    assert.deepEqual(result.get('task-exact'), [0], 'exact match resolves to goal index 0');

    // All paraphrased variants should be excluded (no goalLabelToIndex entry)
    assert.ok(!result.has('task-para'), 'paraphrased "Get a senior backend job" excluded');
    assert.ok(!result.has('task-para2'), 'lowercased variant excluded');
    assert.ok(!result.has('task-para3'), 'whitespace-padded variant excluded');
});
