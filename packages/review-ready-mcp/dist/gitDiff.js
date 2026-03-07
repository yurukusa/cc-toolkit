/**
 * gitDiff.ts — Parse git diff output into FileChanges objects
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
export function getChangedFiles(repoRoot, baseSha, headSha) {
    const results = [];
    let changedFilenames = [];
    try {
        if (baseSha && headSha) {
            // GitHub Actions / specified range mode
            const output = execSync(`git diff --name-only ${baseSha}..${headSha}`, { cwd: repoRoot, encoding: 'utf8' });
            changedFilenames = output.trim().split('\n').filter(Boolean);
        }
        else {
            // Local mode: staged + unstaged
            const staged = execSync('git diff --cached --name-only', { cwd: repoRoot, encoding: 'utf8' });
            const unstaged = execSync('git diff --name-only', { cwd: repoRoot, encoding: 'utf8' });
            const all = new Set([...staged.trim().split('\n'), ...unstaged.trim().split('\n')].filter(Boolean));
            changedFilenames = [...all];
        }
    }
    catch {
        return [];
    }
    for (const filename of changedFilenames) {
        const fullPath = path.join(repoRoot, filename);
        let sizeBytes = 0;
        try {
            sizeBytes = fs.statSync(fullPath).size;
        }
        catch { /* deleted */ }
        let diffOutput = '';
        try {
            if (baseSha && headSha) {
                diffOutput = execSync(`git diff ${baseSha}..${headSha} -U0 -- "${filename}"`, { cwd: repoRoot, encoding: 'utf8' });
            }
            else {
                diffOutput = execSync(`git diff --cached -U0 -- "${filename}"`, { cwd: repoRoot, encoding: 'utf8' });
                if (!diffOutput.trim()) {
                    diffOutput = execSync(`git diff -U0 -- "${filename}"`, { cwd: repoRoot, encoding: 'utf8' });
                }
            }
        }
        catch {
            continue;
        }
        const { addedLines, addedLineNumbers, isNewFile } = parseDiff(diffOutput);
        results.push({ filename, addedLines, addedLineNumbers, isNewFile, sizeBytes });
    }
    return results;
}
export function getAllProjectFiles(repoRoot) {
    try {
        const out = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8' });
        return new Set(out.trim().split('\n').filter(Boolean));
    }
    catch {
        return new Set();
    }
}
function parseDiff(diff) {
    const lines = diff.split('\n');
    const addedLines = [];
    const addedLineNumbers = [];
    let isNewFile = false;
    let cur = 0;
    for (const line of lines) {
        if (line.startsWith('new file mode')) {
            isNewFile = true;
            continue;
        }
        const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunk) {
            cur = parseInt(hunk[1], 10);
            continue;
        }
        if (line.startsWith('+') && !line.startsWith('+++')) {
            addedLines.push(line.slice(1));
            addedLineNumbers.push(cur++);
        }
        else if (line.startsWith(' ')) {
            cur++;
        }
    }
    return { addedLines, addedLineNumbers, isNewFile };
}
