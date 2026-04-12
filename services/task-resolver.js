/**
 * services/task-resolver.js
 *
 * WP01 - Task Resolver Core
 *
 * A deterministic resolver that takes a mutation targetQuery plus active tasks
 * and returns one of three states:
 *   - resolved:     exactly one task identified with confidence
 *   - clarification: multiple plausible candidates, need user input
 *   - not_found:    no candidate reaches minimum threshold
 *
 * Design constraints:
 *   - NO direct TickTick API calls
 *   - NO store access
 *   - Pure function: same input always yields same output
 *   - Fails closed: when uncertain, returns clarification or not_found
 *
 * Output shape (documented for downstream WP reuse):
 *   {
 *     status: 'resolved' | 'clarification' | 'not_found',
 *     selected: { taskId, projectId, title, score, matchType } | null,
 *     candidates: Array<{ taskId, projectId, title, score, matchType }>,
 *     reason: string | null
 *   }
 */

// ─── Named Constants: Thresholds ─────────────────────────────────────────────

const EXACT_SCORE = 1.0;
const PREFIX_SCORE = 0.85;
const CONTAINS_SCORE = 0.75;
const FUZZY_SCORE = 0.65;

const RESOLVE_THRESHOLD = 0.5;
const CLEAR_WINNER_GAP = 0.15;
const MIN_QUERY_LENGTH = 2;

// ─── Title Normalization ─────────────────────────────────────────────────────

const DATE_PATTERNS = /\b(today|tomorrow|tonight|yesterday|this\s+\w+|next\s+\w+)\b/gi;
const PRIORITY_PATTERNS = /^(urgent|important|critical|asap|high\s+priority)[:\s-]*/i;
const BRACKET_PREFIX = /^\[.*?\]\s*/;
const TRAILING_PUNCTUATION = /[!?.]+$/g;
const EXTRA_WHITESPACE = /\s+/g;

/**
 * Normalizes a title string for comparison.
 * Trims, lowercases, strips prefixes/markers/punctuation, collapses whitespace.
 */
function normalizeTitle(raw) {
    if (raw == null) return '';

    let title = String(raw).trim().toLowerCase();

    // Strip bracket prefixes like [Work], [Personal]
    title = title.replace(BRACKET_PREFIX, '');

    // Strip priority markers
    title = title.replace(PRIORITY_PATTERNS, '');

    // Strip date references
    title = title.replace(DATE_PATTERNS, '');

    // Strip trailing punctuation
    title = title.replace(TRAILING_PUNCTUATION, '');

    // Collapse extra whitespace
    title = title.replace(EXTRA_WHITESPACE, ' ').trim();

    return title;
}

// ─── Candidate Shaping ───────────────────────────────────────────────────────

/**
 * Builds a candidate object from a task, score, and match type.
 */
function buildCandidate(task, score, matchType) {
    return {
        taskId: task.id,
        projectId: task.projectId ?? null,
        title: task.title,
        score,
        matchType,
    };
}

// ─── Fuzzy Matching (Conservative Levenshtein) ──────────────────────────────

/**
 * Computes the Levenshtein edit distance between two strings.
 */
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

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
 * Computes a fuzzy similarity score (0-1) based on normalized Levenshtein distance.
 * Returns 0 when the distance exceeds the fuzzy threshold.
 */
function fuzzyScore(query, target) {
    const maxLen = Math.max(query.length, target.length);
    if (maxLen === 0) return 1.0;

    const dist = levenshtein(query, target);
    const similarity = 1 - dist / maxLen;

    // Only return a score if similarity is meaningfully high
    return similarity >= 0.5 ? similarity * FUZZY_SCORE : 0;
}

// ─── Matching Stages ─────────────────────────────────────────────────────────

/**
 * Stage 1: Exact title comparison after normalization.
 */
function matchExact(normalizedQuery, tasks) {
    const candidates = [];
    for (const task of tasks) {
        const normalizedTaskTitle = normalizeTitle(task.title);
        if (normalizedTaskTitle === normalizedQuery) {
            candidates.push(buildCandidate(task, EXACT_SCORE, 'exact'));
        }
    }
    return candidates;
}

/**
 * Stage 2: Prefix matching — query is a prefix of the task title.
 */
function matchPrefix(normalizedQuery, tasks) {
    const candidates = [];
    for (const task of tasks) {
        const normalizedTaskTitle = normalizeTitle(task.title);
        if (
            normalizedTaskTitle.startsWith(normalizedQuery) &&
            normalizedTaskTitle !== normalizedQuery
        ) {
            candidates.push(buildCandidate(task, PREFIX_SCORE, 'prefix'));
        }
    }
    return candidates;
}

/**
 * Stage 3: Contains matching — query appears within the task title.
 */
function matchContains(normalizedQuery, tasks) {
    const candidates = [];
    for (const task of tasks) {
        const normalizedTaskTitle = normalizeTitle(task.title);
        if (
            normalizedTaskTitle.includes(normalizedQuery) &&
            !normalizedTaskTitle.startsWith(normalizedQuery)
        ) {
            candidates.push(buildCandidate(task, CONTAINS_SCORE, 'contains'));
        }
    }
    return candidates;
}

/**
 * Stage 4: Conservative fuzzy matching for close typos.
 */
function matchFuzzy(normalizedQuery, tasks) {
    const candidates = [];
    for (const task of tasks) {
        const normalizedTaskTitle = normalizeTitle(task.title);
        const score = fuzzyScore(normalizedQuery, normalizedTaskTitle);
        if (score > 0) {
            candidates.push(buildCandidate(task, score, 'fuzzy'));
        }
    }
    return candidates;
}

// ─── Decision Rules ──────────────────────────────────────────────────────────

/**
 * Resolves a targetQuery against a list of active tasks.
 *
 * Returns a result object with status, selected, candidates, and reason.
 * Deterministic: same input always produces same output.
 * Tasks are processed in list order; ties broken by list position.
 */
function resolveTask(targetQuery, tasks) {
    const normalizedQuery = normalizeTitle(targetQuery);

    // Guard: query too short
    if (normalizedQuery.length < MIN_QUERY_LENGTH) {
        return {
            status: 'not_found',
            selected: null,
            candidates: [],
            reason: 'query_too_short',
        };
    }

    // Guard: no tasks to search
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return {
            status: 'not_found',
            selected: null,
            candidates: [],
            reason: 'no_match',
        };
    }

    // Run matching stages in priority order
    let candidates = matchExact(normalizedQuery, tasks);
    if (candidates.length === 0) {
        candidates = matchPrefix(normalizedQuery, tasks);
    }
    if (candidates.length === 0) {
        candidates = matchContains(normalizedQuery, tasks);
    }
    if (candidates.length === 0) {
        candidates = matchFuzzy(normalizedQuery, tasks);
    }

    // Deterministic ordering: sort by score descending, then by list order (stable)
    // Since we iterate tasks in order and push in order, stable sort by score is sufficient
    candidates.sort((a, b) => b.score - a.score);

    // No candidates above zero
    if (candidates.length === 0) {
        return {
            status: 'not_found',
            selected: null,
            candidates: [],
            reason: 'no_match',
        };
    }

    // Filter to candidates at or above the resolve threshold
    const viableCandidates = candidates.filter(c => c.score >= RESOLVE_THRESHOLD);

    if (viableCandidates.length === 0) {
        return {
            status: 'not_found',
            selected: null,
            candidates: viableCandidates,
            reason: 'no_match',
        };
    }

    // Deduplicate: when multiple candidates share the same normalized title,
    // they are duplicate tasks — pick the first (list-order deterministic).
    // This prevents false ambiguity from tasks with identical titles.
    const normalizedQuery_forDedup = normalizeTitle(viableCandidates[0].title);
    const dedupedCandidates = viableCandidates.filter(c =>
        normalizeTitle(c.title) === normalizedQuery_forDedup,
    );
    const hasDuplicateTitles = viableCandidates.length > 1 &&
        viableCandidates.every(c => normalizeTitle(c.title) === normalizedQuery_forDedup);

    if (hasDuplicateTitles) {
        // All top candidates are the same title — resolve to first occurrence
        return {
            status: 'resolved',
            selected: dedupedCandidates[0],
            candidates: dedupedCandidates,
            reason: null,
        };
    }

    // Single viable candidate — resolved
    if (viableCandidates.length === 1) {
        return {
            status: 'resolved',
            selected: viableCandidates[0],
            candidates: viableCandidates,
            reason: null,
        };
    }

    // Multiple viable candidates — check for clear winner
    const topScore = viableCandidates[0].score;
    const secondScore = viableCandidates[1].score;
    const hasClearWinner = topScore - secondScore >= CLEAR_WINNER_GAP;

    if (hasClearWinner) {
        return {
            status: 'resolved',
            selected: viableCandidates[0],
            candidates: viableCandidates,
            reason: null,
        };
    }

    // Ambiguous: multiple plausible candidates
    return {
        status: 'clarification',
        selected: null,
        candidates: viableCandidates,
        reason: 'multiple_candidates',
    };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export { resolveTask, normalizeTitle, buildCandidate };
