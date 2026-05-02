import test from 'node:test';
import assert from 'node:assert/strict';

import { registerCommands } from '../bot/commands.js';
import { registerCallbacks } from '../bot/callbacks.js';
import * as store from '../services/store.js';
import { createPipeline } from '../services/pipeline.js';

function createBotHarness() {
    const handlers = { commands: new Map(), callbacks: [], events: [] };
    const bot = {
        command(name, handler) { handlers.commands.set(name, handler); return this; },
        callbackQuery(pattern, handler) { handlers.callbacks.push({ pattern, handler }); return this; },
        on(eventName, handler) { handlers.events.push({ eventName, handler }); return this; },
    };
    return { bot, handlers };
}

function createCtx({ chatId = 1, userId = 1, text = 'reply' } = {}) {
    const replies = [];
    const edits = [];
    return {
        ctx: {
            chat: { id: chatId },
            from: { id: userId },
            message: { text, reply_to_message: { message_id: 7 } },
            match: [],
            reply: async (message, extra) => { replies.push({ message, extra }); },
            editMessageText: async (message, extra) => { edits.push({ message, extra }); },
            answerCallbackQuery: async () => {},
        },
        replies,
        edits,
    };
}

async function resetStore() {
    await store.resetAll();
    await store.clearPendingTaskRefinement();
    await store.clearPendingChecklistClarification();
}

test('pipeline keeps diagnostics hidden by default', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDebugReceipts = process.env.DEBUG_RECEIPTS;
    delete process.env.NODE_ENV;
    delete process.env.DEBUG_RECEIPTS;

    try {
        const pipeline = createPipeline({
            intentExtractor: { extractIntents: async () => 'broken<' },
            normalizer: { normalizeActions: () => [] },
            adapter: {
                listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
                listActiveTasks: async () => [],
            },
        });

        const result = await pipeline.processMessage('bad input', {
            requestId: 'req-safe-default',
            entryPoint: 'telegram',
            mode: 'interactive',
        });

        assert.equal(result.isDevMode, false);
        assert.equal(result.diagnostics.length, 0);
        assert.equal(result.confirmationText.includes('broken<'), false);
    } finally {
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
        if (originalDebugReceipts === undefined) delete process.env.DEBUG_RECEIPTS;
        else process.env.DEBUG_RECEIPTS = originalDebugReceipts;
    }
});

test('typed refinement reply uses shared receipt and undo button', async () => {
    await resetStore();
    const chatId = 44001;
    const userId = 44001;
    await store.setPendingTaskRefinement({
        taskId: 'task-refine-1',
        mode: 'force_reply',
        forceReplyMessageId: 7,
    });
    await store.markTaskPending('task-refine-1', {
        originalTitle: 'Weekly report',
        originalContent: '',
        originalProjectId: 'inbox',
        originalPriority: 3,
    });

    const { bot, handlers } = createBotHarness();
    registerCommands(
        bot,
        { isAuthenticated: () => true, getCacheAgeSeconds: () => null, getAuthUrl: () => '', getAllTasks: async () => [], getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
        { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
        { listProjects: async () => [{ id: 'inbox', name: 'Inbox' }] },
        { processMessage: async () => ({
            type: 'task',
            confirmationText: 'ignored',
            actions: [{ type: 'update', taskId: 'task-refine-1', title: 'Weekly report draft' }],
            results: [{ status: 'succeeded', action: { type: 'update', taskId: 'task-refine-1', title: 'Weekly report draft' }, rollbackStep: { type: 'restore_updated', targetTaskId: 'task-refine-1', payload: { snapshot: { title: 'Weekly report', content: '', priority: 3, projectId: 'inbox' } } } }],
        }) },
        {},
    );

    const handler = handlers.events.find(({ eventName }) => eventName === 'message:text').handler;
    const { ctx, replies } = createCtx({ chatId, userId });

    await handler(ctx, async () => {});

    assert.match(replies.at(-1).message, /Updated:/);
    assert.ok(replies.at(-1).extra?.reply_markup, 'undo button expected when undo persisted');
});

test('typed checklist reply uses shared receipt and undo button', async () => {
    await resetStore();
    const chatId = 44002;
    const userId = 44002;
    await store.setPendingChecklistClarification({ originalMessage: 'Plan event', chatId, userId, createdAt: new Date().toISOString() });

    const { bot, handlers } = createBotHarness();
    registerCommands(
        bot,
        { isAuthenticated: () => true, getCacheAgeSeconds: () => null, getAuthUrl: () => '', getAllTasks: async () => [], getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
        { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
        { listProjects: async () => [{ id: 'inbox', name: 'Inbox' }] },
        { processMessage: async () => ({
            type: 'task',
            confirmationText: 'ignored',
            actions: [{ type: 'create', title: 'Plan event', projectId: 'inbox' }],
            results: [{ status: 'succeeded', action: { type: 'create', title: 'Plan event', projectId: 'inbox' }, rollbackStep: { type: 'delete_created', targetTaskId: 'task-create-1', targetProjectId: 'inbox', payload: { taskId: 'task-create-1' } } }],
        }) },
        {},
    );

    const handler = handlers.events.find(({ eventName }) => eventName === 'message:text').handler;
    const { ctx, replies } = createCtx({ chatId, userId });

    await handler(ctx, async () => {});

    assert.match(replies.at(-1).message, /Created:/);
    assert.ok(replies.at(-1).extra?.reply_markup, 'undo button expected when undo persisted');
});
