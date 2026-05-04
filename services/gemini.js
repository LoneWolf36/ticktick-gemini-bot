// Gemini AI — goal-aware task analyzer and accountability engine
import { GoogleGenAI } from '@google/genai';
import { loadUserContextModule, getModuleExport } from './user-context-loader.js';
import { userTodayFormatted, PRIORITY_EMOJI, formatProcessedTask } from './shared-utils.js';
import { briefingSummarySchema, weeklySummarySchema } from './schemas.js';
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

        // Model fallback chains per tier (use same defaults as this._config)
        this._modelTiers = {
            fast: this._buildTierChain(
                config.modelFast || 'gemini-2.5-flash',
                config.modelFastFallbacks,
            ),
            advanced: this._buildTierChain(
                config.modelAdvanced || 'gemini-2.5-pro',
                config.modelAdvancedFallbacks ?? ['gemini-2.5-flash'],
            ),
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
        // Accept both arrays and comma-separated strings (handles constructor defaults)
        const list = Array.isArray(fallbacks)
            ? fallbacks
            : (typeof fallbacks === 'string' && fallbacks.trim()
                ? fallbacks.split(',').map(s => s.trim()).filter(Boolean)
                : []);
        for (const fb of list) {
            if (fb && typeof fb === 'string' && fb !== primary && !chain.includes(fb)) {
                chain.push(fb);
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
