// S10 WP1c: the coffee's lifetime score, read through the REAL loader (the Prisma
// query of lib/coffees/aggregateSamples.ts) and the pure function. Open sessions,
// unrevealed samples, excluded cuppers and anchor references must move nothing.
// TODO(kim-validar:A2)
import { beforeEach, describe, expect, it } from "vitest";

import { loadCoffeeAggregateSamples } from "@/lib/coffees/aggregateSamples";
import { computeCoffeeLifetimeScore } from "@/lib/coffeeLifetimeScore";
import { affectiveData, makeCoffee, makeEvaluation, makeSession, makeUser, prisma, resetDb } from "./support/db";

beforeEach(resetDb);

async function lifetimeFor(coffeeId: string, userId: string) {
  const samples = await loadCoffeeAggregateSamples(coffeeId, { userId, isAdmin: false });
  return { samples, result: computeCoffeeLifetimeScore(samples.map((s) => s.lifetime)) };
}

const flags = (...idx: number[]) => [0, 1].map((i) => idx.includes(i));

describe("coffee lifetime score through the real loader", () => {
  it("counts closed + revealed + included data only", async () => {
    const owner = await makeUser({ name: "Duena" });
    const p1 = await makeUser({ name: "Uno" });
    const p2 = await makeUser({ name: "Dos" });
    const coffee = await makeCoffee(owner);

    // Session A: closed, group, 2 cups. owner flags 1 moldy defective cup; p2 is excluded.
    const a = await makeSession({
      ownerId: owner, isGroup: true, cupsPerSample: 2, status: "closed",
      participants: [p1, p2], samples: [{ coffeeId: coffee.id, revealed: true }],
    });
    await prisma.sessionParticipant.updateMany({
      where: { sessionId: a.id, userId: p2 },
      data: { excludedFromResults: true },
    });
    const sa = a.samples[0];
    await makeEvaluation({
      sampleId: sa.id, sessionId: a.id, cupperId: owner, cupsPerSample: 2,
      data: { ...affectiveData(7), tazas_defecto_tipo: ["moldy", null] },
      nonUniform: flags(0), defective: flags(0),
    });
    await makeEvaluation({ sampleId: sa.id, sessionId: a.id, cupperId: p1, cupsPerSample: 2, values: 7 });
    // excluded cupper: would drag the base to 1 and add two defective cups
    await makeEvaluation({
      sampleId: sa.id, sessionId: a.id, cupperId: p2, cupsPerSample: 2, values: 1,
      nonUniform: flags(0, 1), defective: flags(0, 1),
    });

    // Session B: closed, solo-style, 2 cups; one evaluation stored before the cups column (cups NULL).
    const b = await makeSession({
      ownerId: owner, isGroup: true, cupsPerSample: 2, status: "closed",
      participants: [p1], samples: [{ coffeeId: coffee.id, revealed: true }],
    });
    const sb = b.samples[0];
    await makeEvaluation({ sampleId: sb.id, sessionId: b.id, cupperId: owner, cupsPerSample: 2, values: 9 });
    await makeEvaluation({
      sampleId: sb.id, sessionId: b.id, cupperId: p1, cupsPerSample: 2, values: 9,
      overrides: { cups: null },
    });

    // Open session with the same coffee: must move nothing.
    const open = await makeSession({
      ownerId: owner, cupsPerSample: 2, status: "active", samples: [{ coffeeId: coffee.id, revealed: true }],
    });
    await makeEvaluation({
      sampleId: open.samples[0].id, sessionId: open.id, cupperId: owner, cupsPerSample: 2, values: 1,
      nonUniform: flags(0, 1), defective: flags(0, 1),
    });

    // Closed session, sample NOT revealed: must move nothing.
    const hidden = await makeSession({
      ownerId: owner, cupsPerSample: 2, status: "closed", samples: [{ coffeeId: coffee.id, revealed: false }],
    });
    await makeEvaluation({
      sampleId: hidden.samples[0].id, sessionId: hidden.id, cupperId: owner, cupsPerSample: 2, values: 1,
      nonUniform: flags(0, 1), defective: flags(0, 1),
    });

    const { samples, result } = await lifetimeFor(coffee.id, owner);
    expect(samples).toHaveLength(2);
    // 4 included evaluations x 2 cups = 8 cups, 1 defective + 1 non-uniform cup:
    // (4 + 2) x 5/8 = 3.75; base = mean of 7,7,9,9 -> 0.65625 x 64 + 52.75 = 94.75
    expect(result.voices).toBe(4);
    expect(result.cups).toBe(8);
    expect(result.sessions).toBe(2);
    expect(result.base).toBeCloseTo(94.75, 10);
    expect(result.deduction).toBe(3.75);
    expect(result.score).toBe(91);
    expect(result.indicative).toBe(false);
    expect(result.tally.defective).toBe(1);
    expect(result.tally.byType.moldy).toBe(1);
    expect(result.tally.unspecified).toBe(0);
    expect(result.tally.nonUniform).toBe(1);
    expect(result.tally.foundBy).toBe(1);

    // The value handed on carries no profile id.
    const json = JSON.stringify(result);
    for (const id of [owner, p1, p2]) expect(json).not.toContain(id);
    expect(JSON.stringify(samples)).not.toContain(p2);
  });

  it("an anchor-mode reference sample is out; a free-mode one is in", async () => {
    const owner = await makeUser({ name: "Duena" });
    const coffee = await makeCoffee(owner);
    const s = await makeSession({
      ownerId: owner, cupsPerSample: 2, status: "closed",
      samples: [{ coffeeId: coffee.id, revealed: true }],
    });
    await prisma.sessionSample.update({ where: { id: s.samples[0].id }, data: { referenceRank: 1 } });
    await makeEvaluation({
      sampleId: s.samples[0].id, sessionId: s.id, cupperId: owner, cupsPerSample: 2, values: 7,
      nonUniform: flags(0), defective: flags(0),
    });

    const anchor = await lifetimeFor(coffee.id, owner);
    expect(anchor.result.voices).toBe(0);
    expect(anchor.result.cups).toBe(0);
    expect(anchor.result.score).toBeNull();

    await prisma.cuppingSession.update({ where: { id: s.id }, data: { referenceMode: "free" } });
    const free = await lifetimeFor(coffee.id, owner);
    expect(free.result.voices).toBe(1);
    expect(free.result.cups).toBe(2);
    expect(free.result.deduction).toBe(6);
    expect(free.result.score).toBe(0.65625 * 56 + 52.75 - 6);
  });

  it("a quick impression (1 cup per sample) feeds cups and defects but not the base", async () => {
    const owner = await makeUser({ name: "Duena" });
    const coffee = await makeCoffee(owner);
    const s = await makeSession({
      ownerId: owner, cupsPerSample: 1, status: "closed",
      samples: [{ coffeeId: coffee.id, revealed: true }],
    });
    await makeEvaluation({
      sampleId: s.samples[0].id, sessionId: s.id, cupperId: owner, cupsPerSample: 1,
      data: { ...affectiveData(9), tazas_defecto_tipo: ["phenolic"] },
      nonUniform: [false], defective: [true],
    });
    const { result } = await lifetimeFor(coffee.id, owner);
    expect(result.score).toBeNull();
    expect(result.cups).toBe(1);
    expect(result.tally.byType.phenolic).toBe(1);
    expect(result.deduction).toBe(4);
    expect(result.indicative).toBe(true);
  });
});
