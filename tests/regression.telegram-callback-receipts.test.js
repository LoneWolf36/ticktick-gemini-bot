import test from 'node:test';
import assert from 'node:assert/strict';

import { registerCallbacks } from '../bot/callbacks.js';
import * as store from '../services/store.js';

function createBotHarness() {
    const handlers = [];
    const bot = {
        callbackQuery(pattern, handler) {
            handlers.push({ pattern, handler });
            return bot;
        },
    };
    return { bot, handlers };
}

function createCtx({ chatId = 1, userId = 1 } = {}) {
    const edits = [];
    return {
        ctx: {
            match: [],
            chat: { id: chatId },
            from: { id: userId },
            answerCallbackQuery: async () => {},
            editMessageText: async (text, extra) => {
                edits.push({ text, extra });
            },
        },
        edits,
    };
}

async function reset() {
    await store.resetAll();
    await store.clearPendingMutationConfirmation();
    await store.clearPendingMutationClarification();
}

test('mut:confirm shows structured freeform receipt and undo when rollback persists', async () => {
    await reset();
    const chatId = 24680;
    const userId = 24680;
    await store.setPendingMutationConfirmation({
        originalMessage: 'update weekly report',
        matchedTask: { taskId: 'task-confirm-1', projectId: 'inbox', title: 'Weekly report' },
        actionType: 'update',
        chatId,
        userId,
    });

    const { bot, handlers } = createBotHarness();
    const pipeline = {
        processMessage: async () => ({
            type: 'task',
            confirmationText: 'ignored',
            actions: [{ type: 'update', taskId: 'task-confirm-1', title: 'Weekly report draft' }],
            results: [{
                status: 'succeeded',
                action: { type: 'update', taskId: 'task-confirm-1', title: 'Weekly report draft' },
                rollbackStep: {
                    type: 'restore_updated',
                    targetTaskId: 'task-confirm-1',
                    payload: { snapshot: { title: 'Weekly report', content: '', priority: 3, projectId: 'inbox' } },
                },
            }],
        }),
    };
    const adapter = {
        listActiveTasks: async () => [{ id: 'task-confirm-1', title: 'Weekly report', projectId: 'inbox', status: 0 }],
        listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
    };

    registerCallbacks(bot, adapter, pipeline);
    const confirmHandler = handlers.find(({ pattern }) => pattern.toString().includes('mut:confirm$')).handler;
    const { ctx, edits } = createCtx({ chatId, userId });
    ctx.match = ['mut:confirm'];

    await confirmHandler(ctx);

    assert.match(edits.at(-1).text, /Updated:/);
    assert.match(edits.at(-1).text, /Weekly report/);
    assert.ok(edits.at(-1).extra.reply_markup);
    assert.equal(store.getLastUndoEntry()?.taskId, 'task-confirm-1');
});

test('mut:pick omits undo button when no rollback entries persist', async () => {
    await reset();
    const chatId = 13579;
    const userId = 13579;
    await store.setPendingMutationClarification({
        originalMessage: 'update weekly report',
        candidates: [{ id: 'task-pick-1', taskId: 'task-pick-1', title: 'Weekly report', projectName: 'Inbox' }],
        chatId,
        userId,
    });

    const { bot, handlers } = createBotHarness();
    const pipeline = {
        processMessage: async () => ({
            type: 'task',
            confirmationText: 'ignored',
            actions: [{ type: 'update', taskId: 'task-pick-1', title: 'Weekly report draft' }],
            results: [{
                status: 'succeeded',
                action: { type: 'update', taskId: 'task-pick-1', title: 'Weekly report draft' },
                rollbackStep: null,
            }],
        }),
    };
    const adapter = {
        listActiveTasks: async () => [{ id: 'task-pick-1', title: 'Weekly report', projectId: 'inbox', status: 0 }],
        listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
    };

    registerCallbacks(bot, adapter, pipeline);
    const pickHandler = handlers.find(({ pattern }) => pattern.toString().includes('mut:pick')).handler;
    const { ctx, edits } = createCtx({ chatId, userId });
    ctx.match = ['mut:pick:task-pick-1', 'task-pick-1'];

    await pickHandler(ctx);

    assert.match(edits.at(-1).text, /Updated:/);
    assert.equal(edits.at(-1).extra?.reply_markup, undefined);
});

test('mut:confirm keeps applied receipt when undo persistence fails', async () => {
    await reset();
    const chatId = 11223;
    const userId = 11223;
    await store.setPendingMutationConfirmation({
        originalMessage: 'update weekly report',
        matchedTask: { taskId: 'task-confirm-2', projectId: 'inbox', title: 'Weekly report' },
        actionType: 'update',
        chatId,
        userId,
    });

    const { bot, handlers } = createBotHarness();
    const pipeline = {
        processMessage: async () => ({
            type: 'task',
            confirmationText: 'ignored',
            actions: [{ type: 'update', taskId: 'task-confirm-2', title: 'Weekly report draft' }],
            results: [{
                status: 'succeeded',
                action: { type: 'update', taskId: 'task-confirm-2', title: 'Weekly report draft' },
                rollbackStep: {
                    type: 'restore_updated',
                    targetTaskId: 'task-confirm-2',
                    payload: { snapshot: { title: 'Weekly report', content: '', priority: 3, projectId: 'inbox' } },
                },
            }],
        }),
    };
    const adapter = {
        listActiveTasks: async () => [{ id: 'task-confirm-2', title: 'Weekly report', projectId: 'inbox', status: 0 }],
        listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
    };
    const failingStore = { ...store, addUndoEntry: async () => { throw new Error('disk full'); } };

    registerCallbacks(bot, adapter, pipeline, { storeApi: failingStore });
    const confirmHandler = handlers.find(({ pattern }) => pattern.toString().includes('mut:confirm$')).handler;
    const { ctx, edits } = createCtx({ chatId, userId });
    ctx.match = ['mut:confirm'];

    await confirmHandler(ctx);

    assert.match(edits.at(-1).text, /Updated:/);
    assert.equal(edits.at(-1).extra?.reply_markup, undefined);
    assert.equal(store.getLastUndoEntry(), null);
});

test('mut:pick keeps undo button when some undo entries persist', async () => {
    await reset();
    const chatId = 77889;
    const userId = 77889;
    await store.setPendingMutationClarification({
        originalMessage: 'update weekly report',
        candidates: [{ id: 'task-pick-2', taskId: 'task-pick-2', title: 'Weekly report', projectName: 'Inbox' }],
        chatId,
        userId,
    });

    const { bot, handlers } = createBotHarness();
    const pipeline = {
        processMessage: async () => ({
            type: 'task',
            confirmationText: 'ignored',
            actions: [{ type: 'update', taskId: 'task-pick-2', title: 'Weekly report draft' }],
            results: [
                {
                    status: 'succeeded',
                    action: { type: 'update', taskId: 'task-pick-2', title: 'Weekly report draft' },
                    rollbackStep: {
                        type: 'restore_updated',
                        targetTaskId: 'task-pick-2',
                        payload: { snapshot: { title: 'Weekly report', content: '', priority: 3, projectId: 'inbox' } },
                    },
                },
                {
                    status: 'succeeded',
                    action: { type: 'update', taskId: 'task-pick-2', title: 'Weekly report draft 2' },
                    rollbackStep: {
                        type: 'restore_updated',
                        targetTaskId: 'task-pick-2b',
                        payload: { snapshot: { title: 'Weekly report b', content: '', priority: 3, projectId: 'inbox' } },
                    },
                },
            ],
        }),
    };
    const adapter = {
        listActiveTasks: async () => [{ id: 'task-pick-2', title: 'Weekly report', projectId: 'inbox', status: 0 }],
        listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
    };
    const failingStore = {
        ...store,
        addUndoEntry: async (entry) => {
            await store.addUndoEntry(entry);
            if (entry.taskId === 'task-pick-2b') throw new Error('disk full');
        },
    };

    registerCallbacks(bot, adapter, pipeline, { storeApi: failingStore });
    const pickHandler = handlers.find(({ pattern }) => pattern.toString().includes('mut:pick')).handler;
    const { ctx, edits } = createCtx({ chatId, userId });
    ctx.match = ['mut:pick:task-pick-2', 'task-pick-2'];

    await pickHandler(ctx);

    assert.match(edits.at(-1).text, /Updated:/);
    assert.ok(edits.at(-1).extra?.reply_markup, 'undo button expected after partial persistence');
    assert.ok(store.getLastUndoEntry(), 'at least one undo entry persisted');
});

test('cl:checklist shows structured receipt and undo when rollback persists', async () => {
    await reset();
    const chatId = 44556;
    const userId = 44556;
    await store.setPendingChecklistClarification({
        originalMessage: 'plan trip',
        intents: [{ type: 'create', title: 'Plan trip' }],
        chatId,
        userId,
    });

    const { bot, handlers } = createBotHarness();
    const pipeline = {
        processMessage: async () => ({
            type: 'task',
            confirmationText: 'ignored',
            actions: [{ type: 'create', title: 'Plan trip', checklistItems: [{ title: 'Book flights' }] }],
            results: [{
                status: 'succeeded',
                action: { type: 'create', title: 'Plan trip', checklistItems: [{ title: 'Book flights' }] },
                rollbackStep: {
                    type: 'delete_created',
                    targetTaskId: 'task-checklist-1',
                    payload: { snapshot: { title: 'Plan trip', content: '', priority: 3, projectId: 'inbox' } },
                },
            }],
        }),
    };
    const adapter = {
        listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
    };

    registerCallbacks(bot, adapter, pipeline, { storeApi: store });
    const handler = handlers.find(({ pattern }) => pattern.toString().includes('cl:checklist')).handler;
    const { ctx, edits } = createCtx({ chatId, userId });

    await handler(ctx);

    assert.match(edits.at(-1).text, /Created:/);
    assert.match(edits.at(-1).text, /Plan trip/);
    assert.ok(edits.at(-1).extra.reply_markup);
    assert.equal(store.getLastUndoEntry()?.taskId, 'task-checklist-1');
});
