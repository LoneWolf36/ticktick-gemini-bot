/**
 * tests/regression.normalizer-dates.test.js
 * Date resolution edge cases for normalizer (extracted from normalizer.test.js)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAction } from '../services/normalizer.js';

describe('Date resolution edge cases', () => {
    it('should return today for "this monday" on Monday', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Team sync',
                dueDate: 'this monday'
            },
            { currentDate: '2026-03-09', timezone: 'Europe/Dublin' }
        );

        assert.ok(result.dueDate);
        assert.ok(result.dueDate.startsWith('2026-03-09'));
        assert.ok(result.isAllDay !== false);
    });

    it('should return next Monday for "monday" (bare) on Monday', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Plan sprint',
                dueDate: 'monday'
            },
            { currentDate: '2026-03-09', timezone: 'Europe/Dublin' }
        );

        assert.ok(result.dueDate);
        assert.ok(result.dueDate.startsWith('2026-03-16'));
    });

    it('should return next Monday for "next monday" on Monday', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Review Q2 goals',
                dueDate: 'next monday'
            },
            { currentDate: '2026-03-09', timezone: 'Europe/Dublin' }
        );

        assert.ok(result.dueDate);
        assert.ok(result.dueDate.startsWith('2026-03-16'));
    });

    it('should return today for "this-week" on Friday', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Weekly review',
                dueDate: 'this-week'
            },
            { currentDate: '2026-03-13', timezone: 'Europe/Dublin' }
        );

        assert.ok(result.dueDate);
        assert.ok(result.dueDate.startsWith('2026-03-13'));
    });

    it('should return upcoming Friday for "this-week" on Tuesday', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Ship deliverables',
                dueDate: 'this-week'
            },
            { currentDate: '2026-03-10', timezone: 'Europe/Dublin' }
        );

        assert.ok(result.dueDate);
        assert.ok(result.dueDate.startsWith('2026-03-13'));
    });

    it('should use anchorDate for relative day calculation', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Submit report',
                dueDate: 'friday'
            },
            {
                currentDate: '2026-03-13',
                anchorDate: '2026-03-15',
                timezone: 'Europe/Dublin'
            }
        );

        assert.ok(result.dueDate);
        assert.ok(result.dueDate.startsWith('2026-03-20'));
    });
});
