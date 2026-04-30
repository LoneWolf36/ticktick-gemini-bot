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

test('registerCommands /pending shows clear empty message', async () => {
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
  assert.equal(replies.at(-1), 'No tasks pending review.');
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
