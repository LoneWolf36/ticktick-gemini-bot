/**
 * tests/date-utils.test.js
 * Comprehensive tests for the date-utils module covering coerceDate,
 * getZonedDateParts, getTimezoneOffsetMinutes, and formatTickTickISO.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { coerceDate, getZonedDateParts, getTimezoneOffsetMinutes, formatTickTickISO } from '../services/date-utils.js';

// ============================================================
// coerceDate
// ============================================================

test('coerceDate returns fallback for null', () => {
    const fallback = new Date('2026-01-01T00:00:00Z');
    const result = coerceDate(null, fallback);
    assert.equal(result.getTime(), fallback.getTime());
});

test('coerceDate returns fallback for undefined', () => {
    const fallback = new Date('2026-01-01T00:00:00Z');
    const result = coerceDate(undefined, fallback);
    assert.equal(result.getTime(), fallback.getTime());
});

test('coerceDate returns fallback for empty string', () => {
    const fallback = new Date('2026-01-01T00:00:00Z');
    const result = coerceDate('', fallback);
    assert.equal(result.getTime(), fallback.getTime());
});

test('coerceDate returns fallback for invalid string', () => {
    const fallback = new Date('2026-01-01T00:00:00Z');
    const result = coerceDate('not-a-date', fallback);
    assert.equal(result.getTime(), fallback.getTime());
});

test('coerceDate returns parsed Date for valid ISO string', () => {
    const result = coerceDate('2026-03-10T12:00:00Z');
    assert.equal(result.getTime(), new Date('2026-03-10T12:00:00Z').getTime());
});

test('coerceDate returns same Date object when given a Date', () => {
    const input = new Date('2026-06-15T08:30:00Z');
    const result = coerceDate(input);
    assert.equal(result, input); // Same object reference
});

test('coerceDate returns Date from number timestamp', () => {
    const ts = 1772000000000;
    const result = coerceDate(ts);
    assert.equal(result.getTime(), ts);
});

test('coerceDate uses default fallback (new Date()) when no fallback given', () => {
    const before = Date.now();
    const result = coerceDate(null);
    const after = Date.now();
    assert.ok(result.getTime() >= before);
    assert.ok(result.getTime() <= after + 100);
});

// ============================================================
// getZonedDateParts
// ============================================================

test('getZonedDateParts returns correct parts for UTC timezone', () => {
    const date = new Date('2026-03-10T12:00:00Z');
    const parts = getZonedDateParts(date, 'UTC');
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 2); // 0-indexed (March)
    assert.equal(parts.day, 10);
    assert.equal(parts.hour, 12);
    assert.equal(parts.minute, 0);
    assert.equal(parts.weekday, 2); // Tuesday
});

test('getZonedDateParts returns correct parts for positive offset timezone (Dublin winter)', () => {
    // January in Dublin = UTC+0 (GMT)
    const date = new Date('2026-01-15T12:00:00Z');
    const parts = getZonedDateParts(date, 'Europe/Dublin');
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 0); // January (0-indexed)
    assert.equal(parts.day, 15);
    assert.equal(parts.hour, 12); // Same as UTC in winter
    assert.equal(parts.minute, 0);
});

test('getZonedDateParts returns correct parts for positive offset timezone (Dublin summer)', () => {
    // June in Dublin = UTC+1 (IST)
    const date = new Date('2026-06-15T12:00:00Z');
    const parts = getZonedDateParts(date, 'Europe/Dublin');
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 5); // June (0-indexed)
    assert.equal(parts.day, 15);
    assert.equal(parts.hour, 13); // UTC+1
    assert.equal(parts.minute, 0);
});

test('getZonedDateParts returns correct parts for negative offset timezone (LA summer)', () => {
    // June in LA = UTC-7 (PDT)
    const date = new Date('2026-06-15T12:00:00Z');
    const parts = getZonedDateParts(date, 'America/Los_Angeles');
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 5); // June
    assert.equal(parts.day, 15);
    assert.equal(parts.hour, 5); // UTC-7
    assert.equal(parts.minute, 0);
});

test('getZonedDateParts handles date near midnight crossing day boundary', () => {
    // Midnight UTC = 5pm previous day in LA (PDT, UTC-7)
    const date = new Date('2026-06-15T00:00:00Z');
    const parts = getZonedDateParts(date, 'America/Los_Angeles');
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 5); // June
    assert.equal(parts.day, 14); // Previous day!
    assert.equal(parts.hour, 17); // 5pm
});

test('getZonedDateParts returns weekday as number 0-6', () => {
    // March 10, 2026 is a Tuesday
    const date = new Date('2026-03-10T12:00:00Z');
    const parts = getZonedDateParts(date, 'UTC');
    assert.equal(parts.weekday, 2); // Tuesday
});

test('getZonedDateParts returns weekday 0 for Sunday', () => {
    // March 8, 2026 is a Sunday
    const date = new Date('2026-03-08T12:00:00Z');
    const parts = getZonedDateParts(date, 'UTC');
    assert.equal(parts.weekday, 0); // Sunday
});

test('getZonedDateParts returns weekday 6 for Saturday', () => {
    // March 7, 2026 is a Saturday
    const date = new Date('2026-03-07T12:00:00Z');
    const parts = getZonedDateParts(date, 'UTC');
    assert.equal(parts.weekday, 6); // Saturday
});

test('getZonedDateParts falls back to Europe/Dublin on invalid timezone', () => {
    const date = new Date('2026-03-10T12:00:00Z');
    // Should not throw — falls back to Europe/Dublin
    const parts = getZonedDateParts(date, 'Invalid/Timezone');
    assert.ok(typeof parts.year === 'number');
    assert.ok(typeof parts.month === 'number');
    assert.ok(typeof parts.day === 'number');
    assert.ok(typeof parts.hour === 'number');
    assert.ok(typeof parts.minute === 'number');
    assert.ok(typeof parts.weekday === 'number');
});

// ============================================================
// getTimezoneOffsetMinutes
// ============================================================

test('getTimezoneOffsetMinutes returns 0 for UTC timezone', () => {
    const offset = getTimezoneOffsetMinutes(2026, 2, 10, 12, 0, 'UTC');
    assert.equal(offset, 0);
});

test('getTimezoneOffsetMinutes returns positive for Europe/Dublin in summer', () => {
    // June = UTC+1 (IST)
    const offset = getTimezoneOffsetMinutes(2026, 5, 15, 12, 0, 'Europe/Dublin');
    assert.equal(offset, 60);
});

test('getTimezoneOffsetMinutes returns 0 for Europe/Dublin in winter', () => {
    // January = UTC+0 (GMT)
    const offset = getTimezoneOffsetMinutes(2026, 0, 15, 12, 0, 'Europe/Dublin');
    assert.equal(offset, 0);
});

test('getTimezoneOffsetMinutes returns negative for America/New_York in winter', () => {
    // January = UTC-5 (EST)
    const offset = getTimezoneOffsetMinutes(2026, 0, 15, 12, 0, 'America/New_York');
    assert.equal(offset, -300);
});

test('getTimezoneOffsetMinutes returns negative for America/New_York in summer', () => {
    // June = UTC-4 (EDT)
    const offset = getTimezoneOffsetMinutes(2026, 5, 15, 12, 0, 'America/New_York');
    assert.equal(offset, -240);
});

test('getTimezoneOffsetMinutes returns correct for Asia/Tokyo (always UTC+9)', () => {
    const offset = getTimezoneOffsetMinutes(2026, 5, 15, 12, 0, 'Asia/Tokyo');
    assert.equal(offset, 540);
});

test('getTimezoneOffsetMinutes handles midnight crossing DST boundary', () => {
    // March 8, 2026 is DST start in US (2nd Sunday)
    // At 2am local, clocks spring forward to 3am
    // Midnight on March 8 is still EST (UTC-5)
    const offset = getTimezoneOffsetMinutes(2026, 2, 8, 0, 0, 'America/New_York');
    assert.equal(offset, -300); // -5 hours
});

test('getTimezoneOffsetMinutes handles time right after DST spring-forward', () => {
    // March 8, 2026: DST springs forward at 2am EST (7:00 UTC) -> 3am EDT
    // Testing 8:00 UTC (= 3:00am EST before transition, or 4:00am EDT after)
    // At 8:00 UTC on March 8, the transition has already happened (it was at 7:00 UTC)
    // So: 8:00 UTC = 4:00am EDT (UTC-4)
    const offset = getTimezoneOffsetMinutes(2026, 2, 8, 8, 0, 'America/New_York');
    assert.equal(offset, -240); // -4 hours (EDT)
});

// ============================================================
// formatTickTickISO
// ============================================================

test('formatTickTickISO produces format YYYY-MM-DDTHH:mm:ss.000±HHMM for UTC', () => {
    const date = new Date('2026-03-10T00:00:00Z');
    const result = formatTickTickISO(date, 'UTC');
    assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000[+-]\d{4}$/);
    assert.equal(result, '2026-03-10T00:00:00.000+0000');
});

test('formatTickTickISO uses default hour=0, minute=0', () => {
    const date = new Date('2026-03-10T12:34:56Z');
    const result = formatTickTickISO(date, 'UTC');
    assert.equal(result, '2026-03-10T00:00:00.000+0000');
});

test('formatTickTickISO respects hour and minute overrides', () => {
    const date = new Date('2026-03-10T00:00:00Z');
    const result = formatTickTickISO(date, 'UTC', { hour: 14, minute: 30 });
    assert.equal(result, '2026-03-10T14:30:00.000+0000');
});

test('formatTickTickISO produces correct offset for Europe/Dublin in summer', () => {
    const date = new Date('2026-06-15T00:00:00Z');
    const result = formatTickTickISO(date, 'Europe/Dublin');
    // June = UTC+1 (IST)
    assert.match(result, /^2026-06-15T00:00:00\.000\+0100$/);
});

test('formatTickTickISO produces correct offset for Europe/Dublin in winter', () => {
    const date = new Date('2026-01-15T00:00:00Z');
    const result = formatTickTickISO(date, 'Europe/Dublin');
    // January = UTC+0 (GMT)
    assert.match(result, /^2026-01-15T00:00:00\.000\+0000$/);
});

test('formatTickTickISO produces correct offset for America/Los_Angeles in summer', () => {
    const date = new Date('2026-06-15T00:00:00Z');
    const result = formatTickTickISO(date, 'America/Los_Angeles');
    // June = UTC-7 (PDT)
    assert.match(result, /^2026-06-15T00:00:00\.000-\d{4}$/);
    assert.ok(result.endsWith('-0700'));
});

test('formatTickTickISO produces correct offset for America/Los_Angeles in winter', () => {
    const date = new Date('2026-01-15T00:00:00Z');
    const result = formatTickTickISO(date, 'America/Los_Angeles');
    // January = UTC-8 (PST)
    assert.match(result, /^2026-01-15T00:00:00\.000-\d{4}$/);
    assert.ok(result.endsWith('-0800'));
});

test('formatTickTickISO pads single-digit month and day', () => {
    const date = new Date('2026-01-05T00:00:00Z');
    const result = formatTickTickISO(date, 'UTC');
    assert.equal(result, '2026-01-05T00:00:00.000+0000');
});

test('formatTickTickISO pads single-digit hour and minute', () => {
    const date = new Date('2026-03-10T00:00:00Z');
    const result = formatTickTickISO(date, 'UTC', { hour: 5, minute: 7 });
    assert.equal(result, '2026-03-10T05:07:00.000+0000');
});

// ============================================================
// Integration: consistency between getZonedDateParts and formatTickTickISO
// ============================================================

test('formatTickTickISO date part matches getZonedDateParts date', () => {
    // formatTickTickISO uses UTC getters, getZonedDateParts uses target timezone
    // For UTC timezone they should match
    const date = new Date('2026-07-04T12:30:00Z');
    const parts = getZonedDateParts(date, 'UTC');
    const iso = formatTickTickISO(date, 'UTC');

    assert.ok(iso.startsWith(`${parts.year}-`));
    const isoMonth = String(parts.month + 1).padStart(2, '0');
    const isoDay = String(parts.day).padStart(2, '0');
    assert.ok(iso.includes(`-${isoMonth}-${isoDay}T`));
});

test('formatTickTickISO with override hour matches getZonedDateParts hour', () => {
    // When using UTC timezone, the hour override in formatTickTickISO
    // sets the wall-clock hour, while getZonedDateParts returns the
    // actual zoned hour from the input Date
    const date = new Date('2026-03-10T15:00:00Z');
    const parts = getZonedDateParts(date, 'UTC');
    assert.equal(parts.hour, 15); // Actual zoned hour

    // formatTickTickISO with override produces a string with the override hour
    const iso = formatTickTickISO(date, 'UTC', { hour: 8, minute: 0 });
    assert.ok(iso.includes('T08:00:00'));
});
