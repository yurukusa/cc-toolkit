#!/usr/bin/env node
/**
 * cc-alert — Streak risk notifier for Claude Code
 *
 * Checks whether you've coded today and warns you before your streak dies.
 * Designed to run as a cron job (e.g., every evening at 8pm).
 *
 * Exit codes:
 *   0 — streak is safe (you coded today)
 *   1 — streak at risk (no activity today, and you have a streak to lose)
 *   2 — no streak (nothing to protect)
 *   3 — data load error
 *
 * Usage:
 *   npx cc-alert                   # Check and print status
 *   npx cc-alert --notify          # Also send OS notification
 *   npx cc-alert --json            # Machine-readable output
 *   npx cc-alert --quiet           # Exit code only, no output
 *
 * Cron example (warn at 8pm every day):
 *   0 20 * * * /usr/bin/npx cc-alert --notify
 *
 * Or in your shell profile (warns when you open terminal after 6pm):
 *   [ $(date +%H) -ge 18 ] && npx cc-alert
 */

import { execFileSync, execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

const HOME = homedir();

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const helpFlag  = args.includes('--help')  || args.includes('-h');
const jsonFlag  = args.includes('--json');
const quietFlag = args.includes('--quiet') || args.includes('-q');
const notifyFlag= args.includes('--notify');

if (helpFlag) {
  console.log(`
  cc-alert — Streak risk notifier for Claude Code

  Usage:
    cc-alert               # Check and print status
    cc-alert --notify      # Also send OS notification (macOS/Linux/WSL)
    cc-alert --json        # Machine-readable output
    cc-alert --quiet       # Exit code only, no output

  Exit codes:
    0 — streak safe (coded today)
    1 — streak at risk (no activity today, you have a streak)
    2 — no streak (nothing to lose)
    3 — data load error

  Cron example (check every day at 8pm):
    0 20 * * * /usr/bin/npx cc-alert --notify
  `);
  process.exit(0);
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

// ── Load data ─────────────────────────────────────────────────────────────────
function loadData() {
  const paths = [
    ['cc-agent-load', ['--json']],
    [join(HOME, 'bin', 'cc-agent-load'), ['--json']],
  ];
  for (const [cmd, cmdArgs] of paths) {
    try {
      const out = execFileSync(cmd, cmdArgs, { encoding: 'utf8', timeout: 30000 });
      const json = JSON.parse(out);
      if (json.byDate) return json;
    } catch {}
  }
  return null;
}

// ── Compute streak ────────────────────────────────────────────────────────────
function computeStreak(byDate, today) {
  let streak = 0;
  let d = addDays(today, -1); // start from yesterday
  while (byDate[d]) {
    const v = byDate[d];
    const active = typeof v === 'object' ? (v.main || 0) + (v.sub || 0) : (v || 0);
    if (active === 0) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

// ── OS notification ───────────────────────────────────────────────────────────
function sendNotification(title, body) {
  try {
    const os = platform();
    if (os === 'darwin') {
      execSync(`osascript -e 'display notification "${body}" with title "${title}"'`, { stdio: 'ignore' });
    } else if (os === 'linux') {
      // Try WSL2 PowerShell first, then notify-send
      try {
        execSync(`powershell.exe -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('${body}', '${title}')" 2>/dev/null`, { stdio: 'ignore', timeout: 5000 });
      } catch {
        execSync(`notify-send "${title}" "${body}" 2>/dev/null`, { stdio: 'ignore', timeout: 3000 });
      }
    }
  } catch {
    // Notification failed silently — don't crash the tool
  }
}

// ── ANSI ──────────────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[92m',
  yellow: '\x1b[93m',
  red:    '\x1b[91m',
  orange: '\x1b[33m',
  cyan:   '\x1b[96m',
};

// ── Main ──────────────────────────────────────────────────────────────────────
const data = loadData();

if (!data?.byDate) {
  if (!quietFlag) {
    if (jsonFlag) {
      console.log(JSON.stringify({ error: 'Could not load cc-agent-load data', exitCode: 3 }));
    } else {
      console.error('cc-alert: Could not load data. Install: npm i -g cc-agent-load');
    }
  }
  process.exit(3);
}

const today = localToday();
const byDate = data.byDate;

// Check today's activity
const todayEntry = byDate[today];
const todayMain = todayEntry ? (typeof todayEntry === 'object' ? (todayEntry.main || 0) : 0) : 0;
const todaySub  = todayEntry ? (typeof todayEntry === 'object' ? (todayEntry.sub  || 0) : (todayEntry || 0)) : 0;
const codedToday = todayMain > 0 || todaySub > 0;

// Compute streak (from yesterday backwards, to see what's at risk)
const streakAtRisk = computeStreak(byDate, today);

// Determine status
let status, exitCode;
if (codedToday) {
  status = 'safe';
  exitCode = 0;
} else if (streakAtRisk > 0) {
  status = 'at_risk';
  exitCode = 1;
} else {
  status = 'no_streak';
  exitCode = 2;
}

// Current streak (including today if coded)
const currentStreak = codedToday ? streakAtRisk + 1 : streakAtRisk;

// Output
if (!quietFlag) {
  if (jsonFlag) {
    console.log(JSON.stringify({
      today,
      codedToday,
      todayMain: +todayMain.toFixed(2),
      todaySub:  +todaySub.toFixed(2),
      streakAtRisk,
      currentStreak,
      status,
      exitCode,
    }));
  } else {
    console.log('');
    if (status === 'safe') {
      console.log(`  ${C.green}${C.bold}✓ Streak safe${C.reset}  ${C.dim}${today}${C.reset}`);
      console.log(`  ${currentStreak} day streak · ${todayMain.toFixed(1)}h you + ${todaySub.toFixed(1)}h AI today`);
      if (todaySub > 0 && todayMain === 0) {
        console.log(`  ${C.cyan}  (Ghost Day — AI worked, you rested)${C.reset}`);
      }
    } else if (status === 'at_risk') {
      console.log(`  ${C.red}${C.bold}⚠ STREAK AT RISK${C.reset}  ${C.dim}${today}${C.reset}`);
      console.log(`  Your ${C.bold}${streakAtRisk}-day streak${C.reset} ends today if you don't open Claude Code.`);
      console.log(`  ${C.dim}No activity recorded yet today.${C.reset}`);
    } else {
      console.log(`  ${C.dim}No active streak${C.reset}  ${C.dim}${today}${C.reset}`);
      console.log(`  Start a streak by opening Claude Code today.`);
    }
    console.log('');
  }
}

// Send OS notification if requested and at risk
if (notifyFlag && status === 'at_risk') {
  sendNotification(
    'Claude Code Streak At Risk',
    `Your ${streakAtRisk}-day streak ends today if you don't code.`
  );
}

process.exit(exitCode);
