/**
 * services/pipeline.js
 * Orchestrates the full task processing flow:
 * Message -> AX Intent Extraction -> Normalization -> TickTick Adapter Execution
 */
import { createPipelineContextBuilder } from './pipeline-context.js';
import { createPipelineObservability } from './pipeline-observability.js';
import { QuotaExhaustedError } from './ax-intent.js';
import { resolveTarget, buildClarificationPrompt } from './task-resolver.js';

const FAILURE_CLASSES = {
    QUOTA: 'quota',
    MALFORMED_AX: 'malformed_ax',
    VALIDATION: 'validation',
    ADAPTER: 'adapter',
    ROLLBACK: 'rollback',
    UNEXPECTED: 'unexpected',
};

const ACTION_FAILURE_CLASSES = {
    NONE: 'none',
    VALIDATION: 'validation',
    ADAPTER: 'adapter',
    ROLLBACK: 'rollback',
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

function buildFailureResult(context, {
    failureClass,
    stage,
    summary,
    error,
    details,
    userMessage,
    developerMessage,
    retryable = true,
    rolledBack = false,
    results = [],
}) {
    const isDevMode = resolveDevMode(context);
    const diagnostics = [];

    if (failureClass) diagnostics.push(`failure_class: ${failureClass}`);
    if (stage) diagnostics.push(`failure_stage: ${stage}`);
    if (summary) diagnostics.push(summary);
    if (developerMessage) diagnostics.push(developerMessage);
    if (error?.message) diagnostics.push(error.message);
    if (details?.diagnostics && Array.isArray(details.diagnostics)) {
        diagnostics.push(...details.diagnostics);
    }
    if (details?.validationErrors && Array.isArray(details.validationErrors)) {
        for (const entry of details.validationErrors) {
            if (Array.isArray(entry)) {
                const compact = entry.filter(Boolean).join('; ');
                diagnostics.push(compact ? `validation_error: ${compact}` : 'validation_error: (empty)');
            } else if (typeof entry === 'string') {
                diagnostics.push(`validation_error: ${entry}`);
            }
        }
    }
    if (details?.failures && Array.isArray(details.failures)) {
        for (const failure of details.failures) {
            if (!failure || typeof failure !== 'object') continue;
            const parts = [];
            if (failure.type) parts.push(`type=${failure.type}`);
            if (failure.title) parts.push(`title="${failure.title}"`);
            if (failure.taskId) parts.push(`taskId=${failure.taskId}`);
            if (failure.message) parts.push(`message="${failure.message}"`);
            if (typeof failure.attempt === 'number') parts.push(`attempt=${failure.attempt}`);
            diagnostics.push(`adapter_failure: ${parts.join(' | ')}`);
        }
    }
    if (details?.rollbackFailures && Array.isArray(details.rollbackFailures)) {
        for (const failure of details.rollbackFailures) {
            if (!failure || typeof failure !== 'object') continue;
            const parts = [];
            if (typeof failure.actionIndex === 'number') parts.push(`actionIndex=${failure.actionIndex}`);
            if (failure.rollbackType) parts.push(`rollbackType=${failure.rollbackType}`);
            if (failure.message) parts.push(`message="${failure.message}"`);
            diagnostics.push(`rollback_failure: ${parts.join(' | ')}`);
        }
    }

    const confirmationText = userMessage || USER_FAILURE_MESSAGES[failureClass] || USER_FAILURE_MESSAGES[FAILURE_CLASSES.UNEXPECTED];
    const failureDeveloperMessage = developerMessage || summary || error?.message || null;

    return {
        type: 'error',
        results,
        failure: {
            class: failureClass,
            failureClass,
            stage,
            summary: summary || null,
            details: details || null,
            userMessage: confirmationText,
            developerMessage: failureDeveloperMessage,
            requestId: context?.requestId || null,
            retryable,
            rolledBack,
        },
        confirmationText,
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

function buildClarificationResult(context, resolverResult) {
    const clarificationPrompt = buildClarificationPrompt(resolverResult);
    return {
        type: 'clarification',
        results: [],
        errors: [],
        confirmationText: clarificationPrompt,
        clarification: {
            candidates: resolverResult.candidates,
            reason: resolverResult.reason,
        },
        requestId: context?.requestId || null,
        entryPoint: context?.entryPoint || null,
        mode: context?.mode || null,
    };
}

function buildNotFoundResult(context, reason) {
    return {
        type: 'not-found',
        results: [],
        errors: [],
        confirmationText: `Couldn't find a matching task for that request.`,
        notFound: {
            reason,
        },
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

function createExecutionRecord(action, index) {
    return {
        index,
        action,
        attempts: 0,
        status: 'failed',
        result: null,
        errorMessage: null,
        failureClass: ACTION_FAILURE_CLASSES.NONE,
        rollbackStep: null,
    };
}

function buildSnapshot(task) {
    if (!task || typeof task !== 'object') return null;
    return {
        id: task.id,
        projectId: task.projectId ?? null,
        title: task.title || '',
        content: task.content ?? null,
        priority: task.priority ?? null,
        dueDate: task.dueDate ?? null,
        repeatFlag: task.repeatFlag ?? null,
        status: task.status ?? null,
    };
}

function snapshotToTaskPayload(snapshot) {
    return {
        title: snapshot?.title || '',
        content: snapshot?.content ?? null,
        priority: snapshot?.priority ?? null,
        dueDate: snapshot?.dueDate ?? null,
        projectId: snapshot?.projectId ?? null,
        repeatFlag: snapshot?.repeatFlag ?? null,
    };
}

function buildRollbackStep(action, index, executionResult, snapshot) {
    switch (action.type) {
        case 'create':
            if (!executionResult?.id) return null;
            return {
                type: 'delete_created',
                targetTaskId: executionResult.id,
                targetProjectId: executionResult.projectId ?? action.projectId ?? null,
                payload: {},
                sourceActionIndex: index,
            };
        case 'update':
            if (!snapshot?.id) return null;
            return {
                type: 'restore_updated',
                targetTaskId: executionResult?.id || action.taskId || snapshot.id,
                targetProjectId: executionResult?.projectId ?? action.projectId ?? snapshot.projectId ?? null,
                payload: {
                    snapshot,
                    currentTaskId: executionResult?.id || action.taskId || snapshot.id,
                    currentProjectId: executionResult?.projectId ?? action.projectId ?? snapshot.projectId ?? null,
                },
                sourceActionIndex: index,
            };
        case 'delete':
            if (!snapshot?.id) return null;
            return {
                type: 'recreate_deleted',
                targetTaskId: snapshot.id,
                targetProjectId: snapshot.projectId ?? null,
                payload: { snapshot },
                sourceActionIndex: index,
            };
        case 'complete':
            if (!snapshot?.id) return null;
            return {
                type: 'uncomplete_task',
                targetTaskId: snapshot.id,
                targetProjectId: snapshot.projectId ?? null,
                payload: { snapshot },
                sourceActionIndex: index,
            };
        default:
            return null;
    }
}

async function capturePreWriteSnapshot(action, adapter) {
    if (!action?.taskId) return null;

    switch (action.type) {
        case 'update':
        case 'delete':
        case 'complete': {
            const projectId = action.originalProjectId || action.projectId;
            if (!projectId) {
                throw new Error(`Cannot capture pre-write snapshot for ${action.type} without a projectId`);
            }
            const snapshot = await adapter.getTaskSnapshot(action.taskId, projectId);
            return buildSnapshot(snapshot);
        }
        default:
            return null;
    }
}

async function executeAction(action, adapter) {
    switch (action.type) {
        case 'create':
            return adapter.createTask(action);
        case 'update':
            return adapter.updateTask(action.taskId, action);
        case 'complete':
            return adapter.completeTask(action.taskId, action.projectId);
        case 'delete':
            return adapter.deleteTask(action.taskId, action.projectId);
        default:
            throw new Error(`Unsupported action type: ${action.type}`);
    }
}

async function executeRollbackStep(step, adapter) {
    switch (step?.type) {
        case 'delete_created':
            if (!step.targetTaskId || !step.targetProjectId) {
                throw new Error('Rollback delete_created requires targetTaskId and targetProjectId');
            }
            return adapter.deleteTask(step.targetTaskId, step.targetProjectId);
        case 'restore_updated': {
            const snapshot = step.payload?.snapshot || null;
            const currentTaskId = step.payload?.currentTaskId || step.targetTaskId;
            const currentProjectId = step.payload?.currentProjectId || step.targetProjectId;

            if (!snapshot?.id) {
                throw new Error('Rollback restore_updated requires a pre-write snapshot');
            }

            if (currentTaskId && currentTaskId !== snapshot.id) {
                if (!currentProjectId) {
                    throw new Error('Rollback restore_updated requires currentProjectId for moved tasks');
                }
                await adapter.deleteTask(currentTaskId, currentProjectId);
                return adapter.createTask(snapshotToTaskPayload(snapshot));
            }

            return adapter.restoreTask(snapshot.id, snapshot);
        }
        case 'recreate_deleted': {
            const snapshot = step.payload?.snapshot || null;
            if (!snapshot?.id) {
                throw new Error('Rollback recreate_deleted requires a pre-delete snapshot');
            }
            return adapter.createTask(snapshotToTaskPayload(snapshot));
        }
        case 'uncomplete_task':
            throw new Error('Rollback unsupported for complete actions: TickTick does not expose a reliable reopen path.');
        default:
            throw new Error(`Unsupported rollback step: ${step?.type || 'unknown'}`);
    }
}

function buildExecutionFailure(action, message, attempt) {
    return {
        type: action?.type || 'unknown',
        title: action?.title || null,
        taskId: action?.taskId || null,
        message,
        attempt,
    };
}

/**
 * Create a pipeline instance that orchestrates intent extraction, normalization,
 * and TickTick adapter execution.
 *
 * @param {Object} options
 * @param {Object} options.axIntent - Intent extractor with `extractIntents(message, opts)` method
 * @param {Object} options.normalizer - Normalizer module with `normalize(action, tasks, projects, opts)` method
 * @param {TickTickAdapter} options.adapter - TickTick adapter instance
 * @param {Object} [options.observability] - Optional observability emitter (see createPipelineObservability)
 * @returns {{ processMessage: Function, getTelemetry: Function }}
 *   - `processMessage(userMessage, options?)` → `{ type: 'task'|'info'|'error', confirmationText, taskId?, diagnostics?, ... }`
 *   - `getTelemetry()` → the observability instance for this pipeline
 */
export function createPipeline({ axIntent, normalizer, adapter, observability } = {}) {
    const contextBuilder = createPipelineContextBuilder({ adapter });
    const telemetry = observability || createPipelineObservability();

    async function processMessage(userMessage, options = {}) {
        let context;
        let requestStartedAt = Date.now();

        try {
            context = await contextBuilder.buildRequestContext(userMessage, options);
            requestStartedAt = Date.now();

            await telemetry.emit(context, {
                eventType: 'pipeline.request.received',
                step: 'request',
                status: 'start',
                metadata: {
                    mode: context.mode,
                },
            });

            console.log(`[Pipeline:${context.requestId}] Processing message: "${context.userMessage.substring(0, 50)}..."`);

            const axStartedAt = Date.now();
            let intents;

            try {
                intents = await axIntent.extractIntents(context.userMessage, {
                    currentDate: context.currentDate,
                    availableProjects: context.availableProjectNames,
                    requestId: context.requestId,
                });
            } catch (error) {
                const failureClass = isQuotaFailure(error) ? FAILURE_CLASSES.QUOTA : FAILURE_CLASSES.UNEXPECTED;
                await telemetry.emit(context, {
                    eventType: 'pipeline.ax.failed',
                    step: 'ax',
                    status: 'failure',
                    durationMs: Date.now() - axStartedAt,
                    failureClass,
                    metadata: {
                        message: error.message,
                    },
                });
                throw error;
            }

            if (isMalformedIntentPayload(intents)) {
                console.warn(`[Pipeline:${context.requestId}] Malformed AX output.`);
                const failureResult = buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.MALFORMED_AX,
                    stage: 'ax',
                    summary: 'Malformed AX output.',
                    details: {
                        receivedType: Array.isArray(intents) ? 'array' : typeof intents,
                    },
                    retryable: true,
                });

                await telemetry.emit(context, {
                    eventType: 'pipeline.ax.failed',
                    step: 'ax',
                    status: 'failure',
                    durationMs: Date.now() - axStartedAt,
                    failureClass: FAILURE_CLASSES.MALFORMED_AX,
                    metadata: {
                        receivedType: Array.isArray(intents) ? 'array' : typeof intents,
                    },
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: FAILURE_CLASSES.MALFORMED_AX,
                    rolledBack: false,
                });
                return failureResult;
            }

            await telemetry.emit(context, {
                eventType: 'pipeline.ax.completed',
                step: 'ax',
                status: 'success',
                durationMs: Date.now() - axStartedAt,
                metadata: {
                    intentCount: intents.length,
                    checklistIntentCount: intents.filter(i => Array.isArray(i.checklistItems) && i.checklistItems.length > 0).length,
                    totalExtractedChecklistItems: intents.reduce((sum, i) => sum + (Array.isArray(i.checklistItems) ? i.checklistItems.length : 0), 0),
                },
            });

            if (intents.length === 0) {
                console.log(`[Pipeline:${context.requestId}] No intents extracted. Routing as non-task.`);
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.completed',
                    step: 'result',
                    status: 'success',
                    durationMs: Date.now() - requestStartedAt,
                    metadata: {
                        type: 'non-task',
                        reason: NON_TASK_REASONS.EMPTY_INTENTS,
                    },
                });
                return buildNonTaskResult(context, NON_TASK_REASONS.EMPTY_INTENTS);
            }

            // Checklist/multi-task classification (WP04): detect ambiguous structure requests
            const hasChecklist = intents.some(i => Array.isArray(i.checklistItems) && i.checklistItems.length > 0);
            const hasMultipleCreates = intents.filter(i => i.type === 'create').length > 1;

            if (hasChecklist && hasMultipleCreates) {
                // Check if user already provided a preference (clarification resume path)
                const userPreference = options.checklistPreference || null;
                const userSkipped = options.skipChecklist === true;

                if (userSkipped) {
                    // User chose "single task" — drop checklist intent, keep first create
                    console.log(`[Pipeline:${context.requestId}] User skipped checklist clarification — creating single task only.`);
                    const firstCreate = intents.find(i => i.type === 'create');
                    if (firstCreate) {
                        // Remove checklist items from the intent
                        delete firstCreate.checklistItems;
                    }
                    // Continue processing with modified intents
                } else if (userPreference === 'checklist') {
                    // User chose checklist mode — merge multiple creates into one with checklist
                    console.log(`[Pipeline:${context.requestId}] User chose checklist mode — merging creates into single task.`);
                    const checklistItems = [];
                    for (const intent of intents) {
                        if (Array.isArray(intent.checklistItems) && intent.checklistItems.length > 0) {
                            checklistItems.push(...intent.checklistItems);
                        } else if (intent.type === 'create' && intent.title) {
                            // Convert standalone create into checklist item
                            checklistItems.push({ title: intent.title, sortOrder: checklistItems.length });
                        }
                    }
                    // Replace intents with single checklist create
                    intents = [{
                        type: 'create',
                        title: checklistItems[0]?.title || 'Checklist',
                        checklistItems,
                    }];
                } else if (userPreference === 'separate') {
                    // User chose separate tasks — strip checklist, keep all creates
                    console.log(`[Pipeline:${context.requestId}] User chose separate tasks — keeping all creates.`);
                    for (const intent of intents) {
                        delete intent.checklistItems;
                    }
                    // Continue processing with modified intents
                } else {
                    // No preference provided — ask for clarification
                    console.warn(`[Pipeline:${context.requestId}] Ambiguous checklist/multi-task request — asking for clarification.`);
                    const clarificationResult = {
                        type: 'clarification',
                        results: [],
                        errors: [],
                        confirmationText: 'I noticed your message could be one task with sub-steps, or several separate tasks. Which did you mean?',
                        clarification: {
                            candidates: intents,
                            reason: 'ambiguous_checklist_vs_multi_task',
                        },
                        requestId: context.requestId || null,
                        entryPoint: context.entryPoint || null,
                        mode: context.mode || null,
                    };

                    await telemetry.emit(context, {
                        eventType: 'pipeline.request.completed',
                        step: 'result',
                        status: 'success',
                        durationMs: Date.now() - requestStartedAt,
                        metadata: {
                            type: 'clarification',
                            reason: 'ambiguous_checklist_vs_multi_task',
                        },
                    });
                    return clarificationResult;
                }
            }

            // Mutation routing (WP04): detect mutation intents and resolve targets
            const mutationTypes = ['update', 'complete', 'delete'];
            const hasMutation = intents.some(i => mutationTypes.includes(i.type));
            const hasCreate = intents.some(i => i.type === 'create');

            if (hasMutation && hasCreate) {
                // Mixed create+mutation: out of scope for v1
                console.warn(`[Pipeline:${context.requestId}] Mixed create+mutation request rejected.`);
                const failureResult = buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    stage: 'mutation-routing',
                    summary: 'Mixed create+mutation request is out of scope.',
                    details: {
                        intentTypes: intents.map(i => i.type),
                    },
                    retryable: true,
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    metadata: {
                        reason: 'mixed_create_and_mutation',
                    },
                });
                return failureResult;
            }

            if (hasMutation && intents.length > 1) {
                // Multi-mutation: out of scope for v1 (single-target only)
                console.warn(`[Pipeline:${context.requestId}] Multi-mutation request rejected.`);
                const failureResult = buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    stage: 'mutation-routing',
                    summary: 'Multiple mutation targets are not supported yet.',
                    details: {
                        intentTypes: intents.map(i => i.type),
                    },
                    retryable: true,
                });
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                    metadata: {
                        reason: 'multiple_mutations',
                    },
                });
                return failureResult;
            }

            let resolvedTask = null;
            let resolvedTaskContent = null;

            if (hasMutation) {
                const mutationIntent = intents.find(i => mutationTypes.includes(i.type));
                const targetQuery = mutationIntent?.targetQuery || null;

                // Use active tasks from context (populated by pipeline-context builder)
                const activeTasks = context.activeTasks || [];

                // If the intent already has a resolved taskId (from test harnesses or direct calls), use it
                if (mutationIntent?.taskId) {
                    resolvedTask = {
                        id: mutationIntent.taskId,
                        projectId: mutationIntent.originalProjectId || mutationIntent.projectId || null,
                        title: mutationIntent.title || null,
                    };
                    // Try to get content from active tasks
                    resolvedTaskContent = activeTasks.find(t => t.id === resolvedTask.id)?.content ?? null;
                } else if (targetQuery && !options.skipClarification) {
                    const resolveStartedAt = Date.now();
                    const resolverResult = resolveTarget({ targetQuery, activeTasks });

                    await telemetry.emit(context, {
                        eventType: 'pipeline.resolve.completed',
                        step: 'resolve',
                        status: resolverResult.status === 'resolved' ? 'success' : 'failure',
                        durationMs: Date.now() - resolveStartedAt,
                        metadata: {
                            targetQuery,
                            resultStatus: resolverResult.status,
                            candidateCount: resolverResult.candidates.length,
                        },
                    });

                    if (resolverResult.status === 'clarification') {
                        return buildClarificationResult(context, resolverResult);
                    }

                    if (resolverResult.status === 'not_found') {
                        return buildNotFoundResult(context, resolverResult.reason);
                    }

                    // resolved
                    resolvedTask = {
                        id: resolverResult.selected.taskId,
                        projectId: resolverResult.selected.projectId,
                        title: resolverResult.selected.title,
                    };
                    resolvedTaskContent = activeTasks.find(t => t.id === resolvedTask.id)?.content ?? null;

                    // Enrich the mutation intent with resolved context
                    mutationIntent.taskId = resolvedTask.id;
                    mutationIntent.resolvedTaskId = resolvedTask.id;
                    if (resolvedTask.projectId) {
                        mutationIntent.originalProjectId = resolvedTask.projectId;
                    }
                } else if (targetQuery && options.skipClarification && context.existingTask?.id) {
                    // Clarification resume: user selected a candidate, skip re-resolution
                    resolvedTask = context.existingTask;
                    resolvedTaskContent = activeTasks.find(t => t.id === resolvedTask.id)?.content ?? null;
                    mutationIntent.taskId = resolvedTask.id;
                    mutationIntent.resolvedTaskId = resolvedTask.id;
                    if (resolvedTask.projectId) {
                        mutationIntent.originalProjectId = resolvedTask.projectId;
                    }
                    console.log(`[Pipeline:${context.requestId}] Clarification resume: using pre-resolved task "${resolvedTask.title}"`);
                } else {
                    // No targetQuery and no taskId — try to use existingTask from context
                    if (context.existingTask?.id) {
                        resolvedTask = context.existingTask;
                        resolvedTaskContent = context.existingTask?.content ?? null;
                    }
                }
            }

            const defaultProjectId = context.availableProjects
                .find(p => p?.name?.toLowerCase() === 'inbox')?.id || null;

            const normOptions = {
                projects: context.availableProjects,
                defaultProjectId,
                existingTask: resolvedTask || context.existingTask,
                existingTaskContent: resolvedTaskContent || context.existingTask?.content || null,
                timezone: context.timezone,
                currentDate: context.currentDate,
            };

            const normalizeStartedAt = Date.now();
            const normalizedActions = normalizer.normalizeActions(intents, normOptions);

            const validActions = normalizedActions.filter(a => a.valid);
            const invalidActions = normalizedActions.filter(a => !a.valid);

            await telemetry.emit(context, {
                eventType: 'pipeline.normalize.completed',
                step: 'normalize',
                status: 'success',
                durationMs: Date.now() - normalizeStartedAt,
                metadata: {
                    normalizedCount: normalizedActions.length,
                    validCount: validActions.length,
                    invalidCount: invalidActions.length,
                    checklistActionCount: validActions.filter(a => Array.isArray(a.checklistItems) && a.checklistItems.length > 0).length,
                    totalNormalizedChecklistItems: validActions.reduce((sum, a) => sum + (Array.isArray(a.checklistItems) ? a.checklistItems.length : 0), 0),
                },
            });

            if (invalidActions.length > 0) {
                console.warn(
                    `[Pipeline:${context.requestId}] Filtered out ${invalidActions.length} invalid actions:`,
                    invalidActions.map(a => a.validationErrors),
                );
            }

            if (validActions.length === 0 && invalidActions.length > 0) {
                const failureResult = buildFailureResult(context, {
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    stage: 'normalize',
                    summary: 'All intents failed validation.',
                    details: {
                        validationErrors: invalidActions.map(a => a.validationErrors),
                    },
                    retryable: true,
                });

                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: FAILURE_CLASSES.VALIDATION,
                    rolledBack: false,
                });
                return failureResult;
            }

            if (validActions.length === 0) {
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.completed',
                    step: 'result',
                    status: 'success',
                    durationMs: Date.now() - requestStartedAt,
                    metadata: {
                        type: 'non-task',
                        reason: NON_TASK_REASONS.EMPTY_INTENTS,
                        note: 'No valid actions after normalization.',
                    },
                });
                return buildNonTaskResult(context, NON_TASK_REASONS.EMPTY_INTENTS, {
                    note: 'No valid actions after normalization.',
                });
            }

            const executionResult = await _executeActions(validActions, adapter, context, telemetry);

            if (executionResult.terminalFailure) {
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass: executionResult.terminalFailure.failureClass,
                    rolledBack: executionResult.terminalFailure.rolledBack,
                    metadata: {
                        actionIndex: executionResult.terminalFailure.actionIndex,
                        attempts: executionResult.terminalFailure.attempts,
                    },
                });

                return buildFailureResult(context, {
                    failureClass: executionResult.terminalFailure.failureClass,
                    stage: executionResult.terminalFailure.stage,
                    summary: executionResult.terminalFailure.summary,
                    userMessage: executionResult.terminalFailure.userMessage,
                    developerMessage: executionResult.terminalFailure.developerMessage,
                    details: {
                        failures: executionResult.failures,
                        rollbackFailures: executionResult.rollbackFailures,
                    },
                    retryable: executionResult.terminalFailure.retryable,
                    rolledBack: executionResult.terminalFailure.rolledBack,
                    results: executionResult.results,
                });
            }

            const allErrors = [
                ...invalidActions.map(a => a.validationErrors.join(', ')),
                ...executionResult.errors,
            ];

            const confirmationText = _buildConfirmation(executionResult.results, executionResult.errors);

            await telemetry.emit(context, {
                eventType: 'pipeline.request.completed',
                step: 'result',
                status: 'success',
                durationMs: Date.now() - requestStartedAt,
                metadata: {
                    type: 'task',
                    actionCount: validActions.length,
                    checklistActionCount: validActions.filter(a => Array.isArray(a.checklistItems) && a.checklistItems.length > 0).length,
                },
            });

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
                checklistMetadata: validActions
                    .filter(a => Array.isArray(a.checklistItems) && a.checklistItems.length > 0)
                    .map(a => ({ actionIndex: a._index ?? null, checklistItemCount: a.checklistItems.length })),
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

            if (context) {
                await telemetry.emit(context, {
                    eventType: 'pipeline.request.failed',
                    step: 'result',
                    status: 'failure',
                    durationMs: Date.now() - requestStartedAt,
                    failureClass,
                    rolledBack: false,
                    metadata: {
                        message: error.message,
                    },
                });
            }

            return buildFailureResult(context, {
                failureClass,
                stage,
                summary,
                error,
                retryable: failureClass !== FAILURE_CLASSES.MALFORMED_AX,
            });
        }
    }

    async function _executeActions(actions, adapter, context, telemetry) {
        const results = [];
        const errors = [];
        const failures = [];
        const rollbackFailures = [];
        const successfulRecords = [];
        const allowRetry = actions.length > 1;

        console.log(`[Pipeline:${context.requestId}] Executing ${actions.length} valid action(s).`);

        for (let index = 0; index < actions.length; index++) {
            const action = actions[index];
            const record = createExecutionRecord(action, index);
            const maxAttempts = allowRetry ? 2 : 1;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                record.attempts = attempt;

                try {
                    const preWriteSnapshot = await capturePreWriteSnapshot(action, adapter);
                    const result = await executeAction(action, adapter);
                    record.result = result;
                    record.rollbackStep = buildRollbackStep(action, index, result, preWriteSnapshot);
                    record.status = 'succeeded';
                    record.failureClass = ACTION_FAILURE_CLASSES.NONE;
                    record.errorMessage = null;
                    successfulRecords.push(record);

                    console.log(`[Pipeline:${context.requestId}] ✅ ${action.type.toUpperCase()} successful: ${action.title || action.taskId}`);
                    await telemetry.emit(context, {
                        eventType: 'pipeline.execute.succeeded',
                        step: 'execute',
                        status: 'success',
                        actionType: action.type,
                        attempt,
                        rolledBack: false,
                        metadata: {
                            actionIndex: index,
                            checklistItemCount: Array.isArray(action.checklistItems) ? action.checklistItems.length : null,
                        },
                    });
                    break;
                } catch (err) {
                    const message = err?.message || 'Unknown adapter failure';
                    record.errorMessage = message;
                    record.failureClass = ACTION_FAILURE_CLASSES.ADAPTER;

                    console.error(`[Pipeline:${context.requestId}] ❌ API Failure during ${action.type} (attempt ${attempt}):`, message);
                    await telemetry.emit(context, {
                        eventType: 'pipeline.execute.failed',
                        step: 'execute',
                        status: 'failure',
                        failureClass: FAILURE_CLASSES.ADAPTER,
                        actionType: action.type,
                        attempt,
                        rolledBack: false,
                        metadata: {
                            actionIndex: index,
                            willRetry: attempt < maxAttempts,
                        },
                    });

                    if (attempt < maxAttempts) {
                        continue;
                    }

                    record.status = 'failed';
                    errors.push(`${action.type} failed: ${message}`);
                    failures.push(buildExecutionFailure(action, message, attempt));
                    results.push(record);

                    if (successfulRecords.length === 0) {
                        return {
                            results,
                            errors,
                            failures,
                            rollbackFailures,
                            successCount: 0,
                            failureCount: failures.length,
                            terminalFailure: {
                                failureClass: FAILURE_CLASSES.ADAPTER,
                                stage: 'adapter',
                                summary: 'Task execution failed before rollback could run.',
                                userMessage: USER_FAILURE_MESSAGES[FAILURE_CLASSES.ADAPTER],
                                developerMessage: `Action ${index} (${action.type}) failed after ${attempt} attempt(s): ${message}`,
                                retryable: true,
                                rolledBack: false,
                                actionIndex: index,
                                attempts: attempt,
                            },
                        };
                    }

                    const rollbackResult = await rollbackSuccessfulActions(successfulRecords, adapter, context, telemetry, rollbackFailures);

                    if (rollbackResult.allSucceeded) {
                        return {
                            results,
                            errors,
                            failures,
                            rollbackFailures,
                            successCount: 0,
                            failureCount: failures.length,
                            terminalFailure: {
                                failureClass: FAILURE_CLASSES.ADAPTER,
                                stage: 'adapter',
                                summary: 'Task execution failed after retry. Earlier successful writes were rolled back.',
                                userMessage: '⚠️ Task updates failed after a retry. Earlier successful changes were rolled back.',
                                developerMessage: `Action ${index} (${action.type}) failed after ${attempt} attempt(s). Rollback succeeded for ${rollbackResult.recordsInOriginalOrder.length} earlier action(s).`,
                                retryable: true,
                                rolledBack: true,
                                actionIndex: index,
                                attempts: attempt,
                            },
                        };
                    }

                    return {
                        results,
                        errors,
                        failures,
                        rollbackFailures,
                        successCount: 0,
                        failureCount: failures.length,
                        terminalFailure: {
                            failureClass: FAILURE_CLASSES.ROLLBACK,
                            stage: 'rollback',
                            summary: 'Task execution failed after retry, and rollback was incomplete.',
                            userMessage: USER_FAILURE_MESSAGES[FAILURE_CLASSES.ROLLBACK],
                            developerMessage: `Action ${index} (${action.type}) failed after ${attempt} attempt(s). Rollback failed for ${rollbackFailures.length} earlier action(s).`,
                            retryable: false,
                            rolledBack: false,
                            actionIndex: index,
                            attempts: attempt,
                        },
                    };
                }
            }

            if (!results.includes(record)) {
                results.push(record);
            }
        }

        return {
            results,
            errors,
            failures,
            rollbackFailures,
            successCount: results.filter(r => r.status === 'succeeded').length,
            failureCount: 0,
            terminalFailure: null,
        };
    }

    async function rollbackSuccessfulActions(successfulRecords, adapter, context, telemetry, rollbackFailures) {
        const recordsInOriginalOrder = [...successfulRecords].sort((left, right) => left.index - right.index);
        const recordsInRollbackOrder = [...recordsInOriginalOrder].reverse();

        for (const record of recordsInRollbackOrder) {
            const rollbackStep = record.rollbackStep;

            if (!rollbackStep) {
                record.status = 'rollback_failed';
                record.failureClass = ACTION_FAILURE_CLASSES.ROLLBACK;
                record.errorMessage = `No rollback step recorded for action ${record.index}`;
                rollbackFailures.push({
                    actionIndex: record.index,
                    rollbackType: null,
                    message: record.errorMessage,
                });

                await telemetry.emit(context, {
                    eventType: 'pipeline.rollback.failed',
                    step: 'rollback',
                    status: 'failure',
                    failureClass: FAILURE_CLASSES.ROLLBACK,
                    actionType: record.action.type,
                    attempt: 1,
                    rolledBack: false,
                    metadata: {
                        actionIndex: record.index,
                        rollbackType: null,
                    },
                });
                continue;
            }

            try {
                await executeRollbackStep(rollbackStep, adapter);
                record.status = 'rolled_back';
                record.failureClass = ACTION_FAILURE_CLASSES.NONE;
                record.errorMessage = null;

                await telemetry.emit(context, {
                    eventType: 'pipeline.rollback.succeeded',
                    step: 'rollback',
                    status: 'success',
                    actionType: record.action.type,
                    attempt: 1,
                    rolledBack: true,
                    metadata: {
                        actionIndex: record.index,
                        rollbackType: rollbackStep.type,
                    },
                });
            } catch (error) {
                record.status = 'rollback_failed';
                record.failureClass = ACTION_FAILURE_CLASSES.ROLLBACK;
                record.errorMessage = error.message;
                rollbackFailures.push({
                    actionIndex: record.index,
                    rollbackType: rollbackStep.type,
                    message: error.message,
                });

                await telemetry.emit(context, {
                    eventType: 'pipeline.rollback.failed',
                    step: 'rollback',
                    status: 'failure',
                    failureClass: FAILURE_CLASSES.ROLLBACK,
                    actionType: record.action.type,
                    attempt: 1,
                    rolledBack: false,
                    metadata: {
                        actionIndex: record.index,
                        rollbackType: rollbackStep.type,
                        message: error.message,
                    },
                });
            }
        }

        return {
            recordsInOriginalOrder,
            allSucceeded: rollbackFailures.length === 0,
        };
    }

    function _buildConfirmation(results, errors) {
        const successful = results.filter(r => r.status === 'succeeded');
        const failed = results.filter(r => r.status === 'failed' || r.status === 'rollback_failed');

        if (successful.length === 0 && failed.length > 0) {
            return `⚠️ All ${failed.length} action(s) failed.`;
        }

        let text = '';

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
        processMessage,
    };
}
