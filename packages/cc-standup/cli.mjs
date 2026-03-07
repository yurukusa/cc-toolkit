#!/usr/bin/env node

// cc-standup — AI-generated daily standup from proof-log
// Reads ~/ops/proof-log/YYYY-MM-DD.md and outputs a copy-paste-ready standup.
// Zero dependencies.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ── Config ──────────────────────────────────────────────────────

const DEFAULT_LOG_DIR = join(homedir(), 'ops', 'proof-log');

// ── CLI args ────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`cc-standup — AI-generated daily standup from proof-log

Usage:
  cc-standup                         # Yesterday's standup
  cc-standup --date 2026-02-27       # Specific date
  cc-standup --format slack          # Slack-formatted output
  cc-standup --format tweet          # Tweet-length (280 chars)
  cc-standup --format plain          # Plain text (default)

Output: Copy-paste ready standup for Slack, GitHub, or Twitter.

Options:
  --date YYYY-MM-DD   Date to report on (default: yesterday)
  --dir PATH          Proof-log directory (default: ~/ops/proof-log)
  --format FORMAT     Output format: plain, slack, tweet (default: plain)
  --version           Show version
  --help              Show this help
`);
  process.exit(0);
}

if (args.includes('--version')) {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
  console.log(pkg.version);
  process.exit(0);
}

const formatIdx = args.indexOf('--format');
const outputFormat = formatIdx >= 0 ? args[formatIdx + 1] : 'plain';

const dirIdx = args.indexOf('--dir');
const logDir = dirIdx >= 0
  ? args[dirIdx + 1].replace('~', homedir())
  : DEFAULT_LOG_DIR;

const dateIdx = args.indexOf('--date');
let targetDate;
if (dateIdx >= 0) {
  targetDate = args[dateIdx + 1];
} else {
  // Default: yesterday
  const d = new Date();
  d.setDate(d.getDate() - 1);
  targetDate = d.toISOString().slice(0, 10);
}

// ── Date helpers ────────────────────────────────────────────────

function dayOfWeek(dateStr) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(dateStr + 'T00:00:00').getDay()];
}

function fmtHours(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Proof-log parser ────────────────────────────────────────────

const SESSION_HEADER = /^### (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})-(\d{2}:\d{2}) JST/;
const WHERE_LINE     = /^- どこで: (.+)$/;
const WHO_LINE       = /^- 誰が: CC: (\d+)件/;
const WHAT_LINE      = /^- 何を: (\d+)ファイル変更 \(\+(\d+)\/-(\d+)\)/;
const DURATION_LINE  = /^- いつ: .+JST（(\d+)分）/;

function parseProofLog(content) {
  const sessions = [];
  let current = null;

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    const headerMatch = SESSION_HEADER.exec(line);
    if (headerMatch) {
      if (current) sessions.push(current);
      current = {
        date: headerMatch[1],
        durationMin: 0,
        project: null,
        ccActions: 0,
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
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
  }
  if (current) sessions.push(current);
  return sessions;
}

// ── Load and aggregate ──────────────────────────────────────────

const filePath = join(logDir, `${targetDate}.md`);
const isGhostDay = !existsSync(filePath);

const byProject = {};
let totalMinutes = 0;
let totalSessions = 0;
let totalLines = 0;
let totalFiles = 0;
let totalActions = 0;

if (!isGhostDay) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const sessions = parseProofLog(content);

    for (const s of sessions) {
      if (!s.project) continue;
      totalSessions++;
      totalMinutes += s.durationMin;
      totalLines += s.linesAdded;
      totalFiles += s.filesChanged;
      totalActions += s.ccActions;

      if (!byProject[s.project]) {
        byProject[s.project] = { minutes: 0, sessions: 0, linesAdded: 0, files: 0 };
      }
      byProject[s.project].minutes += s.durationMin;
      byProject[s.project].sessions += 1;
      byProject[s.project].linesAdded += s.linesAdded;
      byProject[s.project].files += s.filesChanged;
    }
  } catch (e) {
    // unreadable
  }
}

const sortedProjects = Object.entries(byProject)
  .sort((a, b) => b[1].minutes - a[1].minutes);

const dow = dayOfWeek(targetDate);
const label = `${targetDate} (${dow})`;

// ── Format: plain ────────────────────────────────────────────────

function formatPlain() {
  const lines = [];
  lines.push(`📋 AI Standup — ${label}`);
  lines.push('');

  if (isGhostDay || totalSessions === 0) {
    lines.push(`👻 Ghost Day — AI worked autonomously. No sessions logged.`);
    lines.push('');
  } else {
    lines.push(`✅ Yesterday's work:`);
    for (const [proj, stats] of sortedProjects) {
      const parts = [`${fmtHours(stats.minutes)}`];
      if (stats.sessions > 0) parts.push(`${stats.sessions} sessions`);
      if (stats.linesAdded > 0) parts.push(`+${stats.linesAdded.toLocaleString()} lines`);
      lines.push(`  • ${proj} — ${parts.join(' | ')}`);
    }
    lines.push('');
    const totalParts = [`${fmtHours(totalMinutes)}`, `${totalSessions} sessions`, `+${totalLines.toLocaleString()} lines`];
    if (totalFiles > 0) totalParts.push(`${totalFiles} files`);
    lines.push(`📊 Total: ${totalParts.join(' | ')}`);
    lines.push('');
  }

  if (sortedProjects.length > 0) {
    lines.push(`🔜 Continuing: ${sortedProjects.map(([p]) => p).join(', ')}`);
    lines.push('');
  }

  lines.push(`Generated by cc-standup`);
  return lines.join('\n');
}

// ── Format: slack ────────────────────────────────────────────────

function formatSlack() {
  const lines = [];
  lines.push(`*AI Standup — ${label}*`);
  lines.push('');

  if (isGhostDay || totalSessions === 0) {
    lines.push(`👻 *Ghost Day* — AI worked autonomously. No sessions logged.`);
  } else {
    lines.push(`✅ *Yesterday's work:*`);
    for (const [proj, stats] of sortedProjects) {
      const parts = [`${fmtHours(stats.minutes)}`];
      if (stats.linesAdded > 0) parts.push(`+${stats.linesAdded.toLocaleString()} lines`);
      lines.push(`• \`${proj}\` — ${parts.join(', ')}`);
    }
    lines.push('');
    lines.push(`📊 *Total:* ${fmtHours(totalMinutes)} | ${totalSessions} sessions | +${totalLines.toLocaleString()} lines`);
    if (sortedProjects.length > 0) {
      lines.push(`🔜 *Continuing:* ${sortedProjects.map(([p]) => `\`${p}\``).join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ── Format: tweet ────────────────────────────────────────────────

function formatTweet() {
  const parts = [];

  if (isGhostDay || totalSessions === 0) {
    parts.push(`AI Standup ${targetDate.slice(5)} 👻`);
    parts.push(`Ghost Day — AI ran autonomously`);
    parts.push(`#claudecode`);
  } else {
    parts.push(`AI Standup ${targetDate.slice(5)} 🤖`);
    for (const [proj, stats] of sortedProjects.slice(0, 3)) {
      parts.push(`✅ ${proj}: ${fmtHours(stats.minutes)}`);
      if (stats.linesAdded > 0) {
        parts[parts.length - 1] += ` (+${(stats.linesAdded / 1000).toFixed(1)}K lines)`;
      }
    }
    parts.push('');
    parts.push(`Total: ${fmtHours(totalMinutes)} | ${totalSessions} sessions`);
    parts.push(`#claudecode #aidev`);
  }

  const tweet = parts.join('\n');
  if (tweet.length > 280) {
    return tweet.substring(0, 277) + '...';
  }
  return tweet;
}

// ── Output ──────────────────────────────────────────────────────

let output;
switch (outputFormat) {
  case 'slack':  output = formatSlack(); break;
  case 'tweet':  output = formatTweet(); break;
  default:       output = formatPlain(); break;
}

console.log(output);

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
});
