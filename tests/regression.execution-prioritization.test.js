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
      { label: 'Land a senior backend role', kind: 'custom', priorityOrder: 1 },
      { label: 'Stabilize finances and pay urgent bills', kind: 'custom', priorityOrder: 2 },
      { label: 'Protect health and recovery', kind: 'custom', priorityOrder: 3 },
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
   assert.equal(result.rankingConfidence, 'low');
   assert.equal(result.shouldAskClarification, true);
   assert.equal(result.clarificationReason, 'missing_goal_context');
   assert.match(result.uncertaintyLabel, /uncertain/i);
  assert.equal(result.context.goalThemeProfile.confidence, 'weak');
  assert.equal(result.topRecommendation.inferenceConfidence, 'weak');
  assert.match(result.topRecommendation.rationaleText, /Possible next candidate/i);
});

test('execution prioritization marks strong rankings as high confidence without clarification', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-career-strong',
      title: 'Prepare backend system design interview notes',
      projectId: 'career',
      projectName: 'Career',
      dueDate: '2026-03-10T12:00:00Z',
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile(`GOALS:\n1. Land a senior backend role`, { source: 'user_context' }),
    nowIso: '2026-03-10T10:00:00Z',
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.rankingConfidence, 'high');
  assert.equal(result.uncertaintyLabel, null);
  assert.equal(result.shouldAskClarification, false);
  assert.equal(result.clarificationReason, null);
  assert.doesNotMatch(result.topRecommendation.rationaleText, /likely|possibly|potentially|possible/i);
});

test('execution prioritization applies explicit task overrides ahead of heuristic ranking', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-important',
      title: 'Prepare backend interview notes',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-override',
      title: 'Call landlord',
      projectId: 'admin',
      projectName: 'Admin',
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
    nowIso: '2026-04-21T12:00:00Z',
    priorityOverrides: [{
      taskId: 'task-override',
      reason: 'manual_top_priority',
      expiresAt: '2026-04-21T18:00:00Z',
    }],
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-override');
  assert.equal(result.ranked[0].exceptionApplied, true);
  assert.equal(result.ranked[0].exceptionReason, 'manual_top_priority');
  assert.match(result.ranked[0].rationaleText, /top priority for now/i);
});

test('execution prioritization infers project id only from exact project names', () => {
  const exact = executionPrioritization.inferProjectIdFromTask(
    { title: 'Pay rent', projectName: 'Admin' },
    [{ id: 'admin-id', name: 'Admin' }],
  );
  const exactProjectId = executionPrioritization.inferProjectIdFromTask(
    { title: 'Pay rent', projectId: 'exact-project-id' },
    [{ id: 'admin-id', name: 'Admin' }],
  );

  assert.equal(exact, 'admin-id');
  assert.equal(exactProjectId, 'exact-project-id');
});

test('execution prioritization does not infer project id from broad substring overlap', () => {
  const inferred = executionPrioritization.inferProjectIdFromTask(
    { title: 'Pay rent', projectName: 'administration' },
    [{ id: 'admin-id', name: 'Admin' }],
  );

  assert.equal(inferred, null);
});

test('execution prioritization does not infer project id from configured fragments', () => {
  const inferredAdmin = executionPrioritization.inferProjectIdFromTask(
    { title: 'Pay rent', projectName: 'Admin desk' },
    [],
  );
  const inferredPersonal = executionPrioritization.inferProjectIdFromTask(
    { title: 'Plan week', projectName: 'Personal stuff' },
    [],
  );

  assert.equal(inferredAdmin, null);
  assert.equal(inferredPersonal, null);
});

test('execution prioritization infers project id from exact configured alias only', () => {
  const exactAlias = executionPrioritization.inferProjectIdFromTask(
    { title: 'Pay rent', projectName: 'Admin Desk' },
    [],
    { projectPolicy: { projects: [{ id: 'alias-project-id', match: 'Ops', aliases: ['Admin Desk'] }] } },
  );
  const nearAlias = executionPrioritization.inferProjectIdFromTask(
    { title: 'Pay rent', projectName: 'Admin Desk Today' },
    [],
    { projectPolicy: { projects: [{ id: 'alias-project-id', match: 'Ops', aliases: ['Admin Desk'] }] } },
  );

  assert.equal(exactAlias, 'alias-project-id');
  assert.equal(nearAlias, null);
});

test('execution prioritization returns null for missing or unknown project info', () => {
  const missing = executionPrioritization.inferProjectIdFromTask(
    { title: 'Pay rent' },
    [],
  );
  const unknown = executionPrioritization.inferProjectIdFromTask(
    { title: 'Pay rent', projectName: 'Unlisted' },
    [{ id: 'admin-id', name: 'Admin' }],
  );

  assert.equal(missing, null);
  assert.equal(unknown, null);
});

test('execution prioritization ignores expired overrides', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-career',
      title: 'Prepare backend interview notes',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-old-override',
      title: 'Organize desk drawer',
      projectId: 'home',
      projectName: 'Home',
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
    nowIso: '2026-04-21T12:00:00Z',
    priorityOverrides: [{
      taskId: 'task-old-override',
      reason: 'expired_override',
      expiresAt: '2026-04-20T12:00:00Z',
    }],
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-career');
  assert.equal(result.ranked[0].exceptionApplied, false);
  assert.equal(result.ranked.some((item) => item.exceptionReason === 'expired_override'), false);
});

test('execution prioritization keeps quick-win busywork below important work unless it is genuinely important', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-important',
      title: 'Prepare backend interview notes',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-quick-win',
      title: 'Organize desk drawer',
      projectId: 'home',
      projectName: 'Home',
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-important');
  assert.equal(result.ranked[1].taskId, 'task-quick-win');
});

test('execution prioritization does not use task count as a ranking signal', () => {
  const importantTask = normalizePriorityCandidate({
    id: 'task-important',
    title: 'Prepare backend interview notes',
    projectId: 'career',
    projectName: 'Career',
    status: 0,
  });
  const quickWins = Array.from({ length: 8 }, (_, index) => normalizePriorityCandidate({
    id: `task-quick-${index + 1}`,
    title: `Organize drawer ${index + 1}`,
    projectId: 'home',
    projectName: 'Home',
    status: 0,
  }));
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
  });

  const baseResult = rankPriorityCandidatesForTest([importantTask], context);
  const crowdedResult = rankPriorityCandidatesForTest([importantTask, ...quickWins], context);

  assert.equal(baseResult.topRecommendation.taskId, 'task-important');
  assert.equal(crowdedResult.topRecommendation.taskId, 'task-important');
  assert.equal(crowdedResult.ranked[0].rationaleCode, baseResult.ranked[0].rationaleCode);
});

test('execution prioritization deprioritizes planning-heavy tasks without execution evidence', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-planning',
      title: 'Plan backend job search strategy',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-execution',
      title: 'Apply to backend roles',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-execution');
  assert.equal(result.ranked[1].taskId, 'task-planning');
});

test('execution prioritization emits ranking telemetry with input state and final ordering', () => {
  const telemetry = [];
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-career',
      title: 'Prepare backend interview notes',
      content: 'Draft concrete examples',
      projectId: 'career',
      projectName: 'Career',
      priority: 5,
      dueDate: '2026-04-23T12:00:00Z',
      repeatFlag: null,
      createdAt: '2026-04-20T00:00:00Z',
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-admin',
      title: 'Buy groceries',
      content: 'milk eggs bread',
      projectId: 'personal',
      projectName: 'Personal',
      priority: 1,
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
    nowIso: '2026-04-21T12:00:00Z',
    rankingTelemetrySink: (payload) => telemetry.push(payload),
  });

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-career');
  assert.equal(telemetry.length, 1);
  assert.equal(telemetry[0].eventType, 'ranking.computed');
  assert.equal(telemetry[0].inputState.goalConfidence, 'explicit');
  assert.equal(telemetry[0].inputState.candidates.length, 2);
  assert.deepEqual(telemetry[0].inputState.candidates[0], {
    taskId: 'task-career',
    projectId: 'career',
    priority: 5,
    dueDate: '2026-04-23T12:00:00Z',
    repeatFlag: null,
    taskAgeDays: Math.max(0, Math.floor((Date.now() - Date.parse('2026-04-20T00:00:00Z')) / (24 * 60 * 60 * 1000))),
    status: 0,
    source: 'ticktick',
    containsSensitiveContent: false,
  });
  assert.equal(telemetry[0].computedScores.length, 2);
  assert.equal(telemetry[0].finalOrdering[0].taskId, 'task-career');
  assert.match(telemetry[0].finalOrdering[0].rationaleText, /goal|career/i);
});

test('execution prioritization telemetry avoids raw task content fields', () => {
  const telemetry = [];
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-sensitive',
      title: 'Reset bank password',
      content: 'Positive1111!',
      projectId: 'admin',
      projectName: 'Admin',
      priority: 3,
      status: 0,
    }),
  ];
  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
    rankingTelemetrySink: (payload) => telemetry.push(payload),
  });

  rankPriorityCandidatesForTest(candidates, context);

  const serialized = JSON.stringify(telemetry[0]);
  assert.doesNotMatch(serialized, /Reset bank password/);
  assert.doesNotMatch(serialized, /Positive1111!/);
  assert.equal(telemetry[0].inputState.candidates[0].containsSensitiveContent, true);
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
        renderTimeMs: 12,
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
  assert.equal(payload.diagnostics.renderTimeMs, 12);
  assert.deepEqual(payload.summaryShape, {
    sectionKeys: ['focus'],
    sectionSizes: { focus: 1 },
  });
  assert.equal(Object.hasOwn(payload, 'summary'), false);
});

test('GeminiAnalyzer generateDailyBriefingSummary matches manual and scheduler output for the same inputs', async () => {
  const analyzer = new GeminiAnalyzer(['dummy-key']);
  analyzer._executeWithFailover = async () => ({
    text: JSON.stringify({
      focus: 'Ship the architecture PR before lower-leverage work.',
      priorities: [
        {
          task_id: 'task-focus',
          title: 'Ship weekly architecture PR',
          project_name: 'Career',
          due_date: '2026-03-12',
          priority_label: 'core_goal',
          rationale_text: 'Directly moves the highest-priority goal.',
        },
      ],
      why_now: ['Directly moves the highest-priority goal.'],
      start_now: 'Open the PR checklist and draft the next commit.',
      notices: [],
    }),
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
  analyzer._executeWithFailover = async () => ({
    text: JSON.stringify({
      progress: ['Completed resume update'],
      carry_forward: ['Reschedule mock interview'],
      next_focus: ['Protect maker time'],
      watchouts: ['Do not let admin work crowd out backend prep'],
      notices: [],
    }),
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

test('execution prioritization ranks goal-aligned work above admin when no strong heuristic exceptions apply', () => {
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
      id: 'task-admin',
      title: 'Reset laptop password to unblock applications',
      projectId: 'admin',
      projectName: 'Admin',
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, context);

  assert.equal(result.topRecommendation.taskId, 'task-deep-work');
  assert.equal(result.topRecommendation.rationaleCode, 'goal_alignment');
});

test('execution prioritization favors goal-aligned work over urgent admin without keyword exceptions', () => {
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

  assert.equal(result.topRecommendation.taskId, 'task-deep-work');
  assert.equal(result.topRecommendation.rationaleCode, 'goal_alignment');
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

test('execution prioritization ranks goal-aligned work above admin even with behavioral signals present', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-career',
      title: 'Apply to backend roles',
      projectId: 'career',
      projectName: 'Career',
      priority: 1,
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-admin',
      title: 'Buy groceries',
      projectId: 'admin',
      projectName: 'Admin',
      priority: 3,
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
    behavioralSignals: [{
      type: 'category_avoidance',
      category: 'career',
      confidence: 'high',
      signalCount: 4,
    }],
    behavioralInferenceThreshold: 'strong',
  }));

  assert.equal(result.topRecommendation.taskId, 'task-career');
  assert.equal(result.context.behavioralSignals.length, 1);
});

test('execution prioritization behavioral signal input is optional and ranking still works', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-a',
      title: 'Prepare backend interview notes',
      projectId: 'career',
      projectName: 'Career',
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
  }));

  assert.equal(result.topRecommendation.taskId, 'task-a');
  assert.equal(Array.isArray(result.context.behavioralSignals), true);
  assert.equal(result.context.behavioralSignals.length, 0);
});

test('execution prioritization ignores low-confidence behavioral signals', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-career',
      title: 'Apply to backend roles',
      projectId: 'career',
      projectName: 'Career',
      priority: 1,
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-admin',
      title: 'Pay rent',
      projectId: 'admin',
      projectName: 'Admin',
      priority: 3,
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
    behavioralSignals: [{
      type: 'category_avoidance',
      category: 'career',
      confidence: 'low',
      signalCount: 10,
    }],
    behavioralInferenceThreshold: 'strong',
  }));

  assert.equal(result.context.behavioralSignals.length, 0);
  assert.equal(result.topRecommendation.taskId, 'task-admin');
});

test('execution prioritization favors important work over merely urgent admin when both exist', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-important',
      title: 'Prepare backend system design interview notes',
      projectId: 'career',
      projectName: 'Career',
      priority: 5,
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-urgent',
      title: 'Reply to package issue today',
      projectId: 'admin',
      projectName: 'Admin',
      dueDate: '2026-03-10',
      priority: 0,
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
    nowIso: '2026-03-10T10:00:00Z',
  }));

  assert.equal(result.topRecommendation.taskId, 'task-important');
});

test('execution prioritization returns honest nothing-critical label when all signals are weak', () => {
  const candidates = [
    normalizePriorityCandidate({
      id: 'task-1',
      title: 'Organize desk drawer',
      projectId: 'home',
      projectName: 'Home',
      priority: 0,
      status: 0,
    }),
    normalizePriorityCandidate({
      id: 'task-2',
      title: 'Sort inbox emails',
      projectId: 'home',
      projectName: 'Home',
      priority: 0,
      status: 0,
    }),
  ];

  const result = rankPriorityCandidatesForTest(candidates, buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('', { source: 'fallback' }),
  }));

  assert.equal(result.nothingCriticalLabel, 'Nothing critical stands out right now.');
});

test('execution prioritization is deterministic for identical input and context', () => {
  const candidates = [
    {
      taskId: 'task-a',
      title: 'Prepare backend interview notes',
      content: '',
      projectId: 'career',
      projectName: 'Career',
      priority: 3,
      dueDate: null,
      repeatFlag: null,
      taskAgeDays: 5,
      status: 0,
      source: 'ticktick',
      containsSensitiveContent: false,
    },
    {
      taskId: 'task-b',
      title: 'Buy groceries',
      content: '',
      projectId: 'admin',
      projectName: 'Admin',
      priority: 1,
      dueDate: null,
      repeatFlag: null,
      taskAgeDays: 5,
      status: 0,
      source: 'ticktick',
      containsSensitiveContent: false,
    },
  ];

  const context = buildRankingContext({
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
    nowIso: '2026-03-10T10:00:00Z',
  });

  const first = rankPriorityCandidatesForTest(candidates, context);
  const second = rankPriorityCandidatesForTest(candidates, context);

  assert.deepEqual(second.ranked, first.ranked);
  assert.equal(second.topRecommendation.taskId, first.topRecommendation.taskId);
});

test('execution prioritization conservative classifier returns safe defaults without strong evidence', () => {
  const options = {
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
  };

  // Recipe task in routine project -> priority 1
  const recipeTask = { title: 'Try new pasta recipe', projectName: 'Recipes' };
  assert.equal(executionPrioritization.inferPriorityValueFromTask(recipeTask, options), 1);

  // Short noun fragment -> priority 1
  const shortFragmentTask = { title: 'Backend prep', projectName: 'Home', dueDate: null };
  assert.equal(executionPrioritization.inferPriorityValueFromTask(shortFragmentTask, options), 1);

  // Task in Life Admin project -> priority 1
  const lifeAdminTask = { title: 'Pay electricity bill', projectName: 'Life Admin' };
  assert.equal(executionPrioritization.inferPriorityValueFromTask(lifeAdminTask, options), 1);

  // Task with due date within 7 days -> priority 3
  const nearDueTask = { title: 'Submit paperwork', projectName: 'Admin', dueDate: '2026-05-02T10:00:00Z' };
  assert.equal(executionPrioritization.inferPriorityValueFromTask(nearDueTask, options), 3);

  // Task with urgent keyword -> priority 3
  const urgentTask = { title: 'Reply to email ASAP', projectName: 'Admin' };
  assert.equal(executionPrioritization.inferPriorityValueFromTask(urgentTask, options), 3);
});

test('execution prioritization conservative classifier returns core goal only for strong strategic signals', () => {
  const options = {
    goalThemeProfile: createGoalThemeProfile('GOALS:\n1. Land a senior backend role', { source: 'user_context' }),
  };

  // Career task with action verb in strategic project -> priority 5
  const careerTask = { title: 'Prepare backend system design interview notes', projectName: 'Career & Job Search' };
  assert.equal(executionPrioritization.inferPriorityValueFromTask(careerTask, options), 5);

  // Study task with action verb and due date -> priority 5
  const studyTask = { title: 'Complete leetcode hard problems', projectName: 'Studies', dueDate: '2026-04-25T10:00:00Z' };
  assert.equal(executionPrioritization.inferPriorityValueFromTask(studyTask, options), 5);

  // Strategic project but lacks action verb -> priority 3
  const strategicNoVerb = { title: 'Backend system design notes', projectName: 'Career & Job Search' };
  assert.equal(executionPrioritization.inferPriorityValueFromTask(strategicNoVerb, options), 3);

  // Action verb + schedule but in routine project -> priority 1
  const routineProjectTask = { title: 'Prepare interview notes', projectName: 'Routines & Tracking', dueDate: '2026-04-25T10:00:00Z' };
  assert.equal(executionPrioritization.inferPriorityValueFromTask(routineProjectTask, options), 1);
});
