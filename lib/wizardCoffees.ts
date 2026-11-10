// Wizard coffee cards nobody references must not become coffees (S8-10 T4,
// F-crear-sesion-9): a card the cupper added and never used used to be
// created as a "Sin nombre" coffee in their library. Pure and generic so
// vitest pins it; app/actions/sessions.ts applies it before validation, so an
// unused blank card also no longer blocks the submit.

export type CoffeeIdxSample = { coffeeIdx?: number };

/** Drops coffees no sample points at and remaps every sample's `coffeeIdx`.
 *  Samples whose index is missing / out of range are left untouched (the
 *  validator reports them). Non-array input is returned unchanged. */
export function pruneUnreferencedCoffees<C, S extends CoffeeIdxSample>(
  coffees: C[],
  samples: S[],
): { coffees: C[]; samples: S[] } {
  if (!Array.isArray(coffees) || !Array.isArray(samples)) return { coffees, samples };
  const used = new Set<number>();
  for (const s of samples) {
    if (typeof s?.coffeeIdx === "number" && Number.isInteger(s.coffeeIdx) && coffees[s.coffeeIdx] !== undefined) {
      used.add(s.coffeeIdx);
    }
  }
  const remap = new Map<number, number>();
  const kept: C[] = [];
  coffees.forEach((c, i) => {
    if (used.has(i)) {
      remap.set(i, kept.length);
      kept.push(c);
    }
  });
  return {
    coffees: kept,
    samples: samples.map((s) =>
      typeof s?.coffeeIdx === "number" && remap.has(s.coffeeIdx)
        ? { ...s, coffeeIdx: remap.get(s.coffeeIdx) }
        : s,
    ),
  };
}
