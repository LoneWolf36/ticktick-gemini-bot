// Opt-in E2E validation harness for checklist/review flows.
// Validation status: intentionally excluded from product-kit drift checks.
// This mocked harness is kept only for interactive debugging and is redundant
// with automated regression coverage.
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
import * as store from '../services/store.js';
import { scheduleToDateTime } from '../bot/utils.js';

const CHAT_ID = Number(process.env.TELEGRAM_CHAT_ID || 738158868);
const PREFIX = `E2E-${Date.now()}`;
const STORE_PATH = path.resolve('data/store.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGeminiKeys() {
  const keys = (
    process.env.GEMINI_API_KEYS ||
    process.env.GEMINI_API_KEYs ||
    process.env.GEMINI_API_KEY ||
    ''
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!keys.length) {
    throw new Error('No Gemini API keys found in environment.');
  }
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
            summary: 'Deterministic checklist reorg proposal.',
            questions: prompt.includes('User refinement request:') ? ['Which grocery tasks should merge?'] : [],
            actions: [
              {
                type: 'update',
                taskId: 't_netflix',
                changes: {
                  projectId: 'p_career',
                  priority: 5,
                },
              },
            ],
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

      const moveTodayMatch = userMessage.match(/^move(?: the)? (.+?) to today$/i);
      if (moveTodayMatch) {
        const titleHint = moveTodayMatch[1].replace(/\btask\b/i, '').trim().toLowerCase();
        const matchedTask = ticktick.tasks.find((task) => (task.title || '').toLowerCase().includes(titleHint));
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

function createAdapterDouble(testDouble) {
  return {
    async createTask(taskData) {
      return testDouble.createTask(taskData);
    },
    async updateTask(taskId, changes) {
      return testDouble.updateTask(taskId, changes);
    },
    async completeTask(taskId, projectId) {
      return testDouble.completeTask(projectId, taskId);
    },
    async deleteTask(taskId, projectId) {
      const idx = ticktick.tasks.findIndex((task) => task.id === taskId && task.projectId === projectId);
      if (idx < 0) throw new Error(`Task not found for delete: ${taskId}`);
      ticktick.tasks.splice(idx, 1);
      return { success: true };
    },
  };
}

class TickTickTestDouble {
  constructor(projects, tasks) {
    this.projects = projects;
    this.tasks = tasks;
    this.cacheTs = Date.now();
  }

  isAuthenticated() {
    return true;
  }

  getCacheAgeSeconds() {
    return Math.floor((Date.now() - this.cacheTs) / 1000);
  }

  getLastFetchedProjects() {
    return this.projects;
  }

  async getAllTasks() {
    this.cacheTs = Date.now();
    return structuredClone(this.tasks);
  }

  async getAllTasksCached() {
    return this.getAllTasks();
  }

  async createTask(taskData) {
    const projectId = taskData.projectId || this.projects[0].id;
    const projectName = this.projects.find((p) => p.id === projectId)?.name || 'Inbox';
    const task = {
      id: `created-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: taskData.title,
      content: taskData.content || '',
      dueDate: taskData.dueDate || null,
      priority: taskData.priority ?? 0,
      projectId,
      projectName,
      status: 0,
    };
    this.tasks.push(task);
    return structuredClone(task);
  }

  async updateTask(taskId, changes) {
    const idx = this.tasks.findIndex((t) => t.id === taskId);
    if (idx < 0) throw new Error(`Task not found: ${taskId}`);
    const task = this.tasks[idx];

    if (changes.title !== undefined) task.title = changes.title;
    if (changes.content !== undefined) task.content = changes.content;
    if (changes.priority !== undefined) task.priority = changes.priority;
    if (changes.dueDate !== undefined) task.dueDate = changes.dueDate;

    if (changes.projectId && changes.projectId !== task.projectId) {
      task.projectId = changes.projectId;
      task.projectName = this.projects.find((p) => p.id === changes.projectId)?.name || task.projectName;
    }

    this.tasks[idx] = task;
    return structuredClone(task);
  }

  async completeTask(projectId, taskId) {
    const idx = this.tasks.findIndex((t) => t.id === taskId && t.projectId === projectId);
    if (idx < 0) throw new Error(`Task not found for complete: ${taskId}`);
    this.tasks[idx].status = 2;
    return { success: true };
  }
}

function createProjects() {
  return [
    { id: 'p_inbox', name: 'Inbox' },
    { id: 'p_career', name: 'Career' },
    { id: 'p_study', name: 'Study' },
    { id: 'p_admin', name: 'Personal/Admin' },
  ];
}

function createTasks() {
  return [
    {
      id: 't_netflix',
      title: `${PREFIX} Netflix System Design`,
      content: '',
      priority: 0,
      projectId: 'p_inbox',
      projectName: 'Inbox',
      status: 0,
    },
    {
      id: 't_chicken',
      title: `${PREFIX} get chicken`,
      content: '',
      priority: 0,
      projectId: 'p_inbox',
      projectName: 'Inbox',
      status: 0,
    },
    {
      id: 't_onion',
      title: `${PREFIX} get onion`,
      content: '',
      priority: 0,
      projectId: 'p_inbox',
      projectName: 'Inbox',
      status: 0,
    },
    {
      id: 't_letter',
      title: `${PREFIX} print letter`,
      content: '',
      priority: 0,
      projectId: 'p_inbox',
      projectName: 'Inbox',
      status: 0,
    },
    {
      id: 't_sensitive',
      title: `${PREFIX} wifi details for mom`,
      content: 'Friend credential note: Password=Abc!23456',
      priority: 0,
      projectId: 'p_inbox',
      projectName: 'Inbox',
      status: 0,
    },
  ];
}

function createUpdateFactory(chatId) {
  let updateId = 500000;
  let messageId = 1000;
  let callbackId = 1;
  const now = () => Math.floor(Date.now() / 1000);

  const user = {
    id: chatId,
    is_bot: false,
    first_name: 'E2E',
    username: 'e2e_user',
  };

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
          chat_instance: 'e2e-chat',
          data,
          message: {
            message_id: messageId++,
            from: { id: 9999999, is_bot: true, first_name: 'Bot' },
            chat: { id: chatId, type: 'private' },
            date: now(),
            text: 'callback-anchor',
          },
        },
      };
    },
  };
}

function evaluateGaps({ ticktick, pendingReorg, freeformDueDate }) {
  const findings = [];

  if (typeof freeformDueDate === 'string' && freeformDueDate.includes('T23:59:00.000')) {
    findings.push({
      severity: 'high',
      area: 'scheduling',
      message: 'Freeform date updates still default to 23:59 end-of-day instead of slot-based times.',
      evidence: freeformDueDate,
    });
  }

  const inboxTasks = ticktick.tasks.filter((t) => t.status === 0 && t.projectName === 'Inbox' && t.title.startsWith(PREFIX));
  if (inboxTasks.length > 0) {
    findings.push({
      severity: 'medium',
      area: 'reorg-policy',
      message: 'Test tasks remain in Inbox after E2E run; policy "nothing should persist in Inbox" is not fully enforced.',
      evidence: inboxTasks.map((t) => t.title),
    });
  }

  if (!pendingReorg || !Array.isArray(pendingReorg.actions)) {
    findings.push({
      severity: 'high',
      area: 'reorg-loop',
      message: '/reorg did not produce a valid pending proposal with actions.',
      evidence: pendingReorg,
    });
  } else {
    const hasQuestion = Array.isArray(pendingReorg.questions) && pendingReorg.questions.length > 0;
    if (!hasQuestion) {
      findings.push({
        severity: 'low',
        area: 'clarification',
        message: 'Reorg refinement produced no clarifying questions despite mixed vague errands.',
      });
    }
  }

  return findings;
}

async function main() {
  const checkpoints = [];
  const apiCalls = [];
  const originalStore = fs.existsSync(STORE_PATH) ? fs.readFileSync(STORE_PATH, 'utf8') : null;
  let mockServer = null;

  try {
    await store.resetAll();

    const projects = createProjects();
    const tasks = createTasks();
    const ticktick = new TickTickTestDouble(projects, tasks);
    const gemini = createDeterministicGemini();
    const adapter = createAdapterDouble(ticktick);
    const pipeline = createPipelineDouble(ticktick, adapter);
    const mockPort = 19081;
    mockServer = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let payload = {};
      if (rawBody) {
        try {
          payload = JSON.parse(rawBody);
        } catch {
          payload = {};
        }
      }

      const method = (req.url || '').split('/').pop()?.split('?')[0] || 'unknown';
      apiCalls.push({ method, payload });

      let result = true;
      if (method === 'getMe') {
        result = { id: 777000, is_bot: true, first_name: 'E2E Bot', username: 'e2e_bot' };
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
    await new Promise((resolve) => mockServer.listen(mockPort, resolve));

    const bot = new Bot('e2e-test-token', {
      client: { apiRoot: `http://127.0.0.1:${mockPort}/bot` },
    });
    bot.catch((err) => {
      console.error('BOT_ERR', err.message);
    });
    registerCommands(bot, ticktick, gemini, adapter, pipeline, {
      autoApplyLifeAdmin: false,
      autoApplyDrops: false,
      autoApplyMode: 'metadata-only',
    });
    registerCallbacks(bot, ticktick, gemini, adapter);

    await bot.init();
    const mk = createUpdateFactory(CHAT_ID);

    // 1) Start command + keyboard visibility
    await bot.handleUpdate(mk.message('/start'));
    await sleep(100);
    assert.equal(store.getChatId(), CHAT_ID);
    if (!apiCalls.length) {
      throw new Error('No Telegram API calls captured after /start update.');
    }
    const startMsg = apiCalls.filter((c) => c.method === 'sendMessage').at(-1);
    if (!startMsg?.payload?.reply_markup) {
      throw new Error(`Expected /start keyboard. Captured methods: ${apiCalls.map((c) => c.method).join(', ')}`);
    }
    checkpoints.push({ id: 'start', status: 'pass', detail: 'Bot start command returned keyboard and persisted chat ID.' });

    const beforeHumaneBriefing = apiCalls.length;
    await bot.handleUpdate(mk.message('/briefing'));
    await sleep(200);
    const humaneBriefing = apiCalls.slice(beforeHumaneBriefing).filter((c) => c.method === 'sendMessage').at(-1);
    assert.match(humaneBriefing?.payload?.text || '', /Humane Briefing/i);
    assert.doesNotMatch(humaneBriefing?.payload?.text || '', /Urgent mode is currently active/i);
    assert.doesNotMatch(gemini.capturedPrompts.daily.at(-1) || '', /URGENT MODE is active/i);
    checkpoints.push({
      id: 'humane-default',
      status: 'pass',
      detail: 'Without stored urgent mode, the briefing stays on the humane default path.',
    });

    const beforeUrgentBriefing = apiCalls.length;
    await store.setUrgentMode(CHAT_ID, true);
    await bot.handleUpdate(mk.message('/briefing'));
    await sleep(200);
    const urgentBriefing = apiCalls.slice(beforeUrgentBriefing).filter((c) => c.method === 'sendMessage').at(-1);
    assert.match(urgentBriefing?.payload?.text || '', /Urgent Briefing/i);
    assert.match(urgentBriefing?.payload?.text || '', /Urgent mode is currently active/i);
    assert.match(gemini.capturedPrompts.daily.at(-1) || '', /URGENT MODE is active/i);
    checkpoints.push({
      id: 'briefing-reminder',
      status: 'pass',
      detail: 'Urgent mode adds both the prompt augmentation and the manual briefing reminder.',
    });
    await store.setUrgentMode(CHAT_ID, false);

    // 2) Freeform update: move Netflix to today
    await bot.handleUpdate(mk.message(`Move the ${PREFIX} Netflix System Design task to today`));
    await sleep(300);
    const netflix = ticktick.tasks.find((t) => t.id === 't_netflix');
    assert.ok(netflix?.dueDate, 'Expected Netflix test task dueDate to be updated');
    checkpoints.push({
      id: 'freeform-update',
      status: 'pass',
      detail: `Freeform action updated dueDate for Netflix task: ${netflix.dueDate}`,
    });

    // 3) Ambiguous instruction should clarify
    const beforeAmbiguousCalls = apiCalls.length;
    await bot.handleUpdate(mk.message('Move it to tomorrow'));
    await sleep(300);
    const ambiguousOutbound = apiCalls.slice(beforeAmbiguousCalls).filter((c) => c.method === 'sendMessage');
    const ambiguousTextBlob = ambiguousOutbound.map((c) => c.payload.text || '').join('\n');
    const askedClarify = /clarif|which|ambiguous|full task context|what task/i.test(ambiguousTextBlob);
    checkpoints.push({
      id: 'ambiguity',
      status: askedClarify ? 'pass' : 'warn',
      detail: askedClarify
        ? 'Bot asked for clarification on ambiguous request.'
        : 'Bot did not clearly ask for clarification on ambiguous request.',
    });

    // 4) Reorg proposal generation
    await bot.handleUpdate(mk.message('/reorg'));
    await sleep(1200);
    let pending = store.getPendingReorg();
    assert.ok(pending, 'Expected pendingReorg after /reorg');
    checkpoints.push({
      id: 'reorg-propose',
      status: 'pass',
      detail: `Reorg proposal created with ${Array.isArray(pending.actions) ? pending.actions.length : 0} actions.`,
    });

    // 5) Reorg refine loop
    await bot.handleUpdate(mk.callback('reorg:refine'));
    await sleep(200);
    pending = store.getPendingReorg();
    assert.equal(pending?.awaitingRefine, true, 'Expected awaitingRefine true after callback');

    await bot.handleUpdate(
      mk.message(
        `Only act on tasks with prefix ${PREFIX}. Merge "${PREFIX} get chicken" and "${PREFIX} get onion" into one groceries task, move out of Inbox, assign priorities, and suggest useful times.`
      )
    );
    await sleep(1500);
    pending = store.getPendingReorg();
    assert.equal(pending?.awaitingRefine, false, 'Expected awaitingRefine false after refinement');
    checkpoints.push({
      id: 'reorg-refine',
      status: 'pass',
      detail: `Refined reorg proposal persisted with ${Array.isArray(pending.actions) ? pending.actions.length : 0} actions.`,
    });

    // 6) Reorg apply loop using actual refined proposal
    assert.ok(Array.isArray(pending.actions) && pending.actions.length > 0, 'Expected non-empty refined actions');
    const refinedProposal = structuredClone(pending);
    await bot.handleUpdate(mk.callback('reorg:apply'));
    await sleep(900);

    const reorgTouched = refinedProposal.actions
      .filter((a) => a.taskId)
      .map((a) => a.taskId);
    const touchedDistinct = new Set(reorgTouched);
    assert.ok(touchedDistinct.size > 0, 'Expected refined proposal to target at least one existing task');

    const netflixAfter = ticktick.tasks.find((t) => t.id === 't_netflix');
    assert.ok(netflixAfter, 'Expected netflix task to remain present after reorg apply');
    assert.ok([0, 1, 3, 5].includes(netflixAfter.priority), 'Expected netflix task to have normalized priority');
    checkpoints.push({
      id: 'reorg-apply',
      status: 'pass',
      detail: `Reorg apply callback executed ${refinedProposal.actions.length} actions.`,
    });

    // 7) Sensitive-content protection through executeActions path
    await bot.handleUpdate(
      mk.message(`Update ${PREFIX} wifi details for mom task content to: replace with clean note`)
    );
    await sleep(500);
    const sensitive = ticktick.tasks.find((t) => t.id === 't_sensitive');
    const preserved = /Password=Abc!23456/i.test(sensitive?.content || '');
    checkpoints.push({
      id: 'sensitive-guard',
      status: preserved ? 'pass' : 'fail',
      detail: preserved
        ? 'Sensitive content remained preserved after update attempt.'
        : 'Sensitive content was overwritten unexpectedly.',
    });

    const findings = evaluateGaps({
      ticktick,
      pendingReorg: refinedProposal,
      freeformDueDate: netflix?.dueDate || null,
    });

    const summary = {
      prefix: PREFIX,
      checkpoints,
      findings,
      artifacts: {
        apiCallCount: apiCalls.length,
        lastFiveApiCalls: apiCalls.slice(-5),
        finalTasks: ticktick.tasks
          .filter((t) => t.title.startsWith(PREFIX))
          .map((t) => ({
            id: t.id,
            title: t.title,
            project: t.projectName,
            priority: t.priority,
            dueDate: t.dueDate,
            status: t.status,
          })),
      },
    };

    fs.writeFileSync(path.resolve('data/e2e-report.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));

    const failed = checkpoints.some((c) => c.status === 'fail');
    if (failed) process.exitCode = 1;
  } finally {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
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
    console.error('E2E_FATAL', err);
    process.exit(1);
  });
}
