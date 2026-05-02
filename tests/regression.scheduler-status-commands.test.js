import test from 'node:test';
import assert from 'node:assert/strict';

import { registerCommands } from '../bot/commands.js';
import * as store from '../services/store.js';

test('registerCommands /status includes deferred queue counts', async () => {
  await store.resetAll();
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery() { return this; },
    on() { return this; },
  };

  registerCommands(
    bot,
    { isAuthenticated: () => true, getCacheAgeSeconds: () => null },
    { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
    { listActiveTasks: async () => [] },
    {},
  );

  const statusHandler = handlers.commands.get('status');
  const replies = [];
  const ctx = {
    chat: { id: 1 },
    from: { id: 1 },
    reply: async (msg) => { replies.push(msg); },
  };

  await store.appendDeferredPipelineIntent({ userMessage: 'Deferred A', nextAttemptAt: Date.now() + 5 * 60 * 1000 });
  await store.addFailedDeferredIntent({ userMessage: 'Failed B' });

  await statusHandler(ctx);

  const lastReply = replies.at(-1);
  assert.match(lastReply, /Pending retry: 1 items/);
  assert.match(lastReply, /Next retry:/);
  assert.match(lastReply, /Failed permanently: 1 items/);
});

test('registerCommands /status hides debug internals in normal status', async () => {
  await store.resetAll();
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery() { return this; },
    on() { return this; },
  };

  registerCommands(
    bot,
    { isAuthenticated: () => true, getCacheAgeSeconds: () => 42 },
    { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => ({ index: 2, total: 3 }) },
    { listActiveTasks: async () => [] },
    {},
  );

  const statusHandler = handlers.commands.get('status');
  const replies = [];
  const ctx = {
    chat: { id: 1 },
    from: { id: 1 },
    reply: async (msg) => { replies.push(msg); },
  };

  await statusHandler(ctx);

  const reply = replies.at(-1);
  assert.match(reply, /TickTick live state/);
  assert.match(reply, /Local review queue/);
  assert.match(reply, /Deferred queue/);
  assert.match(reply, /Running job/);
  assert.doesNotMatch(reply, /Gemini Key/i);
  assert.doesNotMatch(reply, /Cache:/i);
  assert.doesNotMatch(reply, /Auto-apply mode/i);
  assert.doesNotMatch(reply, /metadata-only|full/);
});

test('registerCommands /pending shows scoped empty local queue message', async () => {
  await store.resetAll();
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery() { return this; },
    on() { return this; },
  };

  registerCommands(
    bot,
    { isAuthenticated: () => true },
    { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
    { listActiveTasks: async () => [] },
    {},
  );

  const pendingHandler = handlers.commands.get('pending');
  const replies = [];
  const ctx = {
    chat: { id: 1 },
    from: { id: 1 },
    reply: async (msg) => { replies.push(msg); },
  };

  await pendingHandler(ctx);
  assert.match(replies.at(-1), /Local review queue empty/);
  assert.match(replies.at(-1), /TickTick still has 0 live task\(s\)/);
});

test('registerCommands /pending shows clear non-empty message', async () => {
  await store.resetAll();
  await store.markTaskPending('task-1', { originalTitle: 'Task One', projectName: 'Inbox', actionType: 'update' });

  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery() { return this; },
    on() { return this; },
  };

  registerCommands(
    bot,
    { isAuthenticated: () => true },
    { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
    { listActiveTasks: async () => [] },
    {},
  );

  const pendingHandler = handlers.commands.get('pending');
  const replies = [];
  const ctx = {
    chat: { id: 1 },
    from: { id: 1 },
    reply: async (msg) => { replies.push(msg); return { message_id: 123 }; },
  };

  await pendingHandler(ctx);
  assert.match(replies[0], /1 tasks awaiting your review\. Approve or skip each one\./);
});

test('registerCommands /pending stays scoped when TickTick still has live tasks', async () => {
  await store.resetAll();
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery() { return this; },
    on() { return this; },
  };

  registerCommands(
    bot,
    { isAuthenticated: () => true },
    { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
    { listActiveTasks: async () => [
      { id: 'live-1', title: 'Live TickTick task' },
      { id: 'live-2', title: 'Second live task' },
    ] },
    {},
  );

  const pendingHandler = handlers.commands.get('pending');
  const replies = [];
  const ctx = {
    chat: { id: 1 },
    from: { id: 1 },
    reply: async (msg) => { replies.push(msg); },
  };

  await pendingHandler(ctx);

  const reply = replies.at(-1);
  assert.match(reply, /local review queue/i, 'should scope pending to local review queue');
  assert.match(reply, /TickTick/i, 'should separately acknowledge live TickTick state');
  assert.doesNotMatch(reply, /No tasks pending review\./i, 'should not flatten live TickTick state into empty local queue copy');
});

test('registerCommands /scan queues preview results for review', async () => {
  await store.resetAll();
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery() { return this; },
    on() { return this; },
  };
  const pipelineCalls = [];

  registerCommands(
    bot,
    { isAuthenticated: () => true },
    { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
    {
      listActiveTasks: async () => [
        { id: 'live-1', title: 'Draft proposal', projectId: 'inbox', projectName: 'Inbox', priority: 1, status: 0 },
      ],
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
    },
    {
      processMessage: async (message, options) => {
        pipelineCalls.push({ message, options });
        return {
          type: 'preview',
          status: 'preview',
          actions: [{ type: 'update', taskId: 'live-1', title: 'Finish draft proposal', projectId: 'inbox' }],
          confirmationText: 'Preview only — nothing changed. 1 action(s) ready for review.',
          dryRun: true,
          changed: false,
          applied: false,
        };
      },
    },
  );

  const scanHandler = handlers.commands.get('scan');
  const replies = [];
  const ctx = {
    chat: { id: 1 },
    from: { id: 1 },
    reply: async (msg) => { replies.push(msg); return { message_id: 123 }; },
  };

  await scanHandler(ctx);

  assert.equal(pipelineCalls.length, 1);
  assert.equal(pipelineCalls[0].options.dryRun, true);
  assert.ok(store.getPendingTasks()['live-1'], 'preview action should be queued locally for review');
  assert.match(replies.at(-1), /Preview — not yet applied/);
  assert.doesNotMatch(replies.join('\n'), /No tasks to review\./);
});
