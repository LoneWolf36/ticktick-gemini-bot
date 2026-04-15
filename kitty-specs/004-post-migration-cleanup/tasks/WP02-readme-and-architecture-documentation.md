---
work_package_id: WP02
title: README and Architecture Documentation
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
base_branch: kitty/mission-004-post-migration-cleanup
base_commit: 3f0c32fb48b97538447208d172f1a260ade8ffc9
created_at: '2026-04-15T17:48:59.793923+00:00'
subtasks:
- T006
- T007
- T008
- T009
phase: Phase 2 - Documentation Updates
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQW
owned_files:
- README.md
- kitty-specs/001-task-operations-pipeline/plan.md
wp_code: WP02
---

# Work Package Prompt: WP02 - README and Architecture Documentation

## Product Vision Alignment Gate

This WP is governed by `Product Vision and Behavioural Scope.md` and must be reviewed as part of the behavioral support system, not as isolated plumbing.

**Feature-specific reason this WP exists**: This cleanup matters because stale docs and dead paths create false confidence and wasted work. The cleanup must make the codebase easier to use for one personal behavioral assistant, not expand infrastructure for hypothetical scale.

**Implementation must**:
- Remove or label legacy paths only after proving they are dead or intentionally retained for a current behavior.
- Update docs so future work stays centered on behavioral execution support, not generic task management.
- Keep configuration and onboarding clear enough that the assistant can be run and validated without adding mental overhead.

**Implementation must not**:
- The cleanup removes a still-live path such as a briefing, weekly, or reorg helper without replacement.
- Documentation claims shipped behavioral capabilities that do not exist.
- The work adds new infrastructure, auth, billing, or multi-user abstractions unrelated to the accepted scope.

**Acceptance gate for this WP**: before moving this package out of `planned` or returning it for review, the implementer must state how the change reduces procrastination, improves task clarity, improves prioritization, preserves cognitive lightness, or protects trust. If none of those are true, the package is out of scope.

## Implement-Review No-Drift Contract

This WP is not complete merely because the implementation compiles, tests pass, or the local checklist is checked. It is complete only when the implementer and reviewer can prove that the change supports the behavioral support system described in `Product Vision and Behavioural Scope.md`.

### Product Vision Role This WP Must Preserve

This mission removes stale implementation and documentation paths that would let future agents build against the wrong product. It is a drift-prevention mission: if legacy add-task behavior remains authoritative anywhere, implementers can accidentally preserve a generic task-manager pathway instead of the behavioral support system.

### Required Implementer Evidence

The implementer must leave enough evidence for review to answer all of the following without guessing:

1. Which Product Vision clause or behavioral scope section does this WP serve?
2. Which FR, NFR, plan step, task entry, or acceptance criterion does the implementation satisfy?
3. What user-visible behavior changes because of this WP?
4. How does the change reduce procrastination, improve task clarity, improve prioritization, improve recovery/trust, or improve behavioral awareness?
5. What does the implementation deliberately avoid so it does not become a passive task manager, generic reminder app, over-planning assistant, busywork optimizer, or judgmental boss?
6. What automated tests, regression checks, manual transcripts, or static inspections prove the intended behavior?
7. Which later mission or WP depends on this behavior, and what drift would it create downstream if implemented incorrectly?

### Required Reviewer Checks

The reviewer must reject the WP unless all of the following are true:

- The behavior is traceable from Product Vision -> mission spec -> plan/tasks -> WP instructions -> implementation evidence.
- The change preserves the accepted architecture and does not bypass canonical paths defined by earlier missions.
- The user-facing result is concise, concrete, and action-oriented unless the spec explicitly requires reflection or clarification.
- Ambiguity, low confidence, and missing context are handled honestly rather than hidden behind confident output.
- The change does not add MVP-forbidden platform scope such as auth, billing, rate limiting, or multi-tenant isolation.
- Tests or equivalent evidence cover the behavioral contract, not just the happy-path technical operation.
- Any completed-WP edits preserve Spec Kitty frontmatter and event-sourced status history; changed behavior is documented rather than silently rewritten.

### Drift Rejection Triggers

Reject, reopen, or move work back to planned if this WP enables any of the following:

- The assistant helps the user organize more without helping them execute what matters.
- The assistant chooses or mutates tasks confidently when it should clarify, fail closed, or mark inference as weak.
- The assistant rewards low-value busywork, cosmetic cleanup, or motion-as-progress.
- The assistant becomes verbose, punitive, generic, or motivational in a way the Product Vision explicitly rejects.
- The implementation stores raw user/task content where only derived behavioral metadata is allowed.
- The change creates a second implementation path that future agents could use instead of the accepted pipeline.
- The reviewer cannot state why this WP is necessary for the final 001-009 product.

### Done-State And Future Rework Note

If this WP is already marked done, this contract does not rewrite Spec Kitty history. It governs future audits, reopened work, bug fixes, and final mission review. If any later change alters the behavior described here, the WP may be moved back to planned or reopened so the implement-review loop can re-establish product-vision fidelity.

## Objectives and Success Criteria

Update maintainer-facing documentation so the repository describes the actual structured assistant architecture and does not invite prompt-only or generic task-manager work.

**Independent test**: A reviewer can follow README setup and architecture docs and correctly identify the structured task path, scheduler paths, and intentionally deferred behavior.

Success looks like:
- README reflects current architecture.
- Command descriptions match implementation.
- Completed spec artifacts do not masquerade as pending work.

## Context and Constraints

- Mission: `004-post-migration-cleanup`
- Canonical spec: `kitty-specs/004-post-migration-cleanup/spec.md`
- Canonical plan: `kitty-specs/004-post-migration-cleanup/plan.md`
- Canonical task list: `kitty-specs/004-post-migration-cleanup/tasks.md`
- Implementation command: `spec-kitty implement WP02 --mission 004-post-migration-cleanup`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- README.md
- kitty-specs/001-task-operations-pipeline/plan.md

## Subtasks and Detailed Guidance

### Subtask T006 - Update architecture diagram

**Purpose**: Make the system path visible and accurate.

**Required work**:
- Show `Telegram message -> AX intent extraction -> deterministic normalizer -> TickTick adapter -> TickTick API`.
- Represent scheduler and briefing/weekly paths separately.
- Do not imply all behavior is migrated if a legacy path is intentionally retained.

**Acceptance checks**:
- Diagram names the structured write path.
- Parallel non-write summary paths are clear.
- No diagram contradicts current code.

### Subtask T007 - Update key design decisions

**Purpose**: Anchor future work in the chosen architecture.

**Required work**:
- Document AX, deterministic normalization, adapter-centric writes, and failure boundaries.
- Mention known future AX replacement only as future work if still relevant.
- Remove stale design claims from pre-migration behavior.

**Acceptance checks**:
- Design decisions match accepted specs.
- Future work is labeled as future work.
- No generic SaaS decisions are added.

### Subtask T008 - Verify command descriptions

**Purpose**: Prevent docs from creating wrong expectations.

**Required work**:
- Review each Telegram command in README.
- Update `/scan`, `/review`, `/briefing`, `/weekly`, `/urgent`, and behavior-related command descriptions only where implementation supports them.
- Keep descriptions short and behavior-oriented.

**Acceptance checks**:
- Command table matches implementation.
- No planned-only command is described as shipped.
- Descriptions support cognitive lightness.

### Subtask T009 - Reconcile spec 001 plan state

**Purpose**: Remove misleading pending markers for accepted work.

**Required work**:
- Review `kitty-specs/001-task-operations-pipeline/plan.md` for stale unchecked TODOs.
- Close, annotate, or move stale items into future notes.
- Preserve historical acceptance metadata.

**Acceptance checks**:
- Plan does not say accepted work is still pending.
- Historical state is preserved.
- Future items are clearly labeled.

## Risks and Mitigations

- Risk: docs overclaim behavior. Mitigation: only document shipped behavior or clearly mark planned scope.
- Risk: docs become verbose. Mitigation: keep user-facing examples short and put detail in architecture sections.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
