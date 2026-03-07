#!/usr/bin/env node
/**
 * cc-predict — Forecast your Claude Code usage at current pace
 * Projects end-of-month totals, streak trajectory, and Ghost Day count.
 * The only cc-toolkit tool that looks FORWARD.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const helpFlag = args.includes('--help') || args.includes('-h');
const jsonFlag = args.includes('--json');

if (helpFlag) {
  console.log(`
  cc-predict — Forecast your Claude Code usage at current pace

  Usage:
    cc-predict
    cc-predict --json

  Shows:
    ▸ Projected end-of-month hours (you + AI)
    ▸ Ghost Day count by month end
    ▸ Streak forecast (will it survive the month?)
    ▸ Autonomy ratio trend
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

function daysInMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function monthStart(dateStr) {
  return dateStr.slice(0, 7) + '-01';
}

function dayOfMonth(dateStr) {
  return parseInt(dateStr.slice(8));
}

// ── Load data ────────────────────────────────────────────────────────────────
function loadData() {
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

// ── Compute baseline (last N days) ───────────────────────────────────────────
function computeBaseline(byDate, today, lookbackDays = 14) {
  let mainSum = 0, subSum = 0, activeDays = 0, ghostDays = 0;
  for (let i = 1; i <= lookbackDays; i++) {
    const d = addDays(today, -i);
    const v = byDate[d];
    if (!v) continue;
    const m = typeof v === 'object' ? (v.main || 0) : 0;
    const s = typeof v === 'object' ? (v.sub || 0) : (v || 0);
    if (m > 0 || s > 0) {
      activeDays++;
      mainSum += m;
      subSum += s;
    }
    if (m === 0 && s > 0) ghostDays++;
  }
  return {
    avgMainPerDay: mainSum / lookbackDays,
    avgSubPerDay: subSum / lookbackDays,
    activePct: activeDays / lookbackDays,
    ghostPct: activeDays > 0 ? ghostDays / activeDays : 0,
    lookbackDays,
  };
}

// ── Compute streak ────────────────────────────────────────────────────────────
function computeStreak(byDate, today) {
  let streak = 0;
  let d = today;
  if (!byDate[d]) d = addDays(today, -1);
  while (byDate[d]) {
    const v = byDate[d];
    const active = typeof v === 'object' ? (v.main || 0) + (v.sub || 0) : (v || 0);
    if (active === 0) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

// ── Month-to-date actuals ─────────────────────────────────────────────────────
function monthToDate(byDate, today) {
  const start = monthStart(today);
  let mainH = 0, subH = 0, activeDays = 0, ghostDays = 0;
  let d = start;
  while (d <= today) {
    const v = byDate[d];
    if (v) {
      const m = typeof v === 'object' ? (v.main || 0) : 0;
      const s = typeof v === 'object' ? (v.sub || 0) : (v || 0);
      if (m > 0 || s > 0) {
        activeDays++;
        mainH += m;
        subH += s;
      }
      if (m === 0 && s > 0) ghostDays++;
    }
    d = addDays(d, 1);
  }
  return { mainH, subH, activeDays, ghostDays };
}

// ── ANSI ──────────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[96m',
  yellow: '\x1b[93m',
  green: '\x1b[92m',
  gray: '\x1b[90m',
  orange: '\x1b[33m',
  purple: '\x1b[95m',
};

function confidenceBar(activePct, width = 10) {
  const filled = Math.round(activePct * width);
  const col = activePct > 0.8 ? C.green : activePct > 0.5 ? C.yellow : C.orange;
  return `${col}${'█'.repeat(filled)}${C.dim}${'░'.repeat(width - filled)}${C.reset}`;
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

const baseline = computeBaseline(byDate, today, 14);
const streak = computeStreak(byDate, today);
const mtd = monthToDate(byDate, today);

const dom = dayOfMonth(today);           // day of month (1-31)
const totalDays = daysInMonth(today);    // days in current month
const remainingDays = totalDays - dom;

// Project month-end totals
const projMainRemaining = baseline.avgMainPerDay * remainingDays;
const projSubRemaining = baseline.avgSubPerDay * remainingDays;
const projMainTotal = mtd.mainH + projMainRemaining;
const projSubTotal = mtd.subH + projSubRemaining;
const projActiveDays = mtd.activeDays + Math.round(baseline.activePct * remainingDays);
const projGhostDays = mtd.ghostDays + Math.round(baseline.ghostPct * baseline.activePct * remainingDays);

// Streak: will it survive to month end?
const streakSurvivesMonth = baseline.activePct >= 0.85;
const streakProjection = streak + Math.round(baseline.activePct * remainingDays);

// Autonomy trend
const autonomyRatio = baseline.avgMainPerDay > 0
  ? baseline.avgSubPerDay / baseline.avgMainPerDay
  : (baseline.avgSubPerDay > 0 ? 99 : 0);

if (jsonFlag) {
  console.log(JSON.stringify({
    today,
    daysRemaining: remainingDays,
    baseline,
    monthToDate: mtd,
    projected: {
      mainHours: projMainTotal,
      subHours: projSubTotal,
      activeDays: projActiveDays,
      ghostDays: projGhostDays,
      streak: streakProjection,
    },
  }, null, 2));
  process.exit(0);
}

// ── Display ──────────────────────────────────────────────────────────────────
const monthName = new Date(today + 'T12:00:00').toLocaleString('en', { month: 'long' });

console.log('');
console.log(`  ${C.bold}cc-predict${C.reset}  —  ${monthName} forecast`);
console.log(`  ${C.dim}Based on your last 14 days · ${remainingDays} days remaining this month${C.reset}`);
console.log(`  ${'─'.repeat(58)}`);
console.log('');

// Month-to-date vs projected
console.log(`  ${C.bold}Hours this month${C.reset}`);
console.log(`  ${C.dim}So far:${C.reset}         ${C.cyan}${mtd.mainH.toFixed(1)}h${C.reset} you + ${C.yellow}${mtd.subH.toFixed(1)}h${C.reset} AI = ${C.bold}${(mtd.mainH + mtd.subH).toFixed(1)}h${C.reset}`);
console.log(`  ${C.dim}At current pace:${C.reset} ${C.cyan}${projMainTotal.toFixed(1)}h${C.reset} you + ${C.yellow}${projSubTotal.toFixed(1)}h${C.reset} AI = ${C.bold}${(projMainTotal + projSubTotal).toFixed(1)}h${C.reset} projected`);
console.log('');

// Ghost days
console.log(`  ${C.bold}Ghost Days${C.reset}`);
console.log(`  ${C.dim}So far:${C.reset}         ${mtd.ghostDays} days`);
console.log(`  ${C.dim}Month end:${C.reset}      ${C.yellow}~${projGhostDays} days${C.reset} projected`);
console.log('');

// Streak forecast
console.log(`  ${C.bold}Streak${C.reset}`);
console.log(`  ${C.dim}Current:${C.reset}        ${streak} days`);
const streakMsg = streakSurvivesMonth
  ? `${C.green}Likely survives${C.reset} (${Math.round(baseline.activePct * 100)}% daily consistency)`
  : `${C.orange}At risk${C.reset} (${Math.round(baseline.activePct * 100)}% daily consistency)`;
console.log(`  ${C.dim}Forecast:${C.reset}       ${streakMsg}`);
if (streakSurvivesMonth) {
  console.log(`  ${C.dim}Projected streak end of month:${C.reset} ${C.bold}~${streakProjection} days${C.reset}`);
}
console.log('');

// Autonomy trend
const ratioStr = isFinite(autonomyRatio) && autonomyRatio < 50
  ? `${autonomyRatio.toFixed(2)}x`
  : 'very high';
console.log(`  ${C.bold}AI Autonomy${C.reset}`);
console.log(`  ${C.dim}14-day avg:${C.reset}     ${C.yellow}${ratioStr}${C.reset} (AI hours / your hours)`);
if (autonomyRatio > 1.5) {
  console.log(`  ${C.yellow}  AI is running 1.5x more than you${C.reset}`);
} else if (autonomyRatio > 1) {
  console.log(`  ${C.yellow}  AI is running more than you${C.reset}`);
} else {
  console.log(`  ${C.cyan}  You're driving more than AI${C.reset}`);
}
console.log('');

// Confidence
console.log(`  ${'─'.repeat(58)}`);
console.log(`  ${C.dim}Confidence: ${confidenceBar(baseline.activePct)} ${Math.round(baseline.activePct * 100)}% active days base rate${C.reset}`);
console.log(`  ${C.dim}(higher confidence = more consistent your usage has been)${C.reset}`);
console.log('');
