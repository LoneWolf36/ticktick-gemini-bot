import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { AxGen } from '@ax-llm/ax';
import { createAxIntent } from '../services/ax-intent.js';
import { normalizeAction } from '../services/normalizer.js';

function createLongMessage(wordCount = 520) {
    return Array.from({ length: wordCount }, (_, i) => `word${i + 1}`).join(' ');
}

describe('R13: Extremely Long Message Handling', () => {
    it('AX extraction accepts 500+ word message and returns valid action shape', async () => {
        const longMessage = createLongMessage(520);
        const keyManager = {
            getActiveKey: mock.fn(() => 'test-key'),
            markKeyUnavailable: mock.fn(),
            rotateKey: mock.fn(async () => false),
            getKeyCount: mock.fn(() => 1),
        };

        const originalForward = AxGen.prototype.forward;
        AxGen.prototype.forward = async function mockForward(_ai, input) {
            const words = input.userMessage.trim().split(/\s+/);
            assert.ok(words.length >= 500);

            return {
                actions: [
                    {
                        type: 'create',
                        targetQuery: null,
                        title: 'Write project update',
                        content: input.userMessage,
                        priority: null,
                        projectHint: null,
                        dueDate: null,
                        repeatHint: null,
                        splitStrategy: 'single',
                        checklistItems: null,
                        clarification: null,
                        clarificationQuestion: null,
                        confidence: 0.9,
                    },
                ],
            };
        };

        try {
            const axIntent = createAxIntent(keyManager);
            const actions = await axIntent.extractIntents(longMessage, {
                currentDate: '2026-04-24',
                availableProjects: ['Inbox'],
                requestId: 'r13-long-message',
            });

            assert.equal(actions.length, 1);
            assert.equal(actions[0].type, 'create');
            assert.equal(actions[0].title, 'Write project update');
        } finally {
            AxGen.prototype.forward = originalForward;
        }
    });

    it('normalizer enforces title and content length limits for long inputs', () => {
        const longTitle = `Plan ${'very '.repeat(40)}long strategic initiative with detailed milestones and dependencies`;
        const longContent = Array.from({ length: 1200 }, (_, i) => `detail${i + 1}`).join(' ');

        const normalized = normalizeAction({
            type: 'create',
            title: longTitle,
            content: longContent,
            confidence: 0.9,
        });

        assert.ok(normalized.title.length <= 80);
        assert.ok(normalized.title.endsWith('…'));

        assert.ok(normalized.content.length <= 4001);
        assert.ok(normalized.content.endsWith('…'));
    });
});
