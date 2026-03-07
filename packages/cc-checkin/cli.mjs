#!/usr/bin/env node
/**
 * cc-checkin — When does your human check in?
 * Analyzes timing of user follow-up messages within sessions.
 * Shows whether humans supervise early, mid, or late — and how long they let CC run solo.
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
  process.stdout.write(`cc-checkin — When does your human check in?

Usage:
  npx cc-checkin          # User check-in timing analysis
  npx cc-checkin --json   # JSON output

Metrics:
  - Check-in position: early (0–33%) / mid (33–67%) / late (67–100%) in session
  - Trust duration: longest autonomous run before first check-in
  - Pure autonomous sessions (zero follow-ups after initial prompt)
  - Top "trust" sessions (longest before first check-in)
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
function fmtMin(min) {
  if (min >= 60) return `${(min / 60).toFixed(1)}h`;
  return `${Math.round(min)}min`;
}

const claudeDir = join(homedir(), '.claude', 'projects');

async function processFile(filePath) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    // Collect all events with timestamps and their type
    const events = [];
    let firstUserTs = null;

    rl.on('line', (line) => {
      if (!line) return;
      let d;
      try { d = JSON.parse(line); } catch { return; }

      if (!d.timestamp) return;
      const t = new Date(d.timestamp).getTime();
      if (isNaN(t)) return;

      const msg = d.message || d;
      if (!msg) return;

      if (msg.role === 'user') {
        // Check if this is a real human message (has text content, not just tool_results)
        const content = Array.isArray(msg.content) ? msg.content : [];
        const hasText = content.some(c => c && c.type === 'text');
        if (hasText) {
          if (firstUserTs === null) {
            firstUserTs = t; // mark initial prompt
          } else {
            events.push({ t, type: 'checkin' });
          }
        }
      }

      // Track all events for timeline bounds
      events.push({ t, type: 'any' });
    });

    rl.on('close', () => {
      if (firstUserTs === null) { resolve(null); return; }

      // Get timeline bounds from all events
      const allTs = events.map(e => e.t);
      if (allTs.length < 2) { resolve(null); return; }

      let minTs = allTs[0], maxTs = allTs[0];
      for (const t of allTs) { if (t < minTs) minTs = t; if (t > maxTs) maxTs = t; }

      // Use first user message as actual session start
      minTs = firstUserTs;
      const durationMs = maxTs - minTs;
      const durationMin = durationMs / 60000;

      if (durationMin < 1) { resolve(null); return; }

      // Get check-in events
      const checkins = events.filter(e => e.type === 'checkin').sort((a, b) => a.t - b.t);

      if (checkins.length === 0) {
        // Pure autonomous session (no follow-ups)
        resolve({ autonomous: true, durationMin, checkins: [] });
        return;
      }

      // Calculate relative position of each check-in (0.0 = start, 1.0 = end)
      const positions = checkins.map(c => (c.t - minTs) / durationMs);

      // First check-in position and trust duration
      const firstCheckinPos = positions[0];
      const trustDurationMin = (checkins[0].t - minTs) / 60000;

      resolve({
        autonomous: false,
        durationMin,
        checkins: positions,
        checkinCount: checkins.length,
        firstCheckinPos,
        trustDurationMin,
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
    process.stderr.write('No sessions found.\n');
    process.exit(1);
  }

  const n = sessions.length;
  const autonomous = sessions.filter(s => s.autonomous).length;
  const interactive = sessions.filter(s => !s.autonomous);

  // Check-in position analysis (for interactive sessions with valid positions)
  const allPositions = interactive.flatMap(s => s.checkins).filter(p => p >= 0 && p <= 1);
  const earlyCheckins = allPositions.filter(p => p < 0.333).length;
  const midCheckins   = allPositions.filter(p => p >= 0.333 && p < 0.667).length;
  const lateCheckins  = allPositions.filter(p => p >= 0.667).length;
  const totalCheckins = allPositions.length;

  // Trust duration: how long before first check-in (interactive sessions only)
  const trustDurations = interactive
    .filter(s => s.trustDurationMin !== undefined)
    .map(s => s.trustDurationMin)
    .sort((a, b) => a - b);

  const medianTrust = trustDurations.length > 0
    ? trustDurations[Math.floor(trustDurations.length / 2)]
    : 0;
  const maxTrust = trustDurations.length > 0 ? trustDurations[trustDurations.length - 1] : 0;

  // Top trust sessions (longest before first check-in)
  const topTrust = [...interactive]
    .filter(s => s.trustDurationMin !== undefined)
    .sort((a, b) => b.trustDurationMin - a.trustDurationMin)
    .slice(0, 3);

  // Average check-ins per interactive session
  const avgCheckins = interactive.length > 0
    ? interactive.reduce((a, s) => a + (s.checkinCount || 0), 0) / interactive.length
    : 0;

  if (jsonMode) {
    process.stdout.write(JSON.stringify({
      sessionsAnalyzed: n,
      autonomous,
      interactive: n - autonomous,
      autonomousRate: Math.round(autonomous / n * 100),
      totalCheckins,
      avgCheckinsPerInteractiveSession: Math.round(avgCheckins * 10) / 10,
      checkinTiming: {
        early: earlyCheckins,
        mid: midCheckins,
        late: lateCheckins,
      },
      trustDuration: {
        medianMin: Math.round(medianTrust),
        maxMin: Math.round(maxTrust),
      },
    }, null, 2) + '\n');
    return;
  }

  // ── Pretty output ──────────────────────────────────────────────────────────
  process.stdout.write(`\n${C.bold}${C.cyan}cc-checkin${C.reset} — When does your human check in?\n\n`);
  process.stdout.write(`${C.bold}Sessions analyzed:${C.reset} ${n.toLocaleString()}\n\n`);

  // Autonomy split
  process.stdout.write(`${C.bold}Session type${C.reset}\n`);
  const autoPct = autonomous / n;
  const intPct = (n - autonomous) / n;
  process.stdout.write(
    `  autonomous  ${C.green}${bar(autoPct, 20)}${C.reset}  ${C.bold}${(autoPct * 100).toFixed(0).padStart(3)}%${C.reset}  ${C.dim}(${autonomous})  zero follow-ups after initial prompt${C.reset}\n`
  );
  process.stdout.write(
    `  interactive ${C.blue}${bar(intPct, 20)}${C.reset}  ${C.bold}${(intPct * 100).toFixed(0).padStart(3)}%${C.reset}  ${C.dim}(${n - autonomous})  human checked in at least once${C.reset}\n`
  );
  process.stdout.write('\n');

  // Check-in timing
  if (totalCheckins > 0) {
    process.stdout.write(`${C.bold}When do check-ins happen?${C.reset}  ${C.dim}(${totalCheckins} total check-ins)${C.reset}\n`);
    const timings = [
      ['early', earlyCheckins, C.yellow, '0–33% into session — supervising startup'],
      ['mid  ', midCheckins,   C.blue,   '33–67% — checking on progress'],
      ['late ', lateCheckins,  C.purple, '67–100% — reviewing near the end'],
    ];
    for (const [label, count, color, desc] of timings) {
      const pct = count / totalCheckins;
      process.stdout.write(
        `  ${label}  ${color}${bar(pct, 22)}${C.reset}  ${C.bold}${(pct * 100).toFixed(0).padStart(3)}%${C.reset}  ${C.dim}(${count})  ${desc}${C.reset}\n`
      );
    }
    process.stdout.write('\n');
  }

  // Trust duration stats
  if (trustDurations.length > 0) {
    process.stdout.write(`${C.bold}Trust duration${C.reset}  ${C.dim}(time before first check-in)${C.reset}\n`);
    process.stdout.write(`  median   ${C.bold}${C.green}${fmtMin(medianTrust)}${C.reset}  — typical autonomous run before human checks in\n`);
    process.stdout.write(`  max      ${C.bold}${C.purple}${fmtMin(maxTrust)}${C.reset}  — longest solo run before first check-in\n`);
    process.stdout.write(`  avg/session  ${C.bold}${avgCheckins.toFixed(1)}${C.reset} check-ins in interactive sessions\n`);
    process.stdout.write('\n');
  }

  // Top trust sessions
  if (topTrust.length > 0) {
    process.stdout.write(`${C.bold}Longest trust runs${C.reset}  ${C.dim}(before first check-in)${C.reset}\n`);
    for (let i = 0; i < topTrust.length; i++) {
      const s = topTrust[i];
      const pct = Math.round(s.firstCheckinPos * 100);
      process.stdout.write(
        `  #${i + 1}  ${C.bold}${C.purple}${fmtMin(s.trustDurationMin)}${C.reset} solo  ${C.dim}— checked in at ${pct}% of session (${fmtMin(s.durationMin)} total)${C.reset}\n`
      );
    }
    process.stdout.write('\n');
  }

  // Insight
  process.stdout.write(`${C.dim}─────────────────────────────────────────────${C.reset}\n`);
  const earlyPct = totalCheckins > 0 ? (earlyCheckins / totalCheckins * 100).toFixed(0) : 0;
  process.stdout.write(`${C.bold}${C.cyan}${(autoPct * 100).toFixed(0)}% of sessions run completely uninterrupted.${C.reset}\n`);
  if (totalCheckins > 0) {
    process.stdout.write(`${C.dim}Of the check-ins that do happen, ${earlyPct}% occur in the first third of the session.${C.reset}\n`);
    process.stdout.write(`${C.dim}Median trust: ${fmtMin(medianTrust)} autonomous before the human looks in.${C.reset}\n`);
  }
  process.stdout.write('\n');
}

main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
