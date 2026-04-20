import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AxGen } from '@ax-llm/ax';
import { appendUrgentModeReminder, parseTelegramMarkdownToHTML, containsSensitiveContent, buildTickTickUpdate, scheduleToDateTime, AUTHORIZED_CHAT_ID } from '../services/shared-utils.js';
import { executeActions, registerCommands } from '../bot/commands.js';
import { GeminiAnalyzer, buildWorkStylePromptNote } from '../services/gemini.js';
import { createAxIntent, detectWorkStyleModeIntent, QuotaExhaustedError } from '../services/ax-intent.js';
import { createPipeline } from '../services/pipeline.js';
import { createPipelineObservability } from '../services/pipeline-observability.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import { classifyTaskEvent } from '../services/behavioral-signals.js';
import * as store from '../services/store.js';
import * as executionPrioritization from '../services/execution-prioritization.js';
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

  if (variant === 'repeated_ignored') {
    return [
      {
        taskId: 'hist-repeat-1',
        originalTitle: 'Skipped architecture draft',
        approved: false,
        skipped: true,
        dropped: false,
        reviewedAt: '2026-03-11T09:00:00Z',
        sentAt: '2026-03-11T09:05:00Z',
      },
      {
        taskId: 'hist-repeat-2',
        originalTitle: 'Dropped interview practice',
        approved: false,
        skipped: false,
        dropped: true,
        reviewedAt: '2026-03-12T09:10:00Z',
        sentAt: '2026-03-12T09:15:00Z',
      },
      {
        taskId: 'hist-repeat-3',
        originalTitle: 'Skipped design follow-up',
        approved: false,
        skipped: true,
        dropped: false,
        reviewedAt: '2026-03-13T09:20:00Z',
        sentAt: '2026-03-13T09:25:00Z',
      },
    ];
  }

  return base;
}

function buildSummaryResolvedStateFixture({
  kind = 'briefing',
  workStyleMode = store.MODE_STANDARD,
  urgentMode = workStyleMode === store.MODE_URGENT,
  entryPoint = 'manual_command',
} = {}) {
  return {
    kind,
    entryPoint,
    userId: 'summary-fixture-user',
    generatedAtIso: '2026-03-13T08:30:00Z',
    timezone: 'Europe/Dublin',
    workStyleMode,
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
      workStyleMode: 'standard',
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

function buildDailyCloseProcessedHistoryFixture({ variant = 'meaningful' } = {}) {
  if (variant === 'irregular') {
    return [
      {
        taskId: 'hist-irregular-1',
        originalTitle: 'Old review artifact',
        approved: true,
        skipped: false,
        dropped: false,
        reviewedAt: '2026-03-09T19:00:00Z',
      },
    ];
  }

  if (variant === 'avoidance') {
    return [
      {
        taskId: 'hist-avoid-1',
        originalTitle: 'Skipped architecture work',
        approved: false,
        skipped: true,
        dropped: false,
        reviewedAt: '2026-03-13T18:00:00Z',
      },
      {
        taskId: 'hist-avoid-2',
        originalTitle: 'Dropped interview prep',
        approved: false,
        skipped: false,
        dropped: true,
        reviewedAt: '2026-03-13T19:00:00Z',
      },
    ];
  }

  if (variant === 'backoff') {
    return [
      {
        taskId: 'hist-backoff-1',
        originalTitle: 'Skipped architecture work',
        approved: false,
        skipped: true,
        dropped: false,
        reviewedAt: '2026-03-13T18:00:00Z',
      },
      {
        taskId: 'hist-backoff-2',
        originalTitle: 'Dropped interview prep',
        approved: false,
        skipped: false,
        dropped: true,
        reviewedAt: '2026-03-13T19:00:00Z',
      },
      {
        taskId: 'hist-backoff-3',
        originalTitle: 'Skipped portfolio revision',
        approved: false,
        skipped: true,
        dropped: false,
        reviewedAt: '2026-03-13T20:00:00Z',
      },
    ];
  }

  if (variant === 'sparse') {
    return [
      {
        taskId: 'hist-sparse-1',
        originalTitle: 'Light check-in only',
        approved: false,
        skipped: true,
        dropped: false,
        reviewedAt: '2026-03-13T20:00:00Z',
      },
    ];
  }

  return [
    {
      taskId: 'hist-day-1',
      originalTitle: 'Shipped architecture PR',
      approved: true,
      skipped: false,
      dropped: false,
      reviewedAt: '2026-03-13T18:00:00Z',
    },
    {
      taskId: 'hist-day-2',
      originalTitle: 'Closed design follow-up',
      approved: true,
      skipped: false,
      dropped: false,
      reviewedAt: '2026-03-13T19:00:00Z',
    },
  ];
}

function buildDailyCloseSummaryFixture({ variant = 'normal' } = {}) {
  if (variant === 'sparse') {
    return {
      stats: ['Completed: 0', 'Skipped: 1', 'Dropped: 0', 'Still open: 1'],
      reflection: '',
      reset_cue: 'If today was disrupted or offline, restart tomorrow with one concrete task.',
      notices: [
        { severity: 'info', message: 'The day has thin evidence, so this reflection stays minimal.' },
      ],
    };
  }

  return {
    stats: ['Completed: 2', 'Skipped: 0', 'Dropped: 0', 'Still open: 3'],
    reflection: 'You moved meaningful work today. Keep the close-out factual and light.',
    reset_cue: 'Tomorrow’s restart: begin with “Ship weekly architecture PR” and finish the first executable step.',
    notices: [
      { severity: 'info', message: 'The day has thin evidence, so this reflection stays minimal.' },
    ],
  };
}

async function run() {
  let failures = 0;

  try {
    const source = readFileSync('services/shared-utils.js', 'utf8');
    assert.match(source, /USER_TZ\s*=\s*process\.env\.USER_TIMEZONE\s*\|\|\s*'Europe\/Dublin'/);
    console.log('PASS timezone default is Europe/Dublin');
  } catch (err) {
    failures++;
    console.error('FAIL timezone default is Europe/Dublin');
    console.error(err.message);
  }

  try {
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
    console.log('PASS summary fixtures expose deterministic normal sparse and degraded inputs');
  } catch (err) {
    failures++;
    console.error('FAIL summary fixtures expose deterministic normal sparse and degraded inputs');
    console.error(err.message);
  }

  try {
    const activeTasks = buildSummaryActiveTasksFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture();
    const result = composeBriefingSummary({ context, activeTasks, rankingResult });

    assert.deepEqual(Object.keys(result.summary), BRIEFING_SUMMARY_SECTION_KEYS);
    assert.equal(Array.isArray(result.summary.priorities), true);
    assert.equal(Array.isArray(result.summary.why_now), true);
    assert.equal(Array.isArray(result.summary.notices), true);
    console.log('PASS composeBriefingSummary enforces fixed briefing top-level sections');
  } catch (err) {
    failures++;
    console.error('FAIL composeBriefingSummary enforces fixed briefing top-level sections');
    console.error(err.message);
  }

  try {
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
    console.log('PASS composeBriefingSummary prefers structured model focus and priorities');
  } catch (err) {
    failures++;
    console.error('FAIL composeBriefingSummary prefers structured model focus and priorities');
    console.error(err.message);
  }

  try {
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
    console.log('PASS composeBriefingSummary adds sparse-task notices without filler');
  } catch (err) {
    failures++;
    console.error('FAIL composeBriefingSummary adds sparse-task notices without filler');
    console.error(err.message);
  }

  try {
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
    console.log('PASS composeBriefingSummary adds degraded-ranking notices');
  } catch (err) {
    failures++;
    console.error('FAIL composeBriefingSummary adds degraded-ranking notices');
    console.error(err.message);
  }

  try {
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
    console.log('PASS composeWeeklySummary enforces fixed weekly top-level sections');
  } catch (err) {
    failures++;
    console.error('FAIL composeWeeklySummary enforces fixed weekly top-level sections');
    console.error(err.message);
  }

  try {
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
    console.log('PASS composeWeeklySummary uses structured model summary and keeps next_focus grounded');
  } catch (err) {
    failures++;
    console.error('FAIL composeWeeklySummary uses structured model summary and keeps next_focus grounded');
    console.error(err.message);
  }

  try {
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
    console.log('PASS composeWeeklySummary reduces digest when history is missing');
  } catch (err) {
    failures++;
    console.error('FAIL composeWeeklySummary reduces digest when history is missing');
    console.error(err.message);
  }

  try {
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
    console.log('PASS composeWeeklySummary drops watchouts without evidence backing');
  } catch (err) {
    failures++;
    console.error('FAIL composeWeeklySummary drops watchouts without evidence backing');
    console.error(err.message);
  }

  try {
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
    console.log('PASS weekly watchout normalization blocks behavioral labels and prompt-era fields');
  } catch (err) {
    failures++;
    console.error('FAIL weekly watchout normalization blocks behavioral labels and prompt-era fields');
    console.error(err.message);
  }

  try {
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
    console.log('PASS formatSummary renders daily sections with header and urgent reminder');
  } catch (err) {
    failures++;
    console.error('FAIL formatSummary renders daily sections with header and urgent reminder');
    console.error(err.message);
  }

  try {
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
    console.log('PASS formatSummary renders weekly sections with factual watchouts');
  } catch (err) {
    failures++;
    console.error('FAIL formatSummary renders weekly sections with factual watchouts');
    console.error(err.message);
  }

  try {
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
    console.log('PASS formatSummary keeps empty sections compact and Telegram-safe');
  } catch (err) {
    failures++;
    console.error('FAIL formatSummary keeps empty sections compact and Telegram-safe');
    console.error(err.message);
  }

  try {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildDailyCloseProcessedHistoryFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture({ kind: 'daily_close' });

    const result = composeDailyCloseSummary({
      context,
      activeTasks,
      processedHistory,
      rankingResult,
    });

    assert.deepEqual(Object.keys(result.summary), DAILY_CLOSE_SUMMARY_SECTION_KEYS);
    assert.equal(Array.isArray(result.summary.stats), true);
    assert.equal(Array.isArray(result.summary.notices), true);
    console.log('PASS composeDailyCloseSummary enforces fixed daily-close top-level sections');
  } catch (err) {
    failures++;
    console.error('FAIL composeDailyCloseSummary enforces fixed daily-close top-level sections');
    console.error(err.message);
  }

  try {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildDailyCloseProcessedHistoryFixture({ variant: 'meaningful' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture({ kind: 'daily_close' });

    const result = composeDailyCloseSummary({
      context,
      activeTasks,
      processedHistory,
      rankingResult,
    });

    assert.ok(result.summary.stats.includes('Completed: 2'));
    assert.match(result.summary.reflection, /meaningful work/i);
    assert.match(result.summary.reset_cue, /Tomorrow’s restart/i);
    console.log('PASS composeDailyCloseSummary acknowledges meaningful progress without cheerleading');
  } catch (err) {
    failures++;
    console.error('FAIL composeDailyCloseSummary acknowledges meaningful progress without cheerleading');
    console.error(err.message);
  }

  try {
    const activeTasks = buildSummaryActiveTasksFixture({ variant: 'sparse' });
    const processedHistory = buildDailyCloseProcessedHistoryFixture({ variant: 'irregular' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
      ...buildSummaryResolvedStateFixture({ kind: 'daily_close' }),
      generatedAtIso: '2026-03-13T21:00:00Z',
    };

    const result = composeDailyCloseSummary({
      context,
      activeTasks,
      processedHistory,
      rankingResult,
    });

    assert.equal(result.summary.reflection, '');
    assert.ok(result.summary.notices.some((notice) => notice.code === 'irregular_use'));
    assert.ok(result.summary.notices.some((notice) => notice.code === 'sparse_day'));
    assert.equal(/punish|failure|lazy/i.test(result.formattedText), false);
    console.log('PASS composeDailyCloseSummary stays minimal and non-punitive for irregular use');
  } catch (err) {
    failures++;
    console.error('FAIL composeDailyCloseSummary stays minimal and non-punitive for irregular use');
    console.error(err.message);
  }

  try {
    const summary = buildDailyCloseSummaryFixture();
    const { text, telegramSafe } = formatSummary({
      kind: 'daily_close',
      summary,
      context: { urgentMode: false },
    });

    const sectionOrder = ['**Stats**', '**Reflection**', '**Reset cue**', '**Notices**'];
    const positions = sectionOrder.map((label) => text.indexOf(label));

    assert.ok(text.includes('END-OF-DAY REFLECTION'));
    assert.ok(positions.every((pos) => pos >= 0));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
    assert.equal(telegramSafe, true);
    console.log('PASS formatSummary renders daily-close sections in fixed order');
  } catch (err) {
    failures++;
    console.error('FAIL formatSummary renders daily-close sections in fixed order');
    console.error(err.message);
  }

  try {
    assert.equal(containsSensitiveContent('dimpleamesar@gmail.com\nPositive1111!'), true);
    assert.equal(containsSensitiveContent('Buy chicken and onions'), false);
    console.log('PASS sensitive content detection guard');
  } catch (err) {
    failures++;
    console.error('FAIL sensitive content detection guard');
    console.error(err.message);
  }

  try {
    const update = buildTickTickUpdate({
      projectId: 'p1',
      improvedTitle: 'New Title',
      improvedContent: 'New Content',
      suggestedPriority: 3,
      suggestedSchedule: 'today',
      suggestedProjectId: 'p2',
    }, { applyMode: 'metadata-only', priorityLabel: 'career-critical' });
    assert.equal(update.title, undefined);
    assert.equal(update.content, undefined);
    assert.equal(update.priority, 3);
    assert.equal(update.projectId, 'p2');
    assert.equal(typeof update.dueDate, 'string');
    console.log('PASS metadata-only auto-apply write policy');
  } catch (err) {
    failures++;
    console.error('FAIL metadata-only auto-apply write policy');
    console.error(err.message);
  }

  try {
    const due = scheduleToDateTime('today', { priorityLabel: 'career-critical' });
    assert.ok(typeof due === 'string');
    assert.ok(!due.includes('T23:59:00.000'));
    console.log('PASS slot-based scheduling avoids default end-of-day');
  } catch (err) {
    failures++;
    console.error('FAIL slot-based scheduling avoids default end-of-day');
    console.error(err.message);
  }

  try {
    const summarySurfaceSource = readFileSync('services/summary-surfaces/index.js', 'utf8');
    assert.match(summarySurfaceSource, /#\{1,3\}\\s\+/);
    console.log('PASS summary surfaces guard against markdown heading syntax');
  } catch (err) {
    failures++;
    console.error('FAIL summary surfaces guard against markdown heading syntax');
    console.error(err.message);
  }

  try {
    const storeSource = readFileSync('services/store.js', 'utf8');
    assert.ok(storeSource.includes('user:{userId}:work_style_mode'));
    console.log('PASS store schema documents per-user work-style mode key');
  } catch (err) {
    failures++;
    console.error('FAIL store schema documents per-user urgent mode key');
    console.error(err.message);
  }

  try {
    const store = await import('../services/store.js');
    const userId = `regression-work-style-${Date.now()}`;

    assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
    await store.setWorkStyleMode(userId, store.MODE_URGENT);
    assert.equal(await store.getWorkStyleMode(userId), store.MODE_URGENT);
    await store.setWorkStyleMode(userId, store.MODE_STANDARD);
    assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
    console.log('PASS work-style store defaults to standard and persists explicit transitions');
  } catch (err) {
    failures++;
    console.error('FAIL urgent mode store defaults to false and persists boolean toggles');
    console.error(err.message);
  }

  try {
    const userId = `regression-urgent-reset-${Date.now()}`;
    const first = await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiryMs: 1000 });
    const second = await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiryMs: 5000 });

    assert.ok(first.expiresAt);
    assert.ok(second.expiresAt);
    assert.ok(new Date(second.expiresAt).getTime() > new Date(first.expiresAt).getTime());
    console.log('PASS urgent mode activation resets the timer when re-applied');
  } catch (err) {
    failures++;
    console.error('FAIL urgent mode activation resets the timer when re-applied');
    console.error(err.message);
  }

  try {
    const userId = `regression-urgent-expiry-${Date.now()}`;
    await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiresAt: Date.now() - 1000 });
    const state = await store.getWorkStyleState(userId);

    assert.deepEqual(state, { mode: store.MODE_STANDARD, expiresAt: null });
    assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
    console.log('PASS expired urgent mode silently reverts to standard');
  } catch (err) {
    failures++;
    console.error('FAIL expired urgent mode silently reverts to standard');
    console.error(err.message);
  }

  try {
    const userId = `regression-focus-expiry-${Date.now()}`;
    const persistent = await store.setWorkStyleMode(userId, store.MODE_FOCUS);
    assert.equal(persistent.mode, store.MODE_FOCUS);
    assert.equal(persistent.expiresAt || null, null);

    await store.setWorkStyleMode(userId, store.MODE_FOCUS, { expiresAt: Date.now() - 1000 });
    const expired = await store.getWorkStyleState(userId);

    assert.deepEqual(expired, { mode: store.MODE_STANDARD, expiresAt: null });
    assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
    console.log('PASS focus mode defaults to manual deactivation but supports optional auto-expiry');
  } catch (err) {
    failures++;
    console.error('FAIL focus mode defaults to manual deactivation but supports optional auto-expiry');
    console.error(err.message);
  }

  try {
    assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.DAILY_BRIEFING), true);
    assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.WEEKLY_DIGEST), true);
    assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.PENDING_SUPPRESSION), true);
    assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.AUTO_APPLY), true);
    assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.TOKEN_EXPIRED), false);
    assert.equal(shouldSuppressScheduledNotification(store.MODE_FOCUS, SCHEDULER_NOTIFICATION_TYPES.QUOTA_EXHAUSTED), false);
    console.log('PASS focus mode suppresses only non-critical scheduler notifications');
  } catch (err) {
    failures++;
    console.error('FAIL focus mode suppresses only non-critical scheduler notifications');
    console.error(err.message);
  }

  try {
    await store.resetAll();
    const userId = `light-r13-restart-${Date.now()}`;
    await store.setWorkStyleMode(userId, store.MODE_FOCUS);
    const persisted = JSON.parse(readFileSync(new URL('../data/store.json', import.meta.url), 'utf8'));

    assert.equal(persisted.workStyleModes[userId].mode, store.MODE_FOCUS);
    assert.equal(persisted.workStyleModes[userId].expiresAt ?? null, null);
    console.log('PASS work-style mode persists in restart-recoverable storage');
  } catch (err) {
    failures++;
    console.error('FAIL work-style mode persists in restart-recoverable storage');
    console.error(err.message);
  }

  try {
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

    assert.match(standardBriefing, /\*\*Why now\*\*/);
    assert.match(standardBriefing, /Pay rent/);
    assert.doesNotMatch(urgentBriefing, /\*\*Why now\*\*/);
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

    assert.equal(standardResult.confirmationText, '✅ Created: Buy groceries');
    assert.equal(urgentResult.confirmationText, '✅ Buy groceries');
    console.log('PASS urgent mode shortens briefing and task confirmations end-to-end');
  } catch (err) {
    failures++;
    console.error('FAIL urgent mode shortens briefing and task confirmations end-to-end');
    console.error(err.message);
  }

  try {
    const userId = `regression-work-style-telemetry-${Date.now()}`;
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
    assert.equal(payloads[1].eventType, 'mode_deactivated');
    assert.equal(payloads[1].behavioralSignal, false);
    console.log('PASS work-style transitions log as operational telemetry only');
  } catch (err) {
    failures++;
    console.error('FAIL work-style transitions log as operational telemetry only');
    console.error(err.message);
  }

  try {
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
    assert.deepEqual(detectWorkStyleModeIntent("I'm in a rush but let's plan carefully"), {
      type: 'clarify_work_style_mode',
      mode: store.MODE_STANDARD,
      reason: 'mixed_signal',
    });
    assert.equal(detectWorkStyleModeIntent('buy groceries tonight'), null);
    console.log('PASS ax intent detects work-style mode phrases');
  } catch (err) {
    failures++;
    console.error('FAIL ax intent detects urgent mode toggle phrases');
    console.error(err.message);
  }

  try {
    const event = {
      eventType: 'update',
      taskId: 't1',
      dueDateBefore: '2026-04-15T10:00:00Z',
      dueDateAfter: '2026-04-20T10:00:00Z',
      workStyleMode: store.MODE_URGENT,
      previousWorkStyleMode: store.MODE_FOCUS,
      modeEventType: 'mode_activated',
      timestamp: '2026-04-14T10:00:00Z',
    };

    const signals = classifyTaskEvent(event);
    assert.ok(signals.length >= 1);
    for (const signal of signals) {
      assert.equal(signal.metadata.workStyleMode, undefined);
      assert.equal(signal.metadata.previousWorkStyleMode, undefined);
      assert.equal(signal.metadata.modeEventType, undefined);
    }
    console.log('PASS behavioral signals ignore work-style metadata entirely');
  } catch (err) {
    failures++;
    console.error('FAIL behavioral signals ignore work-style metadata entirely');
    console.error(err.message);
  }

  try {
    assert.equal(appendUrgentModeReminder('Base briefing', false), 'Base briefing');
    assert.match(appendUrgentModeReminder('Base briefing', true), /Urgent mode is currently active/i);
    console.log('PASS urgent reminder helper only appends when urgent mode is active');
  } catch (err) {
    failures++;
    console.error('FAIL urgent reminder helper only appends when urgent mode is active');
    console.error(err.message);
  }

  try {
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
          throw new Error('pipeline should not run for work-style commands');
        },
      },
    );

    const replies = [];
    const userId = AUTHORIZED_CHAT_ID || Date.now();
    const baseCtx = {
      chat: { id: userId },
      from: { id: userId },
      reply: async (message) => {
        replies.push(message);
      },
    };

    await store.setWorkStyleMode(userId, store.MODE_STANDARD);
    await handlers.commands.get('focus')(baseCtx);
    assert.equal(await store.getWorkStyleMode(userId), store.MODE_FOCUS);
    await handlers.commands.get('mode')(baseCtx);
    assert.match(replies.at(-1), /Current mode: FOCUS/i);

    const messageHandler = handlers.events.find(({ eventName }) => eventName === 'message:text')?.handler;
    await messageHandler({
      ...baseCtx,
      message: { text: 'what mode am I in' },
    });
    assert.match(replies.at(-1), /Current mode: FOCUS/i);
    console.log('PASS registerCommands handles focus/mode commands and natural-language mode queries');
  } catch (err) {
    failures++;
    console.error('FAIL registerCommands handles focus/mode commands and natural-language mode queries');
    console.error(err.message);
  }

  try {
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
          return { type: 'task', confirmationText: '✅ Done.' };
        },
      },
    );

    const messageHandler = handlers.events.find(({ eventName }) => eventName === 'message:text')?.handler;
    const replies = [];
    const userId = AUTHORIZED_CHAT_ID || `light-r10-mode-${Date.now()}`;
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
    assert.match(replies.at(-1), /✅ Done\./);
    console.log('PASS registerCommands forwards current work-style mode to the pipeline');
  } catch (err) {
    failures++;
    console.error('FAIL registerCommands forwards current work-style mode to the pipeline');
    console.error(err.message);
  }

  try {
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
    const userId = AUTHORIZED_CHAT_ID || `light-r10-clarify-${Date.now()}`;
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
    console.log('PASS registerCommands compresses mutation clarification copy in urgent mode');
  } catch (err) {
    failures++;
    console.error('FAIL registerCommands compresses mutation clarification copy in urgent mode');
    console.error(err.message);
  }

  try {
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
    const userId = AUTHORIZED_CHAT_ID || `regression-mixed-mode-${Date.now()}`;
    await store.setWorkStyleMode(userId, store.MODE_URGENT);

    await messageHandler({
      chat: { id: userId },
      from: { id: userId },
      message: { text: "I'm in a rush but let's plan carefully" },
      reply: async (message) => {
        replies.push(message);
      },
    });

    assert.equal(await store.getWorkStyleMode(userId), store.MODE_STANDARD);
    assert.match(replies[0], /Current mode: STANDARD/i);
    assert.match(replies.at(-1), /Heard mixed mode signals/i);
    console.log('PASS registerCommands defaults mixed mode signals to standard with clarification');
  } catch (err) {
    failures++;
    console.error('FAIL registerCommands defaults mixed mode signals to standard with clarification');
    console.error(err.message);
  }

  try {
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
    console.log('PASS registerCommands uses shared briefing surface and urgent reminder');
  } catch (err) {
    failures++;
    console.error('FAIL registerCommands uses shared briefing surface and urgent reminder');
    console.error(err.message);
  }

  try {
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
        generateReorgProposal: async () => ({ summary: '', actions: [], questions: [] }),
      },
      {
        listActiveTasks: async () => [],
        listProjects: async () => [],
      },
      {},
    );

    const briefingHandler = handlers.commands.get('briefing');
    const replies = [];
    const userId = AUTHORIZED_CHAT_ID || `light-focus-briefing-${Date.now()}`;
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
    console.log('PASS registerCommands still answers manual briefing requests in focus mode');
  } catch (err) {
    failures++;
    console.error('FAIL registerCommands still answers manual briefing requests in focus mode');
    console.error(err.message);
  }

  try {
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
    console.log('PASS registerCommands uses shared weekly surface');
  } catch (err) {
    failures++;
    console.error('FAIL registerCommands uses shared weekly surface');
    console.error(err.message);
  }

  try {
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
        generateReorgProposal: async () => ({ summary: '', actions: [], questions: [] }),
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
    console.log('PASS registerCommands uses shared daily-close surface');
  } catch (err) {
    failures++;
    console.error('FAIL registerCommands uses shared daily-close surface');
    console.error(err.message);
  }

  try {
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
    await handlers.commands.get('daily_close')(ctx);
    await handlers.commands.get('weekly')(ctx);

    assert.ok(replies.some((message) => /quota exhausted/i.test(message)));
    console.log('PASS registerCommands short-circuits on quota exhaustion');
  } catch (err) {
    failures++;
    console.error('FAIL registerCommands short-circuits on quota exhaustion');
    console.error(err.message);
  }

  try {
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
    console.log('PASS runDailyBriefingJob uses shared summary surface and preserves pending reminder wrapper');
  } catch (err) {
    failures++;
    console.error('FAIL runDailyBriefingJob uses shared summary surface and preserves pending reminder wrapper');
    console.error(err.message);
  }

  try {
    await store.resetAll();
    const userId = `scheduler-focus-daily-${Date.now()}`;
    await store.setChatId(userId);
    await store.setWorkStyleMode(userId, store.MODE_FOCUS);

    let summaryCalls = 0;
    const ran = await runDailyBriefingJob({
      bot: { api: { sendMessage: async () => { throw new Error('sendMessage should not run in focus mode'); } } },
      ticktick: { isAuthenticated: () => true },
      adapter: { listActiveTasks: async () => { throw new Error('adapter should not be called in focus mode'); } },
      gemini: {
        isQuotaExhausted: () => false,
        generateDailyBriefingSummary: async () => {
          summaryCalls += 1;
          return { formattedText: 'should not happen' };
        },
      },
    });

    assert.equal(ran, false);
    assert.equal(summaryCalls, 0);
    console.log('PASS runDailyBriefingJob suppresses scheduled briefings in focus mode');
  } catch (err) {
    failures++;
    console.error('FAIL runDailyBriefingJob suppresses scheduled briefings in focus mode');
    console.error(err.message);
  }

  try {
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
    console.log('PASS runWeeklyDigestJob uses shared weekly surface and keeps processed history input');
  } catch (err) {
    failures++;
    console.error('FAIL runWeeklyDigestJob uses shared weekly surface and keeps processed history input');
    console.error(err.message);
  }

  try {
    await store.resetAll();
    const userId = `scheduler-focus-weekly-${Date.now()}`;
    await store.setChatId(userId);
    await store.setWorkStyleMode(userId, store.MODE_FOCUS);

    let summaryCalls = 0;
    const ran = await runWeeklyDigestJob({
      bot: { api: { sendMessage: async () => { throw new Error('sendMessage should not run in focus mode'); } } },
      ticktick: { isAuthenticated: () => true },
      adapter: { listActiveTasks: async () => { throw new Error('adapter should not be called in focus mode'); } },
      gemini: {
        isQuotaExhausted: () => false,
        generateWeeklyDigestSummary: async () => {
          summaryCalls += 1;
          return { formattedText: 'should not happen' };
        },
      },
      processedTasks: {},
    });

    assert.equal(ran, false);
    assert.equal(summaryCalls, 0);
    console.log('PASS runWeeklyDigestJob suppresses scheduled briefings in focus mode');
  } catch (err) {
    failures++;
    console.error('FAIL runWeeklyDigestJob suppresses scheduled briefings in focus mode');
    console.error(err.message);
  }

  try {
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
    console.log('PASS runWeeklyDigestJob passes historyAvailable false when processed history is missing');
  } catch (err) {
    failures++;
    console.error('FAIL runWeeklyDigestJob passes historyAvailable false when processed history is missing');
    console.error(err.message);
  }

  try {
    const requiredMethods = [
      'createTask',
      'updateTask',
      'completeTask',
      'deleteTask',
      'listProjects',
      'findProjectByName',
    ];

    for (const methodName of requiredMethods) {
      assert.equal(typeof TickTickAdapter.prototype[methodName], 'function', `${methodName} should be exposed`);
    }

    if (Object.hasOwn(TickTickAdapter.prototype, 'createTasksBatch')) {
      assert.equal(typeof TickTickAdapter.prototype.createTasksBatch, 'function');
    }

    console.log('PASS TickTickAdapter exposes the required task operation surface');
  } catch (err) {
    failures++;
    console.error('FAIL TickTickAdapter exposes the required task operation surface');
    console.error(err.message);
  }

  try {
    let updatePayload = null;
    const client = Object.create(TickTickClient.prototype);
    client.getTask = async () => ({
      id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      projectId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      content: '',
      priority: 0,
      status: 0,
    });
    client.updateTask = async (_taskId, payload) => {
      updatePayload = payload;
      return { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', ...payload };
    };

    const adapter = new TickTickAdapter(client);
    await adapter.updateTask('aaaaaaaaaaaaaaaaaaaaaaaa', {
      originalProjectId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      dueDate: '2026-03-11T09:30:00.000+0000',
    });

    assert.equal(updatePayload.projectId, 'bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(updatePayload.dueDate, '2026-03-11T09:30:00.000+0000');
    assert.equal(Object.hasOwn(updatePayload, 'originalProjectId'), false);
    console.log('PASS TickTickAdapter includes projectId for due-date-only updates');
  } catch (err) {
    failures++;
    console.error('FAIL TickTickAdapter includes projectId for due-date-only updates');
    console.error(err.message);
  }

  // T035: Checklist adapter unit tests
  try {
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
    assert.equal(createPayload.items[1].sortOrder, 1, 'sortOrder should be 1');
    console.log('PASS TickTickAdapter createTask includes items when checklistItems provided');
  } catch (err) {
    failures++;
    console.error('FAIL TickTickAdapter createTask includes items when checklistItems provided');
    console.error(err.message);
  }

  try {
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
    console.log('PASS TickTickAdapter createTask omits items when checklistItems is empty');
  } catch (err) {
    failures++;
    console.error('FAIL TickTickAdapter createTask omits items when checklistItems is empty');
    console.error(err.message);
  }

  try {
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
    assert.equal(Object.hasOwn(createPayload, 'items'), false, 'items should NOT be present for ordinary create');
    console.log('PASS TickTickAdapter createTask preserves ordinary create without checklistItems');
  } catch (err) {
    failures++;
    console.error('FAIL TickTickAdapter createTask preserves ordinary create without checklistItems');
    console.error(err.message);
  }

  try {
    const adapterCalls = [];
    const telemetryEvents = [];
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
        extractIntents: async () => [{ type: 'create' }, { type: 'create' }],
      },
      normalizer: {
        normalizeActions: () => ([
          { type: 'create', title: 'Draft proposal', projectId: 'inbox', valid: true, validationErrors: [] },
          { type: 'create', title: 'Follow-up task', projectId: 'inbox', valid: true, validationErrors: [] },
        ]),
      },
      adapter: {
        listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
        listActiveTasks: async () => [],
        createTask: async (action) => {
          adapterCalls.push(['createTask', action.title]);
          // First create succeeds, second create fails
          if (adapterCalls.filter(c => c[0] === 'createTask').length === 1) {
            return { id: 'created-1', projectId: action.projectId };
          }
          throw new Error('TickTick unavailable');
        },
        deleteTask: async (taskId, projectId) => {
          adapterCalls.push(['deleteTask', taskId, projectId]);
          return { deleted: true, taskId, projectId };
        },
      },
      observability: createPipelineObservability({
        eventSink: async (event) => {
          telemetryEvents.push(event);
        },
        logger: null,
      }),
    });

    const result = await pipeline.processMessage('Draft proposal and follow-up', {
      requestId: 'regression-rollback-success',
      entryPoint: 'telegram',
      mode: 'interactive',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'adapter');
    assert.equal(result.failure.rolledBack, true);
    assert.equal(result.results[0].status, 'rolled_back');
    assert.equal(result.results[0].rollbackStep.type, 'delete_created');
    assert.equal(result.results[1].status, 'failed');
    assert.equal(result.results[1].attempts, 2);
    assert.deepEqual(
      adapterCalls,
      [
        ['createTask', 'Draft proposal'],
        ['createTask', 'Follow-up task'],
        ['createTask', 'Follow-up task'],
        ['deleteTask', 'created-1', 'inbox'],
      ],
    );
    assert.ok(
      telemetryEvents.some((event) =>
        event.eventType === 'pipeline.rollback.succeeded'
        && event.metadata.rollbackType === 'delete_created'
        && event.rolledBack === true),
    );
    console.log('PASS pipeline retries once and rolls back earlier successful writes');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline retries once and rolls back earlier successful writes');
    console.error(err.message);
  }

  try {
    const telemetryEvents = [];
    let completeCallCount = 0;
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
        completeCallCount++;
        if (completeCallCount === 1) return { completed: true, taskId, projectId };
        throw new Error('Complete failed — triggering rollback');
      },
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
        extractIntents: async () => [{ type: 'complete', taskId: 'task-1' }, { type: 'complete', taskId: 'task-2' }],
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

    const result = await pipeline.processMessage('Complete both tasks', {
      requestId: 'regression-rollback-failure',
      entryPoint: 'telegram',
      mode: 'interactive',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'rollback');
    assert.equal(result.failure.rolledBack, false);
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
    console.log('PASS pipeline classifies rollback failures when compensation is unsupported');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline classifies rollback failures when compensation is unsupported');
    console.error(err.message);
  }

  try {
    const telemetryEvents = [];
    const observability = createPipelineObservability({
      eventSink: async (event) => {
        telemetryEvents.push(event);
      },
      logger: null,
    });

    await observability.emit(
      { requestId: 'regression-telemetry', entryPoint: 'telegram', mode: 'scan' },
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
    console.log('PASS pipeline observability normalizes telegram entry points for sink events');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline observability normalizes telegram entry points for sink events');
    console.error(err.message);
  }
  try {
    const input = '**Start now**: Do the task\n\n#######';
    const html = parseTelegramMarkdownToHTML(input);
    assert.ok(html.includes('<b>Start now</b>:'));
    assert.ok(html.includes('────────'));
    console.log('PASS markdown parser hash-divider normalization');
  } catch (err) {
    failures++;
    console.error('FAIL markdown parser hash-divider normalization');
    console.error(err.message);
  }



  try {
    const calls = [];
    const ticktick = {
      updateTask: async (taskId, changes) => {
        calls.push({ taskId, changes });
        return { id: taskId };
      },
      completeTask: async () => { },
      createTask: async () => { }
    };

    const currentTasks = [
      { id: 't-1', title: 'Netflix System Design', projectId: 'p-inbox', projectName: 'Inbox', priority: 0, status: 0 },
    ];

    const result = await executeActions([], ticktick, currentTasks, {
      enforcePolicySweep: true,
      projects: [
        { id: 'p-inbox', name: 'Inbox' },
        { id: 'p-career', name: 'Career' },
      ],
    });

    assert.ok(result.outcomes.some((o) => o.includes('Policy sweep appended 1 action')));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].changes.projectId, 'p-career');
    assert.ok([1, 3, 5].includes(calls[0].changes.priority));
    console.log('PASS reorg policy sweep enforces non-zero priority and inbox move');
  } catch (err) {
    failures++;
    console.error('FAIL reorg policy sweep enforces non-zero priority and inbox move');
    console.error(err.message);
  }

  try {
    const calls = [];
    const ticktick = {
      updateTask: async (taskId, changes) => {
        calls.push({ taskId, changes });
        return { id: taskId };
      },
      completeTask: async () => { },
      createTask: async () => { }
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
    console.log('PASS policy sweep inherits urgent maintenance priority from shared ranking');
  } catch (err) {
    failures++;
    console.error('FAIL policy sweep inherits urgent maintenance priority from shared ranking');
    console.error(err.message);
  }

  try {
    const analyzer = new GeminiAnalyzer(['dummy-key']);
    const invalidErr = { status: 403, message: 'Your API key was reported as leaked.' };
    const repaired = analyzer._safeParseJson("{summary:'ok',actions:[{type:'update',taskId:'1',changes:{priority:3,}},],}");

    assert.equal(analyzer._isInvalidApiKeyError(invalidErr), true);
    assert.equal(repaired.summary, 'ok');
    assert.equal(repaired.actions[0].changes.priority, 3);
    console.log('PASS Gemini invalid-key classification and JSON repair parser');
  } catch (err) {
    failures++;
    console.error('FAIL Gemini invalid-key classification and JSON repair parser');
    console.error(err.message);
  }

  try {
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
        }
      }),
      'noop prompt'
    );

    assert.equal(analyzer._activeKeyIndex, 1);
    assert.ok(result?.response);
    console.log('PASS Gemini failover rotates on invalid keys');
  } catch (err) {
    failures++;
    console.error('FAIL Gemini failover rotates on invalid keys');
    console.error(err.message);
  }

  try {
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
    console.log('PASS Gemini briefing preparation uses shared ranking');
  } catch (err) {
    failures++;
    console.error('FAIL Gemini briefing preparation uses shared ranking');
    console.error(err.message);
  }

  try {
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
    console.log('PASS summary log payload normalizes diagnostics field names');
  } catch (err) {
    failures++;
    console.error('FAIL summary log payload normalizes diagnostics field names');
    console.error(err.message);
  }

  try {
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
    console.log('PASS daily summary parity matches across manual and scheduler paths');
  } catch (err) {
    failures++;
    console.error('FAIL daily summary parity matches across manual and scheduler paths');
    console.error(err.message);
  }

  try {
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
    console.log('PASS weekly summary parity matches across manual and scheduler paths');
  } catch (err) {
    failures++;
    console.error('FAIL weekly summary parity matches across manual and scheduler paths');
    console.error(err.message);
  }

  try {
    const source = readFileSync(new URL('../services/gemini.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /async generateDailyBriefing\s*\(/);
    assert.doesNotMatch(source, /async generateWeeklyDigest\s*\(/);
    console.log('PASS Gemini no longer exposes legacy formatted-string summary wrappers');
  } catch (err) {
    failures++;
    console.error('FAIL Gemini no longer exposes legacy formatted-string summary wrappers');
    console.error(err.message);
  }

  try {
    assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /STANDARD MODE is active/i);
    assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /When confidence is low, label uncertainty, ask, or stay quiet/i);
    assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /Use silent signals first/i);
    assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /Direct call-outs only when repeated evidence justifies them/i);
    assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /adapt or back off instead of escalating/i);
    assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /FOCUS MODE is active/i);
    assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /surface only critical items/i);
    assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /When confidence is low, label uncertainty, ask, or stay quiet/i);
    assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /Use silent signals first/i);
    assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /Direct call-outs only when repeated evidence justifies them/i);
    assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /adapt or back off instead of escalating/i);
    assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /URGENT MODE is active/i);
    assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /do not mutate TickTick state unless the user explicitly asks/i);
    assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /When confidence is low, label uncertainty, ask, or stay quiet/i);
    assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Urgent mode does not lower the confidence threshold for behavioral claims/i);
    assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Use silent signals first/i);
    assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Direct call-outs only when repeated evidence justifies them/i);
    assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Strict commands are allowed only because urgent mode was explicitly activated/i);
    assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /adapt or back off instead of escalating/i);
    assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Do not skip validation or safety checks/i);
    assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Strip only formatting niceties; preserve substantive content/i);
    console.log('PASS buildWorkStylePromptNote returns mode-specific prompt augmentation');
  } catch (err) {
    failures++;
    console.error('FAIL buildWorkStylePromptNote returns mode-specific prompt augmentation');
    console.error(err.message);
  }

  try {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildSummaryProcessedHistoryFixture();
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
      ...buildSummaryResolvedStateFixture(),
      kind: 'weekly',
      workStyleMode: store.MODE_STANDARD,
    };

    const result = composeWeeklySummary({
      context,
      activeTasks,
      processedHistory,
      historyAvailable: true,
      rankingResult,
    });

    assert.equal(result.summary.notices.some((notice) => notice.code === 'engagement_pattern'), false);
    console.log('PASS composeWeeklySummary stays silent on a single ignored suggestion');
  } catch (err) {
    failures++;
    console.error('FAIL composeWeeklySummary stays silent on a single ignored suggestion');
    console.error(err.message);
  }

  try {
    const activeTasks = buildSummaryActiveTasksFixture();
    const processedHistory = buildSummaryProcessedHistoryFixture({ variant: 'repeated_ignored' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = {
      ...buildSummaryResolvedStateFixture(),
      kind: 'weekly',
      workStyleMode: store.MODE_STANDARD,
    };

    const result = composeWeeklySummary({
      context,
      activeTasks,
      processedHistory,
      historyAvailable: true,
      rankingResult,
    });

    const notice = result.summary.notices.find((item) => item.code === 'engagement_pattern');
    assert.ok(notice);
    assert.match(notice.message, /keep the next step smaller|pause instead of escalating/i);
    console.log('PASS composeWeeklySummary surfaces engagement notice after repeated ignored guidance');
  } catch (err) {
    failures++;
    console.error('FAIL composeWeeklySummary surfaces engagement notice after repeated ignored guidance');
    console.error(err.message);
  }

  try {
    const activeTasks = buildSummaryActiveTasksFixture({ variant: 'sparse' });
    const processedHistory = buildDailyCloseProcessedHistoryFixture({ variant: 'backoff' });
    const rankingResult = buildSummaryRankingFixture(activeTasks);
    const context = buildSummaryResolvedStateFixture({
      kind: 'daily_close',
      workStyleMode: store.MODE_STANDARD,
    });

    const result = composeDailyCloseSummary({
      context,
      activeTasks,
      processedHistory,
      rankingResult,
    });

    assert.match(result.summary.reflection, /keep tomorrow smaller|pause instead of escalating/i);
    assert.ok(result.summary.notices.some((notice) => notice.code === 'engagement_pattern'));
    console.log('PASS composeDailyCloseSummary backs off after repeated ignored guidance');
  } catch (err) {
    failures++;
    console.error('FAIL composeDailyCloseSummary backs off after repeated ignored guidance');
    console.error(err.message);
  }

  try {
    const summary = buildWeeklySummaryFixture();
    const standard = formatSummary({
      kind: 'weekly',
      summary,
      context: buildSummaryResolvedStateFixture({ kind: 'weekly', workStyleMode: store.MODE_STANDARD }),
    }).text;
    const urgent = formatSummary({
      kind: 'weekly',
      summary,
      context: buildSummaryResolvedStateFixture({ kind: 'weekly', workStyleMode: store.MODE_URGENT }),
    }).text;

    assert.match(standard, /\*\*Carry forward\*\*/);
    assert.match(standard, /\*\*Notices\*\*/);
    assert.doesNotMatch(urgent, /\*\*Carry forward\*\*/);
    assert.doesNotMatch(urgent, /\*\*Notices\*\*/);
    assert.match(urgent, /\*\*Watchouts\*\*/);
    console.log('PASS formatSummary shortens weekly output in urgent mode');
  } catch (err) {
    failures++;
    console.error('FAIL formatSummary shortens weekly output in urgent mode');
    console.error(err.message);
  }

  try {
    const ambiguousHarness = createPipelineHarness({
      intents: [{ type: 'update', title: 'Weekly update', confidence: 0.9, targetQuery: 'weekly' }],
      activeTasks: [
        { id: 't1', title: 'Write weekly report', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
        { id: 't2', title: 'Review weekly metrics', projectId: 'p1', projectName: 'Career', priority: 3, status: 0 },
      ],
    });
    const urgentClarification = await ambiguousHarness.processMessage('update weekly', { workStyleMode: store.MODE_URGENT });
    const standardClarification = await ambiguousHarness.processMessage('update weekly', { workStyleMode: store.MODE_STANDARD });
    assert.equal(urgentClarification.type, 'clarification');
    assert.equal(standardClarification.type, 'clarification');
    assert.equal(urgentClarification.clarification.reason, 'ambiguous_target');
    assert.equal(standardClarification.clarification.reason, 'ambiguous_target');
    assert.match(urgentClarification.confirmationText, /^Which task\?/);
    assert.match(standardClarification.confirmationText, /^Which task did you mean\?/);
    assert.match(urgentClarification.confirmationText, /Write weekly report/);
    assert.match(urgentClarification.confirmationText, /Review weekly metrics/);
    assert.equal(ambiguousHarness.adapterCalls.update.length, 0);

    const invalidHarness = createPipelineHarness({
      intents: [{ type: 'create', title: '', confidence: 0.8 }],
    });
    const urgentFailure = await invalidHarness.processMessage('create broken task', { workStyleMode: store.MODE_URGENT });
    const standardFailure = await invalidHarness.processMessage('create broken task', { workStyleMode: store.MODE_STANDARD });
    assert.equal(urgentFailure.confirmationText, '⚠️ I could not validate the task details. Please clarify and retry.');
    assert.equal(standardFailure.confirmationText, '⚠️ I could not validate the task details. Please clarify and retry.');

    const weeklySummary = {
      progress: ['Closed architecture PR', 'Protected deep-work block', 'Paid rent'],
      carry_forward: [
        { title: 'Reschedule mock interview', reason: 'Needs a fresh slot' },
        { title: 'Refine portfolio bullets', reason: 'Still worth doing soon' },
      ],
      next_focus: ['Finish interview prep pack', 'Protect backend study block', 'Clean inbox'],
      watchouts: [
        { label: 'Overdue tasks accumulating', evidence: '4 tasks slipped this week' },
      ],
      notices: [{ severity: 'info', message: 'History coverage is partial.' }],
    };
    const urgentWeekly = formatSummary({
      kind: 'weekly',
      summary: weeklySummary,
      context: { workStyleMode: store.MODE_URGENT, urgentMode: true },
    }).text;
    assert.match(urgentWeekly, /Closed architecture PR/);
    assert.match(urgentWeekly, /Protected deep-work block/);
    assert.match(urgentWeekly, /Finish interview prep pack/);
    assert.match(urgentWeekly, /Protect backend study block/);
    assert.match(urgentWeekly, /Overdue tasks accumulating: 4 tasks slipped this week/);
    assert.doesNotMatch(urgentWeekly, /Carry forward/i);
    assert.doesNotMatch(urgentWeekly, /Notices/i);
    console.log('PASS urgent mode trims niceties without skipping safety or substance');
  } catch (err) {
    failures++;
    console.error('FAIL urgent mode trims niceties without skipping safety or substance');
    console.error(err.message);
  }

  try {
    const creationHarness = createPipelineHarness({
      intents: [{ type: 'create', title: 'Buy groceries', confidence: 0.9 }],
    });
    const standardTask = await creationHarness.processMessage('buy groceries', { workStyleMode: store.MODE_STANDARD });
    const urgentTask = await creationHarness.processMessage('buy groceries', { workStyleMode: store.MODE_URGENT });
    assert.equal(standardTask.confirmationText, '✅ Created: Buy groceries');
    assert.equal(urgentTask.confirmationText, '✅ Buy groceries');

    const clarificationHarness = createPipelineHarness({
      intents: [{ type: 'update', title: 'Weekly update', confidence: 0.9, targetQuery: 'weekly' }],
      activeTasks: [
        { id: 't1', title: 'Write weekly report', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
        { id: 't2', title: 'Review weekly metrics', projectId: 'p1', projectName: 'Career', priority: 3, status: 0 },
      ],
    });
    const standardClarification = await clarificationHarness.processMessage('update weekly', { workStyleMode: store.MODE_STANDARD });
    const urgentClarification = await clarificationHarness.processMessage('update weekly', { workStyleMode: store.MODE_URGENT });
    assert.match(standardClarification.confirmationText, /^Which task did you mean\?/);
    assert.match(standardClarification.confirmationText, /Write weekly report/);
    assert.match(standardClarification.confirmationText, /Review weekly metrics/);
    assert.match(urgentClarification.confirmationText, /^Which task\?/);
    assert.match(urgentClarification.confirmationText, /Write weekly report/);
    assert.match(urgentClarification.confirmationText, /Review weekly metrics/);

    const failureHarness = createPipelineHarness({
      intents: [{ type: 'create', title: 'Buy groceries', confidence: 0.9 }],
      useRealNormalizer: false,
      normalizedActions: [{ valid: false, validationErrors: ['missing title'] }],
    });
    const standardFailure = await failureHarness.processMessage('buy groceries', { workStyleMode: store.MODE_STANDARD });
    const urgentFailure = await failureHarness.processMessage('buy groceries', { workStyleMode: store.MODE_URGENT });
    assert.equal(standardFailure.confirmationText, '⚠️ I could not validate the task details. Please clarify and retry.');
    assert.equal(urgentFailure.confirmationText, standardFailure.confirmationText);
    console.log('PASS pipeline calibrates confirmation and clarification verbosity without weakening errors');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline calibrates confirmation and clarification verbosity without weakening errors');
    console.error(err.message);
  }

  try {
    await store.resetAll();
    const userId = `urgent-clarification-${Date.now()}`;
    await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiryMs: store.DEFAULT_URGENT_EXPIRY_MS });

    const harness = createPipelineHarness({
      intents: [{ type: 'update', title: 'Weekly update', confidence: 0.9, targetQuery: 'weekly' }],
      activeTasks: [
        { id: 't1', title: 'Write weekly report', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
        { id: 't2', title: 'Review weekly metrics', projectId: 'p1', projectName: 'Career', priority: 3, status: 0 },
      ],
    });

    const result = await harness.processMessage('update weekly');
    assert.equal(await store.getWorkStyleMode(userId), store.MODE_URGENT);
    assert.equal(result.type, 'clarification');
    assert.equal(result.clarification.reason, 'ambiguous_target');
    assert.equal(harness.adapterCalls.update.length, 0);
    console.log('PASS urgent mode still requires clarification for ambiguous mutations');
  } catch (err) {
    failures++;
    console.error('FAIL urgent mode still requires clarification for ambiguous mutations');
    console.error(err.message);
  }

  try {
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
    console.log('PASS Gemini fallback reorg routes recovery work to Health');
  } catch (err) {
    failures++;
    console.error('FAIL Gemini fallback reorg routes recovery work to Health');
    console.error(err.message);
  }

  try {
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
    console.log('PASS Gemini reorg normalization inherits shared recovery routing');
  } catch (err) {
    failures++;
    console.error('FAIL Gemini reorg normalization inherits shared recovery routing');
    console.error(err.message);
  }

  try {
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
      ],
    );
    console.log('PASS execution prioritization parses explicit goal themes');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization parses explicit goal themes');
    console.error(err.message);
  }

  try {
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
    console.log('PASS execution prioritization normalizes candidates');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization normalizes candidates');
    console.error(err.message);
  }

  try {
    const goalThemeProfile = createGoalThemeProfile('', { source: 'fallback' });
    const context = buildRankingContext({ goalThemeProfile });
    const ranked = [
      createRankingDecision({
        taskId: 'task-1',
        rank: 1,
        scoreBand: 'top',
        rationaleCode: 'fallback',
        rationaleText: 'Possible next candidate under degraded goal context.',
        inferenceConfidence: 'weak',
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
    assert.equal(result.topRecommendation.inferenceConfidence, 'weak');
    console.log('PASS execution prioritization returns degraded recommendation results');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization returns degraded recommendation results');
    console.error(err.message);
  }

  try {
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
    console.log('PASS execution prioritization favors meaningful work over admin');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization favors meaningful work over admin');
    console.error(err.message);
  }

  try {
    const candidates = [
      normalizePriorityCandidate({
        id: 'task-bill',
        title: 'Review electricity bill',
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
    assert.equal(result.ranked[0].inferenceConfidence, 'weak');
    assert.match(result.ranked[0].rationaleText, /(Possible next candidate|Potentially consequential admin)/i);
    console.log('PASS execution prioritization marks degraded fallback for weak goals');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization marks degraded fallback for weak goals');
    console.error(err.message);
  }

  try {
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
    console.log('PASS execution prioritization tolerates unknown state inputs');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization tolerates unknown state inputs');
    console.error(err.message);
  }

  try {
    const context = buildRankingContext({
      goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
      nowIso: '2026-03-10T10:00:00Z',
      workStyleMode: store.MODE_URGENT,
      urgentMode: true,
    });
    const candidates = [
      normalizePriorityCandidate({
        id: 'task-medium-urgency',
        title: 'Review rent reminder',
        projectId: 'admin',
        projectName: 'Admin',
        dueDate: '2026-03-11',
        status: 0,
      }),
    ];

    const result = rankPriorityCandidatesForTest(candidates, context);

    assert.equal(result.context.behavioralInferenceThreshold, 'strong');
    assert.equal(result.topRecommendation.rationaleCode, 'fallback');
    assert.equal(result.topRecommendation.inferenceConfidence, 'weak');
    assert.match(result.topRecommendation.rationaleText, /(Possible next candidate under degraded goal context\.|Potentially consequential admin surfaced under degraded goal context\.)/i);
    console.log('PASS urgent mode keeps the inference threshold strong');
  } catch (err) {
    failures++;
    console.error('FAIL urgent mode keeps the inference threshold strong');
    console.error(err.message);
  }

  try {
    const context = buildRankingContext({
      goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
    });

    assert.equal(context.nowIso, null);
    console.log('PASS execution prioritization keeps nowIso explicit');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization keeps nowIso explicit');
    console.error(err.message);
  }

  try {
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
    console.log('PASS execution prioritization parses mixed goal formatting');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization parses mixed goal formatting');
    console.error(err.message);
  }

  try {
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
    console.log('PASS execution prioritization respects GOALS section boundaries');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization respects GOALS section boundaries');
    console.error(err.message);
  }

  try {
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
    console.log('PASS execution prioritization caps multi-theme matching');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization caps multi-theme matching');
    console.error(err.message);
  }

  try {
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
    console.log('PASS execution prioritization ignores timezone-ambiguous due dates');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization ignores timezone-ambiguous due dates');
    console.error(err.message);
  }

  try {
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
    console.log('PASS execution prioritization elevates blocker removal');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization elevates blocker removal');
    console.error(err.message);
  }

  try {
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
    console.log('PASS execution prioritization elevates urgent maintenance');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization elevates urgent maintenance');
    console.error(err.message);
  }

  try {
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
      workStyleMode: 'standard',
      stateSource: 'store',
    });

    const result = rankPriorityCandidatesForTest(candidates, context);

    assert.equal(result.topRecommendation.taskId, 'task-urgent-admin');
    assert.equal(result.context.urgentMode, true);
    assert.equal(result.context.workStyleMode, 'standard');
    console.log('PASS execution prioritization boosts urgent tasks when urgent mode is active');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization boosts urgent tasks when urgent mode is active');
    console.error(err.message);
  }

  try {
    const context = buildRankingContext({
      goalThemeProfile: createGoalThemeProfile(`GOALS:
1. Land a senior backend role`, { source: 'user_context' }),
      workStyleMode: 'focus',
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
    console.log('PASS execution prioritization elevates capacity protection');
  } catch (err) {
    failures++;
    console.error('FAIL execution prioritization elevates capacity protection');
    console.error(err.message);
  }

  try {
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
    console.log('PASS pipeline context resolves dentist Thursday through the normalizer path');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline context resolves dentist Thursday through the normalizer path');
    console.error(err.message);
  }

  try {
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
    assert.equal(adapterCalls.create[0].projectId, DEFAULT_PROJECTS[0].id);
    assert.equal(adapterCalls.create[0].dueDate, null);
    console.log('PASS pipeline context keeps undated groceries in default project');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline context keeps undated groceries in default project');
    console.error(err.message);
  }

  try {
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
    console.log('PASS pipeline context keeps date-only currentDate stable in negative-offset timezones');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline context keeps date-only currentDate stable in negative-offset timezones');
    console.error(err.message);
  }

  try {
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
    console.log('PASS pipeline context resolves project hints from available projects');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline context resolves project hints from available projects');
    console.error(err.message);
  }

  try {
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
    console.log('PASS pipeline fails safely on malformed AX output');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline fails safely on malformed AX output');
    console.error(err.message);
  }

  try {
    const { processMessage } = createPipelineHarness({ intents: [] });

    const result = await processMessage('just chatting', {
      requestId: 'req-empty-intents',
      entryPoint: 'telegram',
      mode: 'interactive',
    });

    assert.equal(result.type, 'non-task');
    assert.equal(result.nonTaskReason, 'empty_intents');
    assert.equal(result.results.length, 0);
    console.log('PASS pipeline returns non-task for empty intent lists');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline returns non-task for empty intent lists');
    console.error(err.message);
  }

  try {
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
    console.log('PASS pipeline treats hello as conversational non-task without writes');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline treats hello as conversational non-task without writes');
    console.error(err.message);
  }

  try {
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
    console.log('PASS pipeline returns validation failure when all normalized actions are invalid');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline returns validation failure when all normalized actions are invalid');
    console.error(err.message);
  }

  try {
    const quotaError = new QuotaExhaustedError('All API keys exhausted');
    const pipeline = createPipeline({
      axIntent: {
        extractIntents: async () => {
          throw quotaError;
        },
      },
      normalizer: { normalizeActions: () => [] },
      adapter: {
        listProjects: async () => DEFAULT_PROJECTS,
        listActiveTasks: async () => [],
      },
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
    console.log('PASS pipeline classifies quota failures from AX extraction');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline classifies quota failures from AX extraction');
    console.error(err.message);
  }

  try {
    const pipeline = createPipeline({
      axIntent: {
        extractIntents: async () => [{ type: 'create', title: 'Boom' }],
      },
      normalizer: {
        normalizeActions: () => {
          throw new Error('Normalizer exploded');
        },
      },
      adapter: {
        listProjects: async () => DEFAULT_PROJECTS,
        listActiveTasks: async () => [],
      },
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
    console.log('PASS pipeline classifies unexpected normalization errors');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline classifies unexpected normalization errors');
    console.error(err.message);
  }

  try {
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
    console.log('PASS createAxIntent rotates configured keys before final quota failure');
  } catch (err) {
    failures++;
    console.error('FAIL createAxIntent rotates configured keys before final quota failure');
    console.error(err.message);
  }

  try {
    const telemetryEvents = [];
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
      adapter: {
        listProjects: async () => DEFAULT_PROJECTS,
        listActiveTasks: async () => [],
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
      },
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
    console.log('PASS burst pipeline requests remain isolated and deterministic');
  } catch (err) {
    failures++;
    console.error('FAIL burst pipeline requests remain isolated and deterministic');
    console.error(err.message);
  }

  try {
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

    console.log('PASS pipeline happy path covers task operations and non-task routing');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline happy path covers task operations and non-task routing');
    console.error(err.message);
  }

  // ─── WP04: Mutation routing regression tests ───

  try {
    const harness = createPipelineHarness({
      intents: [
        { type: 'update', title: 'Weekly report', confidence: 0.9, targetQuery: 'weekly report' },
      ],
      activeTasks: [
        { id: 'task000000000000000000010', title: 'Write weekly report', projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa', projectName: 'Inbox', priority: 5, dueDate: null, content: null, status: 0 },
      ],
    });
    const result = await harness.processMessage('update the weekly report');
    assert.equal(result.type, 'task');
    assert.equal(result.actions[0].type, 'update');
    assert.equal(result.actions[0].taskId, 'task000000000000000000010');
    assert.equal(harness.adapterCalls.update.length, 1);
    console.log('PASS mutation routing resolves exact-match update target');
  } catch (err) {
    failures++;
    console.error('FAIL mutation routing resolves exact-match update target');
    console.error(err.message);
  }

  try {
    const harness = createPipelineHarness({
      intents: [
        { type: 'update', title: 'report', confidence: 0.9, targetQuery: 'report' },
      ],
      activeTasks: [
        { id: 'task001', title: 'Write weekly report', projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa', projectName: 'Inbox', priority: 5, dueDate: null, content: null, status: 0 },
        { id: 'task002', title: 'Monthly report', projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa', projectName: 'Inbox', priority: 3, dueDate: null, content: null, status: 0 },
      ],
    });
    const result = await harness.processMessage('update the report');
    assert.equal(result.type, 'clarification');
    assert.ok(result.confirmationText.includes('Which task did you mean?'));
    assert.equal(result.clarification.candidates.length, 2);
    assert.equal(harness.adapterCalls.update.length, 0);
    console.log('PASS mutation routing returns clarification for ambiguous target');
  } catch (err) {
    failures++;
    console.error('FAIL mutation routing returns clarification for ambiguous target');
    console.error(err.message);
  }

  try {
    const harness = createPipelineHarness({
      intents: [
        { type: 'complete', title: 'nonexistent task', confidence: 0.9, targetQuery: 'nonexistent task' },
      ],
      activeTasks: [
        { id: 'task001', title: 'Write weekly report', projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa', projectName: 'Inbox', priority: 5, dueDate: null, content: null, status: 0 },
      ],
    });
    const result = await harness.processMessage('complete nonexistent task');
    assert.equal(result.type, 'not-found');
    assert.match(result.confirmationText, /Couldn't find/);
    assert.equal(harness.adapterCalls.complete.length, 0);
    console.log('PASS mutation routing returns not-found for missing target');
  } catch (err) {
    failures++;
    console.error('FAIL mutation routing returns not-found for missing target');
    console.error(err.message);
  }

  try {
    const harness = createPipelineHarness({
      intents: [
        { type: 'create', title: 'New task', confidence: 0.9 },
        { type: 'update', title: 'Weekly report', confidence: 0.9, targetQuery: 'weekly report' },
      ],
      activeTasks: [
        { id: 'task001', title: 'Write weekly report', projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa', projectName: 'Inbox', priority: 5, dueDate: null, content: null, status: 0 },
      ],
    });
    const result = await harness.processMessage('create a task and update the weekly report');
    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'validation');
    assert.equal(harness.adapterCalls.create.length, 0);
    assert.equal(harness.adapterCalls.update.length, 0);
    console.log('PASS mutation routing rejects mixed create+mutation request');
  } catch (err) {
    failures++;
    console.error('FAIL mutation routing rejects mixed create+mutation request');
    console.error(err.message);
  }

  try {
    const harness = createPipelineHarness({
      intents: [
        { type: 'update', title: 'Title change', confidence: 0.9, targetQuery: 'weekly report' },
      ],
      activeTasks: [
        { id: 'task001', title: 'Write weekly report', projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa', projectName: 'Inbox', priority: 5, dueDate: null, content: null, status: 0 },
      ],
    });
    const result = await harness.processMessage('update weekly report title');
    assert.equal(result.type, 'task');
    assert.equal(harness.adapterCalls.update.length, 1);
    const updateCall = harness.adapterCalls.update[0];
    assert.equal(updateCall.taskId, 'task001');
    console.log('PASS successful mutation write calls adapter through _executeActions');
  } catch (err) {
    failures++;
    console.error('FAIL successful mutation write calls adapter through _executeActions');
    console.error(err.message);
  }

  // ─── WP05: Free-form handler mutation outcomes ──────────────────

  try {
    // Test clarification: ambiguous query matches multiple tasks
    const { resolveTarget } = await import('../services/task-resolver.js');
    const tasks = [
      { id: 't1', title: 'Write weekly report', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
      { id: 't2', title: 'Review weekly metrics', projectId: 'p1', projectName: 'Career', priority: 3, status: 0 },
    ];
    const result = resolveTarget({ targetQuery: 'weekly', activeTasks: tasks });
    assert.equal(result.status, 'clarification');
    assert.equal(result.candidates.length, 2);
    console.log('PASS task-resolver returns clarification for ambiguous query');
  } catch (err) {
    failures++;
    console.error('FAIL task-resolver returns clarification for ambiguous query');
    console.error(err.message);
  }

  try {
    // Test not-found: query matches no task
    const { resolveTarget } = await import('../services/task-resolver.js');
    const tasks = [
      { id: 't1', title: 'Write weekly report', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
    ];
    const result = resolveTarget({ targetQuery: 'nonexistent xyz', activeTasks: tasks });
    assert.equal(result.status, 'not_found');
    assert.equal(result.candidates.length, 0);
    console.log('PASS task-resolver returns not-found for unmatched query');
  } catch (err) {
    failures++;
    console.error('FAIL task-resolver returns not-found for unmatched query');
    console.error(err.message);
  }

  try {
    // Test store: pending mutation clarification state
    const store = await import('../services/store.js');
    const testKey = `test-mut-clar-${Date.now()}`;
    const testData = {
      originalMessage: 'update the weekly report',
      candidates: [{ id: 't1', title: 'Write weekly report' }],
      intentSummary: 'Update task: weekly report',
    };
    assert.equal(store.getPendingMutationClarification(), null);
    await store.setPendingMutationClarification(testData);
    const retrieved = store.getPendingMutationClarification();
    assert.equal(retrieved.originalMessage, testData.originalMessage);
    assert.equal(retrieved.candidates.length, 1);
    assert.equal(retrieved.candidates[0].id, 't1');
    assert.ok(retrieved.createdAt);
    await store.clearPendingMutationClarification();
    assert.equal(store.getPendingMutationClarification(), null);
    console.log('PASS store persists and clears pending mutation clarification');
  } catch (err) {
    failures++;
    console.error('FAIL store persists and clears pending mutation clarification');
    console.error(err.message);
  }

  try {
    // Test utils: buildMutationCandidateKeyboard
    const { buildMutationCandidateKeyboard, buildMutationClarificationMessage } = await import('../bot/utils.js');
    const candidates = [
      { id: 't1', title: 'Write weekly report' },
      { id: 't2', title: 'Review weekly metrics dashboard for Q4' },
    ];
    const keyboard = buildMutationCandidateKeyboard(candidates);
    assert.ok(keyboard);
    // Verify truncation: long title should be truncated
    const msg = buildMutationClarificationMessage('Multiple tasks match "weekly".', candidates, 'Update task');
    assert.ok(msg.includes('Multiple tasks match'));
    assert.ok(msg.includes('Tap a task below'));
    console.log('PASS mutation candidate keyboard and message helpers');
  } catch (err) {
    failures++;
    console.error('FAIL mutation candidate keyboard and message helpers');
    console.error(err.message);
  }

  try {
    // Test: clarification and not-found results via pipeline harness
    const harness = createPipelineHarness({
      intents: [{ type: 'update', title: 'Title change', confidence: 0.9, targetQuery: 'nonexistent task' }],
      activeTasks: [],
    });
    const result = await harness.processMessage('update nonexistent task');
    assert.equal(result.type, 'not-found');
    assert.ok(result.notFound);
    assert.ok(result.confirmationText);

    const clarHarness = createPipelineHarness({
      intents: [{ type: 'update', title: 'Title', confidence: 0.9, targetQuery: 'weekly' }],
      activeTasks: [
        { id: 't1', title: 'Write weekly report', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
        { id: 't2', title: 'Review weekly metrics', projectId: 'p1', projectName: 'Career', priority: 3, status: 0 },
      ],
    });
    const clarResult = await clarHarness.processMessage('update weekly');
    assert.equal(clarResult.type, 'clarification');
    assert.ok(clarResult.clarification);
    assert.equal(clarResult.clarification.candidates.length, 2);
    console.log('PASS pipeline produces clarification and not-found result types via harness');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline produces clarification and not-found result types via harness');
    console.error(err.message);
  }

  try {
    // Test: skipClarification option bypasses resolver and uses existingTask
    const resumeHarness = createPipelineHarness({
      intents: [{ type: 'update', title: 'Move to Career', confidence: 0.9, targetQuery: 'weekly' }],
      activeTasks: [
        { id: 't1', title: 'Write weekly report', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
        { id: 't2', title: 'Review weekly metrics', projectId: 'p1', projectName: 'Career', priority: 3, status: 0 },
      ],
    });
    const resumeResult = await resumeHarness.processMessage('update weekly', {
      existingTask: { id: 't2', projectId: 'p1', title: 'Review weekly metrics' },
      skipClarification: true,
    });
    assert.equal(resumeResult.type, 'task');
    assert.equal(resumeHarness.adapterCalls.update.length, 1);
    assert.equal(resumeHarness.adapterCalls.update[0].taskId, 't2');
    console.log('PASS pipeline skipClarification resumes mutation with existingTask');
  } catch (err) {
    failures++;
    console.error('FAIL pipeline skipClarification resumes mutation with existingTask');
    console.error(err.message);
  }

  try {
    // Test: store mutation clarification lifecycle
    const store = await import('../services/store.js');
    const { AUTHORIZED_CHAT_ID } = await import('../bot/utils.js');
    const testUserId = AUTHORIZED_CHAT_ID || `reg-test-mut-clar-${Date.now()}`;
    const testChatId = AUTHORIZED_CHAT_ID || 99999;

    await store.setPendingMutationClarification({
      originalMessage: 'update weekly',
      candidates: [{ id: 't1', title: 'Weekly report' }],
      intentSummary: 'Update task',
      chatId: testChatId,
      userId: testUserId,
      entryPoint: 'telegram:freeform',
      mode: 'interactive',
    });

    const pending = store.getPendingMutationClarification();
    assert.ok(pending);
    assert.equal(pending.chatId, testChatId);
    assert.equal(pending.userId, testUserId);
    assert.equal(pending.entryPoint, 'telegram:freeform');

    await store.clearPendingMutationClarification();
    assert.equal(store.getPendingMutationClarification(), null);
    console.log('PASS store mutation clarification lifecycle with chatId/userId');
  } catch (err) {
    failures++;
    console.error('FAIL store mutation clarification lifecycle with chatId/userId');
    console.error(err.message);
  }

  // ─── WP03: Failure Classification, Quota Semantics, and User Messaging ───

  try {
    // T009: Non-task messages must NOT masquerade as failures
    const harness = createPipelineHarness({
      intents: [],
    });

    const result = await harness.processMessage('thanks for the help', {
      requestId: 'req-non-task',
      entryPoint: 'telegram',
      mode: 'interactive',
    });

    assert.equal(result.type, 'non-task');
    assert.equal(result.failure, undefined);
    assert.equal(result.confirmationText, 'Got it — no actionable tasks detected.');
    console.log('PASS WP03 non-task messages do not masquerade as failures');
  } catch (err) {
    failures++;
    console.error('FAIL WP03 non-task messages do not masquerade as failures');
    console.error(err.message);
  }

  try {
    // T009: Failure envelope must be stable and consistent across all failure classes
    const baseAdapter = {
      listProjects: async () => DEFAULT_PROJECTS,
      listActiveTasks: async () => DEFAULT_ACTIVE_TASKS,
      getTaskSnapshot: async () => null,
      restoreTask: async () => ({}),
    };

    const failureClasses = ['quota', 'malformed_ax', 'validation', 'adapter', 'unexpected'];
    const pipelines = {
      quota: createPipeline({
        axIntent: {
          extractIntents: async () => { throw new QuotaExhaustedError('All keys exhausted'); },
        },
        normalizer: { normalizeActions: () => [] },
        adapter: { ...baseAdapter },
        observability: createPipelineObservability({ logger: null }),
      }),
      malformed_ax: createPipeline({
        axIntent: { extractIntents: async () => 'not-an-array' },
        normalizer: { normalizeActions: () => [] },
        adapter: { ...baseAdapter },
        observability: createPipelineObservability({ logger: null }),
      }),
      validation: createPipeline({
        axIntent: { extractIntents: async () => [{ type: 'create', confidence: 0.9 }] },
        normalizer: {
          normalizeActions: () => [{ type: 'create', valid: false, validationErrors: ['title required'] }],
        },
        adapter: { ...baseAdapter },
        observability: createPipelineObservability({ logger: null }),
      }),
      adapter: createPipeline({
        axIntent: { extractIntents: async () => [{ type: 'create', title: 'Test', confidence: 0.9 }] },
        normalizer: {
          normalizeActions: (intents) => intents.map(i => ({ ...i, projectId: DEFAULT_PROJECTS[0].id, valid: true })),
        },
        adapter: {
          ...baseAdapter,
          createTask: async () => { throw new Error('Adapter failure'); },
        },
        observability: createPipelineObservability({ logger: null }),
      }),
      unexpected: createPipeline({
        axIntent: { extractIntents: async () => { throw new Error('Boom'); } },
        normalizer: { normalizeActions: () => [] },
        adapter: { ...baseAdapter },
        observability: createPipelineObservability({ logger: null }),
      }),
    };

    for (const failureClass of failureClasses) {
      const result = await pipelines[failureClass].processMessage('test', {
        requestId: `req-failure-${failureClass}`,
        entryPoint: 'telegram',
        mode: 'interactive',
        currentDate: '2026-03-10',
      });

      assert.equal(result.type, 'error', `${failureClass}: result type should be error`);
      assert.equal(result.failure.class, failureClass, `${failureClass}: failure class mismatch`);
      assert.ok(typeof result.confirmationText === 'string', `${failureClass}: confirmationText should be string`);
      assert.ok(result.requestId, `${failureClass}: requestId should be preserved`);
      assert.ok(Array.isArray(result.errors), `${failureClass}: errors should be array`);
    }
    console.log('PASS WP03 failure envelope is stable and consistent across all classes');
  } catch (err) {
    failures++;
    console.error('FAIL WP03 failure envelope is stable and consistent across all classes');
    console.error(err.message);
  }

  try {
    // T011: Mode-aware failure rendering — dev mode gets diagnostics, user mode stays compact
    const baseAdapter = {
      listProjects: async () => DEFAULT_PROJECTS,
      listActiveTasks: async () => DEFAULT_ACTIVE_TASKS,
      getTaskSnapshot: async () => null,
      restoreTask: async () => ({}),
    };

    const pipeline = createPipeline({
      axIntent: { extractIntents: async () => 'malformed' },
      normalizer: { normalizeActions: () => [] },
      adapter: { ...baseAdapter },
      observability: createPipelineObservability({ logger: null }),
    });

    // Test dev mode explicitly
    const devResult = await pipeline.processMessage('test', {
      requestId: 'req-dev-mode',
      entryPoint: 'telegram',
      mode: 'development',
      currentDate: '2026-03-10',
    });

    // Dev mode should always have diagnostics regardless of NODE_ENV
    assert.ok(Array.isArray(devResult.diagnostics), 'dev mode should have diagnostics array');
    assert.ok(devResult.diagnostics.length > 0, 'dev mode diagnostics should be non-empty');
    assert.ok(devResult.isDevMode === true, 'dev mode flag should be true for development mode');

    // Test that user-facing confirmationText is always compact (never leaks internal class names)
    // Even in dev mode, the confirmationText should be the user-friendly message
    const userMessage = devResult.confirmationText;
    assert.ok(!userMessage.includes('failure_class:'), 'confirmationText should not leak failure_class diagnostics');
    assert.ok(typeof userMessage === 'string' && userMessage.length < 200, 'confirmationText should be compact');
    console.log('PASS WP03 mode-aware failure rendering keeps diagnostics out of user-facing copy');
  } catch (err) {
    failures++;
    console.error('FAIL WP03 mode-aware failure rendering keeps diagnostics out of user-facing copy');
    console.error(err.message);
  }

  try {
    // T011: formatPipelineFailure in utils.js respects compact flag (extracted from commands.js closure)
    const source = readFileSync('bot/utils.js', 'utf8');
    assert.ok(source.includes('compact = false'), 'formatPipelineFailure should accept compact flag');
    assert.ok(source.includes('result.isDevMode'), 'formatPipelineFailure should check dev mode');
    assert.ok(source.includes('result.diagnostics'), 'formatPipelineFailure should reference diagnostics');
    // Verify commands.js imports it (not defines it inline)
    const cmdSource = readFileSync('bot/commands.js', 'utf8');
    assert.ok(cmdSource.includes('formatPipelineFailure'), 'commands.js should reference formatPipelineFailure');
    assert.ok(!cmdSource.includes('const formatPipelineFailure'), 'commands.js should NOT define formatPipelineFailure as closure');
    console.log('PASS WP03 formatPipelineFailure supports compact and dev-mode flags');
  } catch (err) {
    failures++;
    console.error('FAIL WP03 formatPipelineFailure supports compact and dev-mode flags');
    console.error(err.message);
  }

  // ─── WP06: T017 — Observability event structure assertions ───

  try {
    const telemetryEvents = [];
    const obs = createPipelineObservability({
      eventSink: async (event) => { telemetryEvents.push(event); },
      logger: null,
    });

    const harness = createPipelineHarness({
      intents: [{ type: 'create', title: 'Obs contract test', confidence: 0.9 }],
      observability: obs,
    });

    await harness.processMessage('create obs test', {
      requestId: 'req-obs-contract',
      entryPoint: 'telegram',
      mode: 'interactive',
    });

    const requiredFields = [
      'eventType', 'timestamp', 'requestId', 'entryPoint', 'step', 'status',
      'durationMs', 'failureClass', 'actionType', 'attempt', 'rolledBack', 'metadata',
    ];

    for (const event of telemetryEvents) {
      for (const field of requiredFields) {
        assert.ok(Object.hasOwn(event, field), `event ${event.eventType} missing field: ${field}`);
      }
    }

    const receivedEvents = telemetryEvents.filter(e => e.eventType === 'pipeline.request.received');
    assert.equal(receivedEvents.length, 1);
    assert.equal(receivedEvents[0].step, 'request');
    assert.equal(receivedEvents[0].status, 'start');
    assert.equal(receivedEvents[0].entryPoint, 'telegram_message');
    console.log('PASS WP06 T017: observability events expose stable contract fields');
  } catch (err) {
    failures++;
    console.error('FAIL WP06 T017: observability events expose stable contract fields');
    console.error(err.message);
  }

  try {
    const telemetryEvents = [];
    const obs = createPipelineObservability({
      eventSink: async (event) => { telemetryEvents.push(event); },
      logger: null,
    });

    const harness = createPipelineHarness({
      intents: [{ type: 'create', title: 'Will fail', confidence: 0.9 }],
      adapterOverrides: {
        createTask: async () => { throw new Error('Adapter unavailable'); },
      },
      observability: obs,
    });

    await harness.processMessage('create will fail', {
      requestId: 'req-obs-failure-class',
      entryPoint: 'telegram',
      mode: 'interactive',
    });

    const failureEvents = telemetryEvents.filter(e => e.failureClass !== null);
    assert.ok(failureEvents.length > 0, 'expected failureClass events');
    const adapterFailure = failureEvents.find(e => e.failureClass === 'adapter');
    assert.ok(adapterFailure, 'expected adapter failureClass');
    assert.equal(adapterFailure.rolledBack, false);
    assert.equal(adapterFailure.status, 'failure');
    console.log('PASS WP06 T017: observability failure events include failureClass and rolledBack');
  } catch (err) {
    failures++;
    console.error('FAIL WP06 T017: observability failure events include failureClass and rolledBack');
    console.error(err.message);
  }

  // ─── WP06: T020 — Fail-closed behavior with failure class + user message assertions ───

  try {
    const pipeline = createPipeline({
      axIntent: {
        extractIntents: async () => 'garbage: <html>error</html>',
      },
      normalizer: { normalizeActions: () => [] },
      adapter: {
        listProjects: async () => DEFAULT_PROJECTS,
        listActiveTasks: async () => DEFAULT_ACTIVE_TASKS,
      },
      observability: createPipelineObservability({ logger: null }),
    });

    const result = await pipeline.processMessage('test malformed', {
      requestId: 'req-fc-malformed',
      entryPoint: 'telegram',
      mode: 'interactive',
      currentDate: '2026-03-10',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'malformed_ax');
    assert.match(result.confirmationText, /could not understand/i);
    assert.equal(result.confirmationText.includes('<html>'), false);
    assert.ok(result.diagnostics.length > 0, 'dev diagnostics available');
    console.log('PASS WP06 T020: fail-closed malformed AX does not leak diagnostics');
  } catch (err) {
    failures++;
    console.error('FAIL WP06 T020: fail-closed malformed AX does not leak diagnostics');
    console.error(err.message);
  }

  try {
    const pipeline = createPipeline({
      axIntent: {
        extractIntents: async () => [{ type: 'create', title: '' }],
      },
      normalizer: {
        normalizeActions: (intents) => intents.map(i => ({
          ...i, projectId: DEFAULT_PROJECTS[0].id, valid: false,
          validationErrors: ['title is required'],
        })),
      },
      adapter: {
        listProjects: async () => DEFAULT_PROJECTS,
        listActiveTasks: async () => DEFAULT_ACTIVE_TASKS,
      },
      observability: createPipelineObservability({ logger: null }),
    });

    const result = await pipeline.processMessage('test validation', {
      requestId: 'req-fc-validation',
      entryPoint: 'telegram',
      mode: 'interactive',
      currentDate: '2026-03-10',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'validation');
    assert.match(result.confirmationText, /could not validate/i);
    assert.equal(result.confirmationText.includes('validationErrors'), false);
    console.log('PASS WP06 T020: fail-closed validation returns user-safe message');
  } catch (err) {
    failures++;
    console.error('FAIL WP06 T020: fail-closed validation returns user-safe message');
    console.error(err.message);
  }

  try {
    const pipeline = createPipeline({
      axIntent: {
        extractIntents: async () => [{ type: 'create', title: 'Test', confidence: 0.9 }],
      },
      normalizer: {
        normalizeActions: (intents) => intents.map(i => ({
          ...i, projectId: DEFAULT_PROJECTS[0].id, valid: true, validationErrors: [],
        })),
      },
      adapter: {
        listProjects: async () => DEFAULT_PROJECTS,
        listActiveTasks: async () => DEFAULT_ACTIVE_TASKS,
        createTask: async () => { throw new Error('TickTick 503'); },
      },
      observability: createPipelineObservability({ logger: null }),
    });

    const result = await pipeline.processMessage('test adapter', {
      requestId: 'req-fc-adapter',
      entryPoint: 'telegram',
      mode: 'interactive',
      currentDate: '2026-03-10',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'adapter');
    assert.match(result.confirmationText, /failed.*retry|retry.*shortly/i);
    assert.equal(result.confirmationText.includes('503'), false);
    console.log('PASS WP06 T020: fail-closed adapter returns generic retry message');
  } catch (err) {
    failures++;
    console.error('FAIL WP06 T020: fail-closed adapter returns generic retry message');
    console.error(err.message);
  }

  try {
    const pipeline = createPipeline({
      axIntent: {
        extractIntents: async () => { throw new QuotaExhaustedError('All keys exhausted'); },
      },
      normalizer: { normalizeActions: () => [] },
      adapter: {
        listProjects: async () => DEFAULT_PROJECTS,
        listActiveTasks: async () => DEFAULT_ACTIVE_TASKS,
      },
      observability: createPipelineObservability({ logger: null }),
    });

    const result = await pipeline.processMessage('test quota', {
      requestId: 'req-fc-quota',
      entryPoint: 'telegram',
      mode: 'interactive',
      currentDate: '2026-03-10',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'quota');
    assert.match(result.confirmationText, /quota.*exhausted|try.*again/i);
    console.log('PASS WP06 T020: fail-closed quota returns user-safe message');
  } catch (err) {
    failures++;
    console.error('FAIL WP06 T020: fail-closed quota returns user-safe message');
    console.error(err.message);
  }

  // ─── WP06: T012 — Additional failure-path regressions ───

  try {
    const pipeline = createPipeline({
      axIntent: { extractIntents: async () => ({ not: 'an array' }) },
      normalizer: { normalizeActions: () => [] },
      adapter: {
        listProjects: async () => DEFAULT_PROJECTS,
        listActiveTasks: async () => DEFAULT_ACTIVE_TASKS,
      },
      observability: createPipelineObservability({ logger: null }),
    });

    const result = await pipeline.processMessage('test non-array', {
      requestId: 'req-non-array',
      entryPoint: 'telegram',
      mode: 'interactive',
      currentDate: '2026-03-10',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.class, 'malformed_ax');
    console.log('PASS WP06 T012: non-array AX output classified as malformed_ax');
  } catch (err) {
    failures++;
    console.error('FAIL WP06 T012: non-array AX output classified as malformed_ax');
    console.error(err.message);
  }

  try {
    const pipeline = createPipeline({
      axIntent: { extractIntents: async () => null },
      normalizer: { normalizeActions: () => [] },
      adapter: {
        listProjects: async () => DEFAULT_PROJECTS,
        listActiveTasks: async () => DEFAULT_ACTIVE_TASKS,
      },
      observability: createPipelineObservability({ logger: null }),
    });

    const result = await pipeline.processMessage('test null', {
      requestId: 'req-null',
      entryPoint: 'telegram',
      mode: 'interactive',
      currentDate: '2026-03-10',
    });

    // Null from AX is treated as empty/non-task, not malformed
    assert.equal(result.type, 'error');
    assert.ok(['malformed_ax', 'unexpected', 'validation'].includes(result.failure.class),
      `null intents should fail with a known class, got: ${result.failure.class}`);
    console.log('PASS WP06 T012: null AX output classified as known failure');
  } catch (err) {
    failures++;
    console.error('FAIL WP06 T012: null AX output classified as malformed_ax');
    console.error(err.message);
  }

  // R4 AC3: adapter failure preserves parsed intent for retry
  try {
    const failingAdapter = {
      listProjects: async () => [],
      listActiveTasks: async () => [],
      createTask: async () => { throw new Error('TickTick API unavailable'); },
      updateTask: async () => { throw new Error('TickTick API unavailable'); },
      completeTask: async () => { throw new Error('TickTick API unavailable'); },
      deleteTask: async () => { throw new Error('TickTick API unavailable'); },
      restoreTask: async () => { throw new Error('Rollback unsupported'); },
    };

    const pipeline = createPipeline({
      axIntent: {
        extractIntents: async () => [
          { type: 'create', title: 'Test task', content: 'test', priority: 3 },
        ],
      },
      normalizer: {
        normalizeActions: () => ([
          { type: 'create', title: 'Test task', content: 'test', priority: 3, projectId: 'inbox', valid: true, validationErrors: [] },
        ]),
      },
      adapter: failingAdapter,
      observability: createPipelineObservability({ logger: null }),
    });

    const result = await pipeline.processMessage('create a test task', {
      requestId: 'req-adapter-failure',
      entryPoint: 'telegram',
      mode: 'interactive',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure.failureClass, 'adapter');
    assert.equal(result.failure.retryable, true);
    assert.ok(Array.isArray(result.intents) && result.intents.length === 1);
    assert.equal(result.intents[0].title, 'Test task');
    assert.ok(Array.isArray(result.normalizedActions) && result.normalizedActions.length === 1);
    assert.equal(result.normalizedActions[0].title, 'Test task');
    console.log('PASS R4 AC3: adapter failure preserves parsed intent and normalized action');
  } catch (err) {
    failures++;
    console.error('FAIL R4 AC3: adapter failure preserves parsed intent and normalized action');
    console.error(err.message);
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

run();
