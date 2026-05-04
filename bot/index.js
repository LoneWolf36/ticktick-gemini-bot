// Grammy Telegram bot setup
import { Bot } from 'grammy';
import { registerCommands } from './commands.js';
import { registerCallbacks } from './callbacks.js';

/**
 * Factory function to create and configure a Telegram bot instance.
 *
 * @param {string} token - Telegram bot token.
 * @param {TickTickClient} ticktick - Low-level TickTick client.
 * @param {GeminiAnalyzer} gemini - Gemini AI client.
 * @param {TickTickAdapter} adapter - Structured adapter for TickTick writes.
 * @param {Object} pipeline - Processing pipeline for task mutations.
 * @param {Object} [config={}] - Optional configuration for bot behavior.
 * @returns {Bot} Configured Grammy bot instance.
 */
export function createBot(token, ticktick, gemini, adapter, pipeline, config = {}) {
    const bot = new Bot(token);

    // Error handler
    bot.catch((err) => {
        console.error('Bot error:', err.message);
    });

    // Register all handlers
    registerCommands(bot, ticktick, gemini, adapter, pipeline, config);
    registerCallbacks(bot, adapter, pipeline);

    return bot;
}
