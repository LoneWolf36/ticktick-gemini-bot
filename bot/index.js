// Grammy Telegram bot setup
import { Bot } from 'grammy';
import { registerCommands } from './commands.js';
import { registerCallbacks } from './callbacks.js';

export function createBot(token, ticktick, gemini, adapter, pipeline, config = {}) {
    const bot = new Bot(token);

    // Error handler
    bot.catch((err) => {
        console.error('Bot error:', err.message);
    });

    // Register all handlers
    registerCommands(bot, ticktick, gemini, adapter, pipeline, config);
    registerCallbacks(bot, ticktick, gemini, adapter, pipeline);

    return bot;
}

