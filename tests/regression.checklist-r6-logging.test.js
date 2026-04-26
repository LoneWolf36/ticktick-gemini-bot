import test from 'node:test';
import assert from 'node:assert/strict';

import { mock } from 'node:test';

import { createPipeline } from '../services/pipeline.js';
import { createPipelineObservability } from '../services/pipeline-observability.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';
import * as normalizer from '../services/normalizer.js';

test('R6: checklist telemetry shows extracted->normalized->adapter mapping with metadata only', async () => {
  const observed = [];
  const adapterLogs = [];
  const sensitiveMessage = 'Ultra secret checklist message';
  const sensitiveChecklistTitle = 'Ultra Secret Checklist Item';
  let createPayload = null;

  const client = Object.create(TickTickClient.prototype);
  client.getProjects = async () => [{ id: '507f191e810c19729de860ea', name: 'Inbox' }];
  client.getAllTasksCached = async () => [];
  client.createTask = async (payload) => {
    createPayload = payload;
    return { id: 'created-r6-task', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  adapter._observeSignals = () => {};

  const telemetry = createPipelineObservability({
    eventSink: async (event, context) => {
      observed.push({ event, context });
    },
    logger: null,
  });

  const pipeline = createPipeline({
    intentExtractor: {
      extractIntents: async () => ([
        {
          type: 'create',
          title: 'Sensitive Parent Task',
          checklistItems: [
            { title: `${sensitiveChecklistTitle} 1` },
            { title: '' },
            { title: `${sensitiveChecklistTitle} 2` },
          ],
        },
      ]),
    },
    normalizer: {
      normalizeActions: (intents, options) => normalizer.normalizeActions(intents, options),
    },
    adapter,
    observability: telemetry,
  });

  const originalLog = console.log;
  console.log = mock.fn((...args) => {
    adapterLogs.push(args.join(' '));
  });

  let result;
  try {
    result = await pipeline.processMessage(sensitiveMessage, {
      requestId: 'req-checklist-r6',
      entryPoint: 'telegram',
      mode: 'interactive',
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(result.type, 'task');
  assert.ok(createPayload);
  assert.ok(Array.isArray(createPayload.items));
  assert.equal(createPayload.items.length, 2, 'adapter payload should contain only valid checklist items');

  const intentEvent = observed.find((entry) => entry.event.eventType === 'pipeline.intent.completed');
  const normalizeEvent = observed.find((entry) => entry.event.eventType === 'pipeline.normalize.completed');
  const executeEvent = observed.find((entry) => entry.event.eventType === 'pipeline.execute.succeeded');

  assert.ok(intentEvent, 'intent event should exist');
  assert.ok(normalizeEvent, 'normalize event should exist');
  assert.ok(executeEvent, 'execute event should exist');

  assert.deepEqual(intentEvent.event.metadata.checklistIntentShape, [{ intentIndex: 0, checklistItemCount: 3 }]);
  assert.deepEqual(normalizeEvent.event.metadata.checklistActionShape, [{ actionIndex: 0, sourceIntentIndex: 0, checklistItemCount: 2 }]);
  assert.equal(executeEvent.event.metadata.checklistItemCount, 2);
  assert.equal(executeEvent.event.metadata.adapterChecklistPayloadCount, 2);

  const checklistMappingLog = adapterLogs.find((line) => line.includes('createTask.checklistMapping'));
  assert.ok(checklistMappingLog, 'adapter checklist mapping log should exist');
  assert.match(checklistMappingLog, /"checklistInputCount":2/);
  assert.match(checklistMappingLog, /"checklistPayloadCount":2/);
  assert.match(checklistMappingLog, /"checklistDroppedCount":0/);

  const observedJson = JSON.stringify(observed);
  assert.equal(observedJson.includes(sensitiveMessage), false, 'telemetry should not include raw message content');
  assert.equal(observedJson.includes(sensitiveChecklistTitle), false, 'telemetry should not include raw checklist item titles');

  const adapterLogJson = adapterLogs.join('\n');
  assert.equal(adapterLogJson.includes(sensitiveChecklistTitle), false, 'adapter logs should not include raw checklist item titles');
});
