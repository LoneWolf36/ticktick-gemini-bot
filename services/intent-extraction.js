import { GeminiAnalyzer } from './gemini.js';
import { Type as SchemaType } from '@google/genai';
import { MAX_CHECKLIST_ITEMS, CHECKLIST_ITEM_SHAPE } from './schemas.js';
import { MODE_FOCUS, MODE_STANDARD, MODE_URGENT } from './store.js';
import { projectPolicy } from './project-policy.js';

const R1_INTENT_ACTION_FIELDS = Object.freeze([
    'type',
    'title',
    'content',
    'priority',
    'projectHint',
    'dueDate',
    'repeatHint',
    'splitStrategy',
    'confidence'
]);

const URGENT_MODE_ON_PATTERNS = [
    /\b(?:turn|switch|set)\s+(?:on|into)\s+urgent mode\b/i,
    /\b(?:enable|activate|start)\s+urgent mode\b/i,
    /\burgent mode\s+(?:on|enabled|active)\b/i,
    /\bgo urgent\b/i,
    /\b(?:i'?m|i am)\s+in\s+a\s+rush\b/i,
    /\bneed\s+urgent\s+mode\b/i
];

const URGENT_MODE_OFF_PATTERNS = [
    /\b(?:turn|switch|set)\s+(?:off|out of)\s+urgent mode\b/i,
    /\b(?:disable|deactivate|stop)\s+urgent mode\b/i,
    /\burgent mode\s+(?:off|disabled|inactive)\b/i,
    /\b(?:back to|switch to|use)\s+(?:normal|standard) mode\b/i
];

const FOCUS_MODE_PATTERNS = [
    /\b(?:turn|switch|set)\s+(?:on|into)\s+focus mode\b/i,
    /\b(?:enable|activate|start)\s+focus mode\b/i,
    /\bfocus mode\s+(?:on|enabled|active)\b/i,
    /\bfocus time\b/i,
    /\btime to focus\b/i,
    /\bdeep work mode\b/i
];

const STANDARD_MODE_PATTERNS = [
    /\b(?:turn|switch|set)\s+(?:on|into)\s+(?:normal|standard) mode\b/i,
    /\b(?:enable|activate|start)\s+(?:normal|standard) mode\b/i,
    /\b(?:normal|standard) mode\s+(?:on|enabled|active)\b/i,
    /\bback to normal\b/i,
    /\bback to standard\b/i
];

const MODE_QUERY_PATTERNS = [/^what mode am i in\??$/i, /^current mode\??$/i, /^mode\??$/i];

const CAREFUL_PLANNING_PATTERNS = [
    /\blet'?s\s+plan\s+carefully\b/i,
    /\bplan\s+carefully\b/i,
    /\bcarefully\b/i,
    /\bslow\s+down\b/i,
    /\bthink\s+it\s+through\b/i,
    /\bstep\s+by\s+step\b/i
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
            reason: 'mixed_signal'
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
 * Validates and normalizes checklist items from extracted intent output.
 * Caps at MAX_CHECKLIST_ITEMS, validates each item has a title,
 * and strips invalid entries.
 * @param {Array} items - Raw checklist items from extracted output
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
            ...(item.sortOrder !== undefined && item.sortOrder !== null ? { sortOrder: item.sortOrder } : {})
        });
    }

    const wasCapped = validItems.length > MAX_CHECKLIST_ITEMS;
    const cappedItems = wasCapped ? validItems.slice(0, MAX_CHECKLIST_ITEMS) : validItems;

    if (wasCapped) {
        errors.push(
            `checklistItems capped at ${MAX_CHECKLIST_ITEMS}; ${validItems.length - MAX_CHECKLIST_ITEMS} items dropped`
        );
    }

    return {
        valid: cappedItems.length > 0,
        items: cappedItems,
        errors,
        wasCapped
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
export function validateIntentAction(action, index, { requireR1Fields = false, allowEmptyTargetQuery = false } = {}) {
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
        // Mutation actions MUST have targetQuery, unless allowEmptyTargetQuery is true
        if (
            !allowEmptyTargetQuery &&
            (!action.targetQuery || typeof action.targetQuery !== 'string' || action.targetQuery.trim().length === 0)
        ) {
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
    if (action.clarification === true && action.confidence > 0.39) {
        errors.push(`Action ${index}: clarification actions should have confidence <= 0.39`);
    }

    return { valid: errors.length === 0, errors };
}

// ─── Intent Extraction Prompt ─────────────────────────────────────

/**
 * System prompt for Gemini-based intent extraction.
 * This prompt was preserved from the original framework instruction text.
 */
const INTENT_EXTRACTION_PROMPT = `Extract structured task/intent actions from the user's message.
 
 Return ONLY a valid JSON array. No extra text.
 
 --------------------------------
 DECISION ORDER (STRICT)
 --------------------------------
 Follow this sequence:
 1. Detect ambiguity (may trigger clarification)
 2. Determine action type (create/update/complete/delete)
 3. Resolve task structure (single vs checklist vs multi-task vs multi-day)
 4. Populate schema fields
 5. Assign confidence score
 
 If rules conflict, follow this order.
 
 --------------------------------
 CORE RULES
 --------------------------------
 - Extract one action per distinct user intent.
  - If input mixes create + mutation → PRIORITIZE mutation (emit ONE action only). BUT if dropping the create would lose important user intent → return clarification instead.
 - Use "multi-task" splitStrategy when multiple independent tasks are detected.
 - Use "multi-day" splitStrategy when distinct days are named (not recurrence).
 - Set "repeatHint" when the user expresses a repeating pattern (e.g. "daily", "weekdays").
 - Preserve recurrence phrasing as closely as possible without changing meaning.
 - Keep titles short, verb-first, without dates or project names.
 - Set confidence based on guidelines below.
 - Output must be a JSON array of action objects.
 - For conversational/non-task messages → return [].
 
 --------------------------------
 CHECKLIST vs MULTI-TASK DISCRIMINATION
 --------------------------------
 - ONE outcome with sub-steps → SINGLE "create" action with "checklistItems".
 - INDEPENDENT tasks → SEPARATE "create" actions with splitStrategy "multi-task".
 - If unclear:
   - Emit ONE "create" action
   - "clarification": true
   - Provide "clarificationQuestion" (≤120 chars)
   - "confidence" ≤ 0.39
 - Checklist items:
   - Short, verb-first, executable
   - Under 80 chars each
   - Max 30 items
 - Do NOT turn brainstorming dumps into checklists.
 
 --------------------------------
 ACTION TYPES AND REQUIRED FIELDS
 --------------------------------
 
 Every action MUST include ALL fields below (use null when not applicable):
 
 {
   "type": "create" | "update" | "complete" | "delete",
   "targetQuery": "string or null",
   "title": "string or null",
   "content": "string or null",
   "priority": 0 | 1 | 3 | 5 | null,
   "projectHint": "string or null",
   "dueDate": "string or null",
   "repeatHint": "string or null",
   "splitStrategy": "single" | "multi-task" | "multi-day" | null,
   "checklistItems": "array of {title, status?, sortOrder?} or null",
   "clarification": "boolean or null",
   "clarificationQuestion": "string or null",
   "confidence": number (0.0 to 1.0)
 }
 
 If ANY field is missing → output is INVALID.
 
 --------------------------------
 FIELD RULES BY ACTION TYPE
 --------------------------------
 
 For "create":
 - "title" is REQUIRED (non-empty string)
 - "targetQuery" must be null
 - "checklistItems" optional
 
 For "update", "complete", "delete":
 - "targetQuery" is REQUIRED
 - "title" ONLY when renaming
 
 For "update":
 - Fields (title, dueDate, priority, content) = NEW values
 
 For "complete"/"delete":
 - Usually only targetQuery needed
 
 --------------------------------
 FREE-FORM MUTATION INTENT MAPPING
 --------------------------------
 - "move buy groceries to tomorrow" → type "update", dueDate "tomorrow"
 - "done buy groceries" → type "complete"
 - "delete old wifi task" → type "delete"
 - "rename netflix task to finish system design notes" → type "update", title = new name
 
 --------------------------------
 CONFIDENCE GUIDELINES (MANDATORY)
 --------------------------------
 - 0.90–1.00 → explicit, unambiguous intent
 - 0.70–0.89 → minor ambiguity
 - 0.40–0.69 → unclear structure or references
 - ≤0.39 → requires clarification
 
 --------------------------------
 CHECKLIST ITEM SHAPE
 --------------------------------
 { "title": "string (required)", "status": "completed|incomplete (optional)", "sortOrder": "number (optional)" }
 
 --------------------------------
 EXAMPLES
 --------------------------------
 
 Example: ordinary create
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
 
 Example: checklist
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
 
 Example: multi-task
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
 
 Example: ambiguous
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
     "clarificationQuestion": "Is this one task with steps or multiple separate tasks?",
     "confidence": 0.3
   }
 ]
 
 Example: update (due date)
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
 
 Example: rename
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
 
 Example: complete
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
 
 Example: delete
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
 
 Example: non-task
 []
 `;

const COMPACT_INTENT_EXTRACTION_PROMPT = `Extract structured task actions from the user's message.
 
 Return ONLY a JSON array. No extra text.
 
 PRIORITY ORDER:
 1. Ambiguity
 2. Action type
 3. Task structure
 4. Field population
 5. Confidence
 
 CORE RULES:
 - One action per distinct intent
  - If input mixes create + mutation → PRIORITIZE mutation (single action only). BUT if dropping the create would lose important user intent → return clarification instead.
 - multi-task = independent tasks
 - multi-day = same task across different days (not recurrence)
 - Recurrence → repeatHint (preserve phrasing closely)
 - Titles: short, verb-first, no dates/project names
 - Non-task → []
 
 CHECKLIST vs MULTI-TASK:
 - One outcome → checklistItems
 - Independent tasks → split into multiple actions (splitStrategy: "multi-task")
 - Unclear → one create with:
   - clarification: true
   - clarificationQuestion (≤120 chars)
   - confidence ≤ 0.39
 - Do NOT convert brainstorming into checklist
 
 ACTION TYPES:
 create | update | complete | delete
 
 SCHEMA (ALL fields required, use null if not applicable):
 type, targetQuery, title, content, priority, projectHint, dueDate, repeatHint, splitStrategy, checklistItems, clarification, clarificationQuestion, confidence
 
 FIELD RULES:
 - create → title required, targetQuery null
 - update/complete/delete → targetQuery required
 - title only for renaming in mutations
 - update fields = new values
 
 MUTATION MAPPING:
 - "move X to tomorrow" → update + dueDate
 - "done X" → complete
 - "delete X" → delete
 - "rename X to Y" → update + title
 
 CONFIDENCE:
 0.90–1.00 clear
 0.70–0.89 minor ambiguity
 0.40–0.69 unclear
 ≤0.39 needs clarification`;

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
                    type: {
                        type: SchemaType.STRING,
                        enum: ['create', 'update', 'complete', 'delete'],
                        description: 'Action type'
                    },
                    targetQuery: {
                        type: SchemaType.STRING,
                        nullable: true,
                        description: 'Target task reference for mutations'
                    },
                    title: { type: SchemaType.STRING, nullable: true, description: 'Short, verb-led task title' },
                    content: { type: SchemaType.STRING, nullable: true, description: 'Additional context or notes' },
                    priority: {
                        type: SchemaType.INTEGER,
                        nullable: true,
                        description: 'Priority: 0 (none), 1 (low), 3 (medium), 5 (high)'
                    },
                    projectHint: { type: SchemaType.STRING, nullable: true, description: 'Project name hint' },
                    dueDate: {
                        type: SchemaType.STRING,
                        nullable: true,
                        description: 'Due date in natural language or ISO format'
                    },
                    repeatHint: {
                        type: SchemaType.STRING,
                        nullable: true,
                        description: 'Recurrence pattern, preserving bounded duration phrases when present'
                    },
                    splitStrategy: {
                        type: SchemaType.STRING,
                        nullable: true,
                        description: 'How to split: multi-task, multi-day, or null'
                    },
                    confidence: { type: SchemaType.NUMBER, description: 'Confidence score 0.0 to 1.0' },
                    checklistItems: {
                        type: SchemaType.ARRAY,
                        nullable: true,
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                title: { type: SchemaType.STRING, description: 'Checklist item title' },
                                status: {
                                    type: SchemaType.STRING,
                                    description: 'Item status: completed or incomplete',
                                    nullable: true
                                },
                                sortOrder: { type: SchemaType.NUMBER, description: 'Display order', nullable: true }
                            },
                            required: ['title']
                        }
                    },
                    clarification: {
                        type: SchemaType.BOOLEAN,
                        nullable: true,
                        description: 'True when intent is ambiguous'
                    },
                    clarificationQuestion: {
                        type: SchemaType.STRING,
                        nullable: true,
                        description: 'Question to ask user'
                    }
                },
                required: [
                    'type',
                    'targetQuery',
                    'title',
                    'content',
                    'priority',
                    'projectHint',
                    'dueDate',
                    'repeatHint',
                    'splitStrategy',
                    'checklistItems',
                    'clarification',
                    'clarificationQuestion',
                    'confidence'
                ]
            }
        }
    },
    required: ['actions']
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
async function extractIntentsWithGemini(
    gemini,
    userMessage,
    { currentDate, availableProjects, requestId, existingTask } = {}
) {
    const projects = Array.isArray(availableProjects) ? availableProjects : [];

    // Build context for the prompt
    let contextSection = '';
    if (currentDate) {
        contextSection += `Current date: ${currentDate}\n`;
    }
    if (existingTask?.title) {
        contextSection += `Context Task: The user is currently interacting with an existing task titled "${existingTask.title}". If their message implies an update to this task without explicitly naming it, use this exact title as the targetQuery.\n`;
    }
    if (projects.length > 0) {
        contextSection += `Available projects: ${projects.join(', ')}\n`;
    }
    if (projectPolicy?.projects?.length > 0) {
        const aliasLines = projectPolicy.projects
            .filter((p) => p.aliases?.length > 0)
            .map((p) => `- "${p.aliases.join('", "')}" → ${p.match}`);
        if (aliasLines.length > 0) {
            contextSection += `Project aliases (use these to infer the correct project from the user's message):\n${aliasLines.join('\n')}\n`;
        }
    }

    const fullPrompt = contextSection
        ? `${contextSection}\nUser message:\n${userMessage}`
        : `User message:\n${userMessage}`;

    // Large-message guard: progressively truncate instead of refusing outright
    let workingMessage = userMessage;
    let promptCharCount = fullPrompt.length;
    let promptLineCount = fullPrompt.split('\n').length;
    if (promptCharCount > 7000 || promptLineCount > 80) {
        const looksTaskLike =
            /\b(add|create|move|rename|delete|done|complete|schedule|tomorrow|today|next week|call|buy|finish|start|plan|review|send|write|email|meeting)\b/i.test(
                userMessage
            );
        if (looksTaskLike) {
            workingMessage = truncateMessageForExtraction(userMessage, 4000);
            const newPrompt = contextSection
                ? `${contextSection}\nUser message:\n${workingMessage}`
                : `User message:\n${workingMessage}`;
            promptCharCount = newPrompt.length;
            promptLineCount = newPrompt.split('\n').length;
        }
    }
    if (promptCharCount > 7000 || promptLineCount > 80) {
        return [
            {
                type: 'create',
                targetQuery: null,
                title: 'Parse large message',
                content: null,
                priority: null,
                projectHint: null,
                dueDate: null,
                repeatHint: null,
                splitStrategy: null,
                checklistItems: null,
                clarification: true,
                clarificationQuestion: 'Message too long. Please split into smaller parts.',
                confidence: 0.3
            }
        ];
    }

    const finalPrompt = contextSection
        ? `${contextSection}\nUser message:\n${workingMessage}`
        : `User message:\n${workingMessage}`;

    const apiCallFn = async (ai, prompt, model) => {
        return ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                systemInstruction: INTENT_EXTRACTION_PROMPT,
                responseMimeType: 'application/json',
                responseSchema: intentActionSchema
            }
        });
    };

    let response;
    try {
        response = await gemini._executeWithFailover(finalPrompt, apiCallFn, {
            modelTier: 'fast',
            interactiveWritePath: true
        });
    } catch (err) {
        // Preserve typed AI errors from _executeWithFailover so pipeline
        // can surface distinct user messages for quota vs unavailable vs invalid key.
        if (err?.kind === 'hard_quota' || err?.kind === 'service_unavailable' || err?.kind === 'invalid_key') {
            throw err;
        }
        // Legacy string fallback
        const errMsg = err.message || '';
        if (errMsg === 'QUOTA_EXHAUSTED' || errMsg === 'API_KEYS_UNAVAILABLE') {
            throw new QuotaExhaustedError('All API keys exhausted');
        }
        // Check for daily quota errors that would cause _executeWithFailover to exhaust all models
        const isDailyQuota =
            errMsg.includes('per day') || errMsg.includes('perday') || errMsg.includes('quota exceeded');
        const isRateLimit = err?.status === 429 || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429');
        if (isDailyQuota || (isRateLimit && errMsg.includes('quota'))) {
            throw new QuotaExhaustedError('All API keys exhausted');
        }
        throw err;
    }

    const raw = response.text.trim();
    // Strip markdown code fences if present (e.g., ```json ... ```)
    const jsonStr = raw
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?\s*```$/i, '')
        .trim();
    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new Error(`Failed to parse Gemini intent response as JSON: ${jsonStr.slice(0, 200)}`);
    }

    let actions = parsed?.actions || [];
    if (!Array.isArray(actions)) {
        throw new Error(`Expected actions array, got ${typeof actions}`);
    }

    // Retry once with compact prompt for long/complex messages that return empty
    if (actions.length === 0 && (userMessage.length > 1500 || userMessage.split('\n').length > 15)) {
        console.log(
            `[IntentExtraction:${requestId}] Empty intents for long message (${userMessage.length} chars, ${userMessage.split('\n').length} lines). Retrying with compact prompt.`
        );
        const compactApiCallFn = async (ai, prompt, model) => {
            return ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    systemInstruction: COMPACT_INTENT_EXTRACTION_PROMPT,
                    responseMimeType: 'application/json',
                    responseSchema: intentActionSchema
                }
            });
        };
        try {
            const retryResponse = await gemini._executeWithFailover(finalPrompt, compactApiCallFn, {
                modelTier: 'fast',
                interactiveWritePath: true
            });
            const retryRaw = retryResponse.text.trim();
            const retryJsonStr = retryRaw
                .replace(/^```(?:json)?\s*\n?/i, '')
                .replace(/\n?\s*```$/i, '')
                .trim();
            let retryParsed;
            try {
                retryParsed = JSON.parse(retryJsonStr);
            } catch {
                throw new Error(`Failed to parse Gemini retry intent response as JSON: ${retryJsonStr.slice(0, 200)}`);
            }
            actions = retryParsed?.actions || [];
            if (!Array.isArray(actions)) {
                throw new Error(`Expected actions array on retry, got ${typeof actions}`);
            }
        } catch (retryErr) {
            console.warn(`[IntentExtraction:${requestId}] Retry with compact prompt failed: ${retryErr.message}`);
            // Fall through to return empty array
        }
    }

    // Runtime validation (defense in depth)
    const validationErrors = [];
    for (let i = 0; i < actions.length; i++) {
        const validation = validateIntentAction(actions[i], i, {
            requireR1Fields: true,
            allowEmptyTargetQuery: !!existingTask
        });
        if (!validation.valid) {
            validationErrors.push(...validation.errors);
        }
    }

    if (validationErrors.length > 0) {
        console.warn(
            `[IntentExtraction:${requestId}] Intent validation failed, falling back to clarification: ${validationErrors.join('; ')}`
        );
        return [
            {
                type: 'create',
                clarification: true,
                clarificationQuestion: `I wasn't quite sure what you meant or which task to update. Could you clarify?`,
                confidence: 0.3,
                title: 'Ambiguous Request',
                targetQuery: null,
                content: null,
                priority: null,
                projectHint: null,
                dueDate: null,
                repeatHint: null,
                splitStrategy: null
            }
        ];
    }

    return actions;
}

/**
 * Progressively truncates a long user message to fit within a safe prompt limit.
 * Strategy: strip examples, strip verbose filler, keep schema + core rules.
 * @param {string} text - Original user message
 * @param {number} maxChars - Maximum characters to keep
 * @returns {string} Truncated text
 */
function truncateMessageForExtraction(text, maxChars = 4000) {
    if (text.length <= maxChars) return text;

    // Heuristic: messages that look task-like (have verbs, deadlines, or task cues)
    const looksTaskLike =
        /\b(add|create|move|rename|delete|done|complete|schedule|tomorrow|today|next week|call|buy|finish|start|plan|review|send|write|email|meeting)\b/i.test(
            text
        );
    if (!looksTaskLike) return text;

    // Step 1: Remove example blocks (lines starting with "Example:" or fenced blocks)
    let trimmed = text
        .replace(/Example output for [^:]+:\s*\[[\s\S]*?\]/gi, '')
        .replace(/Example input:[^\n]*\nExpected output:\s*\[[\s\S]*?\]/gi, '');

    // Step 2: Remove verbose filler phrases
    trimmed = trimmed
        .replace(/\b(just|really|basically|actually|literally|honestly)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    if (trimmed.length <= maxChars) return trimmed;

    // Step 3: Hard truncate at sentence boundary, preserving the beginning
    const sliceEnd = trimmed.lastIndexOf('. ', maxChars - 3);
    if (sliceEnd > maxChars * 0.5) {
        return trimmed.slice(0, sliceEnd + 1).trim() + '...';
    }

    return trimmed.slice(0, maxChars - 3).trim() + '...';
}

/**
 * Creates a Gemini-based intent extraction service.
 * @param {GeminiAnalyzer} gemini - GeminiAnalyzer instance
 * @returns {{extractIntents: Function}} Intent extraction service
 */
export function createIntentExtractor(gemini) {
    // Validate gemini interface - use duck typing for testing flexibility
    if (!gemini || typeof gemini !== 'object') {
        throw new Error(`createIntentExtractor requires a GeminiAnalyzer instance. Got: ${typeof gemini}`);
    }

    if (typeof gemini._executeWithFailover !== 'function') {
        throw new Error(
            `createIntentExtractor requires a GeminiAnalyzer instance with _executeWithFailover method. Got: ${typeof gemini}`
        );
    }

    return {
        extractIntents: (userMessage, options) => extractIntentsWithGemini(gemini, userMessage, options)
    };
}
