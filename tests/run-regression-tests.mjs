import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTelegramMarkdownToHTML } from '../bot/utils.js';
import { executeActions } from '../bot/commands.js';

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
    const geminiSource = readFileSync('services/gemini.js', 'utf8');
    assert.ok(geminiSource.includes('Do not use markdown headings (#, ##, ###)'));
    console.log('PASS prompts explicitly ban markdown heading syntax');
  } catch (err) {
    failures++;
    console.error('FAIL prompts explicitly ban markdown heading syntax');
    console.error(err.message);
  }

  try {
    const geminiSource = readFileSync('services/gemini.js', 'utf8');
    assert.ok(geminiSource.includes("For date updates, set changes.dueDate as 'YYYY-MM-DD'"));
    assert.ok(geminiSource.includes('scheduleBucket'));
    console.log('PASS converse prompt defines strict update date contract');
  } catch (err) {
    failures++;
    console.error('FAIL converse prompt defines strict update date contract');
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
      completeTask: async () => {},
      createTask: async () => {}
    };

    const currentTasks = [{ id: 'task-1', title: 'Netflix task', projectId: 'p-1' }];
    const actions = [{ type: 'update', taskId: 'task-1', changes: { suggested_schedule: 'today' } }];

    const result = await executeActions(actions, ticktick, currentTasks);

    assert.ok(result.outcomes[0].includes('Updated: "Netflix task"'));
    assert.equal(typeof calls[0].changes.dueDate, 'string');
    assert.ok(calls[0].changes.dueDate.includes('T23:59:00.000'));
    console.log('PASS update action supports suggested_schedule alias');
  } catch (err) {
    failures++;
    console.error('FAIL update action supports suggested_schedule alias');
    console.error(err.message);
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

run();
