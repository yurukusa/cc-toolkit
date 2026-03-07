#!/usr/bin/env node
// cc-recovery — How does Claude Code recover from its own errors?
// Tracks error→recovery patterns across sessions: retry, fix, investigate, rollback, ask, pivot.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { cpus } from 'os';

const CONCURRENCY = Math.min(cpus().length, 8);
const MIN_TOOLS = 3;

// UX tools that "error" by design
const UX_TOOLS = new Set(['ExitPlanMode', 'AskUserQuestion', 'EnterPlanMode']);

// Recovery pattern classifiers
const INVESTIGATE_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebSearch']);
const FIX_TOOLS = new Set(['Edit', 'Write']);
const ROLLBACK_RE = /\bgit\s+(reset|checkout|revert)\b/;

function analyzeFile(text) {
  const events = [];
  const toolMap = {};      // tool_use id → name
  const toolInputs = {};   // tool_use id → command (Bash only, for rollback detection)

  for (const line of text.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    const role = obj.role || (obj.message && obj.message.role);
    const content = (obj.message || obj).content;
    if (!Array.isArray(content)) continue;

    // User messages with plain text = human intervention
    // User messages with tool_result blocks = automated tool responses
    if (role === 'human' || role === 'user') {
      const hasText = content.some(b => typeof b === 'string');
      const hasToolResult = content.some(b => b && b.type === 'tool_result');
      if (hasText && !hasToolResult) {
        events.push({ type: 'human' });
        continue;
      }
      if (hasText && hasToolResult) {
        events.push({ type: 'human' });
      }
      // Fall through to parse tool_result blocks
    }

    for (const b of content) {
      if (b.type === 'tool_use' && b.id && b.name) {
        toolMap[b.id] = b.name;
        if (b.name === 'Bash' && b.input && b.input.command) {
          toolInputs[b.id] = b.input.command;
        }
        events.push({ type: 'tool_use', name: b.name, id: b.id });
      } else if (b.type === 'tool_result') {
        const name = toolMap[b.tool_use_id || ''] || 'unknown';
        events.push({
          type: 'tool_result',
          toolId: b.tool_use_id,
          name,
          isError: !!b.is_error,
        });
      }
    }
  }

  // Analyze recovery patterns
  let totalCalls = 0;
  let totalErrors = 0;
  const recoveries = []; // {errorTool, pattern, selfRecover}

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type !== 'tool_result') continue;
    if (UX_TOOLS.has(e.name)) continue;
    totalCalls++;
    if (!e.isError) continue;
    totalErrors++;

    // Look ahead for recovery pattern
    let selfRecover = true;
    let pattern = null;
    const nextTools = [];

    for (let j = i + 1; j < events.length && nextTools.length < 3; j++) {
      if (events[j].type === 'human') {
        selfRecover = false;
        break;
      }
      if (events[j].type === 'tool_use') {
        nextTools.push({ name: events[j].name, id: events[j].id });
      }
    }

    if (nextTools.length === 0) {
      // No recovery attempt — session ended or human took over
      pattern = 'ask';
      selfRecover = false;
    } else {
      const first = nextTools[0];
      if (first.name === 'AskUserQuestion') {
        pattern = 'ask';
        selfRecover = false;
      } else if (first.name === e.name) {
        pattern = 'retry';
      } else if (first.name === 'Bash' && toolInputs[first.id] && ROLLBACK_RE.test(toolInputs[first.id])) {
        pattern = 'rollback';
      } else if (FIX_TOOLS.has(first.name)) {
        pattern = 'fix';
      } else if (INVESTIGATE_TOOLS.has(first.name)) {
        pattern = 'investigate';
      } else if (first.name === 'Bash') {
        // Bash after error without git rollback = likely a fix attempt
        pattern = 'fix';
      } else {
        pattern = 'pivot';
      }
    }

    recoveries.push({ errorTool: e.name, pattern, selfRecover });
  }

  // Thrashing detection: runs of 3+ consecutive retries on the same tool
  let thrashingRetries = 0;
  let ri = 0;
  while (ri < recoveries.length) {
    if (recoveries[ri].pattern === 'retry') {
      let rj = ri + 1;
      while (rj < recoveries.length &&
        recoveries[rj].pattern === 'retry' &&
        recoveries[rj].errorTool === recoveries[ri].errorTool) rj++;
      if (rj - ri >= 3) thrashingRetries += (rj - ri);
      ri = rj;
    } else {
      ri++;
    }
  }

  const totalRetries = recoveries.filter(r => r.pattern === 'retry').length;

  return {
    totalCalls,
    totalErrors,
    recoveries,
    thrashingRetries,
    totalRetries,
    selfRecoverCount: recoveries.filter(r => r.selfRecover).length,
    hasData: totalCalls >= MIN_TOOLS,
  };
}

function mergeResults(results) {
  const merged = {
    sessions: 0,
    totalCalls: 0,
    totalErrors: 0,
    selfRecoverCount: 0,
    thrashingRetries: 0,
    totalRetries: 0,
    patterns: {},       // pattern → count
    byTool: {},         // errorTool → { pattern → count }
  };

  for (const r of results) {
    if (!r.hasData) continue;
    merged.sessions++;
    merged.totalCalls += r.totalCalls;
    merged.totalErrors += r.totalErrors;
    merged.selfRecoverCount += r.selfRecoverCount;
    merged.thrashingRetries += r.thrashingRetries;
    merged.totalRetries += r.totalRetries;

    for (const rec of r.recoveries) {
      merged.patterns[rec.pattern] = (merged.patterns[rec.pattern] || 0) + 1;
      if (!merged.byTool[rec.errorTool]) merged.byTool[rec.errorTool] = {};
      merged.byTool[rec.errorTool][rec.pattern] = (merged.byTool[rec.errorTool][rec.pattern] || 0) + 1;
    }
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

const PATTERN_ORDER = ['fix', 'investigate', 'retry', 'pivot', 'ask', 'rollback'];

function renderOutput(m, isJson) {
  if (isJson) {
    const patternList = PATTERN_ORDER
      .filter(p => m.patterns[p])
      .map(p => ({ pattern: p, count: m.patterns[p], pct: +(pct(m.patterns[p], m.totalErrors)) }));

    const toolList = Object.entries(m.byTool)
      .sort((a, b) => {
        const ta = Object.values(a[1]).reduce((s, v) => s + v, 0);
        const tb = Object.values(b[1]).reduce((s, v) => s + v, 0);
        return tb - ta;
      })
      .slice(0, 10)
      .map(([tool, pats]) => {
        const total = Object.values(pats).reduce((s, v) => s + v, 0);
        const breakdown = PATTERN_ORDER
          .filter(p => pats[p])
          .map(p => ({ pattern: p, pct: +(pct(pats[p], total)) }));
        return { tool, errors: total, breakdown };
      });

    console.log(JSON.stringify({
      sessions: m.sessions,
      totalErrors: m.totalErrors,
      selfRecoverRate: +(pct(m.selfRecoverCount, m.totalErrors)),
      thrashingRate: +(pct(m.thrashingRetries, m.totalRetries)),
      patterns: patternList,
      byTool: toolList,
    }, null, 2));
    return;
  }

  const selfRate = pct(m.selfRecoverCount, m.totalErrors);
  const thrashRate = pct(m.thrashingRetries, m.totalRetries);

  console.log('\ncc-recovery — Error Recovery Patterns');
  console.log('='.repeat(52));
  console.log(`Sessions: ${m.sessions.toLocaleString()} | Errors: ${m.totalErrors.toLocaleString()} | Self-recover: ${selfRate}%`);

  // Recovery strategy breakdown
  const sorted = PATTERN_ORDER.filter(p => m.patterns[p]);
  const maxCount = Math.max(...sorted.map(p => m.patterns[p] || 0));

  console.log('\nRecovery strategy:');
  for (const p of sorted) {
    const count = m.patterns[p] || 0;
    const rate = pct(count, m.totalErrors);
    console.log(`  ${p.padEnd(16)} ${bar(count, maxCount)}  ${rate.padStart(5)}%  (${count.toLocaleString()})`);
  }

  console.log(`\nThrashing: ${thrashRate}% of retries loop 3+ times`);

  // Recovery by tool (top errors)
  const toolsSorted = Object.entries(m.byTool)
    .map(([tool, pats]) => {
      const total = Object.values(pats).reduce((s, v) => s + v, 0);
      return { tool, total, pats };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  console.log('\nRecovery by tool (top errors):');
  for (const { tool, total, pats } of toolsSorted) {
    const top3 = PATTERN_ORDER
      .filter(p => pats[p])
      .sort((a, b) => (pats[b] || 0) - (pats[a] || 0))
      .slice(0, 3)
      .map(p => `${p} ${pct(pats[p], total)}%`)
      .join(' | ');
    console.log(`  ${tool.padEnd(16)} ${top3}`);
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
