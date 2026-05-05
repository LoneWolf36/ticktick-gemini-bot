import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAction } from '../services/normalizer.js';

describe('Mutation-safe field preservation', () => {
    it('should not wipe title, repeatFlag, or priority when only changing dueDate', () => {
        const result = normalizeAction(
            {
                type: 'update',
                title: "Huzzi's periods",
                targetQuery: "Huzzi's periods",
                dueDate: '2026-04-29',
                confidence: 0.9
            },
            {
                existingTask: { id: 'task-abc', projectId: 'proj-xyz', title: "Huzzi's periods" },
                existingTaskContent: 'Some existing content'
            }
        );

        assert.strictEqual(result.title, undefined);
        assert.strictEqual(result.repeatFlag, undefined);
        assert.strictEqual(result.priority, undefined);
        assert.ok(result.dueDate !== undefined);
        assert.strictEqual(result.projectId, undefined);
        assert.strictEqual(result.valid, true);
    });

    it('should include title when it is an explicit rename', () => {
        const result = normalizeAction(
            {
                type: 'update',
                title: 'New task name',
                targetQuery: "Huzzi's periods",
                dueDate: '2026-04-29',
                confidence: 0.9
            },
            {
                existingTask: { id: 'task-abc', projectId: 'proj-xyz', title: "Huzzi's periods" }
            }
        );

        assert.ok(result.title !== undefined);
        assert.ok(result.title.length > 0);
    });

    it('should include repeatFlag when user explicitly sets recurrence', () => {
        const result = normalizeAction(
            {
                type: 'update',
                title: null,
                repeatHint: 'daily',
                confidence: 0.9
            },
            {
                existingTask: { id: 'task-abc', projectId: 'proj-xyz', title: 'Morning routine' }
            }
        );

        assert.ok(result.repeatFlag !== undefined);
        assert.ok(result.repeatFlag.includes('FREQ=DAILY'));
    });

    it('should include priority when user explicitly sets it', () => {
        const result = normalizeAction(
            {
                type: 'update',
                title: null,
                priority: 5,
                confidence: 0.9
            },
            {
                existingTask: { id: 'task-abc', projectId: 'proj-xyz', title: 'Important task' }
            }
        );

        assert.strictEqual(result.priority, 5);
    });

    it('should not wipe dueDate when mutation has empty string dueDate', () => {
        const result = normalizeAction(
            {
                type: 'update',
                title: null,
                dueDate: '',
                confidence: 0.9
            },
            {
                existingTask: { id: 'task-abc', projectId: 'proj-xyz', title: 'Existing task', dueDate: '2026-04-15' },
                existingTaskContent: null
            }
        );

        assert.strictEqual(result.dueDate, undefined);
    });

    it('should not wipe priority when mutation has empty string priority', () => {
        const result = normalizeAction(
            {
                type: 'update',
                title: null,
                priority: '',
                confidence: 0.9
            },
            {
                existingTask: { id: 'task-abc', projectId: 'proj-xyz', title: 'Important task' }
            }
        );

        assert.strictEqual(result.priority, undefined);
    });
});
