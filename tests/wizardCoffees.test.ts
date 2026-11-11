import { describe, expect, it } from "vitest";
import { pruneUnreferencedCoffees } from "@/lib/wizardCoffees";

describe("pruneUnreferencedCoffees", () => {
  it("drops unused cards and remaps indexes", () => {
    const r = pruneUnreferencedCoffees(
      [{ n: "a" }, { n: "unused" }, { n: "c" }],
      [{ label: "A", coffeeIdx: 0 }, { label: "B", coffeeIdx: 2 }, { label: "C", coffeeIdx: 2 }],
    );
    expect(r.coffees).toEqual([{ n: "a" }, { n: "c" }]);
    expect(r.samples.map((s) => s.coffeeIdx)).toEqual([0, 1, 1]);
  });

  it("keeps everything when everything is referenced", () => {
    const r = pruneUnreferencedCoffees([{ n: "a" }, { n: "b" }], [{ coffeeIdx: 1 }, { coffeeIdx: 0 }]);
    expect(r.coffees).toHaveLength(2);
    expect(r.samples.map((s) => s.coffeeIdx)).toEqual([1, 0]);
  });

  it("leaves bad indexes for the validator and tolerates non-arrays", () => {
    const r = pruneUnreferencedCoffees([{ n: "a" }], [{ coffeeIdx: 7 }, {}]);
    expect(r.coffees).toEqual([]);
    expect(r.samples).toEqual([{ coffeeIdx: 7 }, {}]);
    const bad = pruneUnreferencedCoffees(null as never, undefined as never);
    expect(bad.coffees).toBeNull();
  });
});
