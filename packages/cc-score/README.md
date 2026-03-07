# cc-score

Your Claude Code AI Productivity Score. One number. Shareable.

```bash
npx cc-score
npx cc-score --share   # print a tweet-ready summary
```

## Output

```
  cc-score
  Your AI Productivity Score — last 30 days

  92 / 100   S  Cyborg
  You and AI are seamlessly fused.

  ────────────────────────────────────────────────────

  Consistency   ██████████  30/30  30/30 days active
  Autonomy      ████████░░  19/25  1.48x ratio (71h AI / 48h you)
  Ghost Days    █████████░  18/20  22 days AI ran solo (73%)
  Volume        ██████████  15/15  119.0h total
  Streak        ██████████  10/10  36 days current streak
```

## Grades

| Score | Grade | Label |
|-------|-------|-------|
| 90–100 | S | Cyborg |
| 75–89 | A | Power User |
| 60–74 | B | Growing |
| 45–59 | C | Early Stage |
| 30–44 | D | Getting Started |
| 0–29 | F | Dormant |

## Score Breakdown (30 days)

| Component | Max | What it measures |
|-----------|-----|-----------------|
| Consistency | 30 | % of days with any activity |
| Autonomy | 25 | AI hours ÷ your hours |
| Ghost Days | 20 | Days AI ran while you were offline |
| Volume | 15 | Total hours (caps at 100h) |
| Streak | 10 | Current consecutive-day streak |

## Share your score

```bash
npx cc-score --share
```

Output:
```
My Claude Code AI Score: 92/100 (S — Cyborg)
→ 30 active days, 1.48x autonomy ratio, 36-day streak
npx cc-score #ClaudeCode #AIProductivity
```

## Requirements

- Node.js 18+
- [`cc-agent-load`](https://www.npmjs.com/package/cc-agent-load) installed globally or in PATH

## Part of cc-toolkit

This tool is part of the [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) collection of Claude Code utilities.

**Zero dependencies. No data sent anywhere. Runs entirely local.**
