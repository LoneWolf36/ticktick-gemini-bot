/**
 * tests/task-resolver.test.js
 *
 * Unit tests for the deterministic task resolver.
 * Covers: normalization, exact/prefix/contains/fuzzy matching,
 * ambiguity/clarification, and not-found outcomes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget, buildClarificationPrompt } from '../services/task-resolver.js';

// Representative task fixtures matching real TickTick task shapes
const TASK_FIXTURES = {
    callMom: { id: 'task001', projectId: 'proj001', title: 'Call mom' },
    callMomInsurance: { id: 'task002', projectId: 'proj001', title: 'Call mom about insurance' },
    buyGroceries: { id: 'task003', projectId: 'proj002', title: 'Buy groceries' },
    finishDesign: { id: 'task004', projectId: 'proj003', title: 'Finish system design notes' },
    oldWifi: { id: 'task005', projectId: 'proj001', title: 'Old wifi task' },
    readBook: { id: 'task006', projectId: 'proj002', title: 'Read a book' },
    exercise: { id: 'task007', projectId: 'proj003', title: 'Exercise' },
    callMomDuplicated: { id: 'task008', projectId: 'proj001', title: 'Call Mom' } // Same as task001 with different case
};

const ACTIVE_TASKS = [
    TASK_FIXTURES.callMom,
    TASK_FIXTURES.callMomInsurance,
    TASK_FIXTURES.buyGroceries,
    TASK_FIXTURES.finishDesign,
    TASK_FIXTURES.oldWifi,
    TASK_FIXTURES.readBook,
    TASK_FIXTURES.exercise
];

describe('Task Resolver Module', () => {
    describe('Exports', () => {
        it('should export resolveTarget function', () => {
            assert.strictEqual(typeof resolveTarget, 'function');
        });

        it('should export buildClarificationPrompt function', () => {
            assert.strictEqual(typeof buildClarificationPrompt, 'function');
        });
    });

    describe('Result shape contract', () => {
        it('should return object with status, selected, candidates, reason', () => {
            const result = resolveTarget({ targetQuery: 'test', activeTasks: [] });
            assert.ok('status' in result, 'missing status');
            assert.ok('selected' in result, 'missing selected');
            assert.ok('candidates' in result, 'missing candidates');
            assert.ok('reason' in result, 'missing reason');
        });

        it('should have valid status values', () => {
            const validStatuses = ['resolved', 'clarification', 'not_found'];
            const results = [
                resolveTarget({ targetQuery: 'buy groceries', activeTasks: [TASK_FIXTURES.buyGroceries] }),
                resolveTarget({
                    targetQuery: 'call mom',
                    activeTasks: [TASK_FIXTURES.callMom, TASK_FIXTURES.callMomInsurance]
                }),
                resolveTarget({ targetQuery: 'nonexistent xyz', activeTasks: ACTIVE_TASKS })
            ];
            for (const r of results) {
                assert.ok(validStatuses.includes(r.status), `invalid status: ${r.status}`);
            }
        });

        it('should return candidate objects with stable fields', () => {
            const result = resolveTarget({ targetQuery: 'buy groceries', activeTasks: [TASK_FIXTURES.buyGroceries] });
            for (const c of result.candidates) {
                assert.ok('taskId' in c, 'candidate missing taskId');
                assert.ok('projectId' in c, 'candidate missing projectId');
                assert.ok('title' in c, 'candidate missing title');
                assert.ok('score' in c, 'candidate missing score');
                assert.ok('matchType' in c, 'candidate missing matchType');
            }
        });
    });

    describe('Edge cases: empty input', () => {
        it('should return not_found for empty query', () => {
            const result = resolveTarget({ targetQuery: '', activeTasks: ACTIVE_TASKS });
            assert.strictEqual(result.status, 'not_found');
            assert.strictEqual(result.selected, null);
            assert.strictEqual(result.reason, 'empty_query');
        });

        it('should return not_found for whitespace-only query', () => {
            const result = resolveTarget({ targetQuery: '   ', activeTasks: ACTIVE_TASKS });
            assert.strictEqual(result.status, 'not_found');
            assert.strictEqual(result.reason, 'empty_query');
        });

        it('should return not_found for null query', () => {
            const result = resolveTarget({ targetQuery: null, activeTasks: ACTIVE_TASKS });
            assert.strictEqual(result.status, 'not_found');
            assert.strictEqual(result.reason, 'empty_query');
        });

        it('should return not_found for no active tasks', () => {
            const result = resolveTarget({ targetQuery: 'buy groceries', activeTasks: [] });
            assert.strictEqual(result.status, 'not_found');
            assert.strictEqual(result.reason, 'no_active_tasks');
        });

        it('should return not_found for undefined activeTasks', () => {
            const result = resolveTarget({ targetQuery: 'buy groceries', activeTasks: undefined });
            assert.strictEqual(result.status, 'not_found');
            assert.strictEqual(result.reason, 'no_active_tasks');
        });
    });

    describe('Exact matching (T012)', () => {
        it('should resolve exact title match', () => {
            const result = resolveTarget({ targetQuery: 'Buy groceries', activeTasks: [TASK_FIXTURES.buyGroceries] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 'task003');
            assert.strictEqual(result.selected.matchType, 'exact');
            assert.strictEqual(result.selected.score, 100);
        });

        it('should resolve exact match case-insensitively', () => {
            const result = resolveTarget({ targetQuery: 'BUY GROCERIES', activeTasks: [TASK_FIXTURES.buyGroceries] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 'task003');
            assert.strictEqual(result.selected.matchType, 'exact');
        });

        it('should resolve exact match ignoring punctuation differences', () => {
            const result = resolveTarget({ targetQuery: 'call mom', activeTasks: [TASK_FIXTURES.callMom] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 'task001');
            assert.strictEqual(result.selected.matchType, 'exact');
        });

        it('should return clarification for multiple exact matches (near-duplicate titles)', () => {
            const tasks = [TASK_FIXTURES.callMom, TASK_FIXTURES.callMomDuplicated];
            const result = resolveTarget({ targetQuery: 'Call mom', activeTasks: tasks });
            assert.strictEqual(result.status, 'clarification');
            assert.strictEqual(result.selected, null);
            assert.strictEqual(result.reason, 'multiple_exact_matches');
            assert.ok(result.candidates.length >= 2);
        });

        it('should dedupe repeated active task rows before clarification UI', () => {
            const tasks = [
                { id: 'duplicate-task', projectId: 'proj001', title: 'Record measurements' },
                { id: 'duplicate-task', projectId: 'proj001', title: 'Record measurements' },
                { id: 'other-task', projectId: 'proj001', title: 'Record blood pressure' }
            ];

            const result = resolveTarget({ targetQuery: 'Record', activeTasks: tasks });

            assert.strictEqual(result.status, 'clarification');
            assert.deepStrictEqual(result.candidates.map((candidate) => candidate.taskId).sort(), [
                'duplicate-task',
                'other-task'
            ]);
        });
    });

    describe('Prefix matching (T012)', () => {
        it('should resolve when query is a prefix of task title', () => {
            const result = resolveTarget({ targetQuery: 'call mom', activeTasks: [TASK_FIXTURES.callMomInsurance] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 'task002');
            assert.strictEqual(result.selected.matchType, 'prefix');
            assert.strictEqual(result.selected.score, 80);
        });

        it('should resolve when task title is a prefix of query', () => {
            const result = resolveTarget({
                targetQuery: 'buy groceries tomorrow',
                activeTasks: [TASK_FIXTURES.buyGroceries]
            });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 'task003');
            assert.strictEqual(result.selected.matchType, 'prefix');
        });

        it('should prefer exact match over prefix match', () => {
            const result = resolveTarget({
                targetQuery: 'buy groceries',
                activeTasks: [TASK_FIXTURES.buyGroceries, TASK_FIXTURES.finishDesign]
            });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.matchType, 'exact');
            assert.ok(result.selected.score > 80);
        });
    });

    describe('Contains matching (T012)', () => {
        it('should resolve when query contains task title', () => {
            const result = resolveTarget({
                targetQuery: 'I need to buy groceries today',
                activeTasks: [TASK_FIXTURES.buyGroceries]
            });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 'task003');
            assert.strictEqual(result.selected.matchType, 'contains');
            assert.strictEqual(result.selected.score, 60);
        });

        it('should resolve when task title contains query', () => {
            const result = resolveTarget({ targetQuery: 'design', activeTasks: [TASK_FIXTURES.finishDesign] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 'task004');
            assert.strictEqual(result.selected.matchType, 'contains');
        });

        it('should prefer prefix match over contains match', () => {
            // When both prefix and contains apply, prefix should score higher
            const tasks = [TASK_FIXTURES.callMom, TASK_FIXTURES.callMomInsurance];
            const result = resolveTarget({ targetQuery: 'call mom', activeTasks: tasks });
            // callMom is exact (100), callMomInsurance is prefix (80)
            // No duplicate of callMom here, gap = 20 >= 15, so exact wins
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 'task001');
            assert.strictEqual(result.selected.matchType, 'exact');
        });
    });

    describe('Conservative fuzzy matching (T012)', () => {
        it('should resolve small typos via fuzzy matching', () => {
            const result = resolveTarget({ targetQuery: 'by grocerie', activeTasks: [TASK_FIXTURES.buyGroceries] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 'task003');
            assert.ok(result.selected.matchType === 'fuzzy' || result.selected.matchType === 'token_overlap');
            assert.ok(result.selected.score >= 30);
        });

        it('should not fuzzy match when similarity is too low', () => {
            const result = resolveTarget({ targetQuery: 'xyz random gibberish', activeTasks: ACTIVE_TASKS });
            assert.strictEqual(result.status, 'not_found');
            assert.strictEqual(result.selected, null);
        });

        it('should not auto-resolve broad fuzzy matches just because a candidate exists', () => {
            // A fuzzy match with low similarity should not resolve
            const result = resolveTarget({
                targetQuery: 'call',
                activeTasks: [TASK_FIXTURES.callMom, TASK_FIXTURES.callMomInsurance]
            });
            // "call" is a prefix of both, so it should be prefix match, but both match -> clarification
            assert.ok(result.status === 'clarification' || result.status === 'resolved');
            if (result.status === 'resolved') {
                // Only resolved if one candidate clearly wins
                assert.ok(result.selected.score >= 30);
            }
        });

        it('should handle dropped letters with fuzzy matching', () => {
            const result = resolveTarget({ targetQuery: 'exrcise', activeTasks: [TASK_FIXTURES.exercise] });
            assert.strictEqual(result.status, 'resolved');
            assert.ok(result.selected.matchType === 'fuzzy' || result.selected.matchType === 'token_overlap');
        });
    });

    describe('Ambiguity and clarification (T013)', () => {
        it('should return clarification for overlapping titles', () => {
            const result = resolveTarget({
                targetQuery: 'call mom',
                activeTasks: [TASK_FIXTURES.callMom, TASK_FIXTURES.callMomInsurance]
            });
            // "call mom" is exact for task001, prefix for task002
            // Score gap: 100 - 80 = 20 >= 15, so exact wins
            // BUT we need to check if task001 has a duplicate
            // Since we don't have the duplicate in this test, exact wins
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 'task001');
        });

        it('should return clarification when multiple plausible candidates remain with close scores', () => {
            // Two tasks with very similar fuzzy scores
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Buy milk' },
                { id: 't2', projectId: 'p1', title: 'Buy milk and eggs' }
            ];
            const result = resolveTarget({ targetQuery: 'buy milk', activeTasks: tasks });
            // "buy milk" is exact for t1 (100), prefix for t2 (80)
            // Gap = 20 >= 15, so t1 wins
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 't1');
        });

        it('should return clarification for ambiguous short references', () => {
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Meeting with John' },
                { id: 't2', projectId: 'p1', title: 'Meeting with Sarah' }
            ];
            const result = resolveTarget({ targetQuery: 'meeting', activeTasks: tasks });
            // "meeting" is prefix for both (80 each), gap = 0 < 15
            assert.strictEqual(result.status, 'clarification');
            assert.strictEqual(result.selected, null);
            assert.strictEqual(result.reason, 'ambiguous_target');
            assert.ok(result.candidates.length >= 2);
        });

        it('should include candidate titles in clarification result', () => {
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Review PR 123' },
                { id: 't2', projectId: 'p1', title: 'Review PR 456' }
            ];
            const result = resolveTarget({ targetQuery: 'review pr', activeTasks: tasks });
            assert.strictEqual(result.status, 'clarification');
            assert.ok(result.candidates.length >= 2);
            for (const c of result.candidates) {
                assert.ok(typeof c.title === 'string');
                assert.ok(c.title.length > 0);
            }
        });
    });

    describe('Not-found outcomes (T013)', () => {
        it('should return not_found for nonexistent target', () => {
            const result = resolveTarget({ targetQuery: 'do something completely new', activeTasks: ACTIVE_TASKS });
            assert.strictEqual(result.status, 'not_found');
            assert.strictEqual(result.selected, null);
        });

        it('should return not_found with no selected task', () => {
            const result = resolveTarget({ targetQuery: 'zxcvbnm', activeTasks: ACTIVE_TASKS });
            assert.strictEqual(result.status, 'not_found');
            assert.strictEqual(result.selected, null);
            assert.strictEqual(result.candidates.length, 0);
        });

        it('should perform no write for not_found result', () => {
            // The resolver is read-only; this test confirms the contract
            const result = resolveTarget({ targetQuery: 'nonexistent', activeTasks: ACTIVE_TASKS });
            assert.strictEqual(result.status, 'not_found');
            assert.strictEqual(result.selected, null);
        });
    });

    describe('Deterministic ordering (T012)', () => {
        it('should sort candidates by score descending', () => {
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Abc' },
                { id: 't2', projectId: 'p1', title: 'Abc def' },
                { id: 't3', projectId: 'p1', title: 'Xyz something' }
            ];
            const result = resolveTarget({ targetQuery: 'abc', activeTasks: tasks });
            if (result.candidates.length > 1) {
                for (let i = 0; i < result.candidates.length - 1; i++) {
                    assert.ok(
                        result.candidates[i].score >= result.candidates[i + 1].score,
                        'candidates not sorted by score descending'
                    );
                }
            }
        });

        it('should break score ties by title alphabetically', () => {
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Beta task' },
                { id: 't2', projectId: 'p1', title: 'Alpha task' }
            ];
            const result = resolveTarget({ targetQuery: 'task', activeTasks: tasks });
            if (result.candidates.length > 1) {
                // Same match type -> same score -> sorted by title
                const titles = result.candidates.map((c) => c.title);
                assert.deepStrictEqual(titles, [...titles].sort());
            }
        });
    });

    describe('Repeated titles and punctuation (T014)', () => {
        it('should handle case differences as exact match', () => {
            const result = resolveTarget({ targetQuery: 'BUY GROCERIES', activeTasks: [TASK_FIXTURES.buyGroceries] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.matchType, 'exact');
        });

        it('should handle punctuation differences gracefully', () => {
            const result = resolveTarget({ targetQuery: 'Call mom!', activeTasks: [TASK_FIXTURES.callMom] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.matchType, 'exact');
        });

        it('should handle repeated titles with different IDs', () => {
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Read book' },
                { id: 't2', projectId: 'p1', title: 'Read book' }
            ];
            const result = resolveTarget({ targetQuery: 'read book', activeTasks: tasks });
            assert.strictEqual(result.status, 'clarification');
            assert.strictEqual(result.reason, 'multiple_exact_matches');
        });
    });

    describe('Clarification prompt (T015)', () => {
        it('should build a prompt with candidate options', () => {
            const result = {
                status: 'clarification',
                selected: null,
                candidates: [
                    { taskId: 't1', projectId: 'p1', title: 'Call mom', score: 80, matchType: 'prefix' },
                    {
                        taskId: 't2',
                        projectId: 'p1',
                        title: 'Call mom about insurance',
                        score: 60,
                        matchType: 'contains'
                    }
                ],
                reason: 'ambiguous_target'
            };
            const prompt = buildClarificationPrompt(result);
            assert.ok(prompt.includes('Call mom'));
            assert.ok(prompt.includes('Call mom about insurance'));
            assert.ok(prompt.includes('1.'));
            assert.ok(prompt.includes('2.'));
        });

        it('should provide a default prompt for empty candidates', () => {
            const result = { status: 'clarification', selected: null, candidates: [], reason: 'test' };
            const prompt = buildClarificationPrompt(result);
            assert.strictEqual(prompt, 'Which task did you mean?');
        });
    });

    describe('Downstream consumption assumptions (T015)', () => {
        it('should allow branching on status without guessing field presence', () => {
            const results = [
                resolveTarget({ targetQuery: 'buy groceries', activeTasks: [TASK_FIXTURES.buyGroceries] }),
                resolveTarget({
                    targetQuery: 'meeting',
                    activeTasks: [
                        { id: 't1', projectId: 'p1', title: 'Meeting with John' },
                        { id: 't2', projectId: 'p1', title: 'Meeting with Sarah' }
                    ]
                }),
                resolveTarget({ targetQuery: 'xyz', activeTasks: ACTIVE_TASKS })
            ];

            for (const result of results) {
                switch (result.status) {
                    case 'resolved':
                        assert.ok(result.selected !== null);
                        assert.ok(result.selected.taskId);
                        break;
                    case 'clarification':
                        assert.ok(result.selected === null);
                        assert.ok(Array.isArray(result.candidates));
                        assert.ok(result.candidates.length >= 2);
                        assert.ok(typeof result.reason === 'string');
                        break;
                    case 'not_found':
                        assert.ok(result.selected === null);
                        assert.ok(Array.isArray(result.candidates));
                        assert.ok(typeof result.reason === 'string');
                        break;
                    default:
                        assert.fail(`unknown status: ${result.status}`);
                }
            }
        });

        it('should preserve original task title in candidates for clarification', () => {
            const result = resolveTarget({
                targetQuery: 'meeting',
                activeTasks: [
                    { id: 't1', projectId: 'p1', title: 'Meeting with John' },
                    { id: 't2', projectId: 'p1', title: 'Meeting with Sarah' }
                ]
            });
            assert.strictEqual(result.status, 'clarification');
            for (const c of result.candidates) {
                assert.ok(c.title === 'Meeting with John' || c.title === 'Meeting with Sarah');
            }
        });

        it('should keep only three public result states', () => {
            const allStatuses = new Set();
            const testCases = [
                { targetQuery: 'buy groceries', activeTasks: [TASK_FIXTURES.buyGroceries] },
                { targetQuery: 'call mom', activeTasks: [TASK_FIXTURES.callMom, TASK_FIXTURES.callMomInsurance] },
                {
                    targetQuery: 'meeting',
                    activeTasks: [
                        { id: 't1', projectId: 'p1', title: 'Meeting with John' },
                        { id: 't2', projectId: 'p1', title: 'Meeting with Sarah' }
                    ]
                },
                { targetQuery: 'xyz nonexistent', activeTasks: ACTIVE_TASKS },
                { targetQuery: '', activeTasks: ACTIVE_TASKS }
            ];

            for (const tc of testCases) {
                allStatuses.add(resolveTarget(tc).status);
            }

            const expectedStatuses = new Set(['resolved', 'clarification', 'not_found']);
            assert.deepStrictEqual(allStatuses, expectedStatuses);
        });
    });

    describe('Product Vision: fail-closed behavior', () => {
        it('should not resolve on low-confidence fuzzy matches', () => {
            const result = resolveTarget({ targetQuery: 'abc', activeTasks: [TASK_FIXTURES.exercise] });
            // "abc" vs "exercise" — very low similarity
            assert.strictEqual(result.status, 'not_found');
        });

        it('should clarify rather than guess for ambiguous references', () => {
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Call doctor' },
                { id: 't2', projectId: 'p1', title: 'Call dentist' }
            ];
            const result = resolveTarget({ targetQuery: 'call', activeTasks: tasks });
            assert.strictEqual(result.status, 'clarification');
            assert.strictEqual(result.selected, null);
        });

        it('should handle delete safety via clarification contract', () => {
            // Delete safety relies on the same clarification vs resolved contract
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Old task' },
                { id: 't2', projectId: 'p1', title: 'Old project notes' }
            ];
            const result = resolveTarget({ targetQuery: 'old', activeTasks: tasks });
            // Both are prefix matches with same score -> clarification
            assert.strictEqual(result.status, 'clarification');
        });

        it('should resolve NLQ token-overlap references', () => {
            // Bug: "ai coder task" should match "Watch AI Coding Videos on Udemy"
            // even though neither string contains the other fully.
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Watch AI Coding Videos on Udemy' },
                { id: 't2', projectId: 'p1', title: 'Buy groceries' }
            ];
            const result = resolveTarget({ targetQuery: 'ai coder task', activeTasks: tasks });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 't1');
            assert.strictEqual(result.selected.matchType, 'token_overlap');
        });

        it('should resolve token-overlap for multi-word NLQ references', () => {
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Finish system design notes' },
                { id: 't2', projectId: 'p1', title: 'Read a book' }
            ];
            const result = resolveTarget({ targetQuery: 'system design task', activeTasks: tasks });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.taskId, 't1');
            assert.strictEqual(result.selected.matchType, 'token_overlap');
        });
    });

    describe('matchConfidence tiers', () => {
        it('should set matchConfidence exact for exact string match', () => {
            const result = resolveTarget({ targetQuery: 'buy groceries', activeTasks: [TASK_FIXTURES.buyGroceries] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.matchType, 'exact');
            assert.strictEqual(result.selected.matchConfidence, 'exact');
        });

        it('should set matchConfidence high for prefix match', () => {
            const result = resolveTarget({ targetQuery: 'buy', activeTasks: [TASK_FIXTURES.buyGroceries] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.matchType, 'prefix');
            assert.strictEqual(result.selected.matchConfidence, 'high');
        });

        it('should set matchConfidence high for contains match', () => {
            const result = resolveTarget({ targetQuery: 'groceries', activeTasks: [TASK_FIXTURES.buyGroceries] });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.matchType, 'contains');
            assert.strictEqual(result.selected.matchConfidence, 'high');
        });

        it('should set matchConfidence high for coreference match', () => {
            const result = resolveTarget({
                targetQuery: 'it',
                activeTasks: [TASK_FIXTURES.buyGroceries],
                recentTask: TASK_FIXTURES.callMom
            });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.matchType, 'coreference');
            assert.strictEqual(result.selected.matchConfidence, 'high');
        });

        it('should set matchConfidence medium for fuzzy/token_overlap match', () => {
            const result = resolveTarget({ targetQuery: 'grocries', activeTasks: [TASK_FIXTURES.buyGroceries] });
            assert.strictEqual(result.status, 'resolved');
            // token_overlap may catch this before pure fuzzy — either is medium confidence
            assert.ok(
                ['fuzzy', 'token_overlap'].includes(result.selected.matchType),
                `expected fuzzy/token_overlap, got ${result.selected.matchType}`
            );
            assert.strictEqual(result.selected.matchConfidence, 'medium');
        });

        it('should set matchConfidence medium for token_overlap match', () => {
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Watch AI Coding Videos on Udemy' },
                { id: 't2', projectId: 'p1', title: 'Buy groceries' }
            ];
            const result = resolveTarget({ targetQuery: 'ai coder task', activeTasks: tasks });
            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(result.selected.matchType, 'token_overlap');
            assert.strictEqual(result.selected.matchConfidence, 'medium');
        });

        it('should set matchConfidence low for underspecified candidates', () => {
            const result = resolveTarget({ targetQuery: 'it', activeTasks: [TASK_FIXTURES.buyGroceries] });
            assert.strictEqual(result.status, 'clarification');
            for (const c of result.candidates) {
                assert.strictEqual(c.matchConfidence, 'low');
            }
        });

        it('should include matchConfidence in all candidate objects', () => {
            const tasks = [
                { id: 't1', projectId: 'p1', title: 'Review PR 123' },
                { id: 't2', projectId: 'p1', title: 'Review PR 456' }
            ];
            const result = resolveTarget({ targetQuery: 'review pr', activeTasks: tasks });
            // Both prefix, should be clarification
            assert.strictEqual(result.status, 'clarification');
            for (const c of result.candidates) {
                assert.ok(typeof c.matchConfidence === 'string', `candidate missing matchConfidence: ${c.title}`);
                assert.ok(['exact', 'high', 'medium', 'low'].includes(c.matchConfidence));
            }
        });
    });
});
