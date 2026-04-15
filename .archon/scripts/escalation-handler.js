#!/usr/bin/env node
/**
 * Escalation Handler for Spec-Kitty Universal Workflow
 *
 * Manages circuit breaker tripping, human notification, and auto-resume
 * with reduced quorum after timeout.
 *
 * Usage:
 *   node escalation-handler.js <command> [options]
 *
 * Commands:
 *   escalate     — Trigger escalation for a failed WP
 *   notify       — Send notification through configured channel
 *   auto-resume  — Resume with reduced quorum after circuit breaker timeout
 *   status       — Check current escalation status
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { execFileSync } from 'child_process';
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

function loadCheckpointState(checkpointDir) {
  const statePath = join(checkpointDir, 'current-state.json');
  if (!existsSync(statePath)) {
    console.error('No checkpoint state found.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(statePath, 'utf8'));
}

function saveCheckpointState(state, checkpointDir) {
  state.lastUpdatedAt = new Date().toISOString();
  const statePath = join(checkpointDir, 'current-state.json');
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// ───────────────────────────────────────────────────────────────
// Escalation Logic
// ───────────────────────────────────────────────────────────────

function escalate(args) {
  const config = loadConfig(args.config);
  const checkpointDir = resolve(config.resilience.checkpoint.directory);
  const state = loadCheckpointState(checkpointDir);

  const mission = args.mission;
  const wp = args.wp;
  const reason = args.reason || 'Unknown reason';

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ESCALATION TRIGGERED`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`  Mission:     ${mission}`);
  console.log(`  Work Package: ${wp}`);
  console.log(`  Reason:      ${reason}`);
  console.log(`  Timestamp:   ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(70)}\n`);

  // Record escalation
  const wpKey = `${mission}/${wp}`;
  if (!state.escalatedWPs.includes(wpKey)) {
    state.escalatedWPs.push(wpKey);
  }
  state.status = 'escalated';

  // Save escalation record
  const escalationDir = join(checkpointDir, 'escalations');
  mkdirSync(escalationDir, { recursive: true });

  const escalationRecord = {
    mission,
    wp,
    reason,
    timestamp: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state)),
    circuitBreakerTripped: state.circuitBreakerTripped,
    autoResumeTimeout: config.resilience.circuitBreaker.escalationConfig.pauseTimeoutMinutes,
    autoResumeWithReducedQuorum: config.resilience.circuitBreaker.autoResumeWithReducedQuorum
  };

  const escalationFile = join(escalationDir, `${mission}-${wp}-${Date.now()}.json`);
  writeFileSync(escalationFile, JSON.stringify(escalationRecord, null, 2));
  console.log(`Escalation record saved: ${escalationFile}`);

  // Send notifications
  const escalationChannel = args.channel || config.resilience.circuitBreaker.escalationChannel;
  sendNotifications(config, mission, wp, reason, escalationChannel);

  // Git snapshot for context
  try {
    const stashMessage = `escalation:${mission}/${wp} - ${reason}`;
    const hasChanges = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
    if (hasChanges) {
      execFileSync('git', ['stash', 'push', '-u', '-m', stashMessage], { encoding: 'utf8' });
      console.log(`Git stash created for escalation context`);
    }
  } catch (err) {
    console.warn(`Could not create git stash: ${err.message}`);
  }

  // Update checkpoint state
  saveCheckpointState(state, checkpointDir);

  console.log(`\nEscalation complete. Workflow paused awaiting ${escalationChannel} intervention.`);

  return escalationRecord;
}

// ───────────────────────────────────────────────────────────────
// Notification System
// ───────────────────────────────────────────────────────────────

function sendNotifications(config, mission, wp, reason, channel) {
  const messageTemplate = config.resilience.circuitBreaker.escalationConfig.message ||
    'Circuit breaker tripped for {mission}/{wp}. {failedCount}/{totalCount} review agents failed after {retryCount} retries. Manual intervention required.';

  const message = messageTemplate
    .replace('{mission}', mission)
    .replace('{wp}', wp)
    .replace('{reason}', reason)
    .replace('{failedCount}', 'N/A')
    .replace('{totalCount}', 'N/A')
    .replace('{retryCount}', String(config.resilience.retry.maxAttempts));

  console.log(`\n--- Notification: ${channel.toUpperCase()} ---`);
  console.log(message);
  console.log('--- End Notification ---\n');

  // Also check notification channels from config
  const notificationConfig = config.notifications || {};
  if (notificationConfig.onCircuitBreakerTrip) {
    const channels = notificationConfig.channels || [];
    for (const ch of channels) {
      if (ch.events && ch.events.includes('circuit_breaker')) {
        sendChannelNotification(ch, message, { mission, wp, reason });
      }
    }
  }
}

function sendChannelNotification(channelConfig, message, context) {
  switch (channelConfig.type) {
    case 'webhook':
      sendWebhook(channelConfig, message, context);
      break;
    case 'slack':
      sendSlack(channelConfig, message, context);
      break;
    case 'email':
      sendEmail(channelConfig, message, context);
      break;
    case 'telegram':
      sendTelegram(channelConfig, message, context);
      break;
    default:
      console.log(`[NOTIFICATION:${channelConfig.type}] ${message}`);
  }
}

async function sendWebhook(channelConfig, message, context) {
  if (!channelConfig.url) {
    console.log('[WEBHOOK] No URL configured. Skipping.');
    return;
  }

  const payload = {
    text: message,
    context,
    timestamp: new Date().toISOString(),
    source: 'spec-kitty-workflow'
  };

  try {
    // Use curl for webhook delivery
    const curlCommand = `curl -s -X POST "${channelConfig.url}" \\
      -H "Content-Type: application/json" \\
      -d '${JSON.stringify(payload)}'`;

    console.log(`[WEBHOOK] Sending to: ${channelConfig.url}`);
    console.log(`[WEBHOOK] Command: ${curlCommand}`);

    // In production, uncomment the following:
    // const result = execSync(curlCommand, { encoding: 'utf8' });
    // console.log(`[WEBHOOK] Response: ${result}`);
  } catch (error) {
    console.error(`[WEBHOOK] Failed: ${error.message}`);
  }
}

async function sendSlack(channelConfig, message, context) {
  // Slack webhook integration
  const url = channelConfig.url || process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.log('[SLACK] No webhook URL configured. Skipping.');
    return;
  }

  const payload = {
    text: `:warning: *Spec-Kitty Workflow Escalation*`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Workflow Escalation' } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Mission*: ${context.mission}\n*WP*: ${context.wp}\n*Reason*: ${context.reason}\n*Time*: ${new Date().toISOString()}` } },
      { type: 'section', text: { type: 'mrkdwn', text: message } }
    ]
  };

  try {
    const curlCommand = `curl -s -X POST "${url}" \\
      -H "Content-Type: application/json" \\
      -d '${JSON.stringify(payload)}'`;
    console.log(`[SLACK] Sending to: ${url}`);
    console.log(`[SLACK] Command: ${curlCommand}`);
    // execSync(curlCommand, { encoding: 'utf8' });
  } catch (error) {
    console.error(`[SLACK] Failed: ${error.message}`);
  }
}

async function sendEmail(channelConfig, message, context) {
  console.log(`[EMAIL] Would send to: ${channelConfig.to || 'not configured'}`);
  console.log(`[EMAIL] Subject: Escalation: ${context.mission}/${context.wp}`);
  console.log(`[EMAIL] Body: ${message}`);
}

async function sendTelegram(channelConfig, message, context) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = channelConfig.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.log('[TELEGRAM] No bot token or chat ID configured. Skipping.');
    return;
  }

  const text = `🚨 *Workflow Escalation*\n\n` +
    `*Mission:* ${context.mission}\n` +
    `*WP:* ${context.wp}\n` +
    `*Reason:* ${context.reason}\n\n` +
    message;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown'
  };

  try {
    const curlCommand = `curl -s -X POST "${url}" \\
      -H "Content-Type: application/json" \\
      -d '${JSON.stringify(payload)}'`;
    console.log(`[TELEGRAM] Sending to chat: ${chatId}`);
    console.log(`[TELEGRAM] Command: ${curlCommand}`);
    // execSync(curlCommand, { encoding: 'utf8' });
  } catch (error) {
    console.error(`[TELEGRAM] Failed: ${error.message}`);
  }
}

// ───────────────────────────────────────────────────────────────
// Auto-Resume with Reduced Quorum
// ───────────────────────────────────────────────────────────────

function autoResume(args) {
  const config = loadConfig(args.config);
  const checkpointDir = resolve(config.resilience.checkpoint.directory);
  const state = loadCheckpointState(checkpointDir);

  if (!state.circuitBreakerTripped) {
    console.log('Circuit breaker is not tripped. No auto-resume needed.');
    return;
  }

  const pauseTimeoutMinutes = config.resilience.circuitBreaker.escalationConfig.pauseTimeoutMinutes || 60;

  // Check if enough time has passed since escalation
  const escalationFiles = readdirSync(join(checkpointDir, 'escalations'))
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const content = JSON.parse(readFileSync(join(checkpointDir, 'escalations', f), 'utf8'));
      return { file: f, timestamp: new Date(content.timestamp) };
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  if (escalationFiles.length === 0) {
    console.log('No escalation records found.');
    return;
  }

  const latestEscalation = escalationFiles[0];
  const elapsedMinutes = (Date.now() - latestEscalation.timestamp.getTime()) / (1000 * 60);

  console.log(`Auto-Resume Check:`);
  console.log(`  Escalation Time: ${latestEscalation.timestamp.toISOString()}`);
  console.log(`  Elapsed: ${elapsedMinutes.toFixed(1)} minutes`);
  console.log(`  Timeout: ${pauseTimeoutMinutes} minutes`);

  if (elapsedMinutes < pauseTimeoutMinutes) {
    console.log(`\nTimeout not yet reached. Wait ${Math.ceil(pauseTimeoutMinutes - elapsedMinutes)} more minutes.`);
    return;
  }

  console.log('\nTimeout reached. Attempting auto-resume with reduced quorum.');

  if (!config.resilience.circuitBreaker.autoResumeWithReducedQuorum) {
    console.log('Auto-resume with reduced quorum is DISABLED in config.');
    console.log('Manual intervention required.');
    return;
  }

  // Reduce quorum: minimumPassing - 1 (minimum 2)
  const originalMin = config.review.quorum.minimumPassing;
  const reducedMin = Math.max(2, originalMin - 1);

  console.log(`  Original quorum: ${originalMin}`);
  console.log(`  Reduced quorum: ${reducedMin}`);

  // Update config temporarily
  config.review.quorum.minimumPassing = reducedMin;

  // Save modified config
  const configPath = resolve(args.config);
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Reset circuit breaker
  state.circuitBreakerTripped = false;
  state.status = 'auto_resumed';
  saveCheckpointState(state, checkpointDir);

  console.log('\nCircuit breaker reset. Workflow will resume with reduced quorum.');
  console.log('WARNING: Reduced quorum means lower review confidence. Consider manual review later.');
}

// ───────────────────────────────────────────────────────────────
// Escalation Status
// ───────────────────────────────────────────────────────────────

function checkEscalationStatus(args) {
  const config = loadConfig(args.config);
  const checkpointDir = resolve(config.resilience.checkpoint.directory);
  const state = loadCheckpointState(checkpointDir);

  console.log(`\n=== Escalation Status ===`);
  console.log(`Workflow Status: ${state.status}`);
  console.log(`Circuit Breaker: ${state.circuitBreakerTripped ? 'TRIPPED' : 'closed'}`);
  console.log(`Escalated WPs: ${state.escalatedWPs.length}`);
  console.log(`Failed WPs: ${state.failedWPs.length}`);

  if (state.escalatedWPs.length > 0) {
    console.log('\nEscalated Work Packages:');
    for (const wpKey of state.escalatedWPs) {
      console.log(`  - ${wpKey}`);
    }
  }

  if (state.failedWPs.length > 0) {
    console.log('\nFailed Work Packages (not escalated):');
    for (const wpKey of state.failedWPs) {
      console.log(`  - ${wpKey}`);
    }
  }

  // Check escalation files
  const escalationDir = join(checkpointDir, 'escalations');
  if (existsSync(escalationDir)) {
    const files = readdirSync(escalationDir).filter(f => f.endsWith('.json'));
    if (files.length > 0) {
      console.log(`\nEscalation Records: ${files.length}`);
      for (const file of files.slice(-5)) {
        const content = JSON.parse(readFileSync(join(escalationDir, file), 'utf8'));
        console.log(`  - ${content.mission}/${content.wp} (${content.timestamp})`);
        console.log(`    Reason: ${content.reason}`);
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────
// Main Entry Point
// ───────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  if (!args.command) {
    console.log('Usage: node escalation-handler.js <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  escalate     — Trigger escalation for a failed WP');
    console.log('  notify       — Send notification through configured channel');
    console.log('  auto-resume  — Resume with reduced quorum after timeout');
    console.log('  status       — Check current escalation status');
    process.exit(0);
  }

  switch (args.command) {
    case 'escalate':
      escalate(args);
      break;

    case 'notify':
      // Reuse escalate's notification logic
      escalate({ ...args, reason: args.reason || 'Manual notification' });
      break;

    case 'auto-resume':
      autoResume(args);
      break;

    case 'status':
      checkEscalationStatus(args);
      break;

    default:
      console.error(`Unknown command: ${args.command}`);
      process.exit(1);
  }
}

main();
