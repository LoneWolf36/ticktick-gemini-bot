---
description: Implement the next pending Spec Kitty work package. You MUST follow every step in order. Do NOT skip to step 5 until steps 1-4 produce real, verifiable output.
---

# Implement Next Pending WP — ENFORCED SEQUENCE

**IMPORTANT**: You are NOT allowed to proceed to Step 6 (Record Status) until Steps 1-5 produce REAL, VERIFIABLE output. Each step has a verification gate. Fabricating test results, skipping implementation, or recording status without actual code changes is STRICTLY FORBIDDEN.

---

## Step 1: DISCOVER Next Pending WP

Run this exact command to find the next WP that needs implementation:

```bash
for f in kitty-specs/*/status.events.jsonl; do
  mission=$(basename $(dirname $f))
  # Find all WPs mentioned in this file
  for wp in $(grep -oP '"wp_id"\s*:\s*"WP\d+"' "$f" | grep -oP 'WP\d+' | sort -u); do
    # Get the LAST event for this WP
    last_lane=$(grep "$wp" "$f" | grep -oP '"to_lane"\s*:\s*"\w+"' | tail -1 | grep -oP '\w+"$' | tr -d '"')
    if [ "$last_lane" = "planned" ]; then
      wp_file=$(find "kitty-specs/$mission/tasks" -name "*${wp}*.md" -type f 2>/dev/null | head -1)
      if [ -n "$wp_file" ]; then
        echo "PENDING: $mission $wp $wp_file"
        exit 0
      fi
    fi
  done
done
echo "NO_PENDING_WPS"
```

**VERIFICATION GATE 1**: The output MUST be either:
- `PENDING: <mission> <WP-id> <file-path>` — proceed to Step 2
- `NO_PENDING_WPS` — stop, report "All WPs complete"

If you get neither output, the command is broken — debug it before proceeding.

---

## Step 2: READ The WP Spec

Read the file at `<file-path>` from Step 1's output. Extract:
- The WP title (from frontmatter `title:` field)
- All subtask IDs (T0XX patterns)
- The list of "Files to Touch"
- The "Definition of Done" criteria

**VERIFICATION GATE 2**: Write the extracted info to `/tmp/wp-spec-summary.txt`:

```bash
MISSION="<mission from Step 1>"
WP="<WP-id from Step 1>"
WP_FILE="<file-path from Step 1>"

TITLE=$(grep '^title:' "$WP_FILE" | head -1 | cut -d: -f2- | sed 's/^ *//;s/"$//')
SUBTASKS=$(grep -oP 'T\d{3}' "$WP_FILE" | sort -u | tr '\n' ', ' | sed 's/,$//')
FILES_SECTION=$(sed -n '/Files to Touch/,/^[A-Z]/p' "$WP_FILE" | grep -v 'Files to Touch' | grep -v '^[A-Z]' | grep -v '^$' | head -10)
DONE_SECTION=$(sed -n '/Definition of Done/,/^[A-Z]/p' "$WP_FILE" | grep -v 'Definition of Done' | grep -v '^[A-Z]' | grep -v '^$' | head -5)

cat > /tmp/wp-spec-summary.txt <<EOF
MISSION: ${MISSION}
WP: ${WP}
TITLE: ${TITLE}
SUBTASKS: ${SUBTASKS}
FILES_TO_TOUCH: ${FILES_SECTION}
DONE_CRITERIA: ${DONE_SECTION}
EOF

cat /tmp/wp-spec-summary.txt
```

You MUST see this output before proceeding to Step 3. If TITLE is empty or SUBTASKS is empty, the WP file is malformed — report the issue and ABORT.

---

## Step 2.5: CHECK Dependencies

```bash
# Check WP dependencies
DEPS=$(grep -A5 '^dependencies:' "$WP_FILE" 2>/dev/null | grep -oP 'WP\d+' || true)
if [ -n "$DEPS" ]; then
  echo "=== CHECKING DEPENDENCIES ==="
  for dep in $DEPS; do
    dep_done=$(grep "\"wp_id\"\s*:\s*\"$dep\"" "kitty-specs/${MISSION}/status.events.jsonl" 2>/dev/null | grep -c '"to_lane"\s*:\s*"done"' || true)
    if [ "$dep_done" -eq 0 ]; then
      echo "WARNING: Dependency $dep may not be complete for $MISSION"
      echo "Proceeding anyway — verify this is correct"
    else
      echo "✓ Dependency $dep is done"
    fi
  done
fi
```

---

## Step 3: IMPLEMENT The Subtasks

For EACH subtask listed in `/tmp/wp-spec-summary.txt`:

1. Read the current state of each file mentioned in "Files to Touch"
2. Implement the changes described in the subtask
3. Follow existing code patterns (ESM, 4-space indent, semicolons, camelCase)
4. DO NOT refactor unrelated code
5. DO NOT add features not specified in the subtask
6. Write tests for new behavior

After implementing ALL subtasks, verify:

```bash
echo "=== FILES MODIFIED ==="
git diff --stat HEAD
echo "=== NEW FILES ==="
git ls-files --others --exclude-standard | grep -v node_modules | grep -v report
```

**VERIFICATION GATE 3**: At least ONE file must be modified or created. If `git diff --stat HEAD` shows zero changes AND no new files exist, you did NOT implement anything. GO BACK to Step 3 and actually write the code.

---

## Step 4: VALIDATE With REAL Tests

Run the actual tests and capture the REAL output:

```bash
echo "=== UNIT TESTS ==="
set -o pipefail
node --test tests/*.test.js 2>&1 | tee /tmp/test-output-full.txt
UNIT_EXIT=${PIPESTATUS[0]}
set +o pipefail

echo "=== REGRESSION TESTS ==="
set -o pipefail
node tests/run-regression-tests.mjs 2>&1 | tee -a /tmp/test-output-full.txt
REG_EXIT=${PIPESTATUS[0]}
set +o pipefail

echo "TEST_EXIT_CODES: unit=$UNIT_EXIT regression=$REG_EXIT"

# Extract summary lines
grep -E "pass|fail|tests|suites|PASS|FAIL" /tmp/test-output-full.txt | tail -5 > /tmp/test-results.txt

# VERIFY: /tmp/test-results.txt must contain at least one number
if ! grep -qP '\d+' /tmp/test-results.txt; then
  echo "ABORT: Test results contain no numbers — tests may not have run"
  exit 1
fi

if [ $UNIT_EXIT -ne 0 ]; then
  echo "WARNING: Unit tests exited with code $UNIT_EXIT"
fi
```

---

## Step 5: COMMIT The Implementation

ONLY after ALL verification gates pass (Steps 1-4):

```bash
MISSION=$(head -1 /tmp/wp-spec-summary.txt | cut -d: -f2- | xargs)
WP=$(head -2 /tmp/wp-spec-summary.txt | tail -1 | cut -d: -f2- | xargs)
TITLE=$(grep -m1 '^title:' "$WP_FILE" 2>/dev/null | head -1 | sed 's/^title:\s*//' | sed 's/^ *//;s/\s*$//' | sed 's/"//g' | sed "s/\`/'/g" | head -c 80)
TEST_RESULTS=$(cat /tmp/test-results.txt)

git add bot/ services/ tests/ kitty-specs/ server.js package.json package-lock.json 2>/dev/null
git add .archon/commands/ .archon/workflows/ 2>/dev/null
git commit -m "feat(${MISSION}): implement ${WP} - ${TITLE}

${TEST_RESULTS}

Co-Authored-By: Codex GPT-5 <noreply@openai.com>"

echo "COMMIT_HASH=$(git rev-parse HEAD)"
```

If the commit fails (no changes staged, hook rejection, etc.), ABORT and report the failure reason.

---

## Step 6: RECORD Status Event

ONLY after the commit succeeds:

```bash
MISSION=$(head -1 /tmp/wp-spec-summary.txt | cut -d: -f2- | xargs)
WP=$(head -2 /tmp/wp-spec-summary.txt | tail -1 | cut -d: -f2- | xargs)
COMMIT_HASH=$(git rev-parse HEAD)

# Escape test output for safe JSON embedding
TEST_OUTPUT_JSON=$(cat /tmp/test-results.txt | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

cat >> "kitty-specs/${MISSION}/status.events.jsonl" <<EOJSON
{"actor":"spec-kitty-implement","at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","event_id":"$(date -u +%Y%m%dT%H%M%S)-${WP}-done-$RANDOM","evidence":{"tests":${TEST_OUTPUT_JSON},"commit":"${COMMIT_HASH}"},"execution_mode":"direct_repo","feature_slug":"${MISSION}","force":false,"from_lane":"planned","mission_slug":"${MISSION}","reason":"${WP} implemented and verified","review_ref":null,"to_lane":"done","work_package_id":"${WP}","wp_id":"${WP}"}
EOJSON

echo "STATUS RECORDED: ${MISSION} ${WP} → done (commit: ${COMMIT_HASH})"
```

---

## ABORT CONDITIONS

If at ANY point:

- **Step 1** finds no pending WPs → STOP, report "All WPs complete"
- **Step 2** finds empty TITLE or SUBTASKS → ABORT, report "WP spec file is malformed"
- **Step 3** produces zero code changes after implementation attempt → ABORT, report "Implementation failed — no code written"
- **Step 4** tests crash (exit code non-zero for BOTH test suites) → ABORT, report "Test infrastructure broken"
- **Step 5** commit fails → ABORT, report "Commit failed: <reason>"

Do NOT proceed to Step 6 if any earlier step failed or was aborted.
