import test from 'node:test';
import assert from 'node:assert/strict';

import { registerCommands } from '../bot/commands.js';
import * as store from '../services/store.js';

function createBotHarness() {
    const h = { commands: new Map(), callbacks: [], events: [] };
    const b = {
        command: (n, fn) => (h.commands.set(n, fn), b),
        callbackQuery: (p, fn) => (h.callbacks.push({ p, fn }), b),
        on: (e, fn) => (h.events.push({ e, fn }), b)
    };
    return { h, b };
}

test('registerCommands priority-aware advisory caps low-priority tasks at 2 and hides overflow', async () => {
    const { h, b } = createBotHarness();
    const axCalls = [];
    const tasks = [
        { id: 't1', title: 'High pri 1', dueDate: '2025-01-01T10:00:00.000Z', priority: 5, projectName: 'Career', status: 0 },
        { id: 't2', title: 'High pri 2', dueDate: '2025-01-02T10:00:00.000Z', priority: 4, projectName: 'Personal', status: 0 },
        { id: 't3', title: 'High pri 3', dueDate: '2025-01-03T10:00:00.000Z', priority: 3, projectName: 'Health', status: 0 },
        { id: 't4', title: 'Low pri 1', dueDate: '2025-01-04T10:00:00.000Z', priority: 1, projectName: 'Admin', status: 0 },
        { id: 't5', title: 'Low pri 2', dueDate: '2025-01-05T10:00:00.000Z', priority: 0, projectName: 'Errands', status: 0 },
        { id: 't6', title: 'Low pri 3 (hidden)', dueDate: '2025-01-06T10:00:00.000Z', priority: 2, projectName: 'Misc', status: 0 }
    ];
    const _pbt = async (_tasks) => {
        const ranked = _tasks.map((t, i) => ({ taskId: t.id, rank: i + 1, scoreBand: 'top', rationaleCode: 'goal_alignment', rationaleText: i === 0 ? 'First rationale' : '', inferenceConfidence: 'strong' }));
        const byId = new Map(_tasks.map((t) => [t.id, t]));
        return { ranking: { ranked }, orderedTasks: ranked.map((d) => byId.get(d.taskId)).filter(Boolean) };
    };
    registerCommands(b,
        { isAuthenticated: () => true, getCacheAgeSeconds: () => null, getAuthUrl: () => 'https://auth.test', getAllTasks: async () => [], getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
        { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null, _prepareBriefingTasks: _pbt },
        { listActiveTasks: async () => tasks, listProjects: async () => [] },
        { processMessage: async (m, o) => { axCalls.push({ m, o }); return { type: 'task' }; } }
    );
    const msgHandler = h.events.find((e) => e.e === 'message:text')?.fn || h.events.find((e) => e.eventName === 'message:text')?.handler;
    const replies = []; const userId = `adv-cap-${Date.now()}`;
    await msgHandler({ message: { text: 'what should I do today' }, chat: { id: userId }, from: { id: userId }, reply: async (msg) => { replies.push(msg); }, editMessageText: async () => {} });
    assert.equal(axCalls.length, 0, 'should NOT reach pipeline');
    assert(replies.some((r) => /<b>Next up \(5\)<\/b>/.test(r)), 'should show capped Next up count 5');
    assert(replies.some((r) => /High pri 1/.test(r)), 'should show high-priority task 1');
    assert(replies.some((r) => /High pri 2/.test(r)), 'should show high-priority task 2');
    assert(replies.some((r) => /High pri 3/.test(r)), 'should show high-priority task 3');
    assert(replies.some((r) => /Low pri 1/.test(r)), 'should show first low-priority task');
    assert(replies.some((r) => /Low pri 2/.test(r)), 'should show second low-priority task');
    assert(!replies.some((r) => /Low pri 3 \(hidden\)/.test(r)), 'should hide third low-priority task');
});

test('registerCommands advisory reply includes "Show more" inline keyboard button', async () => {
    const { h, b } = createBotHarness();
    const tasks = [
        { id: 't1', title: 'Write quarterly review', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
        { id: 't2', title: 'Buy groceries', projectId: 'p1', projectName: 'Personal', priority: 3, status: 0 }
    ];
    const _pbt = async (_tasks) => {
        const ranked = _tasks.map((t, i) => ({ taskId: t.id, rank: i + 1, scoreBand: 'top', rationaleCode: 'goal_alignment', rationaleText: i === 0 ? 'Core goal task' : '', inferenceConfidence: 'strong' }));
        const byId = new Map(_tasks.map((t) => [t.id, t]));
        return { ranking: { ranked }, orderedTasks: ranked.map((d) => byId.get(d.taskId)).filter(Boolean) };
    };
    const replyOpts = [];
    registerCommands(b,
        { isAuthenticated: () => true, getCacheAgeSeconds: () => null, getAuthUrl: () => 'https://auth.test', getAllTasks: async () => [], getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
        { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null, _prepareBriefingTasks: _pbt },
        { listActiveTasks: async () => tasks, listProjects: async () => [] },
        { processMessage: async () => ({ type: 'task' }) }
    );
    const msgHandler = h.events.find((e) => e.e === 'message:text')?.fn || h.events.find((e) => e.eventName === 'message:text')?.handler;
    const userId = `adv-showmore-${Date.now()}`;
    await msgHandler({
        message: { text: 'what should I do today' },
        chat: { id: userId },
        from: { id: userId },
        reply: async (msg, opts) => { replyOpts.push({ msg, opts }); },
        editMessageText: async () => {}
    });

    assert(replyOpts.length > 0, 'should have replied');
    const lastReply = replyOpts[replyOpts.length - 1];
    assert(lastReply.opts || lastReply.extra, 'should have options with keyboard');
    assert(lastReply.opts.reply_markup, 'should have reply_markup');

    const expansion = store.getPendingBriefingExpansion();
    assert(expansion, 'should store briefing expansion');
    assert.equal(expansion.kind, 'advisory');
    assert.equal(expansion.orderedTasks.length, 2);
    assert.equal(expansion.ranking.length, 2);
    assert(expansion.expansionId, 'should have expansionId');

    const inlineKeyboard = lastReply.opts.reply_markup;
    assert(inlineKeyboard, 'inline keyboard should be present');
    await store.clearPendingBriefingExpansion();
});

test('registerCommands prevents duplicate concurrent briefing generation per chat', async () => {
    const { h, b } = createBotHarness();
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    registerCommands(b,
        { isAuthenticated: () => true, getCacheAgeSeconds: () => null, getAuthUrl: () => 'https://auth.test', getAllTasks: async () => [], getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
        { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null, generateDailyBriefingSummary: async () => { calls += 1; await gate; return { orderedTasks: [], ranking: { ranked: [] }, formattedText: 'done' }; } },
        { listActiveTasks: async () => [], listProjects: async () => [] },
        { processMessage: async () => ({ type: 'task' }) }
    );
    const briefingHandler = h.commands.get('briefing');
    const replies = [];
    const ctx = { chat: { id: 123 }, from: { id: 123 }, reply: async (msg) => { replies.push(msg); } };
    const first = briefingHandler(ctx);
    const second = briefingHandler(ctx);
    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    assert.equal(calls, 1);
    assert(replies.some((r) => /already in progress/i.test(r)));
});
