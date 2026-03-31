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

/**
 * Detects urgent mode toggle intents from user messages.
 * @param {string} userMessage - The user's message text
 * @returns {{type: 'set_urgent_mode', value: boolean}|null} Intent object or null if not detected
 */
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

/**
 * Error thrown when all API keys have been exhausted due to daily quota limits.
 */
export class QuotaExhaustedError extends Error {
    /**
     * @param {string} message - Error message
     */
    constructor(message) {
        super(message);
        this.name = 'QuotaExhaustedError';
    }
}

/**
 * Validates an intent action object at runtime (defense in depth).
 * @param {object} action - The action object to validate
 * @param {number} index - The index of the action in the array
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
function validateIntentAction(action, index) {
    const errors = [];

    if (!action || typeof action !== 'object') {
        errors.push(`Action ${index} is not an object`);
        return { valid: false, errors };
    }

    // Required fields validation
    if (!['create', 'update', 'complete', 'delete'].includes(action.type)) {
        errors.push(`Action ${index}: Invalid type "${action.type}"`);
    }

    if (!action.title || typeof action.title !== 'string' || action.title.trim().length === 0) {
        errors.push(`Action ${index}: Missing or invalid title`);
    }

    if (typeof action.confidence !== 'number' || action.confidence < 0 || action.confidence > 1) {
        errors.push(`Action ${index}: Confidence must be 0-1, got ${action.confidence}`);
    }

    // Optional field validation
    if (action.priority !== undefined && action.priority !== null) {
        if (![0, 1, 3, 5].includes(action.priority)) {
            errors.push(`Action ${index}: Invalid priority ${action.priority}`);
        }
    }

    if (action.splitStrategy !== undefined && action.splitStrategy !== null) {
        if (!['single', 'multi-task', 'multi-day'].includes(action.splitStrategy)) {
            errors.push(`Action ${index}: Invalid splitStrategy "${action.splitStrategy}"`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Detects if an error is a daily quota exceeded error (not transient rate limits).
 * @param {Error|object} error - The error object to check
 * @returns {boolean} True if this is a daily quota error
 */
function isDailyQuotaError(error) {
    if (!error) return false;

    const status = error?.status;
    const isRateLimit =
        status === 429 ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.includes('429');

    if (!isRateLimit) return false;

    const msg = (error.message || '').toLowerCase();
    const errorBody = error?.error?.message?.toLowerCase() || '';

    // Comprehensive daily quota detection
    const dailyQuotaIndicators = [
        'per day',
        'perday',
        'daily quota',
        'daily limit',
        'quota exceeded',
        'quota exhausted',
        'rate limit exceeded',
    ];

    const isDailyQuota = dailyQuotaIndicators.some(
        (indicator) => msg.includes(indicator) || errorBody.includes(indicator)
    );

    // Exclude transient rate limits (per minute, per second)
    const isTransient = msg.includes('per minute') || msg.includes('per second');

    return isDailyQuota && !isTransient;
}

/**
 * Creates an AX intent extraction service with quota-aware key rotation.
 * @param {object} keyManager - Key manager interface for API key rotation
 * @param {Function} keyManager.getActiveKey - Returns the current active API key
 * @param {Function} keyManager.markKeyUnavailable - Marks a key as unavailable due to quota
 * @param {Function} keyManager.rotateKey - Rotates to the next available key
 * @param {Function} [keyManager.getKeyCount] - Returns the total number of keys (optional)
 * @returns {{extractIntents: Function}} Intent extraction service
 * @throws {Error} If keyManager doesn't implement required methods
 */
export function createAxIntent(keyManager) {
    // Validate keyManager interface
    const requiredMethods = ['getActiveKey', 'markKeyUnavailable', 'rotateKey'];
    for (const method of requiredMethods) {
        if (typeof keyManager?.[method] !== 'function') {
            throw new Error(
                `keyManager must implement ${method}(). Provided: ${typeof keyManager?.[method]}`
            );
        }
    }

    const ai = new AxAI({
        name: 'google-gemini',
        apiKey: () => keyManager.getActiveKey(),
        config: { model: 'gemini-2.5-flash' },
    });

    // AX signature-based generation with detailed instructions for structured output
    const gen = new AxGen(`userMessage: string, currentDate: string, availableProjects: string[] -> actions: json`);

    gen.setInstruction(`Extract structured task/intent actions from the user's message.

Instructions:
- Extract one action per distinct user intent.
- Use "multi-task" splitStrategy when multiple independent tasks are detected.
- Use "multi-day" splitStrategy when distinct days are named (not recurrence).
- Set "repeatHint" when the user expresses a repeating pattern (e.g. "daily", "weekdays").
- Keep titles short, verb-first, without dates or project names.
- Set confidence low when intent is ambiguous.
- The output must be a JSON array of action objects.

Each action object MUST have this exact structure:
{
  "type": "create" | "update" | "complete" | "delete",
  "title": "string (clean, verb-led task title)",
  "content": "string or null (additional details)",
  "priority": 0 | 1 | 3 | 5 | null,
  "projectHint": "string or null (project name hint)",
  "dueDate": "string or null (natural language date)",
  "repeatHint": "string or null (recurrence pattern)",
  "splitStrategy": "single" | "multi-task" | "multi-day" | null,
  "confidence": number (0.0 to 1.0)
}

Required fields for every action:
- type: Must be one of "create", "update", "complete", "delete"
- title: Non-empty string describing the task
- confidence: Number between 0.0 and 1.0

Optional fields (use null when not applicable):
- content: Additional task details
- priority: 0 (none), 1 (low), 3 (medium), 5 (high)
- projectHint: Project name for resolution
- dueDate: Natural language date (e.g., "tomorrow", "next Friday")
- repeatHint: Recurrence pattern (e.g., "daily", "every weekday")
- splitStrategy: How to split multiple intents

Example output:
[
  {
    "type": "create",
    "title": "Buy groceries",
    "content": "Milk, eggs, bread",
    "priority": 1,
    "projectHint": null,
    "dueDate": "tomorrow",
    "repeatHint": null,
    "splitStrategy": "single",
    "confidence": 0.95
  }
]`);

    /**
     * Extracts structured intent actions from a user message.
     * @param {string} userMessage - The user's natural language message
     * @param {object} [options] - Extraction options
     * @param {string} [options.currentDate] - Current date for context (e.g., "2026-03-31")
     * @param {string[]} [options.availableProjects] - List of available project names
     * @param {string} [options.requestId] - Optional request ID for logging
     * @returns {Promise<object[]>} Array of validated intent actions
     * @throws {QuotaExhaustedError} When all API keys are exhausted
     * @throws {Error} When AX generation fails or validation fails
     */
    async function extractIntents(userMessage, { currentDate, availableProjects, requestId } = {}) {
        const input = {
            userMessage,
            currentDate,
            availableProjects: Array.isArray(availableProjects) ? availableProjects : [],
        };

        const tryGenerate = async () => {
            const res = await gen.forward(ai, input);
            // AX returns an object matching the output signature.
            // We return res.actions directly to match the Intent Action spec pipeline shape.
            const actions = res.actions || [];

            // Runtime validation (defense in depth)
            const validationErrors = [];
            for (let i = 0; i < actions.length; i++) {
                const validation = validateIntentAction(actions[i], i);
                if (!validation.valid) {
                    validationErrors.push(...validation.errors);
                }
            }

            if (validationErrors.length > 0) {
                throw new Error(`AX output validation failed: ${validationErrors.join('; ')}`);
            }

            return actions;
        };

        const keyCount =
            typeof keyManager.getKeyCount === 'function' ? keyManager.getKeyCount() : 1;
        const maxRotations = Math.max(0, keyCount - 1);
        let rotations = 0;

        while (true) {
            try {
                return await tryGenerate();
            } catch (err) {
                if (isDailyQuotaError(err)) {
                    keyManager.markKeyUnavailable('daily_quota');
                    const rotated =
                        rotations < maxRotations ? await keyManager.rotateKey() : false;

                    if (rotated) {
                        rotations++;
                        const prefix = requestId ? `[AX:${requestId}]` : '[AX]';
                        console.warn(
                            `${prefix} Daily quota hit; rotated key (${rotations}/${maxRotations}).`
                        );
                        continue;
                    }

                    throw new QuotaExhaustedError('All API keys exhausted');
                }
                throw err;
            }
        }
    }

    return {
        extractIntents,
    };
}
