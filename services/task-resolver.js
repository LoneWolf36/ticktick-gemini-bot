/**
 * services/task-resolver.js
 *
 * Deterministic task resolver that maps a mutation targetQuery plus active tasks
 * to one of three outcomes: resolved, clarification, or not_found.
 *
 * Output shape (consumed by services/pipeline.js):
 * {
 *   status: 'resolved' | 'clarification' | 'not_found',
 *   selected: { taskId, projectId, title, score, matchType } | null,
 *   candidates: Array<{ taskId, projectId, title, score, matchType }>,
 *   reason: string | null
 * }
 */

/**
 * Match score for an exact string match.
 * @type {number}
 */
const EXACT_SCORE = 100;

/**
 * Match score for a prefix match.
 * @type {number}
 */
const PREFIX_SCORE = 80;

/**
 * Match score for a "contains" match.
 * @type {number}
 */
const CONTAINS_SCORE = 60;

/**
 * Minimum score for a fuzzy match to be considered.
 * @type {number}
 */
const FUZZY_SCORE_MIN = 30;

/**
 * Maximum score for a fuzzy match.
 * @type {number}
 */
const FUZZY_SCORE_MAX = 55;

/**
 * Minimum score gap required to avoid clarification when multiple matches exist.
 * @type {number}
 */
const CLARIFICATION_GAP = 15; // minimum score gap to avoid clarification

/**
 * Regex for detecting underspecified pronoun queries.
 * @type {RegExp}
 */
const UNDERSPECIFIED_PRONOUN_QUERY = /^(it|this|that|them|these|those|this one|that one|this task|that task)$/;

/**
 * Normalize a title for matching: lowercase, trim, collapse whitespace, strip punctuation.
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
    if (!title) return '';
    return title
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
}

/**
 * Compute Levenshtein distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinDistance(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            );
        }
    }
    return dp[m][n];
}

/**
 * Compute a fuzzy similarity score between 0 and 1 based on Levenshtein distance.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function fuzzyScore(a, b) {
    if (a === b) return 1.0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    const dist = levenshteinDistance(a, b);
    return 1.0 - dist / maxLen;
}

/**
 * Score one task against the target query.
 * Returns a candidate object or null if no meaningful match.
 * @param {object} task - { id, projectId, title, ... }
 * @param {string} normalizedQuery
 * @param {string} originalQuery
 * @returns {object|null}
 */
function scoreTask(task, normalizedQuery, originalQuery) {
    const normalizedTitle = normalizeTitle(task.title);
    if (!normalizedTitle || !normalizedQuery) return null;

    // Exact match
    if (normalizedTitle === normalizedQuery) {
        return {
            taskId: task.id,
            projectId: task.projectId ?? null,
            title: task.title,
            score: EXACT_SCORE,
            matchType: 'exact',
        };
    }

    // Prefix match: query is a prefix of the title or vice versa
    if (normalizedTitle.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedTitle)) {
        return {
            taskId: task.id,
            projectId: task.projectId ?? null,
            title: task.title,
            score: PREFIX_SCORE,
            matchType: 'prefix',
        };
    }

    // Contains match: query is contained in title or title in query
    if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) {
        return {
            taskId: task.id,
            projectId: task.projectId ?? null,
            title: task.title,
            score: CONTAINS_SCORE,
            matchType: 'contains',
        };
    }

    // Conservative fuzzy match: only for close typos
    const fuzzy = fuzzyScore(normalizedTitle, normalizedQuery);
    // Require at least 70% similarity AND the strings must share significant overlap
    if (fuzzy >= 0.70) {
        // Scale score between FUZZY_SCORE_MIN and FUZZY_SCORE_MAX
        const scaledScore = Math.round(FUZZY_SCORE_MIN + (fuzzy - 0.70) / 0.30 * (FUZZY_SCORE_MAX - FUZZY_SCORE_MIN));
        return {
            taskId: task.id,
            projectId: task.projectId ?? null,
            title: task.title,
            score: Math.min(scaledScore, FUZZY_SCORE_MAX),
            matchType: 'fuzzy',
        };
    }

    return null;
}

/**
 * Resolve a target query against a set of active tasks.
 *
 * @param {object} params
 * @param {string} params.targetQuery - The user's reference to the target task
 * @param {Array<object>} params.activeTasks - Current tasks from TickTick, each with { id, projectId, title, ... }
 * @returns {object} Resolver result: { status, selected, candidates, reason }
 */
export function resolveTarget({ targetQuery, activeTasks, recentTask = null }) {
    if (!targetQuery || typeof targetQuery !== 'string' || !targetQuery.trim()) {
        return {
            status: 'not_found',
            selected: null,
            candidates: [],
            reason: 'empty_query',
        };
    }

    if (!Array.isArray(activeTasks) || activeTasks.length === 0) {
        return {
            status: 'not_found',
            selected: null,
            candidates: [],
            reason: 'no_active_tasks',
        };
    }

    const normalizedQuery = normalizeTitle(targetQuery);

    if (UNDERSPECIFIED_PRONOUN_QUERY.test(normalizedQuery)) {
        // Bind pronoun to recently discussed task when exactly one is available
        if (recentTask && typeof recentTask.id === 'string' && typeof recentTask.title === 'string' && recentTask.title.trim()) {
            return {
                status: 'resolved',
                selected: {
                    taskId: recentTask.id,
                    projectId: recentTask.projectId ?? null,
                    title: recentTask.title,
                    score: 100,
                    matchType: 'coreference',
                },
                candidates: [],
                reason: null,
            };
        }

        const candidates = activeTasks
            .filter((task) => task && typeof task.id === 'string' && typeof task.title === 'string' && task.title.trim())
            .slice(0, 5)
            .map((task) => ({
                taskId: task.id,
                projectId: task.projectId ?? null,
                title: task.title,
                score: 0,
                matchType: 'underspecified',
            }));

        return {
            status: 'clarification',
            selected: null,
            candidates,
            reason: 'underspecified_pronoun',
        };
    }

    // Score all tasks
    const candidates = [];
    for (const task of activeTasks) {
        const candidate = scoreTask(task, normalizedQuery, targetQuery);
        if (candidate) {
            candidates.push(candidate);
        }
    }

    // Sort by score descending, then by title ascending for deterministic ordering
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.title.localeCompare(b.title);
    });

    // Decision rules
    if (candidates.length === 0) {
        return {
            status: 'not_found',
            selected: null,
            candidates: [],
            reason: 'no_matching_tasks',
        };
    }

    const top = candidates[0];

    // Exact match wins immediately
    if (top.matchType === 'exact') {
        // Check if there's another exact match (near-duplicate titles)
        const otherExact = candidates.filter(c => c.matchType === 'exact' && c.taskId !== top.taskId);
        if (otherExact.length > 0) {
            return {
                status: 'clarification',
                selected: null,
                candidates: [top, ...otherExact],
                reason: 'multiple_exact_matches',
            };
        }
        return {
            status: 'resolved',
            selected: top,
            candidates: [top],
            reason: null,
        };
    }

    // Non-exact: need to check for close rivals
    if (candidates.length === 1) {
        // Single candidate — but only resolve if score is plausible
        if (top.score >= FUZZY_SCORE_MIN) {
            return {
                status: 'resolved',
                selected: top,
                candidates: [top],
                reason: null,
            };
        }
        return {
            status: 'not_found',
            selected: null,
            candidates: [],
            reason: 'score_below_threshold',
        };
    }

    // Multiple candidates: check the gap between top two
    const second = candidates[1];
    const scoreGap = top.score - second.score;

    // If the gap is large enough, the top candidate wins clearly
    if (scoreGap >= CLARIFICATION_GAP) {
        return {
            status: 'resolved',
            selected: top,
            candidates: [top],
            reason: null,
        };
    }

    // Close rivals: return clarification with top candidates
    const clarificationCandidates = candidates.filter(c => c.score >= FUZZY_SCORE_MIN).slice(0, 5);
    return {
        status: 'clarification',
        selected: null,
        candidates: clarificationCandidates,
        reason: 'ambiguous_target',
    };
}

/**
 * Build a terse clarification prompt from a clarification result.
 * Returns a string suitable for user-facing clarification.
 * @param {object} result - A resolver result with status 'clarification'
 * @returns {string}
 */
export function buildClarificationPrompt(result, { workStyleMode = 'standard' } = {}) {
    if (result.status !== 'clarification' || !result.candidates.length) {
        return workStyleMode === 'urgent' ? 'Which task?' : 'Which task did you mean?';
    }

    const options = result.candidates.map((c, i) => `${i + 1}. ${c.title}`).join('\n');
    return workStyleMode === 'urgent'
        ? `Which task?\n${options}`
        : `Which task did you mean?\n${options}`;
}
