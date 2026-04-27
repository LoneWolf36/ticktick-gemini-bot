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
    assert.deepEqual(result, { retried: 0, failed: 0, remaining: 0 });
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
    });

    const processCalls = [];
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessageWithContext: async (msg, opts) => {
                processCalls.push({ msg, opts });
                return { type: 'task', actions: [{ title: 'Buy groceries' }] };
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
    await store.appendDeferredPipelineIntent({ userMessage: 'Transient task' });

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
    await store.appendDeferredPipelineIntent({ userMessage: 'Permanent fail task' });

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
    await store.appendDeferredPipelineIntent({ userMessage: 'Legacy field task' });

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
    await store.appendDeferredPipelineIntent({ userMessage: 'Valid task' });

    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => ({ type: 'task', actions: [{ title: 'Valid task' }] }),
        },
    });

    assert.equal(result.retried, 1);
    assert.equal(result.remaining, 0);
});

test('retryDeferredIntents respects maxRetries batch limit', async () => {
    await store.resetAll();
    for (let i = 0; i < 8; i++) {
        await store.appendDeferredPipelineIntent({ userMessage: `Task ${i}` });
    }

    let callCount = 0;
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => {
                callCount++;
                return { type: 'task', actions: [{ title: 'ok' }] };
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
    await store.appendDeferredPipelineIntent({ userMessage: 'Notify me' });

    const sentMessages = [];
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => ({ type: 'task', actions: [{ title: 'Notify me' }] }),
        },
        bot: {
            api: {
                sendMessage: async (_chatId, msg) => { sentMessages.push(msg); },
            },
        },
    });

    assert.equal(result.retried, 1);
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0], /Deferred Intent Retry/);
    assert.match(sentMessages[0], /Retried/);
});

test('retryDeferredIntents prefers processMessageWithContext over processMessage', async () => {
    await store.resetAll();
    await store.appendDeferredPipelineIntent({ userMessage: 'Context task' });

    let usedWithContext = false;
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessageWithContext: async () => {
                usedWithContext = true;
                return { type: 'task', actions: [{ title: 'ok' }] };
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
    await store.appendDeferredPipelineIntent({ userMessage: 'Fallback task' });

    let usedFallback = false;
    const result = await retryDeferredIntents({
        adapter: { listActiveTasks: async () => [] },
        pipeline: {
            processMessage: async () => {
                usedFallback = true;
                return { type: 'task', actions: [{ title: 'ok' }] };
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
