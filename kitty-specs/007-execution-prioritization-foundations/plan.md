# 007-execution-prioritization-foundations Implementation Plan

**Feature**: Execution Prioritization Foundations
**Created**: 2026-03-10
**Status**: Ready for Planning -> Work Packages

## Product Vision Alignment Contract

This implementation plan is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This feature is the policy core of the product vision: the assistant must help the user stop mistaking motion for progress and consistently identify work that actually matters.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Rank leverage, goal alignment, and consequential progress ahead of low-value busywork by default.
- Use honest degraded behavior when the system cannot know what matters; ask or expose uncertainty rather than inventing precision.
- Allow exceptions only for clearly justified blockers, urgent real-world constraints, or capacity protection.

**Reject or revise this artifact if**:
- The ranking model optimizes for due dates, small-task count, or completion volume over meaningful progress.
- The implementation hard-codes the user’s values instead of consuming explicit goal context.
- The rationale hides uncertainty behind confident coaching language.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission is the judgment engine for what matters. It must prevent the product's biggest failure mode: confidently steering the user toward the wrong work. Ranking must favor leverage, long-term goals, due pressure, and realistic execution while suppressing busywork that merely feels productive.

### Required Product Behavior For This Mission

- The active plan is capped and focused, usually no more than three tasks.
- At least one long-term-goal-aligned task is favored when available and plausible for the day.
- Low-priority busywork is deprioritized when higher-leverage work exists.
- When metadata is weak, ranking degrades honestly and avoids pretending to know more than it does.

### Cross-Mission Dependency And Drift Risk

This mission depends on task state from 001-005 and feeds 006 daily planning, 008 urgent mode, and 009 behavioral reflection. If this mission is wrong, the whole product can become motion-as-progress automation.

### Evidence Required Before Any WP Approval

Every implement-review cycle for this mission must produce reviewer-visible evidence for all of the following:

1. The specific Product Vision clause or behavioral scope section served by the change.
2. The local FR, NFR, plan step, task, or WP requirement implemented by the change.
3. The concrete user-visible behavior that changed, including whether the change affects capture, clarification, planning, ranking, intervention, reflection, recovery, or behavioral memory.
4. The anti-drift rule the change preserves: not a passive task manager, not generic reminders, not over-planning support, not busywork optimization, not false certainty, and not SaaS scope expansion.
5. The automated test, regression script, manual transcript, or inspection evidence that proves the behavior.
6. The downstream missions that rely on this behavior and what would break if it drifted.

### Complete 001-009 Acceptance Criteria

After all WPs in missions 001 through 009 have passed implementation, review, and mission-level acceptance, the integrated product must satisfy every item below. If any item is not demonstrably true, the 001-009 chain is not complete.

1. The user can capture clear, vague, multi-task, checklist, recurring, and mutation requests safely through the accepted pipeline without legacy path drift.
2. Ambiguous or destructive actions clarify or fail closed instead of guessing.
3. The daily plan usually contains no more than three tasks, is realistic for the user context, and includes long-term-goal work when such work exists and is plausible.
4. The system distinguishes important work from low-value busywork and actively avoids rewarding motion-as-progress.
5. Urgent mode is temporary, minimal, direct, and action-oriented; it is not the default tone and it does not mutate TickTick state unless the user explicitly asks for a task operation.
6. Weak behavioral or priority inference is never presented as fact. The assistant asks, labels uncertainty, or stays quiet.
7. Behavioral memory stores derived signals only, uses retention limits, and supports inspection/reset so memory remains a coaching aid rather than surveillance.
8. Morning start stays short; end-of-day reflection stays brief, context-aware, and non-punitive.
9. Ignored guidance causes adaptation or backing off, not louder nagging.
10. The implementation avoids MVP scope creep: no auth, billing, rate limiting, multi-tenant isolation, or SaaS infrastructure unless an accepted spec explicitly requires it.
11. User-facing copy is compact, concrete, non-judgmental, and oriented toward the next useful action.
12. No raw user message, raw task title, or raw task description is persisted in long-term behavioral memory.

### Mandatory Rejection Conditions

A reviewer must reject or reopen work in this mission if any of these are true:

- The change can pass local tests while still encouraging list management instead of task execution.
- The assistant accepts the user's first input as correct when the spec requires challenge, clarification, or safe failure.
- The change increases verbosity, ceremony, or planning overhead without improving action clarity or prioritization.
- The change optimizes low-value tasks, cosmetic organization, or generic reminders while ignoring meaningful progress.
- The change presents weak inference as certainty or invents goals, constraints, priorities, or behavioral patterns.
- The change stores raw user/task content in behavioral memory or logs where the mission only allows derived signals.
- The change introduces auth, billing, rate limiting, multi-tenant isolation, or platform-scale infrastructure not accepted by spec.
- The reviewer cannot trace the change from Product Vision -> spec/plan/task -> code/docs -> test evidence.

### Claim Boundary

When this mission is marked done, the claim is not merely that its files changed or tests passed. The claim is that this mission now contributes its defined role to the complete behavioral support system. The stronger statement, "after running 001 through 009 the product exactly matches the vision", is only valid when every mission enforces this contract, every WP has review evidence, and a final mission review confirms spec-to-code-to-test-to-product-vision fidelity across the whole chain.

## Overview

This plan establishes one shared prioritization policy for recommendation surfaces in the bot. The goal is to define a leverage-first ranking module that is user-owned, recovery-aware, and reusable by later features such as `/briefing`, `/weekly`, and state-aware recommendations.

This track is intentionally foundational. It should create the ranking contract and its tests without trying to ship the full UX of work-style input, urgent mode, or behavioral reflection in the same step.

## Alignment Decisions

- **Single policy source**: Prioritization logic should live in one shared service or domain module, not inside command handlers or summary formatters.
- **User-owned meaning**: The ranking model should consume goals and life themes from explicit user context rather than silently imposing a fixed value system.
- **Leverage-first with explicit exceptions**: Recovery, maintenance, and enabling work can outrank deep work only for clear blocker, urgency, or execution-capacity reasons.
- **Fail-honest behavior**: If leverage is ambiguous, the system should degrade to consequence and urgency rather than pretending precise strategic insight.
- **No state coupling yet**: This track should define extension points for work-style state and urgent mode, but the full state resolver belongs to `008`.
- **No behavioral inference yet**: This track must not depend on `009` memory or anti-procrastination signals.

## Technical Context

- **Language/Version**: Node.js 18+ with ESM
- **Primary Dependencies**: Existing bot/services stack only; no new external dependency required
- **Storage**: Existing user context and live TickTick task data
- **Testing**: `node --test` plus regression harness in `tests/`
- **Target Platform**: Telegram bot backend running in Node.js
- **Primary Integration Points**: `services/`, `bot/commands.js`, later `services/scheduler.js`

## Proposed Implementation Shape

### New Shared Module

Create one shared prioritization module, likely in `services/`, responsible for:

- turning tasks plus user context into ranked candidates
- applying leverage-first ordering rules
- identifying justified exceptions for maintenance and enabling work
- returning a short rationale for top-ranked items

The initial module should be pure and testable. It should accept explicit inputs and return deterministic outputs. It should not fetch state, talk to Telegram, or read memory stores on its own.

### Inputs

The first implementation should rank from:

- active TickTick tasks
- explicit user context and goal/theme definitions
- task-level urgency and blocker signals already available from task data

It should be designed so `008` can later inject work-style and urgent-mode modifiers without rewriting the ranking core.

### Outputs

The module should return:

- ranked candidate list
- top recommendation
- concise rationale fields suitable for formatter consumption
- explicit markers when ranking fell back to lower-confidence heuristics

## Phase 1: Define The Ranking Contract

- [ ] Define the shared prioritization input shape
- [ ] Define the ranked-candidate output shape
- [ ] Define the rationale contract for top recommendations
- [ ] Document the exact exception cases that allow maintenance or enabling work to outrank deeper work
- [ ] Identify the current source of user-owned goals and themes in the repo and formalize the contract used by ranking

## Phase 2: Implement The Core Policy Engine

- [ ] Add the shared prioritization service in `services/`
- [ ] Implement leverage-first ordering rules
- [ ] Implement honest fallback behavior for ambiguous leverage
- [ ] Implement exception handling for blocker removal, urgent maintenance, and enabling work
- [ ] Keep the module pure and deterministic

## Phase 3: Add Narrow Integration Points

- [ ] Add one thin integration point for recommendation consumers to call the shared prioritization service
- [ ] Do not rewrite `/briefing` or `/weekly` in this track; only prepare the reusable service contract they will consume later
- [ ] Ensure command handlers and summary surfaces can adopt the module without copying logic

## Phase 4: Verification And Regression

- [ ] Add unit tests for core ranking behavior
- [ ] Add regression tests for high-leverage vs admin ranking
- [ ] Add regression tests for justified maintenance and enabling exceptions
- [ ] Add regression tests for ambiguous-leverage fallback behavior
- [ ] Add regression tests for rationale generation so top recommendations remain legible

## Expected File Touches

- `services/` for the shared prioritization module
- `tests/` for unit and regression coverage
- possibly `services/user_context.example.js` or related context-loading helpers if the goal/theme contract needs tightening
- no required changes yet to scheduler or briefing logic beyond future-ready integration seams

## Out Of Scope

- Full implementation of work-style state and urgent mode
- Behavioral reflection or anti-procrastination callouts
- Rewriting `/briefing` and `/weekly`
- New storage systems or long-term memory design

## Work Package Outline

- **WP01**: Define ranking contract and context inputs
- **WP02**: Implement core leverage-first ranking service
- **WP03**: Implement rationale generation and exception handling
- **WP04**: Add regression coverage and integration seam verification

## Execution Notes

- Start with `WP01` and `WP02` before touching any command or summary surface
- Keep the service pure so `008` and `006` can adopt it cleanly
- Prefer contract tests over broad end-to-end changes in this track
- Do not let this track silently redefine user goals from inferred behavior
