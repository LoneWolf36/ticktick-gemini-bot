// Gemini AI — goal-aware task analyzer and accountability engine
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── User Context (loaded from user_context.js) ─────────────
// Edit user_context.js to personalize the AI for your situation, goals, and style.
// This file stays generic — your personal data lives in user_context.js (gitignored).
import { USER_CONTEXT } from './user_context.js';


// ─── Task Analysis Prompt ───────────────────────────────────
const ANALYZE_PROMPT = `${USER_CONTEXT}

When analyzing a task, evaluate on these dimensions:
1. NEEDLE-MOVER? Does this directly advance his top career goals, or is it admin/busywork/avoidance?
2. SMART? Is it Specific, Measurable, Achievable, Relevant, Time-bound?
3. SCOPED? Is it realistically completable, or likely to become another abandoned effort?
4. PRIORITY: 🔴 Career-critical (DSA, system design, interviews, key projects) | 🟡 Important but secondary (coursework, business) | 🟢 Life admin | ⚪ Consider dropping

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
  "callout": "Direct, honest accountability note (e.g. 'This looks like planning avoidance — when will you actually start coding?')"
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

export class GeminiAnalyzer {
    constructor(apiKey) {
        if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
            throw new Error('❌ Gemini API key not set! Get one from https://aistudio.google.com/apikey');
        }
        const genAI = new GoogleGenerativeAI(apiKey);

        this.analyzeModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: ANALYZE_PROMPT,
            generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                maxOutputTokens: 4096,
            },
            // Disable thinking for task analysis — it's a simple JSON classification
            // Thinking burns tokens and adds latency with no benefit here
            thinkingConfig: { thinkingBudget: 0 },
        });

        this.briefingModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: BRIEFING_PROMPT,
            generationConfig: {
                temperature: 0.8,
                topP: 0.9,
                maxOutputTokens: 4096,
            },
            thinkingConfig: { thinkingBudget: 1024 },
        });

        this.weeklyModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: WEEKLY_PROMPT,
            generationConfig: {
                temperature: 0.8,
                topP: 0.9,
                maxOutputTokens: 8192,
            },
            thinkingConfig: { thinkingBudget: 2048 },
        });
    }

    // ─── Analyze a single task (with retry for rate limits) ────

    async analyzeTask(task) {
        const prompt = this._buildTaskPrompt(task);
        const maxRetries = 3;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.analyzeModel.generateContent(prompt);
                const text = result.response.text().trim();
                return this._parseAnalysis(text, task);
            } catch (err) {
                const isRateLimit = err.status === 429
                    || err.message?.includes('RESOURCE_EXHAUSTED')
                    || err.message?.includes('429');

                if (isRateLimit && attempt < maxRetries) {
                    // Extract retry delay from error if available, else backoff
                    const match = err.message?.match(/retry in ([\d.]+)s/i);
                    const waitSec = match ? Math.ceil(parseFloat(match[1])) + 2 : (10 * Math.pow(2, attempt));
                    console.log(`⏳ Rate limited, waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}...`);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                    continue;
                }
                throw err; // Non-rate-limit error or retries exhausted
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

        const today = new Date().toLocaleDateString('en-IE', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        });

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

    // ─── Helpers ──────────────────────────────────────────────

    _buildTaskPrompt(task) {
        let prompt = `Analyze this task:\nTitle: "${task.title}"`;
        if (task.content) prompt += `\nDescription: "${task.content}"`;
        if (task.dueDate) prompt += `\nDue: ${task.dueDate}`;
        if (task.projectName) prompt += `\nProject: ${task.projectName}`;
        if (task.tags?.length) prompt += `\nTags: ${task.tags.join(', ')}`;
        const pMap = { 0: 'None', 1: 'Low', 3: 'Medium', 5: 'High' };
        if (task.priority !== undefined) prompt += `\nPriority: ${pMap[task.priority] || 'Unknown'}`;
        return prompt;
    }
}
