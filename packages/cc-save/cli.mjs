#!/usr/bin/env node
/**
 * cc-save — How much money has Claude's prompt cache saved you?
 * Calculates the dollar savings from cache_read vs fresh input tokens.
 *
 * Pricing (Sonnet 4.5/4.6 defaults, overridable):
 *   Input (fresh):    $3.00 / 1M tokens
 *   Cache read:       $0.30 / 1M tokens  ← 10× cheaper
 *   Cache write:      $3.75 / 1M tokens
 *   Output:           $15.00 / 1M tokens
 *
 * Savings = cache_read × ($3.00 - $0.30) / 1M
 */

import { readdirSync } from 'fs';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const showHelp = args.includes('--help') || args.includes('-h');

// Pricing per 1M tokens (Sonnet 4.6 defaults)
const PRICE_INPUT   = parseFloat(args.find(a => a.startsWith('--input='))?.split('=')[1]  ?? '3.00');
const PRICE_CACHE_R = parseFloat(args.find(a => a.startsWith('--cache-r='))?.split('=')[1] ?? '0.30');
const PRICE_CACHE_W = parseFloat(args.find(a => a.startsWith('--cache-w='))?.split('=')[1] ?? '3.75');
const PRICE_OUTPUT  = parseFloat(args.find(a => a.startsWith('--output='))?.split('=')[1] ?? '15.00');

if (showHelp) {
  process.stdout.write(`cc-save — How much money has Claude's prompt cache saved you?

Usage:
  npx cc-save              # Cache savings analysis (Sonnet 4.6 pricing)
  npx cc-save --json       # JSON output
  npx cc-save --input=3.00 --cache-r=0.30 --cache-w=3.75 --output=15.00

Pricing flags (per 1M tokens, defaults = Sonnet 4.6):
  --input=N     Fresh input token price  (default: $3.00)
  --cache-r=N   Cache read token price   (default: $0.30)
  --cache-w=N   Cache write token price  (default: $3.75)
  --output=N    Output token price       (default: $15.00)

Savings = cache_read_tokens × (input_price - cache_read_price) / 1M
`);
  process.exit(0);
}

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', purple: '\x1b[35m', red: '\x1b[31m',
  orange: '\x1b[38;5;208m',
};

function fmtD(n) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
  if (n >= 1) return '$' + n.toFixed(2);
  return '$' + n.toFixed(4);
}

function fmtK(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return Math.round(n).toString();
}

const claudeDir = join(homedir(), '.claude', 'projects');

async function processFile(filePath) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let tInput = 0, tCacheR = 0, tCacheW = 0, tOutput = 0;
    let turns = 0;

    rl.on('line', (line) => {
      if (!line) return;
      let d;
      try { d = JSON.parse(line); } catch { return; }

      const msg = d.message || d;
      if (!msg || msg.role !== 'assistant') return;

      const u = msg.usage;
      if (!u) return;

      tInput  += (u.input_tokens || 0);
      tCacheR += (u.cache_read_input_tokens || 0);
      tCacheW += (u.cache_creation_input_tokens || 0);
      tOutput += (u.output_tokens || 0);
      turns++;
    });

    rl.on('close', () => {
      if (turns === 0) { resolve(null); return; }
      resolve({ tInput, tCacheR, tCacheW, tOutput, turns });
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

  let totalInput = 0, totalCacheR = 0, totalCacheW = 0, totalOutput = 0;
  let totalTurns = 0, sessionCount = 0;

  const BATCH = 16;
  for (let i = 0; i < allFiles.length; i += BATCH) {
    const batch = allFiles.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(f => processFile(f)));
    for (const r of results) {
      if (!r) continue;
      totalInput  += r.tInput;
      totalCacheR += r.tCacheR;
      totalCacheW += r.tCacheW;
      totalOutput += r.tOutput;
      totalTurns  += r.turns;
      sessionCount++;
    }
  }

  if (sessionCount === 0) {
    process.stderr.write('No usage data found.\n');
    process.exit(1);
  }

  // Costs
  const M = 1_000_000;
  const costInputActual  = totalInput  * PRICE_INPUT   / M;
  const costCacheR       = totalCacheR * PRICE_CACHE_R / M;
  const costCacheW       = totalCacheW * PRICE_CACHE_W / M;
  const costOutput       = totalOutput * PRICE_OUTPUT  / M;
  const actualTotal      = costInputActual + costCacheR + costCacheW + costOutput;

  // What it would cost if all cache reads were fresh input instead
  const hypotheticalInput = (totalInput + totalCacheR) * PRICE_INPUT / M;
  const hypotheticalTotal = hypotheticalInput + costCacheW + costOutput;

  const savings      = hypotheticalTotal - actualTotal;
  const savingsPct   = Math.round(savings / hypotheticalTotal * 100);
  const cacheHitRate = Math.round(totalCacheR / (totalInput + totalCacheR + totalCacheW) * 100);
  const cacheMultiplier = (PRICE_INPUT / PRICE_CACHE_R).toFixed(0);

  if (jsonMode) {
    process.stdout.write(JSON.stringify({
      tokens: {
        input: totalInput,
        cacheRead: totalCacheR,
        cacheWrite: totalCacheW,
        output: totalOutput,
      },
      costs: {
        actual: { input: costInputActual, cacheRead: costCacheR, cacheWrite: costCacheW, output: costOutput, total: actualTotal },
        hypothetical: { total: hypotheticalTotal },
        savings,
        savingsPct,
      },
      cacheHitRate,
      sessions: sessionCount,
      turns: totalTurns,
      pricing: { input: PRICE_INPUT, cacheRead: PRICE_CACHE_R, cacheWrite: PRICE_CACHE_W, output: PRICE_OUTPUT },
    }, null, 2) + '\n');
    return;
  }

  // ── Pretty output ──────────────────────────────────────────────────────────
  process.stdout.write(`\n${C.bold}${C.cyan}cc-save${C.reset} — How much money has Claude's prompt cache saved you?\n\n`);

  // Big savings number
  const savingsColor = savings >= 100 ? C.purple : savings >= 10 ? C.yellow : C.green;
  process.stdout.write(`  ${C.bold}${savingsColor}${fmtD(savings)}${C.reset} saved by prompt caching\n`);
  process.stdout.write(`  ${C.dim}${savingsPct}% of what you'd pay without caching${C.reset}\n\n`);

  // Cost breakdown
  process.stdout.write(`${C.bold}Cost breakdown${C.reset}  ${C.dim}(${sessionCount} sessions, ${totalTurns.toLocaleString()} turns)${C.reset}\n`);
  process.stdout.write(`  Input (fresh)    ${C.bold}${fmtD(costInputActual)}${C.reset}  ${C.dim}${fmtK(totalInput)} tokens × ${fmtD(PRICE_INPUT)}/1M${C.reset}\n`);
  process.stdout.write(`  Cache reads      ${C.bold}${C.green}${fmtD(costCacheR)}${C.reset}  ${C.dim}${fmtK(totalCacheR)} tokens × ${fmtD(PRICE_CACHE_R)}/1M${C.reset}\n`);
  process.stdout.write(`  Cache written    ${C.bold}${fmtD(costCacheW)}${C.reset}  ${C.dim}${fmtK(totalCacheW)} tokens × ${fmtD(PRICE_CACHE_W)}/1M${C.reset}\n`);
  process.stdout.write(`  Output           ${C.bold}${fmtD(costOutput)}${C.reset}  ${C.dim}${fmtK(totalOutput)} tokens × ${fmtD(PRICE_OUTPUT)}/1M${C.reset}\n`);
  process.stdout.write(`  ${'─'.repeat(42)}\n`);
  process.stdout.write(`  Actual total     ${C.bold}${C.cyan}${fmtD(actualTotal)}${C.reset}\n`);
  process.stdout.write(`  Without caching  ${C.bold}${C.dim}${fmtD(hypotheticalTotal)}${C.reset}  ${C.dim}(if cache reads billed as fresh input)${C.reset}\n`);
  process.stdout.write('\n');

  // Cache efficiency
  process.stdout.write(`${C.bold}Cache efficiency${C.reset}\n`);
  process.stdout.write(`  Hit rate         ${C.bold}${C.green}${cacheHitRate}%${C.reset}  ${C.dim}of total input tokens served from cache${C.reset}\n`);
  process.stdout.write(`  Cache multiplier ${C.bold}${cacheMultiplier}×${C.reset}  ${C.dim}cheaper per token (${fmtD(PRICE_INPUT)} vs ${fmtD(PRICE_CACHE_R)} per 1M)${C.reset}\n`);

  // Per-session average
  const savingsPerSession = savings / sessionCount;
  const costPerSession    = actualTotal / sessionCount;
  process.stdout.write(`  Per session      ${C.bold}${fmtD(savingsPerSession)}${C.reset} saved  ${C.dim}/ ${fmtD(costPerSession)} actual cost${C.reset}\n`);
  process.stdout.write('\n');

  // Insight
  process.stdout.write(`${C.dim}─────────────────────────────────────────────${C.reset}\n`);
  process.stdout.write(`${C.bold}${C.cyan}Prompt caching saved you ${fmtD(savings)} (${savingsPct}% of your hypothetical bill).${C.reset}\n`);
  process.stdout.write(`${C.dim}Without caching, ${fmtK(totalCacheR)} cache-read tokens would have cost ${fmtD(totalCacheR * PRICE_INPUT / M)} at fresh input rates.\n`);
  process.stdout.write(`Instead, they cost ${fmtD(costCacheR)} — a ${cacheMultiplier}× reduction per token.${C.reset}\n\n`);
  process.stdout.write(`${C.dim}Prices: input ${fmtD(PRICE_INPUT)}/1M · cache-r ${fmtD(PRICE_CACHE_R)}/1M · cache-w ${fmtD(PRICE_CACHE_W)}/1M · output ${fmtD(PRICE_OUTPUT)}/1M (Sonnet 4.6 defaults)\nOverride with --input=N --cache-r=N --cache-w=N --output=N${C.reset}\n\n`);
}

main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
