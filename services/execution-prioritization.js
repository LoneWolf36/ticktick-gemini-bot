import { containsSensitiveContent } from '../bot/utils.js';

const CAREER_KEYWORDS = [
    'backend', 'career', 'interview', 'system design', 'design', 'leetcode', 'resume',
    'role', 'job', 'application', 'portfolio', 'study', 'exam', 'assignment', 'mock',
];
const FINANCIAL_KEYWORDS = [
    'finance', 'financial', 'bill', 'rent', 'money', 'debt', 'budget', 'income',
    'electricity', 'lease', 'bank', 'apartment', 'insurance',
];
const HEALTH_KEYWORDS = [
    'health', 'therapy', 'doctor', 'mental', 'burnout', 'recovery', 'recover',
    'rest', 'sleep', 'exercise', 'workout', 'wellness',
];
const PERSONAL_KEYWORDS = [
    'grocery', 'groceries', 'home', 'desk', 'drawer', 'shopping', 'errand',
];
const BLOCKER_KEYWORDS = [
    'unblock', 'blocker', 'reset password', 'password', 'credential', 'login',
    'access', 'wifi', 'internet',
];
const STOP_WORDS = new Set([
    'a', 'an', 'and', 'avoid', 'current', 'for', 'from', 'goal', 'goals', 'growth',
    'land', 'notes', 'now', 'of', 'order', 'priority', 'protect', 'role', 'senior',
    'stabilize', 'the', 'to', 'urgent', 'with', 'your',
]);

function asString(value) {
    return typeof value === 'string' ? value : '';
}

function normalizeWhitespace(value) {
    return asString(value).replace(/\s+/g, ' ').trim();
}

function slugify(value) {
    return normalizeWhitespace(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function clampScoreBand(rank) {
    if (rank === 1) return 'top';
    if (rank === 2) return 'high';
    if (rank === 3) return 'medium';
    return 'low';
}

function extractGoalSection(rawContext) {
    const lines = asString(rawContext).split(/\r?\n/);
    const goals = [];
    let inGoals = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!inGoals && /^GOALS\b/i.test(line)) {
            inGoals = true;
            continue;
        }

        if (!inGoals) {
            continue;
        }

        if (!line) {
            continue;
        }

        if (/^[A-Z][^:]{2,}:$/.test(line) && !/^(?:[-*]|\d+\.)/.test(line)) {
            break;
        }

        const match = line.match(/^(?:[-*]|\d+\.)\s*(.+)$/);
        if (match) {
            goals.push(normalizeWhitespace(match[1]));
            continue;
        }

        goals.push(normalizeWhitespace(line));
    }

    return goals.filter(Boolean);
}

function inferThemeKind(label) {
    const text = label.toLowerCase();

    if (HEALTH_KEYWORDS.some((keyword) => text.includes(keyword)) || text.includes('health')) {
        return 'health';
    }

    if (FINANCIAL_KEYWORDS.some((keyword) => text.includes(keyword))) {
        return 'financial';
    }

    if (CAREER_KEYWORDS.some((keyword) => text.includes(keyword))) {
        return 'career';
    }

    if (PERSONAL_KEYWORDS.some((keyword) => text.includes(keyword))) {
        return 'personal';
    }

    return 'custom';
}

function extractLabelTokens(label) {
    return normalizeWhitespace(label)
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function inferCandidateKinds(text) {
    const kinds = new Set();

    if (CAREER_KEYWORDS.some((keyword) => text.includes(keyword))) {
        kinds.add('career');
    }
    if (FINANCIAL_KEYWORDS.some((keyword) => text.includes(keyword))) {
        kinds.add('financial');
    }
    if (HEALTH_KEYWORDS.some((keyword) => text.includes(keyword))) {
        kinds.add('health');
    }
    if (PERSONAL_KEYWORDS.some((keyword) => text.includes(keyword))) {
        kinds.add('personal');
    }

    return kinds;
}

function findProjectIdByFragments(projects, fragments) {
    for (const fragment of fragments) {
        const match = projects.find((project) => (project.name || '').toLowerCase().includes(fragment));
        if (match?.id) {
            return match.id;
        }
    }

    return null;
}

function inferThemeMatches(candidate, goalThemeProfile) {
    const haystack = `${candidate.title} ${candidate.projectName || ''} ${candidate.content || ''}`.toLowerCase();
    const candidateKinds = inferCandidateKinds(haystack);

    return goalThemeProfile.themes.filter((theme) => {
        if (theme.kind !== 'custom' && candidateKinds.has(theme.kind)) {
            return true;
        }

        const labelTokens = extractLabelTokens(theme.label);
        return labelTokens.some((token) => haystack.includes(token));
    });
}

function hasExplicitTimeZone(dueDate) {
    return /(?:Z|[+-]\d{2}:\d{2})$/.test(dueDate);
}

function parseUrgency(candidate, nowIso) {
    const title = candidate.title.toLowerCase();
    const dueDate = asString(candidate.dueDate).trim();

    if (/\b(today|urgent|asap|tonight|now)\b/.test(title)) {
        return 'high';
    }

    if (!dueDate) {
        return 'low';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        if (!nowIso) {
            return 'medium';
        }

        const dueDay = dueDate;
        const nowDay = nowIso.slice(0, 10);
        if (dueDay <= nowDay) {
            return 'high';
        }
        return 'medium';
    }

    if (dueDate.includes('T') && !hasExplicitTimeZone(dueDate)) {
        return 'unknown';
    }

    if (hasExplicitTimeZone(dueDate) && nowIso) {
        const dueMs = Date.parse(dueDate);
        const nowMs = Date.parse(nowIso);
        if (!Number.isNaN(dueMs) && !Number.isNaN(nowMs)) {
            const deltaHours = (dueMs - nowMs) / (1000 * 60 * 60);
            if (deltaHours <= 24) {
                return 'high';
            }
            if (deltaHours <= 72) {
                return 'medium';
            }
        }
    }

    return 'low';
}

function isBlockerRemoval(candidate) {
    const text = `${candidate.title} ${candidate.content || ''}`.toLowerCase();
    return BLOCKER_KEYWORDS.some((keyword) => text.includes(keyword)) && /\b(unblock|application|apply|applications|access)\b/.test(text);
}

function isCapacityProtection(candidate, context) {
    if (context.workStyleMode !== 'gentle') {
        return false;
    }

    const text = `${candidate.title} ${candidate.content || ''} ${candidate.projectName || ''}`.toLowerCase();
    return /\b(therapy|burnout|recovery|recover|rest|sleep|doctor|mental)\b/.test(text);
}

function isConsequentialAdmin(candidate) {
    const text = `${candidate.title} ${candidate.content || ''} ${candidate.projectName || ''}`.toLowerCase();
    return FINANCIAL_KEYWORDS.some((keyword) => text.includes(keyword));
}

function priorityWeight(priority) {
    if (priority === 5) return 36;
    if (priority === 3) return 22;
    if (priority === 1) return 10;
    return 0;
}

function goalAlignmentWeight(themeMatches) {
    if (themeMatches.length === 0) return 0;

    const bestPriorityOrder = Math.min(...themeMatches.map((theme) => theme.priorityOrder || 99));
    const orderBoost = bestPriorityOrder === 1 ? 8 : bestPriorityOrder === 2 ? 4 : 2;
    return 34 + orderBoost;
}

function urgentModeWeight(candidate, urgency, context) {
    if (context.urgentMode !== true) return 0;

    let boost = 0;
    if (urgency === 'high') {
        boost += 70;
    } else if (urgency === 'medium') {
        boost += 24;
    }

    if (candidate.priority === 5) {
        boost += 10;
    } else if (candidate.priority === 3) {
        boost += 6;
    } else if (candidate.priority === 1 && urgency !== 'low') {
        boost += 4;
    }

    return boost;
}

function buildRationaleText(rationaleCode, candidate, themeMatches) {
    if (rationaleCode === 'goal_alignment') {
        const hasCareer = themeMatches.some((theme) => theme.kind === 'career');
        if (hasCareer) {
            return 'Strong career-signaling alignment with current user-owned goals.';
        }
        return 'Strong alignment with current user-owned goals.';
    }

    if (rationaleCode === 'blocker_removal') {
        return 'Removes a blocker before deeper work can move.';
    }

    if (rationaleCode === 'capacity_protection') {
        return 'Protects execution capacity before more demanding work.';
    }

    if (rationaleCode === 'urgency') {
        if (isConsequentialAdmin(candidate)) {
            return 'Consequential admin with real urgency.';
        }
        return 'Time-sensitive work that should move now.';
    }

    if (isConsequentialAdmin(candidate)) {
        return 'Consequential admin surfaced under degraded goal context.';
    }

    return 'Top remaining candidate under degraded goal context.';
}

function assessCandidate(candidate, context) {
    const themeMatches = inferThemeMatches(candidate, context.goalThemeProfile);
    const urgency = parseUrgency(candidate, context.nowIso);
    const degraded = context.goalThemeProfile.confidence !== 'explicit';

    let rationaleCode = 'fallback';
    let exceptionApplied = false;
    let exceptionReason = 'none';
    let score = priorityWeight(candidate.priority);

    if (isCapacityProtection(candidate, context)) {
        score = 120 + priorityWeight(candidate.priority);
        rationaleCode = 'capacity_protection';
        exceptionApplied = true;
        exceptionReason = 'capacity_protection';
    } else if (isBlockerRemoval(candidate)) {
        score = 115 + priorityWeight(candidate.priority);
        rationaleCode = 'blocker_removal';
        exceptionApplied = true;
        exceptionReason = 'blocker';
    } else if (urgency === 'high' && isConsequentialAdmin(candidate)) {
        score = 108 + priorityWeight(candidate.priority);
        rationaleCode = 'urgency';
        exceptionApplied = true;
        exceptionReason = 'urgent_requirement';
    } else {
        if (themeMatches.length > 0 && !degraded) {
            score += goalAlignmentWeight(themeMatches);
            rationaleCode = 'goal_alignment';
        }

        if (urgency === 'high') {
            score += 28;
            if (rationaleCode === 'fallback') {
                rationaleCode = 'urgency';
            }
        } else if (urgency === 'medium') {
            score += 14;
        }

        if (isConsequentialAdmin(candidate)) {
            score += 12;
        }

        score += urgentModeWeight(candidate, urgency, context);
        if (context.urgentMode === true && rationaleCode === 'fallback' && urgency !== 'low') {
            rationaleCode = 'urgency';
        }
    }

    return {
        candidate,
        score,
        rationaleCode,
        rationaleText: buildRationaleText(rationaleCode, candidate, themeMatches),
        themeMatches,
        urgency,
        exceptionApplied,
        exceptionReason,
        fallbackUsed: degraded || rationaleCode === 'fallback',
    };
}

export function createGoalThemeProfile(rawContext = '', options = {}) {
    const goals = extractGoalSection(rawContext);
    const themes = goals.map((label, index) => ({
        key: slugify(label) || `theme-${index + 1}`,
        label,
        kind: inferThemeKind(label),
        priorityOrder: index + 1,
        active: true,
    }));

    return {
        rawContext: asString(rawContext),
        themes,
        source: options.source || 'fallback',
        confidence: themes.length > 0 ? 'explicit' : 'weak',
    };
}

export function normalizePriorityCandidate(task = {}) {
    return {
        taskId: task.taskId || task.id || '',
        title: asString(task.title),
        content: task.content == null ? '' : asString(task.content),
        projectId: task.projectId ?? null,
        projectName: task.projectName ?? null,
        priority: task.priority ?? null,
        dueDate: task.dueDate ?? null,
        status: task.status ?? null,
        source: 'ticktick',
        containsSensitiveContent: containsSensitiveContent(`${asString(task.title)}\n${asString(task.content)}`),
    };
}

export function buildRankingContext(options = {}) {
    return {
        goalThemeProfile: options.goalThemeProfile || createGoalThemeProfile('', { source: 'fallback' }),
        nowIso: options.nowIso ?? null,
        workStyleMode: options.workStyleMode || 'unknown',
        urgentMode: options.urgentMode === true,
        stateSource: options.stateSource || 'none',
    };
}

export function inferPriorityLabelFromTask(task, options = {}) {
    const normalizedCandidate = task?.taskId ? task : normalizePriorityCandidate(task);
    const ranking = rankPriorityCandidates([normalizedCandidate], {
        goalThemeProfile: options.goalThemeProfile,
        nowIso: options.nowIso,
        workStyleMode: options.workStyleMode,
        urgentMode: options.urgentMode,
        stateSource: options.stateSource,
    });
    const decision = ranking.topRecommendation;
    const rationaleText = decision?.rationaleText?.toLowerCase() || '';
    const haystack = `${normalizedCandidate.title || ''} ${normalizedCandidate.projectName || ''} ${normalizedCandidate.content || ''}`.toLowerCase();

    if (decision?.rationaleCode === 'goal_alignment') {
        return 'career-critical';
    }

    if (decision?.rationaleCode === 'capacity_protection') {
        return 'important';
    }

    if (decision?.rationaleCode === 'urgency' || decision?.exceptionApplied === true) {
        if (FINANCIAL_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
            return 'life-admin';
        }
        return 'important';
    }

    if (rationaleText.includes('career-signaling')) {
        return 'career-critical';
    }

    if (rationaleText.includes('consequential admin')) {
        return 'life-admin';
    }

    if (/\b(system design|dsa|interview|resume|leetcode|backend|career|study|assignment|exam)\b/i.test(haystack)) {
        return 'career-critical';
    }

    if (/\b(bank|bill|grocery|admin|errand|password|credential|home|apartment|rent|insurance)\b/i.test(haystack)) {
        return 'life-admin';
    }

    return 'important';
}

export function inferPriorityValueFromTask(task, options = {}) {
    const label = inferPriorityLabelFromTask(task, options);

    if (label === 'career-critical') return 5;
    if (label === 'life-admin') return 1;
    return 3;
}

export function inferProjectIdFromTask(task, projects = [], options = {}) {
    if (!Array.isArray(projects) || projects.length === 0) {
        return null;
    }

    const normalizedCandidate = task?.taskId ? task : normalizePriorityCandidate(task);
    const ranking = rankPriorityCandidates([normalizedCandidate], {
        goalThemeProfile: options.goalThemeProfile,
        nowIso: options.nowIso,
        workStyleMode: options.workStyleMode,
        urgentMode: options.urgentMode,
        stateSource: options.stateSource,
    });
    const decision = ranking.topRecommendation;
    const haystack = `${normalizedCandidate.title || ''} ${normalizedCandidate.projectName || ''} ${normalizedCandidate.content || ''}`.toLowerCase();
    const inferredPriorityLabel = inferPriorityLabelFromTask(normalizedCandidate, options);

    if (decision?.exceptionReason === 'capacity_protection' || /\b(health|sleep|exercise|workout|doctor|therapy|recovery|burnout|mental)\b/.test(haystack)) {
        return findProjectIdByFragments(projects, ['health', 'personal']);
    }

    if (inferredPriorityLabel === 'career-critical') {
        return findProjectIdByFragments(projects, ['career', 'study']);
    }

    if (inferredPriorityLabel === 'life-admin' || /\b(bank|bill|grocery|get |print|admin|errand|shopping|passport|visa|password|credential|wifi|home)\b/.test(haystack)) {
        return findProjectIdByFragments(projects, ['admin', 'personal']);
    }

    return findProjectIdByFragments(projects, ['admin', 'personal']);
}

export function createRankingDecision(decision = {}) {
    return {
        taskId: decision.taskId || '',
        rank: decision.rank || 1,
        scoreBand: decision.scoreBand || 'top',
        rationaleCode: decision.rationaleCode || 'fallback',
        rationaleText: decision.rationaleText || 'Top remaining candidate under degraded goal context.',
        exceptionApplied: decision.exceptionApplied === true,
        exceptionReason: decision.exceptionReason || 'none',
        fallbackUsed: decision.fallbackUsed === true,
    };
}

export function buildRecommendationResult({ ranked = [], degradedReason = 'none', context = null } = {}) {
    const normalizedRanked = ranked.map((decision, index) => createRankingDecision({
        ...decision,
        rank: decision.rank || index + 1,
        scoreBand: decision.scoreBand || clampScoreBand(index + 1),
    }));
    const resolvedContext = context || buildRankingContext();
    const finalDegradedReason = normalizedRanked.length === 0
        ? 'no_candidates'
        : degradedReason;

    return {
        topRecommendation: normalizedRanked[0] || null,
        ranked: normalizedRanked,
        degraded: finalDegradedReason !== 'none',
        degradedReason: finalDegradedReason,
        context: resolvedContext,
    };
}

export function rankPriorityCandidates(input, maybeContext) {
    const rawCandidates = Array.isArray(input) ? input : (input?.candidates || []);
    const context = buildRankingContext(Array.isArray(input) ? maybeContext : input?.context);
    const candidates = rawCandidates
        .map((candidate) => (candidate?.taskId ? candidate : normalizePriorityCandidate(candidate)))
        .filter((candidate) => candidate && candidate.taskId)
        .filter((candidate) => candidate.status === 0 || candidate.status == null);

    if (candidates.length === 0) {
        return buildRecommendationResult({
            ranked: [],
            degradedReason: 'no_candidates',
            context,
        });
    }

    const assessed = candidates
        .map((candidate) => assessCandidate(candidate, context))
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            if ((right.candidate.priority || 0) !== (left.candidate.priority || 0)) {
                return (right.candidate.priority || 0) - (left.candidate.priority || 0);
            }

            return left.candidate.taskId.localeCompare(right.candidate.taskId);
        });

    const ranked = assessed.map((assessment, index) => createRankingDecision({
        taskId: assessment.candidate.taskId,
        rank: index + 1,
        scoreBand: clampScoreBand(index + 1),
        rationaleCode: assessment.rationaleCode,
        rationaleText: assessment.rationaleText,
        exceptionApplied: assessment.exceptionApplied,
        exceptionReason: assessment.exceptionReason,
        fallbackUsed: assessment.fallbackUsed,
    }));

    const degradedReason = context.goalThemeProfile.confidence === 'explicit'
        ? 'none'
        : 'unknown_goals';

    return buildRecommendationResult({
        ranked,
        degradedReason,
        context,
    });
}
