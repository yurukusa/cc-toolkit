#!/usr/bin/env node

// cc-personality — What kind of Claude Code developer are you?
// Zero dependencies. Reads ~/.claude/projects/ session transcripts.
// Diagnoses your coding archetype from real usage patterns.

import { readdir, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ── Color helpers ──────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// ── File reading (reused from cc-session-stats) ────────────────

async function readFirstLastLine(filePath) {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead: firstBytes } = await fh.read(buf, 0, 8192, 0);
    if (firstBytes === 0) return null;
    const firstChunk = buf.toString('utf8', 0, firstBytes);
    const firstNewline = firstChunk.indexOf('\n');
    const firstLine = firstNewline >= 0 ? firstChunk.substring(0, firstNewline) : firstChunk;

    const fileStat = await fh.stat();
    const fileSize = fileStat.size;
    if (fileSize < 2) return { firstLine, lastLine: firstLine };

    const readSize = Math.min(65536, fileSize);
    const tailBuf = Buffer.alloc(readSize);
    const { bytesRead: tailBytes } = await fh.read(tailBuf, 0, readSize, fileSize - readSize);
    const tailChunk = tailBuf.toString('utf8', 0, tailBytes);
    const lines = tailChunk.split('\n').filter(l => l.trim());
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

// ── Scan sessions ──────────────────────────────────────────────

const SESSION_GAP_HOURS = 0.5;

async function scanSessions(claudeDir) {
  const projectsDir = join(claudeDir, 'projects');
  const sessions = [];

  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return sessions;
  }

  for (const proj of projectDirs) {
    const projPath = join(projectsDir, proj);
    let files;
    try {
      files = await readdir(projPath);
    } catch { continue; }

    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    for (const file of jsonlFiles) {
      const filePath = join(projPath, file);
      try {
        const lines = await readFirstLastLine(filePath);
        if (!lines) continue;
        const start = parseTimestamp(lines.firstLine);
        const end = parseTimestamp(lines.lastLine);
        if (!start) continue;
        const endTime = end || start;

        const fileStat = await stat(filePath);
        // Split into sub-sessions if gap > SESSION_GAP_HOURS
        const durationHours = (endTime - start) / 3600000;
        if (durationHours < SESSION_GAP_HOURS * 2) {
          sessions.push({ start, end: endTime, hours: Math.max(durationHours, 0.01) });
        } else {
          // Estimate sub-sessions
          const numSubs = Math.max(1, Math.ceil(durationHours / 2));
          for (let i = 0; i < numSubs; i++) {
            const subStart = new Date(start.getTime() + (i / numSubs) * (endTime - start));
            sessions.push({ start: subStart, end: subStart, hours: durationHours / numSubs });
          }
        }
      } catch { continue; }
    }
  }

  return sessions;
}

// ── Personality archetypes ─────────────────────────────────────

const ARCHETYPES = [
  {
    id: 'night_beast',
    name: '🌙 The Midnight Beast',
    jp: '深夜の怪物',
    tagline: '"The compiler doesn\'t sleep, and neither do I."',
    condition: (s) => s.nightPct >= 0.30,
    description: 'Your code runs on moonlight and caffeine. Peak hours: 0-5 AM.',
  },
  {
    id: 'dawn_coder',
    name: '🌅 The Dawn Coder',
    jp: '夜明けのコーダー',
    tagline: '"Fresh mind, fresh commits."',
    condition: (s) => s.morningPct >= 0.40,
    description: 'You code when the world sleeps. Clear mind, elegant solutions.',
  },
  {
    id: 'machine',
    name: '🤖 The Unstoppable Machine',
    jp: '不滅の機械',
    tagline: '"Rest days are a human concept."',
    condition: (s) => s.maxStreak >= 30,
    description: 'Consecutive days without a break. You simply don\'t stop.',
  },
  {
    id: 'weekend_warrior',
    name: '⚔️ The Weekend Warrior',
    jp: '週末の戦士',
    tagline: '"Monday to Friday is warmup."',
    condition: (s) => s.weekendRatio >= 1.8,
    description: 'Saturday and Sunday are your real working days.',
  },
  {
    id: 'burst_genius',
    name: '⚡ The Burst Genius',
    jp: 'バースト型天才',
    tagline: '"I do nothing for days, then ship everything at once."',
    condition: (s) => s.activeDays > 0 && (s.totalDays / s.activeDays) >= 2.5,
    description: 'Irregular patterns. Long silences. Then explosive productivity.',
  },
  {
    id: 'disciplined',
    name: '📐 The Disciplined Architect',
    jp: '規律の申し子',
    tagline: '"Consistency beats intensity."',
    condition: (s) => s.activeDays > 0 && (s.totalDays / s.activeDays) < 1.3 && s.totalHours / s.activeDays < 6,
    description: 'Steady pace every day. You finish what you start.',
  },
  {
    id: 'session_monster',
    name: '🔥 The Session Monster',
    jp: 'セッション怪獣',
    tagline: '"One more context window..."',
    condition: (s) => s.avgSessionHours >= 2.5,
    description: 'Long, deep sessions. You go down the rabbit hole and don\'t come back.',
  },
  {
    id: 'micro_shipper',
    name: '📦 The Micro-Shipper',
    jp: '超高速出荷者',
    tagline: '"Ship small, ship often."',
    condition: (s) => s.totalSessions / s.activeDays >= 15,
    description: 'Dozens of sessions per day. Fast, iterative, relentless.',
  },
  {
    id: 'explorer',
    name: '🗺️ The Code Explorer',
    jp: 'コード探検家',
    tagline: '"Every project is a new world."',
    condition: (s) => s.projectCount >= 20,
    description: 'Many projects, curious mind. You explore, you don\'t settle.',
  },
  {
    id: 'mono_focused',
    name: '🎯 The Mono-Focused',
    jp: 'モノフォーカスの匠',
    tagline: '"One project. Total mastery."',
    condition: (s) => s.projectCount <= 3 && s.totalSessions >= 100,
    description: 'Deep obsession with one thing. Mastery over breadth.',
  },
];

// ── Compute stats ─────────────────────────────────────────────

function computeStats(sessions) {
  if (sessions.length === 0) return null;

  const totalSessions = sessions.length;
  const totalHours = sessions.reduce((s, x) => s + x.hours, 0);

  // Hour distribution
  const hourBuckets = new Array(24).fill(0);
  for (const s of sessions) {
    hourBuckets[s.start.getHours()]++;
  }
  const nightPct = (hourBuckets.slice(0, 5).reduce((a, b) => a + b, 0) +
    hourBuckets.slice(22).reduce((a, b) => a + b, 0)) / totalSessions;
  const morningPct = hourBuckets.slice(5, 9).reduce((a, b) => a + b, 0) / totalSessions;
  const afternoonPct = hourBuckets.slice(9, 17).reduce((a, b) => a + b, 0) / totalSessions;
  const eveningPct = hourBuckets.slice(17, 22).reduce((a, b) => a + b, 0) / totalSessions;

  // Day distribution
  const dayBuckets = new Array(7).fill(0); // 0=Sun
  for (const s of sessions) {
    dayBuckets[s.start.getDay()]++;
  }
  const weekdayTotal = dayBuckets.slice(1, 6).reduce((a, b) => a + b, 0) / 5;
  const weekendTotal = (dayBuckets[0] + dayBuckets[6]) / 2;
  const weekendRatio = weekdayTotal > 0 ? weekendTotal / weekdayTotal : 0;

  // Active days & streak
  const daySet = new Set(sessions.map(s => s.start.toDateString()));
  const activeDays = daySet.size;
  const allDates = [...daySet].map(d => new Date(d)).sort((a, b) => a - b);
  const firstDate = allDates[0];
  const lastDate = allDates[allDates.length - 1];
  const totalDays = Math.ceil((lastDate - firstDate) / 86400000) + 1;

  let maxStreak = 1, curStreak = 1;
  for (let i = 1; i < allDates.length; i++) {
    const diff = (allDates[i] - allDates[i - 1]) / 86400000;
    if (diff === 1) {
      curStreak++;
      if (curStreak > maxStreak) maxStreak = curStreak;
    } else {
      curStreak = 1;
    }
  }

  const avgSessionHours = totalHours / totalSessions;

  return {
    totalSessions,
    totalHours,
    activeDays,
    totalDays,
    maxStreak,
    nightPct,
    morningPct,
    afternoonPct,
    eveningPct,
    weekendRatio,
    avgSessionHours,
    hourBuckets,
    dayBuckets,
    projectCount: 0, // filled later
    peakHour: hourBuckets.indexOf(Math.max(...hourBuckets)),
  };
}

// ── Determine archetype ───────────────────────────────────────

function getArchetype(stats) {
  // Machine check needs maxStreak
  const machineArchetype = {
    id: 'machine',
    name: '🤖 The Unstoppable Machine',
    jp: '不滅の機械',
    tagline: '"Rest days are a human concept."',
    condition: (s) => s.maxStreak >= 30,
    description: `${stats.maxStreak} consecutive days of coding. You simply don't stop.`,
  };

  const allArchetypes = ARCHETYPES.map(a =>
    a.id === 'machine' ? machineArchetype : a
  );

  for (const archetype of allArchetypes) {
    if (archetype.condition(stats)) {
      return archetype;
    }
  }

  // Default
  return {
    id: 'balanced',
    name: '⚖️ The Balanced Developer',
    jp: 'バランス型開発者',
    tagline: '"Sustainable velocity wins the race."',
    description: 'You code consistently without burning out. Rare and admirable.',
  };
}

// ── Render ────────────────────────────────────────────────────

function renderHourBar(buckets, peakHour) {
  const max = Math.max(...buckets);
  if (max === 0) return '';
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  return buckets.map((v, h) => {
    const level = Math.round((v / max) * 7);
    const block = blocks[level];
    if (h === peakHour) return `${C.yellow}${block}${C.reset}`;
    if (h >= 0 && h <= 4) return `${C.dim}${block}${C.reset}`;
    return block;
  }).join('');
}

function pct(n) { return `${Math.round(n * 100)}%`; }

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const jsonMode = process.argv.includes('--json');
  const claudeDir = join(homedir(), '.claude');

  if (!jsonMode) process.stdout.write(`${C.dim}Scanning your Claude Code sessions...${C.reset}\n`);

  const sessions = await scanSessions(claudeDir);

  if (sessions.length === 0) {
    console.log(`\n${C.red}No Claude Code sessions found.${C.reset}`);
    console.log('Make sure you have sessions in ~/.claude/projects/');
    process.exit(1);
  }

  // Count projects
  let projectCount = 0;
  try {
    const projectsDir = join(claudeDir, 'projects');
    const dirs = await readdir(projectsDir);
    projectCount = dirs.length;
  } catch {}

  const stats = computeStats(sessions);
  stats.projectCount = projectCount;

  const archetype = getArchetype(stats);

  // JSON output mode
  if (jsonMode) {
    const output = {
      version: '1.0',
      archetype: archetype.id,
      archetypeName: archetype.name,
      archetypeJp: archetype.jp || '',
      tagline: archetype.tagline || '',
      description: archetype.description || '',
      stats: {
        totalHours: Math.round(stats.totalHours * 10) / 10,
        totalSessions: stats.totalSessions,
        activeDays: stats.activeDays,
        maxStreak: stats.maxStreak,
        avgSessionMinutes: Math.round(stats.avgSessionHours * 60),
        nightPct: Math.round(stats.nightPct * 100),
        morningPct: Math.round(stats.morningPct * 100),
        afternoonPct: Math.round(stats.afternoonPct * 100),
        eveningPct: Math.round(stats.eveningPct * 100),
        weekendRatio: Math.round(stats.weekendRatio * 10) / 10,
        projectCount: stats.projectCount,
      },
      hourBuckets: stats.hourBuckets,
      peakHour: stats.peakHour,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Render
  const width = 52;
  const border = '═'.repeat(width);

  console.log(`\n${C.bold}${C.cyan}╔${border}╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║${C.reset}${C.bold}  YOUR CLAUDE CODE DEVELOPER ARCHETYPE        ${C.cyan}║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚${border}╝${C.reset}`);

  console.log(`\n  ${C.bold}${C.yellow}${archetype.name}${C.reset}`);
  if (archetype.jp) {
    console.log(`  ${C.dim}「${archetype.jp}」${C.reset}`);
  }
  console.log(`\n  ${C.cyan}${archetype.tagline || ''}${C.reset}`);
  console.log(`\n  ${archetype.description || ''}`);

  // Stats summary
  console.log(`\n${C.dim}${'─'.repeat(width + 2)}${C.reset}`);
  console.log(`  ${C.bold}Your data:${C.reset}`);
  console.log(`  ⏱  ${stats.totalHours.toFixed(0)}h total  •  ${stats.totalSessions} sessions  •  ${stats.activeDays} active days`);
  console.log(`  🔥 Longest streak: ${stats.maxStreak} days`);
  console.log(`  📊 Avg session: ${(stats.avgSessionHours * 60).toFixed(0)} min`);

  // Hour heatmap
  console.log(`\n  Activity by hour (0h → 23h):`);
  console.log(`  ${renderHourBar(stats.hourBuckets, stats.peakHour)}`);
  console.log(`  ${C.dim}0        6       12       18      23${C.reset}`);

  // Time-of-day breakdown
  const timeLabel =
    stats.nightPct >= 0.25 ? `${C.blue}🌙 Night owl (${pct(stats.nightPct)} night sessions)${C.reset}` :
    stats.morningPct >= 0.30 ? `${C.yellow}🌅 Early bird (${pct(stats.morningPct)} morning sessions)${C.reset}` :
    stats.eveningPct >= 0.40 ? `${C.magenta}🌆 Evening coder (${pct(stats.eveningPct)} evening)${C.reset}` :
    `${C.green}☀️ Day coder (${pct(stats.afternoonPct)} afternoon)${C.reset}`;
  console.log(`\n  ${timeLabel}`);

  // Weekend info
  if (stats.weekendRatio >= 1.5) {
    console.log(`  ⚔️  Weekend warrior (${stats.weekendRatio.toFixed(1)}x weekend activity)`);
  }

  // Share prompt
  const shareText = encodeURIComponent(
    `My Claude Code archetype: ${archetype.name} (${archetype.jp})\n` +
    `${stats.totalHours.toFixed(0)}h • ${stats.totalSessions} sessions • ${stats.maxStreak}-day streak\n` +
    `What's yours? npx cc-personality\n#claudecode`
  );

  console.log(`\n${C.dim}${'─'.repeat(width + 2)}${C.reset}`);
  console.log(`  ${C.bold}Share your archetype:${C.reset}`);
  console.log(`  ${C.dim}https://x.com/intent/tweet?text=${shareText.substring(0, 80)}...${C.reset}`);
  console.log(`\n  Full stats: ${C.cyan}npx cc-session-stats${C.reset}`);
  console.log(`  GitHub: ${C.cyan}https://github.com/yurukusa/cc-personality${C.reset}\n`);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
