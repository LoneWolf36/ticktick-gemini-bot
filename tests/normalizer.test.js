/**
 * tests/normalizer.test.js
 * Comprehensive tests for the normalizer module covering title normalization,
 * content filtering, and recurrence conversion per WP03 requirements.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAction, normalizeActions } from '../services/normalizer.js';

describe('Normalizer Module', () => {
    describe('normalizeAction', () => {
        it('should export normalizeAction function', () => {
            assert.strictEqual(typeof normalizeAction, 'function');
        });

        it('should return a NormalizedAction object with required fields', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Test task'
            });
            
            assert.ok(typeof result === 'object');
            assert.ok('type' in result);
            assert.ok('title' in result);
            assert.ok('content' in result);
            assert.ok('priority' in result);
            assert.ok('projectId' in result);
            assert.ok('dueDate' in result);
            assert.ok('repeatFlag' in result);
            assert.ok('valid' in result);
            assert.ok('validationErrors' in result);
        });
    });

    describe('normalizeActions', () => {
        it('should export normalizeActions function', () => {
            assert.strictEqual(typeof normalizeActions, 'function');
        });

        it('should handle batch processing', () => {
            const results = normalizeActions([
                { type: 'create', title: 'Task 1' },
                { type: 'create', title: 'Task 2' }
            ]);
            
            assert.strictEqual(results.length, 2);
            assert.ok(Array.isArray(results));
        });
    });
});

describe('Title Normalization (FR-006)', () => {
    describe('_normalizeTitle - Basic cleaning', () => {
        it('should trim whitespace', () => {
            const result = normalizeAction({
                type: 'create',
                title: '  Buy groceries  '
            });
            assert.strictEqual(result.title, 'Buy groceries');
        });

        it('should strip bracket prefixes', () => {
            const result = normalizeAction({
                type: 'create',
                title: '[Work] Submit quarterly report'
            });
            assert.strictEqual(result.title, 'Submit quarterly report');
        });

        it('should strip priority markers', () => {
            const result1 = normalizeAction({
                type: 'create',
                title: 'URGENT: Fix login bug'
            });
            assert.strictEqual(result1.title, 'Fix login bug');

            const result2 = normalizeAction({
                type: 'create',
                title: 'Important: Call dentist'
            });
            assert.strictEqual(result2.title, 'Call dentist');
        });

        it('should strip date references', () => {
            const result1 = normalizeAction({
                type: 'create',
                title: 'Book dentist appointment Thursday'
            });
            assert.strictEqual(result1.title, 'Book dentist appointment');

            const result2 = normalizeAction({
                type: 'create',
                title: 'Buy groceries tomorrow'
            });
            assert.strictEqual(result2.title, 'Buy groceries');
        });

        it('should capitalize first letter', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'buy groceries'
            });
            assert.strictEqual(result.title, 'Buy groceries');
        });

        it('should strip leading articles', () => {
            const result1 = normalizeAction({
                type: 'create',
                title: 'The gym workout'
            });
            assert.strictEqual(result1.title, 'Do gym workout');

            const result2 = normalizeAction({
                type: 'create',
                title: 'A quick run'
            });
            assert.strictEqual(result2.title, 'Do quick run');
        });
    });

    describe('_normalizeTitle - Verb-led enforcement', () => {
        it('should add "Do" prefix when no verb detected', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'gym'
            });
            assert.strictEqual(result.title, 'Do gym');
        });

        it('should add "Do" prefix for noun phrases', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'quarterly report'
            });
            assert.strictEqual(result.title, 'Do quarterly report');
        });

        it('should NOT add "Do" prefix when verb already present', () => {
            const result1 = normalizeAction({
                type: 'create',
                title: 'Buy groceries'
            });
            assert.strictEqual(result1.title, 'Buy groceries');

            const result2 = normalizeAction({
                type: 'create',
                title: 'Call mom'
            });
            assert.strictEqual(result2.title, 'Call mom');

            const result3 = normalizeAction({
                type: 'create',
                title: 'Schedule meeting'
            });
            assert.strictEqual(result3.title, 'Schedule meeting');
        });

        it('should recognize common verbs', () => {
            const verbs = ['add', 'book', 'buy', 'call', 'check', 'complete', 'create', 
                          'delete', 'do', 'email', 'fetch', 'file', 'finish', 'fix', 'get', 
                          'go', 'join', 'learn', 'make', 'meet', 'organize', 'pay', 'plan', 
                          'prepare', 'read', 'register', 'remove', 'reply', 'review', 
                          'schedule', 'send', 'set', 'setup', 'start', 'study', 'submit', 
                          'take', 'talk', 'test', 'update', 'upload', 'verify', 'visit', 
                          'wait', 'walk', 'watch', 'write'];

            for (const verb of verbs) {
                const result = normalizeAction({
                    type: 'create',
                    title: `${verb} something`
                });
                // Should not add "Do" prefix
                assert.ok(!result.title.startsWith('Do ' + verb), 
                    `Verb "${verb}" should not get "Do" prefix`);
            }
        });
    });

    describe('_normalizeTitle - Truncation', () => {
        it('should truncate long titles at word boundary', () => {
            const longTitle = 'This is a very long task title that exceeds the maximum character limit and should be truncated at the nearest word boundary';
            const result = normalizeAction({
                type: 'create',
                title: longTitle
            });
            
            assert.ok(result.title.length <= 100);
            assert.ok(result.title.endsWith('…'));
        });

        it('should use default maxLength of 100', () => {
            const longTitle = 'a'.repeat(150);
            const result = normalizeAction({
                type: 'create',
                title: longTitle
            });
            
            assert.ok(result.title.length <= 100);
        });

        it('should respect custom maxLength', () => {
            const longTitle = 'This is a moderately long title';
            const result = normalizeAction({
                type: 'create',
                title: longTitle
            }, { maxTitleLength: 20 });
            
            assert.ok(result.title.length <= 20);
        });
    });

    describe('_normalizeTitle - Edge cases', () => {
        it('should handle empty title', () => {
            const result = normalizeAction({
                type: 'create',
                title: ''
            });
            assert.strictEqual(result.title, '');
        });

        it('should handle null title', () => {
            const result = normalizeAction({
                type: 'create',
                title: null
            });
            assert.strictEqual(result.title, '');
        });

        it('should return original if title becomes empty after stripping', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'tomorrow'
            });
            // Should return original trimmed title
            assert.strictEqual(result.title, 'Tomorrow');
        });

        it('should handle very short titles', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'gym'
            });
            assert.strictEqual(result.title, 'Do gym');
        });
    });
});

describe('Content Normalization (FR-007)', () => {
    describe('_normalizeContent - Filler removal', () => {
        it('should strip motivational phrases', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                content: "You've got this! Stay focused!"
            });
            assert.strictEqual(result.content, null);
        });

        it('should strip coaching prose', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                content: 'This is important because it aligns with your goals'
            });
            assert.strictEqual(result.content, null);
        });

        it('should strip analysis noise', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                content: 'Priority justification: This needs to be done first'
            });
            assert.strictEqual(result.content, null);
        });

        it('should preserve URLs', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                content: "You've got this! Check https://example.com/docs for details"
            });
            assert.ok(result.content.includes('https://example.com/docs'));
        });

        it('should preserve locations', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                content: 'Meeting at Conference Room B on the third floor'
            });
            assert.ok(result.content.includes('at Conference Room'));
        });

        it('should preserve instructions', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                content: 'Remember to call the dentist at 9 AM. Make sure to bring your ID.'
            });
            assert.ok(result.content !== null);
            assert.ok(result.content.includes('dentist'));
            assert.ok(result.content.includes('9 AM'));
        });
    });

    describe('_normalizeContent - Content preservation (FR-007)', () => {
        it('should preserve existing content when new content is null', () => {
            const result = normalizeAction({
                type: 'update',
                title: 'Task',
                content: null
            }, {
                existingTaskContent: 'Existing task description'
            });
            assert.strictEqual(result.content, 'Existing task description');
        });

        it('should preserve existing content when new content is just noise', () => {
            const result = normalizeAction({
                type: 'update',
                title: 'Task',
                content: "You've got this! Stay motivated!"
            }, {
                existingTaskContent: 'Original detailed instructions'
            });
            assert.strictEqual(result.content, 'Original detailed instructions');
        });

        it('should append new content if it adds value', () => {
            const result = normalizeAction({
                type: 'update',
                title: 'Task',
                content: 'New step: Call the vendor at 555-1234'
            }, {
                existingTaskContent: 'Original instructions'
            });
            assert.ok(result.content.includes('Original instructions'));
            assert.ok(result.content.includes('---'));
            assert.ok(result.content.includes('Call the vendor'));
        });

        it('should avoid duplication when new content is substring of existing', () => {
            const result = normalizeAction({
                type: 'update',
                title: 'Task',
                content: 'Original instructions'
            }, {
                existingTaskContent: 'Original instructions with more details'
            });
            assert.strictEqual(result.content, 'Original instructions with more details');
        });

        it('should keep existing content unchanged when new content is identical', () => {
            const result = normalizeAction({
                type: 'update',
                title: 'Task',
                content: 'Same content'
            }, {
                existingTaskContent: 'Same content'
            });
            assert.strictEqual(result.content, 'Same content');
        });
    });

    describe('_normalizeContent - Edge cases', () => {
        it('should handle null content', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                content: null
            });
            assert.strictEqual(result.content, null);
        });

        it('should handle empty content', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                content: ''
            });
            assert.strictEqual(result.content, null);
        });

        it('should clean up multiple newlines', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                content: 'Line 1\n\n\n\nLine 2'
            });
            assert.ok(result.content.includes('Line 1\n\nLine 2'));
        });

        it('should preserve content with only URLs', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                content: 'https://example.com\nhttps://docs.example.org'
            });
            assert.ok(result.content.includes('https://example.com'));
            assert.ok(result.content.includes('https://docs.example.org'));
        });
    });
});

describe('Recurrence Conversion (FR-008)', () => {
    describe('_convertRepeatHint - Simple mappings', () => {
        it('should convert "daily"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'daily'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=DAILY;INTERVAL=1');
        });

        it('should convert "weekdays"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'weekdays'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
        });

        it('should convert "weekends"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'weekends'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=SA,SU');
        });

        it('should convert "weekly"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'weekly'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;INTERVAL=1');
        });

        it('should convert "biweekly"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'biweekly'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;INTERVAL=2');
        });

        it('should convert "monthly"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'monthly'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=MONTHLY;INTERVAL=1');
        });

        it('should convert "yearly"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'yearly'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=YEARLY;INTERVAL=1');
        });
    });

    describe('_convertRepeatHint - "every <day>" patterns', () => {
        it('should convert "every monday"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'every monday'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=MO');
        });

        it('should convert "every sunday"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'every sunday'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=SU');
        });

        it('should convert "every tuesday and thursday"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'every tuesday and thursday'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH');
        });

        it('should convert "every weekday"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'every weekday'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
        });

        it('should convert "every other day"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'every other day'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=DAILY;INTERVAL=2');
        });
    });

    describe('_convertRepeatHint - "weekly on <day>" patterns', () => {
        it('should convert "weekly on monday"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'weekly on monday'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=MO');
        });

        it('should convert "weekly on friday"', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'weekly on friday'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=FR');
        });

        it('should handle case insensitivity', () => {
            const result1 = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'Weekly On Monday'
            });
            assert.strictEqual(result1.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=MO');

            const result2 = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'WEEKLY ON FRIDAY'
            });
            assert.strictEqual(result2.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=FR');
        });
    });

    describe('_convertRepeatHint - Edge cases', () => {
        it('should return null for empty input', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: ''
            });
            assert.strictEqual(result.repeatFlag, null);
        });

        it('should return null for null input', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: null
            });
            assert.strictEqual(result.repeatFlag, null);
        });

        it('should return null for unrecognized patterns', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'twice a week'
            });
            assert.strictEqual(result.repeatFlag, null);
        });

        it('should handle mixed case input', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'Every Monday'
            });
            assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=MO');
        });
    });
});

describe('Integration Tests', () => {
    it('should handle complete create action', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'URGENT: Book dentist appointment tomorrow',
            content: "You've got this! Call https://dentist.example.com to book",
            priority: 3,
            dueDate: 'tomorrow',
            repeatHint: null
        });

        assert.strictEqual(result.type, 'create');
        assert.strictEqual(result.title, 'Book dentist appointment');
        assert.ok(result.content.includes('https://dentist.example.com'));
        assert.strictEqual(result.priority, 3);
        assert.ok(result.valid);
        assert.strictEqual(result.validationErrors.length, 0);
    });

    it('should handle recurring task creation', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Practice DSA',
            content: null,
            repeatHint: 'every weekday'
        });

        assert.strictEqual(result.title, 'Practice DSA');
        assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
        assert.ok(result.valid);
    });

    it('should handle update with content preservation', () => {
        const result = normalizeAction({
            type: 'update',
            taskId: '123',
            title: 'Updated task',
            content: "Stay motivated! New note: call vendor"
        }, {
            existingTaskContent: 'Original instructions here'
        });

        assert.ok(result.content.includes('Original instructions here'));
        assert.ok(result.content.includes('call vendor'));
    });

    it('should reject invalid actions', () => {
        const result = normalizeAction({
            type: 'create',
            title: ''  // Empty title after normalization
        });

        assert.strictEqual(result.valid, false);
        assert.ok(result.validationErrors.length > 0);
    });

    it('should handle multi-day split strategy', () => {
        const results = normalizeActions([
            {
                type: 'create',
                title: 'Study session',
                dueDate: 'monday tuesday wednesday',
                splitStrategy: 'multi-day'
            }
        ]);

        assert.strictEqual(results.length, 3);
        // All should have the same normalized title
        assert.ok(results.every(r => r.title === 'Study session'));
    });
});

describe('Validation Tests', () => {
    it('should validate action type', () => {
        const result1 = normalizeAction({ type: 'create', title: 'Task' });
        assert.strictEqual(result1.valid, true);

        const result2 = normalizeAction({ type: 'invalid', title: 'Task' });
        assert.strictEqual(result2.valid, false);
    });

    it('should require title for create actions', () => {
        const result = normalizeAction({ type: 'create', title: '' });
        assert.strictEqual(result.valid, false);
        assert.ok(result.validationErrors.some(e => e.includes('title')));
    });

    it('should require taskId for update actions', () => {
        const result = normalizeAction({ type: 'update', title: 'Task' });
        assert.strictEqual(result.valid, false);
        assert.ok(result.validationErrors.some(e => e.includes('taskId')));
    });

    it('should validate priority values', () => {
        const result1 = normalizeAction({ type: 'create', title: 'Task', priority: 3 });
        assert.strictEqual(result1.valid, true);

        const result2 = normalizeAction({ type: 'create', title: 'Task', priority: 2 });
        assert.strictEqual(result2.valid, false);
    });

    it('should respect confidence threshold', () => {
        const result = normalizeAction({ 
            type: 'create', 
            title: 'Task',
            confidence: 0.3
        });
        
        assert.strictEqual(result.valid, false);
        assert.ok(result.validationErrors.some(e => e.includes('Confidence')));
    });
});
