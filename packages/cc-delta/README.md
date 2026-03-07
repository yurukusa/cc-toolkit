# cc-delta

[![npm version](https://img.shields.io/npm/v/cc-delta.svg)](https://www.npmjs.com/package/cc-delta)
[![npm downloads](https://img.shields.io/npm/dm/cc-delta.svg)](https://www.npmjs.com/package/cc-delta)

Analyze Claude Code edit sizes — are you making surgical fixes or rewriting whole files? Measures `old_string` and `new_string` lengths from every Edit tool call.

```
npx cc-delta
```

Zero dependencies. Reads `~/.claude/projects/` directly.

## Output

```
cc-delta — Edit Change Size Distribution
================================================
Sessions: 1,835 | Edits: 17,295 | Changed: 2,841K → 3,362K chars (+18.3%)

Edit size distribution (by old_string length):
  micro   (<20)        ████████████             4,120   23.8%
  surgical(20-99)      ████████████████         5,716   33.1%
  moderate(100-499)    █████████                5,189   30.0%
  large  (500-1999)    ████                     1,641    9.5%
  massive(2000+)       ██                         629    3.6%

Expansion ratio (new_len / old_len):
  Median : 1.12×  |  Mean: 1.18×  |  p90: 2.41×
  Shrink : 31.2%  |  Grow: 58.4%  |  Same size: 10.4%

Top file types:
  Ext       Edits   AvgSize  Expansion
  ─────────────────────────────────────────
  .py        5,842     312    1.22×
  .md        3,109     184    1.31×
  .html      2,847     428    1.19×
  .mjs       1,923     281    1.16×
  .json        891      89    1.04×
  .ts          734     203    1.21×
  .sh          312      97    1.11×
  .txt         183      62    1.08×
```

## What it tells you

- **57% of edits are small (micro + surgical)** — most Claude Code edits are targeted fixes, not rewrites
- **Claude adds more than it removes (median 1.12×)** — code grows with each edit session
- **Massive edits (2000+ chars) are only 3.6%** but represent ~40% of total changed content
- **Markdown expands most (1.31×)** — docs and READMEs grow the most when edited
- **JSON expands least (1.04×)** — configuration changes are tight and precise
- **p90 ratio is 2.41×** — 10% of edits more than double the original content

## Dig into a specific file type

```bash
npx cc-delta --ext=py      # Python edit breakdown
npx cc-delta --ext=html    # HTML edit patterns
npx cc-delta --ext=json    # Config file edits
npx cc-delta --json        # raw JSON output
```

## Browser version

**[yurukusa.github.io/cc-delta](https://yurukusa.github.io/cc-delta/)** — drag and drop your projects folder. Includes histograms of edit sizes and expansion ratios.

Part of [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) — tools for understanding your Claude Code sessions.

---

*Source: [yurukusa/cc-delta](https://github.com/yurukusa/cc-delta)*
