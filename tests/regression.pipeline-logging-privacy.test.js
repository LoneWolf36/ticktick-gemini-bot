import test from 'node:test';
import assert from 'node:assert/strict';

import { createPipelineObservability } from '../services/pipeline-observability.js';
import { createPipelineHarness } from './pipeline-harness.js';

test('R12: pipeline does not leak raw user messages in telemetry events', async () => {
  const telemetryEvents = [];
  const observability = createPipelineObservability({
    eventSink: async (event, context) => { telemetryEvents.push({ event, context }); },
    logger: null,
  });

  const sensitiveTitle = 'Highly Sensitive Task Title';
  const harness = createPipelineHarness({
    intents: [{ type: 'create', title: sensitiveTitle, confidence: 0.9, content: 'Highly Sensitive Task Description' }],
    observability,
    activeTasks: [{ id: 'task-privacy-1', title: sensitiveTitle, content: 'Highly Sensitive Task Description', projectId: 'inbox', status: 0 }],
  });

  const sensitiveMessage = 'Call mom about the secret project details';
  await harness.processMessage(sensitiveMessage, {
    requestId: 'req-privacy-test',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  for (const observed of telemetryEvents) {
    const eventJson = JSON.stringify(observed);
    assert.equal(eventJson.includes(sensitiveMessage), false, `Telemetry event should not contain raw user message: ${eventJson.substring(0, 200)}`);
    assert.equal(eventJson.includes(sensitiveTitle), false, 'Telemetry event should not contain raw task titles');
  }
});

test('R12: pipeline context does not store raw user message in lifecycle state', async () => {
  const harness = createPipelineHarness({
    intents: [{ type: 'create', title: 'Highly Sensitive Task Title', confidence: 0.9, content: 'Highly Sensitive Task Description' }],
    activeTasks: [{ id: 'task-sensitive-1', title: 'Highly Sensitive Task Title', content: 'Highly Sensitive Task Description', projectId: 'inbox', status: 0 }],
  });

  const sensitiveMessage = 'Secret personal information in this message';
  const result = await harness.processMessage(sensitiveMessage, {
    requestId: 'req-privacy-context',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  const lifecycleJson = JSON.stringify(result.pipelineContext.lifecycle);
  assert.equal(lifecycleJson.includes(sensitiveMessage), false, 'Pipeline lifecycle state should not contain raw user message');
  assert.equal(lifecycleJson.includes('Highly Sensitive Task Title'), false, 'Pipeline lifecycle state should not contain raw task titles');
  assert.equal(lifecycleJson.includes('Highly Sensitive Task Description'), false, 'Pipeline lifecycle state should not contain raw task descriptions');
  assert.ok(result.pipelineContext.lifecycle.request.userMessageLength > 0, 'Pipeline context should contain userMessageLength metadata');
});

test('R12: pipeline console logs do not leak raw user messages', async () => {
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args.join(' '));

  try {
    const harness = createPipelineHarness({
      intents: [{ type: 'create', title: 'Sensitive Console Title', confidence: 0.9 }],
    });

    const sensitiveMessage = 'Confidential information should not appear in logs';
    await harness.processMessage(sensitiveMessage, {
      requestId: 'req-console-log-privacy',
      entryPoint: 'telegram',
      mode: 'interactive',
    });

    const logOutput = logs.join(' ');
    assert.equal(logOutput.includes(sensitiveMessage), false, 'Console logs should not contain raw user message');
    assert.equal(logOutput.includes('Sensitive Console Title'), false, 'Console logs should not contain raw task titles');
    assert.ok(logOutput.includes('Processing message'), 'Console logs should still indicate message processing');
  } finally {
    console.log = originalLog;
  }
});

test('R12: unexpected pipeline errors do not leak raw error messages in logs or telemetry', async () => {
  const originalError = console.error;
  const logs = [];
  const telemetryEvents = [];
  console.error = (...args) => logs.push(args.join(' '));

  try {
    const observability = createPipelineObservability({
      eventSink: async (event, context) => { telemetryEvents.push({ event, context }); },
      logger: null,
    });
    const sensitiveErrorText = 'Sensitive thrown error with private task details';
    const harness = createPipelineHarness({
      intents: () => { throw new Error(sensitiveErrorText); },
      observability,
    });

    await harness.processMessage('please process a private request', {
      requestId: 'req-error-log-privacy',
      entryPoint: 'telegram',
      mode: 'interactive',
    });

    const logOutput = logs.join(' ');
    const telemetryJson = JSON.stringify(telemetryEvents);
    assert.equal(logOutput.includes(sensitiveErrorText), false, 'Console errors should not contain raw error messages');
    assert.equal(telemetryJson.includes(sensitiveErrorText), false, 'Telemetry should not contain raw error messages');
    assert.ok(telemetryJson.includes('errorName'), 'Telemetry should retain safe error classification');
  } finally {
    console.error = originalError;
  }
});

test('R12: pipeline terminal telemetry is privacy-safe and receipt-shaped', async () => {
  const telemetryEvents = [];
  const observability = createPipelineObservability({
    eventSink: async (event) => { telemetryEvents.push(event); },
    logger: null,
  });

  const harness = createPipelineHarness({
    intents: [{ type: 'create', title: 'Terminal telemetry task', confidence: 0.9, projectHint: 'Inbox' }],
    observability,
  });

  await harness.processMessage('create terminal telemetry task', {
    requestId: 'req-terminal-telemetry',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  const terminalEvent = telemetryEvents.find(event => event.eventType === 'pipeline.operation.terminal');
  assert.ok(terminalEvent, 'expected terminal telemetry event');
  assert.equal(terminalEvent.metadata.requestId, 'req-terminal-telemetry');
  assert.equal(terminalEvent.metadata.entryPoint, 'telegram');
  assert.equal(terminalEvent.metadata.command, 'freeform');
  assert.equal(terminalEvent.metadata.operationType, 'create');
  assert.equal(terminalEvent.metadata.status, 'applied');
  assert.equal(terminalEvent.metadata.scope, 'ticktick_live');
  assert.equal(terminalEvent.metadata.dryRun, false);
  assert.equal(terminalEvent.metadata.applied, true);
  assert.equal(terminalEvent.metadata.changed, true);
  assert.equal(terminalEvent.metadata.fallbackUsed, false);

  const terminalJson = JSON.stringify(terminalEvent);
  assert.equal(terminalJson.includes('Terminal telemetry task'), false, 'terminal telemetry should not contain raw task title');
  assert.equal(terminalJson.includes('create terminal telemetry task'), false, 'terminal telemetry should not contain raw user message');
});

test('R12: terminal failure telemetry uses allowed errorClass values and no raw error text', async () => {
  const telemetryEvents = [];
  const observability = createPipelineObservability({
    eventSink: async (event) => { telemetryEvents.push(event); },
    logger: null,
  });

  const sensitiveErrorText = 'adapter boom secret text';
  const harness = createPipelineHarness({
    intents: () => { throw new Error(sensitiveErrorText); },
    observability,
  });

  await harness.processMessage('create failure telemetry task', {
    requestId: 'req-terminal-failure-telemetry',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  const terminalEvent = telemetryEvents.find(event => event.eventType === 'pipeline.operation.terminal');
  assert.ok(terminalEvent, 'expected terminal telemetry event');
  assert.ok(
    ['validation', 'auth', 'ticktick_unavailable', 'model_unavailable', 'routing', 'stale_preview', 'lock', 'unknown']
      .includes(terminalEvent.metadata.errorClass),
    `expected allowed errorClass, got ${terminalEvent.metadata.errorClass}`,
  );

  const terminalJson = JSON.stringify(terminalEvent);
  assert.equal(terminalJson.includes(sensitiveErrorText), false, 'terminal telemetry should not contain raw error text');
  assert.equal(terminalJson.includes('Error'), false, 'terminal telemetry should not expose raw error objects');
});

test('R12: execution terminal failure telemetry stays privacy-safe and receipt-shaped', async () => {
  const telemetryEvents = [];
  const observability = createPipelineObservability({
    eventSink: async (event) => { telemetryEvents.push(event); },
    logger: null,
  });

  const sensitiveErrorText = 'execution branch adapter failure text';
  const harness = createPipelineHarness({
    intents: [{ type: 'create', title: 'Execution failure telemetry task', confidence: 0.9, projectHint: 'Inbox' }],
    observability,
    adapterOverrides: {
      createTask: async () => { throw new Error(sensitiveErrorText); },
    },
  });

  await harness.processMessage('create execution failure telemetry task', {
    requestId: 'req-exec-failure-telemetry',
    entryPoint: 'telegram',
    mode: 'interactive',
  });

  const terminalEvent = telemetryEvents.find(event => event.eventType === 'pipeline.operation.terminal');
  assert.ok(terminalEvent, 'expected terminal telemetry event');
  assert.equal(terminalEvent.metadata.status, 'failed');
  assert.equal(terminalEvent.metadata.scope, 'system');
  assert.equal(terminalEvent.metadata.dryRun, false);
  assert.equal(terminalEvent.metadata.applied, false);
  assert.equal(terminalEvent.metadata.changed, false);
  assert.ok(
    ['validation', 'auth', 'ticktick_unavailable', 'model_unavailable', 'routing', 'stale_preview', 'lock', 'unknown']
      .includes(terminalEvent.metadata.errorClass),
    `expected allowed errorClass, got ${terminalEvent.metadata.errorClass}`,
  );

  const terminalJson = JSON.stringify(terminalEvent);
  assert.equal(terminalJson.includes(sensitiveErrorText), false, 'terminal telemetry should not contain raw error text');
  assert.equal(terminalJson.includes('Execution failure telemetry task'), false, 'terminal telemetry should not contain raw task title');
  assert.equal(terminalJson.includes('create execution failure telemetry task'), false, 'terminal telemetry should not contain raw user message');
});
