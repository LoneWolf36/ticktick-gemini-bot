// Telegram message formatters — task cards, briefings, digests
// All output is Telegram-flavored Markdown (MarkdownV2 escaped)

// ─── Task Analysis Card ─────────────────────────────────────

export function formatTaskCard(task, analysis) {
    const lines = [];

    lines.push(`🔍 *New Task Detected*\n`);
    lines.push(`📂 *Project:* ${esc(task.projectName || 'Inbox')}`);
    lines.push(`📝 *Original:* ${esc(task.title)}\n`);

    if (analysis.improved_title && analysis.improved_title !== task.title) {
        lines.push(`✨ *Suggested:* ${esc(analysis.improved_title)}\n`);
    }

    lines.push(`${analysis.priority_emoji} *Priority:* ${esc(analysis.priority)}`);

    if (analysis.needle_mover !== undefined) {
        lines.push(`🎯 *Needle\\-mover:* ${analysis.needle_mover ? 'Yes ✅' : 'No — consider if this is worth your time'}`);
    }

    lines.push(`\n📊 *Analysis:* ${esc(analysis.analysis)}`);

    if (analysis.description) {
        lines.push(`\n📝 ${esc(analysis.description)}`);
    }

    if (analysis.sub_steps?.length > 0) {
        lines.push(`\n📋 *Action Steps:*`);
        analysis.sub_steps.forEach((step, i) => {
            lines.push(`  ${i + 1}\\. ${esc(step)}`);
        });
    }

    if (analysis.success_criteria) {
        lines.push(`\n🎯 *Done when:* ${esc(analysis.success_criteria)}`);
    }

    if (analysis.callout) {
        lines.push(`\n💬 *Accountability:* ${esc(analysis.callout)}`);
    }

    return lines.join('\n');
}

// ─── Daily Briefing Wrapper ─────────────────────────────────

export function formatDailyBriefing(briefingText) {
    const header = `🌅 *MORNING BRIEFING*\n${esc(new Date().toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' }))}\n${'─'.repeat(24)}\n`;
    return header + esc(briefingText);
}

// ─── Weekly Digest Wrapper ──────────────────────────────────

export function formatWeeklyDigest(digestText) {
    const header = `📊 *WEEKLY ACCOUNTABILITY REVIEW*\n${'─'.repeat(28)}\n`;
    return header + esc(digestText);
}

// ─── Status Message ─────────────────────────────────────────

export function formatStatus(stats, isAuthenticated) {
    const lines = [
        `🧠 *TickTick AI Accountability Partner*\n`,
        `🔌 *TickTick:* ${isAuthenticated ? '🟢 Connected' : '🔴 Not connected'}`,
        `📊 *Tasks Analyzed:* ${stats.tasksAnalyzed}`,
        `✅ *Approved:* ${stats.tasksApproved}`,
        `⏭ *Skipped:* ${stats.tasksSkipped}`,
    ];

    if (stats.lastDailyBriefing) {
        lines.push(`🌅 *Last Briefing:* ${esc(new Date(stats.lastDailyBriefing).toLocaleString('en-IE'))}`);
    }
    if (stats.lastWeeklyDigest) {
        lines.push(`📊 *Last Digest:* ${esc(new Date(stats.lastWeeklyDigest).toLocaleString('en-IE'))}`);
    }

    lines.push(`\n_Commands: /scan \\| /briefing \\| /weekly \\| /status_`);

    return lines.join('\n');
}

// ─── Escape for Telegram MarkdownV2 ─────────────────────────

function esc(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
