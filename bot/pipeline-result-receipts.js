import { InlineKeyboard } from 'grammy';
import { buildFreeformReceipt } from '../services/shared-utils.js';
import { persistPipelineUndoEntries } from '../services/pipeline-undo-persistence.js';

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

    if (!result?.dryRun) {
        const { undoCount } = await persistPipelineUndoEntries({ result, store, userId, batchPrefix: 'undo' });

        if (undoCount > 0) {
            replyExtra.reply_markup = new InlineKeyboard().text('↩️ Undo', 'undo:last');
        }

        return { text, replyExtra, undoCount };
    }

    return { text, replyExtra, undoCount: 0 };
}
