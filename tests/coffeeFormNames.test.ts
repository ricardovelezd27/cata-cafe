import { describe, expect, it } from "vitest";
import { readSource as read } from "./helpers/sourceTree";

// Package N1 (UI/UX audit of 2026-11-15, the H-07 pattern of #161): every
// control of the coffee form and of the cup page's sample editor is named by
// its VISIBLE label. A placeholder is not a name (gone at the first keystroke,
// and Chrome only falls back to it). Source-level: each <input>, <select> and
// <textarea> carries an `id`, and a label in the same file points at that same
// id with `htmlFor`.

type Control = { tag: string; idExpr: string | null; at: number };

/** The opening tag of each form control, with the expression of its `id` prop. */
function controls(src: string): Control[] {
  const out: Control[] = [];
  for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
    // The props run until the first line that closes the tag (`/>` or `>` alone);
    // arrow functions inside a prop never start a line with them.
    const rest = src.slice(m.index!);
    const end = rest.search(/\n\s*\/?>/);
    const props = end === -1 ? rest : rest.slice(0, end);
    const id = props.match(/\bid=\{(`[^`\n]*`|[^{}\n]+)\}/) ?? props.match(/\bid="([^"]+)"/);
    out.push({ tag: m[1], idExpr: id ? id[1].trim() : null, at: m.index! });
  }
  return out;
}

/** The `htmlFor` expressions of the file's labels. */
function labelTargets(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/htmlFor=\{(`[^`\n]*`|[^{}\n]+)\}/g)) out.add(m[1].trim());
  for (const m of src.matchAll(/htmlFor="([^"]+)"/g)) out.add(m[1]);
  return out;
}

describe("N1: the coffee form names every control by its visible label", () => {
  const src = read("components/coffees/CoffeeForm.tsx");
  const found = controls(src);

  it("has the twelve controls it is expected to have (none added or lost unnoticed)", () => {
    // name, country, region, farm, producer, species, variety, harvest,
    // process (select), altitude, roast level (select), notes (textarea).
    expect(found.map((c) => c.tag)).toEqual([
      "input", "input", "input", "input", "input", "input", "input", "input",
      "select", "input", "select", "textarea",
    ]);
  });

  it("each control has an id, and a label points at it", () => {
    const targets = labelTargets(src);
    for (const c of found) {
      expect(c.idExpr, `${c.tag} at ${c.at} has an id`).not.toBeNull();
      expect(targets.has(c.idExpr!), `a label has htmlFor={${c.idExpr}}`).toBe(true);
    }
  });

  it("the ids come from useId, so two forms on one page cannot collide", () => {
    expect(src).toMatch(/const uid = useId\(\)/);
    for (const c of found) expect(c.idExpr).toMatch(/^fid\("[a-zA-Z]+"\)$/);
    expect(new Set(found.map((c) => c.idExpr)).size).toBe(found.length);
  });

  it("the label component forwards htmlFor and id to a real <label>", () => {
    expect(src).toMatch(/<label htmlFor=\{htmlFor\} id=\{id\}/);
  });

  it("the certification and visibility buttons are groups named by their visible label", () => {
    for (const group of ["certifications", "visibility"]) {
      expect(src).toContain(`<FieldLabel id={fid("${group}")}>`);
      expect(src).toContain(`role="group" aria-labelledby={fid("${group}")}`);
    }
  });
});

describe("N1: the cup page's sample editor names every coffee field by its visible label", () => {
  const src = read("components/cupping/EditSampleMetadataForm.tsx");
  const found = controls(src);

  it("each input has an id from useId, and its label points at it", () => {
    expect(src).toMatch(/const uid = useId\(\)/);
    expect(found.length).toBeGreaterThan(0);
    const targets = labelTargets(src);
    for (const c of found) {
      expect(c.idExpr, `${c.tag} at ${c.at} has an id`).not.toBeNull();
      expect(c.idExpr).toContain("uid");
      expect(targets.has(c.idExpr!), `a label has htmlFor={${c.idExpr}}`).toBe(true);
    }
  });

  it("the prep fields take an id prefix unique to this editor", () => {
    expect(src).toMatch(/idPrefix=\{`\$\{uid\}-prep`\}/);
  });
});
