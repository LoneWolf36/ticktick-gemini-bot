import { TickTickClient } from './ticktick.js';
import { validateChecklistItem } from './shared-utils.js';
import { classifyTaskEvent } from './behavioral-signals.js';
import { appendBehavioralSignals, DEFAULT_BEHAVIORAL_USER_ID } from './store.js';

/**
 * Project cache TTL in milliseconds.
 * @type {number}
 */
const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Valid priority values for TickTick API.
 * @type {number[]}
 */
const VALID_PRIORITIES = [0, 1, 3, 5]; // TickTick valid priority values

/**
 * Regex for detecting action verbs at the start of a task title.
 * @type {RegExp}
 */
const ACTION_VERB_REGEX = /^(call|email|pay|book|write|draft|review|ship|send|apply|buy|clean|fix|prepare|schedule|plan|submit|update|organize|finish|confirm|get|set|message|follow|protect)\b/i;

/**
 * Separator used when merging task content.
 * @type {string}
 */
const CONTENT_MERGE_SEPARATOR = '\n---\n';

/**
 * Standard error codes used across the adapter and pipeline.
 * @enum {string}
 */
const ERROR_CODES = {
    VALIDATION: 'VALIDATION_ERROR',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    NOT_FOUND: 'NOT_FOUND',
    ALREADY_COMPLETED: 'ALREADY_COMPLETED',
    NETWORK_ERROR: 'NETWORK_ERROR',
    RATE_LIMITED: 'RATE_LIMITED',
    SERVER_ERROR: 'SERVER_ERROR',
    AUTH_ERROR: 'AUTH_ERROR',
    API_ERROR: 'API_ERROR',
};

/**
 * Node.js network error codes to be classified as NETWORK_ERROR.
 * @type {Set<string>}
 */
const NETWORK_ERROR_CODES = new Set([
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNABORTED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
]);

/**
 * Set of all valid typed error codes.
 * @type {Set<string>}
 */
const TYPED_ERROR_CODES = new Set(Object.values(ERROR_CODES));

/**
 * Extracts and concatenates error message chunks from an error object or API response.
 * @param {Error|object} error - The error object to parse
 * @returns {string} Concatenated error text in lowercase
 */
function buildErrorText(error) {
    const chunks = [];
    if (typeof error?.message === 'string') chunks.push(error.message);
    const responseData = error?.response?.data;
    if (typeof responseData === 'string') {
        chunks.push(responseData);
    } else if (responseData && typeof responseData === 'object') {
        for (const key of ['message', 'msg', 'error', 'detail', 'reason', 'error_description']) {
            if (typeof responseData[key] === 'string') chunks.push(responseData[key]);
        }
    }
    return chunks.join(' ').toLowerCase();
}
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
        classified.code = TYPED_ERROR_CODES.has(error?.code) ? error.code : this._getErrorCode(error);
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
        const normalizedMessage = buildErrorText(error);

        if (status === 403) return ERROR_CODES.PERMISSION_DENIED;
        if (status === 401) return ERROR_CODES.AUTH_ERROR;
        if (status === 404) return ERROR_CODES.NOT_FOUND;

        if (/(already\s+completed|already\s+done|task\s+is\s+completed|cannot\s+complete\s+completed|completed\s+already)/i.test(normalizedMessage)) {
            return ERROR_CODES.ALREADY_COMPLETED;
        }

        if (status === 429) return ERROR_CODES.RATE_LIMITED;
        if (status >= 500) return ERROR_CODES.SERVER_ERROR;
        if (NETWORK_ERROR_CODES.has(error.code)) return ERROR_CODES.NETWORK_ERROR;
        if (/(network\s+error|timed\s+out|timeout|socket\s+hang\s+up|connection\s+(reset|refused|closed))/i.test(normalizedMessage)) {
            return ERROR_CODES.NETWORK_ERROR;
        }
        return ERROR_CODES.API_ERROR;
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

    /**
     * Derives behavioral metadata for task creation events.
     * @param {Object} normalizedAction - Normalized action object
     * @param {Array<Object>|null} mappedItems - Mapped checklist items
     * @returns {Object} Behavioral metadata
     * @private
     */
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
            const projects = await this.listProjects();

            const defaultProject = this._getSafeDefaultProject(projects);
            if (!nameHint || typeof nameHint !== 'string' || nameHint.trim().length === 0) {
                const elapsed = Date.now() - start;
                this._log('findProjectByName', `SUCCESS { match: null, fallback: ${JSON.stringify(defaultProject ? { id: defaultProject.id, name: defaultProject.name } : null)}, reason: "empty_hint", ${elapsed}ms }`);
                return defaultProject;
            }

            const lowerHint = this._normalizeProjectName(nameHint);
            const exactMatches = [];
            const startsWithMatches = [];
            const containsMatches = [];

            for (const p of projects) {
                const normalizedName = this._normalizeProjectName(p.name);
                if (!normalizedName) continue;
                if (normalizedName === lowerHint) {
                    exactMatches.push(p);
                } else if (normalizedName.startsWith(lowerHint)) {
                    startsWithMatches.push(p);
                } else if (normalizedName.includes(lowerHint)) {
                    containsMatches.push(p);
                }
            }

            const pickSingle = (matches) => {
                if (matches.length === 0) return { match: null, ambiguous: false };
                if (matches.length === 1) return { match: matches[0], ambiguous: false };
                return { match: null, ambiguous: true };
            };

            const exactResult = pickSingle(exactMatches);
            const startsWithResult = !exactResult.match && !exactResult.ambiguous ? pickSingle(startsWithMatches) : { match: null, ambiguous: false };
            const containsResult = !exactResult.match && !exactResult.ambiguous && !startsWithResult.match && !startsWithResult.ambiguous
                ? pickSingle(containsMatches)
                : { match: null, ambiguous: false };

            const match = exactResult.match || startsWithResult.match || containsResult.match || null;
            const ambiguous = exactResult.ambiguous || startsWithResult.ambiguous || containsResult.ambiguous;

            const result = match
                ? { id: match.id, name: match.name, reason: 'matched' }
                : defaultProject
                    ? {
                        id: defaultProject.id,
                        name: defaultProject.name,
                        reason: ambiguous ? 'ambiguous_fallback' : 'unresolved_fallback',
                    }
                    : null;

            if (!match) {
                this._log('findProjectByName', {
                    warning: 'project_resolution_fallback',
                    reason: ambiguous ? 'ambiguous' : 'unresolved',
                    nameHint,
                    candidates: ambiguous
                        ? [...exactMatches, ...startsWithMatches, ...containsMatches].map((p) => ({ id: p.id, name: p.name }))
                        : [],
                    fallback: defaultProject ? { id: defaultProject.id, name: defaultProject.name } : null,
                }, true);
            }

            const elapsed = Date.now() - start;
            this._log('findProjectByName', `SUCCESS { match: ${JSON.stringify(result)}, ${elapsed}ms }`);
            return match || defaultProject;
        } catch (error) {
            const elapsed = Date.now() - start;
            const classified = this._classifyError(error, 'findProjectByName');
            this._log('findProjectByName', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
            throw classified;
        }
    }

    /**
     * Normalizes a project name for comparison.
     * @param {string} name - Raw project name
     * @returns {string} Normalized project name
     * @private
     */
    _normalizeProjectName(name) {
        if (typeof name !== 'string') return '';
        return name.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    /**
     * Identifies a safe default project from a list (Inbox preferred).
     * @param {Array<Object>} [projects=[]] - List of projects
     * @returns {Object|null} Default project or null
     * @private
     */
    _getSafeDefaultProject(projects = []) {
        if (!Array.isArray(projects) || projects.length === 0) return null;

        const inbox = projects.find((project) => this._normalizeProjectName(project?.name) === 'inbox');
        if (inbox) return inbox;

        const sorted = [...projects].sort((a, b) => {
            const nameCompare = String(a?.name || '').localeCompare(String(b?.name || ''));
            if (nameCompare !== 0) return nameCompare;
            return String(a?.id || '').localeCompare(String(b?.id || ''));
        });
        return sorted[0] || null;
    }

    /**
     * Merges incoming task content with existing content using defined strategies.
     * @param {string|null} existingContent - Current task description
     * @param {string|null} incomingContent - New task description
     * @param {boolean} [mergeContent=true] - Whether to merge or replace
     * @returns {{shouldUpdate: boolean, content: string, strategy: string}} Merge result
     * @private
     */
    _mergeTaskContent(existingContent, incomingContent, mergeContent = true) {
        const oldContent = typeof existingContent === 'string' ? existingContent : '';
        const newContent = incomingContent === null || incomingContent === undefined ? '' : String(incomingContent);

        if (!mergeContent) {
            return { shouldUpdate: true, content: newContent, strategy: 'replace' };
        }

        if (newContent.trim().length === 0) {
            return { shouldUpdate: false, content: oldContent, strategy: 'preserve_empty_incoming' };
        }

        if (!oldContent) {
            return { shouldUpdate: true, content: newContent, strategy: 'set_new_on_empty' };
        }

        if (newContent === oldContent) {
            return { shouldUpdate: false, content: oldContent, strategy: 'preserve_identical' };
        }

        if (oldContent.includes(newContent)) {
            return { shouldUpdate: false, content: oldContent, strategy: 'preserve_existing_superset' };
        }

        if (newContent.startsWith(`${oldContent}${CONTENT_MERGE_SEPARATOR}`)) {
            const appended = newContent.slice((`${oldContent}${CONTENT_MERGE_SEPARATOR}`).length).trim();
            if (!appended || oldContent.includes(appended)) {
                return { shouldUpdate: false, content: oldContent, strategy: 'preserve_premerged_duplicate' };
            }
            return {
                shouldUpdate: true,
                content: `${oldContent}${CONTENT_MERGE_SEPARATOR}${appended}`,
                strategy: 'merge_premerged_append',
            };
        }

        if (newContent.includes(oldContent) && newContent.includes(CONTENT_MERGE_SEPARATOR)) {
            const separatorIndex = newContent.indexOf(CONTENT_MERGE_SEPARATOR);
            const appended = newContent.slice(separatorIndex + CONTENT_MERGE_SEPARATOR.length).trim();
            if (!appended || oldContent.includes(appended)) {
                return { shouldUpdate: false, content: oldContent, strategy: 'preserve_premerged_contains_duplicate' };
            }
            return {
                shouldUpdate: true,
                content: `${oldContent}${CONTENT_MERGE_SEPARATOR}${appended}`,
                strategy: 'merge_premerged_contains_append',
            };
        }

        return {
            shouldUpdate: true,
            content: `${oldContent}${CONTENT_MERGE_SEPARATOR}${newContent}`,
            strategy: 'merge_append',
        };
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
            if (error.code === ERROR_CODES.VALIDATION) {
                this._log('createTask', `FAILED { error: "${error.message}", code: "${error.code}", ${elapsed}ms }`, true);
                throw error;
            }
            const classified = this._classifyError(error, 'createTask');
            this._log('createTask', `FAILED { error: "${error.message}", code: "${classified.code}", ${elapsed}ms }`, true);
            throw classified;
        }
    }

    /**
     * Creates multiple tasks sequentially with per-item failure tracking.
     * @param {Array<Object>} normalizedActions - Array of normalized action objects
     * @returns {Promise<{created: Array<Object>, failed: Array<{action: Object, error: string, code: string}>}>} Batch results
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

            // Handle content merge with adapter-owned single merge path
            if (Object.prototype.hasOwnProperty.call(normalizedAction, 'content')) {
                const contentMerge = this._mergeTaskContent(
                    existingTask.content,
                    normalizedAction.content,
                    normalizedAction.mergeContent !== false,
                );
                if (contentMerge.shouldUpdate) {
                    updatePayload.content = contentMerge.content;
                }
                this._log('updateTask.contentMerge', {
                    taskId,
                    strategy: contentMerge.strategy,
                    mergeContent: normalizedAction.mergeContent !== false,
                    updated: contentMerge.shouldUpdate,
                });
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
