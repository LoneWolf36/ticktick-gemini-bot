import { SignalType } from './behavioral-signals.js';

export const PatternConfidence = Object.freeze({
    LOW: 'low',
    STANDARD: 'standard',
    HIGH: 'high',
});

export const BehavioralPatternType = Object.freeze({
    SNOOZE_SPIRAL: 'snooze_spiral',
    PLANNING_TYPE_A: 'planning_without_execution_type_a',
    PLANNING_TYPE_B: 'planning_without_execution_type_b',
});

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.BEHAVIORAL_SIGNAL_RETENTION_DAYS || '30', 10) || 30);

function parseSignalTime(signal) {
    const signalMs = Date.parse(signal?.timestamp || '');
    return Number.isFinite(signalMs) ? signalMs : null;
}

function isWithinRetentionWindow(signal, nowMs = Date.now()) {
    const signalMs = parseSignalTime(signal);
    return signalMs !== null && signalMs >= nowMs - (RETENTION_DAYS * DAY_MS);
}

function withEligibility(pattern) {
    return {
        ...pattern,
        eligibleForSurfacing: pattern.confidence === PatternConfidence.STANDARD || pattern.confidence === PatternConfidence.HIGH,
    };
}

function downgradeConfidence(confidence) {
    if (confidence === PatternConfidence.HIGH) return PatternConfidence.STANDARD;
    if (confidence === PatternConfidence.STANDARD) return PatternConfidence.LOW;
    return PatternConfidence.LOW;
}

function sortSignals(signals) {
    return [...signals].sort((left, right) => parseSignalTime(left) - parseSignalTime(right));
}

function toDayKey(signal) {
    return String(signal.timestamp || '').slice(0, 10);
}

function toWeekKey(signal) {
    const signalMs = parseSignalTime(signal);
    if (signalMs === null) return null;
    const date = new Date(signalMs);
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utcDate - yearStart) / DAY_MS) + 1) / 7);
    return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function buildSnoozePatterns(signals) {
    const postponeSignals = signals.filter((signal) => signal.type === SignalType.POSTPONE && signal.subjectKey);
    const bySubject = new Map();
    for (const signal of postponeSignals) {
        const list = bySubject.get(signal.subjectKey) || [];
        list.push(signal);
        bySubject.set(signal.subjectKey, list);
    }

    const patterns = [];
    for (const [subjectKey, subjectSignals] of bySubject.entries()) {
        const count = subjectSignals.length;
        if (count < 2) continue;

        let confidence = PatternConfidence.LOW;
        if (count >= 4) {
            confidence = PatternConfidence.HIGH;
        } else if (count >= 3) {
            confidence = PatternConfidence.STANDARD;
        }

        patterns.push(withEligibility({
            type: BehavioralPatternType.SNOOZE_SPIRAL,
            confidence,
            signalCount: count,
            subjectKey,
            windowStart: sortSignals(subjectSignals)[0].timestamp,
            windowEnd: sortSignals(subjectSignals)[subjectSignals.length - 1].timestamp,
        }));
    }

    return patterns;
}

function buildTypeAPattern(signals) {
    const planningSignals = sortSignals(signals.filter((signal) => (
        signal.type === SignalType.PLANNING_WITHOUT_EXECUTION
        && signal.metadata?.planningSubtypeA === true
    )));

    if (planningSignals.length < 2) {
        return null;
    }

    const completionSignals = signals.filter((signal) => signal.type === SignalType.COMPLETION);
    let best = null;

    for (let startIndex = 0; startIndex < planningSignals.length; startIndex += 1) {
        const startMs = parseSignalTime(planningSignals[startIndex]);
        if (startMs === null) continue;
        const windowSignals = planningSignals.filter((signal) => {
            const signalMs = parseSignalTime(signal);
            return signalMs !== null && signalMs >= startMs && signalMs <= startMs + WEEK_MS;
        });
        const completionCount = completionSignals.filter((signal) => {
            const signalMs = parseSignalTime(signal);
            return signalMs !== null && signalMs >= startMs && signalMs <= startMs + WEEK_MS;
        }).length;

        if (completionCount > 0) {
            continue;
        }

        if (!best || windowSignals.length > best.windowSignals.length) {
            best = { startMs, windowSignals };
        }
    }

    if (!best || best.windowSignals.length < 2) {
        return null;
    }

    let confidence = PatternConfidence.LOW;
    if (best.windowSignals.length >= 4) {
        confidence = PatternConfidence.HIGH;
    } else if (best.windowSignals.length >= 3) {
        confidence = PatternConfidence.STANDARD;
    }

    const bestWindowStartMs = parseSignalTime(best.windowSignals[0]);
    const bestWindowEndMs = parseSignalTime(best.windowSignals[best.windowSignals.length - 1]);
    const replanningSignalsInWindow = signals.filter((signal) => {
        if (signal?.type !== SignalType.SCOPE_CHANGE && signal?.type !== SignalType.DECOMPOSITION) {
            return false;
        }
        const signalMs = parseSignalTime(signal);
        if (signalMs === null || bestWindowStartMs === null || bestWindowEndMs === null) {
            return false;
        }
        return signalMs >= bestWindowStartMs && signalMs <= bestWindowEndMs;
    });

    if (replanningSignalsInWindow.length > 0) {
        confidence = downgradeConfidence(confidence);
    }

    return withEligibility({
        type: BehavioralPatternType.PLANNING_TYPE_A,
        confidence,
        signalCount: best.windowSignals.length,
        windowStart: best.windowSignals[0].timestamp,
        windowEnd: best.windowSignals[best.windowSignals.length - 1].timestamp,
        replanningSignalCount: replanningSignalsInWindow.length,
        ambiguousReplanning: replanningSignalsInWindow.length > 0,
    });
}

function summarizeCreationWindow(signals, completionSignals) {
    const createdCount = signals.length;
    const uniqueDomains = new Set(signals.map((signal) => `${signal.projectId || 'none'}:${signal.category || 'unknown'}`)).size;
    const windowStart = signals[0].timestamp;
    const windowEnd = signals[signals.length - 1].timestamp;
    const startMs = parseSignalTime(signals[0]);
    const endMs = parseSignalTime(signals[signals.length - 1]);
    const completedCount = completionSignals.filter((signal) => {
        const signalMs = parseSignalTime(signal);
        return signalMs !== null && startMs !== null && endMs !== null && signalMs >= startMs && signalMs <= endMs;
    }).length;
    const completionRate = createdCount === 0 ? 0 : completedCount / createdCount;

    let confidence = null;
    if (createdCount >= 14 && uniqueDomains >= 3 && completionRate < 0.15) {
        confidence = PatternConfidence.HIGH;
    } else if (createdCount >= 10 && uniqueDomains >= 3 && completionRate < 0.3) {
        confidence = PatternConfidence.STANDARD;
    } else if (createdCount >= 6 && uniqueDomains >= 2 && completionRate < 0.5) {
        confidence = PatternConfidence.LOW;
    }

    if (!confidence) {
        return null;
    }

    return withEligibility({
        type: BehavioralPatternType.PLANNING_TYPE_B,
        confidence,
        signalCount: createdCount,
        uniqueDomains,
        completionRate,
        windowStart,
        windowEnd,
    });
}

function buildTypeBPattern(signals) {
    const creationSignals = sortSignals(signals.filter((signal) => signal.type === SignalType.CREATION));
    if (creationSignals.length < 6) {
        return null;
    }

    const completionSignals = signals.filter((signal) => signal.type === SignalType.COMPLETION);
    const grouped = new Map();

    for (const signal of creationSignals) {
        const dayKey = toDayKey(signal);
        const weekKey = toWeekKey(signal);
        if (dayKey) {
            const key = `day:${dayKey}`;
            const list = grouped.get(key) || [];
            list.push(signal);
            grouped.set(key, list);
        }
        if (weekKey) {
            const key = `week:${weekKey}`;
            const list = grouped.get(key) || [];
            list.push(signal);
            grouped.set(key, list);
        }
    }

    const candidates = [...grouped.values()]
        .map((windowSignals) => summarizeCreationWindow(windowSignals, completionSignals))
        .filter(Boolean)
        .sort((left, right) => {
            const weight = { high: 3, standard: 2, low: 1 };
            if (weight[right.confidence] !== weight[left.confidence]) {
                return weight[right.confidence] - weight[left.confidence];
            }
            return right.signalCount - left.signalCount;
        });

    return candidates[0] || null;
}

export function detectBehavioralPatterns(signals = [], { nowMs = Date.now() } = {}) {
    try {
        const validSignals = Array.isArray(signals)
            ? signals.filter((signal) => signal && typeof signal === 'object' && typeof signal.type === 'string' && isWithinRetentionWindow(signal, nowMs))
            : [];

        const patterns = [
            ...buildSnoozePatterns(validSignals),
        ];

        const typeAPattern = buildTypeAPattern(validSignals);
        if (typeAPattern) {
            patterns.push(typeAPattern);
        }

        const typeBPattern = buildTypeBPattern(validSignals);
        if (typeBPattern) {
            patterns.push(typeBPattern);
        }

        return patterns.sort((left, right) => {
            const weight = { high: 3, standard: 2, low: 1 };
            if (weight[right.confidence] !== weight[left.confidence]) {
                return weight[right.confidence] - weight[left.confidence];
            }
            return (right.signalCount || 0) - (left.signalCount || 0);
        });
    } catch {
        return [];
    }
}
