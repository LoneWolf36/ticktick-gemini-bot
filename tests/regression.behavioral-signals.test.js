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

import {
  classifyTaskEvent,
  detectPostpone,
  detectScopeChange,
  detectDecomposition,
  SignalType,
  getSignalRegistry,
} from '../services/behavioral-signals.js';

test('classifyTaskEvent emits expected base signal by event type', () => {
  const cases = [
    {
      event: {
        eventType: 'create',
        taskId: 'test123',
        category: 'work',
        projectId: 'abc123def456ghi789jkl012',
        timestamp: '2026-04-14T10:00:00Z',
      },
      expectedType: SignalType.CREATION,
      assertExtras: (signal) => {
        assert.equal(signal.category, 'work');
        assert.equal(signal.projectId, 'abc123def456ghi789jkl012');
        assert.equal(signal.confidence, 1.0);
      },
    },
    {
      event: { eventType: 'complete', taskId: 't1', projectId: 'p1', timestamp: '2026-04-14T10:00:00Z' },
      expectedType: SignalType.COMPLETION,
      assertExtras: () => {},
    },
    {
      event: { eventType: 'delete', taskId: 't1', projectId: 'p1', timestamp: '2026-04-14T10:00:00Z' },
      expectedType: SignalType.DELETION,
      assertExtras: () => {},
    },
  ];

  for (const { event, expectedType, assertExtras } of cases) {
    const signals = classifyTaskEvent(event);
    assert.equal(signals.length, 1);
    assert.equal(signals[0].type, expectedType);
    assertExtras(signals[0]);
  }
});

test('classifyTaskEvent returns empty for null/invalid input', () => {
  assert.deepEqual(classifyTaskEvent(null), []);
  assert.deepEqual(classifyTaskEvent(undefined), []);
  assert.deepEqual(classifyTaskEvent({}), []);
  assert.deepEqual(classifyTaskEvent({ eventType: 'unknown' }), []);
});

test('detectPostpone fires when due date moved forward', () => {
  const event = {
    eventType: 'update',
    taskId: 't1',
    dueDateBefore: '2026-04-15T10:00:00Z',
    dueDateAfter: '2026-04-20T10:00:00Z',
    timestamp: '2026-04-14T10:00:00Z',
  };
  const signal = detectPostpone(event);
  assert.ok(signal);
  assert.equal(signal.type, SignalType.POSTPONE);
  assert.equal(signal.confidence, 0.9);
  assert.equal(signal.metadata.dueDateMovedForward, true);
  assert.equal(signal.metadata.daysMoved, 5);
});

test('detectPostpone does NOT fire for non-postpone update variants', () => {
  const cases = [
    {
      event: {
        eventType: 'update',
        taskId: 't1',
        dueDateBefore: '2026-04-20T10:00:00Z',
        dueDateAfter: '2026-04-15T10:00:00Z',
        timestamp: '2026-04-14T10:00:00Z',
      },
    },
    {
      event: {
        eventType: 'update',
        taskId: 't1',
        dueDateBefore: '2026-04-15T10:00:00Z',
        dueDateAfter: '2026-04-15T10:00:00Z',
        timestamp: '2026-04-14T10:00:00Z',
      },
    },
    {
      event: { eventType: 'update', taskId: 't1', timestamp: '2026-04-14T10:00:00Z' },
    },
  ];

  for (const { event } of cases) {
    const signal = detectPostpone(event);
    assert.equal(signal, null);
  }
});

test('detectScopeChange fires on material description change (>=50 chars)', () => {
  const event = {
    eventType: 'update',
    taskId: 't1',
    descriptionLengthBefore: 100,
    descriptionLengthAfter: 200,
    timestamp: '2026-04-14T10:00:00Z',
  };
  const signal = detectScopeChange(event);
  assert.ok(signal);
  assert.equal(signal.type, SignalType.SCOPE_CHANGE);
  assert.equal(signal.confidence, 0.8);
  assert.equal(signal.metadata.descriptionDelta, 100);
});

test('detectScopeChange does NOT fire on small wording changes (<50 chars)', () => {
  const event = {
    eventType: 'update',
    taskId: 't1',
    descriptionLengthBefore: 100,
    descriptionLengthAfter: 120,
    timestamp: '2026-04-14T10:00:00Z',
  };
  const signal = detectScopeChange(event);
  assert.equal(signal, null);
});

test('detectScopeChange fires on checklist count change', () => {
  const event = {
    eventType: 'update',
    taskId: 't1',
    checklistCountBefore: 2,
    checklistCountAfter: 5,
    timestamp: '2026-04-14T10:00:00Z',
  };
  const signal = detectScopeChange(event);
  assert.ok(signal);
  assert.equal(signal.type, SignalType.SCOPE_CHANGE);
  assert.equal(signal.metadata.checklistDelta, 3);
});

test('detectScopeChange does NOT fire when no relevant fields present', () => {
  const event = { eventType: 'update', taskId: 't1', timestamp: '2026-04-14T10:00:00Z' };
  const signal = detectScopeChange(event);
  assert.equal(signal, null);
});

test('detectDecomposition fires when subtasks added', () => {
  const event = {
    eventType: 'update',
    taskId: 't1',
    subtaskCountBefore: 0,
    subtaskCountAfter: 3,
    timestamp: '2026-04-14T10:00:00Z',
  };
  const signal = detectDecomposition(event);
  assert.ok(signal);
  assert.equal(signal.type, SignalType.DECOMPOSITION);
  assert.equal(signal.confidence, 0.85);
  assert.equal(signal.metadata.subtasksAdded, 3);
  assert.equal(signal.metadata.newSubtaskCount, 3);
});

test('detectDecomposition does NOT fire when subtasks removed', () => {
  const event = {
    eventType: 'update',
    taskId: 't1',
    subtaskCountBefore: 3,
    subtaskCountAfter: 1,
    timestamp: '2026-04-14T10:00:00Z',
  };
  const signal = detectDecomposition(event);
  assert.equal(signal, null);
});

test('detectDecomposition does NOT fire when subtask fields missing', () => {
  const event = { eventType: 'update', taskId: 't1', timestamp: '2026-04-14T10:00:00Z' };
  const signal = detectDecomposition(event);
  assert.equal(signal, null);
});

test('classifyTaskEvent update emits multiple signals when applicable', () => {
  const event = {
    eventType: 'update',
    taskId: 't1',
    dueDateBefore: '2026-04-15T10:00:00Z',
    dueDateAfter: '2026-04-20T10:00:00Z',
    subtaskCountBefore: 0,
    subtaskCountAfter: 2,
    timestamp: '2026-04-14T10:00:00Z',
  };
  const signals = classifyTaskEvent(event);
  // Should have both postpone and decomposition
  assert.ok(signals.length >= 2);
  const types = signals.map(s => s.type);
  assert.ok(types.includes(SignalType.POSTPONE));
  assert.ok(types.includes(SignalType.DECOMPOSITION));
  assert.ok(types.includes(SignalType.SNOOZE_SPIRAL));
});

test('classifyTaskEvent emits classifier core patterns from derived metadata only', () => {
  const createSignals = classifyTaskEvent({
    eventType: 'create',
    taskId: 't-create',
    category: 'work',
    projectId: 'career',
    titleWordCount: 2,
    titleCharacterCount: 11,
    hasActionVerb: false,
    smallTaskCandidate: true,
    creationCompletionRatio: 3.5,
    recentCreatedCount: 7,
    recentCompletedCount: 2,
    timestamp: '2026-04-14T10:00:00Z',
  });

  const createTypes = createSignals.map((signal) => signal.type);
  assert.ok(createTypes.includes(SignalType.COMMITMENT_OVERLOADER));
  assert.ok(createTypes.includes(SignalType.QUICK_WIN_ADDICTION));
  assert.ok(createTypes.includes(SignalType.VAGUE_TASK_WRITER));

  const updateSignals = classifyTaskEvent({
    eventType: 'update',
    taskId: 't-update',
    category: 'admin',
    dueDateBefore: '2026-04-15T10:00:00Z',
    dueDateAfter: '2026-04-20T10:00:00Z',
    descriptionLengthBefore: 20,
    descriptionLengthAfter: 280,
    checklistCountBefore: 1,
    checklistCountAfter: 7,
    subtaskCountBefore: 0,
    subtaskCountAfter: 6,
    taskAgeDays: 45,
    categoryOverdueCount: 4,
    planningComplexityScore: 7,
    completionRateWindow: 0.2,
    planningSubtypeA: true,
    timestamp: '2026-04-14T10:00:00Z',
  });

  const updateTypes = updateSignals.map((signal) => signal.type);
  assert.ok(updateTypes.includes(SignalType.SNOOZE_SPIRAL));
  assert.ok(updateTypes.includes(SignalType.STALE_TASK_MUSEUM));
  assert.ok(updateTypes.includes(SignalType.CATEGORY_AVOIDANCE));
  assert.ok(updateTypes.includes(SignalType.PLANNING_WITHOUT_EXECUTION));

  const completeSignals = classifyTaskEvent({
    eventType: 'complete',
    taskId: 't-complete',
    category: 'personal',
    smallTaskCandidate: true,
    completionLeadTimeHours: 2,
    timestamp: '2026-04-14T10:00:00Z',
  });

  const completeTypes = completeSignals.map((signal) => signal.type);
  assert.ok(completeTypes.includes(SignalType.DEADLINE_DAREDEVIL));
  assert.ok(completeTypes.includes(SignalType.QUICK_WIN_ADDICTION));

  for (const signal of [...createSignals, ...updateSignals, ...completeSignals]) {
    assert.equal(typeof signal.confidence, 'number');
    assert.ok(signal.confidence > 0 && signal.confidence <= 1);
  }
});

test('behavioral signals NEVER contain raw titles or message text', () => {
  const events = [
    { eventType: 'create', taskId: 't1', category: 'work', projectId: 'p1', timestamp: '2026-04-14T10:00:00Z' },
    { eventType: 'update', taskId: 't1', dueDateBefore: '2026-04-15', dueDateAfter: '2026-04-20', timestamp: '2026-04-14T10:00:00Z' },
    { eventType: 'complete', taskId: 't1', projectId: 'p1', timestamp: '2026-04-14T10:00:00Z' },
    { eventType: 'delete', taskId: 't1', projectId: 'p1', timestamp: '2026-04-14T10:00:00Z' },
  ];

  for (const event of events) {
    const signals = classifyTaskEvent(event);
    for (const signal of signals) {
      // Privacy boundary: no raw content in any signal
      assert.equal(signal.metadata.title, undefined, `Signal ${signal.type} must not contain title`);
      assert.equal(signal.metadata.description, undefined, `Signal ${signal.type} must not contain description`);
      assert.equal(signal.metadata.message, undefined, `Signal ${signal.type} must not contain message`);
      // Only derived numeric/boolean fields allowed
      for (const [key, value] of Object.entries(signal.metadata)) {
        assert.ok(
          typeof value === 'number' || typeof value === 'boolean' || value === null,
          `Signal ${signal.type} metadata.${key} must be number/boolean/null, got ${typeof value}`
        );
      }
    }
  }
});

test('behavioral signals ignore work-style metadata entirely', () => {
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
});

test('getSignalRegistry returns low-level and behavioral pattern signal types', () => {
  const registry = getSignalRegistry();
  assert.equal(registry.length, 15);
  const types = registry.map(r => r.type);
  assert.ok(types.includes(SignalType.POSTPONE));
  assert.ok(types.includes(SignalType.SCOPE_CHANGE));
  assert.ok(types.includes(SignalType.DECOMPOSITION));
  assert.ok(types.includes(SignalType.PLANNING_HEAVY));
  assert.ok(types.includes(SignalType.COMPLETION));
  assert.ok(types.includes(SignalType.CREATION));
  assert.ok(types.includes(SignalType.DELETION));
  assert.ok(types.includes(SignalType.SNOOZE_SPIRAL));
  assert.ok(types.includes(SignalType.COMMITMENT_OVERLOADER));
  assert.ok(types.includes(SignalType.STALE_TASK_MUSEUM));
  assert.ok(types.includes(SignalType.QUICK_WIN_ADDICTION));
  assert.ok(types.includes(SignalType.VAGUE_TASK_WRITER));
  assert.ok(types.includes(SignalType.DEADLINE_DAREDEVIL));
  assert.ok(types.includes(SignalType.CATEGORY_AVOIDANCE));
  assert.ok(types.includes(SignalType.PLANNING_WITHOUT_EXECUTION));
});

test('adapter failure preserves parsed intent and normalized action for retry', async () => {
  const adapter = {
    listProjects: async () => [],
    listActiveTasks: async () => [],
    createTask: async () => {
      throw new Error('TickTick API unavailable');
    },
    updateTask: async () => {
      throw new Error('TickTick API unavailable');
    },
    completeTask: async () => {
      throw new Error('TickTick API unavailable');
    },
    deleteTask: async () => {
      throw new Error('TickTick API unavailable');
    },
    restoreTask: async () => {
      throw new Error('Rollback unsupported');
    },
  };

  const pipeline = createPipeline({
    axIntent: {
      extractIntents: async () => [
        { type: 'create', title: 'Test task', content: 'test content', priority: 3 },
      ],
    },
    normalizer: {
      normalizeActions: () => ([
        { type: 'create', title: 'Test task', content: 'test content', priority: 3, projectId: 'inbox', valid: true, validationErrors: [] },
      ]),
    },
    adapter,
  });

  const result = await pipeline.processMessage('create a test task', {
    requestId: 'req-adapter-failure',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error', 'Result type should be error');
  assert.equal(result.failure.failureClass, 'adapter', 'Failure class should be adapter');
  assert.equal(result.failure.retryable, true, 'Adapter failure should be retryable');
  assert.ok(Array.isArray(result.intents), 'Intents should be preserved in result');
  assert.equal(result.intents.length, 1, 'Should have one intent');
  assert.equal(result.intents[0].type, 'create', 'Intent type should be create');
  assert.equal(result.intents[0].title, 'Test task', 'Intent title should be preserved');
  assert.ok(Array.isArray(result.normalizedActions), 'Normalized actions should be preserved in result');
  assert.equal(result.normalizedActions.length, 1, 'Should have one normalized action');
  assert.equal(result.normalizedActions[0].title, 'Test task', 'Normalized action title should be preserved');
});
