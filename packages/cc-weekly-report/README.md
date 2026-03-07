# cc-weekly-report

Generate a weekly AI activity report from your Claude Code proof-log files.

```
npx cc-weekly-report
```

## What it does

Reads your `~/ops/proof-log/YYYY-MM-DD.md` files and produces a Markdown report showing:

- Total sessions, hours, lines changed
- Top active projects
- Daily breakdown with streaks
- Most edited files
- Notable metrics (longest session, averages)

## Output example

```
# AI Weekly Report: 2026-02-22 – 2026-02-28

## Summary
| Metric | Value |
|--------|-------|
| Days active | **7 / 7** |
| Total sessions | **530** |
| Total AI time | **73h 15m** |
| Lines added | **+145,793** |
| Files touched | **1788** |
| CC tool calls | **4235** |
```

## Install / Use

```bash
# Run directly (no install)
npx cc-weekly-report

# Save to file
npx cc-weekly-report > weekly-report.md

# Last 14 days
npx cc-weekly-report --days 14

# Specific week
npx cc-weekly-report --week 2026-02-17

# Custom log directory
npx cc-weekly-report --dir ~/my-proof-log
```

## Options

```
--days N       Days to include (default: 7)
--dir PATH     Proof-log directory (default: ~/ops/proof-log)
--week DATE    Start date YYYY-MM-DD
--version      Show version
--help         Show help
```

## Proof-log format

Expects files named `YYYY-MM-DD.md` with session entries in this format:

```markdown
### 2026-02-28 23:22-01:11 JST — セッション終了（自動記録）

- いつ: 23:22〜01:11 JST（108分）
- どこで: my-project
- 誰が: CC: 21件
- 何を: 9ファイル変更 (+566/-97)
  - main.py (+200/-50, 3回)
- どうやって: Edit: 17回, Write: 4回
```

This format is produced automatically by the Claude Code proof-log hooks in [cc-loop](https://github.com/yurukusa/cc-loop).

## Part of cc-toolkit

cc-weekly-report is one of 36 free tools for Claude Code users.

**→ [See all 27 tools at yurukusa.github.io/cc-toolkit](https://yurukusa.github.io/cc-toolkit/)**

| Tool | What it measures |
|------|-----------------|
| [cc-session-stats](https://github.com/yurukusa/cc-session-stats) | How much time you spend with AI (from session transcripts) |
| [cc-agent-load](https://github.com/yurukusa/cc-agent-load) | Ghost Days, activity calendar |
| [cc-audit-log](https://github.com/yurukusa/cc-audit-log) | What your AI actually did |
| **cc-weekly-report** | Weekly activity summary from proof-log |

## License

MIT
