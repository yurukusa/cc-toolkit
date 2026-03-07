# cc-agent-load

See how much of your Claude Code time is **you** vs **AI autonomous subagents**.

**Try it in your browser:** [yurukusa.github.io/cc-agent-load](https://yurukusa.github.io/cc-agent-load/)

```
npx cc-agent-load
```

## Sample output

```
  cc-agent-load
  ═════════════════════════════════════════════
  Scanning: ~/.claude/projects/

  ▸ Your Time vs AI Time

  You   ████████░░░░░░░░░░░░░░░░  41h (34%)  86 sessions
  AI    ████████████████░░░░░░░░  80h (66%)  3423 sessions

  ▸ AI Autonomy Ratio
  ████████ 1.9x  — AI ran 1.9x longer than you

  Your AI matches your pace.

  ▸ Top Projects (AI load)
  ~                     █████████░░░  90.7h total
  cc-loop               ███░░░░░░░░░  26.5h total

  ▸ Ghost Days  (AI worked, you didn't)

  39 days  AI ran without you  —  52.4h total
  Longest: 2026-02-09 (6.0h)
    2026-02-09  6.0h
    2026-01-30  5.7h
    2026-02-16  5.0h
    ... and 36 more

  ── Share ──
  My Claude Code AI load: 66% subagent / 34% me — 1.9x autonomy ratio
  npx cc-agent-load  #ClaudeCode #AIAutonomy
```

## What it tells you

When you run `cc-session-stats`, the session count includes every subagent spawned via the Task tool. This tool separates them:

| Metric | What it means |
|--------|---------------|
| **Your time** | Sessions where you were at the keyboard |
| **AI time** | Autonomous subagent sessions (Task tool spawns) |
| **Autonomy ratio** | How much longer AI ran vs. you |
| **Ghost Days** | Days where AI ran but you had zero sessions |

An autonomy ratio of `2.0x` means your AI worked twice as long as you did.

**Ghost Days** are the most striking metric: days where you never opened Claude Code, but your autonomous pipelines kept running anyway. Some users find the AI worked 5–6 hours on days they were completely offline.

The browser version also includes an **Activity Calendar** — a GitHub-style heatmap showing your activity vs. AI activity day by day. Ghost Days (AI-only days) appear in purple; your sessions in blue; overlapping days in yellow.

Open [yurukusa.github.io/cc-agent-load](https://yurukusa.github.io/cc-agent-load/), select your `~/.claude` folder, and the calendar renders instantly. No install needed.

## How it works

Claude Code saves session transcripts in `~/.claude/projects/`. Subagent sessions are stored in `<uuid>/subagents/` subdirectories. This tool scans both and separates them.

**Zero dependencies. No data sent anywhere. Runs entirely local.**

## Related tools

| Tool | What it checks |
|------|----------------|
| **cc-agent-load** | How much is YOU vs. AI? |
| [cc-session-stats](https://github.com/yurukusa/cc-session-stats) | Total usage stats |
| [cc-ghost-log](https://github.com/yurukusa/cc-ghost-log) | Git commits from Ghost Days |
| [cc-personality](https://github.com/yurukusa/cc-personality) | What kind of developer are you? |
| [cc-wrapped](https://yurukusa.github.io/cc-wrapped/) | Your AI year in review |

All tools: [cc-toolkit](https://yurukusa.github.io/cc-toolkit/)

## License

MIT
