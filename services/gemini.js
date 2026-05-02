// Gemini AI — goal-aware task analyzer and accountability engine
import { GoogleGenAI } from '@google/genai';
import { loadUserContextModule, getModuleExport } from './user-context-loader.js';
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
import { detectBehavioralPatterns } from './behavioral-patterns.js';

// ─── User Context ────────────────────────────────────────────
// Priority: 1) user_context.js (services/ or root or /etc/secrets/), 2) USER_CONTEXT env var, 3) generic default
let USER_CONTEXT;
let USER_CONTEXT_SOURCE;

const { mod: ctxModule } = await loadUserContextModule();
const userContext = getModuleExport(ctxModule, 'USER_CONTEXT');
if (userContext) {
    USER_CONTEXT = userContext;
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

// ─── Typed AI Errors ─────────────────────────────────────────
export class AIServiceUnavailableError extends Error {
    constructor(message, { status, model, keyIndex, retryAfterMs, resumeAt, scope } = {}) {
        super(message);
        this.name = 'AIServiceUnavailableError';
        this.kind = 'service_unavailable';
        this.status = status ?? 503;
        this.model = model ?? null;
        this.keyIndex = keyIndex ?? null;
        this.retryAfterMs = retryAfterMs ?? null;
        this.resumeAt = resumeAt ?? null;
        this.scope = scope ?? 'model_key';
    }
}

export class AIHardQuotaError extends Error {
    constructor(message, { status, model, keyIndex, retryAfterMs, resumeAt, scope } = {}) {
        super(message);
        this.name = 'AIHardQuotaError';
        this.kind = 'hard_quota';
        this.status = status ?? 429;
        this.model = model ?? null;
        this.keyIndex = keyIndex ?? null;
        this.retryAfterMs = retryAfterMs ?? null;
        this.resumeAt = resumeAt ?? null;
        this.scope = scope ?? 'model_key';
    }
}

export class AIRateLimitError extends Error {
    constructor(message, { status, model, keyIndex, retryAfterMs, resumeAt, scope } = {}) {
        super(message);
        this.name = 'AIRateLimitError';
        this.kind = 'rate_limit';
        this.status = status ?? 429;
        this.model = model ?? null;
        this.keyIndex = keyIndex ?? null;
        this.retryAfterMs = retryAfterMs ?? null;
        this.resumeAt = resumeAt ?? null;
        this.scope = scope ?? 'model_key';
    }
}

export class AIInvalidKeyError extends Error {
    constructor(message, { status, model, keyIndex, retryAfterMs, resumeAt, scope } = {}) {
        super(message);
        this.name = 'AIInvalidKeyError';
        this.kind = 'invalid_key';
        this.status = status ?? 403;
        this.model = model ?? null;
        this.keyIndex = keyIndex ?? null;
        this.retryAfterMs = retryAfterMs ?? null;
        this.resumeAt = resumeAt ?? null;
        this.scope = scope ?? 'key';
    }
}

// ─── Daily Briefing Prompt ──────────────────────────────────
const BRIEFING_PROMPT = `${USER_CONTEXT}

Generate today's focused plan as structured JSON only.

Rules:
- Maximum 3 tasks in priorities.
- First priority MUST be core goal if one exists.
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
- Core goal/career/study tasks -> morning/afternoon biased scheduling.
- Admin tasks -> later slots unless urgent/time-bound.
- For uncertainty, include a clarifying question instead of guessing.

Output constraints:
- Max 30 actions.
- Each update action must include taskId and at least one concrete field in changes.
- Each create action must include title and priority in changes.
- Return compact plain JSON only (no markdown, no code fences, no prose).
`;

/**
 * Builds a prompt note based on the active work style mode.
 * @param {string} [workStyleMode=store.MODE_STANDARD] - The active work style mode
 * @returns {string} Prompt augmentation string
 */
export function buildWorkStylePromptNote(workStyleMode = store.MODE_STANDARD) {
    if (workStyleMode === store.MODE_FOCUS) {
        return 'FOCUS MODE is active. Minimize interruptions. Keep responses short. Surface only critical items. Frame guidance as crisp next steps without extra commentary. Do not imply urgency unless the user explicitly activated urgent mode. When confidence is low, label uncertainty, ask, or stay quiet; never present weak behavioral or priority inference as fact. Use silent signals first. Direct call-outs only when repeated evidence justifies them. If guidance is ignored repeatedly, adapt or back off instead of escalating.';
    }

    if (workStyleMode === store.MODE_URGENT) {
        return 'URGENT MODE is active. Use direct, assertive, action-oriented language only when task evidence, deadlines, or explicit user context justify it. Keep responses as short as possible. No pleasantries. Be non-judgmental: no shame, blame, or moralizing. If a task mutation is ambiguous, ask for clarification instead of guessing. Reflect urgency only because the user explicitly activated urgent mode; never invent urgency. When confidence is low, label uncertainty, ask, or stay quiet; never present weak behavioral or priority inference as fact. Urgent mode does not lower the confidence threshold for behavioral claims. Use silent signals first. Direct call-outs only when repeated evidence justifies them. Strict commands are allowed only because urgent mode was explicitly activated. If guidance is ignored repeatedly, adapt or back off instead of escalating. Do not skip validation or safety checks. Strip only formatting niceties; preserve substantive content. This changes tone only: do not mutate TickTick state unless the user explicitly asks for a task operation. Urgent mode is temporary and will revert automatically.';
    }

    return 'STANDARD MODE is active. Use a balanced tone, normal verbosity, and frame suggestions as options. Do not imply urgency unless the user explicitly activated urgent mode. When confidence is low, label uncertainty, ask, or stay quiet; never present weak behavioral or priority inference as fact. Use silent signals first. Direct call-outs only when repeated evidence justifies them. If guidance is ignored repeatedly, adapt or back off instead of escalating.';
}

/**
 * Gemini AI analysis and generation engine.
 * Handles model initialization, API key rotation, and summary generation.
 */
export class GeminiAnalyzer {
    /**
     * Creates a new GeminiAnalyzer instance.
     * @param {string|string[]} apiKeys - One or more Gemini API keys
     * @param {Object} [config={}] - Configuration options
     * @param {string} [config.modelFast='gemini-2.5-flash'] - Model for fast operations
     * @param {string} [config.modelAdvanced='gemini-2.5-pro'] - Model for advanced operations
     */
    constructor(apiKeys, config = {}) {
        const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
        this._keys = keys.filter(k => k && k !== 'YOUR_GEMINI_API_KEY_HERE');
        if (this._keys.length === 0) {
            throw new Error('❌ Gemini API key not set! Get one from https://aistudio.google.com/apikey');
        }

        this._config = {
            modelFast: config.modelFast || 'gemini-2.5-flash',
            modelAdvanced: config.modelAdvanced || 'gemini-2.5-pro',
        };

        this._activeKeyIndex = 0;
        this._exhaustedUntilByKey = new Array(this._keys.length).fill(null);
        this._keyUnavailableReason = new Array(this._keys.length).fill(null);

        // Model fallback chains per tier
        this._modelTiers = {
            fast: this._buildTierChain(config.modelFast, config.modelFastFallbacks),
            advanced: this._buildTierChain(config.modelAdvanced, config.modelAdvancedFallbacks),
        };

        // Per-model+key exhaustion tracking
        // Map<modelName, Array<{ until: number|null, reason: string|null }>>
        this._modelKeyExhaustion = new Map();

        // Per-model circuit breaker
        // Map<model, { openUntil, failures: Array<{at,kind}>, halfOpen }>
        this._modelCircuitBreaker = new Map();

        // Per-model failure counters for telemetry
        // Map<model, { _503, _429_quota, _429_rate, invalid_key, network, total }>
        this._aiFailureCounts = new Map();

        // Models where all keys hit quota exhaustion — cached for 24h to avoid
        // burning time rotating through every key on each request.
        // Map<model, expiresAtMs>
        this._permanentlyExhaustedModels = new Map();
    }

    _isModelPermanentlyExhausted(model) {
        const expiresAt = this._permanentlyExhaustedModels.get(model);
        if (!expiresAt) return false;
        if (Date.now() > expiresAt) {
            this._permanentlyExhaustedModels.delete(model);
            return false;
        }
        return true;
    }

    _markModelPermanentlyExhausted(model) {
        const ttlMs = 24 * 60 * 60 * 1000; // 24 hours
        this._permanentlyExhaustedModels.set(model, Date.now() + ttlMs);
    }

    /**
     * Clears the permanently-exhausted model cache. Use for manual reset
     * or when daily quotas are known to have reset.
     */
    clearPermanentlyExhaustedModels() {
        this._permanentlyExhaustedModels.clear();
    }

    /**
     * Prepares tasks for briefing by filtering and ranking.
     * @param {Array<Object>} tasks - Raw tasks
     * @param {Object} options - Preparation options
     * @returns {Object} { goalThemeProfile, ranking, orderedTasks }
     * @private
     */
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

    /**
     * Detects behavioral patterns for summaries.
     * @param {Object} options - Resolution options
     * @returns {Promise<Array<Object>>} List of detected patterns
     * @private
     */
    async _resolveBehavioralPatterns(options = {}) {
        const userId = options.userId ?? options.chatId ?? store.getChatId();
        if (userId == null) {
            return [];
        }

        try {
            const signals = await this._getBehavioralSignalsForSummary(userId);
            return this._detectBehavioralPatternsForSummary(signals, {
                nowMs: Date.parse(options.generatedAtIso || new Date().toISOString()) || Date.now(),
            });
        } catch {
            return [];
        }
    }

    /**
     * Fetches behavioral signals for a user.
     * @param {string} userId - Target user ID
     * @returns {Promise<Array<Object>>} List of signals
     * @private
     */
    async _getBehavioralSignalsForSummary(userId) {
        return store.getBehavioralSignals(userId);
    }

    /**
     * Internal pattern detection logic.
     * @param {Array<Object>} signals - User signals
     * @param {Object} options - Detection options
     * @returns {Array<Object>} Detected patterns
     * @private
     */
    _detectBehavioralPatternsForSummary(signals, options = {}) {
        return detectBehavioralPatterns(signals, options);
    }

    /**
     * Resolves the current work style and urgent mode state.
     * @param {Object} options - Resolution options
     * @returns {Promise<Object>} { workStyleMode, urgentMode, stateSource }
     * @private
     */
    async _resolveRecommendationState(options = {}) {
        const workStyleMode = options.workStyleMode || store.MODE_STANDARD;
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
            const resolvedMode = await store.getWorkStyleMode(userId);
            return {
                workStyleMode: resolvedMode,
                urgentMode: resolvedMode === store.MODE_URGENT,
                stateSource: 'store',
            };
        } catch {
            return { workStyleMode: store.MODE_STANDARD, urgentMode: false, stateSource: 'default' };
        }
    }

    /**
     * Returns info about the active API key index and total count.
     * @returns {{index: number, total: number}}
     */
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
        const status = err?.status;
        const msg = (err?.message || '').toLowerCase();
        const isRateLimit = status === 429 || msg.includes('resource_exhausted') || msg.includes('429');
        if (!isRateLimit) return false;

        // Hard quota indicators (daily / global / free tier)
        const isHardQuota = msg.includes('per day')
            || msg.includes('perday')
            || msg.includes('daily limit')
            || msg.includes('free tier')
            || msg.includes('quota exceeded')
            || msg.includes('exhausted');

        // Parse retry hints if present
        const retryMatch = (err?.message || '').match(/retry\s+(?:after|in)\s+([\d\.]+)\s*(s|sec|seconds|m|min|minutes|h|hours)?/i)
            || (err?.message || '').match(/please retry in ([\d\.]+)s/i);
        if (retryMatch) {
            const value = parseFloat(retryMatch[1]);
            const unit = (retryMatch[2] || 's').toLowerCase();
            let ms = value * 1000;
            if (unit.startsWith('m')) ms = value * 60 * 1000;
            if (unit.startsWith('h')) ms = value * 60 * 60 * 1000;
            err._parsedRetryAfterMs = Math.ceil(ms);
        }

        return isHardQuota;
    }

    _isGlobalQuotaError(err) {
        const msg = (err?.message || '').toLowerCase();
        return msg.includes('per day')
            || msg.includes('perday')
            || msg.includes('daily limit')
            || msg.includes('free tier');
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

    _buildTierChain(primary, fallbacks) {
        const chain = [primary];
        if (Array.isArray(fallbacks)) {
            for (const fb of fallbacks) {
                if (fb && typeof fb === 'string' && fb !== primary && !chain.includes(fb)) {
                    chain.push(fb);
                }
            }
        }
        return chain;
    }

    _getModelKeyState(model, keyIndex) {
        if (!this._modelKeyExhaustion.has(model)) {
            this._modelKeyExhaustion.set(model,
                new Array(this._keys.length).fill(null).map(() => ({ until: null, reason: null }))
            );
        }
        return this._modelKeyExhaustion.get(model)[keyIndex];
    }

    _isModelKeyAvailable(model, keyIndex) {
        // Per-model+key check: model-specific exhaustion
        const state = this._getModelKeyState(model, keyIndex);
        if (state.until && Date.now() < state.until) return false;
        if (state.until && Date.now() >= state.until) {
            state.until = null;
            state.reason = null;
        }

        // Global key check: invalid keys or globally exhausted keys are unavailable for all models
        if (!this._isKeyAvailable(keyIndex)) return false;

        return true;
    }

    _markModelKeyExhausted(model, keyIndex, reason, untilMs) {
        const state = this._getModelKeyState(model, keyIndex);
        state.until = untilMs;
        state.reason = reason;
    }

    _areAllKeysExhaustedForModel(model) {
        for (let i = 0; i < this._keys.length; i++) {
            if (this._isModelKeyAvailable(model, i)) return false;
        }
        return true;
    }

    _findNextAvailableKeyForModel(model, afterIndex) {
        for (let i = 1; i <= this._keys.length; i++) {
            const idx = (afterIndex + i) % this._keys.length;
            if (this._isModelKeyAvailable(model, idx)) return idx;
        }
        return -1;
    }

    _getCircuitState(model) {
        if (!this._modelCircuitBreaker.has(model)) {
            this._modelCircuitBreaker.set(model, {
                openUntil: null,
                failures: [],
                halfOpen: false,
            });
        }
        return this._modelCircuitBreaker.get(model);
    }

    _isCircuitOpen(model) {
        const state = this._getCircuitState(model);
        if (state.openUntil && Date.now() < state.openUntil) {
            console.warn(`[CircuitBreaker] ${JSON.stringify({ eventType: 'ai.circuit_breaker.blocked', model, openUntil: state.openUntil })}`);
            return true;
        }
        if (state.openUntil && Date.now() >= state.openUntil) {
            state.openUntil = null;
            state.halfOpen = true;
        }
        return false;
    }

    _recordCircuitFailure(model, kind) {
        const state = this._getCircuitState(model);
        const now = Date.now();
        state.failures.push({ at: now, kind });
        // Prune failures older than 5 minutes
        state.failures = state.failures.filter(f => now - f.at <= 5 * 60 * 1000);

        const recent60s503 = state.failures.filter(f => f.kind === '503' && now - f.at <= 60 * 1000);
        const recent5min503 = state.failures.filter(f => f.kind === '503');

        // Open on 2 consecutive 503s in 60s or 3 in 5 min
        if (recent60s503.length >= 2 || recent5min503.length >= 3) {
            const cooldown = 60 * 1000 + Math.random() * 60 * 1000; // 60-120s
            state.openUntil = now + cooldown;
            state.halfOpen = false;
            console.warn(`[CircuitBreaker] ${JSON.stringify({
                eventType: 'ai.circuit_breaker.open',
                model,
                openUntil: state.openUntil,
                failureCount: state.failures.length,
                lastFailureKind: kind,
            })}`);
        }
    }

    _recordCircuitSuccess(model) {
        const state = this._getCircuitState(model);
        const wasHalfOpen = state.halfOpen;
        state.failures = [];
        state.openUntil = null;
        state.halfOpen = false;
        if (wasHalfOpen) {
            console.log(`[CircuitBreaker] ${JSON.stringify({ eventType: 'ai.circuit_breaker.close', model })}`);
        }
    }

    _getFailureCounts(model) {
        if (!this._aiFailureCounts.has(model)) {
            this._aiFailureCounts.set(model, { _503: 0, _429_quota: 0, _429_rate: 0, invalid_key: 0, network: 0, total: 0 });
        }
        return this._aiFailureCounts.get(model);
    }

    _recordAiFailure(model, kind, keyIndex) {
        const counts = this._getFailureCounts(model);
        if (counts[kind] !== undefined) counts[kind]++;
        counts.total++;
        console.warn(`[AIFailure] ${JSON.stringify({ eventType: 'ai.failure', model, kind, keyIndex })}`);
        if (counts.total % 10 === 0) {
            console.warn(`[AIFailure] ${JSON.stringify({
                eventType: 'ai.failure.summary',
                model,
                counts: {
                    _503: counts._503,
                    _429_quota: counts._429_quota,
                    _429_rate: counts._429_rate,
                    invalid_key: counts.invalid_key,
                    network: counts.network,
                },
            })}`);
        }
    }

    isTierExhausted(modelTier = 'fast') {
        const chain = this._modelTiers[modelTier];
        for (const model of chain) {
            if (!this._areAllKeysExhaustedForModel(model)) return false;
        }
        return true;
    }

    /**
     * Returns the Date when quota will reset (null if not exhausted).
     * @returns {Date|null} Quota reset time
     */
    quotaResumeTime() {
        if (!this.isQuotaExhausted()) return null;
        const nonNulls = this._exhaustedUntilByKey.filter(
            (t, idx) => t !== null && this._keyUnavailableReason[idx] === 'daily_quota'
        );

        // Also check per-model+key exhaustion states
        for (const [, states] of this._modelKeyExhaustion) {
            for (const state of states) {
                if (state.until && state.reason === 'daily_quota') {
                    nonNulls.push(state.until);
                }
            }
        }

        return nonNulls.length ? new Date(Math.min(...nonNulls)) : null;
    }

    /**
     * Checks if all available API keys have hit their daily quota.
     * This checks per-key exhaustion only. For tier-specific checks,
     * use isTierExhausted('fast') or isTierExhausted('advanced').
     * @returns {boolean} True if quota is exhausted across all keys
     */
    isQuotaExhausted() {
        let allKeysQuotaExhausted = true;
        for (let i = 0; i < this._keys.length; i++) {
            const until = this._exhaustedUntilByKey[i];
            if (!until || Date.now() > until) { allKeysQuotaExhausted = false; break; }
            if (this._keyUnavailableReason[i] !== 'daily_quota') { allKeysQuotaExhausted = false; break; }
        }
        if (allKeysQuotaExhausted) return true;

        const allModels = new Set();
        for (const tierChain of Object.values(this._modelTiers)) {
            for (const model of tierChain) allModels.add(model);
        }
        if (allModels.size > 0) {
            let allPermanentlyExhausted = true;
            for (const model of allModels) {
                if (!this._isModelPermanentlyExhausted(model)) {
                    allPermanentlyExhausted = false;
                    break;
                }
            }
            if (allPermanentlyExhausted) return true;
        }

        return false;
    }

    /**
     * Executes a model generation request with automatic failover and retries.
     * @param {string} prompt - Prompt text
     * @param {Function} apiCallFn - Function that receives (ai, prompt, model)
     * @param {Object} options - Generation options
     * @param {number} [options.transientBaseMs=15] - Base backoff for transient 429s
     * @param {string} [options.modelTier='fast'] - Model tier to use (fast/advanced)
     * @returns {Promise<Object>} Model generation result
     * @private
     */
    async _executeWithFailover(prompt, apiCallFn, { transientBaseMs = 15, modelTier = 'fast', interactiveWritePath = false } = {}) {
        // Global pre-checks
        if (this._areAllKeysUnavailable()) {
            throw new AIInvalidKeyError('All API keys are unavailable.', { status: 403, scope: 'account' });
        }

        const chain = this._modelTiers[modelTier];
        const maxTransientRetries = interactiveWritePath ? 1 : 2;

        let hasQuotaExhaustion = false;
        let hasServiceUnavailable = false;
        let hasInvalidKey = false;

        for (let modelIndex = 0; modelIndex < chain.length; modelIndex++) {
            const model = chain[modelIndex];

            if (this._isModelPermanentlyExhausted(model)) {
                console.log(`[Gemini] Model ${model} permanently exhausted, skipping`);
                continue;
            }

            if (modelIndex > 0) {
                console.log(`⚡ [Gemini] Model fallback: ${chain[modelIndex - 1]} exhausted → trying ${model} (tier: ${modelTier})`);
            }

            // Circuit breaker check
            if (this._isCircuitOpen(model)) {
                console.log(`⏭️ [Gemini] Circuit breaker open for ${model}, skipping to next model in chain`);
                continue;
            }

            if (this._areAllKeysExhaustedForModel(model)) {
                console.log(`⏭️ [Gemini] All keys exhausted for ${model}, skipping to next model in chain`);
                continue;
            }

            let currentKeyIndex = this._activeKeyIndex;
            let rotations = 0;
            let transientAttempts = 0;
            let modelHitQuota = false;
            const maxRotations = this._keys.length - 1;

            while (true) {
                if (!this._isModelKeyAvailable(model, currentKeyIndex)) {
                    const nextIdx = this._findNextAvailableKeyForModel(model, currentKeyIndex);
                    if (nextIdx === -1) break; // all keys exhausted for this model
                    currentKeyIndex = nextIdx;
                    rotations++;
                    if (rotations > maxRotations) break;
                }

                const maskedKey = this._keys[currentKeyIndex].slice(0, 4) + '...' + this._keys[currentKeyIndex].slice(-4);

                try {
                    const ai = new GoogleGenAI({ apiKey: this._keys[currentKeyIndex] });
                    const response = await apiCallFn(ai, prompt, model);

                    // Success — update active key index
                    this._activeKeyIndex = currentKeyIndex;

                    // Close circuit breaker on success
                    this._recordCircuitSuccess(model);

                    // Log usage metadata
                    const usage = response?.usageMetadata;
                    if (usage) {
                        console.log(`📊 [Gemini API] Tokens -> In: ${usage.promptTokenCount} | Out: ${usage.candidatesTokenCount} | Total: ${usage.totalTokenCount}`);
                    }

                    if (modelIndex > 0) {
                        console.log(`✅ [Gemini] Fallback model ${model} succeeded (tier: ${modelTier})`);
                    }

                    return response;

                } catch (err) {
                    const activeK = this._keys[currentKeyIndex];
                    const maskedKey = activeK ? `${activeK.slice(0, 4)}...${activeK.slice(-4)}` : 'undefined';
                    console.error(`[DIAGNOSTICS] Key ${currentKeyIndex + 1}/${this._keys.length} [${maskedKey}] exactly threw: [${err.status}] ${err.message}`);

                    if (this._isInvalidApiKeyError(err)) {
                        hasInvalidKey = true;
                        this._recordAiFailure(model, 'invalid_key', currentKeyIndex);
                        // Expired/leaked keys should be sidelined for longer than daily quota windows.
                        const disableMs = Date.now() + (7 * 24 * 60 * 60 * 1000);
                        this._markActiveKeyUnavailable('invalid_key', disableMs);
                        this._markModelKeyExhausted(model, currentKeyIndex, 'invalid_key', disableMs);
                        console.error(`🚫 Key ${currentKeyIndex + 1}/${this._keys.length} marked unavailable (invalid/leaked).`);
                        const nextIdx = this._findNextAvailableKeyForModel(model, currentKeyIndex);
                        if (nextIdx !== -1) {
                            currentKeyIndex = nextIdx;
                            rotations++;
                            continue;
                        }
                        // No more keys available for this model — try next model in chain
                        break;
                    }

                    if (this._isDailyQuotaError(err)) {
                        hasQuotaExhaustion = true;
                        modelHitQuota = true;
                        this._recordAiFailure(model, '429_quota', currentKeyIndex);
                        const resetMs = this._getQuotaResetMs();
                        // Mark model+key as exhausted for all quota types
                        this._markModelKeyExhausted(model, currentKeyIndex, 'daily_quota', Date.now() + resetMs);
                        // Mark whole key only for global quota
                        if (this._isGlobalQuotaError(err)) {
                            this._markActiveKeyUnavailable('daily_quota', Date.now() + resetMs);
                        }

                        // Try next key for THIS model before falling through to next model
                        const nextIdx = this._findNextAvailableKeyForModel(model, currentKeyIndex);
                        if (nextIdx !== -1) {
                            currentKeyIndex = nextIdx;
                            rotations++;
                            if (rotations <= maxRotations) {
                                console.log(`🔄 Rotating to next key for model ${model} (daily quota)`);
                                continue;
                            }
                        }

                        // All keys for this model exhausted — fall through to next model
                        if (this.isQuotaExhausted()) {
                            const resumeTime = this.quotaResumeTime();
                            const resumeStr = resumeTime ? resumeTime.toLocaleTimeString('en-US', {
                                timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit'
                            }) : 'unknown';
                            console.error(`🛑 All AI keys exhausted — pausing calls until ~${resumeStr} PT.`);
                        } else {
                            console.error(`⚠️ Daily quota hit for ${model} across ${rotations + 1} attempted keys. Moving to next model in chain.`);
                        }
                        break; // Exit inner while, continue to next model in outer for loop
                    }

                    // Transient error handling (rate limits + service unavailable)
                    const isRateLimit = err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('429');
                    const isServiceUnavailable = err.status === 503;
                    const isTransient = isRateLimit || isServiceUnavailable;
                    const isNetworkError = !isTransient && (err.message?.includes('network') || err.message?.includes('ECONNRESET') || err.message?.includes('ETIMEDOUT') || err.message?.includes('EAI_AGAIN'));

                    if (isTransient) {
                        if (isServiceUnavailable) {
                            hasServiceUnavailable = true;
                            this._recordAiFailure(model, '503', currentKeyIndex);
                        } else if (isRateLimit) {
                            this._recordAiFailure(model, '429_rate', currentKeyIndex);
                        }

                        // Fast-fail 503 on interactive write path: 0 same-model retries
                        if (isServiceUnavailable && interactiveWritePath) {
                            this._recordCircuitFailure(model, '503');
                            console.error(`⏳ Service unavailable for ${model}, fast-falling back to next model (write path)`);
                            break;
                        }

                        const effectiveMaxRetries = interactiveWritePath ? 1 : maxTransientRetries;
                        if (transientAttempts < effectiveMaxRetries) {
                            let dynamicBackoffMs = transientBaseMs;
                            const match = err.message?.match(/Please retry in ([\d\.]+)s/);
                            if (match && match[1]) {
                                dynamicBackoffMs = parseFloat(match[1]) * 1000 + 2000;
                            }
                            // No 10s floor for 503; cap jitter for write path
                            const jitter = interactiveWritePath
                                ? 100 + Math.random() * 200  // 100-300ms
                                : Math.random() * 5000;
                            const backoffMs = dynamicBackoffMs + jitter;
                            const errorType = isServiceUnavailable ? 'service unavailable' : 'rate limited';
                            console.error(`⏳ ${errorType}, waiting ${Math.round(backoffMs / 1000)}s before retry ${transientAttempts + 1}/${effectiveMaxRetries}...`);
                            await new Promise(r => setTimeout(r, backoffMs));
                            transientAttempts++;
                            continue;
                        }

                        // Transient retries exhausted — try next model in chain
                        const errorType = isServiceUnavailable ? 'Service unavailable' : 'Rate limit';
                        console.error(`⏳ ${errorType} retries exhausted for ${model}, trying next model in chain.`);
                        if (isServiceUnavailable) {
                            this._recordCircuitFailure(model, '503');
                        }
                        break;
                    }

                    if (isNetworkError) {
                        this._recordAiFailure(model, 'network', currentKeyIndex);
                    }

                    throw err;
                }
            }

            if (modelHitQuota && this._areAllKeysExhaustedForModel(model)) {
                this._markModelPermanentlyExhausted(model);
                console.log(`[Gemini] Model ${model} marked permanently exhausted (all keys quota-depleted)`);
            }
        }

        // All models in chain exhausted — throw typed error based on dominant failure
        if (hasQuotaExhaustion) {
            throw new AIHardQuotaError('All model fallback keys exhausted due to quota limits.', { status: 429, scope: 'account' });
        }
        if (hasInvalidKey) {
            throw new AIInvalidKeyError('All model fallback keys exhausted due to invalid keys.', { status: 403, scope: 'account' });
        }
        if (hasServiceUnavailable) {
            throw new AIServiceUnavailableError('All model fallback keys exhausted due to service unavailability.', { status: 503, scope: 'account' });
        }
        throw new AIServiceUnavailableError('All model fallback keys exhausted.', { status: 503, scope: 'account' });
    }



    // ─── Generate daily briefing ──────────────────────────────

    /**
     * Generates structured model summary for a daily briefing.
     * @param {Array<Object>} tasks - List of active tasks
     * @param {Object} [options={}] - Generation options
     * @returns {Promise<Object>} Result with modelSummary, ranking, orderedTasks, and recommendationState
     */
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
        const workStylePromptNote = buildWorkStylePromptNote(recommendationState.workStyleMode);

        const prompt = `${workStylePromptNote ? `${workStylePromptNote}\n\n` : ''}Today is ${today}.\n\nShared priority guidance:\n${rankedPreview || 'No ranked guidance available.'}\n\nActive tasks (${orderedTasks.length} total):\n${taskList}`;
        const response = await this._executeWithFailover(
            prompt,
            async (ai, p, model) => ai.models.generateContent({
                model,
                contents: p,
                config: {
                    systemInstruction: BRIEFING_PROMPT,
                    responseMimeType: "application/json",
                    responseSchema: briefingSummarySchema
                }
            }),
            { transientBaseMs: 15 }
        );

        const raw = response.text.trim();
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

    /**
     * Generates a fully composed daily briefing summary message.
     * @param {Array<Object>} tasks - List of active tasks
     * @param {Object} [options={}] - Generation options
     * @returns {Promise<string>} Composed summary text
     */
    async generateDailyBriefingSummary(tasks, options = {}) {
        const {
            modelSummary,
            ranking,
            orderedTasks,
            recommendationState,
        } = await this.generateDailyBriefingModelSummary(tasks, options);
        const behavioralPatterns = await this._resolveBehavioralPatterns(options);

        return composeBriefingSummary({
            context: {
                kind: 'briefing',
                entryPoint: options.entryPoint || 'manual_command',
                userId: options.userId ?? options.chatId ?? null,
                generatedAtIso: options.generatedAtIso || new Date().toISOString(),
                timezone: options.timezone || null,
                urgentMode: recommendationState.urgentMode,
                ticktickFetchFailed: options.ticktickFetchFailed === true,
                tonePolicy: 'preserve_existing',
            },
            activeTasks: orderedTasks,
            behavioralPatterns,
            rankingResult: ranking,
            modelSummary,
        });
    }

    // ─── Generate weekly digest ───────────────────────────────

    /**
     * Generates a fully composed weekly accountability summary.
     * @param {Array<Object>} allTasks - Current active tasks
     * @param {Object} processedThisWeek - History of processed tasks
     * @param {Object} [options={}] - Generation options
     * @returns {Promise<string>} Composed digest text
     */
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
        const behavioralPatterns = await this._resolveBehavioralPatterns(options);

        const workStylePromptNote = buildWorkStylePromptNote(recommendationState.workStyleMode);
        const prompt = `${workStylePromptNote ? `${workStylePromptNote}\n\n` : ''}Current active tasks (${orderedTasks.length}):\n${taskList || 'None'}\n\nProcessed tasks this week (${processedEntries.length}):\n${processed || 'None'}`;
        const response = await this._executeWithFailover(
            prompt,
            async (ai, p, model) => ai.models.generateContent({
                model,
                contents: p,
                config: {
                    systemInstruction: WEEKLY_SUMMARY_PROMPT,
                    responseMimeType: "application/json",
                    responseSchema: weeklySummarySchema
                }
            }),
            { transientBaseMs: 15, modelTier: 'advanced' }
        );

        const raw = response.text.trim();
        const parsed = this._safeParseJson(raw);
        const summaryPayload = parsed && typeof parsed === 'object' ? parsed : {};

        return composeWeeklySummary({
            context: {
                entryPoint: options.entryPoint || 'manual_command',
                userId: options.userId ?? options.chatId ?? store.getChatId(),
                generatedAtIso: options.generatedAtIso || new Date().toISOString(),
                timezone: options.timezone || null,
                urgentMode: recommendationState.urgentMode,
                ticktickFetchFailed: options.ticktickFetchFailed === true,
                excludedTaskIds: Array.isArray(options.excludedTaskIds) ? options.excludedTaskIds : [],
                tonePolicy: options.tonePolicy || 'preserve_existing',
            },
            activeTasks: orderedTasks,
            behavioralPatterns,
            processedHistory: processedEntries,
            historyAvailable: options.historyAvailable !== false,
            rankingResult: ranking,
            modelSummary: summaryPayload,
        });
    }

    /**
     * Generates a fully composed daily close reflection summary.
     * @param {Array<Object>} allTasks - Current active tasks
     * @param {Array<Object>|Object} processedTasks - History of processed tasks
     * @param {Object} [options={}] - Generation options
     * @returns {Promise<string>} Composed reflection text
     */
    async generateDailyCloseSummary(allTasks, processedTasks, options = {}) {
        const recommendationState = await this._resolveRecommendationState(options);
        const { ranking, orderedTasks } = this._prepareBriefingTasks(allTasks, {
            ...options,
            ...recommendationState,
        });
        const behavioralPatterns = await this._resolveBehavioralPatterns(options);

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
            behavioralPatterns,
            processedHistory: processedEntries,
            rankingResult: ranking,
            modelSummary: {},
        });
    }

    /**
     * Generates a reorganization proposal for tasks and projects.
     * @param {Array<Object>} [tasks=[]] - List of tasks
     * @param {Array<Object>} [projects=[]] - List of projects
     * @param {string|null} [refinement=null] - User refinement request
     * @param {Array<Object>} [existingActions=[]] - Existing proposal actions
     * @param {Object} [options={}] - Generation options
     * @returns {Promise<Object>} Normalized reorg proposal
     */
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

        const workStylePromptNote = buildWorkStylePromptNote(recommendationState.workStyleMode);
        let prompt = `${workStylePromptNote ? `${workStylePromptNote}\n\n` : ''}Current tasks (${tasks.length} total, ${compactTasks.length} included in context):\n${taskList}\n\nProjects:\n${projectList}\n`;
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

        const response = await this._executeWithFailover(
            prompt,
            async (ai, p, model) => ai.models.generateContent({
                model,
                contents: p,
                config: {
                    systemInstruction: `You are an organizational assistant...\\n\\nUser Context:\\n${USER_CONTEXT}`,
                    responseMimeType: "application/json",
                    responseSchema: reorgSchema
                }
            }),
            { transientBaseMs: 12, modelTier: 'advanced' }
        );

        const raw = response.text.trim();
        const parsed = this._safeParseJson(raw);
        if (parsed) return this._safeNormalizeReorgProposal(parsed, tasks, projects);
        // Fallback: deterministic reorg proposal when model output is malformed.
        // This path is retained because the /reorg command depends on it for
        // graceful degradation — the user still gets a useful proposal even if
        // Gemini returns non-JSON.
        return this._safeNormalizeReorgProposal(this._buildFallbackReorgProposal(tasks, projects, recommendationState), tasks, projects);
    }

    /**
     * Safely parses JSON with multiple retry strategies for model output.
     * @param {string} [raw=''] - Raw text to parse
     * @returns {Object|null} Parsed object or null
     * @private
     */
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
                changes.priority = 1;
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
            summary: "I couldn't generate a full proposal, so I created a simple one based on your current tasks.",
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

    /**
     * Compacts task list for reorg context to stay within token limits.
     * @param {Array<Object>} [tasks=[]] - Raw tasks
     * @param {Object} [options={}] - Options
     * @param {number} [limit=80] - Maximum number of tasks
     * @returns {Array<Object>} Compacted tasks
     * @private
     */
    _compactReorgTasks(tasks = [], options = {}, limit = 80) {
        const { orderedTasks } = this._prepareBriefingTasks(tasks, options);
        return orderedTasks.slice(0, limit);
    }

    /**
     * Normalizes and deduplicates a reorg proposal.
     * @param {Object} [proposal={}] - Raw proposal
     * @param {Array<Object>} [tasks=[]] - Reference tasks
     * @param {Array<Object>} [projects=[]] - Reference projects
     * @returns {Object} Normalized proposal
     * @private
     */
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

        function cleanReorgTitle(title) {
            if (typeof title !== 'string') return title;
            const jsonArtifactMatch = title.match(/^(.*?)["']?\s*[,\]\}]*\s*["']?\s*(?:priority|projectId|scheduleBucket|dueDate)\s*:/i);
            if (jsonArtifactMatch) return jsonArtifactMatch[1].trim();
            return title.trim();
        }

        for (const raw of cleaned.actions.slice(0, 60)) {
            const action = raw && typeof raw === 'object' ? { ...raw } : null;
            if (!action || !validTypes.has(action.type)) continue;
            const taskId = action.taskId || null;
            const changes = (action.changes && typeof action.changes === 'object') ? { ...action.changes } : {};

            if (action.type === 'create') {
                if (changes.title && typeof changes.title === 'string') {
                    changes.title = cleanReorgTitle(changes.title);
                }
                if (!changes.title || typeof changes.title !== 'string') continue;
                if (![0, 1, 3, 5].includes(changes.priority)) changes.priority = 1;
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

            if (merged.title && typeof merged.title === 'string') {
                merged.title = cleanReorgTitle(merged.title);
            }

            if (merged.priority !== undefined && ![0, 1, 3, 5].includes(merged.priority)) {
                delete merged.priority;
            }
            if (type === 'drop') {
                // Non-destructive demotion path: keep as drop but include metadata changes.
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
            const inferredProjectId = inferProjectIdFromTask(task, projects, { goalThemeProfile });
            if (!inferredProjectId || inferredProjectId === task.projectId) continue;
            normalizedActions.push({
                type: 'update',
                taskId: task.id,
                changes: {
                    projectId: inferredProjectId,
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
                        projectId: (task.projectName || '').toLowerCase() === 'inbox'
                            ? inferProjectIdFromTask(task, projects, { goalThemeProfile })
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

    /**
     * Returns a health snapshot for monitoring /health endpoints.
     * @returns {Object} Health snapshot containing circuit-breaker state, failure counts, and key availability.
     */
    getHealthSnapshot() {
        const circuitBreakers = {};
        for (const [model, state] of this._modelCircuitBreaker.entries()) {
            circuitBreakers[model] = {
                open: !!state.openUntil && Date.now() < state.openUntil,
                openUntil: state.openUntil,
                halfOpen: state.halfOpen,
                failureCount: state.failures.length,
            };
        }
        const failureCounts = {};
        for (const [model, counts] of this._aiFailureCounts.entries()) {
            failureCounts[model] = { ...counts };
        }
        const keysAvailable = this._keys.filter((_, i) => {
            const exhausted = this._exhaustedUntilByKey[i];
            return !exhausted || Date.now() >= exhausted;
        }).length;
        return {
            circuitBreakers,
            failureCounts,
            keysAvailable,
            keyCount: this._keys.length,
        };
    }

}
