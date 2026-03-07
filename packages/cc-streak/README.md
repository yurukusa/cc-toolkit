# cc-streak

How long can Claude Code go without an error?

```
npx cc-streak
```

Measures consecutive successful tool calls between errors across all your Claude Code sessions.

## Output

```
cc-streak — Error-Free Streaks in Claude Code
====================================================
Sessions: 1,994 | Streaks: 6,221 | Median: 12 | Max: 829

Streak length distribution:
  1-2 calls  █████████░░░░░░░░░░░   16.7%  (1,036)
  3-5        ████████░░░░░░░░░░░░   15.3%  (954)
  6-20       ████████████████████   36.2%  (2,254)
  21-50      ████████████░░░░░░░░   21.3%  (1,328)
  51-100     ████░░░░░░░░░░░░░░░░    7.3%  (455)
  101+       ██░░░░░░░░░░░░░░░░░░    3.1%  (194)

Stats: median 12 | mean 22.3 | p90 52 | p99 161 | max 829

Streak breakers (which tool ends the run):
  Bash                 ████████████████████   51.5%  (3,358)
  Read                 █████████░░░░░░░░░░░   24.0%  (1,562)
  Edit                 ████░░░░░░░░░░░░░░░░    9.5%  (617)
  WebFetch             ██░░░░░░░░░░░░░░░░░░    5.8%  (380)

Longest streak per session: median 16 | p90 50 | max 829
```

## Options

```
npx cc-streak          # terminal output
npx cc-streak --json   # JSON output
```

## Browser Version

Open [cc-streak](https://yurukusa.github.io/cc-streak/) and drop your `~/.claude/projects/` folder.

## Part of cc-toolkit

[106 free tools for Claude Code](https://yurukusa.github.io/cc-toolkit/)
