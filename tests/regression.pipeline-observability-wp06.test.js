import test from 'node:test';
import assert from 'node:assert/strict';

import { createPipeline } from '../services/pipeline.js';
import { createPipelineObservability } from '../services/pipeline-observability.js';
import { createIntentExtractor, QuotaExhaustedError } from '../services/intent-extraction.js';
import { createPipelineHarness } from './pipeline-harness.js';

// =========================================================================
// WP06 — T017: Observability event structure assertions (stable contract)
// =========================================================================

test('WP06 T017: observability events expose stable contract fields', async () => {
  const telemetryEvents = [];
  const observability = createPipelineObservability({
    eventSink: async (event) => { telemetryEvents.push(event); },
    logger: null,
  });

  const harness = createPipelineHarness({
    intents: [{ type: 'create', title: 'Telemetry test task', confidence: 0.9 }],
    observability,
  });

  await harness.processMessage('create a telemetry test task', {
    requestId: 'req-obs-contract',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  // Every event MUST have these stable fields regardless of step
  const requiredFields = [
    'eventType', 'timestamp', 'requestId', 'entryPoint', 'step', 'status',
    'durationMs', 'failureClass', 'actionType', 'attempt', 'rolledBack', 'metadata',
  ];

  for (const event of telemetryEvents) {
    for (const field of requiredFields) {
      assert.ok(Object.hasOwn(event, field), `event ${event.eventType} missing field: ${field}`);
    }
  }

  // Request-received events have stable step name
  const receivedEvents = telemetryEvents.filter(e => e.eventType === 'pipeline.request.received');
  assert.equal(receivedEvents.length, 1);
  assert.equal(receivedEvents[0].step, 'request');
  assert.equal(receivedEvents[0].status, 'start');
  assert.equal(receivedEvents[0].requestId, 'req-obs-contract');
  assert.equal(receivedEvents[0].entryPoint, 'telegram_message');
});

test('WP06 T017: observability failure events include failureClass and rolledBack', async () => {
  const telemetryEvents = [];
  const observability = createPipelineObservability({
    eventSink: async (event) => { telemetryEvents.push(event); },
    logger: null,
  });

  const harness = createPipelineHarness({
    intents: [{ type: 'create', title: 'Will fail', confidence: 0.9 }],
    adapterOverrides: {
      createTask: async () => { throw new Error('Adapter unavailable'); },
    },
    observability,
  });

  await harness.processMessage('create will fail', {
    requestId: 'req-obs-failure-class',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  // Find the failure event with failureClass set
  const failureEvents = telemetryEvents.filter(e => e.failureClass !== null);
  assert.ok(failureEvents.length > 0, 'expected at least one event with failureClass');

  const adapterFailure = failureEvents.find(e => e.failureClass === 'adapter');
  assert.ok(adapterFailure, 'expected adapter failureClass event');
  assert.equal(adapterFailure.rolledBack, false);
  assert.equal(adapterFailure.status, 'failure');
});

// =========================================================================
// WP06 — T020: Fail-closed behavior — failure class + user message shape
// =========================================================================

test('WP06 T020: fail-closed — malformed intent extraction returns user-safe message without leaking diagnostics', async () => {
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => 'garbage: <html>error page</html>',
    },
    normalizer: {
      normalizeActions: () => [],
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
    },
  });

  const result = await pipeline.processMessage('do something', {
    requestId: 'req-fail-closed-malformed',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'malformed_intent');
  // User message MUST be compact and MUST NOT leak raw error text
  assert.match(result.confirmationText, /could not understand/i);
  assert.equal(result.confirmationText.includes('<html>'), false);
  assert.equal(result.confirmationText.includes('garbage'), false);
  // Developer diagnostics stay hidden by default
  assert.equal(result.diagnostics.length, 0);
});

test('WP06 T020: fail-closed — validation failure returns user-safe message', async () => {
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: '' }],
    },
    normalizer: {
      normalizeActions: (intents) => intents.map(intent => ({
        ...intent,
        projectId: 'inbox',
        valid: false,
        validationErrors: ['title is required for create actions'],
      })),
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
    },
  });

  const result = await pipeline.processMessage('create a task', {
    requestId: 'req-fail-closed-validation',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'validation');
  assert.match(result.confirmationText, /could not validate/i);
  // Should NOT leak internal field names to the user
  assert.equal(result.confirmationText.includes('validationErrors'), false);
});

test('WP06 T020: fail-closed — adapter failure returns generic retry message', async () => {
  let createAttempts = 0;
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: 'Test task' }],
    },
    normalizer: {
      normalizeActions: (intents) => intents.map(intent => ({
        ...intent,
        projectId: 'inbox',
        valid: true,
        validationErrors: [],
      })),
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
      createTask: async () => {
        createAttempts += 1;
        throw new Error('TickTick API 503 Service Unavailable');
      },
    },
  });

  const result = await pipeline.processMessage('create test', {
    requestId: 'req-fail-closed-adapter',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'adapter');
  assert.equal(result.failure.failureCategory, 'transient');
  assert.equal(result.failure.retryable, true);
  assert.equal(createAttempts, 2);
  assert.match(result.confirmationText, /failed.*retry|retry.*shortly/i);
  // User message MUST NOT expose internal error details
  assert.equal(result.confirmationText.includes('503'), false);
  assert.equal(result.confirmationText.includes('Service Unavailable'), false);
});

test('WP06 T020: permanent adapter failures do not retry and ask for correction', async () => {
  let createAttempts = 0;
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: 'Test task' }],
    },
    normalizer: {
      normalizeActions: (intents) => intents.map(intent => ({
        ...intent,
        projectId: 'missing-project',
        valid: true,
        validationErrors: [],
      })),
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
      createTask: async () => {
        createAttempts += 1;
        throw new Error('Missing project: could not resolve project');
      },
    },
  });

  const result = await pipeline.processMessage('create test', {
    requestId: 'req-fail-closed-adapter-permanent',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'adapter');
  assert.equal(result.failure.failureCategory, 'permanent');
  assert.equal(result.failure.retryable, false);
  assert.equal(createAttempts, 1);
  assert.match(result.confirmationText, /correct.*retry|could not be applied/i);
  assert.equal(result.confirmationText.includes('missing-project'), false);
});

test('WP06 T020: fail-closed — quota exhaustion returns user-safe message', async () => {
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => { throw new QuotaExhaustedError('All API keys exhausted'); },
    },
    normalizer: { normalizeActions: () => [] },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
    },
  });

  const result = await pipeline.processMessage('create test', {
    requestId: 'req-fail-closed-quota',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'quota');
  assert.match(result.confirmationText, /quota.*exhausted|try.*again/i);
});

test('WP06 R4: pipeline surfaces rate-limit ETA in user message when adapter provides retry metadata', async () => {
  let createAttempts = 0;
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: 'Rate limited task' }],
    },
    normalizer: {
      normalizeActions: (intents) => intents.map((intent) => ({
        ...intent,
        projectId: 'inbox',
        valid: true,
        validationErrors: [],
      })),
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
      createTask: async () => {
        createAttempts += 1;
        const error = new Error('429 Too Many Requests');
        error.code = 'RATE_LIMITED';
        error.retryAfterMs = 90000;
        error.retryAt = new Date(Date.now() + 90000).toISOString();
        throw error;
      },
    },
  });

  const result = await pipeline.processMessage('create rate-limited task', {
    requestId: 'req-r4-rate-limit-eta',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'adapter');
  assert.equal(result.failure.failureCategory, 'transient');
  assert.equal(createAttempts, 1, 'pipeline should not re-hit TickTick after adapter-level 429 handling');
  assert.match(result.confirmationText, /(retry|try again).*(minute|second|at|in)/i);

  const failureDetails = result.failure?.details || {};
  const firstFailure = Array.isArray(failureDetails.failures) ? failureDetails.failures[0] : null;
  assert.ok(
    Number.isFinite(failureDetails.retryAfterMs)
      || typeof failureDetails.retryAt === 'string'
      || Number.isFinite(firstFailure?.retryAfterMs)
      || typeof firstFailure?.retryAt === 'string',
    'expected retry ETA metadata preserved in failure details',
  );
});

test('WP06 R4: pipeline distinguishes quota exhaustion from transient rate limiting', async () => {
  const makePipeline = (errorFactory) => createPipeline({
    intentExtractor: {
      extractIntents: async () => [{ type: 'create', title: 'Task' }],
    },
    normalizer: {
      normalizeActions: (intents) => intents.map((intent) => ({
        ...intent,
        projectId: 'inbox',
        valid: true,
        validationErrors: [],
      })),
    },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
      createTask: async () => {
        throw errorFactory();
      },
    },
  });

  const transientResult = await makePipeline(() => {
    const error = new Error('429 Too Many Requests');
    error.code = 'RATE_LIMITED';
    error.retryAfterMs = 30000;
    return error;
  }).processMessage('create transient', {
    requestId: 'req-r4-transient',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  const quotaResult = await makePipeline(() => {
    const error = new Error('Quota exhausted for task writes');
    error.code = 'QUOTA_EXHAUSTED';
    return error;
  }).processMessage('create quota', {
    requestId: 'req-r4-quota',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(transientResult.type, 'error');
  assert.equal(quotaResult.type, 'error');

  assert.equal(transientResult.failure.class, 'adapter');
  assert.equal(quotaResult.failure.class, 'adapter');
  assert.equal(transientResult.failure.failureCategory, 'transient');
  assert.equal(quotaResult.failure.failureCategory, 'permanent');
  assert.notEqual(
    transientResult.confirmationText,
    quotaResult.confirmationText,
    'quota exhaustion and transient rate limits should produce distinguishable user feedback',
  );
  assert.match(quotaResult.confirmationText, /quota/i);
});

// =========================================================================
// WP06 — T012: Failure-path regressions (additional coverage)
// =========================================================================

test('WP06 T012: pipeline classifies malformed intent extraction output when extractIntents returns non-array', async () => {
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => ({ not: 'an array' }),
    },
    normalizer: { normalizeActions: () => [] },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
    },
  });

  const result = await pipeline.processMessage('test malformed', {
    requestId: 'req-malformed-non-array',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  assert.equal(result.type, 'error');
  assert.equal(result.failure.class, 'malformed_intent');
});

test('WP06 T012: pipeline handles intent extraction returning null intents', async () => {
  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => null,
    },
    normalizer: { normalizeActions: () => [] },
    adapter: {
      listProjects: async () => [{ id: 'inbox', name: 'Inbox' }],
      listActiveTasks: async () => [],
    },
  });

  const result = await pipeline.processMessage('test null', {
    requestId: 'req-null-intents',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  // Null from intent extraction is treated as empty/non-task, not malformed
  assert.equal(result.type, 'error');
  assert.ok(['malformed_intent', 'unexpected', 'validation'].includes(result.failure.class),
    `null intents should fail with a known class, got: ${result.failure.class}`);
});
