#!/usr/bin/env node

/**
 * Save checkpoint state after completing a feature phase
 * Usage: node commands/save-checkpoint.js <mission-slug> <phase-name>
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Parse arguments
const missionSlug = process.argv[2];
const phaseName = process.argv[3];

if (!missionSlug || !phaseName) {
  console.error('Usage: node commands/save-checkpoint.js <mission-slug> <phase-name>');
  process.exit(1);
}

console.log(`\n📸 Saving checkpoint for mission: ${missionSlug}, phase: ${phaseName}\n`);

// Phase 1: CAPTURE STATE
console.log('## Phase 1: CAPTURE STATE\n');

// 1.1 Get Current Git State
const currentBranch = execSync('git branch --show-current').toString().trim();
const headCommit = execSync('git rev-parse HEAD').toString().trim();
const commitMsg = execSync('git log -1 --format="%s"').toString().trim();

console.log(`Branch: ${currentBranch}`);
console.log(`Commit: ${headCommit}`);
console.log(`Message: ${commitMsg}`);

// 1.3 Get Test Status
let testOutput = '';
try {
  testOutput = execSync('node tests/run-regression-tests.mjs 2>&1 | tail -5').toString();
} catch (e) {
  testOutput = e.stderr?.toString() || e.stdout?.toString() || 'Tests failed or not available';
}

console.log(`Test Status: ${testOutput.trim()}\n`);

// Phase 2: WRITE CHECKPOINT
console.log('## Phase 2: WRITE CHECKPOINT\n');

const checkpointDir = join(process.cwd(), '.archon', 'checkpoints');
mkdirSync(checkpointDir, { recursive: true });

const checkpoint = {
  version: 1,
  phase: phaseName,
  mission: missionSlug,
  completed_at: new Date().toISOString(),
  git: {
    branch: currentBranch,
    head_commit: headCommit,
    last_commit_msg: commitMsg,
  },
  test_status: testOutput.trim(),
  status: 'completed',
};

const checkpointFile = join(checkpointDir, `phase-${phaseName}.json`);
writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2) + '\n');

console.log(`✓ Checkpoint saved: phase-${phaseName}.json`);
console.log(`✓ Mission: ${missionSlug}`);
console.log(`✓ Commit: ${headCommit}`);
console.log(`✓ Branch: ${currentBranch}\n`);

// Phase 3: UPDATE STATE FILE
console.log('## Phase 3: UPDATE STATE FILE\n');

const trackerFile = join(checkpointDir, 'current-state.json');

if (existsSync(trackerFile)) {
  // Append phase to existing state
  const prev = JSON.parse(readFileSync(trackerFile, 'utf8'));
  const updated = {
    ...prev,
    lastCompletedPhase: phaseName,
    lastCompletedMission: missionSlug,
    lastUpdatedAt: new Date().toISOString(),
  };
  writeFileSync(trackerFile, JSON.stringify(updated, null, 2) + '\n');
  console.log('✓ State tracker updated (appended)\n');
} else {
  // Create initial state
  const initialState = {
    version: 1,
    lastCompletedPhase: phaseName,
    lastCompletedMission: missionSlug,
    lastUpdatedAt: new Date().toISOString(),
    status: 'in_progress',
  };
  writeFileSync(trackerFile, JSON.stringify(initialState, null, 2) + '\n');
  console.log('✓ State tracker created\n');
}

// Success Criteria
console.log('## Success Criteria\n');
console.log('✅ CHECKPOINT_WRITTEN: Phase checkpoint file exists');
console.log('✅ STATE_UPDATED: Current state tracker updated');
console.log('✅ GIT_STATE_CAPTURED: Branch, commit, and message recorded\n');

console.log('🎉 Checkpoint saved successfully!');
