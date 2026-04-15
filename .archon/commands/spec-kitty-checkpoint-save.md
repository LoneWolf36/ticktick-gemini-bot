---
description: Save checkpoint state after completing a feature phase
argument-hint: <mission-slug> <phase-name>
---

# Save Checkpoint

**Input**: $ARGUMENTS

---

## Your Mission

Save the current workflow state so the workflow can be resumed from this point if interrupted.

---

## Phase 1: CAPTURE STATE

### 1.1 Get Current Git State

```bash
CURRENT_BRANCH=$(git branch --show-current)
HEAD_COMMIT=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --format="%s")
```

### 1.2 Get Mission Progress

```bash
# Parse ARGUMENTS for mission slug and phase name
MISSION_SLUG=$(echo "$ARGUMENTS" | awk '{print $1}')
PHASE_NAME=$(echo "$ARGUMENTS" | awk '{print $2}')
```

### 1.3 Get Test Status

```bash
TEST_OUTPUT=$(node tests/run-regression-tests.mjs 2>&1 | tail -5) || true
```

---

## Phase 2: WRITE CHECKPOINT

```bash
CHECKPOINT_DIR=".archon/checkpoints"
mkdir -p "$CHECKPOINT_DIR"

cat > "$CHECKPOINT_DIR/phase-${PHASE_NAME}.json" <<EOJSON
{
  "version": 1,
  "phase": "${PHASE_NAME}",
  "mission": "${MISSION_SLUG}",
  "completed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git": {
    "branch": "$CURRENT_BRANCH",
    "head_commit": "$HEAD_COMMIT",
    "last_commit_msg": "$COMMIT_MSG"
  },
  "test_status": "see_test_output",
  "status": "completed"
}
EOJSON

echo "Checkpoint saved: phase-${PHASE_NAME}.json"
echo "Mission: ${MISSION_SLUG}"
echo "Commit: ${HEAD_COMMIT}"
echo "Branch: ${CURRENT_BRANCH}"
```

---

## Phase 3: UPDATE STATE FILE

```bash
# Update the global checkpoint tracker
TRACKER="$CHECKPOINT_DIR/current-state.json"
if [ -f "$TRACKER" ]; then
  # Append phase to existing state
  PREV=$(cat "$TRACKER")
  echo "$PREV" | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    d.lastCompletedPhase = '${PHASE_NAME}';
    d.lastCompletedMission = '${MISSION_SLUG}';
    d.lastUpdatedAt = new Date().toISOString();
    console.log(JSON.stringify(d, null, 2));
  " > "$TRACKER"
else
  # Create initial state
  cat > "$TRACKER" <<EOJSON
{
  "version": 1,
  "lastCompletedPhase": "${PHASE_NAME}",
  "lastCompletedMission": "${MISSION_SLUG}",
  "lastUpdatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "in_progress"
}
EOJSON
fi

echo "State tracker updated"
```

---

## Success Criteria

- **CHECKPOINT_WRITTEN**: Phase checkpoint file exists
- **STATE_UPDATED**: Current state tracker updated
- **GIT_STATE_CAPTURED**: Branch, commit, and message recorded
