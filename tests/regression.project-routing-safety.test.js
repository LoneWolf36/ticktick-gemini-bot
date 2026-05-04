import test from 'node:test';
import assert from 'node:assert/strict';

import { createPipelineHarness, DEFAULT_PROJECTS } from './pipeline-harness.js';
import { projectNameFor } from '../services/shared-utils.js';

test('pipeline context keeps exact configured project matches allowed', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        intents: [
            {
                type: 'create',
                title: 'Plan sprint',
                projectHint: 'Career',
                confidence: 0.9
            }
        ]
    });

    const result = await processMessage('plan sprint in career');

    assert.equal(result.type, 'task');
    assert.equal(adapterCalls.create.length, 1);
    assert.equal(adapterCalls.create[0].projectId, DEFAULT_PROJECTS[1].id);
});

test('pipeline context matches opaque default project IDs exactly', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        projects: [
            { id: 'inbox118958109', name: 'Inbox' },
            { id: 'career-xyz', name: 'Career' }
        ],
        intents: [
            {
                type: 'create',
                title: 'Plan sprint',
                projectHint: 'inbox118958109',
                confidence: 0.9
            }
        ]
    });

    const result = await processMessage('plan sprint in inbox118958109');

    assert.equal(result.type, 'task');
    assert.equal(adapterCalls.create.length, 1);
    assert.equal(adapterCalls.create[0].projectId, 'inbox118958109');
});

test('pipeline blocks create when Inbox/default destination missing', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        projects: [{ id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Career' }],
        intents: [
            {
                type: 'create',
                title: 'Buy groceries',
                confidence: 0.9
            }
        ]
    });

    const result = await processMessage('buy groceries');

    assert.equal(result.type, 'blocked');
    assert.equal(result.errors[0], 'missing_project_destination');
    assert.equal(result.operationReceipt?.destination?.confidence, 'missing');
    assert.equal(adapterCalls.create.length, 0);
});

test('pipeline blocks create on duplicate project names', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        projects: [
            { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Inbox' },
            { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Career' },
            { id: 'cccccccccccccccccccccccc', name: 'Career' }
        ],
        intents: [
            {
                type: 'create',
                title: 'Plan sprint',
                projectHint: 'Career',
                confidence: 0.9
            }
        ]
    });

    const result = await processMessage('plan sprint in career');

    assert.equal(result.type, 'blocked');
    assert.equal(result.errors[0], 'ambiguous_project_destination');
    assert.equal(result.operationReceipt?.destination?.confidence, 'ambiguous');
    assert.equal(result.operationReceipt?.destination?.choices?.length, 2);
    assert.equal(adapterCalls.create.length, 0);
});

test('pipeline blocks create when default project name is duplicated and no hint exists', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        projects: [
            { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Inbox' },
            { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Career' },
            { id: 'cccccccccccccccccccccccc', name: 'Inbox' }
        ],
        intents: [
            {
                type: 'create',
                title: 'Buy groceries',
                confidence: 0.9
            }
        ]
    });

    const result = await processMessage('buy groceries');

    assert.equal(result.type, 'blocked');
    assert.equal(result.errors[0], 'missing_project_destination');
    assert.equal(result.operationReceipt?.destination?.confidence, 'missing');
    assert.equal(adapterCalls.create.length, 0);
});

test('pipeline blocks update with unmatched explicit project hint', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        intents: [
            {
                type: 'update',
                taskId: 'task000000000000000000002',
                targetQuery: 'Write weekly report',
                title: 'Write weekly report',
                projectHint: 'Missing Project',
                confidence: 0.9
            }
        ]
    });

    const result = await processMessage('update weekly report in missing project');

    assert.equal(result.type, 'blocked');
    assert.equal(result.errors[0], 'missing_project_destination');
    assert.equal(adapterCalls.update.length, 0);
});

test('pipeline blocks create without a configured default even if Inbox exists', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        projects: [
            { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Inbox' },
            { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Career' }
        ],
        intents: [
            {
                type: 'create',
                title: 'Buy groceries',
                confidence: 0.9
            }
        ]
    });

    const result = await processMessage('buy groceries');

    assert.equal(result.type, 'blocked');
    assert.equal(result.errors[0], 'missing_project_destination');
    assert.equal(result.operationReceipt?.destination?.confidence, 'missing');
    assert.equal(adapterCalls.create.length, 0);
});

test('projectNameFor stays display-only for inbox-like ids', () => {
    assert.equal(projectNameFor('inboxXYZ', []), 'Inbox');
    assert.equal(projectNameFor('inbox-like', []), 'Inbox');
});
