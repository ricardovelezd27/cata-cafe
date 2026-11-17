import { describe, expect, it } from "vitest";
import { readSource as read } from "./helpers/sourceTree";
import { PROCESS_TYPES } from "@/lib/constants";
import { PROCESS_TONE, processToneVar } from "@/lib/processTone";
import { avatarTone } from "@/components/ui/Avatar";

// T5 (E-01): the components that DESIGN.md "Colours for people, processes and
// formats" gives a rule of their own, and the cup page's stepper.

describe("T5: people, processes and formats take the system's colours", () => {
  it("an avatar is a neutral circle with ink initials and a ring in one family tone, stable per person", () => {
    const src = read("components/ui/Avatar.tsx");
    expect(src).toContain('backgroundColor: "var(--color-surface-container-high)"');
    expect(src).toContain('color: "var(--color-on-surface)"');
    expect(src).toMatch(/boxShadow: `inset 0 0 0 \$\{ring\}px var\(\$\{avatarTone\(seed \?\? name\)\}\)`/);
    expect(avatarTone("user-1")).toBe(avatarTone("user-1"));
    expect(avatarTone("user-1")).toMatch(/^--color-flavor-/);
    // Both screens pass the person's id, so the tone is the same everywhere.
    expect(read("app/[locale]/app/profile/page.tsx")).toContain("seed={user.id}");
    expect(read("components/groups/CoCupperCard.tsx")).toContain("seed={cupper.userId}");
  });

  it("a format is the kit's neutral Badge, with no colour per format", () => {
    const src = read("components/dashboard/FormatBadge.tsx");
    expect(src).toContain('<Badge tone="neutral">{label}</Badge>');
    expect(src).not.toMatch(/FORMAT_STYLES|bg-\[|text-\[/);
  });

  it("a process is its name in ink with a family-tone dot, from the one map", () => {
    for (const p of PROCESS_TYPES) expect(PROCESS_TONE[p], p).toMatch(/^--color-flavor-/);
    expect(processToneVar("Lavado")).toBe("var(--color-flavor-other)");
    expect(processToneVar("algo antiguo")).toBe(`var(${PROCESS_TONE.Otro})`);
    const table = read("components/coffees/CoffeesTable.tsx");
    expect(table).toContain("style={{ backgroundColor: processToneVar(type) }}");
    expect(table).toMatch(/text-xs font-medium text-on-surface">/);
    expect(table).not.toMatch(/PROCESS_COLORS|text-white/);
  });
});

describe("T5: the cup page's stepper keeps its states apart, with tokens", () => {
  const src = read("components/cupping/PhaseStepper.tsx");

  it("done, pending and to-do keep their marks (✓, ●, none); the current step stays bold with its outline", () => {
    expect(src).toContain('symbol: "✓"');
    expect(src).toContain('symbol: "●", color: "var(--color-secondary)"');
    expect(src).toContain('fontWeight: isActive ? 700 : 400');
    expect(src).toContain('"1px solid var(--color-primary-container)"');
  });

  it("paints with tokens only", () => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).toContain('"var(--color-on-surface-variant)"');
  });
});
