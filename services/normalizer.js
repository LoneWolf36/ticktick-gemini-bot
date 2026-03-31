/**
 * services/normalizer.js
 * Transforms raw AX intent actions into clean, validated, execution-ready normalised actions.
 */

// Title normalization constants
const DATE_PATTERNS = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+\w+|this\s+\w+)\b/gi;
const PRIORITY_PATTERNS = /^(urgent|important|critical|asap|high priority)[:\s-]*/i;
const BRACKET_PREFIX = /^\[.*?\]\s*/;
const LEADING_ARTICLES = /^(a|an|the)\s+/i;

// Common verbs to detect verb-led titles (not exhaustive, but covers common cases)
const VERB_PATTERNS = /^(add|book|buy|call|cancel|check|clean|complete|create|delete|do|download|draft|email|exercise|fetch|file|finish|fix|get|go|have|join|learn|make|meet|organize|pay|plan|prepare|practice|read|register|remove|reply|review|schedule|send|set|setup|start|study|submit|take|talk|test|update|upload|verify|visit|wait|walk|watch|write)\b/i;

// Content normalization constants
const FILLER_PATTERNS = [
    /you('ve| have) got this!?/gi,
    /stay (focused|motivated|on track)!?/gi,
    /remember (your goals?|that this|to stay|to keep).*$/gim,  // Only strip coaching, not actionable items
    /this (is important|aligns|helps|supports).*$/gim,
    /priority (justification|reasoning|rationale):.*$/gim,
    /consider (breaking|splitting|starting).*$/gim,
];

// RepeatHint mapping constants
const REPEAT_MAPPINGS = {
    'daily': 'RRULE:FREQ=DAILY;INTERVAL=1',
    'weekdays': 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    'weekends': 'RRULE:FREQ=WEEKLY;BYDAY=SA,SU',
    'weekly': 'RRULE:FREQ=WEEKLY;INTERVAL=1',
    'biweekly': 'RRULE:FREQ=WEEKLY;INTERVAL=2',
    'monthly': 'RRULE:FREQ=MONTHLY;INTERVAL=1',
    'yearly': 'RRULE:FREQ=YEARLY;INTERVAL=1',
};

const DAY_MAPPINGS = {
    'monday': 'MO',
    'tuesday': 'TU',
    'wednesday': 'WE',
    'thursday': 'TH',
    'friday': 'FR',
    'saturday': 'SA',
    'sunday': 'SU'
};

const DAY_INDEX = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
};

/**
 * Gets local current date components formatted by the system timezone.
 */
function _coerceDate(value, fallback = new Date()) {
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return fallback instanceof Date ? fallback : new Date();
}

/**
 * Gets local current date components formatted by the system timezone.
 */
function _getNowComponents(timezone = 'Europe/Dublin', currentDate = new Date()) {
    if (typeof currentDate === 'string') {
        const dateOnlyMatch = currentDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnlyMatch) {
            const year = parseInt(dateOnlyMatch[1], 10);
            const month = parseInt(dateOnlyMatch[2], 10) - 1;
            const day = parseInt(dateOnlyMatch[3], 10);
            return {
                year,
                month,
                day,
                dayOfWeek: new Date(year, month, day).getDay()
            };
        }
    }

    const resolvedDate = _coerceDate(currentDate, new Date());
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(resolvedDate);

    const get = (type) => parts.find(p => p.type === type)?.value;
    return {
        year: parseInt(get('year')),
        month: parseInt(get('month')) - 1, // 0-indexed
        day: parseInt(get('day')),
        dayOfWeek: new Date(
            parseInt(get('year')),
            parseInt(get('month')) - 1,
            parseInt(get('day'))
        ).getDay()
    };
}

function _getTimezoneOffsetMinutes(year, month, day, hour, minute, timezone) {
    const utcGuess = new Date(Date.UTC(year, month, day, hour, minute, 0));
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(utcGuess);

    const get = (type) => parseInt(parts.find(p => p.type === type)?.value, 10);
    const localizedAsUtc = Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour'),
        get('minute'),
        get('second')
    );

    return Math.round((localizedAsUtc - utcGuess.getTime()) / 60000);
}

/**
 * Formats a Date object to TickTick ISO format
 */
function _formatISO(date, timezone = 'Europe/Dublin', endOfDay = true) {
    const h = endOfDay ? 23 : 0;
    const m = endOfDay ? 59 : 0;
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const offsetMinutes = _getTimezoneOffsetMinutes(year, month, day, h, m, timezone);
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffsetMinutes = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, '0');
    const offsetRemainderMinutes = String(absOffsetMinutes % 60).padStart(2, '0');
    const tzOffset = `${sign}${offsetHours}${offsetRemainderMinutes}`;

    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const hh = String(h).padStart(2, '0');
    const min = String(m).padStart(2, '0');
    return `${year}-${mm}-${dd}T${hh}:${min}:00.000${tzOffset}`;
}

/**
 * Normalizes a title to be concise, verb-led, and noise-free per FR-006.
 * 
 * Transformations applied in order:
 * 1. Trim whitespace
 * 2. Strip bracket prefixes like "[Work] "
 * 3. Strip priority markers (e.g., "URGENT: ", "Critical - ")
 * 4. Strip date references (e.g., "tomorrow", "next week")
 * 5. Strip leading articles ("A", "An", "The")
 * 6. Ensure verb-led (add "Do" prefix if no verb detected)
 * 7. Capitalize first letter (sentence case)
 * 8. Truncate to maxLength at word boundary with ellipsis
 * 
 * @param {string} rawTitle - The raw title from AX intent
 * @param {number} maxLength - Maximum character limit (default 100)
 * @returns {string} Cleaned, verb-led title
 */
function _normalizeTitle(rawTitle, maxLength = 100) {
    if (!rawTitle) return '';

    let title = rawTitle.trim();

    // Strip bracket prefixes like "[Work] " or "[Personal] "
    title = title.replace(BRACKET_PREFIX, '');

    // Strip priority markers
    title = title.replace(PRIORITY_PATTERNS, '');

    // Strip date references
    title = title.replace(DATE_PATTERNS, '').replace(/\s+/g, ' ').trim();

    // Handle if title becomes empty after stripping
    if (!title) {
        // Return original trimmed and capitalized
        const original = rawTitle.trim();
        return original.charAt(0).toUpperCase() + original.slice(1).toLowerCase();
    }

    // Strip leading articles
    title = title.replace(LEADING_ARTICLES, '');

    // Ensure verb-led: add "Do" prefix if no verb detected
    if (!VERB_PATTERNS.test(title)) {
        title = 'Do ' + title;
    }

    // Capitalize first letter (sentence case) - preserve proper nouns
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // Truncate at word boundary
    if (title.length > maxLength) {
        const truncated = title.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        title = (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '…';
    }

    return title;
}

/**
 * Filters content, keeping only useful references (URLs, locations, instructions)
 * and preserving existing content during updates per FR-007.
 * 
 * Content cleaning steps:
 * 1. Strip motivational/coaching filler phrases
 * 2. Strip analysis noise and priority justifications
 * 3. Preserve URLs, locations, specific instructions, technical details
 * 4. Preserve actionable sub-step lists
 * 5. For updates: merge with existing content if new content adds value
 * 
 * @param {string|null} rawContent - Raw content from AX intent
 * @param {string|null} existingContent - Existing task content (for updates)
 * @returns {string|null} Cleaned content or null if empty
 */
function _normalizeContent(rawContent, existingContent) {
    let newContent = rawContent ? rawContent.trim() : null;

    if (newContent) {
        // Extract and preserve useful elements before stripping filler
        const urls = newContent.match(/https?:\/\/[^\s]+/gi) || [];
        const hasLocation = /\b(at|near|in|on)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/i.test(newContent);
        const hasInstructions = /\b(step|instruction|note|important|remember to|make sure|don't|do not)\b/i.test(newContent);
        
        // Strip filler patterns
        for (const pattern of FILLER_PATTERNS) {
            newContent = newContent.replace(pattern, '').trim();
        }

        // Clean up multiple newlines/spaces
        newContent = newContent.replace(/\n{3,}/g, '\n\n').trim();

        // If content is empty after stripping, check if we extracted useful elements
        if (!newContent && urls.length > 0) {
            // Keep only URLs if everything else was filler
            newContent = urls.join('\n');
        }

        if (!newContent) {
            newContent = null;
        }
    }

    // Update existing content preservation logic (FR-007)
    if (existingContent && existingContent.trim()) {
        if (!newContent || newContent === existingContent.trim()) {
            return existingContent;
        }

        // Check if new content adds value (not just noise)
        const newValueIsUseful = _contentAddsValue(newContent, existingContent);
        
        if (!newValueIsUseful) {
            // New content is just noise, keep existing unchanged
            return existingContent;
        }

        // Basic duplication check (if new content is substring of existing)
        if (existingContent.includes(newContent)) {
            return existingContent;
        }
        
        // Append new content below existing, separated by divider
        return `${existingContent}\n---\n${newContent}`;
    }

    return newContent;
}

/**
 * Determines if new content adds value beyond existing content.
 * Checks for URLs, locations, instructions, or actionable items not already present.
 * 
 * @param {string} newContent - New content to evaluate
 * @param {string} existingContent - Existing content to compare against
 * @returns {boolean} True if new content adds value
 */
function _contentAddsValue(newContent, existingContent) {
    if (!newContent) return false;
    
    const newLower = newContent.toLowerCase();
    const existingLower = existingContent.toLowerCase();
    
    // Extract URLs from new content
    const newUrls = newContent.match(/https?:\/\/[^\s]+/gi) || [];
    const existingUrls = existingContent.match(/https?:\/\/[^\s]+/gi) || [];
    
    // Check if new content has URLs not in existing
    const hasNewUrls = newUrls.some(url => !existingUrls.includes(url));
    
    // Check for location references not in existing
    const locationPattern = /\b(at|near|in|on)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/gi;
    const newLocations = newContent.match(locationPattern) || [];
    const hasNewLocations = newLocations.some(loc => !existingLower.includes(loc.toLowerCase()));
    
    // Check for actionable instructions not in existing (case-insensitive)
    const instructionKeywords = ['step', 'instruction', 'note', 'important', 'remember to', 'make sure', 'call', 'email', 'send', 'submit', 'complete'];
    const hasNewInstructions = instructionKeywords.some(keyword => 
        newLower.includes(keyword) && !existingLower.includes(keyword)
    );
    
    // Check if new content has significant length (more than just a few words)
    const wordCount = newContent.split(/\s+/).length;
    const hasSubstantialContent = wordCount >= 5;
    
    return hasNewUrls || hasNewLocations || hasNewInstructions || hasSubstantialContent;
}

/**
 * Converts natural-language recurrence hints to RRULE strings per FR-008.
 * 
 * Supported patterns:
 * - Simple: "daily", "weekdays", "weekends", "weekly", "biweekly", "monthly", "yearly"
 * - "every <day>": "every monday", "every sunday"
 * - "every <day> and <day>": "every tuesday and thursday"
 * - "weekly on <day>": "weekly on monday", "weekly on friday"
 * - "every other day": RRULE:FREQ=DAILY;INTERVAL=2
 * 
 * @param {string|null} repeatHint - Natural language recurrence hint
 * @returns {string|null} RRULE string or null if unrecognized
 */
function _convertRepeatHint(repeatHint) {
    if (!repeatHint) return null;

    const normalized = repeatHint.toLowerCase().trim();

    // Check explicit mappings (e.g. daily, weekdays)
    if (REPEAT_MAPPINGS[normalized]) {
        return REPEAT_MAPPINGS[normalized];
    }

    // Handle "every weekday" as synonym for "weekdays"
    if (normalized === 'every weekday') {
        return REPEAT_MAPPINGS['weekdays'];
    }

    // Handle "every other day"
    if (normalized === 'every other day') {
        return 'RRULE:FREQ=DAILY;INTERVAL=2';
    }

    // Handle "weekly on <day>" pattern
    const weeklyOnMatch = normalized.match(/^weekly\s+on\s+(\w+)$/);
    if (weeklyOnMatch) {
        const dayName = weeklyOnMatch[1].toLowerCase();
        const dayCode = DAY_MAPPINGS[dayName];
        if (dayCode) {
            return `RRULE:FREQ=WEEKLY;BYDAY=${dayCode}`;
        }
    }

    // Handle "every <day>" patterns
    if (normalized.startsWith('every ')) {
        const remainder = normalized.slice(6).trim();

        if (remainder === 'other day') {
            return 'RRULE:FREQ=DAILY;INTERVAL=2';
        }
        if (remainder === 'weekday') {
            return REPEAT_MAPPINGS['weekdays'];
        }

        // Parse multiple days: "every tuesday and thursday" or "every mon, wed, fri"
        const days = remainder.split(/(?:and|,|&)/).map(d => d.trim());
        const matchedDays = days.map(d => DAY_MAPPINGS[d]).filter(Boolean);

        if (matchedDays.length > 0) {
            return `RRULE:FREQ=WEEKLY;BYDAY=${matchedDays.join(',')}`;
        }
    }

    console.warn(`[Normalizer] Unrecognized repeat hint: "${repeatHint}"`);
    return null;
}

/**
 * Resolves a project hint string to a concrete TickTick project ID.
 * Expects a list of projects from the TickTick API.
 */
function _resolveProject(projectHint, projects = [], defaultProjectId = null) {
    if (!projectHint) return defaultProjectId;

    // If it's already a 24-char hex ID, assume it's resolved
    if (/^[a-fA-F0-9]{24}$/.test(projectHint)) {
        return projectHint;
    }

    const hintLower = projectHint.toLowerCase().trim();

    // Try exact match first
    let match = projects.find(p => p.name.toLowerCase() === hintLower);

    // Try starts-with
    if (!match) {
        match = projects.find(p => p.name.toLowerCase().startsWith(hintLower));
    }

    // Try contains
    if (!match) {
        const matches = projects.filter(p => p.name.toLowerCase().includes(hintLower));
        if (matches.length > 0) {
            // Pick the shortest name to avoid greedy matches on generic terms
            match = matches.reduce((acc, curr) => (curr.name.length < acc.name.length ? curr : acc), matches[0]);
        }
    }

    if (match) {
        return match.id;
    }

    console.warn(`[Normalizer] Unresolved project hint: "${projectHint}". Falling back to default.`);
    return defaultProjectId;
}

/**
 * Expands relative dates to absolute ISO strings.
 * We cheat here and use `bot/utils.js` if we need to, but implementing simple resolution is OK too.
 */
function _expandDueDate(dueDateString, { currentDate = new Date(), timezone = 'Europe/Dublin' } = {}) {
    if (!dueDateString) return null;
    const dateLower = dueDateString.toLowerCase().trim();
    if (dateLower === 'someday') return null;

    // Already ISO format (YYYY-MM-DD...)
    if (/^\d{4}-\d{2}-\d{2}/.test(dateLower)) {
        // Basic pass-through: We're not doing heavy manipulation if the LLM provided an ISO string directly.
        return dateLower;
    }

    const now = _getNowComponents(timezone, currentDate);
    const baseDate = new Date(now.year, now.month, now.day);
    let targetDate = new Date(baseDate);

    const addDays = (n) => {
        targetDate.setDate(targetDate.getDate() + n);
    };

    if (dateLower === 'today') {
        // 0 offset
    } else if (dateLower === 'tomorrow') {
        addDays(1);
    } else if (dateLower === 'this-week') {
        const daysUntilFriday = (5 - now.dayOfWeek + 7) % 7 || 7;
        addDays(daysUntilFriday);
    } else if (dateLower === 'next-week' || dateLower === 'next week') {
        const daysUntilMonday = (8 - now.dayOfWeek) % 7 || 7;
        addDays(daysUntilMonday);
    } else {
        // Handle days of the week: "monday", "this tuesday", "next wednesday"
        let targetDayName = dateLower;
        let isNext = false;

        if (dateLower.startsWith('next ')) {
            isNext = true;
            targetDayName = dateLower.slice(5).trim();
        } else if (dateLower.startsWith('this ')) {
            targetDayName = dateLower.slice(5).trim();
        }

        const targetDayIndex = DAY_INDEX[targetDayName];
        if (targetDayIndex !== undefined) {
            let daysToAdd = (targetDayIndex - now.dayOfWeek + 7) % 7;
            if (daysToAdd === 0) daysToAdd = 7; // e.g. it's Monday, and you say "Monday" -> assume next Monday.
            if (isNext) daysToAdd += 7;
            addDays(daysToAdd);
        } else {
            // Unrecognized
            return null;
        }
    }

    return _formatISO(targetDate, timezone, true);
}

/**
 * Validates a normalized action.
 */
function _validateAction(action, minConfidence = 0.5) {
    const errors = [];

    const validTypes = ['create', 'update', 'complete', 'delete'];
    if (!validTypes.includes(action.type)) {
        errors.push(`Invalid action type: ${action.type}`);
    }

    if (action.type === 'create' && !action.title) {
        errors.push("Empty title after normalization");
    }

    if (['update', 'complete', 'delete'].includes(action.type) && !action.taskId) {
        errors.push(`Missing taskId for ${action.type}`);
    }

    if (action.confidence !== undefined && action.confidence < minConfidence) {
        errors.push(`Confidence ${action.confidence} below threshold ${minConfidence}`);
    }

    // Validate original priority (before normalization)
    if (action.originalPriority !== undefined && action.originalPriority !== null && 
        ![0, 1, 3, 5].includes(action.originalPriority)) {
        errors.push(`Invalid priority: ${action.originalPriority}`);
    }

    if (action.projectId && !/^[a-fA-F0-9]{24}$/.test(action.projectId)) {
        // If it's the default null/fallback, that's fine, but if provided, must be validish ID.
        // Let's not strictly fail it just in case, but standard TickTick IDs are 24 hex. 
    }

    action.valid = errors.length === 0;
    action.validationErrors = errors;

    return action;
}

/**
 * Parses a comma or space separated list of days into an array.
 */
function _parseDateList(dueDateString) {
    if (!dueDateString) return [];
    // Split on commas, "and", or spaces, but be careful with "next monday"
    let string = dueDateString.toLowerCase().replace(/,/g, ' ');
    // Hacky split for common days
    const validDaysMap = {
        'monday': 'monday', 'mon': 'monday',
        'tuesday': 'tuesday', 'tue': 'tuesday',
        'wednesday': 'wednesday', 'wed': 'wednesday',
        'thursday': 'thursday', 'thu': 'thursday',
        'friday': 'friday', 'fri': 'friday',
        'saturday': 'saturday', 'sat': 'saturday',
        'sunday': 'sunday', 'sun': 'sunday'
    };

    const results = new Set();
    const words = string.split(/\s+/);
    for (const word of words) {
        if (validDaysMap[word]) {
            results.add(validDaysMap[word]);
        }
    }
    return results.size ? Array.from(results) : [dueDateString]; // return raw if no clear split
}

/**
 * Resolves the action type, auto-switching to 'update' if an existing task is provided.
 */
function _resolveActionType(intentAction, existingTask) {
    if (existingTask && (intentAction.type === 'create' || !intentAction.type)) {
        return 'update';
    }
    return intentAction.type || 'create';
}

/**
 * Normalizes a single intent action.
 */
export function normalizeAction(intentAction, options = {}) {
    const {
        maxTitleLength = 80,
        existingTaskContent = null,
        projects = [],
        defaultProjectId = null,
        minConfidence = 0.5
    } = options;

    // Normalize priority but keep original for validation
    const originalPriority = intentAction.priority;
    const normalizedPriority = [0, 1, 3, 5].includes(originalPriority) ? originalPriority : null;

    const normalized = {
        type: _resolveActionType(intentAction, options.existingTask),
        confidence: intentAction.confidence !== undefined ? intentAction.confidence : 1.0,
        taskId: intentAction.taskId || options.existingTask?.id || null,
        originalProjectId: options.existingTask?.projectId || null,
        title: _normalizeTitle(intentAction.title, maxTitleLength),
        content: _normalizeContent(intentAction.content, existingTaskContent),
        priority: normalizedPriority,
        originalPriority: originalPriority,  // Keep for validation
        projectId: _resolveProject(intentAction.projectHint, projects, defaultProjectId),
        dueDate: _expandDueDate(intentAction.dueDate, options),
        repeatFlag: _convertRepeatHint(intentAction.repeatHint),
        splitStrategy: intentAction.splitStrategy || 'single',
        valid: true,
        validationErrors: []
    };

    return _validateAction(normalized, minConfidence);
}

/**
 * Normalizes multiple intent actions, expanding multi-day tasks.
 */
export function normalizeActions(intentActions, options = {}) {
    const results = [];

    for (const intent of intentActions) {
        if (intent.splitStrategy === 'multi-day' && intent.dueDate) {
            const dates = _parseDateList(intent.dueDate);
            for (const date of dates) {
                const cloned = { ...intent, dueDate: date, splitStrategy: 'single' };
                results.push(normalizeAction(cloned, options));
            }
        } else {
            results.push(normalizeAction(intent, options));
        }
    }

    return results;
}
