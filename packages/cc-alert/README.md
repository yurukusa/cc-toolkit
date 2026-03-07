# cc-alert

Streak risk notifier for Claude Code. Set it as a cron job and never lose a streak again.

```bash
npx cc-alert
```

```
  ⚠ STREAK AT RISK  2026-03-01
  Your 36-day streak ends today if you don't open Claude Code.
  No activity recorded yet today.
```

Or when you're safe:

```
  ✓ Streak safe  2026-03-01
  36 day streak · 3.2h you + 5.1h AI today
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Streak safe (you coded today) |
| `1`  | Streak at risk (no activity today, streak to lose) |
| `2`  | No streak (nothing to protect) |
| `3`  | Data load error |

These are useful in scripts and CI:

```bash
npx cc-alert || echo "Go code something!"
```

## Cron setup

Check every day at 8pm:

```bash
# Add to crontab (crontab -e)
0 20 * * * /usr/bin/npx cc-alert --notify
```

Or warn when you open a terminal after 6pm:

```bash
# Add to ~/.bashrc or ~/.zshrc
[ $(date +%H) -ge 18 ] && npx cc-alert
```

## Options

```
cc-alert             # Check and print status
cc-alert --notify    # Also send OS notification (macOS/Linux/WSL)
cc-alert --json      # Machine-readable output
cc-alert --quiet     # Exit code only, no output
cc-alert --help      # Show help
```

### `--notify`

Sends a native OS notification when your streak is at risk.

- **macOS**: `osascript` (built-in, no dependencies)
- **Linux**: `notify-send` (install `libnotify-bin`)
- **WSL2**: PowerShell MessageBox

### `--json`

```json
{
  "today": "2026-03-01",
  "codedToday": false,
  "todayMain": 0,
  "todaySub": 0,
  "streakAtRisk": 36,
  "currentStreak": 36,
  "status": "at_risk",
  "exitCode": 1
}
```

## What's a streak?

A Claude Code streak = consecutive days with at least some activity (interactive or sub-agent). Tracked by [`cc-streak`](https://www.npmjs.com/package/cc-streak).

Ghost Days count toward your streak — days when your AI ran autonomously while you were offline still keep the streak alive.

## Requirements

- Node.js 18+
- [`cc-agent-load`](https://www.npmjs.com/package/cc-agent-load) installed globally or in PATH

## Part of cc-toolkit

This tool is part of the [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) collection of Claude Code utilities.

The cc-toolkit loop: **Track** (cc-session-stats) → **Understand** (cc-agent-load, cc-project-stats) → **Predict** (cc-predict) → **Act** (cc-alert)

**Zero dependencies. No data sent anywhere. Runs entirely local.**
