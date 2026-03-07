/**
 * gitDiff.ts — Parse git diff output into FileChanges objects
 */
import type { FileChanges } from './checks.js';
export declare function getChangedFiles(repoRoot: string, baseSha?: string, headSha?: string): FileChanges[];
export declare function getAllProjectFiles(repoRoot: string): Set<string>;
//# sourceMappingURL=gitDiff.d.ts.map