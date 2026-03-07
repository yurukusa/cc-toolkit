#!/usr/bin/env node

// cc-live — Watch your active Claude Code session in real-time
// Zero dependencies. Reads ~/.claude/projects/ session transcripts.
//
// Shows: input/output tokens, cache usage, burn rate, estimated cost (API pricing)
// Refreshes every 5s. Ctrl+C to exit.

import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const REFRESH_MS = 5000;

// Claude Sonnet 4.x API pricing ($ per million tokens)
// Used for cost estimates. Max plan subscribers: your actual cost is the subscription.
const PRICE = { input: 3.00, output: 15.00, cache_write: 3.75, cache_read: 0.30 };

// ── Color helpers ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m', white: '\x1b[37m',
};

function pad(s, len, right = false) {
  const t = String(s);
  const p = ' '.repeat(Math.max(0, len - t.length));
  return right ? p + t : t + p;
}

function fmtN(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtCost(d) {
  if (d < 0.001) return '<$0.001';
  return '$' + d.toFixed(3);
}

function fmtDur(sec) {
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

function bar(pct, width = 24) {
  const p = Math.min(1, Math.max(0, pct));
  const fill = Math.round(p * width);
  const col = p > 0.8 ? C.red : p > 0.5 ? C.yellow : C.green;
  return col + '█'.repeat(fill) + C.dim + '░'.repeat(width - fill) + C.reset;
}

// ── Find most recently modified session file ──────────────────────────────
async function findActive() {
  let best = null, bestMs = 0;
  try {
    const projects = await readdir(PROJECTS_DIR);
    for (const proj of projects) {
      const dir = join(PROJECTS_DIR, proj);
      let files;
      try { files = await readdir(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fp = join(dir, f);
        const st = await stat(fp);
        if (st.mtimeMs > bestMs) { bestMs = st.mtimeMs; best = { path: fp, project: proj, mtime: st.mtimeMs }; }
      }
    }
  } catch {}
  return best;
}

// ── Parse session JSONL ───────────────────────────────────────────────────
async function parseSession(fp) {
  const s = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, turns: 0, firstTs: null, lastTs: null, model: null };
  const rl = createInterface({ input: createReadStream(fp), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      if (d.timestamp) {
        const t = new Date(d.timestamp).getTime();
        if (!s.firstTs || t < s.firstTs) s.firstTs = t;
        if (!s.lastTs || t > s.lastTs) s.lastTs = t;
      }
      const msg = d.message || {};
      if (msg.role === 'assistant') {
        s.turns++;
        if (msg.model && !s.model) s.model = msg.model;
        const u = msg.usage;
        if (u) {
          s.input += (u.input_tokens || 0);
          s.output += (u.output_tokens || 0);
          s.cacheWrite += (u.cache_creation_input_tokens || 0);
          s.cacheRead += (u.cache_read_input_tokens || 0);
        }
      }
    } catch {}
  }
  return s;
}

function cost(s) {
  return (s.input / 1e6) * PRICE.input
       + (s.output / 1e6) * PRICE.output
       + (s.cacheWrite / 1e6) * PRICE.cache_write
       + (s.cacheRead / 1e6) * PRICE.cache_read;
}

// ── Render ────────────────────────────────────────────────────────────────
function render(session, s, prev, elapsedSec) {
  const now = Date.now();
  const age = s.firstTs ? Math.round((now - s.firstTs) / 1000) : 0;
  const total = s.input + s.output;
  const cTotal = s.cacheWrite + s.cacheRead;
  const cacheHitPct = cTotal > 0 ? s.cacheRead / cTotal : 0;

  // Burn rate: total token delta over last refresh interval
  let burnRate = 0;
  if (prev && elapsedSec > 0) {
    const delta = (s.input + s.output) - (prev.input + prev.output);
    burnRate = Math.round((delta / elapsedSec) * 60);
  }

  const projLabel = session.project
    .replace(/^-home-[^-]+-?/, '')
    .replace(/^projects-/, '')
    .replace(/-/g, '/') || '(home)';

  const modelLabel = s.model
    ? s.model.replace('claude-', '').replace(/-\d{8}$/, '').replace(/-20\d{6}$/, '')
    : '—';

  const lines = [];
  lines.push('');
  lines.push(C.bold + C.cyan + '  cc-live' + C.reset + C.dim + '  Active session monitor' + C.reset);
  lines.push(C.dim + '  ' + '─'.repeat(48) + C.reset);
  lines.push('');
  lines.push('  ' + C.dim + 'Project  ' + C.reset + C.white + projLabel + C.reset);
  lines.push('  ' + C.dim + 'Model    ' + C.reset + modelLabel);
  lines.push('  ' + C.dim + 'Duration ' + C.reset + fmtDur(age) + C.dim + '  ·  ' + s.turns + ' turns' + C.reset);
  lines.push('');

  lines.push('  ' + C.bold + 'Tokens' + C.reset);
  lines.push('  ' + pad('Input', 12)    + C.blue   + pad(fmtN(s.input), 9, true)      + C.reset + C.dim + '  ← fresh context per turn' + C.reset);
  lines.push('  ' + pad('Output', 12)   + C.green  + pad(fmtN(s.output), 9, true)     + C.reset);
  lines.push('  ' + pad('Cache write', 12) + C.yellow + pad(fmtN(s.cacheWrite), 9, true) + C.reset + C.dim + '  → reused next turn' + C.reset);
  lines.push('  ' + pad('Cache read', 12) + C.cyan  + pad(fmtN(s.cacheRead), 9, true) + C.reset + C.dim + '  × 10 cheaper than input' + C.reset);
  lines.push('  ' + pad('Total', 12)    + C.white  + pad(fmtN(total), 9, true)         + C.reset);
  lines.push('');

  lines.push('  ' + C.bold + 'Cost estimate' + C.reset + C.dim + '  (API rate — Max plan users: cost = subscription)' + C.reset);
  lines.push('  ' + pad('This session', 12) + C.yellow + pad(fmtCost(cost(s)), 9, true) + C.reset);
  if (burnRate > 0) {
    const costPerHr = (burnRate * 60 / 1e6) * ((PRICE.input + PRICE.output) / 2);
    lines.push('  ' + pad('Burn rate', 12) + pad(fmtN(burnRate) + '/min', 9, true) + C.dim + '  ≈ ' + fmtCost(costPerHr) + '/hr at current pace' + C.reset);
  }
  lines.push('');

  lines.push('  ' + C.bold + 'Cache hit rate' + C.reset + C.dim + '  (higher = cheaper)' + C.reset);
  lines.push('  ' + bar(cacheHitPct) + ' ' + C.dim + Math.round(cacheHitPct * 100) + '%' + C.reset);
  lines.push('');
  lines.push(C.dim + '  ↻ ' + new Date().toLocaleTimeString() + '  · Ctrl+C to exit  · --once for snapshot' + C.reset);
  lines.push('');
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const once = process.argv.includes('--once') || process.argv.includes('-1');

  if (!once) {
    process.stdout.write('\x1b[?25l'); // hide cursor
    const show = () => process.stdout.write('\x1b[?25h');
    process.on('exit', show);
    process.on('SIGINT', () => { show(); process.stdout.write('\n'); process.exit(0); });
  }

  let prev = null, prevTime = null;

  while (true) {
    const session = await findActive();
    if (!session) {
      console.log('\nNo Claude Code session found. Start Claude Code first.\n');
      process.exit(1);
    }

    const now = Date.now();
    const elapsed = prevTime ? (now - prevTime) / 1000 : 0;
    const s = await parseSession(session.path);

    if (once) {
      console.log(render(session, s, null, 0));
      break;
    }

    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(render(session, s, prev, elapsed));

    prev = s;
    prevTime = now;
    await new Promise(r => setTimeout(r, REFRESH_MS));
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
