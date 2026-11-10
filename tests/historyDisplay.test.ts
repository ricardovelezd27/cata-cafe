import { describe, expect, it } from "vitest";
import { historyDisplay, isCoffeeRow } from "@/lib/historyDisplay";

const session = { id: "s1", name: "Cata del lunes" };

describe("historyDisplay", () => {
  it("revealed coffee row links to the coffee and the session", () => {
    const d = historyDisplay({
      coffeeId: "c1",
      coffee: { id: "c1", name: "Geisha", deletedAt: null },
      session,
      snapshot: null,
    });
    expect(d.kind).toBe("coffee");
    expect(d.linksToCoffee).toBe(true);
    expect(d.coffeeName).toBe("Geisha");
    expect(d.sessionId).toBe("s1");
    expect(d.labelReason).toBeNull();
  });

  it("an anonymized coffee does not link", () => {
    const d = historyDisplay({
      coffeeId: "c1",
      coffee: { id: "c1", name: "", deletedAt: new Date() },
      session,
      snapshot: null,
    });
    expect(d.coffeeDeleted).toBe(true);
    expect(d.linksToCoffee).toBe(false);
  });

  it("blind-deleted row: label only, session gone, falls back to the snapshot", () => {
    const d = historyDisplay({
      coffeeId: null,
      coffee: null,
      session: null,
      snapshot: { sessionName: "Cata ciega", sampleLabel: "Muestra B", unrevealed: true },
    });
    expect(d.kind).toBe("label_only");
    expect(d.labelReason).toBe("unrevealed");
    expect(d.coffeeName).toBeNull();
    expect(d.coffeeId).toBeNull();
    expect(d.linksToCoffee).toBe(false);
    expect(d.sessionId).toBeNull();
    expect(d.sessionName).toBe("Cata ciega");
    expect(d.sampleLabel).toBe("Muestra B");
  });

  it("coffee-less row with a live session links to the session, never a coffee", () => {
    const d = historyDisplay({
      coffeeId: null,
      coffee: null,
      session,
      snapshot: { sampleLabel: "Muestra A" },
    });
    expect(d.kind).toBe("label_only");
    expect(d.labelReason).toBe("unassigned");
    expect(d.linksToCoffee).toBe(false);
    expect(d.sessionId).toBe("s1");
    expect(d.sessionName).toBe("Cata del lunes");
  });

  it("session gone and no snapshot: names are null, nothing throws", () => {
    const d = historyDisplay({ coffeeId: null, coffee: null, session: null, snapshot: null });
    expect(d.sessionName).toBeNull();
    expect(d.sampleLabel).toBeNull();
  });

  it("isCoffeeRow excludes label-only rows from coffee counts", () => {
    expect(isCoffeeRow({ coffeeId: "c1" })).toBe(true);
    expect(isCoffeeRow({ coffeeId: null })).toBe(false);
  });
});
