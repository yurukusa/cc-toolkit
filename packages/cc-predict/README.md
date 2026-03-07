# cc-predict

The only cc-toolkit tool that looks **forward**. Forecasts your Claude Code month-end stats at your current pace.

```bash
npx cc-predict
```

## Output

```
  cc-predict  —  March forecast
  Based on your last 14 days · 30 days remaining this month

  Hours this month
  So far:          0.0h you + 0.2h AI = 0.2h
  At current pace: 100.5h you + 89.3h AI = 189.8h projected

  Ghost Days
  So far:          1 days
  Month end:       ~22 days projected

  Streak
  Current:         36 days
  Forecast:        Likely survives (100% daily consistency)
  Projected streak end of month: ~66 days

  AI Autonomy
  14-day avg:      0.89x (AI hours / your hours)
    You're driving more than AI

  ──────────────────────────────────────────────────────────
  Confidence: ██████████ 100% active days base rate
```

## How it works

Looks at your last 14 days of activity and projects the current pace forward to the end of the month:

- **Hours**: daily average × remaining days + month-to-date
- **Ghost Days**: ghost day rate × remaining active days
- **Streak**: current streak + projected active days (with confidence warning if streak is at risk)
- **Autonomy**: 14-day average AI/human ratio

## Requirements

- Node.js 18+
- [`cc-agent-load`](https://www.npmjs.com/package/cc-agent-load) installed globally or in PATH

## Part of cc-toolkit

This tool is part of the [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) collection of Claude Code utilities.

All other cc-toolkit tools look at historical data. cc-predict is the only one that looks forward.

**Zero dependencies. No data sent anywhere. Runs entirely local.**
