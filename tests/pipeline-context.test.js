import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipelineContextBuilder, validatePipelineContext } from '../services/pipeline-context.js';

// Mock TickTick adapter
function createMockAdapter(projects = []) {
    return {
        listProjects: async () => projects,
        listActiveTasks: async () => [],
    };
}

const DEFAULT_PROJECTS = [
    { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Inbox' },
    { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Career' },
    { id: 'cccccccccccccccccccccccc', name: 'Personal' },
];

// ============================================================
// T001: Canonical request-context assembly
// ============================================================

test('T001: createPipelineContextBuilder returns builder with buildRequestContext', () => {
    const adapter = createMockAdapter(DEFAULT_PROJECTS);
    const builder = createPipelineContextBuilder({ adapter });
    assert.ok(builder);
    assert.equal(typeof builder.buildRequestContext, 'function');
});

test('T001: buildRequestContext requires adapter', () => {
    assert.throws(
        () => createPipelineContextBuilder(),
        /Pipeline context builder requires a TickTick adapter/
    );
});

test('T001: buildRequestContext produces canonical context shape with all required fields', async () => {
    const adapter = createMockAdapter(DEFAULT_PROJECTS);
    const builder = createPipelineContextBuilder({ adapter, timezone: 'Europe/Dublin' });
    const context = await builder.buildRequestContext('Test message', {
        currentDate: '2026-04-13',
    });

    // Required fields from WP spec
    assert.ok(typeof context.requestId === 'string' && context.requestId.length > 0, 'requestId');
    assert.equal(context.entryPoint, 'unknown');
    assert.equal(context.mode, 'default');
    assert.equal(context.userMessage, 'Test message');
    assert.equal(context.currentDate, '2026-04-13');
    assert.equal(context.timezone, 'Europe/Dublin');
    assert.ok(Array.isArray(context.availableProjects), 'availableProjects is array');
    assert.ok(Array.isArray(context.availableProjectNames), 'availableProjectNames is array');
    assert.equal(context.existingTask, null);
});

test('T001: context builder derives availableProjectNames from availableProjects', async () => {
    const adapter = createMockAdapter(DEFAULT_PROJECTS);
    const builder = createPipelineContextBuilder({ adapter, timezone: 'UTC' });
    const context = await builder.buildRequestContext('Test', { currentDate: '2026-04-13' });

    assert.deepEqual(context.availableProjectNames, ['Inbox', 'Career', 'Personal']);
});

test('T001: context builder accepts optional checklist metadata without changing default path', async () => {
    const adapter = createMockAdapter(DEFAULT_PROJECTS);
    const builder = createPipelineContextBuilder({ adapter, timezone: 'UTC' });
    const context = await builder.buildRequestContext('Test', {
        currentDate: '2026-04-13',
        hasChecklist: true,
        clarificationQuestion: 'One task with steps or separate tasks?',
    });

    assert.deepEqual(context.checklistContext, {
        hasChecklist: true,
        clarificationQuestion: 'One task with steps or separate tasks?',
    });
});

test('T001: context builder accepts injected requestId for deterministic tests', async () => {
    const adapter = createMockAdapter(DEFAULT_PROJECTS);
    const builder = createPipelineContextBuilder({ adapter, timezone: 'UTC' });
    const context = await builder.buildRequestContext('Test', {
        currentDate: '2026-04-13',
        requestId: 'test-uuid-123',
    });

    assert.equal(context.requestId, 'test-uuid-123');
});

test('T001: context builder accepts injected date for deterministic tests', async () => {
    const adapter = createMockAdapter(DEFAULT_PROJECTS);
    const builder = createPipelineContextBuilder({ adapter, timezone: 'UTC' });
    const context = await builder.buildRequestContext('Test', {
        currentDate: '2026-06-15',
    });

    assert.equal(context.currentDate, '2026-06-15');
});

test('T001: context builder fetches projects from adapter when not provided', async () => {
    const adapter = createMockAdapter(DEFAULT_PROJECTS);
    const builder = createPipelineContextBuilder({ adapter, timezone: 'UTC' });
    const context = await builder.buildRequestContext('Test', { currentDate: '2026-04-13' });

    assert.equal(context.availableProjects.length, 3);
    assert.equal(context.availableProjects[0].name, 'Inbox');
});

test('T001: context builder accepts caller-provided projects without fetching adapter', async () => {
    let listProjectsCalled = false;
    const adapter = {
        listProjects: async () => { listProjectsCalled = true; return []; },
        listActiveTasks: async () => [],
    };
    const builder = createPipelineContextBuilder({ adapter, timezone: 'UTC' });
    await builder.buildRequestContext('Test', {
        currentDate: '2026-04-13',
        availableProjects: DEFAULT_PROJECTS,
    });

    assert.equal(listProjectsCalled, false, 'Should not call adapter when projects are provided');
});

// ============================================================
// T004: Fail-fast context validation
// ============================================================

test('T004: validatePipelineContext rejects null context', () => {
    const result = validatePipelineContext(null);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('context must be an object')));
});

test('T004: validatePipelineContext rejects non-object context', () => {
    const result = validatePipelineContext('not an object');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('context must be an object')));
});

test('T004: validatePipelineContext rejects missing requestId', () => {
    const context = {
        entryPoint: 'test',
        mode: 'default',
        userMessage: 'test',
        currentDate: '2026-04-13',
        timezone: 'UTC',
        availableProjects: [],
        existingTask: null,
    };
    const result = validatePipelineContext(context);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('requestId')));
});

test('T004: validatePipelineContext rejects empty requestId', () => {
    const context = {
        requestId: '',
        entryPoint: 'test',
        mode: 'default',
        userMessage: 'test',
        currentDate: '2026-04-13',
        timezone: 'UTC',
        availableProjects: [],
        existingTask: null,
    };
    const result = validatePipelineContext(context);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('requestId')));
});

test('T004: validatePipelineContext rejects invalid currentDate format', () => {
    const context = {
        requestId: 'test-id',
        entryPoint: 'test',
        mode: 'default',
        userMessage: 'test',
        currentDate: 'not-a-date',
        timezone: 'UTC',
        availableProjects: [],
        existingTask: null,
    };
    const result = validatePipelineContext(context);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('currentDate')));
});

test('T004: validatePipelineContext rejects missing timezone', () => {
    const context = {
        requestId: 'test-id',
        entryPoint: 'test',
        mode: 'default',
        userMessage: 'test',
        currentDate: '2026-04-13',
        availableProjects: [],
        existingTask: null,
    };
    const result = validatePipelineContext(context);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('timezone')));
});

test('T004: validatePipelineContext rejects non-array availableProjects', () => {
    const context = {
        requestId: 'test-id',
        entryPoint: 'test',
        mode: 'default',
        userMessage: 'test',
        currentDate: '2026-04-13',
        timezone: 'UTC',
        availableProjects: 'not-an-array',
        existingTask: null,
    };
    const result = validatePipelineContext(context);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('availableProjects')));
});

test('T004: validatePipelineContext accepts valid context', () => {
    const context = {
        requestId: 'test-id',
        entryPoint: 'telegram',
        mode: 'default',
        userMessage: 'Test message',
        currentDate: '2026-04-13',
        timezone: 'Europe/Dublin',
        availableProjects: DEFAULT_PROJECTS,
        existingTask: null,
    };
    const result = validatePipelineContext(context);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
});

test('T004: validatePipelineContext accepts valid optional checklist context', () => {
    const context = {
        requestId: 'test-id',
        entryPoint: 'telegram',
        mode: 'default',
        userMessage: 'Test message',
        currentDate: '2026-04-13',
        timezone: 'Europe/Dublin',
        availableProjects: DEFAULT_PROJECTS,
        existingTask: null,
        checklistContext: {
            hasChecklist: true,
            clarificationQuestion: 'One task with steps or separate tasks?',
        },
    };
    const result = validatePipelineContext(context);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
});

test('T004: validatePipelineContext rejects malformed checklist context fields', () => {
    const context = {
        requestId: 'test-id',
        entryPoint: 'telegram',
        mode: 'default',
        userMessage: 'Test message',
        currentDate: '2026-04-13',
        timezone: 'Europe/Dublin',
        availableProjects: DEFAULT_PROJECTS,
        existingTask: null,
        checklistContext: {
            hasChecklist: 'yes',
            clarificationQuestion: 123,
        },
    };
    const result = validatePipelineContext(context);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('checklistContext.hasChecklist')));
    assert.ok(result.errors.some(e => e.includes('checklistContext.clarificationQuestion')));
});

test('T004: validatePipelineContext accepts existingTask as object', () => {
    const context = {
        requestId: 'test-id',
        entryPoint: 'telegram',
        mode: 'default',
        userMessage: 'Test',
        currentDate: '2026-04-13',
        timezone: 'UTC',
        availableProjects: [],
        existingTask: { id: 'task123', title: 'Test task' },
    };
    const result = validatePipelineContext(context);
    assert.equal(result.ok, true);
});

test('T004: buildRequestContext throws PIPELINE_CONTEXT_INVALID on missing required fields', async () => {
    const adapter = createMockAdapter(DEFAULT_PROJECTS);
    // Force a bad requestId to trigger validation
    const builder = createPipelineContextBuilder({
        adapter,
        timezone: 'UTC',
        requestIdFactory: () => '', // Empty requestId should fail validation
    });

    try {
        await builder.buildRequestContext('Test', { currentDate: '2026-04-13' });
        assert.fail('Expected error to be thrown');
    } catch (error) {
        assert.equal(error.code, 'PIPELINE_CONTEXT_INVALID');
        assert.ok(error.details && error.details.errors);
        assert.ok(error.message.includes('Invalid pipeline request context'));
    }
});

test('T004: validation errors are descriptive and stable', async () => {
    const adapter = createMockAdapter(DEFAULT_PROJECTS);
    const builder = createPipelineContextBuilder({
        adapter,
        timezone: 'UTC',
        requestIdFactory: () => '',
    });

    try {
        await builder.buildRequestContext('', { currentDate: '2026-04-13' });
        assert.fail('Expected error');
    } catch (error) {
        // Should mention both requestId and userMessage issues
        assert.ok(error.message.includes('requestId'));
        assert.ok(error.message.includes('userMessage'));
    }
});

// ============================================================
// T002: AX extraction receives canonical context
// ============================================================

test('T002: pipeline passes canonical context fields to AX extraction', async () => {
    // This test verifies the pipeline -> AX contract by checking the harness
    const { createPipelineHarness } = await import('./pipeline-harness.js');

    let axOptions = null;
    const harness = createPipelineHarness({
        intents: async (userMessage, options) => {
            axOptions = options;
            return [];
        },
        now: '2026-04-13T10:00:00Z',
    });

    await harness.processMessage('Test AX context', { entryPoint: 'test' });

    assert.ok(axOptions, 'AX should have been called');
    assert.equal(axOptions.currentDate, '2026-04-13', 'AX receives currentDate');
    assert.ok(Array.isArray(axOptions.availableProjects), 'AX receives availableProjects');
    assert.ok(axOptions.availableProjects.includes('Inbox'), 'AX receives project names');
});

// ============================================================
// T003: Normalization consumes canonical context
// ============================================================

test('T003: pipeline passes canonical context fields to normalizer', async () => {
    const { createPipelineHarness } = await import('./pipeline-harness.js');
    const { normalizeActions } = await import('../services/normalizer.js');

    let normOptions = null;
    const wrappedNormalizer = {
        normalizeActions: (intents, options) => {
            normOptions = options;
            return normalizeActions(intents, options);
        },
    };

    const harness = createPipelineHarness({
        intents: [{
            type: 'create',
            title: 'Test task',
            confidence: 0.9,
        }],
        useRealNormalizer: false,
        normalizedActions: [{
            type: 'create',
            title: 'Test task',
            confidence: 0.9,
            valid: true,
            validationErrors: [],
        }],
    });

    // Replace normalizer with wrapped version
    const { createPipeline } = await import('../services/pipeline.js');
    const pipeline = createPipeline({
        axIntent: { extractIntents: async () => [{ type: 'create', title: 'Test', confidence: 0.9 }] },
        normalizer: wrappedNormalizer,
        adapter: harness.adapter,
    });

    await pipeline.processMessage('Test', { currentDate: '2026-04-13' });

    assert.ok(normOptions, 'Normalizer should receive options');
    assert.ok(Array.isArray(normOptions.projects), 'Normalizer receives projects array');
    assert.equal(typeof normOptions.timezone, 'string', 'Normalizer receives timezone');
    assert.ok(typeof normOptions.currentDate === 'string', 'Normalizer receives currentDate');
});

// ============================================================
// Integration: full pipeline with valid context
// ============================================================

test('WP01: full pipeline flow with canonical context succeeds', async () => {
    const { createPipelineHarness } = await import('./pipeline-harness.js');

    const harness = createPipelineHarness({
        intents: [{
            type: 'create',
            title: 'Buy groceries',
            confidence: 0.9,
        }],
        now: '2026-04-13T10:00:00Z',
    });

    const result = await harness.processMessage('Buy groceries for tomorrow');

    assert.equal(result.type, 'task');
    assert.ok(result.requestId, 'Result includes requestId');
    assert.ok(result.entryPoint !== undefined, 'Result includes entryPoint');
    assert.ok(result.mode !== undefined, 'Result includes mode');
});
