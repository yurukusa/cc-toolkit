#!/usr/bin/env node
// cc-turns — How many times does the user intervene per session?
// Counts user message turns to reveal "fire-and-forget" vs collaborative sessions.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { cpus } from 'os';

const CONCURRENCY = Math.min(cpus().length, 8);
const MIN_TOOLS = 3;

// Turn brackets
const BRACKETS = [
  { key: '1',     label: '1 turn    ', min: 1,  max: 1  },
  { key: '2-3',   label: '2–3 turns ', min: 2,  max: 3  },
  { key: '4-7',   label: '4–7 turns ', min: 4,  max: 7  },
  { key: '8-14',  label: '8–14 turns', min: 8,  max: 14 },
  { key: '15+',   label: '15+ turns ', min: 15, max: Infinity },
];

function bracket(n) {
  for (const b of BRACKETS) if (n >= b.min && n <= b.max) return b.key;
  return '15+';
}

// ── JSONL parsing ─────────────────────────────────────────────────
function analyzeFile(text) {
  let userTurns = 0;
  let assistantTurns = 0;
  let toolTurns = 0;
  let totalTools = 0;

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    const msg = obj.message || obj;
    const role = msg.role || obj.type;

    if (role === 'user') {
      userTurns++;
    } else if (role === 'assistant') {
      assistantTurns++;
      const content = msg.content;
      if (Array.isArray(content)) {
        const toolUses = content.filter(b => b.type === 'tool_use');
        if (toolUses.length > 0) {
          toolTurns++;
          totalTools += toolUses.length;
        }
      }
    }
  }

  return { userTurns, assistantTurns, toolTurns, totalTools };
}

function mergeResults(results) {
  const merged = {
    sessions: 0,
    bracketCounts: Object.fromEntries(BRACKETS.map(b => [b.key, 0])),
    // For correlation: per-bracket avg tools
    bracketTools: Object.fromEntries(BRACKETS.map(b => [b.key, { tools: 0, sessions: 0 }])),
    userTurnsList: [],   // for median/mean
    totalUserTurns: 0,
    totalToolCalls: 0,
    singleTurnSessions: 0,
  };
  for (const r of results) {
    if (r.totalTools < MIN_TOOLS) continue;
    merged.sessions++;
    merged.totalUserTurns += r.userTurns;
    merged.totalToolCalls += r.totalTools;
    merged.userTurnsList.push(r.userTurns);
    const bk = bracket(r.userTurns);
    merged.bracketCounts[bk]++;
    merged.bracketTools[bk].tools    += r.totalTools;
    merged.bracketTools[bk].sessions++;
    if (r.userTurns === 1) merged.singleTurnSessions++;
  }
  return merged;
}

// ── File discovery ─────────────────────────────────────────────────
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

// ── Stats helpers ──────────────────────────────────────────────────
function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * p / 100)] ?? s[s.length - 1];
}

function bar(n, max, width = 24) {
  const f = max > 0 ? Math.round((n / max) * width) : 0;
  return '█'.repeat(f) + '░'.repeat(width - f);
}

// ── Rendering ─────────────────────────────────────────────────────
function renderOutput(m) {
  const { sessions, bracketCounts, bracketTools, userTurnsList,
    totalUserTurns, singleTurnSessions } = m;

  const sorted = [...userTurnsList].sort((a, b) => a - b);
  const median = pct(sorted, 50);
  const mean   = (totalUserTurns / sessions).toFixed(1);
  const p90    = pct(sorted, 90);
  const fireRate = (singleTurnSessions / sessions * 100).toFixed(1);

  console.log('\ncc-turns — User Turn Count per Session');
  console.log('='.repeat(44));
  console.log(`Sessions: ${sessions.toLocaleString()} | ` +
    `Median: ${median} turns | Mean: ${mean} | p90: ${p90} turns`);
  console.log(`Fire-and-forget rate (1 user turn): ${fireRate}%`);

  const maxBracket = Math.max(...Object.values(bracketCounts));
  console.log('\nTurn count distribution:');
  for (const b of BRACKETS) {
    const n   = bracketCounts[b.key];
    const p   = sessions > 0 ? (n / sessions * 100).toFixed(1) : '0.0';
    const bt  = bracketTools[b.key];
    const avg = bt.sessions > 0 ? (bt.tools / bt.sessions).toFixed(1) : '—';
    console.log(
      `  ${b.label}  ${bar(n, maxBracket)}  ${n.toLocaleString().padStart(6)}  ${p.padStart(5)}%  ` +
      `avg ${avg.padStart(5)} tools`
    );
  }

  console.log('\nCorrelation (user turns → tool calls):');
  for (const b of BRACKETS) {
    const bt = bracketTools[b.key];
    if (bt.sessions === 0) continue;
    const avg = (bt.tools / bt.sessions).toFixed(1);
    console.log(`  ${b.key.padEnd(6)}  ${avg.padStart(6)} tool calls/session`);
  }
  console.log('');
}

function renderJson(m) {
  const sorted = [...m.userTurnsList].sort((a, b) => a - b);
  console.log(JSON.stringify({
    sessions: m.sessions,
    fireAndForgetRate: +(m.singleTurnSessions / m.sessions * 100).toFixed(1),
    userTurnStats: {
      median: pct(sorted, 50),
      mean:   +(m.totalUserTurns / m.sessions).toFixed(2),
      p90:    pct(sorted, 90),
      p10:    pct(sorted, 10),
    },
    bracketCounts: m.bracketCounts,
    bracketAvgTools: Object.fromEntries(
      BRACKETS.map(b => [b.key, m.bracketTools[b.key].sessions > 0
        ? +(m.bracketTools[b.key].tools / m.bracketTools[b.key].sessions).toFixed(1)
        : null])
    ),
  }, null, 2));
}

// ── CLI entry ──────────────────────────────────────────────────────
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

if (isJson) renderJson(merged);
else renderOutput(merged);
