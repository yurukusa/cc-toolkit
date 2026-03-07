# review-ready-mcp

**MCP server for [Review Ready](https://github.com/yurukusa/vscode-review-ready) — run pre-PR checks from Claude.**

Ask Claude to check your code before opening a pull request. Claude will scan your changed files and flag debug statements, hardcoded secrets, TODO debt, and complexity spikes.

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "review-ready": {
      "command": "npx",
      "args": ["review-ready-mcp"]
    }
  }
}
```

### Claude Code

Add to your project's `.mcp.json` or global MCP settings:

```json
{
  "mcpServers": {
    "review-ready": {
      "command": "npx",
      "args": ["review-ready-mcp"]
    }
  }
}
```

Then ask Claude: *"Check my changes before I push"* or *"Run review-ready on /path/to/my/repo"*

## Tools

### `check_changes`

Runs all checks on the changed files in a git repository.

```
Input:
  repo_path: string          — Absolute path to the git repo root
  base_sha?: string          — Optional base commit SHA (for CI use)
  head_sha?: string          — Optional head commit SHA (for CI use)
  complexity_threshold?: number  — Branch count threshold (default: 10)
```

### `check_content`

Checks a code snippet directly — no git required.

```
Input:
  content: string            — The code to check
  filename: string           — Filename for language-specific rules (e.g., "auth.ts")
  complexity_threshold?: number  — Branch count threshold (default: 10)
```

## What it checks

| Check | What it catches |
|-------|----------------|
| **Debug statements** | `console.log`, `debugger`, `print()`, `puts`, `fmt.Print`, `println!`, `var_dump`, `dd()` |
| **TODO/FIXME debt** | `TODO`, `FIXME`, `HACK`, `XXX`, `TEMP`, `WTF`, `BUG` in new code |
| **Secrets** | AWS keys, GitHub PATs, OpenAI keys, Slack tokens, hardcoded credentials |
| **Large files** | Files over 500KB accidentally staged |
| **Missing tests** | Source files changed without a test file (via `check_changes`) |
| **Complexity** | High cyclomatic complexity in changed JS/TS code |

## Example usage in Claude

> **You:** Check my changes before I push. The repo is at /home/me/my-project.
>
> **Claude:** *(calls `check_changes` with repo_path="/home/me/my-project")*
>
> Found 2 errors, 1 warning, 0 info
>
> ✗ [no-debug-statements] Debug statement found: console.log(userData)  [src/auth.ts:42]
> ✗ [no-secrets] Possible API key detected  [src/config.ts:8]
> ⚠ [no-todo-in-changes] Unresolved marker: // TODO: validate token expiry  [src/auth.ts:67]

---

Also available as:
- **GitHub Action**: `uses: yurukusa/review-ready@v0.1.0`
- **VS Code Extension**: Search "Review Ready" in the marketplace
- **npm library**: `npm install review-ready`
- **Live demo**: [yurukusa.github.io/vscode-review-ready](https://yurukusa.github.io/vscode-review-ready/)

Source: [github.com/yurukusa/vscode-review-ready](https://github.com/yurukusa/vscode-review-ready)
