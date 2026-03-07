# cc-recovery

How does Claude Code recover from its own errors?

```
npx cc-recovery
```

Analyzes `~/.claude/projects/` JSONL transcripts to classify what Claude does immediately after a tool error: retry, investigate, fix, rollback, ask, or pivot.

## Output

```
cc-recovery — Error Recovery Patterns
====================================================
Sessions: 1,993 | Errors: 6,512 | Self-recover: 99.0%

Recovery strategy:
  retry            ████████████████████   55.2%  (3,597)
  investigate      ██████████░░░░░░░░░░   27.5%  (1,792)
  fix              █████░░░░░░░░░░░░░░░   14.1%  (918)
  pivot            █░░░░░░░░░░░░░░░░░░░    2.1%  (140)
  ask              ░░░░░░░░░░░░░░░░░░░░    1.0%  (64)
  rollback         ░░░░░░░░░░░░░░░░░░░░    0.0%  (1)

Thrashing: 61.9% of retries loop 3+ times

Recovery by tool (top errors):
  Bash             retry 77.6% | investigate 12.3% | fix 6.4%
  Read             investigate 41.2% | retry 34.8% | fix 22.2%
  Edit             investigate 71.2% | fix 19.6% | retry 7.9%
  WebFetch         retry 58.2% | investigate 33.9% | fix 5.8%
```

## Recovery Patterns

| Pattern | What it means | Example |
|---------|--------------|---------|
| **retry** | Same tool, try again | Bash→error→Bash |
| **investigate** | Read/Grep/Glob/WebSearch | Read the file before retrying |
| **fix** | Edit/Write/Bash (non-git) | Fix the code that caused the error |
| **rollback** | Bash + git reset/checkout/revert | Undo changes |
| **ask** | AskUserQuestion or session ends | Ask human for help |
| **pivot** | Different tool entirely | Change approach |

## Options

```
npx cc-recovery          # terminal output
npx cc-recovery --json   # JSON output
```

## Browser Version

Open [cc-recovery](https://yurukusa.github.io/cc-recovery/) and drop your `~/.claude/projects/` folder.

## Part of cc-toolkit

[105 free tools for Claude Code](https://yurukusa.github.io/cc-toolkit/)
