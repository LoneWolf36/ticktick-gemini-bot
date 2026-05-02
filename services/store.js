// State store — two-phase task tracking (pending → processed)
//
// Backend: Redis if REDIS_URL is set (for cloud), file-based fallback (for local dev).
// Redis schema:
//   - ticktick-bot:state => JSON blob for shared bot/task state
//   - user:{userId}:work_style_mode => JSON object { mode, expiresAt? }, defaults to standard when missing
// File fallback schema:
//   - data/store.json => JSON blob for shared bot/task state plus workStyleModes[userId] and behavioralSignals[userId]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const STORE_FILE_TMP = path.join(DATA_DIR, 'store.json.tmp'); // D.3.6 Atomic persistence
const REDIS_KEY = 'ticktick-bot:state';

// ─── Work-Style Mode Constants (R1) ──────────────────────────

export const MODE_STANDARD = 'standard';
export const MODE_FOCUS = 'focus';
export const MODE_URGENT = 'urgent';
export const VALID_WORK_STYLE_MODES = [MODE_STANDARD, MODE_FOCUS, MODE_URGENT];
export const DEFAULT_URGENT_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours
export const FOCUS_MODE_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours
export const DEFAULT_BEHAVIORAL_USER_ID = 'default';
export const BEHAVIORAL_SIGNAL_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.BEHAVIORAL_SIGNAL_RETENTION_DAYS || '30', 10) || 30);
export const BEHAVIORAL_SIGNAL_ARCHIVE_DAYS = Math.max(
    BEHAVIORAL_SIGNAL_RETENTION_DAYS,
    Number.parseInt(process.env.BEHAVIORAL_SIGNAL_ARCHIVE_DAYS || '90', 10) || 90,
);

function logWorkStyleTelemetry({ userId, previousMode, nextMode, expiresAt = null, reason = 'user_request' }) {
    let eventType = 'mode_updated';

    if (reason === 'auto_expiry') {
        eventType = 'mode_auto_expired';
    } else if (previousMode !== nextMode) {
        if (previousMode === MODE_STANDARD && nextMode !== MODE_STANDARD) {
            eventType = 'mode_activated';
        } else if (nextMode === MODE_STANDARD && previousMode !== MODE_STANDARD) {
            eventType = 'mode_deactivated';
        } else {
            eventType = 'mode_switched';
        }
    } else if (nextMode === MODE_URGENT && expiresAt) {
        eventType = 'urgent_timer_reset';
    }

    console.log(`[WorkStyleTelemetry] ${JSON.stringify({
        telemetryScope: 'operational',
        behavioralSignal: false,
        eventType,
        userId,
        previousMode,
        nextMode,
        expiresAt,
        reason,
    })}`);
}

const DEFAULT_STATE = {
    chatId: null,
    workStyleModes: {},       // R1: { [userId]: { mode, expiresAt } }
    pendingTasks: {},    // Analyzed + sent to Telegram, awaiting user review
    pendingReorg: null,  // Proposed global reorg plan awaiting apply/refine/cancel
    pendingMutationClarification: null, // Pending mutation clarification state for free-form handler
    pendingMutationConfirmation: null,   // Pending destructive/non-exact mutation confirmation gate
    pendingChecklistClarification: null, // Pending checklist vs separate-tasks clarification
    deferredPipelineIntents: [], // Pending deferred pipeline intents for API-unavailable recovery
    failedDeferredIntents: [], // Dead-letter queue for intents that exhausted retries
    behavioralSignals: {}, // R2: { [userId]: BehavioralSignal[] }
    processedTasks: {},  // User has clicked approve/skip/drop
    failedTasks: {},     // AI analysis failed (rate limit) — parked to prevent re-polling
    undoLog: [],
    queueHealth: {
        blockedSince: null,
    },
    lastPendingNudgeAt: null,
    recentTaskContext: {}, // { [userId]: { taskId, title, projectId, source, updatedAt, expiresAt } }
    stats: {
        tasksAnalyzed: 0,
        tasksApproved: 0,
        tasksSkipped: 0,
        tasksDropped: 0,
        tasksAutoApplied: 0,
        lastDailyBriefing: null,
        lastWeeklyDigest: null,
    },
    tickTickSync: {
        lastTickTickSyncAt: null,
        lastTickTickActiveCount: null,
        lastSyncSource: null,
        stateVersion: 0,
    },
};

// ─── Backend Selection ───────────────────────────────────────

let redis = null;
let state = null;
let useRedis = false;
let fileSaveQueue = Promise.resolve();

if (process.env.REDIS_URL) {
    try {
        redis = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => Math.min(times * 500, 3000),
            lazyConnect: true,
        });
        await redis.connect();
        useRedis = true;
        console.log('🔴 Store: Redis connected');
    } catch (err) {
        console.warn('⚠️  Redis connection failed, falling back to file:', err.message);
        redis = null;
        useRedis = false;
    }
} else {
    console.log('📁 Store: file-based (set REDIS_URL for cloud persistence)');
}

// ─── Load / Save ─────────────────────────────────────────────

function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normalizeBehavioralSignalsMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value).map(([userId, signals]) => [userId, Array.isArray(signals) ? signals : []])
    );
}

function normalizeTickTickSync(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return structuredClone(DEFAULT_STATE.tickTickSync);
    }

    const stateVersion = Number.isInteger(value.stateVersion) && value.stateVersion >= 0
        ? value.stateVersion
        : 0;

    return {
        lastTickTickSyncAt: typeof value.lastTickTickSyncAt === 'string' && value.lastTickTickSyncAt.trim()
            ? value.lastTickTickSyncAt
            : null,
        lastTickTickActiveCount: Number.isInteger(value.lastTickTickActiveCount) && value.lastTickTickActiveCount >= 0
            ? value.lastTickTickActiveCount
            : null,
        lastSyncSource: typeof value.lastSyncSource === 'string' && value.lastSyncSource.trim()
            ? value.lastSyncSource
            : null,
        stateVersion,
    };
}

async function loadFromRedis() {
    try {
        const raw = await redis.get(REDIS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const { urgentModes: _legacyUrgentModes, ...rest } = parsed;
            return {
                ...DEFAULT_STATE,
                ...rest,
                stats: { ...DEFAULT_STATE.stats, ...rest.stats },
                workStyleModes: rest.workStyleModes || {},
                pendingTasks: rest.pendingTasks || {},
                pendingReorg: rest.pendingReorg || null,
                pendingMutationClarification: rest.pendingMutationClarification || null,
                pendingMutationConfirmation: rest.pendingMutationConfirmation || null,
                pendingChecklistClarification: rest.pendingChecklistClarification || null,
                deferredPipelineIntents: Array.isArray(rest.deferredPipelineIntents) ? rest.deferredPipelineIntents : [],
                failedDeferredIntents: Array.isArray(rest.failedDeferredIntents) ? rest.failedDeferredIntents : [],
                behavioralSignals: normalizeBehavioralSignalsMap(rest.behavioralSignals),
                processedTasks: rest.processedTasks || {},
                undoLog: rest.undoLog || [],
                recentTaskContext: rest.recentTaskContext || {},
                tickTickSync: normalizeTickTickSync(rest.tickTickSync),
            };
        }
    } catch (err) {
        console.warn('⚠️  Redis load error:', err.message);
    }
    return structuredClone(DEFAULT_STATE);
}

// Micro-test: ensure the data serializes fully before writing to disk
function _validateSerialization(data) {
    const jsonStr = JSON.stringify(data, null, 2);
    JSON.parse(jsonStr); // Throws if incomplete/corrupt
    return jsonStr;
}

// Micro-validator: ensure the loaded object looks like our state schema
function _isValidStateShape(data) {
    return data
        && typeof data === 'object'
        && !Array.isArray(data)
        && data.stats
        && typeof data.pendingTasks === 'object'
        && typeof data.processedTasks === 'object';
}

function _parseFile(filePath) {
    if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (raw.trim() === '') return null;
        return JSON.parse(raw);
    }
    return null;
}

function loadFromFile() {
    ensureDir();
    let parsed = null;

    try {
        parsed = _parseFile(STORE_FILE);
    } catch (err) {
        console.warn('⚠️  Primary state file is corrupt. Attempting recovery from tmp copy...');
    }

    if (!parsed || !_isValidStateShape(parsed)) {
        try {
            const tmpParsed = _parseFile(STORE_FILE_TMP);
            if (tmpParsed && _isValidStateShape(tmpParsed)) {
                console.log('↩️  Successfully recovered state from tmp copy. Promoting file...');
                parsed = tmpParsed;
                fs.renameSync(STORE_FILE_TMP, STORE_FILE);
            }
        } catch (err) {
            console.warn('⚠️  Tmp copy missing, corrupt, or invalid. Falling back to default state.');
        }
    }

    if (parsed) {
        const { urgentModes: _legacyUrgentModes, ...rest } = parsed;
        return {
            ...DEFAULT_STATE,
            ...rest,
            stats: { ...DEFAULT_STATE.stats, ...rest.stats },
            workStyleModes: rest.workStyleModes || {},
            pendingTasks: rest.pendingTasks || {},
            pendingReorg: rest.pendingReorg || null,
            pendingMutationClarification: rest.pendingMutationClarification || null,
            pendingMutationConfirmation: rest.pendingMutationConfirmation || null,
            pendingChecklistClarification: rest.pendingChecklistClarification || null,
            deferredPipelineIntents: Array.isArray(rest.deferredPipelineIntents) ? rest.deferredPipelineIntents : [],
            failedDeferredIntents: Array.isArray(rest.failedDeferredIntents) ? rest.failedDeferredIntents : [],
            behavioralSignals: normalizeBehavioralSignalsMap(rest.behavioralSignals),
            processedTasks: rest.processedTasks || {},
            undoLog: rest.undoLog || [],
            recentTaskContext: rest.recentTaskContext || {},
            tickTickSync: normalizeTickTickSync(rest.tickTickSync),
        };
    }

    return structuredClone(DEFAULT_STATE);
}

async function load() {
    if (state) return state;
    state = useRedis ? await loadFromRedis() : loadFromFile();
    return state;
}

async function save() {
    if (useRedis) {
        try {
            await redis.set(REDIS_KEY, JSON.stringify(state));
        } catch (err) {
            console.error('⚠️  Redis save error:', err.message);
        }
    } else {
        ensureDir();
        const snapshot = structuredClone(state);
        fileSaveQueue = fileSaveQueue.catch(() => {}).then(() => {
            try {
                const jsonStr = _validateSerialization(snapshot);
                const fd = fs.openSync(STORE_FILE_TMP, 'w');
                fs.writeSync(fd, jsonStr);
                fs.fsyncSync(fd);
                fs.closeSync(fd);

                try {
                    if (fs.existsSync(STORE_FILE)) {
                        const BACKUP_FILE = `${STORE_FILE}.bak`;
                        fs.copyFileSync(STORE_FILE, BACKUP_FILE);
                    }
                } catch (backupErr) { /* Best-effort backup */ }

                fs.renameSync(STORE_FILE_TMP, STORE_FILE);

                try {
                    const dirFd = fs.openSync(DATA_DIR, 'r');
                    fs.fsyncSync(dirFd);
                    fs.closeSync(dirFd);
                } catch { /* Ignore directory sync failures */ }

            } catch (err) {
                console.error('⚠️  Local file save failed. Existing data preserved.', err.message);
            }
        });
        await fileSaveQueue;
    }
}

// ─── Initialize on import ────────────────────────────────────
await load();

// ─── Shared Analysis Lock ────────────────────────────────────
const DEFAULT_INTAKE_LOCK_TTL_MS = 5 * 60 * 1000;
let intakeLock = null;

/**
 * Try to acquire the shared TickTick intake lock.
 *
 * The lock prevents overlapping poll/scan/review cycles from mutating the same
 * TickTick intake stream at once. Expired locks self-heal on the next acquire
 * attempt instead of blocking forever after a crash.
 *
 * @param {Object} [options]
 * @param {string} [options.owner='unknown'] - Human-readable lock owner for diagnostics.
 * @param {number} [options.ttlMs=300000] - Lock time-to-live in milliseconds.
 * @param {number} [options.now=Date.now()] - Current timestamp override for tests.
 * @returns {boolean} True when acquired; false when another unexpired owner holds it.
 */
export function tryAcquireIntakeLock({ owner = 'unknown', ttlMs = DEFAULT_INTAKE_LOCK_TTL_MS, now = Date.now() } = {}) {
    if (intakeLock && intakeLock.expiresAt > now) return false;

    intakeLock = {
        owner,
        acquiredAt: now,
        expiresAt: now + Math.max(1, ttlMs),
    };
    return true;
}

/**
 * Release the shared TickTick intake lock.
 *
 * Callers should release only locks they acquired. The lock also expires by TTL
 * as a defensive fallback for process crashes or interrupted async flows.
 *
 * @returns {void}
 */
export function releaseIntakeLock() {
    intakeLock = null;
}

/**
 * Get diagnostic metadata for the shared TickTick intake lock.
 *
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()] - Current timestamp override for tests.
 * @returns {{locked: false}|{locked: true, owner: string, acquiredAt: number, expiresAt: number}}
 */
export function getIntakeLockStatus({ now = Date.now() } = {}) {
    if (!intakeLock || intakeLock.expiresAt <= now) return { locked: false };

    return {
        locked: true,
        owner: intakeLock.owner,
        acquiredAt: intakeLock.acquiredAt,
        expiresAt: intakeLock.expiresAt,
    };
}

// ─── Chat ID ─────────────────────────────────────────────────

/**
 * Get the stored Telegram chat ID.
 * @returns {number|null} Chat ID or null if not set
 */
export function getChatId() {
    return state.chatId;
}

/**
 * Persist a Telegram chat ID to the store.
 * @param {number} id - Telegram chat ID
 * @returns {Promise<void>}
 */
export async function setChatId(id) {
    state.chatId = id;
    await save();
}

function assertUserId(userId) {
    if (userId === undefined || userId === null || userId === '') {
        throw new Error('userId is required');
    }
}

function assertIsoTimestamp(value, fieldName) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new Error(`${fieldName} must be a valid ISO timestamp string`);
    }
}

function isAllowedBehavioralMetadataValue(value) {
    return typeof value === 'boolean' || value === null;
}

function sanitizeBehavioralMetadataForStorage(signal) {
    const metadata = signal?.metadata ?? {};
    const sanitized = {
        planningSubtypeA: null,
        planningSubtypeB: null,
        scopeChange: null,
        wordingOnlyEdit: null,
        decompositionChange: null,
    };

    if (signal?.type === 'planning_without_execution') {
        sanitized.planningSubtypeA = metadata.planningSubtypeA === true;
        sanitized.planningSubtypeB = metadata.planningSubtypeB === true;
    }

    if (signal?.type === 'scope_change') {
        sanitized.scopeChange = true;
        sanitized.wordingOnlyEdit = false;
    }

    if (signal?.type === 'decomposition') {
        sanitized.decompositionChange = true;
    }

    return sanitized;
}

function getBehavioralRetentionBoundaryMs(nowMs = Date.now()) {
    return nowMs - (BEHAVIORAL_SIGNAL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function getBehavioralArchiveBoundaryMs(nowMs = Date.now()) {
    return nowMs - (BEHAVIORAL_SIGNAL_ARCHIVE_DAYS * 24 * 60 * 60 * 1000);
}

function isBehavioralSignalActive(signal, nowMs = Date.now()) {
    const signalMs = Date.parse(signal?.timestamp || '');
    return Number.isFinite(signalMs) && signalMs >= getBehavioralRetentionBoundaryMs(nowMs);
}

function validateBehavioralSignal(signal) {
    if (!signal || typeof signal !== 'object' || Array.isArray(signal)) {
        throw new Error('Behavioral signal must be an object');
    }

    const forbiddenTopLevelKeys = ['title', 'message', 'description', 'content', 'rawMessage', 'rawTaskTitle', 'taskId'];
    for (const key of forbiddenTopLevelKeys) {
        if (signal[key] !== undefined) {
            throw new Error(`Behavioral signal must not include raw field: ${key}`);
        }
    }

    if (typeof signal.type !== 'string' || signal.type.trim() === '') {
        throw new Error('Behavioral signal type is required');
    }

    if (signal.category !== null && signal.category !== undefined && typeof signal.category !== 'string') {
        throw new Error('Behavioral signal category must be a string or null');
    }

    if (signal.projectId !== null && signal.projectId !== undefined && typeof signal.projectId !== 'string') {
        throw new Error('Behavioral signal projectId must be a string or null');
    }

    if (typeof signal.confidence !== 'number' || signal.confidence < 0 || signal.confidence > 1) {
        throw new Error('Behavioral signal confidence must be a number between 0 and 1');
    }

    if (signal.subjectKey !== undefined && signal.subjectKey !== null && typeof signal.subjectKey !== 'string') {
        throw new Error('Behavioral signal subjectKey must be a string or null');
    }

    assertIsoTimestamp(signal.timestamp, 'Behavioral signal timestamp');

    const rawMetadata = signal.metadata ?? {};
    if (typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
        throw new Error('Behavioral signal metadata must be an object');
    }

    for (const forbiddenKey of forbiddenTopLevelKeys) {
        if (rawMetadata[forbiddenKey] !== undefined) {
            throw new Error(`Behavioral signal metadata must not include raw field: ${forbiddenKey}`);
        }
    }

    const metadata = sanitizeBehavioralMetadataForStorage(signal);

    for (const [key, value] of Object.entries(metadata)) {
        if (!isAllowedBehavioralMetadataValue(value)) {
            throw new Error(`Behavioral signal metadata.${key} must be number, boolean, or null`);
        }
    }

    return {
        type: signal.type,
        category: signal.category ?? null,
        projectId: signal.projectId ?? null,
        subjectKey: signal.subjectKey ?? null,
        confidence: signal.confidence,
        metadata,
        timestamp: signal.timestamp,
    };
}

function ensureBehavioralSignalBucket() {
    if (!state.behavioralSignals || typeof state.behavioralSignals !== 'object' || Array.isArray(state.behavioralSignals)) {
        state.behavioralSignals = {};
    }
}

function normalizeTimeRangeBoundary(value, fieldName) {
    if (value === null || value === undefined) {
        return null;
    }
    assertIsoTimestamp(value, fieldName);
    return Date.parse(value);
}

function matchesBehavioralSignalRange(signal, fromMs, toMs) {
    const signalMs = Date.parse(signal.timestamp);
    if (!Number.isFinite(signalMs)) {
        return false;
    }
    if (fromMs !== null && signalMs < fromMs) {
        return false;
    }
    if (toMs !== null && signalMs > toMs) {
        return false;
    }
    return true;
}

function cloneSignals(signals) {
    return structuredClone(signals);
}

// ─── Work-Style Mode (R1: State Management Contract) ─────────

function getWorkStyleModeRedisKey(userId) {
    return `user:${userId}:work_style_mode`;
}

function normalizeWorkStyleEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return { mode: MODE_STANDARD, expiresAt: null };
    }

    return {
        mode: VALID_WORK_STYLE_MODES.includes(entry.mode) ? entry.mode : MODE_STANDARD,
        expiresAt: entry.expiresAt || null,
    };
}

export async function getWorkStyleState(userId, options = {}) {
    assertUserId(userId);
    await load();

    let entry = null;
    if (useRedis) {
        try {
            const raw = await redis.get(getWorkStyleModeRedisKey(userId));
            if (raw) entry = JSON.parse(raw);
        } catch (err) {
            console.warn('⚠️  Redis work-style mode load error:', err.message);
        }
    }

    if (!entry && state.workStyleModes?.[userId]) {
        entry = state.workStyleModes[userId];
    }

    const previousEntry = normalizeWorkStyleEntry(entry);
    if (previousEntry.expiresAt && new Date(previousEntry.expiresAt) <= new Date()) {
        await setWorkStyleMode(userId, MODE_STANDARD, { reason: 'auto_expiry' });
        if (previousEntry.mode === MODE_FOCUS && typeof options?.notify === 'function') {
            try {
                await options.notify('Focus mode expired. Switched back to standard.');
            } catch (_) {
                // best effort
            }
        }
        return { mode: MODE_STANDARD, expiresAt: null };
    }

    return previousEntry;
}

/**
 * Get the current work-style mode for a user.
 * Returns the active mode, automatically reverting to standard if expired.
 */
export async function getWorkStyleMode(userId, options) {
    return (await getWorkStyleState(userId, options)).mode;
}

/**
 * Set the work-style mode for a user.
 * Mode transitions are explicit — never changes without user action or auto-expiry.
 * @param {string} userId
 * @param {string} mode - One of MODE_STANDARD, MODE_FOCUS, MODE_URGENT
 * @param {object} options
 * @param {number} [options.expiresAt] - Optional absolute expiry timestamp (ms since epoch)
 * @param {number} [options.expiryMs] - Optional relative expiry duration (ms from now)
 * @param {string} [options.reason] - Optional operational telemetry reason for the transition
 */
export async function setWorkStyleMode(userId, mode, options = {}) {
    assertUserId(userId);
    if (!VALID_WORK_STYLE_MODES.includes(mode)) {
        throw new Error(`Invalid work-style mode: "${mode}". Must be one of: ${VALID_WORK_STYLE_MODES.join(', ')}`);
    }
    await load();

    if (!state.workStyleModes || typeof state.workStyleModes !== 'object' || Array.isArray(state.workStyleModes)) {
        state.workStyleModes = {};
    }

    const previousEntry = normalizeWorkStyleEntry(state.workStyleModes[userId]);

    const entry = { mode };

    if (options.expiresAt) {
        entry.expiresAt = new Date(options.expiresAt).toISOString();
    } else if (options.expiryMs) {
        entry.expiresAt = new Date(Date.now() + options.expiryMs).toISOString();
    } else if (mode === MODE_URGENT) {
        // Default auto-expiry for urgent mode: 2 hours
        entry.expiresAt = new Date(Date.now() + DEFAULT_URGENT_EXPIRY_MS).toISOString();
    } else if (mode === MODE_FOCUS) {
        // Default auto-expiry for focus mode: 4 hours
        entry.expiresAt = new Date(Date.now() + FOCUS_MODE_EXPIRY_MS).toISOString();
    }
    // standard mode has no auto-expiry unless explicitly set

    state.workStyleModes[userId] = entry;

    if (useRedis) {
        try {
            await redis.set(getWorkStyleModeRedisKey(userId), JSON.stringify(entry));
            logWorkStyleTelemetry({
                userId,
                previousMode: previousEntry.mode,
                nextMode: entry.mode,
                expiresAt: entry.expiresAt || null,
                reason: options.reason || 'user_request',
            });
            return entry;
        } catch (err) {
            console.error('⚠️  Redis work-style mode save error:', err.message);
            return entry;
        }
    }

    await save();
    logWorkStyleTelemetry({
        userId,
        previousMode: previousEntry.mode,
        nextMode: entry.mode,
        expiresAt: entry.expiresAt || null,
        reason: options.reason || 'user_request',
    });
    return entry;
}

// ─── Behavioral Signals (R2: Redis Storage Layer) ────────────

export async function appendBehavioralSignals(userId, signals = []) {
    assertUserId(userId);
    await load();
    ensureBehavioralSignalBucket();

    if (!Array.isArray(signals)) {
        throw new Error('signals must be an array');
    }

    const validatedSignals = signals.map((signal) => validateBehavioralSignal(signal));
    const existingSignals = Array.isArray(state.behavioralSignals[userId]) ? state.behavioralSignals[userId] : [];
    state.behavioralSignals[userId] = [...existingSignals, ...validatedSignals]
        .filter((signal) => matchesBehavioralSignalRange(
            signal,
            getBehavioralArchiveBoundaryMs(),
            null,
        ));

    await save();
    return cloneSignals(validatedSignals);
}

export async function getBehavioralSignals(userId, { includeExpired = false } = {}) {
    assertUserId(userId);
    await load();
    ensureBehavioralSignalBucket();
    const signals = Array.isArray(state.behavioralSignals[userId]) ? state.behavioralSignals[userId] : [];
    const visibleSignals = includeExpired ? signals : signals.filter((signal) => isBehavioralSignalActive(signal));
    return cloneSignals(visibleSignals);
}

export async function queryBehavioralSignalsByTimeRange(userId, { from = null, to = null, includeExpired = false } = {}) {
    assertUserId(userId);
    const fromMs = normalizeTimeRangeBoundary(from, 'from');
    const toMs = normalizeTimeRangeBoundary(to, 'to');
    const signals = await getBehavioralSignals(userId, { includeExpired });
    return signals.filter((signal) => matchesBehavioralSignalRange(signal, fromMs, toMs));
}

export async function deleteBehavioralSignals(userId, { from = null, to = null } = {}) {
    assertUserId(userId);
    await load();
    ensureBehavioralSignalBucket();

    if (from === null && to === null) {
        const removed = Array.isArray(state.behavioralSignals[userId]) ? state.behavioralSignals[userId].length : 0;
        delete state.behavioralSignals[userId];
        await save();
        return removed;
    }

    const fromMs = normalizeTimeRangeBoundary(from, 'from');
    const toMs = normalizeTimeRangeBoundary(to, 'to');
    const currentSignals = Array.isArray(state.behavioralSignals[userId]) ? state.behavioralSignals[userId] : [];
    const keptSignals = currentSignals.filter((signal) => !matchesBehavioralSignalRange(signal, fromMs, toMs));
    const removed = currentSignals.length - keptSignals.length;

    if (keptSignals.length === 0) {
        delete state.behavioralSignals[userId];
    } else {
        state.behavioralSignals[userId] = keptSignals;
    }

    await save();
    return removed;
}

// ─── Task Status Checks ─────────────────────────────────────

export function isTaskProcessed(taskId) {
    return !!state.processedTasks[taskId];
}

export function isTaskPending(taskId) {
    return !!state.pendingTasks[taskId];
}

export function isTaskKnown(taskId) {
    if (state.processedTasks[taskId] || state.pendingTasks[taskId]) return true;
    // Failed tasks are "known" only while their cooldown hasn't expired
    const failed = state.failedTasks?.[taskId];
    if (failed && new Date(failed.retryAfter) > new Date()) return true;
    if (failed) delete state.failedTasks[taskId]; // Expired — let it re-poll
    return false;
}

/** Remove pending and failed entries for tasks no longer active in TickTick.
 *  @returns {{ removedPending: number, removedFailed: number }}
 */
export async function reconcileTaskState(activeTasks) {
    if (!Array.isArray(activeTasks)) return { removedPending: 0, removedFailed: 0 };
    const activeIds = new Set(activeTasks.map((t) => t?.id).filter(Boolean));
    let removedPending = 0;
    let removedFailed = 0;

    for (const taskId of Object.keys(state.pendingTasks)) {
        if (!activeIds.has(taskId)) {
            delete state.pendingTasks[taskId];
            removedPending++;
        }
    }

    if (state.failedTasks && typeof state.failedTasks === 'object' && !Array.isArray(state.failedTasks)) {
        for (const taskId of Object.keys(state.failedTasks)) {
            if (!activeIds.has(taskId)) {
                delete state.failedTasks[taskId];
                removedFailed++;
            }
        }
    }

    if (removedPending > 0 || removedFailed > 0) {
        await save();
    }
    return { removedPending, removedFailed };
}

/** Park a task that failed analysis — prevents re-polling until retryAfterMs expires.
 *  @param {number} [retryAfterMs=7200000] — ms to park (default 2h; callers can pass quota-aligned duration)
 */
export async function markTaskFailed(taskId, reason, retryAfterMs = 2 * 60 * 60 * 1000) {
    if (!state.failedTasks) state.failedTasks = {};
    state.failedTasks[taskId] = {
        reason,
        failedAt: new Date().toISOString(),
        retryAfter: new Date(Date.now() + retryAfterMs).toISOString(),
    };
    await save();
}

// ─── Phase 1: Pending (analyzed, sent to Telegram) ──────────

export async function markTaskPending(taskId, data) {
    if (state.processedTasks[taskId]) return state.processedTasks[taskId];
    if (state.pendingTasks[taskId]) return state.pendingTasks[taskId];
    if (state.failedTasks?.[taskId]) delete state.failedTasks[taskId];
    state.pendingTasks[taskId] = {
        ...data,
        sentAt: new Date().toISOString(),
    };
    state.stats.tasksAnalyzed++;
    await save();
}

// ─── Phase 2: Processed (user clicked a button) ─────────────

export async function resolveTask(taskId, status) {
    if (!['approve', 'skip', 'drop'].includes(status)) {
        throw new Error(`Invalid status: ${status}`);
    }

    const pending = state.pendingTasks[taskId];
    if (!pending) return null;

    const statusFlag = status === 'approve' ? { approved: true }
        : status === 'skip' ? { skipped: true }
            : { dropped: true };

    state.processedTasks[taskId] = {
        ...pending,
        ...statusFlag,
        reviewedAt: new Date().toISOString(),
    };
    delete state.pendingTasks[taskId];

    if (status === 'approve') state.stats.tasksApproved++;
    if (status === 'skip') state.stats.tasksSkipped++;
    if (status === 'drop') state.stats.tasksDropped++;

    await save();
    return state.processedTasks[taskId];
}

/**
 * Approve a pending task, marking it as processed.
 * Delegates to resolveTask with status 'approve'.
 * @param {string} taskId - Task ID to approve
 * @returns {Promise<Object|null>} The processed task entry, or null if not pending
 */
export async function approveTask(taskId) { return resolveTask(taskId, 'approve'); }

/**
 * Skip a pending task, marking it as processed without taking action.
 * Delegates to resolveTask with status 'skip'.
 * @param {string} taskId - Task ID to skip
 * @returns {Promise<Object|null>} The processed task entry, or null if not pending
 */
export async function skipTask(taskId) { return resolveTask(taskId, 'skip'); }

/**
 * Drop a pending task, marking it as processed and deprioritized.
 * Delegates to resolveTask with status 'drop'.
 * @param {string} taskId - Task ID to drop
 * @returns {Promise<Object|null>} The processed task entry, or null if not pending
 */
export async function dropTask(taskId) { return resolveTask(taskId, 'drop'); }

export async function markTaskProcessed(taskId, data) {
    state.processedTasks[taskId] = {
        ...data,
        reviewedAt: new Date().toISOString(),
    };
    delete state.pendingTasks[taskId];
    if (state.failedTasks?.[taskId]) delete state.failedTasks[taskId];
    state.stats.tasksAnalyzed++;
    await save();
}

/**
 * Mark a pending task stale after it aged out of active review.
 * Preserves the pending snapshot, flags the processed entry stale, and removes it from the pending queue.
 * @param {string} taskId - Task ID to mark stale.
 * @param {Object} [data={}] - Extra metadata to merge into the processed entry.
 * @returns {Promise<void>}
 */
export async function markTaskStale(taskId, data = {}) {
    state.processedTasks[taskId] = {
        ...state.pendingTasks[taskId],
        ...data,
        stale: true,
        reviewedAt: new Date().toISOString(),
    };
    delete state.pendingTasks[taskId];
    await save();
}

// ─── Pending Tasks Retrieval ─────────────────────────────────

export function getPendingTasks() {
    return state.pendingTasks;
}

export function getPendingCount() {
    return Object.keys(state.pendingTasks).length;
}

/**
 * Returns a snapshot of queue health for telemetry.
 * @returns {{ isBlocked: boolean, blockedSinceMs: number, pendingCount: number, processedTodayCount: number, failedCount: number }}
 */
export function getQueueHealthSnapshot() {
    const pendingCount = Object.keys(state.pendingTasks).length;
    const failedCount = Object.keys(state.failedTasks || {}).length;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const processedTodayCount = Object.values(state.processedTasks).filter((t) => {
        const reviewedAt = t?.reviewedAt;
        if (!reviewedAt) return false;
        const ms = Date.parse(reviewedAt);
        return Number.isFinite(ms) && ms >= dayAgo;
    }).length;
    const blockedSince = state.queueHealth?.blockedSince || null;
    const blockedSinceMs = blockedSince ? Date.now() - Date.parse(blockedSince) : 0;
    return {
        isBlocked: !!blockedSince,
        blockedSinceMs,
        pendingCount,
        processedTodayCount,
        failedCount,
    };
}

/**
 * Sets or clears the queue blocked state.
 * @param {boolean} isBlocked
 */
export async function setQueueBlocked(isBlocked) {
    if (!state.queueHealth || typeof state.queueHealth !== 'object' || Array.isArray(state.queueHealth)) {
        state.queueHealth = { blockedSince: null };
    }
    if (isBlocked && !state.queueHealth.blockedSince) {
        state.queueHealth.blockedSince = new Date().toISOString();
        await save();
    } else if (!isBlocked && state.queueHealth.blockedSince) {
        state.queueHealth.blockedSince = null;
        await save();
    }
}

export function getLastPendingNudgeAt() {
    return state.lastPendingNudgeAt;
}

export async function setLastPendingNudgeAt(value) {
    state.lastPendingNudgeAt = value;
    await save();
}

/** Return a sorted slice of pending tasks.
 *  @param {Object} options
 *  @param {number} [options.limit=5]
 *  @param {string} [options.sortBy='sentAt']
 *  @returns {Array} Array of [taskId, data] tuples
 */
export function getPendingBatch({ limit = 5, sortBy = 'sentAt' } = {}) {
    const entries = Object.entries(state.pendingTasks);
    if (sortBy === 'sentAt') {
        entries.sort((a, b) => {
            const aTime = a[1]?.sentAt ? new Date(a[1].sentAt).getTime() : 0;
            const bTime = b[1]?.sentAt ? new Date(b[1].sentAt).getTime() : 0;
            if (aTime !== bTime) return aTime - bTime;
            return String(a[0]).localeCompare(String(b[0]));
        });
    }
    return entries.slice(0, limit);
}

/** Return the oldest pending task (by sentAt).
 *  @returns {Array|null} [taskId, data] or null
 */
export function getNextPendingTask() {
    const batch = getPendingBatch({ limit: 1, sortBy: 'sentAt' });
    return batch.length > 0 ? batch[0] : null;
}

// Reorg proposal state
export function getPendingReorg() {
    return state.pendingReorg;
}

export async function setPendingReorg(data) {
    state.pendingReorg = {
        ...data,
        updatedAt: new Date().toISOString(),
    };
    await save();
}

export async function clearPendingReorg() {
    state.pendingReorg = null;
    await save();
}

// ─── Pending Mutation Clarification ──────────────────────────
// Narrow state for resuming ambiguous mutation requests after user selects a candidate.

export function getPendingMutationClarification() {
    return state.pendingMutationClarification;
}

export async function setPendingMutationClarification(data) {
    state.pendingMutationClarification = {
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
    };
    await save();
}

export async function clearPendingMutationClarification() {
    state.pendingMutationClarification = null;
    await save();
}

// ─── Pending Mutation Confirmation (Destructive/Non-Exact Gate) ──
// Narrow state for requiring user confirmation before executing
// mutations resolved via non-exact match (prefix, contains, fuzzy, etc.)

/** Mutation confirmation TTL: 10 minutes */
export const MUTATION_CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export function getPendingMutationConfirmation() {
    const pending = state.pendingMutationConfirmation;
    if (!pending) return null;

    // TTL check — expire silently
    const createdAt = pending.createdAt ? new Date(pending.createdAt).getTime() : 0;
    if (createdAt && (Date.now() - createdAt > MUTATION_CONFIRMATION_TTL_MS)) {
        console.log('[MutationConfirmation] Expired pending state cleared (TTL exceeded)');
        state.pendingMutationConfirmation = null;
        save().catch(() => {}); // Best-effort cleanup
        return null;
    }

    return pending;
}

export async function setPendingMutationConfirmation(data) {
    state.pendingMutationConfirmation = {
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
    };
    await save();
    console.log('[MutationConfirmation] Pending state persisted');
}

export async function clearPendingMutationConfirmation() {
    state.pendingMutationConfirmation = null;
    await save();
    console.log('[MutationConfirmation] Pending state cleared');
}

// ─── Pending Checklist Clarification ──────────────────────────
// Narrow state for resuming ambiguous checklist vs separate-tasks requests.
// TTL: 24 hours — after expiry, the clarification is ignored and a conservative
// fallback creates a plain parent task only.

/** Checklist clarification TTL: 24 hours */
export const CHECKLIST_CLARIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Task refinement TTL: 5 minutes */
export const TASK_REFINEMENT_TTL_MS = 5 * 60 * 1000;

/** Recent task context TTL: 10 minutes */
export const RECENT_TASK_CONTEXT_TTL_MS = 10 * 60 * 1000;

export function getPendingTaskRefinement() {
    const pending = state.pendingTaskRefinement;
    if (!pending) return null;

    // TTL check — expire silently
    const createdAt = pending.createdAt ? new Date(pending.createdAt).getTime() : 0;
    if (createdAt && (Date.now() - createdAt > TASK_REFINEMENT_TTL_MS)) {
        console.log('[TaskRefinement] Expired pending state cleared (TTL exceeded)');
        state.pendingTaskRefinement = null;
        save().catch(() => {}); // Best-effort cleanup
        return null;
    }

    return pending;
}

export async function setPendingTaskRefinement(data) {
    state.pendingTaskRefinement = data ? { ...data, createdAt: new Date().toISOString() } : null;
    await save();
}

export async function clearPendingTaskRefinement() {
    state.pendingTaskRefinement = null;
    await save();
}

// ─── Recent Task Context ─────────────────────────────────────

export async function setRecentTaskContext(userId, context) {
    assertUserId(userId);
    await load();
    if (!state.recentTaskContext || typeof state.recentTaskContext !== 'object' || Array.isArray(state.recentTaskContext)) {
        state.recentTaskContext = {};
    }
    state.recentTaskContext[userId] = {
        taskId: context.taskId,
        title: context.title,
        content: context.content ?? '',
        projectId: context.projectId ?? null,
        source: context.source || 'unknown',
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + RECENT_TASK_CONTEXT_TTL_MS).toISOString(),
    };
    await save();
}

export function getRecentTaskContext(userId) {
    assertUserId(userId);
    const entry = state.recentTaskContext?.[userId];
    if (!entry) return null;
    const expiresAt = entry.expiresAt ? new Date(entry.expiresAt).getTime() : 0;
    if (expiresAt && Date.now() > expiresAt) {
        console.log(`[RecentTaskContext] Expired context cleared for user: ${userId}`);
        delete state.recentTaskContext[userId];
        save().catch(() => {});
        return null;
    }
    return { ...entry };
}

export async function clearRecentTaskContext(userId) {
    assertUserId(userId);
    await load();
    if (state.recentTaskContext?.[userId]) {
        delete state.recentTaskContext[userId];
        await save();
    }
}

/**
 * Gets the pending checklist clarification if it exists and hasn't expired.
 *
 * @returns {Object|null} Pending clarification data with {originalMessage, intents, chatId, userId, createdAt}, or null if none/expired
 */
export function getPendingChecklistClarification() {
    const pending = state.pendingChecklistClarification;
    if (!pending) return null;

    // TTL check — expire silently
    const createdAt = pending.createdAt ? new Date(pending.createdAt).getTime() : 0;
    if (createdAt && (Date.now() - createdAt > CHECKLIST_CLARIFICATION_TTL_MS)) {
        console.log('[ChecklistClarification] Expired pending state cleared (TTL exceeded)');
        state.pendingChecklistClarification = null;
        save().catch(() => {}); // Best-effort cleanup
        return null;
    }

    return pending;
}

/**
 * Stores a pending checklist clarification with automatic timestamp.
 *
 * @param {Object} data - Clarification data
 * @param {string} data.originalMessage - The original user message that triggered clarification
 * @param {Array} data.intents - Summary of extracted intents
 * @param {number|null} [data.chatId] - Telegram chat ID for cross-chat validation
 * @param {number|null} [data.userId] - Telegram user ID for cross-user validation
 * @param {string} [data.entryPoint] - Pipeline entry point for resume routing
 * @param {string} [data.mode] - Pipeline mode for resume routing
 * @returns {Promise<void>}
 */
export async function setPendingChecklistClarification(data) {
    state.pendingChecklistClarification = {
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
    };
    await save();
    console.log('[ChecklistClarification] Pending state persisted');
}

/**
 * Clears the pending checklist clarification state.
 * @returns {Promise<void>}
 */
export async function clearPendingChecklistClarification() {
    state.pendingChecklistClarification = null;
    await save();
}

// ─── Deferred Pipeline Intents (R12) ──────────────────────────

const DEFERRED_PIPELINE_INTENT_LIMIT = 200;

export function getDeferredPipelineIntents() {
    return Array.isArray(state.deferredPipelineIntents)
        ? structuredClone(state.deferredPipelineIntents)
        : [];
}

const MAX_DEFERRED_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes

export function computeNextAttemptAt(retryCount = 0) {
    const delayMs = Math.min(
        2 ** Math.max(0, retryCount) * 60 * 1000,
        MAX_DEFERRED_BACKOFF_MS,
    );
    return Date.now() + delayMs;
}

export async function appendDeferredPipelineIntent(entry) {
    if (!entry || typeof entry !== 'object') {
        throw new Error('deferred pipeline intent entry must be an object');
    }

    const id = typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : `dpi_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const retryCount = typeof entry.retryCount === 'number' && entry.retryCount >= 0
        ? entry.retryCount
        : 0;
    const record = {
        id,
        createdAt: entry.createdAt || new Date().toISOString(),
        failureType: entry.failureType || null,
        ...entry,
        id,
        retryCount: Number.isFinite(entry.retryCount) ? entry.retryCount : retryCount,
        nextAttemptAt: Number.isFinite(entry.nextAttemptAt) ? entry.nextAttemptAt : computeNextAttemptAt(retryCount),
    };

    const current = Array.isArray(state.deferredPipelineIntents) ? state.deferredPipelineIntents : [];
    state.deferredPipelineIntents = [...current, record].slice(-DEFERRED_PIPELINE_INTENT_LIMIT);
    await save();
    return structuredClone(record);
}

export async function removeDeferredPipelineIntent(id) {
    if (typeof id !== 'string' || !id.trim()) return null;
    const current = Array.isArray(state.deferredPipelineIntents) ? state.deferredPipelineIntents : [];
    const index = current.findIndex((entry) => entry?.id === id);
    if (index === -1) return null;
    const [removed] = current.splice(index, 1);
    state.deferredPipelineIntents = current;
    await save();
    return structuredClone(removed);
}

/**
 * Update a deferred pipeline intent in place (e.g., increment retry count).
 * @param {Object} updatedEntry - Entry with updated fields (must have id)
 */
export async function updateDeferredPipelineIntent(updatedEntry) {
    if (!updatedEntry?.id) return;
    const current = Array.isArray(state.deferredPipelineIntents) ? state.deferredPipelineIntents : [];
    const index = current.findIndex((entry) => entry?.id === updatedEntry.id);
    if (index === -1) return;
    current[index] = { ...current[index], ...updatedEntry };
    state.deferredPipelineIntents = current;
    await save();
}

const FAILED_DEFERRED_INTENT_LIMIT = 50;

export async function addFailedDeferredIntent(item) {
    if (!item || typeof item !== 'object') {
        throw new Error('failed deferred intent item must be an object');
    }
    const record = {
        ...item,
        failedAt: item.failedAt || new Date().toISOString(),
    };
    const current = Array.isArray(state.failedDeferredIntents) ? state.failedDeferredIntents : [];
    state.failedDeferredIntents = [...current, record].slice(-FAILED_DEFERRED_INTENT_LIMIT);
    await save();
    return structuredClone(record);
}

export function getFailedDeferredIntents() {
    return Array.isArray(state.failedDeferredIntents)
        ? structuredClone(state.failedDeferredIntents)
        : [];
}

export async function clearFailedDeferredIntents() {
    state.failedDeferredIntents = [];
    await save();
}

// ─── Undo Log ────────────────────────────────────────────────

export async function addUndoEntry(entry) {
    state.undoLog.push({ ...entry, timestamp: new Date().toISOString() });
    if (state.undoLog.length > 200) state.undoLog = state.undoLog.slice(-200);
    await save();
}

export function getLastUndoEntry() {
    return state.undoLog.length > 0 ? state.undoLog[state.undoLog.length - 1] : null;
}

export async function removeLastUndoEntry() {
    state.undoLog.pop();
    await save();
}

/**
 * Get all undo entries sharing a batchId.
 * @param {string} batchId - The batch identifier
 * @returns {Array<Object>} Array of undo entries with matching batchId
 */
export function getUndoBatch(batchId) {
    if (!batchId) return [];
    return state.undoLog.filter(e => e.batchId === batchId);
}

/**
 * Get all undo entries from the most recent auto-apply batch.
 * Groups by batchId; if no batchId, falls back to the single most recent auto-apply entry.
 * @returns {Array<Object>} Array of undo entries from the same batch
 */
export function getLastAutoApplyBatch() {
    const autoEntries = state.undoLog.filter(e => e.action === 'auto-apply');
    if (autoEntries.length === 0) return [];

    // Find the most recent auto-apply entry to get its batchId
    const latest = autoEntries[autoEntries.length - 1];

    // If it has a batchId, return all entries with that batchId
    if (latest.batchId) {
        return autoEntries.filter(e => e.batchId === latest.batchId);
    }

    // Legacy: no batchId, return just the single entry
    return [latest];
}

/**
 * Remove specific undo entries by reference identity.
 * @param {Array<Object>} entries - Entries to remove
 */
export async function removeUndoEntries(entries) {
    const toRemove = new Set(entries);
    state.undoLog = state.undoLog.filter(e => !toRemove.has(e));
    await save();
}

// ─── Stats ───────────────────────────────────────────────────

export function getOperationalSnapshot() {
    const pendingCount = Object.keys(state.pendingTasks).length;
    const failedCount = Object.keys(state.failedTasks || {}).length;
    const deferredCount = Array.isArray(state.deferredPipelineIntents) ? state.deferredPipelineIntents.length : 0;
    const failedDeferredCount = Array.isArray(state.failedDeferredIntents) ? state.failedDeferredIntents.length : 0;
    const clarificationCount = [
        state.pendingMutationClarification,
        state.pendingMutationConfirmation,
        state.pendingChecklistClarification,
    ].filter(Boolean).length;

    return {
        localWorkflow: {
            pendingReview: pendingCount,
            failedParked: failedCount,
            deferredIntents: deferredCount,
            failedDeferred: failedDeferredCount,
            clarifications: clarificationCount,
        },
        tickTickSync: normalizeTickTickSync(state.tickTickSync),
        cumulative: { ...state.stats },
    };
}

/**
 * Record a successful TickTick live-state sync.
 * @param {Object} params
 * @param {string} params.source - Sync source label.
 * @param {number} params.activeCount - Active TickTick task count from the successful read.
 * @returns {Promise<Object>} Updated sync snapshot.
 */
export async function recordTickTickSync({ source, activeCount }) {
    if (!state.tickTickSync || typeof state.tickTickSync !== 'object' || Array.isArray(state.tickTickSync)) {
        state.tickTickSync = structuredClone(DEFAULT_STATE.tickTickSync);
    }

    const nextVersion = Number.isInteger(state.tickTickSync.stateVersion) && state.tickTickSync.stateVersion >= 0
        ? state.tickTickSync.stateVersion + 1
        : 1;

    state.tickTickSync = {
        lastTickTickSyncAt: new Date().toISOString(),
        lastTickTickActiveCount: Number.isInteger(activeCount) && activeCount >= 0 ? activeCount : null,
        lastSyncSource: typeof source === 'string' && source.trim() ? source.trim() : 'unknown',
        stateVersion: nextVersion,
    };

    await save();
    return state.tickTickSync;
}

/**
 * Get the cumulative stats snapshot.
 * @returns {{ tasksAnalyzed: number, tasksApproved: number, tasksSkipped: number, tasksDropped: number, tasksAutoApplied: number, lastDailyBriefing: string|null, lastWeeklyDigest: string|null }}
 */
export function getStats() {
    return state.stats;
}

/**
 * Merge partial updates into the cumulative stats.
 * @param {Object} updates - Partial stats object with fields to update
 * @returns {Promise<void>}
 */
export async function updateStats(updates) {
    Object.assign(state.stats, updates);
    await save();
}

/**
 * Get all processed task entries.
 * @returns {Object.<string, Object>} Map of taskId → processed task entry
 */
export function getProcessedTasks() {
    return state.processedTasks;
}

/**
 * Count the total number of processed task entries.
 * @returns {number}
 */
export function getProcessedCount() {
    return Object.keys(state.processedTasks).length;
}

// ─── Current Review Session ──────────────────────────────────

export async function setCurrentReviewSession(chatId, session) {
    if (!state.currentReviewSessions || typeof state.currentReviewSessions !== 'object' || Array.isArray(state.currentReviewSessions)) {
        state.currentReviewSessions = {};
    }
    state.currentReviewSessions[String(chatId)] = session;
    await save();
}

export function getCurrentReviewSession(chatId) {
    if (!state.currentReviewSessions || typeof state.currentReviewSessions !== 'object' || Array.isArray(state.currentReviewSessions)) {
        return null;
    }
    return state.currentReviewSessions[String(chatId)] || null;
}

export async function clearCurrentReviewSession(chatId) {
    if (!state.currentReviewSessions || typeof state.currentReviewSessions !== 'object' || Array.isArray(state.currentReviewSessions)) {
        return;
    }
    if (String(chatId) in state.currentReviewSessions) {
        delete state.currentReviewSessions[String(chatId)];
        await save();
    }
}

// ─── Maintenance ─────────────────────────────────────────────

/** Wipe all data and start fresh */
export async function resetAll() {
    const chatId = state.chatId; // Preserve chatId so bot stays connected
    state = structuredClone(DEFAULT_STATE);
    state.chatId = chatId;
    state.currentReviewSessions = {};
    await save();
    console.log('🗑️  Store reset to defaults.');
}

export async function pruneOldEntries(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let pruned = 0;

    for (const [id, data] of Object.entries(state.processedTasks)) {
        const entryDate = new Date(data.reviewedAt || data.sentAt || 0);
        if (entryDate < cutoff) {
            delete state.processedTasks[id];
            pruned++;
        }
    }

    const beforeUndo = state.undoLog.length;
    state.undoLog = state.undoLog.filter(e => new Date(e.timestamp || 0) >= cutoff);
    pruned += beforeUndo - state.undoLog.length;

    if (pruned > 0) {
        await save();
        console.log(`🧹 Pruned ${pruned} entries older than ${days} days from store.`);
    }
    return pruned;
}

export async function pruneFailedTasks(now = new Date()) {
    if (!state.failedTasks || typeof state.failedTasks !== 'object' || Array.isArray(state.failedTasks)) {
        return 0;
    }

    let removedCount = 0;
    for (const [id, data] of Object.entries(state.failedTasks)) {
        if (data && data.retryAfter && new Date(data.retryAfter) <= now) {
            delete state.failedTasks[id];
            removedCount++;
        }
    }
    if (removedCount > 0) await save();
    return removedCount;
}
