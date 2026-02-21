// Gemini AI — goal-aware task analyzer and accountability engine
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import path from 'path';
import { userTodayFormatted } from '../bot/utils.js';

// ─── User Context ────────────────────────────────────────────
// Priority: 1) local user_context.js (gitignored), 2) USER_CONTEXT env var, 3) generic default
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_CONTEXT_FILE = path.join(__dirname, 'user_context.js');

let USER_CONTEXT;
if (existsSync(USER_CONTEXT_FILE)) {
    const mod = await import('./user_context.js');
    USER_CONTEXT = mod.USER_CONTEXT;
} else if (process.env.USER_CONTEXT) {
    USER_CONTEXT = process.env.USER_CONTEXT;
} else {
    USER_CONTEXT = 'You are an AI accountability partner and task analyst. Help the user stay focused, organized, and honest about their priorities.';
    console.warn('⚠️  No user_context.js found and USER_CONTEXT env var not set. Using generic context.');
}



// ─── Task Analysis Prompt ───────────────────────────────────
const ANALYZE_PROMPT = `${USER_CONTEXT}

When analyzing a task, evaluate on these dimensions:
1. NEEDLE-MOVER? Does this directly advance the top career goals, or is it admin/busywork/avoidance?
2. SMART? Is it Specific, Measurable, Achievable, Relevant, Time-bound?
3. SCOPED? Is it realistically completable, or likely to become another abandoned effort?
4. PRIORITY: 🔴 Career-critical (DSA, system design, interviews, key projects) | 🟡 Important but secondary (coursework, business) | 🟢 Life admin | ⚪ Consider dropping
5. PROJECT: Does this task belong in a different project/category? Use the list provided.
6. SCHEDULE: When should this realistically be done? Be honest — don’t schedule everything for “today”.

Respond ONLY in this exact JSON format (no markdown fences):
{
  "improved_title": "Clearer, actionable title (preserve meaning, sharpen clarity)",
  "analysis": "1-2 sentence honest assessment — is this a needle-mover or busywork?",
  "description": "Improved description with context and clear approach",
  "sub_steps": ["Step 1", "Step 2", "Step 3"],
  "priority": "career-critical|important|life-admin|consider-dropping",
  "priority_emoji": "🔴|🟡|🟢|⚪",
  "needle_mover": true,
  "success_criteria": "Concrete definition of done",
  "callout": "Direct, honest accountability note",
  "suggested_project": "Exact project name from the provided list, or null if current project is correct",
  "suggested_schedule": "today|tomorrow|this-week|next-week|someday|null"
}`;

// ─── Daily Briefing Prompt ──────────────────────────────────
const BRIEFING_PROMPT = `${USER_CONTEXT}

You're generating Faizan's morning briefing for today. Given his active tasks below, produce a focused daily plan.

Rules:
- Maximum 3-4 focus items (he performs WORSE with long lists)
- Lead with the item he's most likely to AVOID (DSA, system design, interview prep)
- Flag overdue items with ⚠️
- Add one direct callout if you see avoidance patterns
- Keep it punchy and direct, not corporate-motivational
- End with ONE concrete first action he can start within 5 minutes of reading this

Respond in plain text (NOT JSON), formatted for Telegram with emoji.`;

// ─── Weekly Digest Prompt ───────────────────────────────────
const WEEKLY_PROMPT = `${USER_CONTEXT}

You're generating Faizan's weekly accountability review. Given his tasks (completed and pending), provide an honest assessment.

Cover these (keep it direct and concise):
1. WINS — what was actually accomplished this week
2. AVOIDANCE CHECK — what was repeatedly delayed or ignored (especially DSA/system design)
3. NEEDLE-MOVER SCORE — what % of effort went to career-critical work vs busywork
4. STALE TASKS — anything sitting untouched that should be either done or dropped
5. NEXT WEEK — top 3 priorities (not more)
6. DIRECT CALLOUT — one honest, specific piece of accountability feedback

Respond in plain text formatted for Telegram with emoji. Be honest, not gentle.`;

// ─── Free-form Conversation Prompt ───────────────────────
const CONVERSE_PROMPT = `${USER_CONTEXT}

You are an AI accountability partner with direct access to the user's tasks.
The user is sending you a free-form message. It could be:
- A command: "move all gym tasks to next week", "drop everything in Inbox"
- A question: "what should I focus on right now?"
- A vent: "I'm overwhelmed" or "I keep procrastinating"

Rules:
1. If the message implies CHANGES to tasks, respond in this JSON format:
{
  "mode": "action",
  "actions": [
    { "taskId": "...", "type": "update", "changes": { "title": "...", "priority": 5, "dueDate": "...", "projectId": "..." } },
    { "taskId": "...", "type": "drop" }
  ],
  "summary": "Human-readable summary of what you did"
}

2. If the message is conversational (question, vent, coaching), respond in this format:
{
  "mode": "coach",
  "response": "Your coaching/advice response with emoji, formatted for Telegram"
}

3. If unsure whether the user wants action or advice, default to coaching and ASK.
4. Never execute destructive actions (dropping career-critical tasks) without flagging it.
5. Keep responses punchy and direct — this is Telegram, not an essay.
6. Respond ONLY in JSON (no markdown fences).`;

export class GeminiAnalyzer {
    constructor(apiKey) {
        if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
            throw new Error('❌ Gemini API key not set! Get one from https://aistudio.google.com/apikey');
        }
        const genAI = new GoogleGenerativeAI(apiKey);

        // gemini-2.0-flash for bulk work (1500 RPD free tier)
        // gemini-2.5-flash reserved for chat/reasoning only (20 RPD free tier)
        this.analyzeModel = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            systemInstruction: ANALYZE_PROMPT,
            generationConfig: {
                temperature: 0.3,
                topP: 0.9,
                maxOutputTokens: 4096,
            },
        });

        this.briefingModel = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            systemInstruction: BRIEFING_PROMPT,
            generationConfig: {
                temperature: 0.8,
                topP: 0.9,
                maxOutputTokens: 4096,
            },
        });

        this.weeklyModel = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            systemInstruction: WEEKLY_PROMPT,
            generationConfig: {
                temperature: 0.8,
                topP: 0.9,
                maxOutputTokens: 8192,
            },
        });

        this.chatModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: CONVERSE_PROMPT,
            generationConfig: {
                temperature: 0.8,
                topP: 0.9,
                maxOutputTokens: 4096,
            },
            thinkingConfig: { thinkingBudget: 1024 },
        });

        // Daily quota circuit breaker
        this._quotaExhaustedUntil = null;
    }

    /** Check if we've hit the daily quota wall */
    isQuotaExhausted() {
        if (!this._quotaExhaustedUntil) return false;
        if (Date.now() > this._quotaExhaustedUntil) {
            this._quotaExhaustedUntil = null; // Reset after cooldown
            return false;
        }
        return true;
    }

    // ─── Analyze a single task (with smart retry) ───────────────

    async analyzeTask(task, projectList = []) {
        // Don't even try if we know quota is exhausted
        if (this.isQuotaExhausted()) {
            throw new Error('QUOTA_EXHAUSTED');
        }

        const prompt = this._buildTaskPrompt(task, projectList);
        const maxRetries = 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.analyzeModel.generateContent(prompt);
                const text = result.response.text().trim();
                return this._parseAnalysis(text, task);
            } catch (err) {
                const isRateLimit = err.status === 429
                    || err.message?.includes('RESOURCE_EXHAUSTED')
                    || err.message?.includes('429');

                // Check if daily quota exhausted (not just per-minute rate limit)
                const isDailyQuota = err.message?.includes('PerDay')
                    || err.message?.includes('per day')
                    || err.message?.includes('quota');

                if (isRateLimit && isDailyQuota) {
                    // Daily quota hit — don't retry, circuit-break for 15 min
                    console.error('🛑 Daily quota exhausted — pausing AI calls for 15 min.');
                    this._quotaExhaustedUntil = Date.now() + (15 * 60 * 1000);
                    throw new Error('QUOTA_EXHAUSTED');
                }

                if (isRateLimit && attempt < maxRetries) {
                    // Transient rate limit — retry with backoff
                    const match = err.message?.match(/retry in ([\d.]+)s/i);
                    const waitSec = match ? Math.ceil(parseFloat(match[1])) + 2 : (15 * (attempt + 1));
                    console.log(`⏳ Rate limited, waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}...`);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                    continue;
                }
                throw err;
            }
        }
    }

    _parseAnalysis(text, task) {

        try {
            // Strip markdown fences and any surrounding text
            let cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');

            // Extract JSON object between first { and last } (handles Gemini wrapping in text)
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.slice(firstBrace, lastBrace + 1);
            }

            return JSON.parse(cleaned);
        } catch {
            console.warn('⚠ Could not parse Gemini analysis as JSON, raw:', text.slice(0, 300));
            return {
                improved_title: task.title,
                analysis: 'AI analysis received but could not be structured. Review this task manually.',
                description: '',
                sub_steps: [],
                priority: 'important',
                priority_emoji: '🟡',
                needle_mover: false,
                success_criteria: 'Complete the task as described',
                callout: 'The AI had trouble formatting its response for this one. Give it a look yourself.',
            };
        }
    }

    // ─── Generate daily briefing ──────────────────────────────

    async generateDailyBriefing(tasks) {
        const taskList = tasks
            .map((t, i) => {
                let line = `${i + 1}. "${t.title}" [${t.projectName || 'Inbox'}]`;
                if (t.dueDate) line += ` — due: ${t.dueDate}`;
                if (t.priority === 5) line += ' 🔴';
                return line;
            })
            .join('\n');

        const today = userTodayFormatted();

        const prompt = `Today is ${today}.\n\nActive tasks (${tasks.length} total):\n${taskList}`;
        const result = await this.briefingModel.generateContent(prompt);
        return result.response.text().trim();
    }

    // ─── Generate weekly digest ───────────────────────────────

    async generateWeeklyDigest(allTasks, processedThisWeek) {
        const taskList = allTasks
            .map((t, i) => `${i + 1}. "${t.title}" [${t.projectName || 'Inbox'}]`)
            .join('\n');

        const processed = Object.entries(processedThisWeek)
            .map(([_, d]) => `- "${d.originalTitle}" → ${d.approved ? '✅ Approved' : d.skipped ? '⏭ Skipped' : '⏳ Pending'}`)
            .join('\n');

        const prompt = `Current active tasks (${allTasks.length}):\n${taskList}\n\nTasks analyzed this week:\n${processed || 'None'}`;
        const result = await this.weeklyModel.generateContent(prompt);
        return result.response.text().trim();
    }

    // ─── Free-form conversation / instruction handling ─────────

    async handleFreeform(message, tasks = [], projects = []) {
        const today = userTodayFormatted();

        // Build concise task context
        const taskList = tasks.slice(0, 50).map((t, i) => {
            const pMap = { 5: '🔴', 3: '🟡', 1: '🔵', 0: '⚪' };
            let line = `${i + 1}. [id:${t.id}] "${t.title}" [${t.projectName || 'Inbox'}] ${pMap[t.priority] || ''}`;
            if (t.dueDate) line += ` due:${t.dueDate}`;
            return line;
        }).join('\n');

        const projectList = projects.map(p => `- ${p.name} (id:${p.id})`).join('\n');

        const prompt = `Today is ${today}.\n\nUser's current tasks (${tasks.length} total):\n${taskList}\n\nAvailable projects:\n${projectList}\n\nUser message: "${message}"`;

        const maxRetries = 2;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.chatModel.generateContent(prompt);
                const raw = result.response.text().trim();

                // Try to parse JSON
                const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                try {
                    return JSON.parse(cleaned);
                } catch {
                    // If Gemini didn't return valid JSON, treat as coaching response
                    return { mode: 'coach', response: raw };
                }
            } catch (err) {
                if (err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED')) {
                    if (attempt < maxRetries) {
                        console.log(`  ⏳ Rate limited on chat, retry ${attempt + 1}/${maxRetries}...`);
                        await new Promise(r => setTimeout(r, 10000 * (attempt + 1)));
                        continue;
                    }
                }
                throw err;
            }
        }
    }

    // ─── Helpers ──────────────────────────────────────────────

    _buildTaskPrompt(task, projectList = []) {
        const today = userTodayFormatted();

        let prompt = `Today is ${today}.\n`;
        prompt += `Analyze this task:\nTitle: "${task.title}"`;
        if (task.content) prompt += `\nDescription: "${task.content}"`;
        if (task.dueDate) {
            prompt += `\nExisting due date: ${task.dueDate} (respect this — set suggested_schedule to null if already dated)`;
        }
        if (task.projectName) prompt += `\nCurrent project: ${task.projectName}`;
        if (task.tags?.length) prompt += `\nTags: ${task.tags.join(', ')}`;
        const pMap = { 0: 'None', 1: 'Low', 3: 'Medium', 5: 'High' };
        if (task.priority !== undefined) prompt += `\nCurrent priority: ${pMap[task.priority] || 'Unknown'}`;

        if (projectList.length > 0) {
            prompt += `\n\nAvailable projects (use exact names):\n`;
            prompt += projectList.map(p => `- ${p.name}`).join('\n');
            prompt += `\nSet suggested_project to null if the current project is already correct.`;
        }

        return prompt;
    }
}
