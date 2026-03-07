#!/usr/bin/env node
/**
 * cc-mcp — MCP server for cc-toolkit
 *
 * Gives Claude real-time access to your Claude Code usage stats.
 * The only cc-toolkit component that feeds data back INTO Claude during a session.
 *
 * Tools exposed:
 *   cc_usage_summary   — today / week / month totals + streak + autonomy
 *   cc_daily_breakdown — last N days, day by day (you + AI hours)
 *   cc_project_stats   — per-project time breakdown for last N days
 *   cc_forecast        — month-end projection at current pace
 *
 * Add to claude_desktop_config.json (or ~/.config/claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "cc-toolkit": {
 *         "command": "npx",
 *         "args": ["cc-mcp"]
 *       }
 *     }
 *   }
 *
 * Requires cc-agent-load: npm install -g cc-agent-load
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();

// ── Load data from cc-agent-load ──────────────────────────────────────────────

function loadData() {
  const paths = [
    [join(HOME, 'bin', 'cc-agent-load'), ['--json']],
    ['node', [join(HOME, 'projects', 'cc-loop', 'cc-agent-load', 'cli.mjs'), '--json']],
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

function daysInMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function monthStart(dateStr) {
  return dateStr.slice(0, 7) + '-01';
}

function dayOfMonth(dateStr) {
  return parseInt(dateStr.slice(8));
}

// ── Compute streak ────────────────────────────────────────────────────────────

function computeStreak(byDate, today) {
  let streak = 0;
  let d = today;
  if (!byDate[d]) d = addDays(today, -1);
  while (byDate[d]) {
    const v = byDate[d];
    const active = typeof v === 'object' ? (v.main || 0) + (v.sub || 0) : (v || 0);
    if (active === 0) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'cc-toolkit',
  version: '1.0.0',
});

// ── Tool: cc_usage_summary ────────────────────────────────────────────────────

server.registerTool(
  'cc_usage_summary',
  {
    title: 'Claude Code Usage Summary',
    description: `Get a summary of Claude Code usage stats.

Returns today's hours, weekly totals, monthly totals, current streak, and the AI autonomy ratio (sub-agent hours / interactive hours).

Ghost Days = days when AI ran autonomously while the human had zero interactive sessions.

Use this when the user asks questions like:
- "How much have I used Claude Code today/this week/this month?"
- "What's my current streak?"
- "How much is AI running vs me?"
- "Show me my Claude Code stats"`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async () => {
    const data = loadData();
    if (!data?.byDate) {
      return {
        content: [{ type: 'text', text: 'Error: Could not load cc-agent-load data. Install with: npm install -g cc-agent-load' }],
      };
    }

    const today = localToday();
    const byDate = data.byDate;

    // Today
    const todayEntry = byDate[today];
    const todayMain = todayEntry ? (typeof todayEntry === 'object' ? (todayEntry.main || 0) : 0) : 0;
    const todaySub = todayEntry ? (typeof todayEntry === 'object' ? (todayEntry.sub || 0) : (todayEntry || 0)) : 0;

    // Last 7 days
    let week7Main = 0, week7Sub = 0, week7Active = 0, week7Ghost = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, -i);
      const v = byDate[d];
      if (!v) continue;
      const m = typeof v === 'object' ? (v.main || 0) : 0;
      const s = typeof v === 'object' ? (v.sub || 0) : (v || 0);
      if (m > 0 || s > 0) { week7Active++; week7Main += m; week7Sub += s; }
      if (m === 0 && s > 0) week7Ghost++;
    }

    // Month to date
    let mtdMain = 0, mtdSub = 0, mtdActive = 0, mtdGhost = 0;
    let d = monthStart(today);
    while (d <= today) {
      const v = byDate[d];
      if (v) {
        const m = typeof v === 'object' ? (v.main || 0) : 0;
        const s = typeof v === 'object' ? (v.sub || 0) : (v || 0);
        if (m > 0 || s > 0) { mtdActive++; mtdMain += m; mtdSub += s; }
        if (m === 0 && s > 0) mtdGhost++;
      }
      d = addDays(d, 1);
    }

    const streak = computeStreak(byDate, today);
    const autonomy = mtdMain > 0 ? mtdSub / mtdMain : (mtdSub > 0 ? 99 : 0);
    const monthName = new Date(today + 'T12:00:00').toLocaleString('en', { month: 'long' });

    const summary = {
      date: today,
      today: {
        yourHours: +todayMain.toFixed(2),
        aiHours: +todaySub.toFixed(2),
        totalHours: +(todayMain + todaySub).toFixed(2),
        isGhostDay: todayMain === 0 && todaySub > 0,
      },
      last7Days: {
        yourHours: +week7Main.toFixed(2),
        aiHours: +week7Sub.toFixed(2),
        totalHours: +(week7Main + week7Sub).toFixed(2),
        activeDays: week7Active,
        ghostDays: week7Ghost,
      },
      monthToDate: {
        month: monthName,
        yourHours: +mtdMain.toFixed(2),
        aiHours: +mtdSub.toFixed(2),
        totalHours: +(mtdMain + mtdSub).toFixed(2),
        activeDays: mtdActive,
        ghostDays: mtdGhost,
      },
      streak: {
        currentDays: streak,
        isActive: streak > 0,
      },
      autonomy: {
        ratio: +autonomy.toFixed(2),
        label: autonomy > 1.5 ? 'AI running 1.5x more than you'
          : autonomy > 1 ? 'AI running more than you'
          : autonomy > 0 ? 'You driving more than AI'
          : 'No data',
      },
    };

    const text = [
      `Claude Code Usage Summary — ${today}`,
      ``,
      `Today: ${todayMain.toFixed(1)}h you + ${todaySub.toFixed(1)}h AI = ${(todayMain + todaySub).toFixed(1)}h total${todayMain === 0 && todaySub > 0 ? ' 👻 Ghost Day' : ''}`,
      `Last 7 days: ${week7Main.toFixed(1)}h you + ${week7Sub.toFixed(1)}h AI | ${week7Active} active days, ${week7Ghost} Ghost Days`,
      `${monthName} MTD: ${mtdMain.toFixed(1)}h you + ${mtdSub.toFixed(1)}h AI | ${mtdActive} active days, ${mtdGhost} Ghost Days`,
      `Streak: ${streak} days`,
      `Autonomy: ${autonomy > 50 ? 'very high' : autonomy.toFixed(2) + 'x'} AI/human ratio — ${summary.autonomy.label}`,
    ].join('\n');

    return {
      content: [{ type: 'text', text }],
      structuredContent: summary,
    };
  }
);

// ── Tool: cc_daily_breakdown ──────────────────────────────────────────────────

server.registerTool(
  'cc_daily_breakdown',
  {
    title: 'Claude Code Daily Breakdown',
    description: `Get a day-by-day breakdown of Claude Code activity for the last N days.

Each day shows: your interactive hours, AI sub-agent hours, total hours, and whether it was a Ghost Day.

Use this when the user asks:
- "Show me my activity for the last 2 weeks"
- "What days was AI most active?"
- "When were my Ghost Days this month?"`,
    inputSchema: {
      days: z.number().optional().describe('Number of days to look back (default: 14, max: 90)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async ({ days = 14 }) => {
    const data = loadData();
    if (!data?.byDate) {
      return {
        content: [{ type: 'text', text: 'Error: Could not load cc-agent-load data.' }],
      };
    }

    const n = Math.min(days, 90);
    const today = localToday();
    const byDate = data.byDate;

    const rows = [];
    for (let i = 0; i < n; i++) {
      const d = addDays(today, -i);
      const v = byDate[d];
      const m = v ? (typeof v === 'object' ? (v.main || 0) : 0) : 0;
      const s = v ? (typeof v === 'object' ? (v.sub || 0) : (v || 0)) : 0;
      rows.push({
        date: d,
        yourHours: +m.toFixed(2),
        aiHours: +s.toFixed(2),
        totalHours: +(m + s).toFixed(2),
        isGhostDay: m === 0 && s > 0,
        active: m > 0 || s > 0,
      });
    }

    const lines = [`Daily breakdown — last ${n} days`, ''];
    for (const r of rows) {
      const bar = r.totalHours > 0
        ? '█'.repeat(Math.min(Math.round(r.totalHours), 20))
        : '─';
      const ghost = r.isGhostDay ? ' 👻' : '';
      const you = r.yourHours.toFixed(1);
      const ai = r.aiHours.toFixed(1);
      lines.push(`${r.date}  ${bar.padEnd(20)} ${you}h you + ${ai}h AI${ghost}`);
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: { days: n, entries: rows },
    };
  }
);

// ── Tool: cc_project_stats ────────────────────────────────────────────────────

server.registerTool(
  'cc_project_stats',
  {
    title: 'Claude Code Project Stats',
    description: `Get per-project Claude Code time breakdown.

Shows how your total hours are distributed across projects, sorted by total time.

Uses cc-agent-load's topProjects data (last 30 days by default).

Use this when the user asks:
- "How much time have I spent on each project?"
- "Which project used the most AI time?"
- "Where is my Claude Code time going?"`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async () => {
    const data = loadData();
    if (!data) {
      return {
        content: [{ type: 'text', text: 'Error: Could not load cc-agent-load data.' }],
      };
    }

    const projects = data.topProjects || [];
    if (projects.length === 0) {
      return {
        content: [{ type: 'text', text: 'No project data available.' }],
        structuredContent: { projects: [] },
      };
    }

    const lines = ['Project breakdown (top 15)', ''];
    const topN = projects.slice(0, 15);
    for (const p of topN) {
      const total = p.total || (p.main || 0) + (p.sub || 0);
      const m = p.main || 0;
      const s = p.sub || 0;
      const bar = '█'.repeat(Math.min(Math.round(total), 20));
      lines.push(`${(p.name || 'unknown').padEnd(30)} ${bar.padEnd(20)} ${m.toFixed(1)}h you + ${s.toFixed(1)}h AI`);
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: { projects: topN },
    };
  }
);

// ── Tool: cc_forecast ─────────────────────────────────────────────────────────

server.registerTool(
  'cc_forecast',
  {
    title: 'Claude Code Month-End Forecast',
    description: `Forecast your Claude Code stats at the end of the current month.

Uses your last 14 days as a baseline and projects forward to month end.

Returns: projected hours (you + AI), projected Ghost Day count, streak survival forecast, and AI autonomy trend.

Use this when the user asks:
- "How many hours will I have by end of month?"
- "Will my streak survive?"
- "How many Ghost Days will I have this month?"
- "What's my Claude Code pace for this month?"`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async () => {
    const data = loadData();
    if (!data?.byDate) {
      return {
        content: [{ type: 'text', text: 'Error: Could not load cc-agent-load data.' }],
      };
    }

    const today = localToday();
    const byDate = data.byDate;

    // Baseline: last 14 days
    const lookback = 14;
    let baseMain = 0, baseSub = 0, baseActive = 0, baseGhost = 0;
    for (let i = 1; i <= lookback; i++) {
      const d = addDays(today, -i);
      const v = byDate[d];
      if (!v) continue;
      const m = typeof v === 'object' ? (v.main || 0) : 0;
      const s = typeof v === 'object' ? (v.sub || 0) : (v || 0);
      if (m > 0 || s > 0) { baseActive++; baseMain += m; baseSub += s; }
      if (m === 0 && s > 0) baseGhost++;
    }

    const avgMain = baseMain / lookback;
    const avgSub = baseSub / lookback;
    const activePct = baseActive / lookback;
    const ghostPct = baseActive > 0 ? baseGhost / baseActive : 0;

    // Month to date
    let mtdMain = 0, mtdSub = 0, mtdActive = 0, mtdGhost = 0;
    let d = monthStart(today);
    while (d <= today) {
      const v = byDate[d];
      if (v) {
        const m = typeof v === 'object' ? (v.main || 0) : 0;
        const s = typeof v === 'object' ? (v.sub || 0) : (v || 0);
        if (m > 0 || s > 0) { mtdActive++; mtdMain += m; mtdSub += s; }
        if (m === 0 && s > 0) mtdGhost++;
      }
      d = addDays(d, 1);
    }

    const dom = dayOfMonth(today);
    const totalDays = daysInMonth(today);
    const remaining = totalDays - dom;

    const projMain = mtdMain + avgMain * remaining;
    const projSub = mtdSub + avgSub * remaining;
    const projActiveDays = mtdActive + Math.round(activePct * remaining);
    const projGhost = mtdGhost + Math.round(ghostPct * activePct * remaining);

    const streak = computeStreak(byDate, today);
    const streakSurvives = activePct >= 0.85;
    const streakProjection = streak + Math.round(activePct * remaining);

    const autonomy = avgMain > 0 ? avgSub / avgMain : (avgSub > 0 ? 99 : 0);
    const monthName = new Date(today + 'T12:00:00').toLocaleString('en', { month: 'long' });

    const result = {
      today,
      month: monthName,
      daysRemaining: remaining,
      confidence: Math.round(activePct * 100),
      baseline: {
        lookbackDays: lookback,
        activePct: +activePct.toFixed(2),
        avgMainPerDay: +avgMain.toFixed(2),
        avgSubPerDay: +avgSub.toFixed(2),
      },
      monthToDate: {
        yourHours: +mtdMain.toFixed(2),
        aiHours: +mtdSub.toFixed(2),
        activeDays: mtdActive,
        ghostDays: mtdGhost,
      },
      projected: {
        yourHours: +projMain.toFixed(1),
        aiHours: +projSub.toFixed(1),
        totalHours: +(projMain + projSub).toFixed(1),
        activeDays: projActiveDays,
        ghostDays: projGhost,
        streakAtMonthEnd: streakProjection,
        streakSurvives,
      },
      autonomy: {
        ratio: +autonomy.toFixed(2),
        label: autonomy > 1.5 ? 'AI running 1.5x more than you'
          : autonomy > 1 ? 'AI running more than you'
          : 'You driving more than AI',
      },
    };

    const text = [
      `${monthName} Forecast — ${remaining} days remaining`,
      `Confidence: ${Math.round(activePct * 100)}% (based on last 14 days)`,
      ``,
      `Hours this month`,
      `  So far:       ${mtdMain.toFixed(1)}h you + ${mtdSub.toFixed(1)}h AI = ${(mtdMain+mtdSub).toFixed(1)}h`,
      `  Projected:    ${projMain.toFixed(1)}h you + ${projSub.toFixed(1)}h AI = ${(projMain+projSub).toFixed(1)}h`,
      ``,
      `Ghost Days`,
      `  So far:       ${mtdGhost}`,
      `  Projected:    ~${projGhost}`,
      ``,
      `Streak`,
      `  Current:      ${streak} days`,
      `  Projected:    ~${streakProjection} days at month end`,
      `  Survival:     ${streakSurvives ? '✓ Likely survives' : '⚠ At risk'} (${Math.round(activePct * 100)}% consistency)`,
      ``,
      `AI Autonomy (14-day avg): ${autonomy > 50 ? 'very high' : autonomy.toFixed(2) + 'x'} — ${result.autonomy.label}`,
    ].join('\n');

    return {
      content: [{ type: 'text', text }],
      structuredContent: result,
    };
  }
);

// ── Start server ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
