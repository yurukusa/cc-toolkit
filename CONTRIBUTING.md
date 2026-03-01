# Contributing to cc-toolkit

Thanks for your interest in cc-toolkit! This is a collection of 33 zero-dependency tools for Claude Code users, and new tools are welcome.

## What is cc-toolkit?

A growing collection of CLI tools that analyze Claude Code session data from `~/.claude/projects/`. Each tool:
- Has zero npm dependencies
- Reads JSONL files directly (no Claude Code API key needed)
- Outputs clean terminal text + `--json` for piping
- Optionally has a browser version (HTML/CSS/JS, drag-and-drop input)

## How to add a new tool

### 1. Pick a question that isn't answered yet

Look at the [current tools](https://yurukusa.github.io/cc-toolkit/) and find a gap.

Good questions to answer:
- "Which projects do I spend the most time on?" (project distribution)
- "How do my Claude Code habits change on weekends vs weekdays?"
- "How long does it take me to start a session after opening my computer?"

Bad (already covered):
- Total hours, session count, streaks, health warnings → cc-session-stats
- Commits, lines, files → cc-impact
- Peak hours → cc-peak
- Efficiency trend → cc-collab

### 2. Create a new directory

```bash
mkdir cc-your-tool-name
cd cc-your-tool-name
```

### 3. Required files

```
cc-your-tool-name/
  cli.mjs       # Main CLI (Node.js ESM, zero deps)
  package.json  # name, version, bin, type: "module"
  README.md     # Usage, output example, "Part of cc-toolkit" footer
  LICENSE       # MIT
```

### 4. CLI conventions

```javascript
#!/usr/bin/env node

// ── CLI args ──────────────────────────────────────────
const args = process.argv.slice(2);
const jsonFlag = args.includes('--json');
const helpFlag = args.includes('--help') || args.includes('-h');

// ── Main logic ────────────────────────────────────────
// Read ~/.claude/projects/**/*.jsonl
// Parse timestamps from JSON lines: { timestamp: "...", ... }
// Compute your metric

// ── Output ────────────────────────────────────────────
if (jsonFlag) {
  console.log(JSON.stringify({ version: '1.0.0', generatedAt: new Date().toISOString(), ... }));
} else {
  // Pretty terminal output with ANSI colors
}
```

**Key patterns:**
- Sessions >8h = likely autonomous runs. Filter them with `durationHours <= 8`.
- Timestamps: `data.timestamp || data.ts` (both formats exist)
- Session gap: 30min (`SESSION_GAP_HOURS = 0.5`) = same session

### 5. README template

```markdown
# cc-your-tool-name

> One-line description

[ASCII output example here]

## Usage

\`\`\`bash
npx cc-your-tool-name
npx cc-your-tool-name --json
\`\`\`

## Why this exists

[What question does it answer?]

## Part of cc-toolkit

One of [33 free tools](https://yurukusa.github.io/cc-toolkit/) for understanding your Claude Code usage.

## License

MIT
```

### 6. Open a PR

1. Fork this repo (or the individual tool repo)
2. Open a PR with your new tool
3. Include a sample output in the PR description

## Data format reference

JSONL files are at `~/.claude/projects/<encoded-path>/<session-id>.jsonl`.

Each line is a JSON object. Relevant fields:
```json
{ "timestamp": "2026-01-15T22:34:51.123Z", ... }
{ "ts": "2026-01-15T22:34:51.123Z", ... }
```

Session = a `.jsonl` file. Duration = last timestamp - first timestamp.

## Questions?

Open an issue at https://github.com/yurukusa/cc-toolkit/issues
