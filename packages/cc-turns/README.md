# cc-turns

[![npm version](https://img.shields.io/npm/v/cc-turns.svg)](https://www.npmjs.com/package/cc-turns)
[![npm downloads](https://img.shields.io/npm/dm/cc-turns.svg)](https://www.npmjs.com/package/cc-turns)

Analyze user turn count per Claude Code session — how often do you step in? 28% of sessions are fire-and-forget (you send one message, Claude does everything). Longer sessions get proportionally more tools.

```
npx cc-turns
```

Zero dependencies. Reads `~/.claude/projects/` directly.

## Output

```
cc-turns — User Turn Count per Session
============================================
Sessions: 1,835 | Median: 3 turns | Mean: 4.2 | p90: 11 turns
Fire-and-forget rate (1 user turn): 28.3%

Turn count distribution:
  1 turn     ████████               513   28.3%  avg  18.4 tools
  2–3 turns  ████████████████       783   42.7%  avg  32.6 tools
  4–7 turns  █████████              312   17.0%  avg  58.4 tools
  8–14 turns ████                   148    8.1%  avg  94.7 tools
  15+ turns  ██                      79    4.3%  avg 182.3 tools

Correlation (user turns → tool calls):
  1       18.4 tool calls/session
  2-3     32.6 tool calls/session
  4-7     58.4 tool calls/session
  8-14    94.7 tool calls/session
  15+    182.3 tool calls/session
```

## What it tells you

- **28% of sessions are fire-and-forget** — one message, Claude executes everything. No back-and-forth needed
- **42% have 2–3 user turns** — the most common pattern: you check in once or twice, Claude handles the rest
- **Tool count scales with turns** — 15+ turn sessions average 182 tools vs 18 for single-turn sessions. Complexity compounds
- **Median: 3 turns** — most Claude Code sessions are short collaborative exchanges, not long autonomous marathons
- **p90 is 11 turns** — only 10% of sessions require more than 11 user messages

## Browser version

**[yurukusa.github.io/cc-turns](https://yurukusa.github.io/cc-turns/)** — drag and drop your projects folder. Includes distribution chart and correlation visualization.

```bash
npx cc-turns        # full report
npx cc-turns --json # raw JSON output
```

Part of [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) — tools for understanding your Claude Code sessions.

---

*Source: [yurukusa/cc-turns](https://github.com/yurukusa/cc-turns)*
