#!/usr/bin/env node
/**
 * review-ready-mcp — MCP server for Review Ready pre-PR checks
 *
 * Exposes these tools to Claude and other MCP clients:
 *   - check_changes: Run all Review Ready checks on a git repo's changed files
 *   - check_content: Check a code snippet directly (no git required)
 *
 * Transport: stdio (local tool, intended to run on developer's machine)
 *
 * Usage in claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "review-ready": {
 *         "command": "npx",
 *         "args": ["review-ready-mcp"]
 *       }
 *     }
 *   }
 */
export {};
//# sourceMappingURL=index.d.ts.map