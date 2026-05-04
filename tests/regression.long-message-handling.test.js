import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createIntentExtractor } from '../services/intent-extraction.js';
import { normalizeAction } from '../services/normalizer.js';

function createLongMessage(wordCount = 520) {
    return Array.from({ length: wordCount }, (_, i) => `word${i + 1}`).join(' ');
}

// Mock GeminiAnalyzer that simulates Gemini response
function createMockGeminiAnalyzerForLongMessage() {
    return {
        _keys: ['test-key'],
        _activeKeyIndex: 0,
        async _executeWithFailover(prompt, apiCallFn) {
            const response = await apiCallFn(null, prompt, 'gemini-2.5-flash');
            return response;
        }
    };
}

describe('R13: Extremely Long Message Handling', () => {
    it('Gemini extraction accepts 500+ word message and returns valid action shape', async () => {
        const longMessage = createLongMessage(520);
        const mockGemini = createMockGeminiAnalyzerForLongMessage();

        // Mock the _executeWithFailover to return a valid response
        mockGemini._executeWithFailover = async (prompt, apiCallFn) => {
            const words = prompt.trim().split(/\s+/);
            assert.ok(words.length >= 500, 'Message should have 500+ words');

            // Simulate what Gemini would return
            return {
                text: JSON.stringify({
                    actions: [
                        {
                            type: 'create',
                            targetQuery: null,
                            title: 'Write project update',
                            content: prompt,
                            priority: null,
                            projectHint: null,
                            dueDate: null,
                            repeatHint: null,
                            splitStrategy: 'single',
                            checklistItems: null,
                            clarification: null,
                            clarificationQuestion: null,
                            confidence: 0.9
                        }
                    ]
                })
            };
        };

        const intentExtractor = createIntentExtractor(mockGemini);
        const actions = await intentExtractor.extractIntents(longMessage, {
            currentDate: '2026-04-24',
            availableProjects: ['Inbox'],
            requestId: 'r13-long-message'
        });

        assert.equal(actions.length, 1);
        assert.equal(actions[0].type, 'create');
        assert.equal(actions[0].title, 'Write project update');
        assert.ok(actions[0].content.length > 0, 'Content should be preserved');
    });

    it('normalizer enforces title and content length limits for long inputs', () => {
        const longTitle = `Plan ${'very '.repeat(40)}long strategic initiative with detailed milestones and dependencies`;
        const longContent = Array.from({ length: 1200 }, (_, i) => `detail${i + 1}`).join(' ');

        const normalized = normalizeAction({
            type: 'create',
            title: longTitle,
            content: longContent,
            confidence: 0.9
        });

        assert.ok(normalized.title.length <= 80);
        assert.ok(normalized.title.endsWith('…'));

        assert.ok(normalized.content.length <= 4001);
        assert.ok(normalized.content.endsWith('…'));
    });
});
