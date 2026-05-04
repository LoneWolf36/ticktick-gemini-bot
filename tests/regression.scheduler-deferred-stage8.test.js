import test from 'node:test';
import assert from 'node:assert/strict';
import { retryDeferredIntents } from '../services/scheduler.js';
import { validateOperationReceipt } from '../services/operation-receipt.js';
import { persistPipelineUndoEntries } from '../services/pipeline-undo-persistence.js';

function makeStore(overrides = {}) {
    const deferred = overrides.deferred ?? [];
    const removed = [];
    const updated = [];
    const failed = [];
    const messages = [];
    return {
        removed,
        updated,
        failed,
        messages,
        getDeferredPipelineIntents: () => deferred,
        removeDeferredPipelineIntent: async (id) => removed.push(id),
        updateDeferredPipelineIntent: async (entry) => updated.push(structuredClone(entry)),
        addFailedDeferredIntent: async (entry) => failed.push(structuredClone(entry)),
        getChatId: () => 'chat-1',
        addUndoEntry: overrides.addUndoEntry,
        ...overrides
    };
}

function makeBot(messages) {
    return {
        api: {
            sendMessage: async (_chatId, text) => {
                messages.push(text);
            }
        }
    };
}

test('deferred retry success persists undo and redacts notification', async () => {
    const messages = [];
    const undoEntries = [];
    const store = makeStore({
        deferred: [{ id: 'deferred-1', userMessage: 'Secret raw request title', retryCount: 0, userId: 'user-9' }],
        addUndoEntry: async (entry) => {
            undoEntries.push(entry);
        }
    });

    const result = await retryDeferredIntents(
        {
            adapter: { listActiveTasks: async () => [] },
            store,
            pipeline: {
                processMessageWithContext: async () => ({
                    type: 'task',
                    results: [
                        {
                            status: 'succeeded',
                            action: { type: 'create', title: 'Hidden title' },
                            rollbackStep: {
                                type: 'delete_created',
                                targetTaskId: 'task-1',
                                payload: { snapshot: { title: 'Hidden title' } }
                            }
                        }
                    ],
                    operationReceipt: {
                        status: 'applied',
                        scope: 'ticktick_live',
                        command: 'scheduler',
                        operationType: 'create',
                        nextAction: 'none',
                        changed: true,
                        dryRun: false,
                        applied: true,
                        fallbackUsed: false,
                        message: 'Applied',
                        traceId: 'trace-1',
                        results: [{ status: 'succeeded' }]
                    }
                })
            },
            bot: makeBot(messages),
            gemini: {}
        },
        { maxRetries: 1 }
    );

    assert.equal(result.retried, 1);
    assert.equal(store.removed.length, 1);
    assert.equal(undoEntries.length, 1);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Deferred Retry/);
    assert.match(messages[0], /Undo available/);
    assert.ok(!messages[0].includes('Secret raw request title'));
    assert.ok(!messages[0].includes('Hidden title'));
});

test('deferred retry terminal failure redacts DLQ and notification', async () => {
    const messages = [];
    const store = makeStore({
        deferred: [
            { id: 'deferred-2', userMessage: 'Sensitive user message', retryCount: 3, failure: { summary: 'boom' } }
        ]
    });

    const result = await retryDeferredIntents(
        {
            adapter: { listActiveTasks: async () => [] },
            store,
            pipeline: { processMessageWithContext: async () => ({ type: 'info', message: 'nope' }) },
            bot: makeBot(messages),
            gemini: {}
        },
        { maxRetries: 1 }
    );

    assert.equal(result.givenUp, 1);
    assert.equal(store.removed.length, 1);
    assert.equal(store.failed.length, 1);
    assert.deepEqual(store.failed[0].id, 'deferred-2');
    assert.ok(!JSON.stringify(store.failed[0]).includes('Sensitive user message'));
    assert.ok(!JSON.stringify(store.failed[0]).includes('boom'));
    assert.ok(!('failure' in store.failed[0]));
    assert.ok(!('userMessage' in store.failed[0]));
    assert.ok(
        [
            'exhausted_retries',
            'invalid_receipt',
            'exception',
            'invalid_entry',
            'not_due',
            'quota_exhausted',
            'deferred_retry_failed'
        ].includes(store.failed[0].reason)
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0], /failed after retries/i);
    assert.ok(!messages[0].includes('Sensitive user message'));
});

test('deferred retry invalid receipt backs off or DLQs without success notification', async () => {
    const messages = [];
    const store = makeStore({
        deferred: [{ id: 'deferred-3', userMessage: 'Another sensitive request', retryCount: 1 }]
    });

    const result = await retryDeferredIntents(
        {
            adapter: { listActiveTasks: async () => [] },
            store,
            pipeline: {
                processMessageWithContext: async () => ({
                    type: 'task',
                    results: [{ status: 'succeeded', action: { type: 'create', title: 'Hidden' } }],
                    operationReceipt: {
                        status: 'failed',
                        scope: 'system',
                        command: 'scheduler',
                        operationType: 'none',
                        nextAction: 'retry',
                        changed: false,
                        dryRun: false,
                        applied: false,
                        fallbackUsed: false,
                        message: 'invalid',
                        traceId: 'trace-2'
                    }
                })
            },
            bot: makeBot(messages),
            gemini: {}
        },
        { maxRetries: 1 }
    );

    assert.equal(result.retried, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.givenUp, 0);
    assert.equal(store.removed.length, 1);
    assert.equal(store.failed.length, 1);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /could not be processed/i);
    assert.ok(!messages[0].includes('Another sensitive request'));
});

test('canonical receipt validator rejects sensitive fields and invalid applied receipts', () => {
    const invalid = validateOperationReceipt({
        status: 'applied',
        scope: 'ticktick_live',
        command: 'scheduler',
        operationType: 'create',
        nextAction: 'none',
        changed: true,
        dryRun: false,
        applied: true,
        fallbackUsed: false,
        message: 'Applied',
        traceId: 'trace-1',
        userMessage: 'secret',
        results: []
    });

    assert.equal(invalid.valid, false);
    assert.match(invalid.errors.join('\n'), /succeeded result/);
    assert.match(invalid.errors.join('\n'), /userMessage/);
});

test('deferred retry and undo persistence logs stay redacted', async () => {
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => {
        errors.push(args.join(' '));
    };

    try {
        await retryDeferredIntents(
            {
                adapter: { listActiveTasks: async () => [] },
                store: makeStore({ deferred: [{ id: 'deferred-4', userMessage: 'Redacted request', retryCount: 0 }] }),
                pipeline: {
                    processMessageWithContext: async () => {
                        throw new TypeError('secret boom');
                    }
                },
                bot: makeBot([]),
                gemini: {}
            },
            { maxRetries: 1 }
        );

        await persistPipelineUndoEntries({
            result: {
                results: [
                    {
                        status: 'succeeded',
                        rollbackStep: {
                            type: 'delete_created',
                            targetTaskId: 'task-9',
                            payload: { snapshot: { title: 'Hidden task' } }
                        }
                    }
                ]
            },
            store: {
                addUndoEntry: async () => {
                    throw new RangeError('undo secret');
                }
            }
        });
    } finally {
        console.error = originalError;
    }

    assert.ok(errors.some((line) => /Deferred retry failed unexpectedly: TypeError/.test(line)));
    assert.ok(errors.some((line) => /PipelineUndoPersistence] undo persistence failed: RangeError/.test(line)));
    assert.ok(errors.every((line) => !line.includes('secret boom')));
    assert.ok(errors.every((line) => !line.includes('undo secret')));
});
