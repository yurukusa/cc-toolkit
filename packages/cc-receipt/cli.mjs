#!/usr/bin/env node
/**
 * cc-receipt
 * Generates an ASCII receipt of your AI's daily work from proof-log.
 * The AI never clocks out. The receipt proves it.
 */
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

const args = process.argv.slice(2);
const flags = {
  date: args.find(a => a.startsWith('--date='))?.slice(7),
  dir: args.find(a => a.startsWith('--dir='))?.slice(6) || '~/ops/proof-log',
  sleep: parseInt(args.find(a => a.startsWith('--sleep='))?.slice(8) ?? '7'),
  wide: args.includes('--wide'),
  help: args.includes('--help') || args.includes('-h'),
};

if (flags.help) {
  console.log(`cc-receipt — ASCII receipt of your AI's daily work

Usage:
  npx cc-receipt                 Yesterday's receipt
  npx cc-receipt --date=2026-02-27
  npx cc-receipt --sleep=8       Set your sleep hours (default: 7)
  npx cc-receipt --wide          Wider receipt format

Options:
  --date=YYYY-MM-DD   Specific date (default: yesterday)
  --dir=PATH          Proof-log directory (default: ~/ops/proof-log)
  --sleep=N           Your sleep hours for comparison (default: 7)
  --wide              Wider receipt format
  --help              Show this help`);
  process.exit(0);
}

// ── Date helpers ─────────────────────────────────────────────────

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dayName(dateStr) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(dateStr + 'T12:00:00Z').getDay()];
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m)-1]} ${parseInt(d)}, ${y}`;
}

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2,'0')}m`;
}

function fmtNum(n) {
  return n.toLocaleString('en-US');
}

// ── Proof-log parser (same format as cc-standup) ─────────────────

const SESSION_HEADER = /^### (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})-(\d{2}:\d{2}) JST/;
const WHERE_LINE     = /^- どこで: (.+)$/;
const WHO_LINE       = /^- 誰が: CC: (\d+)件/;
const WHAT_LINE      = /^- 何を: (\d+)ファイル変更 \(\+(\d+)\/-(\d+)\)/;
const DURATION_LINE  = /^- いつ: .+JST（(\d+)分）/;

function parseProofLog(content) {
  const sessions = [];
  let current = null;

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    const headerMatch = SESSION_HEADER.exec(line);
    if (headerMatch) {
      if (current) sessions.push(current);
      current = { durationMin: 0, project: null, ccActions: 0, filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
      continue;
    }
    if (!current) continue;

    const durMatch = DURATION_LINE.exec(line);
    if (durMatch) { current.durationMin = parseInt(durMatch[1], 10); continue; }

    const whereMatch = WHERE_LINE.exec(line);
    if (whereMatch) { current.project = whereMatch[1].trim(); continue; }

    const whoMatch = WHO_LINE.exec(line);
    if (whoMatch) { current.ccActions = parseInt(whoMatch[1], 10); continue; }

    const whatMatch = WHAT_LINE.exec(line);
    if (whatMatch) {
      current.filesChanged = parseInt(whatMatch[1], 10);
      current.linesAdded   = parseInt(whatMatch[2], 10);
      current.linesRemoved = parseInt(whatMatch[3], 10);
      continue;
    }
  }
  if (current) sessions.push(current);
  return sessions;
}

function aggregate(sessions) {
  const byProject = {};
  let totalMinutes = 0, totalSessions = 0, totalLines = 0, totalFiles = 0;

  for (const s of sessions) {
    if (!s.project) continue;
    totalSessions++;
    totalMinutes += s.durationMin;
    totalLines   += s.linesAdded;
    totalFiles   += s.filesChanged;

    if (!byProject[s.project]) byProject[s.project] = { minutes: 0, sessions: 0, linesAdded: 0, files: 0 };
    byProject[s.project].minutes    += s.durationMin;
    byProject[s.project].sessions   += 1;
    byProject[s.project].linesAdded += s.linesAdded;
    byProject[s.project].files      += s.filesChanged;
  }

  const projects = Object.entries(byProject)
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .map(([name, d]) => ({ name, ...d }));

  return { projects, totalMinutes, totalSessions, totalLines, totalFiles };
}

// ── Load data ────────────────────────────────────────────────────

const targetDate = flags.date || getYesterday();
const logDir = resolve(flags.dir.replace('~', homedir()));
const logFile = join(logDir, `${targetDate}.md`);
const isGhostDay = !existsSync(logFile);

let data = { projects: [], totalMinutes: 0, totalSessions: 0, totalLines: 0, totalFiles: 0 };
if (!isGhostDay) {
  const content = readFileSync(logFile, 'utf8');
  data = aggregate(parseProofLog(content));
}

// ── ASCII receipt ─────────────────────────────────────────────────

const W = flags.wide ? 44 : 36;

function pad(left, right, width = W - 2) {
  const total = left.length + right.length;
  const spaces = Math.max(1, width - total);
  return `║ ${left}${' '.repeat(spaces)}${right} ║`;
}

function center(s, width = W - 2) {
  const spaces = Math.max(0, width - s.length);
  const l = Math.floor(spaces / 2);
  const r = spaces - l;
  return `║ ${' '.repeat(l)}${s}${' '.repeat(r)} ║`;
}

function div() { return `╟${'─'.repeat(W)}╢`; }

const out = [];

out.push(`╔${'═'.repeat(W)}╗`);
out.push(center('AI  WORK  RECEIPT'));
out.push(center(`${formatDate(targetDate)}  (${dayName(targetDate)})`));
out.push(`╠${'═'.repeat(W)}╣`);

if (isGhostDay) {
  out.push(center(''));
  out.push(center('👻  GHOST DAY'));
  out.push(center('AI worked autonomously.'));
  out.push(center('No sessions logged.'));
  out.push(center(''));
} else {
  // Projects
  if (data.projects.length > 0) {
    out.push(center('— PROJECTS —'));
    for (const p of data.projects) {
      const name = p.name.length > 20 ? p.name.slice(0, 19) + '…' : p.name;
      out.push(pad(name, fmtDuration(p.minutes)));
      const detail = [
        p.sessions > 0  ? `${fmtNum(p.sessions)} sessions` : '',
        p.linesAdded > 0 ? `+${fmtNum(p.linesAdded)} lines` : '',
      ].filter(Boolean).join('  ');
      if (detail) out.push(center(`↳ ${detail}`));
    }
    out.push(div());
  }

  // Totals
  out.push(pad('AI ACTIVE TIME', fmtDuration(data.totalMinutes)));
  if (data.totalSessions > 0) out.push(pad('SESSIONS', fmtNum(data.totalSessions)));
  if (data.totalLines    > 0) out.push(pad('LINES ADDED', `+${fmtNum(data.totalLines)}`));
  if (data.totalFiles    > 0) out.push(pad('FILES TOUCHED', fmtNum(data.totalFiles)));
  out.push(div());

  // Human comparison
  const sleepMin = flags.sleep * 60;
  out.push(pad('YOUR SLEEP', fmtDuration(sleepMin)));
  out.push(pad('AI SLEEP', '0m'));
  out.push(div());

  // Verdict
  const ratio = data.totalMinutes / Math.max(sleepMin, 1);
  let verdict;
  if (data.totalMinutes === 0) {
    verdict = 'NO ACTIVITY RECORDED';
  } else if (ratio >= 2) {
    verdict = 'AI WORKED WHILE YOU SLEPT';
  } else if (ratio >= 1) {
    verdict = `AI: ${Math.round(ratio * 100)}% OF YOUR SLEEP`;
  } else if (ratio >= 0.5) {
    verdict = `AI HALF-WORKING`;
  } else {
    verdict = `LIGHT AI ACTIVITY`;
  }
  out.push(center(verdict));
}

out.push(`╚${'═'.repeat(W)}╝`);

const url = 'npx cc-receipt';
out.push('');
out.push(' '.repeat(Math.floor((W + 2 - url.length) / 2)) + url);

console.log(out.join('\n'));
