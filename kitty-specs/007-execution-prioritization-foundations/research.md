# Research: 007 Execution Prioritization Foundations

## Scope

This document backfills the Phase 0 research scaffold for feature `007-execution-prioritization-foundations`. The feature is already merged, so this research captures the current repository state, the policy gaps that motivated the feature, and the architectural seams needed for follow-on work.

## Research Questions

1. Where does prioritization behavior currently live?
2. What inputs already exist for leverage-first ranking?
3. What forms of policy drift are already visible in the repo?
4. What must remain out of scope for this feature because adjacent specs own it?
5. What minimal shared data contract is required before implementation work packages begin?

## Findings

### 1. Prioritization is currently split across prompts and heuristics

The repository already contains recommendation behavior, but it is not centralized. `services/gemini.js` defines separate prompt paths for daily briefing, weekly digest, and reorg behavior, each with its own implicit prioritization language and ranking assumptions. The reorg path also contains deterministic fallback logic and task compaction heuristics keyed off keywords such as `system design`, `study`, `bank`, and `grocery` rather than a reusable domain policy. See `services/gemini.js:29`, `services/gemini.js:62`, `services/gemini.js:105`, `services/gemini.js:518`, `services/gemini.js:556`, and `services/gemini.js:604`.

### 2. A second prioritization layer already exists in command execution

`bot/commands.js` contains a separate policy sweep that repairs AI-generated actions by inferring priority labels and target projects from task text. This is useful as a safety net, but it duplicates business logic that also exists in Gemini fallback normalization. The duplication confirms the need for one shared prioritization module instead of prompt-local and command-local policies. See `bot/commands.js:601`, `bot/commands.js:617`, `bot/commands.js:624`, `bot/commands.js:638`, and `bot/commands.js:719`.

### 3. The repo already has explicit user-owned context, but not a structured ranking contract

The system loads `USER_CONTEXT` from a gitignored local file or environment variable. The example context explicitly includes goal ordering and behavioral patterns, which means the product already has a source for user-owned meaning. The current issue is not missing context; it is that the ranking engine consumes this meaning only indirectly through prompts rather than through a shared contract. See `services/gemini.js:12`, `services/gemini.js:15`, `services/user_context.example.js:4`, and `services/user_context.example.js:12`.

### 4. Sensitive-content preservation is already a hard constraint

The current command execution path blocks content rewrites when a task appears to contain sensitive information. That constraint matters for `007` because ranking and rationale logic must not require rewriting task content to function. The recommendation layer should read enough metadata to rank safely without expanding the privacy surface. See `bot/commands.js:782` and `bot/commands.js:819`.

### 5. Adjacent feature boundaries are already defined and should be preserved

Feature `006` requires briefing and weekly surfaces to inherit shared foundation policy rather than invent local rules. Feature `008` owns work-style and urgent-mode state resolution, including precedence rules and unknown-state behavior. Feature `009` owns behavioral memory, retention, and observational reflection constraints. `007` therefore needs to define the base ranking contract and extension points, but it should not absorb state resolution or behavioral inference. See `006-briefing-weekly-modernization/spec.md:77`, `008-work-style-and-urgent-mode/spec.md:73`, `008-work-style-and-urgent-mode/spec.md:76`, `009-behavioral-signals-and-memory/spec.md:71`, and `009-behavioral-signals-and-memory/spec.md:77`.

## Implications

- A pure prioritization service belongs in `services/` and should be callable from command handlers, summary generation, and scheduler paths.
- The service should accept explicit user goal/theme context, active tasks, and optional ranking modifiers, then return ranked candidates plus rationale metadata.
- Existing keyword heuristics can be retained temporarily as honest fallback behavior, but they must move behind a shared contract so they stop drifting independently.
- The module should expose hooks for `008` state modifiers and `009` reflection constraints without depending on either feature at construction time.

## Constraints

- The feature spec requires leverage-first ranking, recovery-aware exceptions, rationale output, unknown-state support, and honest degradation when leverage is ambiguous. See `spec.md:64-73`.
- The plan requires one shared module, explicit user-owned meaning, fail-honest behavior, and no direct dependence on `008` or `009`. See `plan.md:15-20`, `plan.md:33-54`, and `plan.md:109-116`.
- The current repository still uses legacy prompt-driven briefing and weekly methods, so the shared ranking engine should be designed to integrate incrementally rather than forcing a full summarization rewrite in this track.

## Recommended Architecture Direction

1. Introduce a pure domain module in `services/`, for example `execution-prioritization.js`.
2. Define one normalized candidate input shape sourced from TickTick tasks and explicit user context.
3. Convert existing keyword-based fallback logic into a clearly marked fallback policy inside that module.
4. Return rationale data as structured fields instead of prose-only prompt output.
5. Let `006` consume the module for summary policy, `008` inject work-style and urgent modifiers, and `009` remain downstream-only for passive reflection.

## Open Questions For Implementation

- Should goal/theme context remain a free-form string in v1, or should the service also accept an optional parsed theme array when available?
- How should blocker, enabling, and recovery signals be represented when TickTick tasks do not encode them explicitly?
- Should the first implementation rank all active tasks or only a filtered candidate window similar to `_compactReorgTasks()`?

## Conclusion

The repository already contains enough raw inputs and enough duplicated heuristics to justify `007` as a true foundation feature. The main architectural need is not more prompt logic. It is a shared, deterministic prioritization contract that sits above prompt wording and below command or scheduler surfaces.

## Adoption Notes

- `006` should consume structured `RankingDecision` output for briefing and weekly selection rather than re-deriving its own local priority buckets.
- `008` should inject `workStyleMode`, `urgentMode`, and any future state provenance into `RankingContext`, but it should not redefine base leverage ordering or exception reasons.
- `009` should treat `RecommendationResult` as an upstream input only. Behavioral memory may explain or reflect on ranking outcomes, but it should not mutate core ranking policy inside the same module.
- Downstream consumers should prefer the shared service even when they continue to format their own prompt text. Prompt wording may vary; the ranking contract should not.
