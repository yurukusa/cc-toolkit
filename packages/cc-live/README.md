# cc-live

Watch your active Claude Code session in real-time.

```
npx cc-live
```

## What it shows

- **Token breakdown** — input, output, cache writes, cache reads (updated every 5s)
- **Cost estimate** — API-rate pricing (Max plan users: your actual cost is the subscription)
- **Burn rate** — tokens/minute at current pace, projected hourly cost
- **Cache hit rate** — how well Claude is reusing cached context (higher = cheaper)

## Sample output

```
  cc-live  Active session monitor
  ────────────────────────────────────────────────

  Project  my-project
  Model    sonnet-4-6
  Duration 2h 14m  ·  142 turns

  Tokens
  Input          4.2K  ← fresh context per turn
  Output        89.3K
  Cache write  512.1K  → reused next turn
  Cache read     3.4M  × 10 cheaper than input
  Total         93.5K

  Cost estimate  (API rate — Max plan users: cost = subscription)
  This session  $1.842
  Burn rate     8.2K/min  ≈ $0.073/hr at current pace

  Cache hit rate  (higher = cheaper)
  ████████████████████░░░░ 86%

  ↻ 4:15:14 PM  · Ctrl+C to exit  · --once for snapshot
```

## Usage

```bash
# Live mode (default) — refresh every 5 seconds
npx cc-live

# Snapshot — print once and exit
npx cc-live --once
```

## How it works

1. Scans `~/.claude/projects/` for the most recently modified `.jsonl` transcript
2. Parses token usage from each assistant message
3. Calculates cumulative totals, cache efficiency, and estimated cost
4. Re-renders every 5 seconds

**Zero dependencies. No data sent anywhere. Runs entirely local.**

## Cost estimate note

The cost shown uses Claude Sonnet 4.x API pricing ($3/$15 per M input/output tokens).
If you're on a Max plan subscription, your actual monetary cost is the subscription fee.
The estimate is useful for understanding **relative session cost** and burn rate.

## Part of cc-toolkit

cc-live is one of 48 free tools for Claude Code users.

**→ [See all tools at yurukusa.github.io/cc-toolkit](https://yurukusa.github.io/cc-toolkit/)**

## License

MIT
