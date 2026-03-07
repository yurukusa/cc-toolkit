#!/usr/bin/env node
/**
 * cc-think — How deeply does Claude Code think before acting?
 * Measures thinking block usage: frequency, depth, and distribution across sessions.
 */

import { readdirSync, statSync } from 'fs';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  process.stdout.write(`cc-think — How deeply does Claude Code think before acting?

Usage:
  npx cc-think          # Thinking block usage analysis
  npx cc-think --json   # JSON output

Metrics:
  - Sessions with vs without thinking blocks
  - Thinking depth distribution (micro / brief / medium / deep)
  - Blocks per session distribution
  - Total thinking chars (hidden reasoning cost)
`);
  process.exit(0);
}

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', purple: '\x1b[35m', red: '\x1b[31m',
};

function bar(pct, width = 24) {
  const filled = Math.round(pct * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function humanNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

const claudeDir = join(homedir(), '.claude', 'projects');

let totalSessions = 0;
let sessionsWithThink = 0;
let totalBlocks = 0;
let totalThinkChars = 0;
const blockLengths = [];
const blocksPerSession = [];

async function processFile(filePath) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let sessionBlocks = 0;

    rl.on('line', (line) => {
      if (!line.includes('"thinking"')) return;
      let d;
      try { d = JSON.parse(line); } catch { return; }

      const msg = d.message || d;
      if (!msg || msg.role !== 'assistant') return;

      for (const c of (msg.content || [])) {
        if (!c || typeof c !== 'object') continue;
        if (c.type === 'thinking') {
          const len = (c.thinking || '').length;
          blockLengths.push(len);
          totalBlocks++;
          totalThinkChars += len;
          sessionBlocks++;
        }
      }
    });

    rl.on('close', () => {
      resolve(sessionBlocks);
    });
  });
}

async function main() {
  let projectDirs;
  try {
    projectDirs = readdirSync(claudeDir);
  } catch {
    process.stderr.write(`Cannot read ${claudeDir}\n`);
    process.exit(1);
  }

  const allFiles = [];
  for (const pd of projectDirs) {
    const pdPath = join(claudeDir, pd);
    try {
      const files = readdirSync(pdPath).filter(f => f.endsWith('.jsonl'));
      for (const f of files) allFiles.push(join(pdPath, f));
    } catch {}
  }

  totalSessions = allFiles.length;

  const BATCH = 16;
  for (let i = 0; i < allFiles.length; i += BATCH) {
    const batch = allFiles.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(f => processFile(f)));
    for (const blocks of results) {
      if (blocks > 0) {
        sessionsWithThink++;
        blocksPerSession.push(blocks);
      }
    }
  }

  if (totalSessions === 0) {
    process.stderr.write('No sessions found.\n');
    process.exit(1);
  }

  // Sort for percentiles
  blockLengths.sort((a, b) => a - b);
  blocksPerSession.sort((a, b) => a - b);

  const thinkPct = sessionsWithThink / totalSessions;
  const medLen = blockLengths[Math.floor(blockLengths.length / 2)] || 0;
  const meanLen = totalBlocks > 0 ? Math.round(totalThinkChars / totalBlocks) : 0;
  const maxLen = blockLengths[blockLengths.length - 1] || 0;

  const medBps = blocksPerSession[Math.floor(blocksPerSession.length / 2)] || 0;
  const maxBps = blocksPerSession[blocksPerSession.length - 1] || 0;

  // Depth tiers
  const micro  = blockLengths.filter(x => x < 50).length;
  const brief  = blockLengths.filter(x => x >= 50  && x < 300).length;
  const medium = blockLengths.filter(x => x >= 300  && x < 2000).length;
  const deep   = blockLengths.filter(x => x >= 2000).length;

  if (jsonMode) {
    process.stdout.write(JSON.stringify({
      totalSessions,
      sessionsWithThink,
      thinkPct: Math.round(thinkPct * 1000) / 10,
      totalBlocks,
      totalThinkChars,
      blockLength: { median: medLen, mean: meanLen, max: maxLen },
      blocksPerSession: { median: medBps, max: maxBps },
      depthTiers: { micro, brief, medium, deep },
    }, null, 2) + '\n');
    return;
  }

  // ── Pretty output ────────────────────────────────────────────────────────
  process.stdout.write(`\n${C.bold}${C.cyan}cc-think${C.reset} — How deeply does Claude Code think before acting?\n\n`);

  process.stdout.write(`${C.bold}Sessions analyzed:${C.reset} ${humanNum(totalSessions)}\n\n`);

  // Think vs no-think
  process.stdout.write(`${C.bold}Thinking usage${C.reset}\n`);
  process.stdout.write(`  ${C.purple}${bar(thinkPct, 30)}${C.reset} ${C.bold}${(thinkPct * 100).toFixed(1)}%${C.reset}  sessions use thinking blocks  (${humanNum(sessionsWithThink)} sessions)\n`);
  process.stdout.write(`  ${C.dim}${bar(1 - thinkPct, 30)}${C.reset} ${C.dim}${((1 - thinkPct) * 100).toFixed(1)}%${C.reset}  ${C.dim}no thinking — straight to action${C.reset}\n`);
  process.stdout.write(`\n`);

  // Volume
  process.stdout.write(`${C.bold}Thinking volume${C.reset}\n`);
  process.stdout.write(`  ${C.bold}${humanNum(totalBlocks)}${C.reset} thinking blocks total  |  ${C.bold}${humanNum(totalThinkChars)}${C.reset} chars of hidden reasoning\n`);
  process.stdout.write(`  ${C.dim}median ${medLen}c/block  |  mean ${meanLen}c  |  max ${maxLen}c${C.reset}\n`);
  process.stdout.write(`\n`);

  // Depth distribution
  process.stdout.write(`${C.bold}Thinking depth distribution${C.reset}  (${humanNum(totalBlocks)} blocks)\n`);
  const tiers = [
    ['micro  ', micro,  '  instant — almost no reasoning  (<50c)'],
    ['brief  ', brief,  '  quick check before acting       (50–299c)'],
    ['medium ', medium, '  genuine planning step           (300–1999c)'],
    ['deep   ', deep,   '  extended reasoning              (2000+c)'],
  ];
  for (const [label, count, desc] of tiers) {
    const pct = totalBlocks > 0 ? count / totalBlocks : 0;
    const color = label.includes('deep') ? C.purple : label.includes('medium') ? C.blue : label.includes('brief') ? C.green : C.dim;
    process.stdout.write(
      `  ${label}  ${color}${bar(pct, 22)}${C.reset}  ${C.bold}${(pct * 100).toFixed(0).padStart(3)}%${C.reset}  ${C.dim}(${humanNum(count)})${desc}${C.reset}\n`
    );
  }
  process.stdout.write(`\n`);

  // Blocks per session
  process.stdout.write(`${C.bold}Thinking blocks per session${C.reset}  (sessions that think)\n`);
  process.stdout.write(`  median ${C.bold}${medBps}${C.reset}  |  max ${C.bold}${maxBps}${C.reset} blocks in one session\n`);
  process.stdout.write(`\n`);

  // Insight
  process.stdout.write(`${C.dim}─────────────────────────────────────────────${C.reset}\n`);
  const deepPct = totalBlocks > 0 ? deep / totalBlocks : 0;
  if (deepPct >= 0.1) {
    process.stdout.write(`${C.purple}${C.bold}${(deepPct * 100).toFixed(0)}% of thinking blocks are deep (2000+ chars).${C.reset}\n`);
    process.stdout.write(`${C.dim}Claude is reasoning hard on complex tasks before acting.${C.reset}\n`);
  } else {
    process.stdout.write(`${C.blue}${C.bold}${(thinkPct * 100).toFixed(0)}% of sessions include thinking.${C.reset}\n`);
    process.stdout.write(`${C.dim}Most thinking is brief — quick checks, not extended deliberation.${C.reset}\n`);
  }
  process.stdout.write(`\n`);
}

main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
