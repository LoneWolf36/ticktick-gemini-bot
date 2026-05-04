import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { appendUrgentModeReminder, parseTelegramMarkdownToHTML } from '../services/shared-utils.js';
import { registerCommands } from '../bot/commands.js';
import { GeminiAnalyzer, buildWorkStylePromptNote } from '../services/gemini.js';
import {
    createIntentExtractor,
    detectWorkStyleModeIntent,
    QuotaExhaustedError
} from '../services/intent-extraction.js';
import { createPipeline } from '../services/pipeline.js';
import { createPipelineObservability } from '../services/pipeline-observability.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import * as store from '../services/store.js';
import * as executionPrioritization from '../services/execution-prioritization.js';
import { AUTHORIZED_CHAT_ID } from '../services/shared-utils.js';
import {
    runDailyBriefingJob,
    runWeeklyDigestJob,
    SCHEDULER_NOTIFICATION_TYPES,
    shouldSuppressScheduledNotification
} from '../services/scheduler.js';
import {
    BRIEFING_SUMMARY_SECTION_KEYS,
    DAILY_CLOSE_SUMMARY_SECTION_KEYS,
    WEEKLY_SUMMARY_SECTION_KEYS,
    buildSummaryLogPayload,
    composeBriefingSummary,
    composeDailyCloseSummary,
    composeWeeklySummary,
    formatSummary,
    normalizeWeeklyWatchouts
} from '../services/summary-surfaces/index.js';
import { createPipelineHarness, DEFAULT_PROJECTS, DEFAULT_ACTIVE_TASKS } from './pipeline-harness.js';
import {
    buildRankingContext,
    buildRecommendationResult,
    createGoalThemeProfile,
    createRankingDecision,
    normalizePriorityCandidate
} from '../services/execution-prioritization.js';

import {
    rankPriorityCandidatesForTest,
    buildSummaryActiveTasksFixture,
    buildSummaryProcessedHistoryFixture,
    buildSummaryResolvedStateFixture,
    buildSummaryRankingFixture,
    buildDailySummaryFixture,
    buildWeeklySummaryFixture,
    buildDailyCloseProcessedHistoryFixture,
    buildDailyCloseSummaryFixture
} from './helpers/regression-fixtures.js';

import {
    classifyTaskEvent,
    detectPostpone,
    detectScopeChange,
    detectDecomposition,
    SignalType,
    getSignalRegistry
} from '../services/behavioral-signals.js';
import { BehavioralPatternType, PatternConfidence, detectBehavioralPatterns } from '../services/behavioral-patterns.js';

test('classifyTaskEvent emits expected base signal by event type', () => {
    const cases = [
        {
            event: {
                eventType: 'create',
                taskId: 'test123',
                category: 'work',
                projectId: 'abc123def456ghi789jkl012',
                timestamp: '2026-04-14T10:00:00Z'
            },
            expectedType: SignalType.CREATION,
            assertExtras: (signal) => {
                assert.equal(signal.category, 'work');
                assert.equal(signal.projectId, 'abc123def456ghi789jkl012');
                assert.equal(signal.confidence, 1.0);
            }
        },
        {
            event: { eventType: 'complete', taskId: 't1', projectId: 'p1', timestamp: '2026-04-14T10:00:00Z' },
            expectedType: SignalType.COMPLETION,
            assertExtras: () => {}
        },
        {
            event: { eventType: 'delete', taskId: 't1', projectId: 'p1', timestamp: '2026-04-14T10:00:00Z' },
            expectedType: SignalType.DELETION,
            assertExtras: () => {}
        }
    ];

    for (const { event, expectedType, assertExtras } of cases) {
        const signals = classifyTaskEvent(event);
        assert.equal(signals.length, 1);
        assert.equal(signals[0].type, expectedType);
        assertExtras(signals[0]);
    }
});

test('classifyTaskEvent returns empty for null/invalid input', () => {
    assert.deepEqual(classifyTaskEvent(null), []);
    assert.deepEqual(classifyTaskEvent(undefined), []);
    assert.deepEqual(classifyTaskEvent({}), []);
    assert.deepEqual(classifyTaskEvent({ eventType: 'unknown' }), []);
});

test('detectPostpone fires when due date moved forward', () => {
    const event = {
        eventType: 'update',
        taskId: 't1',
        dueDateBefore: '2026-04-15T10:00:00Z',
        dueDateAfter: '2026-04-20T10:00:00Z',
        timestamp: '2026-04-14T10:00:00Z'
    };
    const signal = detectPostpone(event);
    assert.ok(signal);
    assert.equal(signal.type, SignalType.POSTPONE);
    assert.equal(signal.confidence, 0.9);
    assert.equal(signal.metadata.dueDateMovedForward, true);
    assert.equal(signal.metadata.daysMoved, 5);
});

test('detectPostpone does NOT fire for non-postpone update variants', () => {
    const cases = [
        {
            event: {
                eventType: 'update',
                taskId: 't1',
                dueDateBefore: '2026-04-20T10:00:00Z',
                dueDateAfter: '2026-04-15T10:00:00Z',
                timestamp: '2026-04-14T10:00:00Z'
            }
        },
        {
            event: {
                eventType: 'update',
                taskId: 't1',
                dueDateBefore: '2026-04-15T10:00:00Z',
                dueDateAfter: '2026-04-15T10:00:00Z',
                timestamp: '2026-04-14T10:00:00Z'
            }
        },
        {
            event: { eventType: 'update', taskId: 't1', timestamp: '2026-04-14T10:00:00Z' }
        }
    ];

    for (const { event } of cases) {
        const signal = detectPostpone(event);
        assert.equal(signal, null);
    }
});

test('detectScopeChange fires on material description change (>=50 chars)', () => {
    const event = {
        eventType: 'update',
        taskId: 't1',
        descriptionLengthBefore: 100,
        descriptionLengthAfter: 200,
        timestamp: '2026-04-14T10:00:00Z'
    };
    const signal = detectScopeChange(event);
    assert.ok(signal);
    assert.equal(signal.type, SignalType.SCOPE_CHANGE);
    assert.equal(signal.confidence, 0.8);
    assert.equal(signal.metadata.descriptionDelta, 100);
});

test('detectScopeChange does NOT fire on small wording changes (<50 chars)', () => {
    const event = {
        eventType: 'update',
        taskId: 't1',
        descriptionLengthBefore: 100,
        descriptionLengthAfter: 120,
        timestamp: '2026-04-14T10:00:00Z'
    };
    const signal = detectScopeChange(event);
    assert.equal(signal, null);
});

test('detectScopeChange fires on checklist count change', () => {
    const event = {
        eventType: 'update',
        taskId: 't1',
        checklistCountBefore: 2,
        checklistCountAfter: 5,
        timestamp: '2026-04-14T10:00:00Z'
    };
    const signal = detectScopeChange(event);
    assert.ok(signal);
    assert.equal(signal.type, SignalType.SCOPE_CHANGE);
    assert.equal(signal.metadata.checklistDelta, 3);
});

test('detectScopeChange does NOT fire when no relevant fields present', () => {
    const event = { eventType: 'update', taskId: 't1', timestamp: '2026-04-14T10:00:00Z' };
    const signal = detectScopeChange(event);
    assert.equal(signal, null);
});

test('detectDecomposition fires when subtasks added', () => {
    const event = {
        eventType: 'update',
        taskId: 't1',
        subtaskCountBefore: 0,
        subtaskCountAfter: 3,
        timestamp: '2026-04-14T10:00:00Z'
    };
    const signal = detectDecomposition(event);
    assert.ok(signal);
    assert.equal(signal.type, SignalType.DECOMPOSITION);
    assert.equal(signal.confidence, 0.85);
    assert.equal(signal.metadata.subtasksAdded, 3);
    assert.equal(signal.metadata.newSubtaskCount, 3);
});

test('detectDecomposition does NOT fire when subtasks removed', () => {
    const event = {
        eventType: 'update',
        taskId: 't1',
        subtaskCountBefore: 3,
        subtaskCountAfter: 1,
        timestamp: '2026-04-14T10:00:00Z'
    };
    const signal = detectDecomposition(event);
    assert.equal(signal, null);
});

test('detectDecomposition does NOT fire when subtask fields missing', () => {
    const event = { eventType: 'update', taskId: 't1', timestamp: '2026-04-14T10:00:00Z' };
    const signal = detectDecomposition(event);
    assert.equal(signal, null);
});

test('classifyTaskEvent update emits multiple signals when applicable', () => {
    const event = {
        eventType: 'update',
        taskId: 't1',
        dueDateBefore: '2026-04-15T10:00:00Z',
        dueDateAfter: '2026-04-20T10:00:00Z',
        subtaskCountBefore: 0,
        subtaskCountAfter: 2,
        timestamp: '2026-04-14T10:00:00Z'
    };
    const signals = classifyTaskEvent(event);
    // Should have both postpone and decomposition
    assert.ok(signals.length >= 2);
    const types = signals.map((s) => s.type);
    assert.ok(types.includes(SignalType.POSTPONE));
    assert.ok(types.includes(SignalType.DECOMPOSITION));
    assert.ok(types.includes(SignalType.SNOOZE_SPIRAL));
});

test('classifyTaskEvent emits classifier core patterns from derived metadata only', () => {
    const createSignals = classifyTaskEvent({
        eventType: 'create',
        taskId: 't-create',
        category: 'work',
        projectId: 'career',
        titleWordCount: 2,
        titleCharacterCount: 11,
        hasActionVerb: false,
        smallTaskCandidate: true,
        creationCompletionRatio: 3.5,
        recentCreatedCount: 7,
        recentCompletedCount: 2,
        timestamp: '2026-04-14T10:00:00Z'
    });

    const createTypes = createSignals.map((signal) => signal.type);
    assert.ok(createTypes.includes(SignalType.COMMITMENT_OVERLOADER));
    assert.ok(createTypes.includes(SignalType.QUICK_WIN_ADDICTION));
    assert.ok(createTypes.includes(SignalType.VAGUE_TASK_WRITER));

    const updateSignals = classifyTaskEvent({
        eventType: 'update',
        taskId: 't-update',
        category: 'admin',
        dueDateBefore: '2026-04-15T10:00:00Z',
        dueDateAfter: '2026-04-20T10:00:00Z',
        descriptionLengthBefore: 20,
        descriptionLengthAfter: 280,
        checklistCountBefore: 1,
        checklistCountAfter: 7,
        subtaskCountBefore: 0,
        subtaskCountAfter: 6,
        taskAgeDays: 45,
        categoryOverdueCount: 4,
        planningComplexityScore: 7,
        completionRateWindow: 0.2,
        planningSubtypeA: true,
        timestamp: '2026-04-14T10:00:00Z'
    });

    const updateTypes = updateSignals.map((signal) => signal.type);
    assert.ok(updateTypes.includes(SignalType.SNOOZE_SPIRAL));
    assert.ok(updateTypes.includes(SignalType.STALE_TASK_MUSEUM));
    assert.ok(updateTypes.includes(SignalType.CATEGORY_AVOIDANCE));
    assert.ok(updateTypes.includes(SignalType.PLANNING_WITHOUT_EXECUTION));

    const completeSignals = classifyTaskEvent({
        eventType: 'complete',
        taskId: 't-complete',
        category: 'personal',
        smallTaskCandidate: true,
        completionLeadTimeHours: 2,
        timestamp: '2026-04-14T10:00:00Z'
    });

    const completeTypes = completeSignals.map((signal) => signal.type);
    assert.ok(completeTypes.includes(SignalType.DEADLINE_DAREDEVIL));
    assert.ok(completeTypes.includes(SignalType.QUICK_WIN_ADDICTION));

    for (const signal of [...createSignals, ...updateSignals, ...completeSignals]) {
        assert.equal(typeof signal.confidence, 'number');
        assert.ok(signal.confidence > 0 && signal.confidence <= 1);
    }
});

test('planning-without-execution signal remains metadata-only with no surfacing language', () => {
    const signal = classifyTaskEvent({
        eventType: 'update',
        taskId: 't-plan-language',
        category: 'career',
        projectId: 'career',
        checklistCountBefore: 0,
        checklistCountAfter: 7,
        descriptionLengthBefore: 20,
        descriptionLengthAfter: 280,
        subtaskCountBefore: 0,
        subtaskCountAfter: 6,
        planningComplexityScore: 8,
        completionRateWindow: 0.1,
        planningSubtypeA: true,
        timestamp: '2026-04-14T10:00:00Z'
    }).find((item) => item.type === SignalType.PLANNING_WITHOUT_EXECUTION);

    assert.ok(signal);
    assert.equal(typeof signal.type, 'string');
    assert.equal(signal.type, SignalType.PLANNING_WITHOUT_EXECUTION);
    assert.equal(typeof signal.metadata, 'object');
    assert.equal(signal.metadata.message, undefined);
    assert.equal(signal.metadata.notice, undefined);
    assert.equal(signal.metadata.guidance, undefined);
    assert.equal(signal.metadata.summary, undefined);
});

test('behavioral signals NEVER contain raw titles or message text', () => {
    const events = [
        { eventType: 'create', taskId: 't1', category: 'work', projectId: 'p1', timestamp: '2026-04-14T10:00:00Z' },
        {
            eventType: 'update',
            taskId: 't1',
            dueDateBefore: '2026-04-15',
            dueDateAfter: '2026-04-20',
            timestamp: '2026-04-14T10:00:00Z'
        },
        { eventType: 'complete', taskId: 't1', projectId: 'p1', timestamp: '2026-04-14T10:00:00Z' },
        { eventType: 'delete', taskId: 't1', projectId: 'p1', timestamp: '2026-04-14T10:00:00Z' }
    ];

    for (const event of events) {
        const signals = classifyTaskEvent(event);
        for (const signal of signals) {
            // Privacy boundary: no raw content in any signal
            assert.equal(signal.metadata.title, undefined, `Signal ${signal.type} must not contain title`);
            assert.equal(signal.metadata.description, undefined, `Signal ${signal.type} must not contain description`);
            assert.equal(signal.metadata.message, undefined, `Signal ${signal.type} must not contain message`);
            // Only derived numeric/boolean fields allowed
            for (const [key, value] of Object.entries(signal.metadata)) {
                assert.ok(
                    typeof value === 'number' || typeof value === 'boolean' || value === null,
                    `Signal ${signal.type} metadata.${key} must be number/boolean/null, got ${typeof value}`
                );
            }
        }
    }
});

test('behavioral signals ignore work-style metadata entirely', () => {
    const event = {
        eventType: 'update',
        taskId: 't1',
        dueDateBefore: '2026-04-15T10:00:00Z',
        dueDateAfter: '2026-04-20T10:00:00Z',
        workStyleMode: store.MODE_URGENT,
        previousWorkStyleMode: store.MODE_FOCUS,
        modeEventType: 'mode_activated',
        timestamp: '2026-04-14T10:00:00Z'
    };

    const signals = classifyTaskEvent(event);
    assert.ok(signals.length >= 1);

    for (const signal of signals) {
        assert.equal(signal.metadata.workStyleMode, undefined);
        assert.equal(signal.metadata.previousWorkStyleMode, undefined);
        assert.equal(signal.metadata.modeEventType, undefined);
    }
});

test('behavioral signal payload stores only allowed persisted fields and no raw leaks', async () => {
    const userId = `behavioral-allowed-fields-${Date.now()}`;
    await store.deleteBehavioralSignals(userId);

    const inputSignals = [
        {
            type: SignalType.CREATION,
            category: 'work',
            projectId: 'career',
            confidence: 0.95,
            subjectKey: 'safe-subject',
            metadata: {
                titleWordCount: 2,
                checklistDelta: 3,
                hasActionVerb: true
            },
            timestamp: new Date().toISOString()
        }
    ];

    await store.appendBehavioralSignals(userId, inputSignals);
    const stored = await store.getBehavioralSignals(userId, { includeExpired: true });

    assert.equal(stored.length, 1);
    const signal = stored[0];
    assert.deepEqual(Object.keys(signal).sort(), [
        'category',
        'confidence',
        'metadata',
        'projectId',
        'subjectKey',
        'timestamp',
        'type'
    ]);
    assert.equal(signal.type, SignalType.CREATION);
    assert.equal(signal.category, 'work');
    assert.equal(signal.projectId, 'career');
    assert.equal(signal.subjectKey, 'safe-subject');
    assert.equal(typeof signal.confidence, 'number');
    assert.equal(typeof signal.timestamp, 'string');

    assert.deepEqual(Object.keys(signal.metadata).sort(), [
        'decompositionChange',
        'planningSubtypeA',
        'planningSubtypeB',
        'scopeChange',
        'wordingOnlyEdit'
    ]);

    assert.equal(signal.metadata.title, undefined);
    assert.equal(signal.metadata.description, undefined);
    assert.equal(signal.metadata.message, undefined);
    assert.equal(signal.metadata.rawMessage, undefined);
    assert.equal(signal.metadata.rawTaskTitle, undefined);
});

test('getSignalRegistry returns low-level and behavioral pattern signal types', () => {
    const registry = getSignalRegistry();
    assert.equal(registry.length, 15);
    const types = registry.map((r) => r.type);
    assert.ok(types.includes(SignalType.POSTPONE));
    assert.ok(types.includes(SignalType.SCOPE_CHANGE));
    assert.ok(types.includes(SignalType.DECOMPOSITION));
    assert.ok(types.includes(SignalType.PLANNING_HEAVY));
    assert.ok(types.includes(SignalType.COMPLETION));
    assert.ok(types.includes(SignalType.CREATION));
    assert.ok(types.includes(SignalType.DELETION));
    assert.ok(types.includes(SignalType.SNOOZE_SPIRAL));
    assert.ok(types.includes(SignalType.COMMITMENT_OVERLOADER));
    assert.ok(types.includes(SignalType.STALE_TASK_MUSEUM));
    assert.ok(types.includes(SignalType.QUICK_WIN_ADDICTION));
    assert.ok(types.includes(SignalType.VAGUE_TASK_WRITER));
    assert.ok(types.includes(SignalType.DEADLINE_DAREDEVIL));
    assert.ok(types.includes(SignalType.CATEGORY_AVOIDANCE));
    assert.ok(types.includes(SignalType.PLANNING_WITHOUT_EXECUTION));
});

test('adapter failure preserves parsed intent and normalized action for retry', async () => {
    const adapter = {
        listProjects: async () => [],
        listActiveTasks: async () => [],
        createTask: async () => {
            throw new Error('TickTick API unavailable');
        },
        updateTask: async () => {
            throw new Error('TickTick API unavailable');
        },
        completeTask: async () => {
            throw new Error('TickTick API unavailable');
        },
        deleteTask: async () => {
            throw new Error('TickTick API unavailable');
        },
        restoreTask: async () => {
            throw new Error('Rollback unsupported');
        }
    };

    const pipeline = createPipeline({
        intentExtractor: {
            extractIntents: async () => [{ type: 'create', title: 'Test task', content: 'test content', priority: 3 }]
        },
        normalizer: {
            normalizeActions: () => [
                {
                    type: 'create',
                    title: 'Test task',
                    content: 'test content',
                    priority: 3,
                    projectId: 'inbox',
                    valid: true,
                    validationErrors: []
                }
            ]
        },
        adapter
    });

    const result = await pipeline.processMessage('create a test task', {
        requestId: 'req-adapter-failure',
        entryPoint: 'telegram',
        mode: 'interactive'
    });

    assert.equal(result.type, 'error', 'Result type should be error');
    assert.equal(result.failure.failureClass, 'adapter', 'Failure class should be adapter');
    assert.equal(result.failure.retryable, true, 'Adapter failure should be retryable');
    assert.ok(Array.isArray(result.intents), 'Intents should be preserved in result');
    assert.equal(result.intents.length, 1, 'Should have one intent');
    assert.equal(result.intents[0].type, 'create', 'Intent type should be create');
    assert.equal(result.intents[0].title, 'Test task', 'Intent title should be preserved');
    assert.ok(Array.isArray(result.normalizedActions), 'Normalized actions should be preserved in result');
    assert.equal(result.normalizedActions.length, 1, 'Should have one normalized action');
    assert.equal(result.normalizedActions[0].title, 'Test task', 'Normalized action title should be preserved');
});

test('behavioral signal storage stays tenant-scoped and supports time-range queries', async () => {
    const userId = `behavioral-range-${Date.now()}`;
    const signals = classifyTaskEvent({
        eventType: 'update',
        taskId: 't-range',
        category: 'work',
        projectId: 'career',
        dueDateBefore: '2026-04-10T10:00:00Z',
        dueDateAfter: '2026-04-14T10:00:00Z',
        taskAgeDays: 12,
        timestamp: '2026-04-12T10:00:00Z'
    });

    await store.deleteBehavioralSignals(userId);
    await store.appendBehavioralSignals(userId, signals);

    const storedSignals = await store.getBehavioralSignals(userId);
    const inRangeSignals = await store.queryBehavioralSignalsByTimeRange(userId, {
        from: '2026-04-12T00:00:00Z',
        to: '2026-04-12T23:59:59Z'
    });
    const outOfRangeSignals = await store.queryBehavioralSignalsByTimeRange(userId, {
        from: '2026-04-13T00:00:00Z',
        to: '2026-04-13T23:59:59Z'
    });

    assert.equal(storedSignals.length, signals.length);
    assert.equal(inRangeSignals.length, signals.length);
    assert.equal(outOfRangeSignals.length, 0);

    const removed = await store.deleteBehavioralSignals(userId, {
        from: '2026-04-12T00:00:00Z',
        to: '2026-04-12T23:59:59Z'
    });
    const remainingSignals = await store.getBehavioralSignals(userId);

    assert.equal(removed, signals.length);
    assert.equal(remainingSignals.length, 0);
});

test('behavioral signal storage rejects raw text fields', async () => {
    const userId = `behavioral-privacy-${Date.now()}`;

    await assert.rejects(
        store.appendBehavioralSignals(userId, [
            {
                type: SignalType.CREATION,
                category: 'work',
                projectId: 'career',
                confidence: 1,
                metadata: { title: 'raw task title' },
                timestamp: '2026-04-14T10:00:00Z'
            }
        ]),
        /must not include raw field: title/
    );
});

test('behavioral memory stores only minimal semantic metadata and domain tags', async () => {
    const userId = `behavioral-minimal-${Date.now()}`;
    await store.deleteBehavioralSignals(userId);

    await store.appendBehavioralSignals(userId, [
        {
            type: SignalType.PLANNING_WITHOUT_EXECUTION,
            category: 'career',
            projectId: 'career-project',
            confidence: 0.92,
            subjectKey: 'subject-1',
            metadata: {
                planningSubtypeA: true,
                planningSubtypeB: false,
                planningComplexityScore: 9,
                completionRateWindow: 0.1,
                checklistDelta: 8
            },
            timestamp: new Date().toISOString()
        }
    ]);

    const [stored] = await store.getBehavioralSignals(userId, { includeExpired: true });

    assert.equal(stored.category, 'career');
    assert.equal(stored.projectId, 'career-project');
    assert.equal(stored.subjectKey, 'subject-1');
    assert.deepEqual(stored.metadata, {
        planningSubtypeA: true,
        planningSubtypeB: false,
        scopeChange: null,
        wordingOnlyEdit: null,
        decompositionChange: null
    });
});

test('behavioral memory excludes expired signals from reads and pattern outputs', async () => {
    const userId = `behavioral-retention-${Date.now()}`;
    await store.deleteBehavioralSignals(userId);

    const oldTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await store.appendBehavioralSignals(userId, [
        {
            type: SignalType.POSTPONE,
            category: 'work',
            projectId: 'career',
            confidence: 0.9,
            subjectKey: 'old-postpone',
            metadata: {},
            timestamp: oldTimestamp
        },
        {
            type: SignalType.POSTPONE,
            category: 'work',
            projectId: 'career',
            confidence: 0.9,
            subjectKey: 'old-postpone',
            metadata: {},
            timestamp: oldTimestamp
        },
        {
            type: SignalType.POSTPONE,
            category: 'work',
            projectId: 'career',
            confidence: 0.9,
            subjectKey: 'old-postpone',
            metadata: {},
            timestamp: oldTimestamp
        }
    ]);

    const visibleSignals = await store.getBehavioralSignals(userId);
    const archivedSignals = await store.getBehavioralSignals(userId, { includeExpired: true });
    const querySignals = await store.queryBehavioralSignalsByTimeRange(userId, {
        from: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString()
    });
    const patterns = detectBehavioralPatterns(archivedSignals, { nowMs: Date.now() });

    assert.equal(visibleSignals.length, 0);
    assert.equal(querySignals.length, 0);
    assert.equal(archivedSignals.length, 0);
    assert.equal(patterns.length, 0);
});

test('31-day-old signals are excluded from retention-window query results', async () => {
    const userId = `behavioral-query-retention-${Date.now()}`;
    await store.deleteBehavioralSignals(userId);

    const oldTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await store.appendBehavioralSignals(userId, [
        {
            type: SignalType.POSTPONE,
            category: 'work',
            projectId: 'career',
            confidence: 0.9,
            subjectKey: 'old-query-postpone',
            metadata: {},
            timestamp: oldTimestamp
        }
    ]);

    const queried = await store.queryBehavioralSignalsByTimeRange(userId, {
        from: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString()
    });

    assert.equal(queried.length, 0);
});

test('ticktick adapter persists classified behavioral signals without blocking mutations', async () => {
    const userId = `behavioral-adapter-${Date.now()}`;
    const client = new TickTickClient({
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenExpiresAt: '2099-01-01T00:00:00Z'
    });
    client.createTask = async (taskData) => ({ id: 'task-created', ...taskData });

    const adapter = new TickTickAdapter(client);

    await store.deleteBehavioralSignals(userId);
    const createdTask = await adapter.createTask({
        title: 'Buy milk',
        projectId: 'personal',
        userId
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const storedSignals = await store.getBehavioralSignals(userId);

    assert.equal(createdTask.id, 'task-created');
    assert.ok(storedSignals.some((signal) => signal.type === SignalType.CREATION));
});

test('behavioral signal storage serializes concurrent file writes without dropping signals', async () => {
    const userId = `behavioral-concurrent-${Date.now()}`;
    await store.deleteBehavioralSignals(userId);

    const batches = Array.from({ length: 6 }, (_, index) =>
        classifyTaskEvent({
            eventType: 'create',
            taskId: `task-${index}`,
            category: `cat-${index % 3}`,
            projectId: `proj-${index % 3}`,
            timestamp: `2026-04-1${index}T10:00:00Z`
        })
    );

    await Promise.all(batches.map((signals) => store.appendBehavioralSignals(userId, signals)));
    const storedSignals = await store.getBehavioralSignals(userId);

    assert.equal(storedSignals.length, batches.flat().length);
});

test('behavioral pattern engine detects snooze spiral from aggregated postpones', () => {
    const signals = [
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-10T10:00:00Z',
            dueDateAfter: '2026-04-12T10:00:00Z',
            timestamp: '2026-04-01T10:00:00Z'
        })[0],
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-12T10:00:00Z',
            dueDateAfter: '2026-04-14T10:00:00Z',
            timestamp: '2026-04-03T10:00:00Z'
        })[0],
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-14T10:00:00Z',
            dueDateAfter: '2026-04-16T10:00:00Z',
            timestamp: '2026-04-05T10:00:00Z'
        })[0]
    ];

    const patterns = detectBehavioralPatterns(signals, { nowMs: Date.parse('2026-04-06T12:00:00Z') });
    const snoozePattern = patterns.find((pattern) => pattern.type === BehavioralPatternType.SNOOZE_SPIRAL);

    assert.ok(snoozePattern);
    assert.equal(snoozePattern.confidence, PatternConfidence.STANDARD);
    assert.equal(snoozePattern.eligibleForSurfacing, true);
    assert.equal(snoozePattern.signalCount, 3);
});

test('behavioral pattern engine detects planning overload aggregates and suppresses low-confidence surfacing', () => {
    const typeASignals = [
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'plan-a-1',
            category: 'career',
            projectId: 'career',
            checklistCountBefore: 0,
            checklistCountAfter: 6,
            descriptionLengthBefore: 20,
            descriptionLengthAfter: 260,
            subtaskCountBefore: 0,
            subtaskCountAfter: 6,
            planningComplexityScore: 7,
            completionRateWindow: 0,
            planningSubtypeA: true,
            timestamp: '2026-04-01T09:00:00Z'
        }).find((signal) => signal.type === SignalType.PLANNING_WITHOUT_EXECUTION),
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'plan-a-2',
            category: 'career',
            projectId: 'career',
            checklistCountBefore: 1,
            checklistCountAfter: 8,
            descriptionLengthBefore: 40,
            descriptionLengthAfter: 280,
            subtaskCountBefore: 0,
            subtaskCountAfter: 7,
            planningComplexityScore: 8,
            completionRateWindow: 0,
            planningSubtypeA: true,
            timestamp: '2026-04-03T09:00:00Z'
        }).find((signal) => signal.type === SignalType.PLANNING_WITHOUT_EXECUTION),
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'plan-a-3',
            category: 'career',
            projectId: 'career',
            checklistCountBefore: 2,
            checklistCountAfter: 9,
            descriptionLengthBefore: 30,
            descriptionLengthAfter: 300,
            subtaskCountBefore: 1,
            subtaskCountAfter: 7,
            planningComplexityScore: 9,
            completionRateWindow: 0,
            planningSubtypeA: true,
            timestamp: '2026-04-05T09:00:00Z'
        }).find((signal) => signal.type === SignalType.PLANNING_WITHOUT_EXECUTION)
    ];

    const creationSignals = Array.from({ length: 10 }, (_, index) =>
        classifyTaskEvent({
            eventType: 'create',
            taskId: `overload-${index}`,
            category: ['career', 'health', 'admin'][index % 3],
            projectId: ['p-career', 'p-health', 'p-admin'][index % 3],
            timestamp: `2026-04-${String(7 + Math.floor(index / 2)).padStart(2, '0')}T10:00:00Z`
        }).find((signal) => signal.type === SignalType.CREATION)
    );
    const completionSignals = [
        classifyTaskEvent({
            eventType: 'complete',
            taskId: 'c1',
            category: 'career',
            projectId: 'p-career',
            timestamp: '2026-04-08T10:00:00Z'
        })[0],
        classifyTaskEvent({
            eventType: 'complete',
            taskId: 'c2',
            category: 'admin',
            projectId: 'p-admin',
            timestamp: '2026-04-09T10:00:00Z'
        })[0]
    ];
    const lowConfidenceSignals = [
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task-low',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-10T10:00:00Z',
            dueDateAfter: '2026-04-12T10:00:00Z',
            timestamp: '2026-04-01T10:00:00Z'
        })[0],
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task-low',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-12T10:00:00Z',
            dueDateAfter: '2026-04-14T10:00:00Z',
            timestamp: '2026-04-03T10:00:00Z'
        })[0]
    ];

    const patterns = detectBehavioralPatterns(
        [...typeASignals, ...creationSignals, ...completionSignals, ...lowConfidenceSignals],
        {
            nowMs: Date.parse('2026-04-10T12:00:00Z')
        }
    );
    const typeAPattern = patterns.find((pattern) => pattern.type === BehavioralPatternType.PLANNING_TYPE_A);
    const typeBPattern = patterns.find((pattern) => pattern.type === BehavioralPatternType.PLANNING_TYPE_B);
    const lowConfidenceSnooze = patterns.find(
        (pattern) => pattern.type === BehavioralPatternType.SNOOZE_SPIRAL && pattern.signalCount === 2
    );

    assert.ok(typeAPattern);
    assert.equal(typeAPattern.confidence, PatternConfidence.STANDARD);
    assert.equal(typeAPattern.eligibleForSurfacing, true);
    assert.ok(typeBPattern);
    assert.equal(typeBPattern.confidence, PatternConfidence.STANDARD);
    assert.equal(typeBPattern.eligibleForSurfacing, true);
    assert.ok(lowConfidenceSnooze);
    assert.equal(lowConfidenceSnooze.confidence, PatternConfidence.LOW);
    assert.equal(lowConfidenceSnooze.eligibleForSurfacing, false);
});

test('planning pattern ambiguity downgrades confidence when replanning signals coexist', () => {
    const sequence = [
        {
            type: SignalType.PLANNING_WITHOUT_EXECUTION,
            category: 'career',
            projectId: 'career',
            confidence: 0.9,
            subjectKey: 'p1',
            metadata: { planningSubtypeA: true },
            timestamp: '2026-04-01T09:00:00Z'
        },
        {
            type: SignalType.PLANNING_WITHOUT_EXECUTION,
            category: 'career',
            projectId: 'career',
            confidence: 0.9,
            subjectKey: 'p2',
            metadata: { planningSubtypeA: true },
            timestamp: '2026-04-03T09:00:00Z'
        },
        {
            type: SignalType.PLANNING_WITHOUT_EXECUTION,
            category: 'career',
            projectId: 'career',
            confidence: 0.9,
            subjectKey: 'p3',
            metadata: { planningSubtypeA: true },
            timestamp: '2026-04-05T09:00:00Z'
        },
        {
            type: SignalType.SCOPE_CHANGE,
            category: 'career',
            projectId: 'career',
            confidence: 0.8,
            subjectKey: 'p2',
            metadata: {},
            timestamp: '2026-04-04T10:00:00Z'
        }
    ];

    const patterns = detectBehavioralPatterns(sequence, {
        nowMs: Date.parse('2026-04-06T12:00:00Z')
    });

    const pattern = patterns.find((candidate) => candidate.type === BehavioralPatternType.PLANNING_TYPE_A);
    assert.ok(pattern);
    assert.equal(pattern.confidence, PatternConfidence.LOW);
    assert.equal(pattern.eligibleForSurfacing, false);
    assert.equal(pattern.ambiguousReplanning, true);
    assert.equal(pattern.replanningSignalCount, 1);
});

test('GeminiAnalyzer _resolveBehavioralPatterns fails open when behavioral signal lookup throws', async () => {
    const analyzer = new GeminiAnalyzer(['dummy-key']);
    analyzer._getBehavioralSignalsForSummary = async () => {
        throw new Error('store unavailable');
    };

    const result = await analyzer._resolveBehavioralPatterns({
        userId: 'behavioral-user',
        generatedAtIso: '2026-04-22T12:00:00Z'
    });

    assert.deepEqual(result, []);
});

test('GeminiAnalyzer _resolveBehavioralPatterns fails open when pattern detection throws', async () => {
    const analyzer = new GeminiAnalyzer(['dummy-key']);
    analyzer._getBehavioralSignalsForSummary = async () => [{ type: 'postpone', timestamp: '2026-04-22T09:00:00Z' }];
    analyzer._detectBehavioralPatternsForSummary = () => {
        throw new Error('pattern detection failed');
    };

    const result = await analyzer._resolveBehavioralPatterns({
        userId: 'behavioral-user',
        generatedAtIso: '2026-04-22T12:00:00Z'
    });

    assert.deepEqual(result, []);
});

test('GeminiAnalyzer _resolveBehavioralPatterns fails open on store and detection-path faults', async () => {
    const analyzer = new GeminiAnalyzer(['dummy-key']);

    const fromStoreFault = await analyzer._resolveBehavioralPatterns({
        userId: '',
        generatedAtIso: '2026-04-22T12:00:00Z'
    });
    assert.deepEqual(fromStoreFault, []);

    const fromDetectionPathFault = await analyzer._resolveBehavioralPatterns({
        userId: 'behavioral-fail-open',
        generatedAtIso: Symbol('invalid-generated-at')
    });
    assert.deepEqual(fromDetectionPathFault, []);
});

// ─── /memory command tests ───────────────────────────────────

function createCommandBotHarness() {
    const handlers = { commands: new Map(), callbacks: [], events: [] };
    const bot = {
        command(name, handler) {
            handlers.commands.set(name, handler);
            return this;
        },
        callbackQuery(pattern, handler) {
            handlers.callbacks.push({ pattern, handler });
            return this;
        },
        on(eventName, handler) {
            handlers.events.push({ eventName, handler });
            return this;
        }
    };
    return { bot, handlers };
}

test('/memory command shows active patterns retention window and last signal date', async () => {
    await store.resetAll();
    const { bot, handlers } = createCommandBotHarness();
    registerCommands(
        bot,
        {
            isAuthenticated: () => true,
            getCacheAgeSeconds: () => null,
            getAuthUrl: () => 'https://example.test/auth',
            getAllTasks: async () => [],
            getAllTasksCached: async () => [],
            getLastFetchedProjects: () => []
        },
        { listActiveTasks: async () => [], listProjects: async () => [] },
        {}
    );

    const userId = AUTHORIZED_CHAT_ID || Date.now();
    await store.appendBehavioralSignals(userId, [
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-10T10:00:00Z',
            dueDateAfter: '2026-04-12T10:00:00Z',
            timestamp: '2026-04-18T10:00:00Z'
        })[0],
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-12T10:00:00Z',
            dueDateAfter: '2026-04-14T10:00:00Z',
            timestamp: '2026-04-19T10:00:00Z'
        })[0],
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-14T10:00:00Z',
            dueDateAfter: '2026-04-16T10:00:00Z',
            timestamp: '2026-04-20T10:00:00Z'
        })[0]
    ]);

    const replies = [];
    await handlers.commands.get('memory')({
        chat: { id: userId },
        from: { id: userId },
        reply: async (message) => {
            replies.push(message);
        }
    });

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Behavioral Memory Summary/i);
    assert.match(replies[0], /Retention Window:<\/b> 30 days/i);
    assert.match(replies[0], /Last Signal Date:<\/b>/i);
    assert.match(replies[0], /postponed.*3 times/i);
    assert.equal(/same-task/i.test(replies[0]), false);
});

test('/memory command handles empty signal state gracefully', async () => {
    await store.resetAll();
    const { bot, handlers } = createCommandBotHarness();
    registerCommands(
        bot,
        {
            isAuthenticated: () => true,
            getCacheAgeSeconds: () => null,
            getAuthUrl: () => 'https://example.test/auth',
            getAllTasks: async () => [],
            getAllTasksCached: async () => [],
            getLastFetchedProjects: () => []
        },
        { listActiveTasks: async () => [], listProjects: async () => [] },
        {}
    );

    const userId = AUTHORIZED_CHAT_ID || Date.now();
    const replies = [];
    await handlers.commands.get('memory')({
        chat: { id: userId },
        from: { id: userId },
        reply: async (message) => {
            replies.push(message);
        }
    });

    assert.equal(replies.length, 1);
    assert.match(replies[0], /No active patterns in the last 30 days/i);
    assert.match(replies[0], /No retained signals yet/i);
});

test('/memory command fails open when signal lookup errors', async () => {
    await store.resetAll();
    const { bot, handlers } = createCommandBotHarness();
    registerCommands(
        bot,
        {
            isAuthenticated: () => true,
            getCacheAgeSeconds: () => null,
            getAuthUrl: () => 'https://example.test/auth',
            getAllTasks: async () => [],
            getAllTasksCached: async () => [],
            getLastFetchedProjects: () => []
        },
        { listActiveTasks: async () => [], listProjects: async () => [] },
        {}
    );

    const replies = [];
    await handlers.commands.get('memory')({
        chat: { id: AUTHORIZED_CHAT_ID || Date.now() },
        from: { id: Symbol('invalid-user-id') },
        reply: async (message) => {
            replies.push(message);
        }
    });

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Behavioral memory is unavailable right now/i);
});

// ─── /forget command tests ───────────────────────────────────

test('/forget command clears all behavioral signals for user', async () => {
    await store.resetAll();
    const { bot, handlers } = createCommandBotHarness();
    registerCommands(
        bot,
        {
            isAuthenticated: () => true,
            getCacheAgeSeconds: () => null,
            getAuthUrl: () => 'https://example.test/auth',
            getAllTasks: async () => [],
            getAllTasksCached: async () => [],
            getLastFetchedProjects: () => []
        },
        { listActiveTasks: async () => [], listProjects: async () => [] },
        {}
    );

    const userId = AUTHORIZED_CHAT_ID || Date.now();

    // Add some signals first
    await store.appendBehavioralSignals(userId, [
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'task-1',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-10T10:00:00Z',
            dueDateAfter: '2026-04-12T10:00:00Z',
            timestamp: '2026-04-18T10:00:00Z'
        })[0],
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'task-2',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-12T10:00:00Z',
            dueDateAfter: '2026-04-14T10:00:00Z',
            timestamp: '2026-04-19T10:00:00Z'
        })[0]
    ]);

    // Verify signals exist before forget
    const signalsBefore = await store.getBehavioralSignals(userId);
    assert.equal(signalsBefore.length, 2);

    // Execute /forget command
    const replies = [];
    await handlers.commands.get('forget')({
        chat: { id: userId },
        from: { id: userId },
        reply: async (message) => {
            replies.push(message);
        }
    });

    // Verify response message
    assert.equal(replies.length, 1);
    assert.match(replies[0], /Behavioral memory cleared/i);
    assert.match(replies[0], /2 signal\(s\) removed/i);

    // Verify signals are deleted
    const signalsAfter = await store.getBehavioralSignals(userId);
    assert.equal(signalsAfter.length, 0);

    const summaryReplies = [];
    await handlers.commands.get('memory')({
        chat: { id: userId },
        from: { id: userId },
        reply: async (message) => {
            summaryReplies.push(message);
        }
    });

    assert.equal(summaryReplies.length, 1);
    assert.match(summaryReplies[0], /No active patterns in the last 30 days/i);
});

test('/forget command works when no signals exist', async () => {
    await store.resetAll();
    const { bot, handlers } = createCommandBotHarness();
    registerCommands(
        bot,
        {
            isAuthenticated: () => true,
            getCacheAgeSeconds: () => null,
            getAuthUrl: () => 'https://example.test/auth',
            getAllTasks: async () => [],
            getAllTasksCached: async () => [],
            getLastFetchedProjects: () => []
        },
        { listActiveTasks: async () => [], listProjects: async () => [] },
        {}
    );

    const userId = AUTHORIZED_CHAT_ID || Date.now();

    // Execute /forget command when no signals exist
    const replies = [];
    await handlers.commands.get('forget')({
        chat: { id: userId },
        from: { id: userId },
        reply: async (message) => {
            replies.push(message);
        }
    });

    // Verify response message
    assert.equal(replies.length, 1);
    assert.match(replies[0], /Behavioral memory cleared/i);
    assert.match(replies[0], /0 signal\(s\) removed/i);

    // Verify no signals exist
    const signalsAfter = await store.getBehavioralSignals(userId);
    assert.equal(signalsAfter.length, 0);
});

test('/memory after /forget shows no active patterns', async () => {
    await store.resetAll();
    const { bot, handlers } = createCommandBotHarness();
    registerCommands(
        bot,
        {
            isAuthenticated: () => true,
            getCacheAgeSeconds: () => null,
            getAuthUrl: () => 'https://example.test/auth',
            getAllTasks: async () => [],
            getAllTasksCached: async () => [],
            getLastFetchedProjects: () => []
        },
        { listActiveTasks: async () => [], listProjects: async () => [] },
        {}
    );

    const userId = AUTHORIZED_CHAT_ID || Date.now();

    // Add signals that would create a pattern
    await store.appendBehavioralSignals(userId, [
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-10T10:00:00Z',
            dueDateAfter: '2026-04-12T10:00:00Z',
            timestamp: '2026-04-18T10:00:00Z'
        })[0],
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-12T10:00:00Z',
            dueDateAfter: '2026-04-14T10:00:00Z',
            timestamp: '2026-04-19T10:00:00Z'
        })[0],
        classifyTaskEvent({
            eventType: 'update',
            taskId: 'same-task',
            category: 'work',
            projectId: 'career',
            dueDateBefore: '2026-04-14T10:00:00Z',
            dueDateAfter: '2026-04-16T10:00:00Z',
            timestamp: '2026-04-20T10:00:00Z'
        })[0]
    ]);

    // Verify /memory shows patterns before forget
    const memoryRepliesBefore = [];
    await handlers.commands.get('memory')({
        chat: { id: userId },
        from: { id: userId },
        reply: async (message) => {
            memoryRepliesBefore.push(message);
        }
    });

    assert.equal(memoryRepliesBefore.length, 1);
    assert.match(memoryRepliesBefore[0], /postponed.*3 times/i);

    // Execute /forget command
    const forgetReplies = [];
    await handlers.commands.get('forget')({
        chat: { id: userId },
        from: { id: userId },
        reply: async (message) => {
            forgetReplies.push(message);
        }
    });

    // Verify forget response
    assert.equal(forgetReplies.length, 1);
    assert.match(forgetReplies[0], /Behavioral memory cleared/i);
    assert.match(forgetReplies[0], /3 signal\(s\) removed/i);

    // Verify /memory shows no patterns after forget
    const memoryRepliesAfter = [];
    await handlers.commands.get('memory')({
        chat: { id: userId },
        from: { id: userId },
        reply: async (message) => {
            memoryRepliesAfter.push(message);
        }
    });

    assert.equal(memoryRepliesAfter.length, 1);
    assert.match(memoryRepliesAfter[0], /No active patterns in the last 30 days/i);
});
