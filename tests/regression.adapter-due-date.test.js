import test from 'node:test';
import assert from 'node:assert/strict';

import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';

test('TickTickAdapter _verifyUpdate treats date-only dueDate as equivalent to same-day datetime', async () => {
    const client = Object.create(TickTickClient.prototype);
    client.getTask = async () => ({
        id: 'task-due-date-verify',
        projectId: 'project-due-date',
        dueDate: '2026-05-05T23:00:00.000+0000'
    });

    const adapter = new TickTickAdapter(client);
    const result = await adapter._verifyUpdate('task-due-date-verify', 'project-due-date', {
        dueDate: '2026-05-05'
    });

    assert.equal(result.verified, true);
});

test('TickTickAdapter _verifyUpdate still rejects date-only dueDate on different day', async () => {
    const client = Object.create(TickTickClient.prototype);
    client.getTask = async () => ({
        id: 'task-due-date-mismatch',
        projectId: 'project-due-date',
        dueDate: '2026-05-06T00:00:00.000+0000'
    });

    const adapter = new TickTickAdapter(client);
    const result = await adapter._verifyUpdate('task-due-date-mismatch', 'project-due-date', {
        dueDate: '2026-05-05'
    });

    assert.equal(result.verified, false);
    assert.match(result.verificationNote, /dueDate:/);
});

test('TickTickAdapter _verifyUpdate treats date-only startDate as equivalent to same-day datetime', async () => {
    const client = Object.create(TickTickClient.prototype);
    client.getTask = async () => ({
        id: 'task-start-date-verify',
        projectId: 'project-start-date',
        startDate: '2026-05-05T23:00:00.000+0000'
    });

    const adapter = new TickTickAdapter(client);
    const result = await adapter._verifyUpdate('task-start-date-verify', 'project-start-date', {
        startDate: '2026-05-05'
    });

    assert.equal(result.verified, true);
});

test('TickTickAdapter _verifyUpdate keeps exact datetime comparison when both sides are datetime', async () => {
    const client = Object.create(TickTickClient.prototype);
    client.getTask = async () => ({
        id: 'task-datetime-verify',
        projectId: 'project-datetime',
        dueDate: '2026-05-05T12:00:00.000+0000'
    });

    const adapter = new TickTickAdapter(client);
    const result = await adapter._verifyUpdate('task-datetime-verify', 'project-datetime', {
        dueDate: '2026-05-05T12:00:00.000+0000'
    });

    assert.equal(result.verified, true);
});

test('TickTickAdapter _verifyUpdate rejects mismatched datetimes', async () => {
    const client = Object.create(TickTickClient.prototype);
    client.getTask = async () => ({
        id: 'task-datetime-mismatch',
        projectId: 'project-datetime',
        dueDate: '2026-05-05T12:00:00.000+0000'
    });

    const adapter = new TickTickAdapter(client);
    const result = await adapter._verifyUpdate('task-datetime-mismatch', 'project-datetime', {
        dueDate: '2026-05-05T13:00:00.000+0000'
    });

    assert.equal(result.verified, false);
    assert.match(result.verificationNote, /dueDate:/);
});
