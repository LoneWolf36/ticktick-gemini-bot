# Checkpoint System

Save workflow state after completing feature phases to enable resumption if interrupted.

## Usage

```bash
# Using npm script
npm run checkpoint <mission-slug> <phase-name>

# Direct execution
node commands/save-checkpoint.js <mission-slug> <phase-name>
```

### Examples

```bash
# Save checkpoint for mission 005, phase 2
npm run checkpoint 005-checklist-subtask phase-2

# Save checkpoint for mission 006, integration-testing phase
npm run checkpoint 006-integration-testing integration-testing
```

## What It Does

1. **Captures Git State**: Current branch, commit hash, and commit message
2. **Runs Tests**: Executes regression tests and records the output
3. **Writes Checkpoint**: Creates a JSON file in `.archon/checkpoints/phase-{name}.json`
4. **Updates State Tracker**: Updates `.archon/checkpoints/current-state.json` with latest progress

## Checkpoint Files

### Phase Checkpoint (`.archon/checkpoints/phase-{name}.json`)

```json
{
  "version": 1,
  "phase": "phase-2",
  "mission": "005-checklist-subtask",
  "completed_at": "2026-04-14T03:37:27.720Z",
  "git": {
    "branch": "main",
    "head_commit": "abc123...",
    "last_commit_msg": "feat: add checklist support"
  },
  "test_status": "...",
  "status": "completed"
}
```

### Current State Tracker (`.archon/checkpoints/current-state.json`)

```json
{
  "version": 1,
  "lastCompletedPhase": "phase-2",
  "lastCompletedMission": "005-checklist-subtask",
  "lastUpdatedAt": "2026-04-14T03:37:27.721Z",
  "status": "in_progress"
}
```

## Success Criteria

- ✅ **CHECKPOINT_WRITTEN**: Phase checkpoint file exists
- ✅ **STATE_UPDATED**: Current state tracker updated
- ✅ **GIT_STATE_CAPTURED**: Branch, commit, and message recorded

## Notes

- Checkpoint files are gitignored (local state only)
- Test failures are recorded but don't prevent checkpoint creation
- Multiple checkpoints can coexist for different phases
