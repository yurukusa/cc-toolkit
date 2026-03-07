#!/usr/bin/env node
// cc-error — Which tools fail most often in Claude Code?
// Tracks tool_result is_error across sessions to find failure patterns.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { cpus } from 'os';

const CONCURRENCY = Math.min(cpus().length, 8);
const MIN_TOOLS = 3;
const MIN_CALLS_FOR_RATE = 10; // minimum calls to show error rate

// UX tools that "error" by design (user rejects plan, etc.)
const UX_TOOLS = new Set(['ExitPlanMode', 'AskUserQuestion', 'EnterPlanMode']);

function analyzeFile(text) {
  const toolMap = {};   // id → name
  const toolTotal = {};
  const toolErrors = {};
  let totalResults = 0;
  let totalErrors = 0;
  let hasError = false;
  let hasResult = false;

  for (const line of text.split('\n')) {
    if (!line.includes('"tool_use"') && !line.includes('"tool_result"')) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const content = (obj.message || obj).content;
    if (!Array.isArray(content)) continue;

    for (const b of content) {
      if (b.type === 'tool_use' && b.id && b.name) {
        toolMap[b.id] = b.name;
      } else if (b.type === 'tool_result') {
        hasResult = true;
        const name = toolMap[b.tool_use_id || ''] || 'unknown';
        if (UX_TOOLS.has(name)) continue; // skip UX design tools
        totalResults++;
        toolTotal[name] = (toolTotal[name] || 0) + 1;
        if (b.is_error) {
          totalErrors++;
          toolErrors[name] = (toolErrors[name] || 0) + 1;
          hasError = true;
        }
      }
    }
  }

  return { toolTotal, toolErrors, totalResults, totalErrors, hasError, hasResult };
}

function mergeResults(results) {
  const merged = {
    sessions: 0,
    sessionsWithError: 0,
    totalResults: 0,
    totalErrors: 0,
    toolTotal: {},
    toolErrors: {},
  };

  for (const r of results) {
    if (r.totalResults < MIN_TOOLS) continue;
    merged.sessions++;
    if (r.hasError) merged.sessionsWithError++;
    merged.totalResults += r.totalResults;
    merged.totalErrors += r.totalErrors;
    for (const [k, v] of Object.entries(r.toolTotal)) merged.toolTotal[k] = (merged.toolTotal[k] || 0) + v;
    for (const [k, v] of Object.entries(r.toolErrors)) merged.toolErrors[k] = (merged.toolErrors[k] || 0) + v;
  }

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

function renderOutput(m, isJson) {
  // Build ranked tool list
  const tools = Object.keys(m.toolTotal)
    .filter(k => m.toolTotal[k] >= MIN_CALLS_FOR_RATE)
    .sort((a, b) => {
      const ra = (m.toolErrors[a] || 0) / m.toolTotal[a];
      const rb = (m.toolErrors[b] || 0) / m.toolTotal[b];
      return rb - ra;
    });

  if (isJson) {
    console.log(JSON.stringify({
      sessions: m.sessions,
      sessionsWithError: m.sessionsWithError,
      sessionErrorRate: +(pct(m.sessionsWithError, m.sessions)),
      totalCalls: m.totalResults,
      totalErrors: m.totalErrors,
      overallErrorRate: +(pct(m.totalErrors, m.totalResults)),
      tools: tools.slice(0, 15).map(t => ({
        tool: t,
        calls: m.toolTotal[t],
        errors: m.toolErrors[t] || 0,
        errorRate: +(pct(m.toolErrors[t] || 0, m.toolTotal[t])),
      })),
    }, null, 2));
    return;
  }

  const overallRate = pct(m.totalErrors, m.totalResults);
  const sessionRate = pct(m.sessionsWithError, m.sessions);

  console.log('\ncc-error — Tool Failure Rates in Claude Code');
  console.log('='.repeat(52));
  console.log(`Sessions: ${m.sessions.toLocaleString()} | ${sessionRate}% hit ≥1 error`);
  console.log(`Total calls: ${m.totalResults.toLocaleString()} | Errors: ${m.totalErrors.toLocaleString()} (${overallRate}% overall)`);

  const maxRate = Math.max(...tools.slice(0, 10).map(t => (m.toolErrors[t] || 0) / m.toolTotal[t]));

  console.log('\nError rate by tool (top 10, ≥10 calls):');
  for (const t of tools.slice(0, 10)) {
    const calls = m.toolTotal[t];
    const errs = m.toolErrors[t] || 0;
    const rate = errs / calls;
    const p = pct(errs, calls);
    console.log(`  ${t.padEnd(24)} ${bar(rate, maxRate)}  ${p.padStart(5)}%  (${errs}/${calls.toLocaleString()})`);
  }
  console.log('');
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
renderOutput(merged, isJson);
