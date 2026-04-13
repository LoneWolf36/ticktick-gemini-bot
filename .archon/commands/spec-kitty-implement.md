---
description: Implement a single Spec Kitty work package. The workflow trigger message will contain the mission slug and WP ID in this format: "Execute mission <slug> for <WP-id>"
argument-hint: <mission-slug> <WP-id> (e.g., 002-natural-language-task-mutations WP02)
---

# Implement Spec Kitty WP

**Workflow Trigger**: $ARGUMENTS

---

## Phase 0: EXTRACT MISSION AND WP ID

The workflow trigger message contains the mission slug and WP ID. Extract them:

Parse the trigger message for patterns like:
- "mission XXX for YYY"
- "XXX YYY"
- "implement YYY from XXX"

```bash
# Extract mission slug and WP ID from $ARGUMENTS
MISSION_SLUG=$(echo "$ARGUMENTS" | grep -oP '[0-9]+-[a-z0-9-]+' | head -1)
WP_ID=$(echo "$ARGUMENTS" | grep -oP 'WP[0-9]+' | head -1)

# Fallback: if not found, try to extract from node context
if [ -z "$MISSION_SLUG" ] || [ -z "$WP_ID" ]; then
  echo "WARNING: Could not extract mission/WP from trigger message: $ARGUMENTS"
  echo "Attempting to find the WP spec file directly..."
  # Find the most recently modified WP spec file that hasn't been implemented
  WP_FILE=$(find kitty-specs -name "WP*.md" -type f -newer .last-implemented-wp 2>/dev/null | head -1)
  if [ -z "$WP_FILE" ]; then
    # Fallback: find first WP with "planned" status
    WP_FILE=$(for f in kitty-specs/*/tasks/WP*.md; do
      grep -q '"to_lane":"planned"' "kitty-specs/$(echo $f | cut -d/ -f2)/status.events.jsonl" 2>/dev/null && echo "$f" && break
    done)
  fi
  if [ -n "$WP_FILE" ]; then
    MISSION_SLUG=$(echo "$WP_FILE" | cut -d/ -f2)
    WP_ID=$(basename "$WP_FILE" | grep -oP 'WP[0-9]+')
  fi
fi

echo "MISSION: ${MISSION_SLUG:-UNKNOWN}"
echo "WP: ${WP_ID:-UNKNOWN}"
```

If both are found, proceed. If not, ASK the user for clarification.

---

## Phase 1: LOAD WP SPEC

### 1.1 Locate and Read WP Spec

```bash
WP_FILE=$(find kitty-specs -path "*/${MISSION_SLUG}/tasks/*${WP_ID}*.md" -type f 2>/dev/null | head -1)
if [ -z "$WP_FILE" ]; then
  echo "ERROR: Cannot find WP spec file for mission=${MISSION_SLUG}, wp=${WP_ID}"
  echo "Searched in: kitty-specs/${MISSION_SLUG}/tasks/"
  exit 1
fi
```

Read the full WP spec at `$WP_FILE`. Identify:
- Subtasks (T0XX, T0XY, etc.)
- Files to touch
- Product Vision Alignment Gate requirements
- Definition of Done
- Guardrails

### 1.2 Read Project Context

```bash
cat AGENTS.md
```

Key conventions:
- ESM only (import/export)
- 4-space indentation, semicolons
- camelCase variables, PascalCase classes
- Single-purpose files
- YAGNI, DRY, Simplicity First

---

## Phase 2: EXPLORE CODEBASE

For each file the WP spec says to touch:
1. Read the current file
2. Understand its role in the architecture
3. Identify existing patterns and conventions

---

## Phase 3: IMPLEMENT

For each subtask in the WP spec:

**DO:**
- Implement ONLY what the subtask specifies
- Follow existing code patterns exactly
- Write or update tests as required
- Keep changes minimal and focused

**DON'T:**
- Refactor unrelated code
- Add improvements not in the subtask
- Install new dependencies without justification
- Over-engineer

### Product Vision Compliance

Verify:
- The change supports the behavioral support system (not passive task management)
- The system fails closed when uncertain
- Mutation confirmations are terse
- The system doesn't reward busywork

---

## Phase 4: VALIDATE

```bash
# Run focused tests for changed modules
node --test tests/*.test.js 2>&1 | tail -15

# Run regression tests
node tests/run-regression-tests.mjs 2>&1 | tail -10
```

**All new tests must pass.** Pre-existing failures should be noted but not block progress.

---

## Phase 5: COMMIT AND UPDATE STATUS

### 5.1 Commit Changes

```bash
git add -A
git diff --cached --stat
git commit -m "feat(${MISSION_SLUG}): implement ${WP_ID} - $(head -5 ${WP_FILE} | grep 'title:' | cut -d: -f2- | xargs)

{Brief description of what was implemented}

Co-Authored-By: Codex GPT-5 <noreply@openai.com>"
```

### 5.2 Update WP Status

```bash
# Record completion in status.events.jsonl
STATUS_FILE="kitty-specs/${MISSION_SLUG}/status.events.jsonl"
EVENT_ID="$(date -u +%Y%m%dT%H%M%SZ)-${WP_ID}-done"
echo "{\"actor\":\"ai-agent\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event_id\":\"${EVENT_ID}\",\"evidence\":{\"test_results\":\"all_new_tests_pass\"},\"execution_mode\":\"direct_repo\",\"feature_slug\":\"${MISSION_SLUG}\",\"force\":false,\"from_lane\":\"planned\",\"mission_slug\":\"${MISSION_SLUG}\",\"reason\":\"implementation_complete\",\"review_ref\":null,\"to_lane\":\"done\",\"work_package_id\":\"${WP_ID}\",\"wp_id\":\"${WP_ID}\"}" >> "$STATUS_FILE"

# Mark this WP as implemented for the workflow
echo "${MISSION_SLUG} ${WP_ID}" > .last-implemented-wp
```

### 5.3 Report Completion

Output:
- Mission slug
- WP ID
- Files changed
- Tests run and results
- Product Vision impact statement
- Confirmation that WP status was updated to "done"
