import test from 'node:test';
import assert from 'node:assert/strict';

import { createPipelineHarness } from './pipeline-harness.js';

test('R2: canonical multi-create executes independent create actions', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        intents: [
            { type: 'create', title: 'Book flight', confidence: 0.95 },
            { type: 'create', title: 'Pack bag', confidence: 0.95 },
            { type: 'create', title: 'Call uber friday', dueDate: '2026-03-13', confidence: 0.95 },
        ],
        now: '2026-03-10T10:00:00Z',
    });

    const result = await processMessage('book flight, pack bag, and call uber friday');

    assert.equal(result.type, 'task');
    assert.equal(adapterCalls.create.length, 3, 'should create three separate tasks');
    assert.match(adapterCalls.create[0].title, /book flight/i);
    assert.match(adapterCalls.create[1].title, /pack bag/i);
    assert.match(adapterCalls.create[2].title, /call uber/i);
    assert.equal(adapterCalls.create[2].dueDate, '2026-03-13');
    assert.equal(result.confirmationText, '✅ Created 3 tasks');
});

test('R2: clear create executes while ambiguous create fragment requests clarification', async () => {
    const clarificationQuestion = 'For "call uber friday", what exact task should I create?';
    const { processMessage, adapterCalls } = createPipelineHarness({
        intents: [
            { type: 'create', title: 'Book flight', confidence: 0.95 },
            {
                type: 'create',
                title: 'Call uber friday',
                clarification: true,
                clarificationQuestion,
                confidence: 0.4,
            },
        ],
    });

    const result = await processMessage('book flight and call uber friday');

    assert.equal(result.type, 'task', 'clear action should execute immediately');
    assert.equal(adapterCalls.create.length, 1, 'only clear create should be executed');
    assert.match(adapterCalls.create[0].title, /book flight/i);
    assert.equal(result.confirmationText, `✅ Created: Book flight\n\n${clarificationQuestion}`);
    assert.ok(result.confirmationText.includes(clarificationQuestion), 'result should include focused clarification question');
    assert.equal(result.clarification?.reason, 'ambiguous_create_fragment');
});

test('R2: checklist ambiguity flow still returns clarification without writes', async () => {
    const { processMessage, adapterCalls } = createPipelineHarness({
        intents: [
            {
                type: 'create',
                title: 'Plan event',
                confidence: 0.8,
                checklistItems: [
                    { title: 'Book venue' },
                    { title: 'Send invites' },
                ],
            },
            { type: 'create', title: 'Buy decorations', confidence: 0.8 },
        ],
    });

    const result = await processMessage('Plan event with venue and invites, also buy decorations');

    assert.equal(result.type, 'clarification');
    assert.equal(result.clarification?.reason, 'ambiguous_checklist_vs_multi_task');
    assert.equal(adapterCalls.create.length, 0, 'should not create tasks until preference is clarified');
});
