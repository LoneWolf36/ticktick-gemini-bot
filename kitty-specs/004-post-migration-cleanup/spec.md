# Feature Specification: Post-Migration Cleanup

**Feature Branch**: `004-post-migration-cleanup`
**Created**: 2026-03-10
**Status**: Draft
**Mission**: software-dev
**Input**: Cleanup and reconciliation work after 001-task-operations-pipeline. The codebase now mixes shipped structured paths, legacy wording, stale plan state, and README promises that no longer map cleanly to implementation.

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
