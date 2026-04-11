# Feature Specification: Post-Migration Cleanup

**Feature Branch**: `004-post-migration-cleanup`
**Created**: 2026-03-10
**Status**: Draft
**Mission**: software-dev
**Input**: Cleanup and reconciliation work after 001-task-operations-pipeline. The codebase now mixes shipped structured paths, legacy wording, stale plan state, and README promises that no longer map cleanly to implementation.

## Product Vision Alignment Contract

This specification is governed by `Product Vision and Behavioural Scope.md`. It is acceptable only if it helps the user act on what matters, reduce procrastination, and build better judgment over time.

**Feature-specific alignment**: This cleanup matters because stale docs and dead paths create false confidence and wasted work. The cleanup must make the codebase easier to use for one personal behavioral assistant, not expand infrastructure for hypothetical scale.

**Non-negotiable gates**:
- The artifact must treat the product as a behavioral support system for task execution, not as a generic task manager.
- The artifact must reduce cognitive load: fewer choices, shorter copy, narrower questions, and no unnecessary review loops.
- The artifact must prefer fewer correct tasks over many plausible tasks.
- The artifact must distinguish meaningful progress from busywork and must not optimize for motion, task count, or planning volume.
- The artifact must be honest about uncertainty: ask directly or fail closed when confidence is low.
- The artifact may be assertive only when the evidence or user-invoked mode justifies it.
- The artifact must preserve the MVP boundary: one personal user first; no auth, billing, rate limiting, or multi-tenant expansion unless a separate accepted spec requires it.

**This artifact must preserve**:
- Remove or label legacy paths only after proving they are dead or intentionally retained for a current behavior.
- Update docs so future work stays centered on behavioral execution support, not generic task management.
- Keep configuration and onboarding clear enough that the assistant can be run and validated without adding mental overhead.

**Reject or revise this artifact if**:
- The cleanup removes a still-live path such as a briefing, weekly, or reorg helper without replacement.
- Documentation claims shipped behavioral capabilities that do not exist.
- The work adds new infrastructure, auth, billing, or multi-user abstractions unrelated to the accepted scope.

**Reviewer acceptance standard**: review must fail if the artifact can be implemented as a passive list-management feature, if it increases planning burden without improving execution, or if it gives confident guidance where the product vision requires clarification.

## No-Drift Product Realization Contract

This artifact is part of the 001-009 chain that must produce the product described in `Product Vision and Behavioural Scope.md`. Local technical completion is not sufficient. A work package in this mission is acceptable only when the implementation, review evidence, and tests prove that the behavior moves the user toward important long-term goals by improving task clarity, prioritization, execution, or behavioral awareness.

### Mission Role In The Complete System

This mission removes stale implementation and documentation paths that would let future agents build against the wrong product. It is a drift-prevention mission: if legacy add-task behavior remains authoritative anywhere, implementers can accidentally preserve a generic task-manager pathway instead of the behavioral support system.

### Required Product Behavior For This Mission

- There is one accepted task-writing path, and documentation points agents to that path without ambiguity.
- Deprecated command names, prompt examples, and architectural explanations no longer imply legacy behavior is valid.
- Regression coverage prevents legacy paths from reappearing silently.
- The product stays simple and single-purpose instead of accumulating competing task-entry systems.

### Cross-Mission Dependency And Drift Risk

This mission depends on 001 being the canonical task pipeline. It protects all later missions from implementation drift caused by old docs, old commands, or duplicated write surfaces.

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

## User Scenarios & Testing

### User Story 1 - Accurate Documentation and Track State (Priority: P1)

The repository documentation and `kitty-specs` artifacts accurately describe what the bot does today and what remains intentionally deferred.

**Why this priority**: Incorrect docs and stale track state create wasted implementation effort and misleading expectations, especially now that the architecture has materially changed.

**Independent Test**: Compare README, active specs, and implemented command behavior and verify they describe the same system.

**Acceptance Scenarios**:

1. **Given** the README advertises a capability, **When** a maintainer reads it, **Then** it either exists today or is explicitly marked as planned
2. **Given** 001 is accepted, **When** maintainers inspect its plan artifacts, **Then** the track status reflects that state instead of leaving misleading unchecked items

---

### User Story 2 - Clear Legacy Boundaries (Priority: P1)

The codebase makes a clean distinction between retained legacy paths and dead or superseded ones.

**Why this priority**: The migration deliberately left some areas on the old path. Without explicit cleanup, maintainers cannot tell what is intentionally retained versus accidentally stranded.

**Independent Test**: Search for old task-flow references and confirm each remaining usage is either required, documented, or removed.

**Acceptance Scenarios**:

1. **Given** a legacy helper or prompt remains, **When** it is still needed, **Then** its surviving scope is documented inline or in spec artifacts
2. **Given** a legacy helper or prompt no longer has live callers, **When** the cleanup executes, **Then** it is removed
3. **Given** direct TickTick task writes remain in test harnesses or special-case flows, **When** the inventory is reviewed, **Then** allowed exceptions are explicit

---

### User Story 3 - Reduced Maintenance Friction (Priority: P2)

Future feature work starts from clear source-of-truth documents and an unambiguous architecture boundary.

**Why this priority**: This cleanup is not user-facing functionality, but it lowers the cost and risk of every follow-on spec in the queue.

**Independent Test**: A maintainer can identify the active architecture, planned follow-ons, and intentionally deferred areas without reading the full git history.

## Requirements

### Functional Requirements

- **FR-001**: README and related docs MUST reflect the current architecture and clearly distinguish shipped behavior from planned behavior
- **FR-002**: Accepted `kitty-specs` metadata and plan artifacts MUST not present implemented work as still pending
- **FR-003**: Remaining legacy task-flow code MUST either be removed or explicitly documented as intentionally retained
- **FR-004**: Search-based audits for direct TickTick writes, legacy prompts, and dead migration helpers MUST be updated with explicit allowed exceptions
- **FR-005**: Cleanup MUST avoid removing legacy paths that still power `/reorg` or other intentionally deferred features

### Key Entities

- **Legacy Boundary**: The documented edge between the new structured architecture and intentionally retained older flows
- **Source-of-Truth Docs**: README, current `kitty-specs` artifacts, and inline code comments that describe architecture status

## Success Criteria

- **SC-001**: Maintainers can tell which commands are on the new architecture and which are not
- **SC-002**: Stale references to completed-but-unchecked migration work are reconciled
- **SC-003**: Dead legacy code is removed, while live legacy code is explicitly scoped
- **SC-004**: README claims align with implemented or separately spec'd work

## Assumptions

- This track may touch code, docs, and spec artifacts, but should avoid broad behavioral changes
- Not every remaining legacy surface must be removed in this track; some only need explicit scoping until replacement specs land
