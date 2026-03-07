/**
 * checks.ts — Review Ready check functions (copied from review-ready package)
 * Pure functions: (FileChanges) → CheckResult[]
 * No external dependencies — runs anywhere Node.js is installed.
 */
// ── Debug statements ─────────────────────────────────────────────────────────
const DEBUG_PATTERNS = [
    /\bconsole\.(log|debug|warn|error|trace|dir|table)\s*\(/,
    /\bdebugger\b/,
    /\bprint\s*\(/,
    /\bputs\s/,
    /\bfmt\.Print/,
    /\bprintln!\s*\(/,
    /\bvar_dump\s*\(/,
    /\bdd\s*\(/,
];
export function checkDebugStatements(changes) {
    const results = [];
    changes.addedLines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*'))
            return;
        for (const pattern of DEBUG_PATTERNS) {
            if (pattern.test(line)) {
                results.push({ rule: 'no-debug-statements', severity: 'error', message: `Debug statement found: ${line.trim()}`, line: changes.addedLineNumbers[idx], file: changes.filename });
                break;
            }
        }
    });
    return results;
}
// ── TODO/FIXME ───────────────────────────────────────────────────────────────
const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX|TEMP|WTF|BUG)[\s:]/i;
export function checkTodos(changes) {
    const results = [];
    changes.addedLines.forEach((line, idx) => {
        if (TODO_PATTERN.test(line)) {
            results.push({ rule: 'no-todo-in-changes', severity: 'warning', message: `Unresolved marker in new code: ${line.trim()}`, line: changes.addedLineNumbers[idx], file: changes.filename });
        }
    });
    return results;
}
// ── Secrets ──────────────────────────────────────────────────────────────────
const SECRET_PATTERNS = [
    { pattern: /['"][A-Za-z0-9+/]{40,}['"]/, label: 'long base64-like string' },
    { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'API key' },
    { pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i, label: 'credential' },
    { pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/, label: 'AWS access key' },
    { pattern: /ghp_[A-Za-z0-9]{36}/, label: 'GitHub personal access token' },
    { pattern: /sk-[A-Za-z0-9]{48}/, label: 'OpenAI API key' },
    { pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/, label: 'Slack token' },
];
export function checkSecrets(changes) {
    const lowerName = changes.filename.toLowerCase();
    if (lowerName.includes('test') || lowerName.includes('spec') || lowerName.includes('mock') || lowerName.includes('fixture') || lowerName.includes('example') || lowerName.endsWith('.md'))
        return [];
    const results = [];
    changes.addedLines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('#'))
            return;
        for (const { pattern, label } of SECRET_PATTERNS) {
            if (pattern.test(line)) {
                results.push({ rule: 'no-secrets', severity: 'error', message: `Possible ${label} detected`, line: changes.addedLineNumbers[idx], file: changes.filename });
                break;
            }
        }
    });
    return results;
}
// ── Large file ───────────────────────────────────────────────────────────────
export function checkLargeFile(changes) {
    if (changes.sizeBytes > 500 * 1024) {
        return [{ rule: 'no-large-files', severity: 'warning', message: `File is ${(changes.sizeBytes / 1024).toFixed(0)} KB — is this intentional?`, file: changes.filename }];
    }
    return [];
}
// ── Test coverage ─────────────────────────────────────────────────────────────
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.java']);
const TEST_CONVENTIONS = [
    (f) => f.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1'),
    (f) => f.replace(/\.(ts|tsx|js|jsx)$/, '.spec.$1'),
    (f) => f.replace('/src/', '/tests/').replace(/\.(ts|tsx|js|jsx)$/, '.test.$1'),
    (f) => { const r = f.replace(/\.(py)$/, '_test.$1'); return r !== f ? r : ''; },
];
export function checkTestExists(changes, allFiles) {
    const ext = '.' + changes.filename.split('.').pop();
    if (!SOURCE_EXTENSIONS.has(ext))
        return [];
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(changes.filename))
        return [];
    if (changes.filename.includes('__tests__'))
        return [];
    const base = changes.filename.split('/').pop() ?? '';
    if (/^(index|types|constants|config|main|app)\.(ts|tsx|js|jsx)$/.test(base))
        return [];
    const hasTest = TEST_CONVENTIONS.some(fn => { const r = fn(changes.filename); return r && allFiles.has(r); });
    if (!hasTest) {
        return [{ rule: 'test-file-exists', severity: 'info', message: `No test file found for ${base}`, file: changes.filename }];
    }
    return [];
}
// ── Complexity ───────────────────────────────────────────────────────────────
const BRANCH_KEYWORDS = /\b(if|else if|while|for|case|catch|\?\s*[^:]+:|\&\&|\|\|)\b/g;
export function checkComplexity(changes, threshold) {
    const ext = '.' + changes.filename.split('.').pop();
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext))
        return [];
    if (changes.addedLines.length < 20)
        return [];
    const matches = changes.addedLines.join('\n').match(BRANCH_KEYWORDS);
    const approxCC = (matches?.length ?? 0) + 1;
    if (approxCC > threshold) {
        return [{ rule: 'complexity-threshold', severity: 'warning', message: `New code has high apparent complexity (~${approxCC} branches) — consider breaking it up`, file: changes.filename }];
    }
    return [];
}
