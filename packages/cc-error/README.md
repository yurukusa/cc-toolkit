# cc-error

[![npm version](https://img.shields.io/npm/v/cc-error.svg)](https://www.npmjs.com/package/cc-error)
[![npm downloads](https://img.shields.io/npm/dm/cc-error.svg)](https://www.npmjs.com/package/cc-error)

Which Claude Code tools fail most often? Tracks `is_error` across all tool results to find failure patterns.

```
npx cc-error
```

Zero dependencies. Reads `~/.claude/projects/` directly.

## Output

```
cc-error — Tool Failure Rates in Claude Code
====================================================
Sessions: 1,977 | 54.5% hit ≥1 error
Total calls: 143,714 | Errors: 6,444 (4.5% overall)

Error rate by tool (top 10, ≥10 calls):
  WebFetch                 ████████░░░░░░░░░░░░   24.8%  (378/1,523)
  KillShell                ██░░░░░░░░░░░░░░░░░░    8.0%  (2/25)
  Bash                     ██░░░░░░░░░░░░░░░░░░    6.1%  (3330/54,519)
  TaskOutput               ██░░░░░░░░░░░░░░░░░░    5.3%  (44/825)
  Read                     █░░░░░░░░░░░░░░░░░░░    4.2%  (1544/36,664)
  Glob                     █░░░░░░░░░░░░░░░░░░░    3.9%  (109/2,785)
  Edit                     █░░░░░░░░░░░░░░░░░░░    3.5%  (605/17,310)
```

## What it tells you

- **54% of sessions hit at least one error** — errors are the norm, not the exception
- **WebFetch fails 25% of the time** — blocked URLs, auth walls, timeouts. 1 in 4 web fetches fails
- **Bash has 6% error rate** — across 54K calls, that's 3,300 failed commands
- **Read fails 4%** — usually reading a file that doesn't exist yet
- **Edit fails 3.5%** — old_string not found in file
- **4.5% overall error rate** means Claude handles ~1 error per 22 tool calls

## Flags

```bash
npx cc-error          # tool failure rankings
npx cc-error --json   # raw JSON output
```

## Browser version

**[yurukusa.github.io/cc-error](https://yurukusa.github.io/cc-error/)** — drag and drop your projects folder.

Part of [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) — tools for understanding your Claude Code sessions.

---

*Source: [yurukusa/cc-error](https://github.com/yurukusa/cc-error)*
