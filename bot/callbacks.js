// Inline keyboard callback handlers — approve, skip, drop
// These move tasks from pendingTasks → processedTasks
import { InlineKeyboard } from 'grammy';
import * as store from '../services/store.js';

const AUTHORIZED_CHAT_ID = process.env.TELEGRAM_CHAT_ID
    ? parseInt(process.env.TELEGRAM_CHAT_ID)
    : null;

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
        if (AUTHORIZED_CHAT_ID && ctx.chat?.id !== AUTHORIZED_CHAT_ID) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const taskId = ctx.match[1];
        const data = store.getPendingTasks()[taskId];

        if (!data) {
            // Might already be processed
            if (store.isTaskProcessed(taskId)) {
                await ctx.answerCallbackQuery({ text: '✅ Already handled' });
                return;
            }
            await ctx.answerCallbackQuery({ text: '⚠️ Task not found' });
            return;
        }

        try {
            const update = { projectId: data.projectId };
            if (data.improvedTitle) update.title = data.improvedTitle;
            if (data.improvedContent) update.content = data.improvedContent;
            if (data.suggestedPriority !== undefined) update.priority = data.suggestedPriority;

            // Save original for undo
            store.addUndoEntry({
                taskId,
                action: 'approve',
                originalTitle: data.originalTitle,
                originalContent: data.originalContent,
                originalPriority: data.originalPriority,
            });

            await ticktick.updateTask(taskId, update);
            store.approveTask(taskId);

            await ctx.answerCallbackQuery({ text: '✅ Applied to TickTick!' });
            await ctx.editMessageText(
                `✅ Updated: "${data.improvedTitle || data.originalTitle}"\n\nApplied to TickTick successfully.`
            );
        } catch (err) {
            console.error('Approve error:', err.message);
            await ctx.answerCallbackQuery({ text: `❌ ${err.message.slice(0, 50)}` });
        }
    });

    // ─── Skip: move pending → processed, leave TickTick alone ─
    bot.callbackQuery(/^s:(.+)$/, async (ctx) => {
        if (AUTHORIZED_CHAT_ID && ctx.chat?.id !== AUTHORIZED_CHAT_ID) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const taskId = ctx.match[1];

        if (!store.isTaskPending(taskId)) {
            await ctx.answerCallbackQuery({ text: '✅ Already handled' });
            return;
        }

        store.skipTask(taskId);
        await ctx.answerCallbackQuery({ text: '⏭ Skipped' });
        await ctx.editMessageText('⏭ Skipped — task left unchanged in TickTick.');
    });

    // ─── Drop: move pending → processed, flag for removal ─────
    bot.callbackQuery(/^d:(.+)$/, async (ctx) => {
        if (AUTHORIZED_CHAT_ID && ctx.chat?.id !== AUTHORIZED_CHAT_ID) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const taskId = ctx.match[1];

        if (!store.isTaskPending(taskId)) {
            await ctx.answerCallbackQuery({ text: '✅ Already handled' });
            return;
        }

        store.dropTask(taskId);
        await ctx.answerCallbackQuery({ text: '⚪ Flagged for removal' });
        await ctx.editMessageText(
            '⚪ Consider dropping — this task has been flagged.\nGo to TickTick to delete it if you agree.'
        );
    });
}
