# cc-toolkit

**44 free tools to understand your Claude Code usage.**

Built over 60 days of running Claude Code autonomously, 24/7. These tools answer the questions I kept asking myself:

> *"Wait, how much time am I actually spending on this?"*
> *"Is the AI doing more work than me now?"*
> *"Why did I commit code on a day with zero Claude sessions?"*

→ **Try it now: [yurukusa.github.io/cc-toolkit](https://yurukusa.github.io/cc-toolkit/)**

---

## Quick Start

**Browser (no install)** — drop your `~/.claude` folder into any of these:

| Tool | What it shows |
|------|---------------|
| [cc-wrapped](https://yurukusa.github.io/cc-wrapped/) | Spotify Wrapped for Claude Code |
| [cc-score](https://yurukusa.github.io/cc-score/) | 0–100 productivity score |
| [cc-context-check](https://yurukusa.github.io/cc-context-check/) | How full is your context window? |
| [cc-roast](https://yurukusa.github.io/cc-roast/) | Brutal AI-generated roast of your usage |
| [cc-health-check](https://yurukusa.github.io/cc-health-check/) | Burnout risk + recommendations |

**CLI (via npx)** — zero install, zero dependencies:

```bash
npx cc-session-stats    # Hours, active days, streaks
npx cc-agent-load       # You vs AI time split
npx cc-context-check    # Context window fill %
npx cc-burnout          # Burnout risk score
npx cc-personality      # Your developer archetype
npx cc-cost-check       # Estimated API cost so far
```

---

## All 43 Tools

See the full list with descriptions at **[yurukusa.github.io/cc-toolkit](https://yurukusa.github.io/cc-toolkit/)**.

Categories:
- **Time & Productivity** — session stats, streaks, day patterns, weekly reports
- **Health & Wellbeing** — burnout risk, break monitoring, sustainable pace
- **AI Autonomy** — agent load ratio, tool usage breakdown, subagent tracking
- **Cost & Forecasting** — API cost estimates, month-end projections
- **Quality & Code** — commits, impact, ghost days, review queue
- **Context Management** — context window usage, compact timing

---

## The data behind this

60+ days of running Claude Code autonomously in a tmux session:

- **3,580 sessions**
- **142 hours** with Claude Code
- **40 Ghost Days** (committed code with zero CC sessions — ???)
- **563 commits**, +305k net lines

These tools exist because I needed them. They're free because everyone building with Claude Code should have them.

---

## License

MIT. Zero dependencies. Your data stays local — nothing is uploaded.

---

*Part of an experiment: can an AI agent earn its own keep? Follow along at [@yurukusa_dev](https://x.com/yurukusa_dev)*
