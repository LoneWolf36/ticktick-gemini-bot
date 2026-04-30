import test from 'node:test';
import assert from 'node:assert/strict';

import { registerCommands } from '../bot/commands.js';
import { AUTHORIZED_CHAT_ID, buildMutationCandidateKeyboard } from '../services/shared-utils.js';
import * as store from '../services/store.js';

test('mutation clarification keyboard uses taskId and distinguishes same-title tasks', () => {
  const keyboard = buildMutationCandidateKeyboard([
    { taskId: 'measure-inbox', title: 'Record personal measurements', projectName: 'Inbox' },
    { taskId: 'measure-health', title: 'Record personal measurements', projectName: 'Health' },
  ]);

  const buttons = keyboard.inline_keyboard.flat().filter(button => button.callback_data?.startsWith('mut:pick:'));

  assert.deepEqual(
    buttons.map(button => button.callback_data),
    ['mut:pick:measure-inbox', 'mut:pick:measure-health'],
  );
  assert.notEqual(buttons[0].text, buttons[1].text, 'same-title candidates need distinct button labels');
  assert.match(buttons[0].text, /Inbox/);
  assert.match(buttons[1].text, /Health/);
});

test('registerCommands stores resolver taskId candidates so mut:pick can find them', async () => {
  await store.resetAll();

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
  const chatId = AUTHORIZED_CHAT_ID || 24680;

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
    {
      listProjects: async () => [],
      listActiveTasks: async () => [],
    },
    {
      processMessage: async () => ({
        type: 'clarification',
        confirmationText: 'Which task?',
        clarification: {
          reason: 'ambiguous_target',
          candidates: [
            { taskId: 'measure-inbox', title: 'Record personal measurements', projectName: 'Inbox' },
            { taskId: 'measure-health', title: 'Record personal measurements', projectName: 'Health' },
          ],
        },
      }),
    },
  );

  const messageHandler = handlers.events.find(({ eventName }) => eventName === 'message:text')?.handler;
  const replies = [];
  await messageHandler({
    message: { text: 'Update record personal measurements and make it low priority' },
    chat: { id: chatId },
    from: { id: chatId },
    reply: async (message, opts) => { replies.push({ message, opts }); },
  });

  const pending = store.getPendingMutationClarification();
  assert.deepEqual(pending.candidates.map(candidate => candidate.id), ['measure-inbox', 'measure-health']);
  const buttons = replies.at(-1).opts.reply_markup.inline_keyboard.flat().filter(button => button.callback_data?.startsWith('mut:pick:'));
  assert.deepEqual(buttons.map(button => button.callback_data), ['mut:pick:measure-inbox', 'mut:pick:measure-health']);

  await store.clearPendingMutationClarification();
});
