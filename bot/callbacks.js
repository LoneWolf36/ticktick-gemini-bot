// Inline keyboard callback handlers — approve, skip, drop
// These move tasks from pendingTasks → processedTasks
import { InlineKeyboard } from 'grammy';
import * as store from '../services/store.js';
import { buildTickTickUpdate, isAuthorized, buildUndoEntry, PRIORITY_LABEL, editWithMarkdown } from './utils.js';

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

export function registerCallbacks(bot, ticktick, gemini) {

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
            const updatedTask = await ticktick.updateTask(taskId, update);

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
            await editWithMarkdown(ctx, `✅ **Updated:** "${data.improvedTitle || data.originalTitle}"${movedNote}${dateNote}\n\n_Applied successfully._`);
        } catch (err) {
            console.error('Approve error:', err.message);
            await ctx.answerCallbackQuery({ text: `❌ ${err.message.slice(0, 50)}` });
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

        if (!store.isTaskPending(taskId)) {
            await ctx.answerCallbackQuery({ text: '✅ Already handled' });
            return;
        }

        await store.dropTask(taskId);
        await ctx.answerCallbackQuery({ text: '⚪ Flagged for removal' });
        await editWithMarkdown(
            ctx,
            '⚪ **Consider dropping** — this task has been flagged.\n_Go to TickTick to delete it if you agree._'
        );
    });
}
