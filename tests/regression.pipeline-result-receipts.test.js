import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFreeformPipelineResultReceipt } from '../bot/pipeline-result-receipts.js';
import { buildFreeformReceipt } from '../services/shared-utils.js';

test('freeform receipt helper persists undo entries and adds undo button only on success', async () => {
    const stored = [];
    const result = {
        type: 'task',
        dryRun: false,
        confirmationText: 'Done.',
        results: [
            {
                status: 'succeeded',
                action: { type: 'create', title: 'Write report' },
                rollbackStep: {
                    type: 'delete_created',
                    targetTaskId: 'task-1',
                    payload: { snapshot: { title: 'Write report' } }
                }
            }
        ]
    };

    const receipt = await buildFreeformPipelineResultReceipt({
        result,
        userId: 'user-1',
        projects: [],
        store: {
            addUndoEntry: async (entry) => stored.push(entry)
        }
    });

    assert.equal(receipt.undoCount, 1);
    assert.match(receipt.text, /Created/);
    assert.ok(receipt.replyExtra.reply_markup, 'undo keyboard expected');
    assert.equal(stored[0].userId, 'user-1');
    assert.equal(stored[0].batchId.startsWith('undo_'), true);
});

test('freeform receipt helper suppresses undo button when persistence fails', async () => {
    const result = {
        type: 'task',
        dryRun: false,
        confirmationText: 'Done.',
        results: [
            {
                status: 'succeeded',
                action: { type: 'delete', title: 'Secret task' },
                rollbackStep: {
                    type: 'restore_updated',
                    targetTaskId: 'task-2',
                    payload: { snapshot: { title: 'Secret task' } }
                }
            }
        ]
    };

    const receipt = await buildFreeformPipelineResultReceipt({
        result,
        store: {
            addUndoEntry: async () => {
                throw new Error('write failed');
            }
        }
    });

    assert.equal(receipt.undoCount, 0);
    assert.equal(receipt.replyExtra.reply_markup, undefined);
    assert.match(receipt.text, /Deleted/);
});

test('freeform receipt helper keeps undo button when some rollback entries persist', async () => {
    const stored = [];
    const result = {
        type: 'task',
        dryRun: false,
        confirmationText: 'Done.',
        results: [
            {
                status: 'succeeded',
                action: { type: 'update', title: 'First task' },
                rollbackStep: {
                    type: 'restore_updated',
                    targetTaskId: 'task-3',
                    payload: { snapshot: { title: 'First task' } }
                }
            },
            {
                status: 'succeeded',
                action: { type: 'update', title: 'Second task' },
                rollbackStep: {
                    type: 'restore_updated',
                    targetTaskId: 'task-4',
                    payload: { snapshot: { title: 'Second task' } }
                }
            }
        ]
    };

    const receipt = await buildFreeformPipelineResultReceipt({
        result,
        store: {
            addUndoEntry: async (entry) => {
                stored.push(entry);
                if (stored.length === 1) return;
                throw new Error('second write failed');
            }
        }
    });

    assert.equal(receipt.undoCount, 1);
    assert.ok(receipt.replyExtra.reply_markup, 'undo keyboard expected after partial success');
    assert.equal(stored.length, 2);
});

test('freeform receipt helper stays safe on dry run', async () => {
    const receipt = await buildFreeformPipelineResultReceipt({
        result: {
            type: 'task',
            dryRun: true,
            confirmationText: 'Done.',
            results: [
                {
                    status: 'succeeded',
                    action: { type: 'create', title: 'Preview task' },
                    rollbackStep: {
                        type: 'delete_created',
                        targetTaskId: 'task-5',
                        payload: { snapshot: { title: 'Preview task' } }
                    }
                }
            ]
        },
        store: {
            addUndoEntry: async () => {
                throw new Error('should not run');
            }
        }
    });

    assert.match(receipt.text, /preview/i);
    assert.equal(receipt.undoCount, 0);
    assert.equal(receipt.replyExtra.reply_markup, undefined);
});

test('freeform receipt helper omits undo affordance without rollback step', async () => {
    const receipt = await buildFreeformPipelineResultReceipt({
        result: {
            type: 'task',
            dryRun: false,
            confirmationText: 'Done.',
            results: [{ status: 'succeeded', action: { type: 'complete', title: 'Do thing' }, rollbackStep: null }]
        },
        store: {
            addUndoEntry: async () => {
                throw new Error('should not run');
            }
        }
    });

    assert.equal(receipt.undoCount, 0);
    assert.equal(receipt.replyExtra.reply_markup, undefined);
    assert.match(receipt.text, /Completed/);
});

test('freeform receipt includes verification warning without leaking raw errors', () => {
    const text = buildFreeformReceipt({
        results: [
            {
                status: 'succeeded',
                verified: false,
                verificationNote: 'Verification failed: repeatFlag mismatch',
                action: { type: 'update' },
                rollbackStep: { payload: { snapshot: { title: 'Hidden task', repeatFlag: 'FREQ=DAILY' } } }
            }
        ]
    });

    assert.match(text, /Verification did not confirm this change in TickTick/);
    assert.doesNotMatch(text, /RRULE/);
});

test('freeform receipt omits title diff when update title missing', () => {
    const text = buildFreeformReceipt({
        results: [
            {
                status: 'succeeded',
                action: { type: 'update' },
                rollbackStep: { payload: { snapshot: { title: 'Task name', repeatFlag: 'RRULE:FREQ=DAILY' } } }
            }
        ]
    });

    assert.doesNotMatch(text, /Task name" →/);
    assert.doesNotMatch(text, /RRULE/);
});

test('freeform receipt warns when verification is unavailable', () => {
    const text = buildFreeformReceipt({
        results: [
            {
                status: 'succeeded',
                result: { verified: false, verificationNote: 'Verification skipped due to fetch error: timeout' },
                action: { type: 'update' },
                rollbackStep: { payload: { snapshot: { title: 'Hidden task' } } }
            }
        ]
    });

    assert.match(text, /verification unavailable/);
    assert.doesNotMatch(text, /timeout/);
});
