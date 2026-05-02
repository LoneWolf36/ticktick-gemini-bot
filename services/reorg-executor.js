/**
 * Reorg action executor — single action dispatch against the TickTick adapter.
 *
 * Extracted from bot/commands.js executeActions(). Handles create, update,
 * complete, and drop action types for Gemini reorg proposals and policy sweeps.
 * Returns structured results; caller persists state (undo logs, processed marks).
 *
 * @module services/reorg-executor
 */

import {
    scheduleToDate,
    parseDateStringToTickTickISO,
    PRIORITY_LABEL,
    containsSensitiveContent,
    buildUndoEntry,
} from './shared-utils.js';

/**
 * Resolve a due date string to TickTick ISO format.
 * Uses priority-based label mapping for schedule slot resolution.
 *
 * @param {string|null|undefined} value - Raw due date value
 * @param {number} [explicitPriority] - Priority value guiding label choice (1, 3, 5, etc.)
 * @returns {string|null} Resolved ISO due date string, or null if input is empty
 */
function resolveDueDate(value, explicitPriority) {
    if (!value) return null;
    const priorityLabel =
        explicitPriority === 5 ? 'core_goal' :
        explicitPriority === 1 ? 'life-admin' :
        'important';
    return (
        scheduleToDate(value, { priorityLabel }) ||
        parseDateStringToTickTickISO(value, { priorityLabel, slotMode: 'priority' })
    );
}

/**
 * Build a project ID-to-name map from a project array.
 *
 * @param {Object[]} [projects=[]] - Array of project objects with `id` and `name` fields
 * @returns {Map<string,string>} Map of project ID to project name
 */
function buildProjectMap(projects = []) {
    return new Map(projects.map(p => [p.id, p.name || 'Unknown']));
}

/**
 * Describe priority/project/title/due changes for an update action.
 *
 * @param {Object} changes - The update changes object
 * @param {Object} task - The current task object for comparison
 * @param {Map<string,string>} projectMap - Project ID to name map
 * @returns {string} Formatted change description (empty string if no changes)
 */
function describeUpdateChanges(changes, task, projectMap) {
    const parts = [];
    if (changes.projectId && changes.projectId !== task.projectId) {
        const projName = projectMap.get(changes.projectId) || 'new project';
        parts.push(`moved to ${projName}`);
    }
    if (changes.priority !== undefined && changes.priority !== task.priority) {
        parts.push(`priority ${PRIORITY_LABEL[changes.priority] || changes.priority}`);
    }
    if (changes.title && changes.title !== task.title) {
        parts.push(`renamed to "${changes.title}"`);
    }
    if (changes.dueDate) {
        parts.push(`due ${changes.dueDate}`);
    }
    return parts.length > 0 ? ` → ${parts.join(', ')}` : '';
}

/**
 * Describe priority/project/title/due aspects for a create action.
 *
 * @param {Object} changes - The create changes object
 * @param {Map<string,string>} projectMap - Project ID to name map
 * @param {string|null} resolvedDueDate - Resolved ISO due date string
 * @returns {string} Formatted detail string (empty string if no extras)
 */
function describeCreateDetails(changes, projectMap, resolvedDueDate) {
    const parts = [];
    if (changes.projectId) {
        const projName = projectMap.get(changes.projectId) || 'new project';
        parts.push(`Project: ${projName}`);
    }
    if (changes.priority !== undefined) {
        parts.push(`Priority: ${PRIORITY_LABEL[changes.priority] || changes.priority}`);
    }
    if (resolvedDueDate) {
        parts.push(`Due: ${resolvedDueDate}`);
    }
    return parts.length > 0 ? ` → ${parts.join(', ')}` : '';
}

function buildExecutionSummary(overrides = {}) {
    return {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        ticktickChanged: 0,
        localOnly: 0,
        undoable: false,
        ...overrides,
    };
}

/**
 * Execute a single reorg action against TickTick via the adapter.
 *
 * Handles action types:
 * - `create`: Creates a new task via `adapter.createTask`
 * - `update`: Updates a task via `adapter.updateTask`, returns an undo entry
 * - `complete`: Completes a task via `adapter.completeTask`
 * - `drop`: Deprioritizes a task via `adapter.updateTask` (does not delete)
 *
 * @param {Object} action - The action to execute ({ type, taskId, changes })
 * @param {Object|null} task - Current TickTick task object (null for create actions)
 * @param {Object} adapter - TickTick adapter instance (createTask, updateTask, completeTask)
 * @param {Object} [options={}] - Execution options
 * @param {Map<string,string>} [options.projectMap] - Pre-built project ID-to-name map
 * @param {Object[]} [options.projects] - Raw project array (fallback for building projectMap)
 * @returns {Promise<{
 *   outcomes: string[],
 *   undoEntry: Object|null,
 *   taskId: string|null,
 *   actionType: string|null,
 *   error: string|null
 * }>} Structured result:
 *   - `outcomes`: Outcome message(s) for the action (may include multiple messages
 *     e.g. sensitive-content warning + update description)
 *   - `undoEntry`: Undo entry object for update actions (null otherwise)
 *   - `taskId`: The task ID involved in the action
 *   - `actionType`: The action type ('create', 'update', 'complete', 'drop')
 *   - `error`: Error message if the action failed; null on success
 */
export async function executeReorgAction(action, task, adapter, options = {}) {
    const projectMap = options.projectMap || buildProjectMap(options.projects || []);

    if (!action || typeof action !== 'object' || !action.type) {
        return {
            outcomes: [],
            undoEntry: null,
            taskId: null,
            actionType: null,
            error: '⚠️ Skipped invalid action: missing type',
            executionSummary: buildExecutionSummary(),
        };
    }

    const actionType = action.type;
    const taskId = action.taskId || null;

    try {
        switch (actionType) {
            // ─── Create ──────────────────────────────────────────
            case 'create': {
                const changes = action.changes || {};
                if (!changes.title) {
                    return {
                        outcomes: [],
                        undoEntry: null,
                        taskId: null,
                        actionType,
                        error: '⚠️ Cannot create task: Missing title',
                        executionSummary: buildExecutionSummary({ attempted: 1, failed: 1, localOnly: 1 }),
                    };
                }

                const safeDueDate = resolveDueDate(changes.dueDate, changes.priority);
                const createPayload = { ...changes, title: changes.title };
                if (safeDueDate) createPayload.dueDate = safeDueDate;

                await adapter.createTask(createPayload);

                const detail = describeCreateDetails(changes, projectMap, safeDueDate);
                return {
                    outcomes: [`Created: "${changes.title}"${detail}`],
                    undoEntry: null,
                    taskId: null,
                    actionType,
                    error: null,
                    executionSummary: buildExecutionSummary({ attempted: 1, succeeded: 1, ticktickChanged: 1 }),
                };
            }

            // ─── Complete ────────────────────────────────────────
            case 'complete': {
                if (!taskId) {
                    return {
                        outcomes: [],
                        undoEntry: null,
                        taskId: null,
                        actionType,
                        error: '⚠️ Skipped complete action: AI did not provide a valid Task ID.',
                        executionSummary: buildExecutionSummary({ attempted: 1, failed: 1, localOnly: 1 }),
                    };
                }
                if (!task) {
                    return {
                        outcomes: [],
                        undoEntry: null,
                        taskId,
                        actionType,
                        error: `⚠️ Task not found: ${taskId}`,
                        executionSummary: buildExecutionSummary({ attempted: 1, failed: 1, localOnly: 1 }),
                    };
                }

                await adapter.completeTask(task.id, task.projectId);
                return {
                    outcomes: [`Complete: "${task.title}"`],
                    undoEntry: null,
                    taskId,
                    actionType,
                    error: null,
                    executionSummary: buildExecutionSummary({ attempted: 1, succeeded: 1, ticktickChanged: 1 }),
                };
            }

            // ─── Update ──────────────────────────────────────────
            case 'update': {
                if (!taskId) {
                    return {
                        outcomes: [],
                        undoEntry: null,
                        taskId: null,
                        actionType,
                        error: '⚠️ Skipped update action: AI did not provide a valid Task ID.',
                        executionSummary: buildExecutionSummary({ attempted: 1, failed: 1, localOnly: 1 }),
                    };
                }
                if (!task) {
                    return {
                        outcomes: [],
                        undoEntry: null,
                        taskId,
                        actionType,
                        error: `⚠️ Task not found: ${taskId}`,
                        executionSummary: buildExecutionSummary({ attempted: 1, failed: 1, localOnly: 1 }),
                    };
                }

                const changes = action.changes || {};
                if (Object.keys(changes).length === 0) {
                    return {
                        outcomes: [
                            '⚠️ Skipped invalid/unsupported action: update (No valid schema changes found)',
                        ],
                        undoEntry: null,
                        taskId,
                        actionType,
                        error: null,
                        executionSummary: buildExecutionSummary({ attempted: 1, failed: 1, localOnly: 1 }),
                    };
                }

                const safeDueDate = resolveDueDate(
                    changes.dueDate || changes.suggested_schedule,
                    changes.priority,
                );

                const updatePayload = {
                    ...changes,
                    projectId: changes.projectId || task.projectId,
                    originalProjectId: task.projectId,
                };
                if (safeDueDate) updatePayload.dueDate = safeDueDate;
                if (changes.dueDate === null) updatePayload.dueDate = null;

                const outcomes = [];

                // Sensitive content gate — preserve existing content
                if (
                    updatePayload.content !== undefined &&
                    containsSensitiveContent(task.content || '')
                ) {
                    delete updatePayload.content;
                    outcomes.push(
                        `⚠️ Preserved sensitive content for "${task.title}" (content rewrite blocked)`,
                    );
                }

                const updatedTask = await adapter.updateTask(task.id, updatePayload);

                const undoEntry = buildUndoEntry({
                    source: task,
                    action: 'reorg-update',
                    appliedTaskId: updatedTask.id,
                    applied: {
                        title: changes.title ?? null,
                        projectId:
                            changes.projectId && changes.projectId !== task.projectId
                                ? changes.projectId
                                : null,
                        schedule: updatePayload.dueDate ?? null,
                    },
                });

                const detail = describeUpdateChanges(changes, task, projectMap);
                outcomes.push(`Updated: "${task.title}"${detail}`);

                return {
                    outcomes,
                    undoEntry,
                    taskId,
                    actionType,
                    error: null,
                    executionSummary: buildExecutionSummary({
                        attempted: 1,
                        succeeded: 1,
                        ticktickChanged: 1,
                        undoable: true,
                    }),
                };
            }

            // ─── Drop ────────────────────────────────────────────
            case 'drop': {
                if (!taskId) {
                    return {
                        outcomes: [],
                        undoEntry: null,
                        taskId: null,
                        actionType,
                        error: '⚠️ Skipped drop action: AI did not provide a valid Task ID.',
                        executionSummary: buildExecutionSummary({ attempted: 1, failed: 1, localOnly: 1 }),
                    };
                }
                if (!task) {
                    return {
                        outcomes: [],
                        undoEntry: null,
                        taskId,
                        actionType,
                        error: `⚠️ Task not found: ${taskId}`,
                        executionSummary: buildExecutionSummary({ attempted: 1, failed: 1, localOnly: 1 }),
                    };
                }

                const dropChanges = action.changes || {};
                const hasTickTickMutation =
                    dropChanges.projectId !== undefined ||
                    dropChanges.priority !== undefined ||
                    dropChanges.title !== undefined ||
                    dropChanges.content !== undefined ||
                    dropChanges.dueDate !== undefined;

                if (hasTickTickMutation) {
                    const safeDueDate = resolveDueDate(dropChanges.dueDate, 0);
                    const updatePayload = {
                        projectId: dropChanges.projectId || task.projectId,
                        originalProjectId: task.projectId,
                        priority: dropChanges.priority ?? 0,
                    };
                    if (dropChanges.title !== undefined) {
                        updatePayload.title = dropChanges.title;
                    }
                    if (
                        dropChanges.content !== undefined &&
                        !containsSensitiveContent(task.content || '')
                    ) {
                        updatePayload.content = dropChanges.content;
                    }
                    if (safeDueDate !== undefined) updatePayload.dueDate = safeDueDate;

                    await adapter.updateTask(task.id, updatePayload);
                }

                // Pure-orchestration drop (no TickTick mutation) produces outcome only.
                // Caller must persist store.markTaskProcessed for all drops.
                const outcome = hasTickTickMutation
                    ? `Drop: "${task.title}"`
                    : `Drop: "${task.title}" (not deleted — mark complete in TickTick if you agree)`;

                return {
                    outcomes: [outcome],
                    undoEntry: null,
                    taskId,
                    actionType,
                    error: null,
                    executionSummary: buildExecutionSummary({
                        attempted: 1,
                        succeeded: 1,
                        ticktickChanged: hasTickTickMutation ? 1 : 0,
                        localOnly: hasTickTickMutation ? 0 : 1,
                    }),
                };
            }

            // ─── Unknown type ────────────────────────────────────
            default:
                return {
                    outcomes: [],
                    undoEntry: null,
                    taskId,
                    actionType,
                    error: `⚠️ Skipped invalid/unsupported action: ${actionType}`,
                    executionSummary: buildExecutionSummary({ attempted: 1, failed: 1, localOnly: 1 }),
                };
        }
    } catch (err) {
        console.error('executeReorgAction failed:', err.message);
        return {
            outcomes: [],
            undoEntry: null,
            taskId: taskId || 'unknown',
            actionType,
            error: `❌ Failed on "${taskId || 'unknown'}": could not apply safely`,
            executionSummary: buildExecutionSummary({ attempted: 1, failed: 1 }),
        };
    }
}
