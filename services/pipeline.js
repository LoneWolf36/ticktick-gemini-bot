/**
 * services/pipeline.js
 * Orchestrates the full task processing flow:
 * Message -> AX Intent Extraction -> Normalization -> TickTick Adapter Execution
 */
import { createPipelineContextBuilder } from './pipeline-context.js';
import { QuotaExhaustedError } from './ax-intent.js';

const FAILURE_CLASSES = {
    QUOTA: 'quota',
    MALFORMED_AX: 'malformed_ax',
    VALIDATION: 'validation',
    ADAPTER: 'adapter',
    ROLLBACK: 'rollback',
    UNEXPECTED: 'unexpected',
};

const NON_TASK_REASONS = {
    EMPTY_INTENTS: 'empty_intents',
};

const USER_FAILURE_MESSAGES = {
    [FAILURE_CLASSES.QUOTA]: '⚠️ AI quota exhausted. Try again shortly.',
    [FAILURE_CLASSES.MALFORMED_AX]: '⚠️ I could not understand that request. Please rephrase.',
    [FAILURE_CLASSES.VALIDATION]: '⚠️ I could not validate the task details. Please clarify and retry.',
    [FAILURE_CLASSES.ADAPTER]: '⚠️ Task updates failed. Please retry shortly.',
    [FAILURE_CLASSES.ROLLBACK]: '⚠️ Task updates partially failed. Please check your tasks.',
    [FAILURE_CLASSES.UNEXPECTED]: '⚠️ An unexpected error occurred while processing your request.',
};

function resolveDevMode(context) {
    const mode = (context?.mode || '').toLowerCase();
    if (['dev', 'development', 'debug', 'diagnostic', 'test'].includes(mode)) return true;
    return process.env.NODE_ENV !== 'production';
}

function buildFailureResult(context, { failureClass, stage, summary, error, details }) {
    const isDevMode = resolveDevMode(context);
    const diagnostics = [];

    if (summary) diagnostics.push(summary);
    if (error?.message) diagnostics.push(error.message);
    if (details?.diagnostics && Array.isArray(details.diagnostics)) {
        diagnostics.push(...details.diagnostics);
    }

    return {
        type: 'error',
        failure: {
            class: failureClass,
            stage,
            summary: summary || null,
            details: details || null,
        },
        confirmationText: USER_FAILURE_MESSAGES[failureClass] || USER_FAILURE_MESSAGES[FAILURE_CLASSES.UNEXPECTED],
        errors: isDevMode ? diagnostics : [],
        diagnostics: isDevMode ? diagnostics : [],
        requestId: context?.requestId || null,
        entryPoint: context?.entryPoint || null,
        mode: context?.mode || null,
        isDevMode,
    };
}

function buildNonTaskResult(context, reason, details = null) {
    return {
        type: 'non-task',
        results: [],
        errors: [],
        confirmationText: 'Got it — no actionable tasks detected.',
        nonTaskReason: reason,
        nonTaskDetails: details,
        requestId: context?.requestId || null,
        entryPoint: context?.entryPoint || null,
        mode: context?.mode || null,
    };
}

function isQuotaFailure(error) {
    if (!error) return false;
    if (error instanceof QuotaExhaustedError) return true;
    const msg = error.message || '';
    return msg.includes('QUOTA_EXHAUSTED') || msg.includes('quota') || msg.includes('All API keys exhausted');
}

function isMalformedIntentPayload(intents) {
    if (!Array.isArray(intents)) return true;
    return intents.some(intent => !intent || typeof intent !== 'object' || Array.isArray(intent));
}

export function createPipeline({ axIntent, normalizer, adapter }) {
    const contextBuilder = createPipelineContextBuilder({ adapter });

    /**
     * Processes a user message through the entire pipeline.
     * @param {string} userMessage - Raw text from the user
     * @param {Object} options - Context options like existingTask, entryPoint, mode
     */
    async function processMessage(userMessage, options = {}) {
        let context;

        try {
            context = await contextBuilder.buildRequestContext(userMessage, options);
            console.log(`[Pipeline:${context.requestId}] Processing message: "${context.userMessage.substring(0, 50)}..."`);

            // Phase 1: Intent Extraction (AX)
            const availableProjectNames = context.availableProjects
                .map(p => p?.name)
                .filter(name => typeof name === 'string' && name.trim());

            const intents = await axIntent.extractIntents(context.userMessage, {
                currentDate: context.currentDate,
                availableProjects: availableProjectNames,
                requestId: context.requestId,
            });

            if (isMalformedIntentPayload(intents)) {
                console.warn(`[Pipeline:${context.requestId}] Malformed AX output.`);
                return buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.MALFORMED_AX,
                    stage: 'ax',
                    summary: 'Malformed AX output.',
                    details: {
                        receivedType: Array.isArray(intents) ? 'array' : typeof intents,
                    },
                });
            }

            if (!intents || intents.length === 0) {
                console.log(`[Pipeline:${context.requestId}] No intents extracted. Routing as non-task.`);
                return buildNonTaskResult(context, NON_TASK_REASONS.EMPTY_INTENTS);
            }

            // Phase 2: Normalization
            // Fetch projects once for the normalizer to resolve project hints
            const defaultProjectId = context.availableProjects
                .find(p => p?.name?.toLowerCase() === 'inbox')?.id || null;

            const normOptions = {
                projects: context.availableProjects,
                defaultProjectId,
                existingTask: context.existingTask,
                existingTaskContent: context.existingTask?.content || null,
                timezone: context.timezone,
                currentDate: context.currentDate
            };

            const normalizedActions = normalizer.normalizeActions(intents, normOptions);

            const validActions = normalizedActions.filter(a => a.valid);
            const invalidActions = normalizedActions.filter(a => !a.valid);

            if (invalidActions.length > 0) {
                console.warn(`[Pipeline:${context.requestId}] Filtered out ${invalidActions.length} invalid actions:`, invalidActions.map(a => a.validationErrors));
            }

            if (validActions.length === 0 && invalidActions.length > 0) {
                return buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    stage: 'normalize',
                    summary: 'All intents failed validation.',
                    details: {
                        validationErrors: invalidActions.map(a => a.validationErrors),
                    },
                });
            }

            if (validActions.length === 0) {
                return buildNonTaskResult(context, NON_TASK_REASONS.EMPTY_INTENTS, {
                    note: 'No valid actions after normalization.',
                });
            }

            // Phase 3: Execution (Adapter)
            const executionResult = await _executeActions(validActions, adapter, context.requestId);

            if (executionResult.failureCount > 0 && executionResult.successCount === 0) {
                return buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.ADAPTER,
                    stage: 'adapter',
                    summary: 'All adapter actions failed.',
                    details: {
                        failures: executionResult.failures,
                    },
                });
            }

            // Merge execution errors with validation errors if we want to report them
            const allErrors = [
                ...invalidActions.map(a => a.validationErrors.join(', ')),
                ...executionResult.errors
            ];

            // Phase 4: Confirmation Formatting
            const confirmationText = _buildConfirmation(executionResult.results, executionResult.errors);

            return {
                type: 'task',
                actions: validActions,
                results: executionResult.results,
                errors: allErrors,
                confirmationText,
                requestId: context.requestId,
                entryPoint: context.entryPoint,
                mode: context.mode,
                warnings: invalidActions.map(a => a.validationErrors).flat(),
            };

        } catch (error) {
            let failureClass = FAILURE_CLASSES.UNEXPECTED;
            let stage = 'pipeline';
            let summary = 'Unhandled pipeline error.';

            if (error?.code === 'PIPELINE_CONTEXT_INVALID') {
                failureClass = FAILURE_CLASSES.VALIDATION;
                stage = 'context';
                summary = 'Invalid pipeline request context.';
            } else if (isQuotaFailure(error)) {
                failureClass = FAILURE_CLASSES.QUOTA;
                stage = 'ax';
                summary = 'AI quota exhausted after configured key rotation.';
            }
            console.error('[Pipeline] Unhandled pipeline error:', error);

            return buildFailureResult(context, {
                failureClass,
                stage,
                summary,
                error,
            });
        }
    }

    /**
     * Internal execution router
     */
    async function _executeActions(actions, adapter, requestId = 'n/a') {
        const results = [];
        const errors = [];
        const failures = [];
        let successCount = 0;

        console.log(`[Pipeline:${requestId}] Executing ${actions.length} valid action(s).`);

        for (const action of actions) {
            try {
                let result;
                switch (action.type) {
                    case 'create':
                        result = await adapter.createTask(action);
                        break;
                    case 'update':
                        result = await adapter.updateTask(action.taskId, action);
                        break;
                    case 'complete':
                        result = await adapter.completeTask(action.taskId, action.projectId);
                        break;
                    case 'delete':
                        result = await adapter.deleteTask(action.taskId, action.projectId);
                        break;
                    default:
                        throw new Error(`Unsupported action type: ${action.type}`);
                }
                results.push({ action, result, success: true });
                successCount++;
                console.log(`[Pipeline:${requestId}] ✅ ${action.type.toUpperCase()} successful: ${action.title || action.taskId}`);
            } catch (err) {
                const message = err?.message || 'Unknown adapter failure';
                // Graceful failure handling (FR-016)
                console.error(`[Pipeline:${requestId}] ❌ API Failure during ${action.type}:`, message);
                errors.push(`${action.type} failed: ${message}`);
                failures.push({
                    type: action.type,
                    title: action.title || null,
                    taskId: action.taskId || null,
                    message,
                });
                results.push({ action, error: message, success: false });
            }
        }

        return {
            results,
            errors,
            failures,
            successCount,
            failureCount: failures.length,
        };
    }

    /**
     * Builds terse confirmation messages (FR-011)
     */
    function _buildConfirmation(results, errors) {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        if (successful.length === 0 && failed.length > 0) {
            return `⚠️ All ${failed.length} action(s) failed.`;
        }

        let text = '';

        // Group by action type
        const created = successful.filter(r => r.action.type === 'create');
        const updated = successful.filter(r => r.action.type === 'update');
        const completed = successful.filter(r => r.action.type === 'complete');
        const deleted = successful.filter(r => r.action.type === 'delete');

        if (successful.length === 1 && created.length === 1) {
            text = `✅ Created: ${created[0].action.title}`;
        } else {
            const parts = [];
            if (created.length > 0) parts.push(`Created ${created.length} task(s)`);
            if (updated.length > 0) parts.push(`Updated ${updated.length} task(s)`);
            if (completed.length > 0) parts.push(`Completed ${completed.length} task(s)`);
            if (deleted.length > 0) parts.push(`Deleted ${deleted.length} task(s)`);

            text = `✅ ${parts.join(', ')}`;
        }

        if (errors && errors.length > 0) {
            text += `\n⚠️ ${failed.length} action(s) skipped or failed.`;
        }

        return text;
    }

    return {
        processMessage
    };
}
