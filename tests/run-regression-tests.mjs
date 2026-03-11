import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTelegramMarkdownToHTML, containsSensitiveContent, buildTickTickUpdate, scheduleToDateTime } from '../bot/utils.js';
import { executeActions } from '../bot/commands.js';
import { GeminiAnalyzer } from '../services/gemini.js';
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

async function run() {
  let failures = 0;

  try {
    const source = readFileSync('bot/utils.js', 'utf8');
    assert.match(source, /USER_TIMEZONE\s*\|\|\s*'Europe\/Dublin'/);
    console.log('PASS timezone default is Europe/Dublin');
  } catch (err) {
    failures++;
    console.error('FAIL timezone default is Europe/Dublin');
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
    const geminiSource = readFileSync('services/gemini.js', 'utf8');
    assert.ok(geminiSource.includes('Do not use markdown headings (#, ##, ###)'));
    console.log('PASS prompts explicitly ban markdown heading syntax');
  } catch (err) {
    failures++;
    console.error('FAIL prompts explicitly ban markdown heading syntax');
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
    const context = buildRankingContext({
      goalThemeProfile: createGoalThemeProfile(`GOALS:
1. Land a senior backend role`, { source: 'user_context' }),
      workStyleMode: 'gentle',
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

  if (failures > 0) {
    process.exitCode = 1;
  }
}

run();
