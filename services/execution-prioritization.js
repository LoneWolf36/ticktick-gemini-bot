import { containsSensitiveContent } from './shared-utils.js';

const recentRankingTelemetry = new Map();

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
const QUICK_WIN_KEYWORDS = [
    'buy', 'clean', 'desk', 'drawer', 'email', 'groceries', 'grocery', 'inbox',
    'organize', 'sort', 'tidy', 'quick', 'small', 'admin', 'errand', 'shopping',
];
const PLANNING_HEAVY_KEYWORDS = [
    'analyze', 'analysis', 'brainstorm', 'investigate', 'outline', 'plan', 'planning',
    'research', 'review notes', 'roadmap', 'strategy', 'think through',
];
const EXECUTION_EVIDENCE_KEYWORDS = [
    'apply', 'book', 'build', 'call', 'complete', 'deliver', 'draft', 'implement',
    'practice', 'prepare', 'send', 'ship', 'submit', 'update', 'write',
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

function shouldThrottleTelemetry(payload, userId) {
    const keyBase = `${userId || 'default'}:`;
    const { timestamp, ...rest } = payload;
    const key = `${keyBase}${JSON.stringify(rest)}`;
    const now = Date.now();
    const last = recentRankingTelemetry.get(key);
    if (last && now - last < 60_000) {
        return true;
    }
    recentRankingTelemetry.set(key, now);
    for (const [k, ts] of recentRankingTelemetry) {
        if (now - ts > 60_000) {
            recentRankingTelemetry.delete(k);
        }
    }
    return false;
}

function logRankingTelemetry(payload, context) {
    if (shouldThrottleTelemetry(payload, context?.userId)) {
        return;
    }

    const sink = typeof context?.rankingTelemetrySink === 'function'
        ? context.rankingTelemetrySink
        : null;

    if (sink) {
        sink(payload);
        return;
    }

    console.log(`[RankingTelemetry] ${JSON.stringify(payload)}`);
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
    if (context.workStyleMode !== 'focus') {
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

function normalizeBehavioralCategory(category) {
    const normalized = normalizeWhitespace(category).toLowerCase();
    if (!normalized) return null;
    if (normalized === 'career' || normalized === 'work' || normalized === 'study') return 'career';
    if (normalized === 'financial' || normalized === 'finance' || normalized === 'admin') return 'financial';
    if (normalized === 'health' || normalized === 'wellness') return 'health';
    if (normalized === 'personal' || normalized === 'home') return 'personal';
    return null;
}

function normalizeBehavioralSignals(signals = [], threshold = 'strong') {
    const minConfidence = threshold === 'strong' ? 'high' : 'standard';
    return (Array.isArray(signals) ? signals : [])
        .map((signal) => {
            if (!signal || typeof signal !== 'object') return null;
            const type = normalizeWhitespace(signal.type).toLowerCase();
            if (type !== 'category_avoidance' && type !== 'avoidance') return null;

            const category = normalizeBehavioralCategory(signal.category || signal.domain || signal.kind);
            if (!category) return null;

            const confidence = normalizeWhitespace(signal.confidence).toLowerCase();
            if (confidence !== 'high' && confidence !== 'standard') return null;
            if (minConfidence === 'high' && confidence !== 'high') return null;

            const rawCount = Number(signal.signalCount);
            const signalCount = Number.isFinite(rawCount) ? rawCount : 0;
            if (signalCount > 0 && signalCount < 3) return null;

            return {
                type: 'category_avoidance',
                category,
                confidence,
                signalCount,
            };
        })
        .filter(Boolean);
}

function inferCandidateCategory(candidate) {
    const haystack = `${candidate.title} ${candidate.projectName || ''} ${candidate.content || ''}`.toLowerCase();
    const kinds = inferCandidateKinds(haystack);
    if (kinds.has('career')) return 'career';
    if (kinds.has('financial')) return 'financial';
    if (kinds.has('health')) return 'health';
    if (kinds.has('personal')) return 'personal';
    return null;
}

function behavioralAdjustment(candidate, context) {
    const candidateCategory = inferCandidateCategory(candidate);
    if (!candidateCategory) return { score: 0, confidence: null };

    const match = (context.behavioralSignals || [])
        .find((signal) => signal.type === 'category_avoidance' && signal.category === candidateCategory);
    if (!match) return { score: 0, confidence: null };

    return {
        score: match.confidence === 'high' ? 12 : 6,
        confidence: match.confidence,
    };
}

function wordCount(text) {
    return normalizeWhitespace(text).split(/\s+/).filter(Boolean).length;
}

function isQuickWinTask(candidate) {
    const title = normalizeWhitespace(candidate.title).toLowerCase();
    const content = normalizeWhitespace(candidate.content).toLowerCase();
    const combined = `${title} ${content}`.trim();
    const shortTitle = wordCount(title) > 0 && wordCount(title) <= 4;
    const hasQuickWinKeyword = QUICK_WIN_KEYWORDS.some((keyword) => combined.includes(keyword));
    const hasLittleContext = content.length === 0 || wordCount(content) <= 6;

    return shortTitle && hasQuickWinKeyword && hasLittleContext;
}

function isPlanningHeavyWithoutExecution(candidate) {
    const combined = `${candidate.title} ${candidate.content || ''}`.toLowerCase();
    const hasPlanningKeyword = PLANNING_HEAVY_KEYWORDS.some((keyword) => combined.includes(keyword));
    const hasExecutionEvidence = EXECUTION_EVIDENCE_KEYWORDS.some((keyword) => combined.includes(keyword));

    return hasPlanningKeyword && !hasExecutionEvidence;
}

function quickWinPenalty(candidate, { themeMatches, urgency, consequentialAdmin, blockerRemoval, capacityProtection }) {
    if (!isQuickWinTask(candidate)) {
        return 0;
    }

    if (urgency === 'high' || consequentialAdmin || blockerRemoval || capacityProtection) {
        return 0;
    }

    if (themeMatches.length > 0 && candidate.priority === 5) {
        return 0;
    }

    return 18;
}

function planningHeavyPenalty(candidate, { urgency, blockerRemoval, capacityProtection }) {
    if (!isPlanningHeavyWithoutExecution(candidate)) {
        return 0;
    }

    if (urgency === 'high' || blockerRemoval || capacityProtection) {
        return 0;
    }

    return 26;
}

function summarizeCandidateForTelemetry(candidate) {
    return {
        taskId: candidate.taskId,
        projectId: candidate.projectId ?? null,
        priority: candidate.priority ?? null,
        dueDate: candidate.dueDate ?? null,
        repeatFlag: candidate.repeatFlag ?? null,
        taskAgeDays: candidate.taskAgeDays ?? null,
        status: candidate.status ?? null,
        source: candidate.source ?? 'ticktick',
        containsSensitiveContent: candidate.containsSensitiveContent === true,
    };
}

function summarizeAssessmentForTelemetry(assessment) {
    return {
        taskId: assessment.candidate.taskId,
        score: assessment.score,
        rationaleCode: assessment.rationaleCode,
        rationaleText: assessment.rationaleText,
        inferenceConfidence: assessment.inferenceConfidence,
        exceptionApplied: assessment.exceptionApplied === true,
        exceptionReason: assessment.exceptionReason || 'none',
        fallbackUsed: assessment.fallbackUsed === true,
        urgency: assessment.urgency || 'low',
        goalMatchCount: Array.isArray(assessment.themeMatches) ? assessment.themeMatches.length : 0,
        behavioralSignalApplied: assessment.behavioralSignalApplied === true,
        quickWinSuppressed: isQuickWinTask(assessment.candidate),
        planningHeavyWithoutExecution: isPlanningHeavyWithoutExecution(assessment.candidate),
    };
}

function buildRankingTelemetryPayload({ candidates, assessed, result, context }) {
    return {
        eventType: 'ranking.computed',
        timestamp: new Date().toISOString(),
        inputState: {
            goalThemeCount: Array.isArray(context.goalThemeProfile?.themes) ? context.goalThemeProfile.themes.length : 0,
            goalConfidence: context.goalThemeProfile?.confidence || 'weak',
            nowIso: context.nowIso || null,
            workStyleMode: context.workStyleMode || 'unknown',
            urgentMode: context.urgentMode === true,
            behavioralInferenceThreshold: context.behavioralInferenceThreshold || 'strong',
            behavioralSignalCount: Array.isArray(context.behavioralSignals) ? context.behavioralSignals.length : 0,
            stateSource: context.stateSource || 'none',
            priorityOverrideCount: Array.isArray(context.priorityOverrides) ? context.priorityOverrides.length : 0,
            candidates: candidates.map(summarizeCandidateForTelemetry),
        },
        computedScores: assessed.map(summarizeAssessmentForTelemetry),
        finalOrdering: result.ranked.map((decision) => ({
            taskId: decision.taskId,
            rank: decision.rank,
            scoreBand: decision.scoreBand,
            rationaleCode: decision.rationaleCode,
            rationaleText: decision.rationaleText,
            inferenceConfidence: decision.inferenceConfidence,
            exceptionApplied: decision.exceptionApplied === true,
            exceptionReason: decision.exceptionReason || 'none',
            fallbackUsed: decision.fallbackUsed === true,
        })),
        degraded: result.degraded === true,
        degradedReason: result.degradedReason || 'none',
        rankingConfidence: result.rankingConfidence || 'low',
    };
}

function normalizePriorityOverride(override, nowIso = null) {
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
        return null;
    }

    const taskId = normalizeWhitespace(override.taskId);
    if (!taskId) {
        return null;
    }

    const expiresAt = typeof override.expiresAt === 'string' && !Number.isNaN(Date.parse(override.expiresAt))
        ? override.expiresAt
        : null;
    const nowMs = typeof nowIso === 'string' && !Number.isNaN(Date.parse(nowIso))
        ? Date.parse(nowIso)
        : Date.now();

    if (expiresAt && Date.parse(expiresAt) <= nowMs) {
        return null;
    }

    return {
        taskId,
        reason: normalizeWhitespace(override.reason) || 'explicit_user_priority',
        expiresAt,
    };
}

function resolvePriorityOverrides(overrides, nowIso = null) {
    if (!Array.isArray(overrides)) {
        return [];
    }

    return overrides
        .map((override) => normalizePriorityOverride(override, nowIso))
        .filter(Boolean);
}

function findPriorityOverride(taskId, context) {
    return (context.priorityOverrides || []).find((override) => override.taskId === taskId) || null;
}

function inferInferenceConfidence({ rationaleCode, urgency, degraded, themeMatches, exceptionApplied, behavioralConfidence = null }) {
    if (exceptionApplied === true) {
        return 'strong';
    }

    if (rationaleCode === 'goal_alignment' && degraded !== true && themeMatches.length > 0) {
        return 'strong';
    }

    if (rationaleCode === 'urgency' && urgency === 'high') {
        return 'strong';
    }

    if (rationaleCode === 'behavioral_signal' && behavioralConfidence === 'high') {
        return 'strong';
    }

    return 'weak';
}

function buildRationaleText(rationaleCode, candidate, themeMatches, inferenceConfidence = 'strong') {
    if (rationaleCode === 'goal_alignment') {
        if (inferenceConfidence === 'weak') {
            return 'Likely aligned with current goals, but confidence is limited.';
        }
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
        if (inferenceConfidence === 'weak') {
            return 'Possibly time-sensitive work; verify the deadline before treating it as urgent.';
        }
        if (isConsequentialAdmin(candidate)) {
            return 'Consequential admin with real urgency.';
        }
        return 'Time-sensitive work that should move now.';
    }

    if (rationaleCode === 'behavioral_signal') {
        if (inferenceConfidence === 'weak') {
            return 'Behavioral evidence weakly suggests this category is being avoided, so one concrete step is surfaced.';
        }
        return 'Behavioral evidence suggests this category is being avoided, so one concrete step is surfaced.';
    }

    if (isConsequentialAdmin(candidate)) {
        if (inferenceConfidence === 'weak') {
            return 'Potentially consequential admin surfaced under degraded goal context.';
        }
        return 'Consequential admin surfaced under degraded goal context.';
    }

    return 'Possible next candidate under degraded goal context.';
}

function assessCandidate(candidate, context) {
    const priorityOverride = findPriorityOverride(candidate.taskId, context);
    if (priorityOverride) {
        return {
            candidate,
            score: 10_000,
            rationaleCode: 'user_override',
            rationaleText: 'You marked this task as the top priority for now.',
            inferenceConfidence: 'strong',
            exceptionApplied: true,
            exceptionReason: priorityOverride.reason,
            fallbackUsed: false,
        };
    }

    const themeMatches = inferThemeMatches(candidate, context.goalThemeProfile);
    const urgency = parseUrgency(candidate, context.nowIso);
    const degraded = context.goalThemeProfile.confidence !== 'explicit';
    const capacityProtection = isCapacityProtection(candidate, context);
    const blockerRemoval = isBlockerRemoval(candidate);
    const consequentialAdmin = isConsequentialAdmin(candidate);
    const behavioralBoost = behavioralAdjustment(candidate, context);

    let rationaleCode = 'fallback';
    let exceptionApplied = false;
    let exceptionReason = 'none';
    let score = priorityWeight(candidate.priority);

    if (capacityProtection) {
        score = 120 + priorityWeight(candidate.priority);
        rationaleCode = 'capacity_protection';
        exceptionApplied = true;
        exceptionReason = 'capacity_protection';
    } else if (blockerRemoval) {
        score = 115 + priorityWeight(candidate.priority);
        rationaleCode = 'blocker_removal';
        exceptionApplied = true;
        exceptionReason = 'blocker';
    } else if (urgency === 'high' && consequentialAdmin) {
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

        if (consequentialAdmin) {
            score += 12;
        }

        if (behavioralBoost.score > 0) {
            score += behavioralBoost.score;
            if (rationaleCode === 'fallback') {
                rationaleCode = 'behavioral_signal';
            }
        }

        score += urgentModeWeight(candidate, urgency, context);
        score -= quickWinPenalty(candidate, {
            themeMatches,
            urgency,
            consequentialAdmin,
            blockerRemoval,
            capacityProtection,
        });
        score -= planningHeavyPenalty(candidate, {
            urgency,
            blockerRemoval,
            capacityProtection,
        });
    }

    const inferenceConfidence = inferInferenceConfidence({
        rationaleCode,
        urgency,
        degraded,
        themeMatches,
        exceptionApplied,
        behavioralConfidence: behavioralBoost.confidence,
    });

    return {
        candidate,
        score,
        rationaleCode,
        rationaleText: buildRationaleText(rationaleCode, candidate, themeMatches, inferenceConfidence),
        inferenceConfidence,
        themeMatches,
        urgency,
        behavioralSignalApplied: behavioralBoost.score > 0,
        exceptionApplied,
        exceptionReason,
        fallbackUsed: degraded || rationaleCode === 'fallback',
    };
}

/**
 * Creates a goal theme profile from raw context.
 *
 * @param {string} rawContext - Raw text context containing GOALS section
 * @param {object} [options={}] - Profile options
 * @param {string} [options.source='fallback'] - Data source identifier
 * @returns {object} Goal theme profile
 */
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

/**
 * Normalizes a TickTick task into a priority candidate.
 *
 * @param {object} task - Raw TickTick task object
 * @returns {object} Normalized candidate
 */
export function normalizePriorityCandidate(task = {}) {
    const createdAt = task.createdTime ?? task.createdAt ?? null;
    const createdAtMs = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
    const taskAgeDays = Number.isNaN(createdAtMs)
        ? null
        : Math.max(0, Math.floor((Date.now() - createdAtMs) / (24 * 60 * 60 * 1000)));

    return {
        taskId: task.taskId || task.id || '',
        title: asString(task.title),
        content: task.content == null ? '' : asString(task.content),
        projectId: task.projectId ?? null,
        projectName: task.projectName ?? null,
        priority: task.priority ?? null,
        dueDate: task.dueDate ?? null,
        repeatFlag: task.repeatFlag ?? null,
        taskAgeDays,
        status: task.status ?? null,
        source: 'ticktick',
        containsSensitiveContent: containsSensitiveContent(`${asString(task.title)}\n${asString(task.content)}`),
    };
}

/**
 * Builds a ranking context from options.
 *
 * @param {object} [options={}] - Ranking options
 * @returns {object} Ranking context
 */
export function buildRankingContext(options = {}) {
    return {
        goalThemeProfile: options.goalThemeProfile || createGoalThemeProfile('', { source: 'fallback' }),
        nowIso: options.nowIso || null,
        workStyleMode: options.workStyleMode || 'unknown',
        urgentMode: options.urgentMode === true,
        behavioralInferenceThreshold: options.behavioralInferenceThreshold || 'strong',
        behavioralSignals: normalizeBehavioralSignals(
            options.behavioralSignals,
            options.behavioralInferenceThreshold || 'strong',
        ),
        priorityOverrides: resolvePriorityOverrides(options.priorityOverrides, options.nowIso),
        rankingTelemetrySink: typeof options.rankingTelemetrySink === 'function'
            ? options.rankingTelemetrySink
            : null,
        stateSource: options.stateSource || 'none',
        userId: options.userId || options.user_id || null,
    };
}

/**
 * Infers a priority label (e.g., 'core_goal') from a task.
 *
 * @param {object} task - Normalized task or candidate
 * @param {object} [options={}] - Ranking options
 * @returns {string} Priority label
 */
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
        return 'core_goal';
    }

    if (decision?.rationaleCode === 'capacity_protection') {
        return 'important';
    }

    if (decision?.exceptionReason === 'urgent_requirement') {
        return 'important';
    }

    if (decision?.rationaleCode === 'urgency' || decision?.exceptionApplied === true) {
        if (FINANCIAL_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
            return 'life-admin';
        }
        return 'important';
    }

    if (rationaleText.includes('career-signaling')) {
        return 'core_goal';
    }

    if (rationaleText.includes('consequential admin')) {
        return 'life-admin';
    }

    if (/\b(system design|dsa|interview|resume|leetcode|backend|career|study|assignment|exam)\b/i.test(haystack)) {
        return 'core_goal';
    }

    if (/\b(bank|bill|grocery|admin|errand|password|credential|home|apartment|rent|insurance)\b/i.test(haystack)) {
        return 'life-admin';
    }

    return 'important';
}

/**
 * Infers a TickTick priority value (1, 3, 5) from a task.
 *
 * @param {object} task - Normalized task or candidate
 * @param {object} [options={}] - Ranking options
 * @returns {number} Priority value
 */
export function inferPriorityValueFromTask(task, options = {}) {
    const label = inferPriorityLabelFromTask(task, options);

    if (label === 'core_goal') return 5;
    if (label === 'life-admin') return 1;
    return 3;
}

/**
 * Infers a project ID for a task from available projects.
 *
 * @param {object} task - Normalized task or candidate
 * @param {object[]} projects - List of available projects
 * @param {object} [options={}] - Ranking options
 * @returns {string|null} Project ID or null
 */
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

    if (inferredPriorityLabel === 'core_goal') {
        return findProjectIdByFragments(projects, ['career', 'study']);
    }

    if (inferredPriorityLabel === 'life-admin' || /\b(bank|bill|grocery|get |print|admin|errand|shopping|passport|visa|password|credential|wifi|home)\b/.test(haystack)) {
        return findProjectIdByFragments(projects, ['admin', 'personal']);
    }

    return findProjectIdByFragments(projects, ['admin', 'personal']);
}

/**
 * Creates a ranking decision object.
 *
 * @param {object} [decision={}] - Raw decision properties
 * @returns {object} Ranking decision
 */
export function createRankingDecision(decision = {}) {
    return {
        taskId: decision.taskId || '',
        rank: decision.rank || 1,
        scoreBand: decision.scoreBand || 'top',
        rationaleCode: decision.rationaleCode || 'fallback',
        rationaleText: decision.rationaleText || 'Possible next candidate under degraded goal context.',
        inferenceConfidence: decision.inferenceConfidence || 'strong',
        exceptionApplied: decision.exceptionApplied === true,
        exceptionReason: decision.exceptionReason || 'none',
        fallbackUsed: decision.fallbackUsed === true,
    };
}

/**
 * Builds a recommendation result object.
 *
 * @param {object} [params={}] - Result parameters
 * @returns {object} Recommendation result
 */
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
    const rankingConfidence = normalizedRanked.length > 0
        && finalDegradedReason === 'none'
        && normalizedRanked.every((decision) => decision.inferenceConfidence === 'strong')
        ? 'high'
        : 'low';
    const shouldAskClarification = rankingConfidence === 'low' && finalDegradedReason !== 'no_candidates';
    const allLowPriority = normalizedRanked.length > 0
        && normalizedRanked.every((decision) => decision.rationaleCode === 'fallback' || decision.inferenceConfidence === 'weak');
    const uncertaintyLabel = rankingConfidence === 'low'
        ? (finalDegradedReason === 'unknown_goals'
            ? 'Ranking is uncertain because goal context is incomplete.'
            : 'Ranking is uncertain because some evidence is weak or conflicting.')
        : null;
    const nothingCriticalLabel = allLowPriority
        ? 'Nothing critical stands out right now.'
        : null;

    return {
        topRecommendation: normalizedRanked[0] || null,
        ranked: normalizedRanked,
        degraded: finalDegradedReason !== 'none',
        degradedReason: finalDegradedReason,
        rankingConfidence,
        uncertaintyLabel,
        nothingCriticalLabel,
        shouldAskClarification,
        clarificationReason: shouldAskClarification
            ? (finalDegradedReason === 'unknown_goals' ? 'missing_goal_context' : 'weak_inference')
            : null,
        context: resolvedContext,
    };
}

/**
 * Ranks candidates based on goal alignment and urgency.
 *
 * @param {object|object[]} input - List of candidates or input object with context
 * @param {object} [maybeContext] - Ranking context if input is a list
 * @returns {object} Recommendation result
 */
export function rankPriorityCandidates(input, maybeContext) {
    const rawCandidates = Array.isArray(input) ? input : (input?.candidates || []);
    const context = buildRankingContext(Array.isArray(input) ? maybeContext : input?.context);
    const candidates = rawCandidates
        .map((candidate) => (candidate?.taskId ? candidate : normalizePriorityCandidate(candidate)))
        .filter((candidate) => candidate && candidate.taskId)
        .filter((candidate) => candidate.status === 0 || candidate.status == null);

    if (candidates.length === 0) {
        const result = buildRecommendationResult({
            ranked: [],
            degradedReason: 'no_candidates',
            context,
        });
        logRankingTelemetry(buildRankingTelemetryPayload({
            candidates: [],
            assessed: [],
            result,
            context,
        }), context);
        return result;
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
        inferenceConfidence: assessment.inferenceConfidence,
        exceptionApplied: assessment.exceptionApplied,
        exceptionReason: assessment.exceptionReason,
        fallbackUsed: assessment.fallbackUsed,
    }));

    const degradedReason = context.goalThemeProfile.confidence === 'explicit'
        ? 'none'
        : 'unknown_goals';

    const result = buildRecommendationResult({
        ranked,
        degradedReason,
        context,
    });

    logRankingTelemetry(buildRankingTelemetryPayload({
        candidates,
        assessed,
        result,
        context,
    }), context);

    return result;
}
