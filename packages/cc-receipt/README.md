# cc-receipt

**ASCII receipt of your AI's daily work. The AI never clocks out.**

```bash
$ npx cc-receipt --date=2026-02-20

╔════════════════════════════════════╗
║         AI  WORK  RECEIPT          ║
║        Feb 20, 2026  (Fri)         ║
╠════════════════════════════════════╣
║            — PROJECTS —            ║
║ namakusa                    8h 29m ║
║    ↳ 27 sessions  +17,955 lines    ║
║ risk-score-scanner          6h 02m ║
║      ↳ 6 sessions  +487 lines      ║
║ nursery-shift                  19m ║
║     ↳ 3 sessions  +4,006 lines     ║
╟────────────────────────────────────╢
║ AI ACTIVE TIME             16h 49m ║
║ SESSIONS                        70 ║
║ LINES ADDED                +28,630 ║
║ FILES TOUCHED                  314 ║
╟────────────────────────────────────╢
║ YOUR SLEEP                      7h ║
║ AI SLEEP                        0m ║
╟────────────────────────────────────╢
║     AI WORKED WHILE YOU SLEPT      ║
╚════════════════════════════════════╝
```

## Install & run

```bash
# Yesterday's receipt
npx cc-receipt

# Specific date
npx cc-receipt --date=2026-02-20

# With custom sleep hours
npx cc-receipt --sleep=8

# Wider format
npx cc-receipt --wide
```

## Ghost Day support

If there's no proof-log for that date:

```
╔════════════════════════════════════╗
║         AI  WORK  RECEIPT          ║
║        Feb 26, 2026  (Thu)         ║
╠════════════════════════════════════╣
║           👻  GHOST DAY            ║
║      AI worked autonomously.       ║
║       No sessions logged.          ║
╚════════════════════════════════════╝
```

## Requirements

- Node.js 18+
- `~/ops/proof-log/YYYY-MM-DD.md` files (from Claude Code proof-log hook)

## Options

```
--date=YYYY-MM-DD   Date to report on (default: yesterday)
--dir=PATH          Proof-log directory (default: ~/ops/proof-log)
--sleep=N           Your sleep hours for comparison (default: 7)
--wide              Wider receipt format
```

## Part of cc-toolkit

One of 36 free tools for understanding your Claude Code usage.
→ [yurukusa.github.io/cc-toolkit](https://yurukusa.github.io/cc-toolkit/)

## License

MIT
