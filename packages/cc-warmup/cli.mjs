#!/usr/bin/env node
/**
 * cc-warmup — Does Claude Code warm up or fade?
 * Splits each session into early/mid/late thirds and compares tool execution rates.
 * Shows whether Claude tends to accelerate, plateau, or slow down within a session.
 */

import { readdirSync } from 'fs';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  process.stdout.write(`cc-warmup — Does Claude Code warm up or fade?

Usage:
  npx cc-warmup          # Session pace progression analysis
  npx cc-warmup --json   # JSON output

Metrics:
  - Early / mid / late phase tools/hour per session
  - Warmup (accelerating), flat, fade (decelerating) classification
  - Average pace change from start to end
  - Top warmup and fadeout sessions
`);
  process.exit(0);
}

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', purple: '\x1b[35m', red: '\x1b[31m',
  orange: '\x1b[38;5;208m',
};

function bar(pct, width = 22) {
  const filled = Math.round(pct * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function fmt(n) { return Math.round(n).toLocaleString(); }

const claudeDir = join(homedir(), '.claude', 'projects');

async function processFile(filePath) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    // Store [timestamp, isTool] pairs for ordering
    const events = [];

    rl.on('line', (line) => {
      if (!line) return;
      let d;
      try { d = JSON.parse(line); } catch { return; }

      if (!d.timestamp) return;
      const t = new Date(d.timestamp).getTime();
      if (isNaN(t)) return;

      const msg = d.message || d;
      if (msg && msg.role === 'assistant') {
        let tools = 0;
        for (const c of (msg.content || [])) {
          if (c && c.type === 'tool_use') tools++;
        }
        if (tools > 0) events.push({ t, tools });
        else events.push({ t, tools: 0 });
      } else {
        events.push({ t, tools: 0 });
      }
    });

    rl.on('close', () => {
      if (events.length < 6) { resolve(null); return; }

      events.sort((a, b) => a.t - b.t);

      const minTs = events[0].t;
      const maxTs = events[events.length - 1].t;
      const durationMin = (maxTs - minTs) / 60000;
      if (durationMin < 2) { resolve(null); return; }

      const totalTools = events.reduce((s, e) => s + e.tools, 0);
      if (totalTools < 6) { resolve(null); return; }

      // Split into three equal time thirds
      const third = (maxTs - minTs) / 3;
      const t1 = minTs + third;
      const t2 = minTs + 2 * third;

      let earlyTools = 0, midTools = 0, lateTools = 0;
      for (const e of events) {
        if (e.t < t1) earlyTools += e.tools;
        else if (e.t < t2) midTools += e.tools;
        else lateTools += e.tools;
      }

      // tools/hour for each third (third is in ms, convert to hours)
      const thirdHr = (third / 1000 / 3600);
      if (thirdHr < 0.01) { resolve(null); return; }

      const earlyRate = earlyTools / thirdHr;
      const midRate = midTools / thirdHr;
      const lateRate = lateTools / thirdHr;

      // Skip if all rates are near-zero
      if (earlyRate + midRate + lateRate < 10) { resolve(null); return; }

      // Classify session pattern
      // Warmup: late > early by 20%+
      // Fade: early > late by 20%+
      // Flat: within 20%
      const maxRate = Math.max(earlyRate, midRate, lateRate);
      let pattern;
      if (maxRate === 0) { resolve(null); return; }
      const ratio = lateRate / (earlyRate || 1);
      if (ratio >= 1.2) pattern = 'warmup';
      else if (ratio <= 0.833) pattern = 'fade';
      else pattern = 'flat';

      resolve({
        earlyRate, midRate, lateRate, pattern,
        totalTools, durationMin,
        overallRate: totalTools / (durationMin / 60),
      });
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

  const sessions = [];
  const BATCH = 16;
  for (let i = 0; i < allFiles.length; i += BATCH) {
    const batch = allFiles.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(f => processFile(f)));
    for (const r of results) {
      if (r) sessions.push(r);
    }
  }

  if (sessions.length === 0) {
    process.stderr.write('No sessions with enough timing data found.\n');
    process.exit(1);
  }

  const n = sessions.length;
  const warmup = sessions.filter(s => s.pattern === 'warmup').length;
  const fade   = sessions.filter(s => s.pattern === 'fade').length;
  const flat   = sessions.filter(s => s.pattern === 'flat').length;

  // Average rates across phases
  const avgEarly = sessions.reduce((a, s) => a + s.earlyRate, 0) / n;
  const avgMid   = sessions.reduce((a, s) => a + s.midRate, 0) / n;
  const avgLate  = sessions.reduce((a, s) => a + s.lateRate, 0) / n;

  // Ratio of late/early to quantify overall direction
  const ratios = sessions.map(s => s.lateRate / (s.earlyRate || 1)).sort((a, b) => a - b);
  const medianRatio = ratios[Math.floor(n / 2)];

  // Top warmup sessions (highest late/early ratio, minimum early > 0)
  const topWarmup = sessions
    .filter(s => s.earlyRate > 0 && s.pattern === 'warmup')
    .sort((a, b) => (b.lateRate / b.earlyRate) - (a.lateRate / a.earlyRate))
    .slice(0, 3);

  // Top fadeout sessions (highest deceleration, require lateRate > 1 for meaningful ratio)
  const topFade = sessions
    .filter(s => s.earlyRate > 1 && s.lateRate > 1 && s.pattern === 'fade')
    .sort((a, b) => (a.lateRate / a.earlyRate) - (b.lateRate / b.earlyRate))
    .slice(0, 3);

  if (jsonMode) {
    process.stdout.write(JSON.stringify({
      sessionsAnalyzed: n,
      patterns: { warmup, flat, fade },
      avgRates: {
        early: Math.round(avgEarly),
        mid: Math.round(avgMid),
        late: Math.round(avgLate),
      },
      medianLateToEarlyRatio: Math.round(medianRatio * 100) / 100,
      topWarmup: topWarmup.map(s => ({
        earlyRate: Math.round(s.earlyRate),
        midRate: Math.round(s.midRate),
        lateRate: Math.round(s.lateRate),
        ratio: Math.round(s.lateRate / s.earlyRate * 10) / 10,
      })),
      topFade: topFade.map(s => ({
        earlyRate: Math.round(s.earlyRate),
        midRate: Math.round(s.midRate),
        lateRate: Math.round(s.lateRate),
        ratio: Math.round(s.lateRate / s.earlyRate * 10) / 10,
      })),
    }, null, 2) + '\n');
    return;
  }

  // ── Pretty output ──────────────────────────────────────────────────────────
  process.stdout.write(`\n${C.bold}${C.cyan}cc-warmup${C.reset} — Does Claude Code warm up or fade?\n\n`);
  process.stdout.write(`${C.bold}Sessions analyzed:${C.reset} ${n.toLocaleString()}\n\n`);

  // Phase rates
  process.stdout.write(`${C.bold}Average pace by session phase${C.reset}  (tools/hr)\n`);
  const maxAvg = Math.max(avgEarly, avgMid, avgLate) || 1;
  const phases = [
    ['early  ', avgEarly, C.blue,   '(first third)'],
    ['mid    ', avgMid,   C.green,  '(middle third)'],
    ['late   ', avgLate,  C.orange, '(final third)'],
  ];
  for (const [label, rate, color, note] of phases) {
    process.stdout.write(
      `  ${label}  ${color}${bar(rate / maxAvg, 20)}${C.reset}  ${C.bold}${fmt(rate)}${C.reset}  ${C.dim}${note}${C.reset}\n`
    );
  }
  process.stdout.write('\n');

  // Pattern distribution
  process.stdout.write(`${C.bold}Session patterns${C.reset}\n`);
  const patterns = [
    ['warmup', warmup, C.green,  'rate increases as session progresses'],
    ['flat  ', flat,   C.blue,   'rate stays roughly constant'],
    ['fade  ', fade,   C.purple, 'rate decreases as session progresses'],
  ];
  for (const [label, count, color, desc] of patterns) {
    const pct = count / n;
    process.stdout.write(
      `  ${label}  ${color}${bar(pct, 22)}${C.reset}  ${C.bold}${(pct * 100).toFixed(0).padStart(3)}%${C.reset}  ${C.dim}(${count})  ${desc}${C.reset}\n`
    );
  }
  process.stdout.write('\n');

  // Top warmup sessions
  if (topWarmup.length > 0) {
    process.stdout.write(`${C.bold}Top warmup sessions${C.reset}  ${C.dim}(biggest late/early acceleration)${C.reset}\n`);
    for (let i = 0; i < topWarmup.length; i++) {
      const s = topWarmup[i];
      const ratio = (s.lateRate / s.earlyRate).toFixed(1);
      process.stdout.write(
        `  #${i + 1}  ${C.green}${fmt(s.earlyRate)}${C.reset} → ${C.bold}${C.green}${fmt(s.lateRate)}${C.reset} tools/hr  ` +
        `${C.dim}(${ratio}× faster by end)${C.reset}\n`
      );
    }
    process.stdout.write('\n');
  }

  // Top fadeout sessions
  if (topFade.length > 0) {
    process.stdout.write(`${C.bold}Top fadeout sessions${C.reset}  ${C.dim}(biggest deceleration)${C.reset}\n`);
    for (let i = 0; i < topFade.length; i++) {
      const s = topFade[i];
      const ratio = (s.earlyRate / s.lateRate).toFixed(1);
      process.stdout.write(
        `  #${i + 1}  ${C.bold}${C.purple}${fmt(s.earlyRate)}${C.reset} → ${C.purple}${fmt(s.lateRate)}${C.reset} tools/hr  ` +
        `${C.dim}(${ratio}× slower by end)${C.reset}\n`
      );
    }
    process.stdout.write('\n');
  }

  // Insight
  process.stdout.write(`${C.dim}─────────────────────────────────────────────${C.reset}\n`);
  const direction = medianRatio >= 1.1 ? 'accelerate' : medianRatio <= 0.9 ? 'decelerate' : 'stay flat';
  process.stdout.write(`${C.bold}${C.cyan}Median late/early ratio: ${medianRatio.toFixed(2)}×${C.reset}\n`);
  process.stdout.write(`${C.dim}Sessions tend to ${direction} — `);
  if (warmup > fade) {
    process.stdout.write(`${warmup} warmup vs ${fade} fadeout sessions. Claude finds its stride.${C.reset}\n`);
  } else if (fade > warmup) {
    process.stdout.write(`${fade} fadeout vs ${warmup} warmup sessions. Context fills, pace drops.${C.reset}\n`);
  } else {
    process.stdout.write(`${warmup} warmup and ${fade} fadeout — roughly balanced.${C.reset}\n`);
  }
  process.stdout.write('\n');
}

main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
