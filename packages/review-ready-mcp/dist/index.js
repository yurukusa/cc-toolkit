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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as path from 'path';
import { checkDebugStatements, checkTodos, checkSecrets, checkLargeFile, checkTestExists, checkComplexity, } from './checks.js';
import { getChangedFiles, getAllProjectFiles } from './gitDiff.js';
// ── Server setup ──────────────────────────────────────────────────────────────
const server = new McpServer({
    name: 'review-ready-mcp-server',
    version: '0.1.0',
});
// ── Helpers ────────────────────────────────────────────────────────────────────
function formatResults(results) {
    if (results.length === 0)
        return '✓ All checks passed — ready to review!';
    const errors = results.filter(r => r.severity === 'error');
    const warnings = results.filter(r => r.severity === 'warning');
    const infos = results.filter(r => r.severity === 'info');
    const lines = [
        `Found ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info\n`,
    ];
    for (const r of results) {
        const icon = r.severity === 'error' ? '✗' : r.severity === 'warning' ? '⚠' : 'ℹ';
        const loc = r.file ? `${r.file}${r.line ? `:${r.line}` : ''}` : '';
        const locStr = loc ? `  [${loc}]` : '';
        lines.push(`${icon} [${r.rule}] ${r.message}${locStr}`);
    }
    return lines.join('\n');
}
function runAllChecks(changedFiles, allProjectFiles, complexityThreshold) {
    const all = [];
    for (const file of changedFiles) {
        all.push(...checkDebugStatements(file));
        all.push(...checkTodos(file));
        all.push(...checkSecrets(file));
        all.push(...checkLargeFile(file));
        all.push(...checkTestExists(file, allProjectFiles));
        all.push(...checkComplexity(file, complexityThreshold));
    }
    return all.sort((a, b) => {
        const order = { error: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
    });
}
// ── Tool: check_changes ────────────────────────────────────────────────────────
server.registerTool('check_changes', {
    title: 'Check Changed Files',
    description: `Run Review Ready pre-PR checks on all changed files in a git repository.

Detects:
- Debug statements (console.log, debugger, print(), etc.)
- TODO/FIXME/HACK markers in newly added lines
- Potential secrets (API keys, AWS credentials, tokens, passwords)
- Accidentally staged large files (>500KB)
- Source files missing corresponding test files
- High cyclomatic complexity in JS/TS additions

Returns a summary of issues with file paths and line numbers.`,
    inputSchema: {
        repo_path: z.string().describe('Absolute path to the git repository root. Use the workspace root when checking changes before opening a PR.'),
        base_sha: z.string().optional().describe('Base commit SHA for diff (optional). If provided with head_sha, diffs between two commits instead of staged/unstaged.'),
        head_sha: z.string().optional().describe('Head commit SHA for diff (optional). Used with base_sha.'),
        complexity_threshold: z.number().optional().describe('Cyclomatic complexity threshold. Flag functions exceeding this branch count. Default: 10.'),
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
}, async ({ repo_path, base_sha, head_sha, complexity_threshold = 10 }) => {
    const repoRoot = path.resolve(repo_path);
    const changedFiles = getChangedFiles(repoRoot, base_sha, head_sha);
    if (changedFiles.length === 0) {
        const output = { status: 'ok', message: 'No changed files detected', results: [] };
        return {
            content: [{ type: 'text', text: '✓ No changed files detected — nothing to check.' }],
            structuredContent: output,
        };
    }
    const allProjectFiles = getAllProjectFiles(repoRoot);
    const results = runAllChecks(changedFiles, allProjectFiles, complexity_threshold);
    const structured = {
        status: results.some(r => r.severity === 'error') ? 'error' : results.some(r => r.severity === 'warning') ? 'warning' : 'ok',
        filesChecked: changedFiles.length,
        totalIssues: results.length,
        errors: results.filter(r => r.severity === 'error').length,
        warnings: results.filter(r => r.severity === 'warning').length,
        infos: results.filter(r => r.severity === 'info').length,
        results,
    };
    return {
        content: [{ type: 'text', text: formatResults(results) }],
        structuredContent: structured,
    };
});
// ── Tool: check_content ───────────────────────────────────────────────────────
server.registerTool('check_content', {
    title: 'Check Code Content',
    description: `Run Review Ready checks on a code snippet directly — no git repository needed.

Useful when reviewing a code block that Claude just generated, or when checking a file's content before committing.

Detects: debug statements, TODO markers, secrets, and complexity issues.
Note: test coverage check requires knowing all project files, so it's skipped in this mode.`,
    inputSchema: {
        content: z.string().describe('The code content to check. Can be a full file or a snippet.'),
        filename: z.string().describe('The filename (e.g., "src/auth.ts") — used to apply language-specific rules and detect if it is a test file.'),
        complexity_threshold: z.number().optional().describe('Cyclomatic complexity threshold. Default: 10.'),
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
}, async ({ content, filename, complexity_threshold = 10 }) => {
    const lines = content.split('\n');
    const changes = {
        filename,
        addedLines: lines,
        addedLineNumbers: lines.map((_, i) => i + 1),
        isNewFile: true,
        sizeBytes: Buffer.byteLength(content, 'utf8'),
    };
    const results = [
        ...checkDebugStatements(changes),
        ...checkTodos(changes),
        ...checkSecrets(changes),
        ...checkLargeFile(changes),
        ...checkComplexity(changes, complexity_threshold),
        // Note: checkTestExists skipped — requires allProjectFiles context
    ].sort((a, b) => {
        const order = { error: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
    });
    const structured = {
        status: results.some(r => r.severity === 'error') ? 'error' : results.some(r => r.severity === 'warning') ? 'warning' : 'ok',
        filename,
        linesChecked: lines.length,
        totalIssues: results.length,
        results,
    };
    return {
        content: [{ type: 'text', text: formatResults(results) }],
        structuredContent: structured,
    };
});
// ── Start server ──────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
