#!/usr/bin/env node
/**
 * Config Schema Validator for Archon Spec-Kitty Workflow
 *
 * Validates workflow-config.json against the JSON Schema, enforces runtime
 * ranges, checks WP file existence, and validates agent pool integrity.
 *
 * Usage:
 *   node config-validator.js [options]
 *
 * Options:
 *   --config <path>   Path to config file (default: .archon/workflow-config.json)
 *   --schema <path>   Path to JSON Schema (default: .archon/workflow-config.schema.json)
 *   --strict          Treat warnings as errors
 *   --fix             Auto-correct out-of-range values (e.g., cap retry at 10)
 *   --verbose         Print detailed validation info
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ───────────────────────────────────────────────────────────────
// CLI Argument Parsing
// ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    config: null,
    schema: null,
    strict: false,
    fix: false,
    verbose: false
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--strict') {
      args.strict = true;
    } else if (arg === '--fix') {
      args.fix = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--config' && argv[i + 1]) {
      args.config = argv[++i];
    } else if (arg === '--schema' && argv[i + 1]) {
      args.schema = argv[++i];
    }
  }

  return args;
}

// ───────────────────────────────────────────────────────────────
// Result Accumulator
// ───────────────────────────────────────────────────────────────

class ValidationResult {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.fixes = [];
    this.validatedConfig = null;
    this.fixesApplied = false;
    this.fixesPath = null;
  }

  addError(field, message) {
    this.errors.push({ field, message });
  }

  addWarning(field, message) {
    this.warnings.push({ field, message });
  }

  addFix(field, message) {
    this.fixes.push({ field, message });
  }

  get isValid() {
    return this.errors.length === 0;
  }

  get hasWarnings() {
    return this.warnings.length > 0;
  }

  get hasFixes() {
    return this.fixes.length > 0;
  }
}

// ───────────────────────────────────────────────────────────────
// JSON Schema Validation
// ───────────────────────────────────────────────────────────────

function validateSchema(config, schemaPath, result) {
  const ajv = new Ajv({ allErrors: true, coerceTypes: false });
  addFormats(ajv);

  let schema;
  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  } catch (err) {
    result.addError('schema', `Failed to load schema: ${err.message}`);
    return false;
  }

  const validate = ajv.compile(schema);
  const valid = validate(config);

  if (!valid) {
    for (const error of validate.errors) {
      const field = error.instancePath || '(root)';
      const message = error.message || 'unknown error';
      result.addError(field, `Schema violation: ${message} (${error.keyword})`);
    }
  }

  return valid;
}

// ───────────────────────────────────────────────────────────────
// Runtime Range Enforcement
// ───────────────────────────────────────────────────────────────

function enforceRuntimeRanges(config, result, options) {
  const { fix } = options;
  const mutated = JSON.parse(JSON.stringify(config)); // deep clone

  // --- retry.maxAttempts: 1-10 ---
  if (mutated.resilience?.retry?.maxAttempts !== undefined) {
    const val = mutated.resilience.retry.maxAttempts;
    if (val < 1) {
      if (fix) {
        mutated.resilience.retry.maxAttempts = 1;
        result.addFix('retry.maxAttempts', `Clamped ${val} -> 1 (minimum)`);
      } else {
        result.addError('retry.maxAttempts', `Value ${val} is below minimum 1`);
      }
    } else if (val > 10) {
      if (fix) {
        mutated.resilience.retry.maxAttempts = 10;
        result.addFix('retry.maxAttempts', `Capped ${val} -> 10 (maximum)`);
      } else {
        result.addWarning('retry.maxAttempts', `Value ${val} exceeds recommended maximum 10; recommend capping`);
      }
    }
  }

  // --- retry.initialDelaySeconds: 1-60 ---
  if (mutated.resilience?.retry?.initialDelaySeconds !== undefined) {
    const val = mutated.resilience.retry.initialDelaySeconds;
    if (val < 1) {
      if (fix) {
        mutated.resilience.retry.initialDelaySeconds = 1;
        result.addFix('retry.initialDelaySeconds', `Clamped ${val} -> 1 (minimum)`);
      } else {
        result.addError('retry.initialDelaySeconds', `Value ${val} is below minimum 1`);
      }
    } else if (val > 60) {
      if (fix) {
        mutated.resilience.retry.initialDelaySeconds = 60;
        result.addFix('retry.initialDelaySeconds', `Capped ${val} -> 60 (maximum)`);
      } else {
        result.addWarning('retry.initialDelaySeconds', `Value ${val} exceeds recommended maximum 60`);
      }
    }
  }

  // --- retry.maxDelaySeconds: 30-600 ---
  if (mutated.resilience?.retry?.maxDelaySeconds !== undefined) {
    const val = mutated.resilience.retry.maxDelaySeconds;
    if (val < 30) {
      if (fix) {
        mutated.resilience.retry.maxDelaySeconds = 30;
        result.addFix('retry.maxDelaySeconds', `Clamped ${val} -> 30 (minimum)`);
      } else {
        result.addError('retry.maxDelaySeconds', `Value ${val} is below minimum 30`);
      }
    } else if (val > 600) {
      if (fix) {
        mutated.resilience.retry.maxDelaySeconds = 600;
        result.addFix('retry.maxDelaySeconds', `Capped ${val} -> 600 (maximum)`);
      } else {
        result.addWarning('retry.maxDelaySeconds', `Value ${val} exceeds recommended maximum 600`);
      }
    }
  }

  // --- circuitBreaker.failureThreshold: 1-20 ---
  if (mutated.resilience?.circuitBreaker?.failureThreshold !== undefined) {
    const val = mutated.resilience.circuitBreaker.failureThreshold;
    if (val < 1) {
      if (fix) {
        mutated.resilience.circuitBreaker.failureThreshold = 1;
        result.addFix('circuitBreaker.failureThreshold', `Clamped ${val} -> 1 (minimum)`);
      } else {
        result.addError('circuitBreaker.failureThreshold', `Value ${val} is below minimum 1`);
      }
    } else if (val > 20) {
      if (fix) {
        mutated.resilience.circuitBreaker.failureThreshold = 20;
        result.addFix('circuitBreaker.failureThreshold', `Capped ${val} -> 20 (maximum)`);
      } else {
        result.addWarning('circuitBreaker.failureThreshold', `Value ${val} exceeds recommended maximum 20`);
      }
    }
  }

  // --- review.quorum.minimumPassing: 1-(total agents count) ---
  if (mutated.review?.quorum?.minimumPassing !== undefined) {
    const totalAgents = (mutated.review.agents || []).filter(a => !a.backup).length;
    const val = mutated.review.quorum.minimumPassing;
    if (val < 1) {
      if (fix) {
        mutated.review.quorum.minimumPassing = 1;
        result.addFix('review.quorum.minimumPassing', `Clamped ${val} -> 1 (minimum)`);
      } else {
        result.addError('review.quorum.minimumPassing', `Value ${val} is below minimum 1`);
      }
    } else if (val > totalAgents) {
      if (fix) {
        mutated.review.quorum.minimumPassing = totalAgents;
        result.addFix('review.quorum.minimumPassing', `Capped ${val} -> ${totalAgents} (total primary agents)`);
      } else {
        result.addWarning('review.quorum.minimumPassing', `Value ${val} exceeds total primary agents (${totalAgents})`);
      }
    }
  }

  // --- review.quorum.weightedThreshold: 0.1-1.0 ---
  if (mutated.review?.quorum?.weightedThreshold !== undefined) {
    const val = mutated.review.quorum.weightedThreshold;
    if (val < 0.1) {
      if (fix) {
        mutated.review.quorum.weightedThreshold = 0.1;
        result.addFix('review.quorum.weightedThreshold', `Clamped ${val} -> 0.1 (minimum)`);
      } else {
        result.addError('review.quorum.weightedThreshold', `Value ${val} is below minimum 0.1`);
      }
    } else if (val > 1.0) {
      if (fix) {
        mutated.review.quorum.weightedThreshold = 1.0;
        result.addFix('review.quorum.weightedThreshold', `Capped ${val} -> 1.0 (maximum)`);
      } else {
        result.addWarning('review.quorum.weightedThreshold', `Value ${val} exceeds maximum 1.0`);
      }
    }
  }

  // --- missions array: must have at least 1 mission ---
  if (!mutated.missions || mutated.missions.length === 0) {
    result.addError('missions', 'Must have at least 1 mission');
  }

  result.validatedConfig = mutated;
  return mutated;
}

// ───────────────────────────────────────────────────────────────
// Circular Fallback Detection
// ───────────────────────────────────────────────────────────────

function detectCircularFallbacks(agents) {
  const visited = new Set();
  const inStack = new Set();

  function dfs(agentId) {
    if (inStack.has(agentId)) return `Circular fallback: ${agentId}`;
    if (visited.has(agentId)) return null;

    visited.add(agentId);
    inStack.add(agentId);

    const agent = agents.find(a => a.id === agentId);
    if (agent?.fallback) {
      const cycle = dfs(agent.fallback);
      if (cycle) return cycle;
    }

    inStack.delete(agentId);
    return null;
  }

  for (const agent of agents) {
    const cycle = dfs(agent.id);
    if (cycle) return cycle;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// WP File Existence Validation
// ───────────────────────────────────────────────────────────────

function validateWPFiles(config, resolvedConfigPath, result) {
  if (!config.missions) return;

  // Fix Critical Issue 2: Resolve paths correctly when project.root is "."
  const configDir = dirname(resolvedConfigPath);
  const actualProjectRoot = resolve(configDir, config.project?.root || '.');
  const specDir = resolve(actualProjectRoot, config.project?.specDirectory || 'kitty-specs');

  for (const mission of config.missions) {
    const missionDir = join(specDir, mission.slug);

    if (!mission.workPackages || mission.workPackages.length === 0) {
      result.addWarning(
        `missions[${mission.id}].workPackages`,
        `Mission "${mission.id}" has no work packages`
      );
      continue;
    }

    for (const wp of mission.workPackages) {
      const wpPath = join(missionDir, wp.file);
      if (!existsSync(wpPath)) {
        result.addError(
          `missions[${mission.id}].workPackages[${wp.id}].file`,
          `WP file does not exist: ${wpPath}`
        );
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────
// Agent Pool Validation
// ───────────────────────────────────────────────────────────────

function validateAgentPool(config, result) {
  if (!config.review?.agents) {
    result.addWarning('review.agents', 'No agent pool defined — review phase will be skipped');
    return;
  }

  const agentIds = new Set();

  for (let i = 0; i < config.review.agents.length; i++) {
    const agent = config.review.agents[i];
    const prefix = `review.agents[${i}]`;

    // Required: name (id), tags[], fallback
    if (!agent.id) {
      result.addError(`${prefix}.id`, `Agent at index ${i} is missing required field "id"`);
    } else {
      if (agentIds.has(agent.id)) {
        result.addError(`${prefix}.id`, `Duplicate agent ID: "${agent.id}"`);
      }
      agentIds.add(agent.id);
    }

    if (!agent.skill) {
      result.addError(`${prefix}.skill`, `Agent "${agent.id || i}" is missing required field "skill"`);
    }

    // tags should be an array (can be empty, but must exist)
    if (!Array.isArray(agent.tags)) {
      result.addWarning(`${prefix}.tags`, `Agent "${agent.id || i}" has no tags array; recommend adding domain tags`);
    }

    // fallback: primary agents should have a fallback defined
    if (!agent.backup && !agent.fallback) {
      result.addWarning(
        `${prefix}.fallback`,
        `Primary agent "${agent.id || i}" has no fallback defined`
      );
    }

    // Validate fallback references an existing agent
    if (agent.fallback) {
      const fallbackExists = config.review.agents.some(a => a.id === agent.fallback);
      if (!fallbackExists) {
        result.addWarning(
          `${prefix}.fallback`,
          `Agent "${agent.id}" references fallback "${agent.fallback}" which is not in the agent pool`
        );
      }
    }

    // Validate weight range
    if (agent.weight !== undefined && (agent.weight < 0 || agent.weight > 1)) {
      result.addError(
        `${prefix}.weight`,
        `Agent "${agent.id}" weight ${agent.weight} is outside valid range [0, 1]`
      );
    }
  }

  // Validate that backup agents also have fallbacks (chain integrity)
  const backupAgents = config.review.agents.filter(a => a.backup);
  for (const backup of backupAgents) {
    if (backup.fallback) {
      const target = config.review.agents.find(a => a.id === backup.fallback);
      if (target && target.backup) {
        result.addWarning(
          `review.agents[${backup.id}].fallback`,
          `Backup agent "${backup.id}" has a fallback "${backup.fallback}" that is also a backup — chain may not terminate`
        );
      }
    }
  }

  // Fix High Priority Issue 4: Detect circular fallbacks among ALL agents
  const circularError = detectCircularFallbacks(config.review.agents);
  if (circularError) {
    result.addError('review.agents.fallback', circularError);
  }
}

// ───────────────────────────────────────────────────────────────
// Cross-Reference Validation
// ───────────────────────────────────────────────────────────────

function validateCrossReferences(config, result) {
  // Verify mission WP dependencies are valid (reference existing WPs in same mission)
  if (!config.missions) return;

  for (const mission of config.missions) {
    if (!mission.workPackages) continue;

    const wpIds = new Set(mission.workPackages.map(wp => wp.id));

    for (const wp of mission.workPackages) {
      if (wp.dependencies) {
        for (const dep of wp.dependencies) {
          if (!wpIds.has(dep)) {
            result.addError(
              `missions[${mission.id}].workPackages[${wp.id}].dependencies`,
              `WP "${wp.id}" depends on "${dep}" which does not exist in mission "${mission.id}"`
            );
          }
        }
      }
    }
  }

  // Verify checkpoint directory is not outside project root
  if (config.resilience?.checkpoint?.directory && config.project?.root) {
    const root = resolve(config.project.root);
    const cpDir = resolve(root, config.resilience.checkpoint.directory);
    if (!cpDir.startsWith(root)) {
      result.addWarning(
        'resilience.checkpoint.directory',
        `Checkpoint directory "${config.resilience.checkpoint.directory}" is outside project root`
      );
    }
  }
}

// ───────────────────────────────────────────────────────────────
// Write Fixed Config to Disk
// ───────────────────────────────────────────────────────────────

function writeFixedConfig(mutated, configPath, result) {
  // Fix Critical Issue 1: Actually write the fixed config back to disk
  if (result.fixes.length > 0) {
    const tempPath = configPath + '.tmp';
    writeFileSync(tempPath, JSON.stringify(mutated, null, 2));
    renameSync(tempPath, configPath); // Atomic write
    result.fixesApplied = true;
    result.fixesPath = configPath;
  }
}

// ───────────────────────────────────────────────────────────────
// Output Formatting
// ───────────────────────────────────────────────────────────────

function printResults(result, options) {
  const { verbose } = options;

  if (result.fixesApplied) {
    console.log('\n\x1b[33m⚙  AUTO-FIXES APPLIED TO FILE:\x1b[0m');
    console.log(`  File: ${result.fixesPath}`);
    for (const fix of result.fixes) {
      console.log(`  ✓ ${fix.field}: ${fix.message}`);
    }
  } else if (result.hasFixes) {
    console.log('\n\x1b[33m⚙  AUTO-FIXES RECOMMENDED (use --fix to apply):\x1b[0m');
    for (const fix of result.fixes) {
      console.log(`  ~ ${fix.field}: ${fix.message}`);
    }
  }

  if (result.hasWarnings) {
    console.log('\n\x1b[33m⚠  WARNINGS:\x1b[0m');
    for (const warning of result.warnings) {
      console.log(`  ⚠ ${warning.field}: ${warning.message}`);
    }
  }

  if (result.errors.length > 0) {
    console.log('\n\x1b[31m✗  ERRORS:\x1b[0m');
    for (const error of result.errors) {
      console.log(`  ✗ ${error.field}: ${error.message}`);
    }
  }

  if (result.isValid && !result.hasWarnings && !result.hasFixes) {
    console.log('\n\x1b[32m✓  Config validation passed — no issues found.\x1b[0m');
  } else if (result.isValid) {
    console.log(`\n\x1b[32m✓  Config is valid\x1b[0m (${result.warnings.length} warnings, ${result.fixes.length} auto-fixes applied)`);
  }

  if (verbose) {
    console.log('\n--- Validation Summary ---');
    console.log(`  Errors:  ${result.errors.length}`);
    console.log(`  Warnings: ${result.warnings.length}`);
    console.log(`  Fixes:   ${result.fixes.length}`);
  }
}

// ───────────────────────────────────────────────────────────────
// Main Entry Point
// ───────────────────────────────────────────────────────────────

export async function validateConfig(configPath, options = {}) {
  const result = new ValidationResult();
  const {
    schemaPath,
    strict = false,
    fix = false,
    verbose = false,
    projectRoot = '.'
  } = options;

  // Load config
  const resolvedConfigPath = resolve(configPath);
  if (!existsSync(resolvedConfigPath)) {
    result.addError('config', `Config file not found: ${resolvedConfigPath}`);
    printResults(result, { verbose });
    return { success: false, result, exitCode: 2 }; // Fatal: file not found
  }

  let config;
  try {
    config = JSON.parse(readFileSync(resolvedConfigPath, 'utf8'));
  } catch (err) {
    result.addError('config', `Failed to parse config JSON: ${err.message}`);
    printResults(result, { verbose });
    return { success: false, result, exitCode: 2 }; // Fatal: corrupt JSON
  }

  // Resolve schema path
  const resolvedSchemaPath = schemaPath
    ? resolve(schemaPath)
    : resolve(dirname(resolvedConfigPath), 'workflow-config.schema.json');

  // Phase 1: JSON Schema validation
  if (verbose) console.log('Phase 1: JSON Schema validation...');
  validateSchema(config, resolvedSchemaPath, result);

  // Phase 2: Runtime range enforcement (with optional auto-fix)
  // Note: Always run remaining phases even if schema has errors, so user gets full picture
  if (verbose) console.log('Phase 2: Runtime range enforcement...');
  const mutated = enforceRuntimeRanges(config, result, { fix, strict });

  // Fix Critical Issue 1: Write the fixed config back to disk when --fix is used
  if (fix && result.fixes.length > 0) {
    writeFixedConfig(mutated, resolvedConfigPath, result);
  }

  // Fix High Priority Issue 5: Re-validate schema after --fix clamps values
  if (fix && result.fixes.length > 0 && result.isValid) {
    if (verbose) console.log('Phase 2b: Re-validating schema after fixes...');
    const postFixResult = new ValidationResult();
    validateSchema(mutated, resolvedSchemaPath, postFixResult);
    // If the fixed config still violates schema, move those errors back to the main result
    for (const error of postFixResult.errors) {
      if (!result.errors.some(e => e.field === error.field && e.message === error.message)) {
        result.addError(error.field, `Post-fix schema violation: ${error.message}`);
      }
    }
  }

  // Phase 3: WP file existence validation
  if (verbose) console.log('Phase 3: WP file existence checks...');
  // Fix Critical Issue 2: Pass resolved config path so WP validation resolves paths correctly
  validateWPFiles(result.validatedConfig || config, resolvedConfigPath, result);

  // Phase 4: Agent pool validation
  if (verbose) console.log('Phase 4: Agent pool validation...');
  validateAgentPool(result.validatedConfig || config, result);

  // Phase 5: Cross-reference validation
  if (verbose) console.log('Phase 5: Cross-reference validation...');
  validateCrossReferences(result.validatedConfig || config, result);

  // Determine success and exit code
  // Fix Critical Issue 3: Distinguish between fatal errors (exit 2) and validation failures (exit 1)
  const success = result.isValid && (!strict || !result.hasWarnings);
  let exitCode = 0;
  if (!success) {
    exitCode = result.errors.some(e =>
      e.field === 'config' || e.field === 'schema'
    ) ? 2 : 1;
  }

  printResults(result, { verbose });

  return {
    success,
    result,
    config: result.validatedConfig || config,
    exitCode
  };
}

// ───────────────────────────────────────────────────────────────
// CLI Execution
// ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // Determine config path
  const configPath = args.config
    ? resolve(args.config)
    : resolve(__dirname, '..', 'workflow-config.json');

  // Determine schema path
  const schemaPath = args.schema
    ? resolve(args.schema)
    : resolve(__dirname, '..', 'workflow-config.schema.json');

  // Determine project root (parent of .archon directory)
  const projectRoot = resolve(__dirname, '..');

  console.log('\n\x1b[1m=== Archon Config Validator ===\x1b[0m');
  console.log(`  Config:  ${configPath}`);
  console.log(`  Schema:  ${schemaPath}`);
  console.log(`  Mode:    ${args.strict ? 'strict' : 'normal'}${args.fix ? ' + auto-fix' : ''}`);

  // Fix Critical Issue 3: Handle fatal errors with exit code 2
  let validationResult;
  try {
    // Validate schema file exists before calling validateConfig
    if (!existsSync(schemaPath)) {
      console.error(`\n\x1b[31mFATAL: Schema file not found: ${schemaPath}\x1b[0m`);
      process.exit(2);
    }

    validationResult = await validateConfig(configPath, {
      schemaPath,
      strict: args.strict,
      fix: args.fix,
      verbose: args.verbose,
      projectRoot
    });
  } catch (err) {
    console.error(`\n\x1b[31mFATAL: ${err.message}\x1b[0m`);
    process.exit(2);
  }

  process.exit(validationResult.exitCode);
}

// Run if executed directly
const isMainModule = process.argv[1] && process.argv[1].includes('config-validator');
if (isMainModule) {
  main().catch(err => {
    console.error(`\n\x1b[31mFATAL: ${err.message}\x1b[0m`);
    process.exit(2);
  });
}

export default validateConfig;
