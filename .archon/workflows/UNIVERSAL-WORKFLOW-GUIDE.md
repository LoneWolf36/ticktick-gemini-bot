# Universal Spec-Kitty Workflow — Usage Guide

## Overview

`spec-kitty-universal.yaml` is a **plug-and-play Archon workflow template** that wraps the `spec-kitty` CLI to implement any set of spec-based missions across any project.

It does **not** replace spec-kitty — it orchestrates it with strict quality gates, multi-agent review, and systematic debugging escalation.

## Quick Start

### 1. Copy and adapt the config

```bash
cp .archon/workflow-config.example.json .archon/workflow-config.json
```

Fill in your project details:
- `project.root` — your project root directory
- `project.specDirectory` — where your specs live (e.g., `kitty-specs`)
- `project.validationCommands` — commands that must pass (tests, lint, etc.)
- `missions` — array of missions with their WPs
- `review.agents` — your review agent pool
- `resilience.*` — retry, circuit breaker, checkpoint config

### 2. Ensure commands exist

The workflow expects these commands in `.archon/commands/`:

| Command | Purpose |
|---------|---------|
| `spec-kitty-implement` | Wraps `spec-kitty implement --mission <slug> WP##` |
| `spec-kitty-validate` | Runs your `validationCommands` |
| `spec-kitty-validate-full` | Runs full test suite + regression |
| `spec-kitty-review-architecture` | Invokes `architect-review` agent |
| `spec-kitty-review-security` | Invokes `security-auditor` agent |
| `spec-kitty-review-testing` | Invokes `tdd-orchestrator` agent |
| `spec-kitty-review-code-quality` | Invokes `clean-coder` agent |
| `spec-kitty-review-product-vision` | Custom product vision review |
| `spec-kitty-synthesize-review` | Combines all review findings |
| `spec-kitty-implement-review-fixes` | Applies fixes from synthesis |
| `spec-kitty-checkpoint-save` | Saves checkpoint state |
| `spec-kitty-completion-summary` | Generates final summary |

Each command `.md` should:
1. Accept `$ARGUMENTS` as `<mission-slug> <WP-id>`
2. Invoke the appropriate spec-kitty CLI or skill
3. Write reports to `$ARTIFACTS_DIR/`
4. Exit 0 on success, non-zero on failure

### 3. Expand the template

The YAML uses a **MISSION TEMPLATE PATTERN**:
1. Copy the "MISSION TEMPLATE" block for each mission
2. Replace `{MISSION_NUM}` and `{MISSION_SLUG}` with real values
3. Add WP implement/validate node pairs
4. Chain `depends_on` to respect WP dependencies
5. Link missions via checkpoint dependencies

For automated expansion, write a pre-processor that reads `workflow-config.json` and generates concrete YAML.

## Workflow Execution Model

### Per Work Package
```
1. IMPLEMENT  → spec-kitty implement --mission <slug> <WP>
2. VALIDATE   → run project validationCommands
3. MOVE-TASK  → spec-kitty move-task --mission <slug> <WP> --to done
```

### Per Mission (after all WPs)
```
4. MULTI-AGENT REVIEW (5 parallel agents):
   - architect-review    (mandatory)
   - security-auditor    (mandatory)
   - tdd-orchestrator
   - clean-coder
   - product-vision

5. SYNTHESIZE → combine findings into prioritized fix list
   trigger_rule: all_done (waits for ALL 5)

6. REVIEW-FIX LOOP (max 3 cycles):
   a. Implement fixes (clean-coder)
   b. Full validation
   c. RE-RUN ALL 5 review agents (full re-review)
   d. Re-synthesize
   e. Pass → proceed | Fail → next cycle

7. SYSTEMATIC-DEBUGGER (max 5 retries, after 3 review-fix cycles):
   a. Analyze root cause
   b. clean-coder implements targeted fixes
   c. Full validation + full 5-agent re-review
   d. Retry up to 5 times
   e. Fail → circuit breaker → HUMAN ESCALATION

8. CHECKPOINT → save mission completion state
9. Next mission
```

## Key Design Decisions

### `trigger_rule: all_done` on synthesis
Synthesis nodes use `all_done`, NOT `one_success`. This ensures ALL 5 review reports are available before synthesizing. If any review fails, the synthesis still runs but reports which reviews are missing.

### Full re-review after fixes
When fixes are applied, ALL 5 review agents re-run from scratch. This is NOT incremental — it's a complete fresh review. Fixes can introduce new issues in areas other than the ones they target.

### Audit re-trigger rule
If post-review audits find issues that the original review agents missed (but the agents passed clean), the ENTIRE review-fix loop re-runs from cycle 1. This prevents audit findings from being silently ignored.

### Review-fix cycles vs debugger retries
- **Review-fix cycles (3 max)**: Standard review → fix → re-review loop
- **Debugger retries (5 max)**: Deep systematic debugging when review-fix cycles are exhausted
- **Total**: Up to 8 full 5-agent re-reviews before human escalation

### Checkpoints between missions
Each mission ends with a checkpoint. If the workflow fails mid-execution, it can resume from the last successful checkpoint.

## Gates at Every Feature Completion

Six explicit gates must pass before a mission is considered complete:

| Gate | What It Checks |
|------|---------------|
| **WP Completion** | All WPs implemented, validated, status updated |
| **Coding Principles** | YAGNI, DRY, Simplicity, SOLID, no drift |
| **Review Quorum** | All 5 agents done, mandatory passed, quorum met |
| **Validation** | All tests, lint, regression pass |
| **Product Vision** | Alignment with product vision document |
| **Checkpoint** | State saved, git clean, artifacts stored |

## Variable Substitution

All `${config.*}` variables resolve from `workflow-config.json` at runtime. See the YAML's VARIABLE REFERENCE section at the bottom for the complete list.

## Example: Adapting for a New Project

```bash
# 1. Create your project structure
mkdir -p my-project/.archon/{commands,scripts,workflows,checkpoints}
cd my-project

# 2. Copy the template
cp /path/to/spec-kitty-universal.yaml .archon/workflows/my-missions.yaml

# 3. Copy and fill config
cp /path/to/workflow-config.example.json .archon/workflow-config.json
# Edit workflow-config.json with your project details

# 4. Create command files
# Each command is a .md file that wraps spec-kitty CLI or invokes a skill
cp /path/to/commands/*.md .archon/commands/

# 5. Expand the template
# Either manually copy the MISSION TEMPLATE block for each mission,
# or write a pre-processor script that reads workflow-config.json
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `workflow-config.json not found` | Copy from `workflow-config.example.json` |
| Review agent times out | Increase `review.timeout` in config |
| Circuit breaker trips | Review diagnostic package in checkpoint directory |
| Checkpoint not saving | Verify `resilience.checkpoint.directory` exists |
| Variable not resolving | Check variable name matches config schema exactly |
| WP dependencies not respected | Ensure `depends_on` chains match WP dependency order |

## Schema Validation

Validate your config against the JSON Schema:

```bash
# Using ajv-cli
npm install -g ajv-cli
ajv validate -s .archon/workflow-config.schema.json -d .archon/workflow-config.json
```
