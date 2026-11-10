import { describe, expect, it } from "vitest";
import { buildLabelSnapshot, LABEL_SNAPSHOT_KEYS } from "@/lib/historySnapshot";

const session = { name: "Cata", format: "affective", date: new Date("2026-11-01T00:00:00Z"), cupsPerSample: 5 };
const ev = { descriptiveData: { a: 1 }, affectiveData: { b: 2 }, combinedData: null };
const sampleWithCoffee = {
  label: "Muestra A",
  coffeeId: "cof_1",
  coffee: { id: "cof_1", name: "Geisha Secreto", farm: "Finca X", producer: "P", origin: "Panama" },
  aggregateScore: { communityScore: 88 },
};

describe("buildLabelSnapshot anonymity", () => {
  it("never-revealed: exact key whitelist, flagged unrevealed", () => {
    const snap = buildLabelSnapshot(session, sampleWithCoffee, ev, true);
    expect(Object.keys(snap).sort()).toEqual([...LABEL_SNAPSHOT_KEYS].sort());
    expect(snap.unrevealed).toBe(true);
    expect(snap.sampleLabel).toBe("Muestra A");
  });
  it("does not leak any coffee field or score", () => {
    const json = JSON.stringify(buildLabelSnapshot(session, sampleWithCoffee, ev, true));
    for (const s of ["Geisha", "Finca", "Panama", "cof_1", "coffee", "farm", "producer", "origin", "communityScore", "88"]) {
      expect(json).not.toContain(s);
    }
  });
  it("coffee-less: same keys minus unrevealed", () => {
    const snap = buildLabelSnapshot(session, { label: "Muestra B" }, ev, false);
    expect(Object.keys(snap).sort()).toEqual(LABEL_SNAPSHOT_KEYS.filter((k) => k !== "unrevealed").sort());
  });
});
