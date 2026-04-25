import { BehavioralPatternType } from '../behavioral-patterns.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.BEHAVIORAL_SIGNAL_RETENTION_DAYS || '30', 10) || 30);

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function parsePatternTime(value) {
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function confidenceWeight(confidence) {
    if (confidence === 'high') return 3;
    if (confidence === 'standard') return 2;
    return 1;
}

function isFreshPattern(pattern, nowMs = Date.now()) {
    const windowEndMs = parsePatternTime(pattern?.windowEnd) ?? parsePatternTime(pattern?.windowStart);
    if (windowEndMs === null) return false;
    return windowEndMs >= nowMs - (RETENTION_DAYS * DAY_MS);
}

function isSupportedPatternType(type) {
    return type === BehavioralPatternType.SNOOZE_SPIRAL
        || type === BehavioralPatternType.PLANNING_TYPE_A
        || type === BehavioralPatternType.PLANNING_TYPE_B;
}

function hasRepeatedEvidence(pattern) {
    const count = Number.isFinite(pattern?.signalCount) ? pattern.signalCount : 0;

    if (pattern?.type === BehavioralPatternType.SNOOZE_SPIRAL) {
        return count >= 3;
    }
    if (pattern?.type === BehavioralPatternType.PLANNING_TYPE_A) {
        return count >= 3;
    }
    if (pattern?.type === BehavioralPatternType.PLANNING_TYPE_B) {
        return count >= 10;
    }

    return false;
}

function describePattern(pattern) {
    if (pattern?.type === BehavioralPatternType.SNOOZE_SPIRAL) {
        const count = Number.isFinite(pattern?.signalCount) ? pattern.signalCount : 'multiple';
        return `This task was postponed ${count} times in the current window, so pick one concrete next action before rescheduling again.`;
    }
    if (pattern?.type === BehavioralPatternType.PLANNING_TYPE_A) {
        const count = Number.isFinite(pattern?.signalCount) ? pattern.signalCount : 'multiple';
        return `Detailed planning changes stacked up ${count} times without matching completion, so keep planning lightweight and pair it with one executable step today.`;
    }
    if (pattern?.type === BehavioralPatternType.PLANNING_TYPE_B) {
        const count = Number.isFinite(pattern?.signalCount) ? pattern.signalCount : 'multiple';
        const domains = Number.isFinite(pattern?.uniqueDomains) ? pattern.uniqueDomains : 'multiple';
        return `${count} new tasks landed across ${domains} domain${domains === 1 ? '' : 's'} before completion caught up, so plan in smaller batches and finish one before adding the next.`;
    }
    return 'Recent behavioral signals stayed mixed, so keep the next step concrete without over-interpreting the pattern.';
}

/**
 * Select the most relevant behavioral patterns for a summary surface.
 *
 * @param {Object[]} [patterns=[]] - List of raw behavioral patterns.
 * @param {Object} [options={}] - Options.
 * @param {string} [options.nowIso=null] - Current timestamp for freshness check.
 * @returns {Object[]} Sorted and filtered patterns.
 */
export function selectBehavioralPatternsForSummary(patterns = [], { nowIso = null } = {}) {
    const nowMs = parsePatternTime(nowIso) ?? Date.now();
    return toArray(patterns)
        .filter((pattern) => pattern && typeof pattern === 'object')
        .filter((pattern) => isSupportedPatternType(pattern.type))
        .filter((pattern) => pattern.eligibleForSurfacing === true)
        .filter((pattern) => pattern.confidence === 'standard' || pattern.confidence === 'high')
        .filter((pattern) => hasRepeatedEvidence(pattern))
        .filter((pattern) => isFreshPattern(pattern, nowMs))
        .sort((left, right) => {
            const leftWeight = confidenceWeight(left.confidence);
            const rightWeight = confidenceWeight(right.confidence);
            if (leftWeight !== rightWeight) return rightWeight - leftWeight;
            return (right.signalCount || 0) - (left.signalCount || 0);
        });
}

/**
 * Build a single summary notice from the most significant behavioral pattern.
 *
 * @param {Object[]} [patterns=[]] - List of raw behavioral patterns.
 * @param {Object} [options={}] - Options.
 * @param {string} [options.nowIso=null] - Current timestamp.
 * @returns {Object|null} Notice object or null if no pattern is eligible.
 */
export function buildBehavioralPatternNotice(patterns = [], { nowIso = null } = {}) {
    const selected = selectBehavioralPatternsForSummary(patterns, { nowIso });
    const pattern = selected[0];
    if (!pattern) return null;

    return {
        code: 'behavioral_pattern',
        message: describePattern(pattern),
        severity: 'info',
        evidence_source: 'behavioral_memory',
    };
}
