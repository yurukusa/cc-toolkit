#!/usr/bin/env node
// cc-denied: Every Bash command your human said NO to
// Exit code 144 = user denied the tool execution in Claude Code

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const jsonFlag = process.argv.includes('--json');
const topFlag = process.argv.indexOf('--top');
const TOP_N = topFlag !== -1 ? parseInt(process.argv[topFlag + 1]) || 10 : 10;

// Category detection for denied bash commands
const CATEGORIES = [
  { name: 'pkill / kill',  kw: ['pkill', 'kill -9', 'kill -15', 'killall'] },
  { name: 'godot / game',  kw: ['/godot', 'godot --', 'godot_test'] },
  { name: 'rm / delete',   kw: ['rm -', 'rmdir', 'rm /', 'rm ~/'] },
  { name: 'git danger',    kw: ['git reset --hard', 'git push --force', 'git clean -f', 'git checkout --'] },
  { name: 'server start',  kw: ['python3 app.py', 'flask run', 'uvicorn', 'npm start', 'node server'] },
  { name: 'npm publish',   kw: ['npm publish', 'gh release', 'npx -p npm'] },
];

function categorize(cmd) {
  for (const cat of CATEGORIES) {
    if (cat.kw.some(kw => cmd.includes(kw))) return cat.name;
  }
  return 'other';
}

function getJsonlFiles(dir) {
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      const sub = join(dir, entry);
      try {
        if (statSync(sub).isDirectory()) {
          for (const f of readdirSync(sub)) {
            if (f.endsWith('.jsonl')) files.push(join(sub, f));
          }
        }
      } catch {}
    }
  } catch {}
  return files;
}

function analyze() {
  const files = getJsonlFiles(PROJECTS_DIR);

  // Pass 1: collect tool_use_id -> {name, command, sessionId}
  const toolMap = new Map();
  // Pass 2: collect denied tool_use_ids
  const deniedIds = [];
  const sessionsWithDenial = new Set();
  let totalToolResults = 0;
  let totalSessions = new Set();

  for (const f of files) {
    const sessId = basename(f, '.jsonl');
    totalSessions.add(sessId);
    let lines;
    try {
      lines = readFileSync(f, 'utf8').split('\n');
    } catch { continue; }

    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      if (obj.type === 'assistant') {
        const content = obj.message?.content;
        if (!Array.isArray(content)) continue;
        for (const item of content) {
          if (item?.type === 'tool_use' && item.name === 'Bash') {
            toolMap.set(item.id, {
              name: 'Bash',
              command: (item.input?.command || '').trim(),
              sessId,
            });
          }
        }
      } else if (obj.type === 'user') {
        const content = obj.message?.content;
        if (!Array.isArray(content)) continue;
        for (const item of content) {
          if (item?.type === 'tool_result') {
            totalToolResults++;
            const c = String(item.content || '');
            if (c.includes('Exit code 144')) {
              const tid = item.tool_use_id || 'unknown';
              deniedIds.push(tid);
              sessionsWithDenial.add(sessId);
            }
          }
        }
      }
    }
  }

  // Build denied records
  const denied = deniedIds.map(tid => {
    const info = toolMap.get(tid) || { command: '(unknown)', sessId: '?' };
    return {
      id: tid,
      command: info.command,
      sessId: info.sessId,
      category: categorize(info.command),
    };
  });

  // Count by category
  const byCat = {};
  for (const d of denied) {
    byCat[d.category] = (byCat[d.category] || 0) + 1;
  }

  // Top commands (truncated)
  const cmdCounts = {};
  for (const d of denied) {
    const key = d.command.slice(0, 80).replace(/\s+/g, ' ');
    cmdCounts[key] = (cmdCounts[key] || 0) + 1;
  }
  const topCmds = Object.entries(cmdCounts).sort((a, b) => b[1] - a[1]).slice(0, TOP_N);

  const totalDenied = denied.length;
  const denialRate = totalToolResults > 0 ? (totalDenied / totalToolResults * 100) : 0;
  const sessionDenialRate = totalSessions.size > 0 ? (sessionsWithDenial.size / totalSessions.size * 100) : 0;

  if (jsonFlag) {
    console.log(JSON.stringify({
      totalDenied,
      totalToolResults,
      denialRate: +denialRate.toFixed(3),
      totalSessions: totalSessions.size,
      sessionsWithDenial: sessionsWithDenial.size,
      sessionDenialRate: +sessionDenialRate.toFixed(1),
      byCategory: byCat,
      topCommands: topCmds.map(([cmd, count]) => ({ cmd, count })),
    }, null, 2));
    return;
  }

  // Human-readable output
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         cc-denied  —  The Human Veto Log    ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  console.log(`  Total denials:      ${totalDenied} commands rejected`);
  console.log(`  Out of:             ${totalToolResults.toLocaleString()} tool results`);
  console.log(`  Denial rate:        ${denialRate.toFixed(3)}%`);
  console.log(`  Sessions:           ${sessionsWithDenial.size} / ${totalSessions.size} had a denial (${sessionDenialRate.toFixed(1)}%)`);
  console.log(`  Denied tool:        100% Bash (you never denied Read, Edit, or Grep)`);

  console.log('\n─ By category ─────────────────────────────────\n');
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCats) {
    const pct = (count / totalDenied * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / totalDenied * 30));
    console.log(`  ${cat.padEnd(18)} ${String(count).padStart(4)}  ${pct.padStart(5)}%  ${bar}`);
  }

  console.log('\n─ Most-denied commands ─────────────────────────\n');
  for (const [cmd, count] of topCmds) {
    const label = count > 1 ? `×${count}` : '   ';
    console.log(`  ${label}  ${cmd.slice(0, 70)}`);
  }

  console.log('\n─ Insight ──────────────────────────────────────\n');
  const pkillCount = byCat['pkill / kill'] || 0;
  const rmCount = byCat['rm / delete'] || 0;
  const godotCount = byCat['godot / game'] || 0;
  if (pkillCount > 0) {
    console.log(`  ${pkillCount} process kills were stopped — you don't want CC killing things blindly.`);
  }
  if (rmCount > 0) {
    console.log(`  ${rmCount} deletion(s) were blocked — the most cautious denials in the log.`);
  }
  if (godotCount > 0) {
    console.log(`  ${godotCount} game test commands were denied — long-running Godot runs that felt risky.`);
  }
  if (totalDenied === 0) {
    console.log('  No denials found. Either total trust, or bypass-permissions mode.');
  } else {
    console.log(`\n  In ${100 - sessionDenialRate.toFixed(0)}% of sessions, you approved everything CC tried.`);
  }

  console.log('\n  Run with --json for machine-readable output.');
  console.log('  Run with --top 20 to see more commands.\n');
}

analyze();
