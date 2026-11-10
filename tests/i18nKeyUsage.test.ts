// S8-23 (D-02): every literal `t("key")` call whose translator was bound with a
// literal namespace must resolve in messages/es.json. Catches the class of bug
// where the wrong translator is used (`tc("tasteThis")` with the `common`
// namespace while the key lives under `coffee`): next-intl then renders the raw
// key path to the user. Best effort and source-level: only literal keys, only
// bindings of the shape `const x = (await )?(getTranslations|useTranslations)("ns")`
// or `getTranslations({ ..., namespace: "ns" })`. Dynamic keys are skipped.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import es from "@/messages/es.json";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];
const SKIP_DIRS = new Set(["node_modules", "generated", ".next"]);

// Deliberate exceptions, as "<repo-relative path with />:<binding>.<key>".
// Empty today: add an entry with a reason rather than loosening the scan.
const ALLOWLIST = new Set<string>([]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function resolves(ns: string, key: string): boolean {
  let node: unknown = es;
  for (const part of `${ns}.${key}`.split(".")) {
    if (node === null || typeof node !== "object" || !(part in (node as object))) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return true;
}

const BIND =
  /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*(?:"([^"]+)"|'([^']+)'|\{[^}]*?namespace:\s*["']([^"']+)["'][^}]*\})\s*\)/g;

export function findMisses(source: string, file: string): string[] {
  const bindings = new Map<string, Set<string>>();
  for (const m of source.matchAll(BIND)) {
    const ns = m[2] ?? m[3] ?? m[4];
    if (!ns) continue;
    (bindings.get(m[1]) ?? bindings.set(m[1], new Set()).get(m[1])!).add(ns);
  }
  const misses: string[] = [];
  for (const [name, namespaces] of bindings) {
    const escaped = name.replace(/\$/g, "\\$");
    const call = new RegExp(
      `(?<![\\w$.])${escaped}(?:\\.(?:rich|raw|markup|has))?\\(\\s*(["'\`])([^"'\`$\\\\]+)\\1`,
      "g",
    );
    for (const m of source.matchAll(call)) {
      const key = m[2];
      const ok = [...namespaces].some((ns) => resolves(ns, key));
      if (!ok && !ALLOWLIST.has(`${file}:${name}.${key}`)) {
        misses.push(`${file}: ${name}("${key}") not found under ${[...namespaces].join(" | ")}`);
      }
    }
  }
  return misses;
}

describe("i18n key usage (S8-23, D-02)", () => {
  it("the scanner flags a key bound to the wrong namespace", () => {
    const src = `const tc = await getTranslations("common");\ntc("tasteThis");\ntc("edit");`;
    const out = findMisses(src, "x.tsx");
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("tasteThis");
  });

  it("every literal t(\"key\") resolves in messages/es.json", () => {
    const misses: string[] = [];
    let checked = 0;
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const src = readFileSync(file, "utf8");
        if (!/getTranslations|useTranslations/.test(src)) continue;
        checked += 1;
        misses.push(...findMisses(src, relative(ROOT, file).replace(/\\/g, "/")));
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(misses).toEqual([]);
  });
});
