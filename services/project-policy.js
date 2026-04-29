import {
    PROJECT_POLICY as rawProjectPolicy,
    KEYWORDS as rawKeywords,
    VERB_LIST as rawVerbList,
    SCORING as rawScoring,
} from './user_context.js';

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
    if (!_policy) return null;

    const norm = normalizeText(projectName);

    // Exact project name match
    const byName = _projectByNormalizedName.get(norm);
    if (byName) {
        return {
            category: byName.category,
            config: _policy.categories[byName.category] || _policy.categories.uncategorized || { priorityCap: 3, defaultPriority: 1 },
        };
    }

    // Alias match
    const byAlias = _projectByAlias.get(norm);
    if (byAlias) {
        return {
            category: byAlias.category,
            config: _policy.categories[byAlias.category] || _policy.categories.uncategorized || { priorityCap: 3, defaultPriority: 1 },
        };
    }

    // Substring match on project names (fuzzy fallback)
    for (const [name, p] of _projectByNormalizedName) {
        if (norm.includes(name) || name.includes(norm)) {
            return {
                category: p.category,
                config: _policy.categories[p.category] || _policy.categories.uncategorized || { priorityCap: 3, defaultPriority: 1 },
            };
        }
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

/**
 * Build a fallback project inference using alias overlap.
 * Scores configured projects by how many aliases appear in the haystack.
 * Returns best match project name or null if no confident winner.
 */
export function inferProjectByAliases(haystack, minScore = 1) {
    if (!_policy || !haystack) return null;

    const normHaystack = normalizeText(haystack);
    let best = null;
    let bestScore = 0;

    for (const p of _policy.projects) {
        let score = 0;
        for (const alias of (p.aliases || [])) {
            if (normHaystack.includes(normalizeText(alias))) {
                score += 1;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            best = p.match;
        }
    }

    return bestScore >= minScore ? best : null;
}
