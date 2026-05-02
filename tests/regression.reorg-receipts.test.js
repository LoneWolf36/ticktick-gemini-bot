import test from 'node:test';
import assert from 'node:assert/strict';

import { executeActions } from '../bot/commands.js';

test('reorg apply maps all TickTick-changing successes to applied receipt', async () => {
  const adapter = {
    createTask: async () => ({ id: 'new-task-1' }),
    updateTask: async () => ({ id: 'task-1' }),
    completeTask: async () => ({ id: 'task-2' }),
  };

  const fakeStore = { addUndoEntry: async () => {}, markTaskProcessed: async () => {} };
  const { operationReceipt, executionSummary } = await executeActions(
    [
      { type: 'create', changes: { title: 'Alpha', priority: 3 } },
      { type: 'update', taskId: 'task-1', changes: { priority: 5 } },
    ],
    adapter,
    [{ id: 'task-1', title: 'Bravo', projectId: 'p-1', priority: 3 }],
    { projects: [{ id: 'p-1', name: 'Work' }], store: fakeStore },
  );

  assert.deepEqual(executionSummary, {
    attempted: 2,
    succeeded: 2,
    failed: 0,
    ticktickChanged: 2,
    localOnly: 0,
    undoable: true,
  });
  assert.equal(operationReceipt.status, 'applied');
  assert.equal(operationReceipt.applied, true);
  assert.equal(operationReceipt.changed, true);
  assert.match(operationReceipt.message, /2\/2/);
});

test('reorg apply maps partial execution to failed receipt without raw titles', async () => {
  const adapter = {
    updateTask: async () => ({ id: 'task-1' }),
  };

  const fakeStore = { addUndoEntry: async () => {}, markTaskProcessed: async () => {} };
  const { operationReceipt, executionSummary } = await executeActions(
    [
      { type: 'update', taskId: 'task-1', changes: { priority: 5 } },
      { type: 'create', changes: { priority: 3 } },
    ],
    adapter,
    [{ id: 'task-1', title: 'Secret Task', projectId: 'p-1', priority: 3 }],
    { projects: [{ id: 'p-1', name: 'Work' }], store: fakeStore },
  );

  assert.equal(executionSummary.attempted, 2);
  assert.equal(executionSummary.succeeded, 1);
  assert.equal(executionSummary.failed, 1);
  assert.equal(operationReceipt.status, 'failed');
  assert.equal(operationReceipt.applied, false);
  assert.equal(operationReceipt.changed, true);
  assert.ok(!JSON.stringify(operationReceipt).includes('Secret Task'));
  assert.match(operationReceipt.message, /1\/2/);
});

test('reorg apply maps all local-only work to blocked receipt without applied claim', async () => {
  const adapter = {
    updateTask: async () => ({ id: 'task-1' }),
  };

  const fakeStore = { addUndoEntry: async () => {}, markTaskProcessed: async () => {} };
  const { operationReceipt, executionSummary } = await executeActions(
    [
      { type: 'drop', taskId: 'task-1', changes: {} },
    ],
    adapter,
    [{ id: 'task-1', title: 'Local Only', projectId: 'p-1', priority: 3 }],
    { projects: [{ id: 'p-1', name: 'Work' }], store: fakeStore },
  );

  assert.equal(executionSummary.attempted, 1);
  assert.equal(executionSummary.succeeded, 1);
  assert.equal(executionSummary.ticktickChanged, 0);
  assert.equal(executionSummary.localOnly, 1);
  assert.equal(operationReceipt.status, 'blocked');
  assert.equal(operationReceipt.applied, false);
  assert.equal(operationReceipt.changed, false);
});
