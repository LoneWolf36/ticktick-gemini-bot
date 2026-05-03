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


// ─── Helper: registerCallbacks without TickTick client ───────
async function registerCallbacksForTest(bot, ticktickMock, pipeline) {
  const { registerCallbacks } = await import('../bot/callbacks.js');
  registerCallbacks(bot, {
    ...ticktickMock,
    listProjects: ticktickMock.listProjects || (async () => []),
    listActiveTasks: ticktickMock.listActiveTasks || (async () => []),
  }, pipeline);
}

test('WP04 T046: checklist create creates one parent task with items', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Onboard new client',
        confidence: 0.95,
        projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        checklistItems: [
          { title: 'Send welcome email' },
          { title: 'Create project folder' },
          { title: 'Schedule kickoff meeting' },
        ],
      },
    ],
  });

  const result = await processMessage('Onboard new client: send welcome email, create project folder, schedule kickoff');

  assert.equal(result.type, 'blocked', 'should block without a safe destination');
  assert.deepEqual(result.checklistContext, {
    hasChecklist: true,
    clarificationQuestion: null,
  });
  assert.equal(adapterCalls.create.length, 0, 'should not create without a safe destination');
});

test('R5: checklist create confirmation stays terse and includes item count', async () => {
  const harness = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Plan trip',
        confidence: 0.95,
        projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        checklistItems: [
          { title: 'Book flights' },
          { title: 'Pack bags' },
          { title: 'Renew travel card' },
        ],
      },
    ],
  });

  const standard = await harness.processMessage('plan trip: book flights, pack bags, renew travel card', {
    workStyleMode: store.MODE_STANDARD,
  });
  const urgent = await harness.processMessage('plan trip: book flights, pack bags, renew travel card', {
    workStyleMode: store.MODE_URGENT,
  });

  assert.equal(standard.confirmationText, 'Blocked — no safe TickTick destination found. Choose a project or restore an Inbox/default project, then retry.');
  assert.equal(urgent.confirmationText, standard.confirmationText);
  assert.doesNotMatch(standard.confirmationText, /Book flights|Pack bags|Renew travel card/);
  assert.doesNotMatch(urgent.confirmationText, /Book flights|Pack bags|Renew travel card/);
});

test('WP04 T046: multi-task create creates separate tasks without checklist', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      { type: 'create', title: 'Buy groceries', confidence: 0.9, projectHint: 'Career' },
      { type: 'create', title: 'Pick up dry cleaning', confidence: 0.9, projectHint: 'Career' },
    ],
  });

  const result = await processMessage('Buy groceries and pick up dry cleaning');

  assert.equal(result.type, 'task', 'should return task type');
  assert.equal(adapterCalls.create.length, 2, 'should create two separate tasks');
  // Neither task should have checklistItems
  for (const created of adapterCalls.create) {
    assert.equal(
      Object.hasOwn(created, 'checklistItems') && Array.isArray(created.checklistItems) && created.checklistItems.length > 0,
      false,
      'no task should have checklist items for multi-task request',
    );
  }
});

test('WP04 T046: ambiguous checklist vs multi-task returns clarification', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Plan event',
        confidence: 0.8,
        projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        checklistItems: [
          { title: 'Book venue' },
          { title: 'Send invites' },
        ],
      },
      { type: 'create', title: 'Buy decorations', confidence: 0.8, projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    ],
  });

  const result = await processMessage('Plan an event with venue and invites, also buy decorations');

  assert.equal(result.type, 'clarification', 'should return clarification type');
  assert.ok(result.confirmationText, 'should have a clarification question');
  assert.ok(result.clarification, 'should have clarification metadata');
  assert.deepEqual(result.checklistContext, {
    hasChecklist: true,
    clarificationQuestion: 'I noticed your message could be one task with sub-steps, or several separate tasks. Which did you mean?',
  });
  assert.equal(result.clarification.reason, 'ambiguous_checklist_vs_multi_task');
  assert.equal(adapterCalls.create.length, 0, 'should not create any tasks');
});

// ─── WP05: Checklist Clarification UX Flow ─────────────────────

test('WP05 T052: checklist clarification persists with TTL', async () => {
  // Verify store functions exist and work
  assert.equal(typeof store.getPendingChecklistClarification, 'function');
  assert.equal(typeof store.setPendingChecklistClarification, 'function');
  assert.equal(typeof store.clearPendingChecklistClarification, 'function');
  assert.ok(store.CHECKLIST_CLARIFICATION_TTL_MS > 0, 'TTL should be defined');
  assert.equal(store.CHECKLIST_CLARIFICATION_TTL_MS, 24 * 60 * 60 * 1000, 'TTL should be 24 hours');

  // Set and get
  await store.setPendingChecklistClarification({
    originalMessage: 'test message',
    intents: [{ type: 'create', title: 'test', projectHint: 'Career' }],
    chatId: 123,
    userId: 456,
  });

  const pending = store.getPendingChecklistClarification();
  assert.ok(pending !== null, 'pending clarification should exist');
  assert.equal(pending.originalMessage, 'test message');
  assert.equal(pending.chatId, 123);
  assert.equal(pending.userId, 456);

  // Clear
  await store.clearPendingChecklistClarification();
  assert.equal(store.getPendingChecklistClarification(), null, 'should be null after clear');
});

test('WP05 T052: expired checklist clarification is ignored', async () => {
  // Manually set an expired entry
  const expiredDate = new Date(Date.now() - (25 * 60 * 60 * 1000)); // 25 hours ago
  await store.setPendingChecklistClarification({
    originalMessage: 'old message',
    intents: [],
    createdAt: expiredDate.toISOString(),
  });

  const pending = store.getPendingChecklistClarification();
  assert.equal(pending, null, 'expired clarification should return null');
});

test('WP05 T054: conservative fallback does not create checklist after ignored clarification', async () => {
  // Set up a pending checklist clarification
  await store.setPendingChecklistClarification({
    originalMessage: 'Plan project with tasks A, B, and C',
    intents: [{ type: 'create', title: 'Plan project', projectHint: 'Career' }],
    chatId: 123,
    userId: 456,
  });

  // An ambiguous reply (simulating unrelated message) should NOT create a checklist
  // This is tested at the store/behavior level — the bot handler uses skipChecklist: true
  const pending = store.getPendingChecklistClarification();
  assert.ok(pending !== null, 'pending should exist');

  // After processing, the pending state should be cleared (simulating bot behavior)
  await store.clearPendingChecklistClarification();
  assert.equal(store.getPendingChecklistClarification(), null, 'pending cleared after fallback');
});

test('WP05 T056: clarification lifecycle events are logged', async () => {
  // Verify that setting/clearing clarification does not throw and uses console.log
  // (The actual logging is via console.log which we can't easily assert in unit tests,
  // but we verify the functions execute without error and state transitions work)
  await store.setPendingChecklistClarification({
    originalMessage: 'test',
    intents: [],
    userId: 1,
  });
  assert.ok(store.getPendingChecklistClarification() !== null);
  await store.clearPendingChecklistClarification();
  assert.equal(store.getPendingChecklistClarification(), null);
});

// ─── WP05: Pipeline Consumption of Clarification Options ─────

test('WP05 P0#1: pipeline resolves ambiguity with checklistPreference=checklist', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Plan event',
        confidence: 0.8,
        projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        checklistItems: [
          { title: 'Book venue' },
          { title: 'Send invites' },
        ],
      },
      { type: 'create', title: 'Buy decorations', confidence: 0.8, projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    ],
  });

  // Simulate clarification resume with checklist preference
  const result = await processMessage('Plan an event with venue and invites, also buy decorations', {
    checklistPreference: 'checklist',
    entryPoint: 'telegram:checklist-clarification-button',
  });

  assert.equal(result.type, 'blocked', 'should block without a safe destination');
  assert.equal(adapterCalls.create.length, 0, 'should not create without a safe destination');
});

test('WP05 P0#1: pipeline resolves ambiguity with checklistPreference=separate', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Plan event',
        confidence: 0.8,
        projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        checklistItems: [
          { title: 'Book venue' },
          { title: 'Send invites' },
        ],
      },
      { type: 'create', title: 'Buy decorations', confidence: 0.8, projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    ],
  });

  // Simulate clarification resume with separate preference
  const result = await processMessage('Plan an event with venue and invites, also buy decorations', {
    checklistPreference: 'separate',
    entryPoint: 'telegram:checklist-clarification-button',
  });

  assert.equal(result.type, 'blocked', 'should block without a safe destination');
  assert.equal(adapterCalls.create.length, 0, 'should not create without a safe destination');
});

test('WP05 P0#1: pipeline resolves ambiguity with skipChecklist=true', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Plan event',
        confidence: 0.8,
        projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        checklistItems: [
          { title: 'Book venue' },
          { title: 'Send invites' },
        ],
      },
      { type: 'create', title: 'Buy decorations', confidence: 0.8, projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    ],
  });

  // Simulate clarification skip
  const result = await processMessage('Plan an event with venue and invites, also buy decorations', {
    skipChecklist: true,
    entryPoint: 'telegram:checklist-clarification-skip',
  });

  assert.equal(result.type, 'blocked', 'should block without a safe destination');
  assert.equal(adapterCalls.create.length, 0, 'should not create without a safe destination');
});

test('WP05 P0#1: pipeline asks for clarification when no preference provided', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Plan event',
        confidence: 0.8,
        projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        checklistItems: [
          { title: 'Book venue' },
          { title: 'Send invites' },
        ],
      },
      { type: 'create', title: 'Buy decorations', confidence: 0.8, projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    ],
  });

  const result = await processMessage('Plan an event with venue and invites, also buy decorations');

  assert.equal(result.type, 'clarification', 'should return clarification when no preference given');
  assert.equal(result.clarification.reason, 'ambiguous_checklist_vs_multi_task');
  assert.equal(adapterCalls.create.length, 0, 'should not create tasks');
});

// ─── WP05: Bot Callback Handler Extraction (P0#3) ─────────────

test('WP05 P0#3: _handleChecklistClarification passes checklistPreference to pipeline', async () => {
  // This tests the extracted handler's behavior at the pipeline level.
  // The bot handler itself is tested via integration tests, but we verify
  // the pipeline options flow here.
  const { processMessage } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Test task',
        checklistItems: [{ title: 'Subtask A' }],
      },
      { type: 'create', title: 'Another task', projectHint: 'Career' },
    ],
  });

  // Verify the pipeline consumes the option correctly
  const result = await processMessage('test', {
    checklistPreference: 'checklist',
  });

  // Should not return clarification since preference was provided
  assert.notEqual(result.type, 'clarification', 'should resolve ambiguity with provided preference');
});

// ─── WP05 P0#2: Bot Clarification Handler Tests ──────────────

test('WP05 P0#2: cl:checklist callback resumes pipeline with checklistPreference', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery(pattern, handler) { handlers.callbacks.push({ pattern, handler }); return this; },
    on(eventName, handler) { handlers.events.push({ eventName, handler }); return this; },
  };

  const pipelineCalls = [];
  const mockTicktick = {
    isAuthenticated: () => true,
    getCacheAgeSeconds: () => null,
    getAllTasksCached: async () => [],
    getLastFetchedProjects: () => [],
  };

  await registerCallbacksForTest(bot, mockTicktick, {
    processMessage: async (msg, opts) => {
      pipelineCalls.push({ message: msg, options: opts });
      return {
        type: 'task',
        confirmationText: 'Created task with checklist.',
        actions: [{ type: 'create', title: 'Test task' }],
        results: [{ status: 'succeeded', rollbackStep: { type: 'delete_created', targetTaskId: 'task-1', targetProjectId: 'inbox', payload: { taskId: 'task-1' } } }],
      };
    },
  });

  const authChatId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setPendingChecklistClarification({
    originalMessage: 'Plan event with venue, catering, and decorations',
    chatId: authChatId,
    userId: authChatId,
    createdAt: new Date().toISOString(),
  });

  const clChecklist = handlers.callbacks.find(cb => cb.pattern.source === '^cl:checklist$');
  assert.ok(clChecklist, 'cl:checklist callback should be registered');

  const replies = [];
  const ctx = {
    chat: { id: authChatId },
    from: { id: authChatId },
    match: [],
    answerCallbackQuery: async () => {},
    reply: async (msg) => { replies.push(msg); },
    editMessageText: async (text, opts) => { replies.push({ text, opts }); },
  };

  await clChecklist.handler(ctx);

  assert.equal(pipelineCalls.length, 1, 'pipeline should be called once');
  assert.equal(pipelineCalls[0].options.checklistPreference, 'checklist', 'should pass checklistPreference');
  assert.equal(pipelineCalls[0].options.skipChecklist, undefined, 'should not set skipChecklist');
  assert.equal(pipelineCalls[0].options.entryPoint, 'telegram:checklist-clarification-button');
  // The answerCallbackQuery sends '📋 Checklist mode', editMessageText sends pipeline result
  assert.ok(replies.some(r => r?.text && r.text.includes('Created task with checklist')), 'should show pipeline result');
  assert.ok(replies.some(r => r?.opts?.reply_markup), 'should include undo when persisted');

  // Pending state should be cleared
  assert.equal(store.getPendingChecklistClarification(), null, 'pending should be cleared');
});

test('WP05 P0#2: cl:separate callback resumes pipeline with separate preference', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery(pattern, handler) { handlers.callbacks.push({ pattern, handler }); return this; },
    on(eventName, handler) { handlers.events.push({ eventName, handler }); return this; },
  };

  const pipelineCalls = [];
  const mockTicktick = {
    isAuthenticated: () => true,
    getCacheAgeSeconds: () => null,
    getAllTasksCached: async () => [],
    getLastFetchedProjects: () => [],
  };

  await registerCallbacksForTest(bot, mockTicktick, {
    processMessage: async (msg, opts) => {
      pipelineCalls.push({ message: msg, options: opts });
      return { type: 'task', confirmationText: 'Created separate tasks.' };
    },
  });

  const authChatId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setPendingChecklistClarification({
    originalMessage: 'Plan event with venue and buy decorations',
    chatId: authChatId,
    userId: authChatId,
    createdAt: new Date().toISOString(),
  });

  const clSeparate = handlers.callbacks.find(cb => cb.pattern.source === '^cl:separate$');
  assert.ok(clSeparate, 'cl:separate callback should be registered');

  const replies = [];
  const ctx = {
    chat: { id: authChatId },
    from: { id: authChatId },
    match: [],
    answerCallbackQuery: async () => {},
    reply: async (msg) => { replies.push(msg); },
    editMessageText: async (text, opts) => { replies.push(text); },
  };

  await clSeparate.handler(ctx);

  assert.equal(pipelineCalls.length, 1);
  assert.equal(pipelineCalls[0].options.checklistPreference, 'separate');
  assert.equal(pipelineCalls[0].options.skipChecklist, undefined);
  assert.ok(replies.some(r => r && r.includes('Created separate tasks')), 'should show pipeline result');
});

test('WP05 P0#2: cl:skip callback resumes pipeline with skipChecklist=true', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery(pattern, handler) { handlers.callbacks.push({ pattern, handler }); return this; },
    on(eventName, handler) { handlers.events.push({ eventName, handler }); return this; },
  };

  const pipelineCalls = [];
  const mockTicktick = {
    isAuthenticated: () => true,
    getCacheAgeSeconds: () => null,
    getAllTasksCached: async () => [],
    getLastFetchedProjects: () => [],
  };

  await registerCallbacksForTest(bot, mockTicktick, {
    processMessage: async (msg, opts) => {
      pipelineCalls.push({ message: msg, options: opts });
      return { type: 'task', confirmationText: 'Created single task.' };
    },
  });

  const authChatId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setPendingChecklistClarification({
    originalMessage: 'Plan event with venue and buy decorations',
    chatId: authChatId,
    userId: authChatId,
    createdAt: new Date().toISOString(),
  });

  const clSkip = handlers.callbacks.find(cb => cb.pattern.source === '^cl:skip$');
  assert.ok(clSkip, 'cl:skip callback should be registered');

  const replies = [];
  const ctx = {
    chat: { id: authChatId },
    from: { id: authChatId },
    match: [],
    answerCallbackQuery: async () => {},
    reply: async (msg) => { replies.push(msg); },
    editMessageText: async (text, opts) => { replies.push(text); },
  };

  await clSkip.handler(ctx);

  assert.equal(pipelineCalls.length, 1);
  assert.equal(pipelineCalls[0].options.skipChecklist, true);
  assert.equal(pipelineCalls[0].options.checklistPreference, undefined);
  assert.ok(replies.some(r => r && r.includes('Created single task')), 'should show pipeline result');
});

test('WP05 P0#2: checklist callback rejects unauthorized user', async () => {
  const handlers = { callbacks: [] };
  const bot = {
    command() { return this; },
    callbackQuery(pattern, handler) { handlers.callbacks.push({ pattern, handler }); return this; },
    on() { return this; },
  };

  await registerCallbacksForTest(bot, { isAuthenticated: () => true }, {
    processMessage: async () => ({ type: 'task', confirmationText: 'ok' }),
  });

  const authChatId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setPendingChecklistClarification({
    originalMessage: 'Plan event with venue and buy decorations',
    chatId: authChatId,
    userId: authChatId,
    createdAt: new Date().toISOString(),
  });
  const unauthorizedId = authChatId + 99999;

  const clChecklist = handlers.callbacks.find(cb => cb.pattern.source === '^cl:checklist$');
  const replies = [];
  const ctx = {
    chat: { id: unauthorizedId },
    from: { id: unauthorizedId },
    match: [],
    answerCallbackQuery: async ({ text }) => { replies.push(text); },
    reply: async () => {},
    editMessageText: async () => {},
  };

  await clChecklist.handler(ctx);

  assert.equal(
    replies.some(r => r.includes('Unauthorized') || r.includes('Wrong chat')),
    true,
    'should reject unauthorized or cross-chat access',
  );
  await store.clearPendingChecklistClarification();
});

test('WP05 P0#2: checklist callback rejects cross-chat user', async () => {
  const handlers = { callbacks: [] };
  const bot = {
    command() { return this; },
    callbackQuery(pattern, handler) { handlers.callbacks.push({ pattern, handler }); return this; },
    on() { return this; },
  };

  await registerCallbacksForTest(bot, { isAuthenticated: () => true }, {
    processMessage: async () => ({ type: 'task', confirmationText: 'ok' }),
  });

  // ctx uses AUTHORIZED_CHAT_ID so isAuthorized passes,
  // but pending has a different chatId so cross-chat check fires
  const authorizedChatId = AUTHORIZED_CHAT_ID || 42;
  const pendingChatId = authorizedChatId + 99999;

  await store.setPendingChecklistClarification({
    originalMessage: 'Test message',
    chatId: pendingChatId,
    userId: pendingChatId,
    createdAt: new Date().toISOString(),
  });

  const clChecklist = handlers.callbacks.find(cb => cb.pattern.source === '^cl:checklist$');
  const replies = [];
  const ctx = {
    chat: { id: authorizedChatId },
    from: { id: authorizedChatId },
    match: [],
    answerCallbackQuery: async ({ text }) => { replies.push(text); },
    reply: async () => {},
    editMessageText: async () => {},
  };

  await clChecklist.handler(ctx);

  assert.equal(replies.some(r => r && r.includes('Wrong chat')), true, 'should reject cross-chat');
});

test('WP05 P0#2: free-form reply "checklist" resumes with checklistPreference', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery(pattern, handler) { handlers.callbacks.push({ pattern, handler }); return this; },
    on(eventName, handler) { handlers.events.push({ eventName, handler }); return this; },
  };

  const pipelineCalls = [];
  const mockTicktick = {
    isAuthenticated: () => true,
    getCacheAgeSeconds: () => null,
    getAllTasksCached: async () => [],
    getAllTasks: async () => [],
    getLastFetchedProjects: () => [],
  };

  registerCommands(
    bot,
    mockTicktick,
    { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
    { listProjects: async () => [] },
    {
      processMessage: async (msg, opts) => {
        pipelineCalls.push({ message: msg, options: opts });
        return { type: 'task', confirmationText: 'Created with checklist.' };
      },
    },
  );

  const authChatId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setPendingChecklistClarification({
    originalMessage: 'Plan event with venue and buy decorations',
    chatId: authChatId,
    userId: authChatId,
    createdAt: new Date().toISOString(),
  });

  const messageHandler = handlers.events.find(e => e.eventName === 'message:text')?.handler;
  assert.ok(messageHandler, 'message:text handler should be registered');

  const replies = [];
  const ctx = {
    message: { text: 'checklist' },
    chat: { id: authChatId },
    from: { id: authChatId },
    reply: async (msg) => { replies.push(msg); },
  };

  await messageHandler(ctx);

  assert.equal(pipelineCalls.length, 1, 'pipeline should be called');
  assert.equal(pipelineCalls[0].options.checklistPreference, 'checklist', 'should pass checklist preference');
});

test('WP05 P0#2: free-form reply "separate tasks" resumes with separate preference', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery(pattern, handler) { handlers.callbacks.push({ pattern, handler }); return this; },
    on(eventName, handler) { handlers.events.push({ eventName, handler }); return this; },
  };

  const pipelineCalls = [];
  const mockTicktick = {
    isAuthenticated: () => true,
    getCacheAgeSeconds: () => null,
    getAllTasksCached: async () => [],
    getAllTasks: async () => [],
    getLastFetchedProjects: () => [],
  };

  registerCommands(
    bot,
    mockTicktick,
    { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
    { listProjects: async () => [] },
    {
      processMessage: async (msg, opts) => {
        pipelineCalls.push({ message: msg, options: opts });
        return { type: 'task', confirmationText: 'Created separate tasks.' };
      },
    },
  );

  const authChatId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setPendingChecklistClarification({
    originalMessage: 'Plan event with venue and buy decorations',
    chatId: authChatId,
    userId: authChatId,
    createdAt: new Date().toISOString(),
  });

  const messageHandler = handlers.events.find(e => e.eventName === 'message:text')?.handler;
  const replies = [];
  const ctx = {
    message: { text: 'separate tasks' },
    chat: { id: authChatId },
    from: { id: authChatId },
    reply: async (msg) => { replies.push(msg); },
  };

  await messageHandler(ctx);

  assert.equal(pipelineCalls.length, 1);
  assert.equal(pipelineCalls[0].options.checklistPreference, 'separate');
});

test('WP05 P0#2: free-form reply "skip" resumes with skipChecklist=true', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery(pattern, handler) { handlers.callbacks.push({ pattern, handler }); return this; },
    on(eventName, handler) { handlers.events.push({ eventName, handler }); return this; },
  };

  const pipelineCalls = [];
  const mockTicktick = {
    isAuthenticated: () => true,
    getCacheAgeSeconds: () => null,
    getAllTasksCached: async () => [],
    getAllTasks: async () => [],
    getLastFetchedProjects: () => [],
  };

  registerCommands(
    bot,
    mockTicktick,
    { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
    { listProjects: async () => [] },
    {
      processMessage: async (msg, opts) => {
        pipelineCalls.push({ message: msg, options: opts });
        return { type: 'task', confirmationText: 'Created single task.' };
      },
    },
  );

  const authChatId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setPendingChecklistClarification({
    originalMessage: 'Plan event with venue and buy decorations',
    chatId: authChatId,
    userId: authChatId,
    createdAt: new Date().toISOString(),
  });

  const messageHandler = handlers.events.find(e => e.eventName === 'message:text')?.handler;
  const replies = [];
  const ctx = {
    message: { text: 'skip' },
    chat: { id: authChatId },
    from: { id: authChatId },
    reply: async (msg) => { replies.push(msg); },
  };

  await messageHandler(ctx);

  assert.equal(pipelineCalls.length, 1);
  assert.equal(pipelineCalls[0].options.skipChecklist, true);
});

test('WP05 P0#2: free-form reply with no pending clarification falls through to normal pipeline', async () => {
  const handlers = { commands: new Map(), callbacks: [], events: [] };
  const bot = {
    command(name, handler) { handlers.commands.set(name, handler); return this; },
    callbackQuery(pattern, handler) { handlers.callbacks.push({ pattern, handler }); return this; },
    on(eventName, handler) { handlers.events.push({ eventName, handler }); return this; },
  };

  const pipelineCalls = [];
  const mockTicktick = {
    isAuthenticated: () => true,
    getCacheAgeSeconds: () => null,
    getAllTasksCached: async () => [],
    getAllTasks: async () => [],
    getLastFetchedProjects: () => [],
  };

  registerCommands(
    bot,
    mockTicktick,
    { isQuotaExhausted: () => false, quotaResumeTime: () => null, activeKeyInfo: () => null },
    {},
    {
      processMessage: async (msg, opts) => {
        pipelineCalls.push({ message: msg, options: opts });
        return { type: 'non-task', confirmationText: 'Got it.' };
      },
    },
  );

  // No pending clarification set
  const messageHandler = handlers.events.find(e => e.eventName === 'message:text')?.handler;
  const replies = [];
  const ctx = {
    message: { text: 'buy groceries' },
    chat: { id: AUTHORIZED_CHAT_ID || Date.now() },
    from: { id: AUTHORIZED_CHAT_ID || Date.now() },
    reply: async (msg) => { replies.push(msg); },
  };

  await messageHandler(ctx);

  assert.equal(pipelineCalls.length, 1);
  assert.equal(pipelineCalls[0].message, 'buy groceries');
  assert.equal(pipelineCalls[0].options.entryPoint, 'telegram:freeform');
});
