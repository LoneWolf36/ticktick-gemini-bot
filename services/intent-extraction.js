import { GeminiAnalyzer } from './gemini.js';
import { Type as SchemaType } from '@google/genai';
import { MAX_CHECKLIST_ITEMS, CHECKLIST_ITEM_SHAPE } from './schemas.js';
import { MODE_FOCUS, MODE_STANDARD, MODE_URGENT } from './store.js';

const R1_INTENT_ACTION_FIELDS = Object.freeze([
    'type',
    'title',
    'content',
    'priority',
    'projectHint',
    'dueDate',
    'repeatHint',
    'splitStrategy',
    'confidence',
]);

const URGENT_MODE_ON_PATTERNS = [
    /\b(?:turn|switch|set)\s+(?:on|into)\s+urgent mode\b/i,
    /\b(?:enable|activate|start)\s+urgent mode\b/i,
    /\burgent mode\s+(?:on|enabled|active)\b/i,
    /\bgo urgent\b/i,
    /\b(?:i'?m|i am)\s+in\s+a\s+rush\b/i,
    /\bneed\s+urgent\s+mode\b/i,
];

const URGENT_MODE_OFF_PATTERNS = [
    /\b(?:turn|switch|set)\s+(?:off|out of)\s+urgent mode\b/i,
    /\b(?:disable|deactivate|stop)\s+urgent mode\b/i,
    /\burgent mode\s+(?:off|disabled|inactive)\b/i,
    /\b(?:back to|switch to|use)\s+(?:normal|standard) mode\b/i,
];

const FOCUS_MODE_PATTERNS = [
    /\b(?:turn|switch|set)\s+(?:on|into)\s+focus mode\b/i,
    /\b(?:enable|activate|start)\s+focus mode\b/i,
    /\bfocus mode\s+(?:on|enabled|active)\b/i,
    /\bfocus time\b/i,
    /\btime to focus\b/i,
    /\bdeep work mode\b/i,
];

const STANDARD_MODE_PATTERNS = [
    /\b(?:turn|switch|set)\s+(?:on|into)\s+(?:normal|standard) mode\b/i,
    /\b(?:enable|activate|start)\s+(?:normal|standard) mode\b/i,
    /\b(?:normal|standard) mode\s+(?:on|enabled|active)\b/i,
    /\bback to normal\b/i,
    /\bback to standard\b/i,
];

const MODE_QUERY_PATTERNS = [
    /^what mode am i in\??$/i,
    /^current mode\??$/i,
    /^mode\??$/i,
];

const CAREFUL_PLANNING_PATTERNS = [
    /\blet'?s\s+plan\s+carefully\b/i,
    /\bplan\s+carefully\b/i,
    /\bcarefully\b/i,
    /\bslow\s+down\b/i,
    /\bthink\s+it\s+through\b/i,
    /\bstep\s+by\s+step\b/i,
];

/**
 * Detects work-style mode intents from user messages.
 * @param {string} userMessage - The user's message text
 * @returns {{type: 'set_work_style_mode', mode: string}|{type: 'query_work_style_mode'}|{type: 'clarify_work_style_mode', mode: string, reason: 'mixed_signal'}|null}
 */
export function detectWorkStyleModeIntent(userMessage = '') {
    const text = typeof userMessage === 'string' ? userMessage.trim() : '';
    if (!text) return null;

    const matchesUrgent = URGENT_MODE_ON_PATTERNS.some((pattern) => pattern.test(text));
    const matchesFocus = FOCUS_MODE_PATTERNS.some((pattern) => pattern.test(text));
    const matchesStandard = STANDARD_MODE_PATTERNS.some((pattern) => pattern.test(text));
    const matchesCarefulPlanning = CAREFUL_PLANNING_PATTERNS.some((pattern) => pattern.test(text));

    if (MODE_QUERY_PATTERNS.some((pattern) => pattern.test(text))) {
        return { type: 'query_work_style_mode' };
    }

    if (matchesUrgent && (matchesFocus || matchesStandard || matchesCarefulPlanning)) {
        return {
            type: 'clarify_work_style_mode',
            mode: MODE_STANDARD,
            reason: 'mixed_signal',
        };
    }

    if (URGENT_MODE_OFF_PATTERNS.some((pattern) => pattern.test(text))) {
        return { type: 'set_work_style_mode', mode: MODE_STANDARD };
    }

    if (matchesUrgent) {
        return { type: 'set_work_style_mode', mode: MODE_URGENT };
    }

    if (matchesFocus) {
        return { type: 'set_work_style_mode', mode: MODE_FOCUS };
    }

    if (matchesStandard) {
        return { type: 'set_work_style_mode', mode: MODE_STANDARD };
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
 * Validates and normalizes checklist items from AX intent output.
 * Caps at MAX_CHECKLIST_ITEMS, validates each item has a title,
 * and strips invalid entries.
 * @param {Array} items - Raw checklist items from AX output
 * @returns {{valid: boolean, items: Array, errors: string[], wasCapped: boolean}} Validation result
 */
export function validateChecklistItems(items) {
    if (!Array.isArray(items)) {
        return { valid: false, errors: ['checklistItems must be an array'], wasCapped: false };
    }

    if (items.length === 0) {
        return { valid: true, items: [], errors: [], wasCapped: false };
    }

    const errors = [];
    const validItems = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (!item || typeof item !== 'object') {
            errors.push(`Checklist item ${i} is not an object`);
            continue;
        }

        if (!item.title || typeof item.title !== 'string' || item.title.trim().length === 0) {
            errors.push(`Checklist item ${i} requires a non-empty title`);
            continue;
        }

        if (item.status !== undefined && item.status !== null && !['completed', 'incomplete'].includes(item.status)) {
            errors.push(`Checklist item ${i}: invalid status "${item.status}"`);
            continue;
        }

        validItems.push({
            title: item.title.trim(),
            ...(item.status ? { status: item.status } : {}),
            ...(item.sortOrder !== undefined && item.sortOrder !== null ? { sortOrder: item.sortOrder } : {}),
        });
    }

    const wasCapped = validItems.length > MAX_CHECKLIST_ITEMS;
    const cappedItems = wasCapped ? validItems.slice(0, MAX_CHECKLIST_ITEMS) : validItems;

    if (wasCapped) {
        errors.push(`checklistItems capped at ${MAX_CHECKLIST_ITEMS}; ${validItems.length - MAX_CHECKLIST_ITEMS} items dropped`);
    }

    return {
        valid: cappedItems.length > 0,
        items: cappedItems,
        errors,
        wasCapped,
    };
}

/**
 * Validates an intent action object at runtime (defense in depth).
 * Exported for testing purposes.
 * @param {object} action - The action object to validate
 * @param {number} index - The index of the action in the array
 * @param {object} [options] - Validation options
 * @param {boolean} [options.requireR1Fields] - Whether to require the R1 action field set
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
export function validateIntentAction(action, index, { requireR1Fields = false } = {}) {
    const errors = [];

    if (!action || typeof action !== 'object') {
        errors.push(`Action ${index} is not an object`);
        return { valid: false, errors };
    }

    if (requireR1Fields) {
        for (const field of R1_INTENT_ACTION_FIELDS) {
            if (!Object.hasOwn(action, field)) {
                errors.push(`Action ${index}: Missing required field "${field}"`);
            }
        }
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

    // Checklist items validation (only meaningful for create actions)
    if (action.checklistItems !== undefined && action.checklistItems !== null) {
        if (action.type !== 'create') {
            errors.push(`Action ${index}: checklistItems is only valid for create actions`);
        } else {
            const checklistValidation = validateChecklistItems(action.checklistItems);
            if (!checklistValidation.valid && checklistValidation.items?.length === 0) {
                errors.push(`Action ${index}: checklistItems must contain at least one valid item with a title`);
            }
            // Propagate capping warnings but don't fail validation
            if (checklistValidation.wasCapped) {
                console.warn(`Action ${index}: ${checklistValidation.errors.join('; ')}`);
            }
        }
    }

    // Clarification fields validation
    if (action.clarification !== undefined && action.clarification !== null) {
        if (typeof action.clarification !== 'boolean') {
            errors.push(`Action ${index}: clarification must be a boolean`);
        }
    }

    if (action.clarificationQuestion !== undefined && action.clarificationQuestion !== null) {
        if (typeof action.clarificationQuestion !== 'string') {
            errors.push(`Action ${index}: clarificationQuestion must be a string`);
        }
    }

    // Clarification should have low confidence
    if (action.clarification === true && (action.confidence === undefined || action.confidence > 0.5)) {
        errors.push(`Action ${index}: clarification actions should have confidence <= 0.5`);
    }

    return { valid: errors.length === 0, errors };
}

// ─── Intent Extraction Prompt ─────────────────────────────────────

/**
 * System prompt for Gemini-based intent extraction.
 * This prompt was preserved from the AX framework instruction text.
 */
const INTENT_EXTRACTION_PROMPT = `Extract structured task/intent actions from the user's message.

Instructions:
- Extract one action per distinct user intent.
- Use "multi-task" splitStrategy when multiple independent tasks are detected.
- Use "multi-day" splitStrategy when distinct days are named (not recurrence).
- Set "repeatHint" when the user expresses a repeating pattern (e.g. "daily", "weekdays").
- Keep titles short, verb-first, without dates or project names.
- Set confidence low when intent is ambiguous.
- The output must be a JSON array of action objects.
- For conversational or non-task messages (e.g. "hello", "thanks", "how are you"), return an empty array []. Do not invent a task.

CHECKLIST vs MULTI-TASK DISCRIMINATION:
- When the user describes ONE outcome with multiple sub-steps (e.g., "plan party: buy decorations, send invites, bake cake"), emit a SINGLE "create" action with "checklistItems" array.
- When the user describes INDEPENDENT tasks (e.g., "buy groceries and call mom"), emit SEPARATE "create" actions with splitStrategy "multi-task".
- When it is unclear whether items are sub-steps or independent tasks, emit ONE action with "clarification": true and a short "clarificationQuestion".
- Checklist items should be short (under 80 chars), verb-first, and executable. Cap at 30 items.
- Do NOT turn brainstorm dumps into checklists. If the input looks like raw brainstorming, ask for clarification.

ACTION TYPES AND REQUIRED FIELDS:

Every action object MUST include these R1 fields, using null when a value does not apply:
- "type"
- "title"
- "content"
- "priority"
- "projectHint"
- "dueDate"
- "repeatHint"
- "splitStrategy"
- "confidence"

For type "create":
- "title" is REQUIRED (non-empty string describing the new task)
- "checklistItems" is OPTIONAL (array of {title, status?, sortOrder?} for sub-steps)
- All other fields are optional (null when not applicable)

For type "update", "complete", or "delete" (mutation actions):
- "targetQuery" is REQUIRED (the user's reference to find the existing task, e.g. "buy groceries", "that meeting task")
- "title" is OPTIONAL for mutations — only include it when the user is renaming the task
- For "update": include change fields (title, dueDate, priority, content) as needed
- For "complete"/"delete": targetQuery is sufficient; omit title unless explicitly renaming

For AMBIGUOUS intent (cannot safely determine checklist vs multi-task):
- Emit ONE "create" action with "clarification": true
- Set "clarificationQuestion" to a short, narrow question (under 120 chars)
- Set "confidence" to 0.3 or lower
- Do NOT include checklistItems until the user clarifies

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
  "checklistItems": "array of {title, status?, sortOrder?} or null (sub-steps within one task)",
  "clarification": "boolean or null (true when intent is ambiguous and needs user input)",
  "clarificationQuestion": "string or null (short question to resolve ambiguity)",
  "confidence": number (0.0 to 1.0)
}

Required fields by action type:
- create: requires "title"; targetQuery should be null
- update/complete/delete: requires "targetQuery"; title is optional (only when renaming)
- clarification actions: requires "clarification": true, "clarificationQuestion", confidence <= 0.5
- confidence: always required (0.0 to 1.0)

Mutation field semantics:
- For "update": title = new title (not the lookup key), targetQuery = lookup key
- dueDate, priority, content = the new values the user wants
- For "complete"/"delete": usually only targetQuery is needed

FREE-FORM MUTATION INTENT MAPPING (R9):
- "move buy groceries to tomorrow" => type "update", targetQuery "buy groceries", dueDate "tomorrow"
- "done buy groceries" => type "complete", targetQuery "buy groceries"
- "delete old wifi task" => type "delete", targetQuery "old wifi task"
- "rename netflix task to finish system design notes" => type "update", targetQuery "netflix task", title "finish system design notes"

Checklist item shape:
{ "title": "string (required)", "status": "completed|incomplete (optional)", "sortOrder": "number (optional)" }

Example output for ordinary create:
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
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
    "confidence": 0.95
  }
]

Example output for checklist (one task with sub-steps):
[
  {
    "type": "create",
    "targetQuery": null,
    "title": "Plan birthday party",
    "content": null,
    "priority": 3,
    "projectHint": null,
    "dueDate": "next Saturday",
    "repeatHint": null,
    "splitStrategy": "single",
    "checklistItems": [
      { "title": "Buy decorations" },
      { "title": "Send invitations" },
      { "title": "Bake cake" }
    ],
    "clarification": null,
    "clarificationQuestion": null,
    "confidence": 0.88
  }
]

Example output for multi-task (independent tasks):
[
  {
    "type": "create",
    "targetQuery": null,
    "title": "Buy groceries",
    "content": null,
    "priority": null,
    "projectHint": null,
    "dueDate": null,
    "repeatHint": null,
    "splitStrategy": "multi-task",
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
    "confidence": 0.92
  },
  {
    "type": "create",
    "targetQuery": null,
    "title": "Call mom",
    "content": null,
    "priority": null,
    "projectHint": null,
    "dueDate": null,
    "repeatHint": null,
    "splitStrategy": "multi-task",
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
    "confidence": 0.92
  }
]

Example output for ambiguous intent (needs clarification):
[
  {
    "type": "create",
    "targetQuery": null,
    "title": "Plan project",
    "content": null,
    "priority": null,
    "projectHint": null,
    "dueDate": null,
    "repeatHint": null,
    "splitStrategy": null,
    "checklistItems": null,
    "clarification": true,
    "clarificationQuestion": "Is this one task with steps, or several separate tasks?",
    "confidence": 0.3
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
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
    "confidence": 0.9
  }
]

Example input: "move buy groceries to tomorrow"
Expected output:
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
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
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
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
    "confidence": 0.85
  }
]

Example input: "rename netflix task to finish system design notes"
Expected output:
[
  {
    "type": "update",
    "targetQuery": "netflix task",
    "title": "finish system design notes",
    "content": null,
    "priority": null,
    "projectHint": null,
    "dueDate": null,
    "repeatHint": null,
    "splitStrategy": null,
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
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
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
    "confidence": 0.92
  }
]

Example input: "done buy groceries"
Expected output:
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
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
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
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
    "confidence": 0.88
  }
]

Example input: "delete old wifi task"
Expected output:
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
    "checklistItems": null,
    "clarification": null,
    "clarificationQuestion": null,
    "confidence": 0.88
  }
]

Example output for non-task conversational input:
[]

OUT-OF-SCOPE EXAMPLES (should return low confidence or unsupported):
- Mixed create+mutation: "add buy milk and move groceries to tomorrow" — do not split into create + mutation
- Underspecified pronouns: "move that one to Friday" — should have low confidence (<0.5)
- Reschedule as a separate type: do NOT emit type "reschedule"; use "update" with dueDate instead`;

// ─── Intent Action Response Schema ─────────────────────────────────────

/**
 * Response schema for Gemini intent extraction.
 * Uses Google GenAI schema format.
 */
const intentActionSchema = {
    type: SchemaType.OBJECT,
    properties: {
        actions: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    type: { type: SchemaType.STRING, enum: ['create', 'update', 'complete', 'delete'], description: 'Action type' },
                    targetQuery: { type: SchemaType.STRING, nullable: true, description: 'Target task reference for mutations' },
                    title: { type: SchemaType.STRING, nullable: true, description: 'Short, verb-led task title' },
                    content: { type: SchemaType.STRING, nullable: true, description: 'Additional context or notes' },
                    priority: { type: SchemaType.INTEGER, nullable: true, description: 'Priority: 0 (none), 1 (low), 3 (medium), 5 (high)' },
                    projectHint: { type: SchemaType.STRING, nullable: true, description: 'Project name hint' },
                    dueDate: { type: SchemaType.STRING, nullable: true, description: 'Due date in natural language or ISO format' },
                    repeatHint: { type: SchemaType.STRING, nullable: true, description: 'Recurrence pattern' },
                    splitStrategy: { type: SchemaType.STRING, nullable: true, description: 'How to split: multi-task, multi-day, or null' },
                    confidence: { type: SchemaType.NUMBER, nullable: true, description: 'Confidence score 0.0 to 1.0' },
                    checklistItems: {
                        type: SchemaType.ARRAY,
                        nullable: true,
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                title: { type: SchemaType.STRING, description: 'Checklist item title' },
                                status: { type: SchemaType.STRING, description: 'Item status: completed or incomplete', nullable: true },
                                sortOrder: { type: SchemaType.NUMBER, description: 'Display order', nullable: true },
                            },
                            required: ['title'],
                        },
                    },
                    clarification: { type: SchemaType.BOOLEAN, nullable: true, description: 'True when intent is ambiguous' },
                    clarificationQuestion: { type: SchemaType.STRING, nullable: true, description: 'Question to ask user' },
                },
                required: ['type', 'title', 'content', 'priority', 'projectHint', 'dueDate', 'repeatHint', 'splitStrategy', 'confidence'],
            },
        },
    },
    required: ['actions'],
};

// ─── Intent Extraction via Gemini ─────────────────────────────────────

/**
 * Extracts structured intent actions from a user message using Gemini.
 * @param {GeminiAnalyzer} gemini - GeminiAnalyzer instance
 * @param {string} userMessage - The user's natural language message
 * @param {object} [options] - Extraction options
 * @param {string} [options.currentDate] - Current date for context (e.g., "2026-03-31")
 * @param {string[]} [options.availableProjects] - List of available project names
 * @param {string} [options.requestId] - Optional request ID for logging
 * @returns {Promise<object[]>} Array of validated intent actions
 * @throws {QuotaExhaustedError} When all API keys are exhausted
 * @throws {Error} When generation fails or validation fails
 */
async function extractIntentsWithGemini(gemini, userMessage, { currentDate, availableProjects, requestId } = {}) {
    const projects = Array.isArray(availableProjects) ? availableProjects : [];

    // Build context for the prompt
    let contextSection = '';
    if (currentDate) {
        contextSection += `Current date: ${currentDate}\n`;
    }
    if (projects.length > 0) {
        contextSection += `Available projects: ${projects.join(', ')}\n`;
    }

    const fullPrompt = contextSection
        ? `${contextSection}\nUser message:\n${userMessage}`
        : `User message:\n${userMessage}`;

    const apiCallFn = async (ai, prompt, model) => {
        return ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                systemInstruction: INTENT_EXTRACTION_PROMPT,
                responseMimeType: 'application/json',
                responseSchema: intentActionSchema,
            },
        });
    };

    let response;
    try {
        response = await gemini._executeWithFailover(fullPrompt, apiCallFn, { modelTier: 'fast' });
    } catch (err) {
        const errMsg = err.message || '';
        // _executeWithFailover throws 'QUOTA_EXHAUSTED' or 'API_KEYS_UNAVAILABLE' when all models/keys are exhausted
        if (errMsg === 'QUOTA_EXHAUSTED' || errMsg === 'API_KEYS_UNAVAILABLE') {
            throw new QuotaExhaustedError('All API keys exhausted');
        }
        // Check for daily quota errors that would cause _executeWithFailover to exhaust all models
        const isDailyQuota = errMsg.includes('per day') || errMsg.includes('perday') || errMsg.includes('quota exceeded');
        const isRateLimit = err?.status === 429 || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429');
        if (isDailyQuota || (isRateLimit && errMsg.includes('quota'))) {
            throw new QuotaExhaustedError('All API keys exhausted');
        }
        throw err;
    }

    const raw = response.text.trim();
    // Strip markdown code fences if present (e.g., ```json ... ```)
    const jsonStr = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '').trim();
    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new Error(`Failed to parse Gemini intent response as JSON: ${jsonStr.slice(0, 200)}`);
    }

    const actions = parsed?.actions || [];
    if (!Array.isArray(actions)) {
        throw new Error(`Expected actions array, got ${typeof actions}`);
    }

    // Runtime validation (defense in depth)
    const validationErrors = [];
    for (let i = 0; i < actions.length; i++) {
        const validation = validateIntentAction(actions[i], i, { requireR1Fields: true });
        if (!validation.valid) {
            validationErrors.push(...validation.errors);
        }
    }

    if (validationErrors.length > 0) {
        throw new Error(`Intent validation failed: ${validationErrors.join('; ')}`);
    }

    return actions;
}

/**
 * Creates a Gemini-based intent extraction service.
 * @param {GeminiAnalyzer} gemini - GeminiAnalyzer instance
 * @returns {{extractIntents: Function}} Intent extraction service
 */
export function createIntentExtractor(gemini) {
    // Validate gemini interface - use duck typing for testing flexibility
    if (!gemini || typeof gemini !== 'object') {
        throw new Error(
            `createIntentExtractor requires a GeminiAnalyzer instance. Got: ${typeof gemini}`
        );
    }

    if (typeof gemini._executeWithFailover !== 'function') {
        throw new Error(
            `createIntentExtractor requires a GeminiAnalyzer instance with _executeWithFailover method. Got: ${typeof gemini}`
        );
    }

    return {
        extractIntents: (userMessage, options) => extractIntentsWithGemini(gemini, userMessage, options),
    };
}

/**
 * @deprecated Use createIntentExtractor instead
 */
export function createAxIntent(gemini) {
    return createIntentExtractor(gemini);
}
