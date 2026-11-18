import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The glossary (DESIGN.md "The glossary", the owner's decision 9; package P4a,
// audit I-01 and I-05). One word for each thing, in both languages:
//   - the person who runs a session is the organizer ("organizador", "quien
//     organiza"), never maestro / dueño / master / owner / host;
//   - the number is "puntaje" / "score", never puntuación / calificación;
//   - signing out is "Salir" / "Sign out": "Cerrar sesión" is free for closing
//     a cupping session (a key that closes a session may say it);
//   - no "Bienvenido" (a neutral "Hola"), no "roster", no emoji, no em dash.
// This scans every message. The cupping screen's words are package P4b: the
// allowlist below holds exactly its remaining hits and may only shrink.

type Tree = { [key: string]: Tree | string } | string;
const messages = {
  es: JSON.parse(readFileSync("messages/es.json", "utf8")) as Tree,
  en: JSON.parse(readFileSync("messages/en.json", "utf8")) as Tree,
};

function* leaves(node: Tree, path: string[] = []): Generator<[string, string]> {
  if (typeof node === "string") {
    yield [path.join("."), node];
    return;
  }
  for (const [k, v] of Object.entries(node)) yield* leaves(v, [...path, k]);
}

const RULES: { name: string; re: RegExp; lang?: "es" | "en" }[] = [
  { name: "maestro", re: /\bmaestr[oa]s?\b/i, lang: "es" },
  { name: "dueño", re: /\bdueñ[oa]s?\b/i, lang: "es" },
  { name: "master", re: /\bmasters?\b/i, lang: "en" },
  { name: "owner", re: /\bowners?\b/i, lang: "en" },
  { name: "host", re: /\bhosts?\b/i, lang: "en" },
  { name: "puntuación", re: /\bpuntuaci[oó]n(es)?\b/i, lang: "es" },
  { name: "calificación", re: /\bcalificaci[oó]n(es)?\b/i, lang: "es" },
  { name: "Cerrar sesión", re: /cerrar sesi[oó]n/i, lang: "es" },
  { name: "Bienvenido", re: /\bbienvenid[oa]s?\b/i, lang: "es" },
  { name: "roster", re: /\broster\b/i },
  { name: "em dash", re: /—/ },
  { name: "emoji", re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2705}\u{274C}]/u },
];

/** A key that closes a cupping session may say "Cerrar sesión" (the glossary frees it for that). */
const closesASession = (key: string) => /close/i.test(key.split(".").pop() ?? "");

/**
 * The cupping screen's remaining hits, for package P4b. ONLY SHRINKS: remove a
 * line when P4b fixes it; never add one outside the cupping namespace.
 */
const CUPPING_ALLOWLIST = new Set<string>(["en:cupping.expressNotes.body:em dash"]);

function hits() {
  const out: string[] = [];
  for (const lang of ["es", "en"] as const) {
    for (const [key, raw] of leaves(messages[lang])) {
      // an ICU argument name ({owner}) is code, not a word
      const text = raw.replace(/\{[^}]*\}/g, "");
      for (const rule of RULES) {
        if (rule.lang && rule.lang !== lang) continue;
        if (!rule.re.test(text)) continue;
        if (rule.name === "Cerrar sesión" && closesASession(key)) continue;
        out.push(`${lang}:${key}:${rule.name}`);
      }
    }
  }
  return out;
}

describe("the glossary and the copy rules", () => {
  it("no retired word, em dash, emoji, roster or Bienvenido outside the allowlist", () => {
    const found = hits().filter((h) => !CUPPING_ALLOWLIST.has(h));
    expect(found).toEqual([]);
  });

  it("the allowlist holds only cupping-screen hits that still exist (it may only shrink)", () => {
    const now = new Set(hits());
    for (const entry of CUPPING_ALLOWLIST) {
      expect(entry.split(":")[1].startsWith("cupping."), entry).toBe(true);
      expect(now.has(entry), `${entry} is fixed: remove it from the allowlist`).toBe(true);
    }
  });

  it("the product has one name", () => {
    for (const lang of ["es", "en"] as const) {
      const brand = (messages[lang] as { brand: { name: string } }).brand.name;
      expect(brand).toBe("Café Sensible");
      for (const [key, text] of leaves(messages[lang])) expect(text, key).not.toMatch(/\bCata Café\b/);
    }
  });

  it("DESIGN.md carries the glossary in both languages", () => {
    const design = readFileSync("DESIGN.md", "utf8");
    expect(design).toContain("**The glossary.**");
    expect(design).toMatch(/\| organizador \| organizer \|/);
    expect(design).toMatch(/\| puntaje \| score \|/);
    expect(design).toMatch(/\| Salir \| Sign out \|/);
  });
});
