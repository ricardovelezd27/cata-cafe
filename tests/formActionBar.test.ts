import { describe, expect, it } from "vitest";
import { readSource as read } from "./helpers/sourceTree";

// S7a (finding C-08 of the 2026-11-15 audit): the one submit of each long form
// sits in a docked action bar, the CanvasFooter recipe for a form, built ONCE in
// the kit (components/ui/FormActionBar.tsx) and used by the four forms the
// finding names.

const css = read("components/ui/FormActionBar.module.css");
const tsx = read("components/ui/FormActionBar.tsx");

/** The declarations of the first rule whose selector is exactly `sel`, inside
 *  the media query `media` when given (null = outside any media query). */
function rule(sel: string, media: string | null = null): string {
  const scope = media === null ? css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, "") : (() => {
    const at = css.indexOf(`@media ${media}`);
    expect(at, `@media ${media}`).toBeGreaterThan(-1);
    return css.slice(at);
  })();
  const m = new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(scope);
  expect(m, `${sel} in ${media ?? "base"}`).not.toBeNull();
  return m![2];
}

describe("S7a: the kit's docked form bar", () => {
  it("docks at the bottom of the page's scroll, above the phone's tab bar and its safe-area inset", () => {
    const bar = rule(".bar");
    expect(bar).toMatch(/position:\s*sticky/);
    // A sticky offset counts from inside <main>'s padding (pb-20 = 5rem on a
    // phone, lg:pb-6 = 1.5rem): the offsets take it back, so the bar meets the
    // tab bar's top on a phone and the window's bottom edge on a desktop.
    expect(bar).toMatch(/bottom:\s*calc\(var\(--bottom-nav-height\) \+ env\(safe-area-inset-bottom, 0px\) - 5rem\)/);
    expect(rule(".bar", "(min-width: 64rem)")).toMatch(/bottom:\s*-1\.5rem/);
    const shell = read("app/[locale]/app/layout.tsx");
    expect(shell).toContain("p-4 lg:p-6 pb-20 lg:pb-6");
  });

  it("is opaque with a hairline on the edge that meets the form (a docked bar over a form does not blur)", () => {
    const bar = rule(".bar");
    expect(bar).toMatch(/background:\s*var\(--color-surface-container-lowest\)/);
    expect(bar).toMatch(/border-top:\s*1px solid var\(--color-outline-variant\)/);
    expect(css).not.toMatch(/backdrop-filter|blur\(/);
    // Role tokens only.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("scrolls a focused control clear of the bar and of the tab bar under it (scroll-padding on the page's scroll)", () => {
    expect(css).toMatch(
      /:global\(main\):has\(\.form\) \{\s*scroll-padding-bottom: calc\(var\(--bottom-nav-height\) \+ env\(safe-area-inset-bottom, 0px\) \+ 112px\);/,
    );
    expect(css).toMatch(/@media \(min-width: 64rem\) \{\s*:global\(main\):has\(\.form\) \{\s*scroll-padding-bottom: 112px;/);
    expect(tsx).toContain("export const dockedFormClass = styles.form;");
  });

  it("carries the form's own line as a polite live region, above the buttons", () => {
    expect(tsx).toMatch(/<div className=\{styles\.status\} aria-live="polite">\s*\{status\}\s*<\/div>\s*<div className=\{styles\.actions\}>\{children\}<\/div>/);
    expect(rule(".status:empty")).toMatch(/display:\s*none/);
  });
});

describe("S7a: the four forms of C-08 use it, as their last element", () => {
  const forms: [string, string][] = [
    ["app/[locale]/app/sessions/new/NewSessionForm.tsx", "{isGroup ? t.newForm.startGroup : t.start}"],
    ["components/coffees/CoffeeForm.tsx", "{pending ? resolvedSubmittingLabel : resolvedSubmitLabel}"],
    ["app/[locale]/app/sessions/[id]/edit/EditSessionForm.tsx", "{savePending ? t.saving : t.save}"],
  ];
  for (const [file, submitLabel] of forms) {
    it(file, () => {
      const src = read(file);
      // The <form> takes the scroll margin.
      expect(src).toMatch(/<form onSubmit=\{\w+\} className=\{`?\$?\{?dockedFormClass/);
      // Exactly one bar, and exactly one submit, inside it.
      expect(src.match(/<FormActionBar\b/g)).toHaveLength(1);
      expect(src.match(/type="submit"/g)).toHaveLength(1);
      const bar = src.slice(src.indexOf("<FormActionBar"), src.indexOf("</FormActionBar>"));
      expect(bar).toContain('type="submit"');
      expect(bar).toContain(submitLabel);
      // Nothing focusable after the bar in the form: Tab still ends on the submit.
      const after = src.slice(src.indexOf("</FormActionBar>"));
      expect(after.slice(0, after.indexOf("</form>"))).not.toMatch(/<(button|input|select|textarea|a)\b/);
    });
  }

  it("the wizard's sections carry their numbers (1 to 4) and are named by their titles", () => {
    const src = read("app/[locale]/app/sessions/new/NewSessionForm.tsx");
    const numbers = [...src.matchAll(/<SectionTitle n=\{(\d)\}/g)].map((m) => Number(m[1]));
    expect(numbers).toEqual([1, 2, 3, 4]);
    expect(src.match(/<section aria-labelledby=\{`\$\{fid\}-sec-\w+`\}/g)).toHaveLength(4);
    // T4b: `.section-title` paints the section role (21 px) by itself.
    expect(src).toContain('<h2 id={id} className={`section-title ${className}`}>');
  });

  it("the wizard has ONE add action for samples (D-05): no separate 'add another coffee'", () => {
    const src = read("app/[locale]/app/sessions/new/NewSessionForm.tsx");
    expect(src).not.toContain("addCoffee");
    expect(src.match(/onClick=\{addSample\}/g)).toHaveLength(1);
  });
});
