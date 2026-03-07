# cc-mcp

The only cc-toolkit component that feeds data **back into** Claude during a session.

While other cc-toolkit tools are CLIs you run to see your stats, `cc-mcp` is an MCP server — it gives Claude itself real-time access to your Claude Code usage data so you can ask questions in plain English.

```
You: "How much have I used Claude Code this month?"
Claude: "You've logged 47.3h interactive + 83.1h AI for 130.4h total in March.
         You're on a 36-day streak with 22 Ghost Days so far."
```

## Setup

1. Install cc-agent-load (the data source):
   ```bash
   npm install -g cc-agent-load
   ```

2. Add to `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "cc-toolkit": {
         "command": "npx",
         "args": ["@yurukusa/cc-mcp"]
       }
     }
   }
   ```

   Config location:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/claude/claude_desktop_config.json`

3. Restart Claude Desktop. The `cc-toolkit` server will appear in MCP settings.

## Tools

### `cc_usage_summary`
Today / week / month totals + streak + autonomy ratio.

Ask Claude: *"Show me my Claude Code stats"* or *"How much AI time vs my time this week?"*

### `cc_daily_breakdown`
Day-by-day activity for the last N days (default: 14).

Ask Claude: *"Show me my activity for the last 2 weeks"* or *"When were my Ghost Days?"*

### `cc_project_stats`
Per-project time breakdown (top 15 by hours).

Ask Claude: *"Which project am I spending the most Claude Code time on?"*

### `cc_forecast`
Month-end projection at your current pace.

Ask Claude: *"Will my streak survive this month?"* or *"How many hours will I have logged by end of March?"*

## What are Ghost Days?

Ghost Days are days when your AI sub-agents ran Claude Code autonomously — while you had zero interactive sessions. The AI kept working while you were offline.

`cc-mcp` surfaces Ghost Days in the usage summary and forecast so you can track how often your AI runs unsupervised.

## Requirements

- Node.js 18+
- `cc-agent-load` installed globally (or accessible in your local cc-loop path)
- Claude Desktop or another MCP-compatible client

## Part of cc-toolkit

This tool is part of the [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) collection of Claude Code utilities.

All other cc-toolkit tools are CLIs that display data in your terminal. `cc-mcp` is the bridge that brings that data into your Claude conversations.

**Zero external dependencies. No data sent anywhere. Runs entirely local.**
