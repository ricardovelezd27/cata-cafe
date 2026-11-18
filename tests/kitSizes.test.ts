import { describe, expect, it } from "vitest";
import { HIT_44, HIT_Y44 } from "@/components/ui/hitArea";
import { readSource as read } from "./helpers/sourceTree";

// Packages T7 and T7b of the UI/UX audit of 2026-11-15 (F-02, F-03, F-04, F-14):
// touch targets are 44 px PAINTED (DESIGN.md "Accessibility"; the root is 14 px, so
// `h-11` paints 38.5 px). A control either paints 44 px itself (`min-h-[44px]`,
// written in pixels) or keeps its visible size and gets a 44 px hit area through a
// transparent ::before (`HIT_44` / `HIT_Y44` from components/ui/hitArea.ts).
// These checks pin that rule on each kit control, not the order of its classes.

/** The class tokens of a class string (a template literal's `${...}` stays one token). */
function tokens(cls: string): string[] {
  return cls.split(/\s+/).filter(Boolean);
}

/** True when a class string paints 44 px tall or carries a 44 px hit area. */
export function reaches44(cls: string): boolean {
  const t = tokens(cls);
  return (
    t.includes("min-h-[44px]") ||
    t.includes("h-[44px]") ||
    /\$\{\s*HIT_Y?44\s*\}/.test(cls) ||
    // a literal copy of a hit-area constant
    (t.includes("before:absolute") && (t.includes("before:h-[44px]") || t.includes("before:h-[max(100%,44px)]")))
  );
}

/** True when a class string paints 44 px wide too (an icon-only control). */
function reaches44Wide(cls: string): boolean {
  const t = tokens(cls);
  return t.includes("min-w-[44px]") || t.includes("w-[44px]") || /\$\{\s*HIT_44\s*\}/.test(cls);
}

/** The value of `className=` on the first element after `anchor` (a string, a {"..."} or a {`...`}). */
function classAfter(src: string, anchor: RegExp | string): string {
  const at = typeof anchor === "string" ? src.indexOf(anchor) : src.search(anchor);
  expect(at, `anchor ${String(anchor)} not found`).toBeGreaterThanOrEqual(0);
  const rest = src.slice(at);
  const m = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{\s*"([^"]*)"\s*\})/.exec(rest);
  expect(m, `no className after ${String(anchor)}`).not.toBeNull();
  return m![1] ?? m![2] ?? m![3];
}

/** The string assigned to `const NAME =` (one literal, possibly on the next line). */
function constString(src: string, name: string): string {
  const m = new RegExp(`const ${name}\\s*=\\s*"([^"]*)"`).exec(src);
  expect(m, `const ${name} not found`).not.toBeNull();
  return m![1];
}

/** The declarations of the first CSS rule whose selector is exactly `selector`, inside `scope` if given. */
function cssRule(css: string, selector: string, scope?: string): string {
  let body = css;
  if (scope) {
    const at = css.indexOf(scope);
    expect(at, `scope ${scope} not found`).toBeGreaterThanOrEqual(0);
    body = css.slice(at);
  }
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|[\\s,}])${esc}\\s*\\{([^}]*)\\}`, "m").exec(body);
  expect(m, `rule ${selector} not found`).not.toBeNull();
  return m![1];
}

describe("the checker itself", () => {
  it("accepts a painted 44 px or a hit-area constant, and nothing else", () => {
    expect(reaches44("inline-flex min-h-[44px] items-center")).toBe(true);
    expect(reaches44("${HIT_Y44} rounded-pill px-3")).toBe(true);
    expect(reaches44("h-11 px-3")).toBe(false); // 38.5 px painted at the 14 px root
    expect(reaches44("min-h-11 py-2")).toBe(false);
    expect(reaches44("px-4 py-2 text-sm")).toBe(false);
    expect(reaches44Wide("min-h-[44px] min-w-[44px]")).toBe(true);
    expect(reaches44Wide("min-h-[44px] p-1.5")).toBe(false);
  });
});

describe("hitArea.ts: the hit-area constants are 44 px", () => {
  it("HIT_Y44 is a positioned, transparent ::before 44 px tall and as wide as the control", () => {
    const t = tokens(HIT_Y44);
    for (const k of ["relative", "before:absolute", "before:h-[44px]", "before:inset-x-0", "before:content-['']"]) {
      expect(t, k).toContain(k);
    }
  });
  it("HIT_44 is at least 44 x 44, centred", () => {
    const t = tokens(HIT_44);
    for (const k of ["relative", "before:absolute", "before:h-[max(100%,44px)]", "before:w-[max(100%,44px)]", "before:content-['']"]) {
      expect(t, k).toContain(k);
    }
  });
});

describe("F-14: the phone's bottom bar has five tabs at most", () => {
  const items = read("components/layout/navItems.ts");
  const bar = read("components/layout/BottomNav.tsx");
  it("the bar builds its tabs from NAV_ITEMS only, minus the items hidden on phones", () => {
    expect(bar).not.toMatch(/INSIGHTS_ITEM/);
    expect(bar).not.toMatch(/\[\s*\.\.\.NAV_ITEMS\s*,/); // nothing appended to the list
    expect(bar).toMatch(/NAV_ITEMS\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*!\s*\w+\.hideOnMobile\s*\)/);
  });
  it("NAV_ITEMS minus the hideOnMobile items is five or fewer", () => {
    const block = /export const NAV_ITEMS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(items);
    expect(block).not.toBeNull();
    const entries = block![1].split("\n").filter((l) => /^\s*\{\s*href:/.test(l));
    const onPhone = entries.filter((l) => !/hideOnMobile:\s*true/.test(l));
    expect(entries.length).toBeGreaterThan(0);
    expect(onPhone.length).toBeLessThanOrEqual(5);
  });
  it("labels paint the caption size (12.25 px, T4b) and the active tab is marked by more than colour", () => {
    const tab = classAfter(bar, "<GuestGateLink");
    expect(tokens(tab)).toContain("text-caption");
    expect(tab).toMatch(/font-semibold/);
    expect(tab).toMatch(/before:h-\[3px\]/);
  });
});

describe("F-03: TextAction is a 44 px box", () => {
  it("its box is at least 44 x 44", () => {
    const box = constString(read("components/ui/TextAction.tsx"), "BOX");
    expect(reaches44(box)).toBe(true);
    expect(reaches44Wide(box)).toBe(true);
  });
});

describe("F-04: the kit's controls reach 44 px", () => {
  it("Button (every size): the shared base paints 44 px", () => {
    expect(reaches44(constString(read("components/ui/Button.tsx"), "BASE"))).toBe(true);
  });
  it("Select and SearchInput paint 44 px", () => {
    expect(reaches44(classAfter(read("components/ui/Select.tsx"), "<select"))).toBe(true);
    expect(reaches44(classAfter(read("components/ui/SearchInput.tsx"), "<input"))).toBe(true);
  });
  it("PillTabs: each tab paints 44 px", () => {
    expect(reaches44(classAfter(read("components/ui/PillTabs.tsx"), 'role="tab"'))).toBe(true);
  });
  it("SegmentedControl: the track paints 44 px and each segment has a 44 px hit area", () => {
    const src = read("components/ui/SegmentedControl.tsx");
    expect(reaches44(classAfter(src, 'role="radiogroup"'))).toBe(true);
    expect(reaches44(classAfter(src, 'role="tab"'))).toBe(true);
  });
  it("the dialog close is 44 x 44", () => {
    const close = cssRule(read("components/ui/ResponsiveDialog.module.css"), ".close");
    expect(close).toMatch(/(?:^|;|\s)(?:min-)?width:\s*44px/);
    expect(close).toMatch(/(?:^|;|\s)(?:min-)?height:\s*44px/);
  });
  it("InfoHint is 44 x 44", () => {
    const cls = classAfter(read("components/ui/InfoHint.tsx"), "<button");
    expect(reaches44(cls)).toBe(true);
    expect(reaches44Wide(cls)).toBe(true);
  });
  it("DataTable: the checkbox box, the sort header and the row chevron reach 44 px", () => {
    const src = read("components/ui/DataTable.tsx");
    const box = constString(src, "CHECKBOX_BOX");
    expect(reaches44(box) && reaches44Wide(box)).toBe(true);
    expect(src).toMatch(/<label className=\{CHECKBOX_BOX\}/);
    expect(reaches44(classAfter(src, "onClick={onSort}"))).toBe(true);
    const chevron = classAfter(src, "tabIndex={-1}");
    expect(reaches44(chevron) && reaches44Wide(chevron)).toBe(true);
  });
  it("the tables' row icon actions are 44 x 44", () => {
    // Every row icon action (edit, delete, duplicate) shares the `rounded-sm p-1.5` box.
    const files = [
      "components/DuplicateButton.tsx",
      "app/[locale]/app/sessions/DeleteSessionButton.tsx",
      "app/[locale]/app/sessions/SessionsTable.tsx",
      "components/coffees/DeleteCoffeeButton.tsx",
      "components/coffees/CoffeesTable.tsx",
    ];
    for (const file of files) {
      const boxes = [...read(file).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
        .map((m) => m[1] ?? m[2])
        .filter((c) => /\brounded-sm\b/.test(c) && /\bp-1\.5\b/.test(c));
      expect(boxes.length, file).toBeGreaterThan(0);
      for (const c of boxes) expect(reaches44(c) && reaches44Wide(c), `${file}: ${c}`).toBe(true);
    }
  });
});

describe("F-02: the nine rating bubbles", () => {
  const css = read("components/ui/AffectiveBubbles.module.css");
  it("every bubble carries a transparent ::before hit area 44 px tall, as wide as --hit-w", () => {
    expect(cssRule(css, ".bubble")).toMatch(/position:\s*relative/);
    const hit = cssRule(css, ".bubble::before");
    expect(hit).toMatch(/content:\s*""/);
    expect(hit).toMatch(/position:\s*absolute/);
    expect(hit).toMatch(/(?:^|;|\s)height:\s*44px/);
    expect(hit).toMatch(/width:\s*var\(--hit-w/);
    expect(hit).not.toMatch(/background|border|box-shadow/);
  });
  it("the narrow rule paints 34 px and caps the hit width at 44 px and the bubble's column", () => {
    const narrow = cssRule(css, ".bubble", "@container (max-width: 440px)");
    expect(narrow).toMatch(/(?:^|;|\s)width:\s*34px/);
    expect(narrow).toMatch(/(?:^|;|\s)height:\s*34px/);
    expect(narrow).toMatch(/--hit-w:\s*min\(44px,/);
    // nine columns, so two hit areas meet at the midpoint between two bubbles
    expect(cssRule(css, ".row", "@container (max-width: 440px)")).toMatch(/grid-template-columns:\s*repeat\(9,/);
  });
  it("no narrower rule shrinks a bubble under 34 px", () => {
    const sizes = [...css.matchAll(/\.bubble\s*\{[^}]*?(?:^|;|\s)width:\s*(\d+)px/gm)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(34);
  });
});
