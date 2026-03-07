# cc-compare

Compare two time periods of Claude Code activity. Like a fitness tracker's "this week vs last week", but for your AI sessions.

Shows how your usage, AI autonomy, and Ghost Days changed over time.

## Usage

```bash
npx cc-compare
npx cc-compare --period=month   # this month vs last month
npx cc-compare --period=14d     # last 14 days vs 14 days before that
npx cc-compare --json           # raw JSON output
```

## Output

```
  cc-compare  —  week over week
  2026-02-16 → 2026-02-22  vs  2026-02-23 → 2026-03-01
  ────────────────────────────────────────────────────────────

  You (interactive hours)
    prev  ████████████░░░░  9.2h
    now   ██████████████░░  11.1h  ▲ +1.9h (+21%)

  AI (autonomous hours)
    prev  ████████░░░░░░░░  6.8h
    now   ████████████░░░░  9.4h  ▲ +2.6h (+38%)

  AI Autonomy Ratio  (AI hours / your hours)
    prev  0.74x
    now   0.85x
    ↑ AI is getting more autonomous

  Ghost Days  (AI worked, you didn't)
    prev  1 days
    now   2 days  ▲ +1 day (+100%)

  Active Days
    prev  ████████  5 / 7 days
    now   ████████  6 / 7 days  ▲ +1 day (+20%)

  ────────────────────────────────────────────────────────────

  Insights:
    ▸ You're more active this week
    ▸ AI autonomy increasing — your AI is handling more
    ▸ More Ghost Days — AI running more independently
```

## Options

| Flag | Description |
|------|-------------|
| `--period=week` | Compare this week vs last week (default) |
| `--period=month` | Compare this month vs last month |
| `--period=Nd` | Compare last N days vs the N days before that |
| `--json` | Print raw JSON for scripting |
| `--help` | Show help |

## What it measures

- **Your hours** — time in interactive Claude Code sessions
- **AI hours** — time in autonomous/subagent sessions
- **Autonomy ratio** — AI hours ÷ your hours (>1.0 = AI working more than you)
- **Ghost Days** — days where AI worked but you had zero interactive sessions
- **Active days** — total days with any Claude Code activity

## Requirements

- Node.js 18+
- [`cc-agent-load`](https://www.npmjs.com/package/cc-agent-load) installed globally or in PATH

## Part of cc-toolkit

This tool is part of the [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) collection of Claude Code utilities.

**Zero dependencies. No data sent anywhere. Runs entirely local.**
