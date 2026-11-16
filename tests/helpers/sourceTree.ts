// Shared walker and reader for the tests that scan the source tree (L1).
//
// In a full `npm test` run every worker is busy at once, and reading about 600
// files costs 3 to 7 s per test instead of 0.5 s alone, so these tests hit
// vitest's 5 s limit and the suite went red for no reason. Two things make the
// scan cheap without changing WHAT is scanned:
//   - one `readdirSync(dir, { withFileTypes: true })` per folder instead of a
//     `statSync` per entry (a symbolic link is still followed with one stat,
//     exactly as the old walks did);
//   - every walk and every file read is memoised for the test file, so two
//     tests of one file (or two scans of the same folder) touch the disk once.
// Each test keeps its own folders, skip rule and extension rule, so the set of
// files it visits is the same as before.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** The repository root. */
export const ROOT = resolve(__dirname, "..", "..");

/** Per-test limit for a scan test: generous because a full run slows file reads about tenfold. */
export const SCAN_TIMEOUT_MS = 30_000;

export interface WalkRule {
  /** Leave out this entry (a folder is not entered). Called for files and folders. */
  skip?: (name: string, isDirectory: boolean) => boolean;
  /** Files whose name matches are listed. */
  include: RegExp;
}

const walks = new Map<string, string[]>();
const texts = new Map<string, string>();

function isDir(abs: string, entry: { isDirectory(): boolean; isSymbolicLink(): boolean }): boolean {
  if (entry.isDirectory()) return true;
  return entry.isSymbolicLink() && statSync(abs).isDirectory();
}

function walkInto(relDir: string, rule: WalkRule, out: string[]): void {
  for (const entry of readdirSync(join(ROOT, relDir), { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    const dir = isDir(join(ROOT, rel), entry);
    if (rule.skip?.(entry.name, dir)) continue;
    if (dir) walkInto(rel, rule, out);
    else if (rule.include.test(entry.name)) out.push(rel);
  }
}

/**
 * Every file under `relDir` (repo-relative, `/` separated) that `rule` keeps, as
 * repo-relative `/` paths in directory order. Memoised per test file: the same
 * `key` (the caller's name for its rule) and folder are walked once.
 */
export function walkSource(relDir: string, key: string, rule: WalkRule): string[] {
  const id = `${key}\u0000${relDir}`;
  let list = walks.get(id);
  if (!list) {
    list = [];
    walkInto(relDir, rule, list);
    walks.set(id, list);  }
  return list;
}

/** The text of a repo-relative file, read from disk once per test file. */
export function readSource(relPath: string): string {
  let text = texts.get(relPath);
  if (text === undefined) {
    text = readFileSync(join(ROOT, relPath), "utf8");
    texts.set(relPath, text);
  }
  return text;
}
