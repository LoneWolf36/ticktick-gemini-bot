# 007-execution-prioritization-foundations Implementation Plan

**Feature**: Execution Prioritization Foundations  
**Created**: 2026-03-10  
**Status**: Ready for Planning -> Work Packages

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
