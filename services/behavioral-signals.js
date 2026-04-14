/**
 * Behavioral Signal Classifier — passive observation of task events.
 *
 * Observes task mutations and emits derived behavioral signals based ONLY
 * on metadata (dates, counts, categories). NEVER stores raw task titles,
 * descriptions, or message text.
 *
 * Signals map to Product Vision patterns:
 *   - postpone          → procrastination / avoidance
 *   - scope_change      → planning churn / redefinition
 *   - decomposition     → task breakdown / over-planning
 *   - planning_heavy    → excessive planning without execution
 *   - completion        → execution signal (positive)
 *   - creation          → new task / intention
 *   - deletion          → removal / abandonment
 *
 * @module behavioral-signals
 */

// ---------------------------------------------------------------------------
// T001: Signal Taxonomy
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
});

/**
 * Signal object shape returned by the classifier.
 *
 * @typedef {Object} BehavioralSignal
 * @property {string} type - One of SignalType values
 * @property {string} category - Task category if available, else 'unknown'
 * @property {string|null} projectId - Project ID if available
 * @property {number} confidence - 0.0 to 1.0 confidence in the signal
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
 * @property {string} timestamp - ISO timestamp of the event
 */

// ---------------------------------------------------------------------------
// T002: Classifier Entry Point (pure function — no side effects)
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
            break;
        case 'update':
            // T003: Postpone detection
            const postponeSignal = detectPostpone(event);
            if (postponeSignal) signals.push(postponeSignal);

            // T004: Scope change detection
            const scopeSignal = detectScopeChange(event);
            if (scopeSignal) signals.push(scopeSignal);

            // T005: Decomposition detection
            const decompSignal = detectDecomposition(event);
            if (decompSignal) signals.push(decompSignal);
            break;
        case 'complete':
            signals.push(emitSignal(SignalType.COMPLETION, event));
            break;
        case 'delete':
            signals.push(emitSignal(SignalType.DELETION, event));
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
    return {
        type,
        category: event.category || 'unknown',
        projectId: event.projectId || null,
        confidence: 1.0,
        metadata: buildMetadata(event),
        timestamp: event.timestamp || new Date().toISOString(),
    };
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

    return meta;
}

// ---------------------------------------------------------------------------
// T003: Postpone Detection
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
        return {
            type: SignalType.POSTPONE,
            category: event.category || 'unknown',
            projectId: event.projectId || null,
            confidence: 0.9,
            metadata: {
                dueDateMovedForward: true,
                daysMoved: Math.round((after.getTime() - before.getTime()) / (1000 * 60 * 60 * 24)),
            },
            timestamp: event.timestamp || new Date().toISOString(),
        };
    }

    // Backward move (earlier) — not a postpone
    return null;
}

// ---------------------------------------------------------------------------
// T004: Scope Change Detection
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
// T005: Decomposition Detection
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
        return {
            type: SignalType.DECOMPOSITION,
            category: event.category || 'unknown',
            projectId: event.projectId || null,
            confidence: 0.85,
            metadata: {
                subtasksAdded: delta,
                newSubtaskCount: subtaskCountAfter,
            },
            timestamp: event.timestamp || new Date().toISOString(),
        };
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
    ];
}
