// Gemini AI — goal-aware task analyzer and accountability engine
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import path from 'path';
import { userTodayFormatted, PRIORITY_EMOJI } from '../bot/utils.js';
import { analyzeSchema, converseSchema } from './schemas.js';

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

You are evaluating ONE task for strategic value.

Decide clearly:

1. Is this a needle-mover toward:
   - AI/backend internship
   - DSA/system design depth
   - Interview readiness

2. Is it clearly defined and completable in one focused session (≤3 hours)?
   If not, shrink it into one execution chunk.

3. Is this:
   - 🔴 career-critical
   - 🟡 important
   - 🟢 life-admin
   - ⚪ consider-dropping

4. When should this realistically be done?
Do NOT default everything to "today".

CRITICAL DATA PRESERVATION RULE:
If the original task contains URLs, links, or specific reference notes, you MUST repurpose and preserve them. Do not destroy the user's data. Extract them verbatim into the \`resources\` array.

--- FEW-SHOT EXAMPLE NARRATIVE ---
Task: "Do 15 puzzle problem"
Output Mindset: You realize this is a direct needle-mover for interview prep. It needs 2-3 hours of deep work. You title it "Solve 15-Puzzle Problem (A* Search Implementation)". You assign it as career-critical (🔴). You tell the user to break it down and commit to a focused block tomorrow morning without switching tasks.
------------------------
`;

// ─── Daily Briefing Prompt ──────────────────────────────────
const BRIEFING_PROMPT = `${USER_CONTEXT}

Generate today's focused plan.

Rules:
- Maximum 3 tasks.
- First item MUST be career-critical (🔴) if one exists.
- Flag overdue items with ⚠️.
- Do not list everything — choose highest leverage only.
- If too many tasks exist, ignore lower-impact ones.

Structure:
1. One-line focus for the day.
2. 2–3 tasks.
3. One direct callout if avoidance is visible.
4. End with ONE action he can start in 5 minutes.

Output:
Plain text formatted for Telegram. Use **asterisks** for bold emphasis.
Short. Direct. No fluff.
`;

// ─── Weekly Digest Prompt ───────────────────────────────────
const WEEKLY_PROMPT = `${USER_CONTEXT}

Generate a concise weekly accountability review.

Include:

1. WINS (actual completed outputs)
2. AVOIDANCE (what 🔴 work was delayed)
3. NEEDLE-MOVER RATIO: Format specifically as "🔴 Y out of X tasks (Z%)". Use your internal invisible reasoning to do the math flawlessly. Do not output the calculation steps.
4. STALE TASKS (do, rescope, or drop)
5. NEXT WEEK — top 3 only
6. ONE direct callout

Be honest. Short. No fluff.

Output:
Plain text formatted for Telegram. Use **asterisks** for bold emphasis.
`;

// ─── Free-form Conversation Prompt ───────────────────────
const CONVERSE_PROMPT = `${USER_CONTEXT}

Classify the user's message into one of three modes:
A) "action" (Task modifications, creations, deletions, or completion requests)
B) "coach" (Strategic questions, emotional/overwhelm venting, requests for advice)
C) "clarify" (Unclear task references where you must ask a follow-up)

CRITICAL RULES:
1. Extract distinct, actionable steps from the user's message.
2. Keep "title" under 10 words. Move all complex details (URLs, dates, locations) into "content".
3. Avoid redundant repetition inside "content" blocks. Only include details highly relevant to that specific sub-step.
4. Scale priority logically: (1: low, 3: medium, 5: high urgency).

--- TASK DECOMPOSITION EXPECTATIONS ---
Input: Flight FR123 to London departs Friday 6pm. I need to check in online, pack my bag, and book a taxi to the airport.
Logic Mapping:
- Task 1: Check-in for Flight FR123 (Content: Friday 6pm, FR123) [Priority: 5]
- Task 2: Pack bag (Content: London trip) [Priority: 3]
- Task 3: Book airport taxi (Content: Departs 6pm) [Priority: 3]
---------------------------------------
`;

export class GeminiAnalyzer {
    constructor(apiKeys) {
        const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
        this._keys = keys.filter(k => k && k !== 'YOUR_GEMINI_API_KEY_HERE');
        if (this._keys.length === 0) {
            throw new Error('❌ Gemini API key not set! Get one from https://aistudio.google.com/apikey');
        }

        this._activeKeyIndex = 0;
        this._exhaustedUntilByKey = new Array(this._keys.length).fill(null);
        this._rotationPromise = null;

        this._initModelsForActiveKey();
    }

    _initModelsForActiveKey() {
        const genAI = new GoogleGenerativeAI(this._keys[this._activeKeyIndex]);

        this.analyzeModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: ANALYZE_PROMPT,
            generationConfig: {
                temperature: 0.3,
                topP: 0.9,
                maxOutputTokens: 4096,
                responseMimeType: "application/json",
                responseSchema: analyzeSchema,
            },
            thinkingConfig: { thinkingBudget: 1024 },
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
            thinkingConfig: { thinkingBudget: 1024 },
        });

        this.chatModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: CONVERSE_PROMPT,
            generationConfig: {
                temperature: 0.4,
                topP: 0.9,
                maxOutputTokens: 4096,
                responseMimeType: "application/json",
                responseSchema: converseSchema,
            },
        });
    }

    activeKeyInfo() {
        return { index: this._activeKeyIndex + 1, total: this._keys.length };
    }

    /** Milliseconds until midnight Pacific (when Google resets free-tier daily quotas) */
    _getQuotaResetMs() {
        const now = new Date();
        // Google resets at midnight Pacific — build that timestamp
        const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        const midnightPT = new Date(pacific);
        midnightPT.setDate(midnightPT.getDate() + 1);
        midnightPT.setHours(0, 0, 0, 0);
        // Convert back to UTC offset
        const diffMs = midnightPT.getTime() - pacific.getTime();
        return Math.max(diffMs, 30 * 60 * 1000); // At least 30 min (safety floor)
    }

    _isDailyQuotaError(err) {
        const isRateLimit = err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('429');
        const msg = (err.message || '').toLowerCase();
        // Specifically check for 'per day' or 'perday' to avoid catching 'per minute' or generic '(e.g. check quota)' transient limits
        const isDailyQuota = msg.includes('perday') || msg.includes('per day');
        return isRateLimit && isDailyQuota;
    }

    _findNextAvailableKeyIndex() {
        const now = Date.now();
        for (let i = 1; i <= this._keys.length; i++) {
            const idx = (this._activeKeyIndex + i) % this._keys.length;
            const exhaustedUntil = this._exhaustedUntilByKey[idx];
            if (!exhaustedUntil || now > exhaustedUntil) {
                return idx;
            }
        }
        return -1;
    }

    async _rotateToNextKeyIfAvailable() {
        if (this._rotationPromise) {
            await this._rotationPromise;
            const now = Date.now();
            const exhaustedUntil = this._exhaustedUntilByKey[this._activeKeyIndex];
            return !exhaustedUntil || now > exhaustedUntil;
        }

        const rotate = async () => {
            const nextIdx = this._findNextAvailableKeyIndex();
            if (nextIdx !== -1) {
                const oldIdx = this._activeKeyIndex;
                this._activeKeyIndex = nextIdx;
                console.log(`🔄 Rotating Gemini key ${oldIdx + 1}/${this._keys.length} → ${nextIdx + 1}/${this._keys.length} (daily quota)`);
                this._initModelsForActiveKey();
                return true;
            }
            return false;
        };

        this._rotationPromise = rotate();
        try {
            return await this._rotationPromise;
        } finally {
            this._rotationPromise = null;
        }
    }

    /** Returns the Date when quota will reset (null if not exhausted) */
    quotaResumeTime() {
        if (!this.isQuotaExhausted()) return null;
        const nonNulls = this._exhaustedUntilByKey.filter(t => t !== null);
        return nonNulls.length ? new Date(Math.min(...nonNulls)) : null;
    }

    /** Check if we've hit the daily quota wall */
    isQuotaExhausted() {
        const now = Date.now();
        return this._exhaustedUntilByKey.every(t => t !== null && now <= t);
    }

    async _generateWithFailover(getModelFn, prompt, { transientBaseMs = 15 } = {}) {
        if (this.isQuotaExhausted()) {
            throw new Error('QUOTA_EXHAUSTED');
        }

        const maxTransientRetries = 2; // For transient 429s
        let transientAttempts = 0;

        const maxRotations = Math.max(0, this._keys.length - 1);
        let rotations = 0;

        while (true) {
            try {
                const model = getModelFn.call(this);
                const result = await model.generateContent(prompt);

                // Telemetry Interceptor for Architecture Observability
                const usage = result.response.usageMetadata;
                if (usage) {
                    console.log(`📊 [Gemini API] Tokens -> In: ${usage.promptTokenCount} | Out: ${usage.candidatesTokenCount} | Total: ${usage.totalTokenCount}`);
                }

                return result;
            } catch (err) {
                const activeK = this._keys[this._activeKeyIndex];
                const maskedKey = activeK ? `${activeK.slice(0, 4)}...${activeK.slice(-4)}` : 'undefined';
                console.error(`[DIAGNOSTICS] Key ${this._activeKeyIndex + 1}/${this._keys.length} [${maskedKey}] exactly threw: [${err.status}] ${err.message}`);

                if (this._isDailyQuotaError(err)) {
                    // Mark current key as exhausted
                    const resetMs = this._getQuotaResetMs();
                    this._exhaustedUntilByKey[this._activeKeyIndex] = Date.now() + resetMs;

                    if (rotations < maxRotations && await this._rotateToNextKeyIfAvailable()) {
                        rotations++;
                        continue; // Valid retry on new key, transientAttempts remains unchanged
                    } else {
                        if (this.isQuotaExhausted()) {
                            const resumeTime = this.quotaResumeTime();
                            const resumeStr = resumeTime ? resumeTime.toLocaleTimeString('en-US', {
                                timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit'
                            }) : 'unknown';
                            console.error(`🛑 All AI keys exhausted — pausing calls until ~${resumeStr} PT.`);
                        } else {
                            console.error(`⚠️ Daily quota hit across ${rotations + 1} attempted keys in one call. Aborting request to prevent runaway cascade.`);
                        }
                        throw new Error('QUOTA_EXHAUSTED');
                    }
                }

                // Transient Rate Limit handling
                const isRateLimit = err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('429');
                if (isRateLimit && transientAttempts < maxTransientRetries) {
                    let dynamicBackoffMs = transientBaseMs;
                    const match = err.message?.match(/Please retry in ([\d\.]+)s/);
                    if (match && match[1]) {
                        // Google gives us exactly how long to wait. Parse it and add 2s buffer.
                        dynamicBackoffMs = parseFloat(match[1]) * 1000 + 2000;
                    }
                    const backoffMs = dynamicBackoffMs + Math.random() * 5000;
                    console.error(`⏳ Rate limited, waiting ${Math.round(backoffMs / 1000)}s before retry ${transientAttempts + 1}/${maxTransientRetries}...`);
                    await new Promise(r => setTimeout(r, backoffMs));
                    transientAttempts++;
                    continue;
                }

                throw err;
            }
        }
    }

    // ─── Analyze a single task (with smart retry) ───────────────

    async analyzeTask(task, projectList = []) {
        const prompt = this._buildTaskPrompt(task, projectList);
        const result = await this._generateWithFailover(() => this.analyzeModel, prompt, { transientBaseMs: 15 });
        return this._parseAnalysis(result.response.text().trim(), task);
    }

    _parseAnalysis(text, task) {
        try {
            return JSON.parse(text);
        } catch {
            console.warn('⚠ Could not parse Gemini analysis as JSON, raw:', text.slice(0, 300));
            return {
                improved_title: task.title,
                analysis: 'AI analysis received but could not be structured. Review this task manually.',
                description: '',
                sub_steps: [],
                resources: [],
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
                if (t.priority === 5) line += ` ${PRIORITY_EMOJI[5]}`;
                return line;
            })
            .join('\n');

        const today = userTodayFormatted();

        const prompt = `Today is ${today}.\n\nActive tasks (${tasks.length} total):\n${taskList}`;
        const result = await this._generateWithFailover(() => this.briefingModel, prompt, { transientBaseMs: 15 });
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
        const result = await this._generateWithFailover(() => this.weeklyModel, prompt, { transientBaseMs: 15 });
        return result.response.text().trim();
    }

    // ─── Free-form conversation / instruction handling ─────────

    async handleFreeform(message, tasks = [], projects = []) {
        const today = userTodayFormatted();

        // Build concise task context - compressing heavily to avoid token bloat
        const taskList = tasks.slice(0, 50).map(t => `[id:${t.id}] "${t.title}"`).join(' | ');
        const projectList = projects.map(p => `[id:${p.id}] ${p.name}`).join(' | ');

        const prompt = `Today is ${today}.\n\nUser's current tasks (${tasks.length} total):\n${taskList}\n\nAvailable projects:\n${projectList}\n\nUser message: "${message}"`;

        const result = await this._generateWithFailover(() => this.chatModel, prompt, { transientBaseMs: 10 });
        const raw = result.response.text().trim();

        // Try to parse JSON natively since we enforced responseMimeType
        try {
            return JSON.parse(raw);
        } catch {
            // If Gemini failed strict JSON enforcement
            return { mode: 'coach', response: raw };
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
