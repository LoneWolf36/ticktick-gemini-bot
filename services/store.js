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
