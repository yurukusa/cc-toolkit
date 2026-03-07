#!/usr/bin/env node

// cc-agent-load — See how much of your Claude Code time is YOU vs AI subagents.
// Zero dependencies. Reads ~/.claude/projects/ session transcripts.

import { readdir, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m',
};

function bar(pct, width = 24, char = '█') {
  const filled = Math.round(pct * width);
  return char.repeat(filled) + '░'.repeat(width - filled);
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

async function addSession(filePath, project, bucket) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat || fileStat.size < 50) return;
  try {
    const result = await readFirstLastLine(filePath);
    if (!result) return;
    const start = parseTimestamp(result.firstLine);
    const end = parseTimestamp(result.lastLine);
    if (start && end) {
      const durationMs = end - start;
      if (durationMs >= 0 && durationMs < 7 * 24 * 60 * 60 * 1000) {
        const h = durationMs / (1000 * 60 * 60);
        bucket.hours += h;
        bucket.count++;
        // Track by project
        if (!bucket.byProject[project]) bucket.byProject[project] = 0;
        bucket.byProject[project] += h;
        // Track by date (for Ghost Days)
        const day = start.toLocaleDateString('en-CA'); // YYYY-MM-DD
        if (!bucket.byDate[day]) bucket.byDate[day] = 0;
        bucket.byDate[day] += h;
      }
    }
  } catch {}
}

async function scan() {
  const claudeDir = join(homedir(), '.claude');
  const projectsDir = join(claudeDir, 'projects');

  const main = { hours: 0, count: 0, byProject: {}, byDate: {} };
  const sub = { hours: 0, count: 0, byProject: {}, byDate: {} };

  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return { main, sub };
  }

  for (const projDir of projectDirs) {
    const projPath = join(projectsDir, projDir);
    const projStat = await stat(projPath).catch(() => null);
    if (!projStat?.isDirectory()) continue;

    const files = await readdir(projPath).catch(() => []);
    const project = cleanProjectName(projDir);

    for (const file of files) {
      if (file.endsWith('.jsonl')) {
        await addSession(join(projPath, file), project, main);
      }
    }

    for (const file of files) {
      const subPath = join(projPath, file, 'subagents');
      const subStat = await stat(subPath).catch(() => null);
      if (!subStat?.isDirectory()) continue;
      const subFiles = await readdir(subPath).catch(() => []);
      for (const sf of subFiles) {
        if (sf.endsWith('.jsonl')) {
          await addSession(join(subPath, sf), project, sub);
        }
      }
    }
  }

  return { main, sub };
}

const jsonMode = process.argv.includes('--json');

if (!jsonMode) process.stdout.write(`  ${C.dim}Analyzing...${C.reset}\r`);

const { main, sub } = await scan();

// Ghost Days: dates where AI worked but you didn't
const allDates = new Set([...Object.keys(main.byDate), ...Object.keys(sub.byDate)]);
const ghostDaysList = [];
for (const date of allDates) {
  const mainH = main.byDate[date] || 0;
  const subH = sub.byDate[date] || 0;
  if (mainH === 0 && subH > 0) ghostDaysList.push({ date, hours: subH });
}
ghostDaysList.sort((a, b) => b.hours - a.hours);
const ghostHours = ghostDaysList.reduce((s, d) => s + d.hours, 0);
const longestGhostDay = ghostDaysList[0] || null;

const total = main.hours + sub.hours;
const mainPct = total > 0 ? main.hours / total : 0;
const subPct = total > 0 ? sub.hours / total : 0;
const autonomyRatio = main.hours > 0 ? sub.hours / main.hours : 0;

// Top projects (combined)
const allProjects = {};
for (const [p, h] of Object.entries(main.byProject)) {
  if (!allProjects[p]) allProjects[p] = { main: 0, sub: 0 };
  allProjects[p].main += h;
}
for (const [p, h] of Object.entries(sub.byProject)) {
  if (!allProjects[p]) allProjects[p] = { main: 0, sub: 0 };
  allProjects[p].sub += h;
}
const topProjects = Object.entries(allProjects)
  .map(([name, v]) => ({ name, total: v.main + v.sub, main: v.main, sub: v.sub }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 6);

// Merged byDate for calendar view
const calendarData = {};
for (const date of allDates) {
  calendarData[date] = {
    main: Math.round((main.byDate[date] || 0) * 100) / 100,
    sub: Math.round((sub.byDate[date] || 0) * 100) / 100,
  };
}

if (jsonMode) {
  console.log(JSON.stringify({
    version: '1.2',
    totalHours: total,
    mainHours: main.hours,
    subagentHours: sub.hours,
    mainSessions: main.count,
    subagentSessions: sub.count,
    autonomyRatio: Math.round(autonomyRatio * 100) / 100,
    mainPct: Math.round(mainPct * 100),
    subPct: Math.round(subPct * 100),
    topProjects,
    ghostDays: ghostDaysList.length,
    ghostHours: Math.round(ghostHours * 10) / 10,
    longestGhostDay: longestGhostDay ? { date: longestGhostDay.date, hours: Math.round(longestGhostDay.hours * 10) / 10 } : null,
    byDate: calendarData,
  }, null, 2));
  process.exit(0);
}

const verdict = autonomyRatio >= 2
  ? `${C.magenta}Your AI is working harder than you.${C.reset}`
  : autonomyRatio >= 1
  ? `${C.yellow}Your AI matches your pace.${C.reset}`
  : autonomyRatio >= 0.5
  ? `${C.cyan}You're in the driver's seat.${C.reset}`
  : `${C.green}You're driving manually.${C.reset}`;

console.log();
console.log(`  ${C.bold}${C.cyan}cc-agent-load${C.reset}`);
console.log(`  ${'═'.repeat(45)}`);
console.log(`  ${C.dim}Scanning: ~/.claude/projects/${C.reset}`);
console.log();
console.log(`  ${C.bold}▸ Your Time vs AI Time${C.reset}`);
console.log();
console.log(`  ${C.cyan}You ${C.reset}  ${bar(mainPct)}  ${main.hours.toFixed(1)}h (${Math.round(mainPct * 100)}%)  ${main.count} sessions`);
console.log(`  ${C.yellow}AI  ${C.reset}  ${bar(subPct)}  ${sub.hours.toFixed(1)}h (${Math.round(subPct * 100)}%)  ${sub.count} sessions`);
console.log();
console.log(`  ${C.bold}▸ AI Autonomy Ratio${C.reset}`);

const ratioStr = autonomyRatio.toFixed(1) + 'x';
const ratioBar = '█'.repeat(Math.min(Math.round(autonomyRatio * 4), 24));
console.log(`  ${C.yellow}${ratioBar}${C.reset} ${C.bold}${ratioStr}${C.reset}  — AI ran ${ratioStr} longer than you`);
console.log();
console.log(`  ${verdict}`);

if (topProjects.length > 0) {
  console.log();
  console.log(`  ${C.bold}▸ Top Projects (AI load)${C.reset}`);
  const maxH = topProjects[0].total;
  for (const p of topProjects) {
    const name = p.name.padEnd(20).substring(0, 20);
    const subRatio = p.total > 0 ? p.sub / p.total : 0;
    const subBar = '█'.repeat(Math.round(subRatio * 12));
    const mainBar = '░'.repeat(12 - Math.round(subRatio * 12));
    console.log(`  ${C.dim}${name}${C.reset}  ${C.yellow}${subBar}${C.dim}${mainBar}${C.reset}  ${p.total.toFixed(1)}h total`);
  }
}

if (ghostDaysList.length > 0) {
  console.log();
  console.log(`  ${C.bold}▸ Ghost Days${C.reset}  ${C.dim}(AI worked, you didn't)${C.reset}`);
  console.log();
  console.log(`  ${C.yellow}${ghostDaysList.length} days${C.reset}  AI ran without you  —  ${C.yellow}${ghostHours.toFixed(1)}h total${C.reset}`);
  if (longestGhostDay) {
    console.log(`  ${C.dim}Longest: ${longestGhostDay.date} (${longestGhostDay.hours.toFixed(1)}h)${C.reset}`);
  }
  if (ghostDaysList.length <= 5) {
    for (const d of ghostDaysList) {
      console.log(`  ${C.dim}  ${d.date}  ${d.hours.toFixed(1)}h${C.reset}`);
    }
  } else {
    for (const d of ghostDaysList.slice(0, 3)) {
      console.log(`  ${C.dim}  ${d.date}  ${d.hours.toFixed(1)}h${C.reset}`);
    }
    console.log(`  ${C.dim}  ... and ${ghostDaysList.length - 3} more${C.reset}`);
  }
}

console.log();
console.log(`  ${C.dim}── Activity Calendar ──${C.reset}`);
console.log(`  ${C.dim}GitHub-style heatmap: your sessions vs AI sessions, day by day${C.reset}`);
console.log(`  ${C.dim}Ghost Days shown in purple.${C.reset}`);
console.log(`  ${C.cyan}  https://yurukusa.github.io/cc-agent-load/${C.reset}`);
console.log();
console.log(`  ${C.dim}── Share ──${C.reset}`);
console.log(`  ${C.dim}My Claude Code AI load: ${Math.round(subPct * 100)}% subagent / ${Math.round(mainPct * 100)}% me — ${autonomyRatio.toFixed(1)}x autonomy ratio${C.reset}`);
console.log(`  ${C.dim}npx cc-agent-load  #ClaudeCode #AIAutonomy${C.reset}`);
console.log();
