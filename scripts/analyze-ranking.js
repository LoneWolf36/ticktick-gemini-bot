// Analysis script — run directly with: node --experimental-vm-modules scripts/analyze-ranking.js
// Uses direct axios calls to bypass client credential token issues.
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import {
    normalizePriorityCandidate,
    rankPriorityCandidates,
    createGoalThemeProfile,
} from '../services/execution-prioritization.js';
import { USER_CONTEXT, PROJECT_POLICY } from '../services/user_context.js';
import { resolveProjectCategory } from '../services/project-policy.js';

// ── Direct TickTick API call helper ───────────────────────────────
const API_BASE = 'https://api.ticktick.com/open/v1';

async function ttApi(method, path, token, data = null) {
    const config = { method, url: `${API_BASE}${path}`, headers: { Authorization: `Bearer ${token}` }, timeout: 15000 };
    if (data) { config.data = data; config.headers['Content-Type'] = 'application/json'; }
    const resp = await axios(config);
    return resp.data;
}

// ── Fetch data ─────────────────────────────────────────────────────
console.log('Fetching TickTick data...\n');

const TOKEN = process.env.TICKTICK_ACCESS_TOKEN;
if (!TOKEN) throw new Error('TICKTICK_ACCESS_TOKEN not set in .env');

let projects, activeTasks;

try {
    // Try filterTasks first
    activeTasks = await ttApi('POST', '/task/filter', TOKEN, { status: [0] });
    projects = await ttApi('GET', '/project', TOKEN);
} catch (err) {
    console.warn('filterTasks/project failed, falling back to per-project:', err.message);
    projects = await ttApi('GET', '/project', TOKEN);
    activeTasks = [];
    for (const p of projects) {
        try {
            const data = await ttApi('GET', `/project/${p.id}/data`, TOKEN);
            if (data.tasks) {
                for (const t of data.tasks) {
                    if (t.status === 0 || t.status === undefined) {
                        t.projectId = p.id;
                        t.projectName = p.name;
                        activeTasks.push(t);
                    }
                }
            }
        } catch (e) {
            console.warn(`  skip ${p.name}: ${e.message}`);
        }
    }
}

const projectMap = new Map(projects.map(p => [p.id, p.name]));
const tasksWithProject = activeTasks.map(t => ({
    ...t,
    projectName: projectMap.get(t.projectId) || null,
}));

console.log(`Fetched ${projects.length} projects, ${tasksWithProject.length} active tasks\n`);

// ── Build candidates ───────────────────────────────────────────────
const candidates = tasksWithProject.map(t => normalizePriorityCandidate(t));

// ── Run ranking ─────────────────────────────────────────────────────
const goalProfile = createGoalThemeProfile(USER_CONTEXT);
const result = rankPriorityCandidates(candidates, {
    goalThemeProfile: goalProfile,
    nowIso: new Date().toISOString(),
    workStyleMode: 'normal',
    urgentMode: false,
});

const { ranked } = result;

// ── Helper: project category ────────────────────────────────────────
function projectCategory(projectName) {
    if (!projectName) return 'uncategorized';
    const resolved = resolveProjectCategory(projectName);
    return resolved?.category || 'uncategorized';
}

// ── 1. All projects + categories ───────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log(' 1. ALL PROJECTS AND THEIR CATEGORIES');
console.log('═══════════════════════════════════════════════════════');
for (const p of projects) {
    const cat = projectCategory(p.name);
    console.log(`  [${cat.padEnd(12)}] ${p.name}`);
}
console.log();

// ── 2. Top 20 ranked tasks ─────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log(' 2. TOP 20 RANKED TASKS');
console.log('═══════════════════════════════════════════════════════');
for (let i = 0; i < Math.min(20, ranked.length); i++) {
    const d = ranked[i];
    const c = candidates.find(c => c.taskId === d.taskId);
    if (!c) continue;
    const urgency = d.urgency || (d.rationaleCode === 'urgency' ? 'high' : 'n/a');
    console.log(` #${(i + 1).toString().padStart(2)} │ score=${String(d.scoreBand).padEnd(6)} │ ${String(d.rationaleCode).padEnd(20)} │ ${c.title.slice(0, 60)}`);
    console.log(`     │ project=${c.projectName || 'unknown'} │ priority=${c.priority ?? 'none'} │ urgency=${urgency}`);
    console.log(`     │ rationale: ${d.rationaleText}`);
}
console.log();

// ── 3. Subscription tasks ──────────────────────────────────────────
const subscriptionRE = /subscription|cancel|chatgpt|linkedin|perplexity/i;

console.log('═══════════════════════════════════════════════════════');
console.log(' 3. TASKS MATCHING SUBSCRIPTION PATTERNS');
console.log('═══════════════════════════════════════════════════════');
const subCandidates = candidates.filter(c => subscriptionRE.test(c.title));
if (subCandidates.length === 0) {
    console.log('  (none found)\n');
} else {
    for (const c of subCandidates) {
        const d = ranked.find(d2 => d2.taskId === c.taskId);
        const matches = goalProfile.themes.filter(t => {
            const tokens = t.label.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            return tokens.some(tok => (c.title + ' ' + (c.projectName || '')).toLowerCase().includes(tok));
        });
        const urgency = d?.urgency || 'unknown';
        console.log(`  title: ${c.title}`);
        console.log(`  project: ${c.projectName || 'unknown'} (${projectCategory(c.projectName)})`);
        console.log(`  priority value: ${c.priority ?? 'none'}`);
        console.log(`  goal theme matches: ${matches.map(m => m.label).join(', ') || 'none'}`);
        console.log(`  urgency: ${urgency}`);
        console.log(`  rationale code: ${d?.rationaleCode || 'unknown'}`);
        console.log(`  score band: ${d?.scoreBand || 'unknown'}`);
        console.log();
    }
}
console.log();

// ── 4. Technical tasks ─────────────────────────────────────────────
const techRE = /system design|interview|coding|cloudera|msc|research paper|aegis/i;

console.log('═══════════════════════════════════════════════════════');
console.log(' 4. TASKS MATCHING TECHNICAL PATTERNS');
console.log('═══════════════════════════════════════════════════════');
const techCandidates = candidates.filter(c => techRE.test(c.title));
if (techCandidates.length === 0) {
    console.log('  (none found)\n');
} else {
    for (const c of techCandidates) {
        const d = ranked.find(d2 => d2.taskId === c.taskId);
        const matches = goalProfile.themes.filter(t => {
            const tokens = t.label.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            return tokens.some(tok => (c.title + ' ' + (c.projectName || '')).toLowerCase().includes(tok));
        });
        const urgency = d?.urgency || 'unknown';
        console.log(`  title: ${c.title}`);
        console.log(`  project: ${c.projectName || 'unknown'} (${projectCategory(c.projectName)})`);
        console.log(`  priority value: ${c.priority ?? 'none'}`);
        console.log(`  goal theme matches: ${matches.map(m => m.label).join(', ') || 'none'}`);
        console.log(`  urgency: ${urgency}`);
        console.log(`  rationale code: ${d?.rationaleCode || 'unknown'}`);
        console.log(`  score band: ${d?.scoreBand || 'unknown'}`);
        console.log();
    }
}
console.log();

// ── 5. Root cause analysis ──────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log(' 5. ROOT CAUSE: WHY SUBSCRIPTIONS OUTRANK TECHNICAL WORK');
console.log('═══════════════════════════════════════════════════════');

const subRankIndices = subCandidates.map(c => ranked.findIndex(d => d.taskId === c.taskId)).filter(i => i >= 0);
const techRankIndices = techCandidates.map(c => ranked.findIndex(d => d.taskId === c.taskId)).filter(i => i >= 0);

const avgSubRank = subRankIndices.length ? (subRankIndices.reduce((a, b) => a + b, 0) / subRankIndices.length) + 1 : -1;
const avgTechRank = techRankIndices.length ? (techRankIndices.reduce((a, b) => a + b, 0) / techRankIndices.length) + 1 : -1;

console.log(`  Subscription avg rank: ${avgSubRank >= 0 ? avgSubRank.toFixed(1) : 'none'}`);
console.log(`  Technical avg rank:    ${avgTechRank >= 0 ? avgTechRank.toFixed(1) : 'none'}`);
console.log();

console.log('  Scoring weights (from SCORING):');
console.log(`    coreGoal priority weight:   36`);
console.log(`    important priority weight:  22`);
console.log(`    lifeAdmin priority weight: 10`);
console.log(`    baseGoalAlignment:         34`);
console.log(`    orderBoosts (1st/2nd/3rd): 8, 4, 2`);
console.log(`    highUrgencyScore:          28`);
console.log(`    mediumUrgencyScore:       14`);
console.log();

const subP5 = subCandidates.filter(c => c.priority === 5).length;
const techP5 = techCandidates.filter(c => c.priority === 5).length;
const subP3 = subCandidates.filter(c => c.priority === 3).length;
const techP3 = techCandidates.filter(c => c.priority === 3).length;
const subP1 = subCandidates.filter(c => c.priority === 1).length;
const techP1 = techCandidates.filter(c => c.priority === 1).length;

console.log('  Priority distribution (TickTick native priority values):');
console.log(`    Subscriptions — P5: ${subP5}, P3: ${subP3}, P1: ${subP1}, none: ${subCandidates.length - subP5 - subP3 - subP1}`);
console.log(`    Technical    — P5: ${techP5}, P3: ${techP3}, P1: ${techP1}, none: ${techCandidates.length - techP5 - techP3 - techP1}`);
console.log();

console.log('  ROOT CAUSE ANALYSIS:');
console.log('  The ranking formula: score = priorityWeight(priority) + goalAlignmentWeight + urgencyWeight.');
console.log('  priorityWeight: P5=36 (coreGoal), P3=22 (important), P1=10 (lifeAdmin), null=0');
console.log('  goalAlignmentWeight: 34 base + order boost (8/4/2) = 36-44 max');
console.log('  urgencyWeight: high=28, medium=14, low=0');
console.log();
console.log('  Subscriptions outrank technical work when:');
console.log('  (a) They carry TickTick priority P3/P5 which gives 22-36 base before any theme match.');
console.log('  (b) They have due dates → urgency=high/medium → +14-28 on top.');
console.log('  (c) Technical tasks with no due date, no urgency keyword, and titles that don\'t');
console.log('      contain goal theme tokens get only goalAlignmentWeight (34-42), losing to');
console.log('      any P3 subscription with a due date (22 + 14-28 = 36-50).');
console.log('  (d) The text-based theme matcher only fires if task title or projectName');
console.log('      contains goal theme tokens (e.g. "cloudera", "system design", "msc").');
console.log('      Vague titles like "Follow up" or "Review" miss all theme tokens.');
console.log('  (e) CONCLUSION: Technical work is penalized by (1) missing urgency signals,');
console.log('      (2) vague titles that don\'t match goal theme tokens, and (3) the ranking');
console.log('      treating subscriptions with P3/P5 as higher base priority than implied');
console.log('      strategic importance would suggest.');
console.log();