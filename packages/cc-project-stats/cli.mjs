#!/usr/bin/env node
/**
 * cc-project-stats — Time spent per project in Claude Code
 * Shows which projects consumed the most AI and human hours.
 * Reads directly from ~/.claude/projects/ session files.
 * Uses the same methodology as cc-agent-load.
 */

import { readdir, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const helpFlag = args.includes('--help') || args.includes('-h');
const jsonFlag = args.includes('--json');

function getPeriodDays(args) {
  const flag = args.find(a => a.startsWith('--days='));
  if (!flag) return 7;
  const n = parseInt(flag.replace('--days=', ''));
  return isNaN(n) ? 7 : n;
}
const days = getPeriodDays(args);

// 'all' flag: show all-time stats (no date filter)
const allFlag = args.includes('--all');

if (helpFlag) {
  console.log(`
  cc-project-stats — Time spent per project in Claude Code

  Usage:
    cc-project-stats [options]

  Options:
    --days=<N>    Look back N days (default: 7)
    --all         Show all-time stats (no date filter)
    --json        Print raw JSON
    --help        Show this help

  Examples:
    cc-project-stats             # last 7 days
    cc-project-stats --days=30   # last 30 days
    cc-project-stats --all       # all time

  Shows:
    ▸ Hours per project (you vs AI autonomous)
    ▸ Ranked by total hours
    ▸ Number of sessions per project
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

// ── Same as cc-agent-load ─────────────────────────────────────────────────────
function cleanProjectName(dirName) {
  if (dirName.startsWith('-tmp')) return '/tmp';
  const parts = dirName.split('-').filter(Boolean);
  if (parts[0] === 'home' && parts.length >= 2) {
    const rest = parts.slice(2);
    if (rest.length === 0) return '~';
    if (rest[0] === 'projects') rest.shift();
    return rest.join('-') || '~';
  }
  return dirName;
}

async function readFirstLastLine(filePath) {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fh.read(buf, 0, 8192, 0);
    if (bytesRead === 0) return null;
    const chunk = buf.toString('utf8', 0, bytesRead);
    const nl = chunk.indexOf('\n');
    const firstLine = nl >= 0 ? chunk.substring(0, nl) : chunk;

    const fileStat = await fh.stat();
    const fileSize = fileStat.size;
    if (fileSize < 2) return { firstLine, lastLine: firstLine };

    const readSize = Math.min(65536, fileSize);
    const tailBuf = Buffer.alloc(readSize);
    const { bytesRead: tailBytes } = await fh.read(tailBuf, 0, readSize, fileSize - readSize);
    const lines = tailBuf.toString('utf8', 0, tailBytes).split('\n').filter(l => l.trim());
    const lastLine = lines[lines.length - 1] || firstLine;
    return { firstLine, lastLine };
  } finally {
    await fh.close();
  }
}

function parseTimestamp(jsonLine) {
  try {
    const data = JSON.parse(jsonLine);
    const ts = data.timestamp || data.ts;
    if (ts) return new Date(ts);
  } catch {}
  return null;
}

// ── Scan sessions for a project ───────────────────────────────────────────────
async function collectProjectSessions(projPath, projName, cutoff, today, bucket) {
  const files = await readdir(projPath).catch(() => []);

  // Main sessions: direct .jsonl files
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;
    await addSessionFiltered(join(projPath, file), projName, cutoff, today, bucket, false);
  }

  // Sub sessions: <uuid>/subagents/*.jsonl
  for (const file of files) {
    const subPath = join(projPath, file, 'subagents');
    const subStat = await stat(subPath).catch(() => null);
    if (!subStat?.isDirectory()) continue;
    const subFiles = await readdir(subPath).catch(() => []);
    for (const sf of subFiles) {
      if (!sf.endsWith('.jsonl')) continue;
      await addSessionFiltered(join(subPath, sf), projName, cutoff, today, bucket, true);
    }
  }
}

async function addSessionFiltered(filePath, projName, cutoff, today, bucket, isSub) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat || fileStat.size < 50) return;

  // Quick mtime check to skip obviously old files (perf optimization)
  if (!allFlag && cutoff && fileStat.mtime < new Date(cutoff)) return;

  try {
    const result = await readFirstLastLine(filePath);
    if (!result) return;
    const start = parseTimestamp(result.firstLine);
    const end = parseTimestamp(result.lastLine);
    if (!start || !end) return;

    const sessionDate = start.toLocaleDateString('en-CA'); // YYYY-MM-DD

    // Date filter
    if (!allFlag) {
      if (sessionDate < cutoff || sessionDate > today) return;
    }

    const durationMs = end - start;
    if (durationMs < 0 || durationMs >= 7 * 24 * 60 * 60 * 1000) return;
    const hours = durationMs / 3600000;
    if (hours < 0.001) return;

    if (!bucket[projName]) {
      bucket[projName] = { mainHours: 0, subHours: 0, mainSessions: 0, subSessions: 0 };
    }

    if (isSub) {
      bucket[projName].subHours += hours;
      bucket[projName].subSessions++;
    } else {
      bucket[projName].mainHours += hours;
      bucket[projName].mainSessions++;
    }
  } catch {}
}

// ── ANSI colors ───────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[96m',
  yellow: '\x1b[93m',
  green: '\x1b[92m',
  gray: '\x1b[90m',
  purple: '\x1b[95m',
};

function bar(val, max, width, mainH, subH) {
  // Split bar: cyan for main, yellow for sub
  const mainFilled = max > 0 ? Math.round((mainH / max) * width) : 0;
  const subFilled = max > 0 ? Math.round((subH / max) * width) : 0;
  const totalFilled = Math.min(mainFilled + subFilled, width);
  const empty = width - totalFilled;
  return `${C.cyan}${'█'.repeat(mainFilled)}${C.yellow}${'█'.repeat(Math.max(0, totalFilled - mainFilled))}${C.dim}${'░'.repeat(empty)}${C.reset}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const today = localToday();
  const cutoff = allFlag ? null : addDays(today, -days);

  const projectsDir = join(HOME, '.claude', 'projects');
  let projectDirs;
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    projectDirs = entries.filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    console.error(`Error: Cannot read ${projectsDir}`);
    process.exit(1);
  }

  const bucket = {};

  for (const dirName of projectDirs) {
    const projPath = join(projectsDir, dirName);
    const projName = cleanProjectName(dirName);
    await collectProjectSessions(projPath, projName, cutoff, today, bucket);
  }

  // Sort by total hours descending
  const sorted = Object.entries(bucket)
    .map(([name, s]) => ({
      name,
      mainHours: s.mainHours,
      subHours: s.subHours,
      total: s.mainHours + s.subHours,
      sessions: s.mainSessions + s.subSessions,
    }))
    .filter(p => p.total > 0.01)
    .sort((a, b) => b.total - a.total);

  if (jsonFlag) {
    const periodLabel = allFlag ? 'all-time' : `last-${days}-days`;
    console.log(JSON.stringify({ period: periodLabel, cutoff, today, projects: sorted }, null, 2));
    process.exit(0);
  }

  // ── Display ──────────────────────────────────────────────────────────────
  const periodLabel = allFlag ? 'all time' : days === 7 ? 'last 7 days' : days === 30 ? 'last 30 days' : `last ${days} days`;
  const maxTotal = Math.max(...sorted.map(p => p.total), 1);
  const totalMain = sorted.reduce((s, p) => s + p.mainHours, 0);
  const totalSub = sorted.reduce((s, p) => s + p.subHours, 0);

  console.log('');
  console.log(`  ${C.bold}cc-project-stats${C.reset}  —  ${periodLabel}`);
  if (cutoff) console.log(`  ${C.dim}${cutoff} → ${today}${C.reset}`);
  console.log(`  ${'─'.repeat(66)}`);
  console.log('');

  if (sorted.length === 0) {
    console.log(`  ${C.gray}No project activity found.${C.reset}`);
    console.log('');
    process.exit(0);
  }

  // Header
  console.log(`  ${'Project'.padEnd(22)}  ${''.padEnd(14)}  ${C.cyan}You${C.reset}      ${C.yellow}AI${C.reset}      Total`);
  console.log(`  ${'─'.repeat(66)}`);

  for (const proj of sorted) {
    const nameCol = proj.name.padEnd(22).slice(0, 22);
    const b = bar(proj.total, maxTotal, 14, proj.mainHours, proj.subHours);
    const mainStr = `${proj.mainHours.toFixed(1)}h`.padStart(7);
    const subStr = `${proj.subHours.toFixed(1)}h`.padStart(7);
    const totalStr = `${proj.total.toFixed(1)}h`.padStart(7);
    console.log(`  ${C.bold}${nameCol}${C.reset}  ${b}  ${C.cyan}${mainStr}${C.reset}  ${C.yellow}${subStr}${C.reset}  ${C.bold}${totalStr}${C.reset}`);
  }

  console.log('');
  console.log(`  ${'─'.repeat(66)}`);

  const totalH = totalMain + totalSub;
  const totalStr = `${totalH.toFixed(1)}h`;
  console.log(`  ${C.bold}Total${C.reset}`.padEnd(28) + `  ${C.cyan}${totalMain.toFixed(1)}h${C.reset}  ${C.yellow}${totalSub.toFixed(1)}h${C.reset}  ${C.bold}${totalStr}${C.reset}`);

  if (sorted.length > 0) {
    const top = sorted[0];
    const topPct = ((top.total / totalH) * 100).toFixed(0);
    const dominant = top.subHours > top.mainHours
      ? `${C.yellow}AI-led${C.reset} (${(top.subHours / top.total * 100).toFixed(0)}% autonomous)`
      : `${C.cyan}human-led${C.reset} (${(top.mainHours / top.total * 100).toFixed(0)}% interactive)`;
    console.log('');
    console.log(`  ${C.dim}Top:${C.reset} ${C.bold}${top.name}${C.reset} — ${topPct}% of total, ${dominant}`);
  }

  console.log('');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
