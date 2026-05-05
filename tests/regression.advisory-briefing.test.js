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

test('registerCommands routes advisory questions to top-3 briefing, skips pipeline', async () => {
    const { h, b } = createBotHarness();
    const axCalls = [];
    const tasks = [
        { id: 't1', title: 'Write quarterly review', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
        { id: 't2', title: 'Buy groceries', projectId: 'p1', projectName: 'Personal', priority: 3, status: 0 }
    ];
    const _pbt = async (_tasks) => {
        const ranked = _tasks.map((t, i) => ({ taskId: t.id, rank: i + 1, scoreBand: 'top', rationaleCode: 'goal_alignment', rationaleText: i === 0 ? 'Core goal task' : '', inferenceConfidence: 'strong' }));
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
    const replies = []; const userId = `adv-test-${Date.now()}`;
    await msgHandler({ message: { text: 'what should I do today' }, chat: { id: userId }, from: { id: userId }, reply: async (msg) => { replies.push(msg); }, editMessageText: async () => {} });
    assert.equal(axCalls.length, 0, 'should NOT reach pipeline');
    assert(replies.some((r) => /PRIORITY BRIEFING/.test(r)));
    assert(replies.some((r) => /Write quarterly review/.test(r)));
    assert(!replies.some((r) => /Core goal task/.test(r)), 'should hide generic rationale');
    assert(replies.some((r) => /<b>Start with:<\/b> Write quarterly review/.test(r)), 'start line should use first title');
    assert(!replies.some((r) => /\[P5\]/.test(r)), 'should NOT contain priority label');
    assert(!replies.some((r) => /\(Career\)/.test(r)), 'should NOT contain project name');
});

test('registerCommands groups advisory tasks by due today using local date helper', async () => {
    const { h, b } = createBotHarness();
    const axCalls = [];
    const RealDate = Date;
    const fixedNow = new RealDate('2026-05-05T12:00:00.000Z');
    globalThis.Date = class extends RealDate {
        constructor(...args) {
            return args.length === 0 ? new RealDate(fixedNow) : new RealDate(...args);
        }
        static now() { return fixedNow.getTime(); }
        static parse(value) { return RealDate.parse(value); }
        static UTC(...args) { return RealDate.UTC(...args); }
    };
    const tasks = [
        { id: 't1', title: 'Due today task', dueDate: '2026-05-04T23:00:00.000+0000', priority: 5, projectName: 'Career', status: 0 },
        { id: 't2', title: 'Next task', dueDate: '2025-01-01T10:00:00.000Z', priority: 3, projectName: 'Personal', status: 0 },
        { id: 't3', title: 'No date task', dueDate: null, status: 0 }
    ];
    const _pbt = async (_tasks) => {
        const ranked = _tasks.map((t, i) => ({ taskId: t.id, rank: i + 1, scoreBand: 'top', rationaleCode: 'goal_alignment', rationaleText: i === 0 ? 'Due today rationale' : (i === 1 ? 'Overdue rationale' : ''), inferenceConfidence: 'strong' }));
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
    const replies = []; const userId = `adv-due-${Date.now()}`;
    try {
        await msgHandler({ message: { text: 'what should I do today' }, chat: { id: userId }, from: { id: userId }, reply: async (msg) => { replies.push(msg); }, editMessageText: async () => {} });
    } finally {
        globalThis.Date = RealDate;
    }
    assert.equal(axCalls.length, 0, 'should NOT reach pipeline');
    assert(replies.some((r) => /<b>🌅 PRIORITY BRIEFING<\/b>/.test(r)), 'should use briefing-style header');
    assert(replies.some((r) => /<b>Due today \(1\)<\/b>/.test(r)), 'should show due today count');
    assert(replies.some((r) => /<b>Next up \(2\)<\/b>/.test(r)), 'should show next up count');
    assert(replies.some((r) => /Due today task/.test(r)), 'should include due-today task');
    assert(replies.some((r) => /Next task/.test(r)), 'should include next task');
    assert(replies.some((r) => /No date task/.test(r)), 'should include no-date task');
    assert(replies.some((r) => /<b>Start with:<\/b> Due today task/.test(r)), 'start line should use first task title');
    assert(!replies.some((r) => /\[P5\]/.test(r)), 'should NOT contain priority label');
    assert(!replies.some((r) => /\(Career\)/.test(r)), 'should NOT contain project name');
});

test('registerCommands suppresses generic advisory rationale but keeps custom rationale', async () => {
    const { h, b } = createBotHarness();
    const tasks = [
        { id: 't1', title: 'Primary task', dueDate: null, priority: 5, status: 0 },
        { id: 't2', title: 'Secondary task', dueDate: null, priority: 3, status: 0 }
    ];
    const _pbt = async (_tasks) => {
        const ranked = _tasks.map((t, i) => ({
            taskId: t.id,
            rank: i + 1,
            scoreBand: 'top',
            rationaleCode: 'goal_alignment',
            rationaleText: i === 0 ? 'Strong alignment with current user-owned goals.' : 'Custom rationale worth showing.',
            inferenceConfidence: 'strong'
        }));
        const byId = new Map(_tasks.map((t) => [t.id, t]));
        return { ranking: { ranked }, orderedTasks: ranked.map((d) => byId.get(d.taskId)).filter(Boolean) };
    };
    registerCommands(b,
        { isAuthenticated: () => true, getCacheAgeSeconds: () => null, getAuthUrl: () => 'https://auth.test', getAllTasks: async () => [], getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
        { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null, _prepareBriefingTasks: _pbt },
        { listActiveTasks: async () => tasks, listProjects: async () => [] },
        { processMessage: async () => ({ type: 'task' }) }
    );
    const msgHandler = h.events.find((e) => e.e === 'message:text')?.fn || h.events.find((e) => e.eventName === 'message:text')?.handler;
    const replies = []; const userId = `adv-rationale-${Date.now()}`;
    await msgHandler({ message: { text: 'what should I do today' }, chat: { id: userId }, from: { id: userId }, reply: async (msg) => { replies.push(msg); }, editMessageText: async () => {} });
    assert(replies.some((r) => /Primary task/.test(r) || /Secondary task/.test(r)), 'should include title');
    assert(!replies.some((r) => /Strong alignment with current user-owned goals\./.test(r)), 'should hide generic rationale');
    assert(replies.some((r) => /Custom rationale worth showing\./.test(r)), 'should keep custom rationale');
});
