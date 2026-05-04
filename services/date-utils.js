/**
 * services/date-utils.js
 * Consolidated date utility functions for timezone-aware date operations.
 * Single source of truth for date manipulation across the codebase.
 */

/**
 * Coerces a value to a Date object.
 * @param {Date|string|number|undefined|null} value - Value to coerce
 * @param {Date} [fallback=new Date()] - Fallback Date if coercion fails
 * @returns {Date}
 */
export function coerceDate(value, fallback = new Date()) {
    // Use [[Class]] check via toString instead of instanceof Date,
    // because test environments may mock global.Date which breaks instanceof.
    if (Object.prototype.toString.call(value) === '[object Date]') {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    // Use same [[Class]] check for fallback to handle MockDate correctly
    if (Object.prototype.toString.call(fallback) === '[object Date]') return fallback;
    return new Date();
}

/**
 * Gets local date parts in a specific timezone using Intl.DateTimeFormat.
 * Returns structured date components for the given date at the given timezone.
 *
 * @param {Date} date - Date to get parts for
 * @param {string} timezone - IANA timezone string (e.g. 'Europe/Dublin')
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, weekday: number }}
 *   year: 4-digit year
 *   month: 0-indexed month (0=January)
 *   day: 1-indexed day of month
 *   hour: 0-23
 *   minute: 0-59
 *   weekday: 0-6 (0=Sunday)
 */
export function getZonedDateParts(date, timezone) {
    const resolved = coerceDate(date, new Date());
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hour12: false,
    }).formatToParts(resolved);
    const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    return {
        year: parseInt(lookup.year, 10),
        month: parseInt(lookup.month, 10) - 1, // 0-indexed
        day: parseInt(lookup.day, 10),
        hour: parseInt(lookup.hour, 10),
        minute: parseInt(lookup.minute, 10),
        weekday: weekdayMap[lookup.weekday] ?? new Date(
            parseInt(lookup.year, 10),
            parseInt(lookup.month, 10) - 1,
            parseInt(lookup.day, 10)
        ).getDay(),
    };
}

/**
 * Computes the timezone offset in minutes for a given local date/time and timezone.
 *
 * @param {number} year - Local year
 * @param {number} month - Local month (0-indexed)
 * @param {number} day - Local day
 * @param {number} hour - Local hour (0-23)
 * @param {number} minute - Local minute (0-59)
 * @param {string} timezone - IANA timezone string
 * @returns {number} Offset in minutes (positive = ahead of UTC)
 */
export function getTimezoneOffsetMinutes(year, month, day, hour, minute, timezone) {
    const utcGuess = new Date(Date.UTC(year, month, day, hour, minute, 0));
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(utcGuess);

    const get = (type) => parseInt(parts.find(p => p.type === type)?.value, 10);
    const localizedAsUtc = Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour'),
        get('minute'),
        get('second')
    );

    return Math.round((localizedAsUtc - utcGuess.getTime()) / 60000);
}

/**
 * Formats a Date object to a TickTick-compatible ISO datetime string with timezone offset.
 * Produces format: YYYY-MM-DDTHH:mm:ss.000±HHMM
 *
 * @param {Date} date - Date to format
 * @param {string} timezone - IANA timezone string
 * @param {object} [options={}] - Options
 * @param {number} [options.hour=0] - Hour override (0-23)
 * @param {number} [options.minute=0] - Minute override (0-59)
 * @returns {string} Formatted ISO string with timezone offset
 */
export function formatTickTickISO(date, timezone, { hour = 0, minute = 0 } = {}) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const h = hour;
    const m = minute;
    const offsetMinutes = getTimezoneOffsetMinutes(year, month, day, h, m, timezone);
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffsetMinutes = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, '0');
    const offsetRemainderMinutes = String(absOffsetMinutes % 60).padStart(2, '0');
    const tzOffset = `${sign}${offsetHours}${offsetRemainderMinutes}`;

    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const hh = String(h).padStart(2, '0');
    const min = String(m).padStart(2, '0');
    return `${year}-${mm}-${dd}T${hh}:${min}:00.000${tzOffset}`;
}
