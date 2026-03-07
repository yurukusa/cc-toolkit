#!/usr/bin/env node
/**
 * cc-stats-badge — Claude Code stats badge for GitHub READMEs
 *
 * Generates an SVG badge showing your current Claude Code streak,
 * monthly hours, and AI autonomy ratio. Embed in your GitHub README.
 *
 * Usage:
 *   npx @yurukusa/cc-stats-badge                   # Print SVG to stdout
 *   npx @yurukusa/cc-stats-badge --out=badge.svg   # Write SVG to file
 *   npx @yurukusa/cc-stats-badge --shields         # Print shields.io URL
 *   npx @yurukusa/cc-stats-badge --markdown        # Print README snippet
 *
 * Cron + auto-commit (update badge daily):
 *   0 8 * * * npx @yurukusa/cc-stats-badge --out=cc-badge.svg && \
 *             git add cc-badge.svg && \
 *             git diff --cached --quiet || \
 *             git commit -m "chore: update CC stats badge" && \
 *             git push
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { writeFileSync } from 'node:fs';

const HOME = homedir();

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const helpFlag     = args.includes('--help') || args.includes('-h');
const shieldsFlag  = args.includes('--shields');
const markdownFlag = args.includes('--markdown');
const outArg       = args.find(a => a.startsWith('--out='));
const outFile      = outArg ? outArg.slice(6) : null;
const styleArg     = args.find(a => a.startsWith('--style='));
const style        = styleArg ? styleArg.slice(8) : 'default';

if (helpFlag) {
  console.log(`
  cc-stats-badge — Claude Code stats badge for GitHub READMEs

  Usage:
    cc-stats-badge                     # Print SVG to stdout
    cc-stats-badge --out=badge.svg     # Write SVG to file
    cc-stats-badge --shields           # Print shields.io URL
    cc-stats-badge --markdown          # Print README snippet

  Options:
    --out=<file>    Write SVG to this file
    --shields       Output a shields.io URL instead of SVG
    --markdown      Output the README markdown snippet
    --style=flat    Badge style: default | flat | minimal

  Cron example (auto-update daily):
    0 8 * * * npx @yurukusa/cc-stats-badge --out=cc-badge.svg && git add cc-badge.svg && git diff --cached --quiet || git commit -m "chore: update CC stats" && git push
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

function monthStart(dateStr) {
  return dateStr.slice(0, 7) + '-01';
}

// ── Load data ─────────────────────────────────────────────────────────────────
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

// ── Compute stats ─────────────────────────────────────────────────────────────
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

function computeMonthStats(byDate, today) {
  let main = 0, sub = 0;
  let d = monthStart(today);
  while (d <= today) {
    const v = byDate[d];
    if (v) {
      main += typeof v === 'object' ? (v.main || 0) : 0;
      sub  += typeof v === 'object' ? (v.sub  || 0) : (v || 0);
    }
    d = addDays(d, 1);
  }
  return { main, sub };
}

// ── SVG generation ────────────────────────────────────────────────────────────

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Approximate text width for SVG (monospace estimate)
function textWidth(str, fontSize = 11) {
  return str.length * fontSize * 0.6;
}

function makeSvg({ streak, totalHours, autonomyRatio, today }) {
  const monthShort = new Date(today + 'T12:00:00').toLocaleString('en', { month: 'short' });

  // Badge segments
  const label = 'Claude Code';
  const streakPart = `${streak}d streak`;
  const hoursDisplay = totalHours < 10 ? totalHours.toFixed(1) : totalHours.toFixed(0);
  const hoursPart  = `${hoursDisplay}h ${monthShort}`;
  const autoDisplay = autonomyRatio > 20 ? 'AI-heavy' : `${autonomyRatio.toFixed(1)}x AI`;
  const autoPart   = autoDisplay;

  const fontSize = 11;
  const pad = 8;
  const h = 20;

  const labelW = Math.round(textWidth(label, fontSize)) + pad * 2;
  const streakW = Math.round(textWidth(streakPart, fontSize)) + pad * 2;
  const hoursW  = Math.round(textWidth(hoursPart, fontSize)) + pad * 2;
  const autoW   = Math.round(textWidth(autoPart, fontSize)) + pad * 2;

  const totalW = labelW + streakW + hoursW + autoW;

  const colors = {
    label:  '#3b3b3b',
    streak: streak >= 30 ? '#e05d44' : streak >= 7 ? '#fe7d37' : '#4c1',
    hours:  '#0075ca',
    auto:   '#9b59b6',
  };

  const mid = h / 2;
  const ty = 14;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalW}" height="${h}" role="img" aria-label="${escapeXml(label)}: ${escapeXml(streakPart)}">
  <title>${escapeXml(label)}: ${escapeXml(streakPart)}, ${escapeXml(hoursPart)}, ${escapeXml(autoPart)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalW}" height="${h}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="${h}" fill="${colors.label}"/>
    <rect x="${labelW}" width="${streakW}" height="${h}" fill="${colors.streak}"/>
    <rect x="${labelW + streakW}" width="${hoursW}" height="${h}" fill="${colors.hours}"/>
    <rect x="${labelW + streakW + hoursW}" width="${autoW}" height="${h}" fill="${colors.auto}"/>
    <rect width="${totalW}" height="${h}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="${fontSize}">
    <text x="${labelW / 2}" y="${ty}" fill="#010101" fill-opacity=".3">${escapeXml(label)}</text>
    <text x="${labelW / 2}" y="${ty - 1}">${escapeXml(label)}</text>
    <text x="${labelW + streakW / 2}" y="${ty}" fill="#010101" fill-opacity=".3">${escapeXml(streakPart)}</text>
    <text x="${labelW + streakW / 2}" y="${ty - 1}">${escapeXml(streakPart)}</text>
    <text x="${labelW + streakW + hoursW / 2}" y="${ty}" fill="#010101" fill-opacity=".3">${escapeXml(hoursPart)}</text>
    <text x="${labelW + streakW + hoursW / 2}" y="${ty - 1}">${escapeXml(hoursPart)}</text>
    <text x="${labelW + streakW + hoursW + autoW / 2}" y="${ty}" fill="#010101" fill-opacity=".3">${escapeXml(autoPart)}</text>
    <text x="${labelW + streakW + hoursW + autoW / 2}" y="${ty - 1}">${escapeXml(autoPart)}</text>
  </g>
</svg>`;

  return svg;
}

function makeShieldsUrl({ streak, totalHours, autonomyRatio }) {
  // shields.io doesn't support multi-segment, so compose as label|message
  const message = `${streak}d+streak+%7C+${totalHours.toFixed(0)}h+%7C+${autonomyRatio.toFixed(1)}x+AI`;
  const color = streak >= 30 ? 'red' : streak >= 7 ? 'orange' : 'brightgreen';
  return `https://img.shields.io/badge/Claude%20Code-${message}-${color}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const data = loadData();

if (!data?.byDate) {
  console.error('cc-stats-badge: Could not load data. Install: npm i -g cc-agent-load');
  process.exit(1);
}

const today = localToday();
const byDate = data.byDate;
const streak = computeStreak(byDate, today);
const { main, sub } = computeMonthStats(byDate, today);
const totalHours = main + sub;
const autonomyRatio = main > 0 ? sub / main : (sub > 0 ? 99 : 0);

const stats = { streak, totalHours, autonomyRatio, today };

if (shieldsFlag) {
  console.log(makeShieldsUrl(stats));
  process.exit(0);
}

const svg = makeSvg(stats);

if (markdownFlag) {
  const shieldsUrl = makeShieldsUrl(stats);
  const monthName = new Date(today + 'T12:00:00').toLocaleString('en', { month: 'long', year: 'numeric' });
  console.log(`\n<!-- Claude Code Stats Badge -->`);
  console.log(`<!-- Add to your GitHub profile README -->`);
  console.log(`<!-- Auto-update with: npx @yurukusa/cc-stats-badge --out=cc-badge.svg -->`);
  console.log(``);
  console.log(`<!-- Option 1: Local SVG (regenerate with cron) -->`);
  console.log(`![Claude Code](./cc-badge.svg)`);
  console.log(``);
  console.log(`<!-- Option 2: Static shields.io badge (${monthName} stats) -->`);
  console.log(`![Claude Code](${shieldsUrl})`);
  process.exit(0);
}

if (outFile) {
  writeFileSync(outFile, svg, 'utf8');
  console.error(`cc-stats-badge: Written to ${outFile}`);
  console.error(`  Streak: ${streak} days | ${totalHours.toFixed(0)}h this month | ${autonomyRatio.toFixed(1)}x AI ratio`);
  console.error(`  Add to README: ![Claude Code](./${outFile})`);
} else {
  process.stdout.write(svg + '\n');
}
