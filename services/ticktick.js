// TickTick API Client — handles OAuth2 and task CRUD operations
import axios from 'axios';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', 'token.json');
const API_BASE = 'https://api.ticktick.com/open/v1';
const OAUTH_BASE = 'https://ticktick.com/oauth';

export class TickTickClient {
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

    isAuthenticated() {
        return !!this.accessToken;
    }

    // ─── Projects ──────────────────────────────────────────────

    async getProjects() {
        return this._get('/project');
    }

    async getProjectWithTasks(projectId) {
        return this._get(`/project/${projectId}/data`);
    }

    // ─── Tasks ─────────────────────────────────────────────────

    async getTask(projectId, taskId) {
        return this._get(`/project/${projectId}/task/${taskId}`);
    }

    async createTask(taskData) {
        this._invalidateCache();
        return this._post('/task', taskData);
    }

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

    async completeTask(projectId, taskId) {
        this._invalidateCache();
        return this._post(`/project/${projectId}/task/${taskId}/complete`);
    }

    async deleteTask(projectId, taskId) {
        this._invalidateCache();
        return this._requestWithRetry('DELETE', `/project/${projectId}/task/${taskId}`);
    }

    /** Returns cache age in seconds, or null if empty/invalidated */
    getCacheAgeSeconds() {
        if (!this._tasksCache || !this._cacheTime) return null;
        return Math.floor((Date.now() - this._cacheTime) / 1000);
    }

    // ─── Fetch ALL uncompleted tasks across all projects ──────

    async getAllTasksCached(ttlMs = 60000) {
        if (this._tasksCache && (Date.now() - this._cacheTime) < ttlMs) {
            return this._tasksCache;
        }
        this._tasksCache = await this.getAllTasks();
        this._cacheTime = Date.now();
        return this._tasksCache;
    }

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

    /** Returns project list from the last getAllTasks() call — no extra API call needed */
    getLastFetchedProjects() {
        return this._cachedProjects;
    }

    // ─── Internal ──────────────────────────────────────────────

    async _get(endpoint) { return this._requestWithRetry('GET', endpoint); }
    async _post(endpoint, data = {}) { return this._requestWithRetry('POST', endpoint, data); }

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

        try {
            return await makeReq();
        } catch (err) {
            if (err.response?.status === 401 && this.refreshToken) {
                if (!this._refreshPromise) {
                    this._refreshPromise = this._refreshAccessToken().finally(() => {
                        this._refreshPromise = null;
                    });
                }
                // Wait for ongoing refresh
                await this._refreshPromise;
                // Retry requested once cleanly
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
    }

    _invalidateCache() {
        this._tasksCache = null;
        this._cacheTime = 0;
    }

    _saveToken(tokenData) {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
        this._invalidateCache(); // Clear cache on new auth
    }

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
