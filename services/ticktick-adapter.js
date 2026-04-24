import { TickTickClient } from './ticktick.js';
import { validateChecklistItem } from './shared-utils.js';
import { classifyTaskEvent } from './behavioral-signals.js';
import { appendBehavioralSignals, DEFAULT_BEHAVIORAL_USER_ID } from './store.js';

const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const VALID_PRIORITIES = [0, 1, 3, 5]; // TickTick valid priority values
const ACTION_VERB_REGEX = /^(call|email|pay|book|write|draft|review|ship|send|apply|buy|clean|fix|prepare|schedule|plan|submit|update|organize|finish|confirm|get|set|message|follow|protect)\b/i;
/**
 * TickTick Adapter - Narrow interface for all TickTick REST API interactions.
 * Wraps TickTickClient with validation, error classification, and structured logging.
 * 
 * @example
 * const adapter = new TickTickAdapter(new TickTickClient(credentials));
 * await adapter.createTask({ title: 'My Task', projectId: 'abc123...' });
 */
export class TickTickAdapter {
    constructor(client) {
        if (!(client instanceof TickTickClient)) {
            throw new Error('TickTickAdapter requires a TickTickClient instance');
        }
        this._client = client;
        this._projectCache = null;
        this._projectCacheTs = 0;
    }

    /**
     * Logs adapter operations with structured format.
     * @param {string} operation - Operation name (e.g., 'createTask', 'updateTask')
     * @param {object|string} data - Data to log (will be JSON.stringify'd)
     * @param {boolean} isError - Whether this is an error log
     * @private
     */
    _log(operation, data, isError = false) {
        const timestamp = new Date().toISOString();
        const msg = `[Adapter] ${operation}: ${JSON.stringify(data)}`;
        if (isError) {
            console.error(`${timestamp} ${msg}`);
        } else {
            console.log(`${timestamp} ${msg}`);
        }
    }

    /**
     * Observes a task mutation event and emits behavioral signals.
     * NON-BLOCKING: failures are caught and logged, never thrown.
     *
     * @param {string} eventType - 'create' | 'update' | 'complete' | 'delete'
     * @param {object} eventMetadata - Derived metadata only (no raw titles/text)
     * @private
     */
    _observeSignals(eventType, eventMetadata) {
        Promise.resolve().then(async () => {
            const { userId = DEFAULT_BEHAVIORAL_USER_ID, ...safeEventMetadata } = eventMetadata || {};
            const event = {
                eventType,
                timestamp: new Date().toISOString(),
                ...safeEventMetadata,
            };
            const signals = classifyTaskEvent(event);
            if (signals.length > 0) {
                await appendBehavioralSignals(String(userId), signals);
                this._log('behavioralSignals', { userId, signals: signals.length, types: signals.map(s => s.type) });
            }
        }).catch((error) => {
            // NEVER block the mutation — log and continue
            this._log('behavioralSignals', `FAILED (non-blocking): ${error.message}`, true);
        });
    }

    /**
     * Classifies an error for retry decision-making by the pipeline.
     * @param {Error} error - The error to classify
     * @param {string} operation - The operation that failed
     * @returns {Error} Classified error with code, operation, and statusCode properties
     * @private
     */
    _classifyError(error, operation) {
        const classified = new Error(error.message);
        classified.code = error.code || this._getErrorCode(error);
        classified.operation = operation;
        classified.statusCode = error.statusCode || error.response?.status;
        if (error.retryAfterMs !== undefined) classified.retryAfterMs = error.retryAfterMs;
        if (error.retryAt !== undefined) classified.retryAt = error.retryAt;
        if (error.attempts !== undefined) classified.attempts = error.attempts;
        if (error.isQuotaExhausted !== undefined) classified.isQuotaExhausted = error.isQuotaExhausted;
        classified.originalError = error;
        return classified;
    }

    /**
     * Determines error code based on error type and response.
     * @param {Error} error - The error to analyze
     * @returns {string} Error code: AUTH_ERROR, NOT_FOUND, RATE_LIMITED, SERVER_ERROR, NETWORK_ERROR, or API_ERROR
     * @private
     */
    _getErrorCode(error) {
        const status = error.statusCode || error.response?.status;
        if (status === 401 || status === 403) return 'AUTH_ERROR';
        if (status === 404) return 'NOT_FOUND';
        if (status === 429) return 'RATE_LIMITED';
        if (status >= 500) return 'SERVER_ERROR';
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return 'NETWORK_ERROR';
        return 'API_ERROR';
    }

    /**
     * Validates an opaque TickTick entity ID.
     * TickTick IDs are treated as provider-owned opaque strings rather than
     * enforcing a repo-local hex format assumption.
     * @param {string|null|undefined} projectId - Entity ID to validate
     * @param {string} context - Context for error message (e.g., 'completeTask', 'updateTask')
     * @returns {string|null} Validated ID or null if input was null/undefined
     * @throws {Error} If the ID is provided but invalid
     * @private
     */
    _validateProjectId(projectId, context) {
        if (projectId === null || projectId === undefined) {
            return null;
        }
        if (typeof projectId !== 'string') {
            const err = new Error(`${context} requires projectId to be a non-empty string, got ${typeof projectId}`);
            err.code = 'VALIDATION_ERROR';
            throw err;
        }
        if (projectId.trim().length === 0) {
            const err = new Error(`${context} requires projectId to be a non-empty string`);
            err.code = 'VALIDATION_ERROR';
            throw err;
        }
        return projectId;
    }

    /**
     * Validates priority value against TickTick's allowed values.
     * @param {number|null|undefined} priority - Priority to validate
     * @returns {number|null} Validated priority or null if input was null/undefined
     * @throws {Error} If priority is provided but not in [0, 1, 3, 5]
     * @private
     */
    _validatePriority(priority) {
        if (priority === null || priority === undefined) {
            return null;
        }
        if (typeof priority !== 'number' || !VALID_PRIORITIES.includes(priority)) {
            const err = new Error(`Invalid priority value: ${priority}. Must be one of [0, 1, 3, 5]`);
            err.code = 'VALIDATION_ERROR';
            throw err;
        }
        return priority;
    }

    /**
     * Validates and sanitizes task title.
     * @param {string|null|undefined} title - Title to validate
     * @returns {string|null} Trimmed title or null if input was null/undefined
     * @throws {Error} If title is empty after trimming
     * @private
     */
    _validateTitle(title) {
        if (title === null || title === undefined) {
            return null;
        }
        if (typeof title !== 'string') {
            const err = new Error(`Title must be a string, got ${typeof title}`);
            err.code = 'VALIDATION_ERROR';
            throw err;
        }
        const trimmed = title.trim();
        if (trimmed.length === 0) {
            const err = new Error('Title cannot be empty or whitespace only');
            err.code = 'VALIDATION_ERROR';
            throw err;
        }
        return trimmed;
    }

    /**
     * Validates and sanitizes a checklist item.
     * Delegates to shared validateChecklistItem for consistency.
     * @param {Object} item - Checklist item to validate
     * @param {string} item.title - Item title (required, non-empty string)
     * @param {number} [item.status] - Item status (default: 0 for incomplete)
     * @param {number} [item.sortOrder] - Item sort order (default: auto-assigned)
     * @returns {Object|null} Validated checklist item with {title, status, sortOrder} or null if invalid
     * @private
     */
    _validateChecklistItem(item) {
        return validateChecklistItem(item);
    }

    /**
     * Validates and maps checklist items to TickTick payload format.
     * @param {Array<Object>|null|undefined} items - Raw checklist items
     * @returns {Array<Object>|null} Mapped items or null if empty/invalid
     * @private
     */
    _mapChecklistItems(items) {
        if (!items || !Array.isArray(items) || items.length === 0) {
            return null;
        }

        const validItems = [];
        let droppedCount = 0;
        let sortOrder = 0;

        for (const item of items) {
            const validated = this._validateChecklistItem(item);
            if (validated) {
                validated.sortOrder = sortOrder++;
                validItems.push(validated);
            } else {
                droppedCount++;
            }
        }

        if (validItems.length === 0) {
            return null;
        }

        if (droppedCount > 0) {
            this._log('mapChecklistItems', `DROPPED { dropped: ${droppedCount}, kept: ${validItems.length}, reason: "malformed items" }`, true);
        }

        return validItems;
    }

    _deriveBehavioralCreateMetadata(normalizedAction, mappedItems) {
        const title = typeof normalizedAction.title === 'string' ? normalizedAction.title.trim() : '';
        const titleWordCount = title ? title.split(/\s+/).filter(Boolean).length : 0;
        const titleCharacterCount = title.length;
        const contentLength = normalizedAction.content ? normalizedAction.content.length : 0;
        const checklistCountAfter = mappedItems ? mappedItems.length : 0;

        return {
            titleWordCount,
            titleCharacterCount,
            hasActionVerb: ACTION_VERB_REGEX.test(title),
            smallTaskCandidate: titleWordCount > 0 && titleWordCount <= 4 && contentLength <= 80 && checklistCountAfter <= 1,
            checklistCountAfter,
            descriptionLengthAfter: contentLength,
            planningComplexityScore: checklistCountAfter + (contentLength >= 200 ? 3 : 0),
            planningSubtypeA: checklistCountAfter >= 6 || contentLength >= 200,
        };
    }

    /**
     * Validates due date string format.
     * @param {string|null|undefined} dueDate - Due date to validate
     * @returns {string|null} Validated ISO date string or null if input was null/undefined
     * @throws {Error} If dueDate is not a valid ISO date string
     * @private
     */
    _validateDueDate(dueDate) {
        if (dueDate === null || dueDate === undefined) {
            return null;
        }
        if (typeof dueDate !== 'string') {
            const err = new Error(`dueDate must be an ISO date string, got ${typeof dueDate}`);
            err.code = 'VALIDATION_ERROR';
            throw err;
        }
        const parsed = new Date(dueDate);
        if (isNaN(parsed.getTime())) {
            const err = new Error(`Invalid ISO date string: "${dueDate}"`);
            err.code = 'VALIDATION_ERROR';
            throw err;
        }
        return dueDate;
    }

    /**
     * Lists all TickTick projects with caching.
     * @param {boolean} forceRefresh - Force refresh cache
     * @returns {Promise<Array<{id: string, name: string}>>} Array of project objects
     * @throws {Error} Classified error with code if API call fails
     */
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
            const classified = this._classifyError(error, 'listProjects');
            this._log('listProjects', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
            throw classified;
        }
    }

    /**
     * Finds a project by name using fuzzy matching (exact > startsWith > contains).
     * @param {string|null|undefined} nameHint - Project name or partial name to search for
     * @returns {Promise<{id: string, name: string}|null>} Matching project or null if not found
     * @throws {Error} Classified error with code if API call fails
     * 
     * @example
     * const project = await adapter.findProjectByName('Work');
     * if (project) console.log(`Found: ${project.name} (${project.id})`);
     */
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
            const classified = this._classifyError(error, 'findProjectByName');
            this._log('findProjectByName', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
            throw classified;
        }
    }

    /**
     * Creates a single task in TickTick with field validation.
     * @param {Object} normalizedAction - Normalized action object from pipeline
     * @param {string} normalizedAction.title - Task title (required, non-empty)
     * @param {string} [normalizedAction.content] - Task description/notes
     * @param {string} [normalizedAction.dueDate] - ISO 8601 date string (e.g., '2025-04-01T09:00:00.000Z')
     * @param {number} [normalizedAction.priority] - Priority level: 0=none, 1=low, 3=medium, 5=high
     * @param {string} [normalizedAction.projectId] - 24-char hex project ID (falls back to default if null)
     * @param {string} [normalizedAction.repeatFlag] - Recurrence rule (e.g., 'FREQ=DAILY', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
     * @param {Array<Object>} [normalizedAction.checklistItems] - Checklist subtask items with {title, status?, sortOrder?}
     * @returns {Promise<Object>} Created task object from TickTick API
     * @throws {Error} Classified error with code 'VALIDATION_ERROR' for invalid fields, or API error codes
     *
     * @example
     * const task = await adapter.createTask({
     *   title: 'Review PR #123',
     *   projectId: 'abc123def456ghi789jkl012',
     *   priority: 3,
     *   dueDate: '2025-04-01T17:00:00.000Z'
     * });
     *
     * @example
     * const taskWithChecklist = await adapter.createTask({
     *   title: 'Onboard new client',
     *   projectId: 'abc123...',
     *   checklistItems: [
     *     { title: 'Send welcome email' },
     *     { title: 'Create project folder' },
     *     { title: 'Schedule kickoff meeting' }
     *   ]
     * });
     */
    async createTask(normalizedAction) {
        const start = Date.now();
        this._log('createTask', { title: normalizedAction?.title, projectId: normalizedAction?.projectId, hasChecklist: Array.isArray(normalizedAction?.checklistItems) ? normalizedAction.checklistItems.length : 0 });
        try {
            // Validate fields before sending to API
            const validatedTitle = this._validateTitle(normalizedAction.title);
            const validatedPriority = this._validatePriority(normalizedAction.priority);
            const validatedProjectId = this._validateProjectId(normalizedAction.projectId, 'createTask');
            const validatedDueDate = this._validateDueDate(normalizedAction.dueDate);

            const taskData = {};
            if (validatedTitle !== null) taskData.title = validatedTitle;
            if (normalizedAction.content !== undefined && normalizedAction.content !== null) taskData.content = normalizedAction.content;
            if (validatedDueDate !== null) taskData.dueDate = validatedDueDate;
            if (validatedPriority !== null) taskData.priority = validatedPriority;
            if (validatedProjectId !== null) taskData.projectId = validatedProjectId;
            if (normalizedAction.repeatFlag !== undefined && normalizedAction.repeatFlag !== null) taskData.repeatFlag = normalizedAction.repeatFlag;

            // Map checklist items to TickTick items payload
            const checklistInputCount = Array.isArray(normalizedAction.checklistItems) ? normalizedAction.checklistItems.length : 0;
            const mappedItems = this._mapChecklistItems(normalizedAction.checklistItems);
            const checklistPayloadCount = Array.isArray(mappedItems) ? mappedItems.length : 0;
            const checklistDroppedCount = Math.max(0, checklistInputCount - checklistPayloadCount);
            this._log('createTask.checklistMapping', {
                hasChecklistInput: checklistInputCount > 0,
                checklistInputCount,
                checklistPayloadCount,
                checklistDroppedCount,
            });

            if (mappedItems) {
                taskData.items = mappedItems;
                this._log('createTask', `CHECKLIST { items: ${mappedItems.length} }`);
            }

            const createdTask = await this._client.createTask(taskData);
            const elapsed = Date.now() - start;

            // Non-blocking behavioral signal observation
            this._observeSignals('create', {
                userId: normalizedAction.userId,
                taskId: createdTask.id,
                category: normalizedAction.category || null,
                projectId: validatedProjectId,
                ...this._deriveBehavioralCreateMetadata(normalizedAction, mappedItems),
            });

            this._log('createTask', `SUCCESS { id: "${createdTask.id}", ${elapsed}ms }`);
            return createdTask;
        } catch (error) {
            const elapsed = Date.now() - start;
            // Skip classification for validation errors (already classified)
            if (!error.code) {
                const classified = this._classifyError(error, 'createTask');
                this._log('createTask', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
                throw classified;
            }
            this._log('createTask', `FAILED { error: "${error.message}", code: "${error.code}", ${elapsed}ms }`, true);
            throw error;
        }
    }

    /**
     * Creates multiple tasks sequentially with per-item failure tracking.
     * @param {Array<Object>} normalizedActions - Array of normalized action objects
     * @returns {Promise<{created: Array<Object>, failed: Array<{action: Object, error: string, code?: string}>}>} Batch results
     * @throws {Error} Classified error with code if batch processing fails catastrophically
     * 
     * @example
     * const results = await adapter.createTasksBatch([
     *   { title: 'Task 1', projectId: '...' },
     *   { title: 'Task 2', projectId: '...' }
     * ]);
     * console.log(`Created: ${results.created.length}, Failed: ${results.failed.length}`);
     */
    async createTasksBatch(normalizedActions) {
        const start = Date.now();
        this._log('createTasksBatch', { count: normalizedActions?.length });

        // Early return for empty input
        if (!normalizedActions || normalizedActions.length === 0) {
            this._log('createTasksBatch', 'SUCCESS { created: 0, failed: 0, reason: "empty input" }');
            return { created: [], failed: [] };
        }

        const results = { created: [], failed: [] };

        // Sequential execution for simplicity and debuggability
        for (let i = 0; i < normalizedActions.length; i++) {
            const action = normalizedActions[i];
            try {
                const createdTask = await this.createTask(action);
                results.created.push(createdTask);
            } catch (error) {
                // Per-item failure logging with action details
                this._log('createTasksBatch', `FAILED item ${i + 1}/${normalizedActions.length} { title: "${action?.title}", error: "${error.message}", code: "${error.code || 'UNKNOWN'}" }`, true);
                results.failed.push({
                    action,
                    error: error.message,
                    code: error.code || 'UNKNOWN'
                });
            }
        }

        const elapsed = Date.now() - start;
        this._log('createTasksBatch', `SUCCESS { created: ${results.created.length}, failed: ${results.failed.length}, ${elapsed}ms }`);
        return results;
    }

    /**
     * Gets a snapshot of task state for later restoration.
     * @param {string} taskId - 24-char hex task ID
     * @param {string} projectId - 24-char hex project ID (required for API lookup)
     * @returns {Promise<Object>} Task snapshot with id, projectId, title, content, priority, dueDate, repeatFlag, status
     * @throws {Error} Classified error with code if API call fails or validation fails
     * 
     * @example
     * const snapshot = await adapter.getTaskSnapshot('task123...', 'proj456...');
     * // Later: await adapter.restoreTask('task123...', snapshot);
     */
    async getTaskSnapshot(taskId, projectId) {
        const start = Date.now();
        this._log('getTaskSnapshot', { taskId, projectId });
        try {
            this._validateProjectId(taskId, 'getTaskSnapshot (taskId)');
            this._validateProjectId(projectId, 'getTaskSnapshot (projectId)');

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
            const classified = this._classifyError(error, 'getTaskSnapshot');
            this._log('getTaskSnapshot', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
            throw classified;
        }
    }

    /**
     * Updates a task with optional content merge behavior.
     * @param {string} taskId - 24-char hex task ID
     * @param {Object} normalizedAction - Normalized action with update fields
     * @param {string} [normalizedAction.title] - New title (replaces existing)
     * @param {string} [normalizedAction.content] - Content to merge or replace
     * @param {boolean} [normalizedAction.mergeContent=true] - If false, replace content entirely; if true/undefined, merge with existing
     * @param {string} [normalizedAction.dueDate] - New due date
     * @param {number} [normalizedAction.priority] - New priority
     * @param {string} [normalizedAction.projectId] - Target project ID (move task if different from original)
     * @param {string} [normalizedAction.originalProjectId] - Original project ID (for cross-project moves)
     * @param {string} [normalizedAction.repeatFlag] - New recurrence rule
     * @returns {Promise<Object>} Updated task object from TickTick API
     * @throws {Error} Classified error with code if API call fails or validation fails
     * 
     * @example
     * // Merge content (default behavior)
     * await adapter.updateTask('task123...', { content: 'Additional note' });
     * 
     * @example
     * // Replace content entirely
     * await adapter.updateTask('task123...', { content: 'New content only', mergeContent: false });
     */
    async updateTask(taskId, normalizedAction) {
        const start = Date.now();
        const projectId = normalizedAction.originalProjectId || normalizedAction.projectId;
        this._log('updateTask', { taskId, projectId });
        try {
            this._validateProjectId(taskId, 'updateTask (taskId)');
            
            if (!projectId) {
                const err = new Error('updateTask requires a projectId either in normalizedAction.originalProjectId or normalizedAction.projectId to fetch the existing task');
                err.code = 'VALIDATION_ERROR';
                throw err;
            }
            this._validateProjectId(projectId, 'updateTask (projectId)');

            const existingTask = await this._client.getTask(projectId, taskId);
            const sourceProjectId = normalizedAction.originalProjectId || existingTask.projectId || projectId;
            const targetProjectId = normalizedAction.projectId ?? sourceProjectId;

            const updatePayload = {};

            if (normalizedAction.title !== undefined) updatePayload.title = normalizedAction.title;
            if (normalizedAction.dueDate !== undefined) updatePayload.dueDate = normalizedAction.dueDate;
            if (normalizedAction.priority !== undefined) updatePayload.priority = normalizedAction.priority;
            if (targetProjectId !== undefined && targetProjectId !== null) updatePayload.projectId = targetProjectId;
            if (normalizedAction.repeatFlag !== undefined) updatePayload.repeatFlag = normalizedAction.repeatFlag;

            // Handle content merge with mergeContent flag
            if (normalizedAction.content !== undefined) {
                const newContent = normalizedAction.content || '';
                const oldContent = existingTask.content || '';
                const shouldMerge = normalizedAction.mergeContent !== false; // Default to true

                if (!shouldMerge) {
                    // Replace content entirely
                    updatePayload.content = newContent;
                } else if (oldContent) {
                    if (oldContent === newContent || newContent === '') {
                        // No change or clearing content
                    } else if (newContent.includes(oldContent)) {
                        // Already merged by normalizer or caller
                        updatePayload.content = newContent;
                    } else if (oldContent.includes(newContent)) {
                        // New content already part of old content - keep old
                        updatePayload.content = oldContent;
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

            // Non-blocking behavioral signal observation
            this._observeSignals('update', {
                userId: normalizedAction.userId,
                taskId,
                category: normalizedAction.category || null,
                projectId: targetProjectId,
                dueDateBefore: normalizedAction._dueDateBefore || null,
                dueDateAfter: normalizedAction.dueDate || null,
                checklistCountBefore: normalizedAction._checklistCountBefore,
                checklistCountAfter: normalizedAction._checklistCountAfter,
                descriptionLengthBefore: normalizedAction._descriptionLengthBefore,
                descriptionLengthAfter: normalizedAction.content ? normalizedAction.content.length : normalizedAction._descriptionLengthBefore,
                subtaskCountBefore: normalizedAction._subtaskCountBefore,
                subtaskCountAfter: normalizedAction._subtaskCountAfter,
            });

            this._log('updateTask', `SUCCESS { id: "${updatedTask.id}", changedProject: ${!!updatePayload.originalProjectId}, ${elapsed}ms }`);
            return updatedTask;
        } catch (error) {
            const elapsed = Date.now() - start;
            const classified = this._classifyError(error, 'updateTask');
            this._log('updateTask', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
            throw classified;
        }
    }

    /**
     * Restores a task to a previous state from snapshot.
     * @param {string} taskId - 24-char hex task ID
     * @param {Object} snapshot - Task snapshot from getTaskSnapshot
     * @param {string} snapshot.title - Task title
     * @param {string|null} [snapshot.content] - Task content
     * @param {string|null} [snapshot.dueDate] - Task due date
     * @param {number|null} [snapshot.priority] - Task priority
     * @param {string|null} [snapshot.projectId] - Task project ID
     * @param {string|null} [snapshot.repeatFlag] - Task recurrence rule
     * @returns {Promise<Object>} Restored task object from TickTick API
     * @throws {Error} Classified error with code if API call fails or validation fails
     */
    async restoreTask(taskId, snapshot) {
        const start = Date.now();
        this._log('restoreTask', { taskId, snapshotTaskId: snapshot?.id, projectId: snapshot?.projectId ?? null });
        try {
            this._validateProjectId(taskId, 'restoreTask (taskId)');
            
            if (!snapshot || typeof snapshot !== 'object') {
                const err = new Error('restoreTask requires a snapshot object');
                err.code = 'VALIDATION_ERROR';
                throw err;
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
            const classified = this._classifyError(error, 'restoreTask');
            this._log('restoreTask', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
            throw classified;
        }
    }

    /**
     * Lists all active (incomplete) tasks across all projects.
     * Reuses the client's cached task-list behavior where practical.
     * Returns task objects with id, title, projectId, projectName, priority, dueDate, content, status.
     * @param {boolean} forceRefresh - Force refresh the client's task cache
     * @returns {Promise<Array<{id: string, title: string, projectId: string, projectName: string, priority: number|null, dueDate: string|null, content: string|null, status: number}>>}
     * @throws {Error} Classified error with code if API call fails
     */
    async listActiveTasks(forceRefresh = false) {
        const start = Date.now();
        this._log('listActiveTasks', { forceRefresh });
        try {
            const tasks = forceRefresh
                ? await this._client.getAllTasks()
                : await this._client.getAllTasksCached();

            const result = tasks.map(t => ({
                id: t.id,
                title: t.title || '',
                projectId: t.projectId ?? null,
                projectName: t.projectName ?? null,
                priority: t.priority ?? null,
                dueDate: t.dueDate ?? null,
                content: t.content ?? null,
                status: t.status ?? 0,
            }));

            const elapsed = Date.now() - start;
            this._log('listActiveTasks', `SUCCESS { count: ${result.length}, ${elapsed}ms }`);
            return result;
        } catch (error) {
            const elapsed = Date.now() - start;
            const classified = this._classifyError(error, 'listActiveTasks');
            this._log('listActiveTasks', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
            throw classified;
        }
    }

    /**
     * Marks a task as complete in TickTick.
     * Note: Requires both taskId and projectId per TickTick API requirements.
     * @param {string} taskId - 24-char hex task ID
     * @param {string} projectId - 24-char hex project ID (required by TickTick API)
     * @returns {Promise<{completed: boolean, taskId: string}>} Confirmation object
     * @throws {Error} Classified error with code if API call fails or validation fails
     *
     * @example
     * await adapter.completeTask('task123...', 'proj456...');
     */
    async completeTask(taskId, projectId, userId = DEFAULT_BEHAVIORAL_USER_ID) {
        const start = Date.now();
        this._log('completeTask', { taskId, projectId });
        try {
            this._validateProjectId(taskId, 'completeTask (taskId)');
            this._validateProjectId(projectId, 'completeTask (projectId)');

            await this._client.completeTask(projectId, taskId);
            const elapsed = Date.now() - start;

            // Non-blocking behavioral signal observation
            this._observeSignals('complete', {
                userId,
                taskId,
                projectId,
            });

            this._log('completeTask', `SUCCESS { id: "${taskId}", ${elapsed}ms }`);
            return { completed: true, taskId };
        } catch (error) {
            const elapsed = Date.now() - start;
            const classified = this._classifyError(error, 'completeTask');
            this._log('completeTask', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
            throw classified;
        }
    }

    /**
     * Permanently deletes a task from TickTick.
     * Note: Requires both taskId and projectId per TickTick API requirements.
     * @param {string} taskId - 24-char hex task ID
     * @param {string} projectId - 24-char hex project ID (required by TickTick API)
     * @returns {Promise<{deleted: boolean, taskId: string}>} Confirmation object
     * @throws {Error} Classified error with code if API call fails or validation fails
     * 
     * @example
     * await adapter.deleteTask('task123...', 'proj456...');
     */
    async deleteTask(taskId, projectId, userId = DEFAULT_BEHAVIORAL_USER_ID) {
        const start = Date.now();
        this._log('deleteTask', { taskId, projectId });
        try {
            this._validateProjectId(taskId, 'deleteTask (taskId)');
            this._validateProjectId(projectId, 'deleteTask (projectId)');

            await this._client.deleteTask(projectId, taskId);
            const elapsed = Date.now() - start;

            // Non-blocking behavioral signal observation
            this._observeSignals('delete', {
                userId,
                taskId,
                projectId,
            });

            this._log('deleteTask', `SUCCESS { id: "${taskId}", ${elapsed}ms }`);
            return { deleted: true, taskId };
        } catch (error) {
            const elapsed = Date.now() - start;
            const classified = this._classifyError(error, 'deleteTask');
            this._log('deleteTask', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
            throw classified;
        }
    }
}
