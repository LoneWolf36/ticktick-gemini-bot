import { createPipeline } from '../services/pipeline.js';
import * as normalizer from '../services/normalizer.js';

export const DEFAULT_PROJECTS = [
    { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Inbox' },
    { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Career' },
    { id: 'cccccccccccccccccccccccc', name: 'Personal' },
];

export function createPipelineHarness({
    intents = [],
    projects = DEFAULT_PROJECTS,
    now = '2026-03-10T10:00:00Z',
    useRealNormalizer = true,
    normalizedActions = null,
    adapterOverrides = {},
    observability = undefined,
} = {}) {
    const axCalls = [];
    const adapterCalls = {
        listProjects: 0,
        create: [],
        update: [],
        complete: [],
        delete: [],
    };

    const axIntent = {
        extractIntents: async (userMessage, options = {}) => {
            axCalls.push({ userMessage, options });
            if (typeof intents === 'function') {
                return intents(userMessage, options);
            }
            return intents;
        },
    };

    const baseAdapter = {
        listProjects: async () => {
            adapterCalls.listProjects += 1;
            return projects;
        },
        getTaskSnapshot: async (taskId, projectId) => ({
            id: taskId,
            projectId,
            title: `Task ${taskId}`,
            content: null,
            priority: 0,
            dueDate: null,
            repeatFlag: null,
            status: 0,
        }),
        createTask: async (action) => {
            adapterCalls.create.push(action);
            return { id: 'task-created', ...action };
        },
        updateTask: async (taskId, action) => {
            adapterCalls.update.push({ taskId, action });
            return { id: taskId, ...action };
        },
        completeTask: async (taskId, projectId) => {
            adapterCalls.complete.push({ taskId, projectId });
            return { completed: true, taskId };
        },
        deleteTask: async (taskId, projectId) => {
            adapterCalls.delete.push({ taskId, projectId });
            return { deleted: true, taskId };
        },
        restoreTask: async (taskId, snapshot) => ({ id: taskId, ...snapshot }),
    };
    const adapter = { ...baseAdapter, ...adapterOverrides };

    const normalizerImpl = useRealNormalizer
        ? { normalizeActions: (input, options) => normalizer.normalizeActions(input, options) }
        : { normalizeActions: () => normalizedActions ?? [] };

    const pipeline = createPipeline({
        axIntent,
        normalizer: normalizerImpl,
        adapter,
        ...(observability ? { observability } : {}),
    });

    const processMessage = (userMessage, options = {}) => (
        pipeline.processMessage(userMessage, {
            currentDate: now,
            ...options,
        })
    );

    return {
        pipeline,
        processMessage,
        adapterCalls,
        axCalls,
        adapter,
        projects,
    };
}
