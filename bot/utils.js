// Shared utilities — card builders, formatters, update builders
// Single source of truth used by commands.js, callbacks.js, scheduler.js, and gemini.js

// ─── Priority Map (Gemini label → TickTick priority number) ─

export const PRIORITY_MAP = {
    'career-critical': 5,   // 🔴 High (red)
    'important': 3,         // 🟡 Medium (yellow)
    'life-admin': 1,        // 🔵 Low (blue)
    'consider-dropping': 0, // None
};

// TickTick number → emoji (for task list formatting)
export const PRIORITY_EMOJI = { 5: '🔴', 3: '🟡', 1: '🔵', 0: '⚪' };

// TickTick number → display label (for user-facing messages)
export const PRIORITY_LABEL = {
    5: '🔴 career-critical',
    3: '🟡 important',
    1: '🔵 life-admin',
    0: '⚪ consider-dropping',
};

// ─── Access Control (single source of truth) ────────────────

export const AUTHORIZED_CHAT_ID = process.env.TELEGRAM_CHAT_ID
    ? parseInt(process.env.TELEGRAM_CHAT_ID)
    : null;

export function isAuthorized(ctx) {
    if (!AUTHORIZED_CHAT_ID) return true;
    return ctx.chat?.id === AUTHORIZED_CHAT_ID;
}

export async function guardAccess(ctx) {
    if (!isAuthorized(ctx)) {
        await ctx.reply('🔒 Unauthorized. This bot is private.');
        return false;
    }
    return true;
}

// ─── Undo Entry Builder ─────────────────────────────────────

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

// ─── Timezone Helpers (single source of truth) ──────────────
// ALL date formatting in the entire app must use these helpers.
// Never call new Date().toLocaleDateString() without passing USER_TZ.

export const USER_TZ = process.env.USER_TIMEZONE || 'Europe/Dublin';

/** Get the user's "now" as date components in their timezone */
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

/** Format a Date for display in the user's timezone (e.g. stats) */
export function userLocaleString(date) {
    return new Date(date).toLocaleString('en-IE', { timeZone: USER_TZ });
}

/** Format time only in user's timezone (for logs) */
export function userTimeString() {
    return new Date().toLocaleTimeString('en-IE', { timeZone: USER_TZ });
}

/** Build an ISO date string for TickTick, with correct timezone offset */
function endOfDayISO(year, month, day) {
    // Create a Date at 23:59 on the target day in the user's timezone
    // We use Intl to find the UTC offset, then construct the ISO string
    const targetDate = new Date(year, month, day, 23, 59, 0);
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: USER_TZ,
        timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(targetDate);
    const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
    // offsetStr is like "GMT", "GMT+1", "GMT-5" — convert to "+0000" format
    const match = offsetStr.match(/GMT([+-]?\d+)?/);
    const offsetHours = match?.[1] ? parseInt(match[1]) : 0;
    const sign = offsetHours >= 0 ? '+' : '-';
    const absHours = String(Math.abs(offsetHours)).padStart(2, '0');
    const tzOffset = `${sign}${absHours}00`;

    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}T23:59:00.000${tzOffset}`;
}

/** 
 * Safely parse a YYYY-MM-DD string into a TickTick ISO string with the current user's timezone offset
 * following Postel's Law to shield against messy LLM output. 
 */
export function parseDateStringToTickTickISO(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;

    // Attempt to extract YYYY-MM-DD, ignoring extra text Gemini might have hallucinated
    const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;

    const year = parseInt(match[1]);
    const month = parseInt(match[2]) - 1; // 0-indexed month for Date
    const day = parseInt(match[3]);

    return endOfDayISO(year, month, day);
}


export function scheduleToDate(bucket) {
    if (!bucket || bucket === 'someday' || bucket === 'null') return null;

    const now = userNow();
    // Helper to add days to the user's current date
    const addDays = (n) => {
        const d = new Date(now.year, now.month, now.day + n);
        return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    };

    switch (bucket) {
        case 'today':
            return endOfDayISO(now.year, now.month, now.day);
        case 'tomorrow': {
            const t = addDays(1);
            return endOfDayISO(t.year, t.month, t.day);
        }
        case 'this-week': {
            // Next Friday (or today if it's Friday)
            const daysUntilFriday = (5 - now.dayOfWeek + 7) % 7 || 7;
            const f = addDays(daysUntilFriday);
            return endOfDayISO(f.year, f.month, f.day);
        }
        case 'next-week': {
            // Next Monday
            const daysUntilMonday = (8 - now.dayOfWeek) % 7 || 7;
            const m = addDays(daysUntilMonday);
            return endOfDayISO(m.year, m.month, m.day);
        }
        default:
            return null;
    }
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

// ─── TickTick update object builder ─────────────────────────
// Used by BOTH callbacks.js (manual ✅ Approve) and autoApply().
// Single source of truth for what gets written to TickTick.

export function buildTickTickUpdate(data) {
    const update = {
        projectId: data.projectId,
        originalProjectId: data.projectId // Required for ticktick.js to detect moves
    };

    if (data.improvedTitle) update.title = data.improvedTitle;
    if (data.improvedContent) update.content = data.improvedContent;
    if (data.suggestedPriority !== undefined) update.priority = data.suggestedPriority;

    // Move to a different project if Gemini suggested one
    if (data.suggestedProjectId && data.suggestedProjectId !== data.projectId) {
        update.projectId = data.suggestedProjectId;
    }

    // Apply due date if schedule is set and not vague
    if (data.suggestedSchedule && data.suggestedSchedule !== 'someday' && data.suggestedSchedule !== 'null') {
        const dueDate = scheduleToDate(data.suggestedSchedule);
        if (dueDate) update.dueDate = dueDate;
    }

    return update;
}

// ─── Task Card (for Telegram display) ───────────────────────

export function buildTaskCard(task, analysis) {
    const lines = [];
    lines.push(`🔍 New Task Detected\n`);
    lines.push(`📂 Project: ${task.projectName || 'Inbox'}`);
    lines.push(`📝 Original: ${task.title}\n`);

    if (analysis.improved_title && analysis.improved_title !== task.title) {
        lines.push(`✨ Suggested: ${analysis.improved_title}\n`);
    }

    // Suggested project move
    if (analysis.suggested_project && analysis.suggested_project !== (task.projectName || 'Inbox')) {
        lines.push(`📁 Move to: ${analysis.suggested_project}`);
    }

    lines.push(`${analysis.priority_emoji || '🟡'} Priority: ${analysis.priority}`);

    // Suggested schedule
    const schedLabel = scheduleLabel(analysis.suggested_schedule);
    if (schedLabel) {
        lines.push(`📅 Schedule: ${schedLabel}`);
    }

    if (analysis.needle_mover !== undefined) {
        lines.push(`🎯 Needle-mover: ${analysis.needle_mover ? 'Yes ✅' : 'No — consider if worth your time'}`);
    }

    lines.push(`\n📊 Analysis: ${analysis.analysis}`);

    if (analysis.description) {
        lines.push(`\n📝 ${analysis.description}`);
    }

    if (analysis.sub_steps?.length > 0) {
        lines.push(`\n📋 Action Steps:`);
        analysis.sub_steps.forEach((step, i) => {
            lines.push(`  ${i + 1}. ${step}`);
        });
    }

    if (analysis.success_criteria) {
        lines.push(`\n🎯 Done when: ${analysis.success_criteria}`);
    }

    if (analysis.callout) {
        lines.push(`\n💬 Accountability: ${analysis.callout}`);
    }

    return truncateMessage(lines.join('\n'));
}

// ─── Improved Content (stored in TickTick description) ──────

export function buildImprovedContent(analysis) {
    let content = '';
    if (analysis.analysis) content += `📊 ${analysis.analysis}\n\n`;
    if (analysis.description) content += `📝 ${analysis.description}\n\n`;
    if (analysis.sub_steps?.length > 0) {
        content += `📋 Action Steps:\n`;
        analysis.sub_steps.forEach((s, i) => { content += `${i + 1}. ${s}\n`; });
        content += '\n';
    }
    if (analysis.success_criteria) content += `🎯 Done when: ${analysis.success_criteria}\n\n`;
    if (analysis.callout) content += `💬 ${analysis.callout}\n`;
    return content;
}

// ─── Pending Data (stored in store.json) ────────────────────
// Single source for both commands.js/analyzeAndSend and scheduler.js

export function buildPendingData(task, analysis, projects = []) {
    // Resolve suggested project name → ID
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
        improvedTitle: analysis.improved_title,
        improvedContent: buildImprovedContent(analysis),
        suggestedPriority: PRIORITY_MAP[analysis.priority] ?? task.priority,
        projectId: task.projectId,
        projectName: task.projectName,
        suggestedProject: analysis.suggested_project || null,
        suggestedProjectId,
        suggestedSchedule: analysis.suggested_schedule || null,
        // Raw fields for /pending card reconstruction
        analysis: analysis.analysis,
        description: analysis.description,
        priority: analysis.priority,
        priorityEmoji: analysis.priority_emoji,
        needleMover: analysis.needle_mover,
        subSteps: analysis.sub_steps,
        successCriteria: analysis.success_criteria,
        callout: analysis.callout,
    };
}

// ─── Reconstruct analysis object from stored pending data ───
// Used by /pending to rebuild the card without double-formatting

export function pendingToAnalysis(data) {
    return {
        improved_title: data.improvedTitle,
        analysis: data.analysis,
        description: data.description,
        priority: data.priority || 'important',
        priority_emoji: data.priorityEmoji || '🟡',
        needle_mover: data.needleMover,
        sub_steps: data.subSteps || [],
        success_criteria: data.successCriteria,
        callout: data.callout,
        suggested_project: data.suggestedProject,
        suggested_schedule: data.suggestedSchedule,
    };
}

// ─── Auto-apply notification builder ────────────────────────

export function buildAutoApplyNotification(results) {
    if (results.length === 0) return null;
    const lines = [`⚡ Auto-applied ${results.length} task(s):`];
    for (const r of results) {
        const parts = [];
        if (r.schedule) parts.push(`due ${r.schedule}`);
        if (r.movedTo) parts.push(`moved to ${r.movedTo}`);
        const detail = parts.length > 0 ? ` → ${parts.join(', ')}` : '';
        lines.push(`• "${r.title}"${detail}`);
    }
    lines.push(`\nRun /undo to revert the last one.`);
    return lines.join('\n');
}

// ─── Helpers ────────────────────────────────────────────────

export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/** Truncate message to stay under Telegram's 4096 char limit */
function truncateMessage(text, limit = 3800) {
    if (text.length <= limit) return text;
    return text.slice(0, limit) + '\n\n... (truncated)';
}

// ─── Formatting Helpers ─────────────────────────────────────

export function formatBriefingHeader({ kind }) {
    if (kind === 'daily') {
        return `🌅 MORNING BRIEFING\n${userTodayFormatted()}\n${'─'.repeat(24)}\n\n`;
    }
    if (kind === 'weekly') {
        return `📊 WEEKLY ACCOUNTABILITY REVIEW\n${'─'.repeat(28)}\n\n`;
    }
    return '';
}

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

export function buildQuotaExhaustedMessage(gemini) {
    const resumeTime = gemini.quotaResumeTime();
    if (resumeTime) {
        const resumeStr = resumeTime.toLocaleTimeString('en-US', {
            timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit'
        }) + ' PT';
        return `⚠️ AI quota exhausted. Try again around ${resumeStr}.`;
    }
    return `⚠️ AI quota exhausted. Try again in ~2 hours or after midnight PT.`;
}
