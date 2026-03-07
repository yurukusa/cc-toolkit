# cc-stats-badge

Generate a Claude Code stats badge for your GitHub README.

Shows your current streak, monthly hours, and AI autonomy ratio — updated automatically with a cron job.

## Quick start

```bash
# Generate badge SVG
npx @yurukusa/cc-stats-badge --out=cc-badge.svg

# Add to your README
# ![Claude Code](./cc-badge.svg)
```

The output looks like:

```
[Claude Code | 36d streak | 47h Mar | 0.9x AI]
```

Color changes based on streak length: green (< 7 days) → orange (7-30 days) → red (30+ days).

## Options

```
cc-stats-badge                     # Print SVG to stdout
cc-stats-badge --out=badge.svg     # Write SVG to file
cc-stats-badge --shields           # Print shields.io URL
cc-stats-badge --markdown          # Print README snippet with both options
```

### `--markdown` output

```markdown
<!-- Option 1: Local SVG (regenerate with cron) -->
![Claude Code](./cc-badge.svg)

<!-- Option 2: Static shields.io badge -->
![Claude Code](https://img.shields.io/badge/Claude%20Code-36d+streak+%7C+47h+%7C+0.9x+AI-red)
```

## Auto-update with cron

Add this to your crontab to regenerate the badge every morning and commit it:

```bash
# crontab -e
0 8 * * * cd /path/to/your-profile-repo && \
  npx @yurukusa/cc-stats-badge --out=cc-badge.svg && \
  git add cc-badge.svg && \
  git diff --cached --quiet || \
  git commit -m "chore: update CC stats badge" && \
  git push
```

## What the metrics mean

- **Streak**: Consecutive days with any Claude Code activity (interactive or AI sub-agent)
- **Hours**: Total hours this month (you + AI combined)
- **AI ratio**: AI sub-agent hours ÷ your interactive hours

Ghost Days — days where AI ran while you didn't touch the keyboard — count toward both your streak and total hours.

## Requirements

- Node.js 18+
- [`cc-agent-load`](https://www.npmjs.com/package/cc-agent-load) installed globally

```bash
npm install -g cc-agent-load
```

## Part of cc-toolkit

This tool is part of the [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) collection — 36 free tools for understanding your Claude Code usage.

**Zero dependencies. No data sent anywhere. Runs entirely local.**
