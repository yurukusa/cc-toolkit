#!/usr/bin/env node

// cc-weekly-report — AI weekly activity report from proof-log
// Reads ~/ops/proof-log/YYYY-MM-DD.md files and generates a weekly summary.
// Zero dependencies.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ── Config ──────────────────────────────────────────────────────

const DEFAULT_DAYS = 7;
const DEFAULT_LOG_DIR = join(homedir(), 'ops', 'proof-log');

// ── CLI args ────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`cc-weekly-report — AI weekly activity report from proof-log

Usage:
  cc-weekly-report                    # last 7 days
  cc-weekly-report --days 14          # last 14 days
  cc-weekly-report --dir ~/my-logs    # custom log dir
  cc-weekly-report --week 2026-02-22  # week starting on date
  cc-weekly-report --yesterday        # yesterday only, tweet-ready summary
  cc-weekly-report --format tweet     # compact tweet-length output

Output: Markdown report to stdout
  cc-weekly-report > weekly-report.md

Options:
  --days N         Number of days to include (default: 7)
  --dir PATH       Proof-log directory (default: ~/ops/proof-log)
  --week DATE      Start date for report (YYYY-MM-DD)
  --yesterday      Show yesterday only, short summary (good for daily tweets)
  --format tweet   Output tweet-length summary (280 chars) instead of full report
  --version        Show version
  --help           Show this help
`);
  process.exit(0);
}

if (args.includes('--version')) {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
  console.log(pkg.version);
  process.exit(0);
}

const isYesterday = args.includes('--yesterday');
const formatIdx = args.indexOf('--format');
const outputFormat = formatIdx >= 0 ? args[formatIdx + 1] : (isYesterday ? 'tweet' : 'markdown');

const daysIdx = args.indexOf('--days');
const numDays = isYesterday ? 1 : (daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) : DEFAULT_DAYS);

const dirIdx = args.indexOf('--dir');
const logDir = dirIdx >= 0
  ? args[dirIdx + 1].replace('~', homedir())
  : DEFAULT_LOG_DIR;

const weekIdx = args.indexOf('--week');
const weekStart = weekIdx >= 0 ? new Date(args[weekIdx + 1] + 'T00:00:00') : null;

// ── Date helpers ────────────────────────────────────────────────

function toYMD(date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(days, startDate = null, yesterday = false) {
  const now = new Date();
  let end;
  if (yesterday) {
    // Yesterday: end = yesterday 23:59
    end = new Date(now);
    end.setDate(now.getDate() - 1);
    end.setHours(23, 59, 59);
  } else if (startDate) {
    end = new Date(startDate);
    end.setHours(23, 59, 59);
  } else {
    end = new Date(now);
    end.setHours(23, 59, 59);
  }
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    dates.unshift(toYMD(d));
  }
  return dates;
}

function dayOfWeek(dateStr) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[new Date(dateStr + 'T00:00:00').getDay()];
}

// ── Parser ──────────────────────────────────────────────────────

// Session regex: ### YYYY-MM-DD HH:MM-HH:MM JST — セッション終了（自動記録）
const SESSION_HEADER = /^### (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})-(\d{2}:\d{2}) JST/;
const WHERE_LINE = /^- どこで: (.+)$/;
const WHO_LINE = /^- 誰が: CC: (\d+)件/;
const WHAT_LINE = /^- 何を: (\d+)ファイル変更 \(\+(\d+)\/-(\d+)\)/;
const HOW_LINE = /^- どうやって: (.+)$/;
const FILE_LINE = /^  - (.+?) \(\+(\d+)\/-(\d+), (\d+)回\)$/;
const DURATION_LINE = /^- いつ: .+JST（(\d+)分）/;

function parseProofLog(content, dateStr) {
  const sessions = [];
  let current = null;

  for (const raw of content.split('\n')) {
    const line = raw.trim();

    const headerMatch = SESSION_HEADER.exec(line);
    if (headerMatch) {
      if (current) sessions.push(current);
      current = {
        date: dateStr,
        startTime: headerMatch[2],
        endTime: headerMatch[3],
        durationMin: 0,
        project: null,
        ccActions: 0,
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
        tools: {},
        topFile: null,
        topFileAdded: 0,
      };
      continue;
    }

    if (!current) continue;

    const durMatch = DURATION_LINE.exec(line);
    if (durMatch) { current.durationMin = parseInt(durMatch[1], 10); continue; }

    const whereMatch = WHERE_LINE.exec(line);
    if (whereMatch) { current.project = whereMatch[1].trim(); continue; }

    const whoMatch = WHO_LINE.exec(line);
    if (whoMatch) { current.ccActions = parseInt(whoMatch[1], 10); continue; }

    const whatMatch = WHAT_LINE.exec(line);
    if (whatMatch) {
      current.filesChanged = parseInt(whatMatch[1], 10);
      current.linesAdded = parseInt(whatMatch[2], 10);
      current.linesRemoved = parseInt(whatMatch[3], 10);
      continue;
    }

    const fileMatch = FILE_LINE.exec(raw); // use raw for indented lines
    if (fileMatch) {
      const added = parseInt(fileMatch[2], 10);
      if (added > current.topFileAdded) {
        current.topFile = fileMatch[1];
        current.topFileAdded = added;
      }
      continue;
    }

    const howMatch = HOW_LINE.exec(line);
    if (howMatch) {
      // parse "Edit: 17回, Write: 4回" etc.
      for (const part of howMatch[1].split(',')) {
        const m = part.trim().match(/^(.+?): (\d+)回$/);
        if (m) current.tools[m[1]] = (current.tools[m[1]] || 0) + parseInt(m[2], 10);
      }
      continue;
    }
  }

  if (current) sessions.push(current);
  return sessions;
}

// ── Load logs ───────────────────────────────────────────────────

const dates = weekStart
  ? dateRange(numDays, weekStart)
  : isYesterday
    ? dateRange(1, null, true)
    : dateRange(numDays);

const allSessions = [];

for (const dateStr of dates) {
  const filePath = join(logDir, `${dateStr}.md`);
  if (!existsSync(filePath)) continue;
  try {
    const content = readFileSync(filePath, 'utf8');
    const sessions = parseProofLog(content, dateStr);
    allSessions.push(...sessions);
  } catch (e) {
    // skip unreadable files
  }
}

// ── Aggregate ───────────────────────────────────────────────────

const byDate = {};
const byProject = {};
let totalMinutes = 0;
let totalSessions = 0;
let totalLinesAdded = 0;
let totalLinesRemoved = 0;
let totalFiles = 0;
let totalCCActions = 0;
let longestSession = null;
const allFiles = {};

for (const s of allSessions) {
  if (!s.project) continue; // skip empty sessions

  totalSessions++;
  totalMinutes += s.durationMin;
  totalLinesAdded += s.linesAdded;
  totalLinesRemoved += s.linesRemoved;
  totalFiles += s.filesChanged;
  totalCCActions += s.ccActions;

  if (!longestSession || s.durationMin > longestSession.durationMin) {
    longestSession = s;
  }

  // by date
  if (!byDate[s.date]) byDate[s.date] = { sessions: 0, minutes: 0, projects: new Set(), linesAdded: 0 };
  byDate[s.date].sessions++;
  byDate[s.date].minutes += s.durationMin;
  byDate[s.date].projects.add(s.project);
  byDate[s.date].linesAdded += s.linesAdded;

  // by project
  if (!byProject[s.project]) byProject[s.project] = { sessions: 0, minutes: 0, linesAdded: 0, linesRemoved: 0 };
  byProject[s.project].sessions++;
  byProject[s.project].minutes += s.durationMin;
  byProject[s.project].linesAdded += s.linesAdded;
  byProject[s.project].linesRemoved += s.linesRemoved;

  // top files
  if (s.topFile) {
    allFiles[s.topFile] = (allFiles[s.topFile] || 0) + s.topFileAdded;
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function fmtHours(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtHoursShort(min) {
  return (min / 60).toFixed(1) + 'h';
}

const activeDays = Object.keys(byDate).length;
const sortedProjects = Object.entries(byProject)
  .sort((a, b) => b[1].minutes - a[1].minutes);

const topFiles = Object.entries(allFiles)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

// ── Output ──────────────────────────────────────────────────────

const startDateStr = dates[0];
const endDateStr = dates[dates.length - 1];

// Tweet format: compact summary for social media
if (outputFormat === 'tweet') {
  const isGhostDay = activeDays > 0 && totalSessions > 0 && !byDate[endDateStr]?.projects?.size;
  const topProject = sortedProjects[0];
  const dateLabel = isYesterday ? endDateStr : `${startDateStr}–${endDateStr}`;
  const ghostNote = (isYesterday && !byDate[endDateStr]) ? ' 👻 Ghost Day — you were away' : '';

  const tweetLines = [
    `AI Daily Report (${dateLabel})${ghostNote}`,
    ``,
    `🔄 Sessions: ${totalSessions}`,
    `⏱ Time: ${fmtHours(totalMinutes)}`,
    `📝 Lines: +${totalLinesAdded.toLocaleString()}`,
    `📁 Files: ${totalFiles}`,
  ];
  if (topProject) {
    tweetLines.push(`🎯 Top: ${topProject[0]} (${fmtHoursShort(topProject[1].minutes)})`);
  }

  const tweet = tweetLines.join('\n');
  if (tweet.length > 280) {
    // Trim to fit in 280 chars
    console.log(tweet.substring(0, 277) + '...');
  } else {
    console.log(tweet);
  }
  process.exit(0);
}

const lines = [];

lines.push(`# AI Weekly Report: ${startDateStr} – ${endDateStr}`);
lines.push('');
lines.push(`> Generated by [cc-weekly-report](https://github.com/yurukusa/cc-weekly-report) · ${new Date().toISOString().slice(0, 10)}`);
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`| Metric | Value |`);
lines.push(`|--------|-------|`);
lines.push(`| Days active | **${activeDays} / ${numDays}** |`);
lines.push(`| Total sessions | **${totalSessions}** |`);
lines.push(`| Total AI time | **${fmtHours(totalMinutes)}** |`);
lines.push(`| Lines added | **+${totalLinesAdded.toLocaleString()}** |`);
lines.push(`| Lines removed | **-${totalLinesRemoved.toLocaleString()}** |`);
lines.push(`| Files touched | **${totalFiles}** |`);
lines.push(`| CC tool calls | **${totalCCActions}** |`);
lines.push('');

lines.push('## Top Projects');
lines.push('');
lines.push('| Project | Sessions | Time | Lines added |');
lines.push('|---------|----------|------|-------------|');
for (const [project, stats] of sortedProjects.slice(0, 8)) {
  lines.push(`| \`${project}\` | ${stats.sessions} | ${fmtHoursShort(stats.minutes)} | +${stats.linesAdded.toLocaleString()} |`);
}
lines.push('');

lines.push('## Daily Breakdown');
lines.push('');
lines.push('| Date | Day | Sessions | Time | Lines | Projects |');
lines.push('|------|-----|----------|------|-------|----------|');
for (const dateStr of dates) {
  const d = byDate[dateStr];
  if (!d) {
    lines.push(`| ${dateStr} | ${dayOfWeek(dateStr)} | — | — | — | *休* |`);
    continue;
  }
  const projects = [...d.projects].join(', ');
  lines.push(`| ${dateStr} | ${dayOfWeek(dateStr)} | ${d.sessions} | ${fmtHoursShort(d.minutes)} | +${d.linesAdded.toLocaleString()} | ${projects} |`);
}
lines.push('');

if (topFiles.length > 0) {
  lines.push('## Most Edited Files');
  lines.push('');
  lines.push('| File | Lines added |');
  lines.push('|------|-------------|');
  for (const [file, added] of topFiles) {
    lines.push(`| \`${file}\` | +${added} |`);
  }
  lines.push('');
}

if (longestSession) {
  lines.push('## Notable');
  lines.push('');
  lines.push(`- **Longest session**: ${longestSession.date} ${longestSession.startTime} (${longestSession.durationMin} min) in \`${longestSession.project}\``);
  if (activeDays > 0) {
    lines.push(`- **Average daily time**: ${fmtHoursShort(Math.round(totalMinutes / activeDays))}`);
    lines.push(`- **Average sessions/day**: ${(totalSessions / activeDays).toFixed(1)}`);
  }
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push('*This report was generated automatically from proof-log files.*');
lines.push('*Add your own commentary and highlights before publishing.*');
lines.push('');

console.log(lines.join('\n'));

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
});
