// B-01 (package T2 of the 2026-11-15 audit): a heading obeys its classes.
// The base heading rule lives in `@layer base`, so a colour, weight, family or
// tracking class on a heading wins; the two green titles (DESIGN.md: page and
// section titles are `primary-container`, everything else is ink) are written
// once, as `.page-title` / `.section-title`, never as a colour class on an h1.
import { describe, expect, it } from "vitest";
import { readSource, walkSource, SCAN_TIMEOUT_MS } from "./helpers/sourceTree";

const css = readSource("app/globals.css");

/** The CSS with every `@layer … { … }` block removed (brace-matched). */
function unlayered(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@layer", i);
    if (at === -1) { out += text.slice(i); break; }
    out += text.slice(i, at);
    const open = text.indexOf("{", at);
    const semi = text.indexOf(";", at);
    if (semi !== -1 && (open === -1 || semi < open)) { i = semi + 1; continue; } // `@layer a, b;`
    let depth = 0;
    let j = open;
    for (; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}" && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

/** The text of every `@layer <name> { … }` block with that name. */
function layerBlocks(text: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`@layer\\s+${name}\\s*\\{`, "g");
  for (let m; (m = re.exec(text)); ) {
    let depth = 0;
    let j = m.index + m[0].length - 1;
    const start = j + 1;
    for (; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}" && --depth === 0) break;
    }
    out.push(text.slice(start, j));
  }
  return out;
}

/** Split a selector list on its top-level commas (not those inside :is(), :where()…). */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Every selector of every rule (comments stripped), trimmed. */
function selectorParts(text: string): string[] {
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const parts: string[] = [];
  for (const m of noComments.matchAll(/([^{}]+)\{/g)) parts.push(...splitSelectors(m[1]));
  return parts;
}

const BARE_HEADING = /^(h[1-6]|\.font-serif)$/;

describe("globals.css: the base heading rule is layered", () => {
  it("the base heading rule (h1, h2, h3, h4, .font-serif) is inside @layer base", () => {
    const base = layerBlocks(css, "base").join("\n");
    const parts = selectorParts(base);
    for (const sel of ["h1", "h2", "h3", "h4", ".font-serif"]) expect(parts, sel).toContain(sel);
  });

  it("no rule outside a layer targets a bare heading or .font-serif", () => {
    const offenders = selectorParts(unlayered(css)).filter((p) => BARE_HEADING.test(p));
    expect(offenders).toEqual([]);
  });

  it("the title green is written once: .page-title and .section-title, in the components layer", () => {
    const components = layerBlocks(css, "components").join("\n");
    expect(components).toMatch(/\.page-title,\s*\.section-title\s*\{[^}]*color:\s*var\(--color-primary-container\)/);
    expect(selectorParts(unlayered(css)).filter((p) => /\.(page|section)-title\b/.test(p))).toEqual([]);
  });
});

// The three surfaces T2 must not change paint as before and keep their own
// rules: the landing (its stage), the warm-up player, and the legal pages
// (whose title has painted `primary` through the unlayered colour utilities
// since before T2; a question for later, not this package).
const SKIP_DIRS = new Set(["node_modules", ".next", "generated", "landing", "warmup", "legal"]);
const files = [
  ...walkSource("app", "headings", { include: /\.tsx$/, skip: (n, d) => d && SKIP_DIRS.has(n) }),
  ...walkSource("components", "headings", { include: /\.tsx$/, skip: (n, d) => d && SKIP_DIRS.has(n) }),
];

/** Opening tags of h1..h4 with their class text (string or template literal). */
function headingTags(text: string): { tag: string; cls: string }[] {
  const out: { tag: string; cls: string }[] = [];
  for (const m of text.matchAll(/<(h[1-4])\b([^>]*)>/g)) {
    const cls = /className=\{?[`"']([^`"']*)[`"']/.exec(m[2])?.[1] ?? "";
    out.push({ tag: m[1], cls });
  }
  return out;
}

const TITLE_COLOUR = /(?<![\w-])text-(primary-container|primary|green-dark|on-surface)(?![\w-])/;
const ALIAS_COLOUR = /(?<![\w-])text-(green-dark|brown-[\w-]+)(?![\w-])/;

describe("headings in the paper app", () => {
  it(
    "no h1 sets its own colour: the page title takes .page-title (PageHeader and every hand-written page title)",
    () => {
      const offenders: string[] = [];
      for (const f of files) {
        for (const h of headingTags(readSource(f))) {
          if (h.tag === "h1" && TITLE_COLOUR.test(h.cls)) offenders.push(`${f}: ${h.cls}`);
        }
      }
      expect(offenders).toEqual([]);
      const header = headingTags(readSource("components/ui/PageHeader.tsx")).filter((h) => h.tag === "h1");
      expect(header).toHaveLength(1);
      expect(header[0].cls).toContain("page-title");
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "no heading carries a legacy alias colour (text-green-dark, text-brown-*)",
    () => {
      const offenders: string[] = [];
      for (const f of files) {
        for (const h of headingTags(readSource(f))) if (ALIAS_COLOUR.test(h.cls)) offenders.push(`${f}: <${h.tag}> ${h.cls}`);
      }
      expect(offenders).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});
