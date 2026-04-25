import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AxGen } from '@ax-llm/ax';
import axios from 'axios';

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

test('TickTickAdapter exposes the required task operation surface', () => {
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

test('TickTickAdapter findProjectByName resolves exact project deterministically', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getProjects = async () => ([
    { id: 'p-work', name: 'Work' },
    { id: 'p-personal', name: 'Personal' },
    { id: 'p-health', name: 'Health' },
  ]);

  const adapter = new TickTickAdapter(client);
  const project = await adapter.findProjectByName('Work');

  assert.ok(project);
  assert.equal(project.id, 'p-work');
  assert.equal(project.name, 'Work');
});

test('TickTickAdapter findProjectByName falls back to safe default for ambiguous hints', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getProjects = async () => ([
    { id: 'p-inbox', name: 'Inbox' },
    { id: 'p-work', name: 'Work' },
    { id: 'p-work-admin', name: 'Work Admin' },
  ]);

  const adapter = new TickTickAdapter(client);
  const project = await adapter.findProjectByName('wor');

  assert.ok(project);
  assert.equal(project.id, 'p-inbox');
  assert.equal(project.name, 'Inbox');
});

test('TickTickAdapter findProjectByName falls back to default for unknown hint', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getProjects = async () => ([
    { id: 'p-inbox', name: 'Inbox' },
    { id: 'p-work', name: 'Work' },
    { id: 'p-personal', name: 'Personal' },
  ]);

  const adapter = new TickTickAdapter(client);
  const project = await adapter.findProjectByName('does-not-exist');

  assert.ok(project);
  assert.equal(project.id, 'p-inbox');
  assert.equal(project.name, 'Inbox');
});

test('TickTickAdapter updateTask preserves existing notes on due-date-only mutation payloads', async () => {
  let updatePayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-preserve-notes',
    projectId: 'proj-notes',
    content: 'Original notes\nline 2',
    priority: 0,
    status: 0,
  });
  client.updateTask = async (_taskId, payload) => {
    updatePayload = payload;
    return { id: 'task-preserve-notes', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.updateTask('task-preserve-notes', {
    originalProjectId: 'proj-notes',
    dueDate: '2026-03-11T09:30:00.000+0000',
    content: '',
  });

  assert.equal(updatePayload.dueDate, '2026-03-11T09:30:00.000+0000');
  assert.equal(Object.hasOwn(updatePayload, 'content'), false);
});

test('TickTickAdapter updateTask appends genuinely new notes once with separator', async () => {
  let updatePayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-merge-notes',
    projectId: 'proj-notes',
    content: 'Original notes',
    priority: 0,
    status: 0,
  });
  client.updateTask = async (_taskId, payload) => {
    updatePayload = payload;
    return { id: 'task-merge-notes', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.updateTask('task-merge-notes', {
    originalProjectId: 'proj-notes',
    content: 'Original notes\n---\nCall vendor at 5',
  });

  assert.equal(updatePayload.content, 'Original notes\n---\nCall vendor at 5');
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

test('TickTickClient retries 429 with bounded attempts and backoff without real sleep', async () => {
  const originalAdapter = axios.defaults.adapter;
  const originalSetTimeout = globalThis.setTimeout;
  const observedBackoffs = [];
  let callCount = 0;

  globalThis.setTimeout = (fn, ms, ...args) => {
    observedBackoffs.push(ms);
    return originalSetTimeout(fn, 0, ...args);
  };

  axios.defaults.adapter = async (config) => {
    callCount += 1;

    if (callCount <= 2) {
      const err = new Error('429 Too Many Requests');
      err.response = {
        status: 429,
        headers: {},
        data: {},
      };
      err.config = config;
      throw err;
    }

    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { ok: true },
    };
  };

  try {
    const client = new TickTickClient({ clientId: 'cid', clientSecret: 'secret', redirectUri: 'http://localhost/cb' });
    client.accessToken = 'test-access-token';

    const result = await client._requestWithRetry('GET', '/project');

    assert.deepEqual(result, { ok: true });
    assert.equal(callCount, 3, 'expected initial call + two retries before success');
    assert.ok(observedBackoffs.length >= 2, 'expected backoff delays to be scheduled');
    assert.ok(observedBackoffs[1] >= observedBackoffs[0], 'expected non-decreasing backoff delays');
  } finally {
    axios.defaults.adapter = originalAdapter;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('TickTickClient preserves retry-after metadata on terminal 429 failures', async () => {
  const originalAdapter = axios.defaults.adapter;
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.setTimeout = (fn, _ms, ...args) => originalSetTimeout(fn, 0, ...args);

  axios.defaults.adapter = async (config) => {
    const err = new Error('429 Too Many Requests');
    err.response = {
      status: 429,
      headers: {
        'retry-after': '12',
      },
      data: {
        retry_after: 12,
      },
    };
    err.config = config;
    throw err;
  };

  try {
    const client = new TickTickClient({ clientId: 'cid', clientSecret: 'secret', redirectUri: 'http://localhost/cb' });
    client.accessToken = 'test-access-token';

    await assert.rejects(
      () => client._requestWithRetry('GET', '/project'),
      (error) => {
        assert.equal(error.code, 'RATE_LIMITED');
        assert.ok(
          Number.isFinite(error.retryAfterMs) || typeof error.retryAt === 'string',
          'expected retryAfterMs and/or retryAt metadata on 429 error',
        );
        return true;
      },
    );
  } finally {
    axios.defaults.adapter = originalAdapter;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('TickTickClient does not sleep through oversized retry-after windows', async () => {
  const originalAdapter = axios.defaults.adapter;
  const originalSetTimeout = globalThis.setTimeout;
  let callCount = 0;
  let slept = false;

  globalThis.setTimeout = (fn, _ms, ...args) => {
    slept = true;
    return originalSetTimeout(fn, 0, ...args);
  };

  axios.defaults.adapter = async (config) => {
    callCount += 1;
    const err = new Error('429 Too Many Requests');
    err.response = {
      status: 429,
      headers: {
        'retry-after': '3600',
      },
      data: {},
    };
    err.config = config;
    throw err;
  };

  try {
    const client = new TickTickClient({ clientId: 'cid', clientSecret: 'secret', redirectUri: 'http://localhost/cb' });
    client.accessToken = 'test-access-token';

    await assert.rejects(
      () => client._requestWithRetry('GET', '/project'),
      (error) => {
        assert.equal(error.code, 'RATE_LIMITED');
        assert.ok(error.retryAfterMs >= 3600000);
        return true;
      },
    );

    assert.equal(callCount, 1, 'oversized retry windows should fail fast without retrying');
    assert.equal(slept, false, 'oversized retry windows should not sleep in-process');
  } finally {
    axios.defaults.adapter = originalAdapter;
    globalThis.setTimeout = originalSetTimeout;
  }
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
  assert.equal(result.failure.failureCategory, 'partial');
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
  assert.equal(result.failure.failureCategory, 'partial');
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
        return { usageMetadata: null, text: '{}' };
      },
    }),
    'noop prompt'
  );

  assert.equal(analyzer._activeKeyIndex, 1);
  assert.ok(result?.text);
});

test('runDailyBriefingJob suppresses scheduled briefings in focus mode', async () => {
  await store.resetAll();
  const userId = `scheduler-focus-daily-${Date.now()}`;
  await store.setChatId(userId);
  await store.setWorkStyleMode(userId, store.MODE_FOCUS);

  let summaryCalls = 0;
  const ran = await runDailyBriefingJob({
    bot: {
      api: {
        sendMessage: async () => {
          throw new Error('sendMessage should not run in focus mode');
        },
      },
    },
    ticktick: {
      isAuthenticated: () => true,
    },
    adapter: {
      listActiveTasks: async () => {
        throw new Error('adapter should not be called in focus mode');
      },
    },
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
  assert.equal(store.getStats().lastDailyBriefing || null, null);
});

test('runWeeklyDigestJob suppresses scheduled weekly briefings in focus mode', async () => {
  await store.resetAll();
  const userId = `scheduler-focus-weekly-${Date.now()}`;
  await store.setChatId(userId);
  await store.setWorkStyleMode(userId, store.MODE_FOCUS);

  let summaryCalls = 0;
  const ran = await runWeeklyDigestJob({
    bot: {
      api: {
        sendMessage: async () => {
          throw new Error('sendMessage should not run in focus mode');
        },
      },
    },
    ticktick: {
      isAuthenticated: () => true,
    },
    adapter: {
      listActiveTasks: async () => {
        throw new Error('adapter should not be called in focus mode');
      },
    },
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
  assert.equal(store.getStats().lastWeeklyDigest || null, null);
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

test('GeminiAnalyzer builds work-style prompt notes for standard, focus, and urgent modes', () => {
  assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /STANDARD MODE is active/i);
  assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /balanced tone/i);
  assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /Do not imply urgency unless the user explicitly activated urgent mode/i);
  assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /When confidence is low, label uncertainty, ask, or stay quiet/i);
  assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /Use silent signals first/i);
  assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /Direct call-outs only when repeated evidence justifies them/i);
  assert.match(buildWorkStylePromptNote(store.MODE_STANDARD), /adapt or back off instead of escalating/i);

  assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /FOCUS MODE is active/i);
  assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /surface only critical items/i);
  assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /Do not imply urgency unless the user explicitly activated urgent mode/i);
  assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /When confidence is low, label uncertainty, ask, or stay quiet/i);
  assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /Use silent signals first/i);
  assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /Direct call-outs only when repeated evidence justifies them/i);
  assert.match(buildWorkStylePromptNote(store.MODE_FOCUS), /adapt or back off instead of escalating/i);

  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /URGENT MODE is active/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /direct, assertive, action-oriented language only when task evidence, deadlines, or explicit user context justify it/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Be non-judgmental: no shame, blame, or moralizing/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /If a task mutation is ambiguous, ask for clarification instead of guessing/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Reflect urgency only because the user explicitly activated urgent mode; never invent urgency/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /When confidence is low, label uncertainty, ask, or stay quiet/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Urgent mode does not lower the confidence threshold for behavioral claims/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Use silent signals first/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Direct call-outs only when repeated evidence justifies them/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Strict commands are allowed only because urgent mode was explicitly activated/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /adapt or back off instead of escalating/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Do not skip validation or safety checks/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /Strip only formatting niceties; preserve substantive content/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /do not mutate TickTick state unless the user explicitly asks/i);
  assert.match(buildWorkStylePromptNote(store.MODE_URGENT), /revert automatically/i);
});

test('urgent mode trims niceties without skipping safety or substantive content', async () => {
  const ambiguousHarness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'Weekly update', confidence: 0.9, targetQuery: 'weekly' },
    ],
    activeTasks: [
      { id: 't1', title: 'Write weekly report', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
      { id: 't2', title: 'Review weekly metrics', projectId: 'p1', projectName: 'Career', priority: 3, status: 0 },
    ],
  });

  const urgentClarification = await ambiguousHarness.processMessage('update weekly', {
    workStyleMode: store.MODE_URGENT,
  });
  const standardClarification = await ambiguousHarness.processMessage('update weekly', {
    workStyleMode: store.MODE_STANDARD,
  });

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

  const urgentFailure = await invalidHarness.processMessage('create broken task', {
    workStyleMode: store.MODE_URGENT,
  });
  const standardFailure = await invalidHarness.processMessage('create broken task', {
    workStyleMode: store.MODE_STANDARD,
  });

  assert.equal(urgentFailure.type, 'error');
  assert.equal(standardFailure.type, 'error');
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
});

test('composeWeeklySummary stays silent on a single ignored suggestion', () => {
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
});

test('composeWeeklySummary surfaces engagement notice only after repeated ignored guidance', () => {
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
});

test('composeDailyCloseSummary backs off after repeated ignored guidance instead of escalating', () => {
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
});

test('urgent mode does not override clarification requirements for ambiguous task mutations', async () => {
  await store.resetAll();
  const userId = `urgent-clarification-${Date.now()}`;
  await store.setWorkStyleMode(userId, store.MODE_URGENT, { expiryMs: store.DEFAULT_URGENT_EXPIRY_MS });

  const { processMessage, adapterCalls } = createPipelineHarness({
    intents: [
      { type: 'update', title: 'Weekly update', confidence: 0.9, targetQuery: 'weekly' },
    ],
    activeTasks: [
      { id: 't1', title: 'Write weekly report', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
      { id: 't2', title: 'Review weekly metrics', projectId: 'p1', projectName: 'Career', priority: 3, status: 0 },
    ],
  });

  const result = await processMessage('update weekly');

  assert.equal(await store.getWorkStyleMode(userId), store.MODE_URGENT);
  assert.equal(result.type, 'clarification');
  assert.equal(result.clarification.reason, 'ambiguous_target');
  assert.equal(adapterCalls.update.length, 0);
});

test('formatSummary keeps standard briefing full and reduces urgent briefing to top priorities', () => {
  const summary = {
    focus: 'Ship the architecture PR before anything else.',
    priorities: [
      { title: 'Ship weekly architecture PR', rationale_text: 'Directly moves the highest-priority goal.' },
      { title: 'Prepare system design notes', rationale_text: 'Keeps the interview loop moving.' },
      { title: 'Pay rent', rationale_text: 'Avoids admin spillover.' },
    ],
    why_now: ['Goal leverage is highest here.', 'Deadline pressure is rising.'],
    start_now: 'Open the PR and finish the next review round.',
    notices: [{ code: 'delivery_context', message: 'Context note.', severity: 'info', evidence_source: 'system' }],
  };

  const standard = formatSummary({
    kind: 'briefing',
    summary,
    context: buildSummaryResolvedStateFixture({ kind: 'briefing', workStyleMode: store.MODE_STANDARD }),
  }).text;
  const urgent = formatSummary({
    kind: 'briefing',
    summary,
    context: buildSummaryResolvedStateFixture({ kind: 'briefing', workStyleMode: store.MODE_URGENT }),
  }).text;

  assert.match(standard, /\*\*Why now\*\*/);
  assert.match(standard, /Directly moves the highest-priority goal\./);
  assert.match(standard, /Pay rent/);

  assert.doesNotMatch(urgent, /\*\*Why now\*\*/);
  assert.doesNotMatch(urgent, /Directly moves the highest-priority goal\./);
  assert.doesNotMatch(urgent, /Pay rent/);
  assert.match(urgent, /Ship weekly architecture PR/);
  assert.match(urgent, /Prepare system design notes/);
});

test('composeBriefingSummary keeps the daily plan to 3 tasks and preserves plausible goal work', () => {
  const activeTasks = [
    ...buildSummaryActiveTasksFixture(),
    {
      id: 'task-busywork',
      title: 'Organize desktop icons',
      projectId: 'admin',
      projectName: 'Admin',
      priority: 0,
      dueDate: null,
      status: 0,
    },
  ];
  const rankingResult = {
    ranked: [
      { taskId: 'task-focus', rationaleCode: 'goal_alignment', rationaleText: 'Directly moves the highest-priority goal.' },
      { taskId: 'task-support', rationaleCode: 'urgency', rationaleText: 'Time-bound execution window is closing.' },
      { taskId: 'task-admin', rationaleCode: 'capacity_protection', rationaleText: 'Protects important admin follow-through.' },
      { taskId: 'task-busywork', rationaleCode: 'fallback', rationaleText: 'Possible next candidate under degraded goal context.' },
    ],
    topRecommendation: { taskId: 'task-focus', rationaleCode: 'goal_alignment', rationaleText: 'Directly moves the highest-priority goal.' },
    degraded: false,
    degradedReason: null,
    context: { workStyleMode: store.MODE_STANDARD, urgentMode: false, stateSource: 'fixture' },
  };

  const result = composeBriefingSummary({
    context: buildSummaryResolvedStateFixture({ kind: 'briefing', workStyleMode: store.MODE_STANDARD }),
    activeTasks,
    rankingResult,
  });

  assert.equal(result.summary.priorities.length, 3);
  assert.ok(result.summary.priorities.some((item) => item.task_id === 'task-focus'));
  assert.ok(result.summary.priorities.some((item) => /highest-priority goal/i.test(item.rationale_text)));
  assert.equal(result.summary.priorities.some((item) => item.task_id === 'task-busywork'), false);
});

test('composeBriefingSummary says no relevant tasks concisely instead of inventing work', () => {
  const result = composeBriefingSummary({
    context: buildSummaryResolvedStateFixture({ kind: 'briefing', workStyleMode: store.MODE_STANDARD }),
    activeTasks: [],
    rankingResult: buildSummaryRankingFixture([], { degraded: true }),
  });

  assert.equal(result.summary.priorities.length, 0);
  assert.equal(result.summary.focus, 'No active tasks right now.');
  assert.equal(result.summary.start_now, 'No briefing actions right now.');
  assert.match(result.formattedText, /No active tasks right now\./);
  assert.doesNotMatch(result.formattedText, /Pick one concrete task/i);
});

test('formatSummary adapts daily close verbosity by work-style mode', () => {
  const summary = {
    stats: ['Completed: 2', 'Skipped: 1', 'Dropped: 0', 'Still open: 3'],
    reflection: 'Today was mixed: some progress landed, and some work stayed open.',
    reset_cue: 'Tomorrow’s restart: begin with “Ship weekly architecture PR”.',
    notices: [{ code: 'delivery_context', message: 'Keep it factual.', severity: 'info', evidence_source: 'system' }],
  };

  const standard = formatSummary({
    kind: 'daily_close',
    summary,
    context: buildSummaryResolvedStateFixture({ kind: 'daily_close', workStyleMode: store.MODE_STANDARD }),
  }).text;
  const focus = formatSummary({
    kind: 'daily_close',
    summary,
    context: buildSummaryResolvedStateFixture({ kind: 'daily_close', workStyleMode: store.MODE_FOCUS }),
  }).text;
  const urgent = formatSummary({
    kind: 'daily_close',
    summary,
    context: buildSummaryResolvedStateFixture({ kind: 'daily_close', workStyleMode: store.MODE_URGENT }),
  }).text;

  assert.match(standard, /\*\*Stats\*\*/);
  assert.match(standard, /\*\*Notices\*\*/);

  assert.match(focus, /\*\*Stats\*\*/);
  assert.doesNotMatch(focus, /\*\*Notices\*\*/);
  assert.doesNotMatch(focus, /Still open: 3/);

  assert.doesNotMatch(urgent, /\*\*Stats\*\*/);
  assert.doesNotMatch(urgent, /\*\*Notices\*\*/);
  assert.match(urgent, /\*\*Reflection\*\*/);
  assert.match(urgent, /\*\*Reset cue\*\*/);
});

test('formatSummary keeps weekly default compact in standard mode and shortens in urgent mode', () => {
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
  assert.match(standard, /Finalize system design notes/);

  assert.doesNotMatch(urgent, /\*\*Carry forward\*\*/);
  assert.doesNotMatch(urgent, /\*\*Notices\*\*/);
  assert.match(urgent, /\*\*Progress\*\*/);
  assert.match(urgent, /\*\*Next focus\*\*/);
  assert.match(urgent, /\*\*Watchouts\*\*/);
});

test('pipeline shortens urgent confirmations and clarification prompts while keeping errors clear', async () => {
  const creationHarness = createPipelineHarness({
    intents: [{ type: 'create', title: 'Buy groceries', confidence: 0.9 }],
  });

  const standardTask = await creationHarness.processMessage('buy groceries', {
    workStyleMode: store.MODE_STANDARD,
  });
  const urgentTask = await creationHarness.processMessage('buy groceries', {
    workStyleMode: store.MODE_URGENT,
  });

  assert.equal(standardTask.confirmationText, '✅ Created: Buy groceries');
  assert.equal(urgentTask.confirmationText, '✅ Buy groceries');

  const multiCreateHarness = createPipelineHarness({
    intents: [
      { type: 'create', title: 'Book flight', confidence: 0.9 },
      { type: 'create', title: 'Pack bag', confidence: 0.9 },
    ],
  });
  const standardMultiCreate = await multiCreateHarness.processMessage('book flight and pack bag', {
    workStyleMode: store.MODE_STANDARD,
  });
  const urgentMultiCreate = await multiCreateHarness.processMessage('book flight and pack bag', {
    workStyleMode: store.MODE_URGENT,
  });

  assert.equal(standardMultiCreate.confirmationText, '✅ Created 2 tasks');
  assert.equal(urgentMultiCreate.confirmationText, '✅ Done. Created 2');

  const clarificationHarness = createPipelineHarness({
    intents: [{ type: 'update', title: 'Weekly update', confidence: 0.9, targetQuery: 'weekly' }],
    activeTasks: [
      { id: 't1', title: 'Write weekly report', projectId: 'p1', projectName: 'Career', priority: 5, status: 0 },
      { id: 't2', title: 'Review weekly metrics', projectId: 'p1', projectName: 'Career', priority: 3, status: 0 },
    ],
  });

  const standardClarification = await clarificationHarness.processMessage('update weekly', {
    workStyleMode: store.MODE_STANDARD,
  });
  const urgentClarification = await clarificationHarness.processMessage('update weekly', {
    workStyleMode: store.MODE_URGENT,
  });

  assert.match(standardClarification.confirmationText, /^Which task did you mean\?/);
  assert.match(standardClarification.confirmationText, /Write weekly report/);
  assert.match(standardClarification.confirmationText, /Review weekly metrics/);
  assert.match(urgentClarification.confirmationText, /^Which task\?/);
  assert.doesNotMatch(urgentClarification.confirmationText, /\n\n/);
  assert.match(urgentClarification.confirmationText, /Write weekly report/);
  assert.match(urgentClarification.confirmationText, /Review weekly metrics/);

  const failureHarness = createPipelineHarness({
    intents: [{ type: 'create', title: 'Buy groceries', confidence: 0.9 }],
    useRealNormalizer: false,
    normalizedActions: [{ valid: false, validationErrors: ['missing title'] }],
  });

  const standardFailure = await failureHarness.processMessage('buy groceries', {
    workStyleMode: store.MODE_STANDARD,
  });
  const urgentFailure = await failureHarness.processMessage('buy groceries', {
    workStyleMode: store.MODE_URGENT,
  });

  assert.equal(standardFailure.type, 'error');
  assert.equal(urgentFailure.type, 'error');
  assert.equal(standardFailure.confirmationText, '⚠️ I could not validate the task details. Please clarify and retry.');
  assert.equal(urgentFailure.confirmationText, standardFailure.confirmationText);
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
