import test from 'node:test';
import assert from 'node:assert/strict';

import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import { createPipeline } from '../services/pipeline.js';
import { createPipelineObservability } from '../services/pipeline-observability.js';

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
        axIntent: {
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
        axIntent: {
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
});

test('R11 pipeline surfaces typed adapter failures without leaking API internals', async () => {
    async function runScenario(adapterError) {
        const pipeline = createPipeline({
            axIntent: {
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
