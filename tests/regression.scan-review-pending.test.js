import test from 'node:test';
import assert from 'node:assert/strict';

import { createPipelineHarness } from './pipeline-harness.js';
import {
    buildAutoApplyNotification,
    buildFieldDiff,
    buildUndoEntryFromRollbackStep,
    buildPendingDataFromAction,
    buildTaskCard,
    buildTaskCardFromAction,
    buildTickTickUpdate,
    formatFieldDiff,
    retryWithBackoff,
} from '../services/shared-utils.js';
import { executeUndoBatch } from '../services/undo-executor.js';

import * as store from '../services/store.js';
import { registerCallbacks, taskReviewKeyboard } from '../bot/callbacks.js';

// ─── buildTaskCard — Review/Pending Flow ─────────────────────

test('buildTaskCard update shows Was / Will be and Changes for title, priority, project, due', () => {
    const task = {
        title: 'gym',
        projectName: 'Inbox',
        priority: 1,
        content: '',
        dueDate: null,
    };
    const analysis = {
        improved_title: 'Do gym workout',
        priority: 'core_goal',
        priority_emoji: '🔴',
        suggested_project: 'Health',
        suggested_schedule: 'today',
        analysis: 'This is a core goal that moves the needle.',
        description: 'Break into 3 sub-tasks and schedule first one.',
        sub_steps: ['Outline Q2 scope', 'Draft timeline', 'Review with team'],
        success_criteria: 'Draft submitted',
        callout: 'Stop planning, start moving.',
    };

    const card = buildTaskCard(task, analysis);

    assert.ok(card.includes('Was: "gym"'), 'should show original title');
    assert.ok(card.includes('Will be: "Do gym workout"'), 'should show improved title');
    assert.ok(card.includes('Priority'), 'should show priority change');
    assert.ok(card.includes('Life Admin → Core Goal'), 'should show priority diff');
    assert.ok(card.includes('Project'), 'should show project change');
    assert.ok(card.includes('Inbox → Health'), 'should show project diff');
    assert.ok(card.includes('Due'), 'should show due change');
    assert.ok(card.includes('None → Today'), 'should show due diff');
    assert.ok(card.includes('Why:'), 'should show rationale');
    assert.ok(card.includes('This is a core goal'), 'should show why text');
    assert.ok(card.includes('Break into 3 sub-tasks'), 'should show description');
    assert.ok(card.includes('Outline Q2 scope'), 'should show sub-steps');
    assert.ok(card.includes('Draft submitted'), 'should show success criteria');
    assert.ok(card.includes('Stop planning'), 'should show callout');
});

test('buildTaskCard update omits unchanged fields from Changes', () => {
    const task = {
        title: 'Quarterly Report',
        projectName: 'Inbox',
        priority: 3,
        content: '',
        dueDate: null,
    };
    const analysis = {
        improved_title: null,
        priority: 'important',
        priority_emoji: '🟡',
        suggested_project: null,
        suggested_schedule: null,
        analysis: 'Keep momentum on this.',
        description: null,
        sub_steps: [],
        success_criteria: null,
        callout: null,
    };

    const card = buildTaskCard(task, analysis);

    assert.ok(!card.includes('Was:'), 'should not show Was when title unchanged');
    assert.ok(!card.includes('Will be:'), 'should not show Will be when title unchanged');
    assert.ok(!card.includes('Project'), 'should omit unchanged project');
    assert.ok(!card.includes('Due'), 'should omit unchanged due');
    assert.ok(!card.includes('Priority'), 'should omit unchanged priority');
    assert.ok(!card.includes('undefined'), 'should not leak undefined');
});

test('buildTaskCard delete warning is present', () => {
    const task = {
        title: 'Old recurring reminder',
        projectName: 'Inbox',
        priority: 0,
        content: '',
        dueDate: null,
    };
    const analysis = {
        improved_title: null,
        priority: 'optional',
        priority_emoji: '⚪',
        suggested_project: null,
        suggested_schedule: null,
        analysis: 'This task is no longer relevant.',
        description: null,
        sub_steps: [],
        success_criteria: null,
        callout: null,
    };

    const card = buildTaskCard(task, analysis);

    assert.ok(!card.includes('Suggested deletion'), 'buildTaskCard is not for delete actions');
});

// ─── buildTaskCardFromAction — Scan/Review Flow ──────────────

test('buildTaskCardFromAction update shows Was / Will be and field diffs', () => {
    const task = {
        title: 'gym',
        projectName: 'Inbox',
        projectId: 'inbox',
        priority: 1,
        content: '',
        dueDate: null,
    };
    const action = {
        type: 'update',
        title: 'Do gym workout',
        priority: 5,
        projectId: 'health',
        dueDate: '2026-05-05T23:59:00.000+0100',
        content: 'Break into sub-tasks.',
    };
    const projects = [
        { id: 'inbox', name: 'Inbox' },
        { id: 'health', name: 'Health' },
    ];

    const card = buildTaskCardFromAction(task, action, projects);

    assert.ok(card.includes('Was: "gym"'), 'should show original title');
    assert.ok(card.includes('Will be: "Do gym workout"'), 'should show improved title');
    assert.ok(card.includes('Inbox → Health'), 'should show project diff');
    assert.ok(card.includes('Life Admin → Core Goal'), 'should show priority diff');
    assert.ok(card.includes('Content'), 'should show content change');
});

test('buildTaskCardFromAction labels Inbox project IDs as Inbox', () => {
    const task = {
        title: 'Claim welcome bonus MyProtein',
        projectName: null,
        projectId: 'inbox118958109',
        priority: 1,
        content: '',
        dueDate: null,
    };
    const action = {
        type: 'update',
        projectId: 'health',
    };
    const projects = [{ id: 'health', name: '💪Health & Life' }];

    const card = buildTaskCardFromAction(task, action, projects);

    assert.ok(card.includes('Inbox → 💪Health & Life'), 'should render Inbox name instead of raw inbox project ID');
    assert.ok(!card.includes('inbox118958109'), 'should not leak raw Inbox project ID');
});

test('buildTaskCardFromAction complete shows context', () => {
    const task = {
        title: 'Book flight',
        projectName: 'Travel',
        projectId: 'travel',
        priority: 3,
        content: '',
        dueDate: '2026-05-05T23:59:00.000+0100',
    };
    const action = {
        type: 'complete',
    };

    const card = buildTaskCardFromAction(task, action);

    assert.ok(card.includes('Mark as done: "Book flight"'), 'should show complete header');
    assert.ok(card.includes('Travel'), 'should show project context');
    assert.ok(card.includes('Important'), 'should show priority context');
    assert.ok(card.includes('May'), 'should show due context');
});

test('buildTaskCardFromAction delete shows warning and context', () => {
    const task = {
        title: 'Old recurring reminder',
        projectName: 'Inbox',
        projectId: 'inbox',
        priority: 0,
        content: 'Some old content',
        dueDate: null,
    };
    const action = {
        type: 'delete',
    };

    const card = buildTaskCardFromAction(task, action);

    assert.ok(card.includes('Suggested deletion: "Old recurring reminder"'), 'should show delete header');
    assert.ok(card.includes('permanently remove'), 'should show warning text');
    assert.ok(card.includes('Inbox'), 'should show project context');
    assert.ok(card.includes('Optional'), 'should show priority context');
});

test('buildTaskCardFromAction update omits unchanged fields', () => {
    const task = {
        title: 'Quarterly Report',
        projectName: 'Inbox',
        projectId: 'inbox',
        priority: 3,
        content: 'Existing content',
        dueDate: '2026-05-05T23:59:00.000+0100',
    };
    const action = {
        type: 'update',
        title: 'Quarterly Report',
        priority: 3,
        projectId: 'inbox',
        dueDate: '2026-05-05T23:59:00.000+0100',
        content: 'Existing content',
    };

    const card = buildTaskCardFromAction(task, action);

    assert.ok(!card.includes('Was:'), 'should not show Was when title unchanged');
    assert.ok(!card.includes('Project'), 'should omit unchanged project');
    assert.ok(!card.includes('Priority'), 'should omit unchanged priority');
    assert.ok(!card.includes('Due'), 'should omit unchanged due');
    assert.ok(!card.includes('Content'), 'should omit unchanged content');
    assert.ok(!card.includes('undefined'), 'should not leak undefined');
});

// ─── taskReviewKeyboard — Button Labels ──────────────────────

test('taskReviewKeyboard update has Apply, Edit, Skip, Delete, Stop', () => {
    const keyboard = taskReviewKeyboard('task-123', 'update');
    const buttons = keyboard.inline_keyboard.flat();
    const texts = buttons.map(b => b.text);

    assert.ok(texts.includes('Apply'), 'should have Apply button');
    assert.ok(texts.includes('Edit'), 'should have Edit button');
    assert.ok(texts.includes('Skip'), 'should have Skip button');
    assert.ok(texts.includes('Delete'), 'should have Delete button');
    assert.ok(texts.includes('Stop'), 'should have Stop button');
    assert.ok(!texts.includes('Keep original'), 'should not have old long label');
    assert.ok(!texts.includes('Delete task'), 'should not have old long label');
    assert.ok(!texts.includes('Stop reviewing'), 'should not have old long label');
});

test('taskReviewKeyboard complete has Complete, Skip, Delete, Stop', () => {
    const keyboard = taskReviewKeyboard('task-123', 'complete');
    const buttons = keyboard.inline_keyboard.flat();
    const texts = buttons.map(b => b.text);

    assert.ok(texts.includes('Complete'), 'should have Complete button');
    assert.ok(texts.includes('Skip'), 'should have Skip button');
    assert.ok(texts.includes('Delete'), 'should have Delete button');
    assert.ok(texts.includes('Stop'), 'should have Stop button');
    assert.ok(!texts.includes('Confirm complete'), 'should not have old long label');
    assert.ok(!texts.includes('Keep active'), 'should not have old long label');
});

test('taskReviewKeyboard delete has Delete, Skip, Stop', () => {
    const keyboard = taskReviewKeyboard('task-123', 'delete');
    const buttons = keyboard.inline_keyboard.flat();
    const texts = buttons.map(b => b.text);

    assert.ok(texts.includes('Delete'), 'should have Delete button');
    assert.ok(texts.includes('Skip'), 'should have Skip button');
    assert.ok(texts.includes('Stop'), 'should have Stop button');
    assert.ok(!texts.includes('Confirm delete'), 'should not have old long label');
    assert.ok(!texts.includes('Keep task'), 'should not have old long label');
});

// ─── Review Queue Resilience ─────────────────────────────────

function makeCallbackBot() {
    const handlers = { callbacks: [], middleware: [] };
    const bot = {
        callbackQuery(pattern, handler) {
            handlers.callbacks.push({ pattern, handler });
            return bot;
        },
        on(eventName, handler) {
            handlers.middleware.push({ eventName, handler });
            return bot;
        },
    };
    return { bot, handlers };
}

function findCallbackHandler(handlers, patternText) {
    return handlers.callbacks.find((entry) => entry.pattern.toString().includes(patternText))?.handler;
}

test('review apply continues when Telegram callback query is expired', async () => {
    await store.resetAll();
    const taskId = 'expired-ack-task';
    await store.markTaskPending(taskId, {
        originalTitle: 'Expired callback task',
        originalContent: '',
        originalPriority: 1,
        originalProjectId: 'inbox',
        projectId: 'inbox',
        projectName: 'Inbox',
        improvedContent: 'Make this clearer.',
        actionType: 'update',
    });

    const { bot, handlers } = makeCallbackBot();
    const updates = [];
    const edits = [];
    registerCallbacks(bot, {
        updateTask: async (id, update) => {
            updates.push({ id, update });
            return { id };
        },
    }, {});

    const applyHandler = findCallbackHandler(handlers, '^a:');
    assert.equal(typeof applyHandler, 'function');

    await applyHandler({
        match: [`a:${taskId}`, taskId],
        chat: { id: 999 },
        from: { id: 123 },
        callbackQuery: { id: 'old-callback', message: { message_id: 10 } },
        telegram: {
            answerCallbackQuery: async () => {
                throw new Error("Call to 'answerCallbackQuery' failed! (400: Bad Request: query is too old and response timeout expired or query ID is invalid)");
            },
        },
        editMessageText: async (text, opts) => { edits.push({ text, opts }); return {}; },
        reply: async (text, opts) => { edits.push({ text, opts, reply: true }); return {}; },
    });

    assert.equal(updates.length, 1);
    assert.equal(store.isTaskProcessed(taskId), true);
    assert.equal(store.isTaskPending(taskId), false);
    assert.ok(edits.length > 0, 'should still advance or summarize review card');
    await store.resetAll();
});

test('review apply does not mutate when pending record was already resolved elsewhere', async () => {
    await store.resetAll();
    const taskId = 'stale-preview-task';
    await store.markTaskPending(taskId, {
        originalTitle: 'Stale preview task',
        originalContent: '',
        originalPriority: 1,
        originalProjectId: 'inbox',
        projectId: 'inbox',
        projectName: 'Inbox',
        improvedTitle: 'Fresh title',
        actionType: 'update',
    });
    await store.approveTask(taskId);

    const { bot, handlers } = makeCallbackBot();
    const updates = [];
    registerCallbacks(bot, {
        updateTask: async (id, update) => {
            updates.push({ id, update });
            return { id };
        },
    }, {});

    const applyHandler = findCallbackHandler(handlers, '^a:');
    assert.equal(typeof applyHandler, 'function');

    await applyHandler({
        match: [`a:${taskId}`, taskId],
        chat: { id: 999 },
        from: { id: 123 },
        callbackQuery: { id: 'stale-callback', message: { message_id: 10 } },
        answerCallbackQuery: async () => {},
        editMessageText: async () => ({}),
        reply: async () => ({}),
    });

    assert.equal(updates.length, 0, 'stale preview apply should not mutate');
    await store.resetAll();
});

test('review apply double tap mutates once and second tap is already handled', async () => {
    await store.resetAll();
    const taskId = 'double-tap-task';
    await store.markTaskPending(taskId, {
        originalTitle: 'Double tap task',
        originalContent: '',
        originalPriority: 1,
        originalProjectId: 'inbox',
        projectId: 'inbox',
        projectName: 'Inbox',
        improvedTitle: 'Double tap task updated',
        actionType: 'update',
    });

    const { bot, handlers } = makeCallbackBot();
    const answers = [];
    const edits = [];
    let releaseUpdate;
    const updateGate = new Promise((resolve) => {
        releaseUpdate = resolve;
    });
    registerCallbacks(bot, {
        updateTask: async (id, update) => {
            answers.push(`update:${id}`);
            await updateGate;
            return { id, update };
        },
    }, {});

    const applyHandler = findCallbackHandler(handlers, '^a:');
    assert.equal(typeof applyHandler, 'function');

    const ctx1 = {
        match: [`a:${taskId}`, taskId],
        chat: { id: 999 },
        from: { id: 123 },
        callbackQuery: { id: 'cb-1', message: { message_id: 10 } },
        answerCallbackQuery: async ({ text }) => { answers.push(text); },
        editMessageText: async (text, opts) => { edits.push({ text, opts }); return {}; },
        reply: async (text, opts) => { edits.push({ text, opts, reply: true }); return {}; },
    };
    const ctx2 = {
        match: [`a:${taskId}`, taskId],
        chat: { id: 999 },
        from: { id: 123 },
        callbackQuery: { id: 'cb-2', message: { message_id: 10 } },
        answerCallbackQuery: async ({ text }) => { answers.push(text); },
        editMessageText: async (text, opts) => { edits.push({ text, opts }); return {}; },
        reply: async (text, opts) => { edits.push({ text, opts, reply: true }); return {}; },
    };

    const first = applyHandler(ctx1);
    await Promise.resolve();
    const second = applyHandler(ctx2);

    releaseUpdate?.();
    await Promise.all([first, second]);

    assert.equal(edits.filter((entry) => String(entry.text || '').includes('Updated')).length, 1);
    assert.equal(answers.filter((text) => text === 'Applied.').length, 1);
    assert.ok(answers.includes('Already handled.'), 'second tap should be already handled');
    await store.resetAll();
});

test('review apply and skip/drop race resolves once and blocks the other callback', async () => {
    await store.resetAll();
    const scenarios = [
        { name: 'apply+drop', secondPattern: '^d:', secondAnswer: 'Dropped.', secondMutateKey: 'deleteTask' },
        { name: 'apply+skip', secondPattern: '^s:', secondAnswer: 'Skipped.', secondMutateKey: 'skipTask' },
    ];

    for (const scenario of scenarios) {
        const taskId = `${scenario.name}-task`;
        await store.markTaskPending(taskId, {
            originalTitle: `${scenario.name} task`,
            originalContent: '',
            originalPriority: 1,
            originalProjectId: 'inbox',
            projectId: 'inbox',
            projectName: 'Inbox',
            improvedTitle: `${scenario.name} task updated`,
            actionType: 'update',
        });

        const { bot, handlers } = makeCallbackBot();
        const answers = [];
        const mutations = [];
        let releaseApply;
        const applyGate = new Promise((resolve) => { releaseApply = resolve; });
        registerCallbacks(bot, {
            updateTask: async (id, update) => {
                mutations.push(`update:${id}`);
                await applyGate;
                return { id, update };
            },
            deleteTask: async (id) => {
                mutations.push(`delete:${id}`);
                return { id };
            },
        }, {});

        const applyHandler = findCallbackHandler(handlers, '^a:');
        const secondHandler = findCallbackHandler(handlers, scenario.secondPattern);
        assert.equal(typeof applyHandler, 'function');
        assert.equal(typeof secondHandler, 'function');

        const makeCtx = (callbackId) => ({
            match: [`a:${taskId}`, taskId],
            chat: { id: 999 },
            from: { id: 123 },
            callbackQuery: { id: callbackId, message: { message_id: 10 } },
            answerCallbackQuery: async ({ text }) => { answers.push(text); },
            editMessageText: async (text, opts) => { answers.push(text); return { text, opts }; },
            reply: async (text, opts) => { answers.push(text); return { text, opts }; },
        });

        const first = applyHandler(makeCtx(`${scenario.name}-apply`));
        await Promise.resolve();
        const second = secondHandler({
            ...makeCtx(`${scenario.name}-second`),
            match: [`${scenario.secondPattern.slice(1)}${taskId}`, taskId],
        });

        releaseApply?.();
        await Promise.all([first, second]);

        assert.equal(mutations.filter((entry) => entry.startsWith('update:')).length, 1, `${scenario.name} should update once`);
        assert.equal(mutations.filter((entry) => entry.startsWith('delete:')).length, scenario.secondMutateKey === 'deleteTask' ? 0 : 0);
        assert.ok(answers.includes('Already handled.'), `${scenario.name} should reject second callback`);
        assert.ok(!answers.includes('Deleted.') && !answers.includes('Skipped.'), `${scenario.name} second callback should not proceed`);
        await store.resetAll();
    }
});

test('review progress never uses global processed count as session progress', async () => {
    await store.resetAll();
    for (let i = 0; i < 10; i++) {
        await store.markTaskProcessed(`old-${i}`, { originalTitle: `Old ${i}` });
    }
    for (const taskId of ['current-1', 'current-2', 'current-3']) {
        await store.markTaskPending(taskId, {
            originalTitle: taskId,
            originalContent: '',
            originalPriority: 1,
            originalProjectId: 'inbox',
            projectId: 'inbox',
            projectName: 'Inbox',
            actionType: 'update',
        });
    }
    await store.setCurrentReviewSession(999, {
        chatId: 999,
        totalTasks: 3,
    });

    const { bot, handlers } = makeCallbackBot();
    const edits = [];
    registerCallbacks(bot, {}, {});
    const skipHandler = findCallbackHandler(handlers, '^s:');
    assert.equal(typeof skipHandler, 'function');

    await skipHandler({
        match: ['s:current-1', 'current-1'],
        chat: { id: 999 },
        from: { id: 123 },
        callbackQuery: { id: 'skip-callback', message: { message_id: 10 } },
        answerCallbackQuery: async () => {},
        editMessageText: async (text, opts) => { edits.push({ text, opts }); return {}; },
        reply: async (text, opts) => { edits.push({ text, opts, reply: true }); return {}; },
    });

    const latestText = edits.at(-1)?.text || '';
    assert.ok(!latestText.includes('Task 11 of 3'), 'should not display impossible progress from global processed count');
    assert.match(latestText, /Task [12] of 3/);
    await store.resetAll();
});

test('markTaskPending is idempotent and markTaskProcessed clears pending copy', async () => {
    await store.resetAll();
    await store.markTaskPending('dup-task', { originalTitle: 'First' });
    const firstSentAt = store.getPendingTasks()['dup-task'].sentAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.markTaskPending('dup-task', { originalTitle: 'Second' });

    assert.equal(store.getPendingCount(), 1);
    assert.equal(store.getPendingTasks()['dup-task'].originalTitle, 'First');
    assert.equal(store.getPendingTasks()['dup-task'].sentAt, firstSentAt);

    await store.markTaskProcessed('dup-task', { originalTitle: 'Processed' });

    assert.equal(store.isTaskPending('dup-task'), false);
    assert.equal(store.isTaskProcessed('dup-task'), true);
    assert.equal(store.getPendingCount(), 0);
    await store.resetAll();
});

test('executeUndoBatch returns successful entries only for applied actions', async () => {
    const calls = [];
    const adapter = {
        updateTask: async (taskId) => {
            calls.push(taskId);
            if (taskId === 'fail-me') throw new Error('boom');
            return { id: taskId };
        },
        deleteTask: async () => ({}),
        createTask: async () => ({}),
    };

    const result = await executeUndoBatch([
        { taskId: 'ok-1', originalTitle: 'One', rollbackType: 'restore_updated', snapshot: { title: 'One', projectId: 'inbox' } },
        { taskId: 'fail-me', originalTitle: 'Two', rollbackType: 'restore_updated', snapshot: { title: 'Two', projectId: 'inbox' } },
    ], adapter);

    assert.deepEqual(calls, ['ok-1', 'fail-me']);
    assert.deepEqual(result.successful.map((entry) => entry.taskId), ['ok-1']);
    assert.deepEqual(result.reverted, ['One']);
});

// ─── No Internal Jargon ──────────────────────────────────────

test('buildTaskCardFromAction does not leak internal field names or scores', () => {
    const task = {
        title: 'Test',
        projectName: 'Inbox',
        projectId: 'inbox',
        priority: 3,
        content: '',
        dueDate: null,
    };
    const action = {
        type: 'update',
        title: 'Test updated',
        priority: 5,
    };

    const card = buildTaskCardFromAction(task, action);

    assert.ok(!card.includes('projectId'), 'should not leak projectId');
    assert.ok(!card.includes('priority:'), 'should not leak priority:');
    assert.ok(!card.includes('score'), 'should not leak score');
    assert.ok(!card.includes('undefined'), 'should not leak undefined');
    assert.ok(!card.includes('null'), 'should not leak null');
});

test('buildTaskCard does not leak internal field names or scores', () => {
    const task = {
        title: 'Test',
        projectName: 'Inbox',
        priority: 3,
        content: '',
        dueDate: null,
    };
    const analysis = {
        improved_title: 'Test updated',
        priority: 'core_goal',
        priority_emoji: '🔴',
        suggested_project: null,
        suggested_schedule: null,
        analysis: null,
        description: null,
        sub_steps: [],
        success_criteria: null,
        callout: null,
    };

    const card = buildTaskCard(task, analysis);

    assert.ok(!card.includes('undefined'), 'should not leak undefined');
    assert.ok(!card.includes('null'), 'should not leak null');
});

// ─── buildAutoApplyNotification — Slice D ─────────────────────

test('buildAutoApplyNotification returns null for empty results', () => {
    assert.equal(buildAutoApplyNotification([]), null);
    assert.equal(buildAutoApplyNotification(null), null);
    assert.equal(buildAutoApplyNotification(undefined), null);
});

test('buildAutoApplyNotification shows per-task field diffs when provided', () => {
    const results = [
        {
            title: 'Quarterly report',
            diffs: [
                { field: 'priority', label: 'Priority', oldValue: 'Important', newValue: 'Core Goal', emoji: '🔴' },
                { field: 'project', label: 'Project', oldValue: 'Inbox', newValue: 'Health', emoji: '📁' },
            ],
        },
        {
            title: 'Buy groceries',
            diffs: [
                { field: 'due', label: 'Due', oldValue: 'None', newValue: 'Today', emoji: '📅' },
            ],
        },
    ];

    const text = buildAutoApplyNotification(results);

    assert.match(text, /2 task\(s\) organized/);
    assert.match(text, /Quarterly report/);
    assert.match(text, /🔴 Priority.*Important → Core Goal/);
    assert.match(text, /📁 Project.*Inbox → Health/);
    assert.match(text, /Buy groceries/);
    assert.match(text, /📅 Due.*None → Today/);
    assert.match(text, /Run \/undo/);
});

test('buildAutoApplyNotification limits to 5 tasks with overflow line', () => {
    const results = Array.from({ length: 8 }, (_, i) => ({
        title: `Task ${i + 1}`,
        diffs: [],
    }));

    const text = buildAutoApplyNotification(results);

    assert.match(text, /8 task\(s\) organized/);
    // First 5 should appear
    for (let i = 0; i < 5; i++) {
        assert.match(text, new RegExp(`Task ${i + 1}`));
    }
    // 6th should not
    assert.ok(!text.includes('Task 6'), 'task 6 should not appear');
    assert.match(text, /\.\.\.and 3 more/);
});

test('buildAutoApplyNotification shows skipped actions warning', () => {
    const results = [
        { title: 'Finish report', diffs: [{ field: 'priority', label: 'Priority', oldValue: 'Important', newValue: 'Core Goal', emoji: '🔴' }] },
    ];

    const text = buildAutoApplyNotification(results, { hasSkippedActions: true });

    assert.match(text, /Skipped destructive action/);
    assert.match(text, /Finish report/);
});

test('buildAutoApplyNotification does not contain internal jargon', () => {
    const results = [
        {
            title: 'Test task',
            diffs: [
                { field: 'title', label: 'Title', oldValue: 'Old', newValue: 'New', emoji: '' },
            ],
        },
    ];

    const text = buildAutoApplyNotification(results);

    assert.ok(!text.includes('projectId'), 'no projectId leak');
    assert.ok(!text.includes('field:'), 'no field: leak');
    assert.ok(!text.includes('undefined'), 'no undefined leak');
    assert.ok(!text.includes('null'), 'no null leak');
    assert.ok(!text.includes('JSON'), 'no JSON leak');
});

test('buildAutoApplyNotification preserves legacy schedule/movedTo format when no diffs', () => {
    const results = [
        { title: 'Buy milk', schedule: '2026-04-30', movedTo: null },
        { title: 'Pay bills', schedule: null, movedTo: 'Health' },
        { title: 'Untouched task', schedule: null, movedTo: null },
    ];

    const text = buildAutoApplyNotification(results);

    assert.match(text, /Buy milk.*due (Thu, 30 Apr|2026-04-30)/);
    assert.match(text, /Pay bills.*moved to Health/);
    assert.match(text, /Untouched task/);
    assert.match(text, /Run \/undo/);
});

test('buildUndoEntryFromRollbackStep falls back to task id when title is missing', () => {
    const entry = buildUndoEntryFromRollbackStep({
        type: 'restore_updated',
        targetTaskId: 'task-missing-title',
        targetProjectId: 'inbox',
        payload: { snapshot: { id: 'task-missing-title', title: '', content: '', projectId: 'inbox' } },
    }, { type: 'update', title: '' });

    assert.equal(entry.originalTitle, 'task-missing-title');
});

test('buildAutoApplyNotification keeps undo hint in output', () => {
    const results = [
        { title: 'One task', diffs: [] },
    ];

    const text = buildAutoApplyNotification(results);
    assert.match(text, /Run \/undo/);
});
