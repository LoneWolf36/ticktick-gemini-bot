import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AxGen } from '@ax-llm/ax';

import { appendUrgentModeReminder, parseTelegramMarkdownToHTML } from '../bot/utils.js';
import { executeActions, registerCommands } from '../bot/commands.js';
import { GeminiAnalyzer, buildUrgentModePromptNote } from '../services/gemini.js';
import { createAxIntent, detectUrgentModeIntent, QuotaExhaustedError } from '../services/ax-intent.js';
import { createPipeline } from '../services/pipeline.js';
import { createPipelineObservability } from '../services/pipeline-observability.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import * as store from '../services/store.js';
import * as executionPrioritization from '../services/execution-prioritization.js';
import {
  BRIEFING_SUMMARY_SECTION_KEYS,
  WEEKLY_SUMMARY_SECTION_KEYS,
  composeBriefingSummary,
  composeWeeklySummary,
  formatSummary,
  normalizeWeeklyWatchouts,
} from '../services/summary-surfaces/index.js';
import { createPipelineHarness, DEFAULT_PROJECTS } from './pipeline-harness.js';
import {
  buildRankingContext,
  buildRecommendationResult,
  createGoalThemeProfile,
  createRankingDecision,
  normalizePriorityCandidate,
} from '../services/execution-prioritization.js';

function rankPriorityCandidatesForTest(candidates, context) {
  assert.equal(typeof executionPrioritization.rankPriorityCandidates, 'function');

  try {
    return executionPrioritization.rankPriorityCandidates(candidates, context);
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
  }

  return executionPrioritization.rankPriorityCandidates({ candidates, context });
}

function buildSummaryActiveTasksFixture({ variant = 'normal' } = {}) {
  const base = [
    {
      id: 'task-focus',
      title: 'Ship weekly architecture PR',
      projectId: 'career',
      projectName: 'Career',
      priority: 5,
      dueDate: '2026-03-12',
      status: 0,
    },
    {
      id: 'task-support',
      title: 'Prepare system design notes',
      projectId: 'career',
      projectName: 'Career',
      priority: 3,
      dueDate: '2026-03-14',
      status: 0,
    },
    {
      id: 'task-admin',
      title: 'Pay rent',
      projectId: 'admin',
      projectName: 'Admin',
      priority: 1,
      dueDate: '2026-03-10',
      status: 0,
    },
  ];

  if (variant === 'sparse') {
    return [base[0]];
  }

  if (variant === 'degraded-ranking') {
    return base.map((task) => ({ ...task, priority: 0 }));
  }

  return base;
}

function buildSummaryProcessedHistoryFixture({ variant = 'normal' } = {}) {
  const base = [
    {
      taskId: 'hist-1',
      originalTitle: 'Completed resume update',
      approved: true,
      skipped: false,
      dropped: false,
      reviewedAt: '2026-03-11T09:00:00Z',
      sentAt: '2026-03-11T09:05:00Z',
      suggestedPriority: 5,
      priorityEmoji: '🔴',
    },
    {
      taskId: 'hist-2',
      originalTitle: 'Deferred mock interview',
      approved: false,
      skipped: true,
      dropped: false,
      reviewedAt: '2026-03-11T09:10:00Z',
      sentAt: '2026-03-11T09:15:00Z',
      suggestedPriority: 3,
      priorityEmoji: '🟡',
    },
  ];

  if (variant === 'sparse') {
    return [base[0]];
  }

  if (variant === 'missing') {
    return [];
  }

  return base;
}

function buildSummaryResolvedStateFixture({ urgentMode = false, entryPoint = 'manual_command' } = {}) {
  return {
    kind: 'briefing',
    entryPoint,
    userId: 'summary-fixture-user',
    generatedAtIso: '2026-03-13T08:30:00Z',
    timezone: 'Europe/Dublin',
    urgentMode,
    tonePolicy: 'preserve_existing',
  };
}

function buildSummaryRankingFixture(activeTasks, { degraded = false } = {}) {
  const ranked = activeTasks.slice(0, 3).map((task, index) => ({
    taskId: task.id,
    rationaleCode: index === 0 ? 'goal_alignment' : 'urgency',
    rationaleText: index === 0
      ? 'Directly moves the highest-priority goal.'
      : 'Time-bound execution window is closing.',
  }));

  return {
    ranked,
    topRecommendation: ranked[0] || null,
    degraded,
    degradedReason: degraded ? 'ranking inputs incomplete' : null,
    context: {
      urgentMode: false,
      workStyleMode: 'humane',
      stateSource: 'fixture',
    },
  };
}

function buildDailySummaryFixture({ variant = 'normal' } = {}) {
  if (variant === 'empty') {
    return {
      focus: '',
      priorities: [],
      why_now: [],
      start_now: '',
      notices: [],
    };
  }

  return {
    focus: 'Ship the architecture PR before lower-leverage tasks.',
    priorities: [
      {
        title: 'Ship weekly architecture PR',
        rationale_text: 'Directly moves the highest-priority goal.',
      },
      {
        title: 'Prepare system design notes',
        rationale_text: 'Interview rehearsal window is closing.',
      },
    ],
    why_now: [
      'Deadline is close.',
      'Unblocks review feedback.',
    ],
    start_now: 'Open the PR and list required changes.',
    notices: [
      { severity: 'info', message: 'Task list is sparse, so focus is tight.' },
      { severity: 'warning', message: 'Ranking inputs were incomplete.' },
    ],
  };
}

function buildWeeklySummaryFixture({ variant = 'normal' } = {}) {
  if (variant === 'reduced') {
    return {
      progress: [],
      carry_forward: [],
      next_focus: [],
      watchouts: [],
      notices: [
        { severity: 'warning', message: 'Processed-task history was unavailable.' },
      ],
    };
  }

  return {
    progress: [
      'Completed architecture PR draft.',
      'Closed the interview prep loop.',
    ],
    carry_forward: [
      { title: 'Finalize system design notes', reason: 'Needs explicit completion next week.' },
    ],
    next_focus: [
      'Ship weekly architecture PR',
      'Practice system design questions',
    ],
    watchouts: [
      { label: 'Overdue tasks accumulating', evidence: '2 active tasks are overdue right now.' },
    ],
    notices: [
      { severity: 'info', message: 'Active task set is sparse, so weekly recommendations are compact.' },
    ],
  };
}

test('summary fixtures expose deterministic normal sparse and degraded inputs', () => {
  const normalTasks = buildSummaryActiveTasksFixture();
  const sparseTasks = buildSummaryActiveTasksFixture({ variant: 'sparse' });
  const degradedTasks = buildSummaryActiveTasksFixture({ variant: 'degraded-ranking' });
  const normalHistory = buildSummaryProcessedHistoryFixture();
  const sparseHistory = buildSummaryProcessedHistoryFixture({ variant: 'sparse' });
  const missingHistory = buildSummaryProcessedHistoryFixture({ variant: 'missing' });
  const urgentState = buildSummaryResolvedStateFixture({ urgentMode: true });
  const ranking = buildSummaryRankingFixture(normalTasks, { degraded: true });

  assert.equal(normalTasks.length, 3);
  assert.equal(normalTasks[0].id, 'task-focus');
  assert.equal(sparseTasks.length, 1);
  assert.equal(degradedTasks.every((task) => task.priority === 0), true);
  assert.equal(normalHistory.length, 2);
  assert.equal(sparseHistory.length, 1);
  assert.equal(missingHistory.length, 0);
  assert.equal(urgentState.urgentMode, true);
  assert.equal(ranking.degraded, true);
  assert.equal(ranking.degradedReason, 'ranking inputs incomplete');
});

test('composeBriefingSummary always returns fixed briefing top-level sections', () => {
  const activeTasks = buildSummaryActiveTasksFixture();
  const rankingResult = buildSummaryRankingFixture(activeTasks);
  const context = buildSummaryResolvedStateFixture();
  const result = composeBriefingSummary({ context, activeTasks, rankingResult });

  assert.deepEqual(Object.keys(result.summary), BRIEFING_SUMMARY_SECTION_KEYS);
  assert.equal(Array.isArray(result.summary.priorities), true);
  assert.equal(Array.isArray(result.summary.why_now), true);
  assert.equal(Array.isArray(result.summary.notices), true);
});

test('composeBriefingSummary prefers structured model focus and priorities', () => {
  const activeTasks = buildSummaryActiveTasksFixture();
  const rankingResult = buildSummaryRankingFixture(activeTasks);
  const context = buildSummaryResolvedStateFixture();
  const modelSummary = {
    focus: 'Ship the architecture PR before low-leverage work.',
    priorities: [
      {
        task_id: activeTasks[0].id,
        title: '',
        project_name: null,
        due_date: null,
        priority_label: 'career-critical',
        rationale_text: 'Directly moves the core goal.',
      },
    ],
    why_now: ['Directly moves the core goal.'],
    start_now: 'Open the PR checklist and draft the next commit.',
    notices: [],
  };

  const result = composeBriefingSummary({
    context,
    activeTasks,
    rankingResult,
    modelSummary,
  });

  assert.equal(result.summary.focus, modelSummary.focus);
  assert.equal(result.summary.priorities[0].task_id, activeTasks[0].id);
  assert.equal(result.summary.priorities[0].title, activeTasks[0].title);
  assert.equal(result.summary.start_now, modelSummary.start_now);
});

test('composeBriefingSummary adds sparse-task notices without filler', () => {
  const activeTasks = buildSummaryActiveTasksFixture({ variant: 'sparse' });
  const rankingResult = buildSummaryRankingFixture(activeTasks);
  const context = buildSummaryResolvedStateFixture();
  const modelSummary = {
    focus: '',
    priorities: [],
    why_now: [],
    start_now: '',
    notices: [],
  };

  const result = composeBriefingSummary({
    context,
    activeTasks,
    rankingResult,
    modelSummary,
  });

  assert.equal(result.summary.priorities.length, 1);
  assert.ok(result.summary.notices.some((notice) => notice.code === 'sparse_tasks'));
});

test('composeBriefingSummary adds degraded-ranking notice when ranking is degraded', () => {
  const activeTasks = buildSummaryActiveTasksFixture();
  const rankingResult = buildSummaryRankingFixture(activeTasks, { degraded: true });
  const context = buildSummaryResolvedStateFixture();
  const modelSummary = {
    focus: 'Keep momentum on ranked work.',
    priorities: [],
    why_now: [],
    start_now: 'Open the top task and take the first step.',
    notices: [],
  };

  const result = composeBriefingSummary({
    context,
    activeTasks,
    rankingResult,
    modelSummary,
  });

  assert.ok(result.summary.notices.some((notice) => notice.code === 'degraded_ranking'));
});

test('composeWeeklySummary always returns fixed weekly top-level sections', () => {
  const activeTasks = buildSummaryActiveTasksFixture();
  const processedHistory = buildSummaryProcessedHistoryFixture();
  const rankingResult = buildSummaryRankingFixture(activeTasks);
  const context = {
    ...buildSummaryResolvedStateFixture(),
    kind: 'weekly',
  };

  const result = composeWeeklySummary({
    context,
    activeTasks,
    processedHistory,
    historyAvailable: true,
    rankingResult,
  });

  assert.deepEqual(Object.keys(result.summary), WEEKLY_SUMMARY_SECTION_KEYS);
  assert.equal(Array.isArray(result.summary.progress), true);
  assert.equal(Array.isArray(result.summary.watchouts), true);
  assert.equal(Array.isArray(result.summary.notices), true);
});

test('composeWeeklySummary uses structured model summary but keeps next_focus grounded', () => {
  const activeTasks = buildSummaryActiveTasksFixture();
  const processedHistory = buildSummaryProcessedHistoryFixture();
  const rankingResult = buildSummaryRankingFixture(activeTasks);
  const context = {
    ...buildSummaryResolvedStateFixture(),
    kind: 'weekly',
  };
  const modelSummary = {
    progress: ['Completed: Shipped weekly architecture PR'],
    carry_forward: [
      {
        task_id: 'task-support',
        title: 'Prepare system design notes',
        reason: 'Still open with planned follow-up.',
      },
    ],
    next_focus: ['Random model suggestion'],
    watchouts: [
      {
        label: 'Overdue tasks accumulating',
        evidence: '1 active task is overdue right now.',
        evidence_source: 'current_tasks',
      },
    ],
    notices: [
      {
        code: 'delivery_context',
        message: 'Model summary received.',
        severity: 'info',
        evidence_source: 'system',
      },
    ],
  };

  const result = composeWeeklySummary({
    context,
    activeTasks,
    processedHistory,
    historyAvailable: true,
    rankingResult,
    modelSummary,
  });

  assert.ok(result.summary.progress.includes('Completed: Shipped weekly architecture PR'));
  assert.equal(result.summary.next_focus.includes('Random model suggestion'), false);
  assert.equal(result.summary.next_focus[0], activeTasks[0].title);
});

test('composeWeeklySummary reduces digest and adds missing history notice when history is missing', () => {
  const activeTasks = buildSummaryActiveTasksFixture({ variant: 'sparse' });
  const processedHistory = [];
  const rankingResult = buildSummaryRankingFixture(activeTasks);
  const context = {
    ...buildSummaryResolvedStateFixture(),
    kind: 'weekly',
  };
  const modelSummary = {
    progress: ['Completed: Placeholder progress'],
    watchouts: [
      {
        label: 'Dropped tasks this week',
        evidence: '1 processed item was dropped.',
        evidence_source: 'processed_history',
      },
    ],
  };

  const result = composeWeeklySummary({
    context,
    activeTasks,
    processedHistory,
    historyAvailable: false,
    rankingResult,
    modelSummary,
  });

  assert.equal(result.summary.progress.length, 0);
  assert.ok(result.summary.carry_forward.length > 0);
  assert.ok(result.summary.next_focus.length > 0);
  assert.ok(result.summary.notices.some((notice) => notice.code === 'missing_history'));
});

test('composeWeeklySummary drops watchouts without evidence backing', () => {
  const activeTasks = buildSummaryActiveTasksFixture().map((task) => ({
    ...task,
    dueDate: '2026-03-20',
  }));
  const processedHistory = [];
  const rankingResult = buildSummaryRankingFixture(activeTasks);
  const context = {
    ...buildSummaryResolvedStateFixture(),
    kind: 'weekly',
  };
  const modelSummary = {
    watchouts: [
      {
        label: 'Dropped tasks this week',
        evidence: '1 processed item was dropped.',
        evidence_source: 'processed_history',
      },
      {
        label: 'History unavailable',
        evidence: 'Processed-task history was unavailable.',
        evidence_source: 'missing_data',
      },
    ],
  };

  const result = composeWeeklySummary({
    context,
    activeTasks,
    processedHistory,
    historyAvailable: true,
    rankingResult,
    modelSummary,
  });

  assert.equal(result.summary.watchouts.length, 0);
});

test('weekly watchout normalization rejects behavioral labels and strips prompt-era fields', () => {
  const watchouts = normalizeWeeklyWatchouts([
    {
      label: 'avoidance',
      evidence: 'A delayed critical task appears in history.',
      evidence_source: 'processed_history',
      callout: 'legacy behavioral field',
    },
    {
      label: 'Overdue tasks accumulating',
      evidence: '3 active tasks are overdue.',
      evidence_source: 'current_tasks',
      avoidance: 'legacy field should be removed',
      callout: 'legacy field should be removed',
    },
  ]);

  assert.equal(watchouts.length, 1);
  assert.equal(watchouts[0].label, 'Overdue tasks accumulating');
  assert.equal(Object.hasOwn(watchouts[0], 'avoidance'), false);
  assert.equal(Object.hasOwn(watchouts[0], 'callout'), false);
});

test('formatSummary renders daily sections with header and urgent reminder in fixed order', () => {
  const summary = buildDailySummaryFixture();
  const { text, telegramSafe, tonePreserved } = formatSummary({
    kind: 'briefing',
    summary,
    context: { urgentMode: true },
  });

  const sectionOrder = ['**Focus**', '**Priorities**', '**Why now**', '**Start now**', '**Notices**'];
  const positions = sectionOrder.map((label) => text.indexOf(label));
  const reminderMatches = text.match(/Urgent mode is currently active/gi) || [];

  assert.ok(text.includes('MORNING BRIEFING'));
  assert.ok(positions.every((pos) => pos >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.equal(reminderMatches.length, 1);
  assert.equal(telegramSafe, true);
  assert.equal(tonePreserved, true);
});

test('formatSummary renders weekly sections in fixed order and preserves watchout evidence', () => {
  const summary = buildWeeklySummaryFixture();
  const { text, telegramSafe } = formatSummary({
    kind: 'weekly',
    summary,
    context: { urgentMode: false },
  });

  const sectionOrder = ['**Progress**', '**Carry forward**', '**Next focus**', '**Watchouts**', '**Notices**'];
  const positions = sectionOrder.map((label) => text.indexOf(label));

  assert.ok(text.includes('WEEKLY ACCOUNTABILITY REVIEW'));
  assert.ok(text.includes('Overdue tasks accumulating: 2 active tasks are overdue right now.'));
  assert.ok(positions.every((pos) => pos >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.equal(telegramSafe, true);
});

test('formatSummary keeps empty sections compact and Telegram-safe', () => {
  const daily = buildDailySummaryFixture({ variant: 'empty' });
  const weekly = buildWeeklySummaryFixture({ variant: 'reduced' });
  const dailyResult = formatSummary({ kind: 'briefing', summary: daily, context: {} });
  const weeklyResult = formatSummary({ kind: 'weekly', summary: weekly, context: {} });

  assert.match(dailyResult.text, /\*\*Focus\*\*: None/);
  assert.match(dailyResult.text, /\*\*Priorities\*\*:\n1\. None/);
  assert.equal(dailyResult.text.includes('Keep momentum on your top task.'), false);
  assert.match(weeklyResult.text, /\*\*Progress\*\*:\n- None/);
  assert.match(weeklyResult.text, /\*\*Carry forward\*\*:\n- None/);
  assert.match(weeklyResult.text, /\*\*Next focus\*\*:\n1\. None/);
  assert.match(weeklyResult.text, /\*\*Watchouts\*\*:\n- None/);
  assert.match(weeklyResult.text, /\[Warning\] Processed-task history was unavailable\./);

  const dailyHtml = parseTelegramMarkdownToHTML(dailyResult.text);
  const weeklyHtml = parseTelegramMarkdownToHTML(weeklyResult.text);
  assert.match(dailyHtml, /<b>Focus<\/b>/);
  assert.match(weeklyHtml, /<b>Progress<\/b>/);
});

test('default timezone remains Europe/Dublin when USER_TIMEZONE is unset', () => {
  const source = readFileSync('bot/utils.js', 'utf8');
  assert.match(source, /USER_TIMEZONE\s*\|\|\s*'Europe\/Dublin'/);
});

test('store documents the urgent mode Redis key schema', () => {
  const source = readFileSync('services/store.js', 'utf8');
  assert.match(source, /user:\{userId\}:urgent_mode/);
});

test('store urgent mode defaults to false and persists boolean toggles', async () => {
  const store = await import('../services/store.js');
  const userId = `node-test-urgent-mode-${Date.now()}`;

  assert.equal(await store.getUrgentMode(userId), false);
  assert.equal(await store.setUrgentMode(userId, true), true);
  assert.equal(await store.getUrgentMode(userId), true);
  assert.equal(await store.setUrgentMode(userId, false), false);
  assert.equal(await store.getUrgentMode(userId), false);
});

test('ax intent detects urgent mode toggle phrases', () => {
  assert.deepEqual(detectUrgentModeIntent('turn on urgent mode'), {
    type: 'set_urgent_mode',
    value: true,
  });
  assert.deepEqual(detectUrgentModeIntent('switch back to humane mode'), {
    type: 'set_urgent_mode',
    value: false,
  });
  assert.equal(detectUrgentModeIntent('buy groceries tonight'), null);
});

test('appendUrgentModeReminder only appends reminder text when urgent mode is active', () => {
  assert.equal(appendUrgentModeReminder('Base briefing', false), 'Base briefing');
  assert.match(appendUrgentModeReminder('Base briefing', true), /Urgent mode is currently active/i);
});

test('registerCommands wires /urgent to the urgent mode store contract', async () => {
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
    {},
    {},
  );

  const urgentHandler = handlers.commands.get('urgent');
  assert.equal(typeof urgentHandler, 'function');

  const replies = [];
  const userId = Date.now();
  const ctx = {
    chat: { id: userId },
    from: { id: userId },
    match: 'on',
    reply: async (message) => {
      replies.push(message);
    },
  };

  await store.setUrgentMode(userId, false);
  await urgentHandler(ctx);

  assert.equal(await store.getUrgentMode(userId), true);
  assert.match(replies.at(-1), /Urgent mode activated/i);
});

test('registerCommands allows free-form urgent toggles before TickTick auth', async () => {
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
  const userId = `node-test-freeform-urgent-${Date.now()}`;
  await store.setUrgentMode(userId, false);

  await messageHandler({
    message: { text: 'turn on urgent mode' },
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.equal(await store.getUrgentMode(userId), true);
  assert.match(replies.at(-1), /Urgent mode activated/i);
  assert.equal(replies.some((message) => /TickTick not connected yet/i.test(message)), false);
});

test('registerCommands adds the urgent reminder to manual briefing surfaces when urgent mode is active', async () => {
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
      generateDailyBriefing: async () => 'Plan for today',
      generateWeeklyDigest: async () => 'Weekly summary',
      generateReorgProposal: async () => ({ summary: '', actions: [], questions: [] }),
    },
    {},
    {},
  );

  const briefingHandler = handlers.commands.get('briefing');
  assert.equal(typeof briefingHandler, 'function');

  const replies = [];
  const userId = Date.now();
  await store.setUrgentMode(userId, true);
  await briefingHandler({
    chat: { id: userId },
    from: { id: userId },
    reply: async (message) => {
      replies.push(message);
    },
  });

  assert.ok(replies.some((message) => typeof message === 'string' && message.includes('Urgent mode is currently active.')));
});

test('TickTickAdapter includes the existing projectId when updating only a due date', async () => {
  let updatePayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-1',
    projectId: 'project-1',
    content: '',
    priority: 0,
    status: 0,
  });
  client.updateTask = async (_taskId, payload) => {
    updatePayload = payload;
    return { id: 'task-1', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.updateTask('task-1', {
    originalProjectId: 'project-1',
    dueDate: '2026-03-11T09:30:00.000+0000',
  });

  assert.equal(updatePayload.projectId, 'project-1');
  assert.equal(updatePayload.dueDate, '2026-03-11T09:30:00.000+0000');
  assert.equal(Object.hasOwn(updatePayload, 'originalProjectId'), false);
});

test('pipeline retries once and rolls back earlier successful writes', async () => {
  const adapterCalls = [];
  const telemetryEvents = [];
  const adapter = {
    listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
    getTaskSnapshot: async (taskId, projectId) => ({
      id: taskId,
      projectId,
      title: 'Existing task',
      content: null,
      priority: 0,
      dueDate: null,
      repeatFlag: null,
      status: 0,
    }),
    createTask: async (action) => {
      adapterCalls.push(['createTask', action.title]);
      return { id: 'created-1', projectId: action.projectId };
    },
    updateTask: async () => {
      adapterCalls.push(['updateTask']);
      throw new Error('TickTick unavailable');
    },
    deleteTask: async (taskId, projectId) => {
      adapterCalls.push(['deleteTask', taskId, projectId]);
      return { deleted: true, taskId, projectId };
    },
    restoreTask: async () => {
      throw new Error('restoreTask should not be called in this scenario');
    },
    completeTask: async () => {
      throw new Error('completeTask should not be called in this scenario');
    },
  };

  const pipeline = createPipeline({
    axIntent: {
      extractIntents: async () => [{ type: 'create' }, { type: 'update' }],
    },
    normalizer: {
      normalizeActions: () => ([
        { type: 'create', title: 'Draft proposal', projectId: 'inbox', valid: true, validationErrors: [] },
        { type: 'update', taskId: 'task-2', originalProjectId: 'inbox', projectId: 'inbox', title: 'Existing task', valid: true, validationErrors: [] },
      ]),
    },
    adapter,
    observability: createPipelineObservability({
      eventSink: async (event) => {
        telemetryEvents.push(event);
      },
      logger: null,
    }),
  });

  const result = await pipeline.processMessage('Draft proposal and update the follow-up', {
    requestId: 'req-rollback-success',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'adapter');
  assert.equal(result.failure.rolledBack, true);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].status, 'rolled_back');
  assert.equal(result.results[0].rollbackStep.type, 'delete_created');
  assert.equal(result.results[1].status, 'failed');
  assert.equal(result.results[1].attempts, 2);
  assert.equal(result.results[1].failureClass, 'adapter');
  assert.deepEqual(
    adapterCalls,
    [
      ['createTask', 'Draft proposal'],
      ['updateTask'],
      ['updateTask'],
      ['deleteTask', 'created-1', 'inbox'],
    ],
  );
  assert.deepEqual(
    telemetryEvents
      .filter((event) => event.eventType === 'pipeline.execute.failed')
      .map((event) => event.attempt),
    [1, 2],
  );
  assert.ok(
    telemetryEvents.some((event) =>
      event.eventType === 'pipeline.rollback.succeeded'
      && event.metadata.rollbackType === 'delete_created'
      && event.rolledBack === true),
  );
});

test('pipeline classifies rollback failures when compensation is unsupported', async () => {
  const telemetryEvents = [];
  const adapter = {
    listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
    getTaskSnapshot: async (taskId, projectId) => ({
      id: taskId,
      projectId,
      title: 'Existing task',
      content: null,
      priority: 0,
      dueDate: null,
      repeatFlag: null,
      status: 0,
    }),
    completeTask: async (taskId, projectId) => ({ completed: true, taskId, projectId }),
    createTask: async () => {
      throw new Error('Create failed');
    },
    updateTask: async () => {
      throw new Error('updateTask should not be called in this scenario');
    },
    deleteTask: async () => {
      throw new Error('deleteTask should not be called in this scenario');
    },
    restoreTask: async () => {
      throw new Error('restoreTask should not be called in this scenario');
    },
  };

  const pipeline = createPipeline({
    axIntent: {
      extractIntents: async () => [{ type: 'complete' }, { type: 'create' }],
    },
    normalizer: {
      normalizeActions: () => ([
        { type: 'complete', taskId: 'task-1', projectId: 'inbox', valid: true, validationErrors: [] },
        { type: 'create', title: 'Replacement task', projectId: 'inbox', valid: true, validationErrors: [] },
      ]),
    },
    adapter,
    observability: createPipelineObservability({
      eventSink: async (event) => {
        telemetryEvents.push(event);
      },
      logger: null,
    }),
  });

  const result = await pipeline.processMessage('Complete this and create a replacement', {
    requestId: 'req-rollback-failure',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'rollback');
  assert.equal(result.failure.rolledBack, false);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].status, 'rollback_failed');
  assert.equal(result.results[0].rollbackStep.type, 'uncomplete_task');
  assert.equal(result.results[1].status, 'failed');
  assert.equal(result.results[1].attempts, 2);
  assert.equal(result.failure.retryable, false);
  assert.ok(
    telemetryEvents.some((event) =>
      event.eventType === 'pipeline.rollback.failed'
      && event.metadata.rollbackType === 'uncomplete_task'
      && event.failureClass === 'rollback'),
  );
});

test('pipeline observability normalizes telegram entry points for sink events', async () => {
  const telemetryEvents = [];
  const observability = createPipelineObservability({
    eventSink: async (event) => {
      telemetryEvents.push(event);
    },
    logger: null,
  });

  await observability.emit(
    { requestId: 'req-telemetry', entryPoint: 'telegram', mode: 'scan' },
    {
      eventType: 'pipeline.request.received',
      step: 'request',
      status: 'start',
      metadata: { mode: 'scan' },
    },
  );

  assert.equal(telemetryEvents.length, 1);
  assert.equal(telemetryEvents[0].entryPoint, 'telegram_review');
  assert.equal(telemetryEvents[0].eventType, 'pipeline.request.received');
});
test('markdown parser normalizes hash-divider and preserves bold formatting', () => {
  const input = '**Start now**: Do the task\n\n#######';
  const html = parseTelegramMarkdownToHTML(input);
  assert.match(html, /<b>Start now<\/b>:/);
  assert.match(html, /────────/);
});

test('executeActions accepts suggested_schedule update alias and applies dueDate', async () => {
  const calls = [];
  const ticktick = {
    updateTask: async (taskId, changes) => {
      calls.push({ taskId, changes });
      return { id: taskId };
    },
    completeTask: async () => {},
    createTask: async () => {}
  };

  const currentTasks = [{ id: 'task-1', title: 'Netflix task', projectId: 'p-1' }];
  const actions = [{ type: 'update', taskId: 'task-1', changes: { suggested_schedule: 'today' } }];

  const result = await executeActions(actions, ticktick, currentTasks);

  assert.equal(result.outcomes[0], '✅ Updated: "Netflix task"');
  assert.equal(typeof calls[0].changes.dueDate, 'string');
  assert.ok(calls[0].changes.dueDate.includes('T'));
  assert.ok(!calls[0].changes.dueDate.includes('T23:59:00.000'));
});

test('executeActions policy sweep prioritizes active tasks with priority 0', async () => {
  const calls = [];
  const ticktick = {
    updateTask: async (taskId, changes) => {
      calls.push({ taskId, changes });
      return { id: taskId };
    },
    completeTask: async () => {},
    createTask: async () => {}
  };

  const currentTasks = [
    { id: 't-1', title: 'Netflix System Design', projectId: 'p-inbox', projectName: 'Inbox', priority: 0, status: 0 },
  ];

  const { outcomes } = await executeActions([], ticktick, currentTasks, {
    enforcePolicySweep: true,
    projects: [
      { id: 'p-inbox', name: 'Inbox' },
      { id: 'p-career', name: 'Career' },
    ],
  });

  assert.ok(outcomes.some((o) => o.includes('Policy sweep appended 1 action')));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].taskId, 't-1');
  assert.ok([1, 3, 5].includes(calls[0].changes.priority));
  assert.equal(calls[0].changes.projectId, 'p-career');
});

test('executeActions policy sweep inherits urgent maintenance priority from shared ranking', async () => {
  const calls = [];
  const ticktick = {
    updateTask: async (taskId, changes) => {
      calls.push({ taskId, changes });
      return { id: taskId };
    },
    completeTask: async () => {},
    createTask: async () => {},
  };

  const currentTasks = [
    {
      id: 'rent-1',
      title: 'Pay rent',
      projectId: 'p-inbox',
      projectName: 'Inbox',
      priority: 0,
      dueDate: '2026-03-10',
      status: 0,
    },
  ];

  await executeActions([], ticktick, currentTasks, {
    enforcePolicySweep: true,
    nowIso: '2026-03-10T10:00:00Z',
    projects: [
      { id: 'p-inbox', name: 'Inbox' },
      { id: 'p-admin', name: 'Admin' },
    ],
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].taskId, 'rent-1');
  assert.equal(calls[0].changes.priority, 3);
  assert.equal(calls[0].changes.projectId, 'p-admin');
});

test('GeminiAnalyzer classifies invalid API key errors and repairs sloppy JSON', () => {
  const analyzer = new GeminiAnalyzer(['dummy-key']);
  const leakedKeyError = { status: 403, message: 'Your API key was reported as leaked. Please use another API key.' };
  const repaired = analyzer._safeParseJson("{summary:'ok',actions:[{type:'update',taskId:'1',changes:{priority:3,}},],}");

  assert.equal(analyzer._isInvalidApiKeyError(leakedKeyError), true);
  assert.equal(repaired.summary, 'ok');
  assert.equal(repaired.actions[0].type, 'update');
  assert.equal(repaired.actions[0].changes.priority, 3);
});

test('GeminiAnalyzer rotates to next key on invalid-key errors', async () => {
  const analyzer = new GeminiAnalyzer(['dummy-key-1', 'dummy-key-2']);

  const result = await analyzer._generateWithFailover(
    () => ({
      generateContent: async () => {
        if (analyzer._activeKeyIndex === 0) {
          const err = new Error('API key expired. Please renew the API key.');
          err.status = 400;
          throw err;
        }
        return { response: { usageMetadata: null, text: () => '{}' } };
      },
    }),
    'noop prompt'
  );

  assert.equal(analyzer._activeKeyIndex, 1);
  assert.ok(result?.response);
});

test('GeminiAnalyzer briefing preparation uses shared ranking outputs', () => {
  const analyzer = new GeminiAnalyzer(['dummy-key']);
  const tasks = [
    {
      id: 'task-career',
      title: 'Prepare backend system design notes',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    },
    {
      id: 'task-admin',
      title: 'Buy groceries',
      projectId: 'personal',
      projectName: 'Personal',
      status: 0,
    },
  ];

  const prepared = analyzer._prepareBriefingTasks(tasks, {
    goalThemeProfile: createGoalThemeProfile(`GOALS:
1. Land a senior backend role`, { source: 'user_context' }),
    nowIso: '2026-03-10T10:00:00Z',
  });

  assert.equal(prepared.ranking.topRecommendation.taskId, 'task-career');
  assert.equal(prepared.orderedTasks[0].id, 'task-career');
  assert.equal(prepared.ranking.ranked[0].rationaleCode, 'goal_alignment');
});

test('GeminiAnalyzer builds an urgent mode prompt note only when urgent mode is active', () => {
  assert.match(buildUrgentModePromptNote(true), /URGENT MODE is active/i);
  assert.match(buildUrgentModePromptNote(true), /direct, sharp language/i);
  assert.equal(buildUrgentModePromptNote(false), '');
});

test('GeminiAnalyzer fallback reorg routes recovery inbox work into Health', () => {
  const analyzer = new GeminiAnalyzer(['dummy-key']);
  const tasks = [
    {
      id: 'task-recovery',
      title: 'Book therapy session for burnout recovery',
      projectId: 'p-inbox',
      projectName: 'Inbox',
      priority: 0,
      status: 0,
    },
  ];
  const projects = [
    { id: 'p-inbox', name: 'Inbox' },
    { id: 'p-health', name: 'Health' },
    { id: 'p-admin', name: 'Admin' },
  ];

  const proposal = analyzer._buildFallbackReorgProposal(tasks, projects);

  assert.equal(proposal.actions.length, 1);
  assert.deepEqual(proposal.actions[0], {
    type: 'update',
    taskId: 'task-recovery',
    changes: {
      priority: 3,
      projectId: 'p-health',
    },
  });
});

test('GeminiAnalyzer reorg normalization fills recovery routing from shared policy', () => {
  const analyzer = new GeminiAnalyzer(['dummy-key']);
  const tasks = [
    {
      id: 'task-recovery',
      title: 'Book therapy session for burnout recovery',
      projectId: 'p-inbox',
      projectName: 'Inbox',
      priority: 0,
      status: 0,
    },
  ];
  const projects = [
    { id: 'p-inbox', name: 'Inbox' },
    { id: 'p-health', name: 'Health' },
    { id: 'p-admin', name: 'Admin' },
  ];

  const normalized = analyzer._normalizeReorgProposal({
    summary: 'Reorganize',
    questions: [],
    actions: [
      {
        type: 'update',
        taskId: 'task-recovery',
        changes: {},
      },
    ],
  }, tasks, projects);

  assert.equal(normalized.actions.length, 1);
  assert.deepEqual(normalized.actions[0], {
    type: 'update',
    taskId: 'task-recovery',
    changes: {
      priority: 3,
      projectId: 'p-health',
    },
  });
});

test('execution prioritization parses explicit goal themes from user context', () => {
  const rawContext = `GOALS (priority order):
1. Land a senior backend role
2. Stabilize finances and pay urgent bills
3. Protect health and recovery`;

  const profile = createGoalThemeProfile(rawContext, { source: 'user_context' });

  assert.equal(profile.source, 'user_context');
  assert.equal(profile.confidence, 'explicit');
  assert.deepEqual(
    profile.themes.map((theme) => ({
      label: theme.label,
      kind: theme.kind,
      priorityOrder: theme.priorityOrder,
    })),
    [
      { label: 'Land a senior backend role', kind: 'career', priorityOrder: 1 },
      { label: 'Stabilize finances and pay urgent bills', kind: 'financial', priorityOrder: 2 },
      { label: 'Protect health and recovery', kind: 'health', priorityOrder: 3 },
    ]
  );
});

test('execution prioritization normalizes candidates and flags sensitive content', () => {
  const candidate = normalizePriorityCandidate({
    id: 'task-1',
    title: 'Reset bank password',
    content: 'Positive1111!',
    projectId: 'p-inbox',
    projectName: 'Inbox',
    priority: 0,
    dueDate: null,
    status: 0,
  });

  assert.deepEqual(candidate, {
    taskId: 'task-1',
    title: 'Reset bank password',
    content: 'Positive1111!',
    projectId: 'p-inbox',
    projectName: 'Inbox',
    priority: 0,
    dueDate: null,
    status: 0,
    source: 'ticktick',
    containsSensitiveContent: true,
  });
});

test('execution prioritization returns structured degraded recommendation results', () => {
  const goalThemeProfile = createGoalThemeProfile('', { source: 'fallback' });
  const context = buildRankingContext({ goalThemeProfile });
  const ranked = [
    createRankingDecision({
      taskId: 'task-1',
      rank: 1,
      scoreBand: 'top',
      rationaleCode: 'fallback',
      rationaleText: 'Top remaining candidate under degraded goal context.',
      exceptionApplied: false,
      fallbackUsed: true,
    }),
  ];

  const result = buildRecommendationResult({
    ranked,
    degradedReason: 'unknown_goals',
    context,
  });

  assert.equal(result.topRecommendation.taskId, 'task-1');
  assert.equal(result.degraded, true);
  assert.equal(result.degradedReason, 'unknown_goals');
  assert.equal(result.context.goalThemeProfile.confidence, 'weak');
});

test('execution prioritization ranks meaningful work above low-value admin when goals are explicit', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-career',
      title: 'Prepare backend system design interview notes',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-admin',
      title: 'Buy groceries',
      projectId: 'personal',
      projectName: 'Personal',
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile(`GOALS (priority order):
1. Land a senior backend role`, { source: 'user_context' }),
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-career');
  assert.equal(result.ranked[0].taskId, 'task-career');
  assert.equal(result.ranked[0].rationaleCode, 'goal_alignment');
  assert.equal(result.degraded, false);
});

test('execution prioritization degrades honestly when goals are weak or absent', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-bill',
      title: 'Pay electricity bill today',
      projectId: 'admin',
      projectName: 'Admin',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-desk',
      title: 'Organize desk drawer',
      projectId: 'home',
      projectName: 'Home',
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-bill');
  assert.equal(result.degraded, true);
  assert.equal(result.degradedReason, 'unknown_goals');
  assert.ok(['fallback', 'urgency'].includes(result.ranked[0].rationaleCode));
});

test('execution prioritization still returns output when work-style state is unknown', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-focus',
      title: 'Draft portfolio bullet points for backend applications',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile(`GOALS (priority order):
1. Land a senior backend role`, { source: 'user_context' }),
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-focus');
  assert.equal(result.ranked[0].taskId, 'task-focus');
  assert.equal(result.context.workStyleMode, 'unknown');
  assert.equal(result.context.urgentMode, false);
});

test('execution prioritization does not synthesize wall-clock time when nowIso is omitted', () => {
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
  });

  assert.equal(context.nowIso, null);
});

test('GeminiAnalyzer generateDailyBriefing returns formatted text for command and scheduler callers', async () => {
  const analyzer = new GeminiAnalyzer(['dummy-key']);
  analyzer._generateWithFailover = async () => ({
    response: {
      text: () => JSON.stringify({
        focus: 'Ship the architecture PR before lower-leverage work.',
        priorities: [
          {
            task_id: 'task-focus',
            title: 'Ship weekly architecture PR',
            project_name: 'Career',
            due_date: '2026-03-12',
            priority_label: 'career-critical',
            rationale_text: 'Directly moves the highest-priority goal.',
          },
        ],
        why_now: ['Directly moves the highest-priority goal.'],
        start_now: 'Open the PR checklist and draft the next commit.',
        notices: [],
      }),
    },
  });

  const briefing = await analyzer.generateDailyBriefing(buildSummaryActiveTasksFixture(), {
    userId: 'boundary-user',
    urgentMode: false,
  });

  assert.equal(typeof briefing, 'string');
  assert.match(briefing, /\*\*Focus\*\*/);
  assert.match(briefing, /Ship weekly architecture PR/);
  assert.doesNotMatch(briefing, /\[object Object\]/);
});

test('execution prioritization parses mixed bullet and numbered goals inside the GOALS section', () => {
  const rawContext = `GOALS:
- Protect health and recovery
* Stabilize finances
1. Land a senior backend role

NOTES:
- avoid late-night doomscrolling`;

  const profile = createGoalThemeProfile(rawContext, { source: 'user_context' });

  assert.equal(profile.confidence, 'explicit');
  assert.deepEqual(
    profile.themes.map((theme) => theme.label),
    [
      'Protect health and recovery',
      'Stabilize finances',
      'Land a senior backend role',
    ],
  );
});

test('execution prioritization stops parsing when the user context moves past the GOALS section', () => {
  const rawContext = `SITUATION:
- Applying for backend roles

GOALS (priority order):
1. Land a senior backend role
2. Protect health and recovery

BEHAVIORAL PATTERNS (critical for accountability):
- Defaults to easy admin work when tired

ACCOUNTABILITY STYLE:
- Be direct`;

  const profile = createGoalThemeProfile(rawContext, { source: 'user_context' });

  assert.deepEqual(
    profile.themes.map((theme) => theme.label),
    [
      'Land a senior backend role',
      'Protect health and recovery',
    ],
  );
});

test('execution prioritization caps multi-theme matching instead of letting it outrun strong existing priority', () => {
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile(`GOALS:
1. System design mastery
2. Career growth`, { source: 'user_context' }),
  });
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-multi',
      title: 'System design career notes',
      projectId: 'career',
      projectName: 'Career',
      priority: 0,
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-single-high-priority',
      title: 'System design mock interview',
      projectId: 'career',
      projectName: 'Career',
      priority: 5,
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-single-high-priority');
  assert.equal(result.ranked[0].rationaleCode, 'goal_alignment');
});

test('execution prioritization ignores timezone-ambiguous dueDate strings while honoring explicit UTC timestamps', () => {
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
    nowIso: '2026-03-10T10:00:00Z',
  });
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-explicit-utc',
      title: 'Apartment lease meeting',
      projectId: 'admin',
      projectName: 'Admin',
      dueDate: '2026-03-10T15:00:00Z',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-ambiguous-local',
      title: 'Apartment lease meeting copy',
      projectId: 'admin',
      projectName: 'Admin',
      dueDate: '2026-03-10T15:00:00',
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-explicit-utc');
  assert.equal(result.ranked[0].rationaleCode, 'urgency');
});

test('execution prioritization elevates blocker removal with explicit exception reason', () => {
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile(`GOALS:
1. Land a senior backend role`, { source: 'user_context' }),
  });
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-deep-work',
      title: 'Draft backend architecture notes',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-blocker',
      title: 'Reset laptop password to unblock applications',
      projectId: 'admin',
      projectName: 'Admin',
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-blocker');
  assert.equal(result.topRecommendation.exceptionApplied, true);
  assert.equal(result.topRecommendation.exceptionReason, 'blocker');
  assert.equal(result.topRecommendation.rationaleCode, 'blocker_removal');
});

test('execution prioritization elevates urgent maintenance with explicit exception reason', () => {
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile(`GOALS:
1. Land a senior backend role`, { source: 'user_context' }),
    nowIso: '2026-03-10T10:00:00Z',
  });
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-deep-work',
      title: 'Draft backend architecture notes',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-urgent-maintenance',
      title: 'Pay rent',
      projectId: 'admin',
      projectName: 'Admin',
      dueDate: '2026-03-10',
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-urgent-maintenance');
  assert.equal(result.topRecommendation.exceptionApplied, true);
  assert.equal(result.topRecommendation.exceptionReason, 'urgent_requirement');
  assert.equal(result.topRecommendation.rationaleCode, 'urgency');
});

test('execution prioritization boosts urgent tasks ahead of long-term deep work when urgent mode is active', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-deep-work',
      title: 'Prepare backend system design interview notes',
      projectId: 'career',
      projectName: 'Career',
      priority: 5,
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-urgent-admin',
      title: 'Submit passport paperwork today',
      projectId: 'admin',
      projectName: 'Admin',
      dueDate: '2026-03-10',
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile(`GOALS:
1. Land a senior backend role`, { source: 'user_context' }),
    nowIso: '2026-03-10T10:00:00Z',
    urgentMode: true,
    workStyleMode: 'humane',
    stateSource: 'store',
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-urgent-admin');
  assert.equal(result.context.urgentMode, true);
  assert.equal(result.context.workStyleMode, 'humane');
});

test('execution prioritization elevates recovery work when it protects execution capacity', () => {
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile(`GOALS:
1. Land a senior backend role`, { source: 'user_context' }),
    workStyleMode: 'gentle',
  });
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-deep-work',
      title: 'Prepare backend system design interview notes',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-recovery',
      title: 'Book therapy session for burnout recovery',
      projectId: 'health',
      projectName: 'Health',
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-recovery');
  assert.equal(result.topRecommendation.exceptionApplied, true);
  assert.equal(result.topRecommendation.exceptionReason, 'capacity_protection');
  assert.equal(result.topRecommendation.rationaleCode, 'capacity_protection');
});

test('pipeline context resolves relative dates through the normalizer path', async () => {
  process.env.USER_TIMEZONE = 'Europe/Dublin';
  const { processMessage, adapterCalls, axCalls } = createPipelineHarness({
    intents: [
      {
        type: 'create',
        title: 'Book dentist',
        dueDate: 'thursday',
        confidence: 0.9,
      },
    ],
  });

  const result = await processMessage('book dentist thursday', {
    currentDate: '2026-03-10T10:00:00Z',
    entryPoint: 'regression',
    requestId: 'req-story-1',
  });

  assert.equal(result.type, 'task');
  assert.equal(result.actions.length, 1);
  assert.equal(result.results.length, 1);
  assert.equal(axCalls[0].options.currentDate, '2026-03-10');
  assert.deepEqual(axCalls[0].options.availableProjects, DEFAULT_PROJECTS.map((project) => project.name));
  assert.equal(adapterCalls.create.length, 1);
  assert.match(adapterCalls.create[0].dueDate, /^2026-03-12T23:59:00\.000[+-]\d{4}$/);
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

test('pipeline fails safely on malformed AX output', async () => {
  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: { unexpected: true },
  });

  const result = await processMessage('make this sane', {
    requestId: 'req-malformed-ax',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'malformed_ax');
  assert.equal(result.failure.rolledBack, false);
  assert.equal(result.requestId, 'req-malformed-ax');
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

test('pipeline classifies quota failures from AX extraction', async () => {
  const quotaError = new QuotaExhaustedError('All API keys exhausted');
  const axIntent = {
    extractIntents: async () => {
      throw quotaError;
    },
  };
  const adapter = {
    listProjects: async () => DEFAULT_PROJECTS,
  };
  const pipeline = createPipeline({
    axIntent,
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
  };
  const pipeline = createPipeline({
    axIntent: {
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

test('createAxIntent rotates configured keys before final quota failure', async () => {
  const originalForward = AxGen.prototype.forward;
  let forwardCalls = 0;
  const keyManager = {
    activeIndex: 0,
    markedReasons: [],
    rotationCount: 0,
    getActiveKey() {
      return `key-${this.activeIndex}`;
    },
    getKeyCount() {
      return 2;
    },
    markKeyUnavailable(reason) {
      this.markedReasons.push(reason);
    },
    async rotateKey() {
      this.rotationCount += 1;
      this.activeIndex += 1;
      return this.activeIndex < this.getKeyCount();
    },
  };

  AxGen.prototype.forward = async function forwardQuotaError() {
    forwardCalls += 1;
    const error = new Error('RESOURCE_EXHAUSTED: quota exceeded per day');
    error.status = 429;
    throw error;
  };

  try {
    const axIntent = createAxIntent(keyManager);
    await assert.rejects(
      () => axIntent.extractIntents('schedule rent', { currentDate: '2026-03-10', availableProjects: ['Inbox'], requestId: 'req-ax-quota' }),
      QuotaExhaustedError,
    );
  } finally {
    AxGen.prototype.forward = originalForward;
  }

  assert.equal(forwardCalls, 2);
  assert.equal(keyManager.rotationCount, 1);
  assert.deepEqual(keyManager.markedReasons, ['daily_quota', 'daily_quota']);
});

test('burst pipeline requests remain isolated and deterministic', async () => {
  const telemetryEvents = [];
  const adapter = {
    listProjects: async () => DEFAULT_PROJECTS,
    createTask: async (action) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
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
    axIntent: {
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

  const results = await Promise.all(
    requests.map(({ message, requestId }) => pipeline.processMessage(message, {
      requestId,
      entryPoint: 'telegram',
      mode: 'interactive',
      currentDate: '2026-03-10',
    })),
  );

  assert.equal(results.length, 24);
  assert.equal(new Set(results.map((result) => result.requestId)).size, 24);
  assert.equal(results.filter((result) => result.type === 'error').length, 4);
  assert.equal(results.filter((result) => result.type === 'task').length, 20);
  assert.ok(results.every((result, index) => result.requestId === `burst-${index}`));
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
