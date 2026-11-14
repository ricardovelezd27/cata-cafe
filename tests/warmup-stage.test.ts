import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The warm-up's two stages (light, and the eyes-closed "dusk") against the
// design system: the dusk IS the landing's dark green stage, a filled control
// keeps its contrast on both, and the shapes come from the tokens.

const css = readFileSync(resolve(__dirname, "../components/warmup/WarmupPlayer.module.css"), "utf8");
const globals = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");

/** A colour token's hex from app/globals.css (following one `var()` hop). */
function token(name: string): string {
  const m = globals.match(new RegExp(`--color-${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`no token --color-${name}`);
  const v = m[1].trim();
  const ref = v.match(/^var\(--color-([a-z-]+)\)/);
  if (ref) return token(ref[1]);
  const hex = v.match(/#[0-9a-fA-F]{6}/);
  if (!hex) throw new Error(`--color-${name} is not a plain colour: ${v}`);
  return hex[0];
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `share` of `over` laid on `under` (an approximation of color-mix with transparent). */
const mix = (over: number[], under: number[], share: number) => over.map((v, i) => v * share + under[i] * (1 - share));
const rule = (selector: string) => {
  const at = css.indexOf(selector + " {");
  if (at < 0) throw new Error(`no rule ${selector}`);
  return css.slice(at, css.indexOf("}", at));
};

describe("the eyes-closed stage is the landing's stage", () => {
  const dusk = rule('.root[data-dusk="1"]');
  it("takes its ground from the stage tokens, not from a second dark", () => {
    expect(dusk).toContain("--wu-bg: var(--color-stage);");
    expect(dusk).toContain("--wu-bg-far: var(--color-stage-deep);");
    expect(rule(".duskVeil")).toContain("background: var(--color-stage-deep);");
    expect(css).not.toContain("--color-inverse-surface");
    expect(css).not.toContain("--color-inverse-on-surface");
  });
  it("uses the stage's two accents: mint for what is filled, terracotta for what moves", () => {
    expect(dusk).toContain("--wu-fill: var(--color-primary-fixed);");
    expect(dusk).toContain("--wu-move: var(--color-secondary-container);");
  });
  it("text is readable on it (AAA for the instruction, AA for the muted lines)", () => {
    const stage = rgb(token("stage"));
    const deep = rgb(token("stage-deep"));
    const cream = rgb(token("surface"));
    expect(contrast(cream, stage)).toBeGreaterThanOrEqual(7);
    expect(contrast(cream, deep)).toBeGreaterThanOrEqual(7);
    expect(dusk).toContain("--wu-muted: color-mix(in oklch, var(--color-surface) 72%, transparent);");
    expect(contrast(mix(cream, stage, 0.72), stage)).toBeGreaterThanOrEqual(4.5);
    // What moves (a graphic, not text) stands out from the ground.
    expect(contrast(rgb(token("secondary-container")), stage)).toBeGreaterThanOrEqual(3);
  });
});

describe("a filled control keeps its contrast on both stages", () => {
  it("every rule that paints --wu-fill as a background sets --wu-on-fill as its colour", () => {
    const rules = css.split("}").filter((r) => /background:\s*var\(--wu-fill\)/.test(r));
    expect(rules.length).toBeGreaterThanOrEqual(2); // the play button, the primary button
    for (const r of rules) expect(r, r.trim().split("{")[0]).toContain("color: var(--wu-on-fill)");
  });
  it("the pairs pass AA: white on the dark green fill, deep green on the mint fill", () => {
    expect(rule(".root")).toContain("--wu-on-fill: var(--color-on-primary);");
    expect(contrast(rgb(token("on-primary")), rgb(token("primary-container")))).toBeGreaterThanOrEqual(4.5);
    expect(rule('.root[data-dusk="1"]')).toContain("--wu-on-fill: var(--color-on-primary-fixed);");
    expect(contrast(rgb(token("on-primary-fixed")), rgb(token("primary-fixed")))).toBeGreaterThanOrEqual(7);
    // The pair this replaced: white on light mint (about 1.7 to 1).
    expect(contrast(rgb(token("on-primary")), rgb(token("primary-fixed-dim")))).toBeLessThan(3);
  });
});

describe("shapes and motion come from the tokens", () => {
  it("no raw pill radius: var(--radius-pill)", () => {
    expect(css).not.toMatch(/border-radius:\s*999px/);
    expect(css).toContain("var(--radius-pill)");
  });
  it("the stage changes on the same curve the landing arrives with", () => {
    expect(globals).toMatch(/--ease-out:\s*cubic-bezier\(0\.22, 1, 0\.36, 1\);/);
    // One definition: the landing's animations read the token too.
    expect(globals.match(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/g)).toHaveLength(1);
    expect(rule(".root")).toContain("var(--ease-out)");
    expect(rule(".duskVeil")).toContain("var(--ease-out)");
  });
  it("no hex colour in the player's stylesheets", () => {
    for (const f of ["WarmupPlayer.module.css", "BreathField.module.css", "StepProgress.module.css", "figures/figures.module.css"]) {
      const text = readFileSync(resolve(__dirname, "../components/warmup", f), "utf8");
      expect(text, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe("the intro says what you will hear without opening anything", () => {
  const tsx = readFileSync(resolve(__dirname, "../components/warmup/WarmupPlayer.tsx"), "utf8");
  it("sound, the guiding voice and the demo sit in their own section; the folded options no longer hold them", () => {
    const sound = tsx.slice(tsx.indexOf("<section aria-label={t.soundTitle}>"), tsx.indexOf("{/* Run length (library page)"));
    expect(sound).toContain("t.soundLabel");
    expect(sound).toContain("t.voiceToggle");
    expect(sound).toContain('audio.playDemo("campana")');
    const folded = tsx.slice(tsx.indexOf("{settingsOpen && ("));
    expect(folded).not.toContain("t.voiceToggle");
    expect(folded).not.toContain("t.soundLabel");
  });
  it("the voice hint (it is a computer-generated voice) is on screen while the voice is on", () => {
    expect(tsx).toMatch(/audio\.muted \? t\.soundOffNote : audio\.voice \? t\.voiceHint/);
    for (const loc of ["es", "en"]) {
      const m = JSON.parse(readFileSync(resolve(__dirname, `../messages/${loc}.json`), "utf8")).warmup.player;
      expect(m.soundTitle.length).toBeGreaterThan(3);
      expect(m.soundOffNote.length).toBeGreaterThan(10);
      expect(m.voiceHint).toMatch(loc === "es" ? /generada por computadora/ : /computer-generated/);
    }
  });
});
