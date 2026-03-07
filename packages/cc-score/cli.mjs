#!/usr/bin/env node
/**
 * cc-score — Your AI Productivity Score (0–100)
 * A single number that captures how effectively you're using Claude Code.
 * Combines streak, autonomy ratio, ghost days, and active days into one score.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const helpFlag = args.includes('--help') || args.includes('-h');
const jsonFlag = args.includes('--json');
const shareFlag = args.includes('--share');

if (helpFlag) {
  console.log(`
  cc-score — Your AI Productivity Score (0–100)

  Usage:
    cc-score
    cc-score --share   # print shareable tweet text
    cc-score --json    # raw JSON output

  Score breakdown:
    Consistency  (30pts) — how regularly you use Claude Code
    Autonomy     (25pts) — how much AI runs independently
    Ghost Days   (20pts) — how often AI works without you
    Volume       (15pts) — total hours over last 30 days
    Streak       (10pts) — days without a gap

  Grades:
    90–100  S  Cyborg. You and AI are seamlessly fused.
    75–89   A  Power user. Serious AI collaboration.
    60–74   B  Growing. Your AI habits are taking shape.
    45–59   C  Early stage. Room to develop the relationship.
    30–44   D  Just getting started.
    0–29    F  Wake up your AI.
  `);
  process.exit(0);
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function parseDateLocal(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ── Load cc-agent-load ────────────────────────────────────────────────────────
function loadData() {
  // Fallback order:
  //   1. npx cc-agent-load --json  (works if cc-agent-load is installed locally or globally via npm)
  //   2. cc-agent-load --json      (found via PATH)
  //   3. $HOME/bin/cc-agent-load   (manual global install location)
  const paths = [
    ['npx', ['cc-agent-load', '--json']],
    ['cc-agent-load', ['--json']],
    [join(HOME, 'bin', 'cc-agent-load'), ['--json']],
  ];
  for (const [cmd, cmdArgs] of paths) {
    try {
      const out = execFileSync(cmd, cmdArgs, { encoding: 'utf8', timeout: 30000 });
      const json = JSON.parse(out);
      if (json.byDate) return json;
    } catch {}
  }
  return null;
}

// ── Streak calculation ────────────────────────────────────────────────────────
function computeStreak(byDate, today) {
  let streak = 0;
  let d = today;
  if (!byDate[d]) {
    // today might not have data yet; start from yesterday
    d = addDays(today, -1);
  }
  while (byDate[d]) {
    const v = byDate[d];
    const active = typeof v === 'object' ? (v.main || 0) + (v.sub || 0) : (v || 0);
    if (active === 0) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

// ── Score components ──────────────────────────────────────────────────────────
function scoreConsistency(byDate, today, window = 30) {
  // What % of last 30 days had activity? (max 30pts)
  let active = 0;
  for (let i = 0; i < window; i++) {
    const d = addDays(today, -i);
    const v = byDate[d];
    if (!v) continue;
    const hours = typeof v === 'object' ? (v.main || 0) + (v.sub || 0) : (v || 0);
    if (hours > 0) active++;
  }
  const pct = active / window;
  return { raw: pct, points: Math.round(pct * 30), activeDays: active, window };
}

function scoreAutonomy(byDate, today, window = 30) {
  // Autonomy ratio over last 30 days (max 25pts)
  // 1.0x = 15pts, 2.0x = 25pts, 0.5x = 8pts
  let main = 0, sub = 0;
  for (let i = 0; i < window; i++) {
    const d = addDays(today, -i);
    const v = byDate[d];
    if (!v) continue;
    main += typeof v === 'object' ? (v.main || 0) : 0;
    sub += typeof v === 'object' ? (v.sub || 0) : (v || 0);
  }
  const ratio = main > 0 ? sub / main : (sub > 0 ? 2 : 0);
  // Scale: 0x=0pts, 0.5x=8pts, 1x=15pts, 2x=25pts, capped at 25
  const points = Math.min(25, Math.round(ratio * 12.5));
  return { ratio, points, mainHours: main, subHours: sub };
}

function scoreGhostDays(byDate, today, window = 30) {
  // Ghost days / active days ratio (max 20pts)
  let ghost = 0, active = 0;
  for (let i = 0; i < window; i++) {
    const d = addDays(today, -i);
    const v = byDate[d];
    if (!v) continue;
    const m = typeof v === 'object' ? (v.main || 0) : 0;
    const s = typeof v === 'object' ? (v.sub || 0) : (v || 0);
    if (m > 0 || s > 0) {
      active++;
      if (m === 0 && s > 0) ghost++;
    }
  }
  const pct = active > 0 ? ghost / active : 0;
  // Scale: 0%=0pts, 30%=10pts, 60%=18pts, 80%+=20pts
  const points = Math.min(20, Math.round(pct * 25));
  return { ghostDays: ghost, activeDays: active, pct, points };
}

function scoreVolume(byDate, today, window = 30) {
  // Total hours last 30 days (max 15pts)
  // 0h=0, 20h=5, 50h=10, 100h+=15
  let total = 0;
  for (let i = 0; i < window; i++) {
    const d = addDays(today, -i);
    const v = byDate[d];
    if (!v) continue;
    total += typeof v === 'object' ? (v.main || 0) + (v.sub || 0) : (v || 0);
  }
  const points = Math.min(15, Math.round((total / 100) * 15));
  return { totalHours: total, points };
}

function scoreStreak(streak) {
  // Current streak (max 10pts)
  // 1d=1, 7d=5, 14d=7, 30d=10
  const points = Math.min(10, Math.round((streak / 30) * 10));
  return { streak, points };
}

// ── Grade ─────────────────────────────────────────────────────────────────────
function grade(score) {
  if (score >= 90) return { grade: 'S', label: 'Cyborg', desc: 'You and AI are seamlessly fused.' };
  if (score >= 75) return { grade: 'A', label: 'Power User', desc: 'Serious AI collaboration.' };
  if (score >= 60) return { grade: 'B', label: 'Growing', desc: 'Your AI habits are taking shape.' };
  if (score >= 45) return { grade: 'C', label: 'Early Stage', desc: 'Room to develop the relationship.' };
  if (score >= 30) return { grade: 'D', label: 'Getting Started', desc: 'Keep going.' };
  return { grade: 'F', label: 'Dormant', desc: 'Wake up your AI.' };
}

// ── ANSI colors ───────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[96m',
  yellow: '\x1b[93m',
  green: '\x1b[92m',
  red: '\x1b[91m',
  gray: '\x1b[90m',
  orange: '\x1b[33m',
  purple: '\x1b[95m',
};

function scoreColor(score) {
  if (score >= 90) return C.purple;
  if (score >= 75) return C.green;
  if (score >= 60) return C.cyan;
  if (score >= 45) return C.yellow;
  if (score >= 30) return C.orange;
  return C.red;
}

function miniBar(points, maxPoints, width = 10) {
  const filled = Math.round((points / maxPoints) * width);
  return `${C.cyan}${'█'.repeat(filled)}${C.dim}${'░'.repeat(width - filled)}${C.reset}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const data = loadData();

if (!data || !data.byDate) {
  console.error('Error: Could not load cc-agent-load data.');
  console.error('Install: npm i -g cc-agent-load');
  process.exit(1);
}

const today = localToday();
const byDate = data.byDate;

const consistency = scoreConsistency(byDate, today);
const autonomy = scoreAutonomy(byDate, today);
const ghostScore = scoreGhostDays(byDate, today);
const volume = scoreVolume(byDate, today);
const streak = scoreStreak(computeStreak(byDate, today));

const total = consistency.points + autonomy.points + ghostScore.points + volume.points + streak.points;
const g = grade(total);
const col = scoreColor(total);

if (jsonFlag) {
  console.log(JSON.stringify({
    score: total,
    grade: g.grade,
    label: g.label,
    breakdown: { consistency, autonomy, ghost: ghostScore, volume, streak },
    today,
  }, null, 2));
  process.exit(0);
}

// ── Display ──────────────────────────────────────────────────────────────────
console.log('');
console.log(`  ${C.bold}cc-score${C.reset}`);
console.log(`  ${C.dim}Your AI Productivity Score — last 30 days${C.reset}`);
console.log('');
console.log(`  ${col}${C.bold}${total} / 100${C.reset}   ${col}${C.bold}${g.grade}${C.reset}  ${C.dim}${g.label}${C.reset}`);
console.log(`  ${C.dim}${g.desc}${C.reset}`);
console.log('');
console.log(`  ${'─'.repeat(52)}`);
console.log('');

// Breakdown
const rows = [
  ['Consistency', consistency.points, 30, `${consistency.activeDays}/${consistency.window} days active`],
  ['Autonomy',   autonomy.points,   25, `${autonomy.ratio.toFixed(2)}x ratio (${autonomy.subHours.toFixed(1)}h AI / ${autonomy.mainHours.toFixed(1)}h you)`],
  ['Ghost Days', ghostScore.points, 20, `${ghostScore.ghostDays} days AI ran solo (${Math.round(ghostScore.pct * 100)}%)`],
  ['Volume',     volume.points,     15, `${volume.totalHours.toFixed(1)}h total`],
  ['Streak',     streak.points,     10, `${streak.streak} days current streak`],
];

for (const [label, pts, max, detail] of rows) {
  const b = miniBar(pts, max, 10);
  const ptsStr = `${pts}/${max}`.padStart(5);
  console.log(`  ${label.padEnd(13)} ${b}  ${ptsStr}  ${C.dim}${detail}${C.reset}`);
}

console.log('');
console.log(`  ${'─'.repeat(52)}`);

if (shareFlag) {
  console.log('');
  console.log(`  ${C.bold}Share:${C.reset}`);
  const shareText = `My Claude Code AI Score: ${total}/100 (${g.grade} — ${g.label})
→ ${consistency.activeDays} active days, ${autonomy.ratio.toFixed(2)}x autonomy ratio, ${streak.streak}-day streak
npx cc-score #ClaudeCode #AIProductivity`;
  console.log('');
  console.log(`  ${C.dim}${shareText.replace(/\n/g, '\n  ')}${C.reset}`);
}

console.log('');
