import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Native-readiness guard (S8-15): print, window.open, blob/anchor downloads and
// shell sniffing live ONLY in lib/platform/. Anything else breaks in a
// Capacitor WebView. Add new call sites through the seam, not to this list.

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const SKIP_DIRS = new Set(["node_modules", "generated", ".next"]);

const FORBIDDEN: { name: string; re: RegExp }[] = [
  { name: "window.print", re: /\bwindow\.print\s*\(/ },
  { name: "window.open", re: /\bwindow\.open\s*\(/ },
  { name: 'createElement("a")', re: /createElement\(\s*["']a["']\s*\)/ },
  { name: "Capacitor sniffing", re: /\bwindow\.Capacitor\b|\bCapacitor\??\.isNativePlatform|from\s+["']@capacitor\// },
];

/** `relative/path` -> reason. Empty on purpose. */
const ALLOWLIST: Record<string, string> = {};

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
}

describe("platform seam", () => {
  it("keeps raw print / open / anchor-download / shell sniffing inside lib/platform", () => {
    const files: string[] = [];
    for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);
    const offenders: string[] = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      if (rel.startsWith("lib/platform/") || ALLOWLIST[rel]) continue;
      const src = fs.readFileSync(f, "utf8");
      for (const { name, re } of FORBIDDEN) {
        if (re.test(src)) offenders.push(`${rel}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
