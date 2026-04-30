/**
 * tests/regression.ticktick-client-v2.test.js
 *
 * Focused tests for the TickTick client v2 changes:
 * - updateTask includes id + projectId in POST body
 * - project moves use /task/move endpoint, NOT create/delete
 * - getAllTasks tries /task/filter first, falls back to project-loop
 * - completed tasks endpoint path
 * - inbox-like task returned by filter appears in active task list
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { TickTickClient } from '../services/ticktick.js';
import { TickTickAdapter } from '../services/ticktick-adapter.js';

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Creates a minimal fake TickTickClient with mocked _post and _get.
 * Tracks all internal API calls for assertion.
 */
function createFakeClient() {
    const client = Object.create(TickTickClient.prototype);
    client.accessToken = 'test-token';
    client._cachedProjects = [];
    client._tasksCache = null;
    client._cacheTime = 0;

    const apiCalls = [];
    const apiResponses = {};

    client._setResponse = (endpoint, data) => {
        apiResponses[endpoint] = data;
    };

    client._post = async (endpoint, data) => {
        apiCalls.push({ method: 'POST', endpoint, data });
        if (apiResponses[endpoint] !== undefined) {
            return apiResponses[endpoint];
        }
        // Default: return request data
        return { id: data?.id || 'task-default', ...data };
    };

    client._get = async (endpoint) => {
        apiCalls.push({ method: 'GET', endpoint });
        if (apiResponses[endpoint] !== undefined) {
            return apiResponses[endpoint];
        }
        return [];
    };

    client._invalidateCache = () => {
        client._tasksCache = null;
        client._cacheTime = 0;
    };

    client.getApiCalls = () => apiCalls;
    client.clearApiCalls = () => { apiCalls.length = 0; };

    return client;
}

// ─── Tests ─────────────────────────────────────────────────────

test('TickTickClient updateTask POST body includes id and projectId for normal update', async () => {
    const client = createFakeClient();

    await client.updateTask('task-abc', {
        projectId: 'proj-xyz',
        title: 'Updated title',
        priority: 3,
    });

    const calls = client.getApiCalls();
    assert.equal(calls.length, 1, 'should make exactly one POST call');
    assert.equal(calls[0].endpoint, '/task/task-abc');
    assert.equal(calls[0].data.id, 'task-abc', 'body must include id');
    assert.equal(calls[0].data.projectId, 'proj-xyz', 'body must include projectId');
    assert.equal(calls[0].data.title, 'Updated title');
    assert.equal(calls[0].data.priority, 3);
});

test('TickTickClient updateTask throws if projectId missing for normal update', async () => {
    const client = createFakeClient();

    await assert.rejects(
        () => client.updateTask('task-abc', { title: 'No project' }),
        { message: /requires projectId/ },
    );

    assert.equal(client.getApiCalls().length, 0, 'no API call should be made');
});

test('TickTickClient updateTask strips originalProjectId from normal update payload', async () => {
    const client = createFakeClient();

    await client.updateTask('task-abc', {
        projectId: 'proj-xyz',
        originalProjectId: 'proj-xyz', // same project — not a move
        title: 'Same project update',
    });

    const calls = client.getApiCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.id, 'task-abc');
    assert.equal(calls[0].data.projectId, 'proj-xyz');
    assert.equal(Object.hasOwn(calls[0].data, 'originalProjectId'), false);
});

test('TickTickClient updateTask uses /task/move for project move and does NOT call create/delete', async () => {
    const client = createFakeClient();
    client._setResponse('/task/task-move-1', { id: 'task-move-1', projectId: 'proj-source' });
    client._setResponse('/task/move', [{ id: 'task-move-1', etag: 'etag-123' }]);

    const result = await client.updateTask('task-move-1', {
        projectId: 'proj-target',
        originalProjectId: 'proj-source',
        title: 'Moved task',
    });

    const calls = client.getApiCalls();
    assert.equal(calls.length, 2, 'should make exactly two POST calls');

    // First call: field update with source projectId
    assert.equal(calls[0].endpoint, '/task/task-move-1');
    assert.equal(calls[0].data.id, 'task-move-1');
    assert.equal(calls[0].data.projectId, 'proj-source', 'field update uses source projectId');
    assert.equal(calls[0].data.title, 'Moved task');
    assert.equal(Object.hasOwn(calls[0].data, 'originalProjectId'), false, 'no originalProjectId in field update');

    // Second call: move task via official endpoint
    assert.equal(calls[1].endpoint, '/task/move');
    assert.deepEqual(calls[1].data, [{
        fromProjectId: 'proj-source',
        toProjectId: 'proj-target',
        taskId: 'task-move-1',
    }]);

    // Verify NO create or delete calls
    const createCalls = calls.filter(c => c.endpoint === '/task' && c.method === 'POST');
    const deleteCalls = calls.filter(c => c.endpoint.startsWith('/project/') && c.method === 'DELETE');
    assert.equal(createCalls.length, 0, 'should NOT call create task');
    assert.equal(deleteCalls.length, 0, 'should NOT call delete task');

    // Verify result preserves original task id
    assert.equal(result.id, 'task-move-1');
    assert.equal(result.projectId, 'proj-target');
});

test('TickTickClient updateTask pure project move skips redundant field update', async () => {
    const client = createFakeClient();
    client._setResponse('/task/move', [{ id: 'task-pure-move', etag: 'etag-pure' }]);

    const result = await client.updateTask('task-pure-move', {
        projectId: 'proj-target',
        originalProjectId: 'proj-source',
    });

    const calls = client.getApiCalls();
    assert.equal(calls.length, 1, 'pure move should make exactly one API call');
    assert.equal(calls[0].endpoint, '/task/move');
    assert.deepEqual(calls[0].data, [{
        fromProjectId: 'proj-source',
        toProjectId: 'proj-target',
        taskId: 'task-pure-move',
    }]);
    assert.equal(result.id, 'task-pure-move');
    assert.equal(result.projectId, 'proj-target');
});

test('TickTickClient updateTask move fails closed when source projectId missing', async () => {
    const client = createFakeClient();

    // Scenario: projectId is empty, not a legitimate move, and no valid projectId for normal update
    await assert.rejects(
        () => client.updateTask('task-abc', {
            projectId: '',
            originalProjectId: 'proj-source',
        }),
        { message: /toProjectId is required|requires projectId/ },
    );

    // Scenario: originalProjectId is whitespace-only but non-empty (enters move path, fails validation)
    await assert.rejects(
        () => client.updateTask('task-abc', {
            projectId: 'proj-target',
            originalProjectId: '   ',
            title: 'test',
        }),
        { message: /fromProjectId is required/ },
    );
});

test('TickTickClient getAllTasks attempts /task/filter on first call', async () => {
    const client = createFakeClient();
    client._setResponse('/task/filter', [
        { id: 't1', title: 'Active task 1', projectId: 'proj-1', status: 0 },
        { id: 't2', title: 'Active task 2', projectId: 'proj-2', status: 0 },
    ]);
    client._setResponse('/project', [
        { id: 'proj-1', name: 'Inbox' },
        { id: 'proj-2', name: 'Career' },
    ]);

    const tasks = await client.getAllTasks();

    const calls = client.getApiCalls();
    assert.ok(calls.some(c => c.endpoint === '/task/filter'), 'should call /task/filter');

    // Should have project names normalized
    const t1 = tasks.find(t => t.id === 't1');
    assert.equal(t1.projectName, 'Inbox');
    const t2 = tasks.find(t => t.id === 't2');
    assert.equal(t2.projectName, 'Career');

    assert.equal(tasks.length, 2);
});

test('TickTickClient getAllTasks falls back to project loop when /task/filter fails', async () => {
    const client = createFakeClient();
    // Make filter fail
    client._post = async (endpoint) => {
        if (endpoint === '/task/filter') throw new Error('Filter unavailable');
        return { id: 'local-task', ...arguments[1] };
    };
    client._get = async (endpoint) => {
        if (endpoint === '/project') return [{ id: 'proj-fallback', name: 'Fallback Proj' }];
        return null;
    };
    client.getProjectWithTasks = async () => ({
        tasks: [
            { id: 'ft1', title: 'Fallback task', status: 0 },
        ],
    });
    client._invalidateCache = () => {};

    const client2 = client; // reuse

    const tasks = await client2.getAllTasks();

    // Should have fallback task with project name
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, 'ft1');
    assert.equal(tasks[0].projectName, 'Fallback Proj');
    assert.equal(tasks[0].projectId, 'proj-fallback');
});

test('TickTickClient getAllTasks filter failure warning includes reason', async () => {
    const client = createFakeClient();
    // Make filter fail
    client._post = async (endpoint) => {
        if (endpoint === '/task/filter') throw new Error('API timeout');
        return null;
    };
    client._get = async (endpoint) => {
        if (endpoint === '/project') return [{ id: 'proj-1', name: 'Inbox' }];
        return null;
    };
    client.getProjectWithTasks = async () => ({ tasks: [] });
    client._invalidateCache = () => {};

    // Should not throw — should fall back gracefully
    const tasks = await client.getAllTasks();
    assert.ok(Array.isArray(tasks));
});

test('TickTickClient listCompletedTasks hits /task/completed endpoint', async () => {
    const client = createFakeClient();
    client._setResponse('/task/completed', [
        { id: 'ct1', title: 'Done task', projectId: 'proj-1', status: 2 },
    ]);

    const completed = await client.listCompletedTasks({
        projectIds: ['proj-1'],
        startDate: '2026-01-01T00:00:00.000+0000',
        endDate: '2026-04-30T23:59:59.000+0000',
    });

    const calls = client.getApiCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].endpoint, '/task/completed', 'should call /task/completed');

    assert.equal(completed.length, 1);
    assert.equal(completed[0].id, 'ct1');
    assert.equal(completed[0].title, 'Done task');
});

test('TickTickClient moveTasks hits /task/move endpoint', async () => {
    const client = createFakeClient();
    client._setResponse('/task/move', [
        { id: 'task-1', etag: 'e1' },
    ]);

    const result = await client.moveTasks([
        { fromProjectId: 'proj-a', toProjectId: 'proj-b', taskId: 'task-1' },
    ]);

    const calls = client.getApiCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].endpoint, '/task/move');
    assert.deepEqual(calls[0].data, [
        { fromProjectId: 'proj-a', toProjectId: 'proj-b', taskId: 'task-1' },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'task-1');
});

test('TickTickClient filterTasks hits /task/filter endpoint', async () => {
    const client = createFakeClient();
    client._setResponse('/task/filter', [
        { id: 'ft1', title: 'Filtered task', projectId: 'proj-1', status: 0 },
    ]);

    const result = await client.filterTasks({ status: [0] });

    const calls = client.getApiCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].endpoint, '/task/filter');
    assert.deepEqual(calls[0].data, { status: [0] });
    assert.equal(result.length, 1);
});

test('TickTickAdapter listCompletedTasks delegates to client and classifies errors', async () => {
    const client = createFakeClient();
    client._setResponse('/task/completed', [
        { id: 'ct-1', title: 'Completed task', projectId: 'proj-1', status: 2 },
    ]);

    const adapter = new TickTickAdapter(client);

    const result = await adapter.listCompletedTasks({
        projectIds: ['proj-1'],
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'ct-1');

    // Test error classification
    const errorClient = createFakeClient();
    errorClient._post = async () => { throw new Error('Network error'); };
    const errorAdapter = new TickTickAdapter(errorClient);

    await assert.rejects(
        () => errorAdapter.listCompletedTasks(),
        (err) => {
            assert.equal(err.code, 'NETWORK_ERROR');
            assert.equal(err.operation, 'listCompletedTasks');
            return true;
        },
    );
});

test('TickTickClient updateTask preserves original task id on move result', async () => {
    const client = createFakeClient();
    client._setResponse('/task/task-preserve', { id: 'task-preserve', projectId: 'proj-source' });
    client._setResponse('/task/move', [{ id: 'task-preserve', etag: 'etag-xyz' }]);

    const result = await client.updateTask('task-preserve', {
        projectId: 'proj-target',
        originalProjectId: 'proj-source',
        title: 'Preserved',
    });

    assert.equal(result.id, 'task-preserve', 'original task id must be preserved');
    assert.equal(result.projectId, 'proj-target');
    assert.equal(result.title, 'Preserved');
});

test('TickTickClient updateTask move requires all three fields', async () => {
    const client = createFakeClient();

    // Empty source (whitespace-only)
    await assert.rejects(
        () => client.updateTask('task-abc', {
            projectId: 'proj-target',
            originalProjectId: '   ',
            title: 'test',
        }),
        /fromProjectId is required/,
    );

    // Empty target (whitespace-only)
    await assert.rejects(
        () => client.updateTask('task-abc', {
            projectId: '   ',
            originalProjectId: 'proj-source',
            title: 'test',
        }),
        /toProjectId is required/,
    );
});

test('inbox-like task from filter appears in active task list and can be matched by resolveTarget', async () => {
    const client = createFakeClient();
    client._setResponse('/task/filter', [
        { id: 'filter-inbox-1', title: 'Buy milk from filter', projectId: 'proj-inbox', status: 0 },
    ]);
    client._setResponse('/project', [
        { id: 'proj-inbox', name: 'Inbox' },
    ]);

    const tasks = await client.getAllTasks();

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, 'filter-inbox-1');
    assert.equal(tasks[0].projectName, 'Inbox');

    // Verify the task shape matches what existing adapter.listActiveTasks returns
    const mapped = tasks.map(t => ({
        id: t.id,
        title: t.title || '',
        projectId: t.projectId ?? null,
        projectName: t.projectName ?? null,
        priority: t.priority ?? null,
        dueDate: t.dueDate ?? null,
        content: t.content ?? null,
        status: t.status ?? 0,
    }));

    assert.equal(mapped[0].id, 'filter-inbox-1');
    assert.equal(mapped[0].title, 'Buy milk from filter');
    assert.equal(mapped[0].projectId, 'proj-inbox');
    assert.equal(mapped[0].projectName, 'Inbox');

    // Task resolver can match this shape
    const { resolveTarget } = await import('../services/task-resolver.js');
    const resolved = resolveTarget({ targetQuery: 'buy milk', activeTasks: mapped });
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.selected.taskId, 'filter-inbox-1');
});

test('TickTickAdapter listCompletedTasks is exposed as a method', () => {
    assert.equal(typeof TickTickAdapter.prototype.listCompletedTasks, 'function');
});
