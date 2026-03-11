/**
 * services/pipeline.js
 * Orchestrates the full task processing flow: 
 * Message -> AX Intent Extraction -> Normalization -> TickTick Adapter Execution
 */
import { createPipelineContextBuilder } from './pipeline-context.js';

export function createPipeline({ axIntent, normalizer, adapter }) {
    const contextBuilder = createPipelineContextBuilder({ adapter });

    /**
     * Processes a user message through the entire pipeline.
     * @param {string} userMessage - Raw text from the user
     * @param {Object} options - Context options like existingTask, entryPoint, mode
     */
    async function processMessage(userMessage, options = {}) {
        try {
            const context = await contextBuilder.buildRequestContext(userMessage, options);
            console.log(`[Pipeline:${context.requestId}] Processing message: "${context.userMessage.substring(0, 50)}..."`);

            // Phase 1: Intent Extraction (AX)
            const availableProjectNames = Array.isArray(context.availableProjectNames)
                ? context.availableProjectNames
                : context.availableProjects
                    .map(p => p?.name)
                    .filter(name => typeof name === 'string' && name.trim());

            const intents = await axIntent.extractIntents(context.userMessage, {
                currentDate: context.currentDate,
                availableProjects: availableProjectNames
            });

            if (!intents || intents.length === 0) {
                console.log(`[Pipeline:${context.requestId}] No intents extracted. Routing as non-task.`);
                return { type: 'non-task', results: [], errors: [] };
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

            if (validActions.length === 0) {
                console.log(`[Pipeline:${context.requestId}] All intents failed validation. Routing as non-task.`);
                return { type: 'non-task', results: [], errors: ['All actions failed validation.'] };
            }

            // Phase 3: Execution (Adapter)
            const executionResult = await _executeActions(validActions, adapter, context.requestId);

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
    async function _executeActions(actions, adapter, requestId = 'n/a') {
        const results = [];
        const errors = [];

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
                console.log(`[Pipeline:${requestId}] ✅ ${action.type.toUpperCase()} successful: ${action.title || action.taskId}`);
            } catch (err) {
                // Graceful failure handling (FR-016)
                console.error(`[Pipeline:${requestId}] ❌ API Failure during ${action.type}:`, err.message);
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
