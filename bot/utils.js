// Shared utilities — card builders, formatters, update builders
// Single source of truth used by commands.js, callbacks.js, and scheduler.js

// ─── Priority Map (Gemini label → TickTick priority number) ─

export const PRIORITY_MAP = {
    'career-critical': 5,   // 🔴 High (red)
    'important': 3,         // 🟡 Medium (yellow)
    'life-admin': 1,        // 🔵 Low (blue)
    'consider-dropping': 0, // None
};

// ─── Schedule bucket → ISO due date ─────────────────────────

export function scheduleToDate(bucket) {
    if (!bucket || bucket === 'someday' || bucket === 'null') return null;

    const now = new Date();
    const endOfDay = (date) => {
        const d = new Date(date);
        d.setHours(23, 59, 0, 0);
        return d.toISOString();
    };

    switch (bucket) {
        case 'today':
            return endOfDay(now);
        case 'tomorrow': {
            const tomorrow = new Date(now);
            tomorrow.setDate(now.getDate() + 1);
            return endOfDay(tomorrow);
        }
        case 'this-week': {
            // Next Friday (or today if it's Friday)
            const friday = new Date(now);
            const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
            friday.setDate(now.getDate() + daysUntilFriday);
            return endOfDay(friday);
        }
        case 'next-week': {
            // Next Monday
            const monday = new Date(now);
            const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
            monday.setDate(now.getDate() + daysUntilMonday);
            return endOfDay(monday);
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
    const update = { projectId: data.projectId }; // current project as base

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
