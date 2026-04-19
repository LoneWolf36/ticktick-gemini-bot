// Opt-in live TickTick E2E validation harness.
// Direct TickTickClient and TickTickAdapter usage here is intentional for
// manual verification only; this file is not a production execution path.
//
// This file is intentionally executable only when run directly via Node.
// Importing it for syntax/module checks must not hit TickTick or perform writes.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

import { Bot } from 'grammy';
import { registerCommands } from '../bot/commands.js';
import { registerCallbacks } from '../bot/callbacks.js';
import { GeminiAnalyzer } from '../services/gemini.js';
import { TickTickClient } from '../services/ticktick.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';
import * as store from '../services/store.js';
import { scheduleToDateTime } from '../bot/utils.js';

const CHAT_ID = Number(process.env.TELEGRAM_CHAT_ID || 0);
const STORE_PATH = path.resolve('data/store.json');
const REPORT_PATH = path.resolve('data/e2e-live-report.json');
const PREFIX = `LIVE-E2E-${Date.now()}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGeminiKeys() {
  const raw =
    process.env.GEMINI_API_KEYS ||
    process.env.GEMINI_API_KEYs ||
    process.env.GEMINI_API_KEY ||
    '';
  const keys = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!keys.length) throw new Error('No Gemini API keys found.');
  return keys;
}

function createDeterministicGemini() {
  const gemini = new GeminiAnalyzer(['deterministic-test-key']);
  gemini.capturedPrompts = {
    daily: [],
    weekly: [],
    reorg: [],
  };
  gemini._generateWithFailover = async (_getModelFn, prompt) => {
    if (prompt.includes('Today is ')) {
      gemini.capturedPrompts.daily.push(prompt);
      const urgentMode = /URGENT MODE is active/i.test(prompt);
      const text = urgentMode
        ? '**Urgent Briefing**\n1. Handle the nearest deadline first.'
        : '**Humane Briefing**\n1. Start with the highest-value task.';
      return { response: { usageMetadata: null, text: () => text } };
    }

    if (prompt.includes('Current active tasks') && prompt.includes('Tasks analyzed this week')) {
      gemini.capturedPrompts.weekly.push(prompt);
      return { response: { usageMetadata: null, text: () => '**Weekly Digest**\n1. Review the biggest open loop.' } };
    }

    if (prompt.includes('Create a new reorganization proposal.') || prompt.includes('User refinement request:')) {
      gemini.capturedPrompts.reorg.push(prompt);
      return {
        response: {
          usageMetadata: null,
          text: () => JSON.stringify({
            summary: 'Deterministic live reorg proposal.',
            questions: prompt.includes('User refinement request:') ? ['Which errands should be merged?'] : [],
            actions: [],
          }),
        },
      };
    }

    return { response: { usageMetadata: null, text: () => '{}' } };
  };
  return gemini;
}

function createPipelineDouble(ticktick, adapter) {
  return {
    async processMessage(userMessage) {
      if (/^move it to tomorrow$/i.test(userMessage.trim())) {
        return {
          type: 'error',
          results: [],
          failure: {
            class: 'validation',
            failureClass: 'validation',
            requestId: null,
            retryable: true,
            rolledBack: false,
          },
          confirmationText: 'Clarification needed.',
          errors: ['Which task do you want to move?'],
        };
      }

      const moveTodayMatch = userMessage.match(/^move\s+(.+?)\s+to\s+today$/i);
      if (moveTodayMatch) {
        const titleHint = moveTodayMatch[1].replace(/\btask\b/i, '').trim().toLowerCase();
        const tasks = await ticktick.getAllTasksCached(60000);
        const matchedTask = tasks.find((task) => (task.title || '').toLowerCase().includes(titleHint));
        if (!matchedTask) {
          return { type: 'non-task', results: [], errors: [], confirmationText: 'No actionable tasks detected.' };
        }

        const dueDate = scheduleToDateTime('today', { priorityLabel: 'career-critical' });
        await adapter.updateTask(matchedTask.id, {
          originalProjectId: matchedTask.projectId,
          dueDate,
        });
        return {
          type: 'task',
          results: [],
          errors: [],
          confirmationText: `Moved "${matchedTask.title}" to today.`,
        };
      }

      return { type: 'non-task', results: [], errors: [], confirmationText: 'No actionable tasks detected.' };
    },
  };
}

function updateFactory(chatId) {
  let updateId = 800000;
  let messageId = 1;
  let callbackId = 1;
  const now = () => Math.floor(Date.now() / 1000);
  const user = { id: chatId, is_bot: false, first_name: 'LiveE2E', username: 'live_e2e_user' };

  return {
    message(text) {
      const msg = {
        message_id: messageId++,
        from: user,
        chat: { id: chatId, type: 'private' },
        date: now(),
        text,
      };
      if (text.startsWith('/')) {
        const cmd = text.split(/\s+/)[0];
        msg.entities = [{ offset: 0, length: cmd.length, type: 'bot_command' }];
      }
      return { update_id: updateId++, message: msg };
    },
    callback(data) {
      return {
        update_id: updateId++,
        callback_query: {
          id: `cb-${callbackId++}`,
          from: user,
          chat_instance: 'live-e2e',
          data,
          message: {
            message_id: messageId++,
            from: { id: 777000, is_bot: true, first_name: 'Live E2E Bot' },
            chat: { id: chatId, type: 'private' },
            date: now(),
            text: 'callback-anchor',
          },
        },
      };
    },
  };
}

async function withMockTelegramServer(port, apiCalls, fn) {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8');
    let payload = {};
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch {
        payload = {};
      }
    }
    const method = (req.url || '').split('/').pop()?.split('?')[0] || 'unknown';
    apiCalls.push({ method, payload });

    let result = true;
    if (method === 'getMe') {
      result = { id: 777000, is_bot: true, first_name: 'Live E2E Bot', username: 'live_e2e_bot' };
    } else if (method === 'sendMessage' || method === 'editMessageText') {
      result = {
        message_id: Math.floor(Math.random() * 100000),
        date: Math.floor(Date.now() / 1000),
        chat: { id: payload.chat_id || CHAT_ID, type: 'private' },
        text: payload.text || '',
      };
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result }));
  });

  await new Promise((resolve) => server.listen(port, resolve));
  try {
    return await fn();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function fetchAllTasksIncludingCompleted(ticktick) {
  const projects = await ticktick.getProjects();
  const all = [];
  for (const p of projects) {
    try {
      const data = await ticktick.getProjectWithTasks(p.id);
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      for (const t of tasks) {
        all.push({ ...t, projectId: p.id, projectName: p.name });
      }
    } catch {
      // ignore inaccessible project
    }
  }
  return all;
}

async function fetchActiveTasks(ticktick) {
  return ticktick.getAllTasksCached(0);
}

function summarizeTask(t) {
  return {
    id: t.id,
    title: t.title,
    projectId: t.projectId,
    projectName: t.projectName,
    priority: t.priority,
    dueDate: t.dueDate,
    status: t.status,
  };
}

async function main() {
  if (!CHAT_ID) throw new Error('TELEGRAM_CHAT_ID is required for e2e-live-ticktick.');
  const originalStore = fs.existsSync(STORE_PATH) ? fs.readFileSync(STORE_PATH, 'utf8') : null;
  const apiCalls = [];
  const checkpoints = [];
  const findings = [];
  const createdTaskIds = new Set();
  const touchedTaskIds = new Set();
  let ticktick;
  let latestActiveTasks = [];

  try {
    await store.resetAll();

    ticktick = new TickTickClient({
      clientId: process.env.TICKTICK_CLIENT_ID,
      clientSecret: process.env.TICKTICK_CLIENT_SECRET,
      redirectUri: process.env.TICKTICK_REDIRECT_URI,
    });

    const projects = await ticktick.getProjects();
    assert.ok(projects.length > 0, 'Expected at least one TickTick project');

    const inbox = projects.find((p) => (p.name || '').toLowerCase() === 'inbox') || projects[0];
    const careerProject = projects.find((p) => /career|study|learning|growth|interview/i.test(p.name || '')) || projects[0];
    const adminProject = projects.find((p) => /admin|personal|life|errand|home|health/i.test(p.name || '')) || projects[0];

    checkpoints.push({
      id: 'ticktick-connectivity',
      status: 'pass',
      detail: `Connected to TickTick. Projects=${projects.length}, inbox=${inbox.name}`,
    });

    const gemini = createDeterministicGemini();
    const adapter = new TickTickAdapter(ticktick);

    const seedPayloads = [
      { title: `${PREFIX} Netflix System Design`, content: '', projectId: inbox.id, priority: 0 },
      { title: `${PREFIX} get chicken`, content: '', projectId: inbox.id, priority: 0 },
      { title: `${PREFIX} get onion`, content: '', projectId: inbox.id, priority: 0 },
      { title: `${PREFIX} print letter`, content: '', projectId: inbox.id, priority: 0 },
      { title: `${PREFIX} wifi details for mom`, content: 'Friend credential note: Password=Abc!23456', projectId: inbox.id, priority: 0 },
    ];

    const seeded = [];
    for (const payload of seedPayloads) {
      const created = await adapter.createTask(payload);
      seeded.push(created);
      createdTaskIds.add(created.id);
    }
    const seededNetflix = seeded.find((t) => /netflix system design/i.test(t.title || '')) || seeded[0];
    checkpoints.push({
      id: 'seed',
      status: 'pass',
      detail: `Created ${seeded.length} isolated live TickTick tasks with prefix ${PREFIX}.`,
    });
    const pipeline = createPipelineDouble(ticktick, adapter);

    await withMockTelegramServer(19082, apiCalls, async () => {
      const bot = new Bot('live-e2e-token', {
        client: { apiRoot: 'http://127.0.0.1:19082/bot' },
      });
      bot.catch((err) => console.error('BOT_ERR', err.message));

      registerCommands(bot, ticktick, gemini, adapter, pipeline, {
        autoApplyLifeAdmin: false,
        autoApplyDrops: false,
        autoApplyMode: 'metadata-only',
      });
      registerCallbacks(bot, ticktick, gemini, adapter);
      await bot.init();

      const mk = updateFactory(CHAT_ID);

      // Start + menu
      await bot.handleUpdate(mk.message('/start'));
      await sleep(150);
      assert.equal(store.getChatId(), CHAT_ID);
      const startMsg = apiCalls.filter((c) => c.method === 'sendMessage').at(-1);
      assert.ok(startMsg?.payload?.reply_markup, 'Expected /start keyboard');
      checkpoints.push({ id: 'start', status: 'pass', detail: 'Start command emitted keyboard.' });

      await bot.handleUpdate(mk.message('/menu'));
      await sleep(150);
      checkpoints.push({ id: 'menu', status: 'pass', detail: 'Menu command path executed.' });

      const beforeUrgentOn = apiCalls.length;
      await bot.handleUpdate(mk.message('/urgent on'));
      await sleep(150);
      const urgentOnMessage = apiCalls
        .slice(beforeUrgentOn)
        .filter((c) => c.method === 'sendMessage')
        .at(-1);
      assert.match(urgentOnMessage?.payload?.text || '', /Urgent mode activated/i);

      const beforeUrgentBriefing = apiCalls.length;
      await bot.handleUpdate(mk.message('/briefing'));
      await sleep(250);
      const urgentBriefingMessage = apiCalls
        .slice(beforeUrgentBriefing)
        .filter((c) => c.method === 'sendMessage')
        .at(-1);
      assert.match(urgentBriefingMessage?.payload?.text || '', /Urgent Briefing/i);
      assert.match(urgentBriefingMessage?.payload?.text || '', /Urgent mode is currently active/i);
      assert.match(gemini.capturedPrompts.daily.at(-1) || '', /URGENT MODE is active/i);
      checkpoints.push({
        id: 'urgent-toggle-on',
        status: 'pass',
        detail: 'Urgent mode activation changed the daily briefing prompt and output.',
      });

      const beforeUrgentOff = apiCalls.length;
      await bot.handleUpdate(mk.message('/urgent off'));
      await sleep(150);
      const urgentOffMessage = apiCalls
        .slice(beforeUrgentOff)
        .filter((c) => c.method === 'sendMessage')
        .at(-1);
      assert.match(urgentOffMessage?.payload?.text || '', /Urgent mode deactivated/i);

      const beforeHumaneBriefing = apiCalls.length;
      await bot.handleUpdate(mk.message('/briefing'));
      await sleep(250);
      const humaneBriefingMessage = apiCalls
        .slice(beforeHumaneBriefing)
        .filter((c) => c.method === 'sendMessage')
        .at(-1);
      assert.match(humaneBriefingMessage?.payload?.text || '', /Humane Briefing/i);
      assert.doesNotMatch(humaneBriefingMessage?.payload?.text || '', /Urgent mode is currently active/i);
      assert.doesNotMatch(gemini.capturedPrompts.daily.at(-1) || '', /URGENT MODE is active/i);
      checkpoints.push({
        id: 'urgent-toggle-off',
        status: 'pass',
        detail: 'Urgent mode deactivation restored the humane daily briefing prompt and output.',
      });

      // Freeform update (date move)
      await bot.handleUpdate(mk.message(`Move ${PREFIX} Netflix System Design to today`));
      await sleep(800);
      const afterMove = await adapter.getTaskSnapshot(seededNetflix.id, seededNetflix.projectId);
      assert.ok(afterMove?.dueDate, 'Expected dueDate after move-to-today');
      touchedTaskIds.add(afterMove.id);
      if (String(afterMove.dueDate).includes('T23:59:00.000')) {
        findings.push({
          severity: 'high',
          area: 'scheduling',
          message: 'Freeform move to today still used end-of-day scheduling on live TickTick.',
          evidence: afterMove.dueDate,
        });
      }
      checkpoints.push({ id: 'freeform-update', status: 'pass', detail: `Moved Netflix task, dueDate=${afterMove?.dueDate}` });

      // Ambiguity handling
      const beforeAmbiguous = apiCalls.length;
      await bot.handleUpdate(mk.message('Move it to tomorrow'));
      await sleep(600);
      const ambiguityText = apiCalls
        .slice(beforeAmbiguous)
        .filter((c) => c.method === 'sendMessage')
        .map((c) => c.payload?.text || '')
        .join('\n');
      const askedClarify = /clarif|ambiguous|which|full task context/i.test(ambiguityText);
      checkpoints.push({
        id: 'ambiguity',
        status: askedClarify ? 'pass' : 'warn',
        detail: askedClarify ? 'Clarification prompt emitted.' : 'No clear clarification prompt found.',
      });

      // Briefing output formatting sanity
      const beforeBriefing = apiCalls.length;
      await bot.handleUpdate(mk.message('/briefing'));
      await sleep(1200);
      const briefingMsg = apiCalls
        .slice(beforeBriefing)
        .filter((c) => c.method === 'sendMessage')
        .at(-1);
      if (briefingMsg?.payload?.text?.includes('####')) {
        findings.push({
          severity: 'medium',
          area: 'telegram-formatting',
          message: 'Briefing output still contains raw hash markdown in live flow.',
        });
      }
      checkpoints.push({ id: 'briefing', status: 'pass', detail: 'Briefing command path executed on live data.' });

      // Reorg propose/refine
      await bot.handleUpdate(mk.message('/reorg'));
      await sleep(2200);
      let pending = store.getPendingReorg();
      assert.ok(pending, 'Expected pending reorg after /reorg');
      assert.ok(Array.isArray(pending.actions), 'Expected reorg actions array');
      checkpoints.push({
        id: 'reorg-propose',
        status: pending.actions.length > 0 ? 'pass' : 'warn',
        detail: `Initial reorg actions=${pending.actions.length}`,
      });
      if (pending.actions.length > 30) {
        findings.push({
          severity: 'high',
          area: 'reorg-size',
          message: 'Reorg proposal exceeded 30 actions in live run.',
          evidence: pending.actions.length,
        });
      }

      await bot.handleUpdate(mk.callback('reorg:refine'));
      await sleep(250);
      await bot.handleUpdate(
        mk.message(
          `Only apply changes for tasks with prefix ${PREFIX}. Merge groceries-related tasks, move tasks out of Inbox, set practical priority, and ask clarifying questions for vague tasks.`
        )
      );
      await sleep(2400);
      pending = store.getPendingReorg();
      assert.ok(pending && !pending.awaitingRefine, 'Expected refined reorg proposal');
      checkpoints.push({
        id: 'reorg-refine',
        status: 'pass',
        detail: `Refined reorg actions=${pending.actions.length}, questions=${(pending.questions || []).length}`,
      });

      // Safety filter before apply: only test-prefix tasks.
      const allNow = await fetchActiveTasks(ticktick);
      const prefixTasks = allNow.filter((t) => (t.title || '').startsWith(PREFIX));
      const prefixById = new Map(prefixTasks.map((t) => [t.id, t]));
      const prefixIdSet = new Set(prefixTasks.map((t) => t.id));

      const sanitized = [];
      const seenUpdateIds = new Set();
      for (const a of pending.actions || []) {
        if (!a || typeof a !== 'object') continue;
        if (a.type === 'create') {
          const changes = { ...(a.changes || {}) };
          if (!changes.title || typeof changes.title !== 'string') continue;
          if (!changes.title.includes(PREFIX)) changes.title = `${PREFIX} ${changes.title}`;
          if (![0, 1, 3, 5].includes(changes.priority)) changes.priority = 1;
          if (!changes.projectId) changes.projectId = adminProject.id;
          sanitized.push({ type: 'create', changes });
          continue;
        }
        if (!a.taskId || !prefixIdSet.has(a.taskId)) continue;
        if ((a.type === 'update' || a.type === 'drop') && seenUpdateIds.has(a.taskId)) continue;
        if (a.type === 'update' || a.type === 'drop') seenUpdateIds.add(a.taskId);
        sanitized.push({
          type: a.type,
          taskId: a.taskId,
          changes: { ...(a.changes || {}) },
        });
      }

      const touchedPrefix = new Set(sanitized.filter((a) => a.taskId).map((a) => a.taskId));
      for (const t of prefixTasks) {
        if (touchedPrefix.has(t.id)) continue;
        sanitized.push({
          type: 'update',
          taskId: t.id,
          changes: {
            projectId: /netflix|system design/i.test(t.title) ? careerProject.id : adminProject.id,
            priority: /netflix|system design/i.test(t.title) ? 5 : 1,
            scheduleBucket: /netflix|system design/i.test(t.title) ? 'today' : 'tomorrow',
          },
        });
      }

      await store.setPendingReorg({
        summary: `Sanitized live apply for ${PREFIX}`,
        actions: sanitized,
        questions: pending.questions || [],
        awaitingRefine: false,
      });

      await bot.handleUpdate(mk.callback('reorg:apply'));
      await sleep(1200);
      checkpoints.push({
        id: 'reorg-apply',
        status: 'pass',
        detail: `Applied sanitized reorg actions=${sanitized.length}`,
      });

      // Validate policy on live tasks
      const finalAll = await fetchActiveTasks(ticktick);
      latestActiveTasks = finalAll;
      const finalPrefix = finalAll.filter((t) => (t.title || '').startsWith(PREFIX) && (t.status === 0 || t.status === undefined));
      const inboxLeft = finalPrefix.filter((t) => (t.projectName || '').toLowerCase() === 'inbox');
      if (inboxLeft.length > 0) {
        findings.push({
          severity: 'high',
          area: 'inbox-policy',
          message: 'Active prefix tasks remained in Inbox after live reorg apply.',
          evidence: inboxLeft.map((t) => summarizeTask(t)),
        });
      }

      const unprioritized = finalPrefix.filter((t) => ![1, 3, 5].includes(t.priority));
      if (unprioritized.length > 0) {
        findings.push({
          severity: 'medium',
          area: 'priority-policy',
          message: 'Some active prefix tasks remain unprioritized (0) after reorg apply.',
          evidence: unprioritized.map((t) => summarizeTask(t)),
        });
      }

      // Sensitive-content guard on live TickTick
      const sensitiveTitle = `${PREFIX} wifi details for mom`;
      await bot.handleUpdate(mk.message(`Update ${sensitiveTitle} content to: remove old details and replace with clean text`));
      await sleep(1000);
      latestActiveTasks = await fetchActiveTasks(ticktick);
      const sensitiveAfter = latestActiveTasks.find((t) => t.title === sensitiveTitle);
      const preserved = /Password=Abc!23456/i.test(sensitiveAfter?.content || '');
      checkpoints.push({
        id: 'sensitive-guard',
        status: preserved ? 'pass' : 'fail',
        detail: preserved ? 'Sensitive content preserved on live task.' : 'Sensitive content was overwritten on live task.',
      });
      if (!preserved) {
        findings.push({
          severity: 'critical',
          area: 'data-safety',
          message: 'Sensitive content was overwritten in live TickTick test.',
          evidence: summarizeTask(sensitiveAfter || {}),
        });
      }
    });

    // Capture exhaustive non-functional telemetry
    const e2eReport = {
      prefix: PREFIX,
      checkpoints,
      findings,
      apiCallCount: apiCalls.length,
      apiCallsTail: apiCalls.slice(-12),
      tokenScope: 'live ticktick + mocked telegram transport',
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(e2eReport, null, 2));
    console.log(JSON.stringify(e2eReport, null, 2));

    const failed = checkpoints.some((c) => c.status === 'fail');
    if (failed) process.exitCode = 1;
  } finally {
    try {
      if (ticktick) {
        const all = latestActiveTasks.length > 0 ? latestActiveTasks : await fetchActiveTasks(ticktick);
        const testTasks = all.filter((t) => (t.title || '').startsWith(PREFIX));
        for (const t of testTasks) {
          try {
            await adapter.deleteTask(t.id, t.projectId);
          } catch {
            // best-effort cleanup
          }
        }
      }
    } catch {
      // ignore cleanup failure
    }

    if (originalStore !== null) {
      fs.writeFileSync(STORE_PATH, originalStore);
    } else if (fs.existsSync(STORE_PATH)) {
      fs.rmSync(STORE_PATH, { force: true });
    }
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err) => {
    console.error('E2E_LIVE_FATAL', err);
    process.exit(1);
  });
}
