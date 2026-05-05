import test from 'node:test';
import assert from 'node:assert/strict';

import { createPipelineHarness } from './pipeline-harness.js';
import { isFollowUpMessage } from '../services/shared-utils.js';
import { registerCallbacks } from '../bot/callbacks.js';
import * as store from '../services/store.js';
import { AUTHORIZED_CHAT_ID } from '../services/shared-utils.js';

test('isFollowUpMessage requires pronoun or time-shift keyword', () => {
    assert.equal(isFollowUpMessage('Buy milk'), false);
    assert.equal(isFollowUpMessage('done'), false);
    assert.equal(isFollowUpMessage('Book dentist appointment Thursday'), false);
    assert.equal(isFollowUpMessage('create a new task for next week'), true);
    assert.equal(isFollowUpMessage('make it high priority'), true);
    assert.equal(isFollowUpMessage('it'), true);
    assert.equal(isFollowUpMessage('move to career'), true);
    assert.equal(isFollowUpMessage('change it to tomorrow instead'), true);
    assert.equal(isFollowUpMessage('tomorrow instead'), true);
    assert.equal(isFollowUpMessage('a'.repeat(60)), false);
    assert.equal(
        isFollowUpMessage(
            'it is a very long message that exceeds the sixty character limit and should not be treated as follow up even with a pronoun inside'
        ),
        true
    );
});

test('isFollowUpMessage does not bind explicit text only because it overlaps the recent task title', () => {
    assert.equal(isFollowUpMessage('update the quarterly review task', 'quarterly review task'), false);
    assert.equal(isFollowUpMessage('buy milk', 'quarterly review'), false);
    assert.equal(isFollowUpMessage('change quarterly to monthly', 'quarterly review'), false);
    assert.equal(isFollowUpMessage('a'.repeat(121), 'quarterly review'), false);
    assert.equal(isFollowUpMessage('update the quarterly review task', 'Quarterly Review Task'), false);
    assert.equal(isFollowUpMessage('change it to monthly', 'quarterly review'), true);
});

test('pipeline resolves pronoun query when existingTask is injected from recent task', async () => {
    const harness = createPipelineHarness({
        intents: [{ type: 'update', title: 'it', confidence: 0.5, targetQuery: 'it' }],
        activeTasks: [
            { id: 'task-pro-01', title: 'Review PR', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
            {
                id: 'task-pro-02',
                title: 'Write report',
                projectId: 'career',
                projectName: 'Career',
                priority: 5,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('update it', {
        existingTask: { id: 'task-pro-01', projectId: 'inbox', title: 'Review PR' },
        skipMutationConfirmation: true
    });

    assert.equal(result.type, 'task');
    assert.equal(harness.adapterCalls.update.length, 1);
    assert.equal(harness.adapterCalls.update[0].taskId, 'task-pro-01');
});

test('processMessageWithContext injects recentTask as existingTask', async () => {
    const harness = createPipelineHarness({
        intents: [{ type: 'update', title: 'it', confidence: 0.5, targetQuery: 'it' }],
        activeTasks: [{ id: 'task-recent-1', title: 'Review PR', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 }]
    });

    const result = await harness.pipeline.processMessageWithContext('update it', {
        recentTask: { id: 'task-recent-1', projectId: 'inbox', title: 'Review PR' },
        skipMutationConfirmation: true
    });

    assert.equal(result.type, 'task');
    assert.equal(harness.adapterCalls.update.length, 1);
    assert.equal(harness.adapterCalls.update[0].taskId, 'task-recent-1');
});

test('store recentTaskContext respects TTL', async () => {
    const userId = 'ttl-user';
    const originalNow = Date.now;
    const base = Date.now();
    try {
        Date.now = () => base;
        await store.setRecentTaskContext(userId, {
            taskId: 'task-ttl-1',
            title: 'Review PR',
            projectId: 'inbox',
            source: 'test'
        });

        assert.equal(store.getRecentTaskContext(userId)?.taskId, 'task-ttl-1');

        Date.now = () => base + store.RECENT_TASK_CONTEXT_TTL_MS + 1;
        assert.equal(store.getRecentTaskContext(userId), null);
    } finally {
        Date.now = originalNow;
        await store.clearRecentTaskContext(userId);
    }
});

test('registerCallbacks r: handler stores force_reply refinement state', async () => {
    await store.resetAll();

    const taskId = 'task-refine-1';
    const chatId = AUTHORIZED_CHAT_ID || 9911;
    const userId = chatId;

    await store.markTaskPending(taskId, {
        originalTitle: 'Review PR',
        originalContent: 'notes',
        originalProjectId: 'inbox',
        originalPriority: 3,
        projectId: 'inbox'
    });

    const handlers = [];
    const bot = {
        callbackQuery(pattern, handler) {
            handlers.push({ pattern, handler });
            return this;
        }
    };

    registerCallbacks(bot, {}, { processMessage: async () => ({ type: 'non-task', confirmationText: 'ok' }) });

    const handler = handlers.find((entry) => entry.pattern.toString().includes('^r:(.+)$'))?.handler;
    assert.equal(typeof handler, 'function');

    const replies = [];
    const ctx = {
        match: ['r:task-refine-1', taskId],
        chat: { id: chatId },
        from: { id: userId },
        reply: async (msg, opts) => {
            replies.push({ msg, opts });
            return { message_id: 444 };
        },
        answerCallbackQuery: async () => {}
    };

    await handler(ctx);

    const pending = store.getPendingTaskRefinement();
    assert.equal(pending.taskId, taskId);
    assert.equal(pending.mode, 'force_reply');
    assert.equal(replies[0].opts.reply_markup.force_reply, true);
    await store.clearPendingTaskRefinement();
    await store.resolveTask(taskId, 'skip');
});
