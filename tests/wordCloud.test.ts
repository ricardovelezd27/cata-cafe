import { describe, it, expect } from "vitest";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import {
  buildFlavorCloud,
  buildTasterCloud,
  sharedLabelKeys,
  wordKey,
  ALL_BLOCK_IDS,
  capWords,
} from "@/lib/wordCloud";
import { resolveDescriptor } from "@/lib/descriptors";
import {
  FLAVOR_WHEEL,
  ACIDITY_CATA,
  SWEETNESS_CATA,
  MOUTHFEEL_CATA,
  MAIN_TASTES,
} from "@/lib/constants";

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
    expect(keys.has(wordKey("flavor", A.label_es))).toBe(true);
    expect(keys.has(wordKey("flavor", B.label_es))).toBe(false);
  });
});

// A-03: acidity "Suave" and mouthfeel "Suave" are two different descriptors
// that happen to share a label. They must never be added up.
describe("descriptors that share a label across blocks (A-03)", () => {
  const ACIDITY_SOFT = "acidity:soft";
  const MOUTHFEEL_SOFT = "mouthfeel:smooth";

  it("the two ids really are different descriptors with the same label and different colours", () => {
    const a = resolveDescriptor(ACIDITY_SOFT, "es")!;
    const m = resolveDescriptor(MOUTHFEEL_SOFT, "es")!;
    expect(a.label).toBe("Suave");
    expect(m.label).toBe("Suave");
    expect(a.color).not.toBe(m.color);
  });

  const f = freq([
    ev("u1", { acidez_desc: [ACIDITY_SOFT], sensacion_desc: [MOUTHFEEL_SOFT] }),
    ev("u2", { acidez_desc: [ACIDITY_SOFT] }),
    ev("u3", { acidez_desc: [ACIDITY_SOFT], sensacion_desc: [MOUTHFEEL_SOFT] }),
    ev("u4", { sensacion_desc: [MOUTHFEEL_SOFT] }),
  ]);

  it("keeps them as two words with their own counts and colours (general scope)", () => {
    const words = buildFlavorCloud(f, { kind: "session" }, ALL_BLOCK_IDS);
    const soft = words.filter((w) => w.label === "Suave");
    expect(soft).toHaveLength(2);
    const acidity = soft.find((w) => w.id === ACIDITY_SOFT)!;
    const mouthfeel = soft.find((w) => w.id === MOUTHFEEL_SOFT)!;
    expect(acidity.count).toBe(3);
    expect(mouthfeel.count).toBe(3);
    expect(acidity.color).toBe(resolveDescriptor(ACIDITY_SOFT)!.color);
    expect(mouthfeel.color).toBe(resolveDescriptor(MOUTHFEEL_SOFT)!.color);
    expect(acidity.breakdown).toEqual([{ stageId: "acidez", label: "Acidez", count: 3 }]);
    expect(mouthfeel.breakdown).toEqual([{ stageId: "sensacion", label: "Sensación", count: 3 }]);
    // Every word has its own key and its own id (the cloud uses both).
    expect(new Set(words.map((w) => w.key)).size).toBe(words.length);
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length);
  });

  it("each block's own cloud shows only its own word", () => {
    const [a] = buildFlavorCloud(f, { kind: "session" }, ["acidez"]);
    const [m] = buildFlavorCloud(f, { kind: "session" }, ["sensacion"]);
    expect(a).toMatchObject({ id: ACIDITY_SOFT, count: 3 });
    expect(m).toMatchObject({ id: MOUTHFEEL_SOFT, count: 3 });
  });

  it("hide-singles filters each word by its own people, not by the shared label", () => {
    // Acidity "Suave": two cuppers. Mouthfeel "Suave": one cupper.
    const g = freq([
      ev("u1", { acidez_desc: [ACIDITY_SOFT], sensacion_desc: [MOUTHFEEL_SOFT] }),
      ev("u2", { acidez_desc: [ACIDITY_SOFT] }),
    ]);
    const scope = { kind: "session" } as const;
    const words = buildFlavorCloud(g, scope, ALL_BLOCK_IDS);
    const shared = sharedLabelKeys(g, scope, "general");
    const kept = words.filter((w) => shared.has(w.key));
    expect(kept.map((w) => w.id)).toEqual([ACIDITY_SOFT]);
  });

  it("flavour words named in fragancia and in sabor are still one word", () => {
    const g = freq([ev("u1", { fragancia_desc: [A.id], sabor_desc: [A.id] })]);
    const words = buildFlavorCloud(g, { kind: "session" }, ALL_BLOCK_IDS);
    expect(words).toHaveLength(1);
    expect(words[0].count).toBe(2);
  });

  it("the main taste 'sweet' and the flavour 'sweet' share an id and a label: still two words, with distinct keys", () => {
    // The one id the Gusto block and the flavour wheel have in common (the
    // cloud must key a word by `key`, never by `id`).
    const sharedIds = MAIN_TASTES.map((t) => t.id).filter((id) => FLAVOR_WHEEL.some((n) => n.id === id));
    expect(sharedIds).toEqual(["sweet"]);

    const g = freq([ev("u1", { gustos: ["sweet"], aroma_desc: ["sweet"] }), ev("u2", { gustos: ["sweet"] })]);
    const words = buildFlavorCloud(g, { kind: "session" }, ALL_BLOCK_IDS);
    const sweet = words.filter((w) => w.id === "sweet");
    expect(sweet).toHaveLength(2);
    expect(sweet.map((w) => w.count).sort()).toEqual([1, 2]);
    expect(new Set(words.map((w) => w.key)).size).toBe(words.length);
  });

  it("no id repeats inside the acidity, sweetness and mouthfeel lists", () => {
    const ids = [...ACIDITY_CATA, ...SWEETNESS_CATA, ...MOUTHFEEL_CATA].flatMap((fam) => [
      fam.id,
      ...fam.subItems.map((s) => s.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
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
