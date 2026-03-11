import { TickTickClient } from './ticktick.js';

const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class TickTickAdapter {
    constructor(client) {
        if (!(client instanceof TickTickClient)) {
            throw new Error('TickTickAdapter requires a TickTickClient instance');
        }
        this._client = client;
        this._projectCache = null;
        this._projectCacheTs = 0;
    }

    _log(operation, data, isError = false) {
        const timestamp = new Date().toISOString();
        const msg = `[Adapter] ${operation}: ${JSON.stringify(data)}`;
        if (isError) {
            console.error(`${timestamp} ${msg}`);
        } else {
            console.log(`${timestamp} ${msg}`);
        }
    }

    async listProjects(forceRefresh = false) {
        const start = Date.now();
        this._log('listProjects', { forceRefresh });
        try {
            const now = Date.now();
            if (!forceRefresh && this._projectCache && (now - this._projectCacheTs < PROJECT_CACHE_TTL_MS)) {
                const elapsed = Date.now() - start;
                this._log('listProjects', `SUCCESS { cached: true, ${elapsed}ms }`);
                return this._projectCache;
            }

            const projects = await this._client.getProjects();
            this._projectCache = projects;
            this._projectCacheTs = now;

            const elapsed = Date.now() - start;
            this._log('listProjects', `SUCCESS { count: ${projects.length}, ${elapsed}ms }`);
            return projects;
        } catch (error) {
            const elapsed = Date.now() - start;
            this._log('listProjects', `FAILED { error: "${error.message}", ${elapsed}ms }`, true);
            throw error;
        }
    }

    async findProjectByName(nameHint) {
        const start = Date.now();
        this._log('findProjectByName', { nameHint });
        try {
            if (!nameHint) {
                const elapsed = Date.now() - start;
                this._log('findProjectByName', `SUCCESS { match: null, ${elapsed}ms }`);
                return null;
            }

            const projects = await this.listProjects();
            const lowerHint = nameHint.toLowerCase();

            let exactMatch = null;
            let startsWithMatches = [];
            let containsMatches = [];

            for (const p of projects) {
                const lowerName = p.name.toLowerCase();
                if (lowerName === lowerHint) {
                    if (!exactMatch || p.name.length < exactMatch.name.length) {
                        exactMatch = p;
                    }
                } else if (lowerName.startsWith(lowerHint)) {
                    startsWithMatches.push(p);
                } else if (lowerName.includes(lowerHint)) {
                    containsMatches.push(p);
                }
            }

            let match = null;
            if (exactMatch) {
                match = exactMatch;
            } else if (startsWithMatches.length > 0) {
                startsWithMatches.sort((a, b) => a.name.length - b.name.length);
                match = startsWithMatches[0];
            } else if (containsMatches.length > 0) {
                containsMatches.sort((a, b) => a.name.length - b.name.length);
                match = containsMatches[0];
            }

            const result = match ? { id: match.id, name: match.name } : null;
            const elapsed = Date.now() - start;
            this._log('findProjectByName', `SUCCESS { match: ${JSON.stringify(result)}, ${elapsed}ms }`);
            return match;
        } catch (error) {
            const elapsed = Date.now() - start;
            this._log('findProjectByName', `FAILED { error: "${error.message}", ${elapsed}ms }`, true);
            throw error;
        }
    }

    async createTask(normalizedAction) {
        const start = Date.now();
        this._log('createTask', { title: normalizedAction.title, projectId: normalizedAction.projectId });
        try {
            const taskData = {};
            if (normalizedAction.title !== undefined && normalizedAction.title !== null) taskData.title = normalizedAction.title;
            if (normalizedAction.content !== undefined && normalizedAction.content !== null) taskData.content = normalizedAction.content;
            if (normalizedAction.dueDate !== undefined && normalizedAction.dueDate !== null) taskData.dueDate = normalizedAction.dueDate;
            if (normalizedAction.priority !== undefined && normalizedAction.priority !== null) taskData.priority = normalizedAction.priority;
            if (normalizedAction.projectId !== undefined && normalizedAction.projectId !== null) taskData.projectId = normalizedAction.projectId;
            if (normalizedAction.repeatFlag !== undefined && normalizedAction.repeatFlag !== null) taskData.repeatFlag = normalizedAction.repeatFlag;

            const createdTask = await this._client.createTask(taskData);
            const elapsed = Date.now() - start;
            this._log('createTask', `SUCCESS { id: "${createdTask.id}", ${elapsed}ms }`);
            return createdTask;
        } catch (error) {
            const elapsed = Date.now() - start;
            this._log('createTask', `FAILED { error: "${error.message}", ${elapsed}ms }`, true);
            throw error;
        }
    }

    async createTasksBatch(normalizedActions) {
        const start = Date.now();
        this._log('createTasksBatch', { count: normalizedActions.length });

        const results = { created: [], failed: [] };

        for (const action of normalizedActions) {
            try {
                const createdTask = await this.createTask(action);
                results.created.push(createdTask);
            } catch (error) {
                results.failed.push({ action, error: error.message });
            }
        }

        const elapsed = Date.now() - start;
        this._log('createTasksBatch', `SUCCESS { created: ${results.created.length}, failed: ${results.failed.length}, ${elapsed}ms }`);
        return results;
    }

    async getTaskSnapshot(taskId, projectId) {
        const start = Date.now();
        this._log('getTaskSnapshot', { taskId, projectId });
        try {
            if (!taskId || !projectId) {
                throw new Error('getTaskSnapshot requires both taskId and projectId');
            }

            const task = await this._client.getTask(projectId, taskId);
            const snapshot = {
                id: task.id,
                projectId: task.projectId ?? projectId ?? null,
                title: task.title || '',
                content: task.content ?? null,
                priority: task.priority ?? null,
                dueDate: task.dueDate ?? null,
                repeatFlag: task.repeatFlag ?? null,
                status: task.status ?? null,
            };

            const elapsed = Date.now() - start;
            this._log('getTaskSnapshot', `SUCCESS { id: "${snapshot.id}", ${elapsed}ms }`);
            return snapshot;
        } catch (error) {
            const elapsed = Date.now() - start;
            this._log('getTaskSnapshot', `FAILED { error: "${error.message}", ${elapsed}ms }`, true);
            throw error;
        }
    }

    async updateTask(taskId, normalizedAction) {
        const start = Date.now();
        const projectId = normalizedAction.originalProjectId || normalizedAction.projectId;
        this._log('updateTask', { taskId, projectId });
        try {
            if (!projectId) {
                throw new Error('updateTask requires a projectId either in normalizedAction.originalProjectId or normalizedAction.projectId to fetch the existing task');
            }

            const existingTask = await this._client.getTask(projectId, taskId);
            const sourceProjectId = normalizedAction.originalProjectId || existingTask.projectId || projectId;
            const targetProjectId = normalizedAction.projectId ?? sourceProjectId;

            const updatePayload = {};

            if (normalizedAction.title !== undefined) updatePayload.title = normalizedAction.title;
            if (normalizedAction.dueDate !== undefined) updatePayload.dueDate = normalizedAction.dueDate;
            if (normalizedAction.priority !== undefined) updatePayload.priority = normalizedAction.priority;
            if (targetProjectId !== undefined && targetProjectId !== null) updatePayload.projectId = targetProjectId;
            if (normalizedAction.repeatFlag !== undefined) updatePayload.repeatFlag = normalizedAction.repeatFlag;

            // Handle content merge (FR-007)
            if (normalizedAction.content !== undefined) {
                const newContent = normalizedAction.content || '';
                const oldContent = existingTask.content || '';

                if (oldContent) {
                    if (oldContent === newContent || newContent === '') {
                        // No change or clearing content (though intent usually has something)
                    } else if (newContent.includes(oldContent)) {
                        // Already merged by normalizer or caller
                        updatePayload.content = newContent;
                    } else if (oldContent.includes(newContent)) {
                        // New content already part of old content
                    } else {
                        // Append new content with standard separator
                        updatePayload.content = `${oldContent}\n---\n${newContent}`;
                    }
                } else {
                    updatePayload.content = newContent;
                }
            }

            if (sourceProjectId && targetProjectId && targetProjectId !== sourceProjectId) {
                updatePayload.originalProjectId = sourceProjectId;
            }

            const updatedTask = await this._client.updateTask(taskId, updatePayload);
            const elapsed = Date.now() - start;
            this._log('updateTask', `SUCCESS { id: "${updatedTask.id}", changedProject: ${!!updatePayload.originalProjectId}, ${elapsed}ms }`);
            return updatedTask;
        } catch (error) {
            const elapsed = Date.now() - start;
            this._log('updateTask', `FAILED { error: "${error.message}", ${elapsed}ms }`, true);
            throw error;
        }
    }

    async restoreTask(taskId, snapshot) {
        const start = Date.now();
        this._log('restoreTask', { taskId, snapshotTaskId: snapshot?.id, projectId: snapshot?.projectId ?? null });
        try {
            if (!taskId) {
                throw new Error('restoreTask requires a taskId');
            }
            if (!snapshot || typeof snapshot !== 'object') {
                throw new Error('restoreTask requires a snapshot');
            }

            const payload = {
                title: snapshot.title ?? '',
                content: snapshot.content ?? null,
                dueDate: snapshot.dueDate ?? null,
                priority: snapshot.priority ?? null,
                projectId: snapshot.projectId ?? null,
                repeatFlag: snapshot.repeatFlag ?? null,
            };

            const restoredTask = await this._client.updateTask(taskId, payload);
            const elapsed = Date.now() - start;
            this._log('restoreTask', `SUCCESS { id: "${restoredTask.id}", ${elapsed}ms }`);
            return restoredTask;
        } catch (error) {
            const elapsed = Date.now() - start;
            this._log('restoreTask', `FAILED { error: "${error.message}", ${elapsed}ms }`, true);
            throw error;
        }
    }

    async completeTask(taskId, projectId) {
        const start = Date.now();
        this._log('completeTask', { taskId, projectId });
        try {
            await this._client.completeTask(projectId, taskId);
            const elapsed = Date.now() - start;
            this._log('completeTask', `SUCCESS { id: "${taskId}", ${elapsed}ms }`);
            return { completed: true, taskId };
        } catch (error) {
            const elapsed = Date.now() - start;
            this._log('completeTask', `FAILED { error: "${error.message}", ${elapsed}ms }`, true);
            throw error;
        }
    }

    async deleteTask(taskId, projectId) {
        const start = Date.now();
        this._log('deleteTask', { taskId, projectId });
        try {
            await this._client.deleteTask(projectId, taskId);
            const elapsed = Date.now() - start;
            this._log('deleteTask', `SUCCESS { id: "${taskId}", ${elapsed}ms }`);
            return { deleted: true, taskId };
        } catch (error) {
            const elapsed = Date.now() - start;
            this._log('deleteTask', `FAILED { error: "${error.message}", ${elapsed}ms }`, true);
            throw error;
        }
    }
}
