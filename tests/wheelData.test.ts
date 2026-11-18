import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ACIDITY_CATA,
  FLAVOR_WHEEL,
  MAIN_TASTES,
  MOUTHFEEL_CATA,
  SWEETNESS_CATA,
} from "@/lib/constants";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import { compareGeometry, wheelGeometry } from "@/lib/flavorWheel";
import { FLAVOR_WHEEL_MIN_N } from "@/lib/scoreContext";
import {
  WHEEL_ID_KEYS,
  buildOwnWheelData,
  buildWheelData,
  formatHasWheel,
  wheelCompareInput,
  wheelIdsOf,
  type WheelData,
  type WheelEvaluation,
} from "@/lib/reports/wheelData";
import { HEAVY_TEST_TIMEOUT_MS } from "./helpers/timeouts";

// Package R1c: the data behind a coffee's flavour wheel
// (docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, sections 3, 4, 6 and 6b).

const BLACKBERRY = "fruity:berry:blackberry";
const RASPBERRY = "fruity:berry:raspberry";
const JASMINE = "floral:floral:jasmine";

const ev = (cupperKey: string, data: unknown, flags: Partial<WheelEvaluation> = {}): WheelEvaluation => ({
  cupperKey,
  excluded: false,
  submitted: true,
  data,
  ...flags,
});
const group = (evaluations: WheelEvaluation[], more: { ownerLens?: boolean; viewerData?: unknown; format?: string } = {}) =>
  buildWheelData({ format: more.format ?? "combined", evaluations, ownerLens: more.ownerLens ?? false, viewerData: more.viewerData });
const ok = (w: WheelData) => {
  if (w.status !== "ok") throw new Error(`expected ok, got ${w.status}`);
  return w;
};

describe("which ids are read", () => {
  it("only the four flavour keys of the module", () => {
    expect([...WHEEL_ID_KEYS]).toEqual(["fragancia_desc", "aroma_desc", "sabor_desc", "sabor_residual_desc"]);
    expect(
      wheelIdsOf({
        fragancia_desc: [JASMINE],
        aroma_desc: [JASMINE, "sweet:brown_sugar:honey"],
        sabor_desc: [BLACKBERRY],
        sabor_residual_desc: ["roasted"],
        gustos: ["sweet", "sour"],
        acidez_desc: ["acidity:winey"],
        dulzor_desc: ["sweetness:honey"],
        sensacion_desc: ["mouthfeel:rough"],
      }).sort(),
    ).toEqual([BLACKBERRY, JASMINE, "roasted", "sweet:brown_sugar:honey"].sort());
    for (const junk of [null, undefined, "x", 3, [], [{ sabor_desc: [BLACKBERRY] }]]) {
      expect(wheelIdsOf(junk)).toEqual([]);
    }
  });

  it("THE SWEET TRAP: a cupper who picked the main taste 'sweet' and no flavour is not in the Dulce family", () => {
    expect(MAIN_TASTES.some((t) => t.id === "sweet")).toBe(true);
    expect(FLAVOR_WHEEL.some((n) => n.id === "sweet" && n.level === 1)).toBe(true);
    const tasteOnly = { gustos: ["sweet"], dulzor_desc: ["sweetness:honey"] };
    const w = ok(
      group([
        ev("a", tasteOnly),
        ev("b", tasteOnly),
        ev("c", { ...tasteOnly, sabor_desc: [BLACKBERRY] }),
      ]),
    );
    expect(w.n).toBe(3); // they cupped the coffee: they are part of n
    expect(w.rollup.sweet).toBeUndefined();
    expect(w.direct.sweet).toBeUndefined();
    expect(w.rollup).toEqual({ fruity: 1, "fruity:berry": 1, [BLACKBERRY]: 1 });
    expect(wheelGeometry(w.rollup, w.n).petals.find((p) => p.family === "sweet")).toMatchObject({ count: 0, d: null });
  });

  it("the trap is real in today's 'general' block, which is why it is not the source", () => {
    const freq = computeSampleBlockFrequencies({
      format: "combined",
      samples: [{ id: "s", label: "S" }],
      evals: [{ cupperId: "a", sessionSampleId: "s", descriptiveData: null, combinedData: { gustos: ["sweet"] } }],
      excludedUserIds: new Set(),
      blockLabel: (id) => id,
      locale: "es",
    })!;
    // today: the main taste and the family share one entry of the general list
    expect(freq[0].blocks.general.find((d) => d.id === "sweet")?.count).toBe(1);
    expect(ok(group([ev("a", { gustos: ["sweet"] })], { ownerLens: true })).direct).toEqual({});
  });

  it("the Dulce family counts when a cupper picked it on the wheel", () => {
    const w = ok(group([ev("a", { aroma_desc: ["sweet"] }), ev("b", { sabor_desc: ["sweet:brown_sugar:honey"] }), ev("c", {})]));
    expect(w.rollup.sweet).toBe(2);
    expect(w.direct).toEqual({ sweet: 1, "sweet:brown_sugar:honey": 1 });
  });

  it("a wheel id stored outside the flavour keys is not read either", () => {
    const w = ok(group([ev("a", { acidez_desc: [BLACKBERRY], dulzor_desc: ["sweet"], gustos: ["floral"] })], { ownerLens: true }));
    expect(w).toMatchObject({ n: 1, direct: {}, rollup: {} });
  });
});

describe("people, not mentions", () => {
  it("a cupper counts once per node and once per family, across the four sections", () => {
    const w = ok(
      group([
        ev("a", { fragancia_desc: [BLACKBERRY], aroma_desc: [BLACKBERRY], sabor_desc: [BLACKBERRY, RASPBERRY] }),
        ev("b", { sabor_residual_desc: [RASPBERRY] }),
        ev("c", { sabor_desc: [JASMINE] }),
      ]),
    );
    expect(w.n).toBe(3);
    expect(w.direct).toEqual({ [JASMINE]: 1, [BLACKBERRY]: 1, [RASPBERRY]: 2 });
    expect(w.rollup.fruity).toBe(2);
    expect(w.rollup["fruity:berry"]).toBe(2);
    expect(w.rollup.floral).toBe(1);
  });

  it("two rows with the same cupper key are one person", () => {
    const w = ok(group([ev("a", { sabor_desc: [BLACKBERRY] }), ev("a", { aroma_desc: [BLACKBERRY, JASMINE] })], { ownerLens: true }));
    expect(w.n).toBe(1);
    expect(w.direct).toEqual({ [JASMINE]: 1, [BLACKBERRY]: 1 });
  });

  it("retired ids are migrated before counting; a legacy free text counts under Otros and is not returned", () => {
    const w = ok(
      group([
        ev("a", { aroma_desc: ["sweet:vanilla"], sabor_desc: ["sweet:sweet_aromatics"] }), // one node, one person
        ev("b", { sabor_desc: ["unmapped:lulo de mi finca"], sabor_desc_notes: { other: ["lulo de mi finca"] } }),
        ev("c", { sabor_desc: ["green_veg:dried:hay_like"] }),
      ]),
    );
    expect(w.direct).toEqual({ "green_veg:fresh:hay_like": 1, "sweet:sweet_aromatics": 1, other: 1 });
    expect(w.rollup.sweet).toBe(1);
    expect(w.rollup.green_veg).toBe(1);
    expect(JSON.stringify(w)).not.toContain("lulo");
    expect(JSON.stringify(w)).not.toContain("vanilla");
  });

  it("no count is ever larger than n", () => {
    const all = FLAVOR_WHEEL.map((n) => n.id);
    const w = ok(group([ev("a", { sabor_desc: all }), ev("b", { aroma_desc: all }), ev("c", { fragancia_desc: all }), ev("d", {})]));
    expect(w.n).toBe(4);
    for (const c of [...Object.values(w.direct), ...Object.values(w.rollup)]) expect(c).toBe(3);
  });
});

describe("who counts", () => {
  const picks = { sabor_desc: [BLACKBERRY] };

  it("a draft never counts, an excluded cupper never counts", () => {
    const w = ok(
      group([
        ev("a", picks),
        ev("b", picks),
        ev("c", picks),
        ev("draft", picks, { submitted: false }),
        ev("out", picks, { excluded: true }),
        ev("both", picks, { submitted: false, excluded: true }),
      ]),
    );
    expect(w.n).toBe(3);
    expect(w.direct[BLACKBERRY]).toBe(3);
  });

  it("a cupper who sent an evaluation with no flavour is part of n; a row with no module is not", () => {
    const w = ok(group([ev("a", picks), ev("b", {}), ev("c", { sabor_desc: [] }), ev("d", null), ev("e", "junk")]));
    expect(w.n).toBe(3);
    expect(w.direct[BLACKBERRY]).toBe(1);
  });

  it("a declared partial evaluation and a pinned reference count like any other, as today", () => {
    const partial = { sabor_desc: [BLACKBERRY], acidez_af_ne: true, sabor_af_final: 7 };
    const pinned = { sabor_desc: [JASMINE], fragancia_af_final: 5, sabor_af_final: 5, ref_previo: { at: "x", valores: {} } };
    const w = ok(group([ev("a", partial), ev("b", pinned), ev("c", picks)]));
    expect(w.n).toBe(3);
    expect(w.direct).toEqual({ [JASMINE]: 1, [BLACKBERRY]: 2 });
  });
});

describe("the gate, for a participant and for the owner", () => {
  const panelOf = (n: number) =>
    Array.from({ length: n }, (_, i) => ev(`cupper-${i}`, { sabor_desc: [i === 0 ? JASMINE : BLACKBERRY] }));

  it("a participant gets nothing but the number with fewer than three cuppers", () => {
    expect(FLAVOR_WHEEL_MIN_N).toBe(3);
    for (const n of [0, 1, 2]) {
      const w = group(panelOf(n), { viewerData: { sabor_desc: [JASMINE] } });
      expect(w).toEqual({ status: "too_few", included: n });
      expect(Object.keys(w).sort()).toEqual(["included", "status"]);
    }
  });

  it("a participant gets the counts from three", () => {
    const w = ok(group(panelOf(3)));
    expect(w).toMatchObject({ status: "ok", scope: "group", n: 3 });
    expect(w.direct).toEqual({ [JASMINE]: 1, [BLACKBERRY]: 2 });
    expect(ok(group(panelOf(7))).n).toBe(7);
  });

  it("drafts and excluded cuppers do not open the gate", () => {
    const rows = [...panelOf(2), ev("draft", {}, { submitted: false }), ev("out", {}, { excluded: true })];
    expect(group(rows)).toEqual({ status: "too_few", included: 2 });
  });

  it("the owner's lens is not restricted, as with today's descriptor frequencies", () => {
    for (const n of [0, 1, 2, 3]) {
      const w = ok(group(panelOf(n), { ownerLens: true }));
      expect(w.n).toBe(n);
      expect(w.scope).toBe("group");
    }
    expect(ok(group(panelOf(2), { ownerLens: true })).direct).toEqual({ [JASMINE]: 1, [BLACKBERRY]: 1 });
  });
});

describe("formats", () => {
  it("an affective session has no wheel: an explicit result, never an empty wheel", () => {
    const rows = [ev("a", { sabor_desc: [BLACKBERRY] }), ev("b", {}), ev("c", {})];
    const none = { status: "no_wheel", reason: "affective_format" };
    expect(group(rows, { format: "affective" })).toEqual(none);
    expect(group(rows, { format: "affective", ownerLens: true })).toEqual(none);
    expect(buildOwnWheelData({ format: "affective", data: { sabor_desc: [BLACKBERRY] } })).toEqual(none);
    expect(group(rows, { format: "something-else" })).toEqual(none);
  });

  it("descriptive and combined have one", () => {
    expect(["descriptive", "combined", "affective"].map(formatHasWheel)).toEqual([true, true, false]);
    expect(group([ev("a", {}), ev("b", {}), ev("c", {})], { format: "descriptive" }).status).toBe("ok");
  });
});

describe("the viewer's own marks", () => {
  it("'tú': the nodes the viewer picked, migrated, in the wheel's order", () => {
    const rows = [ev("a", {}), ev("b", {}), ev("c", {})];
    const w = ok(group(rows, { viewerData: { sabor_desc: ["sweet:vanilla", BLACKBERRY], aroma_desc: [JASMINE, BLACKBERRY], gustos: ["sweet"] } }));
    expect(w.mine).toEqual([JASMINE, BLACKBERRY, "sweet:sweet_aromatics"]);
    expect(ok(group(rows)).mine).toBeNull();
    expect(ok(group(rows, { viewerData: {} })).mine).toEqual([]);
  });

  it("the viewer's module adds nothing to the counts", () => {
    const rows = [ev("a", {}), ev("b", {}), ev("c", {})];
    const w = ok(group(rows, { viewerData: { sabor_desc: [BLACKBERRY] } }));
    expect(w).toMatchObject({ n: 3, direct: {}, rollup: {} });
  });

  it("solo, or my own marks before the close: one person, no gate", () => {
    const w = ok(buildOwnWheelData({ format: "descriptive", data: { sabor_desc: [BLACKBERRY], gustos: ["sweet"] } }));
    expect(w).toEqual({
      status: "ok",
      scope: "own",
      n: 1,
      direct: { [BLACKBERRY]: 1 },
      rollup: { fruity: 1, "fruity:berry": 1, [BLACKBERRY]: 1 },
      mine: [BLACKBERRY],
    });
    expect(buildOwnWheelData({ format: "combined", data: null })).toEqual({
      status: "ok",
      scope: "own",
      n: 0,
      direct: {},
      rollup: {},
      mine: [],
    });
  });
});

describe("the comparison's input", () => {
  const wheel = (rows: WheelEvaluation[], ownerLens = false) => group(rows, { ownerLens });
  const three = (id: string) => [ev("a", { sabor_desc: [id] }), ev("b", { sabor_desc: [id] }), ev("c", {})];
  const G = { id: "G", wheel: wheel(three(BLACKBERRY)) };
  const C = { id: "C", wheel: wheel(three(JASMINE)) };
  const D = { id: "D", wheel: wheel([...three("roasted"), ev("d", {})]) };
  const FEW = { id: "X", wheel: wheel(three(JASMINE).slice(0, 2)) };

  it("is refused while the session is not closed, whatever it is given", () => {
    expect(wheelCompareInput({ closed: false, samples: [G, C, D] })).toEqual({ status: "not_closed" });
    expect(wheelCompareInput({ closed: false, samples: [G, C], baseId: "G" })).toEqual({ status: "not_closed" });
    expect(wheelCompareInput({ closed: false, samples: [] })).toEqual({ status: "not_closed" });
  });

  it("alone: every coffee is a territory, in the order given, with its own n", () => {
    const r = wheelCompareInput({ closed: true, samples: [G, C, D] });
    expect(r).toEqual({
      status: "ok",
      base: null,
      others: [
        { id: "G", counts: { fruity: 2, "fruity:berry": 2, [BLACKBERRY]: 2 }, n: 3 },
        { id: "C", counts: { floral: 2, "floral:floral": 2, [JASMINE]: 2 }, n: 3 },
        { id: "D", counts: { roasted: 2 }, n: 4 },
      ],
      skipped: [],
    });
    if (r.status !== "ok") throw new Error("unreachable");
    const g = compareGeometry({ base: r.base, others: r.others });
    expect(g.territories.map((t) => t.id)).toEqual(["G", "C", "D"]);
    expect(g.n).toBe(4);
  });

  it("over a coffee's petals: that coffee is the base, wherever it is in the list", () => {
    const r = wheelCompareInput({ closed: true, samples: [C, G, D], baseId: "G" });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.base?.id).toBe("G");
    expect(r.others.map((s) => s.id)).toEqual(["C", "D"]);
    const g = compareGeometry({ base: r.base, others: r.others });
    expect(g.petals.filter((p) => p.d !== null).map((p) => p.family)).toEqual(["fruity"]);
    expect(g.table.series.map((s) => s.role)).toEqual(["petals", "territory", "territory"]);
  });

  it("a coffee with too few cuppers is left out and named, and carries no count", () => {
    const r = wheelCompareInput({ closed: true, samples: [G, FEW, C] });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.others.map((s) => s.id)).toEqual(["G", "C"]);
    expect(r.skipped).toEqual([{ id: "X", reason: "too_few" }]);
  });

  it("says so when the base itself has nothing to show", () => {
    expect(wheelCompareInput({ closed: true, samples: [FEW, G], baseId: "X" })).toEqual({ status: "base_unavailable", reason: "too_few" });
    expect(wheelCompareInput({ closed: true, samples: [G, C], baseId: "Z" })).toEqual({ status: "base_unavailable", reason: "missing" });
  });

  it("an affective session has nothing to compare", () => {
    const aff = (id: string) => ({ id, wheel: group([], { format: "affective" }) });
    expect(wheelCompareInput({ closed: true, samples: [aff("A"), aff("B")] })).toEqual({ status: "no_wheel", reason: "affective_format" });
    expect(wheelCompareInput({ closed: true, samples: [] })).toEqual({ status: "ok", base: null, others: [], skipped: [] });
  });
});

// ── Generated sessions ───────────────────────────────────────────────────────

function generator(seed0: number) {
  let seed = seed0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  const some = <T,>(list: readonly T[], max: number) => Array.from({ length: Math.floor(rnd() * (max + 1)) }, () => pick(list));
  return { rnd, pick, some };
}
const WHEEL_IDS = FLAVOR_WHEEL.map((n) => n.id);
const subIds = (sets: readonly { id: string; subItems: readonly { id: string }[] }[]) =>
  sets.flatMap((f) => [f.id, ...f.subItems.map((s) => s.id)]);
const ACIDITY_IDS = subIds(ACIDITY_CATA);
const SWEETNESS_IDS = subIds(SWEETNESS_CATA);
const MOUTHFEEL_IDS = subIds(MOUTHFEEL_CATA);
const TASTE_IDS = MAIN_TASTES.map((t) => t.id);

/** A module as the form writes it: wheel ids in the flavour keys, the other sets in theirs. */
function moduleOf(g: ReturnType<typeof generator>, secret: string) {
  return {
    fragancia_desc: g.some(WHEEL_IDS, 3),
    aroma_desc: g.some(WHEEL_IDS, 3),
    sabor_desc: g.some(WHEEL_IDS, 4),
    sabor_residual_desc: g.some(WHEEL_IDS, 2),
    gustos: g.some(TASTE_IDS, 2),
    acidez_desc: g.some(ACIDITY_IDS, 2),
    dulzor_desc: g.some(SWEETNESS_IDS, 2),
    sensacion_desc: g.some(MOUTHFEEL_IDS, 2),
    sabor_desc_notes: { fruity: [`nota de ${secret}`] },
    sabor_notas: `escrito por ${secret}`,
    sabor_af_final: 1 + Math.floor(g.rnd() * 9),
  };
}

describe("agrees with today's descriptor frequencies", () => {
  it("n is today's totalEvaluators and every family and sub-family count is today's roll-up", () => {
    const g = generator(20261116);
    for (let run = 0; run < 120; run++) {
      const cuppers = Array.from({ length: Math.floor(g.rnd() * 9) }, (_, i) => ({
        id: `u${i}`,
        excluded: g.rnd() < 0.15,
        submitted: g.rnd() < 0.85,
        data: moduleOf(g, `u${i}`),
      }));
      const today = computeSampleBlockFrequencies({
        format: "combined",
        samples: [{ id: "s", label: "S" }],
        // the page loads the evaluations with isDraft: false
        evals: cuppers.filter((c) => c.submitted).map((c) => ({ cupperId: c.id, sessionSampleId: "s", descriptiveData: null, combinedData: c.data })),
        excludedUserIds: new Set(cuppers.filter((c) => c.excluded).map((c) => c.id)),
        blockLabel: (id) => id,
        locale: "es",
      })![0];
      const mine = ok(
        buildWheelData({
          format: "combined",
          evaluations: cuppers.map((c) => ({ cupperKey: c.id, excluded: c.excluded, submitted: c.submitted, data: c.data })),
          ownerLens: true,
        }),
      );
      expect(mine.n, `run ${run}`).toBe(today.totalEvaluators);
      const rolled = new Map((today.rollup?.general ?? []).map((r) => [r.id, r.count]));
      for (const node of FLAVOR_WHEEL) {
        if (node.level === 3) continue;
        expect(mine.rollup[node.id] ?? 0, `run ${run}, ${node.id}`).toBe(rolled.get(node.id) ?? 0);
      }
      // the descriptors: today's general list, except the one id the two vocabularies share
      const general = new Map(today.blocks.general.map((d) => [d.id, d.count]));
      for (const id of WHEEL_IDS) {
        if (id === "sweet") expect(general.get(id) ?? 0).toBeGreaterThanOrEqual(mine.direct[id] ?? 0);
        else expect(mine.direct[id] ?? 0, `run ${run}, ${id}`).toBe(general.get(id) ?? 0);
      }
    }
  }, HEAVY_TEST_TIMEOUT_MS);
});

describe("nothing that identifies a person", () => {
  const ALLOWED_KEYS = new Set(["status", "reason", "included", "scope", "n", "direct", "rollup", "mine", "base", "others", "skipped", "id", "counts"]);
  const NODE_IDS = new Set(WHEEL_IDS);

  it("the returned objects, serialised, hold no cupper key, name or free text, for any input", () => {
    const g = generator(99);
    for (let run = 0; run < 150; run++) {
      const keys = Array.from({ length: Math.floor(g.rnd() * 8) }, (_, i) => `cupper-${run}-${i}-9f3a7c21`);
      const names = keys.map((_, i) => `Nombre Apellido ${run}_${i}`);
      const evaluations = keys.map((cupperKey, i) => ({
        cupperKey,
        excluded: g.rnd() < 0.2,
        submitted: g.rnd() < 0.8,
        data: { ...moduleOf(g, names[i]), cupperId: cupperKey, displayName: names[i], sabor_desc_extra: [cupperKey] },
        // fields a caller might leave on the row by accident
        cupperId: cupperKey,
        displayName: names[i],
        email: `persona${i}@ejemplo.test`,
      }));
      const viewerData = keys.length ? evaluations[0].data : null;
      const outputs: unknown[] = [];
      const wheels = (["combined", "descriptive", "affective"] as const).flatMap((format) =>
        [true, false].map((ownerLens) => buildWheelData({ format, evaluations, ownerLens, viewerData })),
      );
      outputs.push(...wheels, buildOwnWheelData({ format: "combined", data: viewerData }));
      const samples = wheels.map((wheel, i) => ({ id: `M${i}`, wheel }));
      outputs.push(
        wheelCompareInput({ closed: true, samples }),
        wheelCompareInput({ closed: true, samples, baseId: "M0" }),
        wheelCompareInput({ closed: false, samples }),
      );

      const json = JSON.stringify(outputs);
      for (const key of keys) expect(json).not.toContain(key);
      for (const name of names) expect(json).not.toContain(name);
      expect(json).not.toMatch(/Nombre|Apellido|persona\d|ejemplo\.test|cupper-|nota de|escrito por/);

      // shape: known keys only, and every counted id is a wheel node. The walk
      // visits a few thousand values per run: it COLLECTS what is wrong and the
      // run asserts once (one `expect` per value made this test take 4 s and
      // time out under load; the checks and the 150 runs are the same).
      const wrong: string[] = [];
      const walk = (v: unknown, parent?: string) => {
        if (Array.isArray(v)) v.forEach((x) => walk(x, parent));
        else if (v && typeof v === "object") {
          for (const [k, x] of Object.entries(v)) {
            if (parent === "direct" || parent === "rollup" || parent === "counts") {
              if (!NODE_IDS.has(k)) wrong.push(`${parent}: "${k}" is not a wheel node`);
              if (typeof x !== "number") wrong.push(`${parent}.${k}: ${typeof x}, not a number`);
            } else {
              if (!ALLOWED_KEYS.has(k)) wrong.push(`key "${k}" is not allowed`);
              walk(x, k);
            }
          }
        } else if (typeof v === "string" && parent === "mine") {
          if (!NODE_IDS.has(v)) wrong.push(`mine: "${v}" is not a wheel node`);
        }
      };
      walk(outputs);
      expect(wrong, `run ${run}`).toEqual([]);
    }
  });

  it("the file imports nothing that knows a person", () => {
    const src = readFileSync(path.resolve(__dirname, "..", "lib/reports/wheelData.ts"), "utf8");
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["@/lib/descriptors", "@/lib/flavorWheel", "@/lib/scoreContext"]);
    expect(src).not.toMatch(/displayName|email|prisma|server-only/);
  });
});

describe("the page and the PDF agree", () => {
  it("the same evaluations in another order, with their keys in another order, give byte-identical output", () => {
    const g = generator(7);
    for (let run = 0; run < 40; run++) {
      const evaluations = Array.from({ length: 3 + Math.floor(g.rnd() * 6) }, (_, i) => ev(`k${i}`, moduleOf(g, "x"), { excluded: g.rnd() < 0.1 }));
      const reversedKeys = (data: unknown) => Object.fromEntries(Object.entries(data as Record<string, unknown>).reverse());
      const shuffled = [...evaluations].reverse().map((e) => ({ ...e, data: reversedKeys(e.data) }));
      const a = buildWheelData({ format: "combined", evaluations, ownerLens: false, viewerData: evaluations[0].data });
      const b = buildWheelData({ format: "combined", evaluations: shuffled, ownerLens: false, viewerData: reversedKeys(evaluations[0].data) });
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect(JSON.stringify(buildWheelData({ format: "combined", evaluations, ownerLens: false, viewerData: evaluations[0].data }))).toBe(JSON.stringify(a));
    }
  });
});
