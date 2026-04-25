// TickTick API Client — handles OAuth2 and task CRUD operations
import axios from 'axios';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', 'token.json');
const API_BASE = 'https://api.ticktick.com/open/v1';
const OAUTH_BASE = 'https://ticktick.com/oauth';

const RATE_LIMIT_MAX_RETRIES = Math.max(0, Number.parseInt(process.env.TICKTICK_RATE_LIMIT_MAX_RETRIES || '3', 10) || 3);
const RATE_LIMIT_BASE_DELAY_MS = Math.max(100, Number.parseInt(process.env.TICKTICK_RATE_LIMIT_BASE_DELAY_MS || '1000', 10) || 1000);
const RATE_LIMIT_MAX_DELAY_MS = Math.max(RATE_LIMIT_BASE_DELAY_MS, Number.parseInt(process.env.TICKTICK_RATE_LIMIT_MAX_DELAY_MS || '30000', 10) || 30000);

/**
 * Entry point for TickTick API client.
 */
export class TickTickClient {
    /**
     * Creates a new TickTickClient instance.
     * @param {Object} options - Client configuration
     * @param {string} options.clientId - OAuth2 client ID
     * @param {string} options.clientSecret - OAuth2 client secret
     * @param {string} options.redirectUri - OAuth2 redirect URI
     */
    constructor({ clientId, clientSecret, redirectUri }) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.accessToken = null;
        this.refreshToken = null;
        this._refreshPromise = null;
        this._cachedProjects = [];
        this._loadToken();
    }

    // ─── OAuth2 Flow ───────────────────────────────────────────

    /**
     * Generates the OAuth2 authorization URL.
     * @returns {string} Authorization URL
     */
    getAuthUrl() {
        const params = new URLSearchParams({
            client_id: this.clientId,
            scope: 'tasks:read tasks:write',
            state: 'ticktick-gemini',
            redirect_uri: this.redirectUri,
            response_type: 'code',
        });
        return `${OAUTH_BASE}/authorize?${params.toString()}`;
    }

    /**
     * Exchanges an authorization code for access and refresh tokens.
     * @param {string} code - Authorization code from redirect
     * @returns {Promise<Object>} Token response data
     */
    async exchangeCode(code) {
        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        const resp = await axios.post(
            `${OAUTH_BASE}/token`,
            new URLSearchParams({
                code,
                grant_type: 'authorization_code',
                redirect_uri: this.redirectUri,
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${credentials}`,
                },
            }
        );
        this.accessToken = resp.data.access_token;
        this.refreshToken = resp.data.refresh_token || this.refreshToken;
        this._saveToken(resp.data);

        // Log token for cloud deployments (Render, Railway) where filesystem is ephemeral
        console.log('\n🔑 TickTick OAuth token obtained.');
        console.log('   If deploying to Render/Railway, set this env var:');
        console.log(`   TICKTICK_ACCESS_TOKEN=${resp.data.access_token}\n`);

        return resp.data;
    }

    /**
     * Checks if the client has an access token.
     * @returns {boolean} True if authenticated
     */
    isAuthenticated() {
        return !!this.accessToken;
    }

    // ─── Projects ──────────────────────────────────────────────

    /**
     * Fetches all projects for the authenticated user.
     * @returns {Promise<Array<Object>>} List of projects
     */
    async getProjects() {
        return this._get('/project');
    }

    /**
     * Fetches a project including its tasks.
     * @param {string} projectId - 24-char project ID
     * @returns {Promise<Object>} Project data with tasks array
     */
    async getProjectWithTasks(projectId) {
        return this._get(`/project/${projectId}/data`);
    }

    // ─── Tasks ─────────────────────────────────────────────────

    /**
     * Fetches a single task by ID.
     * @param {string} projectId - Project ID containing the task
     * @param {string} taskId - 24-char task ID
     * @returns {Promise<Object>} Task data
     */
    async getTask(projectId, taskId) {
        return this._get(`/project/${projectId}/task/${taskId}`);
    }

    /**
     * Creates a new task.
     * @param {Object} taskData - Task attributes
     * @returns {Promise<Object>} Created task data
     */
    async createTask(taskData) {
        this._invalidateCache();
        return this._post('/task', taskData);
    }

    /**
     * Updates an existing task. Handles project moves via recreation.
     * @param {string} taskId - 24-char task ID
     * @param {Object} taskData - Task attributes to update
     * @returns {Promise<Object>} Updated/new task data
     */
    async updateTask(taskId, taskData) {
        this._invalidateCache();

        // Handle project moves by recreating the task in the new project and deleting the old one
        if (taskData.projectId && taskData.originalProjectId && taskData.projectId !== taskData.originalProjectId) {
            let fullTask;
            try {
                fullTask = await this.getTask(taskData.originalProjectId, taskId);
            } catch (err) {
                // Architectural Fix: Never proceed with partial data if getTask fails. It causes silent data loss.
                throw new Error(`Move aborted: Failed to fetch original task data (${err.message})`);
            }

            const createPayload = { ...fullTask, ...taskData };
            delete createPayload.id;
            delete createPayload.originalProjectId;

            let newTask;
            try {
                newTask = await this.createTask(createPayload);
            } catch (err) {
                throw new Error(`Move aborted: Failed to recreate task in target project (${err.message})`);
            }

            try {
                await this.deleteTask(taskData.originalProjectId, taskId);
            } catch (err) {
                // Transactional Rollback: If we couldn't delete the old task, delete the newly created one so we don't have duplicates.
                // Critical edge case: What if `deleteTask` timed out but ACTUALLY succeeded on TickTick's end?
                // If we blindly delete the new task, we lose BOTH tasks (Data Loss).
                try {
                    // Check if original still exists
                    await this.getTask(taskData.originalProjectId, taskId);

                    // If it DOES still exist, it's safe to delete the new one to rollback
                    await this.deleteTask(taskData.projectId, newTask.id);
                    throw new Error(`Move aborted: Failed to delete original task. Changes rolled back. (${err.message})`);
                } catch (verifyErr) {
                    // If getTask throws, it might be 404 (deleted successfully)
                    if (verifyErr.response?.status === 404 || verifyErr.response?.status === 400) {
                        console.warn(`Original task ${taskId} already gone despite delete error. Accepting move as successful.`);
                        return newTask;
                    }
                    console.error(`CRITICAL: Transaction state unknown! Duplicate task might exist. Old: ${taskId}, New: ${newTask.id}`);
                    throw new Error(`Move aborted: Unknown state after delete failure. (${err.message})`);
                }
            }

            return newTask; // Returns the new task with a new ID
        }

        const payload = { ...taskData };
        delete payload.originalProjectId;
        return this._post(`/task/${taskId}`, payload);
    }

    /**
     * Marks a task as complete.
     * @param {string} projectId - Project ID containing the task
     * @param {string} taskId - 24-char task ID
     * @returns {Promise<Object>} Completion confirmation
     */
    async completeTask(projectId, taskId) {
        this._invalidateCache();
        return this._post(`/project/${projectId}/task/${taskId}/complete`);
    }

    /**
     * Permanently deletes a task.
     * @param {string} projectId - Project ID containing the task
     * @param {string} taskId - 24-char task ID
     * @returns {Promise<Object>} Deletion confirmation
     */
    async deleteTask(projectId, taskId) {
        this._invalidateCache();
        return this._requestWithRetry('DELETE', `/project/${projectId}/task/${taskId}`);
    }

    /**
     * Returns cache age in seconds, or null if empty/invalidated.
     * @returns {number|null} Cache age in seconds
     */
    getCacheAgeSeconds() {
        if (!this._tasksCache || !this._cacheTime) return null;
        return Math.floor((Date.now() - this._cacheTime) / 1000);
    }

    // ─── Fetch ALL uncompleted tasks across all projects ──────

    /**
     * Fetches all active tasks with optional TTL-based caching.
     * @param {number} [ttlMs=60000] - Cache TTL in milliseconds
     * @returns {Promise<Array<Object>>} List of all active tasks
     */
    async getAllTasksCached(ttlMs = 60000) {
        if (this._tasksCache && (Date.now() - this._cacheTime) < ttlMs) {
            return this._tasksCache;
        }
        this._tasksCache = await this.getAllTasks();
        this._cacheTime = Date.now();
        return this._tasksCache;
    }

    /**
     * Fetches all active tasks across all accessible projects.
     * @returns {Promise<Array<Object>>} List of all active tasks
     */
    async getAllTasks() {
        const projects = await this.getProjects();
        this._cachedProjects = projects;
        const allTasks = [];

        for (const project of projects) {
            try {
                const data = await this.getProjectWithTasks(project.id);
                if (data.tasks && data.tasks.length > 0) {
                    // Filter out completed/abandoned tasks (status 0 = active)
                    const activeTasks = data.tasks.filter(t => t.status === 0 || t.status === undefined);
                    for (const task of activeTasks) {
                        task.projectId = project.id;
                        task.projectName = project.name;
                    }
                    allTasks.push(...activeTasks);
                }
            } catch (err) {
                if (err.isAuthError || err.message === 'TICKTICK_TOKEN_EXPIRED') {
                    throw err; // D.3.5: Abort mid-loop to prevent partial task state on 401s
                }
                // Some projects may not be accessible
                if (err.response?.status !== 404) {
                    console.warn(`  ⚠ Skipped project "${project.name}": ${err.message}`);
                }
            }
        }

        return allTasks;
    }

    /**
     * Returns project list from the last getAllTasks() call — no extra API call needed.
     * @returns {Array<Object>} Cached project list
     */
    getLastFetchedProjects() {
        return this._cachedProjects;
    }

    // ─── Internal ──────────────────────────────────────────────

    /**
     * Helper for GET requests.
     * @param {string} endpoint - API endpoint path
     * @returns {Promise<any>} Response data
     * @private
     */
    async _get(endpoint) { return this._requestWithRetry('GET', endpoint); }

    /**
     * Helper for POST requests.
     * @param {string} endpoint - API endpoint path
     * @param {Object} [data={}] - Request body
     * @returns {Promise<any>} Response data
     * @private
     */
    async _post(endpoint, data = {}) { return this._requestWithRetry('POST', endpoint, data); }

    /**
     * Refreshes the access token using the refresh token.
     * @returns {Promise<string>} New access token
     * @throws {Error} If refresh fails or refresh token is missing
     * @private
     */
    async _refreshAccessToken() {
        if (!this.refreshToken) {
            console.error('🔑 Refresh attempted but no refresh_token exists locally.');
            throw new Error('No refresh token available');
        }
        console.log('🔄 Attempting ticktick OAuth token refresh natively...');
        try {
            const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
            const resp = await axios.post(
                `${OAUTH_BASE}/token`,
                new URLSearchParams({
                    refresh_token: this.refreshToken,
                    grant_type: 'refresh_token',
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Authorization: `Basic ${credentials}`,
                    },
                    timeout: 15000,
                }
            );
            this.accessToken = resp.data.access_token;
            if (resp.data.refresh_token) {
                this.refreshToken = resp.data.refresh_token;
            }
            // CRITICAL FIX: Ensure refresh_token is ALWAYS correctly persisted so reboot doesn't erase it
            this._saveToken({
                ...resp.data,
                access_token: this.accessToken,
                refresh_token: this.refreshToken
            });
            console.log('✅ TickTick token refreshed successfully.');
            return this.accessToken;
        } catch (err) {
            console.error('🛑 TickTick OAuth refresh failed natively. Wiping local auth state.', err.message);
            this.accessToken = null;
            this.refreshToken = null;
            this._invalidateCache();
            const customErr = new Error('TICKTICK_TOKEN_EXPIRED');
            customErr.isAuthError = true;
            throw customErr;
        }
    }

    /**
     * Executes an API request with OAuth2 recovery (refresh) and rate-limit retries.
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint path
     * @param {Object} [data=null] - Request body
     * @returns {Promise<any>} Response data
     * @private
     */
    async _requestWithRetry(method, endpoint, data = null) {
        const makeReq = async () => {
            const config = {
                method,
                url: `${API_BASE}${endpoint}`,
                headers: { Authorization: `Bearer ${this.accessToken}` },
                timeout: 15000,
            };
            if (data) {
                config.data = data;
                config.headers['Content-Type'] = 'application/json';
            }
            const resp = await axios(config);
            return resp.data;
        };

        const requestWithAuthRecovery = async () => {
            try {
                return await makeReq();
            } catch (err) {
                if (err.response?.status === 401 && this.refreshToken) {
                    if (!this._refreshPromise) {
                        this._refreshPromise = this._refreshAccessToken().finally(() => {
                            this._refreshPromise = null;
                        });
                    }
                    await this._refreshPromise;
                    try {
                        return await makeReq();
                    } catch (retryErr) {
                        if (retryErr.response?.status === 401) {
                            this.accessToken = null;
                            this.refreshToken = null;
                            this._invalidateCache();
                            console.error('🔑 TickTick token expired (retry rejected token) — re-authorize at /health');
                            const customErr = new Error('TICKTICK_TOKEN_EXPIRED');
                            customErr.isAuthError = true;
                            throw customErr;
                        }
                        throw retryErr;
                    }
                }

                if (err.response?.status === 401) {
                    this.accessToken = null;
                    this.refreshToken = null;
                    this._invalidateCache();
                    console.error('🔑 TickTick token expired (refresh failed/missing) — re-authorize at /health');
                    const customErr = new Error('TICKTICK_TOKEN_EXPIRED');
                    customErr.isAuthError = true;
                    throw customErr;
                }
                throw err;
            }
        };

        const maxAttempts = RATE_LIMIT_MAX_RETRIES + 1;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await requestWithAuthRecovery();
            } catch (err) {
                if (err?.response?.status !== 429) {
                    throw err;
                }

                const rateLimitMeta = this._extractRateLimitMeta(err);
                const isQuotaExhausted = this._isQuotaExhausted(err);
                const retryAfterMs = rateLimitMeta.retryAfterMs;
                const waitMs = retryAfterMs ?? this._calculateExponentialBackoffMs(attempt);
                const retryAt = waitMs ? new Date(Date.now() + waitMs).toISOString() : null;
                const canRetry = !isQuotaExhausted && attempt < maxAttempts && waitMs <= RATE_LIMIT_MAX_DELAY_MS;

                err.code = isQuotaExhausted ? 'RATE_LIMIT_QUOTA_EXHAUSTED' : 'RATE_LIMITED';
                err.statusCode = 429;
                err.retryAfterMs = retryAfterMs ?? waitMs;
                err.retryAt = rateLimitMeta.retryAt || retryAt;
                err.attempts = attempt;
                err.isQuotaExhausted = isQuotaExhausted;

                if (!canRetry) {
                    throw err;
                }

                await this._sleep(waitMs);
            }
        }
    }

    /**
     * Calculates exponential backoff delay for rate limiting.
     * @param {number} attempt - Current retry attempt index
     * @returns {number} Wait time in milliseconds
     * @private
     */
    _calculateExponentialBackoffMs(attempt) {
        const exp = RATE_LIMIT_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1));
        return Math.min(exp, RATE_LIMIT_MAX_DELAY_MS);
    }

    /**
     * Extracts rate limit metadata from an error response.
     * @param {Error} error - The error to inspect
     * @returns {Object} Metadata with retryAfterMs and retryAt ISO string
     * @private
     */
    _extractRateLimitMeta(error) {
        const retryAfterHeader = error?.response?.headers?.['retry-after'];
        const bodyRetryAfter = error?.response?.data?.retry_after;

        const headerMs = this._parseRetryAfterValue(retryAfterHeader, { treatNumericAsSeconds: true });
        const bodyMs = this._parseRetryAfterValue(bodyRetryAfter, { treatNumericAsSeconds: false });
        const retryAfterMs = headerMs ?? bodyMs ?? null;
        const retryAt = retryAfterMs ? new Date(Date.now() + retryAfterMs).toISOString() : null;

        return {
            retryAfterMs,
            retryAt,
        };
    }

    /**
     * Parses a Retry-After value from headers or body.
     * @param {string|number} value - Raw value
     * @param {Object} options - Parse options
     * @param {boolean} options.treatNumericAsSeconds - Whether numbers are seconds or milliseconds
     * @returns {number|null} Delay in milliseconds
     * @private
     */
    _parseRetryAfterValue(value, { treatNumericAsSeconds } = {}) {
        if (value === null || value === undefined) return null;
        const raw = String(value).trim();
        if (!raw) return null;

        const asNumber = Number(raw);
        if (Number.isFinite(asNumber) && asNumber >= 0) {
            if (treatNumericAsSeconds === false && asNumber > 1000) return Math.floor(asNumber);
            return Math.floor(asNumber * 1000);
        }

        const asDateMs = Date.parse(raw);
        if (!Number.isNaN(asDateMs)) {
            return Math.max(0, asDateMs - Date.now());
        }

        return null;
    }

    /**
     * Checks if a 429 error is specifically due to daily quota exhaustion.
     * @param {Error} error - The error to inspect
     * @returns {boolean} True if quota is exhausted
     * @private
     */
    _isQuotaExhausted(error) {
        const chunks = [];
        const body = error?.response?.data;

        if (typeof error?.message === 'string') chunks.push(error.message);
        if (typeof body === 'string') {
            chunks.push(body);
        } else if (body && typeof body === 'object') {
            const keys = ['message', 'msg', 'error', 'error_description', 'detail', 'reason', 'code'];
            for (const key of keys) {
                if (typeof body[key] === 'string') chunks.push(body[key]);
            }
        }

        const text = chunks.join(' ').toLowerCase();
        return /(quota|exhaust|limit reached|per day|daily|day limit|billing|insufficient)/i.test(text);
    }

    /**
     * Promise-based sleep helper.
     * @param {number} ms - Sleep duration in milliseconds
     * @returns {Promise<void>}
     * @private
     */
    async _sleep(ms) {
        const wait = Number.isFinite(ms) ? Math.max(0, ms) : 0;
        if (wait <= 0) return;
        await new Promise((resolve) => setTimeout(resolve, wait));
    }

    /**
     * Invalidates the task cache.
     * @private
     */
    _invalidateCache() {
        this._tasksCache = null;
        this._cacheTime = 0;
    }

    /**
     * Persists token data to local file.
     * @param {Object} tokenData - Token response data
     * @private
     */
    _saveToken(tokenData) {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
        this._invalidateCache(); // Clear cache on new auth
    }

    /**
     * Loads tokens from environment or local file.
     * @private
     */
    _loadToken() {
        // Priority 1: Environment variable (for cloud deployments with ephemeral FS)
        if (process.env.TICKTICK_ACCESS_TOKEN) {
            this.accessToken = process.env.TICKTICK_ACCESS_TOKEN;
            if (process.env.TICKTICK_REFRESH_TOKEN) {
                this.refreshToken = process.env.TICKTICK_REFRESH_TOKEN;
            }
            return;
        }
        // Priority 2: Local token file (for local dev)
        try {
            if (fs.existsSync(TOKEN_FILE)) {
                const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
                this.accessToken = data.access_token;
                this.refreshToken = data.refresh_token || null;
            }
        } catch { /* no token yet */ }
    }
}
