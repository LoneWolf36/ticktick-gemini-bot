#!/usr/bin/env node
/**
 * Checkpoint Manager for Spec-Kitty Universal Workflow
 *
 * Handles checkpoint save/load/resume, WP discovery, reviewer selection,
 * circuit breaker logic, and git snapshot management.
 *
 * Usage:
 *   node checkpoint-manager.js <command> [options]
 *
 * Commands:
 *   init            — Initialize checkpoint state from config
 *   resume          — Resume from an existing checkpoint
 *   discover        — Discover pending WPs from config and status files
 *   snapshot        — Create a git snapshot before implementation/fix
 *   save            — Save checkpoint after WP completion
 *   cleanup         — Remove checkpoints older than retention period
 *   select-reviewers — Dynamically select review agents based on spec content
 *   run-review      — Execute a single review agent with retry logic
 *   circuit-breaker — Check if circuit breaker should trip
 *   mission-summary — Generate summary for a completed mission
 *   apply-fixes     — Apply review findings as fix tasks
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import validateConfig from './config-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ───────────────────────────────────────────────────────────────
// CLI Argument Parsing
// ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { command: argv[2] };
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith('--')) {
        args[key] = value;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// ───────────────────────────────────────────────────────────────
// Config Loading (with schema validation)
// ───────────────────────────────────────────────────────────────

async function loadConfig(configPath, options = {}) {
  const resolved = resolve(configPath);
  if (!existsSync(resolved)) {
    console.error(`ERROR: Config file not found: ${resolved}`);
    process.exit(2); // Fatal: file not found
  }

  // Determine schema path (sibling to config file)
  const schemaPath = options.schemaPath
    ? resolve(options.schemaPath)
    : resolve(dirname(resolved), 'workflow-config.schema.json');

  const projectRoot = options.projectRoot || resolve(dirname(resolved), '..');

  const { success, result, config, exitCode } = await validateConfig(resolved, {
    schemaPath,
    strict: options.strict || false,
    fix: options.fix || false,
    verbose: options.verbose || false,
    projectRoot
  });

  if (!success) {
    console.error('\nConfig validation failed. Aborting.');
    process.exit(exitCode || 1);
  }

  return config;
}

// ───────────────────────────────────────────────────────────────
// Checkpoint State Management
// ───────────────────────────────────────────────────────────────

async function initCheckpointState(args) {
  const config = await loadConfig(args.config);
  const checkpointDir = resolve(args.dir || config.resilience.checkpoint.directory);

  mkdirSync(checkpointDir, { recursive: true });

  const initialState = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    status: 'initialized',
    currentMission: null,
    currentWP: null,
    completedWPs: [],
    failedWPs: [],
    escalatedWPs: [],
    reviewResults: {},
    circuitBreakerTripped: false,
    config: {
      projectRoot: config.project.root,
      specDirectory: config.project.specDirectory,
      baseBranch: config.project.baseBranch,
      missions: config.missions.map(m => ({
        id: m.id,
        slug: m.slug,
        wpCount: m.workPackages.length,
        wpCompleted: 0
      }))
    }
  };

  const statePath = join(checkpointDir, 'current-state.json');
  writeFileSync(statePath, JSON.stringify(initialState, null, 2));
  console.log(`Checkpoint initialized: ${statePath}`);
  return initialState;
}

function loadCheckpointState(checkpointDir) {
  const statePath = join(checkpointDir, 'current-state.json');
  if (!existsSync(statePath)) {
    console.error('No checkpoint state found. Run init first.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(statePath, 'utf8'));
}

function saveCheckpointState(state, checkpointDir) {
  state.lastUpdatedAt = new Date().toISOString();
  const statePath = join(checkpointDir, 'current-state.json');
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function resumeCheckpoint(args) {
  const checkpointDir = resolve(dirname(args.file));
  const state = loadCheckpointState(checkpointDir);

  console.log('=== Checkpoint Resume ===');
  console.log(`Created: ${state.createdAt}`);
  console.log(`Last Updated: ${state.lastUpdatedAt}`);
  console.log(`Status: ${state.status}`);
  console.log(`Current Mission: ${state.currentMission || 'none'}`);
  console.log(`Current WP: ${state.currentWP || 'none'}`);
  console.log(`Completed WPs: ${state.completedWPs.length}`);
  console.log(`Failed WPs: ${state.failedWPs.length}`);
  console.log(`Escalated WPs: ${state.escalatedWPs.length}`);
  console.log(`Circuit Breaker: ${state.circuitBreakerTripped ? 'TRIPPED' : 'closed'}`);

  if (state.circuitBreakerTripped) {
    console.log('\nWARNING: Circuit breaker was tripped. Review escalated WPs before resuming.');
  }

  if (state.currentMission && state.currentWP) {
    console.log(`\nResuming from: ${state.currentMission}/${state.currentWP}`);
  } else {
    console.log('\nNo partial WP in progress. Starting from next pending WP.');
  }

  return state;
}

// ───────────────────────────────────────────────────────────────
// WP Discovery
// ───────────────────────────────────────────────────────────────

async function discoverPendingWPs(args) {
  const config = await loadConfig(args.config);
  const specDir = resolve(args.specDir || config.project.specDirectory);
  const outputPath = resolve(args.output);

  const pendingWPs = [];

  for (const mission of config.missions) {
    const missionDir = join(specDir, mission.slug);
    const statusFile = join(missionDir, 'status.events.jsonl');

    // Parse status.events.jsonl to find completed WPs
    const completedWPIds = new Set();
    if (existsSync(statusFile)) {
      const lines = readFileSync(statusFile, 'utf8').trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.to_lane === 'done' || event.to_state === 'done' || event.status === 'done') {
            completedWPIds.add(event.wp_id);
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    for (const wp of mission.workPackages) {
      const skipIfComplete = wp.skipIfComplete !== false;
      if (skipIfComplete && completedWPIds.has(wp.id)) {
        console.log(`  SKIP: ${mission.slug}/${wp.id} (already done)`);
        continue;
      }

      pendingWPs.push({
        missionId: mission.id,
        missionSlug: mission.slug,
        wpId: wp.id,
        wpFile: wp.file,
        dependencies: wp.dependencies || [],
        specPath: join(missionDir, wp.file)
      });
    }
  }

  // Write pending list
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(pendingWPs, null, 2));

  console.log(`\nDiscovered ${pendingWPs.length} pending WPs`);
  return pendingWPs;
}

// ───────────────────────────────────────────────────────────────
// Git Snapshot Management
// ───────────────────────────────────────────────────────────────

function createSnapshot(args) {
  const strategy = args.strategy || 'git-stash';
  const label = args.label || `pre-${args.wp || 'work'}`;
  const checkpointDir = resolve(args.dir);
  const snapshotsDir = join(checkpointDir, 'snapshots');

  mkdirSync(snapshotsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotName = `${args.mission}-${args.wp}-${label}-${timestamp}`;

  console.log(`Creating snapshot: ${snapshotName} (strategy: ${strategy})`);

  try {
    switch (strategy) {
      case 'git-stash': {
        // Check if there are uncommitted changes
        const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
        if (status) {
          execFileSync('git', ['stash', 'push', '-u', '-m', `snapshot:${snapshotName}`], { encoding: 'utf8' });
          // Record the stash reference
          const stashRef = execFileSync('git', ['stash', 'list', '-1', '--format=%H'], { encoding: 'utf8' }).trim();
          const snapshotMeta = {
            name: snapshotName,
            strategy: 'git-stash',
            stashHash: stashRef,
            timestamp,
            mission: args.mission,
            wp: args.wp,
            label
          };
          writeFileSync(
            join(snapshotsDir, `${snapshotName}.json`),
            JSON.stringify(snapshotMeta, null, 2)
          );
          console.log(`  Stash created: ${stashRef}`);
        } else {
          console.log('  No uncommitted changes. Skipping stash.');
          const snapshotMeta = {
            name: snapshotName,
            strategy: 'git-stash',
            stashHash: null,
            timestamp,
            mission: args.mission,
            wp: args.wp,
            label,
            note: 'No changes to stash'
          };
          writeFileSync(
            join(snapshotsDir, `${snapshotName}.json`),
            JSON.stringify(snapshotMeta, null, 2)
          );
        }
        break;
      }

      case 'git-reset': {
        const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        const snapshotMeta = {
          name: snapshotName,
          strategy: 'git-reset',
          commitHash: headCommit,
          timestamp,
          mission: args.mission,
          wp: args.wp,
          label
        };
        writeFileSync(
          join(snapshotsDir, `${snapshotName}.json`),
          JSON.stringify(snapshotMeta, null, 2)
        );
        console.log(`  Reset point recorded: ${headCommit}`);
        break;
      }

      case 'worktree-snapshot': {
        const branchName = `snapshot-${snapshotName}`;
        execFileSync('git', ['checkout', '-b', branchName], { encoding: 'utf8' });
        execFileSync('git', ['checkout', '-'], { encoding: 'utf8' });
        const snapshotMeta = {
          name: snapshotName,
          strategy: 'worktree-snapshot',
          branchName,
          timestamp,
          mission: args.mission,
          wp: args.wp,
          label
        };
        writeFileSync(
          join(snapshotsDir, `${snapshotName}.json`),
          JSON.stringify(snapshotMeta, null, 2)
        );
        console.log(`  Worktree branch created: ${branchName}`);
        break;
      }

      default:
        console.error(`Unknown snapshot strategy: ${strategy}`);
        process.exit(1);
    }

    console.log(`Snapshot saved: ${snapshotName}`);
    return snapshotName;
  } catch (error) {
    console.error(`Snapshot failed: ${error.message}`);
    // Don't exit — snapshot failure should not block the workflow
    return null;
  }
}

function restoreSnapshot(snapshotName, checkpointDir) {
  const snapshotsDir = join(checkpointDir, 'snapshots');
  const metaPath = join(snapshotsDir, `${snapshotName}.json`);

  if (!existsSync(metaPath)) {
    console.error(`Snapshot not found: ${snapshotName}`);
    return false;
  }

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

  console.log(`Restoring snapshot: ${snapshotName} (strategy: ${meta.strategy})`);

  try {
    switch (meta.strategy) {
      case 'git-stash':
        if (meta.stashHash) {
          execFileSync('git', ['stash', 'pop', meta.stashHash], { encoding: 'utf8' });
        }
        break;
      case 'git-reset':
        execFileSync('git', ['reset', '--hard', meta.commitHash], { encoding: 'utf8' });
        break;
      case 'worktree-snapshot':
        execFileSync('git', ['checkout', meta.branchName], { encoding: 'utf8' });
        break;
    }
    console.log(`Snapshot restored: ${snapshotName}`);
    return true;
  } catch (error) {
    console.error(`Restore failed: ${error.message}`);
    return false;
  }
}

// ───────────────────────────────────────────────────────────────
// Dynamic Reviewer Selection
// ───────────────────────────────────────────────────────────────

async function selectReviewers(args) {
  const config = await loadConfig(args.config);
  const specPath = resolve(args.specPath);
  const outputPath = resolve(args.output);
  const parallelLimit = parseInt(args.parallelLimit || config.review.parallelLimit, 10);

  // Read spec content for keyword analysis
  let specContent = '';
  if (existsSync(specPath)) {
    specContent = readFileSync(specPath, 'utf8').toLowerCase();
  }

  const allAgents = config.review.agents.filter(a => !a.backup);
  const backupAgents = config.review.agents.filter(a => a.backup);

  // Score each agent based on tag matching
  const scoredAgents = allAgents.map(agent => {
    let score = 0;
    for (const tag of agent.tags) {
      const regex = new RegExp(tag.toLowerCase(), 'g');
      const matches = specContent.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    return { ...agent, matchScore: score };
  });

  // Sort by match score descending
  scoredAgents.sort((a, b) => b.matchScore - a.matchScore);

  // Mandatory agents always included
  const mandatoryAgents = scoredAgents.filter(a => a.mandatory);

  // Fill remaining slots from top-scoring non-mandatory agents
  const remainingSlots = parallelLimit - mandatoryAgents.length;
  const optionalAgents = scoredAgents
    .filter(a => !a.mandatory)
    .slice(0, remainingSlots);

  const selected = [...mandatoryAgents, ...optionalAgents];

  // Ensure we have at least parallelLimit agents (pad with backup if needed)
  if (selected.length < parallelLimit && backupAgents.length > 0) {
    const needed = parallelLimit - selected.length;
    selected.push(...backupAgents.slice(0, needed));
  }

  const result = {
    mission: args.mission,
    wp: args.wp,
    selectedAgents: selected.map(a => ({
      id: a.id,
      skill: a.skill,
      weight: a.weight,
      mandatory: a.mandatory,
      matchScore: a.matchScore,
      fallback: a.fallback
    })),
    backupPool: backupAgents.map(a => a.id),
    totalSelected: selected.length,
    parallelLimit
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`Selected ${result.totalSelected} review agents for ${args.mission}/${args.wp}`);
  for (const agent of result.selectedAgents) {
    const marker = agent.mandatory ? ' [MANDATORY]' : '';
    console.log(`  - ${agent.id} (${agent.skill}) score=${agent.matchScore}${marker}`);
  }

  return result;
}

// ───────────────────────────────────────────────────────────────
// Review Execution with Retry
// ───────────────────────────────────────────────────────────────

async function runReviewWithRetry(args) {
  const config = await loadConfig(args.config);
  const retryConfig = config.resilience.retry;
  const maxAttempts = retryConfig.maxAttempts;
  const backoffMultiplier = retryConfig.backoffMultiplier;
  const initialDelay = retryConfig.initialDelaySeconds;
  const maxDelay = retryConfig.maxDelaySeconds;

  const outputPath = resolve(args.output);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\nReview Agent ${args.agentId}: Attempt ${attempt}/${maxAttempts}`);

    try {
      // Execute the review using the assigned skill
      // In practice, this invokes the skill tool or calls the review API
      const reviewResult = await executeReview({
        agentId: args.agentId,
        skill: args.skill,
        mission: args.mission,
        wp: args.wp,
        specPath: args.specPath,
        config
      });

      // Save result
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(reviewResult, null, 2));

      console.log(`Review completed: ${args.agentId} — ${reviewResult.verdict}`);
      return reviewResult;
    } catch (error) {
      lastError = error;
      console.error(`Review attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxAttempts) {
        // Exponential backoff
        const delay = Math.min(
          initialDelay * Math.pow(backoffMultiplier, attempt - 1) * 1000,
          maxDelay * 1000
        );
        console.log(`Retrying in ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted — try fallback agent
  console.log(`\nAll ${maxAttempts} retries exhausted for ${args.agentId}`);

  const agentConfig = config.review.agents.find(a => a.id === args.agentId);
  if (agentConfig && agentConfig.fallback) {
    console.log(`Attempting fallback to: ${agentConfig.fallback}`);
    try {
      const fallbackResult = await executeReview({
        agentId: agentConfig.fallback,
        skill: config.review.agents.find(a => a.id === agentConfig.fallback)?.skill || agentConfig.fallback,
        mission: args.mission,
        wp: args.wp,
        specPath: args.specPath,
        config
      });

      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify({
        ...fallbackResult,
        originalAgent: args.agentId,
        fallbackUsed: true
      }, null, 2));

      console.log(`Fallback review completed: ${agentConfig.fallback}`);
      return fallbackResult;
    } catch (fallbackError) {
      console.error(`Fallback also failed: ${fallbackError.message}`);
    }
  }

  // Complete failure — save error result
  const errorResult = {
    agentId: args.agentId,
    mission: args.mission,
    wp: args.wp,
    verdict: 'error',
    status: 'failed',
    error: lastError?.message || 'Unknown error',
    retries: maxAttempts,
    timestamp: new Date().toISOString()
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(errorResult, null, 2));

  return errorResult;
}

async function executeReview({ agentId, skill, mission, wp, specPath, config }) {
  // This is the placeholder for the actual review execution.
  // In a real implementation, this would:
  // 1. Load the skill context
  // 2. Build a review prompt from the spec + implementation diff
  // 3. Call the AI provider with the skill's system prompt
  // 4. Parse the review result (pass/fail/fix with findings)

  const specContent = existsSync(specPath) ? readFileSync(specPath, 'utf8') : '';
  const specDir = dirname(specPath);

  // Get git diff for this WP's changes (if any)
  let gitDiff = '';
  try {
    gitDiff = execFileSync('git', ['diff', 'HEAD', '--stat'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  } catch {
    gitDiff = '(no changes detected)';
  }

  // Build review prompt
  const reviewPrompt = `
You are reviewing work package ${wp} for mission ${mission}.

## Your Role
Skill: ${skill}
Evaluate the implementation from your area of expertise.

## Specification
${specContent.substring(0, 8000)}

## Changes
${gitDiff}

## Review Criteria
1. Does the implementation satisfy the spec requirements?
2. Are there security/architecture/quality concerns? (based on your skill)
3. Does it align with the Product Vision?
4. Are tests adequate?

## Output Format
Respond with a JSON object:
{
  "verdict": "pass" | "fail" | "fix",
  "confidence": 0.0-1.0,
  "findings": [
    { "severity": "critical" | "major" | "minor" | "info", "description": "...", "file": "...", "suggestion": "..." }
  ],
  "summary": "Brief review summary"
}
`;

  // In production, this calls the AI provider:
  // const result = await aiProvider.chat(reviewPrompt, { skill, temperature: config.ai.temperature });
  // return parseReviewResult(result);

  // For now, return a placeholder structure
  return {
    agentId,
    skill,
    mission,
    wp,
    verdict: 'pass',
    confidence: 0.8,
    findings: [],
    summary: 'Review placeholder — integrate AI provider for actual review execution.',
    timestamp: new Date().toISOString()
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ───────────────────────────────────────────────────────────────
// Circuit Breaker
// ───────────────────────────────────────────────────────────────

async function checkCircuitBreaker(args) {
  const checkpointDir = resolve(args.checkpointDir);
  const state = loadCheckpointState(checkpointDir);
  const threshold = parseInt(args.threshold, 10);
  const config = await loadConfig(args.config);

  // Count failed reviews for current mission/wp
  const reviewFiles = readdirSync(checkpointDir)
    .filter(f => f.startsWith(`review-${args.mission}-${args.wp}-`) && f.endsWith('.json'));

  let failedCount = 0;
  let totalCount = reviewFiles.length;

  for (const file of reviewFiles) {
    try {
      const result = JSON.parse(readFileSync(join(checkpointDir, file), 'utf8'));
      if (result.verdict === 'error' || result.status === 'failed') {
        failedCount++;
      }
    } catch {
      // Skip malformed files
    }
  }

  console.log(`Circuit Breaker: ${failedCount}/${totalCount} agents failed (threshold: ${threshold})`);

  if (failedCount >= threshold) {
    console.log('CIRCUIT BREAKER TRIPPED');

    state.circuitBreakerTripped = true;
    state.status = 'circuit_breaker_tripped';
    saveCheckpointState(state, checkpointDir);

    // Escalate
    const escalationChannel = args.escalationChannel || config.resilience.circuitBreaker.escalationChannel;
    escalateToHuman({
      mission: args.mission,
      wp: args.wp,
      failedCount,
      totalCount,
      channel: escalationChannel,
      config,
      reason: `Circuit breaker: ${failedCount}/${totalCount} review agents failed`
    });

    if (escalationChannel === 'human') {
      console.log('Workflow paused. Waiting for human intervention...');
      console.log(`Timeout: ${config.resilience.circuitBreaker.escalationConfig.pauseTimeoutMinutes} minutes`);

      if (config.resilience.circuitBreaker.autoResumeWithReducedQuorum) {
        console.log('Will auto-resume with reduced quorum after timeout.');
      }
    }

    process.exit(1);
  } else {
    console.log('Circuit breaker: closed (continuing)');
  }
}

// ───────────────────────────────────────────────────────────────
// Checkpoint Save
// ───────────────────────────────────────────────────────────────

function saveCheckpoint(args) {
  const checkpointDir = resolve(args.dir);
  const state = loadCheckpointState(checkpointDir);

  const wpKey = `${args.mission}/${args.wp}`;

  if (args.status === 'complete') {
    if (!state.completedWPs.includes(wpKey)) {
      state.completedWPs.push(wpKey);
    }
    state.currentWP = null;

    // Update mission progress
    const missionConfig = state.config.missions.find(m => m.slug === args.mission);
    if (missionConfig) {
      missionConfig.wpCompleted++;
    }
  } else if (args.status === 'failed') {
    if (!state.failedWPs.includes(wpKey)) {
      state.failedWPs.push(wpKey);
    }
  }

  state.status = args.status === 'complete' ? 'in_progress' : 'blocked';
  saveCheckpointState(state, checkpointDir);

  console.log(`Checkpoint saved: ${wpKey} — ${args.status}`);
}

// ───────────────────────────────────────────────────────────────
// Checkpoint Cleanup
// ───────────────────────────────────────────────────────────────

function cleanupCheckpoints(args) {
  const checkpointDir = resolve(args.dir);
  const retentionDays = parseInt(args.retentionDays, 10) || 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  console.log(`Cleaning checkpoints older than ${retentionDays} days`);

  const snapshotsDir = join(checkpointDir, 'snapshots');
  if (existsSync(snapshotsDir)) {
    const files = readdirSync(snapshotsDir);
    let cleaned = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = join(snapshotsDir, file);
      const stat = statSync(filePath);

      if (stat.mtime < cutoffDate) {
        rmSync(filePath);
        cleaned++;
      }
    }

    console.log(`Cleaned ${cleaned} old snapshot files`);
  }
}

// ───────────────────────────────────────────────────────────────
// Mission Summary
// ───────────────────────────────────────────────────────────────

function missionSummary(args) {
  const checkpointDir = resolve(args.checkpointDir);
  const state = loadCheckpointState(checkpointDir);

  const missionConfig = state.config.missions.find(m => m.slug === args.mission);
  if (!missionConfig) {
    console.error(`Mission not found: ${args.mission}`);
    return;
  }

  // Collect review synthesis files for this mission
  const synthesisFiles = readdirSync(checkpointDir)
    .filter(f => f.startsWith(`synthesis-${args.mission}-`) && f.endsWith('.json'));

  let passCount = 0;
  let fixCount = 0;
  let failCount = 0;
  let escalationCount = 0;

  for (const file of synthesisFiles) {
    try {
      const synthesis = JSON.parse(readFileSync(join(checkpointDir, file), 'utf8'));
      switch (synthesis.status) {
        case 'pass': passCount++; break;
        case 'fix': fixCount++; break;
        case 'fail': failCount++; break;
        case 'escalated': escalationCount++; break;
      }
    } catch {
      // Skip
    }
  }

  console.log(`\n=== Mission Summary: ${args.mission} ===`);
  console.log(`WPs Completed: ${missionConfig.wpCompleted}/${missionConfig.wpCount}`);
  console.log(`Reviews Passed: ${passCount}`);
  console.log(`Reviews with Fixes: ${fixCount}`);
  console.log(`Reviews Failed: ${failCount}`);
  console.log(`Escalations: ${escalationCount}`);
  console.log(`Circuit Breaker: ${state.circuitBreakerTripped ? 'TRIPPED' : 'closed'}`);
}

// ───────────────────────────────────────────────────────────────
// Escalation Handler
// ───────────────────────────────────────────────────────────────

function escalateToHuman({ mission, wp, failedCount, totalCount, channel, config, reason }) {
  const message = (config.resilience.circuitBreaker.escalationConfig.message || '')
    .replace('{mission}', mission)
    .replace('{wp}', wp)
    .replace('{failedCount}', String(failedCount))
    .replace('{totalCount}', String(totalCount))
    .replace('{retryCount}', String(config.resilience.retry.maxAttempts))
    .replace('{reason}', reason);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`ESCALATION: ${channel}`);
  console.log(`${'='.repeat(60)}`);
  console.log(message);
  console.log(`${'='.repeat(60)}\n`);

  // Send notification based on channel
  switch (channel) {
    case 'webhook':
      sendWebhookNotification(config, message, { mission, wp });
      break;
    case 'slack':
      sendSlackNotification(config, message, { mission, wp });
      break;
    case 'email':
      sendEmailNotification(config, message, { mission, wp });
      break;
    case 'telegram':
      sendTelegramNotification(config, message, { mission, wp });
      break;
    case 'human':
    case 'none':
    default:
      console.log('Human notification: See message above for manual intervention steps.');
      break;
  }
}

function sendWebhookNotification(config, message, context) {
  // Placeholder — integrate with actual webhook
  console.log('[WEBHOOK] Would send to:', config.notifications.channels?.find(c => c.type === 'webhook')?.url);
  console.log('[WEBHOOK]', message);
}

function sendSlackNotification(config, message, context) {
  // Placeholder — integrate with Slack API
  console.log('[SLACK]', message);
}

function sendEmailNotification(config, message, context) {
  // Placeholder — integrate with email service
  console.log('[EMAIL]', message);
}

function sendTelegramNotification(config, message, context) {
  // Placeholder — integrate with Telegram Bot API
  console.log('[TELEGRAM]', message);
}

// ───────────────────────────────────────────────────────────────
// Main Entry Point
// ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (!args.command) {
    console.log('Usage: node checkpoint-manager.js <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  init            Initialize checkpoint state from config');
    console.log('  resume          Resume from an existing checkpoint');
    console.log('  discover        Discover pending WPs');
    console.log('  snapshot        Create a git snapshot');
    console.log('  restore         Restore a git snapshot');
    console.log('  save            Save checkpoint after WP completion');
    console.log('  cleanup         Remove old checkpoints');
    console.log('  select-reviewers  Dynamically select review agents');
    console.log('  run-review      Execute review with retry');
    console.log('  circuit-breaker  Check circuit breaker status');
    console.log('  mission-summary  Generate mission summary');
    process.exit(0);
  }

  switch (args.command) {
    case 'init':
      await initCheckpointState(args);
      break;

    case 'resume':
      resumeCheckpoint(args);
      break;

    case 'discover':
      await discoverPendingWPs(args);
      break;

    case 'snapshot':
      createSnapshot(args);
      break;

    case 'restore':
      restoreSnapshot(args.name, resolve(args.dir));
      break;

    case 'save':
      saveCheckpoint(args);
      break;

    case 'cleanup':
      cleanupCheckpoints(args);
      break;

    case 'select-reviewers':
      await selectReviewers(args);
      break;

    case 'run-review':
      await runReviewWithRetry(args);
      break;

    case 'circuit-breaker':
      await checkCircuitBreaker(args);
      break;

    case 'mission-summary':
      missionSummary(args);
      break;

    default:
      console.error(`Unknown command: ${args.command}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Checkpoint Manager Error:', err);
  process.exit(1);
});
