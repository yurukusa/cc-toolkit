#!/usr/bin/env node
// cc-streak — How long can Claude Code go without an error?
// Measures consecutive successful tool calls between errors.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { cpus } from 'os';

const CONCURRENCY = Math.min(cpus().length, 8);
const MIN_TOOLS = 3;

// UX tools that "error" by design
const UX_TOOLS = new Set(['ExitPlanMode', 'AskUserQuestion', 'EnterPlanMode']);

function analyzeFile(text) {
  const toolMap = {};
  let streak = 0;
  const streaks = [];
  const breakers = {};
  let totalCalls = 0;
  let totalErrors = 0;

  for (const line of text.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const content = (obj.message || obj).content;
    if (!Array.isArray(content)) continue;

    for (const b of content) {
      if (b.type === 'tool_use' && b.id && b.name) {
        toolMap[b.id] = b.name;
      } else if (b.type === 'tool_result') {
        const name = toolMap[b.tool_use_id || ''] || 'unknown';
        if (UX_TOOLS.has(name)) continue;
        totalCalls++;
        if (b.is_error) {
          totalErrors++;
          if (streak > 0) streaks.push(streak);
          breakers[name] = (breakers[name] || 0) + 1;
          streak = 0;
        } else {
          streak++;
        }
      }
    }
  }
  if (streak > 0) streaks.push(streak);

  return { streaks, breakers, totalCalls, totalErrors, hasData: totalCalls >= MIN_TOOLS };
}

function mergeResults(results) {
  const merged = {
    sessions: 0,
    totalCalls: 0,
    totalErrors: 0,
    allStreaks: [],
    breakers: {},
    sessionLongest: [],
  };

  for (const r of results) {
    if (!r.hasData) continue;
    merged.sessions++;
    merged.totalCalls += r.totalCalls;
    merged.totalErrors += r.totalErrors;
    merged.allStreaks.push(...r.streaks);
    if (r.streaks.length > 0) {
      merged.sessionLongest.push(Math.max(...r.streaks));
    }
    for (const [k, v] of Object.entries(r.breakers)) {
      merged.breakers[k] = (merged.breakers[k] || 0) + v;
    }
  }

  merged.allStreaks.sort((a, b) => a - b);
  merged.sessionLongest.sort((a, b) => a - b);
  return merged;
}

function findJsonlFiles(dir) {
  const files = [];
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) files.push(...findJsonlFiles(p));
        else if (name.endsWith('.jsonl')) files.push(p);
      } catch {}
    }
  } catch {}
  return files;
}

async function processFiles(files) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < files.length) {
      const f = files[idx++];
      try { results.push(analyzeFile(readFileSync(f, 'utf8'))); } catch {}
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

function bar(n, max, width = 20) {
  const f = max > 0 ? Math.round((n / max) * width) : 0;
  return '█'.repeat(f) + '░'.repeat(width - f);
}

function pct(n, d) {
  return d > 0 ? (n / d * 100).toFixed(1) : '0.0';
}

function median(arr) {
  if (arr.length === 0) return 0;
  return arr[Math.floor(arr.length / 2)];
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  return arr[Math.floor(arr.length * p)];
}

const TIERS = [
  { name: 'micro', min: 1, max: 2, desc: '1-2 calls' },
  { name: 'short', min: 3, max: 5, desc: '3-5' },
  { name: 'medium', min: 6, max: 20, desc: '6-20' },
  { name: 'long', min: 21, max: 50, desc: '21-50' },
  { name: 'marathon', min: 51, max: 100, desc: '51-100' },
  { name: 'epic', min: 101, max: Infinity, desc: '101+' },
];

function renderOutput(m, isJson) {
  const s = m.allStreaks;
  const med = median(s);
  const mean = s.length > 0 ? (s.reduce((a, v) => a + v, 0) / s.length).toFixed(1) : '0';
  const p90 = percentile(s, 0.9);
  const p99 = percentile(s, 0.99);
  const max = s.length > 0 ? s[s.length - 1] : 0;

  const tiers = TIERS.map(t => {
    const count = s.filter(v => v >= t.min && v <= t.max).length;
    return { ...t, count, pct: +(pct(count, s.length)) };
  });

  const totalBreaks = Object.values(m.breakers).reduce((a, v) => a + v, 0);
  const breakerList = Object.entries(m.breakers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tool, count]) => ({ tool, count, pct: +(pct(count, totalBreaks)) }));

  if (isJson) {
    console.log(JSON.stringify({
      sessions: m.sessions,
      totalStreaks: s.length,
      median: med,
      mean: +mean,
      p90,
      p99,
      max,
      tiers,
      breakers: breakerList,
      perSession: {
        medianLongest: median(m.sessionLongest),
        p90Longest: percentile(m.sessionLongest, 0.9),
        maxLongest: m.sessionLongest.length > 0 ? m.sessionLongest[m.sessionLongest.length - 1] : 0,
      },
    }, null, 2));
    return;
  }

  console.log('\ncc-streak — Error-Free Streaks in Claude Code');
  console.log('='.repeat(52));
  console.log(`Sessions: ${m.sessions.toLocaleString()} | Streaks: ${s.length.toLocaleString()} | Median: ${med} | Max: ${max}`);

  console.log('\nStreak length distribution:');
  const maxTier = Math.max(...tiers.map(t => t.count));
  for (const t of tiers) {
    console.log(`  ${t.desc.padEnd(10)} ${bar(t.count, maxTier)}  ${String(t.pct).padStart(5)}%  (${t.count.toLocaleString()})`);
  }

  console.log(`\nStats: median ${med} | mean ${mean} | p90 ${p90} | p99 ${p99} | max ${max}`);

  console.log('\nStreak breakers (which tool ends the run):');
  const maxBreak = breakerList.length > 0 ? breakerList[0].count : 1;
  for (const b of breakerList) {
    console.log(`  ${b.tool.padEnd(20)} ${bar(b.count, maxBreak)}  ${String(b.pct).padStart(5)}%  (${b.count.toLocaleString()})`);
  }

  const sessMed = median(m.sessionLongest);
  const sessMax = m.sessionLongest.length > 0 ? m.sessionLongest[m.sessionLongest.length - 1] : 0;
  const sessP90 = percentile(m.sessionLongest, 0.9);
  console.log(`\nLongest streak per session: median ${sessMed} | p90 ${sessP90} | max ${sessMax}`);
  console.log('');
}

const args = process.argv.slice(2);
const isJson = args.includes('--json');

const dataDir = resolve(process.env.HOME || '~', '.claude', 'projects');
const files = findJsonlFiles(dataDir);

if (files.length === 0) {
  console.error('No .jsonl files found in ~/.claude/projects/');
  process.exit(1);
}

const rawResults = await processFiles(files);
const merged = mergeResults(rawResults);
renderOutput(merged, isJson);
