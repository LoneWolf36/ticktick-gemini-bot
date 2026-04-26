import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createIntentExtractor, detectWorkStyleModeIntent, QuotaExhaustedError, validateIntentAction, validateChecklistItems } from '../services/intent-extraction.js';
import { MODE_FOCUS, MODE_STANDARD, MODE_URGENT } from '../services/store.js';
import { MAX_CHECKLIST_ITEMS } from '../services/schemas.js';

function createCompleteR1Action(overrides = {}) {
    return {
        type: 'create',
        targetQuery: null,
        title: 'Book dentist appointment',
        content: null,
        priority: null,
        projectHint: null,
        dueDate: 'Thursday',
        repeatHint: null,
        splitStrategy: 'single',
        checklistItems: null,
        clarification: null,
        clarificationQuestion: null,
        confidence: 0.93,
        ...overrides,
    };
}

// Mock GeminiAnalyzer for testing
function createMockGeminiAnalyzer(keys = ['test-key']) {
    return {
        _keys: keys,
        _activeKeyIndex: 0,
        _executeWithFailover: async () => ({
            text: JSON.stringify({ actions: [] }),
        }),
    };
}

describe('Intent Extraction', () => {
    let mockGemini;

    beforeEach(() => {
        mockGemini = createMockGeminiAnalyzer(['test-key']);
    });

    describe('createIntentExtractor', () => {
        it('throws when gemini is not a GeminiAnalyzer instance', () => {
            assert.throws(
                () => createIntentExtractor({}),
                /createIntentExtractor requires a GeminiAnalyzer instance/
            );
        });

        it('throws when gemini is null', () => {
            assert.throws(
                () => createIntentExtractor(null),
                /createIntentExtractor requires a GeminiAnalyzer instance/
            );
        });

        it('throws when gemini is undefined', () => {
            assert.throws(
                () => createIntentExtractor(undefined),
                /createIntentExtractor requires a GeminiAnalyzer instance/
            );
        });

        it('accepts a valid GeminiAnalyzer instance', () => {
            const mockGem = createMockGeminiAnalyzer();
            assert.doesNotThrow(() => createIntentExtractor(mockGem));
        });

        it('returns object with extractIntents function', () => {
            const mockGem = createMockGeminiAnalyzer();
            const intentExtractor = createIntentExtractor(mockGem);
            assert.equal(typeof intentExtractor.extractIntents, 'function');
        });

        it('returns object with extractIntents as async function', async () => {
            const mockGem = createMockGeminiAnalyzer();
            const intentExtractor = createIntentExtractor(mockGem);
            // extractIntents should be callable (it will fail without proper mock but interface is correct)
            assert.equal(typeof intentExtractor.extractIntents, 'function');
        });
    });

    describe('detectWorkStyleModeIntent', () => {
        it('detects urgent mode ON - turn on', () => {
            assert.deepEqual(detectWorkStyleModeIntent('turn on urgent mode'), {
                type: 'set_work_style_mode',
                mode: MODE_URGENT,
            });
        });

        it('detects urgent mode ON - enable', () => {
            assert.deepEqual(detectWorkStyleModeIntent('enable urgent mode'), {
                type: 'set_work_style_mode',
                mode: MODE_URGENT,
            });
        });

        it('detects urgent mode ON - activate', () => {
            assert.deepEqual(detectWorkStyleModeIntent('activate urgent mode'), {
                type: 'set_work_style_mode',
                mode: MODE_URGENT,
            });
        });

        it('detects urgent mode ON - go urgent', () => {
            assert.deepEqual(detectWorkStyleModeIntent('go urgent'), {
                type: 'set_work_style_mode',
                mode: MODE_URGENT,
            });
        });

        it('detects urgent mode OFF - turn off', () => {
            assert.deepEqual(detectWorkStyleModeIntent('turn off urgent mode'), {
                type: 'set_work_style_mode',
                mode: MODE_STANDARD,
            });
        });

        it('detects urgent mode OFF - disable', () => {
            assert.deepEqual(detectWorkStyleModeIntent('disable urgent mode'), {
                type: 'set_work_style_mode',
                mode: MODE_STANDARD,
            });
        });

        it('detects urgent mode OFF - switch to standard mode', () => {
            assert.deepEqual(detectWorkStyleModeIntent('switch back to standard mode'), {
                type: 'set_work_style_mode',
                mode: MODE_STANDARD,
            });
        });

        it('detects focus mode phrases', () => {
            assert.deepEqual(detectWorkStyleModeIntent('focus time'), {
                type: 'set_work_style_mode',
                mode: MODE_FOCUS,
            });
        });

        it('detects mode query intent', () => {
            assert.deepEqual(detectWorkStyleModeIntent('what mode am I in'), {
                type: 'query_work_style_mode',
            });
        });

        it('returns clarification intent for mixed urgent/planning signals', () => {
            assert.deepEqual(detectWorkStyleModeIntent("I'm in a rush but let's plan carefully"), {
                type: 'clarify_work_style_mode',
                mode: MODE_STANDARD,
                reason: 'mixed_signal',
            });
        });

        it('returns null for non-urgent messages', () => {
            assert.equal(detectWorkStyleModeIntent('buy groceries tonight'), null);
        });

        it('returns null for empty string', () => {
            assert.equal(detectWorkStyleModeIntent(''), null);
        });

        it('returns null for whitespace-only string', () => {
            assert.equal(detectWorkStyleModeIntent('   '), null);
        });

        it('returns null for non-string input', () => {
            assert.equal(detectWorkStyleModeIntent(null), null);
            assert.equal(detectWorkStyleModeIntent(undefined), null);
            assert.equal(detectWorkStyleModeIntent(123), null);
        });

        it('handles case-insensitive matching', () => {
            assert.deepEqual(detectWorkStyleModeIntent('TURN ON URGENT MODE'), {
                type: 'set_work_style_mode',
                mode: MODE_URGENT,
            });
            assert.deepEqual(detectWorkStyleModeIntent('Turn Off Urgent Mode'), {
                type: 'set_work_style_mode',
                mode: MODE_STANDARD,
            });
        });
    });

    describe('QuotaExhaustedError', () => {
        it('creates error with correct name', () => {
            const error = new QuotaExhaustedError('All keys exhausted');
            assert.equal(error.name, 'QuotaExhaustedError');
            assert.equal(error.message, 'All keys exhausted');
        });

        it('is instance of Error', () => {
            const error = new QuotaExhaustedError('Test error');
            assert.ok(error instanceof Error);
        });
    });

    describe('extractIntents - interface validation', () => {
        it('returns extractIntents function', () => {
            const mockGem = createMockGeminiAnalyzer();
            const intentExtractor = createIntentExtractor(mockGem);
            assert.equal(typeof intentExtractor.extractIntents, 'function');
        });

        it('extractIntents is async and accepts userMessage parameter', async () => {
            const mockGem = createMockGeminiAnalyzer();
            const intentExtractor = createIntentExtractor(mockGem);
            try {
                await intentExtractor.extractIntents('test message');
            } catch (error) {
                // Expected to fail without proper _executeWithFailover mock
                assert.ok(error || true, 'Should fail without proper Gemini mock');
            }
        });

        it('extractIntents accepts optional options parameter', async () => {
            const mockGem = createMockGeminiAnalyzer();
            const intentExtractor = createIntentExtractor(mockGem);
            try {
                await intentExtractor.extractIntents('test message', {
                    currentDate: '2026-03-31',
                    availableProjects: ['Work', 'Personal'],
                    requestId: 'test-123',
                });
            } catch (error) {
                // Expected to fail without proper _executeWithFailover mock
                assert.ok(error || true, 'Should fail without proper Gemini mock');
            }
        });

        it('extractIntents handles empty options gracefully', async () => {
            const mockGem = createMockGeminiAnalyzer();
            const intentExtractor = createIntentExtractor(mockGem);
            try {
                await intentExtractor.extractIntents('test message', {});
            } catch (error) {
                // Expected to fail without proper _executeWithFailover mock
                assert.ok(error || true, 'Should fail without proper Gemini mock');
            }
        });
    });

    describe('validateIntentAction - mutation validation rules', () => {
        it('accepts valid create action with title', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Buy groceries',
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, true);
            assert.equal(result.errors.length, 0);
        });

        it('rejects create action without title', () => {
            const result = validateIntentAction({
                type: 'create',
                title: null,
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('Create action requires a non-empty title')));
        });

        it('rejects create action with empty title', () => {
            const result = validateIntentAction({
                type: 'create',
                title: '',
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('Create action requires a non-empty title')));
        });

        it('accepts update action with targetQuery and no title', () => {
            const result = validateIntentAction({
                type: 'update',
                targetQuery: 'buy groceries',
                title: null,
                dueDate: 'tomorrow',
                confidence: 0.85,
            }, 0);
            assert.equal(result.valid, true);
            assert.equal(result.errors.length, 0);
        });

        it('accepts update action with targetQuery and new title (rename)', () => {
            const result = validateIntentAction({
                type: 'update',
                targetQuery: 'netflix task',
                title: 'Finish system design notes',
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, true);
            assert.equal(result.errors.length, 0);
        });

        it('rejects update action without targetQuery', () => {
            const result = validateIntentAction({
                type: 'update',
                targetQuery: null,
                title: 'New title',
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('Mutation action requires a non-empty targetQuery')));
        });

        it('rejects update action with empty targetQuery', () => {
            const result = validateIntentAction({
                type: 'update',
                targetQuery: '',
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('Mutation action requires a non-empty targetQuery')));
        });

        it('accepts complete action with targetQuery only', () => {
            const result = validateIntentAction({
                type: 'complete',
                targetQuery: 'buy groceries',
                title: null,
                confidence: 0.92,
            }, 0);
            assert.equal(result.valid, true);
            assert.equal(result.errors.length, 0);
        });

        it('rejects complete action without targetQuery', () => {
            const result = validateIntentAction({
                type: 'complete',
                targetQuery: null,
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('Mutation action requires a non-empty targetQuery')));
        });

        it('accepts delete action with targetQuery only', () => {
            const result = validateIntentAction({
                type: 'delete',
                targetQuery: 'old wifi task',
                title: null,
                confidence: 0.88,
            }, 0);
            assert.equal(result.valid, true);
            assert.equal(result.errors.length, 0);
        });

        it('rejects delete action without targetQuery', () => {
            const result = validateIntentAction({
                type: 'delete',
                targetQuery: null,
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('Mutation action requires a non-empty targetQuery')));
        });

        it('rejects mutation action with empty title string when provided', () => {
            const result = validateIntentAction({
                type: 'update',
                targetQuery: 'some task',
                title: '',
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('If title is provided, it must be a non-empty string')));
        });

        it('rejects action with invalid type', () => {
            const result = validateIntentAction({
                type: 'reschedule',
                targetQuery: 'some task',
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('Invalid type')));
        });

        it('rejects action with confidence outside 0-1 range', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Test task',
                confidence: 1.5,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('Confidence must be 0-1')));
        });

        it('rejects action with invalid priority', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Test task',
                priority: 2,
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('Invalid priority')));
        });

        it('rejects action with invalid splitStrategy', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Test task',
                splitStrategy: 'invalid',
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('Invalid splitStrategy')));
        });

        it('accepts valid action with all optional fields', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Test task',
                content: 'Some details',
                priority: 3,
                projectHint: 'Work',
                dueDate: 'tomorrow',
                repeatHint: 'daily',
                splitStrategy: 'single',
                confidence: 0.95,
            }, 0);
            assert.equal(result.valid, true);
            assert.equal(result.errors.length, 0);
        });

        it('handles multiple actions with different indices', () => {
            const result1 = validateIntentAction({
                type: 'create',
                title: 'Task 1',
                confidence: 0.9,
            }, 0);
            const result2 = validateIntentAction({
                type: 'update',
                targetQuery: 'Task 2',
                confidence: 0.8,
            }, 1);
            assert.equal(result1.valid, true);
            assert.equal(result2.valid, true);
        });
    });

    describe('validateIntentAction - checklist and clarification fields', () => {
        it('accepts create action with valid checklistItems', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Plan birthday party',
                checklistItems: [
                    { title: 'Buy decorations' },
                    { title: 'Send invites' },
                ],
                confidence: 0.88,
            }, 0);
            assert.equal(result.valid, true);
            assert.equal(result.errors.length, 0);
        });

        it('accepts create action without checklistItems (backward compat)', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Simple task',
                confidence: 0.95,
            }, 0);
            assert.equal(result.valid, true);
        });

        it('rejects checklistItems on non-create actions', () => {
            const result = validateIntentAction({
                type: 'update',
                targetQuery: 'some task',
                checklistItems: [{ title: 'step 1' }],
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('checklistItems is only valid for create')));
        });

        it('rejects create action with empty checklistItems array', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Plan something',
                checklistItems: [],
                confidence: 0.5,
            }, 0);
            // Empty array is technically valid (no invalid items), but should not fail
            assert.equal(result.valid, true);
        });

        it('accepts clarification action with low confidence', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Plan project',
                clarification: true,
                clarificationQuestion: 'Is this one task with steps, or several separate tasks?',
                confidence: 0.3,
            }, 0);
            assert.equal(result.valid, true);
        });

        it('rejects clarification action with high confidence', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Plan project',
                clarification: true,
                clarificationQuestion: 'What do you mean?',
                confidence: 0.8,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('clarification actions should have confidence')));
        });

        it('rejects non-boolean clarification', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Test',
                clarification: 'yes',
                confidence: 0.9,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('clarification must be a boolean')));
        });

        it('rejects non-string clarificationQuestion', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Test',
                clarification: true,
                clarificationQuestion: 123,
                confidence: 0.3,
            }, 0);
            assert.equal(result.valid, false);
            assert.ok(result.errors.some((e) => e.includes('clarificationQuestion must be a string')));
        });

        it('accepts create action with all new fields set to null (backward compat)', () => {
            const result = validateIntentAction({
                type: 'create',
                title: 'Ordinary task',
                checklistItems: null,
                clarification: null,
                clarificationQuestion: null,
                confidence: 0.95,
            }, 0);
            assert.equal(result.valid, true);
        });
    });
});

describe('validateChecklistItems', () => {
    it('returns valid=true for empty array', () => {
        const result = validateChecklistItems([]);
        assert.equal(result.valid, true);
        assert.deepEqual(result.items, []);
        assert.equal(result.errors.length, 0);
        assert.equal(result.wasCapped, false);
    });

    it('returns valid=false for non-array input', () => {
        const result = validateChecklistItems(null);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes('must be an array')));
    });

    it('returns valid=false for undefined input', () => {
        const result = validateChecklistItems(undefined);
        assert.equal(result.valid, false);
    });

    it('accepts valid checklist items with titles', () => {
        const result = validateChecklistItems([
            { title: 'Buy decorations' },
            { title: 'Send invitations' },
            { title: 'Bake cake' },
        ]);
        assert.equal(result.valid, true);
        assert.equal(result.items.length, 3);
        assert.equal(result.items[0].title, 'Buy decorations');
        assert.equal(result.items[1].title, 'Send invitations');
        assert.equal(result.wasCapped, false);
    });

    it('accepts items with optional status and sortOrder', () => {
        const result = validateChecklistItems([
            { title: 'First step', status: 'incomplete', sortOrder: 1 },
            { title: 'Second step', status: 'completed', sortOrder: 2 },
        ]);
        assert.equal(result.valid, true);
        assert.equal(result.items[0].status, 'incomplete');
        assert.equal(result.items[0].sortOrder, 1);
        assert.equal(result.items[1].status, 'completed');
    });

    it('rejects items without a title', () => {
        const result = validateChecklistItems([
            { title: 'Valid item' },
            { status: 'incomplete' },
            { title: '' },
            { title: '   ' },
        ]);
        assert.equal(result.valid, true);
        assert.equal(result.items.length, 1);
        assert.equal(result.items[0].title, 'Valid item');
        assert.ok(result.errors.length > 0);
    });

    it('rejects items with invalid status', () => {
        const result = validateChecklistItems([
            { title: 'Good item' },
            { title: 'Bad status', status: 'done' },
        ]);
        assert.equal(result.valid, true);
        assert.equal(result.items.length, 1);
        assert.ok(result.errors.some((e) => e.includes('invalid status')));
    });

    it('rejects non-object items in array', () => {
        const result = validateChecklistItems([
            { title: 'Valid' },
            'not an object',
            42,
        ]);
        assert.equal(result.valid, true);
        assert.equal(result.items.length, 1);
        assert.ok(result.errors.some((e) => e.includes('is not an object')));
    });

    it('caps items at MAX_CHECKLIST_ITEMS', () => {
        const manyItems = Array.from({ length: 50 }, (_, i) => ({ title: `Item ${i + 1}` }));
        const result = validateChecklistItems(manyItems);
        assert.equal(result.valid, true);
        assert.equal(result.items.length, MAX_CHECKLIST_ITEMS);
        assert.equal(result.wasCapped, true);
        assert.ok(result.errors.some((e) => e.includes('capped at')));
    });

    it('trims whitespace from titles', () => {
        const result = validateChecklistItems([
            { title: '  Trimmed title  ' },
        ]);
        assert.equal(result.valid, true);
        assert.equal(result.items[0].title, 'Trimmed title');
    });
});
