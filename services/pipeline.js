/**
 * services/pipeline.js
 * Orchestrates the full task processing flow: 
 * Message -> AX Intent Extraction -> Normalization -> TickTick Adapter Execution
 */

export function createPipeline({ axIntent, normalizer, adapter }) {

    /**
     * Processes a user message through the entire pipeline.
     * @param {string} userMessage - Raw text from the user
     * @param {Object} options - Context options like existingTask, timezone
     */
    async function processMessage(userMessage, options = {}) {
        try {
            console.log(`[Pipeline] Processing message: "${userMessage.substring(0, 50)}..."`);

            // Phase 1: Intent Extraction (AX)
            const axResult = await axIntent.extractIntents(userMessage, options);

            if (!axResult || axResult.intents.length === 0) {
                console.log(`[Pipeline] No intents extracted. Routing as non-task.`);
                return { type: 'non-task', results: [], errors: [] };
            }

            // Phase 2: Normalization
            // Fetch projects once for the normalizer to resolve project hints
            const projects = await adapter.listProjects();
            const defaultProjectId = projects.find(p => p.name.toLowerCase() === 'inbox')?.id || null;

            const normOptions = {
                ...options,
                projects,
                defaultProjectId,
                existingTaskContent: options.existingTask?.content || null
            };

            const normalizedActions = normalizer.normalizeActions(axResult.intents, normOptions);

            const validActions = normalizedActions.filter(a => a.valid);
            const invalidActions = normalizedActions.filter(a => !a.valid);

            if (invalidActions.length > 0) {
                console.warn(`[Pipeline] Filtered out ${invalidActions.length} invalid actions:`, invalidActions.map(a => a.validationErrors));
            }

            if (validActions.length === 0) {
                console.log(`[Pipeline] All intents failed validation. Routing as non-task.`);
                return { type: 'non-task', results: [], errors: ['All actions failed validation.'] };
            }

            // Phase 3: Execution (Adapter)
            const executionResult = await _executeActions(validActions, adapter);

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
                confirmationText
            };

        } catch (error) {
            console.error('[Pipeline] Unhandled pipeline error:', error);
            return {
                type: 'error',
                errors: [error.message],
                confirmationText: '⚠️ An unexpected error occurred while processing your request.'
            };
        }
    }

    /**
     * Internal execution router
     */
    async function _executeActions(actions, adapter) {
        const results = [];
        const errors = [];

        console.log(`[Pipeline] Executing ${actions.length} valid action(s).`);

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
                        result = await adapter.completeTask(action.taskId);
                        break;
                    case 'delete':
                        result = await adapter.deleteTask(action.taskId);
                        break;
                    default:
                        throw new Error(`Unsupported action type: ${action.type}`);
                }
                results.push({ action, result, success: true });
                console.log(`[Pipeline] ✅ ${action.type.toUpperCase()} successful: ${action.title || action.taskId}`);
            } catch (err) {
                // Graceful failure handling (FR-016)
                console.error(`[Pipeline] ❌ API Failure during ${action.type}:`, err.message);
                errors.push(`${action.type} failed: ${err.message}`);
                results.push({ action, error: err, success: false });
            }
        }

        return { results, errors };
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
