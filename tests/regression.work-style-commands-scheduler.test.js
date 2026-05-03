import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { appendUrgentModeReminder, parseTelegramMarkdownToHTML } from '../services/shared-utils.js';
import { registerCommands } from '../bot/commands.js';
import { GeminiAnalyzer, buildWorkStylePromptNote } from '../services/gemini.js';
import { createIntentExtractor, detectWorkStyleModeIntent, QuotaExhaustedError } from '../services/intent-extraction.js';
import { createPipeline } from '../services/pipeline.js';
import { createPipelineObservability } from '../services/pipeline-observability.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import * as store from '../services/store.js';
import * as executionPrioritization from '../services/execution-prioritization.js';
import { AUTHORIZED_CHAT_ID } from '../services/shared-utils.js';
import {
  runDailyBriefingJob,
  runWeeklyDigestJob,
  SCHEDULER_NOTIFICATION_TYPES,
  shouldSuppressScheduledNotification,
} from '../services/scheduler.js';
import {
  BRIEFING_SUMMARY_SECTION_KEYS,
  DAILY_CLOSE_SUMMARY_SECTION_KEYS,
  WEEKLY_SUMMARY_SECTION_KEYS,
  buildSummaryLogPayload,
  composeBriefingSummary,
  composeDailyCloseSummary,
  composeWeeklySummary,
  formatSummary,
  normalizeWeeklyWatchouts,
} from '../services/summary-surfaces/index.js';
import { createPipelineHarness, DEFAULT_PROJECTS, DEFAULT_ACTIVE_TASKS } from './pipeline-harness.js';
import {
  buildRankingContext,
  buildRecommendationResult,
  createGoalThemeProfile,
  createRankingDecision,
  normalizePriorityCandidate,
} from '../services/execution-prioritization.js';


import {
    rankPriorityCandidatesForTest,
    buildSummaryActiveTasksFixture,
    buildSummaryProcessedHistoryFixture,
    buildSummaryResolvedStateFixture,
    buildSummaryRankingFixture,
    buildDailySummaryFixture,
    buildWeeklySummaryFixture,
    buildDailyCloseProcessedHistoryFixture,
    buildDailyCloseSummaryFixture,
} from './helpers/regression-fixtures.js';

test('default timezone remains Europe/Dublin when USER_TIMEZONE is unset', async () => {
  // Behavioral test: USER_TZ from shared-utils must match the canonical getUserTimezone()
  const { USER_TZ: sharedUserTz } = await import('../services/shared-utils.js');
  const { getUserTimezone } = await import('../services/user-settings.js');
  assert.equal(sharedUserTz, getUserTimezone());
  // When USER_TIMEZONE env is absent, the default fallback is Europe/Dublin
  if (!process.env.USER_TIMEZONE) {
    assert.equal(sharedUserTz, 'Europe/Dublin');
  }
});

test('store documents the work-style mode Redis key schema', () => {
  const source = readFileSync('services/store.js', 'utf8');
  assert.match(source, /user:\{userId\}:work_style_mode/);
});

test('store work style defaults to standard and persists explicit mode transitions', async () => {
  const store = await import('../services/store.js');
  const userId = `node-test-work-style-${Date.now()}`;

  assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
  await store.setWorkStyleMode(userId, store.MODE_URGENT);
  assert.equal(await store.getWorkStyleMode(userId), store.MODE_URGENT);
  await store.setWorkStyleMode(userId, store.MODE_FOCUS);
  assert.equal(await store.getWorkStyleMode(userId), store.MODE_FOCUS);
  await store.setWorkStyleMode(userId, store.MODE_STANDARD);
  assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
});

test('store resets urgent expiry when urgent mode is activated again', async () => {
  const userId = `node-test-urgent-reset-${Date.now()}`;

  const first = await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiryMs: 1000 });
  const second = await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiryMs: 5000 });

  assert.ok(first.expiresAt);
  assert.ok(second.expiresAt);
  assert.ok(new Date(second.expiresAt).getTime() > new Date(first.expiresAt).getTime());
});

test('store silently reverts expired urgent mode to standard', async () => {
  const userId = `node-test-urgent-expiry-${Date.now()}`;

  await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiresAt: Date.now() - 1000 });
  const state = await store.getWorkStyleState(userId);

  assert.deepEqual(state, { mode: store.MODE_STANDARD, expiresAt: null });
  assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
});

test('focus mode defaults to 4h auto-expiry but supports optional override', async () => {
  const userId = `node-test-focus-expiry-${Date.now()}`;

  const persistent = await store.setWorkStyleMode(userId, store.MODE_FOCUS);
  assert.equal(persistent.mode, store.MODE_FOCUS);
  assert.ok(persistent.expiresAt);

  await store.setWorkStyleMode(userId, store.MODE_FOCUS, { expiresAt: Date.now() - 1000 });
  const expired = await store.getWorkStyleState(userId);

  assert.deepEqual(expired, { mode: store.MODE_STANDARD, expiresAt: null });
  assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
});

test('focus mode suppresses non-critical scheduler notifications but allows critical alerts', () => {
  assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.DAILY_BRIEFING), true);
  assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.WEEKLY_DIGEST), true);
  assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.PENDING_SUPPRESSION), true);
  assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.AUTO_APPLY), true);
  assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.TOKEN_EXPIRED), false);
  assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.QUOTA_EXHAUSTED), false);
  assert.equal(shouldSuppressScheduledNotification(store.MODE_STANDARD, SCHEDULER_NOTIFICATION_TYPES.DAILY_BRIEFING), false);
});

test('work-style integration persists mode state in restart-recoverable storage', { concurrency: false }, async () => {
  await store.resetAll();
  const userId = `node-test-mode-restart-${Date.now()}`;

  await store.setWorkStyleMode(userId, store.MODE_FOCUS);
  let persisted = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    persisted = JSON.parse(readFileSync(new URL('../data/store.json', import.meta.url), 'utf8'));
    if (persisted?.workStyleModes?.[userId]) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.ok(persisted?.workStyleModes?.[userId], 'expected focus mode to be written to restart-recoverable storage');
  assert.equal(persisted.workStyleModes[userId].mode, store.MODE_FOCUS);
  assert.ok(persisted.workStyleModes[userId].expiresAt);
});

test('work-style integration switches to urgent mode and shortens briefing plus task confirmations', async () => {
  const briefingSummary = {
    focus: 'Ship the architecture PR before anything else.',
    priorities: [
      { title: 'Ship weekly architecture PR', rationale_text: 'Directly moves the highest-priority goal.' },
      { title: 'Prepare system design notes', rationale_text: 'Keeps the interview loop moving.' },
      { title: 'Pay rent', rationale_text: 'Avoids admin spillover.' },
    ],
    why_now: ['Deadline is close.', 'Unblocks review feedback.'],
    start_now: 'Open the PR checklist and draft the next commit.',
    notices: [{ severity: 'info', message: 'Keep the task list tight.' }],
  };

  const standardBriefing = formatSummary({
    kind: 'briefing',
    summary: briefingSummary,
    context: { workStyleMode: store.MODE_STANDARD, urgentMode: false },
  }).text;
  const urgentBriefing = formatSummary({
    kind: 'briefing',
    summary: briefingSummary,
    context: { workStyleMode: store.MODE_URGENT, urgentMode: true },
  }).text;

  assert.match(standardBriefing, /\*\*Why it matters\*\*/);
  assert.match(standardBriefing, /Pay rent/);
  assert.doesNotMatch(urgentBriefing, /\*\*Why it matters\*\*/);
  assert.doesNotMatch(urgentBriefing, /Pay rent/);
  assert.match(urgentBriefing, /Ship weekly architecture PR/);
  assert.match(urgentBriefing, /Prepare system design notes/);

  const { processMessage } = createPipelineHarness({
    intents: [{
      type: 'create',
      title: 'Buy groceries',
      content: '',
      priority: 1,
      projectHint: 'Inbox',
      dueDate: null,
      repeatHint: null,
      splitStrategy: null,
      confidence: 0.9,
    }],
  });

  const standardResult = await processMessage('buy groceries', { workStyleMode: store.MODE_STANDARD });
  const urgentResult = await processMessage('buy groceries', { workStyleMode: store.MODE_URGENT });

  assert.equal(standardResult.confirmationText, 'Created: Buy groceries');
  assert.equal(urgentResult.confirmationText, 'Buy groceries');
});

test('store logs work-style transitions as operational telemetry, not behavioral memory', async () => {
  const userId = `node-test-work-style-telemetry-${Date.now()}`;
  const originalLog = console.log;
  const payloads = [];

  console.log = (...args) => {
    const line = args.join(' ');
    if (line.startsWith('[WorkStyleTelemetry] ')) {
      payloads.push(JSON.parse(line.slice('[WorkStyleTelemetry] '.length)));
    }
  };

  try {
    await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiryMs: 1000 });
    await store.setWorkStyleMode(userId, store.MODE_STANDARD, { reason: 'test_cleanup' });
  } finally {
    console.log = originalLog;
  }

  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].telemetryScope, 'operational');
  assert.equal(payloads[0].behavioralSignal, false);
  assert.equal(payloads[0].eventType, 'mode_activated');
  assert.equal(payloads[0].previousMode, store.MODE_STANDARD);
  assert.equal(payloads[0].nextMode, store.MODE_URGENT);
  assert.equal(payloads[1].telemetryScope, 'operational');
  assert.equal(payloads[1].behavioralSignal, false);
  assert.equal(payloads[1].eventType, 'mode_deactivated');
  assert.equal(payloads[1].previousMode, store.MODE_URGENT);
  assert.equal(payloads[1].nextMode, store.MODE_STANDARD);
});

test('intent extraction detects work-style mode phrases', () => {
  assert.deepEqual(detectWorkStyleModeIntent('turn on urgent mode'), {
    type: 'set_work_style_mode',
    mode: store.MODE_URGENT,
  });
  assert.deepEqual(detectWorkStyleModeIntent('focus time'), {
    type: 'set_work_style_mode',
    mode: store.MODE_FOCUS,
  });
  assert.deepEqual(detectWorkStyleModeIntent('switch back to standard mode'), {
    type: 'set_work_style_mode',
    mode: store.MODE_STANDARD,
  });
  assert.deepEqual(detectWorkStyleModeIntent('what mode am I in'), {
    type: 'query_work_style_mode',
  });
  assert.deepEqual(detectWorkStyleModeIntent("I'm in a rush but let's plan carefully"), {
    type: 'clarify_work_style_mode',
    mode: store.MODE_STANDARD,
    reason: 'mixed_signal',
  });
  assert.equal(detectWorkStyleModeIntent('buy groceries tonight'), null);
});

test('appendUrgentModeReminder only appends reminder text when urgent mode is active', () => {
  assert.equal(appendUrgentModeReminder('Base briefing', false), 'Base briefing');
  assert.match(appendUrgentModeReminder('Base briefing', true), /Urgent mode is currently active/i);
});

test('registerCommands wires /urgent to the work-style store contract', async () => {
  const authChatId = await (async () => { const m = await import('../services/shared-utils.js'); return m.AUTHORIZED_CHAT_ID; })();
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  registerCommands(
    bot,
    {
      isAuthenticated: () => true,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
    },
    {
      listActiveTasks: async () => [],
      listProjects: async () => [],
    },
    {},
  );

  const urgentHandler = handlers.commands.get('urgent');
  assert.equal(typeof urgentHandler, 'function');

  const replies = [];
  const userId = authChatId || Date.now();
  const ctx = {
    chat: { id: userId },
    from: { id: userId },
    match: 'on',
    reply: async (message) => {
      replies.push(message);
    },
  };

  await store.setWorkStyleMode(userId, store.MODE_STANDARD);
  await urgentHandler(ctx);

  assert.equal(await store.getWorkStyleMode(userId), store.MODE_URGENT);
  assert.match(replies.at(-1), /Urgent mode activated/i);
  assert.match(replies.at(-1), /Expires:/i);
});

test('registerCommands allows free-form work-style changes before TickTick auth', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  registerCommands(
    bot,
    {
      isAuthenticated: () => false,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
    },
    {},
    {
      processMessage: async () => {
        throw new Error('pipeline should not run for urgent mode toggles');
      },
    },
  );

  const messageHandler = handlers.events.find(({ eventName }) => eventName === 'message:text')?.handler;
  assert.equal(typeof messageHandler, 'function');

  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || `node-test-freeform-urgent-${Date.now()}`;
  await store.setWorkStyleMode(userId, store.MODE_STANDARD);

  await messageHandler({
    message: { text: 'focus time' },
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.equal(await store.getWorkStyleMode(userId), store.MODE_FOCUS);
  assert.match(replies.at(-1), /Focus mode activated/i);
  assert.equal(replies.some((message) => /TickTick not connected yet/i.test(message)), false);
});

test('registerCommands wires /focus, /normal, and /mode to the work-style contract', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  registerCommands(
    bot,
    {
      isAuthenticated: () => true,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
    },
    {
      listActiveTasks: async () => [],
      listProjects: async () => [],
    },
    {},
  );

  const focusHandler = handlers.commands.get('focus');
  const normalHandler = handlers.commands.get('normal');
  const modeHandler = handlers.commands.get('mode');
  assert.equal(typeof focusHandler, 'function');
  assert.equal(typeof normalHandler, 'function');
  assert.equal(typeof modeHandler, 'function');

  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || Date.now();
  const ctx = {
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  };

  await store.setWorkStyleMode(userId, store.MODE_STANDARD);
  await focusHandler(ctx);
  assert.equal(await store.getWorkStyleMode(userId), store.MODE_FOCUS);
  assert.match(replies.at(-1), /Focus mode activated/i);

  await modeHandler(ctx);
  assert.match(replies.at(-1), /Current mode: FOCUS/i);

  await normalHandler(ctx);
  assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
  assert.match(replies.at(-1), /Standard mode active/i);
});

test('registerCommands answers natural-language mode queries before TickTick auth', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  registerCommands(
    bot,
    {
      isAuthenticated: () => false,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
    },
    {},
    {
      processMessage: async () => {
        throw new Error('pipeline should not run for mode queries');
      },
    },
  );

  const messageHandler = handlers.events.find(({ eventName }) => eventName === 'message:text')?.handler;
  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || `node-test-mode-query-${Date.now()}`;
  await store.setWorkStyleMode(userId, store.MODE_URGENT);

  await messageHandler({
    message: { text: 'what mode am I in' },
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.match(replies.at(-1), /Current mode: URGENT/i);
  assert.equal(replies.some((message) => /TickTick not connected yet/i.test(message)), false);
});

test('registerCommands forwards current work-style mode into freeform pipeline requests', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  const pipelineCalls = [];
  registerCommands(
    bot,
    {
      isAuthenticated: () => true,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
    },
    {
      listProjects: async () => [],
      listActiveTasks: async () => [],
    },
    {
      processMessage: async (message, options) => {
        pipelineCalls.push({ message, options });
        return { type: 'task', confirmationText: 'Done.' };
      },
    },
  );

  const messageHandler = handlers.events.find(({ eventName }) => eventName === 'message:text')?.handler;
  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || `node-test-r10-mode-${Date.now()}`;
  await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiryMs: store.DEFAULT_URGENT_EXPIRY_MS });

  await messageHandler({
    message: { text: 'buy groceries' },
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.equal(pipelineCalls.length, 1);
  assert.equal(pipelineCalls[0].options.workStyleMode, store.MODE_URGENT);
  assert.match(replies.at(-1), /Done\./);
});

test('registerCommands compresses mutation clarification copy in urgent mode', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  registerCommands(
    bot,
    {
      isAuthenticated: () => true,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
    },
    {
      listProjects: async () => [],
      listActiveTasks: async () => [],
    },
    {
      processMessage: async () => ({
        type: 'clarification',
        confirmationText: 'Which task?\n1. Write weekly report\n2. Review weekly metrics',
        workStyleMode: store.MODE_URGENT,
        clarification: {
          reason: 'ambiguous_target',
          candidates: [
            { id: 'task-1', title: 'Write weekly report' },
            { id: 'task-2', title: 'Review weekly metrics' },
          ],
        },
      }),
    },
  );

  const messageHandler = handlers.events.find(({ eventName }) => eventName === 'message:text')?.handler;
  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || `node-test-r10-clarify-${Date.now()}`;
  await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiryMs: store.DEFAULT_URGENT_EXPIRY_MS });

  await messageHandler({
    message: { text: 'update weekly' },
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.match(replies.at(-1), /Which task\?/i);
  assert.match(replies.at(-1), /Pick below or rephrase\./);
  assert.doesNotMatch(replies.at(-1), /Did you mean one of these\?/i);
});

test('registerCommands preserves create-fragment clarification question when no candidates exist', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  const clarificationQuestion = 'I created the clear task. What exactly should I create from the unclear part?';

  registerCommands(
    bot,
    {
      isAuthenticated: () => true,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
    },
    {
      listProjects: async () => [],
      listActiveTasks: async () => [],
    },
    {
      processMessage: async () => ({
        type: 'clarification',
        confirmationText: clarificationQuestion,
        clarification: {
          reason: 'ambiguous_create_fragment',
          fragments: [{ title: 'Call uber friday', clarificationQuestion }],
        },
      }),
    },
  );

  const messageHandler = handlers.events.find(({ eventName }) => eventName === 'message:text')?.handler;
  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || `node-test-create-fragment-${Date.now()}`;

  await messageHandler({
    message: { text: 'book flight and call uber friday' },
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.equal(replies.at(-1), clarificationQuestion);
  assert.doesNotMatch(replies.at(-1), /Not sure what you mean/i);
});

test('registerCommands defaults mixed mode signals to standard with clarification', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  registerCommands(
    bot,
    {
      isAuthenticated: () => false,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
    },
    {},
    {
      processMessage: async () => {
        throw new Error('pipeline should not run for mixed mode clarification');
      },
    },
  );

  const messageHandler = handlers.events.find(({ eventName }) => eventName === 'message:text')?.handler;
  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || `node-test-mixed-mode-${Date.now()}`;
  await store.setWorkStyleMode(userId, store.MODE_URGENT);

  await messageHandler({
    message: { text: "I'm in a rush but let's plan carefully" },
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
  assert.match(replies[0], /Current mode: STANDARD/i);
  assert.match(replies.at(-1), /Heard mixed mode signals/i);
});

test('registerCommands uses shared briefing surface and preserves urgent reminder', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  const summaryCalls = [];

  registerCommands(
    bot,
    {
      isAuthenticated: () => true,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
      generateDailyBriefingSummary: async (_tasks, options) => {
        summaryCalls.push(options);
        return {
          summary: {
            focus: 'Test focus',
            priorities: [],
            why_now: [],
            start_now: '',
            notices: [],
          },
          formattedText: '**???? MORNING BRIEFING**\n\n**Focus**: Test focus\n\n**Urgent mode is currently active.**',
          diagnostics: {
            kind: 'briefing',
            entryPoint: options.entryPoint,
            sourceCounts: { activeTasks: 0, processedHistory: 0 },
            degraded: false,
            degradedReason: null,
            formatterVersion: 'summary-formatter.v1',
            formattingDecisions: {
              telegramSafe: true,
              tonePreserved: true,
              urgentReminderApplied: false,
              truncated: false,
            },
            deliveryStatus: 'composed',
          },
        };
      },
    },
    {
      listActiveTasks: async () => [],
      listProjects: async () => [],
    },
    {},
  );

  const briefingHandler = handlers.commands.get('briefing');
  assert.equal(typeof briefingHandler, 'function');

  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setWorkStyleMode(userId, store.MODE_URGENT);
  await briefingHandler({
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.equal(summaryCalls.length, 1);
  assert.equal(summaryCalls[0].entryPoint, 'manual_command');
  assert.equal(summaryCalls[0].urgentMode, true);
  assert.ok(replies.some((message) => typeof message === 'string' && message.includes('Urgent mode is currently active.')));
});

test('registerCommands still answers manual briefing requests in focus mode', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  const summaryCalls = [];

  registerCommands(
    bot,
    {
      isAuthenticated: () => true,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
      generateDailyBriefingSummary: async (_tasks, options) => {
        summaryCalls.push(options);
        return {
          summary: {
            focus: 'Protect focus block',
            priorities: [],
            why_now: [],
            start_now: '',
            notices: [],
          },
          formattedText: '**🌅 MORNING BRIEFING**\n\n**Focus**: Protect focus block',
          diagnostics: {
            kind: 'briefing',
            entryPoint: options.entryPoint,
            sourceCounts: { activeTasks: 0, processedHistory: 0 },
            degraded: false,
            degradedReason: null,
            formatterVersion: 'summary-formatter.v1',
            formattingDecisions: {
              telegramSafe: true,
              tonePreserved: true,
              urgentReminderApplied: false,
              truncated: false,
            },
            deliveryStatus: 'composed',
          },
        };
      },
    },
    {
      listActiveTasks: async () => [],
      listProjects: async () => [],
    },
    {},
  );

  const briefingHandler = handlers.commands.get('briefing');
  assert.equal(typeof briefingHandler, 'function');

  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || `node-test-focus-briefing-${Date.now()}`;
  await store.setWorkStyleMode(userId, store.MODE_FOCUS);
  await briefingHandler({
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.equal(summaryCalls.length, 1);
  assert.equal(summaryCalls[0].entryPoint, 'manual_command');
  assert.equal(summaryCalls[0].workStyleMode, store.MODE_FOCUS);
  assert.ok(replies.some((message) => typeof message === 'string' && message.includes('MORNING BRIEFING')));
});

test('registerCommands uses shared weekly surface and sends formatted output', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  const weeklyCalls = [];

  registerCommands(
    bot,
    {
      isAuthenticated: () => true,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
      generateWeeklyDigestSummary: async (_tasks, processedThisWeek, options) => {
        weeklyCalls.push({ processedThisWeek, options });
        return {
          summary: {
            progress: [],
            carry_forward: [],
            next_focus: [],
            watchouts: [],
            notices: [],
          },
          formattedText: '**???? WEEKLY ACCOUNTABILITY REVIEW**\n\n**Progress**:\n- None',
          diagnostics: {
            kind: 'weekly',
            entryPoint: options.entryPoint,
            sourceCounts: {
              activeTasks: 0,
              processedHistory: Object.keys(processedThisWeek).length,
            },
            degraded: false,
            degradedReason: null,
            formatterVersion: 'summary-formatter.v1',
            formattingDecisions: {
              telegramSafe: true,
              tonePreserved: true,
              urgentReminderApplied: false,
              truncated: false,
            },
            deliveryStatus: 'composed',
          },
        };
      },
    },
    {
      listActiveTasks: async () => [],
      listProjects: async () => [],
    },
    {},
  );

  const weeklyHandler = handlers.commands.get('weekly');
  assert.equal(typeof weeklyHandler, 'function');

  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setWorkStyleMode(userId, store.MODE_STANDARD);
  await weeklyHandler({
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.equal(weeklyCalls.length, 1);
  assert.equal(weeklyCalls[0].options.entryPoint, 'manual_command');
  assert.equal(weeklyCalls[0].options.historyAvailable, true);
  assert.ok(replies.some((message) => typeof message === 'string' && message.includes('WEEKLY ACCOUNTABILITY REVIEW')));
});

test('summary surfaces share a stable context contract and output shape', () => {
  const context = {
    entryPoint: 'scheduler',
    userId: 'summary-contract-user',
    generatedAtIso: '2026-03-12T09:00:00.000Z',
    timezone: 'UTC',
    workStyleMode: store.MODE_STANDARD,
    urgentMode: false,
    deliveryChannel: 'telegram',
    schedulingMetadata: {
      triggerKind: 'scheduled',
      scheduleKey: 'daily-briefing',
      scheduledForIso: '2026-03-12T09:00:00.000Z',
      graceWindowMinutes: 15,
    },
    tonePolicy: 'preserve_existing',
  };

  const activeTasks = buildSummaryActiveTasksFixture();
  const processedHistory = buildSummaryProcessedHistoryFixture();
  const rankingResult = buildSummaryRankingFixture(activeTasks);

  const briefing = composeBriefingSummary({
    context,
    activeTasks,
    rankingResult,
    modelSummary: {
      focus: 'Protect interview prep.',
      priorities: [],
      why_now: [],
      start_now: '',
      notices: [],
    },
  });
  const weekly = composeWeeklySummary({
    context,
    activeTasks,
    processedHistory,
    historyAvailable: true,
    rankingResult,
    modelSummary: buildWeeklySummaryFixture(),
  });
  const dailyClose = composeDailyCloseSummary({
    context,
    activeTasks,
    processedHistory,
    rankingResult,
    modelSummary: {},
  });

  for (const [kind, result] of [['briefing', briefing], ['weekly', weekly], ['daily_close', dailyClose]]) {
    assert.equal(typeof result.summary, 'object');
    assert.equal(typeof result.formattedText, 'string');
    assert.equal(result.diagnostics.kind, kind);
    assert.equal(result.diagnostics.entryPoint, 'scheduler');
    assert.equal(result.diagnostics.deliveryChannel, 'telegram');
    assert.deepEqual(result.diagnostics.schedulingMetadata, {
      triggerKind: 'scheduled',
      scheduleKey: 'daily-briefing',
      scheduledForIso: '2026-03-12T09:00:00.000Z',
      graceWindowMinutes: 15,
    });
  }
});

test('summary surface OpenAPI contract defines all three shared surfaces and metadata', () => {
  const contract = readFileSync(new URL('../context/refs/summary-surfaces.openapi.yaml', import.meta.url), 'utf8');

  assert.match(contract, /\/internal\/summary-surfaces\/briefing:/);
  assert.match(contract, /\/internal\/summary-surfaces\/weekly:/);
  assert.match(contract, /\/internal\/summary-surfaces\/daily-close:/);
  assert.match(contract, /delivery_channel:/);
  assert.match(contract, /scheduling_metadata:/);
  assert.match(contract, /DailyCloseComposeRequest:/);
  assert.match(contract, /DailyCloseComposeResponse:/);
});

test('registerCommands uses shared daily-close surface and passes processed history', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  const dailyCloseCalls = [];
  await store.resetAll();
  await store.markTaskProcessed('daily-close-hist-1', {
    originalTitle: 'Completed anchor task',
    approved: true,
    reviewedAt: '2026-03-13T19:00:00Z',
  });

  registerCommands(
    bot,
    {
      isAuthenticated: () => true,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => false,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
      generateDailyCloseSummary: async (_tasks, processedTasks, options) => {
        dailyCloseCalls.push({ processedTasks, options });
        return {
          summary: {
            stats: ['Completed: 1'],
            reflection: 'Meaningful work moved today.',
            reset_cue: 'Restart with one concrete step tomorrow.',
            notices: [],
          },
          formattedText: '**🌙 END-OF-DAY REFLECTION**\n\n**Stats**:\n- Completed: 1',
          diagnostics: {
            kind: 'daily_close',
            entryPoint: options.entryPoint,
            sourceCounts: {
              activeTasks: 0,
              processedHistory: Object.keys(processedTasks).length,
            },
            degraded: false,
            degradedReason: null,
            formatterVersion: 'summary-formatter.v1',
            formattingDecisions: {
              telegramSafe: true,
              tonePreserved: true,
              urgentReminderApplied: false,
              truncated: false,
            },
            deliveryStatus: 'composed',
          },
        };
      },
    },
    {},
    {},
  );

  const dailyCloseHandler = handlers.commands.get('daily_close');
  assert.equal(typeof dailyCloseHandler, 'function');

  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setWorkStyleMode(userId, store.MODE_STANDARD);
  await dailyCloseHandler({
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.equal(dailyCloseCalls.length, 1);
  assert.equal(dailyCloseCalls[0].options.entryPoint, 'manual_command');
  assert.equal(Object.keys(dailyCloseCalls[0].processedTasks).length > 0, true);
  assert.ok(replies.some((message) => typeof message === 'string' && message.includes('END-OF-DAY REFLECTION')));
});

test('registerCommands short-circuits briefing daily_close and weekly when quota is exhausted', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) {
      handlers.commands.set(name, handler);
      return this;
    },
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return this;
    },
    on(eventName, handler) {
      handlers.events.push({ eventName, handler });
      return this;
    },
  };

  registerCommands(
    bot,
    {
      isAuthenticated: () => true,
      getCacheAgeSeconds: () => null,
      getAuthUrl: () => 'https://example.test/auth',
      getAllTasks: async () => [],
      getAllTasksCached: async () => [],
      getLastFetchedProjects: () => [],
    },
    {
      isQuotaExhausted: () => true,
      quotaResumeTime: () => null,
      activeKeyInfo: () => null,
      generateDailyBriefingSummary: async () => {
        throw new Error('generateDailyBriefingSummary should not be called when quota is exhausted');
      },
      generateDailyCloseSummary: async () => {
        throw new Error('generateDailyCloseSummary should not be called when quota is exhausted');
      },
      generateWeeklyDigestSummary: async () => {
        throw new Error('generateWeeklyDigestSummary should not be called when quota is exhausted');
      },
    },
    {},
    {},
  );

  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || Date.now();
  const ctx = {
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  };

  await handlers.commands.get('briefing')(ctx);
  await handlers.commands.get('daily_close')(ctx);
  await handlers.commands.get('weekly')(ctx);

  assert.ok(replies.some((message) => /quota exhausted/i.test(message)));
});

test('runDailyBriefingJob uses the shared briefing summary surface and keeps pending reminder outside the formatter', async () => {
  await store.resetAll();
  const userId = `scheduler-daily-${Date.now()}`;
  await store.setChatId(userId);
  await store.setWorkStyleMode(userId, store.MODE_URGENT);
  await store.markTaskPending('pending-1', { originalTitle: 'Review inbox capture' });

  const sentMessages = [];
  let summaryCalls = 0;
  const ran = await runDailyBriefingJob({
    bot: {
      api: {
        sendMessage: async (chatId, text) => {
          sentMessages.push({ chatId, text });
        },
      },
    },
    ticktick: {
      isAuthenticated: () => true,
    },
    adapter: {
      listActiveTasks: async () => buildSummaryActiveTasksFixture(),
    },
    gemini: {
      isQuotaExhausted: () => false,
      generateDailyBriefing: async () => {
        throw new Error('legacy daily string path should not be used');
      },
      generateDailyBriefingSummary: async (_tasks, options) => {
        summaryCalls += 1;
        assert.equal(options.entryPoint, 'scheduler');
        assert.equal(options.userId, userId);
        assert.equal(options.urgentMode, true);
        return {
          formattedText: '**🌅 MORNING BRIEFING**\n\nShared surface body.\n\n**Urgent mode is currently active.**',
        };
      },
    },
  });

  assert.equal(ran, true);
  assert.equal(summaryCalls, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].chatId, userId);
  assert.match(sentMessages[0].text, /MORNING BRIEFING/);
  assert.match(sentMessages[0].text, /Urgent mode is currently active/);
  assert.match(sentMessages[0].text, /1 task\(s\) pending your review\. Run \/pending\./);
  assert.ok(store.getStats().lastDailyBriefing);
});

test('runWeeklyDigestJob uses the shared weekly summary surface and preserves processed-history input', async () => {
  await store.resetAll();
  const userId = `scheduler-weekly-${Date.now()}`;
  await store.setChatId(userId);
  await store.setWorkStyleMode(userId, store.MODE_URGENT);
  await store.markTaskProcessed('hist-1', {
    originalTitle: 'Completed architecture PR draft',
    approved: true,
    sentAt: new Date().toISOString(),
  });

  const sentMessages = [];
  let summaryCalls = 0;
  const ran = await runWeeklyDigestJob({
    bot: {
      api: {
        sendMessage: async (chatId, text) => {
          sentMessages.push({ chatId, text });
        },
      },
    },
    ticktick: {
      isAuthenticated: () => true,
    },
    adapter: {
      listActiveTasks: async () => buildSummaryActiveTasksFixture(),
    },
    gemini: {
      isQuotaExhausted: () => false,
      generateWeeklyDigest: async () => {
        throw new Error('legacy weekly string path should not be used');
      },
      generateWeeklyDigestSummary: async (_tasks, processedThisWeek, options) => {
        summaryCalls += 1;
        assert.equal(options.entryPoint, 'scheduler');
        assert.equal(options.userId, userId);
        assert.equal(options.urgentMode, true);
        assert.deepEqual(Object.keys(processedThisWeek), ['hist-1']);
        return {
          formattedText: '**📊 WEEKLY ACCOUNTABILITY REVIEW**\n\nShared weekly surface.\n\n**Urgent mode is currently active.**',
        };
      },
    },
  });

  assert.equal(ran, true);
  assert.equal(summaryCalls, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].chatId, userId);
  assert.match(sentMessages[0].text, /WEEKLY ACCOUNTABILITY REVIEW/);
  assert.match(sentMessages[0].text, /Urgent mode is currently active/);
  assert.ok(store.getStats().lastWeeklyDigest);
});

test('runWeeklyDigestJob passes historyAvailable false when processed-task history is missing', async () => {
  await store.resetAll();
  const userId = `scheduler-weekly-missing-${Date.now()}`;
  await store.setChatId(userId);
  await store.setWorkStyleMode(userId, store.MODE_STANDARD);

  let summaryCalls = 0;
  const ran = await runWeeklyDigestJob({
    bot: {
      api: {
        sendMessage: async () => {},
      },
    },
    ticktick: {
      isAuthenticated: () => true,
    },
    adapter: {
      listActiveTasks: async () => buildSummaryActiveTasksFixture(),
    },
    gemini: {
      isQuotaExhausted: () => false,
      generateWeeklyDigestSummary: async (_tasks, processedThisWeek, options) => {
        summaryCalls += 1;
        assert.deepEqual(processedThisWeek, {});
        assert.equal(options.historyAvailable, false);
        return {
          formattedText: '**📊 WEEKLY ACCOUNTABILITY REVIEW**\n\nReduced weekly surface.',
        };
      },
    },
    processedTasks: null,
  });

  assert.equal(ran, true);
  assert.equal(summaryCalls, 1);

});
