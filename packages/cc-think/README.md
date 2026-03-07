# cc-think

> How deeply does Claude Code think before acting?

Analyzes thinking blocks in your session transcripts: how often Claude reasons before tool calls, how deep that reasoning goes, and the total volume of hidden deliberation.

## Usage

```bash
npx cc-think
npx cc-think --json
```

Or open `index.html` in a browser and drag in `.jsonl` files.

## Metrics

- **Thinking rate** — % of sessions that include thinking blocks
- **Total blocks** — thinking blocks across all sessions
- **Hidden reasoning chars** — total characters in thinking blocks
- **Depth tiers** — micro (<50c) / brief (50–299c) / medium (300–1999c) / deep (2000+c)
- **Blocks per session** — median and max

## Sample output

```
cc-think — How deeply does Claude Code think before acting?

Sessions analyzed: 757

Thinking usage
  ████████████████░░░░░░░░░░░░░░ 52.8%  sessions use thinking blocks
  ██████████████░░░░░░░░░░░░░░░░ 47.2%  no thinking — straight to action

Thinking volume
  54.1K thinking blocks  |  25.2M chars of hidden reasoning
  median 204c/block  |  mean 467c  |  max 41552c

Thinking depth distribution
  micro    ██░░░░░░░░░░░░░░░░░░░░   11%  instant check (<50c)
  brief    ███████████░░░░░░░░░░░   48%  quick check (50–299c)
  medium   ████████░░░░░░░░░░░░░░   37%  planning step (300–1999c)
  deep     █░░░░░░░░░░░░░░░░░░░░░    3%  extended reasoning (2000+c)

Thinking blocks per session
  median 23  |  max 4504 blocks in one session
```

## License

MIT
