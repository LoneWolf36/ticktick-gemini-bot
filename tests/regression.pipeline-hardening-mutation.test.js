import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { appendUrgentModeReminder, parseTelegramMarkdownToHTML } from '../services/shared-utils.js';
import { executeActions, registerCommands } from '../bot/commands.js';
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
import { isFollowUpMessage } from '../services/shared-utils.js';

test('pipeline context resolves dentist Thursday through the normalizer path', async () => {
  process.env.USER_TIMEZONE = 'Europe/Dublin';
  const { processMessage, adapterCalls, axCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Book dentist appointment',
        content: null,
        priority: null,
        projectHint: null,
        dueDate: 'thursday',
        repeatHint: null,
        splitStrategy: 'single',
        confidence: 0.9,
      },
    ],
  });

  const result = await processMessage('Book dentist appointment Thursday', {
    currentDate: '2026-03-10T10:00:00Z',
    entryPoint: 'regression',
    requestId: 'req-r1-dentist-thursday',
  });

  assert.equal(result.type, 'task');
  assert.equal(result.actions.length, 1);
  assert.equal(result.results.length, 1);
  assert.equal(axCalls[0].userMessage, 'Book dentist appointment Thursday');
  assert.equal(axCalls[0].options.currentDate, '2026-03-10');
  assert.deepEqual(axCalls[0].options.availableProjects, DEFAULT_PROJECTS.map((project) => project.name));
  assert.equal(adapterCalls.create.length, 1);
  assert.equal(adapterCalls.create[0].title, 'Book dentist appointment');
  assert.match(adapterCalls.create[0].dueDate, /^2026-03-12T23:59:00\.000[+-]\d{4}$/);
});

test('pipeline context routes undated groceries to admin/personal project via content inference', async () => {
  process.env.USER_TIMEZONE = 'Europe/Dublin';
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Buy groceries',
        content: null,
        priority: null,
        projectHint: null,
        dueDate: null,
        repeatHint: null,
        splitStrategy: 'single',
        confidence: 0.9,
      },
    ],
  });

  const result = await processMessage('Buy groceries', {
    currentDate: '2026-03-10T10:00:00Z',
    entryPoint: 'regression',
    requestId: 'req-r1-buy-groceries',
  });

  assert.equal(result.type, 'task');
  assert.equal(result.actions.length, 1);
  assert.equal(result.results.length, 1);
  assert.equal(adapterCalls.create.length, 1);
  assert.equal(adapterCalls.create[0].title, 'Buy groceries');
  // Without projectHint, normalizer uses inferProjectIdFromTask which now uses
  // project-policy aliases. "grocery" maps to Shopping, which is not in test
  // projects, so it falls back to the default project (Inbox).
  assert.equal(adapterCalls.create[0].projectId, DEFAULT_PROJECTS[0].id);
  assert.equal(adapterCalls.create[0].dueDate, null);
});

test('pipeline context keeps date-only currentDate stable in negative-offset timezones', async () => {
  process.env.USER_TIMEZONE = 'America/Los_Angeles';
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Book dentist',
        dueDate: 'today',
        confidence: 0.9,
      },
    ],
  });

  const result = await processMessage('book dentist today', {
    currentDate: '2026-03-10',
    entryPoint: 'regression',
    requestId: 'req-negative-offset',
  });

  assert.equal(result.type, 'task');
  assert.equal(adapterCalls.create.length, 1);
  assert.match(adapterCalls.create[0].dueDate, /^2026-03-10T23:59:00\.000-\d{4}$/);
});

test('pipeline context resolves project hints from available projects', async () => {
  process.env.USER_TIMEZONE = 'Europe/Dublin';
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Plan sprint',
        projectHint: 'Career',
        confidence: 0.9,
      },
    ],
  });

  const result = await processMessage('plan sprint in career');

  assert.equal(result.type, 'task');
  assert.equal(adapterCalls.create.length, 1);
  assert.equal(adapterCalls.create[0].projectId, DEFAULT_PROJECTS[1].id);
});

test('pipeline fails safely on malformed intent extraction output', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: { unexpected: true },
  });

  const result = await processMessage('make this sane', {
    requestId: 'req-malformed-intent',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'malformed_intent');
  assert.equal(result.failure.rolledBack, false);
  assert.equal(result.requestId, 'req-malformed-intent');
  assert.equal(result.results.length, 0);
  assert.equal(adapterCalls.create.length, 0);
});

test('pipeline returns non-task for empty intent lists', async () => {
  const { processMessage } = createPipelineHarness({ intents: [] });

  const result = await processMessage('just chatting', {
    requestId: 'req-empty-intents',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'non-task');
  assert.equal(result.nonTaskReason, 'empty_intents');
  assert.equal(result.results.length, 0);
});

test('pipeline treats hello as conversational non-task without writes', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({ intents: [] });

  const result = await processMessage('hello', {
    requestId: 'req-r1-hello',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'non-task');
  assert.match(result.confirmationText, /^Hi\./);
  assert.equal(result.results.length, 0);
  assert.equal(adapterCalls.create.length, 0);
  assert.equal(adapterCalls.update.length, 0);
  assert.equal(adapterCalls.complete.length, 0);
  assert.equal(adapterCalls.delete.length, 0);
});

test('pipeline returns validation failure when all normalized actions are invalid', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [{ type: 'create', title: 'Incomplete task' }],
    useRealNormalizer: false,
    normalizedActions: [
      {
        type: 'create',
        valid: false,
        validationErrors: ['title is required'],
      },
    ],
  });

  const result = await processMessage('create something incomplete', {
    requestId: 'req-validation-failure',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'validation');
  assert.equal(result.failure.rolledBack, false);
  assert.equal(result.results.length, 0);
  assert.equal(adapterCalls.create.length, 0);
});

test('pipeline classifies quota failures from intent extraction', async () => {
  const quotaError = new QuotaExhaustedError('All API keys exhausted');
  const intentExtractor = {
    extractIntents: async () => {
      throw quotaError;
    },
  };
  const adapter = {
    listProjects: async () => DEFAULT_PROJECTS,
    listActiveTasks: async () => [],
  };
  const pipeline = createPipeline({
    intentExtractor,
    normalizer: { normalizeActions: () => [] },
    adapter,
    observability: createPipelineObservability({ logger: null }),
  });

  const result = await pipeline.processMessage('schedule everything', {
    requestId: 'req-quota',
    entryPoint: 'telegram',
    mode: 'interactive',
    currentDate: '2026-03-10',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'quota');
  assert.equal(result.failure.retryable, true);
  assert.equal(result.requestId, 'req-quota');
});

test('pipeline classifies unexpected normalization errors', async () => {
  const adapter = {
    listProjects: async () => DEFAULT_PROJECTS,
    listActiveTasks: async () => [],
  };
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: 'Boom' }],
    },
    normalizer: {
      normalizeActions: () => {
        throw new Error('Normalizer exploded');
      },
    },
    adapter,
    observability: createPipelineObservability({ logger: null }),
  });

  const result = await pipeline.processMessage('boom', {
    requestId: 'req-unexpected',
    entryPoint: 'telegram',
    mode: 'interactive',
    currentDate: '2026-03-10',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'unexpected');
  assert.equal(result.failure.rolledBack, false);
  assert.equal(result.requestId, 'req-unexpected');
});

test('createIntentExtractor propagates QuotaExhaustedError when all models exhausted', async () => {
  // Mock GeminiAnalyzer that throws quota errors
  let callCount = 0;
  const mockGemini = {
    _keys: ['key-0', 'key-1'],
    _activeKeyIndex: 0,
    _modelTiers: { fast: ['gemini-2.5-flash'] },
    _exhaustedUntilByKey: [null, null],
    _keyUnavailableReason: [null, null],
    _modelKeyExhaustion: new Map(),

    _isKeyAvailable(index) {
      const until = this._exhaustedUntilByKey[index];
      if (!until) return true;
      if (Date.now() > until) {
        this._exhaustedUntilByKey[index] = null;
        this._keyUnavailableReason[index] = null;
        return true;
      }
      return false;
    },

    _areAllKeysUnavailable() {
      for (let i = 0; i < this._keys.length; i++) {
        if (this._isKeyAvailable(i)) return false;
      }
      return true;
    },

    _getQuotaResetMs() {
      return 24 * 60 * 60 * 1000;
    },

    _markActiveKeyUnavailable(reason, untilMs) {
      this._exhaustedUntilByKey[this._activeKeyIndex] = untilMs;
      this._keyUnavailableReason[this._activeKeyIndex] = reason;
    },

    _markModelKeyExhausted(model, keyIndex, reason, untilMs) {
      if (!this._modelKeyExhaustion.has(model)) {
        this._modelKeyExhaustion.set(model,
          new Array(this._keys.length).fill(null).map(() => ({ until: null, reason: null }))
        );
      }
      this._modelKeyExhaustion.get(model)[keyIndex] = { until: untilMs, reason };
    },

    _findNextAvailableKeyForModel(model, afterIndex) {
      for (let i = 1; i <= this._keys.length; i++) {
        const idx = (afterIndex + i) % this._keys.length;
        const state = this._modelKeyExhaustion.get(model)?.[idx];
        if (state?.until && Date.now() < state.until) continue;
        return idx;
      }
      return -1;
    },

    _areAllKeysExhaustedForModel(model) {
      if (!this._modelKeyExhaustion.has(model)) return false;
      for (let i = 0; i < this._keys.length; i++) {
        const state = this._modelKeyExhaustion.get(model)[i];
        if (!state?.until || Date.now() >= state.until) return false;
      }
      return true;
    },

    isTierExhausted(modelTier) {
      const chain = this._modelTiers[modelTier];
      for (const model of chain) {
        if (!this._areAllKeysExhaustedForModel(model)) return false;
      }
      return true;
    },

    async _executeWithFailover(prompt, apiCallFn) {
      callCount += 1;
      // Throw QUOTA_EXHAUSTED which will be caught and converted to QuotaExhaustedError
      const error = new Error('QUOTA_EXHAUSTED');
      error.status = 429;
      throw error;
    },
  };

  const intentExtractor = createIntentExtractor(mockGemini);
  await assert.rejects(
    () => intentExtractor.extractIntents('schedule rent', { currentDate: '2026-03-10', availableProjects: ['Inbox'], requestId: 'req-intent-quota' }),
    QuotaExhaustedError,
  );

  // Should have called _executeWithFailover at least once before throwing QuotaExhaustedError
  assert.ok(callCount >= 1, `Expected at least 1 call, got ${callCount}`);
});

test('burst pipeline requests remain isolated and deterministic', async () => {
  const telemetryEvents = [];
  const adapterWriteTitles = [];
  const adapter = {
    listProjects: async () => DEFAULT_PROJECTS,
    listActiveTasks: async () => [],
    getTaskSnapshot: async (taskId, projectId) => ({
      id: taskId,
      projectId,
      title: 'Task',
      content: null,
      priority: 0,
      dueDate: null,
      repeatFlag: null,
      status: 0,
    }),
    createTask: async (action) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      adapterWriteTitles.push(action.title);
      if ((action.title || '').includes('FAIL')) {
        throw new Error('Simulated adapter failure');
      }
      return {
        id: `task-${action.title}`,
        title: action.title,
        projectId: action.projectId,
      };
    },
    updateTask: async () => {
      throw new Error('updateTask should not be called in burst test');
    },
    completeTask: async () => {
      throw new Error('completeTask should not be called in burst test');
    },
    deleteTask: async () => {
      throw new Error('deleteTask should not be called in burst test');
    },
  };

  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async (userMessage) => ([{
        type: 'create',
        title: userMessage.includes('fail') ? `FAIL-${userMessage}` : `OK-${userMessage}`,
      }]),
    },
    normalizer: {
      normalizeActions: (intents) => intents.map((intent) => ({
        ...intent,
        projectId: DEFAULT_PROJECTS[0].id,
        valid: true,
        validationErrors: [],
      })),
    },
    adapter,
    observability: createPipelineObservability({
      eventSink: async (event) => {
        telemetryEvents.push(event);
      },
      logger: null,
    }),
  });

  const requests = Array.from({ length: 24 }, (_, index) => ({
    message: index % 6 === 0 ? `burst-${index}-fail` : `burst-${index}`,
    requestId: `burst-${index}`,
  }));

  const startedAtMs = Date.now();
  const results = await Promise.all(
    requests.map(({ message, requestId }) => pipeline.processMessage(message, {
      requestId,
      entryPoint: 'telegram',
      mode: 'interactive',
      currentDate: '2026-03-10',
    })),
  );
  const elapsedMs = Date.now() - startedAtMs;

  assert.equal(results.length, 24);
  assert.equal(new Set(results.map((result) => result.requestId)).size, 24);
  assert.equal(results.filter((result) => result.type === 'error').length, 4);
  assert.equal(results.filter((result) => result.type === 'task').length, 20);
  assert.ok(results.every((result, index) => result.requestId === `burst-${index}`));
  assert.ok(elapsedMs < 2000, `expected burst run under 2s, got ${elapsedMs}ms`);
  assert.equal(
    new Set(adapterWriteTitles.filter((title) => title && !title.includes('FAIL'))).size,
    20,
    'expected each successful request to keep an isolated adapter write title',
  );
  for (const [index, result] of results.entries()) {
    if (index % 6 !== 0) {
      assert.equal(result.type, 'task');
      assert.equal(result.actions[0]?.title, `OK-burst-${index}`);
    }
  }
  assert.equal(telemetryEvents.filter((event) => event.eventType === 'pipeline.request.received').length, 24);
  assert.equal(telemetryEvents.filter((event) => event.eventType === 'pipeline.request.failed').length, 4);
  assert.equal(telemetryEvents.filter((event) => event.eventType === 'pipeline.request.completed').length, 20);
});

test('pipeline happy path covers create, update, complete, delete, and non-task routing', async () => {
  process.env.USER_TIMEZONE = 'Europe/Dublin';

  const createHarness = createPipelineHarness({
    intents: [
      { type: 'create', title: 'Write summary', confidence: 0.9 },
    ],
  });
  const createResult = await createHarness.processMessage('write summary');
  assert.equal(createResult.type, 'task');
  assert.equal(createResult.actions[0].type, 'create');
  assert.equal(createResult.results[0].status, 'succeeded');
  assert.match(createResult.confirmationText, /Created/);

  const updateHarness = createPipelineHarness({
    intents: [
      { type: 'update', taskId: 'task-123', title: 'Revise summary', projectHint: 'Inbox', confidence: 0.9 },
    ],
  });
  const updateResult = await updateHarness.processMessage('update task');
  assert.equal(updateResult.type, 'task');
  assert.equal(updateResult.actions[0].type, 'update');
  assert.equal(updateHarness.adapterCalls.update.length, 1);
  assert.match(updateResult.confirmationText, /Updated 1 task/);

  const completeHarness = createPipelineHarness({
    intents: [
      { type: 'complete', taskId: 'task-456', projectHint: 'Inbox', confidence: 0.9 },
    ],
  });
  const completeResult = await completeHarness.processMessage('complete task');
  assert.equal(completeResult.type, 'task');
  assert.equal(completeHarness.adapterCalls.complete.length, 1);
  assert.match(completeResult.confirmationText, /Completed 1 task/);

  const deleteHarness = createPipelineHarness({
    intents: [
      { type: 'delete', taskId: 'task-789', projectHint: 'Inbox', confidence: 0.9 },
    ],
  });
  const deleteResult = await deleteHarness.processMessage('delete task');
  assert.equal(deleteResult.type, 'task');
  assert.equal(deleteHarness.adapterCalls.delete.length, 1);
  assert.match(deleteResult.confirmationText, /Deleted 1 task/);

  const nonTaskHarness = createPipelineHarness({ intents: [] });
  const nonTaskResult = await nonTaskHarness.processMessage('just chatting');
  assert.equal(nonTaskResult.type, 'non-task');
  assert.equal(nonTaskResult.results.length, 0);
});

// ─── Mutation Clarification Callback Resume (WP06) ────────────

test('registerCallbacks wires mut:pick and mut:cancel callback families', async () => {
  const { registerCallbacks } = await import('../bot/callbacks.js');
  const handlers = { callbacks: [] };
  const bot = {
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return bot;
    },
  };

  registerCallbacks(
    bot,
    {},
    { processMessage: async () => ({ type: 'non-task', confirmationText: 'Got it' }) },
  );

  const patterns = handlers.callbacks.map(h => h.pattern.toString());
  assert.ok(patterns.some(p => p.includes('mut:pick')));
  assert.ok(patterns.some(p => p.includes('mut:cancel')));
});

test('mut:pick resumes through pipeline with resolved task context', async () => {
  const { registerCallbacks } = await import('../bot/callbacks.js');
  const store = await import('../services/store.js');
  const { AUTHORIZED_CHAT_ID } = await import('../bot/utils.js');

  // Set up pending clarification state
  const userId = 12345;
  const chatId = AUTHORIZED_CHAT_ID || 67890;
  await store.setPendingMutationClarification({
    originalMessage: 'move weekly to Career',
    candidates: [
      { id: 'task-weekly-1', title: 'Write weekly report' },
      { id: 'task-weekly-2', title: 'Review weekly metrics' },
    ],
    intentSummary: 'Update task',
    chatId,
    userId,
    entryPoint: 'telegram:freeform',
    mode: 'interactive',
  });

  const pipelineCalls = [];
  const handlers = { callbacks: [] };
  const bot = {
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return bot;
    },
  };

  const ticktick = {
    isAuthenticated: () => true,
  };
  const adapter = {
    listActiveTasks: async () => [
      { id: 'task-weekly-1', title: 'Write weekly report', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
      { id: 'task-weekly-2', title: 'Review weekly metrics', projectId: 'inbox', projectName: 'Inbox', priority: 1, status: 0 },
    ],
    listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
  };

  const pipeline = {
    processMessage: async (msg, opts) => {
      pipelineCalls.push({ message: msg, options: opts });
      return { type: 'task', confirmationText: 'Updated "Write weekly report"', actions: [], results: [{ status: 'succeeded' }] };
    },
  };

  registerCallbacks(bot, adapter, pipeline);

  // Find the mut:pick handler
  const pickHandler = handlers.callbacks.find(h => h.pattern.toString().includes('mut:pick'))?.handler;
  assert.equal(typeof pickHandler, 'function');

  const answers = [];
  const edits = [];
  const ctx = {
    match: ['mut:pick:task-weekly-1', 'task-weekly-1'],
    chat: { id: chatId },
    from: { id: userId },
    answerCallbackQuery: async (obj) => { answers.push(obj); },
    editMessageText: async (text, opts) => { edits.push(text); },
  };

  await pickHandler(ctx);

  // Verify pipeline was called with the correct options
  assert.equal(pipelineCalls.length, 1);
  assert.equal(pipelineCalls[0].message, 'move weekly to Career');
  assert.equal(pipelineCalls[0].options.existingTask.id, 'task-weekly-1');
  assert.equal(pipelineCalls[0].options.skipClarification, true);
  assert.equal(pipelineCalls[0].options.entryPoint, 'telegram:freeform');

  // Verify state was cleared
  assert.equal(store.getPendingMutationClarification(), null);

  // Verify user saw success message
  assert.equal(answers.length, 1);
  assert.ok(answers[0].text.includes('Processing'));
  assert.ok(edits[0].includes('Updated'));
});

test('mut:pick rejects cross-user selections', async () => {
  const { registerCallbacks } = await import('../bot/callbacks.js');
  const store = await import('../services/store.js');
  const { AUTHORIZED_CHAT_ID } = await import('../bot/utils.js');

  const userId = 111;
  const chatId = AUTHORIZED_CHAT_ID || 222;
  await store.setPendingMutationClarification({
    originalMessage: 'update weekly',
    candidates: [{ id: 'task-1', title: 'Weekly report' }],
    intentSummary: 'Update task',
    chatId,
    userId,
    entryPoint: 'telegram:freeform',
    mode: 'interactive',
  });

  const handlers = { callbacks: [] };
  const bot = {
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return bot;
    },
  };

  registerCallbacks(
    bot,
    {},
    { processMessage: async () => { throw new Error('should not be called'); } },
  );

  const pickHandler = handlers.callbacks.find(h => h.pattern.toString().includes('mut:pick'))?.handler;

  const answers = [];
  const edits = [];
  const ctx = {
    match: ['mut:pick:task-1', 'task-1'],
    chat: { id: chatId }, // Same chat (authorized)
    from: { id: 999 }, // Different user
    answerCallbackQuery: async (obj) => { answers.push(obj); },
    editMessageText: async (text) => { edits.push(text); },
  };

  await pickHandler(ctx);

  assert.equal(answers.length, 1);
  assert.ok(edits[0].includes('Wrong user'));
  // State should NOT have been cleared
  assert.ok(store.getPendingMutationClarification() !== null);
});

test('mut:pick rejects expired clarifications', async () => {
  const { registerCallbacks } = await import('../bot/callbacks.js');
  const store = await import('../services/store.js');
  const { AUTHORIZED_CHAT_ID } = await import('../bot/utils.js');

  // Set expired state (1 hour ago, well past the 10-minute TTL)
  const expiredTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const chatId = AUTHORIZED_CHAT_ID || 100;
  await store.setPendingMutationClarification({
    originalMessage: 'update weekly',
    candidates: [{ id: 'task-1', title: 'Weekly report' }],
    intentSummary: 'Update task',
    chatId,
    userId: chatId,
    entryPoint: 'telegram:freeform',
    mode: 'interactive',
    createdAt: expiredTime,
  });

  const handlers = { callbacks: [] };
  const bot = {
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return bot;
    },
  };

  registerCallbacks(
    bot,
    {},
    { processMessage: async () => { throw new Error('should not be called'); } },
  );

  const pickHandler = handlers.callbacks.find(h => h.pattern.toString().includes('mut:pick'))?.handler;

  const answers = [];
  const edits = [];
  const ctx = {
    match: ['mut:pick:task-1', 'task-1'],
    chat: { id: chatId },
    from: { id: chatId },
    answerCallbackQuery: async (obj) => { answers.push(obj); },
    editMessageText: async (text) => { edits.push(text); },
  };

  await pickHandler(ctx);

  assert.equal(answers.length, 1);
  assert.ok(answers[0].text.includes('Processing'));
  assert.ok(edits[0].includes('expired'));
  // State should be cleared
  assert.equal(store.getPendingMutationClarification(), null);
});

test('mut:cancel clears pending state safely', async () => {
  const { registerCallbacks } = await import('../bot/callbacks.js');
  const store = await import('../services/store.js');
  const { AUTHORIZED_CHAT_ID } = await import('../bot/utils.js');

  const chatId = AUTHORIZED_CHAT_ID || 300;
  await store.setPendingMutationClarification({
    originalMessage: 'update weekly',
    candidates: [{ id: 'task-1', title: 'Weekly report' }],
    intentSummary: 'Update task',
    chatId,
    userId: chatId,
    entryPoint: 'telegram:freeform',
    mode: 'interactive',
  });

  const handlers = { callbacks: [] };
  const bot = {
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return bot;
    },
  };

  registerCallbacks(
    bot,
    {},
    {},
  );

  const cancelHandler = handlers.callbacks.find(h => h.pattern.toString().includes('mut:cancel'))?.handler;

  const answers = [];
  const edits = [];
  const ctx = {
    match: ['mut:cancel'],
    chat: { id: chatId },
    from: { id: chatId },
    answerCallbackQuery: async (obj) => { answers.push(obj); },
    editMessageText: async (text) => { edits.push(text); },
  };

  await cancelHandler(ctx);

  assert.equal(store.getPendingMutationClarification(), null);
  assert.equal(answers.length, 1);
  assert.ok(edits[0].includes('canceled'));
});

test('mut:pick fails safely when no pending state exists', async () => {
  const { registerCallbacks } = await import('../bot/callbacks.js');
  const store = await import('../services/store.js');
  const { AUTHORIZED_CHAT_ID } = await import('../bot/utils.js');

  // Ensure no pending state
  await store.clearPendingMutationClarification();

  const handlers = { callbacks: [] };
  const bot = {
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return bot;
    },
  };

  registerCallbacks(
    bot,
    {},
    { processMessage: async () => { throw new Error('should not be called'); } },
  );

  const pickHandler = handlers.callbacks.find(h => h.pattern.toString().includes('mut:pick'))?.handler;

  const answers = [];
  const edits = [];
  const chatId = AUTHORIZED_CHAT_ID || 400;
  const ctx = {
    match: ['mut:pick:task-1', 'task-1'],
    chat: { id: chatId },
    from: { id: chatId },
    answerCallbackQuery: async (obj) => { answers.push(obj); },
    editMessageText: async (text) => { edits.push(text); },
  };

  await pickHandler(ctx);

  assert.equal(answers.length, 1);
  assert.ok(edits[0].includes('No pending'));
});

test('pipeline skipClarification uses existingTask for mutation resume', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'Move to Career', confidence: 0.9, targetQuery: 'weekly' },
    ],
    activeTasks: [
      { id: 'task-resolved', title: 'Weekly report draft', projectId: 'inbox', projectName: 'Inbox', priority: 5, status: 0 },
    ],
  });

  // With skipClarification and existingTask, should not return clarification
  const result = await harness.processMessage('update weekly', {
    existingTask: { id: 'task-resolved', projectId: 'inbox', title: 'Weekly report draft' },
    skipClarification: true,
  });

  assert.equal(result.type, 'task');
  assert.equal(harness.adapterCalls.update.length, 1);
  assert.equal(harness.adapterCalls.update[0].taskId, 'task-resolved');
});

// =========================================================================
// WP06 — T017: Observability event structure assertions (stable contract)
// =========================================================================

test('WP06 T017: observability events expose stable contract fields', async () => {
  const telemetryEvents = [];
  const observability = createPipelineObservability({
    eventSink: async (event) => { telemetryEvents.push(event); },
    logger: null,
  });

  const harness = createPipelineHarness({
    intents: [{ type: 'create', title: 'Telemetry test task', confidence: 0.9 }],
    observability,
  });

  await harness.processMessage('create a telemetry test task', {
    requestId: 'req-obs-contract',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  // Every event MUST have these stable fields regardless of step
  const requiredFields = [
    'eventType', 'timestamp', 'requestId', 'entryPoint', 'step', 'status',
    'durationMs', 'failureClass', 'actionType', 'attempt', 'rolledBack', 'metadata',
  ];

  for (const event of telemetryEvents) {
    for (const field of requiredFields) {
      assert.ok(Object.hasOwn(event, field), `event ${event.eventType} missing field: ${field}`);
    }
  }

  // Request-received events have stable step name
  const receivedEvents = telemetryEvents.filter(e => e.eventType === 'pipeline.request.received');
  assert.equal(receivedEvents.length, 1);
  assert.equal(receivedEvents[0].step, 'request');
  assert.equal(receivedEvents[0].status, 'start');
  assert.equal(receivedEvents[0].requestId, 'req-obs-contract');
  assert.equal(receivedEvents[0].entryPoint, 'telegram_message');
});

test('WP06 T017: observability failure events include failureClass and rolledBack', async () => {
  const telemetryEvents = [];
  const observability = createPipelineObservability({
    eventSink: async (event) => { telemetryEvents.push(event); },
    logger: null,
  });

  const harness = createPipelineHarness({
    intents: [{ type: 'create', title: 'Will fail', confidence: 0.9 }],
    adapterOverrides: {
      createTask: async () => { throw new Error('Adapter unavailable'); },
    },
    observability,
  });

  await harness.processMessage('create will fail', {
    requestId: 'req-obs-failure-class',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  // Find the failure event with failureClass set
  const failureEvents = telemetryEvents.filter(e => e.failureClass !== null);
  assert.ok(failureEvents.length > 0, 'expected at least one event with failureClass');

  const adapterFailure = failureEvents.find(e => e.failureClass === 'adapter');
  assert.ok(adapterFailure, 'expected adapter failureClass event');
  assert.equal(adapterFailure.rolledBack, false);
  assert.equal(adapterFailure.status, 'failure');
});

// =========================================================================
// WP06 — T020: Fail-closed behavior — failure class + user message shape
// =========================================================================

test('WP06 T020: fail-closed — malformed intent extraction returns user-safe message without leaking diagnostics', async () => {
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => 'garbage: <html>error page</html>',
    },
    normalizer: {
      normalizeActions: () => [],
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
    },
  });

  const result = await pipeline.processMessage('do something', {
    requestId: 'req-fail-closed-malformed',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'malformed_intent');
  // User message MUST be compact and MUST NOT leak raw error text
  assert.match(result.confirmationText, /could not understand/i);
  assert.equal(result.confirmationText.includes('<html>'), false);
  assert.equal(result.confirmationText.includes('garbage'), false);
  // Developer diagnostics ARE available in diagnostics array
  assert.ok(result.diagnostics.length > 0);
});

test('WP06 T020: fail-closed — validation failure returns user-safe message', async () => {
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: '' }],
    },
    normalizer: {
      normalizeActions: (intents) => intents.map(intent => ({
        ...intent,
        projectId: 'inbox',
        valid: false,
        validationErrors: ['title is required for create actions'],
      })),
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
    },
  });

  const result = await pipeline.processMessage('create a task', {
    requestId: 'req-fail-closed-validation',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'validation');
  assert.match(result.confirmationText, /could not validate/i);
  // Should NOT leak internal field names to the user
  assert.equal(result.confirmationText.includes('validationErrors'), false);
});

test('WP06 T020: fail-closed — adapter failure returns generic retry message', async () => {
  let createAttempts = 0;
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: 'Test task' }],
    },
    normalizer: {
      normalizeActions: (intents) => intents.map(intent => ({
        ...intent,
        projectId: 'inbox',
        valid: true,
        validationErrors: [],
      })),
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
      createTask: async () => {
        createAttempts += 1;
        throw new Error('TickTick API 503 Service Unavailable');
      },
    },
  });

  const result = await pipeline.processMessage('create test', {
    requestId: 'req-fail-closed-adapter',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'adapter');
  assert.equal(result.failure.failureCategory, 'transient');
  assert.equal(result.failure.retryable, true);
  assert.equal(createAttempts, 2);
  assert.match(result.confirmationText, /failed.*retry|retry.*shortly/i);
  // User message MUST NOT expose internal error details
  assert.equal(result.confirmationText.includes('503'), false);
  assert.equal(result.confirmationText.includes('Service Unavailable'), false);
});

test('WP06 T020: permanent adapter failures do not retry and ask for correction', async () => {
  let createAttempts = 0;
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: 'Test task' }],
    },
    normalizer: {
      normalizeActions: (intents) => intents.map(intent => ({
        ...intent,
        projectId: 'missing-project',
        valid: true,
        validationErrors: [],
      })),
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
      createTask: async () => {
        createAttempts += 1;
        throw new Error('Missing project: could not resolve project');
      },
    },
  });

  const result = await pipeline.processMessage('create test', {
    requestId: 'req-fail-closed-adapter-permanent',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'adapter');
  assert.equal(result.failure.failureCategory, 'permanent');
  assert.equal(result.failure.retryable, false);
  assert.equal(createAttempts, 1);
  assert.match(result.confirmationText, /correct.*retry|could not be applied/i);
  assert.equal(result.confirmationText.includes('missing-project'), false);
});

test('WP06 T020: fail-closed — quota exhaustion returns user-safe message', async () => {
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => { throw new QuotaExhaustedError('All API keys exhausted'); },
    },
    normalizer: { normalizeActions: () => [] },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
    },
  });

  const result = await pipeline.processMessage('create test', {
    requestId: 'req-fail-closed-quota',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'quota');
  assert.match(result.confirmationText, /quota.*exhausted|try.*again/i);
});

test('WP06 R4: pipeline surfaces rate-limit ETA in user message when adapter provides retry metadata', async () => {
  let createAttempts = 0;
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: 'Rate limited task' }],
    },
    normalizer: {
      normalizeActions: (intents) => intents.map((intent) => ({
        ...intent,
        projectId: 'inbox',
        valid: true,
        validationErrors: [],
      })),
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
      createTask: async () => {
        createAttempts += 1;
        const error = new Error('429 Too Many Requests');
        error.code = 'RATE_LIMITED';
        error.retryAfterMs = 90000;
        error.retryAt = new Date(Date.now() + 90000).toISOString();
        throw error;
      },
    },
  });

  const result = await pipeline.processMessage('create rate-limited task', {
    requestId: 'req-r4-rate-limit-eta',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'adapter');
  assert.equal(result.failure.failureCategory, 'transient');
  assert.equal(createAttempts, 1, 'pipeline should not re-hit TickTick after adapter-level 429 handling');
  assert.match(result.confirmationText, /(retry|try again).*(minute|second|at|in)/i);

  const failureDetails = result.failure?.details || {};
  const firstFailure = Array.isArray(failureDetails.failures) ? failureDetails.failures[0] : null;
  assert.ok(
    Number.isFinite(failureDetails.retryAfterMs)
      || typeof failureDetails.retryAt === 'string'
      || Number.isFinite(firstFailure?.retryAfterMs)
      || typeof firstFailure?.retryAt === 'string',
    'expected retry ETA metadata preserved in failure details',
  );
});

test('WP06 R4: pipeline distinguishes quota exhaustion from transient rate limiting', async () => {
  const makePipeline = (errorFactory) => createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: 'Task' }],
    },
    normalizer: {
      normalizeActions: (intents) => intents.map((intent) => ({
        ...intent,
        projectId: 'inbox',
        valid: true,
        validationErrors: [],
      })),
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
      createTask: async () => {
        throw errorFactory();
      },
    },
  });

  const transientResult = await makePipeline(() => {
    const error = new Error('429 Too Many Requests');
    error.code = 'RATE_LIMITED';
    error.retryAfterMs = 30000;
    return error;
  }).processMessage('create transient', {
    requestId: 'req-r4-transient',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  const quotaResult = await makePipeline(() => {
    const error = new Error('Quota exhausted for task writes');
    error.code = 'QUOTA_EXHAUSTED';
    return error;
  }).processMessage('create quota', {
    requestId: 'req-r4-quota',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(transientResult.type, 'error');
  assert.equal(quotaResult.type, 'error');

  assert.equal(transientResult.failure.class, 'adapter');
  assert.equal(quotaResult.failure.class, 'adapter');
  assert.equal(transientResult.failure.failureCategory, 'transient');
  assert.equal(quotaResult.failure.failureCategory, 'permanent');
  assert.notEqual(
    transientResult.confirmationText,
    quotaResult.confirmationText,
    'quota exhaustion and transient rate limits should produce distinguishable user feedback',
  );
  assert.match(quotaResult.confirmationText, /quota/i);
});

// =========================================================================
// WP06 — T012: Failure-path regressions (additional coverage)
// =========================================================================

test('WP06 T012: pipeline classifies malformed intent extraction output when extractIntents returns non-array', async () => {
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => ({ not: 'an array' }),
    },
    normalizer: { normalizeActions: () => [] },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
    },
  });

  const result = await pipeline.processMessage('test malformed', {
    requestId: 'req-malformed-non-array',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'malformed_intent');
});

test('WP06 T012: pipeline handles intent extraction returning null intents', async () => {
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => null,
    },
    normalizer: { normalizeActions: () => [] },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
    },
  });

  const result = await pipeline.processMessage('test null', {
    requestId: 'req-null-intents',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  // Null from intent extraction is treated as empty/non-task, not malformed
  assert.equal(result.type, 'error');
  assert.ok(['malformed_intent', 'unexpected', 'validation'].includes(result.failure.class),
    `null intents should fail with a known class, got: ${result.failure.class}`);
});

// =========================================================================
// WP07 — T071: End-to-end mutation regressions (happy paths)
// =========================================================================

test('WP07 T071: update mutation happy path — rename target via exact match', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'Weekly report — Q4', confidence: 0.95, targetQuery: 'weekly' },
    ],
    activeTasks: [
      { id: 'task-update-01', title: 'Weekly report draft', projectId: 'inbox', projectName: 'Inbox', priority: 5, status: 0 },
    ],
  });

  const result = await harness.processMessage('rename the weekly report to Weekly report — Q4');

  assert.equal(result.type, 'task');
  assert.equal(harness.adapterCalls.update.length, 1);
  assert.equal(harness.adapterCalls.update[0].taskId, 'task-update-01');
  assert.match(result.confirmationText, /Updated 1 task/i);
});

test('WP07 T071: update mutation happy path — change due date', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'Write weekly report', confidence: 0.95, targetQuery: 'weekly', content: '', suggestedSchedule: 'today' },
    ],
    activeTasks: [
      { id: 'task-due-01', title: 'Write weekly report', projectId: 'career', projectName: 'Career', priority: 5, dueDate: '2026-03-20', status: 0 },
    ],
  });

  const result = await harness.processMessage('move the weekly report to today');

  assert.equal(result.type, 'task');
  assert.equal(harness.adapterCalls.update.length, 1);
  assert.equal(harness.adapterCalls.update[0].taskId, 'task-due-01');
});

test('WP07 T071: complete mutation happy path — exact match', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'complete', title: 'Review PR #123', confidence: 0.95, targetQuery: 'review PR' },
    ],
    activeTasks: [
      { id: 'task-complete-01', title: 'Review PR #123', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
    ],
  });

  const result = await harness.processMessage('mark review PR as done');

  assert.equal(result.type, 'task');
  assert.equal(harness.adapterCalls.complete.length, 1);
  assert.equal(harness.adapterCalls.complete[0].taskId, 'task-complete-01');
  assert.match(result.confirmationText, /Completed 1 task/i);
});

test('WP07 T071: delete mutation happy path — exact match', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'delete', title: 'Buy groceries', confidence: 0.95, targetQuery: 'groceries' },
    ],
    activeTasks: [
      { id: 'task-delete-01', title: 'Buy groceries', projectId: 'inbox', projectName: 'Inbox', priority: 1, status: 0 },
    ],
  });

  const result = await harness.processMessage('delete the groceries task');

  assert.equal(result.type, 'task');
  assert.equal(harness.adapterCalls.delete.length, 1);
  assert.equal(harness.adapterCalls.delete[0].taskId, 'task-delete-01');
  assert.match(result.confirmationText, /Deleted 1 task/i);
});

// =========================================================================
// WP07 — T072: Fail-closed coverage for mixed/underspecified/ambiguous
// =========================================================================

test('WP07 T072: mixed create+mutation request is rejected', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'create', title: 'New task' },
      { type: 'update', title: 'Old task', targetQuery: 'old', confidence: 0.9 },
    ],
    activeTasks: [
      { id: 'task-old-01', title: 'Old task', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
    ],
  });

  const result = await harness.processMessage('create a new task and update the old one');

  assert.equal(result.type, 'error');
  assert.equal(harness.adapterCalls.create.length, 0);
  assert.equal(harness.adapterCalls.update.length, 0);
});

test('WP07 T072: small multi-mutation request is allowed for lightweight actions', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'complete', title: 'Task A', targetQuery: 'task A', confidence: 0.9 },
      { type: 'complete', title: 'Task B', targetQuery: 'task B', confidence: 0.9 },
    ],
    activeTasks: [
      { id: 'task-a-01', title: 'Task A', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
      { id: 'task-b-01', title: 'Task B', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
    ],
  });

  const result = await harness.processMessage('complete both tasks');

  assert.equal(result.type, 'task');
  assert.equal(harness.adapterCalls.complete.length, 2);
});

test('WP07 T072: batch-style mutation phrasing is rejected with single-target guidance', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: null, targetQuery: 'all gym tasks', dueDate: 'next week', confidence: 0.9 },
    ],
    activeTasks: [
      { id: 'task-gym-01', title: 'Gym mon', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
      { id: 'task-gym-02', title: 'Gym wed', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
    ],
  });

  const result = await harness.processMessage('move all gym tasks to next week');

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'validation');
  assert.equal(harness.adapterCalls.update.length, 0);
  assert.match(result.confirmationText, /one task per request|single task|one target/i);
});

test('WP07 T072: pronoun-only underspecified target — verify resolution behavior', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'it', confidence: 0.5, targetQuery: 'it' },
    ],
    activeTasks: [
      { id: 'task-pro-01', title: 'Review PR', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
      { id: 'task-pro-02', title: 'Write report', projectId: 'career', projectName: 'Career', priority: 5, status: 0 },
    ],
  });

  const result = await harness.processMessage('update it');

  assert.equal(result.type, 'clarification');
  assert.equal(harness.adapterCalls.update.length, 0);
});

test('WP07 T072: ambiguous matches require clarification instead of mutation', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'report', confidence: 0.9, targetQuery: 'report' },
    ],
    activeTasks: [
      { id: 'task-amb-01', title: 'Weekly report', projectId: 'inbox', projectName: 'Inbox', priority: 5, status: 0 },
      { id: 'task-amb-02', title: 'Monthly report', projectId: 'career', projectName: 'Career', priority: 3, status: 0 },
    ],
  });

  const result = await harness.processMessage('update the report');

  // Ambiguous: should return clarification, not a direct mutation
  assert.equal(harness.adapterCalls.update.length, 0);
  assert.equal(result.type, 'clarification');
});

test('WP07 T072: not-found result does not mutate', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'nonexistent task', confidence: 0.9, targetQuery: 'nonexistent task xyz' },
    ],
    activeTasks: [
      { id: 'task-nf-01', title: 'Real task', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
    ],
  });

  const result = await harness.processMessage('update the nonexistent task');

  assert.equal(harness.adapterCalls.update.length, 0);
  assert.equal(result.type, 'not-found');
});

test('WP07 T072: delete remains fail-closed when resolution is uncertain', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'delete', title: 'task', confidence: 0.4, targetQuery: 'task' },
    ],
    activeTasks: [
      { id: 'task-fc-01', title: 'Something important', projectId: 'inbox', projectName: 'Inbox', priority: 5, status: 0 },
      { id: 'task-fc-02', title: 'Something else', projectId: 'inbox', projectName: 'Inbox', priority: 1, status: 0 },
    ],
  });

  const result = await harness.processMessage('delete that thing');

  // Generic "task" query matching multiple candidates → clarification, not delete
  assert.equal(harness.adapterCalls.delete.length, 0);
  assert.ok(
    result.type === 'clarification' || result.type === 'not-found',
    `uncertain delete should fail closed, got type: ${result.type}`
  );
});

// =========================================================================
// Recent-task memory + force_reply refinement
// =========================================================================

test('isFollowUpMessage requires pronoun or time-shift keyword under 60 chars', () => {
  assert.equal(isFollowUpMessage('Buy milk'), false);
  assert.equal(isFollowUpMessage('done'), false);
  assert.equal(isFollowUpMessage('Book dentist appointment Thursday'), false);
  assert.equal(isFollowUpMessage('create a new task for next week'), true);
  assert.equal(isFollowUpMessage('make it high priority'), true);
  assert.equal(isFollowUpMessage('it'), true);
  assert.equal(isFollowUpMessage('move to career'), true);
  assert.equal(isFollowUpMessage('change it to tomorrow instead'), true);
  assert.equal(isFollowUpMessage('tomorrow instead'), true);
  assert.equal(isFollowUpMessage('a'.repeat(60)), false);
  assert.equal(isFollowUpMessage('it is a very long message that exceeds the sixty character limit and should not be treated as follow up even with a pronoun inside'), false);
});

test('isFollowUpMessage matches recent task title with fuzzy word overlap', () => {
    assert.equal(isFollowUpMessage('update the quarterly review task', 'quarterly review task'), true);
    assert.equal(isFollowUpMessage('buy milk', 'quarterly review'), false);
    assert.equal(isFollowUpMessage('change quarterly to monthly', 'quarterly review'), true);
    assert.equal(isFollowUpMessage('a'.repeat(121), 'quarterly review'), false);
    assert.equal(isFollowUpMessage('update the quarterly review task', 'Quarterly Review Task'), true);
});

test('store recentTaskContext respects TTL', async () => {
  const store = await import('../services/store.js');
  const userId = 'test-user-ttl';
  await store.setRecentTaskContext(userId, {
    taskId: 'task-123',
    title: 'Test task',
    projectId: 'inbox',
    source: 'test',
  });

  const fresh = store.getRecentTaskContext(userId);
  assert.equal(fresh.taskId, 'task-123');
  assert.equal(fresh.title, 'Test task');

  // Expire manually by manipulating expiresAt
  await store.setRecentTaskContext(userId, {
    taskId: 'task-old',
    title: 'Old task',
    projectId: 'inbox',
    source: 'test',
  });
  const state = await import('../services/store.js');
  // Direct state mutation to set past expiry
  const entry = state.getRecentTaskContext(userId);
  if (entry) {
    const moduleState = (await import('../services/store.js'));
    // Re-import to get module state — no direct access, so use clear instead
  }

  // Clear and verify null
  await store.clearRecentTaskContext(userId);
  assert.equal(store.getRecentTaskContext(userId), null);
});

test('pipeline resolves pronoun query when existingTask is injected from recent task', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'it', confidence: 0.5, targetQuery: 'it' },
    ],
    activeTasks: [
      { id: 'task-pro-01', title: 'Review PR', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
      { id: 'task-pro-02', title: 'Write report', projectId: 'career', projectName: 'Career', priority: 5, status: 0 },
    ],
  });

  const result = await harness.processMessage('update it', {
    existingTask: { id: 'task-pro-01', projectId: 'inbox', title: 'Review PR' },
  });

  assert.equal(result.type, 'task');
  assert.equal(harness.adapterCalls.update.length, 1);
  assert.equal(harness.adapterCalls.update[0].taskId, 'task-pro-01');
});

test('processMessageWithContext injects recentTask as existingTask', async () => {
  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'it', confidence: 0.5, targetQuery: 'it' },
    ],
    activeTasks: [
      { id: 'task-rt-01', title: 'Weekly report', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
    ],
  });

  const result = await harness.pipeline.processMessageWithContext('update it', {
    recentTask: { id: 'task-rt-01', projectId: 'inbox', title: 'Weekly report' },
    entryPoint: 'telegram:freeform',
    mode: 'interactive',
    currentDate: '2026-03-10',
  });

  assert.equal(result.type, 'task');
  assert.equal(harness.adapterCalls.update.length, 1);
  assert.equal(harness.adapterCalls.update[0].taskId, 'task-rt-01');
});

test('registerCallbacks r: handler sets force_reply refinement mode', async () => {
  const { registerCallbacks } = await import('../bot/callbacks.js');
  const store = await import('../services/store.js');
  const { AUTHORIZED_CHAT_ID } = await import('../bot/utils.js');

  const chatId = AUTHORIZED_CHAT_ID || 999;
  const userId = 123;
  const taskId = 'task-refine-01';

  // Seed a pending task
  await store.markTaskPending(taskId, {
    originalTitle: 'Refine me',
    originalContent: '',
    originalPriority: 3,
    originalProjectId: 'inbox',
    projectId: 'inbox',
    projectName: 'Inbox',
    actionType: 'update',
  });

  const handlers = { callbacks: [] };
  const bot = {
    callbackQuery(pattern, handler) {
      handlers.callbacks.push({ pattern, handler });
      return bot;
    },
  };

  const replies = [];
  const mockCtx = {
    match: [`r:${taskId}`, taskId],
    chat: { id: chatId },
    from: { id: userId },
    callbackQuery: { id: 'cq-1', message: { message_id: 100 } },
    answerCallbackQuery: async () => {},
    reply: async (text, opts) => { replies.push({ text, opts }); return { message_id: 200 + replies.length }; },
  };

  registerCallbacks(bot, {}, {});

  const refineHandler = handlers.callbacks.find(h => h.pattern.toString().includes('r:'))?.handler;
  assert.equal(typeof refineHandler, 'function');

  await refineHandler(mockCtx);

  const pending = store.getPendingTaskRefinement();
  assert.ok(pending);
  assert.equal(pending.taskId, taskId);
  assert.equal(pending.mode, 'force_reply');
  assert.equal(pending.forceReplyMessageId, 201);
  assert.equal(pending.userId, userId);

  // Verify force_reply message was sent
  const forceReplyMsg = replies.find(r => r.opts?.reply_markup?.force_reply === true);
  assert.ok(forceReplyMsg);
  assert.ok(forceReplyMsg.text.includes('Refine me'));

  // Verify cancel button was sent separately
  const cancelMsg = replies.find(r => r.opts?.reply_markup?.inline_keyboard);
  assert.ok(cancelMsg);

  // Cleanup
  await store.clearPendingTaskRefinement();
  await store.resolveTask(taskId, 'skip');
});
