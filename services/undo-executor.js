/**
 * Undo execution helpers — revert pipeline mutations through the TickTick adapter.
 *
 * Moved from bot/utils.js to eliminate the passthrough re-export layer.
 * These helpers are consumed by bot/commands.js (/undo command) and
 * bot/callbacks.js (undo:last inline button). Both call executeUndoBatch directly.
 *
 * @module services/undo-executor
 */

/**
 * Format a pipeline error result for user-facing display.
 *
 * @param {Object} result - Pipeline error result with `confirmationText`, `isDevMode`, `diagnostics`
 * @param {Object} [options]
 * @param {boolean} [options.compact=false] - When true, collapse newlines to single-line separators
 * @returns {string} User-safe error message (never leaks internal diagnostics unless isDevMode)
 */
export function formatPipelineFailure(result, { compact = false } = {}) {
    if (!result) return '⚠️ Pipeline failed.';
    const diagnosticsEnabled = result.isDevMode === true;
    const diagnostics = diagnosticsEnabled && Array.isArray(result.diagnostics) && result.diagnostics.length > 0
        ? `\n\n${result.diagnostics.join('\n')}`
        : '';
    const message = `${result.confirmationText || '⚠️ Pipeline failed.'}${diagnostics}`;
    return compact ? message.replace(/\n+/g, ' | ') : message;
}

/**
 * Execute a single undo entry against the TickTick adapter.
 * Handles all rollback types: delete_created, restore_updated, recreate_deleted, uncomplete_task,
 * plus legacy update-based restore for pre-rollback entries.
 *
 * @param {Object} entry - Undo entry from the store
 * @param {TickTickAdapter} adapter - TickTick adapter instance
 * @returns {Promise<{reverted: string[]}>} Array of reverted task titles
 */
export async function executeUndoEntry(entry, adapter) {
    const rollbackType = entry.rollbackType;

    if (!rollbackType) {
        // Legacy undo: update-based restore (pre-rollback entries from approve/reorg flows)
        await adapter.updateTask(entry.taskId, {
            originalProjectId: entry.appliedProjectId || entry.originalProjectId,
            projectId: entry.originalProjectId,
            title: entry.originalTitle,
            content: entry.originalContent,
            priority: entry.originalPriority,
        });
        return { reverted: [entry.originalTitle || entry.taskId] };
    }

    switch (rollbackType) {
        case 'delete_created': {
            // Create undo: delete the created task
            const projectId = entry.targetProjectId || entry.originalProjectId;
            if (!projectId) {
                throw new Error('Cannot undo create: no projectId available');
            }
            await adapter.deleteTask(entry.taskId, projectId);
            return { reverted: [entry.originalTitle || entry.taskId] };
        }
        case 'restore_updated': {
            // Update undo: restore snapshot fields
            const snapshot = entry.snapshot;
            if (!snapshot) {
                throw new Error('Cannot undo update: no snapshot available');
            }
            await adapter.updateTask(entry.taskId, {
                originalProjectId: snapshot.projectId,
                projectId: snapshot.projectId,
                title: snapshot.title || '',
                content: snapshot.content || null,
                priority: snapshot.priority ?? null,
                dueDate: snapshot.dueDate || null,
            });
            return { reverted: [snapshot.title || entry.taskId] };
        }
        case 'recreate_deleted':
        case 'uncomplete_task': {
            // Delete/complete undo: recreate from snapshot
            const snapshot = entry.snapshot;
            if (!snapshot) {
                throw new Error(`Cannot undo ${rollbackType}: no snapshot available`);
            }
            await adapter.createTask({
                title: snapshot.title || '',
                content: snapshot.content || null,
                priority: snapshot.priority ?? null,
                dueDate: snapshot.dueDate || null,
                projectId: snapshot.projectId || entry.targetProjectId,
            });
            return { reverted: [snapshot.title || entry.taskId] };
        }
        default:
            throw new Error(`Unknown rollback type: ${rollbackType}`);
    }
}

/**
 * Execute a batch of undo entries, tolerating individual failures.
 *
 * @param {Array<Object>} entries - Undo entries to execute
 * @param {TickTickAdapter} adapter - TickTick adapter instance
 * @returns {Promise<{reverted: string[], successful: Object[]}>}
 */
export async function executeUndoBatch(entries, adapter) {
    const reverted = [];
    const successful = [];

    for (const entry of entries) {
        try {
            const result = await executeUndoEntry(entry, adapter);
            reverted.push(...result.reverted);
            successful.push(entry);
        } catch (err) {
            console.error(`[UNDO] Failed to revert "${entry.originalTitle || entry.taskId}": ${err.message}`);
        }
    }

    return { reverted, successful };
}
