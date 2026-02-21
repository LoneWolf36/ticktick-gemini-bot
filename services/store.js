// State store — two-phase task tracking (pending → processed)
//
// Flow: Task analyzed → stored in pendingTasks → user clicks button → moved to processedTasks
// This ensures no task is ever lost if the user hasn't reviewed it yet.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const DEFAULT_STATE = {
    chatId: null,
    pendingTasks: {},    // Analyzed + sent to Telegram, awaiting user review
    processedTasks: {},  // User has clicked approve/skip/drop
    undoLog: [],
    stats: {
        tasksAnalyzed: 0,
        tasksApproved: 0,
        tasksSkipped: 0,
        tasksAutoApplied: 0,
        lastDailyBriefing: null,
        lastWeeklyDigest: null,
    },
};

let state = null;

function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
    if (state) return state;
    ensureDir();
    try {
        if (fs.existsSync(STORE_FILE)) {
            state = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
            state = {
                ...DEFAULT_STATE,
                ...state,
                stats: { ...DEFAULT_STATE.stats, ...state.stats },
                pendingTasks: state.pendingTasks || {},
            };
            return state;
        }
    } catch { /* ignore corrupt file */ }
    state = structuredClone(DEFAULT_STATE);
    return state;
}

function save() {
    ensureDir();
    fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2));
}

// ─── Chat ID ─────────────────────────────────────────────────

export function getChatId() {
    return load().chatId;
}

export function setChatId(id) {
    load().chatId = id;
    save();
}

// ─── Task Status Checks ─────────────────────────────────────

/** Returns true if task has been fully reviewed (approved/skipped/dropped) */
export function isTaskProcessed(taskId) {
    return !!load().processedTasks[taskId];
}

/** Returns true if task has been sent to Telegram but not yet reviewed */
export function isTaskPending(taskId) {
    return !!load().pendingTasks[taskId];
}

/** Returns true if task has been touched at all (pending or processed) */
export function isTaskKnown(taskId) {
    const s = load();
    return !!s.processedTasks[taskId] || !!s.pendingTasks[taskId];
}

// ─── Phase 1: Pending (analyzed, sent to Telegram) ──────────

export function markTaskPending(taskId, data) {
    const s = load();
    s.pendingTasks[taskId] = {
        ...data,
        sentAt: new Date().toISOString(),
    };
    s.stats.tasksAnalyzed++;
    save();
}

// ─── Phase 2: Processed (user clicked a button) ─────────────

export function approveTask(taskId) {
    const s = load();
    const pending = s.pendingTasks[taskId];
    if (!pending) return null;

    // Move to processed
    s.processedTasks[taskId] = {
        ...pending,
        approved: true,
        reviewedAt: new Date().toISOString(),
    };
    delete s.pendingTasks[taskId];
    s.stats.tasksApproved++;
    save();
    return s.processedTasks[taskId];
}

export function skipTask(taskId) {
    const s = load();
    const pending = s.pendingTasks[taskId];
    if (!pending) return null;

    s.processedTasks[taskId] = {
        ...pending,
        skipped: true,
        reviewedAt: new Date().toISOString(),
    };
    delete s.pendingTasks[taskId];
    s.stats.tasksSkipped++;
    save();
    return s.processedTasks[taskId];
}

export function dropTask(taskId) {
    const s = load();
    const pending = s.pendingTasks[taskId];
    if (!pending) return null;

    s.processedTasks[taskId] = {
        ...pending,
        dropped: true,
        reviewedAt: new Date().toISOString(),
    };
    delete s.pendingTasks[taskId];
    s.stats.tasksSkipped++;
    save();
    return s.processedTasks[taskId];
}

/** Direct processed (for auto-apply — task was never in pending) */
export function markTaskProcessed(taskId, data) {
    const s = load();
    s.processedTasks[taskId] = {
        ...data,
        reviewedAt: new Date().toISOString(),
    };
    s.stats.tasksAnalyzed++;
    save();
}

// ─── Pending Tasks Retrieval ─────────────────────────────────

export function getPendingTasks() {
    return load().pendingTasks;
}

export function getPendingCount() {
    return Object.keys(load().pendingTasks).length;
}

// ─── Undo Log ────────────────────────────────────────────────

export function addUndoEntry(entry) {
    const s = load();
    s.undoLog.push({ ...entry, timestamp: new Date().toISOString() });
    if (s.undoLog.length > 200) s.undoLog = s.undoLog.slice(-200);
    save();
}

export function getLastUndoEntry() {
    const s = load();
    return s.undoLog.length > 0 ? s.undoLog[s.undoLog.length - 1] : null;
}

export function removeLastUndoEntry() {
    const s = load();
    s.undoLog.pop();
    save();
}

// ─── Stats ───────────────────────────────────────────────────

export function getStats() {
    return load().stats;
}

export function updateStats(updates) {
    const s = load();
    Object.assign(s.stats, updates);
    save();
}

export function getProcessedTasks() {
    return load().processedTasks;
}

export function getProcessedCount() {
    return Object.keys(load().processedTasks).length;
}

// ─── Maintenance ─────────────────────────────────────────

/** Prune processedTasks and undoLog entries older than `days` days */
export function pruneOldEntries(days = 30) {
    const s = load();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let pruned = 0;

    // Prune processedTasks
    for (const [id, data] of Object.entries(s.processedTasks)) {
        const entryDate = new Date(data.reviewedAt || data.sentAt || 0);
        if (entryDate < cutoff) {
            delete s.processedTasks[id];
            pruned++;
        }
    }

    // Prune undoLog
    const beforeUndo = s.undoLog.length;
    s.undoLog = s.undoLog.filter(e => new Date(e.timestamp || 0) >= cutoff);
    pruned += beforeUndo - s.undoLog.length;

    if (pruned > 0) {
        save();
        console.log(`🧹 Pruned ${pruned} entries older than ${days} days from store.`);
    }
    return pruned;
}
