import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S10 WP2 / B1: the reference pin is gated by the session's referenceMode.
//
// Approach (per CALL SITE, not per file): every call of a raw pin/re-pin
// function, and every client re-pin confirmation, must have `shouldPinReference`
// or a guard derived from it on the call line or within the 30 lines before it.
// A guard token (`referencePins`, `isPinnedReference`, `pinsWhenActive`) only
// counts when the same file defines it from a `shouldPinReference(` call, so a
// new ungated `pinReferenceAffective(` in an already-gated file is caught.
// Static scan, no imports.

const root = process.cwd();
const SKIP = new Set(["node_modules", ".next", "generated", "tests", ".git", "scripts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Read every source file ONCE at collection time (not inside a test, whose
// 5 s budget a loaded machine can exceed).
const sources = [...walk(join(root, "app")), ...walk(join(root, "lib")), ...walk(join(root, "components"))]
  .filter((f) => !f.endsWith(join("lib", "referenceRules.ts"))) // the definitions
  .map((f) => ({ file: f.replace(root, ""), src: readFileSync(f, "utf8") }));

/** Raw functions that pin / re-pin / ask to re-pin, and the client confirmation
 *  state setters (a non-null argument opens a re-pin dialog). */
const RAW_CALL = /\b(pinReferenceAffective|planReferenceRepin|countRepinOverwrites|repinNeedsConfirm|setRepinTarget|setRemoveRepinTarget|setRemoveRepin)\((?!\s*null\s*\))/;
const GUARD_TOKENS = ["shouldPinReference", "referencePins", "isPinnedReference", "pinsWhenActive"];
const WINDOW = 30;

/** Call sites (1-based line numbers) with no guard in the window. */
export function ungatedCallSites(src: string): number[] {
  const lines = src.split(/\r?\n/);
  // A token counts only if this file derives it from shouldPinReference.
  const derived = GUARD_TOKENS.filter(
    (t) =>
      t === "shouldPinReference" ||
      new RegExp(`(?:const|function)\\s+${t}\\b[\\s\\S]{0,400}?shouldPinReference\\(`).test(src),
  );
  const guard = new RegExp(`\\b(?:${derived.join("|")})\\b`);
  const bad: number[] = [];
  lines.forEach((line, i) => {
    if (!RAW_CALL.test(line)) return;
    // Skip definitions / imports / type positions.
    if (/^\s*(import|export\s+(async\s+)?function|function)\b/.test(line)) return;
    if (/\b(const|let)\s+\[/.test(line)) return; // useState destructuring
    const from = Math.max(0, i - WINDOW);
    const near = lines.slice(from, i + 1).join("\n");
    if (!guard.test(near)) bad.push(i + 1);
  });
  return bad;
}

describe("reference pin is gated by referenceMode", () => {
  it("every call site of a raw pin / re-pin function is behind shouldPinReference", () => {
    const offenders = sources
      // sessionEdit.ts only DEFINES repinNeedsConfirm; its callers are scanned.
      .filter(({ file }) => !file.endsWith("sessionEdit.ts"))
      .flatMap(({ file, src }) => ungatedCallSites(src).map((line) => `${file}:${line}`));
    expect(offenders).toEqual([]);
  });

  it("the scan itself catches an ungated call in a file that is gated elsewhere", () => {
    const src = [
      "const pins = 1;",
      "const referencePins = shouldPinReference({ mode, moduleKey, isActiveReference: true });",
      "function a() { if (referencePins) pinReferenceAffective(x, 5); }",
      ...Array.from({ length: 40 }, () => "// filler"),
      "const b = () => pinReferenceAffective(y, 5);",
    ].join("\n");
    expect(ungatedCallSites(src)).toEqual([44]);
    // A guard name the file does not derive from shouldPinReference does not count.
    expect(ungatedCallSites("const referencePins = true;\nfoo(); if (referencePins) setRepinTarget(t);")).toEqual([2]);
    // A closing setRepinTarget(null) is not a confirmation.
    expect(ungatedCallSites("setRepinTarget(null);")).toEqual([]);
  });

  it("every client re-pin confirmation surface is scanned (CupClient, EditSessionForm)", () => {
    for (const name of ["CupClient.tsx", "EditSessionForm.tsx"]) {
      const f = sources.find(({ file }) => file.endsWith(name));
      expect(f, name).toBeDefined();
      expect(/\bshouldPinReference\(/.test(f!.src), name).toBe(true);
      expect(/\bset(Remove)?Repin(Target)?\((?!\s*null\s*\))/.test(f!.src), name).toBe(true);
    }
  });

  it("no source file uses the bare isPinnedModule predicate to decide a pin", () => {
    const offenders = sources.filter(({ src }) => /\bisPinnedModule\(/.test(src)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("the server write paths read the mode from the session row, never from the client", () => {
    const sessions = readFileSync(join(root, "app", "actions", "sessions.ts"), "utf8");
    const offline = readFileSync(join(root, "app", "actions", "offline.ts"), "utf8");
    expect(sessions).toMatch(/mode:\s*auth\.referenceMode/);
    expect(offline).toMatch(/mode:\s*auth\.referenceMode/);
    expect(sessions).toMatch(/mode:\s*sess\.referenceMode/);
  });
});
