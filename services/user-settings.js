export const DEFAULT_TIMEZONE = 'Europe/Dublin';

export function getUserTimezone() {
    return process.env.USER_TIMEZONE || DEFAULT_TIMEZONE;
}

export function getUserTimezoneSource() {
    return process.env.USER_TIMEZONE ? 'env' : 'default';
}
