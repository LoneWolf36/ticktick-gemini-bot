import test from 'node:test';
import assert from 'node:assert/strict';

import { createPipelineHarness } from './pipeline-harness.js';
import {
    buildPendingDataFromAction,
    buildTaskCardFromAction,
    buildTickTickUpdate,
    retryWithBackoff,
} from '../services/shared-utils.js';
import { taskReviewKeyboard } from '../bot/callbacks.js';

// ─── 1. Pipeline dryRun mode ─────────────────────────────────

test('pipeline dryRun returns actions without executing them', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        intents: [{ type: 'create', title: 'Buy milk' }],
    });

    const result = await processMessage('Buy milk', { dryRun: true });

    assert.equal(result.type, 'task');
    assert.equal(result.dryRun, true);
    assert.equal(result.actions.length, 1);
    assert.equal(adapterCalls.create.length, 0);
    assert.equal(adapterCalls.update.length, 0);
    assert.equal(adapterCalls.complete.length, 0);
    assert.equal(adapterCalls.delete.length, 0);
    assert.match(result.confirmationText, /ready for review/i);
});

// ─── 2. Pipeline blockedActionTypes ──────────────────────────

test('pipeline blockedActionTypes skips delete and complete before execution', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        intents: [{ type: 'delete', taskId: 'task-1', title: 'Old task' }],
        useRealNormalizer: false,
        normalizedActions: [
            { type: 'delete', taskId: 'task-1', title: 'Old task', originalProjectId: 'proj-a', valid: true, validationErrors: [] },
            { type: 'update', taskId: 'task-2', title: 'Updated task', originalProjectId: 'proj-b', valid: true, validationErrors: [] },
        ],
    });

    const result = await processMessage('delete old task', { blockedActionTypes: ['delete', 'complete'] });

    assert.equal(result.type, 'task');
    assert.equal(adapterCalls.delete.length, 0);
    assert.equal(adapterCalls.update.length, 1);
    assert.ok(result.skippedActions);
    assert.equal(result.skippedActions.length, 1);
    assert.equal(result.skippedActions[0].type, 'delete');
});

// ─── 3. buildPendingDataFromAction ───────────────────────────

test('buildPendingDataFromAction maps update action correctly', () => {
    const task = {
        id: 't1',
        title: 'Old title',
        content: 'Old content',
        priority: 3,
        projectId: 'proj-1',
        projectName: 'Career',
    };
    const action = {
        type: 'update',
        taskId: 't1',
        title: 'New title',
        content: 'New content',
        priority: 5,
        projectId: 'proj-2',
        dueDate: '2026-03-15T10:00:00.000Z',
    };
    const projects = [
        { id: 'proj-1', name: 'Career' },
        { id: 'proj-2', name: 'Personal' },
    ];

    const data = buildPendingDataFromAction(task, action, projects);

    assert.equal(data.actionType, 'update');
    assert.equal(data.improvedTitle, 'New title');
    assert.equal(data.improvedContent, 'New content');
    assert.equal(data.suggestedPriority, 5);
    assert.equal(data.suggestedProjectId, 'proj-2');
    assert.equal(data.suggestedSchedule, '2026-03-15T10:00:00.000Z');
    assert.equal(data.originalTitle, 'Old title');
    assert.equal(data.projectId, 'proj-1');
});

test('buildPendingDataFromAction maps complete action correctly', () => {
    const task = { id: 't1', title: 'Buy milk', priority: 3, projectId: 'proj-1' };
    const action = { type: 'complete', taskId: 't1' };

    const data = buildPendingDataFromAction(task, action);

    assert.equal(data.actionType, 'complete');
    assert.equal(data.originalTitle, 'Buy milk');
});

test('buildPendingDataFromAction maps delete action correctly', () => {
    const task = { id: 't1', title: 'Old task', priority: 3, projectId: 'proj-1' };
    const action = { type: 'delete', taskId: 't1' };

    const data = buildPendingDataFromAction(task, action);

    assert.equal(data.actionType, 'delete');
    assert.equal(data.originalTitle, 'Old task');
});

// ─── 4. buildTaskCardFromAction ──────────────────────────────

test('buildTaskCardFromAction renders update card with changes', () => {
    const task = {
        id: 't1',
        title: 'Old title',
        priority: 3,
        projectId: 'proj-1',
        projectName: 'Career',
    };
    const action = {
        type: 'update',
        title: 'New title',
        priority: 5,
        projectId: 'proj-2',
        dueDate: '2026-03-15T10:00:00.000Z',
    };
    const projects = [
        { id: 'proj-1', name: 'Career' },
        { id: 'proj-2', name: 'Personal' },
    ];

    const card = buildTaskCardFromAction(task, action, projects);

    assert.match(card, /Was: "Old title"/);
    assert.match(card, /New title/);
    assert.match(card, /🔴/);
    assert.match(card, /career-critical/);
    assert.match(card, /📅/);
    assert.match(card, /📁 → Personal/);
});

test('buildTaskCardFromAction renders complete card', () => {
    const task = { id: 't1', title: 'Buy milk' };
    const action = { type: 'complete' };

    const card = buildTaskCardFromAction(task, action);

    assert.match(card, /Mark as done:/);
    assert.match(card, /Buy milk/);
});

test('buildTaskCardFromAction renders delete card', () => {
    const task = { id: 't1', title: 'Old task' };
    const action = { type: 'delete' };

    const card = buildTaskCardFromAction(task, action);

    assert.match(card, /Suggested deletion:/);
    assert.match(card, /Old task/);
});

// ─── 5. buildTickTickUpdate with ISO dates ───────────────────

test('buildTickTickUpdate passes ISO date strings directly', () => {
    const data = { projectId: 'proj-1', suggestedSchedule: '2026-03-15T10:00:00.000Z' };
    const update = buildTickTickUpdate(data);

    assert.equal(update.dueDate, '2026-03-15T10:00:00.000Z');
});

test('buildTickTickUpdate resolves bucket names via scheduleToDateTime', () => {
    const data = { projectId: 'proj-1', suggestedSchedule: 'today' };
    const update = buildTickTickUpdate(data);

    assert.ok(update.dueDate);
    assert.ok(typeof update.dueDate === 'string');
    assert.ok(update.dueDate.includes('T') || update.dueDate.includes('-'));
    assert.notEqual(update.dueDate, 'today');
});

// ─── 6. taskReviewKeyboard ───────────────────────────────────

test('taskReviewKeyboard returns update layout by default', () => {
    const keyboard = taskReviewKeyboard('task-123');
    const flat = keyboard.inline_keyboard.flat();

    assert.equal(flat.length, 4);
    assert.match(flat[0].callback_data, /^a:task-123$/);
    assert.match(flat[1].callback_data, /^r:task-123$/);
    assert.match(flat[2].callback_data, /^s:task-123$/);
    assert.match(flat[3].callback_data, /^d:task-123$/);
});

test('taskReviewKeyboard returns complete layout', () => {
    const keyboard = taskReviewKeyboard('task-123', 'complete');
    const flat = keyboard.inline_keyboard.flat();

    assert.equal(flat.length, 3);
    assert.match(flat[0].text, /Confirm complete/);
    assert.match(flat[1].text, /Keep active/);
    assert.match(flat[2].text, /Delete instead/);
});

test('taskReviewKeyboard returns delete layout', () => {
    const keyboard = taskReviewKeyboard('task-123', 'delete');
    const flat = keyboard.inline_keyboard.flat();

    assert.equal(flat.length, 2);
    assert.match(flat[0].text, /Confirm delete/);
    assert.match(flat[1].text, /Keep task/);
});

test('taskReviewKeyboard truncates long task IDs', () => {
    const longId = 'a'.repeat(100);
    const keyboard = taskReviewKeyboard(longId, 'update');
    const flat = keyboard.inline_keyboard.flat();

    for (const button of flat) {
        assert.ok(button.callback_data.length <= 64, `callback_data length ${button.callback_data.length} exceeds 64`);
    }
});

// ─── 7. retryWithBackoff ─────────────────────────────────────

test('retryWithBackoff succeeds on first attempt', async () => {
    const result = await retryWithBackoff(async () => 42);
    assert.equal(result, 42);
});

test('retryWithBackoff retries on transient errors', async () => {
    let callCount = 0;
    const result = await retryWithBackoff(async () => {
        callCount += 1;
        if (callCount === 1) {
            const err = new Error('ETIMEDOUT');
            throw err;
        }
        return 'success';
    }, { baseDelayMs: 1 });

    assert.equal(result, 'success');
    assert.equal(callCount, 2);
});

test('retryWithBackoff does not retry on quota errors', async () => {
    await assert.rejects(
        async () => retryWithBackoff(async () => {
            const err = new Error('All API keys exhausted');
            throw err;
        }, { baseDelayMs: 1 }),
        /All API keys exhausted/,
    );
});

test('retryWithBackoff exhausts max retries', async () => {
    let callCount = 0;
    await assert.rejects(
        async () => retryWithBackoff(async () => {
            callCount += 1;
            const err = new Error('ECONNRESET');
            throw err;
        }, { maxRetries: 2, baseDelayMs: 1 }),
        /ECONNRESET/,
    );
    assert.equal(callCount, 3);
});
