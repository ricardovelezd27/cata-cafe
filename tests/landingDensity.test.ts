import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PILE } from "@/components/landing/journey/formations";

// The four density rules the owner asked for on 2026-11-15 (DESIGN.md
// "Density: four rules learned on the landing"), held on the landing itself.

const root = (p: string) => resolve(__dirname, "..", p);
const read = (p: string) => readFileSync(root(p), "utf8");
const css = read("app/globals.css");
const LANDING = readdirSync(root("components/landing"))
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ({ name: f, src: read(`components/landing/${f}`) }));
const file = (name: string) => LANDING.find((f) => f.name === name)!.src;
const words = (s: string) => s.replace(/[.,;:!?¿¡→·]/g, " ").split(/\s+/).filter(Boolean).length;
const messages = (loc: string) => JSON.parse(read(`messages/${loc}.json`)).landing;

/** The declarations of the FIRST rule with exactly this selector, outside any media query. */
const rule = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) throw new Error(`no rule ${selector}`);
  return css.slice(at, css.indexOf("}", at));
};
/** The body of the first `@media (min-width: Npx) {` block that follows `after`. */
const media = (minWidth: number, after: string) => {
  const from = css.indexOf(after);
  const at = css.indexOf(`@media (min-width: ${minWidth}px) {`, from);
  return css.slice(at, css.indexOf("\n}", at));
};

describe("white space has a ceiling", () => {
  it("one scale for every section: 40 / 48 / 56 px, heading to content 24 / 28 / 36 px", () => {
    expect(rule(".stage-section")).toContain("padding-block: 40px;");
    expect(rule(".stage-section-head")).toContain("margin-bottom: 24px;");
    const tablet = media(640, "\n.stage-section {");
    expect(tablet).toContain(".stage-section { padding-block: 48px; }");
    expect(tablet).toContain(".stage-section-head { margin-bottom: 28px; }");
    const desktop = media(1024, "\n.stage-section {");
    expect(desktop).toContain(".stage-section { padding-block: 56px; }");
    expect(desktop).toContain(".stage-section-head { margin-bottom: 36px; }");
  });
  it("every section of the page takes it, and none sets its own vertical padding", () => {
    const sections = ["HeroSection.tsx", "StepsShowcase.tsx", "FeaturesSection.tsx", "AudienceSection.tsx", "FoundingSection.tsx", "FinalCTASection.tsx"];
    for (const name of sections) {
      const src = file(name);
      expect(src, name).toContain("stage-section");
      // The container that carries max-w-* is the section's box.
      for (const cls of src.match(/className="[^"]*max-w-(?:6xl|4xl)[^"]*"/g) ?? []) {
        expect(cls, name).not.toMatch(/\b(?:sm:|lg:)?p[ytb]-\d+/);
      }
    }
    for (const name of ["StepsShowcase.tsx", "FeaturesSection.tsx", "AudienceSection.tsx", "FoundingSection.tsx"]) {
      expect(file(name), name).toContain("stage-section-head");
    }
  });
  it("the pinned steps are as tall as the effect needs: 56vh, the last one never under 470px", () => {
    expect(css).toMatch(/min-height: 56vh;/);
    expect(css).not.toMatch(/min-height: 78vh/);
    expect(css).toMatch(/\.steps-article:last-child \{ min-height: max\(56vh, 470px\); \}/);
    // The first text starts level with the card, not in the middle of its block.
    expect(css).toMatch(/\.steps-article:first-child \{\s+justify-content: flex-start;\s+padding-top: 80px;/);
  });
  it("a screen and its text sit side by side from 768px, also in the plain layout", () => {
    const tablet = media(768, "\n.steps-root {");
    expect(tablet).toContain("grid-template-columns: minmax(0, 9fr) minmax(0, 11fr);");
  });
  it("the pile's box and the constellation's copy of it agree (nothing kept under the card)", () => {
    expect(PILE.footroom).toBe(0);
    expect(PILE.headroom + PILE.cardH + PILE.footroom).toBe(380);
    expect(css).toContain("top: max(76px, calc(50vh - 190px));");
    expect(css).toMatch(/\.steps-pile \{\s+display: block;\s+position: sticky;\s+top: max\(76px, calc\(50vh - 190px\)\);\s+height: 380px;/);
    expect(PILE.minTop).toBe(76);
  });
});

describe("every section opens centred, at every width", () => {
  const heading = file("SectionHeading.tsx");
  it("no left alignment from 640px", () => {
    expect(heading).not.toContain("sm:text-left");
    expect(heading).not.toContain("sm:flex-row");
    expect(heading).toContain("items-center");
    expect(heading).toContain("text-center");
  });
  it("the fold line runs out to both sides at every width", () => {
    const from = css.indexOf("\n.section-rule {");
    const block = css.slice(from, css.indexOf("/* ====", from));
    expect(block).toContain(".section-rule::before");
    expect(block).not.toMatch(/\.section-rule::before \{ display: none; \}/);
  });
});

describe("progress follows the direction of travel", () => {
  it("the rails are vertical and fill downward", () => {
    expect(rule(".steps-rail")).toContain("flex-direction: column;");
    expect(rule(".steps-rail-line")).toMatch(/width: 1\.5px;\s+height: 44px;/);
    expect(rule(".deck-rail-line")).toMatch(/width: 1\.5px;\s+height: 20px;/);
    expect(rule(".deck-rail-line::after")).toContain("transform: scaleY(var(--f, 0));");
    expect(css).toContain("transform: scaleY(var(--p2));");
    expect(css).not.toMatch(/scaleX\(var\(--(?:f|p2|p3)/);
    expect(rule("[data-deck-on] .deck-rail")).toContain("flex-direction: column;");
  });
  it("the phone rail stands in the left gutter, out of the flow", () => {
    const r = rule("[data-deck-on] .deck-rail");
    expect(r).toContain("position: absolute;");
    expect(r).toContain("left: 5px;");
    expect(r).not.toContain("margin-top");
  });
  it("a counter with a chevron says more is below, and goes with the last card", () => {
    const rail = file("DeckRail.tsx");
    expect(rail).toContain('className="deck-more"');
    expect(rail).toContain("data-deck-now");
    expect(rail).toContain('className="rail-more"');
    expect(css).toContain("[data-deck-on][data-deck-end] .deck-more { opacity: 0; }");
    const deck = file("ScrollDeck.tsx");
    expect(deck).toContain("root.dataset.deckEnd");
    expect(deck).toContain("nowEl.textContent");
    // Calm: the cue does not bounce.
    expect(css).not.toContain("@keyframes rail-more");
  });
  it("the plain layout has no horizontal mini rail inside each step", () => {
    const steps = file("StepsShowcase.tsx");
    expect(steps.match(/<Rail /g)).toHaveLength(1);
  });
});

describe("a first screen has a word budget", () => {
  for (const loc of ["es", "en"]) {
    it(`${loc}: a title of at most 7 words, at most 25 more, chips of at most 3`, () => {
      const hero = messages(loc).hero;
      expect(words(hero.title)).toBeLessThanOrEqual(7);
      expect(words(hero.subtitle)).toBeLessThanOrEqual(25);
      for (const k of ["chip1", "chip2", "chip3", "chip4"]) expect(words(hero[k]), k).toBeLessThanOrEqual(3);
      expect(words(hero.eyebrow)).toBeLessThanOrEqual(4);
      // Everything the first screen makes a person read, card included.
      const founding = messages(loc).founding;
      const all = [hero.eyebrow, hero.title, hero.subtitle, hero.chip1, hero.chip2, hero.chip3, hero.chip4, founding.badge, founding.heroLead, "100", founding.heroUnit, hero.cta, hero.ctaNote];
      expect(all.map(words).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(60);
    });
    it(`${loc}: the title's words are not repeated in the eyebrow and the chips`, () => {
      const hero = messages(loc).hero;
      const key = loc === "es" ? /\bgrupo\b/i : /\bgroup\b/i;
      const places = [hero.eyebrow, hero.title, hero.subtitle].filter((t: string) => key.test(t)).length;
      expect(places).toBeLessThanOrEqual(2);
      expect(hero.eyebrow).not.toMatch(/SCA|CVA/);
      expect(hero.subtitle).not.toMatch(/SCA|CVA/);
    });
  }
  it("the hero shows what it gives as icons, not as sentences", () => {
    const hero = file("HeroSection.tsx");
    expect(hero).toMatch(/import \{[^}]*\} from "lucide-react"/);
    expect(hero.match(/key: "chip\d"/g)).toHaveLength(4);
    const card = file("HeroFoundingCard.tsx");
    expect(card).not.toContain("feature1");
    expect(card).not.toContain("<Check");
  });
});

describe("an ask appears once", () => {
  it("the reservation form is on the page once, in the founding section", () => {
    const users = LANDING.filter((f) => f.src.includes("<WaitlistForm")).map((f) => f.name);
    expect(users).toEqual(["FoundingSection.tsx"]);
    expect(file("FoundingSection.tsx")).toContain("id={FOUNDING_ID}");
  });
  it("the hero's button goes there: a real link that jumps, and focuses only with a real keyboard", () => {
    const card = file("HeroFoundingCard.tsx");
    expect(card).toContain("<ScrollToLink");
    expect(card).toContain("targetId={FOUNDING_ID}");
    const link = file("ScrollToLink.tsx");
    expect(link).toContain("href={`#${targetId}`}");
    expect(link).toContain('behavior: "instant"');
    expect(link).not.toContain('"smooth"');
    expect(link).toContain("(hover: hover) and (pointer: fine)");
  });
  it("the second ask is the newsletter, quieter, with its consent line always shown", () => {
    const closing = file("FinalCTASection.tsx");
    expect(closing).toContain("<NewsletterForm");
    expect(closing).not.toContain("loginHref");
    const form = file("NewsletterForm.tsx");
    // Outlined, not filled: the founding card's button is the solid one.
    expect(form).toMatch(/type="submit"[\s\S]*?border border-surface\/45/);
    expect(form).toContain("{notice.text}");
    expect(form).not.toContain("notice &&");
  });
  it("the founding card says the offer and asks; it does not repeat the features or its section's name", () => {
    const founding = file("FoundingSection.tsx");
    expect(founding).not.toContain("FeatureList");
    expect(founding).not.toContain('t("badge")');
    expect(founding).not.toContain('t("note")');
  });
});
