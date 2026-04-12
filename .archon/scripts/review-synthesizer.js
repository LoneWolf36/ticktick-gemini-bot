#!/usr/bin/env node
/**
 * Review Synthesizer for Spec-Kitty Universal Workflow
 *
 * Implements weighted voting and quorum logic for multi-agent reviews.
 * Aggregates review results, determines pass/fail/fix status,
 * enforces mandatory agent requirements, and produces synthesis reports.
 *
 * Usage:
 *   node review-synthesizer.js <command> [options]
 *
 * Commands:
 *   synthesize  — Aggregate review results and determine quorum
 *   report      — Generate a human-readable review report
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

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
// Config Loading
// ───────────────────────────────────────────────────────────────

function loadConfig(configPath) {
  const resolved = resolve(configPath);
  if (!existsSync(resolved)) {
    console.error(`ERROR: Config file not found: ${resolved}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

// ───────────────────────────────────────────────────────────────
// Review Result Aggregation
// ───────────────────────────────────────────────────────────────

function loadReviewResults(checkpointDir, mission, wp) {
  const prefix = `review-${mission}-${wp}-`;
  const files = readdirSync(checkpointDir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'));

  const results = [];
  for (const file of files) {
    try {
      const result = JSON.parse(readFileSync(join(checkpointDir, file), 'utf8'));
      results.push(result);
    } catch {
      console.warn(`WARNING: Could not parse review file: ${file}`);
    }
  }

  return results;
}

// ───────────────────────────────────────────────────────────────
// Quorum Voting Logic
// ───────────────────────────────────────────────────────────────

function evaluateQuorum(results, config) {
  const quorumConfig = config.review.quorum;
  const agentConfigs = config.review.agents;

  // Build a map of agent ID -> config
  const agentMap = {};
  for (const agent of agentConfigs) {
    agentMap[agent.id] = agent;
  }

  // Separate results by verdict
  const passed = results.filter(r => r.verdict === 'pass' || r.status === 'pass');
  const failed = results.filter(r => r.verdict === 'fail' || r.status === 'failed');
  const needsFix = results.filter(r => r.verdict === 'fix' || r.status === 'fix');
  const errored = results.filter(r => r.verdict === 'error' || r.status === 'error');

  // Calculate weighted scores
  let totalWeight = 0;
  let passingWeight = 0;
  let mandatoryPassed = true;
  let mandatoryFailed = [];

  for (const result of results) {
    const agentConfig = agentMap[result.agentId] || { weight: 0.1, mandatory: false };
    const weight = agentConfig.weight || 0.1;
    totalWeight += weight;

    if (result.verdict === 'pass' || result.status === 'pass') {
      passingWeight += weight;
    }

    // Check mandatory agents
    if (agentConfig.mandatory) {
      if (result.verdict !== 'pass' && result.status !== 'pass') {
        mandatoryPassed = false;
        mandatoryFailed.push({
          agentId: result.agentId,
          skill: result.skill || agentConfig.skill,
          reason: result.summary || result.error || 'No summary provided'
        });
      }
    }
  }

  // Determine quorum result
  const weightRatio = totalWeight > 0 ? passingWeight / totalWeight : 0;

  let quorumResult;

  if (quorumConfig.useWeighted) {
    // Weighted threshold mode
    quorumResult = weightRatio >= quorumConfig.weightedThreshold;
  } else {
    // Simple count mode
    quorumResult = passed.length >= quorumConfig.minimumPassing;
  }

  // Mandatory agents must pass (if configured)
  if (quorumConfig.mandatoryMustPass && !mandatoryPassed) {
    quorumResult = false;
  }

  // Determine overall status
  let status;
  if (quorumResult) {
    status = 'pass';
  } else if (needsFix.length > 0 && errored.length === 0) {
    // Not enough passes, but some agents think fixes are viable
    status = 'fix';
  } else if (mandatoryFailed.length > 0 && quorumConfig.mandatoryMustPass) {
    status = 'fail';
  } else {
    status = 'fail';
  }

  // Collect all findings
  const allFindings = [];
  for (const result of [...needsFix, ...failed]) {
    if (result.findings && Array.isArray(result.findings)) {
      allFindings.push(...result.findings.map(f => ({
        ...f,
        sourceAgent: result.agentId,
        sourceSkill: result.skill
      })));
    }
  }

  // Sort findings by severity
  const severityOrder = { critical: 0, major: 1, minor: 2, info: 3 };
  allFindings.sort((a, b) => (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4));

  // Deduplicate similar findings
  const deduplicatedFindings = deduplicateFindings(allFindings);

  return {
    status,
    mission: results[0]?.mission || 'unknown',
    wp: results[0]?.wp || 'unknown',
    timestamp: new Date().toISOString(),
    totalAgents: results.length,
    passed: passed.length,
    failed: failed.length,
    needsFix: needsFix.length,
    errored: errored.length,
    quorum: {
      method: quorumConfig.useWeighted ? 'weighted' : 'count',
      threshold: quorumConfig.useWeighted ? quorumConfig.weightedThreshold : quorumConfig.minimumPassing,
      achieved: quorumResult,
      weightRatio: totalWeight > 0 ? parseFloat(weightRatio.toFixed(3)) : 0,
      mandatoryMustPass: quorumConfig.mandatoryMustPass,
      mandatoryPassed
    },
    mandatoryFailed,
    findings: deduplicatedFindings,
    criticalCount: deduplicatedFindings.filter(f => f.severity === 'critical').length,
    majorCount: deduplicatedFindings.filter(f => f.severity === 'major').length,
    minorCount: deduplicatedFindings.filter(f => f.severity === 'minor').length,
    infoCount: deduplicatedFindings.filter(f => f.severity === 'info').length,
    reviewDetails: results.map(r => ({
      agentId: r.agentId,
      skill: r.skill,
      verdict: r.verdict,
      confidence: r.confidence,
      findingCount: r.findings?.length || 0,
      summary: r.summary || r.error || ''
    }))
  };
}

// ───────────────────────────────────────────────────────────────
// Finding Deduplication
// ───────────────────────────────────────────────────────────────

function deduplicateFindings(findings) {
  // Group by similarity (same file + similar description)
  const groups = {};

  for (const finding of findings) {
    const key = `${finding.file || 'unknown'}::${normalizeDescription(finding.description)}`;
    if (!groups[key]) {
      groups[key] = {
        ...finding,
        sourceAgents: [finding.sourceAgent],
        sourceSkills: [finding.sourceSkill],
        agreementCount: 1
      };
    } else {
      groups[key].sourceAgents.push(finding.sourceAgent);
      groups[key].sourceSkills.push(finding.sourceSkill);
      groups[key].agreementCount++;
      // Keep highest severity
      const severityOrder = { critical: 0, major: 1, minor: 2, info: 3 };
      if ((severityOrder[finding.severity] || 4) < (severityOrder[groups[key].severity] || 4)) {
        groups[key].severity = finding.severity;
      }
    }
  }

  return Object.values(groups);
}

function normalizeDescription(desc) {
  if (!desc) return '';
  // Normalize to first 50 chars, lowercased, stripped of punctuation
  return desc.toLowerCase().replace(/[^\w\s]/g, '').substring(0, 50).trim();
}

// ───────────────────────────────────────────────────────────────
// Synthesis Command
// ───────────────────────────────────────────────────────────────

function synthesize(args) {
  const config = loadConfig(args.config);
  const checkpointDir = resolve(args.checkpointDir);
  const outputPath = resolve(args.output);

  // Load all review results
  const results = loadReviewResults(checkpointDir, args.mission, args.wp);

  if (results.length === 0) {
    console.error('No review results found. Ensure review agents have completed.');
    const emptyResult = {
      status: 'no_reviews',
      mission: args.mission,
      wp: args.wp,
      timestamp: new Date().toISOString(),
      totalAgents: 0,
      passed: 0,
      failed: 0,
      needsFix: 0,
      errored: 0,
      findings: [],
      reviewDetails: []
    };
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(emptyResult, null, 2));
    return emptyResult;
  }

  // Evaluate quorum
  const synthesis = evaluateQuorum(results, config);

  // Save synthesis
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(synthesis, null, 2));

  // Output summary
  console.log(`\n=== Review Synthesis: ${args.mission}/${args.wp} ===`);
  console.log(`Status: ${synthesis.status.toUpperCase()}`);
  console.log(`Agents: ${synthesis.totalAgents} total | ${synthesis.passed} pass | ${synthesis.failed} fail | ${synthesis.needsFix} fix | ${synthesis.errored} error`);
  console.log(`Quorum: ${synthesis.quorum.method} (${synthesis.quorum.achieved ? 'MET' : 'NOT MET'})`);

  if (synthesis.mandatoryFailed.length > 0) {
    console.log(`\nMandatory Agents Failed:`);
    for (const m of synthesis.mandatoryFailed) {
      console.log(`  - ${m.agentId} (${m.skill}): ${m.reason}`);
    }
  }

  if (synthesis.findings.length > 0) {
    console.log(`\nFindings: ${synthesis.criticalCount} critical, ${synthesis.majorCount} major, ${synthesis.minorCount} minor, ${synthesis.infoCount} info`);

    // Show top findings
    const topFindings = synthesis.findings.slice(0, 5);
    for (const finding of topFindings) {
      console.log(`  [${finding.severity.toUpperCase()}] ${finding.description}`);
      if (finding.agreementCount > 1) {
        console.log(`    Agreement: ${finding.agreementCount} agents (${finding.sourceAgents.join(', ')})`);
      }
    }
  }

  return synthesis;
}

// ───────────────────────────────────────────────────────────────
// Report Generation
// ───────────────────────────────────────────────────────────────

function generateReport(args) {
  const synthesisPath = resolve(args.synthesis);
  if (!existsSync(synthesisPath)) {
    console.error(`Synthesis file not found: ${synthesisPath}`);
    process.exit(1);
  }

  const synthesis = JSON.parse(readFileSync(synthesisPath, 'utf8'));

  const report = generateMarkdownReport(synthesis);

  const outputPath = resolve(args.output || synthesisPath.replace('.json', '-report.md'));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, report);

  console.log(`Report generated: ${outputPath}`);
  console.log('');
  console.log(report);
}

function generateMarkdownReport(synthesis) {
  const lines = [];

  lines.push(`# Review Report: ${synthesis.mission}/${synthesis.wp}`);
  lines.push('');
  lines.push(`**Date**: ${new Date(synthesis.timestamp).toLocaleString()}`);
  lines.push(`**Status**: ${synthesis.status.toUpperCase()}`);
  lines.push('');

  // Quorum summary
  lines.push('## Quorum Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Agents | ${synthesis.totalAgents} |`);
  lines.push(`| Passed | ${synthesis.passed} |`);
  lines.push(`| Failed | ${synthesis.failed} |`);
  lines.push(`| Needs Fix | ${synthesis.needsFix} |`);
  lines.push(`| Errored | ${synthesis.errored} |`);
  lines.push(`| Quorum Method | ${synthesis.quorum.method} |`);
  lines.push(`| Quorum Achieved | ${synthesis.quorum.achieved ? 'YES' : 'NO'} |`);
  lines.push(`| Weight Ratio | ${synthesis.quorum.weightRatio} |`);
  lines.push(`| Mandatory Passed | ${synthesis.quorum.mandatoryPassed ? 'YES' : 'NO'} |`);
  lines.push('');

  // Agent details
  lines.push('## Agent Results');
  lines.push('');
  lines.push(`| Agent | Skill | Verdict | Confidence | Findings |`);
  lines.push(`|-------|-------|---------|-------------|----------|`);
  for (const detail of synthesis.reviewDetails) {
    lines.push(`| ${detail.agentId} | ${detail.skill} | ${detail.verdict} | ${(detail.confidence * 100).toFixed(0)}% | ${detail.findingCount} |`);
  }
  lines.push('');

  // Mandatory failures
  if (synthesis.mandatoryFailed.length > 0) {
    lines.push('## Mandatory Agent Failures');
    lines.push('');
    for (const m of synthesis.mandatoryFailed) {
      lines.push(`### ${m.agentId} (${m.skill})`);
      lines.push('');
      lines.push(m.reason);
      lines.push('');
    }
  }

  // Findings
  if (synthesis.findings.length > 0) {
    lines.push(`## Findings (${synthesis.findings.length} total)`);
    lines.push('');
    lines.push(`- Critical: ${synthesis.criticalCount}`);
    lines.push(`- Major: ${synthesis.majorCount}`);
    lines.push(`- Minor: ${synthesis.minorCount}`);
    lines.push(`- Info: ${synthesis.infoCount}`);
    lines.push('');

    for (const finding of synthesis.findings) {
      lines.push(`### [${finding.severity.toUpperCase()}] ${finding.description}`);
      lines.push('');
      if (finding.file) {
        lines.push(`**File**: ${finding.file}`);
      }
      if (finding.agreementCount > 1) {
        lines.push(`**Agreement**: ${finding.agreementCount} agents (${finding.sourceAgents.join(', ')})`);
      }
      if (finding.suggestion) {
        lines.push(`**Suggestion**: ${finding.suggestion}`);
      }
      lines.push('');
    }
  }

  // Recommendation
  lines.push('## Recommendation');
  lines.push('');
  switch (synthesis.status) {
    case 'pass':
      lines.push('All quorum requirements met. WP can proceed to completion.');
      break;
    case 'fix':
      lines.push('Review identified fixable issues. Apply fixes and re-review.');
      lines.push('');
      lines.push('Priority fix items:');
      const criticalFindings = synthesis.findings.filter(f => f.severity === 'critical');
      const majorFindings = synthesis.findings.filter(f => f.severity === 'major');
      for (const f of [...criticalFindings, ...majorFindings]) {
        lines.push(`- [${f.severity}] ${f.description}`);
      }
      break;
    case 'fail':
      lines.push('Review failed quorum. Manual intervention required.');
      if (synthesis.mandatoryFailed.length > 0) {
        lines.push('');
        lines.push('Mandatory agents that must be satisfied:');
        for (const m of synthesis.mandatoryFailed) {
          lines.push(`- ${m.agentId}: ${m.reason}`);
        }
      }
      break;
    default:
      lines.push('Unknown status. Check review results manually.');
  }
  lines.push('');

  return lines.join('\n');
}

// ───────────────────────────────────────────────────────────────
// Main Entry Point
// ───────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  if (!args.command) {
    console.log('Usage: node review-synthesizer.js <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  synthesize  — Aggregate review results and determine quorum');
    console.log('  report      — Generate a human-readable review report');
    process.exit(0);
  }

  switch (args.command) {
    case 'synthesize':
      synthesize(args);
      break;

    case 'report':
      generateReport(args);
      break;

    default:
      console.error(`Unknown command: ${args.command}`);
      process.exit(1);
  }
}

main();
