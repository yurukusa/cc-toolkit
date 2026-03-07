#!/usr/bin/env node
/**
 * cc-daily-report — AI activity report for a specific day
 * Shows what your AI accomplished, reads cc-agent-load for data.
 * If ~/ops/proof-log/YYYY-MM-DD.md exists, enriches with project breakdown.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const HOME = homedir();

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const helpFlag = args.includes('--help') || args.includes('-h');
const jsonFlag = args.includes('--json');
const tweetFlag = args.includes('--tweet');
const dateArg = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));

if (helpFlag) {
  console.log(`
  cc-daily-report — AI activity report for a specific day

  Usage:
    cc-daily-report [date] [options]

  Arguments:
    date          YYYY-MM-DD format. Defaults to yesterday.

  Options:
    --tweet       Print only the tweet-ready text
    --json        Print raw JSON data
    --help        Show this help

  Examples:
    cc-daily-report
    cc-daily-report 2026-02-09
    cc-daily-report 2026-02-09 --tweet
  `);
  process.exit(0);
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const targetDate = dateArg || yesterday();

// ── Load cc-agent-load data ──────────────────────────────────────────────────
function loadAgentLoad() {
  const paths = [
    ['cc-agent-load', ['--json']],
    [join(HOME, 'bin', 'cc-agent-load'), ['--json']],
  ];
  for (const [cmd, args] of paths) {
    try {
      const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 30000 });
      const json = JSON.parse(out);
      if (json.byDate) return json;
    } catch {}
  }
  return null;
}

// ── Parse proof-log for project breakdown ────────────────────────────────────
function parseProofLog(date) {
  const logPath = join(HOME, 'ops', 'proof-log', `${date}.md`);
  if (!existsSync(logPath)) return null;

  const content = readFileSync(logPath, 'utf8');
  const projects = new Map(); // project → {sessions, files, lines}
  const sessionBlocks = content.split(/### \d{4}-\d{2}-\d{2} /);

  for (const block of sessionBlocks) {
    const projMatch = block.match(/どこで: (.+)/);
    if (!projMatch) continue;
    const project = projMatch[1].trim();

    const filesMatch = block.match(/(\d+)ファイル変更 \(\+(\d+)\/-(\d+)\)/);
    const toolsMatch = block.match(/CC: (\d+)件/);

    const files = filesMatch ? parseInt(filesMatch[1]) : 0;
    const lines = filesMatch ? parseInt(filesMatch[2]) + parseInt(filesMatch[3]) : 0;
    const tools = toolsMatch ? parseInt(toolsMatch[1]) : 0;

    if (!projects.has(project)) {
      projects.set(project, { sessions: 0, files: 0, lines: 0, tools: 0 });
    }
    const p = projects.get(project);
    p.sessions++;
    p.files += files;
    p.lines += lines;
    p.tools += tools;
  }

  return projects.size > 0 ? projects : null;
}

// ── Scan ~/.claude/projects/ for active projects on a date ───────────────────
function scanProjectsForDate(date) {
  const projectsDir = join(HOME, '.claude', 'projects');
  if (!existsSync(projectsDir)) return [];

  const projects = new Set();
  const datePrefix = date.replace(/-/g, '');

  try {
    const dirs = readdirSync(projectsDir);
    for (const dir of dirs) {
      const dirPath = join(projectsDir, dir);
      try {
        const stat = statSync(dirPath);
        if (!stat.isDirectory()) continue;

        // Check if any JSONL files were modified on the target date
        const files = readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          try {
            const fileStat = statSync(join(dirPath, file));
            const fileDate = fileStat.mtime.toISOString().slice(0, 10);
            if (fileDate === date) {
              // Extract project name from directory path
              // e.g. -home-namakusa-projects-cc-loop → cc-loop
              // e.g. -home-namakusa → skip (home dir, not meaningful)
              const parts = dir.split('-projects-');
              if (parts.length > 1) {
                const name = parts[parts.length - 1];
                projects.add(name);
              }
              break;
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}

  return [...projects];
}

// ── Generate tweet text ───────────────────────────────────────────────────────
function generateTweet(date, dayData, projects, isGhostDay) {
  if (!isGhostDay) {
    return null; // No tweet for non-Ghost Days
  }

  const subH = dayData.sub.toFixed(1);
  const mainH = dayData.main.toFixed(1);
  const dateShort = date.slice(5).replace('-', '/'); // MM/DD

  let projText = '';
  if (projects && projects.length > 0) {
    const topProjects = projects.slice(0, 3);
    projText = `\nプロジェクト: ${topProjects.join(', ')}`;
  }

  const lines = [
    `👻 ${dateShort} のAI活動ログ`,
    ``,
    `私: ${mainH}h（不在）`,
    `AI: ${subH}h（自律稼働）`,
    projText || null,
    ``,
    `#ClaudeCode #GhostDay #AI自律稼働`,
  ].filter(l => l !== null);

  return lines.join('\n').trim();
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
  ghost: '\x1b[93m\x1b[1m',
  gray: '\x1b[90m',
};

// ── Main ──────────────────────────────────────────────────────────────────────
const agentData = loadAgentLoad();

if (!agentData) {
  console.error('Error: Could not load cc-agent-load data.');
  console.error('Make sure cc-agent-load is installed: npm i -g cc-agent-load');
  process.exit(1);
}

const dayData = agentData.byDate?.[targetDate];

if (!dayData) {
  if (jsonFlag) {
    console.log(JSON.stringify({ date: targetDate, found: false }, null, 2));
  } else {
    console.log(`No Claude Code activity found for ${targetDate}.`);
  }
  process.exit(0);
}

const isGhostDay = dayData.main === 0 && dayData.sub > 0;
const isBothActive = dayData.main > 0 && dayData.sub > 0;
const isYouOnly = dayData.main > 0 && dayData.sub === 0;

// Try proof-log first, then scan .claude/projects/
let proofProjects = parseProofLog(targetDate);
let scannedProjects = null;

if (!proofProjects) {
  const names = scanProjectsForDate(targetDate);
  if (names.length > 0) scannedProjects = names;
}

// Build project list for display
let projectList = [];
if (proofProjects) {
  // Rich data from proof-log
  for (const [name, stats] of proofProjects.entries()) {
    projectList.push({ name, ...stats, source: 'proof-log' });
  }
  projectList.sort((a, b) => b.files - a.files);
} else if (scannedProjects) {
  projectList = scannedProjects.map(name => ({ name, source: 'scan' }));
}

const projectNames = projectList.map(p => p.name);
const tweet = generateTweet(targetDate, dayData, projectNames, isGhostDay);

// ── JSON output ───────────────────────────────────────────────────────────────
if (jsonFlag) {
  console.log(JSON.stringify({
    date: targetDate,
    main: dayData.main,
    sub: dayData.sub,
    isGhostDay,
    isBothActive,
    isYouOnly,
    projects: projectList,
    tweet,
  }, null, 2));
  process.exit(0);
}

// ── Tweet-only output ─────────────────────────────────────────────────────────
if (tweetFlag) {
  if (!tweet) {
    console.log(`Not a Ghost Day (${targetDate}). No tweet generated.`);
    console.log(`You: ${dayData.main.toFixed(1)}h  AI: ${dayData.sub.toFixed(1)}h`);
  } else {
    console.log(tweet);
  }
  process.exit(0);
}

// ── Full terminal output ──────────────────────────────────────────────────────
const statusColor = isGhostDay ? C.ghost : isBothActive ? C.cyan : C.green;
const statusLabel = isGhostDay ? '👻 Ghost Day' : isBothActive ? '🤝 Both Active' : '👤 You Only';

console.log('');
console.log(`  ${C.bold}cc-daily-report${C.reset}  —  ${C.yellow}${targetDate}${C.reset}`);
console.log(`  ${'─'.repeat(48)}`);
console.log('');
console.log(`  Status: ${statusColor}${statusLabel}${C.reset}`);
console.log('');
console.log(`  ${C.cyan}You${C.reset}  ${bar(dayData.main, 8)}  ${dayData.main.toFixed(1)}h`);
console.log(`  ${C.yellow}AI ${C.reset}  ${bar(dayData.sub, 8)}  ${dayData.sub.toFixed(1)}h`);

if (projectList.length > 0) {
  console.log('');
  console.log(`  Projects:`);
  for (const p of projectList) {
    if (p.source === 'proof-log') {
      console.log(`  ${C.dim}▸${C.reset} ${C.bold}${p.name}${C.reset}  ${C.gray}${p.sessions} sessions, ${p.files} files${C.reset}`);
    } else {
      console.log(`  ${C.dim}▸${C.reset} ${p.name}`);
    }
  }
}

if (tweet) {
  console.log('');
  console.log(`  ${C.dim}── Tweet-ready text ──────────────────────${C.reset}`);
  for (const line of tweet.split('\n')) {
    console.log(`  ${line}`);
  }
  const len = [...tweet].length;
  const twitterLen = tweet.replace(/https?:\/\/\S+/g, '                       ').length;
  const lenColor = twitterLen <= 250 ? C.green : twitterLen <= 280 ? C.yellow : C.red;
  console.log('');
  console.log(`  ${C.dim}${len} chars (Twitter ~${twitterLen})${C.reset}  ${lenColor}${twitterLen <= 280 ? '✓ within limit' : '✗ too long'}${C.reset}`);
}

console.log('');

// ── Helpers ───────────────────────────────────────────────────────────────────
function bar(hours, max) {
  const filled = Math.min(Math.round((hours / Math.max(max, 0.1)) * 20), 20);
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}
