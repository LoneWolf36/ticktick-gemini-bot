import test from 'node:test';
import assert from 'node:assert/strict';

import { executeActions } from '../bot/commands.js';
import { executeReorgAction } from '../services/reorg-executor.js';

test('reorg apply maps all TickTick-changing successes to applied receipt', async () => {
  const adapter = {
    createTask: async (payload) => ({ id: 'new-task-1', projectId: payload.projectId }),
    updateTask: async () => ({ id: 'task-1' }),
    completeTask: async () => ({ id: 'task-2' }),
  };

  const fakeStore = { addUndoEntry: async () => {}, markTaskProcessed: async () => {} };
  const { operationReceipt, executionSummary } = await executeActions(
    [
      { type: 'create', changes: { title: 'Alpha', priority: 3, projectId: 'p-1' } },
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

test('reorg create blocks without destination and skips adapter call', async () => {
  let createCalls = 0;
  const adapter = {
    createTask: async () => {
      createCalls++;
      return { id: 'new-task-1' };
    },
  };

  const result = await executeReorgAction(
    { type: 'create', changes: { title: 'Alpha', priority: 3 } },
    null,
    adapter,
    { projects: [{ id: 'p-1', name: 'Work' }] },
  );

  assert.equal(createCalls, 0);
  assert.equal(result.error, '⚠️ Skipped create action: missing or unknown exact/configured project destination.');
  assert.equal(result.executionSummary.failed, 1);
  assert.equal(result.executionSummary.localOnly, 1);
  assert.deepEqual(result.outcomes, []);
});

test('reorg create succeeds with explicit destination', async () => {
  let createPayload = null;
  const adapter = {
    createTask: async (payload) => {
      createPayload = payload;
      return { id: 'new-task-1' };
    },
  };

  const result = await executeReorgAction(
    { type: 'create', changes: { title: 'Alpha', priority: 3, projectId: 'p-1' } },
    null,
    adapter,
    { projects: [{ id: 'p-1', name: 'Work' }] },
  );

  assert.equal(createPayload.projectId, 'p-1');
  assert.equal(result.error, null);
  assert.equal(result.executionSummary.ticktickChanged, 1);
  assert.match(result.outcomes[0], /Created: "Alpha"/);
});

test('reorg create blocks unknown destination project id and skips adapter call', async () => {
  let createCalls = 0;
  const adapter = {
    createTask: async () => {
      createCalls++;
      return { id: 'new-task-1' };
    },
  };

  const result = await executeReorgAction(
    { type: 'create', changes: { title: 'Alpha', priority: 3, projectId: 'unknown-project' } },
    null,
    adapter,
    { projects: [{ id: 'p-1', name: 'Work' }] },
  );

  assert.equal(createCalls, 0);
  assert.equal(result.error, '⚠️ Skipped create action: missing or unknown exact/configured project destination.');
  assert.equal(result.executionSummary.failed, 1);
  assert.equal(result.executionSummary.localOnly, 1);
});

test('reorg update blocks unknown destination project id and skips adapter call', async () => {
  let updateCalls = 0;
  const adapter = {
    updateTask: async () => {
      updateCalls++;
      return { id: 'task-1' };
    },
  };

  const result = await executeReorgAction(
    { type: 'update', taskId: 'task-1', changes: { projectId: 'unknown-project', priority: 5 } },
    { id: 'task-1', title: 'Bravo', projectId: 'p-1', priority: 3 },
    adapter,
    { projects: [{ id: 'p-1', name: 'Work' }] },
  );

  assert.equal(updateCalls, 0);
  assert.equal(result.error, '⚠️ Skipped update action: missing or unknown exact/configured project destination.');
  assert.equal(result.executionSummary.failed, 1);
  assert.equal(result.executionSummary.localOnly, 1);
});

test('reorg drop blocks unknown destination project id and skips adapter call', async () => {
  let updateCalls = 0;
  const adapter = {
    updateTask: async () => {
      updateCalls++;
      return { id: 'task-1' };
    },
  };

  const result = await executeReorgAction(
    { type: 'drop', taskId: 'task-1', changes: { projectId: 'unknown-project', priority: 0 } },
    { id: 'task-1', title: 'Bravo', projectId: 'p-1', priority: 3 },
    adapter,
    { projects: [{ id: 'p-1', name: 'Work' }] },
  );

  assert.equal(updateCalls, 0);
  assert.equal(result.error, '⚠️ Skipped drop action: missing or unknown exact/configured project destination.');
  assert.equal(result.executionSummary.failed, 1);
  assert.equal(result.executionSummary.localOnly, 1);
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
