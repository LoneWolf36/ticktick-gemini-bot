import { loadUserContextModule, getModuleExport } from './user-context-loader.js';

let rawProjectPolicy = null;
let rawKeywords = null;
let rawVerbList = null;
let rawScoring = null;

const { mod: ctxModule } = await loadUserContextModule();
if (ctxModule) {
    rawProjectPolicy = getModuleExport(ctxModule, 'PROJECT_POLICY');
    rawKeywords = getModuleExport(ctxModule, 'KEYWORDS');
    rawVerbList = getModuleExport(ctxModule, 'VERB_LIST');
    rawScoring = getModuleExport(ctxModule, 'SCORING');
}

function normalizePolicy(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    return {
        projects: Array.isArray(raw.projects) ? raw.projects : [],
        categories: raw.categories || {},
    };
}

function normalizeKeywords(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    return {
        urgent: Array.isArray(raw.urgent) ? raw.urgent : [],
        stopWords: Array.isArray(raw.stopWords) ? raw.stopWords : [],
        followupPronouns: Array.isArray(raw.followupPronouns) ? raw.followupPronouns : [],
        followupTimeShifts: Array.isArray(raw.followupTimeShifts) ? raw.followupTimeShifts : [],
    };
}

function normalizeScoring(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const defaults = {
        telemetryThrottleMs: 60000,
        priorityWeights: { coreGoal: 36, important: 22, lifeAdmin: 10 },
        orderBoosts: [8, 4, 2],
        urgentModeBoosts: { high: 70, medium: 24 },
        priorityBoosts: { high: 10, medium: 6, low: 4 },
        baseGoalAlignment: 34,
        baseGoalMax: 36,
        behavioralAdjustment: { high: 12, medium: 6 },
        quickWinWordThreshold: 4,
        contentWordThreshold: 6,
        quickWinPenalty: 18,
        planningHeavyPenalty: 26,
        priorityOverrideScore: 10000,
        highUrgencyScore: 28,
        mediumUrgencyScore: 14,
        consequentialAdminScore: 12,
        capacityProtectionScore: 120,
        blockerRemovalScore: 115,
        highUrgencyHours: 24,
        mediumUrgencyHours: 72,
    };
    return { ...defaults, ...raw };
}

const _policy = normalizePolicy(rawProjectPolicy);
const _keywords = normalizeKeywords(rawKeywords);
const _scoring = normalizeScoring(rawScoring);

// Build normalized lookup maps
const _projectByNormalizedName = new Map();
const _projectByAlias = new Map();

if (_policy) {
    for (const p of _policy.projects) {
        const normName = normalizeText(p.match || '');
        if (normName) {
            _projectByNormalizedName.set(normName, p);
        }
        for (const alias of (p.aliases || [])) {
            const normAlias = normalizeText(alias);
            if (normAlias) {
                _projectByAlias.set(normAlias, p);
            }
        }
    }
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export const projectPolicy = _policy;
export const keywords = _keywords;
export const scoring = _scoring;

export const VERB_PATTERNS = new RegExp(`^(${rawVerbList || ''})\\b`, 'i');

export const URGENT_KEYWORDS = _keywords?.urgent || [];
export const STOP_WORDS = new Set(_keywords?.stopWords || []);
export const FOLLOWUP_PRONOUNS = new RegExp(`\\b(${(_keywords?.followupPronouns || []).join('|')})\\b`);
export const FOLLOWUP_TIME_SHIFTS = new RegExp(`\\b(${(_keywords?.followupTimeShifts || []).join('|')})\\b`);

/**
 * Resolve a project name or alias to its category configuration.
 * @param {string} projectName
 * @returns {{ category: string, config: object } | null}
 */
export function resolveProjectCategory(projectName) {
    return resolveProjectCategoryFromPolicy(projectName, _policy);
}

/**
 * Resolve a project name or alias against an explicit policy object.
 * @param {string} projectName
 * @param {object|null} policy
 * @returns {{ category: string, config: object } | null}
 */
export function resolveProjectCategoryFromPolicy(projectName, policy) {
    const normalizedPolicy = normalizePolicy(policy);
    if (!normalizedPolicy) return null;

    const projectByName = new Map();
    const projectByAlias = new Map();
    for (const p of normalizedPolicy.projects) {
        const normName = normalizeText(p.match || '');
        if (normName) projectByName.set(normName, p);
        for (const alias of (p.aliases || [])) {
            const normAlias = normalizeText(alias);
            if (normAlias) projectByAlias.set(normAlias, p);
        }
    }

    const norm = normalizeText(projectName);
    const byName = projectByName.get(norm);
    if (byName) {
        return {
            category: byName.category,
            config: normalizedPolicy.categories[byName.category] || normalizedPolicy.categories.uncategorized || { priorityCap: 3, defaultPriority: 1 },
        };
    }

    const byAlias = projectByAlias.get(norm);
    if (byAlias) {
        return {
            category: byAlias.category,
            config: normalizedPolicy.categories[byAlias.category] || normalizedPolicy.categories.uncategorized || { priorityCap: 3, defaultPriority: 1 },
        };
    }

    return null;
}

/**
 * Get the category configuration for a given category key.
 * Falls back to uncategorized if unknown.
 */
export function getCategoryConfig(category) {
    if (!_policy) {
        return { priorityCap: 3, defaultPriority: 1 };
    }
    return _policy.categories[category] || _policy.categories.uncategorized || { priorityCap: 3, defaultPriority: 1 };
}

/**
 * Get all configured project names (for inference helpers).
 */
export function getConfiguredProjectNames() {
    if (!_policy) return [];
    return _policy.projects.map(p => p.match);
}

/**
 * Check if a project is explicitly configured.
 */
export function isConfiguredProject(projectName) {
    if (!_policy || !projectName) return false;
    return _projectByNormalizedName.has(normalizeText(projectName));
}
