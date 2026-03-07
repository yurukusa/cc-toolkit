#!/usr/bin/env node
/**
 * cc-human — What does your human actually do during a session?
 * Measures human presence: pure-autonomous vs interactive sessions,
 * message frequency, and follow-up length patterns.
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
  process.stdout.write(`cc-human — What does your human actually do during a session?

Usage:
  npx cc-human          # Human presence and engagement analysis
  npx cc-human --json   # JSON output

Metrics:
  - Pure-autonomous sessions (only initial prompt, no follow-up)
  - Human message frequency per session
  - Follow-up length distribution (ack / direction / correction / briefing)
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
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

const claudeDir = join(homedir(), '.claude', 'projects');

// Accumulators
let totalSessions = 0;
let pureAutonomous = 0;   // only 1 human msg (initial prompt)
let interactive = 0;       // 2+ human msgs
const followupLengths = []; // all follow-up message lengths
const msgsPerSession = [];  // human msg count per session
const firstMsgLengths = []; // initial prompt lengths

async function processFile(filePath) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    const humanTexts = [];

    rl.on('line', (line) => {
      if (!line.includes('"user"')) return;
      let d;
      try { d = JSON.parse(line); } catch { return; }

      const msg = d.message || d;
      if (!msg || msg.role !== 'user') return;

      const content = msg.content;
      if (!Array.isArray(content)) return;

      // Extract only text blocks (skip tool_result blocks)
      const texts = [];
      for (const c of content) {
        if (!c || typeof c !== 'object') continue;
        if (c.type === 'text') {
          const t = (c.text || '').trim();
          if (t.length > 5) texts.push(t);
        }
      }
      if (texts.length > 0) {
        humanTexts.push(texts.join(' '));
      }
    });

    rl.on('close', () => {
      resolve(humanTexts);
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

  // Process in batches
  const BATCH = 16;
  for (let i = 0; i < allFiles.length; i += BATCH) {
    const batch = allFiles.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(f => processFile(f)));
    for (const humanTexts of results) {
      if (humanTexts.length === 0) continue;
      totalSessions++;
      msgsPerSession.push(humanTexts.length);
      firstMsgLengths.push(humanTexts[0].length);

      if (humanTexts.length === 1) {
        pureAutonomous++;
      } else {
        interactive++;
        for (let j = 1; j < humanTexts.length; j++) {
          followupLengths.push(humanTexts[j].length);
        }
      }
    }
  }

  if (totalSessions === 0) {
    process.stderr.write('No sessions found.\n');
    process.exit(1);
  }

  // Compute stats
  msgsPerSession.sort((a, b) => a - b);
  firstMsgLengths.sort((a, b) => a - b);
  followupLengths.sort((a, b) => a - b);

  const medMsgs = msgsPerSession[Math.floor(msgsPerSession.length / 2)];
  const meanMsgs = msgsPerSession.reduce((a, b) => a + b, 0) / msgsPerSession.length;
  const maxMsgs = msgsPerSession[msgsPerSession.length - 1];

  const medFirst = firstMsgLengths[Math.floor(firstMsgLengths.length / 2)];
  const meanFirst = Math.round(firstMsgLengths.reduce((a, b) => a + b, 0) / firstMsgLengths.length);

  const autoPct = pureAutonomous / totalSessions;
  const interPct = interactive / totalSessions;

  // Follow-up length categories
  const fTotal = followupLengths.length;
  const fAck     = followupLengths.filter(x => x < 30).length;   // "ok" "done" "yes"
  const fShort   = followupLengths.filter(x => x >= 30 && x < 150).length;  // brief direction
  const fMedium  = followupLengths.filter(x => x >= 150 && x < 600).length; // correction
  const fLong    = followupLengths.filter(x => x >= 600).length;             // big briefing
  const medFollowup = fTotal > 0 ? followupLengths[Math.floor(fTotal / 2)] : 0;

  if (jsonMode) {
    process.stdout.write(JSON.stringify({
      totalSessions,
      pureAutonomous,
      interactive,
      autoPct: Math.round(autoPct * 1000) / 10,
      interPct: Math.round(interPct * 1000) / 10,
      msgsPerSession: { median: medMsgs, mean: Math.round(meanMsgs * 10) / 10, max: maxMsgs },
      initialPrompt: { medianChars: medFirst, meanChars: meanFirst },
      followupMessages: {
        total: fTotal,
        medianChars: medFollowup,
        ack: fAck, short: fShort, medium: fMedium, long: fLong,
      },
    }, null, 2) + '\n');
    return;
  }

  // ── Pretty output ────────────────────────────────────────────────────────
  const w = (s, n) => s.padEnd(n);

  process.stdout.write(`\n${C.bold}${C.cyan}cc-human${C.reset} — What does your human actually do?\n\n`);

  process.stdout.write(`${C.bold}Sessions analyzed:${C.reset} ${humanNum(totalSessions)}\n\n`);

  // Autonomy split
  process.stdout.write(`${C.bold}Human engagement split${C.reset}\n`);
  process.stdout.write(`  ${C.green}${bar(autoPct, 30)}${C.reset} ${C.bold}${(autoPct * 100).toFixed(1)}%${C.reset}  pure-autonomous  (initial prompt only, CC does the rest)\n`);
  process.stdout.write(`  ${C.yellow}${bar(interPct, 30)}${C.reset} ${C.bold}${(interPct * 100).toFixed(1)}%${C.reset}  interactive      (human sends follow-up messages)\n`);
  process.stdout.write(`\n`);

  // Message stats
  process.stdout.write(`${C.bold}Human messages per session${C.reset}\n`);
  process.stdout.write(`  median  ${C.bold}${medMsgs}${C.reset} msg  |  mean ${meanMsgs.toFixed(1)}  |  max ${maxMsgs}\n`);
  process.stdout.write(`\n`);

  // Initial prompt length
  process.stdout.write(`${C.bold}Initial prompt length${C.reset}\n`);
  process.stdout.write(`  median ${C.bold}${medFirst}${C.reset} chars  |  mean ${meanFirst} chars\n`);
  process.stdout.write(`\n`);

  // Follow-up breakdown
  if (fTotal > 0) {
    process.stdout.write(`${C.bold}Follow-up message types${C.reset}  (${humanNum(fTotal)} total, median ${medFollowup} chars)\n`);
    const rows = [
      ['ack      ', fAck,    fAck / fTotal,    'ok / yes / done / 👍           (<30 chars)'],
      ['direction', fShort,  fShort / fTotal,  'brief instructions or feedback  (30–149)'],
      ['correction',fMedium, fMedium / fTotal, 'multi-sentence correction       (150–599)'],
      ['briefing ', fLong,   fLong / fTotal,   'long task or context dump       (600+)'],
    ];
    for (const [label, count, pct, desc] of rows) {
      const bColor = pct > 0.5 ? C.green : pct > 0.2 ? C.yellow : C.dim;
      process.stdout.write(
        `  ${label}  ${bColor}${bar(pct, 20)}${C.reset}  ${C.bold}${(pct * 100).toFixed(0).padStart(3)}%${C.reset}  ${C.dim}(${count})${C.reset}  ${C.dim}${desc}${C.reset}\n`
      );
    }
    process.stdout.write(`\n`);
  }

  // Insight
  process.stdout.write(`${C.dim}─────────────────────────────────────────────${C.reset}\n`);
  if (autoPct >= 0.6) {
    process.stdout.write(`${C.green}${C.bold}${(autoPct * 100).toFixed(0)}% of sessions: human writes once and walks away.${C.reset}\n`);
    process.stdout.write(`${C.dim}Claude Code runs the rest autonomously.${C.reset}\n`);
  } else if (autoPct >= 0.4) {
    process.stdout.write(`${C.yellow}${C.bold}${(autoPct * 100).toFixed(0)}% pure-autonomous${C.reset}${C.dim} — growing toward hands-free.${C.reset}\n`);
  } else {
    process.stdout.write(`${C.yellow}${C.bold}${(interPct * 100).toFixed(0)}% of sessions are interactive.${C.reset}\n`);
    process.stdout.write(`${C.dim}Your human is actively involved. That's fine too.${C.reset}\n`);
  }
  process.stdout.write(`\n`);
}

main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
