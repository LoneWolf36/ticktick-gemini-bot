// Inline keyboard callback handlers — approve, skip, drop, mutation clarification
// These move tasks from pendingTasks → processedTasks and resume mutation clarifications
import { InlineKeyboard } from 'grammy';
import * as store from '../services/store.js';
import { buildTickTickUpdate, isAuthorized, buildUndoEntry, PRIORITY_LABEL, editWithMarkdown, truncateMessage } from './utils.js';

// Pending mutation clarification expiry: 10 minutes
const MUTATION_CLARIFICATION_TTL_MS = 10 * 60 * 1000;

// ─── Build Keyboard for Task Review ─────────────────────────

export function taskReviewKeyboard(taskId) {
    // Telegram callback_data has 64-byte limit — truncate if needed
    const id = taskId.length > 50 ? taskId.slice(0, 50) : taskId;
    return new InlineKeyboard()
        .text('✅ Apply', `a:${id}`)
        .text('⏭ Skip', `s:${id}`)
        .row()
        .text('⚪ Drop Task', `d:${id}`);
}

// ─── Register Callback Handlers ─────────────────────────────

export function registerCallbacks(bot, ticktick, gemini, adapter, pipeline) {

    // ─── Approve: move pending → processed, update TickTick ───
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
            const allTasks = await ticktick.getAllTasksCached(30000);
            const availableProjects = ticktick.getLastFetchedProjects();

            // Find the full task object from TickTick cache
            const resolvedTask = allTasks.find(t => t.id === selectedTaskId);
            if (!resolvedTask) {
                await editWithMarkdown(ctx, `⚠️ **"${candidate.title}"** not found in TickTick. Try again.`);
                return;
            }

            // Re-enter the pipeline with the original message + resolved task context.
            // This ensures the same AX intent -> normalizer -> adapter safety path.
            const result = await pipeline.processMessage(pending.originalMessage, {
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
}
