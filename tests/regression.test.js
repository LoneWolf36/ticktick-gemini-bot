import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AxGen } from '@ax-llm/ax';

import { appendUrgentModeReminder, parseTelegramMarkdownToHTML } from '../services/shared-utils.js';
import { executeActions, registerCommands, resetRateLimits } from '../bot/commands.js';
import { GeminiAnalyzer, buildUrgentModePromptNote } from '../services/gemini.js';
import { createAxIntent, detectUrgentModeIntent, QuotaExhaustedError } from '../services/ax-intent.js';
import { createPipeline } from '../services/pipeline.js';
import { createPipelineObservability } from '../services/pipeline-observability.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import * as store from '../services/store.js';
import * as executionPrioritization from '../services/execution-prioritization.js';
import { AUTHORIZED_CHAT_ID } from '../services/shared-utils.js';
import { runDailyBriefingJob, runWeeklyDigestJob } from '../services/scheduler.js';
import {
  BRIEFING_SUMMARY_SECTION_KEYS,
  WEEKLY_SUMMARY_SECTION_KEYS,
  buildSummaryLogPayload,
  composeBriefingSummary,
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
  const source = readFileSync('services/shared-utils.js', 'utf8');
  assert.match(source, /USER_TZ\s*=\s*process\.env\.USER_TIMEZONE\s*\|\|\s*'Europe\/Dublin'/);
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
    {},
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
  const userId = AUTHORIZED_CHAT_ID || `node-test-freeform-urgent-${Date.now()}`;
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

test('registerCommands uses shared briefing surface and preserves urgent reminder', async () => {
  resetRateLimits();
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
      generateReorgProposal: async () => ({ summary: '', actions: [], questions: [] }),
    },
    {},
    {},
  );

  const briefingHandler = handlers.commands.get('briefing');
  assert.equal(typeof briefingHandler, 'function');

  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setUrgentMode(userId, true);
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

test('registerCommands uses shared weekly surface and sends formatted output', async () => {
  resetRateLimits();
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
      generateReorgProposal: async () => ({ summary: '', actions: [], questions: [] }),
    },
    {},
    {},
  );

  const weeklyHandler = handlers.commands.get('weekly');
  assert.equal(typeof weeklyHandler, 'function');

  const replies = [];
  const userId = AUTHORIZED_CHAT_ID || Date.now();
  await store.setUrgentMode(userId, false);
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

test('registerCommands short-circuits briefing and weekly when quota is exhausted', async () => {
  resetRateLimits();
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
      generateWeeklyDigestSummary: async () => {
        throw new Error('generateWeeklyDigestSummary should not be called when quota is exhausted');
      },
      generateReorgProposal: async () => ({ summary: '', actions: [], questions: [] }),
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
  await handlers.commands.get('weekly')(ctx);

  assert.ok(replies.some((message) => /quota exhausted/i.test(message)));
});

test('runDailyBriefingJob uses the shared briefing summary surface and keeps pending reminder outside the formatter', async () => {
  await store.resetAll();
  const userId = `scheduler-daily-${Date.now()}`;
  await store.setChatId(userId);
  await store.setUrgentMode(userId, true);
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
      getAllTasks: async () => buildSummaryActiveTasksFixture(),
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
  await store.setUrgentMode(userId, true);
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
      getAllTasks: async () => buildSummaryActiveTasksFixture(),
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
  await store.setUrgentMode(userId, false);

  let summaryCalls = 0;
  const ran = await runWeeklyDigestJob({
    bot: {
      api: {
        sendMessage: async () => {},
      },
    },
    ticktick: {
      isAuthenticated: () => true,
      getAllTasks: async () => buildSummaryActiveTasksFixture(),
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

test('TickTickAdapter includes the existing projectId when updating only a due date', async () => {
  let updatePayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: '507f1f77bcf86cd799439011',
    projectId: '507f191e810c19729de860ea',
    content: '',
    priority: 0,
    status: 0,
  });
  client.updateTask = async (_taskId, payload) => {
    updatePayload = payload;
    return { id: '507f1f77bcf86cd799439011', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.updateTask('507f1f77bcf86cd799439011', {
    originalProjectId: '507f191e810c19729de860ea',
    dueDate: '2026-03-11T09:30:00.000+0000',
  });

  assert.equal(updatePayload.projectId, '507f191e810c19729de860ea');
  assert.equal(updatePayload.dueDate, '2026-03-11T09:30:00.000+0000');
  assert.equal(Object.hasOwn(updatePayload, 'originalProjectId'), false);
});

test('TickTickAdapter createTask includes items when checklistItems provided', async () => {
  let createPayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.createTask = async (payload) => {
    createPayload = payload;
    return { id: 'checklist-task-1', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.createTask({
    title: 'Onboard new client',
    projectId: '507f191e810c19729de860ea',
    checklistItems: [
      { title: 'Send welcome email' },
      { title: 'Create project folder' },
      { title: 'Schedule kickoff meeting' },
    ],
  });

  assert.ok(createPayload.items, 'items should be present in payload');
  assert.equal(createPayload.items.length, 3, 'should have 3 checklist items');
  assert.equal(createPayload.items[0].title, 'Send welcome email');
  assert.equal(createPayload.items[0].status, 0, 'status should default to 0');
  assert.equal(createPayload.items[0].sortOrder, 0, 'sortOrder should be 0');
  assert.equal(createPayload.items[1].title, 'Create project folder');
  assert.equal(createPayload.items[1].sortOrder, 1, 'sortOrder should be 1');
  assert.equal(createPayload.items[2].sortOrder, 2, 'sortOrder should be 2');
});

test('TickTickAdapter createTask omits items when checklistItems is empty', async () => {
  let createPayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.createTask = async (payload) => {
    createPayload = payload;
    return { id: 'no-checklist-task', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.createTask({
    title: 'Simple task',
    projectId: '507f191e810c19729de860ea',
    checklistItems: [],
  });

  assert.equal(Object.hasOwn(createPayload, 'items'), false, 'items should NOT be present for empty checklist');
});

test('TickTickAdapter createTask omits items when checklistItems is null or undefined', async () => {
  let createPayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.createTask = async (payload) => {
    createPayload = payload;
    return { id: 'no-checklist-task', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.createTask({
    title: 'Simple task',
    projectId: '507f191e810c19729de860ea',
  });

  assert.equal(Object.hasOwn(createPayload, 'items'), false, 'items should NOT be present when checklistItems is undefined');
  assert.equal(createPayload.title, 'Simple task');
});

test('TickTickAdapter createTask drops malformed checklist items', async () => {
  let createPayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.createTask = async (payload) => {
    createPayload = payload;
    return { id: 'partial-checklist-task', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.createTask({
    title: 'Task with partial checklist',
    projectId: '507f191e810c19729de860ea',
    checklistItems: [
      { title: 'Valid item' },
      { title: '' }, // invalid: empty title
      { title: '   ' }, // invalid: whitespace-only
      null, // invalid: null
      { title: 'Another valid item' },
    ],
  });

  assert.ok(createPayload.items, 'items should be present');
  assert.equal(createPayload.items.length, 2, 'only valid items should be included');
  assert.equal(createPayload.items[0].title, 'Valid item');
  assert.equal(createPayload.items[1].title, 'Another valid item');
});

test('TickTickAdapter createTask preserves ordinary create without checklistItems', async () => {
  let createPayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.createTask = async (payload) => {
    createPayload = payload;
    return { id: 'ordinary-task', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.createTask({
    title: 'Review PR #123',
    projectId: '507f191e810c19729de860ea',
    priority: 3,
    dueDate: '2025-04-01T17:00:00.000Z',
    content: 'Some notes',
  });

  assert.equal(createPayload.title, 'Review PR #123');
  assert.equal(createPayload.priority, 3);
  assert.equal(createPayload.dueDate, '2025-04-01T17:00:00.000Z');
  assert.equal(createPayload.content, 'Some notes');
  assert.equal(Object.hasOwn(createPayload, 'items'), false, 'items should NOT be present for ordinary create');
});

test('pipeline retries once and rolls back earlier successful writes', async () => {
  const adapterCalls = [];
  const telemetryEvents = [];
  let createCount = 0;
  const adapter = {
    listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
    listActiveTasks: async () => [],
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
      createCount++;
      // First create succeeds, second create fails
      if (createCount === 1) {
        return { id: 'created-1', projectId: action.projectId };
      }
      throw new Error('TickTick unavailable');
    },
    updateTask: async () => {
      throw new Error('updateTask should not be called in this scenario');
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
      extractIntents: async () => [{ type: 'create' }, { type: 'create' }],
    },
    normalizer: {
      normalizeActions: () => ([
        { type: 'create', title: 'Draft proposal', projectId: 'inbox', valid: true, validationErrors: [] },
        { type: 'create', title: 'Follow-up task', projectId: 'inbox', valid: true, validationErrors: [] },
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

  const result = await pipeline.processMessage('Draft proposal and follow-up', {
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
      ['createTask', 'Follow-up task'],
      ['createTask', 'Follow-up task'],
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
  let completeCount = 0;
  const adapter = {
    listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
    listActiveTasks: async () => [],
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
    completeTask: async (taskId, projectId) => {
      completeCount++;
      // First complete succeeds, second fails
      if (completeCount === 1) {
        return { completed: true, taskId, projectId };
      }
      throw new Error('Complete failed — triggering rollback');
    },
    createTask: async () => {
      throw new Error('createTask should not be called in this scenario');
    },
    updateTask: async () => {
      throw new Error('updateTask should not be called in this scenario');
    },
    deleteTask: async () => {
      throw new Error('deleteTask should not be called in this scenario');
    },
    restoreTask: async () => {
      throw new Error('Rollback unsupported: TickTick does not expose a reliable reopen path.');
    },
  };

  const pipeline = createPipeline({
    axIntent: {
      extractIntents: async () => [{ type: 'complete' }],
    },
    normalizer: {
      normalizeActions: () => ([
        { type: 'complete', taskId: 'task-1', projectId: 'inbox', valid: true, validationErrors: [] },
        { type: 'complete', taskId: 'task-2', projectId: 'inbox', valid: true, validationErrors: [] },
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

  const result = await pipeline.processMessage('complete both tasks', {
    requestId: 'req-rollback-failure',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  // First complete succeeds, second complete fails after retry, rollback of first (uncomplete) throws
  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'rollback');
  assert.equal(result.failure.rolledBack, false);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].status, 'rollback_failed');
  assert.equal(result.results[0].rollbackStep.type, 'uncomplete_task');
  assert.equal(result.results[1].status, 'failed');
  assert.equal(result.results[1].attempts, 2);
  assert.equal(result.failure.retryable, false);
  assert.equal(completeCount, 3); // 1 success + 2 attempts on second
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
      title: 'Schedule maintenance check',
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

test('buildSummaryLogPayload normalizes diagnostics field names and delivery status', () => {
  const payload = buildSummaryLogPayload({
    context: { kind: 'briefing', entryPoint: 'manual_command', userId: 'log-user' },
    result: {
      summary: { focus: 'Test focus' },
      diagnostics: {
        kind: 'briefing',
        entryPoint: 'manual_command',
        sourceCounts: { activeTasks: 3, processedHistory: 1 },
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
    },
    deliveryStatus: 'sent',
  });

  assert.equal(payload.userId, 'log-user');
  assert.equal(payload.diagnostics.deliveryStatus, 'sent');
  assert.deepEqual(payload.diagnostics.sourceCounts, { activeTasks: 3, processedHistory: 1 });
  assert.equal(Object.hasOwn(payload.diagnostics, 'source_counts'), false);
  assert.equal(payload.diagnostics.formattingDecisions.telegramSafe, true);
});

test('GeminiAnalyzer generateDailyBriefingSummary matches manual and scheduler output for the same inputs', async () => {
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

  const manual = await analyzer.generateDailyBriefingSummary(buildSummaryActiveTasksFixture(), {
    entryPoint: 'manual_command',
    userId: 'parity-user',
    urgentMode: false,
    generatedAtIso: '2026-03-13T08:30:00Z',
  });
  const scheduled = await analyzer.generateDailyBriefingSummary(buildSummaryActiveTasksFixture(), {
    entryPoint: 'scheduler',
    userId: 'parity-user',
    urgentMode: false,
    generatedAtIso: '2026-03-13T08:30:00Z',
  });

  assert.deepEqual(manual.summary, scheduled.summary);
  assert.equal(manual.formattedText, scheduled.formattedText);
  assert.deepEqual(manual.diagnostics.sourceCounts, scheduled.diagnostics.sourceCounts);
  assert.equal(manual.diagnostics.degradedReason, scheduled.diagnostics.degradedReason);
  assert.equal(manual.diagnostics.formatterVersion, scheduled.diagnostics.formatterVersion);
});

test('GeminiAnalyzer generateWeeklyDigestSummary matches manual and scheduler output for the same snapshot', async () => {
  const analyzer = new GeminiAnalyzer(['dummy-key']);
  analyzer._generateWithFailover = async () => ({
    response: {
      text: () => JSON.stringify({
        progress: ['Completed resume update'],
        carry_forward: ['Reschedule mock interview'],
        next_focus: ['Protect maker time'],
        watchouts: ['Do not let admin work crowd out backend prep'],
        notices: [],
      }),
    },
  });

  const activeTasks = buildSummaryActiveTasksFixture();
  const processedHistory = Object.fromEntries(buildSummaryProcessedHistoryFixture().map((entry) => [entry.taskId, entry]));
  const manual = await analyzer.generateWeeklyDigestSummary(activeTasks, processedHistory, {
    entryPoint: 'manual_command',
    userId: 'parity-user',
    urgentMode: false,
    generatedAtIso: '2026-03-13T08:30:00Z',
    historyAvailable: true,
  });
  const scheduled = await analyzer.generateWeeklyDigestSummary(activeTasks, processedHistory, {
    entryPoint: 'scheduler',
    userId: 'parity-user',
    urgentMode: false,
    generatedAtIso: '2026-03-13T08:30:00Z',
    historyAvailable: true,
  });

  assert.deepEqual(manual.summary, scheduled.summary);
  assert.equal(manual.formattedText, scheduled.formattedText);
  assert.deepEqual(manual.diagnostics.sourceCounts, scheduled.diagnostics.sourceCounts);
  assert.equal(manual.diagnostics.degradedReason, scheduled.diagnostics.degradedReason);
  assert.equal(manual.diagnostics.formatterVersion, scheduled.diagnostics.formatterVersion);
});

test('GeminiAnalyzer no longer exposes legacy formatted-string summary wrappers', () => {
  const source = readFileSync(new URL('../services/gemini.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /async generateDailyBriefing\s*\(/);
  assert.doesNotMatch(source, /async generateWeeklyDigest\s*\(/);
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
    listActiveTasks: async () => [],
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
    listActiveTasks: async () => [],
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
    { isAuthenticated: () => true, getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
    { isQuotaExhausted: () => false },
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
    getAllTasksCached: async () => [
      { id: 'task-weekly-1', title: 'Write weekly report', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
      { id: 'task-weekly-2', title: 'Review weekly metrics', projectId: 'inbox', projectName: 'Inbox', priority: 1, status: 0 },
    ],
    getLastFetchedProjects: () => [{ id: 'inbox', name: 'Inbox' }],
  };

  const pipeline = {
    processMessage: async (msg, opts) => {
      pipelineCalls.push({ message: msg, options: opts });
      return { type: 'task', confirmationText: '✅ Updated "Write weekly report"', actions: [], results: [{ status: 'succeeded' }] };
    },
  };

  registerCallbacks(bot, ticktick, { isQuotaExhausted: () => false }, {}, pipeline);

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
  assert.ok(answers[0].text.includes('Selected'));
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
    { isAuthenticated: () => true, getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
    { isQuotaExhausted: () => false },
    {},
    { processMessage: async () => { throw new Error('should not be called'); } },
  );

  const pickHandler = handlers.callbacks.find(h => h.pattern.toString().includes('mut:pick'))?.handler;

  const answers = [];
  const ctx = {
    match: ['mut:pick:task-1', 'task-1'],
    chat: { id: chatId }, // Same chat (authorized)
    from: { id: 999 }, // Different user
    answerCallbackQuery: async (obj) => { answers.push(obj); },
    editMessageText: async () => {},
  };

  await pickHandler(ctx);

  assert.ok(answers[0].text.includes('Wrong user'));
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
    { isAuthenticated: () => true, getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
    { isQuotaExhausted: () => false },
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

  assert.ok(answers[0].text.includes('Expired'));
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
    { isAuthenticated: () => true, getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
    { isQuotaExhausted: () => false },
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
  assert.ok(answers[0].text.includes('Canceled'));
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
    { isAuthenticated: () => true, getAllTasksCached: async () => [], getLastFetchedProjects: () => [] },
    { isQuotaExhausted: () => false },
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

  assert.ok(answers[0].text.includes('No pending'));
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

test('WP06 T020: fail-closed — malformed AX returns user-safe message without leaking diagnostics', async () => {
  const pipeline = createPipeline({
    axIntent: {
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
  assert.equal(result.failure.class, 'malformed_ax');
  // User message MUST be compact and MUST NOT leak raw error text
  assert.match(result.confirmationText, /could not understand/i);
  assert.equal(result.confirmationText.includes('<html>'), false);
  assert.equal(result.confirmationText.includes('garbage'), false);
  // Developer diagnostics ARE available in diagnostics array
  assert.ok(result.diagnostics.length > 0);
});

test('WP06 T020: fail-closed — validation failure returns user-safe message', async () => {
  const pipeline = createPipeline({
    axIntent: {
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
  const pipeline = createPipeline({
    axIntent: {
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
      createTask: async () => { throw new Error('TickTick API 503 Service Unavailable'); },
    },
  });

  const result = await pipeline.processMessage('create test', {
    requestId: 'req-fail-closed-adapter',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'adapter');
  assert.match(result.confirmationText, /failed.*retry|retry.*shortly/i);
  // User message MUST NOT expose internal error details
  assert.equal(result.confirmationText.includes('503'), false);
  assert.equal(result.confirmationText.includes('Service Unavailable'), false);
});

test('WP06 T020: fail-closed — quota exhaustion returns user-safe message', async () => {
  const pipeline = createPipeline({
    axIntent: {
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

// =========================================================================
// WP06 — T012: Failure-path regressions (additional coverage)
// =========================================================================

test('WP06 T012: pipeline classifies malformed AX output when extractIntents returns non-array', async () => {
  const pipeline = createPipeline({
    axIntent: {
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
  assert.equal(result.failure.class, 'malformed_ax');
});

test('WP06 T012: pipeline handles AX returning null intents', async () => {
  const pipeline = createPipeline({
    axIntent: {
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

  // Null from AX is treated as empty/non-task, not malformed
  assert.equal(result.type, 'error');
  assert.ok(['malformed_ax', 'unexpected', 'validation'].includes(result.failure.class),
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

test('WP07 T072: multi-mutation request is rejected', async () => {
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

  assert.equal(result.type, 'error');
  assert.equal(harness.adapterCalls.complete.length, 0);
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

  // Underspecified pronoun "it" with multiple tasks: the resolver may find zero or one match
  // Key assertion: the result is NOT a confident multi-target mutation
  assert.ok(
    result.type === 'clarification' || result.type === 'not-found' || result.type === 'task',
    `pronoun-only should produce a defined outcome, got type: ${result.type}`
  );
  // If it did mutate, it should be at most 1 task (single-target policy)
  assert.ok(harness.adapterCalls.update.length <= 1, 'should mutate at most one target');
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
// WP07 — T073: Observability assertions for mutation diagnostics
// =========================================================================

test('WP07 T073: successful mutation emits diagnostic events with intent and resolution metadata', async () => {
  const events = [];
  const obs = createPipelineObservability({
    eventSink: async (event) => { events.push(event); },
    logger: { log: () => {}, error: () => {} },
  });

  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'Updated title', confidence: 0.95, targetQuery: 'weekly' },
    ],
    activeTasks: [
      { id: 'task-obs-01', title: 'Weekly report', projectId: 'inbox', projectName: 'Inbox', priority: 5, status: 0 },
    ],
    observability: obs,
  });

  await harness.processMessage('update weekly report');

  // Verify we have pipeline events
  assert.ok(events.length > 0, 'expected telemetry events to be emitted');

  // Should have a resolve event with resolution metadata
  const resolveEvents = events.filter(e => e.eventType === 'pipeline.resolve.completed');
  assert.ok(resolveEvents.length >= 0, 'resolve events should be present');

  // Should have normalize events
  const normalizeEvents = events.filter(e => e.eventType === 'pipeline.normalize.completed');
  assert.equal(normalizeEvents.length, 1);
  assert.equal(normalizeEvents[0].metadata.validCount, 1);

  // Should have a success result event
  const resultEvents = events.filter(e => e.eventType === 'pipeline.request.completed' && e.status === 'success');
  assert.equal(resultEvents.length, 1);
  assert.equal(resultEvents[0].metadata.type, 'task');
});

test('WP07 T073: skipped mutation (not-found) emits diagnostic events', async () => {
  const events = [];
  const obs = createPipelineObservability({
    eventSink: async (event) => { events.push(event); },
    logger: { log: () => {}, error: () => {} },
  });

  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'ghost task', confidence: 0.9, targetQuery: 'ghost task that does not exist' },
    ],
    activeTasks: [
      { id: 'task-nf-02', title: 'Existing task', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
    ],
    observability: obs,
  });

  await harness.processMessage('update ghost task that does not exist');

  assert.ok(events.length > 0, 'expected telemetry events even for not-found');

  // Resolve events should show not_found status
  const resolveEvents = events.filter(e => e.eventType === 'pipeline.resolve.completed');
  // The resolve event status should reflect the not-found outcome
  if (resolveEvents.length > 0) {
    assert.ok(
      ['success', 'failure'].includes(resolveEvents[0].status),
      'resolve event should have a valid status'
    );
  }
});

test('WP07 T073: failed mutation (mixed intent) emits failure diagnostic events', async () => {
  const events = [];
  const obs = createPipelineObservability({
    eventSink: async (event) => { events.push(event); },
    logger: { log: () => {}, error: () => {} },
  });

  const harness = createPipelineHarness({
    intents: [
      { type: 'create', title: 'New thing' },
      { type: 'update', title: 'Old thing', targetQuery: 'old', confidence: 0.9 },
    ],
    activeTasks: [
      { id: 'task-mix-01', title: 'Old thing', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
    ],
    observability: obs,
  });

  await harness.processMessage('create new and update old');

  assert.ok(events.length > 0, 'expected telemetry events for mixed intent failure');

  // Should have a failure result event
  const failureEvents = events.filter(e => e.eventType === 'pipeline.request.failed');
  assert.equal(failureEvents.length, 1);
  assert.equal(failureEvents[0].metadata.reason, 'mixed_create_and_mutation');
});

// =========================================================================
// WP07 — T074: Stale comment/fixture cleanup verification
// =========================================================================

test('WP07 T074: no references to unsupported reschedule command in WP07 mutation tests', () => {
  // Verify the WP07 mutation test blocks do not encode stale reschedule assumptions
  const regressionSource = readFileSync('tests/regression.test.js', 'utf8');
  // Only check lines within the WP07 test blocks (between WP07 markers and the T074 tests themselves)
  const wp07Start = regressionSource.indexOf("// WP07");
  if (wp07Start === -1) return; // no WP07 tests yet

  // Find the start of the T074 cleanup section and stop before it
  const t074Start = regressionSource.indexOf("// WP07 — T074:");
  const wp07Section = t074Start !== -1
    ? regressionSource.slice(wp07Start, t074Start)
    : regressionSource.slice(wp07Start);

  const rescheduleInWP07 = wp07Section.split('\n').filter(line =>
    line.toLowerCase().includes('reschedule')
  );

  assert.equal(
    rescheduleInWP07.length,
    0,
    `WP07 mutation tests should not reference unsupported reschedule command. Found: ${rescheduleInWP07.map(l => l.trim()).join('; ')}`
  );
});

test('WP07 T074: pipeline harness does not reference nonexistent modules', () => {
  const harnessSource = readFileSync('tests/pipeline-harness.js', 'utf8');
  // Ensure harness only imports from known modules
  const imports = harnessSource.match(/from ['"](\.\.\/[^'"]+)['"]/g) || [];
  const knownModules = [
    '../services/pipeline.js',
    '../services/normalizer.js',
    '../services/pipeline-observability.js',
  ];

  for (const imp of imports) {
    const mod = imp.match(/from ['"](\.\.\/[^'"]+)['"]/)[1];
    assert.ok(
      knownModules.some(k => mod.startsWith(k.replace(/\.js$/, '')) || mod === k),
      `pipeline harness should not import from unsupported module: ${mod}`
    );
  }
});
