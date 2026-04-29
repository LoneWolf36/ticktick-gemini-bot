// TEMPLATE — copy this to user_context.js and fill in YOUR personal details.
// user_context.js is gitignored. This example file IS committed.

export const USER_TIMEZONE = 'Europe/Dublin';

export const USER_CONTEXT = `You are my AI accountability partner and task analyst.
You deeply understand my situation, goals, and behavioral tendencies.

SITUATION:
- [Your current life situation — job, studies, location, major constraints]
- [e.g. "Final year CS student at University of X, applying for graduate roles"]
- [e.g. "Working full-time as a developer, building a side project"]
// Why this matters: context shapes which tasks are truly important vs busywork.
// The assistant uses this to separate needle-movers from motion.

GOALS (priority order):
1. [Your most important goal — the one everything else should serve]
   // e.g. "Ship my side project to first paying customers by June"
2. [Second priority]
   // e.g. "Complete my certification — required for the roles I want"
3. [Third priority]
   // e.g. "Exercise 3x/week — health compounds everything else"
4. [Ongoing commitments that shouldn't dominate]
   // e.g. "Weekly team standup, monthly reports"
// Why this matters: the assistant uses goal alignment to prioritize.
// Tasks that serve goals 1-3 are needle-movers. Everything else is secondary.

BEHAVIORAL PATTERNS (critical for accountability):
- [Honest things you know about yourself — what do you avoid? When are you sharpest?]
- [e.g. "Tends to over-plan instead of executing — planning feels productive but isn't"]
- [e.g. "Procrastinates on deep work, defaults to easy admin tasks"]
- [e.g. "Most productive in the morning, fades after 3pm"]
- [e.g. "When overwhelmed, creates more lists instead of doing the thing"]
// Why this matters: the assistant should call out patterns, not just manage tasks.
// These are the patterns the system is designed to help you recognize and interrupt.

PRIORITIZATION SIGNALS:
- [What makes you feel like you're avoiding a task?]
- [e.g. "If a task has been pending for 3+ days, I'm probably avoiding it for a reason"]
- [e.g. "I tend to mark everything as urgent — nothing is actually urgent"]
// Why this matters: the assistant uses these to calibrate urgency vs importance.
// This section helps the system distinguish real deadlines from self-imposed pressure.

RECOVERY PATTERNS:
- [What helps you get back on track when you fall off?]
- [e.g. "When I'm overwhelmed, narrowing to ONE thing helps more than expanding the list"]
- [e.g. "I respond well to direct callouts, not gentle reminders"]
- [e.g. "After a bad day, I need permission to reset — not guilt"]
// Why this matters: the assistant should know when to challenge vs when to step back.
// Recovery patterns prevent the system from becoming a source of guilt.

ACCOUNTABILITY STYLE:
- [How do you want the AI to talk to you? Gentle or blunt?]
- [e.g. "Direct callouts — don't sugarcoat avoidance"]
- [e.g. "Structured weekly reviews with visible progress tracking"]
- [e.g. "Flag when I've been ignoring high-priority items for too long"]
// Why this matters: trust requires honesty matched to the user's actual preferences.`;

// ============================================================================
// STRUCTURED CONFIGURATION — deterministic rules the code reads, never guesses.
// This replaces all hardcoded keyword lists, project names, and magic numbers.
// ============================================================================

/**
 * PROJECT_POLICY maps your TickTick projects to behavior categories.
 * The system uses this to set priority caps and make safe defaults.
 *
 * Rules:
 * - strategic: eligible for Core Goal (priority 5) if action verb + strong evidence
 * - admin: cap at Important (3), default Life Admin (1)
 * - routine: cap at Life Admin (1), never Core Goal
 * - uncategorized (default): cap at Important (3), default Life Admin (1)
 *
 * Aliases help the system match tasks when project is not explicitly set.
 */
export const PROJECT_POLICY = {
    projects: [
        // Strategic — needle-movers, goal-aligned work
        { match: 'Career & Job Search', category: 'strategic', aliases: ['career', 'job', 'interview', 'cv', 'resume'] },
        { match: 'Studies', category: 'strategic', aliases: ['study', 'course', 'exam', 'degree', 'certification'] },
        { match: 'Coaching Business', category: 'strategic', aliases: ['coaching', 'client', 'business'] },
        { match: 'Growth & Learning', category: 'strategic', aliases: ['learn', 'skill', 'growth'] },

        // Admin — necessary but not needle-moving
        { match: 'Life Admin', category: 'admin', aliases: ['bill', 'bank', 'passport', 'tax', 'insurance'] },
        { match: 'Reference', category: 'admin', aliases: ['reference', 'doc', 'link'] },
        { match: 'Review Later', category: 'admin', aliases: ['review', 'read later'] },

        // Routine — recurring, lifestyle, low leverage
        { match: 'Routines & Tracking', category: 'routine', aliases: ['routine', 'habit', 'track', 'log'] },
        { match: 'Recipes', category: 'routine', aliases: ['recipe', 'cook', 'food', 'meal'] },
        { match: 'Shopping', category: 'routine', aliases: ['shop', 'buy', 'grocery', 'purchase'] },
        { match: 'Health & Life', category: 'routine', aliases: ['health', 'therapy', 'doctor', 'gym', 'exercise'] },
    ],
    categories: {
        strategic: { priorityCap: 5, defaultPriority: 3 },
        admin: { priorityCap: 3, defaultPriority: 1 },
        routine: { priorityCap: 1, defaultPriority: 1 },
        uncategorized: { priorityCap: 3, defaultPriority: 1 },
    },
};

/**
 * KEYWORDS used for intent detection, urgency inference, and follow-up binding.
 * All hardcoded lists from the codebase are consolidated here.
 */
export const KEYWORDS = {
    urgent: ['today', 'urgent', 'asap', 'tomorrow', 'tonight', 'now', 'deadline'],
    stopWords: [
        'a', 'an', 'and', 'avoid', 'current', 'for', 'from', 'goal', 'goals', 'growth',
        'land', 'notes', 'now', 'of', 'order', 'priority', 'protect', 'role', 'senior',
        'stabilize', 'the', 'to', 'urgent', 'with', 'your',
    ],
    followupPronouns: ['it', 'this', 'that', 'them', 'its'],
    followupTimeShifts: ['tomorrow', 'next week', 'instead', 'postpone', 'reschedule', 'move to', 'change to', 'later', 'earlier', 'rename'],
};

/**
 * VERBS recognized as action signals in task titles.
 * Used to distinguish "plan" (vague) from "apply for" (action).
 * Pipe-delimited string for regex construction.
 */
export const VERB_LIST = 'add|analyze|apply|approve|arrange|assemble|assess|assign|assist|attach|authorize|block|book|build|buy|call|cancel|capture|celebrate|check|claim|clean|coach|collect|communicate|complete|compose|configure|confirm|consolidate|construct|contribute|convert|create|customize|debug|decide|define|delegate|delete|destroy|develop|discard|discover|discuss|distribute|do|document|download|draft|draw|edit|educate|email|emit|encourage|engage|enhance|ensure|enter|establish|evaluate|examine|execute|exercise|explain|explore|facilitate|fetch|file|finalize|finish|fix|follow|force|format|generate|get|give|go|govern|group|guide|have|identify|implement|import|improve|increase|inform|initiate|inspect|install|integrate|interact|investigate|join|keep|launch|lead|learn|limit|locate|log|make|manage|measure|meet|merge|modify|monitor|navigate|negotiate|notify|offer|operate|optimize|organize|outline|pack|participate|pay|perform|persuade|plan|prepare|present|preserve|prioritize|process|produce|practice|publish|purchase|read|receive|record|reduce|refactor|register|reject|release|remove|rename|renew|repair|reply|report|request|resolve|review|rewrite|scaffold|schedule|search|secure|segment|send|set|setup|share|sign|sort|split|start|stop|store|streamline|study|submit|subscribe|suggest|support|take|talk|test|track|train|transfer|transform|translate|update|upload|utilize|verify|visit|wait|walk|warn|watch|write';

/**
 * SCORING weights and thresholds used by the priority engine.
 * All magic numbers from the codebase are extracted here with documentation.
 *
 * Rationale for defaults:
 * - coreGoal weight 36: highest tier, must exceed sum of lower tiers
 * - orderBoosts [8,4,2]: diminishing returns for goal order beyond top 3
 * - urgentModeBoosts high=70: urgent mode should significantly reorder priorities
 * - priorityOverrideScore 10000: ensures manual overrides always win
 * - capacityProtectionScore 120: health/recovery tasks get strong protection
 * - highUrgencyHours 24: due within 24h = high urgency
 * - mediumUrgencyHours 72: due within 72h = medium urgency
 */
export const SCORING = {
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
