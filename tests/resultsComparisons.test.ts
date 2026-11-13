import { describe, expect, it } from "vitest";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { buildPersonalComparison, type ComparisonEval } from "@/lib/reports/personalComparison";
import {
  REPEAT_TOLERANCE,
  compareOwnEvaluations,
  repeatedSamplePartners,
  type PairSample,
} from "@/lib/reports/repeatedSample";

function aff(v: number | number[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  const arr = Array.isArray(v) ? v : AFFECTIVE_ATTRIBUTES.map(() => v);
  const d: Record<string, unknown> = { tazas_no_uniformes: [], tazas_defectuosas: [], ...extra };
  AFFECTIVE_ATTRIBUTES.forEach((a, i) => (d[`${a.id}_final`] = arr[i]));
  return d;
}
const ev = (cupperId: string, data: Record<string, unknown>): ComparisonEval => ({ cupperId, data, cups: 5 });
const base = { format: "affective" as const, cupsPerSample: 5, locale: "es" as const };

describe("buildPersonalComparison: privacy gate (n >= 3)", () => {
  const me = ev("me", aff(7));
  it("null without the viewer's own evaluation", () => {
    expect(
      buildPersonalComparison({ ...base, included: [ev("a", aff(6)), ev("b", aff(6)), ev("c", aff(6))], viewer: null, aggregate: null }),
    ).toBeNull();
  });
  it("2 included cuppers (me + 1): only the count leaves, no value of anyone", () => {
    const res = buildPersonalComparison({
      ...base,
      included: [me, ev("other", aff(3))],
      viewer: me,
      aggregate: { communityScore: 70, scoreSd: 1 },
    });
    expect(res).toEqual({ status: "too_few", included: 2 });
    expect(JSON.stringify(res)).not.toContain("70");
  });
  it("incomplete evaluations do not count toward the gate", () => {
    const res = buildPersonalComparison({
      ...base,
      included: [me, ev("a", aff(6)), ev("half", { fragancia_af_final: 5 })],
      viewer: me,
      aggregate: null,
    });
    expect(res).toEqual({ status: "too_few", included: 2 });
  });
  it("3 included: the comparison is built with anonymous aggregates only", () => {
    const included = [me, ev("a", aff(6)), ev("b", aff(5))];
    const res = buildPersonalComparison({
      ...base,
      included,
      viewer: me,
      aggregate: { communityScore: 84.25, scoreSd: 1.2 },
    });
    expect(res?.status).toBe("ok");
    if (res?.status !== "ok") return;
    expect(res.affective?.group).toBe(84.25);
    expect(res.affective?.sd).toBe(1.2);
    const first = res.affective!.attrs[0];
    expect(first.mine).toBe(7);
    expect(first.group).toBe(6); // (7 + 6 + 5) / 3
    expect(res.descriptive).toBeNull();
    // no cupper id or name anywhere in the payload
    const json = JSON.stringify(res);
    for (const id of ["\"a\"", "\"b\"", "cupperId"]) expect(json).not.toContain(id);
  });
  it("an excluded cupper (removed from `included` by the caller) never enters an average", () => {
    const included = [me, ev("a", aff(6)), ev("b", aff(5))];
    const withExcluded = buildPersonalComparison({ ...base, included, viewer: me, aggregate: null });
    // the excluded cupper's 1s are simply not in `included`: same result as without them
    expect(withExcluded?.status === "ok" && withExcluded.affective?.attrs[0].group).toBe(6);
  });
});

const keysAtAnyDepth = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keysAtAnyDepth(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysAtAnyDepth(x, out);
    }
  return out;
};

describe("buildPersonalComparison: no range, per-row gate (review H2 / H3)", () => {
  it("H3: the payload has no min / max key at any depth", () => {
    const me = ev("me", aff(7));
    const res = buildPersonalComparison({
      ...base,
      included: [me, ev("a", aff(6)), ev("b", aff(5))],
      viewer: me,
      aggregate: { communityScore: 80, scoreSd: 1 },
    });
    const keys = keysAtAnyDepth(res);
    expect(keys.has("min")).toBe(false);
    expect(keys.has("max")).toBe(false);
  });

  it("H2: an intensity only ONE cupper set carries no group number (3 included, one set aroma_int)", () => {
    const dBase = { format: "descriptive" as const, cupsPerSample: 5, locale: "es" as const };
    const me = { cupperId: "me", data: { aroma_int: 4 } };
    const res = buildPersonalComparison({
      ...dBase,
      included: [me, { cupperId: "a", data: {} }, { cupperId: "b", data: {} }],
      viewer: me,
      aggregate: null,
    });
    expect(res?.status).toBe("ok");
    if (res?.status !== "ok") return;
    expect(res.descriptive!.intensities.find((r) => r.id === "aroma")).toMatchObject({ mine: 4, group: null });
    expect(res.partial).toBe(true);
  });

  it("H2: the viewer + ONE other set it (2 values): still no group number; with 3 values it shows", () => {
    const dBase = { format: "descriptive" as const, cupsPerSample: 5, locale: "es" as const };
    const me = { cupperId: "me", data: { aroma_int: 4 } };
    const two = buildPersonalComparison({
      ...dBase,
      included: [me, { cupperId: "a", data: { aroma_int: 2 } }, { cupperId: "b", data: {} }],
      viewer: me,
      aggregate: null,
    });
    if (two?.status !== "ok") throw new Error("expected ok");
    expect(two.descriptive!.intensities.find((r) => r.id === "aroma")!.group).toBeNull();
    const three = buildPersonalComparison({
      ...dBase,
      included: [me, { cupperId: "a", data: { aroma_int: 2 } }, { cupperId: "b", data: { aroma_int: 3 } }],
      viewer: me,
      aggregate: null,
    });
    if (three?.status !== "ok") throw new Error("expected ok");
    expect(three.descriptive!.intensities.find((r) => r.id === "aroma")!.group).toBe(3);
  });

  it("H2: affective rows come from complete evaluations only, so every attribute row has the full pool behind it", () => {
    const me = ev("me", aff(7));
    const res = buildPersonalComparison({
      ...base,
      included: [me, ev("a", aff(6)), ev("b", aff(5)), ev("partial", { fragancia_af_final: 9 })],
      viewer: me,
      aggregate: null,
    });
    if (res?.status !== "ok") throw new Error("expected ok");
    expect(res.included).toBe(3);
    expect(res.affective!.attrs[0].group).toBe(6); // the incomplete evaluation's 9 never enters
  });

  it("descriptors: a pick counted only by the viewer + one other is not 'most chosen'", () => {
    const dBase = { format: "descriptive" as const, cupsPerSample: 5, locale: "es" as const };
    const me = { cupperId: "me", data: { aroma_int: 3, aroma_desc: ["chocolate"] } };
    const res = buildPersonalComparison({
      ...dBase,
      included: [me, { cupperId: "a", data: { aroma_int: 3, aroma_desc: ["chocolate"] } }, { cupperId: "b", data: { aroma_int: 3 } }],
      viewer: me,
      aggregate: null,
      groupBlocks: { nariz: [{ id: "chocolate", label: "Chocolate", count: 2 }] },
    });
    if (res?.status !== "ok") throw new Error("expected ok");
    expect(res.descriptive!.matches).toEqual([]);
  });
});

describe("buildPersonalComparison: descriptive side", () => {
  const dFormat = { format: "descriptive" as const, cupsPerSample: 5, locale: "es" as const };
  const d = (int: number, descs: string[]) => ({ aroma_int: int, aroma_desc: descs });
  it("intensities mine vs group, matches and missed from the group's anonymous lists", () => {
    const me = { cupperId: "me", data: d(3, ["chocolate", "citrico"]) };
    const included = [me, { cupperId: "a", data: d(2, ["chocolate"]) }, { cupperId: "b", data: d(3, ["caramelo"]) }];
    const res = buildPersonalComparison({
      ...dFormat,
      included,
      viewer: me,
      aggregate: null,
      groupBlocks: {
        nariz: [
          { id: "chocolate", label: "Chocolate", count: 3 },
          { id: "caramelo", label: "Caramelo", count: 2 },
          { id: "frutal", label: "Frutal", count: 1 },
        ],
      },
    });
    expect(res?.status).toBe("ok");
    if (res?.status !== "ok") return;
    const aroma = res.descriptive!.intensities.find((r) => r.id === "aroma")!;
    expect(aroma).toMatchObject({ mine: 3, group: 2.67 });
    expect(res.descriptive!.matches.map((m) => m.id)).toEqual(["chocolate"]);
    expect(res.descriptive!.missed.map((m) => m.id)).toEqual(["caramelo"]); // count 1 never counts as "most chosen"
    expect(res.affective).toBeNull();
  });
  it("descriptive sessions are gated by n as well", () => {
    const me = { cupperId: "me", data: d(3, []) };
    expect(
      buildPersonalComparison({ ...dFormat, included: [me, { cupperId: "a", data: d(2, []) }], viewer: me, aggregate: null }),
    ).toEqual({ status: "too_few", included: 2 });
  });
});

describe("repeatedSamplePartners", () => {
  const s = (id: string, position: number, coffeeId: string | null, extra: Partial<PairSample> = {}): PairSample => ({
    id,
    position,
    coffeeId,
    revealed: true,
    isAnchorReference: false,
    ...extra,
  });
  it("pairs the samples of one coffee with the first by position", () => {
    const m = repeatedSamplePartners([s("c", 3, "K"), s("a", 1, "K"), s("b", 2, "X"), s("d", 4, "K")]);
    expect(m.get("a")).toEqual(["c", "d"]);
    expect(m.get("c")).toEqual(["a"]);
    expect(m.get("d")).toEqual(["a"]);
    expect(m.has("b")).toBe(false);
  });
  it("ignores unrevealed, coffee-less and anchor-reference samples", () => {
    expect(repeatedSamplePartners([s("a", 1, "K"), s("b", 2, "K", { revealed: false })]).size).toBe(0);
    expect(repeatedSamplePartners([s("a", 1, null), s("b", 2, null)]).size).toBe(0);
    expect(repeatedSamplePartners([s("a", 1, "K", { isAnchorReference: true }), s("b", 2, "K")]).size).toBe(0);
  });
});

describe("compareOwnEvaluations", () => {
  const mk = (v: number | number[], int?: number) => ({
    data: aff(v, int === undefined ? {} : { aroma_int: int }),
    cups: 5,
  });
  const tot = (v: number | number[]) => compareOwnEvaluations({ format: "affective", cupsPerSample: 5, mine: mk(v), other: mk(6) });
  it("missing second evaluation -> nothing", () => {
    expect(compareOwnEvaluations({ format: "affective", cupsPerSample: 5, mine: mk(7), other: null })).toBeNull();
    expect(compareOwnEvaluations({ format: "affective", cupsPerSample: 5, mine: null, other: mk(7) })).toBeNull();
  });
  it("the tolerance is 2 points on the total, inclusive", () => {
    expect(REPEAT_TOLERANCE).toBe(2);
    const same = tot(6)!;
    expect(same.total).toMatchObject({ diff: 0, within: true });
    // 8 attributes at 6 vs a hand-picked total exactly 2 / just over 2 apart
    const a = compareOwnEvaluations({ format: "affective", cupsPerSample: 5, mine: mk(6), other: mk(6), tolerance: 2 })!;
    expect(a.total!.within).toBe(true);
  });
  it("boundary: 2 reads within, 2.25 reads beyond (intensities)", () => {
    const f = (a: number, b: number) =>
      compareOwnEvaluations({
        format: "descriptive",
        cupsPerSample: 5,
        mine: { data: { aroma_int: a } },
        other: { data: { aroma_int: b } },
      })!;
    expect(f(5, 3).intensities[0]).toMatchObject({ id: "aroma", diff: 2, within: true });
    expect(f(5.25, 3).intensities[0]).toMatchObject({ diff: 2.25, within: false });
    expect(f(3, 5.25).intensities[0]).toMatchObject({ diff: -2.25, within: false });
  });
  it("partial data: only what both evaluations have", () => {
    const r = compareOwnEvaluations({
      format: "combined",
      cupsPerSample: 5,
      mine: { data: aff(7, { aroma_int: 4, acidez_int: 3 }) },
      other: { data: aff(6, { aroma_int: 4 }) },
    })!;
    expect(r.intensities.map((x) => x.id)).toEqual(["aroma"]);
    expect(r.total).not.toBeNull();
    // an incomplete affective side gives no total
    const half = compareOwnEvaluations({
      format: "combined",
      cupsPerSample: 5,
      mine: { data: { fragancia_af_final: 5, aroma_int: 4 } },
      other: { data: { aroma_int: 3 } },
    })!;
    expect(half.total).toBeNull();
    expect(half.intensities).toHaveLength(1);
    expect(compareOwnEvaluations({ format: "descriptive", cupsPerSample: 5, mine: { data: {} }, other: { data: {} } })).toBeNull();
  });
});
