#!/usr/bin/env node

// cc-health-check — CLI diagnostic for Claude Code setups
// Automatically detects settings, hooks, and patterns to score your setup.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const CC_DIR = join(HOME, '.claude');
const SETTINGS_PATH = join(CC_DIR, 'settings.json');

// ─── Color helpers (no dependencies) ───
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

const PASS = `${c.green}[PASS]${c.reset}`;
const WARN = `${c.yellow}[WARN]${c.reset}`;
const FAIL = `${c.red}[FAIL]${c.reset}`;
const INFO = `${c.cyan}[INFO]${c.reset}`;

// ─── Utility ───
function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function fileContains(path, patterns) {
  try {
    const content = readFileSync(path, 'utf-8').toLowerCase();
    return patterns.some(p => content.includes(p.toLowerCase()));
  } catch {
    return false;
  }
}

function findFilesRecursive(dir, maxDepth = 3, depth = 0) {
  if (depth > maxDepth || !existsSync(dir)) return [];
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isFile()) files.push(full);
        else if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
          files.push(...findFilesRecursive(full, maxDepth, depth + 1));
        }
      } catch { /* permission denied, skip */ }
    }
  } catch { /* permission denied, skip */ }
  return files;
}

function getHookScripts(settings, eventType) {
  if (!settings?.hooks) return [];
  const hooks = settings.hooks[eventType];
  if (!hooks) return [];
  return (Array.isArray(hooks) ? hooks : [hooks])
    .map(h => typeof h === 'string' ? h : h?.command || h?.script || '')
    .filter(Boolean);
}

function getAllHookCommands(settings) {
  if (!settings?.hooks) return [];
  const all = [];
  for (const [event, matchers] of Object.entries(settings.hooks)) {
    // Claude Code format: { EventName: [{ matcher: "", hooks: [{ type, command }] }] }
    const matcherList = Array.isArray(matchers) ? matchers : [matchers];
    for (const matcher of matcherList) {
      if (matcher?.hooks && Array.isArray(matcher.hooks)) {
        for (const h of matcher.hooks) {
          const cmd = h?.command || h?.script || '';
          if (cmd) all.push({ event, command: cmd });
        }
      } else {
        // Fallback: flat format { EventName: [{ command: "..." }] }
        const cmd = typeof matcher === 'string' ? matcher : matcher?.command || matcher?.script || '';
        if (cmd) all.push({ event, command: cmd });
      }
    }
  }
  return all;
}

// ─── Load environment ───
const settings = readJSON(SETTINGS_PATH);
const allHooks = settings ? getAllHookCommands(settings) : [];
const allHookText = allHooks.map(h => h.command).join('\n').toLowerCase();

// Find CLAUDE.md files
const claudeMdPaths = [
  join(HOME, 'CLAUDE.md'),
  join(HOME, '.claude', 'CLAUDE.md'),
];
// Also check current directory
const cwd = process.cwd();
if (cwd !== HOME) {
  claudeMdPaths.push(join(cwd, 'CLAUDE.md'));
  claudeMdPaths.push(join(cwd, '.claude', 'CLAUDE.md'));
}
const claudeMdContents = claudeMdPaths
  .filter(p => existsSync(p))
  .map(p => readFileSync(p, 'utf-8').toLowerCase())
  .join('\n');

// Check for common files
const hasMemoryDir = existsSync(join(CC_DIR, 'memory')) || existsSync(join(CC_DIR, 'projects'));
const hasMissionMd = existsSync(join(HOME, 'ops', 'mission.md')) ||
  existsSync(join(cwd, 'mission.md')) ||
  existsSync(join(cwd, 'tasks', 'todo.md'));

// ─── 20 Checks ───
const checks = [
  // === SAFETY (4 checks, 5pts each = 20) ===
  {
    cat: 'Safety Guards',
    q: 'PreToolUse hook blocks dangerous commands (rm -rf, git reset --hard)',
    w: 5,
    test() {
      const preHooks = allHooks.filter(h => h.event.toLowerCase().includes('pretooluse'));
      if (preHooks.length === 0) return { pass: false, detail: 'No PreToolUse hooks found' };
      const hasGuard = preHooks.some(h => {
        const cmd = h.command.toLowerCase();
        return cmd.includes('rm') || cmd.includes('guard') || cmd.includes('safe') ||
          cmd.includes('block') || cmd.includes('deny') || cmd.includes('cdp');
      });
      // Also check if hook scripts contain safety patterns
      const scriptFiles = preHooks.map(h => {
        const parts = h.command.split(/\s+/);
        return parts.find(p => p.endsWith('.sh') || p.endsWith('.js') || p.endsWith('.py'));
      }).filter(Boolean);

      for (const sf of scriptFiles) {
        const fullPath = sf.startsWith('/') ? sf : join(HOME, sf);
        if (fileContains(fullPath, ['rm -rf', 'reset --hard', 'force', 'block', 'deny', 'BLOCK'])) {
          return { pass: true, detail: `Safety hook found: ${sf}` };
        }
      }
      return hasGuard
        ? { pass: true, detail: `${preHooks.length} PreToolUse hook(s) with safety patterns` }
        : { pass: false, detail: `${preHooks.length} PreToolUse hook(s) found but no safety patterns detected` };
    },
    fix: 'Add a PreToolUse hook that blocks destructive commands. A single shell script can catch rm -rf, force push, and database drops.',
    hook: 'hooks/branch-guard.sh',
  },
  {
    cat: 'Safety Guards',
    q: 'API keys stored in dedicated files (not hardcoded in CLAUDE.md)',
    w: 5,
    test() {
      const hasSecrets = claudeMdContents.match(/sk-[a-z0-9]{20,}|ghp_[a-z0-9]{36}|token\s*[:=]\s*["\'][^"\']{20,}/i);
      if (hasSecrets) return { pass: false, detail: 'Possible API key found in CLAUDE.md' };
      const hasCredFile = existsSync(join(HOME, '.credentials')) ||
        existsSync(join(HOME, '.env')) ||
        existsSync(join(HOME, '.secrets'));
      return { pass: true, detail: hasCredFile ? 'Credentials stored in dedicated file' : 'No leaked keys detected in CLAUDE.md' };
    },
    fix: 'Move API keys out of CLAUDE.md into ~/.credentials or environment variables.',
    hook: 'templates/CLAUDE-autonomous.md',
  },
  {
    cat: 'Safety Guards',
    q: 'Setup prevents pushing to main/master without review',
    w: 5,
    test() {
      const hasBranchGuard = allHookText.includes('main') || allHookText.includes('master') ||
        allHookText.includes('branch') || allHookText.includes('push');
      const claudeHasRule = claudeMdContents.includes('feature branch') ||
        claudeMdContents.includes('push') && claudeMdContents.includes('main');
      return (hasBranchGuard || claudeHasRule)
        ? { pass: true, detail: 'Branch protection detected' }
        : { pass: false, detail: 'No branch protection rules found' };
    },
    fix: 'Add a PreToolUse hook that checks the target branch before git push. Block direct pushes to main/master.',
    hook: 'hooks/branch-guard.sh',
  },
  {
    cat: 'Safety Guards',
    q: 'Error-aware gate blocks external calls when errors exist',
    w: 5,
    test() {
      const hasErrGate = allHookText.includes('error') || allHookText.includes('err-tracker') ||
        allHookText.includes('err_code');
      const claudeHasErrRule = claudeMdContents.includes('error') && claudeMdContents.includes('block');
      return (hasErrGate || claudeHasErrRule)
        ? { pass: true, detail: 'Error-aware gating detected' }
        : { pass: false, detail: 'No error-aware gate found' };
    },
    fix: 'Add an error-tracker that prevents publishing or pushing when unresolved errors exist.',
    hook: 'hooks/error-gate.sh',
  },

  // === QUALITY (4 checks, 5pts each = 20) ===
  {
    cat: 'Code Quality',
    q: 'Syntax checks run after every file edit (PostToolUse hook)',
    w: 5,
    test() {
      const postHooks = allHooks.filter(h => h.event.toLowerCase().includes('posttooluse'));
      const hasSyntax = postHooks.some(h => {
        const cmd = h.command.toLowerCase();
        return cmd.includes('syntax') || cmd.includes('compile') || cmd.includes('lint') ||
          cmd.includes('py_compile') || cmd.includes('eslint') || cmd.includes('check');
      });
      return hasSyntax
        ? { pass: true, detail: 'Post-edit syntax checking configured' }
        : { pass: false, detail: 'No syntax check hook found in PostToolUse' };
    },
    fix: 'Add a PostToolUse hook on Edit/Write that runs language-specific syntax checks (py_compile, eslint, bash -n).',
    hook: 'hooks/syntax-check.sh',
  },
  {
    cat: 'Code Quality',
    q: 'Error detection and tracking from command output',
    w: 5,
    test() {
      const hasErrDetect = allHookText.includes('error') || allHookText.includes('stderr') ||
        allHookText.includes('exit_code') || allHookText.includes('err-code');
      return hasErrDetect
        ? { pass: true, detail: 'Error detection patterns found in hooks' }
        : { pass: false, detail: 'No error detection in command output' };
    },
    fix: 'Scan bash output for error patterns in PostToolUse hooks. Track repeated errors and escalate.',
    hook: 'hooks/activity-logger.sh',
  },
  {
    cat: 'Code Quality',
    q: 'Definition of Done (DoD) checklist exists for task completion',
    w: 5,
    test() {
      const hasDod = claudeMdContents.includes('definition of done') || claudeMdContents.includes('dod') ||
        claudeMdContents.includes('done checklist') || claudeMdContents.includes('completion criteria');
      const dodFile = existsSync(join(CC_DIR, 'dod-checklists.md')) ||
        existsSync(join(cwd, 'dod-checklists.md'));
      return (hasDod || dodFile)
        ? { pass: true, detail: 'DoD criteria found' }
        : { pass: false, detail: 'No Definition of Done checklist detected' };
    },
    fix: 'Define what "done" means: tests pass, no open errors, syntax clean, docs updated.',
    hook: 'templates/dod-checklists.md',
  },
  {
    cat: 'Code Quality',
    q: 'AI verifies its own output (screenshots, GET requests after publishing)',
    w: 5,
    test() {
      const hasVerify = claudeMdContents.includes('verify') || claudeMdContents.includes('screenshot') ||
        claudeMdContents.includes('confirmation') || claudeMdContents.includes('proof');
      return hasVerify
        ? { pass: true, detail: 'Output verification instructions found' }
        : { pass: false, detail: 'No output verification pattern detected' };
    },
    fix: 'Add verification steps to your workflow: after publishing or deploying, confirm the result matches expectations.',
    hook: 'templates/CLAUDE-autonomous.md',
  },

  // === MONITORING (3 checks, 5pts each = 15) ===
  {
    cat: 'Monitoring',
    q: 'Context window usage monitored with alerts before it fills up',
    w: 5,
    test() {
      const hasContextMon = allHookText.includes('context') || allHookText.includes('compact') ||
        allHookText.includes('token');
      return hasContextMon
        ? { pass: true, detail: 'Context window monitoring detected' }
        : { pass: false, detail: 'No context window monitoring' };
    },
    fix: 'Add a PostToolUse hook that checks context percentage and alerts before it fills up. Auto-compact at critical levels.',
    hook: 'hooks/context-monitor.sh',
  },
  {
    cat: 'Monitoring',
    q: 'Activity logging tracks what commands ran, when, and what changed',
    w: 5,
    test() {
      const hasActivityLog = allHookText.includes('activity') || allHookText.includes('log') ||
        allHookText.includes('jsonl') || allHookText.includes('audit');
      return hasActivityLog
        ? { pass: true, detail: 'Activity logging detected' }
        : { pass: false, detail: 'No activity logging configured' };
    },
    fix: 'Add a PostToolUse hook that logs every tool use to a JSONL file with timestamps.',
    hook: 'hooks/activity-logger.sh',
  },
  {
    cat: 'Monitoring',
    q: 'Daily summaries of AI work are generated (proof-log, session reports)',
    w: 5,
    test() {
      const hasProofLog = allHookText.includes('proof') || allHookText.includes('summary') ||
        allHookText.includes('session') || allHookText.includes('digest');
      const proofLogDir = existsSync(join(HOME, 'ops', 'proof-log'));
      return (hasProofLog || proofLogDir)
        ? { pass: true, detail: 'Daily summarization configured' }
        : { pass: false, detail: 'No daily summary generation' };
    },
    fix: 'Write a Stop hook that generates a 5W1H summary at session end. Makes handoffs and audits trivial.',
    hook: 'hooks/proof-log-session.sh',
  },

  // === RECOVERY (3 checks, 5pts each = 15) ===
  {
    cat: 'Recovery',
    q: 'Git backup branches created before major changes',
    w: 5,
    test() {
      const hasBackup = claudeMdContents.includes('backup') || claudeMdContents.includes('backup/before');
      return hasBackup
        ? { pass: true, detail: 'Backup branch instructions found in CLAUDE.md' }
        : { pass: false, detail: 'No backup branch strategy detected' };
    },
    fix: 'Add "git checkout -b backup/before-changes" to your CLAUDE.md instructions before risky operations.',
    hook: 'templates/CLAUDE-autonomous.md',
  },
  {
    cat: 'Recovery',
    q: 'Watchdog detects and recovers from hangs/idle states',
    w: 5,
    test() {
      const hasWatchdog = allHookText.includes('watchdog') || allHookText.includes('idle') ||
        allHookText.includes('nudge') || allHookText.includes('heartbeat');
      // Check for common watchdog scripts
      const watchdogExists = existsSync(join(HOME, 'bin', 'cc-solo-watchdog')) ||
        existsSync(join(HOME, '.claude', 'cc-solo-watchdog'));
      return (hasWatchdog || watchdogExists)
        ? { pass: true, detail: 'Watchdog mechanism detected' }
        : { pass: false, detail: 'No watchdog for hang/idle detection' };
    },
    fix: 'Implement a tmux-based watchdog that detects idle/frozen states and automatically nudges or restarts the agent.',
    hook: 'hooks/session-start-marker.sh',
  },
  {
    cat: 'Recovery',
    q: 'Fallback plan exists for when AI gets stuck in a loop',
    w: 5,
    test() {
      const hasLoopDetect = claudeMdContents.includes('loop') || claudeMdContents.includes('retry') ||
        claudeMdContents.includes('3 times') || claudeMdContents.includes('escalat');
      const hasRootCause = allHookText.includes('root-cause') || allHookText.includes('loop');
      return (hasLoopDetect || hasRootCause)
        ? { pass: true, detail: 'Loop detection / retry limits found' }
        : { pass: false, detail: 'No loop detection or retry limits' };
    },
    fix: 'Track repeated command patterns. If the same error appears 3+ times, break the loop and escalate.',
    hook: 'templates/LESSONS.md',
  },

  // === AUTONOMY (3 checks, 5pts each = 15) ===
  {
    cat: 'Autonomy',
    q: 'AI can run tasks from a queue without human prompting',
    w: 5,
    test() {
      const hasQueue = existsSync(join(HOME, 'ops', 'task-queue.yaml')) ||
        existsSync(join(cwd, 'task-queue.yaml')) ||
        existsSync(join(cwd, 'tasks', 'todo.md'));
      const claudeHasQueue = claudeMdContents.includes('task queue') || claudeMdContents.includes('task-queue');
      return (hasQueue || claudeHasQueue)
        ? { pass: true, detail: 'Task queue mechanism found' }
        : { pass: false, detail: 'No task queue for autonomous execution' };
    },
    fix: 'Create a task-queue.yaml with status tracking (pending/in-progress/done) that the AI reads and executes.',
    hook: 'templates/task-queue.yaml',
  },
  {
    cat: 'Autonomy',
    q: 'Setup blocks the AI from asking unnecessary questions',
    w: 5,
    test() {
      const hasNoAsk = allHookText.includes('no-ask') || allHookText.includes('question') ||
        claudeMdContents.includes("don't ask") || claudeMdContents.includes('質問') ||
        claudeMdContents.includes('自分で判断');
      return hasNoAsk
        ? { pass: true, detail: 'Question-blocking rules detected' }
        : { pass: false, detail: 'No rules to prevent unnecessary questions' };
    },
    fix: 'Add a hook or CLAUDE.md rule that redirects question-asking patterns to autonomous decision-making.',
    hook: 'hooks/no-ask-human.sh',
  },
  {
    cat: 'Autonomy',
    q: 'AI can continue working across session restarts (persistent state)',
    w: 5,
    test() {
      const hasPersist = hasMemoryDir || hasMissionMd ||
        claudeMdContents.includes('memory') || claudeMdContents.includes('mission.md') ||
        claudeMdContents.includes('persistent');
      return hasPersist
        ? { pass: true, detail: 'State persistence mechanism found' }
        : { pass: false, detail: 'No persistent state mechanism' };
    },
    fix: 'Use mission.md or MEMORY.md to maintain state across context compactions and session restarts.',
    hook: 'templates/mission.md',
  },

  // === COORDINATION (3 checks, 5+3+2 = 10) ===
  {
    cat: 'Coordination',
    q: 'Decision audit trail logs why each decision was made',
    w: 5,
    test() {
      const hasDecLog = allHookText.includes('decision') || allHookText.includes('rationale') ||
        existsSync(join(HOME, 'ops', 'decision-log.jsonl'));
      return hasDecLog
        ? { pass: true, detail: 'Decision logging found' }
        : { pass: false, detail: 'No decision audit trail' };
    },
    fix: 'Track decisions with rationale — what was decided, why, and what alternatives were rejected.',
    hook: 'hooks/decision-warn.sh',
  },
  {
    cat: 'Coordination',
    q: 'AI can coordinate with other AI instances or tools',
    w: 3,
    test() {
      const hasCoord = claudeMdContents.includes('multi-agent') || claudeMdContents.includes('codex') ||
        claudeMdContents.includes('team') || claudeMdContents.includes('subagent') ||
        allHookText.includes('relay') || allHookText.includes('tachikoma');
      return hasCoord
        ? { pass: true, detail: 'Multi-agent coordination found' }
        : { pass: false, detail: 'No multi-agent coordination' };
    },
    fix: 'Enable file-based or tmux-based messaging between AI instances for parallel work.',
    hook: 'templates/CLAUDE-autonomous.md',
  },
  {
    cat: 'Coordination',
    q: 'Structured way to capture and reuse lessons learned',
    w: 2,
    test() {
      const hasLessons = existsSync(join(cwd, 'tasks', 'lessons.md')) ||
        existsSync(join(cwd, 'LESSONS.md')) ||
        claudeMdContents.includes('lesson') || claudeMdContents.includes('教訓');
      return hasLessons
        ? { pass: true, detail: 'Lesson capture mechanism found' }
        : { pass: false, detail: 'No structured lesson capture' };
    },
    fix: 'Maintain a LESSONS.md file to log errors and their fixes for future reference.',
    hook: 'templates/LESSONS.md',
  },
];

// ─── Run all checks ───
function runChecks() {
  const totalPts = checks.reduce((s, ch) => s + ch.w, 0);
  let earned = 0;
  const results = [];
  const dimScores = {};
  const dimTotals = {};

  for (const ch of checks) {
    if (!dimScores[ch.cat]) {
      dimScores[ch.cat] = 0;
      dimTotals[ch.cat] = 0;
    }
    dimTotals[ch.cat] += ch.w;
    const result = ch.test();
    const pts = result.pass ? ch.w : 0;
    earned += pts;
    dimScores[ch.cat] += pts;
    results.push({ cat: ch.cat, q: ch.q, w: ch.w, fix: ch.fix, hook: ch.hook, result, pts });
  }

  const pct = Math.round((earned / totalPts) * 100);
  let grade;
  if (pct >= 80) grade = 'Production Ready';
  else if (pct >= 60) grade = 'Getting There';
  else if (pct >= 35) grade = 'Needs Work';
  else grade = 'Critical';

  return { results, dimScores, dimTotals, earned, totalPts, pct, grade };
}

function printHuman(data) {
  const { results, dimScores, dimTotals, earned, totalPts, pct, grade } = data;

  console.log('');
  console.log(`${c.bold}${c.cyan}  Claude Code Health Check v1.0${c.reset}`);
  console.log(`${c.dim}  ═══════════════════════════════════════${c.reset}`);
  console.log(`${c.dim}  Scanning: ${CC_DIR}${c.reset}`);
  console.log('');

  let currentCat = '';
  for (const r of results) {
    if (r.cat !== currentCat) {
      currentCat = r.cat;
      console.log(`  ${c.bold}${c.magenta}▸ ${r.cat}${c.reset}`);
    }
    const icon = r.result.pass ? PASS : FAIL;
    console.log(`    ${icon} ${r.q}`);
    if (!r.result.pass) {
      console.log(`         ${c.dim}${r.result.detail}${c.reset}`);
    }
  }

  let gradeColor;
  if (pct >= 80) gradeColor = c.green;
  else if (pct >= 60) gradeColor = c.yellow;
  else gradeColor = c.red;

  console.log('');
  console.log(`  ${c.dim}───────────────────────────────────────${c.reset}`);
  console.log(`  ${c.bold}Score: ${gradeColor}${pct}/100 — ${grade}${c.reset}`);
  console.log(`  ${c.dim}(${earned}/${totalPts} points)${c.reset}`);
  console.log('');

  console.log(`  ${c.bold}Dimensions:${c.reset}`);
  for (const [cat, total] of Object.entries(dimTotals)) {
    const score = dimScores[cat];
    const dimPct = Math.round((score / total) * 100);
    const barLen = 20;
    const filled = Math.round((dimPct / 100) * barLen);
    let barColor = c.green;
    if (dimPct < 60) barColor = c.yellow;
    if (dimPct < 34) barColor = c.red;
    const bar = barColor + '█'.repeat(filled) + c.dim + '░'.repeat(barLen - filled) + c.reset;
    console.log(`    ${bar} ${cat} ${dimPct}%`);
  }
  console.log('');

  const failures = results.filter(r => !r.result.pass).sort((a, b) => b.w - a.w);
  if (failures.length > 0) {
    console.log(`  ${c.bold}Top fixes:${c.reset}`);
    for (const f of failures.slice(0, 5)) {
      console.log(`    ${c.yellow}→${c.reset} ${f.fix}`);
      if (f.hook) {
        const url = `https://github.com/yurukusa/claude-code-hooks/blob/main/${f.hook}`;
        console.log(`      ${c.dim}↳ ${url}${c.reset}`);
      }
    }
    console.log('');
    console.log(`  ${c.cyan}Production hooks + templates for autonomous Claude Code:${c.reset}`);
    console.log(`  ${c.bold}https://yurukusa.gumroad.com/l/cc-codex-ops-kit${c.reset}`);
    console.log(`  ${c.dim}10 hooks + 5 templates covering 18/20 checks. From 108 hours of real autonomous operation.${c.reset}`);
  } else {
    console.log(`  ${c.green}${c.bold}All 20 checks passed! Your setup is production-ready.${c.reset}`);
  }

  console.log('');
  const dims = Object.entries(dimTotals).map(([cat, total]) => {
    const dimPct = Math.round((dimScores[cat] / total) * 100);
    return `${cat}: ${dimPct}%`;
  }).join(' | ');
  console.log(`  ${c.dim}Share: "My Claude Code Health Score: ${pct}/100 (${dims})" #ClaudeCode${c.reset}`);
  console.log('');
}

function printJSON(data) {
  const { results, dimScores, dimTotals, earned, totalPts, pct, grade } = data;
  const output = {
    version: '1.0',
    score: pct,
    grade,
    points: { earned, total: totalPts },
    dimensions: {},
    checks: [],
  };
  for (const [cat, total] of Object.entries(dimTotals)) {
    output.dimensions[cat] = {
      score: dimScores[cat],
      total,
      percent: Math.round((dimScores[cat] / total) * 100),
    };
  }
  for (const r of results) {
    output.checks.push({
      dimension: r.cat,
      check: r.q,
      pass: r.result.pass,
      detail: r.result.detail,
      weight: r.w,
      fix: r.result.pass ? undefined : r.fix,
      hook: r.result.pass ? undefined : r.hook,
    });
  }
  console.log(JSON.stringify(output, null, 2));
}

function printBadge(data) {
  const { pct, grade } = data;
  let color = 'brightgreen';
  if (pct < 80) color = 'yellow';
  if (pct < 60) color = 'orange';
  if (pct < 35) color = 'red';
  const label = encodeURIComponent('Claude Code Health');
  const msg = encodeURIComponent(`${pct}% — ${grade}`);
  const url = `https://img.shields.io/badge/${label}-${msg}-${color}`;
  console.log(url);
  console.log('');
  console.log(`Markdown: ![Claude Code Health](${url})`);
}

// ─── Main ───
const jsonMode = process.argv.includes('--json');
const badgeMode = process.argv.includes('--badge');
const data = runChecks();
if (jsonMode) {
  printJSON(data);
} else if (badgeMode) {
  printBadge(data);
} else {
  printHuman(data);
}
process.exit(data.pct >= 60 ? 0 : 1);
