// Inline keyboard callback handlers — approve, skip, drop, mutation clarification, checklist clarification.
// These move tasks from pendingTasks → processedTasks and resume mutation clarifications
import { InlineKeyboard } from 'grammy';
import * as store from '../services/store.js';
import {
    buildTickTickUpdate,
    isAuthorized,
    buildUndoEntry,
    PRIORITY_LABEL,
    editWithMarkdown,
    truncateMessage,
    buildTaskCard,
    pendingToAnalysis,
    replyWithMarkdown,
    sleep,
    answerCallbackQueryBestEffort
} from '../services/shared-utils.js';
import { buildFreeformPipelineResultReceipt } from './pipeline-result-receipts.js';
import { executeUndoBatch } from '../services/undo-executor.js';

// Pending mutation clarification expiry: 10 minutes
const MUTATION_CLARIFICATION_TTL_MS = 10 * 60 * 1000;

/**
 * Wraps ctx.answerCallbackQuery with timeout telemetry.
 * @param {Object} ctx - Grammy context
 * @param {Object} [options] - answerCallbackQuery options
 */
const safeAnswerCallbackQuery = answerCallbackQueryBestEffort;
const inFlightReviewClaims = new Map();

function getReviewSnapshot(data) {
    return {
        title: data?.originalTitle ?? '',
        content: data?.originalContent ?? null,
        priority: data?.originalPriority ?? null,
        projectId: data?.originalProjectId ?? data?.projectId ?? null,
        dueDate: data?.originalDueDate ?? data?.dueDate ?? null
    };
}

function canonicalizeBlankContent(value) {
    if (value == null) return null;
    const text = String(value).trim();
    return text === '' ? null : text;
}

function canonicalizeDueDate(value) {
    if (value == null) return null;
    const text = String(value).trim();
    if (text === '') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000Z`;
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    return text;
}

function normalizeReviewTask(task, fallbackProjectId = null) {
    return {
        title: task?.title ?? '',
        content: canonicalizeBlankContent(task?.content),
        priority: task?.priority ?? null,
        projectId: task?.projectId ?? fallbackProjectId ?? null,
        dueDate: canonicalizeDueDate(task?.dueDate)
    };
}

function reviewSnapshotDiffers(expected, actual) {
    return (
        expected.title !== actual.title ||
        canonicalizeBlankContent(expected.content) !== actual.content ||
        expected.priority !== actual.priority ||
        expected.projectId !== actual.projectId ||
        canonicalizeDueDate(expected.dueDate) !== actual.dueDate
    );
}

async function parkStalePending(taskId, data, reason) {
    await store.markTaskStale(taskId, { ...data, staleReason: reason });
}

async function revalidatePendingReview(adapter, taskId, data) {
    const projectId = data?.projectId || data?.originalProjectId || null;
    if (!adapter || typeof adapter.getTaskSnapshot !== 'function') {
        return { stale: true, reason: 'revalidation unavailable' };
    }

    try {
        const liveTask = await adapter.getTaskSnapshot(taskId, projectId);
        if (!liveTask) {
            return { stale: true, reason: 'task missing' };
        }

        const expected = getReviewSnapshot(data);
        const actual = normalizeReviewTask(liveTask, projectId);
        if (reviewSnapshotDiffers(expected, actual)) {
            return { stale: true, reason: 'snapshot changed' };
        }

        return { stale: false, liveTask: actual };
    } catch (err) {
        return { stale: true, reason: 'revalidation failed' };
    }
}

function acquireReviewClaim(taskId, owner) {
    if (!taskId || inFlightReviewClaims.has(taskId)) return false;
    inFlightReviewClaims.set(taskId, owner);
    return true;
}

function releaseReviewClaim(taskId, owner) {
    if (!taskId) return;
    if (inFlightReviewClaims.get(taskId) === owner) {
        inFlightReviewClaims.delete(taskId);
    }
}

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
            .text('Complete', `a:${id}`)
            .text('Skip', `s:${id}`)
            .row()
            .text('Delete', `d:${id}`)
            .row()
            .text('Stop', 'review:stop');
    }
    if (actionType === 'delete') {
        return new InlineKeyboard().text('Delete', `a:${id}`).text('Skip', `s:${id}`).row().text('Stop', 'review:stop');
    }
    return new InlineKeyboard()
        .text('Apply', `a:${id}`)
        .text('Edit', `r:${id}`)
        .row()
        .text('Skip', `s:${id}`)
        .text('Delete', `d:${id}`)
        .row()
        .text('Stop', 'review:stop');
}

// ─── Register Callback Handlers ─────────────────────────────

/**
 * Register all inline keyboard callback handlers.
 *
 * @param {Bot} bot - Grammy bot instance.
 * @param {TickTickAdapter} adapter - TickTick adapter instance.
 * @param {Object} pipeline - Pipeline instance.
 */
async function advanceReviewCard(ctx, prefix = '') {
    const remaining = store.getPendingCount();
    const chatId = ctx.chat?.id;
    const session = chatId ? store.getCurrentReviewSession(chatId) : null;
    const startingProcessedCount = Number.isFinite(Number(session?.startingProcessedCount))
        ? Number(session.startingProcessedCount)
        : store.getProcessedCount();
    const reviewed = Math.max(0, store.getProcessedCount() - startingProcessedCount);
    const stillUnreviewed = store.getPendingCount();

    if (remaining === 0) {
        const summary = `Reviewed ${reviewed} tasks. ${stillUnreviewed} still unreviewed locally.`;
        const text = prefix ? `${prefix}\n\n${summary}` : summary;
        if (chatId) await store.clearCurrentReviewSession(chatId);
        try {
            await editWithMarkdown(ctx, text);
        } catch (err) {
            const msg = String(err?.message || '').toLowerCase();
            if (
                msg.includes('message is not modified') ||
                msg.includes('message to edit not found') ||
                msg.includes('message_id_invalid') ||
                msg.includes('too old')
            ) {
                await ctx.reply(text);
            } else {
                throw err;
            }
        }
        return;
    }

    const next = store.getNextPendingTask();
    if (!next) {
        const summary = `Reviewed ${reviewed} tasks. ${stillUnreviewed} still unreviewed locally.`;
        const text = prefix ? `${prefix}\n\n${summary}` : summary;
        if (chatId) await store.clearCurrentReviewSession(chatId);
        try {
            await editWithMarkdown(ctx, text);
        } catch (err) {
            const msg = String(err?.message || '').toLowerCase();
            if (
                msg.includes('message is not modified') ||
                msg.includes('message to edit not found') ||
                msg.includes('message_id_invalid') ||
                msg.includes('too old')
            ) {
                await ctx.reply(text);
            } else {
                throw err;
            }
        }
        return;
    }

    const [taskId, data] = next;
    const analysis = pendingToAnalysis(data);
    const card = buildTaskCard(
        {
            title: data.originalTitle,
            projectName: data.projectName,
            priority: data.originalPriority,
            content: data.originalContent,
            dueDate: data.originalDueDate
        },
        analysis
    );
    const sessionTotal = Number.isFinite(Number(session?.totalTasks)) ? Number(session.totalTasks) : 0;
    const liveTotal = reviewed + remaining;
    const totalTasks = sessionTotal > 0 ? Math.max(sessionTotal, liveTotal) : liveTotal;
    const progressLine = totalTasks > 0 ? `Task ${reviewed + 1} of ${totalTasks} · ${remaining} remaining\n\n` : '';
    const baseText = `${progressLine}${card}\n\n⏳ ${remaining} remaining`;
    const text = prefix ? `${prefix}\n\n${baseText}` : baseText;
    try {
        await editWithMarkdown(ctx, text, { reply_markup: taskReviewKeyboard(taskId, data.actionType) });
    } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        if (
            msg.includes('message is not modified') ||
            msg.includes('message to edit not found') ||
            msg.includes('message_id_invalid') ||
            msg.includes('too old')
        ) {
            console.warn(`[ReviewFlow] Edit failed, sending new message: ${msg}`);
            await replyWithMarkdown(ctx, text, { reply_markup: taskReviewKeyboard(taskId, data.actionType) });
        } else {
            throw err;
        }
    }
    await sleep(300);
}

export function registerCallbacks(bot, adapter, pipeline, { storeApi = store } = {}) {
    // Timestamp all callback queries for timeout telemetry
    if (typeof bot.on === 'function') {
        bot.on('callback_query', async (ctx, next) => {
            ctx._callbackReceivedAt = Date.now();
            await next();
        });
    }

    const processPipelineMessage = (userMessage, options) =>
        typeof pipeline.processMessageWithContext === 'function'
            ? pipeline.processMessageWithContext(userMessage, options)
            : pipeline.processMessage(userMessage, options);

    // ─── Refine: Request user input for specific task tweaks ──
    bot.callbackQuery(/^r:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        const taskId = ctx.match[1];
        const data = store.getPendingTasks()[taskId];

        if (!data) {
            await safeAnswerCallbackQuery(ctx, { text: '⚠️ Task not pending' });
            return;
        }

        await safeAnswerCallbackQuery(ctx);
        const sent = await ctx.reply(`What would you like to change about "${data.originalTitle}"?`, {
            reply_markup: { force_reply: true, selective: true },
            parse_mode: 'Markdown'
        });
        await store.setPendingTaskRefinement({
            taskId,
            mode: 'force_reply',
            forceReplyMessageId: sent.message_id,
            chatId: ctx.chat?.id,
            userId: ctx.from?.id
        });
        const cancelKeyboard = new InlineKeyboard().text('❌ Cancel', 'rcancel');
        await ctx.reply('Or tap Cancel to discard:', {
            reply_markup: cancelKeyboard
        });

        // Store as recently discussed
        const userId = ctx.from?.id;
        if (userId) {
            await store.setRecentTaskContext(userId, {
                taskId,
                title: data.originalTitle,
                content: data.originalContent || undefined,
                projectId: data.projectId || data.originalProjectId,
                source: 'review:refine'
            });
        }
    });

    bot.callbackQuery('rcancel', async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        await safeAnswerCallbackQuery(ctx);
        await store.clearPendingTaskRefinement();
        await ctx.editMessageText('Refinement cancelled.');
    });

    // ─── Approve: move pending → processed, update TickTick ───
    // RETAINED BOUNDARY: inline review callbacks apply precomputed review edits
    // directly through the adapter. This is an operational review surface, not
    // product-feature drift from the canonical pipeline write path.
    bot.callbackQuery(/^a:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        const taskId = ctx.match[1];
        const data = store.getPendingTasks()[taskId];
        const claimOwner = `apply:${ctx.callbackQuery?.id || Date.now()}`;

        if (!data || store.isTaskProcessed(taskId) || !acquireReviewClaim(taskId, claimOwner)) {
            await safeAnswerCallbackQuery(ctx, { text: 'Already handled.' });
            return;
        }
        try {
            await safeAnswerCallbackQuery(ctx, { text: 'Checking preview…' });
            const actionType = data.actionType || 'update';
            let diffText = '';

            const revalidation = await revalidatePendingReview(adapter, taskId, data);
            if (revalidation.stale) {
                await parkStalePending(taskId, data, revalidation.reason);
                await editWithMarkdown(ctx, '⚠️ **Stale review preview.** Re-scan and review again.');
                return;
            }

            if (!store.isTaskPending(taskId)) {
                await safeAnswerCallbackQuery(ctx, { text: 'Already handled.' });
                await advanceReviewCard(ctx);
                return;
            }

            if (actionType === 'complete') {
                const projectId = data.projectId || data.originalProjectId;
                await adapter.completeTask(taskId, projectId);
                await store.addUndoEntry(
                    buildUndoEntry({
                        source: {
                            id: taskId,
                            title: data.originalTitle,
                            content: data.originalContent,
                            priority: data.originalPriority,
                            projectId: data.originalProjectId
                        },
                        action: 'complete',
                        applied: {},
                        appliedTaskId: taskId
                    })
                );
                await store.approveTask(taskId);
            } else if (actionType === 'delete') {
                const projectId = data.projectId || data.originalProjectId;
                await adapter.deleteTask(taskId, projectId);
                await store.addUndoEntry(
                    buildUndoEntry({
                        source: {
                            id: taskId,
                            title: data.originalTitle,
                            content: data.originalContent,
                            priority: data.originalPriority,
                            projectId: data.originalProjectId
                        },
                        action: 'delete',
                        applied: {},
                        appliedTaskId: taskId
                    })
                );
                await store.approveTask(taskId);
            } else {
                const oldTitle = data.originalTitle;
                const update = buildTickTickUpdate(data);
                const updatedTask = await adapter.updateTask(taskId, update);

                const newTitle = data.improvedTitle ?? oldTitle;
                if (newTitle !== oldTitle) {
                    diffText = `Updated: "${oldTitle}" → "${newTitle}"`;
                } else {
                    const changedFields = [];
                    if (data.improvedContent) changedFields.push('content');
                    if (data.suggestedSchedule) changedFields.push('due date');
                    if (data.suggestedPriority !== undefined && data.suggestedPriority !== data.originalPriority)
                        changedFields.push('priority');
                    if (data.suggestedProjectId && data.suggestedProjectId !== data.originalProjectId)
                        changedFields.push('project');
                    if (changedFields.length > 0) {
                        diffText = `Updated "${oldTitle}": ${changedFields.join(', ')} changed`;
                    } else {
                        diffText = `Updated "${oldTitle}"`;
                    }
                }

                await store.addUndoEntry(
                    buildUndoEntry({
                        source: data,
                        action: 'approve',
                        appliedTaskId: updatedTask.id,
                        applied: {
                            title: data.improvedTitle ?? null,
                            priority: PRIORITY_LABEL[data.suggestedPriority] ?? null,
                            project:
                                data.suggestedProjectId && data.suggestedProjectId !== data.projectId
                                    ? data.suggestedProject
                                    : null,
                            projectId:
                                data.suggestedProjectId && data.suggestedProjectId !== data.projectId
                                    ? data.suggestedProjectId
                                    : null,
                            schedule: data.suggestedSchedule ?? null
                        }
                    })
                );

                await store.approveTask(taskId);
            }
            const userId = ctx.from?.id;
            if (userId) {
                await store.setRecentTaskContext(userId, {
                    taskId,
                    title: data.improvedTitle || data.originalTitle,
                    content: data.improvedContent || data.originalContent || undefined,
                    projectId: data.suggestedProjectId || data.projectId || data.originalProjectId,
                    source: 'review:approve'
                });
            }
            await safeAnswerCallbackQuery(ctx, { text: 'Applied.' });
            await advanceReviewCard(ctx, diffText);
        } catch (err) {
            const message = err.message?.toLowerCase() || '';
            const isMissing =
                message.includes('not found') ||
                message.includes('404') ||
                message.includes('missing') ||
                message.includes('completed') ||
                message.includes('deleted');
            if (isMissing) {
                await store.approveTask(taskId);
                const userId = ctx.from?.id;
                if (userId) {
                    await store.setRecentTaskContext(userId, {
                        taskId,
                        title: data?.originalTitle || 'Unknown task',
                        content: data?.originalContent || undefined,
                        projectId: data?.projectId || data?.originalProjectId,
                        source: 'review:approve'
                    });
                }
                await advanceReviewCard(ctx);
            } else {
                console.error('Approve error:', err.message);
                try {
                    await editWithMarkdown(ctx, '❌ Failed to update task. Please try again.');
                } catch (editErr) {
                    await ctx.reply('❌ Failed to update task. Please try again.');
                }
            }
        } finally {
            releaseReviewClaim(taskId, claimOwner);
        }
    });

    // ─── Skip: move pending → processed, leave TickTick alone ─
    bot.callbackQuery(/^s:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        const taskId = ctx.match[1];
        const claimOwner = `skip:${ctx.callbackQuery?.id || Date.now()}`;

        if (!store.isTaskPending(taskId) || !acquireReviewClaim(taskId, claimOwner)) {
            await safeAnswerCallbackQuery(ctx, { text: 'Already handled.' });
            return;
        }

        try {
            await safeAnswerCallbackQuery(ctx, { text: 'Skipped.' });
            await store.skipTask(taskId);
            const skippedData = store.getProcessedTasks()[taskId];
            const userId = ctx.from?.id;
            if (userId && skippedData) {
                await store.setRecentTaskContext(userId, {
                    taskId,
                    title: skippedData.originalTitle,
                    content: skippedData.originalContent || undefined,
                    projectId: skippedData.projectId || skippedData.originalProjectId,
                    source: 'review:skip'
                });
            }
            await advanceReviewCard(ctx);
        } catch (err) {
            releaseReviewClaim(taskId, claimOwner);
            throw err;
        } finally {
            releaseReviewClaim(taskId, claimOwner);
        }
    });

    // ─── Drop: move pending → processed, flag for removal ─────
    // RETAINED BOUNDARY: inline drop callbacks intentionally perform the final
    // delete through the adapter after human confirmation. This is kept as an
    // operational moderation surface, not a freeform task-writing path.
    bot.callbackQuery(/^d:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        const taskId = ctx.match[1];
        const data = store.getPendingTasks()[taskId] || {};
        const claimOwner = `drop:${ctx.callbackQuery?.id || Date.now()}`;

        if (!store.isTaskPending(taskId) || !acquireReviewClaim(taskId, claimOwner)) {
            await safeAnswerCallbackQuery(ctx, { text: 'Already handled.' });
            return;
        }

        try {
            await safeAnswerCallbackQuery(ctx, { text: 'Checking preview…' });
            const revalidation = await revalidatePendingReview(adapter, taskId, data);
            if (revalidation.stale) {
                await parkStalePending(taskId, data, revalidation.reason);
                await editWithMarkdown(ctx, '⚠️ **Stale review preview.** Re-scan and review again.');
                return;
            }
            const projectId = data.projectId || data.originalProjectId || null;
            await adapter.deleteTask(taskId, projectId);
            await store.dropTask(taskId);
            await safeAnswerCallbackQuery(ctx, { text: 'Dropped.' });
            await advanceReviewCard(ctx);
        } catch (err) {
            const message = err.message?.toLowerCase() || '';
            const isNotFound =
                message.includes('not found') ||
                message.includes('404') ||
                message.includes('already deleted') ||
                message.includes('missing') ||
                message.includes('completed');
            if (isNotFound) {
                await store.dropTask(taskId);
                await advanceReviewCard(ctx);
            } else {
                console.error('Drop error:', err.message);
                try {
                    await editWithMarkdown(ctx, '❌ Delete failed. Please retry — task still pending review.');
                } catch (editErr) {
                    await ctx.reply('❌ Delete failed. Please retry — task still pending review.');
                }
            }
        } finally {
            releaseReviewClaim(taskId, claimOwner);
        }
    });

    // ─── Stop Reviewing ────────────────────────────────────────
    bot.callbackQuery('review:stop', async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        await safeAnswerCallbackQuery(ctx, { text: 'Review stopped.' });
        const chatId = ctx.chat?.id;
        if (chatId) await store.clearCurrentReviewSession(chatId);
        try {
            await editWithMarkdown(ctx, '⏹ **Review stopped.**');
        } catch (err) {
            const msg = String(err?.message || '').toLowerCase();
            if (
                msg.includes('message is not modified') ||
                msg.includes('message to edit not found') ||
                msg.includes('message_id_invalid') ||
                msg.includes('too old')
            ) {
                await ctx.reply('⏹ **Review stopped.**');
            } else {
                throw err;
            }
        }
    });

    // ─── Mutation Candidate Selection ────────────────────────
    // Handles user picking a task from the clarification keyboard.
    // Resumes through the pipeline (intent extraction -> normalizer -> adapter), not direct adapter writes.
    bot.callbackQuery(/^mut:pick:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        await safeAnswerCallbackQuery(ctx, { text: 'Processing...' });
        const selectedTaskId = ctx.match[1];
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;

        const pending = store.getPendingMutationClarification();

        // Fail-closed: no pending state
        if (!pending) {
            await editWithMarkdown(ctx, '⚠️ **No pending clarification.** Rephrase your request.');
            return;
        }

        // Cross-chat/user rejection
        if (pending.chatId && chatId && pending.chatId !== chatId) {
            await editWithMarkdown(ctx, '⚠️ Wrong chat.');
            return;
        }
        if (pending.userId && userId && pending.userId !== userId) {
            await editWithMarkdown(ctx, '⚠️ Wrong user.');
            return;
        }

        // Expired state check
        const createdAt = pending.createdAt ? new Date(pending.createdAt).getTime() : 0;
        if (createdAt && Date.now() - createdAt > MUTATION_CLARIFICATION_TTL_MS) {
            await store.clearPendingMutationClarification();
            await editWithMarkdown(ctx, '⏰ **Clarification expired.** Rephrase your request.');
            return;
        }

        // Validate candidate exists in stored list
        const candidate = pending.candidates.find((c) => c.id === selectedTaskId);
        if (!candidate) {
            await editWithMarkdown(ctx, '⚠️ Candidate not found.');
            return;
        }

        // Duplicate tap guard: mark as consumed immediately to prevent replay
        await store.clearPendingMutationClarification();

        // Resume through the pipeline with resolved task context.
        // Reconstruct the original message and inject the resolved task.
        try {
            const allTasks = await adapter.listActiveTasks();
            const availableProjects = await adapter.listProjects();

            // Find the full task object from TickTick cache
            const resolvedTask = allTasks.find((t) => t.id === selectedTaskId);
            if (!resolvedTask) {
                await editWithMarkdown(ctx, `⚠️ **"${candidate.title}"** not found in TickTick. Try again.`);
                return;
            }

            // Re-enter the pipeline with the original message + resolved task context.
            // This ensures the same intent extraction -> normalizer -> adapter safety path.
            const result = await processPipelineMessage(pending.originalMessage, {
                existingTask: resolvedTask,
                entryPoint: pending.entryPoint || 'telegram:clarification-resume',
                mode: pending.mode || 'interactive',
                availableProjects,
                skipClarification: true // Don't re-ask for the same ambiguity
            });

            if (result.type === 'task') {
                const { text: receipt, replyExtra } = await buildFreeformPipelineResultReceipt({
                    result,
                    store: storeApi,
                    userId,
                    projects: availableProjects
                });
                await editWithMarkdown(ctx, truncateMessage(receipt, 4000), replyExtra);
                const recentUserId = ctx.from?.id;
                if (recentUserId && resolvedTask) {
                    await store.setRecentTaskContext(recentUserId, {
                        taskId: resolvedTask.id,
                        title: resolvedTask.title,
                        content: resolvedTask.content || undefined,
                        projectId: resolvedTask.projectId,
                        source: 'mutation:pick'
                    });
                }
            } else if (result.type === 'error') {
                const diag =
                    result.isDevMode === true && result.diagnostics?.length > 0
                        ? `\n\n${result.diagnostics.slice(0, 3).join('\n')}`
                        : '';
                await editWithMarkdown(ctx, `❌ ${result.confirmationText}${diag}`);
            } else {
                await editWithMarkdown(
                    ctx,
                    `**"${candidate.title}"** selected. ${result.confirmationText || 'Proceeding.'}`
                );
            }
        } catch (err) {
            console.error('Mutation clarification resume error:', err.message);
            await editWithMarkdown(ctx, '❌ Failed to process the selection. Please try again.');
        }
    });

    // ─── Mutation Confirmation Confirm ──────────────────────
    // Handles user confirming a non-exact/destructive mutation.
    // Resumes through the pipeline with skipMutationConfirmation to avoid loops.
    bot.callbackQuery(/^mut:confirm$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        await safeAnswerCallbackQuery(ctx, { text: 'Confirming...' });
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;

        const pending = store.getPendingMutationConfirmation();

        // Fail-closed: no pending state
        if (!pending) {
            await editWithMarkdown(
                ctx,
                '⚠️ **Nothing to confirm.** The request may have expired or was already handled.'
            );
            return;
        }

        // Cross-chat/user rejection
        if (pending.chatId && chatId && pending.chatId !== chatId) {
            await editWithMarkdown(ctx, '⚠️ Wrong chat.');
            return;
        }
        if (pending.userId && userId && pending.userId !== userId) {
            await editWithMarkdown(ctx, '⚠️ Wrong user.');
            return;
        }

        // TTL check already done by getPendingMutationConfirmation, but double-check
        const createdAt = pending.createdAt ? new Date(pending.createdAt).getTime() : 0;
        if (createdAt && Date.now() - createdAt > store.MUTATION_CONFIRMATION_TTL_MS) {
            await store.clearPendingMutationConfirmation();
            await editWithMarkdown(ctx, '⏰ **Confirmation expired.** Please rephrase your request.');
            return;
        }

        // Validate we have enough state to proceed
        if (!pending.matchedTask || !pending.matchedTask.taskId) {
            await store.clearPendingMutationConfirmation();
            await editWithMarkdown(ctx, '⚠️ **Task information missing.** Please rephrase your request.');
            return;
        }

        // Duplicate-tap guard: clear pending before execution
        await store.clearPendingMutationConfirmation();

        // Resume through the pipeline with confirmed task context.
        // Use skipMutationConfirmation to prevent re-prompting for the same mutation.
        try {
            const allTasks = await adapter.listActiveTasks();
            const availableProjects = await adapter.listProjects();

            // Find the full task object from TickTick cache
            const resolvedTask = allTasks.find((t) => t.id === pending.matchedTask.taskId);
            if (!resolvedTask) {
                await editWithMarkdown(ctx, `⚠️ **"${pending.matchedTask.title}"** not found in TickTick. Try again.`);
                return;
            }

            const result = await processPipelineMessage(pending.originalMessage, {
                existingTask: resolvedTask,
                entryPoint: pending.entryPoint || 'telegram:confirmation-resume',
                mode: pending.mode || 'interactive',
                workStyleMode: pending.workStyleMode || null,
                availableProjects,
                skipClarification: true,
                skipMutationConfirmation: true
            });

            if (result.type === 'task') {
                const { text: receipt, replyExtra } = await buildFreeformPipelineResultReceipt({
                    result,
                    store: storeApi,
                    userId,
                    projects: availableProjects
                });
                await editWithMarkdown(ctx, truncateMessage(receipt, 4000), replyExtra);
                const recentUserId = ctx.from?.id;
                if (recentUserId && resolvedTask) {
                    await store.setRecentTaskContext(recentUserId, {
                        taskId: resolvedTask.id,
                        title: resolvedTask.title,
                        content: resolvedTask.content || undefined,
                        projectId: resolvedTask.projectId,
                        source: 'mutation:confirm'
                    });
                }
            } else if (result.type === 'error') {
                const diag =
                    result.isDevMode === true && result.diagnostics?.length > 0
                        ? `\n\n${result.diagnostics.slice(0, 3).join('\n')}`
                        : '';
                await editWithMarkdown(ctx, `❌ ${result.confirmationText}${diag}`);
            } else {
                await editWithMarkdown(
                    ctx,
                    `**"${pending.matchedTask.title}"** confirmed. ${result.confirmationText || 'Done.'}`
                );
            }
        } catch (err) {
            console.error('Mutation confirmation resume error:', err.message);
            await editWithMarkdown(ctx, '❌ Failed to process the confirmed action. Please try again.');
        }
    });

    // ─── Mutation Confirmation Cancel ────────────────────────
    bot.callbackQuery(/^mut:confirm:cancel$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        await safeAnswerCallbackQuery(ctx);
        const pending = store.getPendingMutationConfirmation();

        // Missing/expired state: no pending confirmation to cancel
        if (!pending) {
            await editWithMarkdown(
                ctx,
                '⚠️ **Nothing to cancel.** The confirmation request has expired or was already handled.'
            );
            return;
        }

        // Cross-chat/user rejection for cancel too
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;
        if (pending.chatId && chatId && pending.chatId !== chatId) {
            await editWithMarkdown(ctx, '⚠️ Wrong chat.');
            return;
        }
        if (pending.userId && userId && pending.userId !== userId) {
            await editWithMarkdown(ctx, '⚠️ Wrong user.');
            return;
        }

        await store.clearPendingMutationConfirmation();
        await editWithMarkdown(ctx, '❌ **Cancelled.** Task was not modified.');
    });

    // ─── Mutation Clarification Cancel ───────────────────────
    bot.callbackQuery(/^mut:cancel$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        await safeAnswerCallbackQuery(ctx);
        const pending = store.getPendingMutationClarification();

        // Cross-chat/user rejection for cancel too
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;
        if (pending) {
            if (pending.chatId && chatId && pending.chatId !== chatId) {
                await editWithMarkdown(ctx, '⚠️ Wrong chat.');
                return;
            }
            if (pending.userId && userId && pending.userId !== userId) {
                await editWithMarkdown(ctx, '⚠️ Wrong user.');
                return;
            }
        }

        await store.clearPendingMutationClarification();
        await editWithMarkdown(ctx, '❌ **Clarification canceled.** Rephrase or try again.');
    });

    // ─── Checklist Clarification: shared handler ─────────────
    async function _handleChecklistClarification(ctx, { preference, skipChecklist, successPrefix }) {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }
        const pending = store.getPendingChecklistClarification();
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;

        if (!pending) {
            await safeAnswerCallbackQuery(ctx, { text: '⚠️ No pending clarification found.' });
            await editWithMarkdown(ctx, '⚠️ **No pending clarification.** Rephrase your request.');
            return;
        }
        if (pending.chatId && chatId && pending.chatId !== chatId) {
            await safeAnswerCallbackQuery(ctx, { text: '⚠️ Wrong chat.' });
            return;
        }
        if (pending.userId && userId && pending.userId !== userId) {
            await safeAnswerCallbackQuery(ctx, { text: '⚠️ Wrong user.' });
            return;
        }

        await store.clearPendingChecklistClarification();

        const pipelineOptions = {
            entryPoint: 'telegram:checklist-clarification-button',
            mode: 'interactive',
            availableProjects: await adapter.listProjects()
        };

        if (skipChecklist) {
            pipelineOptions.skipChecklist = true;
        } else {
            pipelineOptions.checklistPreference = preference;
        }

        try {
            const result = await processPipelineMessage(pending.originalMessage, pipelineOptions);

            if (result.type === 'task') {
                const { text, replyExtra } = await buildFreeformPipelineResultReceipt({
                    result,
                    store: storeApi,
                    userId: ctx.from?.id,
                    projects: pipelineOptions.availableProjects
                });
                await editWithMarkdown(ctx, truncateMessage(text, 4000), replyExtra);
                const checklistUserId = ctx.from?.id;
                const action = result.actions?.[0];
                if (checklistUserId && action) {
                    const taskId =
                        action.type === 'create'
                            ? result.results?.[0]?.result?.id || 'unknown'
                            : action.taskId || 'unknown';
                    await store.setRecentTaskContext(checklistUserId, {
                        taskId,
                        title: action.title || 'Task',
                        content: action.content || undefined,
                        projectId: action.projectId,
                        source: 'checklist:create'
                    });
                }
            } else if (result.type === 'error') {
                const diag =
                    result.isDevMode === true && result.diagnostics?.length > 0
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
        await safeAnswerCallbackQuery(ctx, { text: '📋 Checklist mode' });
        console.log('[ChecklistClarification] Button: checklist selected');
        await _handleChecklistClarification(ctx, {
            preference: 'checklist',
            successPrefix: 'Checklist mode.'
        });
    });

    bot.callbackQuery(/^cl:separate$/, async (ctx) => {
        await safeAnswerCallbackQuery(ctx, { text: '📝 Separate tasks' });
        console.log('[ChecklistClarification] Button: separate selected');
        await _handleChecklistClarification(ctx, {
            preference: 'separate',
            successPrefix: 'Separate tasks.'
        });
    });

    bot.callbackQuery(/^cl:skip$/, async (ctx) => {
        await safeAnswerCallbackQuery(ctx, { text: '⏭ Skipped' });
        console.log('[ChecklistClarification] Button: skip selected');
        await _handleChecklistClarification(ctx, {
            skipChecklist: true,
            successPrefix: 'Single task.'
        });
    });

    // ─── Undo Inline Button ──────────────────────────────────
    // Handles the ↩️ Undo button on freeform receipts.
    // Reuses executeUndoBatch for consistent undo logic with /undo command.
    bot.callbackQuery(/^undo:last$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }

        const last = store.getLastUndoEntry();

        if (!last) {
            await safeAnswerCallbackQuery(ctx, { text: 'Nothing to undo.' });
            try {
                await editWithMarkdown(ctx, '↩️ Nothing to undo.', { reply_markup: new InlineKeyboard() });
            } catch {
                /* best-effort edit; fall back to alert only */
            }
            return;
        }

        await safeAnswerCallbackQuery(ctx, { text: '↩️ Undoing...' });

        try {
            // Determine entries to revert: batch or single
            let entries = [last];

            if (last.batchId) {
                const batch = store.getUndoBatch(last.batchId);
                if (batch.length > 1) entries = batch;
            }

            const { reverted, successful } = await executeUndoBatch(entries, adapter);

            if (successful.length > 0) {
                await store.removeUndoEntries(successful);
            }

            const msg =
                reverted.length > 0
                    ? `↩️ **Reverted ${reverted.length} change(s):**\n${reverted.map((t) => `• "${t}"`).join('\n')}`
                    : '↩️ **Nothing was reverted.**';

            // Edit the original receipt message, removing the inline keyboard.
            // Fallback to reply if the message is too old to edit.
            try {
                await editWithMarkdown(ctx, msg, { reply_markup: new InlineKeyboard() });
            } catch (err) {
                const errMsg = String(err?.message || '').toLowerCase();
                if (
                    errMsg.includes('message is not modified') ||
                    errMsg.includes('message to edit not found') ||
                    errMsg.includes('message_id_invalid') ||
                    errMsg.includes('too old')
                ) {
                    await replyWithMarkdown(ctx, msg);
                } else {
                    throw err;
                }
            }
        } catch (err) {
            console.error('[UNDO:last] Error:', err.message);
            const safeMessage = 'Undo failed. The task may have changed in TickTick. Try /status.';
            try {
                await editWithMarkdown(ctx, safeMessage, { reply_markup: new InlineKeyboard() });
            } catch {
                await ctx.reply(safeMessage);
            }
        }
    });

    // ─── Granular Auto-Apply Field Undo ────────────────────────
    // Handles per-field revert/keep buttons on auto-apply notifications.
    // Callback format: autoapply:revert:{batchId}:{taskId}:{field}
    // Keep format: autoapply:keep:{batchId}:{taskId}:{field}
    bot.callbackQuery(/^autoapply:(revert|keep):([^:]+):([^:]+):([^:]+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await safeAnswerCallbackQuery(ctx, { text: '🔒 Unauthorized' });
            return;
        }

        const [, action, batchId, taskId, field] = ctx.match;

        // Map display field names to TickTick field names for snapshot lookup
        const fieldMapping = {
            title: 'title',
            project: 'projectId',
            priority: 'priority',
            due: 'dueDate',
            content: 'content',
            repeat: 'repeatFlag'
        };
        const tickTickField = fieldMapping[field] || field;

        if (action === 'keep') {
            await safeAnswerCallbackQuery(ctx, { text: '✅ Kept as applied' });
            // Remove the field snapshot so it won't appear again
            const snapshot = store.getAutoApplyFieldSnapshot(batchId, taskId);
            if (snapshot?.[tickTickField]) {
                await store.revertAutoApplyField(batchId, taskId, tickTickField);
            }
            try {
                await editWithMarkdown(ctx, `✅ **Kept** "${field}" change for this task.`, {
                    reply_markup: new InlineKeyboard()
                });
            } catch {
                /* best-effort */
            }
            return;
        }

        if (action === 'revert') {
            await safeAnswerCallbackQuery(ctx, { text: '↩️ Reverting...' });
            const snapshot = store.getAutoApplyFieldSnapshot(batchId, taskId);
            if (!snapshot?.[tickTickField]) {
                await safeAnswerCallbackQuery(ctx, { text: '⚠️ Field already reverted' });
                try {
                    await editWithMarkdown(ctx, `⚠️ "${field}" was already reverted.`, {
                        reply_markup: new InlineKeyboard()
                    });
                } catch {
                    /* best-effort */
                }
                return;
            }

            try {
                // Revert the field: restore the original value
                const reverted = await store.revertAutoApplyField(batchId, taskId, tickTickField);
                if (!reverted) {
                    throw new Error('No snapshot data for field');
                }

                // Build and execute the revert update
                const updatePayload = { id: taskId };
                if (reverted.from !== undefined) {
                    updatePayload[tickTickField] = reverted.from;
                }

                // Update the task in TickTick via adapter
                const taskEntry = store.getUndoBatch(batchId).find((e) => e.appliedTaskId === taskId);
                const projectId = taskEntry?.source?.projectId || null;
                await adapter.updateTask(taskId, { ...updatePayload, originalProjectId: projectId });

                await safeAnswerCallbackQuery(ctx, { text: `↩️ ${field} reverted` });
                try {
                    await editWithMarkdown(ctx, `↩️ **Reverted** "${field}" to original value.`, {
                        reply_markup: new InlineKeyboard()
                    });
                } catch {
                    /* best-effort */
                }
            } catch (err) {
                console.error('[AutoApply:Revert] Error:', err.message);
                try {
                    await editWithMarkdown(ctx, `⚠️ Failed to revert "${field}". Task may have changed in TickTick.`, {
                        reply_markup: new InlineKeyboard()
                    });
                } catch {
                    /* best-effort */
                }
            }
            return;
        }
    });
}
