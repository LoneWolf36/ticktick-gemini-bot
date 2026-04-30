/**
 * tests/checklist-normalization.test.js
 * WP02: Checklist normalization tests (extracted from normalizer.test.js)
 * 
 * Covers T021-T026: Helper, Clean Item Text, Cap Length, Assign Sort Order,
 * Validate Items, Attach to Create Only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAction } from '../services/normalizer.js';

describe('WP02: Checklist Normalization — T021 (Helper)', () => {
    it('should return empty array for undefined checklistItems', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Plan event'
        });
        // When checklistItems is not provided, the field is undefined on the action
        assert.strictEqual(result.checklistItems, undefined);
    });

    it('should return empty array for null checklistItems', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Plan event',
            checklistItems: null
        });
        // When explicitly set to null, normalizer returns empty array
        assert.deepStrictEqual(result.checklistItems, []);
    });

    it('should return empty array for empty checklistItems', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Plan event',
            checklistItems: []
        });
        assert.deepStrictEqual(result.checklistItems, []);
    });

    it('should clean and return valid checklist items', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Plan party',
            checklistItems: [
                { title: 'buy decorations' },
                { title: 'send invites' },
                { title: 'bake cake' }
            ]
        });

        assert.strictEqual(result.checklistItems.length, 3);
        assert.strictEqual(result.checklistItems[0].title, 'Buy decorations');
        assert.strictEqual(result.checklistItems[1].title, 'Send invites');
        assert.strictEqual(result.checklistItems[2].title, 'Bake cake');
    });
});

describe('WP02: Checklist Normalization — T022 (Clean Item Text)', () => {
    it('should trim whitespace from item titles', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [{ title: '  buy groceries  ' }]
        });

        assert.strictEqual(result.checklistItems[0].title, 'Buy groceries');
    });

    it('should drop empty item titles', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [
                { title: 'valid item' },
                { title: '' },
                { title: '   ' },
                { title: null }
            ]
        });

        assert.strictEqual(result.checklistItems.length, 1);
        assert.strictEqual(result.checklistItems[0].title, 'Valid item');
    });

    it('should truncate long item titles at word boundary', () => {
        const longTitle = 'This is a very long checklist item title that should be truncated at a word boundary';
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [{ title: longTitle }]
        });

        assert.ok(result.checklistItems[0].title.length <= 51); // 50 + ellipsis
        assert.ok(result.checklistItems[0].title.endsWith('…'));
    });

    it('should strip bracket prefixes from item titles', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [{ title: '[Step 1] buy decorations' }]
        });

        assert.strictEqual(result.checklistItems[0].title, 'Buy decorations');
    });

    it('should strip priority markers from item titles', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [{ title: 'URGENT: call the vendor' }]
        });

        assert.strictEqual(result.checklistItems[0].title, 'Call the vendor');
    });

    it('should not over-clean meaningful references', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [{ title: 'review the Q3 budget spreadsheet' }]
        });

        assert.ok(result.checklistItems[0].title.includes('Q3 budget'));
    });

    it('should capitalize first letter of item titles', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [{ title: 'send invitations to guests' }]
        });

        assert.strictEqual(result.checklistItems[0].title, 'Send invitations to guests');
    });
});

describe('WP02: Checklist Normalization — T023 (Cap Length)', () => {
    it('should cap checklist items at 30', () => {
        const items = Array.from({ length: 40 }, (_, i) => ({ title: `item ${i + 1}` }));
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: items
        });

        assert.strictEqual(result.checklistItems.length, 30);
    });

    it('should not cap when under 30 items', () => {
        const items = Array.from({ length: 10 }, (_, i) => ({ title: `item ${i + 1}` }));
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: items
        });

        assert.strictEqual(result.checklistItems.length, 10);
    });
});

describe('WP02: Checklist Normalization — T024 (Assign Sort Order)', () => {
    it('should assign zero-based sort order when absent', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [
                { title: 'first' },
                { title: 'second' },
                { title: 'third' }
            ]
        });

        assert.strictEqual(result.checklistItems[0].sortOrder, 0);
        assert.strictEqual(result.checklistItems[1].sortOrder, 1);
        assert.strictEqual(result.checklistItems[2].sortOrder, 2);
    });

    it('should normalize numeric sort orders if present', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [
                { title: 'first', sortOrder: 5 },
                { title: 'second', sortOrder: 10 }
            ]
        });

        assert.strictEqual(result.checklistItems[0].sortOrder, 5);
        assert.strictEqual(result.checklistItems[1].sortOrder, 10);
    });

    it('should keep item order stable', () => {
        const items = ['alpha', 'beta', 'gamma'].map(t => ({ title: t }));
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: items
        });

        assert.strictEqual(result.checklistItems[0].title, 'Alpha');
        assert.strictEqual(result.checklistItems[1].title, 'Beta');
        assert.strictEqual(result.checklistItems[2].title, 'Gamma');
    });

    it('should produce deterministic order', () => {
        const items = ['one', 'two', 'three'].map(t => ({ title: t }));
        const result1 = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: items
        });
        const result2 = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: items
        });

        assert.deepStrictEqual(
            result1.checklistItems.map(i => i.sortOrder),
            result2.checklistItems.map(i => i.sortOrder)
        );
    });
});

describe('WP02: Checklist Normalization — T025 (Validate Items)', () => {
    it('should require non-empty title and drop invalid items', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [
                { title: 'valid' },
                { title: '' },
                { title: null },
                { title: 'also valid' }
            ]
        });

        assert.strictEqual(result.checklistItems.length, 2);
        assert.strictEqual(result.checklistItems[0].title, 'Valid');
        assert.strictEqual(result.checklistItems[1].title, 'Also valid');
    });

    it('should default status to 0 (incomplete)', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [
                { title: 'item one' },
                { title: 'item two' }
            ]
        });

        assert.strictEqual(result.checklistItems[0].status, 0);
        assert.strictEqual(result.checklistItems[1].status, 0);
    });

    it('should reject nested checklist structures', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [
                { title: 'simple item' },
                { title: 'nested', items: [{ title: 'sub-item' }] }
            ]
        });

        assert.strictEqual(result.checklistItems.length, 1);
        assert.strictEqual(result.checklistItems[0].title, 'Simple item');
    });

    it('should accept flat items only', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Task',
            checklistItems: [
                { title: 'item a' },
                { title: 'item b' },
                { title: 'item c' }
            ]
        });

        assert.strictEqual(result.checklistItems.length, 3);
        result.checklistItems.forEach(item => {
            assert.strictEqual(item.status, 0);
            assert.ok(typeof item.sortOrder === 'number');
        });
    });
});

describe('WP02: Checklist Normalization — T026 (Attach to Create Only)', () => {
    it('should attach checklistItems to create actions', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Plan party',
            checklistItems: [
                { title: 'buy decorations' },
                { title: 'send invites' }
            ]
        });

        assert.ok(Array.isArray(result.checklistItems));
        assert.strictEqual(result.checklistItems.length, 2);
    });

    it('should NOT attach checklistItems to update actions', () => {
        const result = normalizeAction({
            type: 'update',
            taskId: 'abc123',
            targetQuery: 'plan party',
            checklistItems: [{ title: 'buy decorations' }],
            confidence: 0.9
        });

        assert.strictEqual(result.checklistItems, undefined);
    });

    it('should NOT attach checklistItems to complete actions', () => {
        const result = normalizeAction({
            type: 'complete',
            taskId: 'abc123',
            targetQuery: 'plan party',
            checklistItems: [{ title: 'buy decorations' }],
            confidence: 0.9
        });

        assert.strictEqual(result.checklistItems, undefined);
    });

    it('should NOT attach checklistItems to delete actions', () => {
        const result = normalizeAction({
            type: 'delete',
            taskId: 'abc123',
            targetQuery: 'plan party',
            checklistItems: [{ title: 'buy decorations' }],
            confidence: 0.9
        });

        assert.strictEqual(result.checklistItems, undefined);
    });

    it('should preserve existing content handling alongside checklists', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Plan party',
            content: 'Details in the shared drive',
            checklistItems: [{ title: 'buy decorations' }]
        });

        assert.ok(result.content.includes('shared drive'));
        assert.strictEqual(result.checklistItems.length, 1);
    });

    it('should handle regression: create without checklistItems has no field', () => {
        const result = normalizeAction({
            type: 'create',
            title: 'Simple task'
        });

        assert.strictEqual(result.checklistItems, undefined);
    });

    it('should boost confidence for resolver-confirmed mutations', () => {
        // Bug: follow-up messages like "make it recurring" get low confidence
        // from Gemini because the message is ambiguous in isolation. But the
        // task resolver already confirmed the target — that should override.
        const result = normalizeAction({
            type: 'update',
            title: null,
            confidence: 0.3,
            repeatHint: 'daily',
        }, {
            existingTask: { id: 'task123', projectId: 'proj456', title: 'Watch AI Coding Videos' },
            existingTaskContent: null,
        });

        assert.strictEqual(result.confidence, 0.5);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.validationErrors.length, 0);
    });

    it('should not boost confidence for unresolved mutations', () => {
        const result = normalizeAction({
            type: 'update',
            title: null,
            confidence: 0.3,
            repeatHint: 'daily',
        });

        assert.strictEqual(result.confidence, 0.3);
        assert.strictEqual(result.valid, false);
        assert.ok(result.validationErrors.some(e => e.includes('Confidence 0.3 below threshold')));
    });
});
