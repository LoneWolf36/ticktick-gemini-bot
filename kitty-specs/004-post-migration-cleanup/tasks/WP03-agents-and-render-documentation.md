---
work_package_id: WP03
title: AGENTS and Render Documentation
dependencies:
- WP01
requirement_refs:
- FR-001
created_at: '2026-04-11T18:20:00+00:00'
subtasks:
- T010
- T011
- T012
- T013
phase: Phase 2 - Documentation Updates
authoritative_surface: ''
execution_mode: code_change
mission_id: 01KNT55PMXDGM4VDMWY0YT3CQW
owned_files:
- AGENTS.md
- render.yaml
- .env.example
wp_code: WP03
---

# Work Package Prompt: WP03 - AGENTS and Render Documentation

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

Bring agent and deployment guidance in line with the current product and architecture so future contributors do not add accidental complexity or revive stale patterns.

**Independent test**: A new agent can read repository guidance and know which modules own Telegram handling, structured task writes, prioritization, context, and deployment configuration.

Success looks like:
- Module ownership is explicit.
- Environment variables are documented consistently.
- Guidance reinforces personal-MVP scope.

## Context and Constraints

- Mission: `004-post-migration-cleanup`
- Canonical spec: `kitty-specs/004-post-migration-cleanup/spec.md`
- Canonical plan: `kitty-specs/004-post-migration-cleanup/plan.md`
- Canonical task list: `kitty-specs/004-post-migration-cleanup/tasks.md`
- Implementation command: `spec-kitty implement WP03 --mission 004-post-migration-cleanup`
- Preserve the repository rule that new task-writing flows stay on the structured pipeline path unless the spec explicitly says otherwise.
- Do not expand SaaS infrastructure, authentication, billing, rate limiting, or multi-user concerns for this WP.

**Primary files**:
- AGENTS.md
- render.yaml
- .env.example

## Subtasks and Detailed Guidance

### Subtask T010 - Update project structure guidance

**Purpose**: Make ownership boundaries clear to future agents.

**Required work**:
- List current service modules and their responsibilities.
- Clarify that bot handlers do not bypass the task pipeline for new write flows.
- Keep guidance concise but complete.

**Acceptance checks**:
- All current service modules are accounted for.
- New write-flow rule is explicit.
- No obsolete single-active-spec wording remains.

### Subtask T011 - Update kitty-specs guidance

**Purpose**: Reflect that multiple missions coexist.

**Required work**:
- Replace any wording that implies only spec 001 is active.
- Describe `kitty-specs/` as a multi-mission artifact directory.
- Preserve Spec Kitty v3.1.1 notes.

**Acceptance checks**:
- Multiple specs are acknowledged.
- Spec Kitty command naming remains current.
- No deprecated governance wording is introduced.

### Subtask T012 - Reconcile Render env documentation

**Purpose**: Keep deployment config honest.

**Required work**:
- Check `render.yaml` and docs for `GEMINI_API_KEYS`, `BOT_MODE`, `AUTO_APPLY_LIFE_ADMIN`, `AUTO_APPLY_DROPS`, and `AUTO_APPLY_MODE`.
- Clarify required versus optional values.
- Avoid adding secrets.

**Acceptance checks**:
- Env vars used by runtime are documented.
- Required/optional status is consistent.
- No real credentials are committed.

### Subtask T013 - Clarify Gemini key variables

**Purpose**: Reduce setup confusion.

**Required work**:
- Explain singular `GEMINI_API_KEY` as legacy or fallback if still supported.
- Explain plural `GEMINI_API_KEYS` as preferred for rotation if supported.
- Align README, `.env.example`, and Render wording.

**Acceptance checks**:
- Key rotation docs are consistent.
- No unsupported variable is presented as required.
- Setup remains simple for one-user deployment.

## Risks and Mitigations

- Risk: documentation conflicts with user-provided AGENTS instructions. Mitigation: preserve existing governance and add only current module clarifications.
- Risk: env docs drift. Mitigation: compare against `server.js` and Render config.

## Review Guidance

Review this WP against the product vision before reviewing implementation details. Reject it if the change makes the assistant more verbose, more passive, less honest about uncertainty, more likely to reward busywork, or less focused on the user's important long-term goals.

## Activity Log

- 2026-04-11T18:20:00+00:00 - Prompt materialized during product-vision alignment pass; initial lane is planned.
