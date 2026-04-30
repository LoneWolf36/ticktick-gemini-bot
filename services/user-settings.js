import { loadUserContextModule, getModuleExport } from './user-context-loader.js';

export const DEFAULT_TIMEZONE = 'Europe/Dublin';

let userContextTimezone = null;
let userContextSource = null;

const { mod: ctxModule } = await loadUserContextModule();
const tz = getModuleExport(ctxModule, 'USER_TIMEZONE');
if (typeof tz === 'string' && tz.trim()) {
    userContextTimezone = tz.trim();
    userContextSource = 'user_context';
}

/**
 * Fetches the user's timezone from user_context, environment, or default.
 * @returns {string} Timezone string (e.g., 'Europe/Dublin')
 */
export function getUserTimezone() {
    return process.env.USER_TIMEZONE || userContextTimezone || DEFAULT_TIMEZONE;
}

/**
 * Identifies the source of the resolved user timezone.
 * @returns {'user_context'|'env'|'default'} Timezone source
 */
export function getUserTimezoneSource() {
    if (process.env.USER_TIMEZONE) return 'env';
    if (userContextTimezone) return userContextSource;
    return 'default';
}
