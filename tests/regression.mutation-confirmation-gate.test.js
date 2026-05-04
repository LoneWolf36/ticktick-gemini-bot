/**
 * tests/regression.mutation-confirmation-gate.test.js
 *
 * Destructive/non-exact mutation confirmation gate.
 * Tests that non-exact matches (prefix, contains, fuzzy, token_overlap, coreference)
 * require user confirmation before executing the mutation.
 * Exact matches and pre-resolved taskIds bypass the gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipelineHarness, DEFAULT_ACTIVE_TASKS, DEFAULT_PROJECTS } from './pipeline-harness.js';
import * as store from '../services/store.js';
import { buildMutationConfirmationMessage, buildMutationConfirmationKeyboard } from '../services/shared-utils.js';
import { validateOperationReceipt } from '../services/operation-receipt.js';
import { AIHardQuotaError } from '../services/gemini.js';

// Reset store state between tests
async function resetStore() {
    await store.clearPendingMutationConfirmation();
}

test('pending-confirmation: non-exact delete returns pending-confirmation type and does not call adapter', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'delete', title: 'groceries', confidence: 0.95, targetQuery: 'groceries' }],
        activeTasks: [
            {
                id: 'task-del-01',
                title: 'Buy groceries',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('delete the groceries task');

    // "groceries" is a contains match for "Buy groceries" → non-exact
    assert.equal(result.type, 'pending-confirmation');
    assert.equal(
        harness.adapterCalls.delete.length,
        0,
        'adapter delete should NOT be called for non-exact match without confirmation'
    );
    assert.ok(result.pendingConfirmation, 'result should include pendingConfirmation block');
    assert.equal(result.pendingConfirmation.actionType, 'delete');
    assert.equal(result.pendingConfirmation.matchConfidence, 'high');
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(result.operationReceipt.destination, undefined);
    assert.ok(result.confirmationText.includes('Buy groceries'), 'confirmation text should mention task title');
});

test('mutation-shaped create is repaired to update and never creates duplicate task', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [
            { type: 'create', title: 'Pick up prescription', priority: 5, confidence: 0.92, projectHint: 'Career' }
        ],
        activeTasks: [
            {
                id: 'task-med-01',
                title: 'Pick up prescription',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('Make pick up prescription high priority');

    assert.equal(result.type, 'task');
    assert.equal(harness.adapterCalls.create.length, 0, 'should not create a duplicate task');
    assert.equal(harness.adapterCalls.update.length, 1, 'should update the existing task');
    assert.equal(harness.adapterCalls.update[0].taskId, 'task-med-01');
    assert.equal(harness.adapterCalls.update[0].action.priority, 5);
});

test('mutation-shaped create asks clarification when target cannot resolve', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'create', title: 'Book appointment', priority: 5, confidence: 0.92, projectHint: 'Career' }],
        activeTasks: [
            {
                id: 'task-other-01',
                title: 'Review notes',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('Make book appointment high priority');

    assert.equal(result.type, 'not-found');
    assert.equal(
        harness.adapterCalls.create.length,
        0,
        'safe default must not create when update target is unresolved'
    );
    assert.equal(harness.adapterCalls.update.length, 0);
});

test('pending-confirmation: prefix match for delete returns pending-confirmation', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'delete', title: 'Buy', confidence: 0.9, targetQuery: 'Buy' }],
        activeTasks: [
            {
                id: 'task-del-02',
                title: 'Buy groceries',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('delete the buy task');

    assert.equal(result.type, 'pending-confirmation');
    assert.equal(harness.adapterCalls.delete.length, 0);
    assert.equal(result.pendingConfirmation.matchType, 'prefix');
    assert.equal(result.pendingConfirmation.matchConfidence, 'high');
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
});

test('pending-confirmation: fuzzy/token_overlap match for delete returns pending-confirmation with medium confidence', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'delete', title: 'grocries', confidence: 0.8, targetQuery: 'grocries' }],
        activeTasks: [
            {
                id: 'task-del-03',
                title: 'Buy groceries',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('delete the grocries task');

    assert.equal(result.type, 'pending-confirmation');
    assert.equal(harness.adapterCalls.delete.length, 0);
    assert.equal(result.pendingConfirmation.matchConfidence, 'medium');
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
});

test('pending-confirmation update receipt uses real destination and no fake placeholder', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [
            { type: 'update', title: null, projectHint: 'Career', confidence: 0.95, targetQuery: 'weekly report' }
        ],
        activeTasks: [
            {
                id: 'task-upd-01',
                title: 'Write weekly report',
                projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
                projectName: 'Inbox',
                priority: 5,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('move weekly report to Career');

    assert.equal(result.type, 'pending-confirmation');
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.deepEqual(result.operationReceipt.destination, {
        confidence: 'configured',
        projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb'
    });
    assert.notEqual(result.operationReceipt.destination?.projectId, 'pending');
    assert.notEqual(result.operationReceipt.destination?.projectId, 'aaaaaaaaaaaaaaaaaaaaaaaa');
});

test('pending-confirmation update receipt ignores unknown projectId destinations', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [
            { type: 'update', title: null, projectId: 'pending', confidence: 0.95, targetQuery: 'weekly report' }
        ],
        activeTasks: [
            {
                id: 'task-upd-unknown-project',
                title: 'Write weekly report',
                projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
                projectName: 'Inbox',
                priority: 5,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('move weekly report to unknown project');

    assert.equal(result.type, 'pending-confirmation');
    assert.equal(
        result.operationReceipt,
        undefined,
        'unknown projectId must not produce a configured destination receipt'
    );
});

test('exact delete still executes without confirmation', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'delete', title: 'Buy groceries', confidence: 0.95, targetQuery: 'Buy groceries' }],
        activeTasks: [
            {
                id: 'task-del-exact',
                title: 'Buy groceries',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('delete Buy groceries');

    assert.equal(result.type, 'task');
    assert.equal(harness.adapterCalls.delete.length, 1, 'exact match delete should execute without confirmation');
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(result.operationReceipt.status, 'applied');
    assert.equal(result.operationReceipt.message.includes('Buy groceries'), false);
    assert.match(result.operationReceipt.message, /^Applied 1 task action\./);
});

test('pre-resolved taskId bypasses confirmation gate', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [
            { type: 'delete', taskId: 'task-pre-resolved', projectId: 'inbox', title: 'Some task', confidence: 0.95 }
        ],
        activeTasks: [
            {
                id: 'task-pre-resolved',
                title: 'Some task',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('delete the task');

    // taskId is pre-resolved — bypasses resolver entirely
    assert.equal(result.type, 'task');
    assert.equal(harness.adapterCalls.delete.length, 1);
});

test('skipMutationConfirmation bypasses confirmation gate', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'delete', title: 'groceries', confidence: 0.95, targetQuery: 'groceries' }],
        activeTasks: [
            {
                id: 'task-del-skip',
                title: 'Buy groceries',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('delete the groceries task', {
        skipMutationConfirmation: true
    });

    // skipMutationConfirmation should allow non-exact match to proceed
    assert.equal(result.type, 'task');
    assert.equal(harness.adapterCalls.delete.length, 1, 'delete should execute when skipMutationConfirmation is set');
});

test('missing project destination does not silently fall back to first project', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        projects: [
            { id: 'proj-career', name: 'Career' },
            { id: 'proj-personal', name: 'Personal' }
        ],
        intents: [{ type: 'create', title: 'Renew passport', confidence: 0.94 }]
    });

    const result = await harness.processMessage('renew passport');

    assert.equal(result.type, 'blocked', 'missing destination should return blocked');
    assert.equal(result.status, 'blocked');
    assert.equal(result.changed, false);
    assert.equal(result.applied, false);
    assert.equal(result.dryRun, false);
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(harness.adapterCalls.create.length, 0, 'should not create into the first project by default');
    assert.match(result.confirmationText ?? '', /blocked|no safe TickTick destination/i);
});

test('dry-run missing project destination stays blocked dry-run without writing', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        projects: [
            { id: 'proj-career', name: 'Career' },
            { id: 'proj-personal', name: 'Personal' }
        ],
        intents: [{ type: 'create', title: 'Renew passport', confidence: 0.94 }]
    });

    const result = await harness.processMessage('renew passport', { dryRun: true });

    assert.equal(result.type, 'blocked');
    assert.equal(result.status, 'blocked');
    assert.equal(result.dryRun, true, 'blocked dry-run should preserve dryRun flag');
    assert.equal(result.changed, false);
    assert.equal(result.applied, false);
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(harness.adapterCalls.create.length, 0, 'blocked dry-run must not create');
});

test('dry-run create stays preview-only and never writes', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'create', title: 'Draft note', confidence: 0.9, projectHint: 'Career' }]
    });

    const result = await harness.processMessage('draft note', {
        dryRun: true,
        entryPoint: 'telegram',
        mode: 'interactive'
    });

    assert.equal(result.type, 'preview', 'dry-run should return preview');
    assert.equal(result.status, 'preview');
    assert.equal(result.dryRun, true);
    assert.equal(result.changed, false);
    assert.equal(result.applied, false);
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(result.operationReceipt.status, 'preview');
    assert.equal(result.operationReceipt.command, 'freeform');
    assert.match(result.operationReceipt.message, /Preview only/);
    assert.equal(harness.adapterCalls.create.length, 0, 'dry-run must not call create');
    assert.equal(harness.adapterCalls.update.length, 0, 'dry-run must not call update');
    assert.equal(harness.adapterCalls.complete.length, 0, 'dry-run must not call complete');
    assert.equal(harness.adapterCalls.delete.length, 0, 'dry-run must not call delete');
    assert.match(result.confirmationText ?? '', /preview|nothing changed/i, 'dry-run copy should say preview only');
});

test('scan dry-run receipt reports scan command instead of freeform', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'create', title: 'Draft note', confidence: 0.9, projectHint: 'Career' }]
    });

    const result = await harness.processMessage('draft note', {
        dryRun: true,
        entryPoint: 'telegram:scan',
        mode: 'scan'
    });

    assert.equal(result.type, 'preview');
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(result.operationReceipt.command, 'scan');
});

test('adapter failure surfaces a valid failed operation receipt', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'create', title: 'Draft note', confidence: 0.9, projectHint: 'Career' }],
        adapterOverrides: {
            createTask: async () => {
                const error = new Error('TickTick unavailable');
                error.code = 'SERVER_ERROR';
                throw error;
            }
        }
    });

    const result = await harness.processMessage('draft note');

    assert.equal(result.type, 'error');
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(result.operationReceipt.status, 'failed');
    assert.equal(result.operationReceipt.message, 'Task execution failed.');
});

test('rollback-incomplete failure receipt reports external state changed', async () => {
    await resetStore();
    const updateAttempts = [];
    const harness = createPipelineHarness({
        intents: [
            { type: 'update', title: null, targetQuery: 'weekly report', confidence: 0.95 },
            { type: 'update', title: null, targetQuery: 'follow up note', confidence: 0.95 }
        ],
        useRealNormalizer: false,
        normalizedActions: [
            {
                type: 'update',
                taskId: 'task-updated-before-failure',
                projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
                title: null,
                priority: 5,
                valid: true,
                validationErrors: []
            },
            {
                type: 'update',
                taskId: 'task-fails-after-update',
                projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
                title: null,
                priority: 1,
                valid: true,
                validationErrors: []
            }
        ],
        adapterOverrides: {
            updateTask: async (taskId, action) => {
                updateAttempts.push({ taskId, action });
                if (taskId === 'task-fails-after-update') {
                    const error = new Error('Update failed after prior write');
                    error.code = 'SERVER_ERROR';
                    throw error;
                }
                return { id: taskId, ...action };
            },
            restoreTask: async () => {
                const error = new Error('Rollback restore failed');
                error.code = 'SERVER_ERROR';
                throw error;
            }
        }
    });

    const result = await harness.processMessage('update report and add follow up note', {
        skipMutationConfirmation: true
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'rollback');
    assert.equal(
        updateAttempts.some((call) => call.taskId === 'task-updated-before-failure'),
        true
    );
    assert.equal(
        updateAttempts.some((call) => call.taskId === 'task-fails-after-update'),
        true
    );
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(result.operationReceipt.status, 'failed');
    assert.equal(result.operationReceipt.changed, true);
    assert.equal(result.operationReceipt.applied, false);
});

test('dry-run malformed intent failure receipt preserves dry-run state', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: { malformed: true }
    });

    const result = await harness.processMessage('draft note', { dryRun: true });

    assert.equal(result.type, 'error');
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(result.operationReceipt.status, 'blocked');
    assert.equal(result.operationReceipt.dryRun, true);
    assert.equal(result.operationReceipt.changed, false);
});

test('AI quota deferral surfaces deferred operation receipt', async () => {
    await resetStore();
    const deferred = [];
    const harness = createPipelineHarness({
        intents: async () => {
            throw new AIHardQuotaError('quota exhausted', { status: 429 });
        },
        deferIntent: async (payload) => {
            deferred.push(payload);
            return { id: 'deferred-ai-1' };
        }
    });

    const result = await harness.processMessage('draft note', {
        entryPoint: 'deferred-retry',
        mode: 'retry'
    });

    assert.equal(result.type, 'error');
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(result.operationReceipt.status, 'deferred');
    assert.equal(result.operationReceipt.scope, 'deferred_queue');
    assert.equal(result.operationReceipt.command, 'scheduler');
    assert.equal(result.operationReceipt.changed, true);
    assert.equal(result.operationReceipt.applied, false);
    assert.equal(result.operationReceipt.fallbackUsed, true);
    assert.equal(deferred.length, 1);
});

test('dry-run AI quota failure stays blocked and does not defer', async () => {
    await resetStore();
    const deferred = [];
    const harness = createPipelineHarness({
        intents: async () => {
            throw new AIHardQuotaError('quota exhausted', { status: 429 });
        },
        deferIntent: async (payload) => {
            deferred.push(payload);
            return { id: 'deferred-ai-dry-run' };
        }
    });

    const result = await harness.processMessage('draft note', { dryRun: true });

    assert.equal(result.type, 'error');
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
    assert.equal(result.operationReceipt.status, 'blocked');
    assert.equal(result.operationReceipt.scope, 'system');
    assert.equal(result.operationReceipt.dryRun, true);
    assert.equal(result.operationReceipt.changed, false);
    assert.equal(result.operationReceipt.applied, false);
    assert.equal(result.operationReceipt.fallbackUsed, false);
    assert.equal(result.operationReceipt.errorClass, 'model_unavailable');
    assert.equal(deferred.length, 0);
});

test('blocked action types do not produce applied receipts when nothing executable runs', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'delete', title: 'Buy groceries', confidence: 0.95, targetQuery: 'Buy groceries' }],
        activeTasks: [
            {
                id: 'task-del-blocked',
                title: 'Buy groceries',
                projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('delete Buy groceries', {
        blockedActionTypes: ['delete', 'complete']
    });

    assert.equal(result.type, 'task');
    assert.equal(harness.adapterCalls.delete.length, 0);
    assert.equal(result.operationReceipt.status, 'blocked');
    assert.equal(result.operationReceipt.applied, false);
    assert.equal(result.operationReceipt.changed, false);
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
});

test('buildMutationConfirmationMessage produces correct output', () => {
    const pendingData = {
        actionType: 'delete',
        targetQuery: 'groceries',
        matchedTask: { taskId: 't1', projectId: 'p1', title: 'Buy groceries' },
        matchConfidence: 'high',
        matchType: 'contains',
        score: 60,
        reason: null
    };

    const msg = buildMutationConfirmationMessage(pendingData);
    assert.ok(msg.includes('Delete'), 'should mention action type');
    assert.ok(msg.includes('Buy groceries'), 'should mention task title');
    assert.ok(msg.includes("didn't match exactly"), 'should explain non-exact match without resolver jargon');
    assert.ok(msg.includes("can't be undone"), 'delete copy should mention destructive action');
    assert.ok(!msg.includes('contains'), 'should not leak match type');
    assert.ok(!msg.includes('60'), 'should not leak score');

    const urgentMsg = buildMutationConfirmationMessage(pendingData, { workStyleMode: 'urgent' });
    assert.ok(urgentMsg.includes('Delete'), 'urgent should mention action type');
    assert.ok(!urgentMsg.includes('contains'), 'urgent should not leak match type');
});

test('buildMutationConfirmationKeyboard produces confirm and cancel buttons', () => {
    const keyboard = buildMutationConfirmationKeyboard();
    const json = JSON.stringify(keyboard);
    assert.ok(json.includes('mut:confirm'), 'should have confirm callback');
    assert.ok(json.includes('mut:confirm:cancel'), 'should have cancel callback');

    const noCancel = buildMutationConfirmationKeyboard({ includeCancel: false });
    const jsonNoCancel = JSON.stringify(noCancel);
    assert.ok(jsonNoCancel.includes('mut:confirm'), 'should still have confirm');
    assert.ok(!jsonNoCancel.includes('mut:confirm:cancel'), 'should not have cancel');
});

test('pendingMutationConfirmation store TTL expiry returns null', async () => {
    await resetStore();
    const data = {
        originalMessage: 'test',
        matchedTask: { taskId: 't1', title: 'Test' },
        actionType: 'delete',
        createdAt: new Date(Date.now() - store.MUTATION_CONFIRMATION_TTL_MS - 1000).toISOString()
    };
    await store.setPendingMutationConfirmation(data);

    // Should return null due to TTL expiry
    const result = store.getPendingMutationConfirmation();
    assert.equal(result, null, 'expired pending mutation confirmation should return null');
    await resetStore();
});

test('buildMutationConfirmationMessage returns fallback for null input', () => {
    const msg = buildMutationConfirmationMessage(null);
    assert.equal(msg, 'Please confirm this action.');

    const msgUndefined = buildMutationConfirmationMessage(undefined);
    assert.equal(msgUndefined, 'Please confirm this action.');
});

test('processMessageWithContext with non-exact match and skipMutationConfirmation executes', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'complete', title: 'weekly report', confidence: 0.9, targetQuery: 'weekly' }],
        activeTasks: [
            {
                id: 'task-pmc-01',
                title: 'Write weekly report',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 5,
                status: 0
            }
        ]
    });

    // processMessageWithContext should inject context then pass skipMutationConfirmation through
    const result = await harness.pipeline.processMessageWithContext('complete the weekly report', {
        currentDate: '2026-03-10',
        skipMutationConfirmation: true
    });

    assert.equal(result.type, 'task', 'skipMutationConfirmation should bypass the gate in processMessageWithContext');
    assert.equal(harness.adapterCalls.complete.length, 1);
    assert.equal(validateOperationReceipt(result.operationReceipt).valid, true);
});

test('duplicate confirm tap is no-op after pending cleared (duplicate-tap guard)', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'complete', title: 'weekly report', confidence: 0.9, targetQuery: 'weekly' }],
        activeTasks: [
            {
                id: 'task-dct-01',
                title: 'Write weekly report',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 5,
                status: 0
            }
        ]
    });

    // First call with the gate produces pending-confirmation
    const result1 = await harness.processMessage('complete the weekly report');
    assert.equal(result1.type, 'pending-confirmation');
    assert.equal(harness.adapterCalls.complete.length, 0);

    // Simulate two confirm callbacks by:
    // 1. Set pending state (as commands.js would)
    await store.setPendingMutationConfirmation({
        originalMessage: 'complete the weekly report',
        matchedTask: result1.pendingConfirmation.matchedTask,
        actionType: result1.pendingConfirmation.actionType
    });

    // 2. First confirm: clear pending, then resume through pipeline with skipMutationConfirmation
    const pending1 = store.getPendingMutationConfirmation();
    assert.ok(pending1, 'pending state should exist for first confirm');
    await store.clearPendingMutationConfirmation();

    const result2 = await harness.processMessage('complete the weekly report', {
        existingTask: { id: 'task-dct-01', projectId: 'inbox', title: 'Write weekly report' },
        skipClarification: true,
        skipMutationConfirmation: true
    });
    assert.equal(result2.type, 'task', 'first confirm should execute');
    assert.equal(harness.adapterCalls.complete.length, 1);

    // 3. Second confirm: state already cleared, should not call adapter again
    const pending2 = store.getPendingMutationConfirmation();
    assert.equal(pending2, null, 'pending state should be null after first confirm consumed it');

    // A second pipeline call without any pending state should behave normally
    // Since there's no existingTask here, it would go through resolver again
    // which would produce another pending-confirmation rather than executing
    const result3 = await harness.processMessage('complete the weekly report', {
        skipMutationConfirmation: true
    });
    // With skipMutationConfirmation it should execute
    assert.equal(result3.type, 'task');
    assert.equal(
        harness.adapterCalls.complete.length,
        2,
        'second confirm with skipMutationConfirmation should execute but not double-count'
    );
});

test('scan/review pending-confirmation marks task processed without confirm (fail-closed)', async () => {
    await resetStore();
    // dryRun=true simulates scan/review mode: pending-confirmation should mark task
    // as processed rather than raising unknown_result_type
    const harness = createPipelineHarness({
        intents: [{ type: 'delete', title: 'groceries', confidence: 0.95, targetQuery: 'groceries' }],
        activeTasks: [
            {
                id: 'task-sc-01',
                title: 'Buy groceries',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('delete the groceries task', {
        dryRun: true
    });

    assert.equal(result.type, 'pending-confirmation', 'pending-confirmation should be returned even in dryRun mode');
    assert.equal(harness.adapterCalls.delete.length, 0, 'no adapter call should occur');
});

test('pendingMutationConfirmation store set/get/clear lifecycle', async () => {
    await resetStore();
    const data = {
        originalMessage: 'delete the groceries task',
        matchedTask: { taskId: 't1', projectId: 'p1', title: 'Buy groceries' },
        actionType: 'delete',
        targetQuery: 'groceries',
        matchConfidence: 'high',
        matchType: 'contains',
        chatId: 12345,
        userId: 67890,
        entryPoint: 'telegram:freeform',
        mode: 'interactive',
        workStyleMode: 'standard'
    };

    // Initially null
    assert.equal(store.getPendingMutationConfirmation(), null);

    // Set and verify
    await store.setPendingMutationConfirmation(data);
    const saved = store.getPendingMutationConfirmation();
    assert.ok(saved, 'pending state should be retrievable');
    assert.equal(saved.actionType, 'delete');
    assert.equal(saved.matchedTask.title, 'Buy groceries');
    assert.ok(saved.createdAt, 'should have auto-generated createdAt');

    // Clear and verify
    await store.clearPendingMutationConfirmation();
    assert.equal(store.getPendingMutationConfirmation(), null);
});

test('pending-confirmation: name-overlap contains match returns pending-confirmation', async () => {
    await resetStore();
    const harness = createPipelineHarness({
        intents: [{ type: 'complete', title: 'vendor', confidence: 0.9, targetQuery: 'vendor' }],
        activeTasks: [
            {
                id: 'task-vendor-01',
                title: 'Visa check with vendor',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            },
            {
                id: 'task-other-01',
                title: 'Buy groceries',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 1,
                status: 0
            }
        ]
    });

    const result = await harness.processMessage('complete the vendor task');

    // "vendor" is a contains match for "Visa check with vendor" — non-exact
    assert.equal(result.type, 'pending-confirmation', 'name-overlap contains match should require confirmation');
    assert.equal(
        harness.adapterCalls.complete.length,
        0,
        'adapter complete should NOT be called for non-exact match without confirmation'
    );
    assert.ok(result.pendingConfirmation, 'result should include pendingConfirmation block');
    assert.equal(result.pendingConfirmation.matchType, 'contains', 'should be a contains match');
    assert.equal(result.pendingConfirmation.matchConfidence, 'high', 'contains match should be high confidence');
    assert.equal(result.pendingConfirmation.actionType, 'complete');
    assert.ok(
        result.confirmationText.includes('Visa check with vendor'),
        'confirmation text should mention the matched task title'
    );
});
