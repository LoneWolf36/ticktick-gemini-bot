import test from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../services/store.js';
import { registerCommands } from '../bot/commands.js';
import { createPipelineHarness } from './pipeline-harness.js';

async function resetStore() {
    await store.resetAll();
    await store.clearPendingMutationConfirmation();
}

test('freeform Telegram message dedupes repeated update before pipeline start', async () => {
    await resetStore();

    const pipelineCalls = [];
    const handlers = { messageText: null };
    const bot = {
        command() {
            return bot;
        },
        on(pattern, handler) {
            if (pattern === 'message:text') handlers.messageText = handler;
            return bot;
        },
        callbackQuery() {
            return bot;
        }
    };

    registerCommands(bot, { isAuthenticated: () => true }, { isQuotaExhausted: () => false }, {}, {
        processMessageWithContext: async (message, options) => {
            pipelineCalls.push({ message, options });
            return { type: 'non-task', confirmationText: 'ok', results: [] };
        }
    });

    const replies = [];
    const baseCtx = {
        chat: { id: 111 },
        from: { id: 222 },
        message: { message_id: 333, text: 'complete weekly report' },
        update: { update_id: 444 },
        reply: async (text) => {
            replies.push(text);
        }
    };

    await handlers.messageText(baseCtx);
    await handlers.messageText({ ...baseCtx, reply: baseCtx.reply });

    assert.equal(replies.filter((text) => text === 'Working on that...').length, 1);
    assert.equal(replies.length, 2);
    assert.equal(pipelineCalls.length, 1);
});

test('freeform Telegram duplicate stays deduped while first pipeline is in flight', async () => {
    await resetStore();

    let releasePipeline;
    const pipelineCalls = [];
    const handlers = { messageText: null };
    const bot = {
        command() {
            return bot;
        },
        on(pattern, handler) {
            if (pattern === 'message:text') handlers.messageText = handler;
            return bot;
        },
        callbackQuery() {
            return bot;
        }
    };

    registerCommands(bot, { isAuthenticated: () => true }, { isQuotaExhausted: () => false }, {}, {
        processMessageWithContext: async (message, options) => {
            pipelineCalls.push({ message, options });
            await new Promise((resolve) => {
                releasePipeline = resolve;
            });
            return { type: 'non-task', confirmationText: 'ok', results: [] };
        }
    });

    const replies = [];
    const ctx = {
        chat: { id: 111 },
        from: { id: 222 },
        message: { message_id: 333, text: 'complete weekly report' },
        update: { update_id: 444 },
        reply: async (text) => {
            replies.push(text);
        }
    };

    const first = handlers.messageText(ctx);
    const second = handlers.messageText({ ...ctx, reply: ctx.reply });
    await new Promise((resolve) => setTimeout(resolve, 0));
    releasePipeline();
    await Promise.all([first, second]);

    assert.equal(replies.filter((text) => text === 'Working on that...').length, 1);
    assert.equal(pipelineCalls.length, 1);
});

test('receipt failure keeps freeform idempotency marker retained after task mutation', async () => {
    await resetStore();

    const pipelineCalls = [];
    const handlers = { messageText: null };
    const bot = {
        command() {
            return bot;
        },
        on(pattern, handler) {
            if (pattern === 'message:text') handlers.messageText = handler;
            return bot;
        },
        callbackQuery() {
            return bot;
        }
    };

    registerCommands(bot, { isAuthenticated: () => true }, { isQuotaExhausted: () => false }, {}, {
        processMessageWithContext: async (message, options) => {
            pipelineCalls.push({ message, options });
            return {
                type: 'task',
                confirmationText: 'Applied 1 task action.',
                actions: [{ type: 'complete', taskId: 'task-1', projectId: 'inbox', title: 'Write weekly report' }],
                results: [{ status: 'succeeded', action: { type: 'complete', taskId: 'task-1' } }]
            };
        }
    });

    const replies = [];
    let shouldThrowOnReceipt = true;
    const ctx = {
        chat: { id: 111 },
        from: { id: 222 },
        message: { message_id: 333, text: 'complete weekly report' },
        update: { update_id: 444 },
        reply: async (text) => {
            replies.push(text);
            if (shouldThrowOnReceipt && text.includes('Applied 1 task action')) {
                shouldThrowOnReceipt = false;
                throw new Error('send failed');
            }
        }
    };

    await handlers.messageText(ctx).catch(() => {});
    await handlers.messageText({ ...ctx, reply: ctx.reply }).catch(() => {});

    assert.equal(pipelineCalls.length, 1);
    assert.equal(replies.filter((text) => text === 'Working on that...').length, 1);
});

test('working reply failure clears freeform idempotency claim', async () => {
    await resetStore();

    const pipelineCalls = [];
    const handlers = { messageText: null };
    const bot = {
        command() {
            return bot;
        },
        on(pattern, handler) {
            if (pattern === 'message:text') handlers.messageText = handler;
            return bot;
        },
        callbackQuery() {
            return bot;
        }
    };

    registerCommands(bot, { isAuthenticated: () => true }, { isQuotaExhausted: () => false }, {}, {
        processMessageWithContext: async (message, options) => {
            pipelineCalls.push({ message, options });
            return { type: 'non-task', confirmationText: 'ok', results: [] };
        }
    });

    const ctx = {
        chat: { id: 111 },
        from: { id: 222 },
        message: { message_id: 333, text: 'hello' },
        update: { update_id: 444 },
        reply: async (text) => {
            if (text === 'Working on that...') throw new Error('send failed');
        }
    };

    await handlers.messageText(ctx).catch(() => {});
    await handlers.messageText({ ...ctx, reply: async () => {} });
    assert.equal(pipelineCalls.length, 1);
});

test('confirmation resume scopes to confirmed task only', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [
            { type: 'complete', title: 'weekly report', confidence: 0.9, targetQuery: 'weekly report' },
            { type: 'complete', title: 'weekly report', confidence: 0.9, targetQuery: 'weekly report' }
        ],
        activeTasks: [
            {
                id: 'task-confirm-1',
                title: 'Write weekly report',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 5,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('complete the weekly report', {
        existingTask: { id: 'task-confirm-1', projectId: 'inbox', title: 'Write weekly report' },
        confirmedAction: { taskId: 'task-confirm-1', actionType: 'complete' },
        skipClarification: true,
        skipMutationConfirmation: true
    });

    assert.equal(result.type, 'task');
    assert.equal(harness.adapterCalls.complete.length, 1);
    assert.match(result.confirmationText, /Completed 1 task/);
    assert.equal(result.actions.length, 1);
});

test('mut:confirm propagates confirmedAction scope and executes once', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [
            { type: 'complete', title: 'weekly report', confidence: 0.9, targetQuery: 'weekly report' },
            { type: 'complete', title: 'weekly report', confidence: 0.9, targetQuery: 'weekly report' }
        ],
        activeTasks: [
            {
                id: 'task-confirm-2',
                title: 'Write weekly report',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 5,
                status: 0
            }
        ]
    });

    const { result, pipeline } = harness;
    const confirmResult = await harness.processMessage('complete the weekly report', {
        existingTask: { id: 'task-confirm-2', projectId: 'inbox', title: 'Write weekly report' },
        confirmedAction: { taskId: 'task-confirm-2', actionType: 'complete' },
        skipClarification: true,
        skipMutationConfirmation: true
    });

    assert.equal(confirmResult.type, 'task');
    assert.equal(harness.adapterCalls.complete.length, 1);
    assert.equal(confirmResult.actions.length, 1);
    assert.equal(confirmResult.actions[0].taskId, 'task-confirm-2');
});

test('pipeline collapses duplicate same-task complete actions but preserves distinct tasks', async () => {
    await resetStore();
    const sameTaskHarness = createPipelineHarness({
        intents: [
            { type: 'complete', taskId: 'task-collide-1', projectId: 'inbox', title: 'Write weekly report', confidence: 0.9 },
            { type: 'complete', taskId: 'task-collide-1', projectId: 'inbox', title: 'Write weekly report', confidence: 0.9 }
        ],
        activeTasks: [
            {
                id: 'task-collide-1',
                title: 'Write weekly report',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 5,
                status: 0
            }
        ]
    });

    const sameTaskResult = await sameTaskHarness.processMessage('complete weekly report', {
        skipMutationConfirmation: true
    });

    assert.equal(sameTaskHarness.adapterCalls.complete.length, 1);
    assert.equal(sameTaskResult.actions.length, 1);

    const distinctHarness = createPipelineHarness({
        intents: [
            { type: 'complete', taskId: 'task-a', projectId: 'inbox', title: 'Alpha', confidence: 0.9 },
            { type: 'complete', taskId: 'task-b', projectId: 'inbox', title: 'Beta', confidence: 0.9 }
        ],
        activeTasks: [
            { id: 'task-a', title: 'Alpha', projectId: 'inbox', projectName: 'Inbox', priority: 5, status: 0 },
            { id: 'task-b', title: 'Beta', projectId: 'inbox', projectName: 'Inbox', priority: 5, status: 0 }
        ]
    });

    const distinctResult = await distinctHarness.processMessage('complete alpha and beta', {
        skipMutationConfirmation: true
    });

    assert.equal(distinctHarness.adapterCalls.complete.length, 2);
    assert.equal(distinctResult.actions.length, 2);
});
