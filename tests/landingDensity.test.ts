import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PILE, deviceRect } from "@/components/landing/journey/formations";
import { PHONE_MAX, carouselIndex } from "@/components/landing/carouselIndex";

// The four density rules the owner asked for on 2026-11-15 (DESIGN.md
// "Density: four rules learned on the landing"), held on the landing itself,
// plus the three of his second review the same day: a tablet is a small
// desktop, optional cards go sideways on a phone, and progress shows numbers.

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
    // A tablet takes the desktop's spacing: the top step starts at 768px.
    const desktop = media(768, "\n.stage-section {");
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
    expect(r).toContain("left: 4px;");
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

describe("a tablet is a small desktop: one layout breakpoint, 768px", () => {
  it("the phone layout ends where the desktop one begins", () => {
    expect(PHONE_MAX).toBe("(max-width: 767.98px)");
    expect(file("ScrollDeck.tsx")).toContain("${PHONE_MAX} and (prefers-reduced-motion: no-preference)");
    expect(file("StepsActiveObserver.tsx")).toContain(
      'const ENHANCED = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";',
    );
    expect(read("components/landing/journey/ConstellationCanvas.tsx")).toContain("const narrow = W < 768;");
    expect(css).toContain(
      "@media (min-width: 768px) and (scripting: enabled) and (prefers-reduced-motion: no-preference) {",
    );
  });
  it("no section of the page is arranged at 640 or at 1024px", () => {
    // Type sizes and paddings may still step at sm: or lg:; an arrangement may not.
    const arranged = "(?:grid-cols|flex-row|w-\\[|absolute|hidden|block|grid\\b|flex\\b)";
    // Nothing on the page is arranged differently from 1024px: a tablet has it already.
    for (const { name, src } of LANDING) {
      expect(src, name).not.toMatch(new RegExp(`\\blg:${arranged}`));
    }
    // And no SECTION has an in-between arrangement from 640px. (A field with
    // its button, the footer's rows and the header's label may sit in a row
    // from 640px: they are the same on a tablet and on a desktop.)
    const sections = [
      "HeroSection.tsx",
      "HeroFoundingCard.tsx",
      "StepsShowcase.tsx",
      "FeaturesSection.tsx",
      "AudienceSection.tsx",
      "SectionHeading.tsx",
      "FoundingSection.tsx",
      "FinalCTASection.tsx",
    ];
    for (const name of sections) {
      expect(file(name), name).not.toMatch(new RegExp(`\\bsm:${arranged}`));
    }
    expect(css).not.toMatch(/@media \(min-width: 1024px\)[^{]*\{\s*\.(?:steps|deck|stage-section)/);
  });
  it("the same arrangement from 768px: two-column hero, 3 x 2 grid, three photo cards", () => {
    expect(file("HeroSection.tsx")).toContain("md:grid-cols-2");
    expect(file("FeaturesSection.tsx")).toContain("md:grid md:grid-cols-3");
    expect(file("AudienceSection.tsx")).toContain("md:w-[calc((100%-2rem)/3)]");
    // The arrows of the people cards are a desktop control.
    expect(file("SectionHeading.tsx")).toContain("hidden md:absolute md:bottom-0 md:right-0 md:block");
  });
  it("the pile's column never gets narrower than the card and the two behind it", () => {
    expect(css).toContain("grid-template-columns: minmax(348px, 9fr) minmax(0, 11fr);");
    expect(PILE.minColW).toBe(PILE.cardW + 28);
    // At 768px the front card and the screens behind it stay inside the page.
    const tablet = deviceRect(768, 1024, false)!;
    expect(tablet.x0 - 28).toBeGreaterThanOrEqual(0);
    // At 1024px and wider the 9-to-11 split decides, exactly as before.
    for (const W of [1024, 1280, 1440, 1920]) {
      const content = Math.min(W, PILE.contentMax);
      const colW = (content - PILE.pad * 2 - PILE.gap) * PILE.leftShare;
      expect(colW).toBeGreaterThan(PILE.minColW);
      const d = deviceRect(W, 900, false)!;
      expect(d.x0).toBeCloseTo((W - content) / 2 + PILE.pad + colW / 2 - PILE.cardW / 2, 6);
    }
    expect(deviceRect(767, 900, true)).toBeNull();
  });
});

describe("on a phone, what must be read rides the scroll and optional cards go sideways", () => {
  it("the scroll stage is \"Cómo funciona\" and nothing else", () => {
    const users = LANDING.filter((f) => f.src.includes("<ScrollDeck")).map((f) => f.name);
    expect(users).toEqual(["StepsShowcase.tsx"]);
    for (const name of ["FeaturesSection.tsx", "AudienceSection.tsx"]) {
      expect(file(name), name).not.toContain("data-deck");
      expect(file(name), name).not.toContain("deck-");
    }
    // The rules only the pinned card sections used are gone.
    for (const gone of [".deck-swap", ".deck-over", ".deck-fill", ".deck-card", ".deck-cards"]) {
      expect(css, gone).not.toContain(gone);
    }
  });
  it("the two card sections are sideways rows with the next card showing", () => {
    for (const name of ["FeaturesSection.tsx", "AudienceSection.tsx"]) {
      const src = file(name);
      expect(src, name).toContain("snap-x snap-mandatory");
      expect(src, name).toContain("overflow-x-auto");
      // 82% of the screen: the next card is always at the edge.
      expect(src, name).toContain("w-[82vw] max-w-[320px] shrink-0 snap-start");
      expect(src, name).toContain("<CarouselSteps");
    }
    // The grid is a Tab stop only while it scrolls sideways.
    expect(file("FeaturesSection.tsx")).toMatch(/<CarouselSteps[^>]*focusable/);
    expect(file("FeaturesSection.tsx")).not.toContain("tabIndex");
  });
  it("the step being read: by position, and the last one when the row cannot scroll further", () => {
    expect(carouselIndex(0, 322, 6, false)).toBe(0);
    expect(carouselIndex(322, 322, 6, false)).toBe(1);
    expect(carouselIndex(480, 322, 6, false)).toBe(1);
    expect(carouselIndex(484, 322, 6, false)).toBe(2);
    expect(carouselIndex(5 * 322, 322, 6, true)).toBe(5);
    // A wide phone shows two cards: the row stops before the last one snaps.
    expect(carouselIndex(4 * 322 - 60, 322, 6, true)).toBe(5);
    // A row that does not scroll at all is at its first card, not its last.
    expect(carouselIndex(0, 322, 6, true)).toBe(0);
    expect(carouselIndex(99999, 322, 6, false)).toBe(5);
    expect(carouselIndex(Number.NaN, 322, 6, false)).toBe(0);
    expect(carouselIndex(100, 0, 6, false)).toBe(0);
  });
});

describe("a step of progress carries its number", () => {
  it("one recipe for every rail: a numbered circle, filled when it is on", () => {
    const step = rule(".rail-step");
    expect(step).toContain("width: 20px;");
    expect(step).toContain("font-variant-numeric: tabular-nums;");
    expect(rule('.rail-step[data-on="1"]')).toContain("background: var(--color-secondary-container);");
    expect(css).not.toContain(".deck-rail-dot");
    expect(css).not.toContain(".steps-rail-dot");
  });
  it("every indicator prints the number: the pile's rail, the phone stage's rail, the rows' steps", () => {
    expect(file("StepsShowcase.tsx")).toMatch(/className="rail-step" data-rail=\{n\}[^>]*>\s*\{n\}/);
    expect(file("DeckRail.tsx")).toMatch(/className="rail-step" data-deck-dot=""[^>]*>\s*\{i \+ 1\}/);
    expect(file("CarouselControls.tsx")).toMatch(/className="rail-step"[^>]*>\s*\{i \+ 1\}/);
  });
  it("a sideways row's steps run sideways, under it, on phones only", () => {
    expect(file("CarouselControls.tsx")).toContain("flex items-center justify-center gap-2 md:hidden");
  });
});
