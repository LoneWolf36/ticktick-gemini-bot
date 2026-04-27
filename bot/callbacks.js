// Inline keyboard callback handlers — approve, skip, drop, mutation clarification, checklist clarification.
// These move tasks from pendingTasks → processedTasks and resume mutation clarifications
import { InlineKeyboard } from 'grammy';
import * as store from '../services/store.js';
import { buildTickTickUpdate, isAuthorized, buildUndoEntry, PRIORITY_LABEL, editWithMarkdown, truncateMessage } from './utils.js';

// Pending mutation clarification expiry: 10 minutes
const MUTATION_CLARIFICATION_TTL_MS = 10 * 60 * 1000;

// ─── Build Keyboard for Task Review ─────────────────────────

/**
 * Build an inline keyboard for task review.
 *
 * @param {string} taskId - The TickTick task ID.
 * @param {string} [actionType='update'] - The action type: 'update', 'complete', or 'delete'.
 * @returns {InlineKeyboard} Grammy inline keyboard instance.
 */
export function taskReviewKeyboard(taskId, actionType = 'update') {
    // Telegram callback_data has 64-byte limit — truncate if needed
    const id = taskId.length > 50 ? taskId.slice(0, 50) : taskId;
    if (actionType === 'complete') {
        return new InlineKeyboard()
            .text('✅ Confirm complete', `a:${id}`)
            .text('⏭ Keep active', `s:${id}`)
            .row()
            .text('🗑️ Delete instead', `d:${id}`);
    }
    if (actionType === 'delete') {
        return new InlineKeyboard()
            .text('🗑️ Confirm delete', `a:${id}`)
            .text('⏭ Keep task', `s:${id}`);
    }
    return new InlineKeyboard()
        .text('✅ Apply changes', `a:${id}`)
        .text('✏️ Refine', `r:${id}`)
        .row()
        .text('⏭ Keep original', `s:${id}`)
        .text('🗑️ Delete task', `d:${id}`);
}

// ─── Register Callback Handlers ─────────────────────────────

/**
 * Register all inline keyboard callback handlers.
 *
 * @param {Bot} bot - Grammy bot instance.
 * @param {TickTickAdapter} adapter - TickTick adapter instance.
 * @param {Object} pipeline - Pipeline instance.
 */
export function registerCallbacks(bot, adapter, pipeline) {
    const processPipelineMessage = (userMessage, options) =>
        typeof pipeline.processMessageWithContext === 'function'
            ? pipeline.processMessageWithContext(userMessage, options)
            : pipeline.processMessage(userMessage, options);

    // ─── Refine: Request user input for specific task tweaks ──
    bot.callbackQuery(/^r:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
             await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
             return;
        }
        const taskId = ctx.match[1];
        const data = store.getPendingTasks()[taskId];

        if (!data) {
             await ctx.answerCallbackQuery({ text: '⚠️ Task not pending' });
             return;
        }
        
        await store.setPendingTaskRefinement(taskId);
        await ctx.answerCallbackQuery({ text: 'Ready for refinement' });
        const cancelKeyboard = new InlineKeyboard().text('❌ Cancel', 'rcancel');
        await ctx.reply(`✏️ **Refining "${data.originalTitle}"**\nSend your tweaks (e.g. "make it high priority", "move to admin project").`, {
            reply_parameters: { message_id: ctx.callbackQuery.message.message_id },
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard
        });
    });

    bot.callbackQuery('rcancel', async (ctx) => {
        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        await store.clearPendingTaskRefinement();
        await ctx.answerCallbackQuery({ text: 'Refinement cancelled' });
        await ctx.editMessageText('Refinement cancelled.');
    });

    // ─── Approve: move pending → processed, update TickTick ───
    // RETAINED BOUNDARY: inline review callbacks apply precomputed review edits
    // directly through the adapter. This is an operational review surface, not
    // product-feature drift from the canonical pipeline write path.
    bot.callbackQuery(/^a:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const taskId = ctx.match[1];
        const data = store.getPendingTasks()[taskId];

        if (!data) {
            if (store.isTaskProcessed(taskId)) {
                await ctx.answerCallbackQuery({ text: '✅ Already handled' });
                return;
            }
            await ctx.answerCallbackQuery({ text: '⚠️ Task not found' });
            return;
        }

        try {
            const actionType = data.actionType || 'update';

            if (actionType === 'complete') {
                const projectId = data.projectId || data.originalProjectId;
                await adapter.completeTask(taskId, projectId);
                await store.addUndoEntry(buildUndoEntry({
                    source: { id: taskId, title: data.originalTitle, content: data.originalContent, priority: data.originalPriority, projectId: data.originalProjectId },
                    action: 'complete',
                    applied: {},
                    appliedTaskId: taskId,
                }));
                await store.approveTask(taskId);
                await ctx.answerCallbackQuery({ text: '✅ Marked as done!' });
                await editWithMarkdown(ctx, `✅ **Completed:** "${data.originalTitle}"`);
            } else if (actionType === 'delete') {
                const projectId = data.projectId || data.originalProjectId;
                await adapter.deleteTask(taskId, projectId);
                await store.addUndoEntry(buildUndoEntry({
                    source: { id: taskId, title: data.originalTitle, content: data.originalContent, priority: data.originalPriority, projectId: data.originalProjectId },
                    action: 'delete',
                    applied: {},
                    appliedTaskId: taskId,
                }));
                await store.approveTask(taskId);
                await ctx.answerCallbackQuery({ text: '🗑️ Deleted' });
                await editWithMarkdown(ctx, `🗑️ **Deleted:** "${data.originalTitle}"`);
            } else {
                const update = buildTickTickUpdate(data);
                const updatedTask = await adapter.updateTask(taskId, update);

                await store.addUndoEntry(buildUndoEntry({
                    source: data, // `data` has taskId, originalTitle, etc.
                    action: 'approve',
                    appliedTaskId: updatedTask.id,
                    applied: {
                        title: data.improvedTitle ?? null,
                        priority: PRIORITY_LABEL[data.suggestedPriority] ?? null,
                        project: (data.suggestedProjectId && data.suggestedProjectId !== data.projectId)
                            ? data.suggestedProject : null,
                        projectId: (data.suggestedProjectId && data.suggestedProjectId !== data.projectId)
                            ? data.suggestedProjectId : null,
                        schedule: data.suggestedSchedule ?? null,
                    }
                }));

                await store.approveTask(taskId);

                const movedNote = (data.suggestedProjectId && data.suggestedProjectId !== data.projectId)
                    ? ` Moved to ${data.suggestedProject}.` : '';
                const dateNote = data.suggestedSchedule && data.suggestedSchedule !== 'someday'
                    ? ` Due: ${data.suggestedSchedule}.` : '';

                await ctx.answerCallbackQuery({ text: '✅ Applied to TickTick!' });
                await editWithMarkdown(ctx, `✅ **Updated:** "${data.improvedTitle || data.originalTitle}"${movedNote}${dateNote}\n\n*Applied successfully.*`);
            }
        } catch (err) {
            console.error('Approve error:', err.message);
            await ctx.answerCallbackQuery({ text: '❌ Failed to update task. Please try again.' });
        }
    });

    // ─── Skip: move pending → processed, leave TickTick alone ─
    bot.callbackQuery(/^s:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const taskId = ctx.match[1];

        if (!store.isTaskPending(taskId)) {
            await ctx.answerCallbackQuery({ text: '✅ Already handled' });
            return;
        }

        await store.skipTask(taskId);
        await ctx.answerCallbackQuery({ text: '⏭ Skipped' });
        await editWithMarkdown(ctx, '⏭ **Skipped** — task left unchanged in TickTick.');
    });

    // ─── Drop: move pending → processed, flag for removal ─────
    // RETAINED BOUNDARY: inline drop callbacks intentionally perform the final
    // delete through the adapter after human confirmation. This is kept as an
    // operational moderation surface, not a freeform task-writing path.
    bot.callbackQuery(/^d:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const taskId = ctx.match[1];
        const data = store.getPendingTasks()[taskId];

        if (!store.isTaskPending(taskId)) {
            await ctx.answerCallbackQuery({ text: '✅ Already handled' });
            return;
        }

        await store.dropTask(taskId);
        try {
            const projectId = data?.projectId || data?.originalProjectId || null;
            await adapter.deleteTask(taskId, projectId);
            await ctx.answerCallbackQuery({ text: '⚪ Deleted from TickTick' });
            await editWithMarkdown(ctx, '⚪ **Deleted** — task was removed from TickTick.');
        } catch (err) {
            console.error('Drop error:', err.message);
            await ctx.answerCallbackQuery({ text: '❌ Delete failed. The task is marked dropped locally.' });
        }
    });

    // ─── Mutation Candidate Selection ────────────────────────
    // Handles user picking a task from the clarification keyboard.
    // Resumes through the pipeline (AX intent -> normalizer -> adapter), not direct adapter writes.
    bot.callbackQuery(/^mut:pick:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const selectedTaskId = ctx.match[1];
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;

        const pending = store.getPendingMutationClarification();

        // Fail-closed: no pending state
        if (!pending) {
            await ctx.answerCallbackQuery({ text: '⚠️ No pending clarification found.' });
            await editWithMarkdown(ctx, '⚠️ **No pending clarification.** Rephrase your request.');
            return;
        }

        // Cross-chat/user rejection
        if (pending.chatId && chatId && pending.chatId !== chatId) {
            await ctx.answerCallbackQuery({ text: '⚠️ Wrong chat.' });
            return;
        }
        if (pending.userId && userId && pending.userId !== userId) {
            await ctx.answerCallbackQuery({ text: '⚠️ Wrong user.' });
            return;
        }

        // Expired state check
        const createdAt = pending.createdAt ? new Date(pending.createdAt).getTime() : 0;
        if (createdAt && (Date.now() - createdAt > MUTATION_CLARIFICATION_TTL_MS)) {
            await store.clearPendingMutationClarification();
            await ctx.answerCallbackQuery({ text: '⏰ Expired.' });
            await editWithMarkdown(ctx, '⏰ **Clarification expired.** Rephrase your request.');
            return;
        }

        // Validate candidate exists in stored list
        const candidate = pending.candidates.find(c => c.id === selectedTaskId);
        if (!candidate) {
            await ctx.answerCallbackQuery({ text: '⚠️ Candidate not found.' });
            return;
        }

        // Duplicate tap guard: mark as consumed immediately to prevent replay
        await store.clearPendingMutationClarification();
        await ctx.answerCallbackQuery({ text: `Selected: "${candidate.title}"` });

        // Resume through the pipeline with resolved task context.
        // Reconstruct the original message and inject the resolved task.
        try {
            const allTasks = await adapter.listActiveTasks();
            const availableProjects = await adapter.listProjects();

            // Find the full task object from TickTick cache
            const resolvedTask = allTasks.find(t => t.id === selectedTaskId);
            if (!resolvedTask) {
                await editWithMarkdown(ctx, `⚠️ **"${candidate.title}"** not found in TickTick. Try again.`);
                return;
            }

            // Re-enter the pipeline with the original message + resolved task context.
            // This ensures the same AX intent -> normalizer -> adapter safety path.
            const result = await processPipelineMessage(pending.originalMessage, {
                existingTask: resolvedTask,
                entryPoint: pending.entryPoint || 'telegram:clarification-resume',
                mode: pending.mode || 'interactive',
                availableProjects,
                skipClarification: true, // Don't re-ask for the same ambiguity
            });

            if (result.type === 'task') {
                await editWithMarkdown(ctx, truncateMessage(result.confirmationText, 4000));
            } else if (result.type === 'error') {
                const diag = result.isDevMode && result.diagnostics?.length > 0
                    ? `\n\n${result.diagnostics.slice(0, 3).join('\n')}`
                    : '';
                await editWithMarkdown(ctx, `❌ ${result.confirmationText}${diag}`);
            } else {
                await editWithMarkdown(ctx, `✅ **"${candidate.title}"** selected. ${result.confirmationText || 'Proceeding.'}`);
            }
        } catch (err) {
            console.error('Mutation clarification resume error:', err.message);
            await editWithMarkdown(ctx, '❌ Failed to process the selection. Please try again.');
        }
    });

    // ─── Mutation Clarification Cancel ───────────────────────
    bot.callbackQuery(/^mut:cancel$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const pending = store.getPendingMutationClarification();

        // Cross-chat/user rejection for cancel too
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;
        if (pending) {
            if (pending.chatId && chatId && pending.chatId !== chatId) {
                await ctx.answerCallbackQuery({ text: '⚠️ Wrong chat.' });
                return;
            }
            if (pending.userId && userId && pending.userId !== userId) {
                await ctx.answerCallbackQuery({ text: '⚠️ Wrong user.' });
                return;
            }
        }

        await store.clearPendingMutationClarification();
        await ctx.answerCallbackQuery({ text: 'Canceled' });
        await editWithMarkdown(ctx, '❌ **Clarification canceled.** Rephrase or try again.');
    });

    // ─── Checklist Clarification: shared handler ─────────────
    async function _handleChecklistClarification(ctx, { preference, skipChecklist, successPrefix }) {
        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const pending = store.getPendingChecklistClarification();
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;

        if (!pending) {
            await ctx.answerCallbackQuery({ text: '⚠️ No pending clarification found.' });
            await editWithMarkdown(ctx, '⚠️ **No pending clarification.** Rephrase your request.');
            return;
        }
        if (pending.chatId && chatId && pending.chatId !== chatId) {
            await ctx.answerCallbackQuery({ text: '⚠️ Wrong chat.' });
            return;
        }
        if (pending.userId && userId && pending.userId !== userId) {
            await ctx.answerCallbackQuery({ text: '⚠️ Wrong user.' });
            return;
        }

        await store.clearPendingChecklistClarification();

        const pipelineOptions = {
            entryPoint: 'telegram:checklist-clarification-button',
            mode: 'interactive',
            availableProjects: await adapter.listProjects(),
        };

        if (skipChecklist) {
            pipelineOptions.skipChecklist = true;
        } else {
            pipelineOptions.checklistPreference = preference;
        }

        try {
            const result = await processPipelineMessage(pending.originalMessage, pipelineOptions);

            if (result.type === 'task') {
                await editWithMarkdown(ctx, truncateMessage(result.confirmationText, 4000));
            } else if (result.type === 'error') {
                const diag = result.isDevMode && result.diagnostics?.length > 0
                    ? `\n\n${result.diagnostics.slice(0, 3).join('\n')}`
                    : '';
                await editWithMarkdown(ctx, `❌ ${result.confirmationText}${diag}`);
            } else {
                await editWithMarkdown(ctx, `${successPrefix} ${result.confirmationText || 'Proceeding.'}`);
            }
        } catch (err) {
            console.error('Checklist clarification resume error:', err.message);
            await editWithMarkdown(ctx, '❌ Failed to process. Please try again.');
        }
    }

    bot.callbackQuery(/^cl:checklist$/, async (ctx) => {
        await ctx.answerCallbackQuery({ text: '📋 Checklist mode' });
        console.log('[ChecklistClarification] Button: checklist selected');
        await _handleChecklistClarification(ctx, {
            preference: 'checklist',
            successPrefix: '✅ **Checklist mode.**',
        });
    });

    bot.callbackQuery(/^cl:separate$/, async (ctx) => {
        await ctx.answerCallbackQuery({ text: '📝 Separate tasks' });
        console.log('[ChecklistClarification] Button: separate selected');
        await _handleChecklistClarification(ctx, {
            preference: 'separate',
            successPrefix: '✅ **Separate tasks.**',
        });
    });

    bot.callbackQuery(/^cl:skip$/, async (ctx) => {
        await ctx.answerCallbackQuery({ text: '⏭ Skipped' });
        console.log('[ChecklistClarification] Button: skip selected');
        await _handleChecklistClarification(ctx, {
            skipChecklist: true,
            successPrefix: '✅ **Single task.**',
        });
    });
}
