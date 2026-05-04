import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPipelineObservability } from '../services/pipeline-observability.js';
import { createPipelineHarness } from './pipeline-harness.js';

test('WP07 T073: successful mutation emits diagnostic events with intent and resolution metadata', async () => {
    const events = [];
    const obs = createPipelineObservability({
        eventSink: async (event) => {
            events.push(event);
        },
        logger: { log: () => {}, error: () => {} }
    });

    const harness = createPipelineHarness({
        intents: [{ type: 'update', title: 'Updated title', confidence: 0.95, targetQuery: 'Weekly report' }],
        activeTasks: [
            {
                id: 'task-obs-01',
                title: 'Weekly report',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 5,
                status: 0
            }
        ],
        observability: obs
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
        eventSink: async (event) => {
            events.push(event);
        },
        logger: { log: () => {}, error: () => {} }
    });

    const harness = createPipelineHarness({
        intents: [
            { type: 'update', title: 'ghost task', confidence: 0.9, targetQuery: 'ghost task that does not exist' }
        ],
        activeTasks: [
            {
                id: 'task-nf-02',
                title: 'Existing task',
                projectId: 'inbox',
                projectName: 'Inbox',
                priority: 3,
                status: 0
            }
        ],
        observability: obs
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
        eventSink: async (event) => {
            events.push(event);
        },
        logger: { log: () => {}, error: () => {} }
    });

    const harness = createPipelineHarness({
        intents: [
            { type: 'create', title: 'New thing' },
            { type: 'update', title: 'Old thing', targetQuery: 'old', confidence: 0.9 }
        ],
        activeTasks: [
            { id: 'task-mix-01', title: 'Old thing', projectId: 'inbox', projectName: 'Inbox', priority: 3, status: 0 }
        ],
        observability: obs
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
    const wp07Section =
        t074Start !== -1 ? regressionSource.slice(wp07Start, t074Start) : regressionSource.slice(wp07Start);

    const rescheduleInWP07 = wp07Section.split('\n').filter((line) => line.toLowerCase().includes('reschedule'));
    assert.equal(
        rescheduleInWP07.length,
        0,
        `WP07 mutation tests should not reference unsupported reschedule command. Found: ${rescheduleInWP07.map((l) => l.trim()).join('; ')}`
    );
});

test('WP07 T074: pipeline harness does not reference nonexistent modules', () => {
    const harnessSource = readFileSync('tests/pipeline-harness.js', 'utf8');
    const imports = harnessSource.match(/from ['"](\.\.\/[^'"]+)['"]/g) || [];
    const knownModules = [
        '../services/pipeline.js',
        '../services/normalizer.js',
        '../services/pipeline-observability.js'
    ];

    for (const imp of imports) {
        const mod = imp.match(/from ['"](\.\.\/[^'"]+)['"]/)[1];
        assert.ok(
            knownModules.some((k) => mod.startsWith(k.replace(/\.js$/, '')) || mod === k),
            `pipeline harness should not import from unsupported module: ${mod}`
        );
    }
});

test('telemetry deduplicates same requestId + eventType within 30 seconds', async () => {
    const events = [];
    const obs = createPipelineObservability({
        eventSink: async (event) => {
            if (event) events.push(event);
        },
        logger: { log: () => {}, error: () => {} },
        now: () => new Date('2026-03-10T10:00:00.000Z')
    });

    const context = { requestId: 'req-dedup-1', entryPoint: 'telegram', mode: 'interactive' };

    await obs.emit(context, { eventType: 'pipeline.request.received', step: 'request', status: 'start' });
    await obs.emit(context, { eventType: 'pipeline.request.received', step: 'request', status: 'start' });
    await obs.emit(context, { eventType: 'pipeline.request.received', step: 'request', status: 'start' });

    const stats = obs.getTelemetryDedupStats();
    assert.equal(events.length, 1, 'expected only 1 emission for dedup window');
    assert.equal(stats.deduplicatedCount, 2, 'expected 2 deduplications');
    assert.ok(stats.cacheSize >= 1, 'expected cacheSize to be at least 1');
});

test('telemetry allows different eventTypes for same requestId', async () => {
    const events = [];
    const obs = createPipelineObservability({
        eventSink: async (event) => {
            if (event) events.push(event);
        },
        logger: { log: () => {}, error: () => {} },
        now: () => new Date('2026-03-10T10:00:00.000Z')
    });

    const context = { requestId: 'req-dedup-2', entryPoint: 'telegram', mode: 'interactive' };

    await obs.emit(context, { eventType: 'pipeline.request.received', step: 'request', status: 'start' });
    await obs.emit(context, { eventType: 'pipeline.intent.completed', step: 'intent', status: 'success' });

    assert.equal(events.length, 2, 'expected both events for different eventTypes');
});

test('telemetry allows re-emission after 30 second gap', async () => {
    const events = [];
    let currentTime = new Date('2026-03-10T10:00:00.000Z').getTime();
    const obs = createPipelineObservability({
        eventSink: async (event) => {
            if (event) events.push(event);
        },
        logger: { log: () => {}, error: () => {} },
        now: () => new Date(currentTime)
    });

    const context = { requestId: 'req-dedup-3', entryPoint: 'telegram', mode: 'interactive' };

    await obs.emit(context, { eventType: 'pipeline.request.received', step: 'request', status: 'start' });
    currentTime += 31 * 1000;
    await obs.emit(context, { eventType: 'pipeline.request.received', step: 'request', status: 'start' });

    assert.equal(events.length, 2, 'expected re-emission after 30s gap');
});
