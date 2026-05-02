import test from 'node:test';
import assert from 'node:assert/strict';

import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import { createPipeline } from '../services/pipeline.js';
import { createPipelineObservability } from '../services/pipeline-observability.js';
import { AIHardQuotaError, AIServiceUnavailableError, AIInvalidKeyError } from '../services/gemini.js';
import { validateOperationReceipt } from '../services/operation-receipt.js';
import { retryDeferredIntents } from '../services/scheduler.js';
import * as store from '../services/store.js';

test('R11 adapter returns typed permission, not-found, completion, and network failures', async () => {
    const client = Object.create(TickTickClient.prototype);
    client.completeTask = async () => {
        const err = new Error('forbidden');
        err.response = { status: 403, data: { message: 'forbidden' } };
        throw err;
    };

    const adapter = new TickTickAdapter(client);

    await assert.rejects(
        () => adapter.completeTask('task-1', 'proj-1'),
        (error) => {
            assert.equal(error.code, 'PERMISSION_DENIED');
            return true;
        },
    );

    client.completeTask = async () => {
        const err = new Error('missing');
        err.response = { status: 404, data: { message: 'missing' } };
        throw err;
    };

    await assert.rejects(
        () => adapter.completeTask('task-1', 'proj-1'),
        (error) => {
            assert.equal(error.code, 'NOT_FOUND');
            return true;
        },
    );

    client.completeTask = async () => {
        const err = new Error('already completed');
        err.response = { status: 400, data: { message: 'Task already completed' } };
        throw err;
    };

    await assert.rejects(
        () => adapter.completeTask('task-1', 'proj-1'),
        (error) => {
            assert.equal(error.code, 'ALREADY_COMPLETED');
            return true;
        },
    );

    client.completeTask = async () => {
        const err = new Error('socket hang up');
        err.code = 'ECONNRESET';
        throw err;
    };

    await assert.rejects(
        () => adapter.completeTask('task-1', 'proj-1'),
        (error) => {
            assert.equal(error.code, 'NETWORK_ERROR');
            return true;
        },
    );
});

test('R5 single-task transient failures retry with exponential backoff', async () => {
    const originalRetries = process.env.PIPELINE_TRANSIENT_MAX_RETRIES;
    const originalBaseDelay = process.env.PIPELINE_TRANSIENT_BASE_DELAY_MS;
    const originalMaxDelay = process.env.PIPELINE_TRANSIENT_MAX_DELAY_MS;
    const originalSetTimeout = globalThis.setTimeout;

    process.env.PIPELINE_TRANSIENT_MAX_RETRIES = '2';
    process.env.PIPELINE_TRANSIENT_BASE_DELAY_MS = '10';
    process.env.PIPELINE_TRANSIENT_MAX_DELAY_MS = '100';

    const observedSleeps = [];
    globalThis.setTimeout = (fn, ms, ...args) => {
        observedSleeps.push(ms);
        return originalSetTimeout(fn, 0, ...args);
    };

    let attempts = 0;
    const pipeline = createPipeline({
        intentExtractor: {
            extractIntents: async () => [{ type: 'create', title: 'Retry task' }],
        },
        normalizer: {
            normalizeActions: (intents) => intents.map((intent) => ({
                ...intent,
                projectId: 'inbox',
                valid: true,
                validationErrors: [],
            })),
        },
        adapter: {
            listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
            listActiveTasks: async () => [],
            createTask: async () => {
                attempts += 1;
                if (attempts < 3) {
                    const err = new Error('network timeout');
                    err.code = 'NETWORK_ERROR';
                    throw err;
                }
                return { id: 'created-retry', projectId: 'inbox' };
            },
        },
        observability: createPipelineObservability({ logger: null }),
    });

    try {
        const result = await pipeline.processMessage('create retry task', {
            requestId: 'req-r5-retry',
            entryPoint: 'telegram',
            mode: 'interactive',
        });

        assert.equal(result.type, 'task');
        assert.equal(attempts, 3);
        assert.ok(observedSleeps.length >= 2);
        assert.equal(observedSleeps[0], 10);
        assert.equal(observedSleeps[1], 20);
    } finally {
        globalThis.setTimeout = originalSetTimeout;
        if (originalRetries === undefined) delete process.env.PIPELINE_TRANSIENT_MAX_RETRIES;
        else process.env.PIPELINE_TRANSIENT_MAX_RETRIES = originalRetries;
        if (originalBaseDelay === undefined) delete process.env.PIPELINE_TRANSIENT_BASE_DELAY_MS;
        else process.env.PIPELINE_TRANSIENT_BASE_DELAY_MS = originalBaseDelay;
        if (originalMaxDelay === undefined) delete process.env.PIPELINE_TRANSIENT_MAX_DELAY_MS;
        else process.env.PIPELINE_TRANSIENT_MAX_DELAY_MS = originalMaxDelay;
    }
});

test('R5 partial failures surface succeeded and failed actions without silent drops', async () => {
    const pipeline = createPipeline({
        intentExtractor: {
            extractIntents: async () => [{ type: 'create' }, { type: 'create' }, { type: 'create' }],
        },
        normalizer: {
            normalizeActions: () => ([
                { type: 'create', title: 'Task A', projectId: 'inbox', valid: true, validationErrors: [] },
                { type: 'create', title: 'Task B', projectId: 'inbox', valid: true, validationErrors: [] },
                { type: 'create', title: 'Task C', projectId: 'inbox', valid: true, validationErrors: [] },
            ]),
        },
        adapter: {
            listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
            listActiveTasks: async () => [],
            createTask: async (action) => {
                if (action.title === 'Task A') return { id: 'task-a', projectId: 'inbox' };
                const err = new Error('target missing');
                err.code = 'NOT_FOUND';
                throw err;
            },
            deleteTask: async () => ({ deleted: true }),
        },
        observability: createPipelineObservability({ logger: null }),
    });

    const result = await pipeline.processMessage('create three tasks', {
        requestId: 'req-r5-partial',
        entryPoint: 'telegram',
        mode: 'interactive',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'adapter');
    assert.equal(result.failure.failureCategory, 'partial');
    assert.equal(result.results.length, 3);
    assert.equal(result.results[0].status, 'rolled_back');
    assert.equal(result.results[1].status, 'failed');
    assert.equal(result.results[2].status, 'failed');
    assert.match(result.confirmationText, /Task A/);
    assert.match(result.confirmationText, /Task B/);
    assert.match(result.confirmationText, /Task C/);
    assert.equal(result.failure.details.failures.length, 2);
    assert.match(result.confirmationText, /Rolled back: Task A/);
    assert.doesNotMatch(result.confirmationText, /Success: Task A/);
    assert.equal(result.operationReceipt.status, 'failed');
    assert.equal(result.operationReceipt.changed, false);
    assert.equal(result.operationReceipt.applied, false);
    assert.equal(result.operationReceipt.succeeded, 1);
    assert.equal(result.operationReceipt.failed, 2);
    assert.equal(result.operationReceipt.rolledBack, 1);
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);

    const receiptText = JSON.stringify(result.operationReceipt);
    assert.doesNotMatch(receiptText, /Task A|Task B|Task C/);
});

test('R5 rollback failure receipt stays count-based and truthful', async () => {
    const pipeline = createPipeline({
        intentExtractor: {
            extractIntents: async () => [{ type: 'create' }, { type: 'create' }],
        },
        normalizer: {
            normalizeActions: () => ([
                { type: 'create', title: 'Alpha task', projectId: 'inbox', valid: true, validationErrors: [] },
                { type: 'create', title: 'Beta task', projectId: 'inbox', valid: true, validationErrors: [] },
            ]),
        },
        adapter: {
            listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
            listActiveTasks: async () => [],
            createTask: async (action) => {
                if (action.title === 'Alpha task') return { id: 'alpha-task', projectId: 'inbox' };
                const err = new Error('target missing');
                err.code = 'NOT_FOUND';
                throw err;
            },
            deleteTask: async () => {
                const err = new Error('rollback failed');
                err.code = 'NETWORK_ERROR';
                throw err;
            },
        },
        observability: createPipelineObservability({ logger: null }),
    });

    const result = await pipeline.processMessage('create rollback tasks', {
        requestId: 'req-r5-rollback',
        entryPoint: 'telegram',
        mode: 'interactive',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.failureCategory, 'partial');
    assert.equal(result.operationReceipt.status, 'failed');
    assert.equal(result.operationReceipt.changed, true);
    assert.equal(result.operationReceipt.applied, false);
    assert.equal(result.operationReceipt.succeeded, 1);
    assert.equal(result.operationReceipt.failed, 1);
    assert.equal(result.operationReceipt.rolledBack, 0);
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.doesNotMatch(JSON.stringify(result.operationReceipt), /Alpha task|Beta task/);
});

test('R11 pipeline surfaces typed adapter failures without leaking API internals', async () => {
    async function runScenario(adapterError) {
        const pipeline = createPipeline({
            intentExtractor: {
                extractIntents: async () => [{ type: 'update', taskId: 'task-1', originalProjectId: 'proj-1' }],
            },
            normalizer: {
                normalizeActions: () => ([
                    { type: 'update', taskId: 'task-1', originalProjectId: 'proj-1', valid: true, validationErrors: [] },
                ]),
            },
            adapter: {
                listProjects: async () => [{ id: 'proj-1', name: 'Inbox' }],
                listActiveTasks: async () => [],
                getTaskSnapshot: async () => ({
                    id: 'task-1',
                    projectId: 'proj-1',
                    title: 'Existing task',
                    content: null,
                    priority: null,
                    dueDate: null,
                    repeatFlag: null,
                    status: 0,
                }),
                updateTask: async () => { throw adapterError; },
            },
            observability: createPipelineObservability({ logger: null }),
        });

        return pipeline.processMessage('update it', {
            requestId: `req-r11-${adapterError.code || adapterError.statusCode || 'typed'}`,
            entryPoint: 'telegram',
            mode: 'interactive',
        });
    }

    const permissionError = new Error('forbidden');
    permissionError.code = 'PERMISSION_DENIED';
    permissionError.statusCode = 403;
    const permissionResult = await runScenario(permissionError);
    assert.equal(permissionResult.type, 'error');
    assert.match(permissionResult.confirmationText, /Permission denied/);
    assert.doesNotMatch(permissionResult.confirmationText, /403|forbidden/i);

    const notFoundError = new Error('Task missing from API');
    notFoundError.code = 'NOT_FOUND';
    notFoundError.statusCode = 404;
    const notFoundResult = await runScenario(notFoundError);
    assert.match(notFoundResult.confirmationText, /Target task not found/);
    assert.doesNotMatch(notFoundResult.confirmationText, /404|missing from api/i);

    const completedError = new Error('Task already completed');
    completedError.code = 'ALREADY_COMPLETED';
    completedError.statusCode = 400;
    const completedResult = await runScenario(completedError);
    assert.match(completedResult.confirmationText, /already completed/i);
    assert.doesNotMatch(completedResult.confirmationText, /400|task already completed/i);
});

test('AI hard quota failure defers intent for retry', async () => {
    const deferred = [];
    const pipeline = createPipeline({
        intentExtractor: {
            extractIntents: async () => { throw new AIHardQuotaError('quota exhausted'); },
        },
        normalizer: { normalizeActions: () => [] },
        adapter: {
            listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
            listActiveTasks: async () => [],
        },
        deferIntent: (entry) => {
            deferred.push(entry);
            return Promise.resolve({ id: 'dpi-1' });
        },
    });

    const result = await pipeline.processMessage('create test task', {
        requestId: 'req-ai-quota',
        entryPoint: 'telegram',
        mode: 'interactive',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'quota');
    assert.match(result.confirmationText, /AI temporarily unavailable/);
    assert.equal(deferred.length, 1);
    assert.equal(deferred[0].failureType, 'ai_quota');
    assert.equal(deferred[0].userMessage, 'create test task');
});

test('AI service unavailable failure defers intent for retry', async () => {
    const deferred = [];
    const pipeline = createPipeline({
        intentExtractor: {
            extractIntents: async () => { throw new AIServiceUnavailableError('service unavailable'); },
        },
        normalizer: { normalizeActions: () => [] },
        adapter: {
            listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
            listActiveTasks: async () => [],
        },
        deferIntent: (entry) => {
            deferred.push(entry);
            return Promise.resolve({ id: 'dpi-2' });
        },
    });

    const result = await pipeline.processMessage('complete test task', {
        requestId: 'req-ai-svc',
        entryPoint: 'telegram',
        mode: 'interactive',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'quota');
    assert.match(result.confirmationText, /AI temporarily unavailable/);
    assert.equal(deferred.length, 1);
    assert.equal(deferred[0].failureType, 'ai_quota');
});

test('AI invalid key error does NOT defer intent', async () => {
    const deferred = [];
    const pipeline = createPipeline({
        intentExtractor: {
            extractIntents: async () => { throw new AIInvalidKeyError('invalid key'); },
        },
        normalizer: { normalizeActions: () => [] },
        adapter: {
            listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
            listActiveTasks: async () => [],
        },
        deferIntent: (entry) => {
            deferred.push(entry);
            return Promise.resolve({ id: 'dpi-3' });
        },
    });

    const result = await pipeline.processMessage('create invalid key task', {
        requestId: 'req-ai-key',
        entryPoint: 'telegram',
        mode: 'interactive',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'quota');
    assert.equal(deferred.length, 0);
});

test('deferred ai_quota retry respects nextAttemptAt backoff', async () => {
    // Clear any leftover deferred intents
    for (const existing of store.getDeferredPipelineIntents()) {
        await store.removeDeferredPipelineIntent(existing.id);
    }

    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const entry = {
        id: 'dpi-backoff-1',
        userMessage: 'backoff task',
        failureType: 'ai_quota',
        retryCount: 1,
        nextAttemptAt: future,
    };
    await store.appendDeferredPipelineIntent(entry);

    const pipeline = {
        processMessage: async () => ({ type: 'task', actions: [{ title: 'backoff task' }] }),
    };

    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline,
        gemini: { isQuotaExhausted: () => false },
    });

    const remaining = store.getDeferredPipelineIntents();
    assert.ok(remaining.some((e) => e.id === 'dpi-backoff-1'), 'entry should still be in store');
    assert.equal(result.retried, 0, 'should not retry before nextAttemptAt');

    // Cleanup
    await store.removeDeferredPipelineIntent('dpi-backoff-1');
});

test('deferred ai_quota retry skips when gemini quota exhausted', async () => {
    // Clear any leftover deferred intents
    for (const existing of store.getDeferredPipelineIntents()) {
        await store.removeDeferredPipelineIntent(existing.id);
    }

    const entry = {
        id: 'dpi-quota-1',
        userMessage: 'quota task',
        failureType: 'ai_quota',
        retryCount: 0,
    };
    await store.appendDeferredPipelineIntent(entry);

    const pipeline = {
        processMessage: async () => ({ type: 'task', actions: [{ title: 'quota task' }] }),
    };

    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline,
        gemini: { isQuotaExhausted: () => true },
    });

    const remaining = store.getDeferredPipelineIntents();
    assert.ok(remaining.some((e) => e.id === 'dpi-quota-1'), 'entry should still be in store');
    assert.equal(result.retried, 0, 'should not retry while quota exhausted');

    // Cleanup
    await store.removeDeferredPipelineIntent('dpi-quota-1');
});
