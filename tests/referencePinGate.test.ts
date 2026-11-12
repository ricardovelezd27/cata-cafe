import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S10 WP2 / B1: the reference pin is gated by the session's referenceMode.
// Every source file that PINS (calls pinReferenceAffective) or plans a re-pin
// must also go through the one predicate `shouldPinReference`, so a new write
// path cannot quietly pin a "free" reference. Static scan, no imports.

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

describe("reference pin is gated by referenceMode", () => {
  const files = [...walk(join(root, "app")), ...walk(join(root, "lib")), ...walk(join(root, "components"))];

  it("every file that pins or re-pins also calls shouldPinReference", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith(join("lib", "referenceRules.ts"))) continue; // the definitions
      const src = readFileSync(f, "utf8");
      const pins = /\b(pinReferenceAffective|planReferenceRepin|countRepinOverwrites|repinNeedsConfirm)\(/.test(src);
      if (pins && !/\bshouldPinReference\(/.test(src)) offenders.push(f.replace(root, ""));
    }
    // sessionEdit.ts only DEFINES repinNeedsConfirm; its callers are gated.
    expect(offenders.filter((f) => !f.endsWith("sessionEdit.ts"))).toEqual([]);
  });

  it("no source file uses the bare isPinnedModule predicate to decide a pin", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith(join("lib", "referenceRules.ts"))) continue;
      if (/\bisPinnedModule\(/.test(readFileSync(f, "utf8"))) offenders.push(f.replace(root, ""));
    }
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
