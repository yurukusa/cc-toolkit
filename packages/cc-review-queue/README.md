# cc-review-queue

**Show files changed by AI that need human review.**

Reads `~/ops/activity-log.jsonl` (from Claude Code's activity-logger hook) and lists all files marked `needs_review: true`, sorted by most recent edit.

```bash
$ npx cc-review-queue --days=7

📋 AI Review Queue — last 7 days

  23 files pending review · 63 edits · +2932/-65 lines

   1. 2026-02-28 21:55  [EDIT ]  ~/bin/algora-watch
      +169 (2x)
   2. 2026-02-28 18:00  [EDIT ]  ~/.claude/hooks/task-complete-nudge.sh
      -1
   3. 2026-02-28 17:49  [WRITE]  ~/bin/task-check
      +87
  ...

───────────────────────────────────────────────────
  To prevent risky edits: cc-health-check → Ops Kit
  https://yurukusa.github.io/cc-health-check/
```

## Install & run

```bash
# Last 30 days (default)
npx cc-review-queue

# Last 7 days
npx cc-review-queue --days=7

# All time
npx cc-review-queue --all

# Show top 50 files
npx cc-review-queue --top=50

# Markdown output (for reports or Slack)
npx cc-review-queue --format=md
```

## What counts as "needs review"?

The `activity-logger.sh` hook (from `claude-code-hooks`) marks edits as `needs_review: true` when:

- The file is in a sensitive path (`~/.claude/`, `~/bin/`, config files)
- The change is large (configurable threshold)
- The tool is `Write` (new file creation) or `Edit` on a protected path

## Requirements

- Node.js 18+
- `~/ops/activity-log.jsonl` — set up by Claude Code's activity-logger hook

## Options

```
--log=PATH     Activity log path (default: ~/ops/activity-log.jsonl)
--days=N       Look back N days (default: 30)
--all          Include all time
--top=N        Show top N files (default: 20)
--format=md    Markdown output
```

## Part of cc-toolkit

One of 36 free tools for understanding your Claude Code usage.
→ [yurukusa.github.io/cc-toolkit](https://yurukusa.github.io/cc-toolkit/)

## License

MIT
