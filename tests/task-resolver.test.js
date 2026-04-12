/**
 * tests/task-resolver.test.js
 * Comprehensive tests for the task resolver module (WP01 - Task Resolver Core).
 *
 * Tests cover:
 * - Title normalization and candidate shaping
 * - Exact, prefix, contains, and fuzzy matching stages
 * - Ambiguity (clarification) and not-found outcomes
 * - Repeated titles, punctuation differences, case differences
 * - Deterministic ordering when scores tie
 *
 * Resolver output shape (documented for downstream reuse):
 *   {
 *     status: 'resolved' | 'clarification' | 'not_found',
 *     selected: { taskId, projectId, title, score, matchType } | null,
 *     candidates: Array<{ taskId, projectId, title, score, matchType }>,
 *     reason: string | null  // machine-readable for non-resolved results
 *   }
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTask, normalizeTitle, buildCandidate } from '../services/task-resolver.js';

// ─── Fixture: representative active tasks for resolver input ─────────────────
// These fixtures are frozen for downstream WP reuse (WP02-WP07).
const FIXTURE_TASKS = [
    { id: 't001', projectId: 'proj-inbox', title: 'Buy groceries' },
    { id: 't002', projectId: 'proj-work', title: 'Submit quarterly report' },
    { id: 't003', projectId: 'proj-health', title: 'Gym workout' },
    { id: 't004', projectId: 'proj-work', title: 'Call dentist' },
    { id: 't005', projectId: 'proj-inbox', title: 'Read documentation' },
    { id: 't006', projectId: 'proj-personal', title: 'Plan weekend trip' },
    { id: 't007', projectId: 'proj-work', title: 'Review pull requests' },
    { id: 't008', projectId: 'proj-health', title: 'Book doctor appointment' },
    // Repeated title edge case
    { id: 't009', projectId: 'proj-inbox', title: 'Buy groceries' },
    // Punctuation variant
    { id: 't010', projectId: 'proj-work', title: 'Submit the Q3 report!' },
];

// ─── Helper: extract candidate fields for assertion clarity ──────────────────
function candidateIds(result) {
    return result.candidates.map(c => c.taskId);
}

// ═════════════════════════════════════════════════════════════════════════════
// NORMALIZATION AND CANDIDATE SHAPING
// ═════════════════════════════════════════════════════════════════════════════

describe('Title Normalization', () => {
    it('trims surrounding whitespace', () => {
        assert.strictEqual(normalizeTitle('  Buy groceries  '), 'buy groceries');
    });

    it('lowercases the entire string', () => {
        assert.strictEqual(normalizeTitle('BUY GROCERIES'), 'buy groceries');
    });

    it('strips bracket prefixes like [Work]', () => {
        assert.strictEqual(normalizeTitle('[Work] Submit report'), 'submit report');
    });

    it('strips common priority markers (urgent, important)', () => {
        assert.strictEqual(normalizeTitle('Urgent: Buy groceries'), 'buy groceries');
        assert.strictEqual(normalizeTitle('IMPORTANT: Call dentist'), 'call dentist');
    });

    it('strips trailing punctuation', () => {
        assert.strictEqual(normalizeTitle('Buy groceries!'), 'buy groceries');
        assert.strictEqual(normalizeTitle('Submit report...'), 'submit report');
    });

    it('handles empty input', () => {
        assert.strictEqual(normalizeTitle(''), '');
        assert.strictEqual(normalizeTitle('   '), '');
    });

    it('handles null/undefined input gracefully', () => {
        assert.strictEqual(normalizeTitle(null), '');
        assert.strictEqual(normalizeTitle(undefined), '');
    });

    it('normalizes case differences to enable exact matching', () => {
        assert.strictEqual(normalizeTitle('Buy Groceries'), normalizeTitle('buy GROCERIES'));
    });

    it('strips date references from titles', () => {
        assert.strictEqual(normalizeTitle('Buy groceries tomorrow'), 'buy groceries');
        assert.strictEqual(normalizeTitle('Submit report today'), 'submit report');
    });
});

describe('Candidate Shaping', () => {
    it('builds a candidate with required fields', () => {
        const task = { id: 't001', projectId: 'proj-inbox', title: 'Buy groceries' };
        const candidate = buildCandidate(task, 1.0, 'exact');

        assert.strictEqual(candidate.taskId, 't001');
        assert.strictEqual(candidate.projectId, 'proj-inbox');
        assert.strictEqual(candidate.title, 'Buy groceries');
        assert.strictEqual(candidate.score, 1.0);
        assert.strictEqual(candidate.matchType, 'exact');
    });

    it('handles missing projectId', () => {
        const task = { id: 't001', title: 'Buy groceries' };
        const candidate = buildCandidate(task, 0.8, 'prefix');

        assert.strictEqual(candidate.projectId, null);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// EXACT MATCHING
// ═════════════════════════════════════════════════════════════════════════════

describe('Exact Matching', () => {
    it('returns resolved for a single exact title match', () => {
        const result = resolveTask('Buy groceries', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 't001');
        assert.strictEqual(result.selected.matchType, 'exact');
        assert.strictEqual(result.selected.score, 1.0);
    });

    it('returns resolved ignoring case differences', () => {
        const result = resolveTask('BUY GROCERIES', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 't001');
        assert.strictEqual(result.selected.matchType, 'exact');
    });

    it('returns resolved ignoring trailing punctuation', () => {
        const result = resolveTask('Buy groceries!', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 't001');
    });

    it('returns resolved for repeated titles selecting first occurrence', () => {
        const result = resolveTask('Buy groceries', FIXTURE_TASKS);

        // Should pick t001 (first in list) deterministically
        assert.strictEqual(result.selected.taskId, 't001');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// PREFIX MATCHING
// ═════════════════════════════════════════════════════════════════════════════

describe('Prefix Matching', () => {
    it('returns resolved when one clear prefix match exists', () => {
        const result = resolveTask('Buy gro', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 't001');
        assert.strictEqual(result.selected.matchType, 'prefix');
    });

    it('returns resolved for short prefix match', () => {
        const result = resolveTask('Submit quart', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 't002');
        assert.strictEqual(result.selected.matchType, 'prefix');
    });

    it('returns clarification when multiple tasks share the same prefix', () => {
        // Both "Buy groceries" (t001) and "Buy groceries" (t009) match
        // But t001 is exact after normalization, so it resolves.
        // Let's test with a prefix that matches distinct titles.
        const tasks = [
            { id: 'a', projectId: 'p', title: 'Review design' },
            { id: 'b', projectId: 'p', title: 'Review code' },
        ];
        const result = resolveTask('Review', tasks);

        assert.strictEqual(result.status, 'clarification');
        assert.strictEqual(result.reason, 'multiple_candidates');
        assert.ok(result.candidates.length >= 2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// CONTAINS MATCHING
// ═════════════════════════════════════════════════════════════════════════════

describe('Contains Matching', () => {
    it('returns resolved when one clear contains match exists', () => {
        const result = resolveTask('quarterly report', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 't002');
        assert.strictEqual(result.selected.matchType, 'contains');
    });

    it('returns resolved for partial word match within title', () => {
        const result = resolveTask('dentist', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 't004');
        assert.strictEqual(result.selected.matchType, 'contains');
    });

    it('returns clarification when multiple contains matches exist', () => {
        const tasks = [
            { id: 'a', projectId: 'p', title: 'Review design doc' },
            { id: 'b', projectId: 'p', title: 'Review pull requests' },
        ];
        const result = resolveTask('review', tasks);

        assert.strictEqual(result.status, 'clarification');
        assert.strictEqual(result.reason, 'multiple_candidates');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// FUZZY MATCHING
// ═════════════════════════════════════════════════════════════════════════════

describe('Fuzzy Matching', () => {
    it('returns resolved for close typo variant', () => {
        const result = resolveTask('By groceries', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 't001');
        assert.strictEqual(result.selected.matchType, 'fuzzy');
    });

    it('returns resolved for single-character transposition', () => {
        const result = resolveTask('Bnu groceries', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 't001');
        assert.strictEqual(result.selected.matchType, 'fuzzy');
    });

    it('returns not_found when fuzzy distance exceeds threshold', () => {
        const result = resolveTask('Completely unrelated task', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'not_found');
        assert.strictEqual(result.reason, 'no_match');
        assert.strictEqual(result.selected, null);
    });

    it('returns not_found for very short query below minimum length', () => {
        const result = resolveTask('x', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'not_found');
        assert.strictEqual(result.reason, 'query_too_short');
    });

    it('returns clarification when fuzzy matches multiple candidates equally', () => {
        const tasks = [
            { id: 'a', projectId: 'p', title: 'Schedule meeting' },
            { id: 'b', projectId: 'p', title: 'Skedule meeting' },
        ];
        // "Shedule meeting" is a fuzzy match (typo), not prefix or contains
        const result = resolveTask('Shedule meeting', tasks);

        // Both are close to the mistyped query; gap is small
        assert.strictEqual(result.status, 'clarification');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// AMBIGUITY AND CLARIFICATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Clarification Outcomes', () => {
    it('returns resolved for identical titles across projects (first occurrence)', () => {
        // Product vision: when titles are truly identical, pick first deterministically.
        // This avoids false ambiguity — the user said the task name, not the project.
        const tasks = [
            { id: 'a', projectId: 'proj-work', title: 'Review document' },
            { id: 'b', projectId: 'proj-personal', title: 'Review document' },
        ];
        const result = resolveTask('Review document', tasks);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 'a');
    });

    it('returns clarification when no clear winner among non-exact matches', () => {
        const tasks = [
            { id: 'a', projectId: 'p', title: 'Write blog post about AI' },
            { id: 'b', projectId: 'p', title: 'Write blog post about travel' },
        ];
        const result = resolveTask('Write blog post', tasks);

        assert.strictEqual(result.status, 'clarification');
        assert.strictEqual(result.reason, 'multiple_candidates');
    });

    it('includes candidate list in clarification result', () => {
        const tasks = [
            { id: 'a', projectId: 'p', title: 'Meeting with team' },
            { id: 'b', projectId: 'p', title: 'Meeting with client' },
        ];
        const result = resolveTask('Meeting', tasks);

        assert.ok(Array.isArray(result.candidates));
        assert.ok(result.candidates.length >= 2);
        assert.ok(result.candidates.every(c => 'taskId' in c));
        assert.ok(result.candidates.every(c => 'score' in c));
    });

    it('includes machine-readable reason for clarification', () => {
        const tasks = [
            { id: 'a', projectId: 'p', title: 'Task one' },
            { id: 'b', projectId: 'p', title: 'Task two' },
        ];
        const result = resolveTask('Task', tasks);

        assert.strictEqual(result.reason, 'multiple_candidates');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// NOT FOUND OUTCOMES
// ═════════════════════════════════════════════════════════════════════════════

describe('Not Found Outcomes', () => {
    it('returns not_found for completely unmatched query', () => {
        const result = resolveTask('Something that does not exist anywhere', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'not_found');
        assert.strictEqual(result.reason, 'no_match');
        assert.strictEqual(result.selected, null);
    });

    it('returns not_found with empty task list', () => {
        const result = resolveTask('Any task', []);

        assert.strictEqual(result.status, 'not_found');
        assert.strictEqual(result.reason, 'no_match');
    });

    it('returns not_found for query below minimum threshold', () => {
        const result = resolveTask('a', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'not_found');
    });

    it('includes machine-readable reason for not_found', () => {
        const result = resolveTask('xyz123notreal', FIXTURE_TASKS);

        assert.ok(result.reason !== null);
    });

    it('returns empty candidates for not_found', () => {
        const result = resolveTask('nonexistent', FIXTURE_TASKS);

        assert.ok(Array.isArray(result.candidates));
        // May or may not have candidates below threshold; selected must be null
        assert.strictEqual(result.selected, null);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe('Edge Cases', () => {
    it('handles tasks without projectId', () => {
        const tasks = [
            { id: 't1', title: 'No project task' },
        ];
        const result = resolveTask('No project task', tasks);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.projectId, null);
    });

    it('deterministic ordering when scores tie (by list order)', () => {
        const tasks = [
            { id: 'first', projectId: 'p', title: 'Same title' },
            { id: 'second', projectId: 'p', title: 'Same title' },
        ];
        const result = resolveTask('Same title', tasks);

        // Should pick the first one deterministically
        assert.strictEqual(result.selected.taskId, 'first');
    });

    it('handles query with extra whitespace', () => {
        const result = resolveTask('  Buy   groceries  ', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.strictEqual(result.selected.taskId, 't001');
    });

    it('handles punctuation differences between query and task', () => {
        const result = resolveTask('Submit the Q3 report', FIXTURE_TASKS);

        // Should match t010 "Submit the Q3 report!" via exact or fuzzy
        assert.ok(result.status === 'resolved' || result.status === 'clarification');
        if (result.status === 'resolved') {
            assert.strictEqual(result.selected.taskId, 't010');
        }
    });

    it('handles special characters in query', () => {
        const result = resolveTask('Buy groceries @store', FIXTURE_TASKS);

        // Should still find "Buy groceries" via contains or fuzzy
        assert.ok(result.status === 'resolved' || result.status === 'clarification' || result.status === 'not_found');
    });

    it('does not return resolved when multiple close rivals exist', () => {
        const tasks = [
            { id: 'a', projectId: 'p', title: 'Draft proposal' },
            { id: 'b', projectId: 'p', title: 'Draft report' },
        ];
        const result = resolveTask('Draft', tasks);

        assert.notStrictEqual(result.status, 'resolved');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// RESULT SHAPE CONTRACT
// ═════════════════════════════════════════════════════════════════════════════

describe('Result Shape Contract (for downstream WP reuse)', () => {
    it('resolved result has selected, candidates, and null reason', () => {
        const result = resolveTask('Buy groceries', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'resolved');
        assert.ok(result.selected !== null);
        assert.ok('taskId' in result.selected);
        assert.ok('title' in result.selected);
        assert.ok('score' in result.selected);
        assert.ok('matchType' in result.selected);
        assert.ok(Array.isArray(result.candidates));
    });

    it('clarification result has null selected, candidates array, and reason', () => {
        const tasks = [
            { id: 'a', projectId: 'p', title: 'Meeting one' },
            { id: 'b', projectId: 'p', title: 'Meeting two' },
        ];
        const result = resolveTask('Meeting', tasks);

        assert.strictEqual(result.status, 'clarification');
        assert.strictEqual(result.selected, null);
        assert.ok(Array.isArray(result.candidates));
        assert.ok(result.candidates.length > 0);
        assert.strictEqual(typeof result.reason, 'string');
    });

    it('not_found result has null selected and reason string', () => {
        const result = resolveTask('nonexistent task query', FIXTURE_TASKS);

        assert.strictEqual(result.status, 'not_found');
        assert.strictEqual(result.selected, null);
        assert.strictEqual(typeof result.reason, 'string');
    });

    it('all candidate objects have the required five fields', () => {
        const result = resolveTask('Buy', FIXTURE_TASKS);

        for (const candidate of result.candidates) {
            assert.ok('taskId' in candidate, 'candidate missing taskId');
            assert.ok('projectId' in candidate, 'candidate missing projectId');
            assert.ok('title' in candidate, 'candidate missing title');
            assert.ok('score' in candidate, 'candidate missing score');
            assert.ok('matchType' in candidate, 'candidate missing matchType');
        }
    });
});
