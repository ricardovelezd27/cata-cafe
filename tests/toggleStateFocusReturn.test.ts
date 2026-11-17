import { describe, expect, it } from "vitest";
import { nextRadioIndex } from "@/components/radioKeys";
import { readSource as read } from "./helpers/sourceTree";

// Package N3 (UI/UX audit of 2026-11-15): toggles announce their state, the
// choose-one cards are radio groups, and every kit dialog gives focus back to
// the element that opened it.

describe("N3: the radio-group keyboard (nextRadioIndex)", () => {
  it("the arrows move one step and wrap around", () => {
    expect(nextRadioIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextRadioIndex("ArrowDown", 2, 3)).toBe(0);
    expect(nextRadioIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextRadioIndex("ArrowUp", 1, 3)).toBe(0);
  });

  it("Home and End go to the ends; any other key moves nothing", () => {
    expect(nextRadioIndex("Home", 2, 3)).toBe(0);
    expect(nextRadioIndex("End", 0, 3)).toBe(2);
    expect(nextRadioIndex("Tab", 1, 3)).toBeNull();
    expect(nextRadioIndex(" ", 1, 3)).toBeNull();
    expect(nextRadioIndex("ArrowRight", 0, 0)).toBeNull();
  });

  it("radioKeyDown finds the radios in the DOM of its own group and moves focus with the choice", () => {
    const src = read("components/radioKeys.ts");
    expect(src).toContain(`event.currentTarget.closest('[role="radiogroup"]')`);
    expect(src).toContain(`querySelectorAll<HTMLElement>('[role="radio"]')`);
    expect(src).toMatch(/event\.preventDefault\(\);\s*select\(next\);/);
  });
});

describe("N3: toggle buttons say whether they are on", () => {
  const cases: [string, string][] = [
    ["components/coffees/CoffeeForm.tsx", "aria-pressed={active}"],
    ["components/groups/CreateGroupDialog.tsx", "aria-pressed={selected}"],
    ["app/[locale]/app/sessions/new/NewSessionForm.tsx", "aria-pressed={active}"],
    ["components/cupping/ExtrinsicForm.tsx", "aria-pressed={active}"],
    ["components/cupping/PhysicalEvalForm.tsx", "aria-pressed={active}"],
    ["components/insights/PivotBuilder.tsx", "aria-pressed={heatmap}"],
  ];
  for (const [file, attr] of cases) {
    it(file, () => expect(read(file)).toContain(attr));
  }

  it("the flavour picker's breadcrumb marks the level it shows", () => {
    const src = read("components/cupping/FlavorPicker.tsx");
    expect(src).toContain('aria-current={navId === null ? "location" : undefined}');
    expect(src).toContain('aria-current={c.id === navId ? "location" : undefined}');
  });
});

describe("N3: the choose-one cards are radio groups", () => {
  const cases: [string, string, string][] = [
    // file, the group's name, the checked expression
    ["components/coffees/CoffeeForm.tsx", 'role="radiogroup" aria-labelledby={fid("visibility")}', "aria-checked={active}"],
    ["app/[locale]/app/sessions/new/NewSessionForm.tsx", 'role="radiogroup" aria-label={t.format}', "aria-checked={format === v}"],
    ["app/[locale]/app/sessions/[id]/edit/EditSessionForm.tsx", 'role="radiogroup" aria-label={t.format}', "aria-checked={format === opt}"],
    ["components/onboarding/WelcomeModal.tsx", 'role="radiogroup" aria-label={t.whereToStart}', "aria-checked={isSelected}"],
  ];
  for (const [file, group, checked] of cases) {
    it(file, () => {
      const src = read(file);
      expect(src).toContain(group);
      expect(src).toContain('role="radio"');
      expect(src).toContain(checked);
      // Only one option is a Tab stop; the arrows move between them.
      expect(src).toMatch(/tabIndex=\{[^}]+\? 0 : -1\}/);
      expect(src).toContain("radioKeyDown(e, ");
    });
  }
});

describe("N3: a kit dialog gives focus back to the element that opened it", () => {
  const src = read("components/ui/ResponsiveDialog.tsx");

  it("remembers where focus was when `open` turned true (a render-time read, before an autoFocus field takes it)", () => {
    expect(src).toMatch(/if \(open !== wasOpen\) \{\s*setWasOpen\(open\);\s*if \(open\) setReturnTo\(currentFocus\(\)\);/);
    // <body> is never remembered: there is nothing to return to.
    expect(src).toContain("el !== document.body");
  });

  it("returns focus on close, and leaves Radix's default when that element is gone", () => {
    expect(src).toMatch(
      /onCloseAutoFocus=\{\(event\) => \{\s*if \(returnTo\?\.isConnected\) \{\s*event\.preventDefault\(\);\s*returnTo\.focus\(\);\s*\}/,
    );
  });

  it("changes nothing else: Escape, the overlay and the focus trap stay Radix's, the 640 px switch stays in the CSS module", () => {
    expect(src).not.toMatch(/onEscapeKeyDown|onPointerDownOutside|onInteractOutside|onOpenAutoFocus|trapFocus/);
    expect(src).toContain("<Dialog.Overlay className={styles.overlay} />");
    expect(src).toContain("className={styles.content}");
  });
});
