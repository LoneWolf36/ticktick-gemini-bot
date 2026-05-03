const STATUSES = Object.freeze([
    'preview',
    'applied',
    'pending_confirmation',
    'blocked',
    'deferred',
    'failed',
    'busy',
]);

const SCOPES = Object.freeze([
    'ticktick_live',
    'local_review_queue',
    'preview',
    'deferred_queue',
    'system',
]);

const COMMANDS = Object.freeze([
    'scan',
    'pending',
    'status',
    'review',
    'freeform',
    'scheduler',
    'callback',
]);

const OPERATION_TYPES = Object.freeze([
    'create',
    'update',
    'complete',
    'delete',
    'review',
    'scan',
    'sync',
    'none',
]);

const NEXT_ACTIONS = Object.freeze([
    'apply',
    'edit',
    'skip',
    'retry',
    'wait',
    'resync',
    'none',
]);

const ERROR_CLASSES = Object.freeze([
    'validation',
    'auth',
    'ticktick_unavailable',
    'model_unavailable',
    'routing',
    'stale_preview',
    'lock',
    'unknown',
]);

const DESTINATION_CONFIDENCE = Object.freeze([
    'exact',
    'configured',
    'ambiguous',
    'missing',
]);

const NON_APPLIED_STATUSES = new Set(['preview', 'pending_confirmation', 'blocked', 'deferred', 'failed', 'busy']);
const SAFE_WAIT_ACTIONS = new Set(['retry', 'wait', 'resync', 'none']);
const SAFE_TARGET_IDENTIFIER_KEYS = new Set(['taskId', 'previewId', 'candidateId', 'targetId', 'referenceId']);
const RAW_PRIVATE_FIELD_NAMES = new Set([
    'title',
    'content',
    'desc',
    'description',
    'originalTitle',
    'originalContent',
    'targetQuery',
    'existingTaskContent',
    'messageText',
    'userMessage',
    'rawText',
    'checklistItems',
    'checklistText',
]);

/**
 * OperationReceipt is the shared outcome contract for user-visible operation state.
 * It describes what happened after execution logic has already decided the outcome;
 * it must not own orchestration, routing, or mutation decisions.
 */
export const OPERATION_RECEIPT_VALUES = Object.freeze({
    statuses: STATUSES,
    scopes: SCOPES,
    commands: COMMANDS,
    operationTypes: OPERATION_TYPES,
    nextActions: NEXT_ACTIONS,
    errorClasses: ERROR_CLASSES,
    destinationConfidence: DESTINATION_CONFIDENCE,
});

/**
 * Format conservative user-facing copy for a busy intake lock.
 * @param {object} lockStatus Intake lock status.
 * @param {string} [lockStatus.owner] Lock owner label.
 * @param {number} [lockStatus.acquiredAt] Lock acquisition timestamp.
 * @param {string} [label='operation'] Human-readable surface label.
 * @returns {string}
 */
export function formatBusyLockMessage(lockStatus = {}, label = 'operation') {
    const owner = typeof lockStatus.owner === 'string' && lockStatus.owner.trim().length > 0
        ? lockStatus.owner.trim()
        : 'another operation';
    const acquiredAt = Number.isFinite(lockStatus.acquiredAt)
        ? ` since ${new Date(lockStatus.acquiredAt).toISOString()}`
        : '';
    return `⏳ ${label} busy: ${owner}${acquiredAt}. Try again in a moment.`;
}

/**
 * Validate an OperationReceipt-like object against stage-1 invariants.
 * @param {object} receipt Candidate receipt.
 * @returns {{ valid: boolean, errors: string[] }} Validation result.
 */
export function validateOperationReceipt(receipt) {
    const errors = [];

    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
        return { valid: false, errors: ['receipt must be an object'] };
    }

    requireAllowed(receipt, 'status', STATUSES, errors);
    requireAllowed(receipt, 'scope', SCOPES, errors);
    requireAllowed(receipt, 'command', COMMANDS, errors);
    requireAllowed(receipt, 'operationType', OPERATION_TYPES, errors);
    requireAllowed(receipt, 'nextAction', NEXT_ACTIONS, errors);
    requireBoolean(receipt, 'changed', errors);
    requireBoolean(receipt, 'dryRun', errors);
    requireBoolean(receipt, 'applied', errors);
    requireBoolean(receipt, 'fallbackUsed', errors);
    requireString(receipt, 'message', errors);
    requireString(receipt, 'traceId', errors);

    if (receipt.errorClass !== undefined && !ERROR_CLASSES.includes(receipt.errorClass)) {
        errors.push('errorClass must be a known value when present');
    }

    if (receipt.destination !== undefined) {
        validateDestination(receipt.destination, errors);
    }

    validateStateInvariants(receipt, errors);
    validatePrivateFieldSafety(receipt, errors);

    return { valid: errors.length === 0, errors };
}

/**
 * Assert that a candidate receipt satisfies the OperationReceipt contract.
 * @param {object} receipt Candidate receipt.
 * @returns {object} The original receipt when valid.
 * @throws {TypeError} When the receipt violates the contract.
 */
export function assertValidOperationReceipt(receipt) {
    const result = validateOperationReceipt(receipt);
    if (!result.valid) {
        throw new TypeError(`Invalid operation receipt: ${result.errors.join('; ')}`);
    }
    return receipt;
}

function requireAllowed(receipt, field, values, errors) {
    if (!values.includes(receipt[field])) {
        errors.push(`${field} must be one of: ${values.join(', ')}`);
    }
}

function requireBoolean(receipt, field, errors) {
    if (typeof receipt[field] !== 'boolean') {
        errors.push(`${field} must be boolean`);
    }
}

function requireString(receipt, field, errors) {
    if (typeof receipt[field] !== 'string' || receipt[field].trim().length === 0) {
        errors.push(`${field} must be a non-empty string`);
    }
}

function validateDestination(destination, errors) {
    if (!destination || typeof destination !== 'object' || Array.isArray(destination)) {
        errors.push('destination must be an object when present');
        return;
    }

    if (!DESTINATION_CONFIDENCE.includes(destination.confidence)) {
        errors.push('destination.confidence must be a known value');
    }
}

function validateStateInvariants(receipt, errors) {
    if (receipt.dryRun && receipt.applied) {
        errors.push('dryRun receipts cannot be applied');
    }

    if (receipt.dryRun && !['preview', 'blocked'].includes(receipt.status)) {
        errors.push('dryRun receipts must have preview or blocked status');
    }

    if (receipt.applied && receipt.status !== 'applied') {
        errors.push('applied receipts must use applied status');
    }

    if (receipt.status === 'applied' && !receipt.applied) {
        errors.push('applied status requires applied=true');
    }

    if (receipt.applied && !receipt.changed) {
        errors.push('applied receipts require changed=true');
    }

    if (receipt.applied && receipt.scope !== 'ticktick_live') {
        errors.push('applied receipts must describe ticktick_live scope');
    }

    if (receipt.status === 'applied') {
        if (!Array.isArray(receipt.results) || !receipt.results.some((item) => item && item.status === 'succeeded')) {
            errors.push('applied receipts require at least one succeeded result');
        }
    }

    if (receipt.changed === false && receipt.status === 'applied') {
        errors.push('changed=false cannot use applied status');
    }

    if (receipt.changed === false && receipt.applied) {
        errors.push('changed=false cannot use applied=true');
    }

    if (NON_APPLIED_STATUSES.has(receipt.status) && receipt.applied) {
        errors.push(`${receipt.status} status cannot be applied`);
    }

    if (['blocked', 'deferred', 'failed', 'busy'].includes(receipt.status) && !SAFE_WAIT_ACTIONS.has(receipt.nextAction)) {
        errors.push(`${receipt.status} status requires retry, wait, resync, or none nextAction`);
    }

    if (receipt.status === 'applied' && receipt.destination && !['exact', 'configured'].includes(receipt.destination.confidence)) {
        errors.push('applied receipts require exact or configured destination confidence');
    }

    if (receipt.status === 'pending_confirmation') {
        if (receipt.changed || receipt.applied) {
            errors.push('pending_confirmation receipts cannot already be changed or applied');
        }

        if (!receipt.confirmation || typeof receipt.confirmation !== 'object' || Array.isArray(receipt.confirmation)) {
            errors.push('pending_confirmation receipts require confirmation details');
        } else {
            if (!receipt.confirmation.target || typeof receipt.confirmation.target !== 'object' || Array.isArray(receipt.confirmation.target)) {
                errors.push('pending_confirmation receipts require confirmation.target');
            } else if (!hasSafeIdentifier(receipt.confirmation.target, SAFE_TARGET_IDENTIFIER_KEYS)) {
                errors.push('pending_confirmation confirmation.target requires a safe identifier');
            }
            if (!receipt.confirmation.outcome || typeof receipt.confirmation.outcome !== 'string') {
                errors.push('pending_confirmation receipts require confirmation.outcome');
            }
        }

        if (['create', 'update'].includes(receipt.operationType) && !receipt.destination) {
            errors.push('pending_confirmation create/update receipts require proposed destination');
        } else if (['create', 'update'].includes(receipt.operationType) && receipt.destination) {
            validatePendingConfirmationDestination(receipt.destination, errors);
        }

        if (receipt.destination?.confidence === 'missing') {
            errors.push('pending_confirmation receipts cannot use missing destination confidence');
        }
    }
}

function validatePendingConfirmationDestination(destination, errors) {
    if (!destination || typeof destination !== 'object' || Array.isArray(destination)) {
        return;
    }

    if (destination.confidence === 'ambiguous') {
        if (!hasDestinationChoice(destination)) {
            errors.push('pending_confirmation ambiguous destinations require destination.choices');
        }
        return;
    }

    if (['exact', 'configured'].includes(destination.confidence) && !hasDestinationReference(destination)) {
        errors.push('pending_confirmation exact/configured destinations require projectId or projectName');
    }
}

function hasSafeIdentifier(value, allowedKeys) {
    return Object.entries(value).some(([key, nestedValue]) => (
        allowedKeys.has(key)
        && typeof nestedValue === 'string'
        && nestedValue.trim().length > 0
    ));
}

function hasDestinationReference(destination) {
    return hasSafeIdentifier(destination, new Set(['projectId', 'projectName'])) || hasDestinationChoice(destination);
}

function hasDestinationChoice(destination) {
    return Array.isArray(destination.choices)
        && destination.choices.some((choice) => (
            choice
            && typeof choice === 'object'
            && !Array.isArray(choice)
            && hasSafeIdentifier(choice, new Set(['projectId', 'projectName']))
        ));
}

function validatePrivateFieldSafety(value, errors, path = '') {
    if (!value || typeof value !== 'object') {
        return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (RAW_PRIVATE_FIELD_NAMES.has(key)) {
            errors.push(`receipt must not carry raw private field: ${currentPath}`);
            continue;
        }

        if (nestedValue && typeof nestedValue === 'object') {
            validatePrivateFieldSafety(nestedValue, errors, currentPath);
        }
    }
}
