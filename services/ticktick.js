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
        return this._post(`/task/${taskId}`, taskData);
    }

    async completeTask(projectId, taskId) {
        this._invalidateCache();
        return this._post(`/project/${projectId}/task/${taskId}/complete`);
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
        this._cachedProjects = projects; // Cache for use by Gemini analyzeTask
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

    async _get(endpoint) {
        try {
            const resp = await axios.get(`${API_BASE}${endpoint}`, {
                headers: { Authorization: `Bearer ${this.accessToken}` },
                timeout: 15000,
            });
            return resp.data;
        } catch (err) {
            if (err.response?.status === 401) {
                this.accessToken = null; // Clear so isAuthenticated() returns false
                this._invalidateCache();
                console.error('🔑 TickTick token expired — re-authorize at the /health endpoint or re-run OAuth.');
                const customErr = new Error('TICKTICK_TOKEN_EXPIRED');
                customErr.isAuthError = true;
                throw customErr;
            }
            throw err;
        }
    }

    async _post(endpoint, data = {}) {
        try {
            const resp = await axios.post(`${API_BASE}${endpoint}`, data, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                timeout: 15000,
            });
            return resp.data;
        } catch (err) {
            if (err.response?.status === 401) {
                this.accessToken = null;
                this._invalidateCache();
                console.error('🔑 TickTick token expired — re-authorize at the /health endpoint or re-run OAuth.');
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
            return;
        }
        // Priority 2: Local token file (for local dev)
        try {
            if (fs.existsSync(TOKEN_FILE)) {
                const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
                this.accessToken = data.access_token;
            }
        } catch { /* no token yet */ }
    }
}
