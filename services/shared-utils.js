// Shared domain utilities — used by both services/ and bot/
// Keeps dependency direction: services/ ← bot/ (never services/ → bot/)
import { InlineKeyboard } from 'grammy';
import { FOLLOWUP_PRONOUNS, FOLLOWUP_TIME_SHIFTS } from './project-policy.js';
import { getUserTimezone } from './user-settings.js';

// ─── Generic Data Helpers (shared across summary surfaces) ───

/**
 * Safely coerce a value to array. Returns empty array for non-arrays.
 * @param {*} value
 * @returns {Array}
 */
export function toArray(value) {
    return Array.isArray(value) ? value : [];
}

/**
 * Safely extract a non-empty trimmed string, returning fallback otherwise.
 * @param {*} value
 * @param {string} [fallback='']
 * @returns {string}
 */
export function toString(value, fallback = '') {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) return trimmed;
    }
    return fallback;
}

/**
 * Acknowledge a Telegram callback without failing the business action when the
 * callback query has already expired.
 * @param {Object} ctx - Grammy context
 * @param {Object} [options={}] - answerCallbackQuery options
 * @returns {Promise<*|null>} Telegram response or null when the ACK is expired
 */
export async function answerCallbackQueryBestEffort(ctx, options = {}) {
    const elapsedMs = Date.now() - (ctx?._callbackReceivedAt || Date.now());
    try {
        if (ctx?.telegram && ctx.callbackQuery?.id) {
            return await ctx.telegram.answerCallbackQuery(ctx.callbackQuery.id, options);
        }
        return await ctx.answerCallbackQuery(options);
    } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('query is too old') || msg.includes('too old') || msg.includes('query id is invalid')) {
            console.warn(`[TelegramCallback] ${JSON.stringify({ eventType: 'telegram.callback.timeout', callbackId: ctx?.callbackQuery?.id, elapsedMs })}`);
            return null;
        }
        throw err;
    }
}

/**
 * Filter tasks to active ones (status 0 or undefined).
 * @param {Array} [tasks=[]]
 * @returns {Array}
 */
export function asActiveTasks(tasks = []) {
    return toArray(tasks).filter((task) => task && (task.status === 0 || task.status === undefined));
}

/**
 * Filter history entries to valid objects.
 * @param {Array} [processedHistory=[]]
 * @returns {Array}
 */
export function asProcessedHistory(processedHistory = []) {
    return toArray(processedHistory).filter((entry) => entry && typeof entry === 'object');
}

/**
 * Merge two notice arrays, deduplicating by `code`.
 * Base notices take precedence over model notices for same code.
 * @param {Array} [baseNotices=[]] - System-generated notices (higher priority)
 * @param {Array} [modelNotices=[]] - Model-generated notices
 * @returns {Array}
 */
export function mergeNotices(baseNotices = [], modelNotices = []) {
    const merged = [];
    const seen = new Set();

    for (const notice of baseNotices) {
        if (!notice?.code) continue;
        if (seen.has(notice.code)) continue;
        seen.add(notice.code);
        merged.push(notice);
    }

    for (const notice of modelNotices) {
        if (!notice?.code) continue;
        if (seen.has(notice.code)) continue;
        seen.add(notice.code);
        merged.push(notice);
    }

    return merged;
}

// ─── Priority Map (Gemini label → TickTick priority number) ─

/**
 * Priority map from Gemini labels to TickTick priority integers.
 * @type {Object<string, number>}
 */
export const PRIORITY_MAP = {
    'core_goal': 5,         // 🔴 High (red)
    'important': 3,         // 🟡 Medium (yellow)
    'life-admin': 1,        // 🔵 Low (blue)
    'consider-dropping': 0, // None
};

/**
 * Mapping of TickTick priority numbers to emoji representations.
 * @type {Object<number, string>}
 */
export const PRIORITY_EMOJI = { 5: '🔴', 3: '🟡', 1: '🔵', 0: '⚪' };

/**
 * Mapping of TickTick priority numbers to user-facing labels.
 * @type {Object<number, string>}
 */
export const PRIORITY_LABEL = {
    5: 'Core Goal',
    3: 'Important',
    1: 'Life Admin',
    0: 'Optional',
};

// ─── Access Control (single source of truth) ────────────────

/**
 * The authorized Telegram chat ID from environment variables.
 * @type {number|null}
 */
export const AUTHORIZED_CHAT_ID = process.env.TELEGRAM_CHAT_ID
    ? parseInt(process.env.TELEGRAM_CHAT_ID)
    : null;

/**
 * Checks if a Telegram context originates from the authorized chat.
 * @param {Object} ctx - Telegram context object
 * @returns {boolean} True if authorized or no restriction set
 */
export function isAuthorized(ctx) {
    if (!AUTHORIZED_CHAT_ID) return true;
    return ctx.chat?.id === AUTHORIZED_CHAT_ID;
}

/**
 * Guards access to bot commands, replying with a lock message if unauthorized.
 * @param {Object} ctx - Telegram context object
 * @returns {Promise<boolean>} True if authorized, false otherwise
 */
export async function guardAccess(ctx) {
    if (!isAuthorized(ctx)) {
        await ctx.reply('🔒 Unauthorized. This bot is private.');
        return false;
    }
    return true;
}

// ─── Undo Entry Builder ─────────────────────────────────────

/**
 * Builds an undo entry for the state store to allow reverting mutations.
 * @param {Object} params
 * @param {Object} params.source - The original task or state before mutation
 * @param {string} params.action - The type of action performed (e.g., 'update', 'move')
 * @param {Object} [params.applied={}] - The specific fields applied during mutation
 * @param {string|null} [params.appliedTaskId=null] - The ID of the task after mutation (if different)
 * @returns {Object} A structured undo log entry
 */
export function buildUndoEntry({ source, action, applied = {}, appliedTaskId = null }) {
    return {
        taskId: appliedTaskId || source.id || source.taskId,
        originalTaskId: source.id || source.taskId,
        action,
        originalTitle: source.title ?? source.originalTitle,
        originalContent: source.content ?? source.originalContent ?? '',
        originalPriority: source.priority ?? source.originalPriority,
        originalProjectId: source.projectId ?? source.originalProjectId,

        appliedTitle: applied.title ?? null,
        appliedPriority: applied.priority ?? null,
        appliedProject: applied.project ?? null,
        appliedProjectId: applied.projectId ?? null,
        appliedSchedule: applied.schedule ?? null,
    };
}

// ─── Transparent Field Diffs ─────────────────────────────────

const FIELD_DIFF_MAX_VALUE_LENGTH = 35;

function normalizeComparableValue(value) {
    if (value === undefined || value === null || value === '') return null;
    return value;
}

function truncateDiffValue(value, maxLength = FIELD_DIFF_MAX_VALUE_LENGTH) {
    const text = value === undefined || value === null || value === '' ? 'None' : String(value);
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function projectNameFor(projectId, projects = [], fallback = null) {
    if (!projectId) return fallback || 'None';
    const matchedName = projects.find((project) => project?.id === projectId)?.name;
    if (matchedName) return matchedName;
    if (fallback && fallback !== projectId) return fallback;
    if (String(projectId).toLowerCase().startsWith('inbox')) return 'Inbox';
    return projectId;
}

function priorityLabelFor(priority) {
    const normalized = Number(priority);
    if (Number.isNaN(normalized)) return priority === null || priority === undefined ? 'None' : String(priority);
    return PRIORITY_LABEL[normalized] || String(priority);
}

function priorityEmojiFor(priority) {
    const normalized = Number(priority);
    return PRIORITY_EMOJI[normalized] || '⚪';
}

function dateLabelFor(value) {
    if (!value) return 'None';
    if (typeof value === 'string' && scheduleLabel(value)) return scheduleLabel(value);
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return String(value);
    return new Date(timestamp).toLocaleDateString('en-IE', {
        timeZone: USER_TZ,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    });
}

function pushDiff(diffs, field, label, oldValue, newValue, emoji) {
    if (normalizeComparableValue(oldValue) === normalizeComparableValue(newValue)) return;
    diffs.push({
        field,
        label,
        oldValue: truncateDiffValue(oldValue),
        newValue: truncateDiffValue(newValue),
        emoji,
    });
}

/**
 * Builds user-facing old-to-new field diffs for task mutations.
 * @param {Object|null} snapshot - Task state before mutation
 * @param {Object|null} action - Normalized action or proposed mutation
 * @param {Object} [options]
 * @param {Array<Object>} [options.projects=[]] - Known TickTick projects for names
 * @returns {Array<{field:string,label:string,oldValue:string,newValue:string,emoji:string}>}
 */
export function buildFieldDiff(snapshot = {}, action = {}, { projects = [] } = {}) {
    const source = snapshot || {};
    const change = action || {};
    const diffs = [];

    pushDiff(diffs, 'title', 'Title', source.title, change.title, '');

    const oldProjectId = source.projectId || source.originalProjectId || null;
    const newProjectId = change.projectId || change.appliedProjectId || null;
    if (newProjectId && oldProjectId !== newProjectId) {
        pushDiff(
            diffs,
            'project',
            'Project',
            projectNameFor(oldProjectId, projects, source.projectName || source.originalProjectName || null),
            projectNameFor(newProjectId, projects, change.projectName || change.appliedProject || null),
            '📁',
        );
    }

    if (change.priority !== undefined && normalizeComparableValue(source.priority) !== normalizeComparableValue(change.priority)) {
        pushDiff(diffs, 'priority', 'Priority', priorityLabelFor(source.priority), priorityLabelFor(change.priority), priorityEmojiFor(change.priority));
    }

    const oldDue = source.dueDate || source.schedule || source.originalSchedule || null;
    const newDue = change.dueDate || change.schedule || change.appliedSchedule || null;
    if (newDue && normalizeComparableValue(oldDue) !== normalizeComparableValue(newDue)) {
        pushDiff(diffs, 'due', 'Due', dateLabelFor(oldDue), dateLabelFor(newDue), '📅');
    }

    if (change.content !== undefined && normalizeComparableValue(source.content) !== normalizeComparableValue(change.content)) {
        pushDiff(diffs, 'content', 'Content', source.content || 'None', change.content || 'None', '📝');
    }

    if (change.repeatFlag !== undefined && normalizeComparableValue(source.repeatFlag) !== normalizeComparableValue(change.repeatFlag)) {
        pushDiff(diffs, 'repeat', 'Repeat', source.repeatFlag || 'None', change.repeatFlag || 'None', '🔄');
    }

    return diffs;
}

/**
 * Formats task field diffs into compact Telegram-safe lines.
 * @param {Array<Object>} diffs - Output from buildFieldDiff
 * @param {Object} [options]
 * @param {boolean} [options.urgentMode=false] - Use shorter labels
 * @returns {string}
 */
export function formatFieldDiff(diffs = [], { urgentMode = false } = {}) {
    if (!Array.isArray(diffs) || diffs.length === 0) return '';
    return diffs
        .map((diff) => {
            const emoji = diff.emoji ? `${diff.emoji} ` : '';
            const label = urgentMode ? '' : `${diff.label}  `;
            return `${emoji}${label}${truncateDiffValue(diff.oldValue)} → ${truncateDiffValue(diff.newValue)}`.trim();
        })
        .join('\n');
}

// ─── Timezone Helpers ───────────────────────────────────────
// ALL date formatting in the entire app must use these helpers.
// Never call new Date().toLocaleDateString() without passing USER_TZ.
// Canonical timezone source: user-settings.js → getUserTimezone()
// Priority chain: env USER_TIMEZONE → user_context USER_TIMEZONE → Europe/Dublin

/**
 * The user's timezone, resolved from the canonical getUserTimezone().
 * @type {string}
 */
export const USER_TZ = getUserTimezone();

/**
 * Get the user's current time as date components in their timezone.
 * @returns {{year: number, month: number, day: number, hour: number, dayOfWeek: number}}
 */
export function userNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: USER_TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());

    const get = (type) => parts.find(p => p.type === type)?.value;
    return {
        year: parseInt(get('year')),
        month: parseInt(get('month')) - 1, // 0-indexed
        day: parseInt(get('day')),
        hour: parseInt(get('hour')),
        dayOfWeek: new Date(
            parseInt(get('year')),
            parseInt(get('month')) - 1,
            parseInt(get('day'))
        ).getDay(),
    };
}

/** Format today's date as "Monday, 21 February 2026" in the user's timezone */
export function userTodayFormatted() {
    return new Date().toLocaleDateString('en-IE', {
        timeZone: USER_TZ,
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
}

/**
 * Formats a Date object as a localized string in the user's timezone.
 * @param {Date|string|number} date - The date to format
 * @returns {string} Formatted locale string
 */
export function userLocaleString(date) {
    return new Date(date).toLocaleString('en-IE', { timeZone: USER_TZ });
}

/**
 * Returns the current time formatted for logs in the user's timezone.
 * @returns {string} Formatted time string
 */
export function userTimeString() {
    return new Date().toLocaleTimeString('en-IE', { timeZone: USER_TZ });
}

/** Build an ISO datetime string for TickTick, with correct timezone offset */
function atTimeISO(year, month, day, hour = 23, minute = 59) {
    const targetDate = new Date(year, month, day, hour, minute, 0);
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: USER_TZ,
        timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(targetDate);
    const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
    const match = offsetStr.match(/GMT([+-]?\d+)?/);
    const offsetHours = match?.[1] ? parseInt(match[1]) : 0;
    const sign = offsetHours >= 0 ? '+' : '-';
    const absHours = String(Math.abs(offsetHours)).padStart(2, '0');
    const tzOffset = `${sign}${absHours}00`;

    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');
    const min = String(minute).padStart(2, '0');
    return `${year}-${mm}-${dd}T${hh}:${min}:00.000${tzOffset}`;
}

/** Build an ISO date string at end-of-day */
function endOfDayISO(year, month, day) {
    return atTimeISO(year, month, day, 23, 59);
}

/**
 * Safely parse a YYYY-MM-DD string into a TickTick ISO string with the current user's timezone offset
 * following Postel's Law to shield against messy LLM output.
 */
export function parseDateStringToTickTickISO(dateStr, options = {}) {
    if (!dateStr || typeof dateStr !== 'string') return null;

    const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;

    const year = parseInt(match[1]);
    const month = parseInt(match[2]) - 1; // 0-indexed month for Date
    const day = parseInt(match[3]);

    const slotMode = options.slotMode || 'end-of-day';
    if (slotMode === 'priority') {
        const priorityLabel = options.priorityLabel || 'important';
        const slot = priorityLabel === 'core_goal' ? { hour: 9, minute: 30 }
            : priorityLabel === 'important' ? { hour: 13, minute: 0 }
                : { hour: 17, minute: 30 };
        return atTimeISO(year, month, day, slot.hour, slot.minute);
    }

    if (slotMode === 'custom' && typeof options.hour === 'number' && typeof options.minute === 'number') {
        return atTimeISO(year, month, day, options.hour, options.minute);
    }

    return endOfDayISO(year, month, day);
}

/**
 * Conservative sensitive-content detector to prevent destructive rewrites.
 * @param {string} text - The text to check
 * @returns {boolean} True if text likely contains secrets or sensitive info
 */
export function containsSensitiveContent(text = '') {
    if (!text || typeof text !== 'string') return false;
    const probes = [
        /password|passcode|otp|pin|secret|api\s*key|token|credential/i,
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
        /[A-Za-z0-9_!@#$%^&*()\-+=]{10,}/,
    ];
    return probes.some((re) => re.test(text));
}

/**
 * Maps a scheduling bucket (e.g., 'today') to an ISO datetime string.
 * @param {string} bucket - The scheduling bucket ('today', 'tomorrow', 'this-week', 'next-week')
 * @param {Object} [options]
 * @param {string} [options.priorityLabel='important'] - Priority label to determine time slot
 * @returns {string|null} ISO datetime string for TickTick or null
 */
export function scheduleToDateTime(bucket, { priorityLabel = 'important' } = {}) {
    if (!bucket || bucket === 'someday' || bucket === 'null') return null;
    const now = userNow();
    const addDays = (n) => {
        const d = new Date(now.year, now.month, now.day + n);
        return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    };

    const slot = priorityLabel === 'core_goal' ? { hour: 9, minute: 30 }
        : priorityLabel === 'important' ? { hour: 13, minute: 0 }
            : { hour: 17, minute: 30 };

    switch (bucket) {
        case 'today':
            return atTimeISO(now.year, now.month, now.day, slot.hour, slot.minute);
        case 'tomorrow': {
            const t = addDays(1);
            return atTimeISO(t.year, t.month, t.day, slot.hour, slot.minute);
        }
        case 'this-week': {
            const daysUntilFriday = (5 - now.dayOfWeek + 7) % 7 || 7;
            const f = addDays(daysUntilFriday);
            return atTimeISO(f.year, f.month, f.day, slot.hour, slot.minute);
        }
        case 'next-week': {
            const daysUntilMonday = (8 - now.dayOfWeek) % 7 || 7;
            const m = addDays(daysUntilMonday);
            return atTimeISO(m.year, m.month, m.day, slot.hour, slot.minute);
        }
        default:
            return null;
    }
}

/**
 * Alias for scheduleToDateTime that returns a TickTick ISO string.
 * @param {string} bucket - Scheduling bucket
 * @param {Object} [options] - Options passed to scheduleToDateTime
 * @returns {string|null}
 */
export function scheduleToDate(bucket, options = {}) {
    return scheduleToDateTime(bucket, { priorityLabel: options.priorityLabel || 'important' });
}

function scheduleLabel(bucket) {
    const labels = {
        'today': 'Today',
        'tomorrow': 'Tomorrow',
        'this-week': 'This week',
        'next-week': 'Next week',
        'someday': 'Someday (no rush)',
    };
    return labels[bucket] || null;
}

/**
 * Builds a TickTick update object for mutations.
 * @param {Object} data - The source data for update
 * @param {Object} [options]
 * @param {string} [options.applyMode='full'] - Mutation mode ('full' or 'metadata-only')
 * @param {string} [options.priorityLabel='important'] - Priority label for scheduling
 * @returns {Object} Structured TickTick update payload
 */
export function buildTickTickUpdate(data, options = {}) {
    const { applyMode = 'full', priorityLabel = 'important' } = options;
    const update = {
        projectId: data.projectId,
        originalProjectId: data.projectId // Required for ticktick.js to detect moves
    };

    if (applyMode !== 'metadata-only') {
        if (data.improvedTitle) update.title = data.improvedTitle;
        if (data.improvedContent) update.content = data.improvedContent;
    }
    if (data.suggestedPriority !== undefined) update.priority = data.suggestedPriority;

    if (data.suggestedProjectId && data.suggestedProjectId !== data.projectId) {
        update.projectId = data.suggestedProjectId;
    }

    if (data.suggestedSchedule && data.suggestedSchedule !== 'someday' && data.suggestedSchedule !== 'null') {
        if (typeof data.suggestedSchedule === 'string' && (data.suggestedSchedule.includes('T') || data.suggestedSchedule.includes('-'))) {
            update.dueDate = data.suggestedSchedule;
        } else {
            const dueDate = scheduleToDateTime(data.suggestedSchedule, { priorityLabel });
            if (dueDate) update.dueDate = dueDate;
        }
    }

    return update;
}

/**
 * Builds a descriptive task card for Telegram display.
 * @param {Object} task - Original TickTick task object
 * @param {Object} analysis - Gemini analysis object
 * @returns {string} Formatted Telegram message string
 */
export function buildTaskCard(task, analysis) {
    const lines = [];

    // Header
    lines.push(`**${task.projectName || 'Inbox'}**`);

    // Title: Was / Will be when changed
    if (analysis.improved_title && analysis.improved_title !== task.title) {
        lines.push(`Was: "${task.title}"`);
        lines.push(`Will be: "${analysis.improved_title}"`);
    } else {
        lines.push(`**${task.title}**`);
    }

    // Changes: field diff list (only changed fields)
    const changes = [];

    if (task.priority !== undefined && analysis.priority) {
        const originalPriorityLabel = PRIORITY_LABEL[task.priority] || 'None';
        const newPriorityNumber = PRIORITY_MAP[analysis.priority];
        if (newPriorityNumber !== undefined && newPriorityNumber !== task.priority) {
            const newPriorityLabel = PRIORITY_LABEL[newPriorityNumber] || analysis.priority;
            changes.push(`${analysis.priority_emoji || '⚪'} Priority  ${originalPriorityLabel} → ${newPriorityLabel}`);
        }
    }

    if (analysis.suggested_project && analysis.suggested_project !== (task.projectName || 'Inbox')) {
        changes.push(`📁 Project  ${task.projectName || 'Inbox'} → ${analysis.suggested_project}`);
    }

    if (analysis.suggested_schedule && analysis.suggested_schedule !== (task.dueDate || null)) {
        changes.push(`📅 Due  ${dateLabelFor(task.dueDate)} → ${dateLabelFor(analysis.suggested_schedule)}`);
    }

    const hasNewContent = (analysis.description || '') + (analysis.sub_steps?.join('') || '');
    const hasOldContent = task.content || '';
    if (hasNewContent && hasNewContent !== hasOldContent) {
        changes.push(`📝 Content  ${task.content ? 'Updated' : 'Added'}`);
    }

    if (changes.length > 0) {
        lines.push(...changes);
    }

    // Why / rationale
    if (analysis.analysis) {
        lines.push(`*Why:* ${analysis.analysis}`);
    }

    // Description
    if (analysis.description) {
        lines.push(`📝 ${analysis.description}`);
    }

    // Action steps
    if (analysis.sub_steps?.length > 0) {
        lines.push('📋 Action Steps:');
        analysis.sub_steps.slice(0, 3).forEach((step, i) => {
            lines.push(`  ${i + 1}. ${step}`);
        });
        if (analysis.sub_steps.length > 3) {
            lines.push(`  …+${analysis.sub_steps.length - 3} more`);
        }
    }

    // Success criteria
    if (analysis.success_criteria) {
        lines.push(`🎯 Done when: ${analysis.success_criteria}`);
    }

    // Callout
    if (analysis.callout) {
        lines.push(`💬 ${analysis.callout}`);
    }

    return truncateMessage(lines.join('\n'));
}

/**
 * Builds a Telegram review card from a task + normalized action.
 * @param {Object} task - Original TickTick task object
 * @param {Object} action - Normalized pipeline action
 * @param {Array} [projects=[]] - List of available TickTick projects
 * @returns {string} Formatted Telegram message string
 */
export function buildTaskCardFromAction(task, action, projects = []) {
    const lines = [];

    if (action.type === 'complete') {
        lines.push(`✅ Mark as done: "${task.title}"`);
        const context = [];
        context.push(`${PRIORITY_EMOJI[task.priority] || '⚪'} ${PRIORITY_LABEL[task.priority] || 'unknown'}`);
        context.push(`📁 ${task.projectName || 'Inbox'}`);
        if (task.dueDate) {
            context.push(`📅 ${dateLabelFor(task.dueDate)}`);
        }
        lines.push(context.join('  |  '));
        return truncateMessage(lines.join('\n'));
    }

    if (action.type === 'delete') {
        lines.push(`🗑️ Suggested deletion: "${task.title}"`);
        lines.push('');
        lines.push('⚠️ This will permanently remove the task from TickTick.');
        lines.push('');
        const context = [];
        context.push(`${PRIORITY_EMOJI[task.priority] || '⚪'} ${PRIORITY_LABEL[task.priority] || 'unknown'}`);
        context.push(`📁 ${task.projectName || 'Inbox'}`);
        if (task.dueDate) {
            context.push(`📅 ${dateLabelFor(task.dueDate)}`);
        }
        lines.push(context.join('  |  '));
        return truncateMessage(lines.join('\n'));
    }

    // Update
    lines.push(`**${task.projectName || 'Inbox'}**`);

    if (action.title && action.title !== task.title) {
        lines.push(`Was: "${task.title}"`);
        lines.push(`Will be: "${action.title}"`);
    } else {
        lines.push(`**${task.title}**`);
    }

    // Changes using buildFieldDiff
    const diffs = buildFieldDiff(task, action, { projects });
    const diffText = formatFieldDiff(diffs);
    if (diffText) {
        lines.push(diffText);
    }

    // Content change indicator (don't dump full content)
    if (action.content && action.content !== task.content) {
        lines.push(`📝 Content ${task.content ? 'Updated' : 'Added'}`);
    }

    return truncateMessage(lines.join('\n'));
}

/**
 * Builds the improved task description content from analysis results.
 * @param {Object} analysis - Gemini analysis object
 * @returns {string} Formatted content string
 */
export function buildImprovedContent(analysis) {
    let content = '';
    if (analysis.analysis) content += `📊 ${analysis.analysis}\n\n`;
    if (analysis.description) content += `📝 ${analysis.description}\n\n`;
    if (analysis.sub_steps?.length > 0) {
        content += `📋 Action Steps:\n`;
        analysis.sub_steps.forEach((s, i) => { content += `${i + 1}. ${s}\n`; });
        content += '\n';
    }
    if (analysis.resources?.length > 0) {
        content += `🔗 Context & Resources:\n`;
        analysis.resources.forEach((r) => { content += `- ${r}\n`; });
        content += '\n';
    }
    if (analysis.success_criteria) content += `🎯 Done when: ${analysis.success_criteria}\n\n`;
    if (analysis.callout) content += `💬 ${analysis.callout}\n`;
    return content;
}

/**
 * Normalizes task and analysis into a pending task record for the store.
 * @param {Object} task - Original TickTick task
 * @param {Object} analysis - Gemini analysis
 * @param {Array} [projects=[]] - List of available TickTick projects
 * @returns {Object} Structured pending task record
 */
export function buildPendingData(task, analysis, projects = []) {
    let suggestedProjectId = null;
    if (analysis.suggested_project) {
        const match = projects.find(p =>
            p.name.trim().toLowerCase() === analysis.suggested_project.trim().toLowerCase()
        );
        suggestedProjectId = match?.id || null;
    }

    return {
        originalTitle: task.title,
        originalContent: task.content || '',
        originalPriority: task.priority,
        originalDueDate: task.dueDate || null,
        improvedTitle: analysis.improved_title,
        improvedContent: buildImprovedContent(analysis),
        suggestedPriority: PRIORITY_MAP[analysis.priority] ?? task.priority,
        projectId: task.projectId,
        projectName: task.projectName,
        suggestedProject: analysis.suggested_project || null,
        suggestedProjectId,
        suggestedSchedule: analysis.suggested_schedule || null,
        analysis: analysis.analysis,
        description: analysis.description,
        priority: analysis.priority,
        priorityEmoji: analysis.priority_emoji,
        needleMover: analysis.needle_mover,
        subSteps: analysis.sub_steps,
        resources: analysis.resources,
        successCriteria: analysis.success_criteria,
        callout: analysis.callout,
    };
}

/**
 * Maps a normalized pipeline action to the pending data shape expected by the store and callbacks.
 * @param {Object} task - Original TickTick task
 * @param {Object} action - Normalized pipeline action
 * @param {Array} [projects=[]] - List of available TickTick projects
 * @returns {Object} Structured pending task record
 */
export function buildPendingDataFromAction(task, action, projects = []) {
    const project = action.projectId
        ? projects.find(p => p.id === action.projectId)
        : null;

    return {
        taskId: action.taskId,
        originalTitle: task.title,
        originalContent: task.content || '',
        originalPriority: task.priority,
        originalProjectId: task.projectId,
        originalDueDate: task.dueDate || null,
        projectId: task.projectId,
        projectName: task.projectName || 'Inbox',

        improvedTitle: action.title !== task.title ? action.title : null,
        improvedContent: action.content || null,
        suggestedPriority: action.priority ?? task.priority,
        suggestedProject: project?.name || null,
        suggestedProjectId: action.projectId !== task.projectId ? action.projectId : null,
        suggestedSchedule: action.dueDate || null,

        actionType: action.type,

        analysis: null,
        description: null,
        priority: PRIORITY_LABEL[action.priority ?? task.priority] ?? PRIORITY_LABEL[3],
        priorityEmoji: PRIORITY_EMOJI[action.priority ?? task.priority] ?? PRIORITY_EMOJI[3],
        needleMover: null,
        subSteps: null,
        resources: null,
        successCriteria: null,
        callout: null,
    };
}

/**
 * Maps a stored pending record back to an analysis object shape.
 * @param {Object} data - Stored pending task data
 * @returns {Object} Reconstructed Gemini analysis object
 */
export function pendingToAnalysis(data) {
    return {
        improved_title: data.improvedTitle,
        analysis: data.analysis,
        description: data.description,
        priority: data.priority || 'important',
        priority_emoji: data.priorityEmoji || '🟡',
        needle_mover: data.needleMover,
        sub_steps: data.subSteps || [],
        resources: data.resources || [],
        success_criteria: data.successCriteria,
        callout: data.callout,
        suggested_project: data.suggestedProject,
        suggested_schedule: data.suggestedSchedule,
    };
}

/**
 * Builds a notification message for auto-applied task updates.
 * Shows per-task field diffs when available (via `diffs` array on each result),
 * falls back to legacy schedule/movedTo format for entries without diffs.
 * Limits visible tasks to 5 with overflow line.
 * @param {Array<Object>} results - List of auto-applied results
 * @param {Object} [options]
 * @param {boolean} [options.hasSkippedActions=false] - Whether destructive actions were skipped
 * @returns {string|null} Formatted notification or null if no results
 */
export function buildAutoApplyNotification(results, { hasSkippedActions = false } = {}) {
    if (!results || results.length === 0) return null;

    const MAX_VISIBLE = 5;
    const total = results.length;
    const shown = results.slice(0, MAX_VISIBLE);

    const skipped = hasSkippedActions ? ' ⚠️ Skipped destructive action(s)' : '';
    const lines = [
        `**${total} task(s) organized while you were away${skipped}:**`,
    ];

    for (const r of shown) {
        if (r.diffs && r.diffs.length > 0) {
            lines.push(`• "${r.title}"`);
            for (const d of r.diffs) {
                const emoji = d.emoji ? `${d.emoji} ` : '';
                lines.push(`  ${emoji}${d.label}: ${d.oldValue} → ${d.newValue}`);
            }
        } else {
            const parts = [];
            if (r.schedule) parts.push(`due ${dateLabelFor(r.schedule)}`);
            if (r.movedTo) parts.push(`moved to ${r.movedTo}`);
            const detail = parts.length > 0 ? ` → ${parts.join(', ')}` : '';
            lines.push(`• "${r.title}"${detail}`);
        }
    }

    if (total > MAX_VISIBLE) {
        lines.push(`...and ${total - MAX_VISIBLE} more`);
    }

    lines.push(`*Run /undo if anything looks off.*`);
    return lines.join('\n');
}

/**
 * Utility to pause execution for a given duration.
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Truncates a message to stay under Telegram's character limit.
 * @param {string} text - Text to truncate
 * @param {number} [limit=3800] - Character limit
 * @returns {string} Truncated text
 */
export function truncateMessage(text, limit = 3800) {
    if (text.length <= limit) return text;
    return text.slice(0, limit) + '\n\n... (truncated)';
}

/**
 * Escapes HTML special characters for safe inclusion in Telegram HTML messages.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Parses basic Telegram Markdown into HTML tags supported by Telegraf/Telegram.
 * @param {string} text - Markdown text
 * @returns {string} HTML formatted text
 */
export function parseTelegramMarkdownToHTML(text) {
    if (!text) return '';
    let normalized = text.replace(/\r\n/g, '\n');
    normalized = normalized.replace(/^\s{0,3}#{1,6}\s+(.+)$/gm, '**$1**');
    normalized = normalized.replace(/^\s*#{3,}\s*$/gm, '────────');
    // Normalize underscore italics to asterisk so Telegram HTML parse handles them
    normalized = normalized.replace(/_([^_]+)_/g, '*$1*');

    let escaped = escapeHTML(normalized);
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    escaped = escaped.replace(/~~(.*?)~~/g, '<s>$1</s>');
    return escaped;
}

/**
 * Sends a reply using HTML parse mode, converting Markdown input.
 * @param {Object} ctx - Telegram context
 * @param {string} text - Markdown text
 * @param {Object} [extra={}] - Additional message options
 * @returns {Promise<Object>}
 */
export async function replyWithMarkdown(ctx, text, extra = {}) {
    return ctx.reply(parseTelegramMarkdownToHTML(text), { ...extra, parse_mode: 'HTML' });
}

/**
 * Edits a message using HTML parse mode, converting Markdown input.
 * @param {Object} ctx - Telegram context
 * @param {string} text - Markdown text
 * @param {Object} [extra={}] - Additional message options
 * @returns {Promise<Object>}
 */
export async function editWithMarkdown(ctx, text, extra = {}) {
    return ctx.editMessageText(parseTelegramMarkdownToHTML(text), { ...extra, parse_mode: 'HTML' });
}

/**
 * Sends a message via Bot API using HTML parse mode, converting Markdown input.
 * @param {Object} api - Telegraf/Grammy API instance
 * @param {number|string} chatId - Target chat ID
 * @param {string} text - Markdown text
 * @param {Object} [extra={}] - Additional message options
 * @returns {Promise<Object>}
 */
export async function sendWithMarkdown(api, chatId, text, extra = {}) {
    return api.sendMessage(chatId, parseTelegramMarkdownToHTML(text), { ...extra, parse_mode: 'HTML' });
}

/**
 * Appends an urgent mode reminder to the text if urgent mode is active.
 * @param {string} text - Original message text
 * @param {boolean} urgentMode - Whether urgent mode is active
 * @returns {string}
 */
export function appendUrgentModeReminder(text, urgentMode) {
    if (urgentMode !== true) return text;
    return `${text}\n\n**Urgent mode is currently active.**`;
}

/**
 * Formats a briefing header for various summary surfaces.
 * @param {Object} params
 * @param {string} params.kind - Briefing kind ('daily', 'daily_close', 'weekly')
 * @returns {string} Formatted header
 */
export function formatBriefingHeader({ kind }) {
    if (kind === 'daily') {
        return `**MORNING BRIEFING**\n${userTodayFormatted()}\n${'─'.repeat(16)}\n\n`;
    }
    if (kind === 'daily_close') {
        return `**END-OF-DAY REFLECTION**\n${userTodayFormatted()}\n${'─'.repeat(16)}\n\n`;
    }
    if (kind === 'weekly') {
        return `**WEEKLY ACCOUNTABILITY REVIEW**\n${'─'.repeat(16)}\n\n`;
    }
    return '';
}

/**
 * Filters processed tasks to include only those from the last 7 days.
 * @param {Object} processedTasks - Map of processed tasks
 * @param {Array<string>} [fallbackKeys=[]] - Keys to check for date if reviewedAt is missing
 * @returns {Object} Filtered map
 */
export function filterProcessedThisWeek(processedTasks, fallbackKeys = []) {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = {};
    for (const [id, data] of Object.entries(processedTasks)) {
        const base = data.reviewedAt ?? fallbackKeys.map(k => data?.[k]).find(Boolean);
        if (base && new Date(base) > oneWeekAgo) {
            thisWeek[id] = data;
        }
    }
    return thisWeek;
}

/**
 * Builds a user-friendly message when Gemini AI quota is exhausted.
 * @param {Object} gemini - Gemini service instance
 * @returns {string}
 */
export function buildQuotaExhaustedMessage(gemini) {
    const resumeTime = gemini.quotaResumeTime();
    if (resumeTime) {
        const resumeStr = resumeTime.toLocaleTimeString('en-US', {
            timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit'
        }) + ' PT';
        return `⚠️ **AI quota exhausted.** Try again around ${resumeStr}, or run non-AI commands like /pending and /status in the meantime.`;
    }
    return `⚠️ **AI quota exhausted.** Try again in ~2 hours or after midnight PT. Non-AI commands still work.`;
}

/**
 * Formats a single processed task for summary displays.
 * @param {Object} task - Processed task record
 * @returns {string} Formatted line
 */
export function formatProcessedTask(task) {
    const action = task.approved ? 'Approved' : task.skipped ? 'Skipped' : task.dropped ? 'Dropped' : 'Pending';

    let badge = '';
    if (task.priorityEmoji && task.priority) {
        badge = `${task.priorityEmoji} ${task.priority}`;
    } else {
        badge = PRIORITY_LABEL[task.suggestedPriority ?? 3] || 'important';
    }

    return `- "${task.originalTitle}" -> ${action} [${badge}]`;
}

// ─── Mutation Confirmation Labels (single source of truth) ──

/**
 * Maps mutation action types to user-facing labels.
 * Centralized to prevent duplication across pipeline and shared-utils.
 * @type {Object<string, string>}
 */
export const MUTATION_TYPE_LABELS = {
    'delete': 'Delete',
    'complete': 'Complete',
    'update': 'Update',
};

// ─── Mutation Confirmation Gate ────────────────────────────

/**
 * Builds a confirmation message for destructive/non-exact mutations.
 * @param {Object|null} pendingConfirmation - The pendingConfirmation object from pipeline result
 * @param {Object} [options]
 * @param {string} [options.workStyleMode='standard'] - Current work-style mode
 * @returns {string} Formatted confirmation message
 */
export function buildMutationConfirmationMessage(pendingConfirmation, { workStyleMode = 'standard' } = {}) {
    if (!pendingConfirmation) return 'Please confirm this action.';
    const urgentMode = workStyleMode === 'urgent';
    const actionLabel = MUTATION_TYPE_LABELS[pendingConfirmation.actionType] || 'Modify';
    const title = pendingConfirmation.matchedTask?.title || 'this task';
    const destructive = pendingConfirmation.actionType === 'delete';

    if (urgentMode) {
        return `**${actionLabel} "${title}"?**`;
    }

    const warning = destructive
        ? `This didn't match exactly and can't be undone.`
        : `This didn't match exactly. Please confirm.`;
    return `**${actionLabel} "${title}"?**\n\n${warning}`;
}

/**
 * Builds an inline keyboard for mutation confirmation.
 * @param {Object} [options]
 * @param {boolean} [options.includeCancel=true] - Whether to include a cancel button
 * @returns {InlineKeyboard}
 */
export function buildMutationConfirmationKeyboard({ includeCancel = true } = {}) {
    const keyboard = new InlineKeyboard();
    keyboard.text('✅ Confirm', 'mut:confirm').row();
    if (includeCancel) {
        keyboard.text('❌ Cancel', 'mut:confirm:cancel').row();
    }
    return keyboard;
}

// ─── Mutation Candidate Keyboard ────────────────────────────

const MAX_CANDIDATE_LABEL = 30;

/**
 * Truncates a task candidate label for inline keyboard display.
 * @param {string} title - Task title
 * @returns {string} Truncated title
 */
function truncateCandidateLabel(title) {
    if (!title) return '(untitled)';
    if (title.length <= MAX_CANDIDATE_LABEL) return title;
    return title.slice(0, MAX_CANDIDATE_LABEL - 1) + '…';
}

function candidateId(candidate) {
    return candidate?.id || candidate?.taskId || candidate?.task?.id || null;
}

function candidateDisambiguator(candidate, duplicateTitleCount) {
    if (duplicateTitleCount <= 1) return '';
    if (candidate.projectName) return ` · ${candidate.projectName}`;
    if (candidate.projectId) return ` · ${candidate.projectId}`;
    const id = candidateId(candidate);
    if (id) return ` · ${String(id).slice(-6)}`;
    return '';
}

function buildCandidateLabel(candidate, duplicateTitleCount) {
    const title = candidate?.title || '(untitled)';
    const disambiguator = candidateDisambiguator(candidate, duplicateTitleCount);
    if (!disambiguator) return truncateCandidateLabel(title);
    const titleBudget = Math.max(8, MAX_CANDIDATE_LABEL - disambiguator.length - 1);
    const trimmedTitle = title.length <= titleBudget ? title : `${title.slice(0, titleBudget)}…`;
    return `${trimmedTitle}${disambiguator}`;
}

/**
 * Builds an inline keyboard for selecting mutation candidates.
 * @param {Array<Object>} candidates - List of task candidates
 * @param {Object} [options]
 * @param {string|null} [options.intentSummary=null] - Optional summary of the user intent
 * @param {boolean} [options.includeCancel=true] - Whether to include a cancel button
 * @returns {InlineKeyboard}
 */
export function buildMutationCandidateKeyboard(candidates, { intentSummary = null, includeCancel = true } = {}) {
    const keyboard = new InlineKeyboard();
    const titleCounts = new Map();
    candidates.forEach((candidate) => {
        const key = String(candidate?.title || '').trim().toLowerCase();
        titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
    });
    candidates.slice(0, 6).forEach((candidate, idx) => {
        const id = candidateId(candidate);
        if (!id) return;
        const key = String(candidate?.title || '').trim().toLowerCase();
        const label = buildCandidateLabel(candidate, titleCounts.get(key) || 0);
        const callbackData = `mut:pick:${id}`;
        if (idx % 1 === 0) keyboard.text(label, callbackData).row();
    });
    if (includeCancel) {
        keyboard.text('❌ Cancel', 'mut:cancel').row();
    }
    return keyboard;
}

/**
 * Builds a clarification message for ambiguous task mutations.
 * @param {string} reason - The reason clarification is needed
 * @param {Array<Object>} candidates - The task candidates found
 * @param {string|null} intentSummary - Summary of what the user wants to do
 * @param {Object} [options]
 * @param {string} [options.workStyleMode='standard'] - Current work-style mode
 * @returns {string} Formatted message
 */
export function buildMutationClarificationMessage(reason, candidates, intentSummary, { workStyleMode = 'standard' } = {}) {
    const lines = [];
    const urgentMode = workStyleMode === 'urgent';
    lines.push(urgentMode ? `**Which task?**` : `**Which task did you mean?**`);
    lines.push(urgentMode ? `\nPick below or rephrase.` : `\nTap the right one, or reply with a more specific name.`);
    return lines.join('\n');
}

// ─── Checklist Item Validation (P1 #4) ──────────────────────

/**
 * Validates a single checklist item's structural integrity.
 * Used by both normalizer (post-cleaning) and adapter (pre-API).
 *
 * @param {Object|null} item - Raw or cleaned checklist item
 * @returns {Object|null} Validated item with {title, status, sortOrder} or null if invalid
 */
export function validateChecklistItem(item) {
    if (!item || typeof item !== 'object') return null;

    const rawTitle = item.title;
    if (!rawTitle || typeof rawTitle !== 'string' || rawTitle.trim().length === 0) return null;

    return {
        title: rawTitle.trim(),
        status: typeof item.status === 'number' ? item.status : 0,
        sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : 0,
    };
}



// ─── Undo Entry from RollbackStep ────────────────────────────

/**
 * Builds an undo entry from a pipeline rollbackStep and action.
 * Maps pipeline rollback types (delete_created, restore_updated, recreate_deleted, uncomplete_task)
 * to undo entries that can be persisted via store.addUndoEntry and executed by executeUndoEntry.
 *
 * @param {Object} rollbackStep - Pipeline rollback step from result.results[].rollbackStep
 * @param {Object} action - The normalized action that was executed
 * @returns {Object} Undo entry object with rollbackType, snapshot, batchId-compatible fields
 */
export function buildUndoEntryFromRollbackStep(rollbackStep, action) {
    const entry = {
        taskId: rollbackStep.targetTaskId,
        originalTaskId: rollbackStep.targetTaskId,
        rollbackType: rollbackStep.type,
        originalTitle: action?.title || rollbackStep.targetTaskId || 'Task',
        originalContent: action?.content || '',
        timestamp: new Date().toISOString(),
        targetProjectId: rollbackStep.targetProjectId || null,
    };

    if (rollbackStep.payload?.snapshot) {
        const snap = rollbackStep.payload.snapshot;
        entry.snapshot = snap;
        entry.originalTitle = snap.title || entry.originalTitle || rollbackStep.targetTaskId || 'Task';
        entry.originalContent = snap.content || '';
        entry.originalPriority = snap.priority;
        entry.originalProjectId = snap.projectId;
    }

    return entry;
}

// ─── Freeform Receipt Builder ──────────────────────────────────

/**
 * Builds a transparent receipt from a pipeline result for freeform task mutations.
 * Shows per-action type with title, field diffs for updates, and skipped-action warnings.
 *
 * @param {Object} result - Pipeline result object with results[] and skippedActions[]
 * @param {Object} [options]
 * @param {Array<Object>} [options.projects=[]] - Known TickTick projects for name resolution in diffs
 * @returns {string} Formatted receipt text (Markdown)
 */
export function buildFreeformReceipt(result, { projects = [] } = {}) {
    const lines = [];
    const records = result.results || [];
    const skippedActions = result.skippedActions || [];

    for (const record of records) {
        if (record.status !== 'succeeded') continue;
        const action = record.action;
        const rollbackStep = record.rollbackStep;
        const snapshot = rollbackStep?.payload?.snapshot;

        if (action.type === 'create') {
            lines.push(`✅ **Created:** "${action.title || 'Task'}"`);
            const checklistCount = Array.isArray(action.checklistItems) ? action.checklistItems.length : 0;
            if (checklistCount > 0) {
                lines.push(`  📋 ${checklistCount} item(s)`);
            }
        } else if (action.type === 'update') {
            const oldTitle = snapshot?.title || 'Task';
            const newTitle = action.title;
            if (newTitle && newTitle !== oldTitle) {
                lines.push(`✅ **Updated:** "${oldTitle}" → "${newTitle}"`);
            } else {
                lines.push(`✅ **Updated:** "${oldTitle}"`);
            }
            if (snapshot) {
                const diffs = buildFieldDiff(snapshot, action, { projects });
                const diffText = formatFieldDiff(diffs);
                if (diffText) {
                    lines.push(diffText);
                }
            }
        } else if (action.type === 'complete') {
            lines.push(`✅ **Completed:** "${snapshot?.title || action.title || 'Task'}"`);
        } else if (action.type === 'delete') {
            lines.push(`🗑️ **Deleted:** "${snapshot?.title || action.title || 'Task'}"`);
        }
    }

    if (skippedActions.length > 0) {
        const labels = skippedActions.map(a => a.type).join(', ');
        lines.push(`⚠️ **Skipped:** ${labels} (blocked in this mode)`);
    }

    return lines.join('\n');
}

/**
 * Detects if a freeform message is likely a follow-up referring to a recent task.
 * @param {string} text - The user's message
 * @returns {boolean}
 */
export function isFollowUpMessage(text = '', recentTaskTitle = null) {
    const t = text.trim().toLowerCase();
    const length = t.length;

    if (length >= 60) return false;
    return FOLLOWUP_PRONOUNS.test(t) || FOLLOWUP_TIME_SHIFTS.test(t);
}

/**
 * Retry an async operation with exponential backoff for transient failures.
 * @param {Function} fn - Async function to retry
 * @param {Object} [options]
 * @param {number} [options.maxRetries=2] - Max retry attempts
 * @param {number} [options.baseDelayMs=1000] - Initial delay in ms
 * @param {Function} [options.isRetryable] - Predicate to determine if error is retryable
 * @returns {Promise<*>} Result of fn
 */
export async function retryWithBackoff(fn, { maxRetries = 2, baseDelayMs = 1000, isRetryable = null } = {}) {
    const defaultIsRetryable = (err) => {
        const msg = err?.message || '';
        return msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET') || msg.includes('rate limit') || msg.includes('429') || msg.includes('Too Many Requests');
    };
    const shouldRetry = isRetryable || defaultIsRetryable;

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt === maxRetries || !shouldRetry(err)) {
                throw err;
            }
            const delay = baseDelayMs * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}
