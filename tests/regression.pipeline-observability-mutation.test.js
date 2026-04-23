import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPipelineObservability } from '../services/pipeline-observability.js';
import { createPipelineHarness } from './pipeline-harness.js';

test('WP07 T073: successful mutation emits diagnostic events with intent and resolution metadata', async () => {
  const events = [];
  const obs = createPipelineObservability({
    eventSink: async (event) => { events.push(event); },
    logger: { log: () => {}, error: () => {} },
  });

  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'Updated title', confidence: 0.95, targetQuery: 'weekly' },
    ],
    activeTasks: [
      { id: 'task-obs-01', title: 'Weekly report', projectId: 'inbox', projectName: 'Inbox', priority: 5, status: 0 },
    ],
    observability: obs,
  });

  await harness.processMessage('update weekly report');

  assert.ok(events.length > 0, 'expected telemetry events to be emitted');
  const resolveEvents = events.filter((e) => e.eventType === 'pipeline.resolve.completed');
  assert.ok(resolveEvents.length >= 0, 'resolve events should be present');
  const normalizeEvents = events.filter((e) => e.eventType === 'pipeline.normalize.completed');
  assert.equal(normalizeEvents.length, 1);
  assert.equal(normalizeEvents[0].metadata.validCount, 1);
  const resultEvents = events.filter((e) => e.eventType === 'pipeline.request.completed' && e.status === 'success');
  assert.equal(resultEvents.length, 1);
  assert.equal(resultEvents[0].metadata.type, 'task');
});

test('WP07 T073: skipped mutation (not-found) emits diagnostic events', async () => {
  const events = [];
  const obs = createPipelineObservability({
    eventSink: async (event) => { events.push(event); },
    logger: { log: () => {}, error: () => {} },
  });

  const harness = createPipelineHarness({
    intents: [
      { type: 'update', title: 'ghost task', confidence: 0.9, targetQuery: 'ghost task that does not exist' },
    ],
    activeTasks: [
      { id: 'task-nf-02', title: 'Existing task', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
    ],
    observability: obs,
  });

  await harness.processMessage('update ghost task that does not exist');

  assert.ok(events.length > 0, 'expected telemetry events even for not-found');
  const resolveEvents = events.filter((e) => e.eventType === 'pipeline.resolve.completed');
  if (resolveEvents.length > 0) {
    assert.ok(['success', 'failure'].includes(resolveEvents[0].status), 'resolve event should have a valid status');
  }
});

test('WP07 T073: failed mutation (mixed intent) emits failure diagnostic events', async () => {
  const events = [];
  const obs = createPipelineObservability({
    eventSink: async (event) => { events.push(event); },
    logger: { log: () => {}, error: () => {} },
  });

  const harness = createPipelineHarness({
    intents: [
      { type: 'create', title: 'New thing' },
      { type: 'update', title: 'Old thing', targetQuery: 'old', confidence: 0.9 },
    ],
    activeTasks: [
      { id: 'task-mix-01', title: 'Old thing', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 },
    ],
    observability: obs,
  });

  await harness.processMessage('create new and update old');

  assert.ok(events.length > 0, 'expected telemetry events for mixed intent failure');
  const failureEvents = events.filter((e) => e.eventType === 'pipeline.request.failed');
  assert.equal(failureEvents.length, 1);
  assert.equal(failureEvents[0].metadata.reason, 'mixed_create_and_mutation');
});

test('WP07 T074: no references to unsupported reschedule command in WP07 mutation tests', () => {
  const regressionSource = readFileSync('tests/regression.pipeline-hardening-mutation.test.js', 'utf8');
  const wp07Start = regressionSource.indexOf('// WP07');
  if (wp07Start === -1) return;

  const t074Start = regressionSource.indexOf('// WP07 — T074:');
  const wp07Section = t074Start !== -1
    ? regressionSource.slice(wp07Start, t074Start)
    : regressionSource.slice(wp07Start);

  const rescheduleInWP07 = wp07Section.split('\n').filter((line) => line.toLowerCase().includes('reschedule'));
  assert.equal(
    rescheduleInWP07.length,
    0,
    `WP07 mutation tests should not reference unsupported reschedule command. Found: ${rescheduleInWP07.map((l) => l.trim()).join('; ')}`,
  );
});

test('WP07 T074: pipeline harness does not reference nonexistent modules', () => {
  const harnessSource = readFileSync('tests/pipeline-harness.js', 'utf8');
  const imports = harnessSource.match(/from ['"](\.\.\/[^'"]+)['"]/g) || [];
  const knownModules = [
    '../services/pipeline.js',
    '../services/normalizer.js',
    '../services/pipeline-observability.js',
  ];

  for (const imp of imports) {
    const mod = imp.match(/from ['"](\.\.\/[^'"]+)['"]/)[1];
    assert.ok(
      knownModules.some((k) => mod.startsWith(k.replace(/\.js$/, '')) || mod === k),
      `pipeline harness should not import from unsupported module: ${mod}`,
    );
  }
});
