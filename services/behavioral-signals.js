import { createHash } from 'node:crypto';

/**
 * Behavioral Signal Classifier — passive observation of task events.
 *
 * Observes task mutations and emits derived behavioral signals based ONLY
 * on metadata (dates, counts, categories). NEVER stores raw task titles,
 * descriptions, or message text.
 *
 * Low-level signals capture derived task events.
 * Pattern signals classify the 8 behavioral-memory pattern families using
 * derived metadata only — never raw titles, descriptions, or message text.
 *
 * @module behavioral-signals
 */

// ---------------------------------------------------------------------------
// Signal Taxonomy
// ---------------------------------------------------------------------------

/**
 * Enumerated signal types the classifier can emit.
 * Each signal uses only derived metadata — never raw content.
 *
 * @readonly
 * @enum {string}
 */
export const SignalType = Object.freeze({
    /** Task due date pushed forward repeatedly — procrastination indicator */
    POSTPONE: 'postpone',
    /** Task description or checklist size changed materially — planning churn */
    SCOPE_CHANGE: 'scope_change',
    /** Subtasks added or task split — decomposition / over-planning */
    DECOMPOSITION: 'decomposition',
    /** Heavy planning activity detected without execution — avoidance */
    PLANNING_HEAVY: 'planning_heavy',
    /** Task marked complete — execution signal */
    COMPLETION: 'completion',
    /** New task created — intention captured */
    CREATION: 'creation',
    /** Task deleted — abandonment or cleanup */
    DELETION: 'deletion',
    /** Repeated postponement candidate */
    SNOOZE_SPIRAL: 'snooze_spiral',
    /** Creation volume materially exceeds completion throughput */
    COMMITMENT_OVERLOADER: 'commitment_overloader',
    /** Very old task continues to linger or only gets touched late */
    STALE_TASK_MUSEUM: 'stale_task_museum',
    /** Small/easy tasks dominate observed behavior */
    QUICK_WIN_ADDICTION: 'quick_win_addiction',
    /** Title shape suggests low-actionability */
    VAGUE_TASK_WRITER: 'vague_task_writer',
    /** Completion happens only at the deadline edge */
    DEADLINE_DAREDEVIL: 'deadline_daredevil',
    /** One category shows sustained neglect */
    CATEGORY_AVOIDANCE: 'category_avoidance',
    /** Planning activity grows without matching execution */
    PLANNING_WITHOUT_EXECUTION: 'planning_without_execution',
});

const CONFIDENCE = Object.freeze({
    LOW: 0.65,
    STANDARD: 0.8,
    HIGH: 0.92,
});

/**
 * Signal object shape returned by the classifier.
 *
 * @typedef {Object} BehavioralSignal
 * @property {string} type - One of SignalType values
 * @property {string} category - Task category if available, else 'unknown'
 * @property {string|null} projectId - Project ID if available
 * @property {number} confidence - 0.0 to 1.0 confidence in the signal
 * @property {string|null} subjectKey - Stable derived task key for aggregate detection
 * @property {object} metadata - Derived counts/ deltas only; NEVER raw titles/text
 * @property {string} timestamp - ISO timestamp of the event
 */

/**
 * Task mutation event passed into the classifier.
 *
 * @typedef {Object} TaskMutationEvent
 * @property {string} eventType - 'create' | 'update' | 'complete' | 'delete'
 * @property {string} taskId - Task identifier
 * @property {string|null} [category] - Task category if known
 * @property {string|null} [projectId] - Project ID if known
 * @property {string|null} [dueDateBefore] - Previous due date (for updates)
 * @property {string|null} [dueDateAfter] - New due date (for updates)
 * @property {number|null} [checklistCountBefore] - Previous checklist count
 * @property {number|null} [checklistCountAfter] - New checklist count
 * @property {number|null} [descriptionLengthBefore] - Previous description char count
 * @property {number|null} [descriptionLengthAfter] - New description char count
 * @property {number|null} [subtaskCountBefore] - Previous subtask count
 * @property {number|null} [subtaskCountAfter] - New subtask count
 * @property {number|null} [titleWordCount] - Derived title word count
 * @property {number|null} [titleCharacterCount] - Derived title length
 * @property {boolean|null} [hasActionVerb] - Derived actionability heuristic
 * @property {boolean|null} [smallTaskCandidate] - Derived quick-win heuristic
 * @property {number|null} [creationCompletionRatio] - Recent creation/completion ratio
 * @property {number|null} [recentCreatedCount] - Recent created count window
 * @property {number|null} [recentCompletedCount] - Recent completed count window
 * @property {number|null} [taskAgeDays] - Age of task in days
 * @property {number|null} [categoryOverdueCount] - Overdue tasks in same category
 * @property {number|null} [categoryStalenessDays] - Days since category saw progress
 * @property {number|null} [completionLeadTimeHours] - Hours before deadline at completion
 * @property {number|null} [planningComplexityScore] - Derived planning heaviness score
 * @property {number|null} [completionRateWindow] - Recent completion rate 0..1
 * @property {boolean|null} [planningSubtypeA] - Detailed planning without execution marker
 * @property {boolean|null} [planningSubtypeB] - Overload planning marker
 * @property {string} timestamp - ISO timestamp of the event
 */

// ---------------------------------------------------------------------------
// Classifier Entry Point (pure function — no side effects)
// ---------------------------------------------------------------------------

/**
 * Classifies a task mutation event into zero or more behavioral signals.
 *
 * PURE FUNCTION: reads event metadata, returns signal objects.
 * No I/O, no storage, no logging side effects.
 *
 * @param {TaskMutationEvent} event - Task mutation event
 * @returns {BehavioralSignal[]} Zero or more behavioral signals
 */
export function classifyTaskEvent(event) {
    if (!event || typeof event !== 'object') {
        return [];
    }

    const { eventType } = event;
    if (!eventType || typeof eventType !== 'string') {
        return [];
    }

    const signals = [];

    switch (eventType) {
        case 'create':
            signals.push(emitSignal(SignalType.CREATION, event));
            pushIfPresent(signals, detectCommitmentOverloader(event));
            pushIfPresent(signals, detectQuickWinAddiction(event));
            pushIfPresent(signals, detectVagueTaskWriter(event));
            pushIfPresent(signals, detectPlanningWithoutExecution(event));
            break;
        case 'update':
            // Postpone detection
            const postponeSignal = detectPostpone(event);
            if (postponeSignal) signals.push(postponeSignal);
            pushIfPresent(signals, detectSnoozeSpiral(event));

            // Scope change detection
            const scopeSignal = detectScopeChange(event);
            if (scopeSignal) signals.push(scopeSignal);

            // Decomposition detection
            const decompSignal = detectDecomposition(event);
            if (decompSignal) signals.push(decompSignal);
            pushIfPresent(signals, detectStaleTaskMuseum(event));
            pushIfPresent(signals, detectCategoryAvoidance(event));
            pushIfPresent(signals, detectVagueTaskWriter(event));
            pushIfPresent(signals, detectPlanningWithoutExecution(event));
            break;
        case 'complete':
            signals.push(emitSignal(SignalType.COMPLETION, event));
            pushIfPresent(signals, detectDeadlineDaredevil(event));
            pushIfPresent(signals, detectQuickWinAddiction(event));
            pushIfPresent(signals, detectStaleTaskMuseum(event));
            break;
        case 'delete':
            signals.push(emitSignal(SignalType.DELETION, event));
            pushIfPresent(signals, detectStaleTaskMuseum(event));
            break;
        default:
            // Unsupported event type — return empty
            break;
    }

    // Filter out any null signals from detectors that declined
    return signals.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Internal: Signal emission helper
// ---------------------------------------------------------------------------

/**
 * Emits a base signal with metadata derived from the event.
 *
 * @param {string} type - SignalType value
 * @param {TaskMutationEvent} event - Task mutation event
 * @returns {BehavioralSignal}
 * @private
 */
function emitSignal(type, event) {
    return withSubjectKey({
        type,
        category: event.category || 'unknown',
        projectId: event.projectId || null,
        confidence: 1.0,
        metadata: buildMetadata(event),
        timestamp: event.timestamp || new Date().toISOString(),
    }, event);
}

function emitPatternSignal(type, event, confidence, metadata = {}) {
    return withSubjectKey({
        type,
        category: event.category || 'unknown',
        projectId: event.projectId || null,
        confidence,
        metadata: {
            ...buildMetadata(event),
            ...metadata,
        },
        timestamp: event.timestamp || new Date().toISOString(),
    }, event);
}

export function deriveSubjectKey(taskId) {
    if (typeof taskId !== 'string' || taskId.trim() === '') {
        return null;
    }

    return createHash('sha256').update(taskId).digest('hex').slice(0, 16);
}

function withSubjectKey(signal, event) {
    return {
        ...signal,
        subjectKey: deriveSubjectKey(event?.taskId),
    };
}

function pushIfPresent(signals, signal) {
    if (signal) signals.push(signal);
}

/**
 * Builds metadata object from event — ONLY derived counts/fields,
 * NEVER raw titles, descriptions, or message text.
 *
 * @param {TaskMutationEvent} event
 * @returns {object}
 * @private
 */
function buildMetadata(event) {
    const meta = {};

    if (event.dueDateBefore !== undefined) meta.dueDateChanged = event.dueDateBefore !== event.dueDateAfter;
    if (event.checklistCountBefore !== undefined) meta.checklistDelta = (event.checklistCountAfter || 0) - (event.checklistCountBefore || 0);
    if (event.descriptionLengthBefore !== undefined) meta.descriptionDelta = (event.descriptionLengthAfter || 0) - (event.descriptionLengthBefore || 0);
    if (event.subtaskCountBefore !== undefined) meta.subtaskDelta = (event.subtaskCountAfter || 0) - (event.subtaskCountBefore || 0);
    if (event.titleWordCount !== undefined) meta.titleWordCount = event.titleWordCount;
    if (event.titleCharacterCount !== undefined) meta.titleCharacterCount = event.titleCharacterCount;
    if (event.hasActionVerb !== undefined) meta.hasActionVerb = event.hasActionVerb;
    if (event.smallTaskCandidate !== undefined) meta.smallTaskCandidate = event.smallTaskCandidate;
    if (event.creationCompletionRatio !== undefined) meta.creationCompletionRatio = event.creationCompletionRatio;
    if (event.recentCreatedCount !== undefined) meta.recentCreatedCount = event.recentCreatedCount;
    if (event.recentCompletedCount !== undefined) meta.recentCompletedCount = event.recentCompletedCount;
    if (event.taskAgeDays !== undefined) meta.taskAgeDays = event.taskAgeDays;
    if (event.categoryOverdueCount !== undefined) meta.categoryOverdueCount = event.categoryOverdueCount;
    if (event.categoryStalenessDays !== undefined) meta.categoryStalenessDays = event.categoryStalenessDays;
    if (event.completionLeadTimeHours !== undefined) meta.completionLeadTimeHours = event.completionLeadTimeHours;
    if (event.planningComplexityScore !== undefined) meta.planningComplexityScore = event.planningComplexityScore;
    if (event.completionRateWindow !== undefined) meta.completionRateWindow = event.completionRateWindow;
    if (event.planningSubtypeA !== undefined) meta.planningSubtypeA = event.planningSubtypeA;
    if (event.planningSubtypeB !== undefined) meta.planningSubtypeB = event.planningSubtypeB;

    return meta;
}

export function detectSnoozeSpiral(event) {
    const postpone = detectPostpone(event);
    if (!postpone) return null;
    return emitPatternSignal(SignalType.SNOOZE_SPIRAL, event, CONFIDENCE.STANDARD, {
        repeatedPostponeCandidate: true,
        daysMoved: postpone.metadata.daysMoved,
    });
}

export function detectCommitmentOverloader(event) {
    const ratio = Number(event.creationCompletionRatio);
    const created = Number(event.recentCreatedCount);
    const completed = Number(event.recentCompletedCount);

    if (!Number.isFinite(ratio) && !(Number.isFinite(created) && Number.isFinite(completed))) {
        return null;
    }

    const safeRatio = Number.isFinite(ratio)
        ? ratio
        : completed <= 0 && created > 0
            ? created
            : created / Math.max(completed, 1);

    if (safeRatio < 2 && created < 5) {
        return null;
    }

    return emitPatternSignal(
        SignalType.COMMITMENT_OVERLOADER,
        event,
        safeRatio >= 3 ? CONFIDENCE.HIGH : CONFIDENCE.STANDARD,
        {
            creationCompletionRatio: safeRatio,
            recentCreatedCount: Number.isFinite(created) ? created : null,
            recentCompletedCount: Number.isFinite(completed) ? completed : null,
        },
    );
}

export function detectStaleTaskMuseum(event) {
    const taskAgeDays = Number(event.taskAgeDays);
    if (!Number.isFinite(taskAgeDays) || taskAgeDays < 30) {
        return null;
    }

    return emitPatternSignal(
        SignalType.STALE_TASK_MUSEUM,
        event,
        taskAgeDays >= 60 ? CONFIDENCE.HIGH : CONFIDENCE.STANDARD,
        { taskAgeDays },
    );
}

export function detectQuickWinAddiction(event) {
    const completionLeadTimeHours = Number(event.completionLeadTimeHours);
    const smallTaskCandidate = event.smallTaskCandidate === true;
    const titleWordCount = Number(event.titleWordCount);

    const tinyTitle = Number.isFinite(titleWordCount) && titleWordCount <= 3;
    const quickTurnaround = Number.isFinite(completionLeadTimeHours) && completionLeadTimeHours <= 6;

    if (!smallTaskCandidate && !tinyTitle && !quickTurnaround) {
        return null;
    }

    return emitPatternSignal(
        SignalType.QUICK_WIN_ADDICTION,
        event,
        smallTaskCandidate && quickTurnaround ? CONFIDENCE.HIGH : CONFIDENCE.LOW,
        {
            smallTaskCandidate,
            titleWordCount: Number.isFinite(titleWordCount) ? titleWordCount : null,
            completionLeadTimeHours: Number.isFinite(completionLeadTimeHours) ? completionLeadTimeHours : null,
        },
    );
}

export function detectVagueTaskWriter(event) {
    const titleWordCount = Number(event.titleWordCount);
    const hasActionVerb = event.hasActionVerb;
    const titleCharacterCount = Number(event.titleCharacterCount);

    if (!Number.isFinite(titleWordCount) && typeof hasActionVerb !== 'boolean') {
        return null;
    }

    const vague = (typeof hasActionVerb === 'boolean' && hasActionVerb === false)
        || (Number.isFinite(titleWordCount) && titleWordCount <= 2)
        || (Number.isFinite(titleCharacterCount) && titleCharacterCount < 12);

    if (!vague) {
        return null;
    }

    return emitPatternSignal(
        SignalType.VAGUE_TASK_WRITER,
        event,
        typeof hasActionVerb === 'boolean' && hasActionVerb === false ? CONFIDENCE.HIGH : CONFIDENCE.STANDARD,
        {
            titleWordCount: Number.isFinite(titleWordCount) ? titleWordCount : null,
            hasActionVerb: typeof hasActionVerb === 'boolean' ? hasActionVerb : null,
            titleCharacterCount: Number.isFinite(titleCharacterCount) ? titleCharacterCount : null,
        },
    );
}

export function detectDeadlineDaredevil(event) {
    const completionLeadTimeHours = Number(event.completionLeadTimeHours);
    if (!Number.isFinite(completionLeadTimeHours)) {
        return null;
    }

    if (completionLeadTimeHours > 24) {
        return null;
    }

    return emitPatternSignal(
        SignalType.DEADLINE_DAREDEVIL,
        event,
        completionLeadTimeHours <= 6 ? CONFIDENCE.HIGH : CONFIDENCE.STANDARD,
        { completionLeadTimeHours },
    );
}

export function detectCategoryAvoidance(event) {
    const overdueCount = Number(event.categoryOverdueCount);
    const stalenessDays = Number(event.categoryStalenessDays);

    if ((!Number.isFinite(overdueCount) || overdueCount < 3) && (!Number.isFinite(stalenessDays) || stalenessDays < 14)) {
        return null;
    }

    return emitPatternSignal(
        SignalType.CATEGORY_AVOIDANCE,
        event,
        (Number.isFinite(overdueCount) && overdueCount >= 5) || (Number.isFinite(stalenessDays) && stalenessDays >= 21)
            ? CONFIDENCE.HIGH
            : CONFIDENCE.STANDARD,
        {
            categoryOverdueCount: Number.isFinite(overdueCount) ? overdueCount : null,
            categoryStalenessDays: Number.isFinite(stalenessDays) ? stalenessDays : null,
        },
    );
}

export function detectPlanningWithoutExecution(event) {
    const planningComplexityScore = Number(event.planningComplexityScore);
    const completionRateWindow = Number(event.completionRateWindow);
    const subtypeA = event.planningSubtypeA === true;
    const subtypeB = event.planningSubtypeB === true;
    const checklistDelta = Number(event.checklistCountAfter || 0) - Number(event.checklistCountBefore || 0);
    const descriptionDeltaAbs = Math.abs(Number(event.descriptionLengthAfter || 0) - Number(event.descriptionLengthBefore || 0));
    const subtaskDelta = Number(event.subtaskCountAfter || 0) - Number(event.subtaskCountBefore || 0);

    const planningHeavy = subtypeA
        || subtypeB
        || (Number.isFinite(planningComplexityScore) && planningComplexityScore >= 5)
        || checklistDelta >= 5
        || descriptionDeltaAbs >= 200
        || subtaskDelta >= 5;

    if (!planningHeavy) {
        return null;
    }

    const lowCompletion = !Number.isFinite(completionRateWindow) || completionRateWindow <= 0.3;
    if (!lowCompletion) {
        return null;
    }

    return emitPatternSignal(
        SignalType.PLANNING_WITHOUT_EXECUTION,
        event,
        subtypeA || subtypeB ? CONFIDENCE.HIGH : CONFIDENCE.STANDARD,
        {
            planningSubtypeA: subtypeA,
            planningSubtypeB: subtypeB,
            planningComplexityScore: Number.isFinite(planningComplexityScore) ? planningComplexityScore : null,
            completionRateWindow: Number.isFinite(completionRateWindow) ? completionRateWindow : null,
            checklistDelta,
            descriptionDeltaAbs,
            subtaskDelta,
        },
    );
}

// ---------------------------------------------------------------------------
// Postpone Detection
// ---------------------------------------------------------------------------

/**
 * Detects when a task's due date has been pushed forward.
 *
 * Fires only on forward moves (later date). No judgment on single moves —
 * repeated postponement is the pattern to watch, not individual actions.
 *
 * @param {TaskMutationEvent} event
 * @returns {BehavioralSignal|null}
 */
export function detectPostpone(event) {
    const { dueDateBefore, dueDateAfter } = event;

    // No due date change — no postpone
    if (!dueDateBefore || !dueDateAfter) {
        return null;
    }
    if (dueDateBefore === dueDateAfter) {
        return null;
    }

    const before = new Date(dueDateBefore);
    const after = new Date(dueDateAfter);

    if (isNaN(before.getTime()) || isNaN(after.getTime())) {
        return null;
    }

    // Forward move = postponement
    if (after > before) {
        return withSubjectKey({
            type: SignalType.POSTPONE,
            category: event.category || 'unknown',
            projectId: event.projectId || null,
            confidence: 0.9,
            metadata: {
                dueDateMovedForward: true,
                daysMoved: Math.round((after.getTime() - before.getTime()) / (1000 * 60 * 60 * 24)),
            },
            timestamp: event.timestamp || new Date().toISOString(),
        }, event);
    }

    // Backward move (earlier) — not a postpone
    return null;
}

// ---------------------------------------------------------------------------
// Scope Change Detection
// ---------------------------------------------------------------------------

/**
 * Detects material changes to task scope based on description length
 * or checklist size changes. Uses lengths/counts, NOT raw text.
 *
 * Distinguishes wording-only tweaks from actual scope changes.
 *
 * @param {TaskMutationEvent} event
 * @returns {BehavioralSignal|null}
 */
export function detectScopeChange(event) {
    const { descriptionLengthBefore, descriptionLengthAfter, checklistCountBefore, checklistCountAfter } = event;

    let scopeChanged = false;
    const changeDetails = {};

    // Description length change — threshold for "material" (50 chars)
    if (descriptionLengthBefore !== undefined && descriptionLengthAfter !== undefined) {
        const delta = Math.abs((descriptionLengthAfter || 0) - (descriptionLengthBefore || 0));
        if (delta >= 50) {
            scopeChanged = true;
            changeDetails.descriptionDelta = descriptionLengthAfter - descriptionLengthBefore;
            changeDetails.descriptionDeltaAbs = delta;
        }
    }

    // Checklist count change — any change in checklist size indicates scope shift
    if (checklistCountBefore !== undefined && checklistCountAfter !== undefined) {
        const delta = (checklistCountAfter || 0) - (checklistCountBefore || 0);
        if (delta !== 0) {
            scopeChanged = true;
            changeDetails.checklistDelta = delta;
        }
    }

    if (!scopeChanged) {
        return null;
    }

    return {
        subjectKey: deriveSubjectKey(event.taskId),
        type: SignalType.SCOPE_CHANGE,
        category: event.category || 'unknown',
        projectId: event.projectId || null,
        confidence: 0.8,
        metadata: {
            ...changeDetails,
        },
        timestamp: event.timestamp || new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// Decomposition Detection
// ---------------------------------------------------------------------------

/**
 * Detects when a task is being broken down into subtasks.
 *
 * Fires when subtask count increases. Does NOT judge decomposition as
 * good or bad at signal time — just records the behavioral pattern.
 *
 * @param {TaskMutationEvent} event
 * @returns {BehavioralSignal|null}
 */
export function detectDecomposition(event) {
    const { subtaskCountBefore, subtaskCountAfter } = event;

    if (subtaskCountBefore === undefined || subtaskCountAfter === undefined) {
        return null;
    }

    const delta = subtaskCountAfter - subtaskCountBefore;

    // Subtasks added — decomposition detected
    if (delta > 0) {
        return withSubjectKey({
            type: SignalType.DECOMPOSITION,
            category: event.category || 'unknown',
            projectId: event.projectId || null,
            confidence: 0.85,
            metadata: {
                subtasksAdded: delta,
                newSubtaskCount: subtaskCountAfter,
            },
            timestamp: event.timestamp || new Date().toISOString(),
        }, event);
    }

    return null;
}

// ---------------------------------------------------------------------------
// Exported: Signal registry for introspection
// ---------------------------------------------------------------------------

/**
 * Returns all supported signal types with their metadata requirements.
 * Used for introspection, documentation, and test coverage verification.
 *
 * @returns {Array<{type: string, requires: string[]}>}
 */
export function getSignalRegistry() {
    return [
        { type: SignalType.POSTPONE, requires: ['dueDateBefore', 'dueDateAfter'] },
        { type: SignalType.SCOPE_CHANGE, requires: ['descriptionLengthBefore', 'descriptionLengthAfter', 'checklistCountBefore', 'checklistCountAfter'] },
        { type: SignalType.DECOMPOSITION, requires: ['subtaskCountBefore', 'subtaskCountAfter'] },
        { type: SignalType.PLANNING_HEAVY, requires: ['eventType'] },
        { type: SignalType.COMPLETION, requires: ['eventType'] },
        { type: SignalType.CREATION, requires: ['eventType'] },
        { type: SignalType.DELETION, requires: ['eventType'] },
        { type: SignalType.SNOOZE_SPIRAL, requires: ['dueDateBefore', 'dueDateAfter'] },
        { type: SignalType.COMMITMENT_OVERLOADER, requires: ['creationCompletionRatio', 'recentCreatedCount', 'recentCompletedCount'] },
        { type: SignalType.STALE_TASK_MUSEUM, requires: ['taskAgeDays'] },
        { type: SignalType.QUICK_WIN_ADDICTION, requires: ['smallTaskCandidate', 'titleWordCount', 'completionLeadTimeHours'] },
        { type: SignalType.VAGUE_TASK_WRITER, requires: ['titleWordCount', 'titleCharacterCount', 'hasActionVerb'] },
        { type: SignalType.DEADLINE_DAREDEVIL, requires: ['completionLeadTimeHours'] },
        { type: SignalType.CATEGORY_AVOIDANCE, requires: ['categoryOverdueCount', 'categoryStalenessDays'] },
        { type: SignalType.PLANNING_WITHOUT_EXECUTION, requires: ['planningComplexityScore', 'completionRateWindow', 'planningSubtypeA', 'planningSubtypeB'] },
    ];
}
