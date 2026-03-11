import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const DEFAULT_TIMEZONE = 'Europe/Dublin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_CONTEXT_FILE = path.join(__dirname, 'user_context.js');

let userContextTimezone = null;
let userContextSource = null;

if (existsSync(USER_CONTEXT_FILE)) {
    try {
        const mod = await import('./user_context.js');
        if (typeof mod.USER_TIMEZONE === 'string' && mod.USER_TIMEZONE.trim()) {
            userContextTimezone = mod.USER_TIMEZONE.trim();
            userContextSource = 'user_context';
        }
    } catch (err) {
        console.warn('⚠️  Failed to load user_context.js timezone override:', err.message);
    }
}

export function getUserTimezone() {
    return userContextTimezone || process.env.USER_TIMEZONE || DEFAULT_TIMEZONE;
}

export function getUserTimezoneSource() {
    if (userContextTimezone) return userContextSource;
    return process.env.USER_TIMEZONE ? 'env' : 'default';
}
