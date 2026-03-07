# cc-checkin

> When does your human check in?

Analyzes the timing of user follow-up messages within Claude Code sessions. Shows whether humans supervise early, check in mid-session, or review near the end — and how long they trust CC to run solo.

## Usage

```bash
npx cc-checkin
npx cc-checkin --json
```

Or open `index.html` in a browser and drag in `.jsonl` files.

## Metrics

- **Autonomous rate** — sessions with zero follow-up messages
- **Check-in timing** — early (0–33%) / mid (33–67%) / late (67–100%) of session
- **Trust duration** — time before the human first checks in
- **Longest trust runs** — sessions with the longest autonomous stretch before any check-in

## Sample output

```
cc-checkin — When does your human check in?

Sessions analyzed: 162

Session type
  autonomous    30%  (48)  zero follow-ups after initial prompt
  interactive   70%  (114) human checked in at least once

When do check-ins happen?  (939 total check-ins)
  early   31%  (290)  0–33% into session — supervising startup
  mid     26%  (246)  33–67% — checking on progress
  late    43%  (403)  67–100% — reviewing near the end

Trust duration
  median   9min  — typical autonomous run before human checks in
  max     15.8h  — longest solo run before first check-in
  avg/session  8.2 check-ins in interactive sessions

30% of sessions run completely uninterrupted.
Median trust: 9 minutes autonomous before the human looks in.
```

## License

MIT
