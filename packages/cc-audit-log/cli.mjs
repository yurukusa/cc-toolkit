#!/usr/bin/env node

// cc-audit-log — See what your Claude Code actually did.
// Reads session transcript JSONL files and generates a human-readable audit trail.
// Zero dependencies. No data sent anywhere. Runs entirely local.

import { readdir, stat, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

// --- Color helpers (no deps) ---
const C = process.stdout.isTTY ? {
  bold: '\x1b[1m', dim: '\x1b[2m', reset: '\x1b[0m',
  cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m',
  red: '\x1b[31m', magenta: '\x1b[35m', white: '\x1b[37m',
} : { bold:'',dim:'',reset:'',cyan:'',yellow:'',green:'',red:'',magenta:'',white:'' };

// --- Config ---
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const HEAD_BUF = 8192;
const TAIL_BUF = 65536;

// Risky patterns in bash commands
const RISK_PATTERNS = [
  { pattern: /\brm\s+-rf\b/, label: 'Recursive delete (rm -rf)' },
  { pattern: /\bgit\s+push\s+--force\b/, label: 'Force push' },
  { pattern: /\bgit\s+reset\s+--hard\b/, label: 'Hard reset' },
  { pattern: /\bgit\s+clean\s+-fd\b/, label: 'Git clean' },
  { pattern: /\bcurl\b.*\b-X\s*POST\b/, label: 'HTTP POST request' },
  { pattern: /\bcurl\b.*\b--data\b/, label: 'HTTP POST with data' },
  { pattern: /\bnpm\s+publish\b/, label: 'npm publish' },
  { pattern: /\bdrop\s+(table|database)\b/i, label: 'Database drop' },
  { pattern: /\bsudo\b/, label: 'Sudo command' },
  { pattern: /\bchmod\s+777\b/, label: 'Chmod 777' },
  { pattern: /\bkill\s+-9\b/, label: 'Force kill' },
];

// --- Helpers ---

function formatTime(ts) {
  if (!ts) return '??:??';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(ts) {
  if (!ts) return '????-??-??';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function durationMinutes(startTs, endTs) {
  if (!startTs || !endTs) return 0;
  return Math.round((new Date(endTs) - new Date(startTs)) / 60000);
}

function cleanProjectName(dirName) {
  if (dirName.startsWith('-tmp')) return '/tmp';
  const parts = dirName.split('-').filter(Boolean);
  if (parts[0] === 'home' && parts.length >= 2) {
    const rest = parts.slice(2);
    if (rest.length === 0) return '~';
    if (rest[0] === 'projects') rest.shift();
    return rest.join('-') || '~';
  }
  return dirName;
}

function shortenPath(p) {
  const home = homedir();
  if (p.startsWith(home)) return '~' + p.slice(home.length);
  return p;
}

async function readFirstLastLine(filePath) {
  const fh = await open(filePath, 'r');
  try {
    const headBuf = Buffer.alloc(HEAD_BUF);
    const { bytesRead: headBytes } = await fh.read(headBuf, 0, HEAD_BUF, 0);
    const headStr = headBuf.toString('utf8', 0, headBytes);
    const firstNewline = headStr.indexOf('\n');
    const firstLine = firstNewline > 0 ? headStr.slice(0, firstNewline) : headStr;

    const fstat = await fh.stat();
    const tailStart = Math.max(0, fstat.size - TAIL_BUF);
    const tailBuf = Buffer.alloc(TAIL_BUF);
    const { bytesRead: tailBytes } = await fh.read(tailBuf, 0, TAIL_BUF, tailStart);
    const tailStr = tailBuf.toString('utf8', 0, tailBytes);
    const lines = tailStr.split('\n').filter(l => l.trim());
    const lastLine = lines[lines.length - 1] || '';

    return { firstLine, lastLine, size: fstat.size };
  } finally {
    await fh.close();
  }
}

// --- Main scanning ---

async function findSessions(targetDate) {
  const sessions = [];

  let dirs;
  try {
    dirs = await readdir(PROJECTS_DIR);
  } catch {
    console.error(`  Cannot read ${PROJECTS_DIR}`);
    process.exit(1);
  }

  for (const dir of dirs) {
    const dirPath = join(PROJECTS_DIR, dir);
    const dirStat = await stat(dirPath).catch(() => null);
    if (!dirStat || !dirStat.isDirectory()) continue;

    const projectName = cleanProjectName(dir);

    // Scan main session files
    const files = await readdir(dirPath).catch(() => []);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = join(dirPath, file);
      try {
        const { firstLine, lastLine, size } = await readFirstLastLine(filePath);
        const first = JSON.parse(firstLine);
        const last = JSON.parse(lastLine);

        const startTs = first.timestamp || first.snapshot?.timestamp;
        const endTs = last.timestamp || last.snapshot?.timestamp;
        if (!startTs) continue;

        const startDate = formatDate(startTs);

        // Filter by target date if specified
        if (targetDate && startDate !== targetDate) continue;

        sessions.push({
          filePath, projectName, startTs, endTs, size,
          isSubagent: false,
        });
      } catch { /* skip unparseable */ }
    }

    // Scan subagent sessions
    const subDir = join(dirPath, 'subagents');
    const subFiles = await readdir(subDir).catch(() => []);
    for (const file of subFiles) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = join(subDir, file);
      try {
        const { firstLine, lastLine, size } = await readFirstLastLine(filePath);
        const first = JSON.parse(firstLine);
        const last = JSON.parse(lastLine);

        const startTs = first.timestamp || first.snapshot?.timestamp;
        const endTs = last.timestamp || last.snapshot?.timestamp;
        if (!startTs) continue;

        const startDate = formatDate(startTs);
        if (targetDate && startDate !== targetDate) continue;

        sessions.push({
          filePath, projectName, startTs, endTs, size,
          isSubagent: true,
        });
      } catch { /* skip */ }
    }
  }

  // Sort by start time
  sessions.sort((a, b) => new Date(a.startTs) - new Date(b.startTs));
  return sessions;
}

async function auditSession(session) {
  const actions = [];
  const filesCreated = new Set();
  const filesModified = new Set();
  const filesRead = new Set();
  const bashCommands = [];
  const gitCommits = [];
  const riskFlags = [];
  let toolCallCount = 0;

  // Stream the file line by line
  const fh = await open(session.filePath, 'r');
  try {
    // Read in chunks for large files
    const CHUNK = 1024 * 1024; // 1MB chunks
    let position = 0;
    let buffer = '';
    const fileSize = (await fh.stat()).size;

    while (position < fileSize) {
      const readBuf = Buffer.alloc(Math.min(CHUNK, fileSize - position));
      const { bytesRead } = await fh.read(readBuf, 0, readBuf.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;

      buffer += readBuf.toString('utf8', 0, bytesRead);
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          if (record.type !== 'assistant') continue;

          const ts = record.timestamp;
          const content = record.message?.content;
          if (!Array.isArray(content)) continue;

          for (const block of content) {
            if (block.type !== 'tool_use') continue;
            toolCallCount++;
            const name = block.name;
            const input = block.input || {};

            switch (name) {
              case 'Write': {
                const fp = shortenPath(input.file_path || '');
                filesCreated.add(fp);
                actions.push({ ts, type: 'create', detail: `Created ${fp}` });
                break;
              }
              case 'Edit': {
                const fp = shortenPath(input.file_path || '');
                filesModified.add(fp);
                actions.push({ ts, type: 'modify', detail: `Modified ${fp}` });
                break;
              }
              case 'Read': {
                const fp = shortenPath(input.file_path || '');
                filesRead.add(fp);
                // Don't add to actions (too noisy)
                break;
              }
              case 'Bash': {
                const cmd = input.command || '';
                const desc = input.description || '';
                const shortCmd = cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd;
                bashCommands.push({ ts, cmd, desc });

                // Check for git commits
                if (/git\s+commit/.test(cmd)) {
                  gitCommits.push({ ts, cmd: shortCmd });
                  actions.push({ ts, type: 'git', detail: `Git commit` });
                }
                // Check for git push
                else if (/git\s+push/.test(cmd)) {
                  actions.push({ ts, type: 'git', detail: `Git push: ${shortCmd}` });
                }
                // Check for risk patterns
                for (const rp of RISK_PATTERNS) {
                  if (rp.pattern.test(cmd)) {
                    riskFlags.push({ ts, label: rp.label, cmd: shortCmd });
                  }
                }

                // Show significant bash commands (skip ls, cat, echo, etc.)
                if (!/^(ls|cat|head|tail|echo|pwd|date|wc|grep|find)\s/.test(cmd.trim()) && cmd.trim().length > 5) {
                  actions.push({ ts, type: 'bash', detail: desc || shortCmd });
                }
                break;
              }
              case 'Task': {
                const desc = input.description || 'subagent';
                actions.push({ ts, type: 'task', detail: `Spawned agent: ${desc}` });
                break;
              }
              case 'Glob':
              case 'Grep':
                // Skip search actions (too noisy)
                break;
              default: {
                // Capture other tools
                if (name && !['NotebookEdit', 'WebFetch', 'WebSearch', 'TaskOutput', 'TaskStop'].includes(name)) {
                  actions.push({ ts, type: 'other', detail: `${name}: ${JSON.stringify(input).slice(0, 60)}` });
                }
              }
            }
          }
        } catch { /* skip unparseable line */ }
      }
    }
  } finally {
    await fh.close();
  }

  return {
    actions,
    filesCreated: [...filesCreated],
    filesModified: [...filesModified],
    filesRead: [...filesRead],
    bashCommands,
    gitCommits,
    riskFlags,
    toolCallCount,
  };
}

// --- Structured data builder (for --json) ---

function buildSessionData(session, audit) {
  // Deduplicate similar consecutive actions (same logic as display)
  const deduped = [];
  let lastDetail = '';
  for (const a of audit.actions) {
    if (a.detail === lastDetail) continue;
    lastDetail = a.detail;
    deduped.push(a);
  }

  return {
    project: session.projectName,
    start: session.startTs ? new Date(session.startTs).toISOString() : null,
    end: session.endTs ? new Date(session.endTs).toISOString() : null,
    duration: durationMinutes(session.startTs, session.endTs),
    transcriptSize: session.size,
    summary: {
      toolCalls: audit.toolCallCount,
      filesCreated: audit.filesCreated.length,
      filesModified: audit.filesModified.length,
      filesRead: audit.filesRead.length,
      bashCommands: audit.bashCommands.length,
      gitCommits: audit.gitCommits.length,
    },
    keyActions: deduped.map(a => ({
      time: a.ts ? new Date(a.ts).toISOString() : null,
      type: a.type,
      detail: a.detail,
    })),
    riskFlags: audit.riskFlags.map(rf => rf.label),
  };
}

// --- Terminal output ---

function printHeader() {
  console.log(`  ${C.bold}${C.cyan}Claude Code Audit Log v1.0${C.reset}`);
  console.log(`  ${C.dim}═══════════════════════════════════════${C.reset}`);
}

function printSessionSummary(session, audit) {
  const startTime = formatTime(session.startTs);
  const endTime = formatTime(session.endTs);
  const duration = session.endTs
    ? formatDuration(new Date(session.endTs) - new Date(session.startTs))
    : '?';
  const sizeMB = (session.size / 1048576).toFixed(1);

  console.log();
  console.log(`  ${C.bold}▸ Session: ${formatDate(session.startTs)} ${startTime} → ${endTime} (${duration})${C.reset}`);
  console.log(`    ${C.dim}Project: ${session.projectName}${session.isSubagent ? ' (subagent)' : ''}  |  ${sizeMB}MB transcript${C.reset}`);

  // Summary stats
  console.log();
  console.log(`  ${C.bold}▸ Summary${C.reset}`);
  console.log(`    Tool calls:     ${C.bold}${audit.toolCallCount}${C.reset}`);
  console.log(`    Files created:  ${C.bold}${audit.filesCreated.length}${C.reset}`);
  console.log(`    Files modified: ${C.bold}${audit.filesModified.length}${C.reset}`);
  console.log(`    Files read:     ${C.bold}${audit.filesRead.length}${C.reset}`);
  console.log(`    Bash commands:  ${C.bold}${audit.bashCommands.length}${C.reset}`);
  console.log(`    Git commits:    ${C.bold}${audit.gitCommits.length}${C.reset}`);

  // Key actions timeline
  if (audit.actions.length > 0) {
    console.log();
    console.log(`  ${C.bold}▸ Key Actions${C.reset}`);

    // Deduplicate similar consecutive actions
    const shown = [];
    let lastDetail = '';
    for (const a of audit.actions) {
      if (a.detail === lastDetail) continue;
      lastDetail = a.detail;
      shown.push(a);
    }

    // Show max 30 actions
    const display = shown.length > 30 ? shown.slice(0, 30) : shown;
    for (const a of display) {
      const time = formatTime(a.ts);
      const icon = a.type === 'create' ? `${C.green}+${C.reset}` :
                   a.type === 'modify' ? `${C.yellow}~${C.reset}` :
                   a.type === 'git' ? `${C.magenta}G${C.reset}` :
                   a.type === 'bash' ? `${C.cyan}$${C.reset}` :
                   a.type === 'task' ? `${C.cyan}T${C.reset}` :
                   `${C.dim}.${C.reset}`;
      console.log(`    ${C.dim}${time}${C.reset}  ${icon} ${a.detail}`);
    }
    if (shown.length > 30) {
      console.log(`    ${C.dim}... and ${shown.length - 30} more actions${C.reset}`);
    }
  }

  // Risk flags
  console.log();
  console.log(`  ${C.bold}▸ Risk Flags${C.reset}`);
  if (audit.riskFlags.length === 0) {
    console.log(`    ${C.green}None detected${C.reset}`);
  } else {
    for (const rf of audit.riskFlags) {
      console.log(`    ${C.red}⚠ ${rf.label}${C.reset} at ${formatTime(rf.ts)}`);
      console.log(`      ${C.dim}${rf.cmd}${C.reset}`);
    }
  }

  // Files touched
  if (audit.filesCreated.length > 0 || audit.filesModified.length > 0) {
    console.log();
    console.log(`  ${C.bold}▸ Files Touched${C.reset}`);
    for (const f of audit.filesCreated.slice(0, 15)) {
      console.log(`    ${C.green}NEW${C.reset}  ${f}`);
    }
    for (const f of audit.filesModified.slice(0, 15)) {
      console.log(`    ${C.yellow}MOD${C.reset}  ${f}`);
    }
    const total = audit.filesCreated.length + audit.filesModified.length;
    if (total > 30) {
      console.log(`    ${C.dim}... and ${total - 30} more files${C.reset}`);
    }
  }
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  let targetDate = null;
  let showAll = false;
  let lastN = 1;
  let jsonOutput = false;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' || args[i] === '-d') {
      targetDate = args[++i];
    } else if (args[i] === '--today' || args[i] === '-t') {
      const now = new Date();
      targetDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    } else if (args[i] === '--all' || args[i] === '-a') {
      showAll = true;
    } else if (args[i] === '--last' || args[i] === '-n') {
      lastN = parseInt(args[++i]) || 1;
    } else if (args[i] === '--json' || args[i] === '-j') {
      jsonOutput = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
  cc-audit-log — See what your Claude Code actually did.

  Usage:
    cc-audit-log              Show the most recent session
    cc-audit-log --today      Show all sessions from today
    cc-audit-log --date DATE  Show sessions from a specific date (YYYY-MM-DD)
    cc-audit-log --last N     Show the N most recent sessions
    cc-audit-log --all        Show all sessions (can be slow)
    cc-audit-log --json       Output structured JSON instead of terminal display
    cc-audit-log --help       Show this help

  Flags can be combined:
    cc-audit-log --today --json
    cc-audit-log --last 5 --json

  Reads session transcripts from ~/.claude/projects/ and generates
  a human-readable audit trail of AI actions.

  Zero dependencies. No data sent anywhere. Runs entirely local.
`);
      process.exit(0);
    }
  }

  if (!jsonOutput) {
    printHeader();
    console.log(`  ${C.dim}Scanning: ~/.claude/projects/${C.reset}`);
  }

  const sessions = await findSessions(targetDate);

  if (sessions.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({
        version: '1.0',
        sessionsScanned: 0,
        sessions: [],
      }, null, 2));
    } else {
      console.log(`\n  No sessions found${targetDate ? ` for ${targetDate}` : ''}.`);
    }
    process.exit(0);
  }

  // Select sessions to audit
  let toAudit;
  if (showAll || targetDate) {
    toAudit = sessions;
  } else {
    // Default: last N sessions (from main, not subagent)
    const mainSessions = sessions.filter(s => !s.isSubagent);
    toAudit = mainSessions.slice(-lastN);
  }

  if (!jsonOutput) {
    console.log(`  ${C.dim}Found ${sessions.length} sessions${targetDate ? ` on ${targetDate}` : ''}. Auditing ${toAudit.length}.${C.reset}`);
  }

  // Aggregate stats across all audited sessions
  let totalTools = 0, totalCreated = 0, totalModified = 0, totalBash = 0, totalCommits = 0, totalRisks = 0;

  // Collect structured data for JSON output
  const jsonSessions = [];

  for (const session of toAudit) {
    if (!jsonOutput) {
      process.stderr.write(`  Auditing ${session.projectName}...      \r`);
    }
    const audit = await auditSession(session);

    if (jsonOutput) {
      jsonSessions.push(buildSessionData(session, audit));
    } else {
      printSessionSummary(session, audit);
    }

    totalTools += audit.toolCallCount;
    totalCreated += audit.filesCreated.length;
    totalModified += audit.filesModified.length;
    totalBash += audit.bashCommands.length;
    totalCommits += audit.gitCommits.length;
    totalRisks += audit.riskFlags.length;
  }

  if (jsonOutput) {
    const output = {
      version: '1.0',
      sessionsScanned: toAudit.length,
      sessions: jsonSessions,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Totals if multiple sessions
  if (toAudit.length > 1) {
    console.log();
    console.log(`  ${C.dim}───────────────────────────────────────${C.reset}`);
    console.log(`  ${C.bold}Totals across ${toAudit.length} sessions:${C.reset}`);
    console.log(`    Tool calls: ${totalTools}  |  Created: ${totalCreated}  |  Modified: ${totalModified}  |  Bash: ${totalBash}  |  Commits: ${totalCommits}  |  Risks: ${totalRisks}`);
  }

  // Share text
  console.log();
  console.log(`  ${C.dim}─── Share ───${C.reset}`);
  console.log(`  ${C.dim}My AI did ${totalTools} tool calls, created ${totalCreated} files, ran ${totalBash} commands, and made ${totalCommits} commits${totalRisks > 0 ? ` (${totalRisks} risk flags!)` : ''}.`);
  console.log(`  #ClaudeCode #AIAudit${C.reset}`);
  console.log();
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
