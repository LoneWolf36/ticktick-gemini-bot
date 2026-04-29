/**
 * services/normalizer.js
 * Transforms raw extracted intent actions into clean, validated, execution-ready normalised actions.
 *
 * Mutation support for task-update normalization:
 * - Mutation actions (update/complete/delete) carry targetQuery from extracted intent and resolved
 *   taskId/originalProjectId from the task resolver.
 * - Mutation actions require resolved task context (taskId) to pass validation.
 * - Content is preserved on updates unless explicit replacement is requested.
 * - Mixed create+mutation or multi-mutation batches are rejected cleanly.
 */

import { VERB_PATTERNS, resolveProjectCategory, inferProjectByAliases } from './project-policy.js';

// Title normalization constants
const DATE_PATTERNS = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+\w+|this\s+\w+)\b/gi;
const PRIORITY_PATTERNS = /^(urgent|important|critical|asap|high priority)[:\s-]*/i;
const BRACKET_PREFIX = /^\[.*?\]\s*/;
const LEADING_ARTICLES = /^(a|an|the)\s+/i;

// Content normalization constants
const DEFAULT_MAX_CONTENT_LENGTH = 4000;

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
 * Normalizes a title to be concise, verb-led, and noise-free.
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
 * @param {string} rawTitle - The raw title from extracted intent
 * @param {number} maxLength - Maximum character limit (default 100)
 * @returns {string} Cleaned, verb-led title
 */
function _normalizeTitle(rawTitle, maxLength = 100, isMutation = false) {
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

    // Ensure verb-led: add "Do" prefix if no verb detected (skip for mutations)
    if (!isMutation && !VERB_PATTERNS.test(title)) {
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
 * and preserving existing content during updates.
 * 
 * Content cleaning steps:
 * 1. Strip motivational/coaching filler phrases
 * 2. Strip analysis noise and priority justifications
 * 3. Preserve URLs, locations, specific instructions, technical details
 * 4. Preserve actionable sub-step lists
 * 5. For updates: merge with existing content if new content adds value
 * 
 * @param {string|null} rawContent - Raw content from extracted intent
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

    // Update existing content preservation logic
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
 * Truncates content to a max length at a word boundary.
 * Adds ellipsis when truncation occurs.
 *
 * @param {string|null} content - Content to truncate
 * @param {number} maxLength - Maximum character length
 * @returns {string|null} Truncated content or null
 */
function _truncateContent(content, maxLength = DEFAULT_MAX_CONTENT_LENGTH) {
    if (!content || typeof content !== 'string') return content;
    if (content.length <= maxLength) return content;

    const truncated = content.substring(0, maxLength);
    const lastWhitespace = truncated.lastIndexOf(' ');
    return (lastWhitespace > 0 ? truncated.substring(0, lastWhitespace) : truncated) + '…';
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

// Checklist normalization constants
const CHECKLIST_ITEM_MAX_LENGTH = 50;
const MAX_CHECKLIST_ITEMS = 30;

/**
 * Cleans a single checklist item title.
 * Trims whitespace, strips filler, truncates at word boundary.
 * @param {string} rawTitle - Raw item title
 * @returns {string|null} Cleaned title or null if empty
 */
function _cleanChecklistItemTitle(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return null;

    let title = rawTitle.trim();
    if (!title) return null;

    // Strip bracket prefixes like "[Step 1] "
    title = title.replace(BRACKET_PREFIX, '');

    // Strip priority markers
    title = title.replace(PRIORITY_PATTERNS, '');

    // Strip filler patterns
    for (const pattern of FILLER_PATTERNS) {
        title = title.replace(pattern, '').trim();
    }

    if (!title) return null;

    // Truncate at word boundary
    if (title.length > CHECKLIST_ITEM_MAX_LENGTH) {
        const truncated = title.substring(0, CHECKLIST_ITEM_MAX_LENGTH);
        const lastSpace = truncated.lastIndexOf(' ');
        title = (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '…';
    }

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    return title || null;
}

/**
 * Normalizes and validates raw extracted checklist items.
 *
 * Accept raw extracted checklistItems, return clean items or empty array.
 * Clean item text — trim, strip filler, drop empty, truncate ~50 chars.
 * Cap at 30 items, log truncation.
 * Assign zero-based sort order when absent.
 * Validate — require non-empty title, default status to 0 (incomplete),
 *        reject nested checklist structures.
 *
 * @param {Array|null} rawItems - Raw checklistItems from extracted intent
 * @returns {Array} Clean, validated checklist items (may be empty)
 */
function _normalizeChecklistItems(rawItems) {
    // Ordinary actions ignore absent field
    if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
        return [];
    }

    const cleanedItems = [];
    let droppedCount = 0;

    for (let i = 0; i < rawItems.length; i++) {
        const raw = rawItems[i];

        // Reject unsupported nested checklist structures
        if (raw && typeof raw === 'object' && raw.items && Array.isArray(raw.items)) {
            console.warn(`[Normalizer] Dropping checklist item ${i}: nested checklists not supported`);
            droppedCount++;
            continue;
        }

        // Require non-empty title
        const cleanedTitle = _cleanChecklistItemTitle(raw?.title ?? raw);

        if (!cleanedTitle) {
            droppedCount++;
            continue;
        }

        // Default status to 0 (incomplete / unchecked)
        const status = 0;

        // Assign zero-based sort order; normalize numeric if present
        let sortOrder = i;
        if (raw && typeof raw === 'object' && raw.sortOrder !== undefined) {
            const parsed = Number(raw.sortOrder);
            if (!Number.isNaN(parsed)) {
                sortOrder = parsed;
            }
        }

        cleanedItems.push({
            title: cleanedTitle,
            status,
            sortOrder,
        });
    }

    // Cap at 30 items
    if (cleanedItems.length > MAX_CHECKLIST_ITEMS) {
        console.warn(`[Normalizer] Checklist truncated: ${cleanedItems.length} -> ${MAX_CHECKLIST_ITEMS} items (${cleanedItems.length - MAX_CHECKLIST_ITEMS} dropped)`);
        cleanedItems.length = MAX_CHECKLIST_ITEMS;
    }

    if (droppedCount > 0) {
        console.warn(`[Normalizer] Checklist normalization dropped ${droppedCount} invalid item(s)`);
    }

    return cleanedItems;
}

/**
 * Converts natural-language recurrence hints to RRULE strings.
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

function _resolveRepeatFlag(intentAction = {}) {
    if (typeof intentAction.repeatHint === 'string' && intentAction.repeatHint.trim()) {
        return _convertRepeatHint(intentAction.repeatHint);
    }

    if (typeof intentAction.repeatFlag === 'string' && intentAction.repeatFlag.trim()) {
        return intentAction.repeatFlag.trim();
    }

    return null;
}

/**
 * Infers a project ID for a task from available projects using project-policy.
 *
 * @param {object} task - Normalized task or candidate
 * @param {object[]} projects - List of available projects
 * @returns {string|null} Project ID or null
 */
function inferProjectIdFromTask(task, projects) {
    if (!Array.isArray(projects) || projects.length === 0) {
        return null;
    }

    const haystack = `${task?.title || ''} ${task?.content || ''}`.trim().toLowerCase();
    if (!haystack) {
        return null;
    }

    // 1. Try exact project name match via resolveProjectCategory
    for (const p of projects) {
        const category = resolveProjectCategory(p.name);
        if (category && haystack.includes(p.name.toLowerCase())) {
            return p.id;
        }
    }

    // 2. Try alias-based inference
    const aliasMatch = inferProjectByAliases(haystack, 1);
    if (aliasMatch) {
        const matched = projects.find(p => p.name.toLowerCase() === aliasMatch.toLowerCase());
        if (matched) {
            return matched.id;
        }
    }

    return null;
}

/**
 * Resolves a project hint string to a concrete TickTick project ID.
 * Expects a list of projects from the TickTick API.
 *
 * Resolution order:
 * 1. projectHint exact match / startsWith / contains (if provided)
 * 2. Content-based inference via inferProjectIdFromTask (if no projectHint)
 * 3. defaultProjectId fallback
 */
function _resolveProject(projectHint, projects = [], defaultProjectId = null, taskTitle = '', taskContent = '') {
    // If projectHint is provided, resolve it as before
    if (projectHint) {
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

    // No projectHint provided — try content-based inference
    if (taskTitle || taskContent) {
        const inferredProjectId = inferProjectIdFromTask(
            { title: taskTitle, content: taskContent },
            projects
        );
        if (inferredProjectId) {
            return inferredProjectId;
        }
    }

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
 * Normalizes content for mutation actions (update/complete/delete).
 *
 * Preserve existing task content on updates unless the new content adds value.
 * Only replaces content when the user explicitly provides new content that
 * adds value beyond the existing description. Otherwise, existing content
 * is preserved verbatim.
 *
 * @param {string|null} newContent - New content from mutation intent
 * @param {string|null} existingContent - Current task content
 * @returns {string|null} Preserved or merged content
 */
function _normalizeContentForMutation(newContent, existingContent) {
    // If no new content is provided, preserve existing content unchanged
    if (!newContent || !newContent.trim()) {
        return existingContent;
    }

    let cleaned = newContent.trim();

    // Strip filler patterns from the new content
    for (const pattern of FILLER_PATTERNS) {
        cleaned = cleaned.replace(pattern, '').trim();
    }

    // Clean up multiple newlines/spaces
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    // If cleaning removed everything, preserve existing
    if (!cleaned) {
        return existingContent;
    }

    // If there's no existing content, return the cleaned new content
    if (!existingContent || !existingContent.trim()) {
        return cleaned || null;
    }

    // Check if new content adds value beyond existing
    const newValueIsUseful = _contentAddsValue(cleaned, existingContent);

    if (!newValueIsUseful) {
        // New content is just noise — preserve existing unchanged
        return existingContent;
    }

    // Avoid duplication: if new content is already a substring of existing
    if (existingContent.toLowerCase().includes(cleaned.toLowerCase())) {
        return existingContent;
    }

    // Append new content below existing, separated by divider
    return `${existingContent}\n---\n${cleaned}`;
}

/**
 * Validates a batch of normalized actions for supported mutation shapes.
 *
 * Reject mixed create+mutation and multi-mutation batches
 * that are out of scope for v1 single-target mutation.
 *
 * @param {Array<object>} actions - Normalized actions to validate
 * @returns {{valid: boolean, reason: string|null}}
 */
export function validateMutationBatch(actions) {
    if (!actions || actions.length === 0) {
        return { valid: false, reason: 'empty_batch' };
    }

    // Single action: always OK (validation happens per-action)
    if (actions.length === 1) {
        return { valid: true, reason: null };
    }

    const types = actions.map(a => a.type);
    const hasCreate = types.includes('create');
    const mutationTypes = ['update', 'complete', 'delete'];
    const hasMutation = types.some(t => mutationTypes.includes(t));

    // Mixed create + mutation: out of scope for v1
    if (hasCreate && hasMutation) {
        return { valid: false, reason: 'mixed_create_and_mutation' };
    }

    // Multiple mutations: out of scope for v1 (single-target only)
    const mutationCount = types.filter(t => mutationTypes.includes(t)).length;
    if (mutationCount > 1) {
        const mutationActions = actions.filter(a => mutationTypes.includes(a.type));

        // Allow if all mutations target the same task (resolved or unresolved)
        const allSameTask = mutationActions.every(a => a.taskId === mutationActions[0].taskId);
        if (allSameTask) {
            return { valid: true, reason: null };
        }

        // Allow small, lightweight mutation batches (<=3 actions)
        const isLightweight = mutationActions.every(a => a.type === 'complete' || a.type === 'delete' || a.type === 'update');
        if (mutationCount <= 3 && isLightweight) {
            return { valid: true, reason: null };
        }

        return { valid: false, reason: 'multiple_mutations' };
    }

    return { valid: true, reason: null };
}

/**
 * Validates a normalized action.
 *
 * Mutation validation:
 * - Mutation actions (update/complete/delete) require a resolved taskId.
 * - Fails closed when taskId is missing.
 * - Confidence threshold still applies.
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

    // Mutation actions require resolved task context — fail closed.
    if (['update', 'complete', 'delete'].includes(action.type) && !action.taskId) {
        errors.push(`Missing taskId for ${action.type}: mutation requires resolved task context`);
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
        // If it's already a 24-char hex ID, that's fine.
        // If it's the default null/fallback, that's fine too.
        // Don't fail on non-hex project hints — the adapter handles gracefully.
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
 *
 * Mutation support:
 * - `options.resolvedTask` carries the resolver's selected task { id, projectId, title }.
 * - `options.existingTaskContent` preserves the original task description on updates.
 * - `targetQuery` is passed through from extracted intent for logging/diagnostics.
 * - Mutation actions without a resolved taskId fail validation (fail-closed).
 */
export function normalizeAction(intentAction, options = {}) {
    const {
        maxTitleLength = 80,
        maxContentLength = DEFAULT_MAX_CONTENT_LENGTH,
        existingTaskContent = null,
        projects = [],
        defaultProjectId = null,
        minConfidence = 0.5,
        resolvedTask = null,        // { id, projectId, title } from task-resolver
    } = options;

    const isMutation = ['update', 'complete', 'delete'].includes(intentAction.type);

    // Normalize priority but keep original for validation
    const originalPriority = intentAction.priority;
    const normalizedPriority = [0, 1, 3, 5].includes(originalPriority) ? originalPriority : null;

    // Resolve taskId from resolver output first, then fall back to direct assignment
    const resolvedTaskId = resolvedTask?.id || intentAction.taskId || options.existingTask?.id || null;
    const resolvedOriginalProjectId = resolvedTask?.projectId ?? options.existingTask?.projectId ?? null;

    // For mutation actions, preserve existing content unless explicitly replacing
    const mutationContent = isMutation && existingTaskContent !== null
        ? _normalizeContentForMutation(intentAction.content, existingTaskContent)
        : _normalizeContent(intentAction.content, existingTaskContent);

    // Attach checklist items to create actions only
    const checklistItems = intentAction.type === 'create' && intentAction.checklistItems !== undefined
        ? _normalizeChecklistItems(intentAction.checklistItems)
        : undefined;

    // Pre-compute title and content for project inference
    const normalizedTitle = isMutation && !intentAction.title
        ? (resolvedTask?.title || _normalizeTitle(intentAction.title, maxTitleLength, isMutation))
        : _normalizeTitle(intentAction.title, maxTitleLength, isMutation);
    const normalizedContent = _truncateContent(mutationContent, maxContentLength);

    const normalized = {
        _index: Number.isInteger(intentAction._index) ? intentAction._index : null,
        type: _resolveActionType(intentAction, options.existingTask),
        confidence: intentAction.confidence !== undefined ? intentAction.confidence : 1.0,
        taskId: resolvedTaskId,
        originalProjectId: resolvedOriginalProjectId,
        targetQuery: isMutation ? (intentAction.targetQuery || null) : null,
        title: normalizedTitle,
        content: normalizedContent,
        mergeContent: (isMutation && existingTaskContent !== null && !normalizedContent) ? false : undefined,
        priority: normalizedPriority,
        originalPriority: originalPriority,  // Keep for validation
        projectId: _resolveProject(intentAction.projectHint, projects, defaultProjectId, normalizedTitle, normalizedContent),
        dueDate: isMutation && intentAction.dueDate == null ? undefined : _expandDueDate(intentAction.dueDate, options),
        repeatFlag: _resolveRepeatFlag(intentAction),
        splitStrategy: intentAction.splitStrategy || 'single',
        valid: true,
        validationErrors: []
    };

    // Only attach checklistItems to create actions
    if (checklistItems !== undefined) {
        normalized.checklistItems = checklistItems;
    }

    return _validateAction(normalized, minConfidence);
}

/**
 * Normalizes multiple intent actions, expanding multi-day tasks.
 *
 * Validates batch shape to reject mixed create+mutation or
 * multi-mutation requests that are out of scope for v1.
 */
export function normalizeActions(intentActions, options = {}) {
    const results = [];

    for (const [intentIndex, intent] of intentActions.entries()) {
        const indexedIntent = {
            ...intent,
            _index: Number.isInteger(intent?._index) ? intent._index : intentIndex,
        };

        const parsedDates = _parseDateList(intent.dueDate);
        const hasMultipleNamedDays = parsedDates.length > 1;
        const hasRecurringHint = typeof intent.repeatHint === 'string' && intent.repeatHint.trim().length > 0;
        const shouldSplitMultiDay = intent.type === 'create'
            && intent.dueDate
            && !hasRecurringHint
            && (intent.splitStrategy === 'multi-day' || hasMultipleNamedDays);

        if (shouldSplitMultiDay) {
            const dates = _parseDateList(intent.dueDate);
            for (const date of dates) {
                const cloned = { ...indexedIntent, dueDate: date, splitStrategy: 'single' };
                results.push(normalizeAction(cloned, options));
            }
        } else {
            results.push(normalizeAction(indexedIntent, options));
        }
    }

    return results;
}

/**
 * Normalizes and validates a batch of intent actions.
 * Returns { actions, batchError } where batchError is set when the
 * batch shape is unsupported (mixed create+mutation, multi-mutation).
 *
 * Single entry point for pipeline to normalize and validate batch shape.
 */
export function normalizeActionBatch(intentActions, options = {}) {
    const actions = normalizeActions(intentActions, options);
    const batchValidation = validateMutationBatch(actions);

    if (!batchValidation.valid) {
        // Mark all actions as invalid with the batch-level reason
        for (const action of actions) {
            action.valid = false;
            action.validationErrors.push(`Batch validation failed: ${batchValidation.reason}`);
        }
        return { actions, batchError: batchValidation.reason };
    }

    return { actions, batchError: null };
}
