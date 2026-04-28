#!/usr/bin/env node
/**
 * Parse health telemetry logs and emit a human-readable summary.
 *
 * Usage:
 *   node scripts/parse-health-logs.js < /path/to/logfile
 *   node scripts/parse-health-logs.js /path/to/logfile
 *   tail -n 1000 /path/to/logfile | node scripts/parse-health-logs.js
 *
 * Recognized event prefixes:
 *   [AIFailure]        — AI failure events and summaries
 *   [CircuitBreaker]   — circuit breaker open/close/blocked
 *   [QueueHealth]      — queue backlog blocked/resumed
 *   [StateDivergence]  — local/backend state drift
 *   [TelegramCallback] — callback timeout tracking
 *   [PipelineLatency]  — per-stage latency histograms
 */

import { createReadStream } from 'fs';
import readline from 'readline';

const PREFIXES = [
    'AIFailure',
    'CircuitBreaker',
    'QueueHealth',
    'StateDivergence',
    'TelegramCallback',
    'PipelineLatency',
];

const RE_PREFIX = new RegExp(`\\[(${PREFIXES.join('|')})\\]\\s*(\\{.*\\})`);

function parseLine(line) {
    const m = line.match(RE_PREFIX);
    if (!m) return null;
    try {
        return { source: m[1], data: JSON.parse(m[2]) };
    } catch {
        return null;
    }
}

const counters = {
    aiFailures: {},          // model -> { kind -> count }
    aiFailureSummaries: [],  // last summary per model
    circuitBreaker: { open: 0, close: 0, blocked: 0, byModel: {} },
    queue: { blocked: 0, resumed: 0, lastBlocked: null, lastResumed: null },
    stateDivergence: [],
    telegramTimeouts: [],
    latency: {},             // stage -> { count, totalMs, buckets: {} }
};

function inc(obj, key, subKey) {
    if (!obj[key]) obj[key] = {};
    obj[key][subKey] = (obj[key][subKey] || 0) + 1;
}

function processEvent({ source, data }) {
    switch (source) {
        case 'AIFailure': {
            if (data.eventType === 'ai.failure.summary') {
                counters.aiFailureSummaries.push({ model: data.model, counts: data.counts, at: Date.now() });
            } else if (data.model && data.kind) {
                inc(counters.aiFailures, data.model, data.kind);
            }
            break;
        }
        case 'CircuitBreaker': {
            const et = data.eventType;
            const model = data.model || 'unknown';
            if (et === 'ai.circuit_breaker.open') {
                counters.circuitBreaker.open++;
                if (!counters.circuitBreaker.byModel[model]) counters.circuitBreaker.byModel[model] = { open: 0, close: 0, blocked: 0 };
                counters.circuitBreaker.byModel[model].open++;
            } else if (et === 'ai.circuit_breaker.close') {
                counters.circuitBreaker.close++;
                if (!counters.circuitBreaker.byModel[model]) counters.circuitBreaker.byModel[model] = { open: 0, close: 0, blocked: 0 };
                counters.circuitBreaker.byModel[model].close++;
            } else if (et === 'ai.circuit_breaker.blocked') {
                counters.circuitBreaker.blocked++;
                if (!counters.circuitBreaker.byModel[model]) counters.circuitBreaker.byModel[model] = { open: 0, close: 0, blocked: 0 };
                counters.circuitBreaker.byModel[model].blocked++;
            }
            break;
        }
        case 'QueueHealth': {
            if (data.eventType === 'queue.backlog.blocked') {
                counters.queue.blocked++;
                counters.queue.lastBlocked = data;
            } else if (data.eventType === 'queue.backlog.resumed') {
                counters.queue.resumed++;
                counters.queue.lastResumed = data;
            }
            break;
        }
        case 'StateDivergence': {
            counters.stateDivergence.push(data);
            break;
        }
        case 'TelegramCallback': {
            if (data.eventType === 'telegram.callback.timeout') {
                counters.telegramTimeouts.push(data);
            }
            break;
        }
        case 'PipelineLatency': {
            const stage = data.stage;
            if (!counters.latency[stage]) counters.latency[stage] = { count: 0, totalMs: 0, buckets: {} };
            counters.latency[stage].count++;
            counters.latency[stage].totalMs += data.durationMs;
            counters.latency[stage].buckets[data.bucket] = (counters.latency[stage].buckets[data.bucket] || 0) + 1;
            break;
        }
    }
}

function fmtMs(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function printReport() {
    console.log('\n=== AI Health ===');
    const aiModels = Object.keys(counters.aiFailures);
    if (aiModels.length === 0) {
        console.log('No AI failures recorded in this window.');
    } else {
        for (const model of aiModels) {
            const kinds = counters.aiFailures[model];
            const total = Object.values(kinds).reduce((a, b) => a + b, 0);
            const summary = Object.entries(kinds).map(([k, v]) => `${k}:${v}`).join(', ');
            console.log(`  ${model}: ${total} failures (${summary})`);
        }
    }

    const cbModels = Object.keys(counters.circuitBreaker.byModel);
    if (cbModels.length > 0 || counters.circuitBreaker.blocked > 0) {
        console.log('\n=== Circuit Breaker ===');
        console.log(`  Open: ${counters.circuitBreaker.open} | Close: ${counters.circuitBreaker.close} | Blocked: ${counters.circuitBreaker.blocked}`);
        for (const model of cbModels) {
            const m = counters.circuitBreaker.byModel[model];
            console.log(`    ${model}: open=${m.open} close=${m.close} blocked=${m.blocked}`);
        }
    }

    console.log('\n=== Queue Health ===');
    if (counters.queue.blocked === 0 && counters.queue.resumed === 0) {
        console.log('No queue block/resume events recorded.');
    } else {
        console.log(`  Blocked: ${counters.queue.blocked} | Resumed: ${counters.queue.resumed}`);
        if (counters.queue.lastBlocked) {
            console.log(`  Last blocked: ${counters.queue.lastBlocked.pendingCount} pending (max ${counters.queue.lastBlocked.maxPending})`);
        }
        if (counters.queue.lastResumed) {
            console.log(`  Last resumed: ${counters.queue.lastResumed.pendingCount} pending`);
        }
    }

    if (counters.stateDivergence.length > 0) {
        console.log('\n=== State Divergence ===');
        for (const d of counters.stateDivergence.slice(-3)) {
            console.log(`  local=${d.localPending} backend=${d.backendActive} ratio=${d.ratio?.toFixed?.(2) || d.ratio}`);
        }
        if (counters.stateDivergence.length > 3) {
            console.log(`  ... and ${counters.stateDivergence.length - 3} more`);
        }
    }

    if (counters.telegramTimeouts.length > 0) {
        console.log('\n=== Telegram Callback Timeouts ===');
        const avg = counters.telegramTimeouts.reduce((a, t) => a + (t.elapsedMs || 0), 0) / counters.telegramTimeouts.length;
        console.log(`  Total: ${counters.telegramTimeouts.length} | Avg elapsed: ${fmtMs(avg)}`);
        for (const t of counters.telegramTimeouts.slice(-3)) {
            console.log(`    ${t.callbackId?.slice?.(0, 16) || 'unknown'}... elapsed=${fmtMs(t.elapsedMs || 0)}`);
        }
    }

    const stages = Object.keys(counters.latency);
    if (stages.length > 0) {
        console.log('\n=== Pipeline Latency ===');
        for (const stage of stages) {
            const l = counters.latency[stage];
            const avg = l.totalMs / l.count;
            const bucketStr = Object.entries(l.buckets).map(([b, c]) => `${b}:${c}`).join(', ');
            console.log(`  ${stage}: ${l.count} calls | avg ${fmtMs(avg)} | ${bucketStr}`);
        }
    }

    console.log('\n=== End of Report ===\n');
}

async function main() {
    const inputPath = process.argv[2];
    const inputStream = inputPath ? createReadStream(inputPath) : process.stdin;

    if (!inputPath && process.stdin.isTTY) {
        console.error('Usage: node scripts/parse-health-logs.js [logfile]');
        console.error('       tail -n 1000 app.log | node scripts/parse-health-logs.js');
        process.exit(1);
    }

    const rl = readline.createInterface({ input: inputStream });
    for await (const line of rl) {
        const ev = parseLine(line);
        if (ev) processEvent(ev);
    }
    printReport();
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
