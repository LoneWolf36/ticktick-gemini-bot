import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseTelegramMarkdownToHTML } from '../bot/utils.js';
import { executeActions, registerCommands } from '../bot/commands.js';
import { GeminiAnalyzer, buildUrgentModePromptNote } from '../services/gemini.js';
import { detectUrgentModeIntent } from '../services/ax-intent.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import * as store from '../services/store.js';
import * as executionPrioritization from '../services/execution-prioritization.js';
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
