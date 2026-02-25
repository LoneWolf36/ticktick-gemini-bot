import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseTelegramMarkdownToHTML } from '../bot/utils.js';
import { executeActions } from '../bot/commands.js';

test('default timezone remains Europe/Dublin when USER_TIMEZONE is unset', () => {
  const source = readFileSync('bot/utils.js', 'utf8');
  assert.match(source, /USER_TIMEZONE\s*\|\|\s*'Europe\/Dublin'/);
});

test('markdown parser normalizes hash-divider and preserves bold formatting', () => {
  const input = '**Start now**: Do the task\n\n#######';
  const html = parseTelegramMarkdownToHTML(input);
  assert.match(html, /<b>Start now<\/b>:/);
  assert.match(html, /--------/);
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

  assert.equal(result.outcomes[0], '? Updated: "Netflix task"');
  assert.equal(typeof calls[0].changes.dueDate, 'string');
  assert.ok(calls[0].changes.dueDate.includes('T23:59:00.000'));
});
