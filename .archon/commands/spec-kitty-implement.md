---
description: Safely implement a Spec Kitty work package through the canonical Spec Kitty lifecycle.
argument-hint: <mission-slug> [WP-id]
---

# Spec Kitty Implement — Safe Lifecycle Wrapper

**Input:** `$ARGUMENTS`

Use this command only after the mission has passed the Archon quality gate.
Archon may orchestrate, classify, and review, but Spec Kitty owns mission state,
worktrees, WP lanes, review state, and merge state.

## Hard Rules

- Do not append to `status.events.jsonl`.
- Do not infer pending WPs by grepping lane events.
- Do not mark WPs `done` directly.
- Do not bypass Spec Kitty worktree creation.
- Do not continue if `spec-kitty next` or `orchestrator-api` crashes.

## Step 1: Parse Input

Expected forms:

```text
<mission-slug>
<mission-slug> <WP-id>
```

If no WP id is provided, query Spec Kitty for the next action:

```bash
spec-kitty next --mission <mission-slug> --json
```

If the command fails, stop and report the mission as `blocked-state`.

## Step 2: Inspect Ready Work

Use the JSON-first API:

```bash
spec-kitty orchestrator-api mission-state --mission <mission-slug>
spec-kitty orchestrator-api list-ready --mission <mission-slug>
```

Proceed only when the target WP is ready according to Spec Kitty.

## Step 3: Start Implementation Through Spec Kitty

Use the current Spec Kitty v3.1.4 command surface. Prefer the CLI command that
creates the implementation worktree and prompt for the selected WP:

```bash
spec-kitty implement <WP-id> --mission <mission-slug>
```

If this project uses orchestrator-api for external automation, use the matching
`start-implementation` command instead of editing status files.

## Step 4: Run The WP Implementation Agent

Run the Codex implementation workflow in the Spec Kitty-created worktree.
Use:

- `gpt-5.4-mini` for low-risk WPs.
- `gpt-5.4` for high-risk WPs or product-vision-sensitive changes.

The implementation agent must:

- Read the full Spec Kitty prompt before editing.
- Touch only files required by the WP.
- Add or update tests.
- Run the validation commands named in the prompt.
- Commit only implementation changes inside the worktree.

## Step 5: Move To Review Through Spec Kitty

When implementation and validation are complete, move the WP to review using
the exact command emitted by Spec Kitty, or the canonical equivalent for the
current CLI version.

Do not write lane events manually.

## Required Output

Report:

- Mission slug.
- WP id.
- Worktree path.
- Files changed.
- Tests run and exact result.
- Product Vision impact statement.
- Spec Kitty command used to move the WP to review, or the exact blocker.
