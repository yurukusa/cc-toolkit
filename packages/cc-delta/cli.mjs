#!/usr/bin/env node
// cc-delta — How big are Claude's edits?
// Analyzes old_string/new_string lengths from Edit tool calls to reveal
// surgical vs massive edit distribution across Claude Code sessions.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { cpus } from 'os';

const CONCURRENCY = Math.min(cpus().length, 8);
const MIN_EDITS = 3;

// Size tiers (based on old_string length in chars)
const TIERS = [
  { key: 'micro',    label: 'micro   (<20)',   min: 0,    max: 19   },
  { key: 'surgical', label: 'surgical(20-99)',  min: 20,   max: 99   },
  { key: 'moderate', label: 'moderate(100-499)',min: 100,  max: 499  },
  { key: 'large',    label: 'large  (500-1999)',min: 500,  max: 1999 },
  { key: 'massive',  label: 'massive(2000+)',   min: 2000, max: Infinity },
];

function getTier(len) {
  for (const t of TIERS) if (len >= t.min && len <= t.max) return t.key;
  return 'massive';
}

function extOf(fp) {
  if (!fp) return 'unknown';
  const m = fp.match(/\.([^./]+)$/);
  return m ? m[1].toLowerCase() : 'noext';
}

// ── JSONL parsing ─────────────────────────────────────────────────
function analyzeFile(text) {
  const tierCounts = Object.fromEntries(TIERS.map(t => [t.key, 0]));
  const extMap = {};      // ext → { count, oldTotal, newTotal }
  const ratios = [];      // newLen/oldLen per edit (when oldLen > 0)
  let totalEdits = 0;
  let totalOld = 0, totalNew = 0;

  for (const line of text.split('\n')) {
    if (!line.includes('"Edit"')) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const content = (obj.message || obj).content;
    if (!Array.isArray(content)) continue;

    for (const b of content) {
      if (b.type !== 'tool_use' || b.name !== 'Edit' || !b.input) continue;
      const oldLen = (b.input.old_string || '').length;
      const newLen = (b.input.new_string || '').length;
      if (oldLen === 0 && newLen === 0) continue;

      totalEdits++;
      totalOld += oldLen;
      totalNew += newLen;
      tierCounts[getTier(oldLen)]++;

      const ext = extOf(b.input.file_path || '');
      if (!extMap[ext]) extMap[ext] = { count: 0, oldTotal: 0, newTotal: 0 };
      extMap[ext].count++;
      extMap[ext].oldTotal += oldLen;
      extMap[ext].newTotal += newLen;

      if (oldLen > 0) ratios.push(newLen / oldLen);
    }
  }

  return { tierCounts, extMap, ratios, totalEdits, totalOld, totalNew };
}

function mergeResults(results) {
  const merged = {
    tierCounts: Object.fromEntries(TIERS.map(t => [t.key, 0])),
    extMap: {},
    ratios: [],
    totalEdits: 0,
    totalOld: 0,
    totalNew: 0,
    sessions: 0,
  };
  for (const r of results) {
    if (r.totalEdits < MIN_EDITS) continue;
    merged.sessions++;
    merged.totalEdits += r.totalEdits;
    merged.totalOld   += r.totalOld;
    merged.totalNew   += r.totalNew;
    for (const [k, v] of Object.entries(r.tierCounts)) merged.tierCounts[k] += v;
    for (const [ext, s] of Object.entries(r.extMap)) {
      if (!merged.extMap[ext]) merged.extMap[ext] = { count: 0, oldTotal: 0, newTotal: 0 };
      merged.extMap[ext].count    += s.count;
      merged.extMap[ext].oldTotal += s.oldTotal;
      merged.extMap[ext].newTotal += s.newTotal;
    }
    merged.ratios.push(...r.ratios);
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
function renderOutput(m, ext) {
  if (ext) {
    const s = m.extMap[ext];
    if (!s) { console.log(`No edit data for .${ext} files`); return; }
    const avg = s.count > 0 ? (s.oldTotal / s.count).toFixed(0) : '—';
    const ratio = s.oldTotal > 0 ? (s.newTotal / s.oldTotal).toFixed(2) : '—';
    console.log(`\ncc-delta — .${ext} edit stats`);
    console.log('='.repeat(38));
    console.log(`Edits: ${s.count.toLocaleString()} | Avg change: ${avg} chars | Expansion: ${ratio}×`);
    return;
  }

  const ratios = m.ratios;
  const medRatio = ratios.length ? pct(ratios, 50).toFixed(2) : '—';
  const p90Ratio = ratios.length ? pct(ratios, 90).toFixed(2) : '—';
  const meanRatio = ratios.length ? (ratios.reduce((a,b)=>a+b,0)/ratios.length).toFixed(2) : '—';
  const growthPct = m.totalOld > 0 ? ((m.totalNew/m.totalOld - 1)*100).toFixed(1) : '—';

  console.log('\ncc-delta — Edit Change Size Distribution');
  console.log('='.repeat(46));
  console.log(`Sessions: ${m.sessions.toLocaleString()} | Edits: ${m.totalEdits.toLocaleString()} | ` +
    `Changed: ${(m.totalOld/1000).toFixed(0)}K → ${(m.totalNew/1000).toFixed(0)}K chars (${growthPct}%)`);

  const maxTier = Math.max(...Object.values(m.tierCounts));
  console.log('\nEdit size distribution (by old_string length):');
  for (const t of TIERS) {
    const n = m.tierCounts[t.key];
    const p = m.totalEdits > 0 ? (n/m.totalEdits*100).toFixed(1) : '0.0';
    console.log(`  ${t.label.padEnd(20)} ${bar(n, maxTier)} ${n.toLocaleString().padStart(7)}  ${p.padStart(5)}%`);
  }

  console.log(`\nExpansion ratio (new_len / old_len):`);
  console.log(`  Median : ${medRatio}×  |  Mean: ${meanRatio}×  |  p90: ${p90Ratio}×`);
  const shrink = ratios.filter(r => r < 1.0).length;
  const expand = ratios.filter(r => r > 1.0).length;
  const same   = ratios.length - shrink - expand;
  console.log(`  Shrink : ${(shrink/ratios.length*100).toFixed(1)}%  |  ` +
    `Grow: ${(expand/ratios.length*100).toFixed(1)}%  |  Same size: ${(same/ratios.length*100).toFixed(1)}%`);

  const topExt = Object.entries(m.extMap)
    .sort(([,a],[,b]) => b.count - a.count)
    .slice(0, 8);
  console.log('\nTop file types:');
  console.log('  Ext       Edits   AvgSize  Expansion');
  console.log('  ' + '─'.repeat(42));
  for (const [e, s] of topExt) {
    const avg  = (s.oldTotal / s.count).toFixed(0);
    const ratio = s.oldTotal > 0 ? (s.newTotal/s.oldTotal).toFixed(2) : '—  ';
    console.log(`  .${e.padEnd(9)} ${s.count.toLocaleString().padStart(6)}   ${avg.padStart(7)}  ${ratio}×`);
  }
  console.log('');
}

function renderJson(m) {
  const ratios = m.ratios;
  console.log(JSON.stringify({
    sessions: m.sessions,
    totalEdits: m.totalEdits,
    totalOldChars: m.totalOld,
    totalNewChars: m.totalNew,
    expansionRatio: m.totalOld > 0 ? +(m.totalNew/m.totalOld).toFixed(3) : null,
    tierCounts: m.tierCounts,
    tierPcts: Object.fromEntries(TIERS.map(t => [
      t.key, +(m.tierCounts[t.key]/m.totalEdits*100).toFixed(1)
    ])),
    ratioStats: ratios.length ? {
      median: +pct(ratios,50).toFixed(3),
      mean:   +(ratios.reduce((a,b)=>a+b,0)/ratios.length).toFixed(3),
      p90:    +pct(ratios,90).toFixed(3),
    } : null,
    topExtensions: Object.entries(m.extMap)
      .sort(([,a],[,b])=>b.count-a.count).slice(0,10)
      .map(([ext,s]) => ({
        ext, count: s.count,
        avgOldLen: +(s.oldTotal/s.count).toFixed(0),
        expansionRatio: s.oldTotal > 0 ? +(s.newTotal/s.oldTotal).toFixed(3) : null,
      })),
  }, null, 2));
}

// ── CLI entry ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isJson = args.includes('--json');
const extArg = (args.find(a => a.startsWith('--ext=')) || '').replace('--ext=', '') || null;

const dataDir = resolve(process.env.HOME || '~', '.claude', 'projects');
const files = findJsonlFiles(dataDir);

if (files.length === 0) {
  console.error('No .jsonl files found in ~/.claude/projects/');
  process.exit(1);
}

const rawResults = await processFiles(files);
const merged = mergeResults(rawResults);

if (isJson) renderJson(merged);
else renderOutput(merged, extArg);
