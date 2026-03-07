# cc-cost-forecast

Project your Claude Code API cost to month-end.

```
npx cc-cost-forecast
```

## What it shows

- **Today / this week / this month** — cumulative API-equivalent spend
- **Daily average** — based on active usage days this month
- **Month-end forecast** — current pace × remaining days
- **Plan tier comparison** — how your forecast compares to Max plan tiers ($20/$100/$200/$400)
- **30-day sparkline** — daily usage intensity at a glance

## Sample output

```
  cc-cost-forecast  API-equivalent cost estimator
  ────────────────────────────────────────────────────

  Period
  Today              $12.432
  This week          $87.201
  This month        $142.819  (14 of 31 days)
  Daily avg          $10.201  (14 active days)

  Forecast
  Month-end est      $173.044  (17 days remaining)

  vs. Max plan tiers
  $20    ████████████████████ ⚠  865%  OVER BUDGET
  $100   ████████████████████ ⚠  173%  OVER BUDGET
  $200   ████████████░░░░░░░░   87%  WARNING
  $400   ██████░░░░░░░░░░░░░░   43%  OK

  Daily cost — last 30 days
  ▁▂▄▁▃▃ ▂▃▂▂   ▃▅▄▂▂█▂▂▂▃▁▁▁▂▆▂
  2026-01-31                today

  Note: API-rate pricing. Max plan cost = subscription fee.
  Estimate shows relative usage intensity, not actual charge.
```

## Usage

```bash
# Live mode — refresh every 30 seconds
npx cc-cost-forecast

# Snapshot — print once and exit
npx cc-cost-forecast --once

# Set custom budget ceiling
npx cc-cost-forecast --budget 150
```

## How it works

1. Scans all `~/.claude/projects/**/*.jsonl` transcripts
2. Extracts token usage from each assistant message
3. Calculates API-equivalent cost per day (input/output/cache pricing)
4. Projects month-end spend based on daily average this month
5. Compares forecast against Max plan tiers

**Zero dependencies. No data sent anywhere. Runs entirely local.**

## Cost estimate note

Uses Claude Sonnet 4.x API pricing ($3/$15 per M input/output tokens).

If you're on a Max plan subscription, your actual monetary cost is the subscription fee — not the API-rate equivalent. The estimate reflects **usage intensity**, useful for understanding burn rate and relative cost across projects or time periods.

## Part of cc-toolkit

cc-cost-forecast is one of 60 free tools for Claude Code users.

**→ [See all tools at yurukusa.github.io/cc-toolkit](https://yurukusa.github.io/cc-toolkit/)**

## License

MIT
