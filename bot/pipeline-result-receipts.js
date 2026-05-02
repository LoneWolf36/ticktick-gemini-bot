import { InlineKeyboard } from 'grammy';
import { buildUndoEntryFromRollbackStep, buildFreeformReceipt } from '../services/shared-utils.js';

/**
 * Build a freeform Telegram receipt and persist undo entries when possible.
 * Safe default: persistence failures log and still return the applied receipt.
 *
 * @param {Object} params
 * @param {Object} params.result - Pipeline result for a successful freeform mutation.
 * @param {Object} [params.store] - Store module with addUndoEntry().
 * @param {string|number} [params.userId] - User id used only for undo entry grouping.
 * @param {Array<Object>} [params.projects=[]] - Known TickTick projects for receipt diffs.
 * @returns {Promise<{text: string, replyExtra: Object, undoCount: number}>}
 */
export async function buildFreeformPipelineResultReceipt({ result, store, userId, projects = [] }) {
    const replyExtra = {};
    const text = result?.dryRun
        ? `${result?.confirmationText || 'Done.'} (preview)`
        : (buildFreeformReceipt(result, { projects }) || result?.confirmationText || 'Done.');

    if (!result?.dryRun && store?.addUndoEntry) {
        const batchId = `undo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        let undoCount = 0;

        for (const record of result.results || []) {
            if (record.status !== 'succeeded' || !record.rollbackStep) continue;
            try {
                const entry = buildUndoEntryFromRollbackStep(record.rollbackStep, record.action);
                entry.batchId = batchId;
                if (userId !== undefined) entry.userId = userId;
                await store.addUndoEntry(entry);
                undoCount++;
            } catch (err) {
                console.error(`[FreeformReceipt] undo persistence failed: ${err.message}`);
            }
        }

        if (undoCount > 0) {
            replyExtra.reply_markup = new InlineKeyboard().text('↩️ Undo', 'undo:last');
        }

        return { text, replyExtra, undoCount };
    }

    return { text, replyExtra, undoCount: 0 };
}
