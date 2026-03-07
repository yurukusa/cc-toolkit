# cc-save

> How much money has Claude's prompt cache saved you?

Calculates the real dollar value of prompt caching — the difference between what you paid and what you would have paid if every cached token was billed as fresh input.

## Usage

```bash
npx cc-save
npx cc-save --json
```

Override pricing (default: Sonnet 4.6):
```bash
npx cc-save --input=3.00 --cache-r=0.30 --cache-w=3.75 --output=15.00
```

Or open `index.html` in a browser and drag in `.jsonl` files.

## Metrics

- **Savings** — `cache_read_tokens × (input_price - cache_read_price) / 1M`
- **Cache hit rate** — % of input tokens served from cache vs fresh
- **Cost breakdown** — actual vs hypothetical total
- **Per-session average** — savings and cost per session

## Sample output

```
cc-save — How much money has Claude's prompt cache saved you?

  $59.7K saved by prompt caching
  86% of what you'd pay without caching

Cost breakdown  (519 sessions, 219,669 turns)
  Input (fresh)    $15.35    5.1M tokens × $3.00/1M
  Cache reads      $6.6K    22.1B tokens × $0.30/1M
  Cache written    $2.5K   668.7M tokens × $3.75/1M
  Output          $291.82   19.5M tokens × $15.00/1M
  ──────────────────────────────────────────
  Actual total     $9.4K
  Without caching $69.1K   (if cache reads billed as fresh input)

Cache efficiency
  Hit rate         97%  of total input tokens served from cache
  Cache multiplier 10×  cheaper per token
  Per session      $115.00 saved / $18.20 actual cost

Prompt caching saved you $59.7K (86% of your hypothetical bill).
```

## License

MIT
