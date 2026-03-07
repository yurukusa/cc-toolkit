#!/usr/bin/env node
/**
 * cc-compare — Compare two time periods of Claude Code activity
 * Shows how your usage, AI autonomy, and Ghost Days changed over time.
 * Default: this week vs last week.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const helpFlag = args.includes('--help') || args.includes('-h');
const jsonFlag = args.includes('--json');

// Parse --period flag: 'week', 'month', or 'Nd' (N days)
function getPeriodDays(args) {
  const flag = args.find(a => a.startsWith('--period='));
  if (!flag) return 7; // default: 7 days
  const val = flag.replace('--period=', '');
  if (val === 'week') return 7;
  if (val === 'month') return 30;
  const match = val.match(/^(\d+)d$/);
  return match ? parseInt(match[1]) : 7;
}

const periodDays = getPeriodDays(args);

if (helpFlag) {
  console.log(`
  cc-compare — Compare two time periods of Claude Code activity

  Usage:
    cc-compare [options]

  Options:
    --period=<N>    Period length in days (default: 7)
                    Shortcuts: week (7d), month (30d), or "14d", "30d", etc.
    --json          Print raw JSON
    --help          Show this help

  Examples:
    cc-compare                  # this week vs last week
    cc-compare --period=month   # this month vs last month
    cc-compare --period=14d     # last 14 days vs 14 days before that

  Shows:
    ▸ Your hours: change in interactive session hours
    ▸ AI hours: change in autonomous session hours
    ▸ Autonomy ratio: is AI getting more or less autonomous?
    ▸ Ghost Days: change in days AI worked alone
    ▸ Active days: change in total active days
  `);
  process.exit(0);
}

// ── Local date helpers ────────────────────────────────────────────────────────
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

// ── Load cc-agent-load data ───────────────────────────────────────────────────
function loadAgentLoad() {
  const paths = [
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

// ── Compute stats for a date range ───────────────────────────────────────────
function computePeriodStats(byDate, startDate, endDate) {
  let mainHours = 0;
  let subHours = 0;
  let activeDays = 0;
  let ghostDays = 0;
  let bothDays = 0;

  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const v = byDate[ds];
    if (!v) continue;

    const main = typeof v === 'object' ? (v.main || 0) : 0;
    const sub = typeof v === 'object' ? (v.sub || 0) : (v || 0);

    if (main > 0 || sub > 0) {
      activeDays++;
      mainHours += main;
      subHours += sub;
    }
    if (main === 0 && sub > 0) ghostDays++;
    if (main > 0 && sub > 0) bothDays++;
  }

  const totalHours = mainHours + subHours;
  const autonomyRatio = mainHours > 0 ? subHours / mainHours : (subHours > 0 ? Infinity : 0);

  return { mainHours, subHours, totalHours, activeDays, ghostDays, bothDays, autonomyRatio, startDate, endDate };
}

// ── Delta helpers ─────────────────────────────────────────────────────────────
function delta(current, previous) {
  if (previous === 0 && current === 0) return { abs: 0, pct: 0, dir: '=' };
  if (previous === 0) return { abs: current, pct: null, dir: '▲' };
  const abs = current - previous;
  const pct = ((current - previous) / previous) * 100;
  return { abs, pct, dir: abs > 0 ? '▲' : abs < 0 ? '▼' : '=' };
}

function fmtDelta(d, unit = '') {
  if (d.dir === '=') return `${C.gray}= (no change)${C.reset}`;
  const color = d.dir === '▲' ? C.green : C.yellow;
  const sign = d.dir === '▲' ? '+' : '';
  const pctStr = d.pct !== null ? ` (${sign}${d.pct.toFixed(0)}%)` : '';
  return `${color}${d.dir} ${sign}${Math.abs(d.abs).toFixed(unit === 'h' ? 1 : 0)}${unit}${pctStr}${C.reset}`;
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
};

// ── Bar ───────────────────────────────────────────────────────────────────────
function bar(val, max, width = 16, color = C.cyan) {
  const filled = max > 0 ? Math.min(Math.round((val / max) * width), width) : 0;
  return `${color}${'█'.repeat(filled)}${C.dim}${'░'.repeat(width - filled)}${C.reset}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const data = loadAgentLoad();

if (!data || !data.byDate) {
  console.error('Error: Could not load cc-agent-load data.');
  console.error('Install it first: npm i -g cc-agent-load');
  process.exit(1);
}

const today = localToday();
const curEnd = today;
const curStart = addDays(today, -(periodDays - 1));
const prevEnd = addDays(curStart, -1);
const prevStart = addDays(prevEnd, -(periodDays - 1));

const current = computePeriodStats(data.byDate, curStart, curEnd);
const previous = computePeriodStats(data.byDate, prevStart, prevEnd);

if (jsonFlag) {
  console.log(JSON.stringify({ current, previous, periodDays }, null, 2));
  process.exit(0);
}

// ── Terminal display ──────────────────────────────────────────────────────────
const maxHours = Math.max(current.mainHours, previous.mainHours, current.subHours, previous.subHours, 1);
const maxDays = Math.max(current.activeDays, previous.activeDays, 1);

const periodLabel = periodDays === 7 ? 'week' : periodDays === 30 ? 'month' : `${periodDays}d`;

console.log('');
console.log(`  ${C.bold}cc-compare${C.reset}  —  ${periodLabel} over ${periodLabel}`);
console.log(`  ${C.dim}${prevStart} → ${prevEnd}  vs  ${curStart} → ${curEnd}${C.reset}`);
console.log(`  ${'─'.repeat(60)}`);
console.log('');

// Hours comparison
const maxH = Math.max(current.mainHours, previous.mainHours, current.subHours, previous.subHours, 1);

console.log(`  ${C.bold}You (interactive hours)${C.reset}`);
console.log(`    prev  ${bar(previous.mainHours, maxH, 16, C.gray)}  ${previous.mainHours.toFixed(1)}h`);
console.log(`    now   ${bar(current.mainHours, maxH, 16, C.cyan)}  ${current.mainHours.toFixed(1)}h  ${fmtDelta(delta(current.mainHours, previous.mainHours), 'h')}`);
console.log('');

console.log(`  ${C.bold}AI (autonomous hours)${C.reset}`);
console.log(`    prev  ${bar(previous.subHours, maxH, 16, C.gray)}  ${previous.subHours.toFixed(1)}h`);
console.log(`    now   ${bar(current.subHours, maxH, 16, C.yellow)}  ${current.subHours.toFixed(1)}h  ${fmtDelta(delta(current.subHours, previous.subHours), 'h')}`);
console.log('');

// Autonomy ratio
const ratioDelta = delta(
  isFinite(current.autonomyRatio) ? current.autonomyRatio : 99,
  isFinite(previous.autonomyRatio) ? previous.autonomyRatio : 0
);

const ratioColor = current.autonomyRatio > 1 ? C.yellow : C.cyan;
const prevRatioStr = isFinite(previous.autonomyRatio) ? previous.autonomyRatio.toFixed(2) : 'N/A';
const curRatioStr = isFinite(current.autonomyRatio) ? current.autonomyRatio.toFixed(2) : 'N/A';

console.log(`  ${C.bold}AI Autonomy Ratio${C.reset}  (AI hours / your hours)`);
console.log(`    prev  ${prevRatioStr}x`);
console.log(`    now   ${ratioColor}${curRatioStr}x${C.reset}`);
if (current.autonomyRatio > previous.autonomyRatio) {
  console.log(`    ${C.yellow}↑ AI is getting more autonomous${C.reset}`);
} else if (current.autonomyRatio < previous.autonomyRatio) {
  console.log(`    ${C.cyan}↓ You're driving more${C.reset}`);
}
console.log('');

// Ghost Days
const ghostDelta = delta(current.ghostDays, previous.ghostDays);
console.log(`  ${C.bold}Ghost Days${C.reset}  (AI worked, you didn't)`);
console.log(`    prev  ${previous.ghostDays} days`);
console.log(`    now   ${current.ghostDays} days  ${fmtDelta(ghostDelta, ' day')}`);
console.log('');

// Active days
const activeDelta = delta(current.activeDays, previous.activeDays);
console.log(`  ${C.bold}Active Days${C.reset}`);
console.log(`    prev  ${bar(previous.activeDays, maxDays, 8, C.gray)}  ${previous.activeDays} / ${periodDays} days`);
console.log(`    now   ${bar(current.activeDays, maxDays, 8, C.green)}  ${current.activeDays} / ${periodDays} days  ${fmtDelta(activeDelta, ' day')}`);
console.log('');

// Summary insight
console.log(`  ${'─'.repeat(60)}`);
const insights = [];
if (current.mainHours > previous.mainHours * 1.2) insights.push(`You're ${C.cyan}more active${C.reset} this ${periodLabel}`);
else if (current.mainHours < previous.mainHours * 0.8) insights.push(`You're ${C.yellow}less active${C.reset} this ${periodLabel}`);

if (current.autonomyRatio > previous.autonomyRatio * 1.1) insights.push(`AI autonomy ${C.yellow}increasing${C.reset} — your AI is handling more`);
else if (current.autonomyRatio < previous.autonomyRatio * 0.9) insights.push(`AI autonomy ${C.cyan}decreasing${C.reset} — you're more hands-on`);

if (current.ghostDays > previous.ghostDays) insights.push(`${C.yellow}More Ghost Days${C.reset} — AI running more independently`);
else if (current.ghostDays < previous.ghostDays) insights.push(`${C.cyan}Fewer Ghost Days${C.reset} — you're more involved`);

if (insights.length > 0) {
  console.log('');
  console.log('  Insights:');
  for (const insight of insights) {
    console.log(`    ▸ ${insight}`);
  }
  console.log('');
}
