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

    const adapter = {
        listProjects: async () => {
            adapterCalls.listProjects += 1;
            return projects;
        },
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
    };

    const normalizerImpl = useRealNormalizer
        ? { normalizeActions: (input, options) => normalizer.normalizeActions(input, options) }
        : { normalizeActions: () => normalizedActions ?? [] };

    const pipeline = createPipeline({ axIntent, normalizer: normalizerImpl, adapter });

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
