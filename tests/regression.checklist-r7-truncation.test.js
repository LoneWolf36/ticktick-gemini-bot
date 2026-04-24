import test from 'node:test';
import assert from 'node:assert/strict';

import { createPipelineHarness } from './pipeline-harness.js';

test('R7: pipeline truncates over-limit checklist items to 30', async () => {
    const checklistItems = Array.from({ length: 35 }, (_, index) => ({
        title: `item ${index + 1}`,
    }));

    const { processMessage, adapterCalls } = createPipelineHarness({
        intents: [
            {
                type: 'create',
                title: 'Plan launch checklist',
                confidence: 0.95,
                checklistItems,
            },
        ],
    });

    const result = await processMessage('plan launch checklist with many steps');

    assert.equal(result.type, 'task');
    assert.equal(adapterCalls.create.length, 1, 'should still create one parent task');
    assert.equal(adapterCalls.create[0].checklistItems.length, 30, 'checklist should be truncated to cap');
    assert.equal(adapterCalls.create[0].checklistItems[0].title, 'Item 1');
    assert.equal(adapterCalls.create[0].checklistItems[29].title, 'Item 30');
});
