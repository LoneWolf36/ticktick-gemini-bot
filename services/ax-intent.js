import { AxAI, AxGen } from '@ax-llm/ax';

const URGENT_MODE_ON_PATTERNS = [
    /\b(?:turn|switch|set)\s+(?:on|into)\s+urgent mode\b/i,
    /\b(?:enable|activate|start)\s+urgent mode\b/i,
    /\burgent mode\s+(?:on|enabled|active)\b/i,
    /\bgo urgent\b/i,
];

const URGENT_MODE_OFF_PATTERNS = [
    /\b(?:turn|switch|set)\s+(?:off|out of)\s+urgent mode\b/i,
    /\b(?:disable|deactivate|stop)\s+urgent mode\b/i,
    /\burgent mode\s+(?:off|disabled|inactive)\b/i,
    /\b(?:back to|switch to|use)\s+humane mode\b/i,
];

export function detectUrgentModeIntent(userMessage = '') {
    const text = typeof userMessage === 'string' ? userMessage.trim() : '';
    if (!text) return null;

    if (URGENT_MODE_OFF_PATTERNS.some((pattern) => pattern.test(text))) {
        return { type: 'set_urgent_mode', value: false };
    }

    if (URGENT_MODE_ON_PATTERNS.some((pattern) => pattern.test(text))) {
        return { type: 'set_urgent_mode', value: true };
    }

    return null;
}

export class QuotaExhaustedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'QuotaExhaustedError';
    }
}

export function createAxIntent(keyManager) {
    // If keyManager.getActiveKey() is undefined at init, AX might throw,
    // so let's wrap it nicely or use a getter.
    const ai = new AxAI({
        name: 'google-gemini',
        apiKey: () => keyManager.getActiveKey(),
        config: { model: 'gemini-2.5-flash' }
    });

    const intentSignature = `userMessage: string, currentDate: string, availableProjects: string[] -> actions: json`;

    const gen = new AxGen(intentSignature);
    gen.setInstruction(`Extract structured task/intent actions from the user's message.

Instructions:
- Extract one action per distinct user intent.
- Use "multi-task" splitStrategy when multiple independent tasks are detected.
- Use "multi-day" splitStrategy when distinct days are named (not recurrence).
- Set "repeatHint" when the user expresses a repeating pattern (e.g. "daily", "weekdays").
- Keep titles short, verb-first, without dates or project names.
- Set confidence low when intent is ambiguous.
- The 'actions' output must be a valid JSON array containing objects matching this schema:
  {
    type: "create" | "update" | "complete" | "delete",
    title: string,
    content?: string,
    priority?: number (0, 1, 3, or 5),
    projectHint?: string,
    dueDate?: string,
    repeatHint?: string,
    splitStrategy?: "single" | "multi-task" | "multi-day",
    confidence: number (0.0 to 1.0)
  }`);

    async function extractIntents(userMessage, { currentDate, projects }) {
        const input = {
            userMessage,
            currentDate,
            availableProjects: projects
        };

        const tryGenerate = async () => {
            const res = await gen.forward(ai, input);
            // AX returns an object matching the output signature.
            // We return res.actions directly to match the Intent Action spec pipeline shape.
            return res.actions || [];
        };

        try {
            return await tryGenerate();
        } catch (err) {
            if (isDailyQuotaError(err)) {
                keyManager.markKeyUnavailable('quota');
                const rotated = await keyManager.rotateKey();
                if (rotated) {
                    // Retry once with new key
                    return await tryGenerate();
                }
                throw new QuotaExhaustedError('All API keys exhausted');
            }
            throw err;
        }
    }

    return {
        extractIntents
    };
}

function isDailyQuotaError(error) {
    const isRateLimit = error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('429');
    const msg = (error.message || '').toLowerCase();
    const isDailyQuota = msg.includes('perday') || msg.includes('per day');
    return isRateLimit && isDailyQuota;
}
