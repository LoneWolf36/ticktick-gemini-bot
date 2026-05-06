import test from 'node:test';
import assert from 'node:assert/strict';

import { GeminiAnalyzer } from '../services/gemini.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import * as store from '../services/store.js';
import {
    buildSummaryResolvedStateFixture,
    buildSummaryRankingFixture,
    buildWeeklySummaryFixture,
    buildSummaryActiveTasksFixture,
    buildDailyCloseProcessedHistoryFixture
} from './helpers/regression-fixtures.js';
import { createPipelineHarness } from './pipeline-harness.js';
import { composeBriefingSummary, composeDailyCloseSummary, formatSummary } from '../services/summary-surfaces/index.js';

test('composeBriefingSummary keeps the daily plan to 3 tasks and preserves plausible goal work', () => {
    const activeTasks = [
        ...buildSummaryActiveTasksFixture(),
        {
            id: 'task-busywork',
            title: 'Organize desktop icons',
            projectId: 'admin',
            projectName: 'Admin',
            priority: 0,
            dueDate: null,
            status: 0
        }
    ];
    const rankingResult = {
        ranked: [
            {
                taskId: 'task-focus',
                rationaleCode: 'goal_alignment',
                rationaleText: 'Directly moves the highest-priority goal.'
            },
            {
                taskId: 'task-support',
                rationaleCode: 'urgency',
                rationaleText: 'Time-bound execution window is closing.'
            },
            {
                taskId: 'task-admin',
                rationaleCode: 'capacity_protection',
                rationaleText: 'Protects important admin follow-through.'
            },
            {
                taskId: 'task-busywork',
                rationaleCode: 'fallback',
                rationaleText: 'Possible next candidate under degraded goal context.'
            }
        ],
        topRecommendation: {
            taskId: 'task-focus',
            rationaleCode: 'goal_alignment',
            rationaleText: 'Directly moves the highest-priority goal.'
        },
        degraded: false,
        degradedReason: null,
        context: { workStyleMode: store.MODE_STANDARD, urgentMode: false, stateSource: 'fixture' }
    };
    const result = composeBriefingSummary({
        context: buildSummaryResolvedStateFixture({ kind: 'briefing', workStyleMode: store.MODE_STANDARD }),
        activeTasks,
        rankingResult
    });
    assert.equal(result.summary.priorities.length, 3);
    assert.ok(result.summary.priorities.some((item) => item.task_id === 'task-focus'));
    assert.equal(result.summary.priorities.some((item) => item.task_id === 'task-busywork'), false);
});

test('composeBriefingSummary says no relevant tasks concisely instead of inventing work', () => {
    const result = composeBriefingSummary({ context: buildSummaryResolvedStateFixture({ kind: 'briefing', workStyleMode: store.MODE_STANDARD }), activeTasks: [], rankingResult: buildSummaryRankingFixture([], { degraded: true }) });
    assert.equal(result.summary.priorities.length, 0);
    assert.equal(result.summary.focus, 'No active tasks right now.');
});

test('formatSummary adapts daily close verbosity by work-style mode', () => {
    const summary = { stats: ['Completed: 2', 'Skipped: 1', 'Dropped: 0', 'Still open: 3'], reflection: 'Today was mixed.', reset_cue: 'Tomorrow’s restart.', notices: [{ code: 'delivery_context', message: 'Keep it factual.', severity: 'info', evidence_source: 'system' }] };
    const standard = formatSummary({ kind: 'daily_close', summary, context: buildSummaryResolvedStateFixture({ kind: 'daily_close', workStyleMode: store.MODE_STANDARD }) }).text;
    const urgent = formatSummary({ kind: 'daily_close', summary, context: buildSummaryResolvedStateFixture({ kind: 'daily_close', workStyleMode: store.MODE_URGENT }) }).text;
    assert.match(standard, /\*\*Stats\*\*/);
    assert.doesNotMatch(urgent, /\*\*Stats\*\*/);
});

test('formatSummary keeps weekly default compact in standard mode and shortens in urgent mode', () => {
    const summary = buildWeeklySummaryFixture();
    const standard = formatSummary({ kind: 'weekly', summary, context: buildSummaryResolvedStateFixture({ kind: 'weekly', workStyleMode: store.MODE_STANDARD }) }).text;
    const urgent = formatSummary({ kind: 'weekly', summary, context: buildSummaryResolvedStateFixture({ kind: 'weekly', workStyleMode: store.MODE_URGENT }) }).text;
    assert.match(standard, /\*\*Carry forward\*\*/);
    assert.doesNotMatch(urgent, /\*\*Carry forward\*\*/);
});

test('pipeline shortens urgent confirmations and clarification prompts while keeping errors clear', async () => {
    const creationHarness = createPipelineHarness({ intents: [{ type: 'create', title: 'Buy groceries', confidence: 0.9, projectHint: 'Career' }] });
    const standardTask = await creationHarness.processMessage('buy groceries', { workStyleMode: store.MODE_STANDARD });
    const urgentTask = await creationHarness.processMessage('buy groceries', { workStyleMode: store.MODE_URGENT });
    assert.equal(standardTask.confirmationText, 'Created: Buy groceries');
    assert.equal(urgentTask.confirmationText, 'Buy groceries');
});

test('GeminiAnalyzer _buildTierChain parses string fallbacks into chain', () => {
    const analyzer = new GeminiAnalyzer(['dummy-key']);
    assert.deepEqual(analyzer._buildTierChain('gemini-2.5-pro', 'gemini-2.5-flash'), ['gemini-2.5-pro', 'gemini-2.5-flash']);
});

test('GeminiAnalyzer advanced tier includes gemini-2.5-flash fallback by default', () => {
    const analyzer = new GeminiAnalyzer(['dummy-key']);
    assert.equal(analyzer._modelTiers.advanced[0], 'gemini-2.5-pro');
    assert.ok(analyzer._modelTiers.advanced.includes('gemini-2.5-flash'));
});

test('GeminiAnalyzer _executeWithFailover falls back to flash when all keys exhausted on pro', async () => {
    const analyzer = new GeminiAnalyzer(['dummy-key-1', 'dummy-key-2']);
    const calledModels = [];
    analyzer._modelTiers.advanced = ['gemini-2.5-pro', 'gemini-2.5-flash'];
    await assert.rejects(() => analyzer._executeWithFailover('test prompt', async (_ai, _prompt, model) => { calledModels.push(model); const err = new Error('Daily quota exhausted'); err.status = 429; throw err; }, { modelTier: 'advanced' }), () => calledModels.includes('gemini-2.5-pro') && calledModels.includes('gemini-2.5-flash'));
});

test('TickTickAdapter updateTask treats timezone-equivalent dueDate values as no-op', async () => {
    const client = Object.create(TickTickClient.prototype);
    client.getTask = async () => ({ id: 'task-tz-001', projectId: 'proj-tz-001', title: 'Test task', content: '', priority: 1, dueDate: '2026-04-30T23:59:00.000+0100', repeatFlag: null, status: 0 });
    client.updateTask = async (_taskId, payload) => ({ id: 'task-tz-001', projectId: 'proj-tz-001', ...payload });
    const adapter = new TickTickAdapter(client);
    await assert.rejects(
        () => adapter.updateTask('task-tz-001', { originalProjectId: 'proj-tz-001', dueDate: '2026-04-30T22:59:00.000+0000' }),
        /changed field|VALIDATION_ERROR/
    );
});
