import { buildUndoEntryFromRollbackStep } from './shared-utils.js';

function buildBatchId(batchPrefix = 'undo') {
    return `${batchPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Persist undo entries for successful pipeline results.
 * Persistence failure is best-effort only; per-entry errors are collected and never thrown.
 *
 * @param {Object} params
 * @param {Object} params.result - Pipeline result containing results[].
 * @param {Object} params.store - Store module with addUndoEntry().
 * @param {string|number} [params.userId] - Optional user id attached to undo entries.
 * @param {string} [params.batchPrefix='undo'] - Prefix for generated batch id.
 * @returns {Promise<Object>} Persistence summary.
 */
export async function persistPipelineUndoEntries({ result, store, userId, batchPrefix = 'undo' }) {
    const errors = [];
    const entries = Array.isArray(result?.results) ? result.results : [];
    if (!store?.addUndoEntry) return { undoCount: 0, batchId: null, errors };

    const batchId = buildBatchId(batchPrefix);
    let undoCount = 0;

    for (let index = 0; index < entries.length; index++) {
        const record = entries[index];
        if (record?.status !== 'succeeded' || !record.rollbackStep) continue;
        try {
            const entry = buildUndoEntryFromRollbackStep(record.rollbackStep, record.action);
            entry.batchId = batchId;
            if (userId !== undefined) entry.userId = userId;
            await store.addUndoEntry(entry);
            undoCount++;
        } catch (err) {
            errors.push({ index, errorClass: err?.name || 'Error' });
            console.error(`[PipelineUndoPersistence] undo persistence failed: ${err?.name || 'Error'}`);
        }
    }

    return { undoCount, batchId, errors };
}
