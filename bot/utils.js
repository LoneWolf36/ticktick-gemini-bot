// Shared utilities — card builders, formatters, data builders
// Single source of truth used by commands.js and scheduler.js

// ─── Task Card (for Telegram display) ───────────────────────

export function buildTaskCard(task, analysis) {
    const lines = [];
    lines.push(`🔍 New Task Detected\n`);
    lines.push(`📂 Project: ${task.projectName || 'Inbox'}`);
    lines.push(`📝 Original: ${task.title}\n`);

    if (analysis.improved_title && analysis.improved_title !== task.title) {
        lines.push(`✨ Suggested: ${analysis.improved_title}\n`);
    }

    lines.push(`${analysis.priority_emoji || '🟡'} Priority: ${analysis.priority}`);

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

export function buildPendingData(task, analysis) {
    return {
        originalTitle: task.title,
        originalContent: task.content || '',
        originalPriority: task.priority,
        improvedTitle: analysis.improved_title,
        improvedContent: buildImprovedContent(analysis),
        suggestedPriority: PRIORITY_MAP[analysis.priority] ?? task.priority,
        projectId: task.projectId,
        projectName: task.projectName,
        // Store raw fields individually for /pending card reconstruction
        analysis: analysis.analysis,
        description: analysis.description,   // RAW description (not formatted)
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
        description: data.description,       // Raw description, not formatted
        priority: data.priority || 'important',
        priority_emoji: data.priorityEmoji || '🟡',
        needle_mover: data.needleMover,
        sub_steps: data.subSteps || [],
        success_criteria: data.successCriteria,
        callout: data.callout,
    };
}

// ─── Constants ──────────────────────────────────────────────

export const PRIORITY_MAP = {
    'career-critical': 5,
    'important': 3,
    'life-admin': 1,
    'consider-dropping': 0,
};

// ─── Helpers ────────────────────────────────────────────────

export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/** Truncate message to stay under Telegram's 4096 char limit */
function truncateMessage(text, limit = 3800) {
    if (text.length <= limit) return text;
    return text.slice(0, limit) + '\n\n... (truncated)';
}
