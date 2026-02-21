// Grammy Telegram bot setup
import { Bot } from 'grammy';
import { registerCommands } from './commands.js';
import { registerCallbacks } from './callbacks.js';

export function createBot(token, ticktick, gemini, config = {}) {
    const bot = new Bot(token);

    // Error handler
    bot.catch((err) => {
        console.error('Bot error:', err.message);
    });

    // Register all handlers
    registerCommands(bot, ticktick, gemini, config);
    registerCallbacks(bot, ticktick, gemini);

    return bot;
}
