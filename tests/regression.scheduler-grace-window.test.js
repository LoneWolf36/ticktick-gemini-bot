import test from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../services/store.js';
import {
  buildSchedulingMetadata,
  retryDeferredIntents,
  runDailyBriefingJob,
  runStartupCatchupJobs,
  runWeeklyDigestJob,
  shouldSendMissedDelivery,
} from '../services/scheduler.js';
import { buildSummaryActiveTasksFixture } from './helpers/regression-fixtures.js';

test('shouldSendMissedDelivery returns true when never sent before', () => {
  const scheduledTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  assert.equal(shouldSendMissedDelivery(null, scheduledTime, { graceWindowMinutes: 15 }), true);
});

test('shouldSendMissedDelivery returns false when delivery already happened after schedule', () => {
  const lastSent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const scheduledTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  assert.equal(shouldSendMissedDelivery(lastSent, scheduledTime, { graceWindowMinutes: 15 }), false);
});

test('shouldSendMissedDelivery returns false when outside grace window', () => {
  const scheduledTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  assert.equal(shouldSendMissedDelivery(null, scheduledTime, { graceWindowMinutes: 15 }), false);
});

test('buildSchedulingMetadata creates correct metadata structure', () => {
  const scheduledForIso = new Date().toISOString();
  const metadata = buildSchedulingMetadata('daily-briefing', scheduledForIso, 15);

  assert.ok(metadata.schedulingMetadata);
  assert.equal(metadata.schedulingMetadata.triggerKind, 'scheduled');
  assert.equal(metadata.schedulingMetadata.scheduleKey, 'daily-briefing');
  assert.equal(metadata.schedulingMetadata.scheduledForIso, scheduledForIso);
  assert.equal(metadata.schedulingMetadata.graceWindowMinutes, 15);
});

test('runDailyBriefingJob includes scheduling metadata in context', async () => {
  await store.resetAll();
  const userId = `scheduler-metadata-daily-${Date.now()}`;
  await store.setChatId(userId);

  let receivedContext = null;
  const ran = await runDailyBriefingJob({
    bot: { api: { sendMessage: async () => {} } },
    ticktick: { isAuthenticated: () => true },
    adapter: { listActiveTasks: async () => [] },
    gemini: {
      isQuotaExhausted: () => false,
      generateDailyBriefingSummary: async (_tasks, context) => {
        receivedContext = context;
        return { formattedText: '**MORNING BRIEFING**' };
      },
    },
    config: { graceWindowMinutes: 20, scheduledForIso: '2026-03-12T08:00:00.000Z' },
  });

  assert.equal(ran, true);
  assert.ok(receivedContext);
  assert.ok(receivedContext.schedulingMetadata);
  assert.equal(receivedContext.schedulingMetadata.triggerKind, 'scheduled');
  assert.equal(receivedContext.schedulingMetadata.scheduleKey, 'daily-briefing');
  assert.equal(receivedContext.schedulingMetadata.scheduledForIso, '2026-03-12T08:00:00.000Z');
  assert.equal(receivedContext.schedulingMetadata.graceWindowMinutes, 20);
});

test('runWeeklyDigestJob includes scheduling metadata in context', async () => {
  await store.resetAll();
  const userId = `scheduler-metadata-weekly-${Date.now()}`;
  await store.setChatId(userId);

  let receivedContext = null;
  const ran = await runWeeklyDigestJob({
    bot: { api: { sendMessage: async () => {} } },
    ticktick: { isAuthenticated: () => true },
    adapter: { listActiveTasks: async () => [] },
    gemini: {
      isQuotaExhausted: () => false,
      generateWeeklyDigestSummary: async (_tasks, _processed, context) => {
        receivedContext = context;
        return { formattedText: '**WEEKLY DIGEST**' };
      },
    },
    config: { graceWindowMinutes: 25, scheduledForIso: '2026-03-16T20:00:00.000Z' },
  });

  assert.equal(ran, true);
  assert.ok(receivedContext);
  assert.ok(receivedContext.schedulingMetadata);
  assert.equal(receivedContext.schedulingMetadata.triggerKind, 'scheduled');
  assert.equal(receivedContext.schedulingMetadata.scheduleKey, 'weekly-digest');
  assert.equal(receivedContext.schedulingMetadata.scheduledForIso, '2026-03-16T20:00:00.000Z');
  assert.equal(receivedContext.schedulingMetadata.graceWindowMinutes, 25);
});

test('runStartupCatchupJobs sends missed daily briefing once when startup is inside grace window', async () => {
  await store.resetAll();
  const userId = `scheduler-startup-daily-${Date.now()}`;
  await store.setChatId(userId);
  await store.setWorkStyleMode(userId, store.MODE_STANDARD);

  let dailyCalls = 0;
  const result = await runStartupCatchupJobs({
    bot: { api: { sendMessage: async () => {} } },
    ticktick: { isAuthenticated: () => true },
    adapter: { listActiveTasks: async () => buildSummaryActiveTasksFixture() },
    gemini: {
      isQuotaExhausted: () => false,
      generateDailyBriefingSummary: async () => {
        dailyCalls += 1;
        return { formattedText: '**🌅 MORNING BRIEFING**' };
      },
      generateWeeklyDigestSummary: async () => {
        throw new Error('weekly should not run in daily catch-up test');
      },
    },
  }, {
    dailyHour: 8,
    weeklyDay: 0,
    timezone: 'UTC',
    graceWindowMinutes: 15,
  }, {
    now: new Date('2026-03-12T08:10:00.000Z'),
  });

  assert.equal(result.daily, true);
  assert.equal(result.weekly, false);
  assert.equal(dailyCalls, 1);
});

test('runStartupCatchupJobs skips duplicate or late daily briefing catch-up', async () => {
  await store.resetAll();
  const userId = `scheduler-startup-skip-${Date.now()}`;
  await store.setChatId(userId);
  await store.setWorkStyleMode(userId, store.MODE_STANDARD);
  await store.updateStats({ lastDailyBriefing: '2026-03-12T08:05:00.000Z' });

  let dailyCalls = 0;
  const result = await runStartupCatchupJobs({
    bot: { api: { sendMessage: async () => {} } },
    ticktick: { isAuthenticated: () => true },
    adapter: { listActiveTasks: async () => buildSummaryActiveTasksFixture() },
    gemini: {
      isQuotaExhausted: () => false,
      generateDailyBriefingSummary: async () => {
        dailyCalls += 1;
        return { formattedText: '**🌅 MORNING BRIEFING**' };
      },
      generateWeeklyDigestSummary: async () => ({ formattedText: '**📊 WEEKLY ACCOUNTABILITY REVIEW**' }),
    },
  }, {
    dailyHour: 8,
    weeklyDay: 0,
    timezone: 'UTC',
    graceWindowMinutes: 15,
  }, {
    now: new Date('2026-03-12T08:20:00.000Z'),
  });

  assert.equal(result.daily, false);
  assert.equal(dailyCalls, 0);
});

test('runStartupCatchupJobs sends missed weekly digest once when startup is inside grace window', async () => {
  await store.resetAll();
  const userId = `scheduler-startup-weekly-${Date.now()}`;
  await store.setChatId(userId);
  await store.setWorkStyleMode(userId, store.MODE_STANDARD);

  let weeklyCalls = 0;
  const result = await runStartupCatchupJobs({
    bot: { api: { sendMessage: async () => {} } },
    ticktick: { isAuthenticated: () => true },
    adapter: { listActiveTasks: async () => buildSummaryActiveTasksFixture() },
    gemini: {
      isQuotaExhausted: () => false,
      generateDailyBriefingSummary: async () => ({ formattedText: '**🌅 MORNING BRIEFING**' }),
      generateWeeklyDigestSummary: async () => {
        weeklyCalls += 1;
        return { formattedText: '**📊 WEEKLY ACCOUNTABILITY REVIEW**' };
      },
    },
  }, {
    dailyHour: 8,
    weeklyDay: 0,
    timezone: 'UTC',
    graceWindowMinutes: 15,
  }, {
    now: new Date('2026-03-15T20:10:00.000Z'),
  });

  assert.equal(result.weekly, true);
  assert.equal(weeklyCalls, 1);
});

test('startup catch-up delivers daily and weekly as separate messages with non-duplicated focus list', async () => {
  await store.resetAll();
  const userId = `scheduler-startup-both-${Date.now()}`;
  await store.setChatId(userId);
  await store.setWorkStyleMode(userId, store.MODE_STANDARD);

  const sent = [];
  let weeklyContext = null;

  const result = await runStartupCatchupJobs({
    bot: {
      api: {
        sendMessage: async (_chatId, message) => {
          sent.push(message);
        },
      },
    },
    ticktick: { isAuthenticated: () => true },
    adapter: { listActiveTasks: async () => buildSummaryActiveTasksFixture() },
    gemini: {
      isQuotaExhausted: () => false,
      generateDailyBriefingSummary: async () => ({
        summary: {
          priorities: [
            { task_id: 'task-focus' },
            { task_id: 'task-support' },
          ],
        },
        formattedText: '**🌅 MORNING BRIEFING**\n\n**Focus**: Daily focus',
      }),
      generateWeeklyDigestSummary: async (_tasks, _processed, context) => {
        weeklyContext = context;
        return {
          formattedText: '**📊 WEEKLY ACCOUNTABILITY REVIEW**\n\n**Next focus**:\n1. Weekly focus task',
        };
      },
    },
  }, {
    dailyHour: 20,
    weeklyDay: 0,
    timezone: 'UTC',
    graceWindowMinutes: 15,
  }, {
    now: new Date('2026-03-15T20:10:00.000Z'),
  });

  assert.equal(result.daily, true);
  assert.equal(result.weekly, true);
  assert.equal(sent.length, 2);
  assert.match(sent[0], /MORNING BRIEFING/);
  assert.match(sent[1], /WEEKLY ACCOUNTABILITY REVIEW/);
  assert.notEqual(sent[0], sent[1]);
  assert.deepEqual(weeklyContext.excludedTaskIds, ['task-focus', 'task-support']);
});

// ─── Deferred Pipeline Intents — Store CRUD (R12) ────────────

test('store: appendDeferredPipelineIntent persists and returns entry with generated id', async () => {
    await store.resetAll();
    const entry = await store.appendDeferredPipelineIntent({
        userMessage: 'Buy milk',
        entryPoint: 'free-form',
    });
    assert.ok(entry.id.startsWith('dpi_'));
    assert.equal(entry.userMessage, 'Buy milk');
    assert.equal(entry.entryPoint, 'free-form');
    assert.ok(entry.createdAt);

    const all = store.getDeferredPipelineIntents();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, entry.id);
});

test('store: appendDeferredPipelineIntent preserves explicit id', async () => {
    await store.resetAll();
    const entry = await store.appendDeferredPipelineIntent({
        id: 'custom-id-1',
        userMessage: 'Do laundry',
    });
    assert.equal(entry.id, 'custom-id-1');
});

test('store: removeDeferredPipelineIntent removes by id and returns removed entry', async () => {
    await store.resetAll();
    const e1 = await store.appendDeferredPipelineIntent({ userMessage: 'Task A' });
    const e2 = await store.appendDeferredPipelineIntent({ userMessage: 'Task B' });

    const removed = await store.removeDeferredPipelineIntent(e1.id);
    assert.equal(removed.id, e1.id);
    assert.equal(removed.userMessage, 'Task A');

    const remaining = store.getDeferredPipelineIntents();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, e2.id);
});

test('store: removeDeferredPipelineIntent returns null for unknown id', async () => {
    await store.resetAll();
    const result = await store.removeDeferredPipelineIntent('nonexistent');
    assert.equal(result, null);
});

test('store: getDeferredPipelineIntents returns deep clone', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({ userMessage: 'Cloneable' });
    const a = store.getDeferredPipelineIntents();
    const b = store.getDeferredPipelineIntents();
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
    a[0].userMessage = 'mutated';
    assert.notEqual(store.getDeferredPipelineIntents()[0].userMessage, 'mutated');
});

// ─── retryDeferredIntents (R12) ──────────────────────────────

test('retryDeferredIntents returns zeros when no deferred intents exist', async () => {
    await store.resetAll();
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: { processMessage: async () => ({ type: 'task' }) },
    });
    assert.deepEqual(result, { retried: 0, failed: 0, givenUp: 0, remaining: 0 });
});

test('retryDeferredIntents skips retry when API health check fails', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({ userMessage: 'Deferred task' });

    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => { throw new Error('API down'); } },
        pipeline: { processMessage: async () => ({ type: 'task' }) },
    });
    assert.equal(result.retried, 0);
    assert.equal(result.remaining, 1);
});

test('retryDeferredIntents retries and removes successful intent', async () => {
    await store.resetAll();
    await store.setChatId('retry-test-user');
    const entry = await store.appendDeferredPipelineIntent({
        userMessage: 'Buy groceries',
        entryPoint: 'free-form',
        nextAttemptAt: Date.now() - 1000,
    });

    const processCalls = [];
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessageWithContext: async (msg, opts) => {
                processCalls.push({ msg, opts });
                return { type: 'task', actions: [{ title: 'Buy groceries' }], operationReceipt: { status: 'applied', scope: 'ticktick_live', command: 'scheduler', operationType: 'create', nextAction: 'none', changed: true, dryRun: false, applied: true, fallbackUsed: false, message: 'Applied', traceId: 'trace-1', results: [{ status: 'succeeded' }] } };
            },
        },
        bot: { api: { sendMessage: async () => {} } },
    });

    assert.equal(result.retried, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.remaining, 0);
    assert.equal(processCalls.length, 1);
    assert.equal(processCalls[0].msg, 'Buy groceries');
    assert.equal(store.getDeferredPipelineIntents().length, 0);
});

// Uses failureCategory (not category) to match real pipeline output shape
test('retryDeferredIntents leaves transient failures in queue', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({ userMessage: 'Transient task', nextAttemptAt: Date.now() - 1000 });

    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => ({
                type: 'error',
                failure: { failureCategory: 'transient' },
            }),
        },
    });

    assert.equal(result.retried, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.remaining, 1);
});

test('retryDeferredIntents removes permanent failures from queue', async () => {
    await store.resetAll();
    await store.setChatId('perm-fail-test');
    await store.appendDeferredPipelineIntent({ userMessage: 'Permanent fail task', nextAttemptAt: Date.now() - 1000 });

    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => ({
                type: 'error',
                failure: { failureCategory: 'permanent' },
            }),
        },
        bot: { api: { sendMessage: async () => {} } },
    });

    assert.equal(result.failed, 1);
    assert.equal(result.remaining, 0);
});

test('retryDeferredIntents does not match legacy category field', async () => {
    await store.resetAll();
    await store.setChatId('legacy-field-test');
    await store.appendDeferredPipelineIntent({ userMessage: 'Legacy field task', nextAttemptAt: Date.now() - 1000 });

    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => ({
                type: 'error',
                failure: { category: 'transient' }, // WRONG field name
            }),
        },
        bot: { api: { sendMessage: async () => {} } },
    });

    assert.equal(result.retried, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.remaining, 0);
});

test('retryDeferredIntents removes malformed entries without userMessage', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({ entryPoint: 'orphan' });
    await store.appendDeferredPipelineIntent({ userMessage: 'Valid task', nextAttemptAt: Date.now() - 1000 });

    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => ({ type: 'task', actions: [{ title: 'Valid task' }], operationReceipt: { status: 'applied', scope: 'ticktick_live', command: 'scheduler', operationType: 'create', nextAction: 'none', changed: true, dryRun: false, applied: true, fallbackUsed: false, message: 'Applied', traceId: 'trace-2', results: [{ status: 'succeeded' }] } }),
        },
    });

    assert.equal(result.retried, 1);
    assert.equal(result.remaining, 0);
});

test('retryDeferredIntents respects maxRetries batch limit', async () => {
    await store.resetAll();
    for (let i = 0; i < 8; i++) {
        await store.appendDeferredPipelineIntent({ userMessage: `Task ${i}`, nextAttemptAt: Date.now() - 1000 });
    }

    let callCount = 0;
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => {
                callCount++;
                return { type: 'task', actions: [{ title: 'ok' }], operationReceipt: { status: 'applied', scope: 'ticktick_live', command: 'scheduler', operationType: 'create', nextAction: 'none', changed: true, dryRun: false, applied: true, fallbackUsed: false, message: 'Applied', traceId: 'trace-5', results: [{ status: 'succeeded' }] } };
            },
        },
    }, { maxRetries: 3 });

    assert.equal(callCount, 3);
    assert.equal(result.retried, 3);
    assert.equal(result.remaining, 5);
});

test('retryDeferredIntents sends notification to user on success', async () => {
    await store.resetAll();
    await store.setChatId('notify-test');
    await store.appendDeferredPipelineIntent({ userMessage: 'Notify me', nextAttemptAt: Date.now() - 1000 });

    const sentMessages = [];
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => ({ type: 'task', actions: [{ title: 'Notify me' }], operationReceipt: { status: 'applied', scope: 'ticktick_live', command: 'scheduler', operationType: 'create', nextAction: 'none', changed: true, dryRun: false, applied: true, fallbackUsed: false, message: 'Applied', traceId: 'trace-4', results: [{ status: 'succeeded' }] } }),
        },
        bot: {
            api: {
                sendMessage: async (_chatId, msg) => { sentMessages.push(msg); },
            },
        },
    });

    assert.equal(result.retried, 1);
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0], /Deferred Retry/);
    assert.match(sentMessages[0], /applied/);
});

test('retryDeferredIntents prefers processMessageWithContext over processMessage', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({ userMessage: 'Context task', nextAttemptAt: Date.now() - 1000 });

    let usedWithContext = false;
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessageWithContext: async () => {
                usedWithContext = true;
                return { type: 'task', actions: [{ title: 'ok' }], operationReceipt: { status: 'applied', scope: 'ticktick_live', command: 'scheduler', operationType: 'create', nextAction: 'none', changed: true, dryRun: false, applied: true, fallbackUsed: false, message: 'Applied', traceId: 'trace-6', results: [{ status: 'succeeded' }] } };
            },
            processMessage: async () => {
                throw new Error('should not be called');
            },
        },
    });

    assert.equal(usedWithContext, true);
    assert.equal(result.retried, 1);
});

test('retryDeferredIntents falls back to processMessage when processMessageWithContext absent', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({ userMessage: 'Fallback task', nextAttemptAt: Date.now() - 1000 });

    let usedFallback = false;
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => {
                usedFallback = true;
                return { type: 'task', actions: [{ title: 'ok' }], operationReceipt: { status: 'applied', scope: 'ticktick_live', command: 'scheduler', operationType: 'create', nextAction: 'none', changed: true, dryRun: false, applied: true, fallbackUsed: false, message: 'Applied', traceId: 'trace-7', results: [{ status: 'succeeded' }] } };
            },
        },
    });

    assert.equal(usedFallback, true);
    assert.equal(result.retried, 1);
});

// Auto-apply poll passes blockedActionTypes: ['delete', 'complete'] to prevent destructive
// actions from being executed without human review. The pipeline-level contract is tested
// in regression.scan-review-pending.test.js; this test verifies the same contract shape.
test('auto-apply safety relies on pipeline blockedActionTypes to prevent destructive actions', async () => {
    await store.resetAll();
    const { processMessage, adapterCalls } = (await import('./pipeline-harness.js')).createPipelineHarness({
        intents: [{ type: 'delete', taskId: 'task-1', title: 'Old task' }],
        useRealNormalizer: false,
        normalizedActions: [
            { type: 'delete', taskId: 'task-1', title: 'Old task', originalProjectId: 'proj-a', valid: true, validationErrors: [] },
            { type: 'complete', taskId: 'task-2', title: 'Buy milk', originalProjectId: 'proj-b', valid: true, validationErrors: [] },
            { type: 'update', taskId: 'task-3', title: 'Updated task', originalProjectId: 'proj-c', valid: true, validationErrors: [] },
        ],
    });

    const result = await processMessage('process tasks', { blockedActionTypes: ['delete', 'complete'] });

    assert.equal(result.type, 'task');
    assert.equal(adapterCalls.delete.length, 0);
    assert.equal(adapterCalls.complete.length, 0);
    assert.equal(adapterCalls.update.length, 1);
    assert.ok(result.skippedActions);
    assert.equal(result.skippedActions.length, 2);
    assert.ok(result.skippedActions.some(a => a.type === 'delete'));
    assert.ok(result.skippedActions.some(a => a.type === 'complete'));
});

// ─── Exponential Backoff & DLQ (deferred queue improvements) ─

test('store: appendDeferredPipelineIntent sets nextAttemptAt with exponential backoff', async () => {
    await store.resetAll();
    const before = Date.now();
    const entry = await store.appendDeferredPipelineIntent({ userMessage: 'Backoff test' });
    const after = Date.now();

    assert.ok(entry.nextAttemptAt >= before + 60 * 1000, 'nextAttemptAt should be at least 1 minute out');
    assert.ok(entry.nextAttemptAt <= after + 60 * 1000, 'nextAttemptAt should be capped at 1 minute for retryCount 0');
});

test('store: appendDeferredPipelineIntent respects existing nextAttemptAt', async () => {
    await store.resetAll();
    const custom = Date.now() + 99999;
    const entry = await store.appendDeferredPipelineIntent({ userMessage: 'Custom', nextAttemptAt: custom });
    assert.equal(entry.nextAttemptAt, custom);
});

test('retryDeferredIntents skips items that are not yet due', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({
        userMessage: 'Future task',
        nextAttemptAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
    });

    let called = false;
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => {
                called = true;
                return { type: 'task', actions: [{ title: 'ok' }], operationReceipt: { status: 'applied', scope: 'ticktick_live', command: 'scheduler', operationType: 'create', nextAction: 'none', changed: true, dryRun: false, applied: true, fallbackUsed: false, message: 'Applied', traceId: 'trace-8', results: [{ status: 'succeeded' }] } };
            },
        },
    });

    assert.equal(called, false);
    assert.equal(result.retried, 0);
    assert.equal(result.remaining, 1);
});

test('retryDeferredIntents processes items that are due now', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({
        userMessage: 'Due now',
        nextAttemptAt: Date.now() - 1000,
    });

    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => ({ type: 'task', actions: [{ title: 'ok' }], operationReceipt: { status: 'applied', scope: 'ticktick_live', command: 'scheduler', operationType: 'create', nextAction: 'none', changed: true, dryRun: false, applied: true, fallbackUsed: false, message: 'Applied', traceId: 'trace-9', results: [{ status: 'succeeded' }] } }),
        },
    });

    assert.equal(result.retried, 1);
    assert.equal(result.remaining, 0);
});

test('retryDeferredIntents gives up after 3 attempts and moves to DLQ', async () => {
    await store.resetAll();
    await store.setChatId('dlq-test');
    const entry = await store.appendDeferredPipelineIntent({
        userMessage: 'Give up task',
        retryCount: 3,
        nextAttemptAt: Date.now() - 1000,
    });

    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => ({ type: 'task', actions: [{ title: 'ok' }], operationReceipt: { status: 'applied', scope: 'ticktick_live', command: 'scheduler', operationType: 'create', nextAction: 'none', changed: true, dryRun: false, applied: true, fallbackUsed: false, message: 'Applied', traceId: 'trace-10', results: [{ status: 'succeeded' }] } }),
        },
        bot: { api: { sendMessage: async () => {} } },
    });

    assert.equal(result.givenUp, 1);
    assert.equal(result.retried, 0);
    assert.equal(result.remaining, 0);
    assert.equal(store.getDeferredPipelineIntents().length, 0);

    const dlq = store.getFailedDeferredIntents();
    assert.equal(dlq.length, 1);
    assert.equal(dlq[0].id, entry.id);
    assert.equal(dlq[0].attempts, 3);
});

test('retryDeferredIntents increments retryCount and updates nextAttemptAt on transient failure', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({
        userMessage: 'Transient retry',
        retryCount: 0,
        nextAttemptAt: Date.now() - 1000,
    });

    const before = Date.now();
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => ({
                type: 'error',
                failure: { failureCategory: 'transient' },
            }),
        },
    });
    const after = Date.now();

    assert.equal(result.failed, 1);
    assert.equal(result.remaining, 1);

    const remaining = store.getDeferredPipelineIntents();
    assert.equal(remaining[0].retryCount, 1);
    assert.ok(remaining[0].nextAttemptAt >= before + 2 * 60 * 1000);
    assert.ok(remaining[0].nextAttemptAt <= after + 2 * 60 * 1000);
});

test('retryDeferredIntents treats unexpected exception as failed attempt with backoff', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({
        userMessage: 'Unexpected crash',
        retryCount: 0,
        nextAttemptAt: Date.now() - 1000,
    });

    const before = Date.now();
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => {
                throw new Error('Unexpected crash');
            },
        },
    });
    const after = Date.now();

    assert.equal(result.failed, 1);
    assert.equal(result.remaining, 1);

    const remaining = store.getDeferredPipelineIntents();
    assert.equal(remaining[0].retryCount, 1);
    assert.ok(remaining[0].nextAttemptAt >= before + 2 * 60 * 1000);
    assert.ok(remaining[0].nextAttemptAt <= after + 2 * 60 * 1000);
});

test('retryDeferredIntents moves unexpected exception to DLQ after 3 attempts and alerts user', async () => {
    await store.resetAll();
    await store.setChatId('unexpected-dlq-test');
    const entry = await store.appendDeferredPipelineIntent({
        userMessage: 'Unexpected crash dlq',
        retryCount: 2,
        nextAttemptAt: Date.now() - 1000,
    });

    const sentMessages = [];
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => {
                throw new Error('Unexpected crash dlq');
            },
        },
        bot: {
            api: {
                sendMessage: async (_chatId, msg) => { sentMessages.push(msg); },
            },
        },
    });

    assert.equal(result.givenUp, 1);
    assert.equal(result.retried, 0);
    assert.equal(result.remaining, 0);
    assert.equal(store.getDeferredPipelineIntents().length, 0);

    const dlq = store.getFailedDeferredIntents();
    assert.equal(dlq.length, 1);
    assert.equal(dlq[0].id, entry.id);
    assert.equal(dlq[0].reason, 'exception');
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0], /Deferred task failed after retries/i);
});

test('store: addFailedDeferredIntent caps at 50 items FIFO', async () => {
    await store.resetAll();
    for (let i = 0; i < 55; i++) {
        await store.addFailedDeferredIntent({ id: `f_${i}`, userMessage: `Task ${i}` });
    }
    const dlq = store.getFailedDeferredIntents();
    assert.equal(dlq.length, 50);
    assert.equal(dlq[0].id, 'f_5');
    assert.equal(dlq[49].id, 'f_54');
});

test('store: getOperationalSnapshot includes failedDeferred count', async () => {
    await store.resetAll();
    await store.addFailedDeferredIntent({ userMessage: 'Snapshot test' });
    const snapshot = store.getOperationalSnapshot();
    assert.equal(snapshot.localWorkflow.failedDeferred, 1);
});

test('store: clearFailedDeferredIntents empties DLQ', async () => {
    await store.resetAll();
    await store.addFailedDeferredIntent({ userMessage: 'Clear me' });
    assert.equal(store.getFailedDeferredIntents().length, 1);
    await store.clearFailedDeferredIntents();
    assert.equal(store.getFailedDeferredIntents().length, 0);
});
