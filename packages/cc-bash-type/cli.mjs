#!/usr/bin/env node
// cc-bash-type — What category of Bash commands does Claude run?
// Classifies every Bash tool call into intent categories:
// inspect, execute, git, package, file_ops, network, test, shell, other

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { cpus } from 'os';

const CONCURRENCY = Math.min(cpus().length, 8);
const MIN_BASH = 3;

// ── Category definitions ──────────────────────────────────────────
const CATEGORIES = [
  {
    key: 'inspect',
    label: 'inspect  ',
    desc: 'read/search (cat, grep, find, ls)',
    cmds: new Set(['cat','head','tail','grep','find','ls','ll','dir','wc',
      'less','more','diff','stat','file','strings','xxd','od','type',
      'which','whereis','locate','readlink','realpath']),
  },
  {
    key: 'execute',
    label: 'execute  ',
    desc: 'run code (node, python, bash, sh)',
    cmds: new Set(['node','python','python3','python2','ruby','perl','lua',
      'tsx','ts-node','deno','php','go','java','rustc','gcc','g++','clang',
      'bash','sh','zsh','fish','ksh','dash','powershell','pwsh']),
  },
  {
    key: 'git',
    label: 'git      ',
    desc: 'version control (git *)',
    cmds: new Set(['git']),
  },
  {
    key: 'package',
    label: 'package  ',
    desc: 'dependency mgmt (npm, pip, yarn)',
    cmds: new Set(['npm','npx','pip','pip3','pip2','yarn','pnpm','bun',
      'cargo','brew','apt','apt-get','apt-cache','dpkg','yum','dnf',
      'gem','bundle','composer','go get','poetry','conda','pip install']),
  },
  {
    key: 'test',
    label: 'test     ',
    desc: 'testing (pytest, jest, vitest)',
    cmds: new Set(['pytest','jest','vitest','mocha','jasmine','karma',
      'ava','tap','tape','qunit','cypress','playwright','puppeteer',
      'go test','cargo test','dotnet test','mvn test']),
  },
  {
    key: 'network',
    label: 'network  ',
    desc: 'HTTP/network (curl, wget, ssh)',
    cmds: new Set(['curl','wget','ssh','scp','rsync','ping','nc','netcat',
      'http','httpie','nmap','dig','nslookup','host','telnet','ftp','sftp']),
  },
  {
    key: 'file_ops',
    label: 'file_ops ',
    desc: 'file manipulation (cp, mv, rm, mkdir)',
    cmds: new Set(['cp','mv','rm','mkdir','touch','chmod','chown','ln',
      'tar','zip','unzip','gzip','gunzip','bzip2','xz','7z','rar',
      'install','mktemp','truncate','split','csplit']),
  },
  {
    key: 'shell',
    label: 'shell    ',
    desc: 'shell utils (echo, sleep, export)',
    cmds: new Set(['echo','sleep','export','source','env','pwd','date',
      'printf','read','eval','exec','true','false','test','[','[[',
      'set','unset','shift','trap','wait','jobs','fg','bg','kill',
      'nohup','timeout','time','nice','ionice','strace','ltrace']),
  },
];

function categorize(cmd) {
  if (!cmd || !cmd.trim()) return 'other';
  // Strip leading path prefixes: /usr/bin/python → python, ./run.sh → run.sh
  const raw = cmd.trim().split(/\s+/)[0].toLowerCase().replace(/^.*\//, '');
  for (const cat of CATEGORIES) {
    if (cat.cmds.has(raw)) return cat.key;
  }
  return 'other';
}

// Git subcommand analysis
function gitSubcmd(cmd) {
  const parts = cmd.trim().split(/\s+/);
  if (parts[0].toLowerCase() !== 'git' && !parts[0].toLowerCase().endsWith('/git')) return null;
  return parts[1] ? parts[1].toLowerCase() : 'git';
}

// ── JSONL parsing ─────────────────────────────────────────────────
function analyzeFile(text) {
  const catCounts = Object.fromEntries(CATEGORIES.map(c => [c.key, 0]));
  catCounts.other = 0;
  const topCmds = {}; // cmd → count (for top-5 per cat)
  const catTopCmds = Object.fromEntries(CATEGORIES.map(c => [c.key, {}]));
  catTopCmds.other = {};
  const gitSubs = {};
  let totalBash = 0;

  for (const line of text.split('\n')) {
    if (!line.includes('"Bash"')) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const content = (obj.message || obj).content;
    if (!Array.isArray(content)) continue;

    for (const b of content) {
      if (b.type !== 'tool_use' || b.name !== 'Bash' || !b.input) continue;
      const cmd = b.input.command || '';
      if (!cmd.trim()) continue;
      totalBash++;
      const cat = categorize(cmd);
      catCounts[cat]++;

      // Track top commands per category (first word)
      const first = cmd.trim().split(/\s+/)[0].toLowerCase().replace(/^.*\//, '');
      catTopCmds[cat][first] = (catTopCmds[cat][first] || 0) + 1;

      if (cat === 'git') {
        const sub = gitSubcmd(cmd);
        if (sub) gitSubs[sub] = (gitSubs[sub] || 0) + 1;
      }
    }
  }

  return { catCounts, catTopCmds, gitSubs, totalBash };
}

function mergeResults(results) {
  const merged = {
    catCounts: Object.fromEntries(CATEGORIES.map(c => [c.key, 0])),
    catTopCmds: Object.fromEntries(CATEGORIES.map(c => [c.key, {}])),
    gitSubs: {},
    totalBash: 0,
    sessions: 0,
  };
  merged.catCounts.other = 0;
  merged.catTopCmds.other = {};

  for (const r of results) {
    if (r.totalBash < MIN_BASH) continue;
    merged.sessions++;
    merged.totalBash += r.totalBash;
    for (const [k, v] of Object.entries(r.catCounts)) merged.catCounts[k] = (merged.catCounts[k] || 0) + v;
    for (const [cat, cmds] of Object.entries(r.catTopCmds)) {
      if (!merged.catTopCmds[cat]) merged.catTopCmds[cat] = {};
      for (const [c, n] of Object.entries(cmds)) merged.catTopCmds[cat][c] = (merged.catTopCmds[cat][c] || 0) + n;
    }
    for (const [sub, n] of Object.entries(r.gitSubs)) merged.gitSubs[sub] = (merged.gitSubs[sub] || 0) + n;
  }
  return merged;
}

// ── File discovery ─────────────────────────────────────────────────
function findJsonlFiles(dir) {
  const files = [];
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) files.push(...findJsonlFiles(p));
        else if (name.endsWith('.jsonl')) files.push(p);
      } catch {}
    }
  } catch {}
  return files;
}

async function processFiles(files) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < files.length) {
      const f = files[idx++];
      try { results.push(analyzeFile(readFileSync(f, 'utf8'))); } catch {}
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

function bar(n, max, width = 22) {
  const f = max > 0 ? Math.round((n / max) * width) : 0;
  return '█'.repeat(f) + '░'.repeat(width - f);
}

function top3(obj) {
  return Object.entries(obj).sort(([,a],[,b])=>b-a).slice(0,3).map(([k,v])=>`${k}(${v.toLocaleString()})`).join(' ');
}

// ── Rendering ─────────────────────────────────────────────────────
function renderOutput(m, catFilter) {
  if (catFilter) {
    const c = CATEGORIES.find(c => c.key === catFilter) || { key: catFilter };
    const n = m.catCounts[catFilter] || 0;
    const pct = m.totalBash > 0 ? (n / m.totalBash * 100).toFixed(1) : '0.0';
    const top = Object.entries(m.catTopCmds[catFilter] || {}).sort(([,a],[,b])=>b-a).slice(0,10);
    console.log(`\ncc-bash-type — ${catFilter} commands`);
    console.log('='.repeat(40));
    console.log(`${n.toLocaleString()} calls (${pct}% of all Bash) | ${c.desc || ''}`);
    console.log('\nTop commands:');
    for (const [cmd, cnt] of top) console.log(`  ${cmd.padEnd(20)} ${cnt.toLocaleString()}`);
    if (catFilter === 'git') {
      console.log('\nGit subcommands:');
      Object.entries(m.gitSubs).sort(([,a],[,b])=>b-a).slice(0,10)
        .forEach(([s,c]) => console.log(`  git ${s.padEnd(16)} ${c.toLocaleString()}`));
    }
    return;
  }

  const allCats = [...CATEGORIES.map(c => c.key), 'other'];
  const maxN = Math.max(...allCats.map(k => m.catCounts[k] || 0));

  console.log('\ncc-bash-type — Bash Command Category Distribution');
  console.log('='.repeat(52));
  console.log(`Sessions: ${m.sessions.toLocaleString()} | Bash calls: ${m.totalBash.toLocaleString()}`);
  console.log('\nCommand categories:');
  for (const cat of CATEGORIES) {
    const n = m.catCounts[cat.key] || 0;
    const p = m.totalBash > 0 ? (n / m.totalBash * 100).toFixed(1) : '0.0';
    const t3 = top3(m.catTopCmds[cat.key] || {});
    console.log(`  ${cat.label}  ${bar(n, maxN)}  ${n.toLocaleString().padStart(7)}  ${p.padStart(5)}%`);
    if (t3) console.log(`             ${' '.repeat(22)}  └─ ${t3}`);
  }
  const other = m.catCounts.other || 0;
  const otherPct = m.totalBash > 0 ? (other / m.totalBash * 100).toFixed(1) : '0.0';
  console.log(`  other     ${bar(other, maxN)}  ${other.toLocaleString().padStart(7)}  ${otherPct.padStart(5)}%`);

  console.log('\nGit subcommands (top 8):');
  Object.entries(m.gitSubs).sort(([,a],[,b])=>b-a).slice(0,8)
    .forEach(([s,c]) => console.log(`  git ${s.padEnd(14)} ${c.toLocaleString()}`));
  console.log('');
}

function renderJson(m) {
  const allCats = [...CATEGORIES.map(c => c.key), 'other'];
  console.log(JSON.stringify({
    sessions: m.sessions,
    totalBash: m.totalBash,
    categories: Object.fromEntries(allCats.map(k => [k, {
      count: m.catCounts[k] || 0,
      pct: +((m.catCounts[k] || 0) / m.totalBash * 100).toFixed(1),
      top5: Object.entries(m.catTopCmds[k] || {}).sort(([,a],[,b])=>b-a).slice(0,5).map(([c,n])=>({cmd:c,count:n})),
    }])),
    gitSubcommands: Object.entries(m.gitSubs).sort(([,a],[,b])=>b-a).slice(0,15).map(([sub,count])=>({sub,count})),
  }, null, 2));
}

// ── CLI entry ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isJson = args.includes('--json');
const catArg = (args.find(a => a.startsWith('--cat=')) || '').replace('--cat=', '') || null;

const dataDir = resolve(process.env.HOME || '~', '.claude', 'projects');
const files = findJsonlFiles(dataDir);

if (files.length === 0) {
  console.error('No .jsonl files found in ~/.claude/projects/');
  process.exit(1);
}

const rawResults = await processFiles(files);
const merged = mergeResults(rawResults);

if (isJson) renderJson(merged);
else renderOutput(merged, catArg);
