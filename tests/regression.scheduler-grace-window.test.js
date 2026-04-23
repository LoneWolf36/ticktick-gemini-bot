import test from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../services/store.js';
import {
  buildSchedulingMetadata,
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
