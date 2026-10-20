import { describe, it, expect } from "vitest";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import { buildFlavorCloud, buildTasterCloud, sharedLabelKeys, ALL_BLOCK_IDS, capWords } from "@/lib/wordCloud";
import { FLAVOR_WHEEL } from "@/lib/constants";

const leaves = FLAVOR_WHEEL.filter((n) => n.level === 3);
const [A, B, C] = [leaves[0], leaves[1], leaves[2]];

const ev = (cupperId: string, data: Record<string, unknown>, sample = "s1") => ({
  cupperId,
  sessionSampleId: sample,
  descriptiveData: data,
  combinedData: null,
});

function freq(evals: ReturnType<typeof ev>[]) {
  return computeSampleBlockFrequencies({
    format: "descriptive",
    samples: [{ id: "s1", label: "S1" }],
    evals,
    excludedUserIds: new Set(),
    blockLabel: (id) => id,
    locale: "es",
  })!;
}

describe("stages aggregation", () => {
  it("counts cuppers per stage without cross-stage dedupe", () => {
    const f = freq([
      ev("u1", { fragancia_desc: [A.id], aroma_desc: [A.id] }),
      ev("u2", { fragancia_desc: [A.id] }),
    ]);
    const stages = f[0].stages!;
    expect(stages.fragancia.find((d) => d.id === A.id)?.count).toBe(2);
    expect(stages.aroma.find((d) => d.id === A.id)?.count).toBe(1);
    // blocks stay deduped per cupper (additive field only)
    expect(f[0].blocks.nariz.find((d) => d.id === A.id)?.count).toBe(2);
  });
});

describe("buildFlavorCloud", () => {
  it("sums stages: fragancia + aroma by two cuppers → count 2 with 1/1 breakdown", () => {
    const f = freq([ev("u1", { fragancia_desc: [A.id] }), ev("u2", { aroma_desc: [A.id] })]);
    const [w] = buildFlavorCloud(f, { kind: "session" }, ["nariz"]);
    expect(w.count).toBe(2);
    expect(w.breakdown).toEqual([
      { stageId: "fragancia", label: "Fragancia", count: 1 },
      { stageId: "aroma", label: "Aroma", count: 1 },
    ]);
  });

  it("General counts a descriptor in nariz and boca once per stage mention", () => {
    const f = freq([ev("u1", { aroma_desc: [A.id], sabor_desc: [A.id] })]);
    const [w] = buildFlavorCloud(f, { kind: "session" }, ALL_BLOCK_IDS);
    expect(w.count).toBe(2);
  });

  it("merges entries with the same label case-insensitively", () => {
    const f = freq([ev("u1", { aroma_desc: [A.id] })]);
    const f2 = JSON.parse(JSON.stringify(f));
    const ranked = f2[0].stages.aroma;
    f2[0].stages.fragancia = [{ ...ranked[0], id: "other:id", label: ranked[0].label.toUpperCase(), count: 3 }];
    const words = buildFlavorCloud(f2, { kind: "session" }, ["nariz"]);
    expect(words).toHaveLength(1);
    expect(words[0].count).toBe(4);
  });

  it("falls back to block counts when stages are absent", () => {
    const f = freq([ev("u1", { aroma_desc: [A.id] })]).map((x) => ({ ...x, stages: undefined }));
    expect(buildFlavorCloud(f as never, { kind: "session" }, ["nariz"])[0].count).toBe(1);
  });

  it("sharedLabelKeys keeps only descriptors picked by 2+ cuppers", () => {
    const f = freq([
      ev("u1", { aroma_desc: [A.id, B.id], fragancia_desc: [C.id] }),
      ev("u2", { aroma_desc: [A.id], fragancia_desc: [C.id] }),
    ]);
    const keys = sharedLabelKeys(f, { kind: "session" }, "general");
    expect(keys.has(A.label_es.toLowerCase())).toBe(true);
    expect(keys.has(B.label_es.toLowerCase())).toBe(false);
  });
});

describe("buildTasterCloud", () => {
  it("sums stages across a participant's samples", () => {
    const words = buildTasterCloud([{ fragancia_desc: [A.id], aroma_desc: [A.id] }, { aroma_desc: [A.id] }]);
    expect(words[0].count).toBe(3);
    expect(words[0].breakdown?.find((b) => b.stageId === "aroma")?.count).toBe(2);
  });
});

describe("capWords", () => {
  it("keeps the top N in order", () => {
    const w = Array.from({ length: 40 }, (_, i) => i);
    expect(capWords(w, 30)).toHaveLength(30);
    expect(capWords(w, 30)[0]).toBe(0);
    expect(capWords(w, 30)[29]).toBe(29);
    expect(capWords([1, 2], 30)).toEqual([1, 2]);
    expect(capWords(w, 0)).toEqual([]);
  });
});
