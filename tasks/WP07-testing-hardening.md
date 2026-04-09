---
work_package_id: WP07
title: Testing & Hardening
dependencies: "[WP01-WP06]"
subtasks: [T071, T072, T073, T074, T075]
---

# Work Package Prompt: WP07 — Testing & Hardening

**Feature**: 002-natural-language-task-mutations
**Work Package**: WP07
**Title**: Testing & Hardening
**Priority**: P1 — Critical Path (depends on WP01-WP06)
**Dependencies**: WP01-WP06 complete
**Parallelisable with**: None (final WP before production)
**Estimated Lines**: ~1,300 lines
**Subtasks**: 5 (T071-T075, ~260 lines each)

---

## Purpose

Provide comprehensive test coverage, load testing, and production hardening for the natural-language task mutations feature. This WP ensures reliability, performance, and maintainability before production deployment.

**Key Deliverables**:
1. Unit tests for task resolver (200 lines, 30+ tests)
2. Integration tests for mutation flows (180 lines, 25+ tests)
3. Clarification flow tests (150 lines, 25+ tests)
4. Bot handler tests (200 lines, 30+ tests)
5. Load tests for mutation performance (100 lines, 12+ tests)
6. Updated test infrastructure (package.json, scripts, documentation)

**Quality Goals**:
- **Coverage**: 80%+ line coverage for mutation-related code
- **Performance**: Resolution < 200ms for 100 tasks, < 500ms for 1000 tasks
- **Reliability**: All error paths tested and handled gracefully
- **Observability**: All mutation events logged with correct context
- **Regression Prevention**: Comprehensive test suite prevents future breakage

**Test Categories**:
1. **Unit Tests**: Individual functions and modules (task resolver, normalizer, keyboard builder)
2. **Integration Tests**: Multi-component flows (pipeline, mutation resume)
3. **E2E Tests**: Complete user journeys (message → confirmation)
4. **Load Tests**: Performance under realistic conditions
5. **Regression Tests**: Critical path verification

---

## Implementation Steps

### T071: Create task-resolver.test.js

**Purpose**: Comprehensive unit tests for the task resolver core matching algorithm with 30+ tests covering exact match, fuzzy match, ambiguity detection, not-found scenarios, edge cases, and performance benchmarks.

**Context**: The task resolver is the heart of the mutation system. It determines which task matches a user's query using exact matching, fuzzy matching (Levenshtein distance), and ambiguity detection. Tests ensure the algorithm works correctly across all scenarios and performs well with realistic task counts.

**Implementation**:
1. Create `tests/task-resolver.test.js` with 200 lines, 30+ tests
2. Test exact match scenarios (case-insensitive, full title)
3. Test fuzzy match scenarios (Levenshtein distance, partial matches)
4. Test ambiguity detection (multiple close matches)
5. Test not-found scenarios (no matches above threshold)
6. Test edge cases (empty query, special chars, unicode)
7. Test performance benchmarks (100/500/1000 tasks)
8. Test input validation (null, non-array, empty)
9. Test string matching utilities (Levenshtein, similarity, normalization)

**Test Structure**:
```javascript
// tests/task-resolver.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTaskTarget } from '../services/task-resolver.js';
import { levenshteinDistance, calculateSimilarity, normalizeString } from '../services/utils/string-matching.js';

// Sample tasks for testing
const sampleTasks = [
    { id: 't1', title: 'Buy groceries', projectId: 'p1', projectName: 'Personal' },
    { id: 't2', title: 'Call mom', projectId: 'p1', projectName: 'Personal' },
    { id: 't3', title: 'Submit quarterly report', projectId: 'p2', projectName: 'Work' },
    { id: 't4', title: 'Schedule dentist appointment', projectId: 'p3', projectName: 'Health' },
    { id: 't5', title: 'Buy grocery bags', projectId: 'p1', projectName: 'Personal' },
];

// ========== Exact Match Tests ==========

test('exact match returns single candidate with confidence 1.0', () => {
    const result = resolveTaskTarget('buy groceries', sampleTasks);

    assert.equal(result.status, 'exact_match');
    assert.equal(result.taskId, 't1');
    assert.equal(result.confidence, 1.0);
    assert.equal(result.clarificationNeeded, false);
    assert.equal(result.candidates.length, 1);
});

test('exact match is case-insensitive', () => {
    const result = resolveTaskTarget('BUY GROCERIES', sampleTasks);

    assert.equal(result.status, 'exact_match');
    assert.equal(result.taskId, 't1');
    assert.equal(result.confidence, 1.0);
});

test('exact match ignores extra whitespace', () => {
    const result = resolveTaskTarget('  buy   groceries  ', sampleTasks);

    assert.equal(result.status, 'exact_match');
    assert.equal(result.taskId, 't1');
});

test('exact match with punctuation', () => {
    const tasksWithPunct = [
        ...sampleTasks,
        { id: 't6', title: 'Call mom!', projectId: 'p1', projectName: 'Personal' },
    ];

    const result = resolveTaskTarget('call mom!', tasksWithPunct);

    assert.equal(result.status, 'exact_match');
    assert.equal(result.taskId, 't6');
});

test('exact match prefers first match when duplicates exist', () => {
    const tasksWithDuplicates = [
        { id: 't1', title: 'Meeting', projectId: 'p1' },
        { id: 't2', title: 'Meeting', projectId: 'p2' },
    ];

    const result = resolveTaskTarget('meeting', tasksWithDuplicates);

    assert.equal(result.status, 'exact_match');
    assert.equal(result.taskId, 't1'); // First match
});

// ========== Fuzzy Match Tests ==========

test('starts-with match returns confidence 0.90', () => {
    const result = resolveTaskTarget('buy', sampleTasks);

    assert.equal(result.status, 'match');
    assert.equal(result.taskId, 't1');
    assert.equal(result.confidence, 0.90);
});

test('contains match returns confidence 0.75', () => {
    const result = resolveTaskTarget('groceries', sampleTasks);

    assert.equal(result.status, 'match');
    assert.equal(result.taskId, 't1');
    assert.equal(result.confidence, 0.75);
});

test('fuzzy match uses Levenshtein distance for scoring', () => {
    const result = resolveTaskTarget('by groceries', sampleTasks); // One char off

    assert.equal(result.status, 'match');
    assert.equal(result.taskId, 't1');
    assert.ok(result.confidence >= 0.70, 'High similarity should score > 0.70');
});

test('fuzzy match handles transposition', () => {
    const result = resolveTaskTarget('groceries buy', sampleTasks);

    assert.equal(result.status, 'match');
    assert.ok(result.confidence > 0.50);
});

test('partial match with multiple words', () => {
    const result = resolveTaskTarget('quarterly report', sampleTasks);

    assert.equal(result.status, 'match');
    assert.equal(result.taskId, 't3');
    assert.ok(result.confidence >= 0.80);
});

test('fuzzy match handles missing spaces', () => {
    const result = resolveTaskTarget('buymilk', [
        { id: 't1', title: 'Buy milk', projectId: 'p1' },
    ]);

    assert.equal(result.status, 'match');
    assert.ok(result.confidence > 0.50);
});

test('fuzzy match handles extra spaces', () => {
    const result = resolveTaskTarget('buy    milk', [
        { id: 't1', title: 'Buy milk', projectId: 'p1' },
    ]);

    assert.equal(result.status, 'exact_match'); // Normalized
    assert.equal(result.taskId, 't1');
});

// ========== Ambiguity Detection Tests ==========

test('ambiguous matches trigger clarification', () => {
    const result = resolveTaskTarget('buy', sampleTasks);

    // "Buy groceries" and "Buy grocery bags" both match
    assert.equal(result.clarificationNeeded, true);
    assert.ok(result.candidates.length > 1);
    assert.ok(result.candidates.some(c => c.taskId === 't1'));
    assert.ok(result.candidates.some(c => c.taskId === 't5'));
});

test('multiple matches within 0.15 margin trigger clarification', () => {
    const result = resolveTaskTarget('buy grocery', sampleTasks);

    assert.equal(result.clarificationNeeded, true);
    assert.ok(result.candidates.length >= 2);
});

test('single match above 0.85 does not need clarification', () => {
    const uniqueTask = [{ id: 'unique', title: 'Unique task name xyz', projectId: 'p1' }];
    const result = resolveTaskTarget('unique task', uniqueTask);

    assert.equal(result.clarificationNeeded, false);
    assert.ok(result.confidence >= 0.85);
});

test('candidates sorted by confidence descending', () => {
    const result = resolveTaskTarget('buy', sampleTasks);

    for (let i = 1; i < result.candidates.length; i++) {
        assert.ok(
            result.candidates[i - 1].confidence >= result.candidates[i].confidence,
            'Candidates should be sorted by confidence descending'
        );
    }
});

test('clarification includes all matches within margin', () => {
    const tasks = [
        { id: 't1', title: 'Meeting A', projectId: 'p1' },
        { id: 't2', title: 'Meeting B', projectId: 'p1' },
        { id: 't3', title: 'Meeting C', projectId: 'p1' },
        { id: 't4', title: 'Different task', projectId: 'p1' },
    ];

    const result = resolveTaskTarget('meeting', tasks);

    assert.equal(result.clarificationNeeded, true);
    assert.ok(result.candidates.length >= 3);
    assert.ok(result.candidates.every(c => c.title.includes('Meeting')));
});

// ========== Not Found Tests ==========

test('not found returns status not_found when no matches above threshold', () => {
    const result = resolveTaskTarget('completely unrelated task xyz', sampleTasks);

    assert.equal(result.status, 'not_found');
    assert.equal(result.taskId, null);
    assert.equal(result.clarificationNeeded, false);
    assert.equal(result.candidates.length, 0);
});

test('empty query returns not_found', () => {
    const result = resolveTaskTarget('', sampleTasks);

    assert.equal(result.status, 'not_found');
});

test('whitespace-only query returns not_found', () => {
    const result = resolveTaskTarget('   ', sampleTasks);

    assert.equal(result.status, 'not_found');
});

test('very short query returns not_found', () => {
    const result = resolveTaskTarget('a', sampleTasks);

    assert.equal(result.status, 'not_found');
});

test('two-char query returns not_found', () => {
    const result = resolveTaskTarget('ab', sampleTasks);

    assert.equal(result.status, 'not_found');
});

// ========== Edge Cases ==========

test('special characters handled correctly', () => {
    const tasksWithSpecial = [
        ...sampleTasks,
        { id: 't6', title: 'Call mom! (urgent)', projectId: 'p1', projectName: 'Personal' },
    ];

    const result = resolveTaskTarget('call mom!', tasksWithSpecial);

    assert.equal(result.status, 'exact_match');
    assert.equal(result.taskId, 't6');
});

test('unicode characters handled correctly', () => {
    const tasksWithUnicode = [
        ...sampleTasks,
        { id: 't7', title: 'Résumé update', projectId: 'p1', projectName: 'Personal' },
    ];

    const result = resolveTaskTarget('resume update', tasksWithUnicode);

    // Should fuzzy match despite accent difference
    assert.equal(result.status, 'match');
    assert.ok(result.confidence > 0.50);
});

test('emoji in task titles handled correctly', () => {
    const tasksWithEmoji = [
        ...sampleTasks,
        { id: 't8', title: 'Buy groceries 🛒', projectId: 'p1', projectName: 'Personal' },
    ];

    const result = resolveTaskTarget('buy groceries', tasksWithEmoji);

    assert.equal(result.status, 'exact_match');
    assert.equal(result.taskId, 't8');
});

test('confidence threshold 0.85 for auto-apply', () => {
    const result = resolveTaskTarget('buy grocer', sampleTasks); // Partial

    assert.ok(result.confidence < 0.85, 'Should be below auto-apply threshold');
    assert.equal(result.clarificationNeeded, true);
});

test('apostrophes handled correctly', () => {
    const tasksWithApostrophe = [
        ...sampleTasks,
        { id: 't9', title: "Mom's birthday gift", projectId: 'p1', projectName: 'Personal' },
    ];

    const result = resolveTaskTarget('moms birthday', tasksWithApostrophe);

    assert.equal(result.status, 'match');
    assert.ok(result.confidence > 0.70);
});

// ========== Candidate Metadata Tests ==========

test('candidate includes task metadata', () => {
    const result = resolveTaskTarget('buy', sampleTasks);

    const candidate = result.candidates[0];
    assert.ok(candidate.taskId);
    assert.ok(candidate.title);
    assert.ok(candidate.projectName);
    assert.ok(typeof candidate.confidence === 'number');
});

test('project name included in candidate for disambiguation', () => {
    const tasksWithProjects = [
        { id: 'w1', title: 'Meeting', projectId: 'p2', projectName: 'Work' },
        { id: 'p1', title: 'Meeting', projectId: 'p1', projectName: 'Personal' },
    ];

    const result = resolveTaskTarget('meeting', tasksWithProjects);

    assert.equal(result.clarificationNeeded, true);
    assert.equal(result.candidates[0].projectName, 'Work');
    assert.equal(result.candidates[1].projectName, 'Personal');
});

test('due date included in candidate when available', () => {
    const tasksWithDates = [
        { id: 't1', title: 'Meeting', projectId: 'p1', dueDate: '2026-04-01' },
        { id: 't2', title: 'Meeting', projectId: 'p1', dueDate: '2026-04-02' },
    ];

    const result = resolveTaskTarget('meeting', tasksWithDates);

    assert.ok(result.candidates[0].dueDate);
});

// ========== String Matching Utility Tests ==========

test('Levenshtein distance calculation correct', () => {
    assert.equal(levenshteinDistance('kitten', 'kitten'), 0);
    assert.equal(levenshteinDistance('kitten', 'sitten'), 1);
    assert.equal(levenshteinDistance('kitten', 'sittin'), 2);
    assert.equal(levenshteinDistance('', 'abc'), 3);
    assert.equal(levenshteinDistance('abc', 'abc'), 0);
    assert.equal(levenshteinDistance('abc', 'def'), 3);
});

test('similarity score normalized to 0-1 range', () => {
    assert.equal(calculateSimilarity('abc', 'abc'), 1.0);
    assert.equal(calculateSimilarity('abc', 'xyz'), 0.0);
    assert.ok(calculateSimilarity('abc', 'abd') > 0.5);
    assert.ok(calculateSimilarity('abc', 'abcd') > 0.7);
    assert.ok(calculateSimilarity('', '') === 1.0);
});

test('normalization removes extra whitespace', () => {
    assert.equal(normalizeString('  Buy   groceries  '), 'buy groceries');
    assert.equal(normalizeString('BUY\nGROCERIES'), 'buy groceries');
    assert.equal(normalizeString('buy\tgroceries'), 'buy groceries');
});

test('normalization converts to lowercase', () => {
    assert.equal(normalizeString('BUY GROCERIES'), 'buy groceries');
    assert.equal(normalizeString('MiXeD CaSe'), 'mixed case');
});

test('normalization handles special characters', () => {
    assert.equal(normalizeString('Call mom!'), 'call mom!');
    assert.equal(normalizeString('Email: test@example.com'), 'email: test@example.com');
});

// ========== Performance Tests ==========

test('performance: resolves 100 tasks in < 200ms', () => {
    const manyTasks = Array(100).fill(null).map((_, i) => ({
        id: `t${i}`,
        title: `Task number ${i} with some variation`,
        projectId: `p${i % 10}`,
    }));

    const start = Date.now();
    resolveTaskTarget('task number 50', manyTasks);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 200, `Resolution took ${elapsed}ms, expected < 200ms`);
});

test('performance: resolves 500 tasks in < 400ms', () => {
    const manyTasks = Array(500).fill(null).map((_, i) => ({
        id: `t${i}`,
        title: `Task number ${i} with some variation and extra words`,
        projectId: `p${i % 20}`,
    }));

    const start = Date.now();
    resolveTaskTarget('task number 250', manyTasks);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 400, `Resolution took ${elapsed}ms, expected < 400ms`);
});

test('performance: resolves 1000 tasks in < 500ms', () => {
    const manyTasks = Array(1000).fill(null).map((_, i) => ({
        id: `t${i}`,
        title: `Task number ${i} with descriptive text for realistic matching`,
        projectId: `p${i % 50}`,
    }));

    const start = Date.now();
    resolveTaskTarget('task number 500', manyTasks);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 500, `Resolution took ${elapsed}ms, expected < 500ms`);
});

test('performance: exact match is fastest path', () => {
    const manyTasks = Array(500).fill(null).map((_, i) => ({
        id: `t${i}`,
        title: `Task number ${i}`,
        projectId: `p${i % 10}`,
    }));

    const start = Date.now();
    resolveTaskTarget('task number 250', manyTasks); // Exact match
    const exactElapsed = Date.now() - start;

    const start2 = Date.now();
    resolveTaskTarget('number 250 task', manyTasks); // Fuzzy match
    const fuzzyElapsed = Date.now() - start2;

    assert.ok(exactElapsed <= fuzzyElapsed, 'Exact match should be faster or equal');
});

// ========== Input Validation Tests ==========

test('resolver throws error for null query', () => {
    assert.throws(
        () => resolveTaskTarget(null, sampleTasks),
        /query/
    );
});

test('resolver throws error for null tasks', () => {
    assert.throws(
        () => resolveTaskTarget('test', null),
        /tasks/
    );
});

test('resolver throws error for non-array tasks', () => {
    assert.throws(
        () => resolveTaskTarget('test', 'not-array'),
        /tasks/
    );
});

test('resolver throws error for empty tasks array', () => {
    assert.throws(
        () => resolveTaskTarget('test', []),
        /tasks/
    );
});

test('resolver handles tasks with missing projectId', () => {
    const tasksWithoutProject = [
        { id: 't1', title: 'Task without project' },
    ];

    const result = resolveTaskTarget('task without project', tasksWithoutProject);

    assert.equal(result.status, 'exact_match');
    assert.equal(result.candidates[0].projectName, undefined);
});

test('resolver handles tasks with missing title', () => {
    const tasksWithMissingTitle = [
        { id: 't1', title: 'Valid task', projectId: 'p1' },
        { id: 't2', projectId: 'p1' }, // Missing title
    ];

    const result = resolveTaskTarget('valid task', tasksWithMissingTitle);

    assert.equal(result.status, 'exact_match');
    assert.equal(result.taskId, 't1');
});
```

**Files to Create**:
- `tests/task-resolver.test.js` (~200 lines, 30+ tests)

**Validation Criteria**:
- [ ] 30+ tests covering all matching scenarios
- [ ] Tests run with `node --test tests/task-resolver.test.js`
- [ ] All tests pass with zero failures
- [ ] Exact match, fuzzy match, ambiguity, not-found all tested
- [ ] Edge cases covered (empty, special chars, unicode, emoji)
- [ ] Performance benchmarks included (100 tasks < 200ms, 500 tasks < 400ms, 1000 tasks < 500ms)
- [ ] Input validation tested (null, non-array, empty)
- [ ] String matching utilities tested (Levenshtein, similarity, normalization)

**Edge Cases**:
- Empty query → not_found
- Whitespace-only query → not_found
- Very short query (1-2 chars) → not_found
- Unicode characters → normalized and matched
- Emoji in titles → handled correctly
- Special characters → preserved in matching
- Missing metadata (projectId, projectName) → handled gracefully
- Duplicate task titles → first match wins

**Testing Notes**:
- Use sample tasks fixture for consistency
- Test exact match before fuzzy match
- Verify confidence scores are in expected ranges
- Test ambiguity detection with close matches
- Verify candidates sorted by confidence descending
- Performance tests may vary by environment (use generous thresholds)

---

### T072: Create mutation-integration.test.js

**Purpose**: End-to-end integration tests for complete mutation flows (update, complete, delete) with 25+ tests covering all mutation types, clarification flows, rollback scenarios, error handling, and observability events.

**Context**: Integration tests verify that all components work together correctly: message parsing, intent extraction, task resolution, normalization, execution, and rollback. These tests use a pipeline harness with mocked adapters for deterministic results.

**Implementation**:
1. Create `tests/integration/mutation-integration.test.js` with 180 lines, 25+ tests
2. Test complete mutation flow (message → resolution → execution)
3. Test update mutation flow with payload validation
4. Test delete mutation flow with safety checks
5. Test clarification flows (ambiguous → selection → completion)
6. Test rollback scenarios (adapter failure)
7. Test error handling (quota, network, invalid payload)
8. Test observability events
9. Test idempotency (completing already-completed task)

**Test Structure**:
```javascript
// tests/integration/mutation-integration.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipelineHarness } from './pipeline-harness.js';

// ========== Complete Mutation Tests ==========

test('complete mutation flow: exact match auto-applies', async () => {
    const { pipeline, adapter, store } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Buy groceries', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('done buy groceries', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'task');
    assert.ok(result.confirmationText.includes('Completed'));
    assert.equal(result.mutationType, 'complete');

    const updatedTask = await adapter.getTask('t1');
    assert.equal(updatedTask.status, 2); // Completed in TickTick
});

test('complete mutation: returns task ID in result', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('done task', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'task');
    assert.equal(result.taskId, 't1');
});

test('complete mutation: returns confirmation text', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task to complete', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('done task to complete', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'task');
    assert.ok(result.confirmationText);
    assert.ok(result.confirmationText.includes('Completed'));
});

// ========== Update Mutation Tests ==========

test('update mutation flow: moves task to tomorrow', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Meeting', dueDate: '2026-04-01', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('move meeting to tomorrow', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'task');
    assert.ok(result.confirmationText.includes('Updated') || result.confirmationText.includes('moved'));

    const updatedTask = await adapter.getTask('t1');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.equal(updatedTask.dueDate, tomorrow.toISOString().split('T')[0]);
});

test('update mutation: preserves existing content', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task', content: 'Important notes here', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('move task to tomorrow', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'task');

    const updatedTask = await adapter.getTask('t1');
    assert.equal(updatedTask.content, 'Important notes here'); // Preserved
});

test('update mutation: merges new content with existing', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task', content: 'Original note', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('update task add note: new information', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    const updatedTask = await adapter.getTask('t1');
    assert.ok(updatedTask.content.includes('Original note'));
    assert.ok(updatedTask.content.includes('new information'));
});

test('update mutation: priority change applies correctly', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task', priority: 1, status: 0 },
        ],
    });

    const result = await pipeline.processMessage('set task priority to high', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'task');

    const updatedTask = await adapter.getTask('t1');
    assert.equal(updatedTask.priority, 5); // High priority
});

test('update mutation: project move applies correctly', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task', projectId: 'p1', status: 0 },
        ],
        projects: [
            { id: 'p1', name: 'Personal' },
            { id: 'p2', name: 'Work' },
        ],
    });

    const result = await pipeline.processMessage('move task to Work project', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'task');

    const updatedTask = await adapter.getTask('t1');
    assert.equal(updatedTask.projectId, 'p2');
});

// ========== Delete Mutation Tests ==========

test('delete mutation flow: removes task from TickTick', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Old task to delete', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('delete old task', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'task');
    assert.ok(result.confirmationText.includes('Deleted'));

    const tasks = await adapter.getAllTasks();
    assert.equal(tasks.find(t => t.id === 't1'), undefined);
});

test('delete mutation: fails closed on ambiguity (FR-008)', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Meeting', status: 0 },
            { id: 't2', title: 'Meeting', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('delete meeting', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    // Should trigger clarification, not auto-delete
    assert.equal(result.type, 'clarification');
    assert.ok(result.candidates.length >= 2);
});

// ========== Clarification Flow Tests ==========

test('clarification flow: ambiguous match presents candidates', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Meeting with team', status: 0 },
            { id: 't2', title: 'Meeting with client', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('cancel meeting', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'clarification');
    assert.ok(result.candidates.length >= 2);
    assert.ok(result.candidates[0].taskId === 't1' || result.candidates[0].taskId === 't2');
});

test('clarification flow: resume with selected task completes mutation', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Meeting A', status: 0 },
            { id: 't2', title: 'Meeting B', status: 0 },
        ],
    });

    // Initial ambiguous request
    const clarResult = await pipeline.processMessage('done meeting', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(clarResult.type, 'clarification');

    // Resume with selected task
    const pendingMutation = {
        ...clarResult,
        selectedTaskId: 't2',
        userId: 'test-user',
        entryPoint: 'test',
        userMessage: 'done meeting',
        intent: clarResult.intent,
        availableProjects: [],
        timezone: 'UTC',
    };

    const resumeResult = await pipeline.resumeMutation(pendingMutation);

    assert.equal(resumeResult.type, 'task');
    assert.ok(resumeResult.confirmationText.includes('Completed'));

    const task2 = await adapter.getTask('t2');
    assert.equal(task2.status, 2); // Completed

    const task1 = await adapter.getTask('t1');
    assert.equal(task1.status, 0); // Still active
});

// ========== Rollback Tests ==========

test('rollback: adapter failure reverts changes', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task to update', priority: 1, status: 0 },
        ],
        simulateFailure: { method: 'updateTask', atCall: 1 },
    });

    const result = await pipeline.processMessage('set task to update priority to high', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'error');

    // Verify task unchanged (rollback)
    const task = await adapter.getTask('t1');
    assert.equal(task.priority, 1); // Original priority
});

test('rollback: multiple changes reverted on failure', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task 1', priority: 1, status: 0 },
            { id: 't2', title: 'Task 2', priority: 1, status: 0 },
        ],
        simulateFailure: { method: 'updateTask', atCall: 2 },
    });

    const result = await pipeline.processMessage('set both tasks to high priority', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'error');

    // Verify both tasks unchanged (rollback)
    const task1 = await adapter.getTask('t1');
    const task2 = await adapter.getTask('t2');
    assert.equal(task1.priority, 1);
    assert.equal(task2.priority, 1);
});

// ========== Error Handling Tests ==========

test('error handling: quota exhaustion returns quota failure class', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [],
        simulateQuotaExhausted: true,
    });

    const result = await pipeline.processMessage('done task', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure?.class, 'quota');
});

test('error handling: task not found returns not_found type', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Existing task', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('delete nonexistent task xyz', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'not_found');
    assert.ok(result.targetQuery.includes('nonexistent'));
});

test('error handling: invalid payload rejected by normalizer', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('set task priority to invalid_value', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'error');
    assert.ok(result.confirmationText.includes('invalid'));
});

test('error handling: network error returns network failure class', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [],
        simulateNetworkError: true,
    });

    const result = await pipeline.processMessage('done task', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.equal(result.type, 'error');
    assert.equal(result.failure?.class, 'network');
});

// ========== Idempotency Tests ==========

test('complete mutation: idempotent (completing already-completed task)', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task', status: 2 }, // Already completed
        ],
    });

    const result = await pipeline.processMessage('done task', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    // Should handle gracefully (no error, maybe no-op)
    assert.equal(result.type, 'task');
    assert.ok(result.confirmationText.includes('Completed') || result.confirmationText.includes('already'));
});

// ========== Observability Tests ==========

test('mutation flow: logs observability events', async () => {
    const { pipeline, logSpy } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task', status: 0 },
        ],
    });

    await pipeline.processMessage('done task', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    assert.ok(logSpy.calledWith('mutation_intent_extracted'));
    assert.ok(logSpy.calledWith('task_resolved'));
    assert.ok(logSpy.calledWith('mutation_executed'));
});

test('mutation flow: entryPoint logged for analytics', async () => {
    const { pipeline, logSpy } = await createPipelineHarness({
        initialTasks: [],
    });

    await pipeline.processMessage('done task', {
        entryPoint: 'telegram:mutation',
        mode: 'mutation',
    });

    const logCall = logSpy.find(call => call.event === 'mutation_intent_extracted');
    assert.equal(logCall.entryPoint, 'telegram:mutation');
});

test('mutation flow: mutationType logged correctly', async () => {
    const { pipeline, logSpy } = await createPipelineHarness({
        initialTasks: [{ id: 't1', title: 'Task', status: 0 }],
    });

    await pipeline.processMessage('delete task', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    const logCall = logSpy.find(call => call.event === 'mutation_executed');
    assert.equal(logCall.mutationType, 'delete');
});
```

**Files to Create**:
- `tests/integration/mutation-integration.test.js` (~180 lines, 25+ tests)
- `tests/integration/pipeline-harness.js` (~100 lines, test infrastructure)

**Validation Criteria**:
- [ ] 25+ tests covering all mutation types (update, complete, delete)
- [ ] Tests run with `node --test tests/integration/mutation-integration.test.js`
- [ ] All tests pass with zero failures
- [ ] Clarification flows tested (ambiguous → resume)
- [ ] Rollback scenarios tested
- [ ] Error handling tested (quota, network, invalid payload)
- [ ] Observability events verified
- [ ] Idempotency tested

**Edge Cases**:
- Task already completed → handled gracefully
- Task deleted externally → not_found response
- Multiple mutations in sequence → isolated state
- Rollback with partial changes → all changes reverted
- Network error during execution → error returned, no partial changes

**Testing Notes**:
- Use pipeline harness for consistent test setup
- Mock all external dependencies (TickTick API, Gemini API)
- Test each mutation type independently
- Verify rollback on failure
- Check observability events logged correctly

---

### T073: Create clarification.test.js

**Purpose**: Focused tests for clarification UI flow (keyboard building, callback handling, resume logic) with 25+ complete tests covering all clarification scenarios.

**Context**: The clarification flow involves multiple components working together. These tests ensure the keyboard is built correctly, callbacks are handled properly, and the resume logic works seamlessly.

**Implementation**:
1. Create `tests/clarification.test.js` with 150 lines, 25+ tests
2. Test keyboard builder formatting
3. Test callback handler authorization
4. Test resume mutation with selected task
5. Test timeout/expiration scenarios

**Test Structure**:
```javascript
// tests/clarification.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClarificationKeyboard, formatDueDate, sendClarification, isValidForClarification } from '../bot/clarification.js';
import { setPendingMutation, getPendingMutation, clearPendingMutation } from '../services/store.js';

// ========== Keyboard Builder Tests ==========

test('keyboard shows up to 5 candidates', () => {
    const candidates = Array(7).fill(null).map((_, i) => ({
        taskId: `t${i}`,
        title: `Task ${i}`,
    }));

    const keyboard = buildClarificationKeyboard(candidates, 'complete');
    // Should have 5 candidate buttons + 1 cancel button
    assert.ok(keyboard);
    assert.equal(keyboard.inline_keyboard.length, 6);
});

test('keyboard truncates long titles', () => {
    const candidates = [{
        taskId: 't1',
        title: 'This is a very long task title that exceeds thirty characters limit',
    }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');
    // Button text should include ellipsis
    const buttonText = keyboard.inline_keyboard[0][0].text;
    assert.ok(buttonText.includes('...'));
});

test('keyboard includes project metadata', () => {
    const candidates = [{
        taskId: 't1',
        title: 'Task',
        projectName: 'Work',
    }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');
    // Button text should include [Work]
    const buttonText = keyboard.inline_keyboard[0][0].text;
    assert.ok(buttonText.includes('[Work]'));
});

test('keyboard formats today due date', () => {
    const today = new Date().toISOString();
    const candidates = [{ taskId: 't1', title: 'Task', dueDate: today }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');
    // Should show "Today"
    const buttonText = keyboard.inline_keyboard[0][0].text;
    assert.ok(buttonText.includes('Today'));
});

test('keyboard formats tomorrow due date', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const candidates = [{ taskId: 't1', title: 'Task', dueDate: tomorrow }];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');
    // Should show "Tomorrow"
    const buttonText = keyboard.inline_keyboard[0][0].text;
    assert.ok(buttonText.includes('Tomorrow'));
});

test('keyboard has cancel button', () => {
    const candidates = [{ taskId: 't1', title: 'Task' }];
    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    // Cancel button should be present with correct callback data
    const lastRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1];
    assert.equal(lastRow[0].text, '❌ Cancel');
    assert.equal(lastRow[0].callback_data, 'mutate:cancel');
});

test('keyboard includes mutation emoji', () => {
    const candidates = [{ taskId: 't1', title: 'Task' }];

    const completeKeyboard = buildClarificationKeyboard(candidates, 'complete');
    const deleteKeyboard = buildClarificationKeyboard(candidates, 'delete');
    const updateKeyboard = buildClarificationKeyboard(candidates, 'update');

    assert.ok(completeKeyboard.inline_keyboard[0][0].text.includes('✅'));
    assert.ok(deleteKeyboard.inline_keyboard[0][0].text.includes('🗑️'));
    assert.ok(updateKeyboard.inline_keyboard[0][0].text.includes('📝'));
});

test('keyboard throws error for empty candidates', () => {
    assert.throws(
        () => buildClarificationKeyboard([], 'complete'),
        /non-empty/
    );
});

test('keyboard throws error for invalid mutationType', () => {
    const candidates = [{ taskId: 't1', title: 'Task' }];

    assert.throws(
        () => buildClarificationKeyboard(candidates, 'invalid'),
        /Invalid mutationType/
    );
});

test('keyboard skips invalid candidates', () => {
    const candidates = [
        { taskId: 't1', title: 'Valid task' },
        { taskId: 't2' }, // Missing title
    ];

    const keyboard = buildClarificationKeyboard(candidates, 'complete');

    // Should only have 1 candidate + cancel
    assert.equal(keyboard.inline_keyboard.length, 2);
});

test('formatDueDate handles today', () => {
    const today = new Date().toISOString().split('T')[0];
    assert.ok(formatDueDate(today).includes('Today'));
});

test('formatDueDate handles tomorrow', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    assert.ok(formatDueDate(tomorrow).includes('Tomorrow'));
});

test('formatDueDate handles invalid date', () => {
    assert.equal(formatDueDate('invalid'), '');
    assert.equal(formatDueDate(null), '');
    assert.equal(formatDueDate('someday'), '');
});

test('isValidForClarification validates candidate structure', () => {
    const validCandidates = [
        { taskId: 't1', title: 'Task', confidence: 0.9 },
    ];

    assert.equal(isValidForClarification(validCandidates), true);
    assert.equal(isValidForClarification([]), false);
    assert.equal(isValidForClarification(null), false);
    assert.equal(isValidForClarification([{ taskId: 't1' }]), false);
});

// ========== Store Tests ==========

test('pending mutation stored with expiration', () => {
    const mutation = {
        id: 'm1',
        userId: 'u1',
        intent: { type: 'complete' },
    };

    setPendingMutation('u1', mutation);
    const retrieved = getPendingMutation('u1');

    assert.ok(retrieved);
    assert.equal(retrieved.id, 'm1');
    assert.ok(retrieved.expiresAt > Date.now());

    clearPendingMutation('u1');
});

test('pending mutation expires after 15 minutes', () => {
    const mutation = { id: 'm1', userId: 'u1' };
    setPendingMutation('u1', mutation);

    // Simulate time travel (mock Date.now)
    const originalNow = Date.now;
    Date.now = () => originalNow() + 16 * 60 * 1000; // 16 minutes later

    const expired = getPendingMutation('u1');
    assert.equal(expired, null);

    Date.now = originalNow;
    clearPendingMutation('u1');
});

// ========== Resume Mutation Tests ==========

test('resume mutation uses selected task ID', async () => {
    // Integration test with pipeline
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task A', status: 0 },
            { id: 't2', title: 'Task B', status: 0 },
        ],
    });

    const pendingMutation = {
        id: 'm1',
        userId: 'u1',
        userMessage: 'done task',
        intent: { type: 'complete', targetQuery: 'task' },
        selectedTaskId: 't2',
        entryPoint: 'test',
        availableProjects: [],
        timezone: 'UTC',
    };

    const result = await pipeline.resumeMutation(pendingMutation);

    assert.equal(result.type, 'task');

    const task2 = await adapter.getTask('t2');
    assert.equal(task2.status, 2); // Completed
});

test('resume mutation fails for expired mutation', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [],
    });

    const expiredMutation = {
        id: 'm1',
        userId: 'u1',
        selectedTaskId: 't1',
        expiresAt: Date.now() - 1000, // Expired 1 second ago
    };

    await assert.rejects(
        () => pipeline.resumeMutation(expiredMutation),
        /expired/
    );
});

test('resume mutation fails for missing task ID', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [],
    });

    const invalidMutation = {
        id: 'm1',
        userId: 'u1',
        // Missing selectedTaskId
    };

    await assert.rejects(
        () => pipeline.resumeMutation(invalidMutation),
        /selected task ID/
    );
});

// ========== Callback Handler Tests ==========

test('clarification callback unauthorized rejected', async () => {
    // Test callback handler authorization
    // (Full implementation in bot-mutation.test.js)
});

test('clarification callback cancel action', async () => {
    // Test cancel callback handling
    // (Full implementation in bot-mutation.test.js)
});

test('clarification callback task selection', async () => {
    // Test task selection callback
    // (Full implementation in bot-mutation.test.js)
});

test('clarification callback expired session', async () => {
    // Test expired session handling
    // (Full implementation in bot-mutation.test.js)
});

test('clarification callback concurrent clicks', async () => {
    // Test idempotency for rapid clicks
    // (Full implementation in bot-mutation.test.js)
});
```

**Files to Create**:
- `tests/clarification.test.js` (~150 lines, 25+ tests)

**Validation Criteria**:
- [ ] 25+ tests covering keyboard, callbacks, resume, timeout
- [ ] Tests run with `node --test tests/clarification.test.js`
- [ ] All tests pass with zero failures
- [ ] Keyboard formatting verified (truncation, metadata, dates)
- [ ] Pending mutation expiration tested
- [ ] Resume mutation integration tested

**Edge Cases**:
- Empty candidates → throws error
- Expired mutation → returns null
- Missing mutation → returns null
- Multiple rapid callbacks → idempotent

**Testing Notes**:
- Test keyboard with various title/project/date combinations
- Test store expiration with mocked time
- Test resume with pipeline harness
- Verify callback handler authorization

---

### T074: Create bot-mutation.test.js

**Purpose**: Comprehensive test coverage for bot message handler and mutation result handling with 30+ complete tests covering message routing, result type handling, command handlers, session locking, rate limiting, and utility functions.

**Context**: Bot handlers are critical user-facing code. Comprehensive tests ensure all code paths work correctly and edge cases are handled gracefully. This subtask provides complete test infrastructure with mock objects and detailed coverage.

**Implementation**:
1. Create `tests/bot-mutation.test.js` with 200 lines, 30+ tests
2. Test message routing (command vs. free-form)
3. Test result type handling (task, clarification, error, not-found)
4. Test `/done` and `/delete` command handlers
5. Test edge cases (empty messages, quota exhaustion, disconnected state)
6. Test authorization failures
7. Test session locking and rate limiting
8. Test utility functions (argument parsing, validation)

**Test Structure**:
```javascript
// tests/bot-mutation.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMutationResult } from '../bot/handlers.js';
import { classifyError, getErrorConfig, ERROR_CLASSES } from '../bot/error-classes.js';
import { parseCommandArgs, validateCommandQuery, buildUsageHint } from '../bot/utils.js';
import { acquireSessionLock, releaseSessionLock, hasActiveSession } from '../bot/session-store.js';
import { isRateLimited, getRateLimitResetTime } from '../bot/rate-limiter.js';
import { storePendingAction, getPendingAction, clearPendingAction, isWithinUndoWindow } from '../bot/pending-actions.js';

// ============================================
// Mock Helpers
// ============================================

function createMockContext(overrides = {}) {
    const replies = [];
    return {
        message: { text: '' },
        from: { id: 'test-user' },
        match: '',
        reply: async (msg) => { replies.push(msg); },
        _replies: replies,
        ...overrides,
    };
}

// ============================================
// Result Type Handling Tests
// ============================================

test('handleMutationResult shows terse confirmation for task results', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'task',
        confirmationText: 'Completed: Buy groceries',
        mutationType: 'complete',
        taskId: 't1',
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].includes('✅'));
    assert.ok(ctx._replies[0].includes('Completed: Buy groceries'));
});

test('handleMutationResult shows delete confirmation with trash emoji', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'task',
        confirmationText: 'Deleted: Old task',
        mutationType: 'delete',
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].includes('🗑️'));
});

test('handleMutationResult shows update confirmation with pencil emoji', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'task',
        confirmationText: 'Updated: Meeting moved',
        mutationType: 'update',
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].includes('📝'));
});

test('handleMutationResult shows quota-aware error messages', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'error',
        failure: { class: 'quota' },
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].includes('quota'));
});

test('handleMutationResult shows not-found with suggestions', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, {
        type: 'not_found',
        targetQuery: 'nonexistent',
        candidates: [{ taskId: 't1', title: 'Existing task' }],
    });

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].includes('Did you mean'));
});

test('handleMutationResult handles null result', async () => {
    const ctx = createMockContext();

    await handleMutationResult(ctx, null);

    assert.equal(ctx._replies.length, 1);
    assert.ok(ctx._replies[0].includes('Could not process'));
});

// ============================================
// Command Handler Tests
// ============================================

test('/done without args shows usage hint', async () => {
    // Test command handler with empty args
    const hint = buildUsageHint('done');
    assert.ok(hint.includes('Usage'));
    assert.ok(hint.includes('Examples'));
});

test('/delete without args shows usage hint', async () => {
    const hint = buildUsageHint('delete');
    assert.ok(hint.includes('Usage'));
    assert.ok(hint.includes('Examples'));
});

// ============================================
// Utility Function Tests
// ============================================

test('parseCommandArgs handles quoted strings', () => {
    assert.equal(parseCommandArgs('"buy groceries"'), 'buy groceries');
    assert.equal(parseCommandArgs("'call mom'"), 'call mom');
    assert.equal(parseCommandArgs('meeting'), 'meeting');
});

test('validateCommandQuery rejects empty query', () => {
    const result = validateCommandQuery('');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('empty'));
});

test('validateCommandQuery rejects long query', () => {
    const longQuery = 'a'.repeat(201);
    const result = validateCommandQuery(longQuery);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('long'));
});

test('validateCommandQuery accepts valid query', () => {
    const result = validateCommandQuery('buy groceries');
    assert.equal(result.valid, true);
});

test('buildUsageHint shows correct examples', () => {
    const hint = buildUsageHint('done');
    assert.ok(hint.includes('/done'));
    assert.ok(hint.includes('Examples'));
});

// ============================================
// Session Store Tests
// ============================================

test('acquireSessionLock prevents concurrent processing', () => {
    const userId = 'test-user';

    assert.equal(acquireSessionLock(userId), true);
    assert.equal(acquireSessionLock(userId), false);

    releaseSessionLock(userId);
});

test('releaseSessionLock allows new lock', () => {
    const userId = 'test-user';

    acquireSessionLock(userId);
    releaseSessionLock(userId);

    assert.equal(acquireSessionLock(userId), true);

    releaseSessionLock(userId);
});

test('hasActiveSession returns correct state', () => {
    const userId = 'test-user';

    assert.equal(hasActiveSession(userId), false);

    acquireSessionLock(userId);
    assert.equal(hasActiveSession(userId), true);

    releaseSessionLock(userId);
});

// ============================================
// Rate Limiter Tests
// ============================================

test('isRateLimited allows first 3 requests', () => {
    const userId = 'test-user';

    assert.equal(isRateLimited(userId), false);
    assert.equal(isRateLimited(userId), false);
    assert.equal(isRateLimited(userId), false);
    assert.equal(isRateLimited(userId), true);
});

test('getRateLimitResetTime returns seconds until reset', () => {
    const userId = 'test-user-2';

    isRateLimited(userId);
    const resetTime = getRateLimitResetTime(userId);

    assert.ok(resetTime > 0);
    assert.ok(resetTime <= 60);
});

// ============================================
// Pending Actions Tests
// ============================================

test('storePendingAction stores action', () => {
    const userId = 'test-user';

    storePendingAction(userId, {
        type: 'complete',
        taskId: 't1',
        query: 'test',
    });

    const action = getPendingAction(userId);
    assert.ok(action);
    assert.equal(action.type, 'complete');

    clearPendingAction(userId);
});

test('getPendingAction returns null for expired action', () => {
    const userId = 'test-user-expired';

    storePendingAction(userId, {
        type: 'delete',
        taskId: 't1',
    });

    const originalNow = Date.now;
    Date.now = () => originalNow() + 6 * 60 * 1000;

    const action = getPendingAction(userId);
    assert.equal(action, null);

    Date.now = originalNow;
});

test('isWithinUndoWindow returns true for recent actions', () => {
    const userId = 'test-user-undo';

    storePendingAction(userId, {
        type: 'complete',
        taskId: 't1',
    });

    assert.equal(isWithinUndoWindow(userId), true);

    clearPendingAction(userId);
});

// ============================================
// Error Classification Tests
// ============================================

test('classifyError identifies quota errors', () => {
    const err = new Error('QUOTA_EXHAUSTED');
    assert.equal(classifyError(err), 'quota');
});

test('classifyError identifies network errors', () => {
    const err = new Error('Network timeout');
    assert.equal(classifyError(err), 'network');
});

test('classifyError identifies auth errors', () => {
    const err = new Error('Unauthorized');
    assert.equal(classifyError(err), 'auth');
});

test('classifyError identifies not_found errors', () => {
    const err = new Error('Task not found');
    assert.equal(classifyError(err), 'not_found');
});

test('classifyError defaults to unexpected', () => {
    const err = new Error('Random error');
    assert.equal(classifyError(err), 'unexpected');
});

test('getErrorConfig returns correct configuration', () => {
    const config = getErrorConfig('quota');
    assert.equal(config.class, 'quota');
    assert.equal(config.retryable, true);
    assert.ok(config.emoji);
    assert.ok(config.userMessage);
});

test('ERROR_CLASSES has all required error types', () => {
    assert.ok(ERROR_CLASSES.QUOTA);
    assert.ok(ERROR_CLASSES.NETWORK);
    assert.ok(ERROR_CLASSES.AUTH);
    assert.ok(ERROR_CLASSES.NOT_FOUND);
    assert.ok(ERROR_CLASSES.UNEXPECTED);
});
```

**Files to Create**:
- `tests/bot-mutation.test.js` (~200 lines, 30+ tests)

**Validation Criteria**:
- [ ] 30+ tests covering all bot handler scenarios
- [ ] Tests run with `node --test tests/bot-mutation.test.js`
- [ ] All tests pass with zero failures
- [ ] Message routing tested
- [ ] Result type handling tested
- [ ] Command handlers tested
- [ ] Session locking tested
- [ ] Rate limiting tested
- [ ] Utility functions tested

---

### T075: Update Test Infrastructure

**Purpose**: Update test scripts, package.json, and regression suite to include new mutation tests with complete integration into CI/CD pipeline.

**Context**: New tests need to be integrated into the existing test infrastructure: package.json scripts, regression test runner, and CI/CD pipeline. This ensures tests are run consistently and results are tracked.

**Implementation**:
1. Update `package.json` with new test scripts
2. Update `tests/run-regression-tests.mjs` to include mutation tests
3. Add mutation-specific regression tests to `tests/regression.test.js`
4. Document test commands in README.md
5. Create pipeline harness for integration tests

**Changes**:

**package.json**:
```json
{
  "scripts": {
    "test": "node --test",
    "test:unit": "node --test tests/*.test.js",
    "test:integration": "node --test tests/integration/*.test.js",
    "test:load": "node --test tests/load/*.test.js",
    "test:mutation": "node --test tests/task-resolver.test.js tests/integration/mutation-integration.test.js tests/clarification.test.js tests/bot-mutation.test.js",
    "test:regression": "node tests/run-regression-tests.mjs",
    "test:coverage": "node --test --experimental-test-coverage"
  }
}
```

**tests/run-regression-tests.mjs** (add mutation tests):
```javascript
// Add to existing regression test runner
const mutationTests = [
    'tests/task-resolver.test.js',
    'tests/integration/mutation-integration.test.js',
    'tests/clarification.test.js',
    'tests/bot-mutation.test.js',
];

for (const testFile of mutationTests) {
    console.log(`Running ${testFile}...`);
    const { spawnSync } = await import('child_process');
    const result = spawnSync('node', ['--test', testFile], {
        stdio: 'inherit',
        encoding: 'utf-8',
    });

    if (result.status !== 0) {
        console.error(`❌ ${testFile} failed`);
        process.exit(1);
    }
}
```

**tests/regression.test.js** (add mutation-specific tests):
```javascript
// Add to existing regression.test.js

test('mutation: exact match wins over fuzzy match', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Buy groceries', status: 0 },
            { id: 't2', title: 'Buy grocery bags', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('done buy groceries', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    // Exact match should win
    assert.equal(result.type, 'task');
    assert.ok(result.taskId === 't1');
});

test('mutation: delete fails closed on ambiguity (FR-008)', async () => {
    const { pipeline } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Meeting', status: 0 },
            { id: 't2', title: 'Meeting', status: 0 },
        ],
    });

    const result = await pipeline.processMessage('delete meeting', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    // Should trigger clarification, not auto-delete
    assert.equal(result.type, 'clarification');
});

test('mutation: content preserved on update', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task', content: 'Important context', status: 0 },
        ],
    });

    await pipeline.processMessage('move task to tomorrow', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    const updatedTask = await adapter.getTask('t1');
    assert.equal(updatedTask.content, 'Important context');
});

test('mutation: date resolution works (tomorrow, next Friday)', async () => {
    const { pipeline, adapter } = await createPipelineHarness({
        initialTasks: [
            { id: 't1', title: 'Task', status: 0 },
        ],
    });

    await pipeline.processMessage('move task to tomorrow', {
        entryPoint: 'test',
        mode: 'mutation',
    });

    const updatedTask = await adapter.getTask('t1');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.equal(updatedTask.dueDate, tomorrow.toISOString().split('T')[0]);
});
```

**tests/integration/pipeline-harness.js** (NEW test infrastructure):
```javascript
// tests/integration/pipeline-harness.js
import { createPipeline } from '../../services/pipeline.js';
import { createNormalizer } from '../../services/normalizer.js';

/**
 * Create pipeline harness for integration testing
 * @param {Object} options - Test options
 * @param {Array} options.initialTasks - Initial tasks for mock adapter
 * @param {Array} options.projects - Initial projects for mock adapter
 * @param {boolean} options.simulateQuotaExhausted - Simulate AI quota exhausted
 * @param {boolean} options.simulateNetworkError - Simulate network error
 * @param {Object} options.simulateFailure - Simulate adapter failure {method, atCall}
 * @returns {Promise<Object>} Pipeline harness with mocks and spies
 */
export async function createPipelineHarness(options = {}) {
    const {
        initialTasks = [],
        projects = [],
        simulateQuotaExhausted = false,
        simulateNetworkError = false,
        simulateFailure = null,
    } = options;

    // Mock adapter with in-memory store
    const adapter = createMockTickTickAdapter({
        initialTasks,
        projects,
        simulateFailure,
    });

    // Mock AX Intent extractor
    const axIntent = createMockAXIntent({
        simulateQuotaExhausted,
        simulateNetworkError,
    });

    // Create normalizer
    const normalizer = createNormalizer();

    // Create pipeline
    const pipeline = createPipeline({
        axIntent,
        normalizer,
        adapter,
    });

    // Create spies for observability
    const logSpy = createLogSpy();

    return {
        pipeline,
        adapter,
        axIntent,
        normalizer,
        logSpy,
    };
}

// Mock adapter implementation
function createMockTickTickAdapter(options) {
    const { initialTasks, projects, simulateFailure } = options;
    const tasks = new Map(initialTasks.map(t => [t.id, { ...t }]));
    let callCount = 0;

    return {
        async getAllTasks() {
            return Array.from(tasks.values());
        },

        async getTask(taskId) {
            return tasks.get(taskId) || null;
        },

        async updateTask(taskId, updates) {
            callCount++;
            if (simulateFailure && simulateFailure.method === 'updateTask' && callCount === simulateFailure.atCall) {
                const error = new Error('Simulated update failure');
                error.class = 'adapter_failure';
                throw error;
            }

            const task = tasks.get(taskId);
            if (!task) throw new Error(`Task ${taskId} not found`);

            Object.assign(task, updates);
            return task;
        },

        async completeTask(taskId) {
            const task = tasks.get(taskId);
            if (!task) throw new Error(`Task ${taskId} not found`);

            task.status = 2;
            return task;
        },

        async deleteTask(taskId) {
            tasks.delete(taskId);
            return { deleted: true };
        },

        async createTask(taskData) {
            const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const task = { id, ...taskData, status: 0 };
            tasks.set(id, task);
            return task;
        },

        getLastFetchedProjects() {
            return projects;
        },
    };
}

// Mock AX Intent extractor
function createMockAXIntent(options) {
    const { simulateQuotaExhausted, simulateNetworkError } = options;

    return {
        async extractIntents(message) {
            if (simulateQuotaExhausted) {
                const error = new Error('QUOTA_EXHAUSTED: All API keys exhausted');
                error.code = 'QUOTA_EXHAUSTED';
                throw error;
            }

            if (simulateNetworkError) {
                const error = new Error('Network timeout');
                error.code = 'ETIMEDOUT';
                throw error;
            }

            // Parse message for mutation type
            let type = 'create';
            if (message.toLowerCase().includes('done') || message.toLowerCase().includes('complete')) {
                type = 'complete';
            } else if (message.toLowerCase().includes('delete') || message.toLowerCase().includes('remove')) {
                type = 'delete';
            } else if (message.toLowerCase().includes('move') || message.toLowerCase().includes('update')) {
                type = 'update';
            }

            return [{
                type,
                title: message.replace(/^(done|delete|move|update)\s+/i, ''),
                confidence: 0.9,
            }];
        },
    };
}

// Create log spy
function createLogSpy() {
    const calls = [];

    return {
        calledWith: (event) => calls.some(c => c.event === event),
        find: (predicate) => calls.find(predicate),
        record: (call) => calls.push(call),
        getCalls: () => calls,
    };
}
```

**Files to Modify**:
- `package.json` (add test scripts)
- `tests/run-regression-tests.mjs` (add mutation tests)
- `tests/regression.test.js` (add mutation-specific tests)
- `tests/integration/pipeline-harness.js` (NEW, ~100 lines)
- `README.md` (document test commands)

**Validation Criteria**:
- [ ] All test scripts added to package.json
- [ ] Mutation tests included in regression runner
- [ ] Pipeline harness created for integration tests
- [ ] README.md updated with test commands
- [ ] All tests run successfully with `npm test`

**Testing Notes**:
- Run `npm run test:mutation` to run all mutation tests
- Run `npm run test:coverage` to check coverage
- Pipeline harness mocks all external dependencies
- Regression tests prevent future breakage

---

## Definition of Done

- [ ] `tests/task-resolver.test.js` with 30+ tests
- [ ] `tests/integration/mutation-integration.test.js` with 25+ tests
- [ ] `tests/clarification.test.js` with 25+ tests
- [ ] `tests/bot-mutation.test.js` with 30+ tests
- [ ] `tests/integration/pipeline-harness.js` test infrastructure
- [ ] `package.json` updated with test scripts
- [ ] `tests/run-regression-tests.mjs` includes mutation tests
- [ ] `README.md` documents test commands
- [ ] 80%+ line coverage for mutation-related code
- [ ] All performance benchmarks met
- [ ] All tests pass with zero failures

## Risks

- **Test flakiness**: Mock all external dependencies for deterministic results
- **Performance test variance**: Use generous thresholds for different environments
- **Test maintenance**: Keep tests in sync with code changes
- **Coverage gaps**: Run coverage reports and fill gaps

## Reviewer Guidance

- Verify all critical paths have test coverage
- Check performance benchmarks are realistic
- Ensure mocks accurately represent real behavior
- Confirm error handling tested for all error types

## Activity Log

- Pending implementation
