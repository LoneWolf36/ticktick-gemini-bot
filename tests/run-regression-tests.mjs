import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTelegramMarkdownToHTML, containsSensitiveContent, buildTickTickUpdate, scheduleToDateTime } from '../bot/utils.js';
import { executeActions } from '../bot/commands.js';
import { GeminiAnalyzer } from '../services/gemini.js';

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

  if (failures > 0) {
    process.exitCode = 1;
  }
}

run();
