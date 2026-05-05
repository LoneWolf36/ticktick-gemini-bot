/**
 * tests/normalizer.test.js
 * Comprehensive tests for the normalizer module covering title normalization,
 * content filtering, and recurrence conversion per WP03 requirements.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeAction,
    normalizeActions,
    normalizeActionBatch,
    validateMutationBatch
} from '../services/normalizer.js';
import { DEFAULT_PROJECTS } from './pipeline-harness.js';

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

    describe('project routing safety', () => {
        it('should match opaque project IDs exactly', () => {
            const projects = [
                { id: 'inbox118958109', name: 'Inbox' },
                { id: 'career-xyz', name: 'Career' }
            ];

            const result = normalizeAction(
                { type: 'create', title: 'Plan sprint', projectHint: 'inbox118958109' },
                { projects }
            );

            assert.strictEqual(result.projectId, 'inbox118958109');
            assert.strictEqual(result.projectResolution.confidence, 'exact');
        });

        it('should block unmatched hinted project and avoid default fallback', () => {
            const result = normalizeAction(
                { type: 'create', title: 'Plan sprint', projectHint: 'Unknown team' },
                { projects: DEFAULT_PROJECTS, defaultProjectId: DEFAULT_PROJECTS[0].id }
            );

            assert.strictEqual(result.projectId, null);
            assert.strictEqual(result.projectResolution.confidence, 'missing');
        });

        it('should surface ambiguous default project choices when no hint exists', () => {
            const projects = [
                { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Inbox' },
                { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Career' },
                { id: 'cccccccccccccccccccccccc', name: 'Inbox' }
            ];

            const result = normalizeAction(
                { type: 'create', title: 'Buy groceries' },
                {
                    projects,
                    defaultProjectResolution: {
                        confidence: 'ambiguous',
                        choices: projects
                            .filter((project) => project.name === 'Inbox')
                            .map((project) => ({ projectId: project.id, projectName: project.name }))
                    }
                }
            );

            assert.strictEqual(result.projectId, null);
            assert.strictEqual(result.projectResolution.confidence, 'ambiguous');
            assert.strictEqual(result.projectResolution.choices.length, 2);
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
            assert.strictEqual(result1.title, 'Gym workout');

            const result2 = normalizeAction({
                type: 'create',
                title: 'A quick run'
            });
            assert.strictEqual(result2.title, 'Quick run');
        });
    });

    describe('_normalizeTitle - Title preservation', () => {
        it('should not add "Do" prefix when no verb is detected', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'gym'
            });
            assert.strictEqual(result.title, 'Gym');
        });

        it('should preserve noun phrases without adding "Do" prefix', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'quarterly report'
            });
            assert.strictEqual(result.title, 'Quarterly report');
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
            const verbs = [
                'add',
                'book',
                'buy',
                'call',
                'check',
                'complete',
                'create',
                'delete',
                'do',
                'email',
                'fetch',
                'file',
                'finish',
                'fix',
                'get',
                'go',
                'join',
                'learn',
                'make',
                'meet',
                'organize',
                'pay',
                'plan',
                'prepare',
                'read',
                'register',
                'remove',
                'reply',
                'review',
                'schedule',
                'send',
                'set',
                'setup',
                'start',
                'study',
                'submit',
                'take',
                'talk',
                'test',
                'update',
                'upload',
                'verify',
                'visit',
                'wait',
                'walk',
                'watch',
                'write'
            ];

            for (const verb of verbs) {
                const result = normalizeAction({
                    type: 'create',
                    title: `${verb} something`
                });
                // Should not add "Do" prefix
                assert.ok(!result.title.startsWith('Do ' + verb), `Verb "${verb}" should not get "Do" prefix`);
            }
        });

        it('should preserve LLM-provided task titles without adding "Do" prefix', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Message the training lead'
            });
            assert.strictEqual(result.title, 'Message the training lead');
        });

        it('should not add "Do" prefix to multi-clause Message titles', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Message the training lead for onboarding'
            });
            assert.strictEqual(result.title, 'Message the training lead for onboarding');
        });
    });

    describe('_normalizeTitle - Truncation', () => {
        it('should truncate long titles at word boundary', () => {
            const longTitle =
                'This is a very long task title that exceeds the maximum character limit and should be truncated at the nearest word boundary';
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
            const result = normalizeAction(
                {
                    type: 'create',
                    title: longTitle
                },
                { maxTitleLength: 20 }
            );

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
            assert.strictEqual(result.title, 'Gym');
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
            const result = normalizeAction(
                {
                    type: 'update',
                    title: 'Task',
                    content: null
                },
                {
                    existingTaskContent: 'Existing task description'
                }
            );
            assert.strictEqual(result.content, 'Existing task description');
        });

        it('should preserve existing content when new content is just noise', () => {
            const result = normalizeAction(
                {
                    type: 'update',
                    title: 'Task',
                    content: "You've got this! Stay motivated!"
                },
                {
                    existingTaskContent: 'Original detailed instructions'
                }
            );
            assert.strictEqual(result.content, 'Original detailed instructions');
        });

        it('should append new content if it adds value', () => {
            const result = normalizeAction(
                {
                    type: 'update',
                    title: 'Task',
                    content: 'New step: Call the vendor at 555-1234'
                },
                {
                    existingTaskContent: 'Original instructions'
                }
            );
            assert.ok(result.content.includes('Original instructions'));
            assert.ok(result.content.includes('---'));
            assert.ok(result.content.includes('Call the vendor'));
        });

        it('should avoid duplication when new content is substring of existing', () => {
            const result = normalizeAction(
                {
                    type: 'update',
                    title: 'Task',
                    content: 'Original instructions'
                },
                {
                    existingTaskContent: 'Original instructions with more details'
                }
            );
            assert.strictEqual(result.content, 'Original instructions with more details');
        });

        it('should keep existing content unchanged when new content is identical', () => {
            const result = normalizeAction(
                {
                    type: 'update',
                    title: 'Task',
                    content: 'Same content'
                },
                {
                    existingTaskContent: 'Same content'
                }
            );
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

        it('should convert "every sunday for a month" to bounded weekly RRULE', () => {
            const result = normalizeAction(
                {
                    type: 'create',
                    title: 'Task',
                    repeatHint: 'every sunday for a month'
                },
                { currentDate: '2026-03-01T10:00:00.000Z', timezone: 'Europe/Dublin' }
            );

            assert.match(result.repeatFlag, /^RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20260401T235959Z$/);
        });

        it('should convert "weekly on sunday for 1 month" to bounded weekly RRULE', () => {
            const result = normalizeAction(
                {
                    type: 'create',
                    title: 'Task',
                    repeatHint: 'weekly on sunday for 1 month'
                },
                { currentDate: '2026-03-01T10:00:00.000Z', timezone: 'Europe/Dublin' }
            );

            assert.match(result.repeatFlag, /^RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20260401T235959Z$/);
        });

        it('should convert "every monday for a month" to bounded weekly RRULE', () => {
            const result = normalizeAction(
                {
                    type: 'create',
                    title: 'Task',
                    repeatHint: 'every monday for a month'
                },
                { currentDate: '2026-03-01T10:00:00.000Z', timezone: 'Europe/Dublin' }
            );

            assert.match(result.repeatFlag, /^RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260401T235959Z$/);
        });

        it('should convert "every alternate day for 2 months" to bounded daily RRULE', () => {
            const result = normalizeAction(
                {
                    type: 'create',
                    title: 'Task',
                    repeatHint: 'every alternate day for 2 months'
                },
                { currentDate: '2026-03-01T10:00:00.000Z', timezone: 'Europe/Dublin' }
            );

            assert.match(result.repeatFlag, /^RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20260501T235959Z$/);
        });

        it('should convert "alternate day for 2 months" to bounded daily RRULE', () => {
            const result = normalizeAction(
                {
                    type: 'create',
                    title: 'Task',
                    repeatHint: 'alternate day for 2 months'
                },
                { currentDate: '2026-03-01T10:00:00.000Z', timezone: 'Europe/Dublin' }
            );

            assert.match(result.repeatFlag, /^RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20260501T235959Z$/);
        });

        it('should mark unsupported repeat hints invalid', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatHint: 'twice a week'
            });

            assert.equal(result.valid, false);
            assert.ok(result.validationErrors.some((msg) => msg.startsWith('Unsupported repeat pattern:')));
        });

        it('should pass through direct RRULE repeatFlag', () => {
            const result = normalizeAction({
                type: 'create',
                title: 'Task',
                repeatFlag: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE'
            });

            assert.equal(result.valid, true);
            assert.equal(result.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
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

    it('should set isAllDay true for plain date tasks without time hint', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Buy groceries',
                dueDate: 'tomorrow'
            },
            { currentDate: new Date('2026-05-03T10:00:00Z'), timezone: 'Europe/Dublin' }
        );

        assert.strictEqual(result.isAllDay, true);
        assert.ok(result.dueDate.includes('T00:00:00.000'));
    });

    it('should set isAllDay false and parse time hint "at 9am"', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Standup meeting',
                dueDate: 'tomorrow at 9am'
            },
            { currentDate: new Date('2026-05-03T10:00:00Z'), timezone: 'Europe/Dublin' }
        );

        assert.strictEqual(result.isAllDay, false);
        assert.ok(result.dueDate.includes('T09:00:00.000'));
    });

    it('should set isAllDay false and parse time hint "morning"', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Review PR',
                dueDate: 'today morning'
            },
            { currentDate: new Date('2026-05-03T10:00:00Z'), timezone: 'Europe/Dublin' }
        );

        assert.strictEqual(result.isAllDay, false);
        assert.ok(result.dueDate.includes('T09:00:00.000'));
    });

    it('should set isAllDay false and parse time hint "afternoon"', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Gym session',
                dueDate: 'friday afternoon'
            },
            { currentDate: new Date('2026-05-03T10:00:00Z'), timezone: 'Europe/Dublin' }
        );

        assert.strictEqual(result.isAllDay, false);
        assert.ok(result.dueDate.includes('T14:00:00.000'));
    });

    it('should set isAllDay false and parse time hint "at 3:30pm"', () => {
        const result = normalizeAction(
            {
                type: 'create',
                title: 'Call dentist',
                dueDate: 'tomorrow at 3:30pm'
            },
            { currentDate: new Date('2026-05-03T10:00:00Z'), timezone: 'Europe/Dublin' }
        );

        assert.strictEqual(result.isAllDay, false);
        assert.ok(result.dueDate.includes('T15:30:00.000'));
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
        const result = normalizeAction(
            {
                type: 'update',
                taskId: '123',
                title: 'Updated task',
                content: 'Stay motivated! New note: call vendor'
            },
            {
                existingTaskContent: 'Original instructions here'
            }
        );

        assert.ok(result.content.includes('Original instructions here'));
        assert.ok(result.content.includes('call vendor'));
    });

    it('should reject invalid actions', () => {
        const result = normalizeAction({
            type: 'create',
            title: '' // Empty title after normalization
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
        assert.ok(results.every((r) => r.title === 'Study session'));
    });

    it('should auto-split multi-day dueDate without explicit splitStrategy', () => {
        const results = normalizeActions([
            {
                type: 'create',
                title: 'Study system design',
                dueDate: 'monday tuesday and wednesday'
            }
        ]);

        assert.strictEqual(results.length, 3);
        assert.ok(results.every((r) => r.type === 'create'));
        assert.ok(results.every((r) => r.repeatFlag === null));
        assert.ok(results.every((r) => typeof r.dueDate === 'string' && r.dueDate.includes('T00:00:00.000')));
        assert.ok(results.every((r) => r.isAllDay === true));
    });

    it('should not split multi-day dueDate when recurrence hint is present', () => {
        const results = normalizeActions([
            {
                type: 'create',
                title: 'Gym sessions',
                dueDate: 'mon wed fri',
                repeatHint: 'every weekday'
            }
        ]);

        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    });

    it('should preserve repeatFlag when extracted intent provides it directly', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Run daily',
            repeatFlag: 'RRULE:FREQ=DAILY;INTERVAL=1',
            repeatHint: null
        });

        assert.strictEqual(result.repeatFlag, 'RRULE:FREQ=DAILY;INTERVAL=1');
        assert.ok(result.valid);
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
        assert.ok(result.validationErrors.some((e) => e.includes('title')));
    });

    it('should require taskId for update actions', () => {
        const result = normalizeAction({ type: 'update', title: 'Task' });
        assert.strictEqual(result.valid, false);
        assert.ok(result.validationErrors.some((e) => e.includes('taskId')));
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
        assert.ok(result.validationErrors.some((e) => e.includes('Confidence')));
    });
});

// ============================================================
// WP03: Mutation Normalizer Tests (T034)
// ============================================================

describe('WP03: Mutation Action Normalization', () => {
    describe('Resolved update action', () => {
        it('should normalize a resolved update action with taskId', () => {
            const result = normalizeAction(
                {
                    type: 'update',
                    targetQuery: 'buy groceries',
                    title: null,
                    content: null,
                    priority: null,
                    dueDate: 'tomorrow',
                    confidence: 0.9
                },
                {
                    resolvedTask: { id: 'abc123', projectId: 'proj456', title: 'Buy groceries' },
                    existingTaskContent: 'Get milk, eggs, and bread'
                }
            );

            assert.strictEqual(result.type, 'update');
            assert.strictEqual(result.taskId, 'abc123');
            assert.strictEqual(result.originalProjectId, 'proj456');
            assert.strictEqual(result.targetQuery, 'buy groceries');
            assert.ok(result.valid);
            assert.strictEqual(result.validationErrors.length, 0);
        });

        it('should preserve existing content when update has no new content', () => {
            const result = normalizeAction(
                {
                    type: 'update',
                    targetQuery: 'buy groceries',
                    title: null,
                    content: null,
                    confidence: 0.9
                },
                {
                    resolvedTask: { id: 'abc123', projectId: null, title: 'Buy groceries' },
                    existingTaskContent: 'Detailed shopping list with quantities'
                }
            );

            assert.strictEqual(result.content, 'Detailed shopping list with quantities');
        });

        it('should preserve existing content when update content is just filler', () => {
            const result = normalizeAction(
                {
                    type: 'update',
                    targetQuery: 'buy groceries',
                    content: "You've got this! Stay focused!",
                    confidence: 0.9
                },
                {
                    resolvedTask: { id: 'abc123', projectId: null, title: 'Buy groceries' },
                    existingTaskContent: 'Original detailed instructions'
                }
            );

            assert.strictEqual(result.content, 'Original detailed instructions');
        });

        it('should append new content when it adds value', () => {
            const result = normalizeAction(
                {
                    type: 'update',
                    targetQuery: 'buy groceries',
                    content: 'Note: Also check for organic produce section',
                    confidence: 0.9
                },
                {
                    resolvedTask: { id: 'abc123', projectId: null, title: 'Buy groceries' },
                    existingTaskContent: 'Get milk, eggs, bread'
                }
            );

            assert.ok(result.content.includes('Get milk, eggs, bread'));
            assert.ok(result.content.includes('---'));
            assert.ok(result.content.includes('organic produce'));
        });

        it('should omit title for mutations when no rename is intended', () => {
            const result = normalizeAction(
                {
                    type: 'update',
                    targetQuery: 'buy groceries',
                    title: null,
                    confidence: 0.9
                },
                {
                    resolvedTask: { id: 'abc123', projectId: null, title: 'Buy groceries' }
                }
            );

            // undefined = "don't touch" — adapter skips the field, preserving existing title
            assert.strictEqual(result.title, undefined);
        });

        it('should apply new title when explicitly provided in rename', () => {
            const result = normalizeAction(
                {
                    type: 'update',
                    targetQuery: 'netflix task',
                    title: 'Finish system design notes',
                    confidence: 0.9
                },
                {
                    resolvedTask: { id: 'abc123', projectId: null, title: 'Watch Netflix tutorial' }
                }
            );

            assert.strictEqual(result.title, 'Finish system design notes');
        });
    });

    describe('Resolved complete action', () => {
        it('should normalize a resolved complete action with taskId', () => {
            const result = normalizeAction(
                {
                    type: 'complete',
                    targetQuery: 'buy groceries',
                    confidence: 0.95
                },
                {
                    resolvedTask: { id: 'abc123', projectId: 'proj456', title: 'Buy groceries' }
                }
            );

            assert.strictEqual(result.type, 'complete');
            assert.strictEqual(result.taskId, 'abc123');
            assert.strictEqual(result.targetQuery, 'buy groceries');
            assert.ok(result.valid);
        });
    });

    describe('Resolved delete action', () => {
        it('should normalize a resolved delete action with taskId', () => {
            const result = normalizeAction(
                {
                    type: 'delete',
                    targetQuery: 'old wifi task',
                    confidence: 0.9
                },
                {
                    resolvedTask: { id: 'abc123', projectId: null, title: 'Old wifi task' }
                }
            );

            assert.strictEqual(result.type, 'delete');
            assert.strictEqual(result.taskId, 'abc123');
            assert.strictEqual(result.targetQuery, 'old wifi task');
            assert.ok(result.valid);
        });
    });
});

describe('WP03: Mutation Missing Task Context (T032 — Fail Closed)', () => {
    it('should reject update without resolved taskId', () => {
        const result = normalizeAction({
            type: 'update',
            targetQuery: 'some task',
            title: 'New title',
            confidence: 0.9
        });

        assert.strictEqual(result.valid, false);
        assert.ok(result.validationErrors.some((e) => e.includes('Missing taskId')));
        assert.ok(result.validationErrors.some((e) => e.includes('resolved task context')));
    });

    it('should reject complete without resolved taskId', () => {
        const result = normalizeAction({
            type: 'complete',
            targetQuery: 'done task',
            confidence: 0.9
        });

        assert.strictEqual(result.valid, false);
        assert.ok(result.validationErrors.some((e) => e.includes('Missing taskId')));
    });

    it('should reject delete without resolved taskId', () => {
        const result = normalizeAction({
            type: 'delete',
            targetQuery: 'delete task',
            confidence: 0.9
        });

        assert.strictEqual(result.valid, false);
        assert.ok(result.validationErrors.some((e) => e.includes('Missing taskId')));
    });

    it('should pass validation when taskId is resolved via options.existingTask', () => {
        const result = normalizeAction(
            {
                type: 'update',
                targetQuery: 'buy groceries',
                dueDate: 'tomorrow',
                confidence: 0.9
            },
            {
                existingTask: { id: 'task789', projectId: 'proj123' }
            }
        );

        assert.strictEqual(result.taskId, 'task789');
        assert.ok(result.valid);
    });
});

describe('WP03: Batch Validation — Unsupported Mutation Shapes (T033)', () => {
    describe('validateMutationBatch', () => {
        it('should reject empty batches', () => {
            const result = validateMutationBatch([]);
            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.reason, 'empty_batch');
        });

        it('should reject null/undefined batches', () => {
            const result1 = validateMutationBatch(null);
            assert.strictEqual(result1.valid, false);

            const result2 = validateMutationBatch(undefined);
            assert.strictEqual(result2.valid, false);
        });

        it('should accept single create action', () => {
            const result = validateMutationBatch([{ type: 'create', title: 'New task' }]);
            assert.strictEqual(result.valid, true);
            assert.strictEqual(result.reason, null);
        });

        it('should accept single update action', () => {
            const result = validateMutationBatch([{ type: 'update', taskId: 'abc123' }]);
            assert.strictEqual(result.valid, true);
        });

        it('should reject mixed create + mutation', () => {
            const result = validateMutationBatch([
                { type: 'create', title: 'New task' },
                { type: 'update', taskId: 'abc123' }
            ]);
            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.reason, 'mixed_create_and_mutation');
        });

        it('should accept small lightweight mutation batches', () => {
            const result = validateMutationBatch([
                { type: 'update', taskId: 'abc123' },
                { type: 'complete', taskId: 'def456' }
            ]);
            assert.strictEqual(result.valid, true);
            assert.strictEqual(result.reason, null);
        });

        it('should accept small lightweight delete batches', () => {
            const result = validateMutationBatch([
                { type: 'delete', taskId: 'abc123' },
                { type: 'delete', taskId: 'def456' }
            ]);
            assert.strictEqual(result.valid, true);
            assert.strictEqual(result.reason, null);
        });

        it('should reject large lightweight mutation batches', () => {
            const result = validateMutationBatch([
                { type: 'update', taskId: 'abc123' },
                { type: 'complete', taskId: 'def456' },
                { type: 'delete', taskId: 'ghi789' },
                { type: 'update', taskId: 'jkl012' }
            ]);
            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.reason, 'multiple_mutations');
        });

        it('should accept multiple creates (multi-task create is in scope)', () => {
            const result = validateMutationBatch([
                { type: 'create', title: 'Task one' },
                { type: 'create', title: 'Task two' }
            ]);
            assert.strictEqual(result.valid, true);
        });
    });

    describe('normalizeActionBatch', () => {
        it('should return batchError for mixed create+mutation', () => {
            const { actions, batchError } = normalizeActionBatch([
                { type: 'create', title: 'New task' },
                { type: 'update', taskId: 'abc123', targetQuery: 'old task' }
            ]);

            assert.strictEqual(batchError, 'mixed_create_and_mutation');
            // All actions should be marked invalid
            assert.ok(actions.every((a) => !a.valid));
            assert.ok(actions.every((a) => a.validationErrors.some((e) => e.includes('Batch validation failed'))));
        });

        it('should return batchError for large mutation batches', () => {
            const { actions, batchError } = normalizeActionBatch([
                { type: 'update', taskId: 'abc123', targetQuery: 'task one' },
                { type: 'complete', taskId: 'def456', targetQuery: 'task two' },
                { type: 'delete', taskId: 'ghi789', targetQuery: 'task three' },
                { type: 'update', taskId: 'jkl012', targetQuery: 'task four' }
            ]);

            assert.strictEqual(batchError, 'multiple_mutations');
            assert.ok(actions.every((a) => !a.valid));
        });

        it('should return null batchError for valid single mutation', () => {
            const { actions, batchError } = normalizeActionBatch(
                [
                    {
                        type: 'update',
                        taskId: 'abc123',
                        targetQuery: 'buy groceries',
                        dueDate: 'tomorrow',
                        confidence: 0.9
                    }
                ],
                {
                    resolvedTask: { id: 'abc123', title: 'Buy groceries' }
                }
            );

            assert.strictEqual(batchError, null);
            assert.ok(actions[0].valid);
        });

        it('should return null batchError for multiple creates', () => {
            const { actions, batchError } = normalizeActionBatch([
                { type: 'create', title: 'Task one' },
                { type: 'create', title: 'Task two' }
            ]);

            assert.strictEqual(batchError, null);
            assert.strictEqual(actions.length, 2);
        });
    });
});

describe('WP03: Mutation Content Preservation (T033)', () => {
    it('should preserve existing content on rename-only update', () => {
        const result = normalizeAction(
            {
                type: 'update',
                targetQuery: 'buy groceries',
                title: 'Buy groceries and snacks',
                content: null,
                confidence: 0.9
            },
            {
                resolvedTask: { id: 'abc123', title: 'Buy groceries' },
                existingTaskContent: 'Milk, eggs, bread, cheese, and yogurt'
            }
        );

        assert.strictEqual(result.content, 'Milk, eggs, bread, cheese, and yogurt');
    });

    it('should preserve existing content on priority-only update', () => {
        const result = normalizeAction(
            {
                type: 'update',
                targetQuery: 'buy groceries',
                priority: 1,
                content: null,
                confidence: 0.9
            },
            {
                resolvedTask: { id: 'abc123', title: 'Buy groceries' },
                existingTaskContent: 'Detailed shopping list'
            }
        );

        assert.strictEqual(result.content, 'Detailed shopping list');
    });

    it('should preserve existing content on due-date-only update', () => {
        const result = normalizeAction(
            {
                type: 'update',
                targetQuery: 'buy groceries',
                dueDate: 'tomorrow',
                content: null,
                confidence: 0.9
            },
            {
                resolvedTask: { id: 'abc123', title: 'Buy groceries' },
                existingTaskContent: 'Original instructions'
            }
        );

        assert.strictEqual(result.content, 'Original instructions');
    });

    it('should not let update content wipe existing when new content is noise', () => {
        const result = normalizeAction(
            {
                type: 'update',
                targetQuery: 'buy groceries',
                content: 'This is important! Stay focused on your goals.',
                confidence: 0.9
            },
            {
                resolvedTask: { id: 'abc123', title: 'Buy groceries' },
                existingTaskContent: 'Get milk and eggs from the corner store'
            }
        );

        assert.strictEqual(result.content, 'Get milk and eggs from the corner store');
    });
});

describe('WP03: Mutation targetQuery Passthrough', () => {
    it('should include targetQuery on mutation actions', () => {
        const result = normalizeAction(
            {
                type: 'update',
                targetQuery: 'the meeting about project',
                dueDate: 'friday',
                confidence: 0.85
            },
            {
                resolvedTask: { id: 'mtg001', title: 'Project sync meeting' }
            }
        );

        assert.strictEqual(result.targetQuery, 'the meeting about project');
    });

    it('should set targetQuery to null on create actions', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Schedule meeting',
            targetQuery: 'should not appear',
            confidence: 0.9
        });

        assert.strictEqual(result.targetQuery, null);
    });
});
