import test from 'node:test';
import assert from 'node:assert/strict';

import {
    assertValidOperationReceipt,
    OPERATION_RECEIPT_VALUES,
    formatBusyLockMessage,
    validateOperationReceipt,
} from '../services/operation-receipt.js';

const baseReceipt = Object.freeze({
    status: 'blocked',
    scope: 'system',
    changed: false,
    command: 'scan',
    operationType: 'scan',
    nextAction: 'wait',
    message: 'Blocked until current operation finishes.',
    traceId: 'trace-123',
    dryRun: false,
    applied: false,
    fallbackUsed: false,
});

function receipt(overrides = {}) {
    return { ...baseReceipt, ...overrides };
}

test('operation receipt exposes canonical stage-one vocabulary', () => {
    assert.deepEqual(OPERATION_RECEIPT_VALUES.statuses, [
        'preview',
        'applied',
        'pending_confirmation',
        'blocked',
        'deferred',
        'failed',
        'busy',
    ]);
    assert.ok(OPERATION_RECEIPT_VALUES.scopes.includes('ticktick_live'));
    assert.ok(OPERATION_RECEIPT_VALUES.scopes.includes('local_review_queue'));
    assert.ok(OPERATION_RECEIPT_VALUES.destinationConfidence.includes('ambiguous'));
    assert.ok(OPERATION_RECEIPT_VALUES.errorClasses.includes('stale_preview'));
});

test('operation receipt accepts valid blocked and applied outcomes', () => {
    assert.deepEqual(validateOperationReceipt(receipt()), { valid: true, errors: [] });

    const applied = receipt({
        status: 'applied',
        scope: 'ticktick_live',
        changed: true,
        operationType: 'update',
        nextAction: 'none',
        applied: true,
        results: [{ status: 'succeeded' }],
    });

    assert.equal(validateOperationReceipt(applied).valid, true);
    assert.equal(assertValidOperationReceipt(applied), applied);
});

test('operation receipt requires message trace id and fallback flag', () => {
    const result = validateOperationReceipt(receipt({
        message: '',
        traceId: '',
        fallbackUsed: 'no',
    }));

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /message must be a non-empty string/);
    assert.match(result.errors.join('\n'), /traceId must be a non-empty string/);
    assert.match(result.errors.join('\n'), /fallbackUsed must be boolean/);
});

test('operation receipt rejects unknown vocabulary values', () => {
    const result = validateOperationReceipt(receipt({
        status: 'done',
        scope: 'cache',
        operationType: 'move_fast',
        nextAction: 'guess',
        errorClass: 'raw_error',
        destination: { confidence: 'probably' },
    }));

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /status must be one of/);
    assert.match(result.errors.join('\n'), /scope must be one of/);
    assert.match(result.errors.join('\n'), /operationType must be one of/);
    assert.match(result.errors.join('\n'), /nextAction must be one of/);
    assert.match(result.errors.join('\n'), /errorClass must be a known value/);
    assert.match(result.errors.join('\n'), /destination\.confidence must be a known value/);
});

test('operation receipt rejects dry-run or unchanged applied outcomes', () => {
    const dryRunApplied = validateOperationReceipt(receipt({
        status: 'applied',
        changed: true,
        dryRun: true,
        applied: true,
    }));
    assert.equal(dryRunApplied.valid, false);
    assert.match(dryRunApplied.errors.join('\n'), /dryRun receipts cannot be applied/);

    const unchangedApplied = validateOperationReceipt(receipt({
        status: 'applied',
        changed: false,
        applied: true,
    }));
    assert.equal(unchangedApplied.valid, false);
    assert.match(unchangedApplied.errors.join('\n'), /applied receipts require changed=true/);
    assert.match(unchangedApplied.errors.join('\n'), /changed=false cannot use applied status/);

    const missingSucceededResult = validateOperationReceipt(receipt({
        status: 'applied',
        changed: true,
        applied: true,
        scope: 'ticktick_live',
        results: [{ status: 'failed' }],
    }));
    assert.equal(missingSucceededResult.valid, false);
    assert.match(missingSucceededResult.errors.join('\n'), /at least one succeeded result/);
});

test('operation receipt rejects applied outcomes outside live exact or configured destinations', () => {
    const wrongScope = validateOperationReceipt(receipt({
        status: 'applied',
        scope: 'local_review_queue',
        changed: true,
        applied: true,
        results: [{ status: 'succeeded' }],
    }));
    assert.equal(wrongScope.valid, false);
    assert.match(wrongScope.errors.join('\n'), /applied receipts must describe ticktick_live scope/);

    for (const confidence of ['ambiguous', 'missing']) {
        const result = validateOperationReceipt(receipt({
            status: 'applied',
            scope: 'ticktick_live',
            changed: true,
            applied: true,
            results: [{ status: 'succeeded' }],
            destination: { confidence },
        }));
        assert.equal(result.valid, false, `${confidence} destination should not apply`);
        assert.match(result.errors.join('\n'), /applied receipts require exact or configured destination confidence/);
    }
});

test('busy lock copy is consistent across surfaces', () => {
    const copy = formatBusyLockMessage({ owner: 'bot:scan', acquiredAt: 1700000000000 }, 'Scan');
    assert.equal(copy, '⏳ Scan busy: bot:scan since 2023-11-14T22:13:20.000Z. Try again in a moment.');
});

test('operation receipt enforces pending-confirmation details without marking changes applied', () => {
    const missingDetails = validateOperationReceipt(receipt({
        status: 'pending_confirmation',
        operationType: 'update',
        nextAction: 'apply',
    }));
    assert.equal(missingDetails.valid, false);
    assert.match(missingDetails.errors.join('\n'), /confirmation details/);
    assert.match(missingDetails.errors.join('\n'), /proposed destination/);

    const valid = validateOperationReceipt(receipt({
        status: 'pending_confirmation',
        operationType: 'update',
        nextAction: 'apply',
        destination: {
            confidence: 'ambiguous',
            choices: [
                { projectId: 'proj-1', projectName: 'Inbox' },
                { projectId: 'proj-2', projectName: 'Planning' },
            ],
        },
        confirmation: {
            target: { taskId: 'task-1' },
            outcome: 'Confirm project before updating task.',
        },
    }));
    assert.equal(valid.valid, true);

    const emptyTarget = validateOperationReceipt(receipt({
        status: 'pending_confirmation',
        operationType: 'update',
        nextAction: 'apply',
        destination: { confidence: 'configured', projectId: 'proj-1' },
        confirmation: {
            target: {},
            outcome: 'Confirm project before updating task.',
        },
    }));
    assert.equal(emptyTarget.valid, false);
    assert.match(emptyTarget.errors.join('\n'), /target requires a safe identifier/);

    const ambiguousWithoutChoices = validateOperationReceipt(receipt({
        status: 'pending_confirmation',
        operationType: 'create',
        nextAction: 'apply',
        destination: { confidence: 'ambiguous' },
        confirmation: {
            target: { previewId: 'preview-1' },
            outcome: 'Choose a destination before creating task.',
        },
    }));
    assert.equal(ambiguousWithoutChoices.valid, false);
    assert.match(ambiguousWithoutChoices.errors.join('\n'), /ambiguous destinations require destination\.choices/);

    const missingDestination = validateOperationReceipt(receipt({
        status: 'pending_confirmation',
        operationType: 'update',
        nextAction: 'apply',
        destination: { confidence: 'missing' },
        confirmation: {
            target: { taskId: 'task-1' },
            outcome: 'Choose a destination before updating task.',
        },
    }));
    assert.equal(missingDestination.valid, false);
    assert.match(missingDestination.errors.join('\n'), /cannot use missing destination confidence/);
});

test('operation receipt restricts dry-run statuses to preview or blocked', () => {
    assert.equal(validateOperationReceipt(receipt({
        status: 'preview',
        scope: 'preview',
        dryRun: true,
        nextAction: 'apply',
    })).valid, true);

    const result = validateOperationReceipt(receipt({
        status: 'deferred',
        scope: 'deferred_queue',
        dryRun: true,
        nextAction: 'wait',
    }));

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /dryRun receipts must have preview or blocked status/);
});

test('operation receipt requires safe next actions for blocked deferred failed and busy states', () => {
    for (const status of ['blocked', 'deferred', 'failed', 'busy']) {
        const result = validateOperationReceipt(receipt({ status, nextAction: 'apply' }));
        assert.equal(result.valid, false, `${status} should reject apply nextAction`);
        assert.match(result.errors.join('\n'), new RegExp(`${status} status requires`));
    }

    for (const status of ['blocked', 'deferred', 'failed', 'busy']) {
        const result = validateOperationReceipt(receipt({ status, nextAction: 'wait' }));
        assert.equal(result.valid, true, `${status} should accept wait nextAction`);
    }
});

test('operation receipt rejects raw private task or user text fields', () => {
    const result = validateOperationReceipt(receipt({
        metadata: {
            title: 'raw task title',
            nested: {
                content: 'raw task notes',
                messageText: 'raw user command',
                targetQuery: 'what the user typed',
            },
        },
    }));

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /metadata\.title/);
    assert.match(result.errors.join('\n'), /metadata\.nested\.content/);
    assert.match(result.errors.join('\n'), /metadata\.nested\.messageText/);
    assert.match(result.errors.join('\n'), /metadata\.nested\.targetQuery/);
});

test('operation receipt rejects raw rollback snapshots inside the receipt', () => {
    const result = validateOperationReceipt(receipt({
        rollback: {
            type: 'restore_updated',
            payload: {
                snapshot: {
                    title: 'raw previous title',
                    content: 'raw previous notes',
                },
            },
        },
    }));

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /rollback\.payload\.snapshot\.title/);
    assert.match(result.errors.join('\n'), /rollback\.payload\.snapshot\.content/);
});

test('operation receipt assertion throws with invariant details', () => {
    assert.throws(
        () => assertValidOperationReceipt(receipt({ status: 'applied', changed: false, applied: true })),
        /Invalid operation receipt:.*applied receipts require changed=true/s,
    );
});
