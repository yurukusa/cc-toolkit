# cc-project-stats

Where are you actually spending your Claude Code time? This tool breaks down your hours by project — ranked by total time, split between you and AI.

## Usage

```bash
npx cc-project-stats             # last 7 days
npx cc-project-stats --days=30   # last 30 days
npx cc-project-stats --all       # all time
npx cc-project-stats --json      # raw JSON output
```

## Output

```
  cc-project-stats  —  last 7 days
  2026-02-22 → 2026-03-01
  ──────────────────────────────────────────────────────────────────

  Project                               You       AI       Total
  ──────────────────────────────────────────────────────────────────
  cc-loop                ██████████████   24.6h    11.1h    35.7h
  ~                      ████████░░░░░░    4.8h    11.1h    15.9h

  ──────────────────────────────────────────────────────────────────
  Total                              29.3h    22.2h    51.5h

  Top: cc-loop — 69% of total, human-led (69% interactive)
```

The bar chart shows cyan (█) for your interactive hours and yellow (█) for AI autonomous hours within each project.

## Options

| Flag | Description |
|------|-------------|
| `--days=<N>` | Look back N days (default: 7) |
| `--all` | Show all-time stats |
| `--json` | Print raw JSON for scripting |
| `--help` | Show help |

## How it works

Reads session files directly from `~/.claude/projects/`. Uses the same methodology as [cc-agent-load](https://www.npmjs.com/package/cc-agent-load):
- **Your hours** (cyan): direct conversation sessions
- **AI hours** (yellow): autonomous subagent sessions in `*/subagents/`
- **Duration**: time between first and last message in each session file

## Requirements

- Node.js 18+
- Claude Code with `~/.claude/projects/` session history

No external dependencies needed. Works independently of cc-agent-load.

## Part of cc-toolkit

This tool is part of the [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) collection of Claude Code utilities.

**Zero dependencies. No data sent anywhere. Runs entirely local.**
