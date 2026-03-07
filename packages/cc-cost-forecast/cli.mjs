#!/usr/bin/env node

// cc-cost-forecast — Project your Claude Code API cost to month-end
// Zero dependencies. Reads ~/.claude/projects/ session transcripts.
//
// Shows: today, this week, this month, month-end forecast
// Compares against Max plan tiers ($20 / $100 / $200)
//
// Usage:
//   npx cc-cost-forecast           # interactive display
//   npx cc-cost-forecast --once    # print once and exit
//   npx cc-cost-forecast --budget 100  # set custom budget ceiling

import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const REFRESH_MS = 30_000;

// Claude Sonnet 4.x API pricing ($ per million tokens)
// Max plan users: your actual cost is the subscription fee.
// These numbers reflect API-equivalent value for burn rate awareness.
const PRICE = { input: 3.00, output: 15.00, cache_write: 3.75, cache_read: 0.30 };

// Max plan tiers
const PLANS = [
  { name: 'Free',    limit:   0, color: '\x1b[37m' },
  { name: '$20',     limit:  20, color: '\x1b[36m' },
  { name: '$100',    limit: 100, color: '\x1b[33m' },
  { name: '$200',    limit: 200, color: '\x1b[32m' },
  { name: '$400',    limit: 400, color: '\x1b[35m' },
];

// ── Color helpers ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m', white: '\x1b[37m',
};

function pad(s, len, right = false) {
  const t = String(s);
  const p = ' '.repeat(Math.max(0, len - t.length));
  return right ? p + t : t + p;
}

function fmtCost(d, decimals = 3) {
  if (d === 0) return '$0.000';
  if (d < 0.001) return '<$0.001';
  return '$' + d.toFixed(decimals);
}

function bar(pct, width = 28) {
  const p = Math.min(1, Math.max(0, pct));
  const fill = Math.round(p * width);
  const col = p > 0.9 ? C.red : p > 0.75 ? C.yellow : C.green;
  const overflow = p >= 1;
  if (overflow) return C.red + '█'.repeat(width) + ' ⚠' + C.reset;
  return col + '█'.repeat(fill) + C.dim + '░'.repeat(width - fill) + C.reset;
}

function statusLabel(pct) {
  if (pct >= 1.0) return C.red + C.bold + 'OVER BUDGET' + C.reset;
  if (pct >= 0.9) return C.red + 'DANGER' + C.reset;
  if (pct >= 0.75) return C.yellow + 'WARNING' + C.reset;
  return C.green + 'OK' + C.reset;
}

// ── Parse all .jsonl files ─────────────────────────────────────────────────
function tokenCost(u) {
  if (!u) return 0;
  const i = (u.input_tokens || 0) * PRICE.input / 1e6;
  const o = (u.output_tokens || 0) * PRICE.output / 1e6;
  const cw = (u.cache_creation_input_tokens || 0) * PRICE.cache_write / 1e6;
  const cr = (u.cache_read_input_tokens || 0) * PRICE.cache_read / 1e6;
  return i + o + cw + cr;
}

async function parseFile(filePath) {
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  const dayCosts = {}; // YYYY-MM-DD → cost
  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.type !== 'assistant') continue;
    const usage = obj.message?.usage || obj.usage;
    if (!usage) continue;
    const c = tokenCost(usage);
    if (c <= 0) continue;
    // timestamp from JSON or fall back to file mtime
    const ts = obj.timestamp || obj.created_at;
    if (!ts) continue;
    const day = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
    dayCosts[day] = (dayCosts[day] || 0) + c;
  }
  return dayCosts;
}

async function collectAll() {
  const totals = {}; // YYYY-MM-DD → total cost
  try {
    const projects = await readdir(PROJECTS_DIR);
    for (const proj of projects) {
      const dir = join(PROJECTS_DIR, proj);
      let files;
      try { files = await readdir(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fp = join(dir, f);
        const dayCosts = await parseFile(fp);
        for (const [day, cost] of Object.entries(dayCosts)) {
          totals[day] = (totals[day] || 0) + cost;
        }
      }
    }
  } catch {}
  return totals;
}

// ── Calculate summaries ────────────────────────────────────────────────────
function summarize(dayCosts, budget) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const monthPrefix = todayStr.slice(0, 7); // YYYY-MM

  // days in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = now.getUTCDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  // this month's data
  const monthDays = Object.keys(dayCosts).filter(d => d.startsWith(monthPrefix)).sort();
  const monthCost = monthDays.reduce((s, d) => s + dayCosts[d], 0);

  // today
  const todayCost = dayCosts[todayStr] || 0;

  // this week (Mon-Sun)
  const dow = now.getUTCDay(); // 0=Sun
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekCost = Object.entries(dayCosts)
    .filter(([d]) => d >= weekStartStr && d <= todayStr)
    .reduce((s, [, v]) => s + v, 0);

  // daily average this month (only days with usage)
  const activeDaysThisMonth = monthDays.length || 1;
  const dailyAvg = monthCost / activeDaysThisMonth;

  // forecast: current spend + (remaining days × daily avg)
  const forecast = monthCost + daysRemaining * dailyAvg;

  // last 30 days for sparkline
  const last30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    last30.push(dayCosts[d.toISOString().slice(0, 10)] || 0);
  }

  // date 30 days ago
  const d30ago = new Date(now);
  d30ago.setUTCDate(d30ago.getUTCDate() - 29);
  const sparkStartStr = d30ago.toISOString().slice(0, 10);

  return {
    today: todayCost,
    weekCost,
    monthCost,
    dailyAvg,
    forecast,
    dayOfMonth,
    daysInMonth,
    sparkStart: sparkStartStr,
    daysRemaining,
    activeDaysThisMonth,
    last30,
    monthPrefix,
    budget,
  };
}

// ── Sparkline ─────────────────────────────────────────────────────────────
const SPARK_CHARS = ' ▁▂▃▄▅▆▇█';
function sparkline(values, width = 30) {
  const v = values.slice(-width);
  const max = Math.max(...v, 0.001);
  return v.map(x => {
    const idx = Math.round((x / max) * (SPARK_CHARS.length - 1));
    return SPARK_CHARS[idx];
  }).join('');
}

// ── Render ────────────────────────────────────────────────────────────────
function render(s) {
  const lines = [];
  const W = 52;
  const div = C.dim + '─'.repeat(W) + C.reset;

  lines.push('');
  lines.push(`  ${C.bold}cc-cost-forecast${C.reset}  ${C.dim}API-equivalent cost estimator${C.reset}`);
  lines.push('  ' + div);
  lines.push('');

  // Period costs
  lines.push(`  ${C.dim}Period${C.reset}`);
  lines.push(`  Today         ${pad(fmtCost(s.today), 10, true)}`);
  lines.push(`  This week     ${pad(fmtCost(s.weekCost), 10, true)}`);
  lines.push(`  This month    ${pad(fmtCost(s.monthCost), 10, true)}  ${C.dim}(${s.dayOfMonth} of ${s.daysInMonth} days)${C.reset}`);
  lines.push(`  Daily avg     ${pad(fmtCost(s.dailyAvg), 10, true)}  ${C.dim}(${s.activeDaysThisMonth} active days)${C.reset}`);
  lines.push('');

  // Forecast
  lines.push(`  ${C.dim}Forecast${C.reset}`);
  lines.push(`  Month-end est ${C.bold}${pad(fmtCost(s.forecast), 10, true)}${C.reset}  ${C.dim}(${s.daysRemaining} days remaining)${C.reset}`);
  lines.push('');

  // Plan comparison
  lines.push(`  ${C.dim}vs. Max plan tiers${C.reset}`);
  for (const plan of PLANS) {
    if (plan.limit === 0) continue;
    const pct = s.forecast / plan.limit;
    const pctStr = (pct * 100).toFixed(0) + '%';
    const b = bar(pct, 20);
    const st = statusLabel(pct);
    lines.push(`  ${plan.color}${pad(plan.name, 6)}${C.reset}  ${b}  ${pad(pctStr, 5, true)}  ${st}`);
  }

  // Custom budget if set
  if (s.budget && !PLANS.find(p => p.limit === s.budget)) {
    const pct = s.forecast / s.budget;
    const pctStr = (pct * 100).toFixed(0) + '%';
    const b = bar(pct, 20);
    const st = statusLabel(pct);
    lines.push(`  ${C.cyan}${pad('$' + s.budget, 6)}${C.reset}  ${b}  ${pad(pctStr, 5, true)}  ${st} ${C.cyan}← your budget${C.reset}`);
  }

  lines.push('');

  // Sparkline (last 30 days)
  lines.push(`  ${C.dim}Daily cost — last 30 days${C.reset}`);
  lines.push(`  ${C.cyan}${sparkline(s.last30, 30)}${C.reset}`);
  lines.push(`  ${C.dim}${s.sparkStart}${' '.repeat(16)}today${C.reset}`);
  lines.push('');

  lines.push(`  ${C.dim}Note: API-rate pricing. Max plan cost = subscription fee.${C.reset}`);
  lines.push(`  ${C.dim}Estimate shows relative usage intensity, not actual charge.${C.reset}`);
  lines.push('');

  process.stdout.write('\x1b[2J\x1b[H' + lines.join('\n') + '\n');
}

// ── Main ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const once = args.includes('--once');
const budgetIdx = args.indexOf('--budget');
const budget = budgetIdx >= 0 ? parseFloat(args[budgetIdx + 1]) || 0 : 0;

async function run() {
  const dayCosts = await collectAll();
  const s = summarize(dayCosts, budget);
  render(s);
}

if (once) {
  await run();
} else {
  await run();
  setInterval(run, REFRESH_MS);
}
