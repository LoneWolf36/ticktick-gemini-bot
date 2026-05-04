#!/usr/bin/env node
/**
 * Live task analysis script — pulls real TickTick tasks and runs prioritization
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load modules
const { createTickTickClient } = await import(join(__dirname, '../services/ticktick.js'));
const { normalizePriorityCandidate, rankPriorityCandidates, createGoalThemeProfile } = await import(join(__dirname, '../services/execution-prioritization.js'));
const { USER_CONTEXT } = await import(join(__dirname, '../services/user_context.js'));

// Load env
const envPath = join(__dirname, '../.env');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length > 0 && !key.startsWith('#')) {
        process.env[key.trim()] = rest.join('=').trim();
    }
}

async function main() {
    console.log('=== Pulling live tasks from TickTick ===\n');
    
    const client = createTickTickClient({
        clientId: process.env.TICKTICK_CLIENT_ID,
        clientSecret: process.env.TICKTICK_CLIENT_SECRET,
        redirectUri: process.env.TICKTICK_REDIRECT_URI,
        accessToken: process.env.TICKTICK_ACCESS_TOKEN,
        refreshToken: process.env.TICKTICK_REFRESH_TOKEN,
    });

    // Fetch projects first
    const projects = await client.getProjects();
    console.log(`Found ${projects.length} projects:`);
    for (const p of projects) {
        console.log(`  ${p.name} (${p.id})`);
    }
    console.log();

    // Fetch active tasks
    const tasks = await client.getActiveTasks();
    console.log(`Found ${tasks.length} active tasks\n`);

    // Build candidates
    const candidates = tasks.map((task) => {
        const project = projects.find((p) => p.id === task.projectId);
        return normalizePriorityCandidate({
            ...task,
            projectName: project?.name || null,
        });
    });

    // Show subscription-related tasks
    console.log('=== Subscription-related tasks ===');
    const subscriptionTasks = candidates.filter((c) => 
        /subscription|cancel|chatgpt|linkedin|perplexity/i.test(c.title)
    );
    for (const t of subscriptionTasks) {
        const project = projects.find((p) => p.id === t.projectId);
        console.log(`  [P${t.priority}] "${t.title}"`);
        console.log(`    Project: ${project?.name || 'none'} (${t.projectId})`);
        console.log(`    Due: ${t.dueDate || 'none'} | Age: ${t.taskAgeDays} days`);
        console.log();
    }

    // Run ranking
    const goalProfile = createGoalThemeProfile(USER_CONTEXT, { source: 'user_context' });
    console.log('=== Extracted goal themes ===');
    for (const theme of goalProfile.themes) {
        console.log(`  ${theme.priorityOrder}. ${theme.label}`);
        console.log(`     tokens: ${theme.label.toLowerCase().split(/\s+/).filter((t) => t.length > 2).join(', ')}`);
    }
    console.log();

    const nowIso = new Date().toISOString();
    const result = rankPriorityCandidates(candidates, {
        goalThemeProfile: goalProfile,
        nowIso,
    });

    // Show top 10
    console.log('=== Top 10 ranked tasks ===');
    for (let i = 0; i < Math.min(10, result.ranked.length); i++) {
        const d = result.ranked[i];
        const task = candidates.find((c) => c.taskId === d.taskId);
        console.log(`${i + 1}. [Score: ${d.scoreBand}] ${task.title}`);
        console.log(`   Rationale: ${d.rationaleCode} | Confidence: ${d.inferenceConfidence} | Fallback: ${d.fallbackUsed}`);
        console.log(`   Due: ${task.dueDate || 'none'} | Priority: ${task.priority} | Project: ${task.projectName || 'none'}`);
        console.log();
    }

    // Show why subscriptions rank high
    console.log('=== Detailed analysis: subscription tasks ===');
    for (const task of subscriptionTasks) {
        const assessment = result.ranked.find((r) => r.taskId === task.taskId);
        if (assessment) {
            console.log(`"${task.title}"`);
            console.log(`  Score: ${assessment.score} | Band: ${assessment.scoreBand}`);
            console.log(`  Rationale: ${assessment.rationaleCode}`);
            console.log(`  Project: ${task.projectName} (determines priority cap)`);
            console.log();
        }
    }

    // Save full telemetry for inspection
    const telemetryPath = join(__dirname, '../live-ranking-telemetry.json');
    // We can't easily get the telemetry payload without mocking, but we can show the ranked results
    console.log('=== Full ranked list (first 20) ===');
    for (let i = 0; i < Math.min(20, result.ranked.length); i++) {
        const d = result.ranked[i];
        const task = candidates.find((c) => c.taskId === d.taskId);
        console.log(`${i + 1}. [${d.score}] ${task.title} (${d.rationaleCode})`);
    }
}

main().catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
});
