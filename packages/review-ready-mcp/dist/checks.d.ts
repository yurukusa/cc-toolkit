/**
 * checks.ts — Review Ready check functions (copied from review-ready package)
 * Pure functions: (FileChanges) → CheckResult[]
 * No external dependencies — runs anywhere Node.js is installed.
 */
export interface CheckResult {
    rule: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    line?: number;
    file?: string;
}
export interface FileChanges {
    filename: string;
    addedLines: string[];
    addedLineNumbers: number[];
    isNewFile: boolean;
    sizeBytes: number;
}
export declare function checkDebugStatements(changes: FileChanges): CheckResult[];
export declare function checkTodos(changes: FileChanges): CheckResult[];
export declare function checkSecrets(changes: FileChanges): CheckResult[];
export declare function checkLargeFile(changes: FileChanges): CheckResult[];
export declare function checkTestExists(changes: FileChanges, allFiles: Set<string>): CheckResult[];
export declare function checkComplexity(changes: FileChanges, threshold: number): CheckResult[];
//# sourceMappingURL=checks.d.ts.map