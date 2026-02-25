import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseTelegramMarkdownToHTML } from '../bot/utils.js';
import { executeActions } from '../bot/commands.js';
import { GeminiAnalyzer } from '../services/gemini.js';

test('default timezone remains Europe/Dublin when USER_TIMEZONE is unset', () => {
  const source = readFileSync('bot/utils.js', 'utf8');
  assert.match(source, /USER_TIMEZONE\s*\|\|\s*'Europe\/Dublin'/);
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
