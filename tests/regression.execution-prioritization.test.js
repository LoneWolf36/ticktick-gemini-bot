import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AxGen } from '@ax-llm/ax';

import { appendUrgentModeReminder, parseTelegramMarkdownToHTML } from '../services/shared-utils.js';
import { executeActions, registerCommands } from '../bot/commands.js';
import { GeminiAnalyzer, buildWorkStylePromptNote } from '../services/gemini.js';
import { createAxIntent, detectWorkStyleModeIntent, QuotaExhaustedError } from '../services/ax-intent.js';
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
    repeatFlag: 'FREQ=WEEKLY',
    createdAt: '2026-04-18T00:00:00Z',
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
    repeatFlag: 'FREQ=WEEKLY',
    taskAgeDays: Math.max(0, Math.floor((Date.now() - Date.parse('2026-04-18T00:00:00Z')) / (24 * 60 * 60 * 1000))),
    status: 0,
    source: 'ticktick',
    containsSensitiveContent: true,
  });
});

test('execution prioritization ships a versioned ranking contract and current source register', () => {
  const contract = readFileSync(new URL('../context/refs/prioritization-ranking-contract.md', import.meta.url), 'utf8');
  const sourceRegister = readFileSync(new URL('../context/refs/source-register.csv', import.meta.url), 'utf8');

  assert.match(contract, /Version:\s*1\.0\.0/);
  assert.match(contract, /repeatFlag/);
  assert.match(contract, /taskAgeDays/);
  assert.match(contract, /ordered list with rationale/i);

  assert.doesNotMatch(sourceRegister, /[A-Z]:\\/);
  assert.match(sourceRegister, /context\/refs\/prioritization-ranking-contract\.md/);
  assert.match(sourceRegister, /services\/execution-prioritization\.js/);
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
  assert.match(result.topRecommendation.rationaleText, /Possible next candidate/i);
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
});

test('execution prioritization keeps the behavioral inference threshold strong in urgent mode', () => {
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
    workStyleMode: 'standard',
    stateSource: 'store',
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-urgent-admin');
  assert.equal(result.context.urgentMode, true);
  assert.equal(result.context.workStyleMode, 'standard');
});

test('execution prioritization elevates recovery work when it protects execution capacity', () => {
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile(`GOALS:
1. Land a senior backend role`, { source: 'user_context' }),
    workStyleMode: 'focus',
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
