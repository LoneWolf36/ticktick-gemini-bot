import test from 'node:test';
import assert from 'node:assert/strict';
import cron from 'node-cron';

import { registerCommands } from '../bot/commands.js';
import * as store from '../services/store.js';
import { startScheduler } from '../services/scheduler.js';

async function runCapturedPoll(callback) {
  await store.resetAll();
  await store.setChatId('scheduler-status-commands');

  const originalSchedule = cron.schedule;
  const scheduled = [];
  let readAttempts = 0;
  cron.schedule = (expression, scheduledCallback) => {
    scheduled.push({ expression, callback: scheduledCallback });
    return { stop: () => {} };
  };

  try {
    await startScheduler(
      { api: { sendMessage: async () => {} } },
      { isAuthenticated: () => true, getAuthUrl: () => 'https://auth.example.test' },
      {
        isQuotaExhausted: () => false,
        quotaResumeTime: () => null,
        generateDailyBriefingSummary: async () => ({ formattedText: 'daily' }),
        generateWeeklyDigestSummary: async () => ({ formattedText: 'weekly' }),
      },
      {
        listActiveTasks: async () => callback.listActiveTasks(),
        listProjects: async () => [],
        reconcileTaskState: async () => callback.reconcileTaskState?.(),
      },
      { processMessageWithContext: async () => ({ type: 'non-task' }) },
      { pollMinutes: 5, autoApplyLifeAdmin: true, graceWindowMinutes: 0 },
    );

    const poll = scheduled.find((item) => item.expression.startsWith('*/'));
    assert.ok(poll, 'poll callback should be scheduled');
    await poll.callback();
  } finally {
    cron.schedule = originalSchedule;
  }
}

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

test('registerCommands /status includes last sync and version after live read', async () => {
  await store.resetAll();
  await store.recordTickTickSync({ source: 'scheduler:poll', activeCount: 4 });
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
    { listActiveTasks: async () => [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }] },
    {},
  );

  const statusHandler = handlers.commands.get('status');
  const replies = [];
  const ctx = { chat: { id: 1 }, from: { id: 1 }, reply: async (msg) => { replies.push(msg); } };

  await statusHandler(ctx);

  const reply = replies.at(-1);
  assert.match(reply, /Last sync:/);
  assert.match(reply, /source: scheduler:poll/);
  assert.match(reply, /version: 1/);
  assert.match(reply, /Active tasks in TickTick: 4/);
});

test('registerCommands /status keeps previous sync visible after live read failure', async () => {
  await store.resetAll();
  await store.recordTickTickSync({ source: 'scheduler:poll', activeCount: 9 });
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
    { listActiveTasks: async () => { throw new Error('boom'); } },
    {},
  );

  const statusHandler = handlers.commands.get('status');
  const replies = [];
  const ctx = { chat: { id: 1 }, from: { id: 1 }, reply: async (msg) => { replies.push(msg); } };

  await statusHandler(ctx);

  const reply = replies.at(-1);
  assert.match(reply, /Active tasks in TickTick: unavailable/);
  assert.match(reply, /Last sync:/);
  assert.match(reply, /active: 9/);
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

test('registerCommands /pending keeps empty local queue scoped when live read fails', async () => {
  await store.resetAll();
  await store.recordTickTickSync({ source: 'scheduler:poll', activeCount: 7 });
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
    { listActiveTasks: async () => { throw new Error('offline'); } },
    {},
  );

  const pendingHandler = handlers.commands.get('pending');
  const replies = [];
  const ctx = { chat: { id: 1 }, from: { id: 1 }, reply: async (msg) => { replies.push(msg); } };

  await pendingHandler(ctx);

  const reply = replies.at(-1);
  assert.match(reply, /Local review queue empty/);
  assert.match(reply, /unavailable right now/);
  assert.match(reply, /Last successful sync: 7 active task\(s\)/);
});

test('registerCommands /pending shows explicit no-sync copy before first successful sync', async () => {
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
    { listActiveTasks: async () => { throw new Error('offline'); } },
    {},
  );

  const pendingHandler = handlers.commands.get('pending');
  const replies = [];
  const ctx = { chat: { id: 1 }, from: { id: 1 }, reply: async (msg) => { replies.push(msg); } };

  await pendingHandler(ctx);

  const reply = replies.at(-1);
  assert.match(reply, /No successful TickTick sync recorded yet/);
});

test('scheduler poll records sync after active-task read succeeds', async () => {
  await store.resetAll();

  const originalSchedule = cron.schedule;
  const scheduled = [];
  cron.schedule = (expression, scheduledCallback) => {
    scheduled.push({ expression, callback: scheduledCallback });
    return { stop: () => {} };
  };

  try {
    await startScheduler(
      { api: { sendMessage: async () => {} } },
      { isAuthenticated: () => true, getAuthUrl: () => 'https://auth.example.test' },
      {
        isQuotaExhausted: () => false,
        quotaResumeTime: () => null,
        generateDailyBriefingSummary: async () => ({ formattedText: 'daily' }),
        generateWeeklyDigestSummary: async () => ({ formattedText: 'weekly' }),
      },
      {
        listActiveTasks: async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        listProjects: async () => [],
        reconcileTaskState: async () => ({ removedPending: 0, removedFailed: 0 }),
      },
      { processMessageWithContext: async () => ({ type: 'non-task' }) },
      { pollMinutes: 5, autoApplyLifeAdmin: true, graceWindowMinutes: 0 },
    );

    const poll = scheduled.find((item) => item.expression.startsWith('*/'));
    assert.ok(poll, 'poll callback should be scheduled');
    await poll.callback();

    const sync = store.getOperationalSnapshot().tickTickSync;
    assert.equal(sync.lastSyncSource, 'scheduler:poll');
    assert.equal(sync.lastTickTickActiveCount, 3);
    assert.equal(sync.stateVersion, 1);
  } finally {
    cron.schedule = originalSchedule;
  }
});

test('scheduler poll records sync on fallback read success', async () => {
  await store.resetAll();

  const originalSchedule = cron.schedule;
  const scheduled = [];
  let readAttempts = 0;
  cron.schedule = (expression, scheduledCallback) => {
    scheduled.push({ expression, callback: scheduledCallback });
    return { stop: () => {} };
  };

  try {
    await startScheduler(
      { api: { sendMessage: async () => {} } },
      { isAuthenticated: () => true, getAuthUrl: () => 'https://auth.example.test' },
      {
        isQuotaExhausted: () => false,
        quotaResumeTime: () => null,
        generateDailyBriefingSummary: async () => ({ formattedText: 'daily' }),
        generateWeeklyDigestSummary: async () => ({ formattedText: 'weekly' }),
      },
      {
        listActiveTasks: async () => {
          readAttempts += 1;
          if (readAttempts === 1) throw new Error('primary failed');
          return [{ id: 'f1' }, { id: 'f2' }];
        },
        listProjects: async () => [],
        reconcileTaskState: async () => { throw new Error('reconcile failed'); },
      },
      { processMessageWithContext: async () => ({ type: 'non-task' }) },
      { pollMinutes: 5, autoApplyLifeAdmin: true, graceWindowMinutes: 0 },
    );

    const poll = scheduled.find((item) => item.expression.startsWith('*/'));
    assert.ok(poll, 'poll callback should be scheduled');
    await poll.callback();

    const sync = store.getOperationalSnapshot().tickTickSync;
    assert.equal(sync.lastSyncSource, 'scheduler:poll');
    assert.equal(sync.lastTickTickActiveCount, 2);
    assert.equal(sync.stateVersion, 1);
  } finally {
    cron.schedule = originalSchedule;
  }
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

test('registerCommands /scan records TickTick sync after live read', async () => {
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
    { listActiveTasks: async () => [], listProjects: async () => [] },
    { processMessage: async () => ({ type: 'preview', actions: [] }) },
  );

  const scanHandler = handlers.commands.get('scan');
  const ctx = { chat: { id: 1 }, from: { id: 1 }, reply: async () => ({ message_id: 1 }) };

  await scanHandler(ctx);

  const sync = store.getOperationalSnapshot().tickTickSync;
  assert.equal(sync.lastSyncSource, 'bot:scan');
  assert.equal(sync.lastTickTickActiveCount, 0);
  assert.equal(sync.stateVersion, 1);
});

test('registerCommands /review records TickTick sync after live read', async () => {
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
    { listActiveTasks: async () => [], listProjects: async () => [] },
    { processMessage: async () => ({ type: 'preview', actions: [] }) },
  );

  const reviewHandler = handlers.commands.get('review');
  const ctx = { chat: { id: 1 }, from: { id: 1 }, reply: async () => ({ message_id: 1 }) };

  await reviewHandler(ctx);

  const sync = store.getOperationalSnapshot().tickTickSync;
  assert.equal(sync.lastSyncSource, 'bot:review');
  assert.equal(sync.lastTickTickActiveCount, 0);
  assert.equal(sync.stateVersion, 1);
});

test('registerCommands /scan empty copy stays scoped and avoids bare review wording', async () => {
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
    { listActiveTasks: async () => [{ id: 'live-1', title: 'Known', status: 0 }], listProjects: async () => [] },
    { processMessage: async () => ({ type: 'preview', actions: [] }) },
  );

  await store.markTaskProcessed('live-1', { originalTitle: 'Known' });

  const scanHandler = handlers.commands.get('scan');
  const replies = [];
  const ctx = { chat: { id: 1 }, from: { id: 1 }, reply: async (msg) => { replies.push(msg); } };

  await scanHandler(ctx);

  const reply = replies.at(-1);
  assert.match(reply, /Scan complete\. No new local review items queued\./);
  assert.doesNotMatch(reply, /No tasks to review\./);
});

test('registerCommands /review empty copy stays scoped and avoids bare review wording', async () => {
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
    { listActiveTasks: async () => [{ id: 'live-1', title: 'Known', status: 0 }], listProjects: async () => [] },
    { processMessage: async () => ({ type: 'preview', actions: [] }) },
  );

  await store.markTaskProcessed('live-1', { originalTitle: 'Known' });

  const reviewHandler = handlers.commands.get('review');
  const replies = [];
  const ctx = { chat: { id: 1 }, from: { id: 1 }, reply: async (msg) => { replies.push(msg); } };

  await reviewHandler(ctx);

  const reply = replies.at(-1);
  assert.match(reply, /Review complete\. No new local review items queued\./);
  assert.doesNotMatch(reply, /No tasks to review\./);
});
