// State store — two-phase task tracking (pending → processed)
//
// Backend: Redis if REDIS_URL is set (for cloud), file-based fallback (for local dev).
// The entire state is stored as a single JSON blob — simple, no schema to manage.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const STORE_FILE_TMP = path.join(DATA_DIR, 'store.json.tmp'); // D.3.6 Atomic persistence
const REDIS_KEY = 'ticktick-bot:state';

const DEFAULT_STATE = {
    chatId: null,
    pendingTasks: {},    // Analyzed + sent to Telegram, awaiting user review
    processedTasks: {},  // User has clicked approve/skip/drop
    failedTasks: {},     // AI analysis failed (rate limit) — parked to prevent re-polling
    undoLog: [],
    stats: {
        tasksAnalyzed: 0,
        tasksApproved: 0,
        tasksSkipped: 0,
        tasksDropped: 0,
        tasksAutoApplied: 0,
        lastDailyBriefing: null,
        lastWeeklyDigest: null,
    },
};

// ─── Backend Selection ───────────────────────────────────────

let redis = null;
let state = null;
let useRedis = false;

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

async function loadFromRedis() {
    try {
        const raw = await redis.get(REDIS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                ...DEFAULT_STATE,
                ...parsed,
                stats: { ...DEFAULT_STATE.stats, ...parsed.stats },
                pendingTasks: parsed.pendingTasks || {},
                processedTasks: parsed.processedTasks || {},
                undoLog: parsed.undoLog || [],
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
        return {
            ...DEFAULT_STATE,
            ...parsed,
            stats: { ...DEFAULT_STATE.stats, ...parsed.stats },
            pendingTasks: parsed.pendingTasks || {},
            processedTasks: parsed.processedTasks || {},
            undoLog: parsed.undoLog || [],
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
        try {
            const jsonStr = _validateSerialization(state);
            const fd = fs.openSync(STORE_FILE_TMP, 'w');
            fs.writeSync(fd, jsonStr);
            fs.fsyncSync(fd);
            fs.closeSync(fd);

            // Win 1: Durable backup rotation (file-based persistence only)
            try {
                if (fs.existsSync(STORE_FILE)) {
                    const BACKUP_FILE = `${STORE_FILE}.bak`;
                    fs.copyFileSync(STORE_FILE, BACKUP_FILE);
                }
            } catch (backupErr) { /* Best-effort backup */ }

            fs.renameSync(STORE_FILE_TMP, STORE_FILE);

            // Best-effort directory fsync (max durability on Linux)
            try {
                const dirFd = fs.openSync(DATA_DIR, 'r');
                fs.fsyncSync(dirFd);
                fs.closeSync(dirFd);
            } catch { /* Ignore directory sync failures */ }

        } catch (err) {
            console.error('⚠️  Local file save failed. Existing data preserved.', err.message);
        }
    }
}

// ─── Initialize on import ────────────────────────────────────
await load();

// ─── Shared Analysis Lock ────────────────────────────────────
let intakeLock = false;
export function tryAcquireIntakeLock() {
    if (intakeLock) return false;
    intakeLock = true;
    return true;
}
export function releaseIntakeLock() {
    intakeLock = false;
}

// ─── Chat ID ─────────────────────────────────────────────────

export function getChatId() {
    return state.chatId;
}

export async function setChatId(id) {
    state.chatId = id;
    await save();
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

export async function approveTask(taskId) { return resolveTask(taskId, 'approve'); }
export async function skipTask(taskId) { return resolveTask(taskId, 'skip'); }
export async function dropTask(taskId) { return resolveTask(taskId, 'drop'); }

export async function markTaskProcessed(taskId, data) {
    state.processedTasks[taskId] = {
        ...data,
        reviewedAt: new Date().toISOString(),
    };
    state.stats.tasksAnalyzed++;
    await save();
}

// ─── Pending Tasks Retrieval ─────────────────────────────────

export function getPendingTasks() {
    return state.pendingTasks;
}

export function getPendingCount() {
    return Object.keys(state.pendingTasks).length;
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

// ─── Stats ───────────────────────────────────────────────────

export function getStats() {
    return state.stats;
}

export async function updateStats(updates) {
    Object.assign(state.stats, updates);
    await save();
}

export function getProcessedTasks() {
    return state.processedTasks;
}

export function getProcessedCount() {
    return Object.keys(state.processedTasks).length;
}

// ─── Maintenance ─────────────────────────────────────────────

/** Wipe all data and start fresh */
export async function resetAll() {
    const chatId = state.chatId; // Preserve chatId so bot stays connected
    state = structuredClone(DEFAULT_STATE);
    state.chatId = chatId;
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
