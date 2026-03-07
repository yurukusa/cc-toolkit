# cc-toolkit

**35 zero-dependency CLI tools to visualize, analyze, and improve how you use Claude Code.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![Tools](https://img.shields.io/badge/Tools-35-orange.svg)](#tools)

```bash
npx cc-session-stats
```

No install. No config. No API keys. Just run it.

---

## Why cc-toolkit?

You use Claude Code every day. It generates gigabytes of session logs, git history, and tool usage data -- but none of it is visible to you.

cc-toolkit fixes that.

- **35 real CLI tools** -- not a link collection, not a framework. Each one does one thing well.
- **Zero dependencies** -- every tool is a single self-contained script.
- **Runs instantly with npx** -- no `npm install`, no setup, no config files.
- **100% local** -- reads your `~/.claude/` data. Nothing leaves your machine.
- **MIT licensed** -- use it however you want.

---

## Quick Start

```bash
# Your session patterns at a glance
npx cc-session-stats

# 20-point setup health check
npx cc-health-check

# ASCII receipt of today's activity
npx cc-receipt

# Productivity score (0-100)
npx cc-score
```

All tools read from your local Claude Code session data (`~/.claude/projects/`). If you've used Claude Code, you already have the data.

---

## Tools

### Analytics

Understand how you actually use Claude Code.

| Tool | Command | Description |
|------|---------|-------------|
| cc-session-stats | `npx cc-session-stats` | Session duration, day-of-week patterns, health warnings |
| cc-agent-load | `npx cc-agent-load` | Human vs AI autonomous time ratio |
| cc-project-stats | `npx cc-project-stats` | Per-project usage time ranking |
| cc-bash-type | `npx cc-bash-type` | Bash command classification by category |
| cc-delta | `npx cc-delta` | Edit size distribution analysis |
| cc-turns | `npx cc-turns` | Turns-per-session breakdown |
| cc-think | `npx cc-think` | Extended thinking block depth analysis |
| cc-checkin | `npx cc-checkin` | User intervention timing analysis |
| cc-human | `npx cc-human` | Human involvement pattern analysis |
| cc-warmup | `npx cc-warmup` | Acceleration / deceleration patterns within sessions |

### Safety & Quality

Keep your AI-assisted workflow safe and auditable.

| Tool | Command | Description |
|------|---------|-------------|
| cc-health-check | `npx cc-health-check` | 20-point setup diagnostic |
| cc-audit-log | `npx cc-audit-log` | Human-readable audit log |
| cc-error | `npx cc-error` | Error rate ranking by tool |
| cc-recovery | `npx cc-recovery` | Error recovery pattern analysis |
| cc-denied | `npx cc-denied` | Listing of denied Bash commands |
| cc-streak | `npx cc-streak` | Consecutive error-free success count |
| cc-review-queue | `npx cc-review-queue` | Files awaiting human review |
| review-ready | `npx review-ready` | Pre-PR quality check |
| review-ready-mcp | MCP Server | PR quality check for Claude Desktop / Claude Code |

### Reporting

Generate reports from your Claude Code activity.

| Tool | Command | Description |
|------|---------|-------------|
| cc-daily-report | `npx cc-daily-report` | Daily AI activity report |
| cc-weekly-report | `npx cc-weekly-report` | Weekly summary report |
| cc-ghost-log | `npx cc-ghost-log` | Git commits made on ghost days (no human present) |
| cc-standup | `npx cc-standup` | Daily standup generation |
| cc-receipt | `npx cc-receipt` | ASCII receipt-style daily summary |
| cc-ai-heatmap | `npx cc-ai-heatmap` | GitHub-style activity heatmap |

### Cost & Forecasting

Track and predict your Claude Code spending.

| Tool | Command | Description |
|------|---------|-------------|
| cc-cost-forecast | `npx cc-cost-forecast` | Projected API-equivalent cost through end of month |
| cc-save | `npx cc-save` | Estimated savings from prompt caching |
| cc-live | `npx cc-live` | Real-time token usage monitor |
| cc-predict | `npx cc-predict` | End-of-month session hours and ghost day forecast |

### Scoring & Fun

Gamify your development workflow.

| Tool | Command | Description |
|------|---------|-------------|
| cc-score | `npx cc-score` | Productivity score (0--100) |
| cc-personality | `npx cc-personality` | Developer archetype diagnosis |
| cc-compare | `npx cc-compare` | Period-over-period usage comparison |
| cc-stats-badge | `npx @yurukusa/cc-stats-badge` | SVG badge for your GitHub README |
| cc-alert | `npx @yurukusa/cc-alert` | Streak break warning |

### MCP Integration

Use cc-toolkit data inside Claude Desktop or Claude Code via Model Context Protocol.

| Tool | Type | Description |
|------|------|-------------|
| cc-mcp | MCP Server | Query session statistics from Claude Desktop / Claude Code |
| review-ready-mcp | MCP Server | PR quality check as an MCP tool |

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cc-mcp": {
      "command": "npx",
      "args": ["cc-mcp"]
    }
  }
}
```

---

## Design Principles

1. **One tool, one job.** Each tool does exactly one thing. Compose them however you like.
2. **Zero dependencies.** No `node_modules`. Every tool is a single file you can audit in minutes.
3. **npx-first.** Works without installation. No global installs polluting your system.
4. **Read-only.** No tool modifies your Claude Code data. Ever.
5. **Offline.** No network calls. No telemetry. No analytics. Your data stays yours.

---

## Documentation

Each tool has its own README with usage examples, output samples, and options:

```
packages/<tool-name>/README.md
```

---

## Requirements

- Node.js 18+
- Claude Code session data (`~/.claude/projects/`)
- macOS, Linux, or WSL2

---

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

```bash
git clone https://github.com/yurukusa/cc-toolkit.git
cd cc-toolkit
git checkout -b feat/my-tool
```

Rules:

- Zero dependencies -- every tool must be self-contained
- Include a README in `packages/<tool-name>/`
- Include tests
- One tool per PR

---

## License

[MIT](LICENSE)

---

Built with [Claude Code](https://docs.anthropic.com/en/docs/claude-code).
