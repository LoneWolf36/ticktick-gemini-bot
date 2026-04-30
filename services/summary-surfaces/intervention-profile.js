import { toArray } from '../shared-utils.js';

function toTimestamp(entry = {}) {
    const raw = entry.reviewedAt || entry.processedAt || entry.sentAt || null;
    if (!raw) return 0;
    const parsed = new Date(raw).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Derive an intervention profile based on user's recent engagement with suggestions.
 *
 * @param {Object[]} [processedHistory=[]] - History of processed tasks.
 * @param {Object} [options={}] - Options.
 * @param {string} [options.generatedAtIso=null] - Reference timestamp.
 * @param {number} [options.lookbackDays=7] - Days to look back.
 * @returns {Object} Intervention profile object.
 */
export function deriveInterventionProfile(processedHistory = [], { generatedAtIso = null, lookbackDays = 7 } = {}) {
    const generatedAt = new Date(generatedAtIso || new Date().toISOString()).getTime();
    const cutoff = Number.isFinite(generatedAt)
        ? generatedAt - (lookbackDays * 24 * 60 * 60 * 1000)
        : 0;

    const recentEntries = toArray(processedHistory)
        .filter((entry) => entry && typeof entry === 'object')
        .filter((entry) => {
            const timestamp = toTimestamp(entry);
            return timestamp > 0 && timestamp >= cutoff;
        });

    const approvedCount = recentEntries.filter((entry) => entry.approved === true).length;
    const skippedCount = recentEntries.filter((entry) => entry.skipped === true).length;
    const droppedCount = recentEntries.filter((entry) => entry.dropped === true).length;
    const ignoredGuidanceCount = skippedCount + droppedCount;
    const repeatedIgnoredGuidance = ignoredGuidanceCount >= 2;
    const shouldBackOff = ignoredGuidanceCount >= 3 && ignoredGuidanceCount >= approvedCount + 1;

    return {
        recentEntries,
        approvedCount,
        skippedCount,
        droppedCount,
        ignoredGuidanceCount,
        repeatedIgnoredGuidance,
        directCalloutAllowed: repeatedIgnoredGuidance,
        shouldBackOff,
        engagementPattern: shouldBackOff
            ? 'backoff'
            : repeatedIgnoredGuidance
                ? 'direct_callout'
                : approvedCount > ignoredGuidanceCount
                    ? 'engaged'
                    : 'silent',
    };
}

/**
 * Build a summary notice based on the derived intervention profile.
 *
 * @param {Object} [profile={}] - Result from deriveInterventionProfile.
 * @param {Object} [options={}] - Options.
 * @param {string} [options.workStyleMode='standard'] - Current work style mode.
 * @returns {Object|null} Notice object or null if no intervention is triggered.
 */
export function buildEngagementPatternNotice(profile = {}, { workStyleMode = 'standard' } = {}) {
    if (profile?.directCalloutAllowed !== true) return null;

    if (profile.shouldBackOff === true) {
        return {
            code: 'engagement_pattern',
            message: workStyleMode === 'urgent'
                ? 'Recent suggestions were ignored repeatedly. Cut scope and pick one restart step instead of pushing harder.'
                : 'Recent suggestions were skipped or dropped repeatedly. Keep the next step smaller or pause instead of escalating.',
            severity: 'info',
            evidence_source: 'processed_history',
        };
    }

    return {
        code: 'engagement_pattern',
        message: workStyleMode === 'urgent'
            ? 'Recent suggestions were skipped repeatedly. Give one direct next step, then stop.'
            : 'A few suggested tasks were skipped or dropped repeatedly. Name the friction once, then keep the next step smaller.',
        severity: 'info',
        evidence_source: 'processed_history',
    };
}
