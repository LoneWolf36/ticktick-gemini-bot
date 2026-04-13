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
 * Exported for testing purposes.
 * @param {object} action - The action object to validate
 * @param {number} index - The index of the action in the array
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validateIntentAction(action, index) {
    const errors = [];

    if (!action || typeof action !== 'object') {
        errors.push(`Action ${index} is not an object`);
        return { valid: false, errors };
    }

    // Validate action type
    if (!['create', 'update', 'complete', 'delete'].includes(action.type)) {
        errors.push(`Action ${index}: Invalid type "${action.type}"`);
    }

    // Validate confidence (common across all action types)
    if (typeof action.confidence !== 'number' || action.confidence < 0 || action.confidence > 1) {
        errors.push(`Action ${index}: Confidence must be 0-1, got ${action.confidence}`);
    }

    // Split validation: create requires title, mutations require targetQuery
    const isMutation = ['update', 'complete', 'delete'].includes(action.type);

    if (action.type === 'create') {
        // Create actions MUST have a title
        if (!action.title || typeof action.title !== 'string' || action.title.trim().length === 0) {
            errors.push(`Action ${index}: Create action requires a non-empty title`);
        }
    } else if (isMutation) {
        // Mutation actions MUST have targetQuery
        if (!action.targetQuery || typeof action.targetQuery !== 'string' || action.targetQuery.trim().length === 0) {
            errors.push(`Action ${index}: Mutation action requires a non-empty targetQuery`);
        }
        // Title is optional for mutations (only present when renaming)
        if (action.title !== undefined && action.title !== null) {
            if (typeof action.title !== 'string' || action.title.trim().length === 0) {
                errors.push(`Action ${index}: If title is provided, it must be a non-empty string`);
            }
        }
    }

    // Optional field validation (common across all types)
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

ACTION TYPES AND REQUIRED FIELDS:

For type "create":
- "title" is REQUIRED (non-empty string describing the new task)
- All other fields are optional (null when not applicable)

For type "update", "complete", or "delete" (mutation actions):
- "targetQuery" is REQUIRED (the user's reference to find the existing task, e.g. "buy groceries", "that meeting task")
- "title" is OPTIONAL for mutations — only include it when the user is renaming the task
- For "update": include change fields (title, dueDate, priority, content) as needed
- For "complete"/"delete": targetQuery is sufficient; omit title unless explicitly renaming

Each action object MUST have this exact structure:
{
  "type": "create" | "update" | "complete" | "delete",
  "targetQuery": "string or null (required for mutations, null for create)",
  "title": "string or null (required for create, optional for mutations)",
  "content": "string or null (additional details)",
  "priority": 0 | 1 | 3 | 5 | null,
  "projectHint": "string or null (project name hint)",
  "dueDate": "string or null (natural language date)",
  "repeatHint": "string or null (recurrence pattern)",
  "splitStrategy": "single" | "multi-task" | "multi-day" | null,
  "confidence": number (0.0 to 1.0)
}

Required fields by action type:
- create: requires "title"; targetQuery should be null
- update/complete/delete: requires "targetQuery"; title is optional (only when renaming)
- confidence: always required (0.0 to 1.0)

Mutation field semantics:
- For "update": title = new title (not the lookup key), targetQuery = lookup key
- dueDate, priority, content = the new values the user wants
- For "complete"/"delete": usually only targetQuery is needed

Example output for create:
[
  {
    "type": "create",
    "targetQuery": null,
    "title": "Buy groceries",
    "content": "Milk, eggs, bread",
    "priority": 1,
    "projectHint": null,
    "dueDate": "tomorrow",
    "repeatHint": null,
    "splitStrategy": "single",
    "confidence": 0.95
  }
]

Example output for mutation (update due date):
[
  {
    "type": "update",
    "targetQuery": "buy groceries",
    "title": null,
    "content": null,
    "priority": null,
    "projectHint": null,
    "dueDate": "tomorrow",
    "repeatHint": null,
    "splitStrategy": null,
    "confidence": 0.9
  }
]

Example output for mutation (rename):
[
  {
    "type": "update",
    "targetQuery": "netflix task",
    "title": "Finish system design notes",
    "content": null,
    "priority": null,
    "projectHint": null,
    "dueDate": null,
    "repeatHint": null,
    "splitStrategy": null,
    "confidence": 0.85
  }
]

Example output for mutation (complete):
[
  {
    "type": "complete",
    "targetQuery": "buy groceries",
    "title": null,
    "content": null,
    "priority": null,
    "projectHint": null,
    "dueDate": null,
    "repeatHint": null,
    "splitStrategy": null,
    "confidence": 0.92
  }
]

Example output for mutation (delete):
[
  {
    "type": "delete",
    "targetQuery": "old wifi task",
    "title": null,
    "content": null,
    "priority": null,
    "projectHint": null,
    "dueDate": null,
    "repeatHint": null,
    "splitStrategy": null,
    "confidence": 0.88
  }
]

OUT-OF-SCOPE EXAMPLES (should return low confidence or unsupported):
- Mixed create+mutation: "add buy milk and move groceries to tomorrow" — do not split into create + mutation
- Underspecified pronouns: "move that one to Friday" — should have low confidence (<0.5)
- Reschedule as a separate type: do NOT emit type "reschedule"; use "update" with dueDate instead`);

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
