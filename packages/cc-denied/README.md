# cc-denied

**Every Bash command your human said NO to.**

Exit code 144 means you denied a tool execution in Claude Code. `cc-denied` digs through all your session files and surfaces every command Claude Code tried to run — that you stopped.

## Results (yurukusa's sessions)

- **153 denials** out of 108,315 tool results (0.141% denial rate)
- **100% Bash** — you never denied Read, Edit, Grep, or Glob
- **4.7% of sessions** had at least one denial
- **pkill / kill**: 113 (73.9%) — most common reason to say no
- **godot / game**: 21 (13.7%)
- **rm / delete**: 1 (0.7%) — the one you really didn't want

## Install & Run

```bash
npx cc-denied
```

Or open the [browser version](https://yurukusa.github.io/cc-denied/) — no install needed.

## Options

```bash
npx cc-denied --json          # machine-readable output
npx cc-denied --top 20        # show top 20 denied commands (default: 10)
```

## Part of cc-toolkit

104 free tools for Claude Code users → https://yurukusa.github.io/cc-toolkit/
