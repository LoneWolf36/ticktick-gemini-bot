// Gemini AI — goal-aware task analyzer and accountability engine
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import path from 'path';
import { userTodayFormatted, PRIORITY_EMOJI, formatProcessedTask } from './shared-utils.js';
import { briefingSummarySchema, reorgSchema, weeklySummarySchema } from './schemas.js';
import * as store from './store.js';
import { composeBriefingSummary, composeDailyCloseSummary, composeWeeklySummary } from './summary-surfaces/index.js';
import {
    createGoalThemeProfile,
    inferPriorityValueFromTask,
    inferProjectIdFromTask,
    rankPriorityCandidates,
} from './execution-prioritization.js';

// ─── User Context ────────────────────────────────────────────
// Priority: 1) local user_context.js (gitignored), 2) USER_CONTEXT env var, 3) generic default
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_CONTEXT_FILE = path.join(__dirname, 'user_context.js');

let USER_CONTEXT;
let USER_CONTEXT_SOURCE;
if (existsSync(USER_CONTEXT_FILE)) {
    const mod = await import('./user_context.js');
    USER_CONTEXT = mod.USER_CONTEXT;
    USER_CONTEXT_SOURCE = 'user_context';
} else if (process.env.USER_CONTEXT) {
    USER_CONTEXT = process.env.USER_CONTEXT;
    USER_CONTEXT_SOURCE = 'env';
} else {
    USER_CONTEXT = 'You are an AI accountability partner and task analyst. Help the user stay focused, organized, and honest about their priorities.';
    USER_CONTEXT_SOURCE = 'fallback';
    console.warn('⚠️  No user_context.js found and USER_CONTEXT env var not set. Using generic context.');
}

export { USER_CONTEXT, USER_CONTEXT_SOURCE };




// ─── Daily Briefing Prompt ──────────────────────────────────
const BRIEFING_PROMPT = `${USER_CONTEXT}

Generate today's focused plan as structured JSON only.

Rules:
- Maximum 3 tasks in priorities.
- First priority MUST be career-critical if one exists.
- Avoid behavioral callouts; focus on task evidence and ranking rationale.
- If data is sparse, return compact output without filler.

Return a JSON object with these fields:
- focus: string
- priorities: array of { task_id, title, project_name, due_date, priority_label, rationale_text }
- why_now: array of short strings
- start_now: string
- notices: array of { code, message, severity, evidence_source }

Constraints:
- Use snake_case keys exactly as listed.
- notices.code must be one of: sparse_tasks, degraded_ranking, urgent_mode_active, delivery_context
- notices.severity must be info or warning
- notices.evidence_source must be tasks, processed_history, state, or system
- Do not add extra keys.
- Output strict JSON only (no markdown, no prose).
`;

// ─── Weekly Digest Prompt ───────────────────────────────────
const WEEKLY_SUMMARY_PROMPT = `${USER_CONTEXT}

Generate a weekly accountability summary as STRICT JSON.

Output rules:
- Return JSON only. No markdown, no prose, no code fences.
- Use exactly these top-level keys: progress, carry_forward, next_focus, watchouts, notices.
- progress: array of short strings describing completed outcomes grounded in processed history.
- carry_forward: array of objects { task_id, title, reason } for active tasks that carry into next week.
- next_focus: array of short strings for the top 3 tasks to focus next.
- watchouts: array of objects { label, evidence, evidence_source }.
  - evidence_source must be "current_tasks" or "processed_history".
  - Do not include behavioral labels or callouts.
  - Do not include avoidance, needle-mover ratios, or callout language.
- notices: array of objects { code, message, severity, evidence_source }.
  - Use code "missing_history" when processed history is sparse or missing.

Keep the summary concise, evidence-based, and non-behavioral.
`;

const REORG_PROMPT = `${USER_CONTEXT}

You are reorganizing the user's entire TickTick system.

Output must be strict JSON using schema.

Goals:
1. Reduce inbox/garbage clutter.
   - Inbox should not retain tasks unless explicitly unavoidable.
2. Group related errands into clearer tasks when appropriate.
3. Move tasks to relevant categories/projects.
4. Prioritize all tasks (0,1,3,5) based on impact/urgency.
5. Improve vague task wording while preserving critical original meaning.
6. Respect privacy/sensitive data - never paraphrase credentials or secrets.
7. If task meaning is unclear, ask clarifying questions instead of guessing.
8. Return practical actions, not theory. Usually produce at least 3 actions when tasks exist.
9. Do not emit duplicate actions for the same task.

Scheduling policy:
- Career/study tasks -> morning/afternoon biased scheduling.
- Admin tasks -> later slots unless urgent/time-bound.
- For uncertainty, include a clarifying question instead of guessing.

Output constraints:
- Max 30 actions.
- Each update action must include taskId and at least one concrete field in changes.
- Each create action must include title and priority in changes.
- Return compact plain JSON only (no markdown, no code fences, no prose).
`;

export function buildUrgentModePromptNote(urgentMode = false) {
    if (urgentMode !== true) return '';
    return 'URGENT MODE is active. Use direct, sharp language. Prioritize immediate, high-impact tasks. Do not soften your tone.';
}

export class GeminiAnalyzer {
    constructor(apiKeys) {
        const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
        this._keys = keys.filter(k => k && k !== 'YOUR_GEMINI_API_KEY_HERE');
        if (this._keys.length === 0) {
            throw new Error('❌ Gemini API key not set! Get one from https://aistudio.google.com/apikey');
        }

        this._activeKeyIndex = 0;
        this._exhaustedUntilByKey = new Array(this._keys.length).fill(null);
        this._keyUnavailableReason = new Array(this._keys.length).fill(null);
        this._rotationPromise = null;

        this._initModelsForActiveKey();
    }

    _prepareBriefingTasks(tasks = [], options = {}) {
        const activeTasks = (Array.isArray(tasks) ? tasks : [])
            .filter((task) => task && (task.status === 0 || task.status === undefined));
        const goalThemeProfile = options.goalThemeProfile || createGoalThemeProfile(USER_CONTEXT, { source: USER_CONTEXT_SOURCE });
        const ranking = rankPriorityCandidates(activeTasks, {
            goalThemeProfile,
            nowIso: options.nowIso || new Date().toISOString(),
            workStyleMode: options.workStyleMode,
            urgentMode: options.urgentMode,
            stateSource: options.stateSource,
        });

        const byTaskId = new Map(activeTasks.map((task) => [task.id || task.taskId, task]));
        const orderedTasks = ranking.ranked
            .map((decision) => byTaskId.get(decision.taskId))
            .filter(Boolean);

        for (const task of activeTasks) {
            if (!orderedTasks.includes(task)) {
                orderedTasks.push(task);
            }
        }

        return { goalThemeProfile, ranking, orderedTasks };
    }

    async _resolveRecommendationState(options = {}) {
        const workStyleMode = options.workStyleMode || 'humane';
        if (options.urgentMode === true || options.urgentMode === false) {
            return {
                workStyleMode,
                urgentMode: options.urgentMode,
                stateSource: options.stateSource || 'explicit',
            };
        }

        const userId = options.userId ?? options.chatId ?? store.getChatId();
        if (userId == null) {
            return { workStyleMode, urgentMode: false, stateSource: 'default' };
        }

        try {
            const urgentMode = await store.getUrgentMode(userId);
            return { workStyleMode, urgentMode, stateSource: 'store' };
        } catch {
            return { workStyleMode, urgentMode: false, stateSource: 'default' };
        }
    }

    _initModelsForActiveKey() {
        const genAI = new GoogleGenerativeAI(this._keys[this._activeKeyIndex]);

        this.briefingModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: BRIEFING_PROMPT,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: briefingSummarySchema,
                temperature: 0.8,
                topP: 0.9,
                maxOutputTokens: 4096,
            },
            thinkingConfig: { thinkingBudget: 1024 },
        });

        this.weeklyModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: WEEKLY_SUMMARY_PROMPT,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: weeklySummarySchema,
                temperature: 0.4,
                topP: 0.9,
                maxOutputTokens: 4096,
            },
            thinkingConfig: { thinkingBudget: 1024 },
        });



        this.reorgModel = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: REORG_PROMPT,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: reorgSchema,
                temperature: 0.2,
                maxOutputTokens: 4096,
            },
            thinkingConfig: { thinkingBudget: 512 },
        });
    }

    activeKeyInfo() {
        return { index: this._activeKeyIndex + 1, total: this._keys.length };
    }

    /** Milliseconds until midnight Pacific (when Google resets free-tier daily quotas) */
    _getQuotaResetMs() {
        const now = new Date();
        // Google resets at midnight Pacific — build that timestamp
        const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        const midnightPT = new Date(pacific);
        midnightPT.setDate(midnightPT.getDate() + 1);
        midnightPT.setHours(0, 0, 0, 0);
        // Convert back to UTC offset
        const diffMs = midnightPT.getTime() - pacific.getTime();
        return Math.max(diffMs, 30 * 60 * 1000); // At least 30 min (safety floor)
    }

    _isDailyQuotaError(err) {
        const isRateLimit = err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('429');
        const msg = (err.message || '').toLowerCase();
        // Specifically check for 'per day' or 'perday' to avoid catching 'per minute' or generic '(e.g. check quota)' transient limits
        const isDailyQuota = msg.includes('perday') || msg.includes('per day');
        return isRateLimit && isDailyQuota;
    }

    _isInvalidApiKeyError(err) {
        const status = err?.status;
        if (![400, 401, 403].includes(status)) return false;
        const msg = (err?.message || '').toLowerCase();
        return (
            msg.includes('api key expired') ||
            msg.includes('api_key_invalid') ||
            msg.includes('invalid api key') ||
            msg.includes('key not valid') ||
            msg.includes('reported as leaked')
        );
    }

    _markActiveKeyUnavailable(reason, untilMs) {
        this._exhaustedUntilByKey[this._activeKeyIndex] = untilMs;
        this._keyUnavailableReason[this._activeKeyIndex] = reason;
    }

    _isKeyAvailable(index) {
        const until = this._exhaustedUntilByKey[index];
        if (!until) return true;
        if (Date.now() > until) {
            this._exhaustedUntilByKey[index] = null;
            this._keyUnavailableReason[index] = null;
            return true;
        }
        return false;
    }

    _areAllKeysUnavailable() {
        for (let i = 0; i < this._keys.length; i++) {
            if (this._isKeyAvailable(i)) return false;
        }
        return true;
    }

    _findNextAvailableKeyIndex() {
        for (let i = 1; i <= this._keys.length; i++) {
            const idx = (this._activeKeyIndex + i) % this._keys.length;
            if (this._isKeyAvailable(idx)) {
                return idx;
            }
        }
        return -1;
    }

    async _rotateToNextKeyIfAvailable() {
        if (this._rotationPromise) {
            await this._rotationPromise;
            return this._isKeyAvailable(this._activeKeyIndex);
        }

        const rotate = async () => {
            const nextIdx = this._findNextAvailableKeyIndex();
            if (nextIdx !== -1) {
                const oldIdx = this._activeKeyIndex;
                this._activeKeyIndex = nextIdx;
                console.log(`🔄 Rotating Gemini key ${oldIdx + 1}/${this._keys.length} → ${nextIdx + 1}/${this._keys.length} (daily quota)`);
                this._initModelsForActiveKey();
                return true;
            }
            return false;
        };

        this._rotationPromise = rotate();
        try {
            return await this._rotationPromise;
        } finally {
            this._rotationPromise = null;
        }
    }

    /** Returns the Date when quota will reset (null if not exhausted) */
    quotaResumeTime() {
        if (!this.isQuotaExhausted()) return null;
        const nonNulls = this._exhaustedUntilByKey.filter(
            (t, idx) => t !== null && this._keyUnavailableReason[idx] === 'daily_quota'
        );
        return nonNulls.length ? new Date(Math.min(...nonNulls)) : null;
    }

    /** Check if we've hit the daily quota wall */
    isQuotaExhausted() {
        for (let i = 0; i < this._keys.length; i++) {
            const until = this._exhaustedUntilByKey[i];
            if (!until || Date.now() > until) return false;
            if (this._keyUnavailableReason[i] !== 'daily_quota') return false;
        }
        return true;
    }

    async _generateWithFailover(getModelFn, prompt, { transientBaseMs = 15 } = {}) {
        if (this.isQuotaExhausted()) {
            throw new Error('QUOTA_EXHAUSTED');
        }
        if (this._areAllKeysUnavailable()) {
            throw new Error('API_KEYS_UNAVAILABLE');
        }

        const maxTransientRetries = 2; // For transient 429s
        let transientAttempts = 0;

        const maxRotations = Math.max(0, this._keys.length - 1);
        let rotations = 0;

        while (true) {
            try {
                const model = getModelFn.call(this);
                const result = await model.generateContent(prompt);

                // Telemetry Interceptor for Architecture Observability
                const usage = result.response.usageMetadata;
                if (usage) {
                    console.log(`📊 [Gemini API] Tokens -> In: ${usage.promptTokenCount} | Out: ${usage.candidatesTokenCount} | Total: ${usage.totalTokenCount}`);
                }

                return result;
            } catch (err) {
                const activeK = this._keys[this._activeKeyIndex];
                const maskedKey = activeK ? `${activeK.slice(0, 4)}...${activeK.slice(-4)}` : 'undefined';
                console.error(`[DIAGNOSTICS] Key ${this._activeKeyIndex + 1}/${this._keys.length} [${maskedKey}] exactly threw: [${err.status}] ${err.message}`);

                if (this._isInvalidApiKeyError(err)) {
                    // Expired/leaked keys should be sidelined for longer than daily quota windows.
                    const disableMs = Date.now() + (7 * 24 * 60 * 60 * 1000);
                    this._markActiveKeyUnavailable('invalid_key', disableMs);
                    console.error(`🚫 Key ${this._activeKeyIndex + 1}/${this._keys.length} marked unavailable (invalid/leaked).`);
                    if (rotations < maxRotations && await this._rotateToNextKeyIfAvailable()) {
                        rotations++;
                        continue;
                    }
                    throw new Error('API_KEYS_UNAVAILABLE');
                }

                if (this._isDailyQuotaError(err)) {
                    // Mark current key as exhausted
                    const resetMs = this._getQuotaResetMs();
                    this._markActiveKeyUnavailable('daily_quota', Date.now() + resetMs);

                    if (rotations < maxRotations && await this._rotateToNextKeyIfAvailable()) {
                        rotations++;
                        continue; // Valid retry on new key, transientAttempts remains unchanged
                    } else {
                        if (this.isQuotaExhausted()) {
                            const resumeTime = this.quotaResumeTime();
                            const resumeStr = resumeTime ? resumeTime.toLocaleTimeString('en-US', {
                                timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit'
                            }) : 'unknown';
                            console.error(`🛑 All AI keys exhausted — pausing calls until ~${resumeStr} PT.`);
                        } else {
                            console.error(`⚠️ Daily quota hit across ${rotations + 1} attempted keys in one call. Aborting request to prevent runaway cascade.`);
                        }
                        throw new Error(this._areAllKeysUnavailable() ? 'API_KEYS_UNAVAILABLE' : 'QUOTA_EXHAUSTED');
                    }
                }

                // Transient Rate Limit handling
                const isRateLimit = err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('429');
                if (isRateLimit && transientAttempts < maxTransientRetries) {
                    let dynamicBackoffMs = transientBaseMs;
                    const match = err.message?.match(/Please retry in ([\d\.]+)s/);
                    if (match && match[1]) {
                        // Google gives us exactly how long to wait. Parse it and add 2s buffer.
                        dynamicBackoffMs = parseFloat(match[1]) * 1000 + 2000;
                    }
                    const backoffMs = dynamicBackoffMs + Math.random() * 5000;
                    console.error(`⏳ Rate limited, waiting ${Math.round(backoffMs / 1000)}s before retry ${transientAttempts + 1}/${maxTransientRetries}...`);
                    await new Promise(r => setTimeout(r, backoffMs));
                    transientAttempts++;
                    continue;
                }

                throw err;
            }
        }
    }



    // ─── Generate daily briefing ──────────────────────────────

    async generateDailyBriefingModelSummary(tasks, options = {}) {
        const recommendationState = await this._resolveRecommendationState(options);
        const { ranking, orderedTasks } = this._prepareBriefingTasks(tasks, {
            ...options,
            ...recommendationState,
        });
        const rankedPreview = ranking.ranked
            .slice(0, 3)
            .map((decision, index) => {
                const task = orderedTasks.find((candidate) => (candidate.id || candidate.taskId) === decision.taskId);
                const title = task?.title || decision.taskId;
                return `${index + 1}. "${title}" — ${decision.rationaleText}`;
            })
            .join('\n');

        const taskList = orderedTasks
            .map((t, i) => {
                let line = `${i + 1}. "${t.title}" [${t.projectName || 'Inbox'}]`;
                if (t.dueDate) line += ` — due: ${t.dueDate}`;
                if (t.priority === 5) line += ` ${PRIORITY_EMOJI[5]}`;
                return line;
            })
            .join('\n');

        const today = userTodayFormatted();
        const urgentModePromptNote = buildUrgentModePromptNote(recommendationState.urgentMode);

        const prompt = `${urgentModePromptNote ? `${urgentModePromptNote}\n\n` : ''}Today is ${today}.\n\nShared priority guidance:\n${rankedPreview || 'No ranked guidance available.'}\n\nActive tasks (${orderedTasks.length} total):\n${taskList}`;
        const result = await this._generateWithFailover(() => this.briefingModel, prompt, { transientBaseMs: 15 });
        const raw = result.response.text().trim();
        const parsed = this._safeParseJson(raw);
        const modelSummary = parsed && typeof parsed === 'object'
            ? parsed
            : {
                focus: '',
                priorities: [],
                why_now: [],
                start_now: '',
                notices: [],
            };

        return {
            modelSummary,
            ranking,
            orderedTasks,
            recommendationState,
        };
    }

    async generateDailyBriefingSummary(tasks, options = {}) {
        const {
            modelSummary,
            ranking,
            orderedTasks,
            recommendationState,
        } = await this.generateDailyBriefingModelSummary(tasks, options);

        return composeBriefingSummary({
            context: {
                kind: 'briefing',
                entryPoint: options.entryPoint || 'manual_command',
                userId: options.userId ?? options.chatId ?? null,
                generatedAtIso: options.generatedAtIso || new Date().toISOString(),
                timezone: options.timezone || null,
                urgentMode: recommendationState.urgentMode,
                tonePolicy: 'preserve_existing',
            },
            activeTasks: orderedTasks,
            rankingResult: ranking,
            modelSummary,
        });
    }

    // ─── Generate weekly digest ───────────────────────────────

    async generateWeeklyDigestSummary(allTasks, processedThisWeek, options = {}) {
        const recommendationState = await this._resolveRecommendationState(options);
        const { ranking, orderedTasks } = this._prepareBriefingTasks(allTasks, {
            ...options,
            ...recommendationState,
        });

        const taskList = orderedTasks
            .map((t, i) => {
                let line = `${i + 1}. "${t.title}" [${t.projectName || 'Inbox'}]`;
                if (t.dueDate) line += ` - due: ${t.dueDate}`;
                if (t.priority !== undefined) line += ` priority=${t.priority}`;
                return line;
            })
            .join('\n');

        const processedEntries = Object.entries(processedThisWeek || {})
            .map(([taskId, data]) => ({ taskId, ...data }));
        const processed = processedEntries
            .map((entry) => formatProcessedTask(entry))
            .join('\n');

        const urgentModePromptNote = buildUrgentModePromptNote(recommendationState.urgentMode);
        const prompt = `${urgentModePromptNote ? `${urgentModePromptNote}\n\n` : ''}Current active tasks (${orderedTasks.length}):\n${taskList || 'None'}\n\nProcessed tasks this week (${processedEntries.length}):\n${processed || 'None'}`;
        const result = await this._generateWithFailover(() => this.weeklyModel, prompt, { transientBaseMs: 15 });
        const raw = result.response.text().trim();
        const parsed = this._safeParseJson(raw);
        const summaryPayload = parsed && typeof parsed === 'object' ? parsed : {};

        return composeWeeklySummary({
            context: {
                entryPoint: options.entryPoint || 'manual_command',
                userId: options.userId ?? options.chatId ?? store.getChatId(),
                generatedAtIso: options.generatedAtIso || new Date().toISOString(),
                timezone: options.timezone || null,
                urgentMode: recommendationState.urgentMode,
                tonePolicy: options.tonePolicy || 'preserve_existing',
            },
            activeTasks: orderedTasks,
            processedHistory: processedEntries,
            historyAvailable: options.historyAvailable !== false,
            rankingResult: ranking,
            modelSummary: summaryPayload,
        });
    }

    async generateDailyCloseSummary(allTasks, processedTasks, options = {}) {
        const recommendationState = await this._resolveRecommendationState(options);
        const { ranking, orderedTasks } = this._prepareBriefingTasks(allTasks, {
            ...options,
            ...recommendationState,
        });

        const processedEntries = Array.isArray(processedTasks)
            ? processedTasks.filter(Boolean)
            : Object.entries(processedTasks || {}).map(([taskId, data]) => ({ taskId, ...data }));

        return composeDailyCloseSummary({
            context: {
                kind: 'daily_close',
                entryPoint: options.entryPoint || 'manual_command',
                userId: options.userId ?? options.chatId ?? store.getChatId(),
                generatedAtIso: options.generatedAtIso || new Date().toISOString(),
                timezone: options.timezone || null,
                urgentMode: recommendationState.urgentMode,
                tonePolicy: options.tonePolicy || 'preserve_existing',
            },
            activeTasks: orderedTasks,
            processedHistory: processedEntries,
            rankingResult: ranking,
            modelSummary: {},
        });
    }

    async generateReorgProposal(tasks = [], projects = [], refinement = null, existingActions = [], options = {}) {
        const recommendationState = await this._resolveRecommendationState(options);
        const compactTasks = this._compactReorgTasks(tasks, recommendationState);
        const projectList = projects.map(p => `[id:${p.id}] ${p.name}`).join(' | ');
        const taskList = compactTasks.map(t => {
            const parts = [`[id:${t.id}] "${t.title}"`];
            if (t.projectName) parts.push(`project=${t.projectName}`);
            if (t.priority !== undefined) parts.push(`priority=${t.priority}`);
            if (t.dueDate) parts.push(`due=${t.dueDate.split('T')[0]}`);
            if (t.content) parts.push(`content=${t.content.slice(0, 120)}`);
            return parts.join(' | ');
        }).join('\n');

        const urgentModePromptNote = buildUrgentModePromptNote(recommendationState.urgentMode);
        let prompt = `${urgentModePromptNote ? `${urgentModePromptNote}\n\n` : ''}Current tasks (${tasks.length} total, ${compactTasks.length} included in context):\n${taskList}\n\nProjects:\n${projectList}\n`;
        if (existingActions?.length > 0) {
            const existingSummary = existingActions
                .slice(0, 30)
                .map((a, i) => `${i + 1}. ${a.type}${a.taskId ? `:${a.taskId}` : ''}`)
                .join('\n');
            prompt += `\nExisting proposal actions (summary):\n${existingSummary}\n`;
        }
        if (refinement) {
            prompt += `\nUser refinement request:\n${refinement}\n`;
        } else {
            prompt += `\nCreate a new reorganization proposal.`;
        }

        const result = await this._generateWithFailover(() => this.reorgModel, prompt, { transientBaseMs: 12 });
        const raw = result.response.text().trim();
        const parsed = this._safeParseJson(raw);
        if (parsed) return this._safeNormalizeReorgProposal(parsed, tasks, projects);
        // Fallback: deterministic reorg proposal when model output is malformed.
        // This path is retained because the /reorg command depends on it for
        // graceful degradation — the user still gets a useful proposal even if
        // Gemini returns non-JSON.
        return this._safeNormalizeReorgProposal(this._buildFallbackReorgProposal(tasks, projects, recommendationState), tasks, projects);
    }

    _safeParseJson(raw = '') {
        if (!raw || typeof raw !== 'string') return null;
        const attempts = [];
        attempts.push(raw);
        const fenced = raw.match(/```json\s*([\s\S]*?)```/i)?.[1];
        if (fenced) attempts.push(fenced);
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            attempts.push(raw.slice(firstBrace, lastBrace + 1));
        }

        for (const candidate of attempts) {
            try {
                return JSON.parse(candidate);
            } catch {
                const normalized = candidate
                    .replace(/,\s*([}\]])/g, '$1')
                    .replace(/[“”]/g, '"')
                    .replace(/[‘’]/g, "'")
                    .replace(/[\u0000-\u001F]+/g, ' ');
                try {
                    return JSON.parse(normalized);
                } catch {
                    const repaired = normalized
                        .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
                        .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value) => `"${value.replace(/"/g, '\\"')}"`)
                        .replace(/,\s*([}\]])/g, '$1');
                    try {
                        return JSON.parse(repaired);
                    } catch {
                        // continue
                    }
                }
            }
        }
        return null;
    }

    // RETAINED SCOPE: _buildFallbackReorgProposal generates a deterministic
    // reorg proposal when Gemini's model output is malformed or unparsable.
    // It is called by generateReorgProposal() as a fallback path and by
    // _safeNormalizeReorgProposal as a secondary fallback.
    //
    // This helper is NOT a primary task-writing path. It exists solely to
    // ensure the /reorg command never fails silently — even if Gemini returns
    // garbage, the user gets a sensible default reorg (inbox triage + priority
    // inference).
    //
    // Do NOT call this from new code paths unless you need graceful degradation
    // for the reorg flow.
    _buildFallbackReorgProposal(tasks = [], projects = [], options = {}) {
        const fallbackTasks = this._compactReorgTasks(tasks, options, 40);
        const fallbackGoalThemeProfile = createGoalThemeProfile(USER_CONTEXT, { source: USER_CONTEXT_SOURCE });

        const actions = [];
        for (const task of fallbackTasks) {
            if (task.status !== 0 && task.status !== undefined) continue;
            const changes = {};
            if (![1, 3, 5].includes(task.priority)) {
                changes.priority = inferPriorityValueFromTask(task, {
                    goalThemeProfile: fallbackGoalThemeProfile,
                    workStyleMode: options.workStyleMode,
                    urgentMode: options.urgentMode,
                    stateSource: options.stateSource,
                });
            }
            if ((task.projectName || '').toLowerCase() === 'inbox') {
                const candidate = inferProjectIdFromTask(task, projects, {
                    goalThemeProfile: fallbackGoalThemeProfile,
                    workStyleMode: options.workStyleMode,
                    urgentMode: options.urgentMode,
                    stateSource: options.stateSource,
                });
                if (candidate && candidate !== task.projectId) changes.projectId = candidate;
            }
            if (Object.keys(changes).length > 0) {
                actions.push({ type: 'update', taskId: task.id, changes });
            }
            if (actions.length >= 30) break;
        }
        return {
            summary: 'Generated deterministic fallback proposal due malformed model output.',
            questions: [],
            actions,
        };
    }

    // RETAINED SCOPE: _safeNormalizeReorgProposal wraps _normalizeReorgProposal
    // with a try/catch. If normalization fails, it falls back to building a
    // deterministic proposal from scratch. This ensures the /reorg command
    // always returns usable output.
    _safeNormalizeReorgProposal(parsed, tasks, projects) {
        try {
            return this._normalizeReorgProposal(parsed, tasks, projects);
        } catch {
            return this._normalizeReorgProposal(this._buildFallbackReorgProposal(tasks, projects), tasks, projects);
        }
    }

    _compactReorgTasks(tasks = [], options = {}, limit = 80) {
        const { orderedTasks } = this._prepareBriefingTasks(tasks, options);
        return orderedTasks.slice(0, limit);
    }

    // RETAINED SCOPE: _normalizeReorgProposal sanitizes and deduplicates
    // raw reorg proposals from Gemini or the fallback builder. It is called
    // by _safeNormalizeReorgProposal and generateReorgProposal.
    //
    // This is NOT a primary task-writing path. It exists to ensure reorg
    // proposals are well-structured before being sent to the user via /reorg.
    _normalizeReorgProposal(proposal = {}, tasks = [], projects = []) {
        const cleaned = {
            summary: typeof proposal.summary === 'string' && proposal.summary.trim()
                ? proposal.summary.trim()
                : 'Reorganization proposal generated.',
            questions: Array.isArray(proposal.questions)
                ? proposal.questions.filter(q => typeof q === 'string' && q.trim()).slice(0, 8)
                : [],
            actions: Array.isArray(proposal.actions) ? proposal.actions : [],
        };

        const validTypes = new Set(['update', 'drop', 'create', 'complete']);
        const mergedByTask = new Map();
        const terminalByTask = new Map();
        const createSeen = new Set();
        const normalizedActions = [];
        const taskById = new Map(tasks.map(t => [t.id, t]));
        const goalThemeProfile = createGoalThemeProfile(USER_CONTEXT, { source: USER_CONTEXT_SOURCE });

        const nonInboxProjects = projects.filter(p => (p.name || '').toLowerCase() !== 'inbox');
        const defaultProjectId = nonInboxProjects[0]?.id || projects[0]?.id || null;

        for (const raw of cleaned.actions.slice(0, 60)) {
            const action = raw && typeof raw === 'object' ? { ...raw } : null;
            if (!action || !validTypes.has(action.type)) continue;
            const taskId = action.taskId || null;
            const changes = (action.changes && typeof action.changes === 'object') ? { ...action.changes } : {};

            if (action.type === 'create') {
                if (!changes.title || typeof changes.title !== 'string') continue;
                if (![0, 1, 3, 5].includes(changes.priority)) changes.priority = 1;
                if (!changes.projectId && defaultProjectId) changes.projectId = defaultProjectId;
                const key = `${changes.title.trim().toLowerCase()}|${changes.projectId || ''}|${changes.scheduleBucket || changes.dueDate || ''}`;
                if (createSeen.has(key)) continue;
                createSeen.add(key);
                normalizedActions.push({ type: 'create', changes });
                continue;
            }

            if (!taskId || !taskById.has(taskId)) continue;
            if (action.type === 'complete') {
                terminalByTask.set(taskId, { type: 'complete', taskId, changes: {} });
                continue;
            }

            const prior = mergedByTask.get(taskId) || {};
            const merged = { ...prior, ...changes };
            merged.__type = action.type === 'drop' ? 'drop' : (prior.__type === 'drop' ? 'drop' : 'update');
            mergedByTask.set(taskId, merged);
        }

        for (const [taskId, merged] of mergedByTask.entries()) {
            if (terminalByTask.has(taskId)) continue;
            const task = taskById.get(taskId);
            const type = merged.__type || 'update';
            delete merged.__type;

            if (![0, 1, 3, 5].includes(merged.priority)) {
                merged.priority = inferPriorityValueFromTask(task, { goalThemeProfile });
            }
            if (!merged.projectId && (task.projectName || '').toLowerCase() === 'inbox') {
                merged.projectId = inferProjectIdFromTask(task, projects, { goalThemeProfile }) || defaultProjectId;
            }
            if (type === 'drop') {
                // Non-destructive demotion path: keep as drop but include metadata changes.
                if (!merged.projectId) merged.projectId = inferProjectIdFromTask(task, projects, { goalThemeProfile }) || defaultProjectId;
                merged.priority = 0;
            }
            if (Object.keys(merged).length === 0) continue;
            normalizedActions.push({ type, taskId, changes: merged });
        }

        for (const completeAction of terminalByTask.values()) {
            normalizedActions.push(completeAction);
        }

        // Hard policy: avoid leaving active tasks in Inbox.
        const touched = new Set(
            normalizedActions
                .filter(a => a.taskId)
                .map(a => a.taskId)
        );
        const inboxActive = tasks.filter(t => (t.status === 0 || t.status === undefined) && (t.projectName || '').toLowerCase() === 'inbox');
        for (const task of inboxActive) {
            if (touched.has(task.id)) continue;
            const inferredProjectId = inferProjectIdFromTask(task, projects, { goalThemeProfile }) || defaultProjectId;
            if (!inferredProjectId || inferredProjectId === task.projectId) continue;
            normalizedActions.push({
                type: 'update',
                taskId: task.id,
                changes: {
                    projectId: inferredProjectId,
                    priority: inferPriorityValueFromTask(task, { goalThemeProfile }),
                },
            });
        }

        cleaned.actions = normalizedActions.slice(0, 30);
        if (cleaned.actions.length === 0 && tasks.length > 0) {
            const fallback = [];
            for (const task of tasks.slice(0, 10)) {
                if ((task.status !== 0 && task.status !== undefined)) continue;
                fallback.push({
                    type: 'update',
                    taskId: task.id,
                    changes: {
                        priority: inferPriorityValueFromTask(task, { goalThemeProfile }),
                        projectId: (task.projectName || '').toLowerCase() === 'inbox'
                            ? (inferProjectIdFromTask(task, projects, { goalThemeProfile }) || defaultProjectId)
                            : undefined,
                    },
                });
            }
            cleaned.actions = fallback
                .map(a => ({
                    ...a,
                    changes: Object.fromEntries(Object.entries(a.changes).filter(([, v]) => v !== undefined)),
                }))
                .filter(a => Object.keys(a.changes).length > 0);
        }

        const vagueQuestions = [];
        const isVague = (title = '') => {
            const t = title.trim().toLowerCase();
            if (!t) return true;
            const words = t.split(/\s+/);
            if (words.length <= 2) return true;
            if (words.length <= 3 && /\b(get|buy|print|call|check|fix|do|send|make)\b/.test(words[0])) return true;
            return /\b(task|todo|stuff|thing|misc|later|check|work on|some docs|letter|paperwork)\b/.test(t);
        };
        for (const t of tasks) {
            if ((t.status !== 0 && t.status !== undefined)) continue;
            if (isVague(t.title) || (!t.content && !t.dueDate)) {
                vagueQuestions.push(`Can you clarify what success looks like for "${t.title}"?`);
            }
            if (vagueQuestions.length >= 5) break;
        }
        if (cleaned.questions.length === 0 && vagueQuestions.length > 0) {
            cleaned.questions = vagueQuestions;
        }

        return cleaned;
    }

}
