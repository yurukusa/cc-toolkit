# cc-human

> What does your human actually do during a Claude Code session?

Measures human presence in your sessions: how often Claude runs purely autonomously vs. how often the human sends follow-up messages, and what kind of messages they send.

## Usage

```bash
npx cc-human
npx cc-human --json
```

Or open `index.html` in a browser and drag in your `.jsonl` files.

## Metrics

- **Pure-autonomous rate** — sessions where the human writes only the initial prompt
- **Interactive rate** — sessions with follow-up messages
- **Messages per session** — median, mean, max
- **Initial prompt length** — how much context the human provides upfront
- **Follow-up types** — ack (<30c) / direction (30–149c) / correction (150–599c) / briefing (600+c)

## What counts as a "human message"?

Only `text` content in `user`-role messages. Tool results (tool_result blocks) are excluded — those are Claude's own output coming back, not human input.

## Sample output

```
cc-human — What does your human actually do?

Sessions analyzed: 183

Human engagement split
  ███████████░░░░░░░░░░░░░░░░░░░ 35.5%  pure-autonomous
  ███████████████████░░░░░░░░░░░ 64.5%  interactive

Human messages per session
  median 2 msg  |  mean 6.1  |  max 87

Follow-up message types  (941 total, median 42 chars)
  ack        ██████░░░░░░░░░░░░░░   26%  ok / yes / done
  direction  ██████████████░░░░░░   69%  brief instructions
  correction  ░░░░░░░░░░░░░░░░░░░░   0%  multi-sentence
  briefing   █░░░░░░░░░░░░░░░░░░░   4%  long task dump
```

## License

MIT
