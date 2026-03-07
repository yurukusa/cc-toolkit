# cc-warmup

> Does Claude Code warm up or fade?

Splits each session into early, mid, and late thirds — then measures tool execution rate in each phase. Shows whether Claude accelerates, plateaus, or decelerates within a session.

## Usage

```bash
npx cc-warmup
npx cc-warmup --json
```

Or open `index.html` in a browser and drag in `.jsonl` files.

## Metrics

- **Phase rates** — tools/hr in early / mid / late thirds
- **Pattern** — warmup (accelerating) / flat / fade (decelerating)
- **Median ratio** — late phase rate ÷ early phase rate
- **Top sessions** — biggest warmup and fadeout examples

## Sample output

```
cc-warmup — Does Claude Code warm up or fade?

Sessions analyzed: 330

Average pace by session phase  (tools/hr)
  early    ████████████████████  195  (first third)
  mid      ███████████░░░░░░░░░  107  (middle third)
  late     ████████████░░░░░░░░  121  (final third)

Session patterns
  warmup  ██████░░░░░░░░░░░░░░░░   26%  (86)  rate increases as session progresses
  flat    ███░░░░░░░░░░░░░░░░░░░   14%  (47)  rate stays roughly constant
  fade    █████████████░░░░░░░░░   60%  (197)  rate decreases as session progresses

Median late/early ratio: 0.64×
Sessions tend to decelerate — context fills, pace drops.
```

## License

MIT
