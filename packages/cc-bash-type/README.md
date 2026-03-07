# cc-bash-type

[![npm version](https://img.shields.io/npm/v/cc-bash-type.svg)](https://www.npmjs.com/package/cc-bash-type)
[![npm downloads](https://img.shields.io/npm/dm/cc-bash-type.svg)](https://www.npmjs.com/package/cc-bash-type)

Classify every Bash tool call by intent — not what command ran, but what *kind* of work it did. 25% inspect, 15% execute, 8% git, 5% package management.

```
npx cc-bash-type
```

Zero dependencies. Reads `~/.claude/projects/` directly.

## Output

```
cc-bash-type — Bash Command Category Distribution
====================================================
Sessions: 1,835 | Bash calls: 54,636

Command categories:
  shell     ████████████████████    16,839   30.8%
               └─ sleep(3822) echo(3500) export(1892)
  inspect   ████████████████        13,834   25.3%
               └─ cat(5198) grep(4516) ls(2241)
  execute   ██████████               8,312   15.2%
               └─ python3(3790) node(1241) bash(892)
  file_ops  ██████                   5,238    9.6%
               └─ mkdir(2108) cp(891) rm(748)
  git       █████                    4,102    7.5%
               └─ git(4102)
  package   ████                     2,894    5.3%
               └─ npm(1482) pip(894) pip3(518)
  network   ██                       1,248    2.3%
               └─ curl(1098) wget(150)
  test      █                          821    1.5%
               └─ pytest(412) jest(214) vitest(195)
  other     ██                       1,348    2.5%

Git subcommands (top 8):
  git add              624
  git log              323
  git status           162
  git push             161
  git commit            82
  git diff              78
  git checkout          71
  git branch            42
```

## What it tells you

- **Shell utils dominate (31%)** — `sleep`, `echo`, `export`: orchestration overhead more than you'd think
- **Inspect is 25%** — Claude reads and searches more than it executes. `cat`, `grep`, `ls` are the real workhorses
- **Execute is 15%** — running actual code (`python3`, `node`) comes third
- **Git is 8%** — version control is a consistent part of every workflow
- **Package management is 5%** — dependency installs happen, but rarely
- **Test is 1.5%** — explicit test runs are rare in raw sessions

## Drill into a category

```bash
npx cc-bash-type --cat=git       # git subcommand breakdown
npx cc-bash-type --cat=inspect   # cat, grep, ls details
npx cc-bash-type --cat=execute   # which runtimes are used
npx cc-bash-type --cat=package   # npm vs pip vs yarn
npx cc-bash-type --json          # raw JSON output
```

## Browser version

**[yurukusa.github.io/cc-bash-type](https://yurukusa.github.io/cc-bash-type/)** — drag and drop your projects folder.

Part of [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) — tools for understanding your Claude Code sessions.

---

*Source: [yurukusa/cc-bash-type](https://github.com/yurukusa/cc-bash-type)*
