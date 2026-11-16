import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FLAVOR_WHEEL } from "@/lib/constants";
import {
  COMPARE_LIMITS,
  JOIN_PULL_DEG,
  LABEL_GAP,
  PETAL_HALF_DEG,
  PLATEAU_HALF_DEG,
  SECTOR_DEG,
  WHEEL_FAMILY_ORDER,
  WHEEL_FRAMES,
  compareGeometry,
  countWheelPeople,
  countedDescriptors,
  countedFamilies,
  familyAngle,
  familyCounts,
  familySector,
  petalPath,
  ringRadius,
  territoryPath,
  wheelFamilyOf,
  wheelGeometry,
  wheelLabel,
  wheelRings,
  type WheelFrame,
} from "@/lib/flavorWheel";

// Package R1a: the counted flavour wheel and its comparison layer
// (docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, sections 6 and 6b).

const FRAMES: [string, WheelFrame][] = Object.entries(WHEEL_FRAMES);
const NINE = WHEEL_FAMILY_ORDER.length;

/** Counts given in the wheel's order -> a record keyed by family id. */
const byFamily = (counts: number[]) =>
  Object.fromEntries(WHEEL_FAMILY_ORDER.map((f, i) => [f, counts[i]]));

// The invented coffees of the mock (people of 7, in the wheel's order).
const G = [5, 7, 3, 0, 0, 0, 1, 1, 5];
const C = [2, 6, 5, 0, 0, 1, 2, 0, 4];
const D = [0, 1, 2, 5, 3, 4, 0, 2, 1];
const A = [6, 4, 1, 2, 0, 0, 0, 2, 5];

const dist = (f: WheelFrame, x: number, y: number) => Math.hypot(x - f.cx, y - f.cy);
/** Degrees clockwise from twelve o'clock, 0..360. */
const angleOf = (f: WheelFrame, x: number, y: number) =>
  ((Math.atan2(x - f.cx, f.cy - y) * 180) / Math.PI + 360) % 360;
const norm = (deg: number) => ((deg % 360) + 360) % 360;
/** A coordinate is rounded to 0.1, so a point is at most ~0.071 off its ring. */
const ON_RING = 0.08;

const PETAL =
  /^M (\S+) (\S+) A (\S+) (\S+) 0 0 1 (\S+) (\S+) L (\S+) (\S+) A (\S+) (\S+) 0 0 0 (\S+) (\S+) Z$/;
const TERRITORY_STEP = /A (\S+) (\S+) 0 0 1 (\S+) (\S+) C (\S+) (\S+) (\S+) (\S+) (\S+) (\S+)/g;

function parseTerritory(d: string) {
  const start = /^M (\S+) (\S+) /.exec(d);
  expect(start).not.toBeNull();
  expect(d.endsWith(" Z")).toBe(true);
  const steps = [...d.matchAll(TERRITORY_STEP)].map((m) => m.slice(1).map(Number));
  return { start: [Number(start![1]), Number(start![2])], steps };
}

describe("the nine families", () => {
  it("are exactly the L1 groups of FLAVOR_WHEEL, each once", () => {
    const l1 = FLAVOR_WHEEL.filter((n) => n.level === 1).map((n) => n.id);
    expect([...WHEEL_FAMILY_ORDER].sort()).toEqual([...l1].sort());
    expect(new Set(WHEEL_FAMILY_ORDER).size).toBe(NINE);
  });

  it("resolve any wheel node to its family, and nothing else", () => {
    for (const node of FLAVOR_WHEEL) {
      expect(wheelFamilyOf(node.id)).toBe(node.id.split(":")[0]);
    }
    for (const id of ["bitter", "acidity:winey", "mouthfeel:rough", "", "nope"]) {
      expect(wheelFamilyOf(id)).toBeNull();
    }
  });
});

describe("sectors and petals", () => {
  it("the nine sectors tile the full circle with no gap and no overlap", () => {
    let sum = 0;
    for (let i = 0; i < NINE; i++) {
      const s = familySector(i);
      const next = familySector((i + 1) % NINE);
      sum += s.end - s.start;
      expect(s.end - s.start).toBeCloseTo(SECTOR_DEG, 10);
      expect(norm(s.end)).toBeCloseTo(norm(next.start), 10);
      expect(s.centre).toBe(familyAngle(i));
    }
    expect(sum).toBeCloseTo(360, 10);
  });

  it("a family is always at the same angle, whatever the counts or the frame", () => {
    const a = wheelGeometry(byFamily(G), 7, WHEEL_FRAMES.full).petals.map((p) => p.angle);
    const b = wheelGeometry(byFamily(D), 3, WHEEL_FRAMES.mini).petals.map((p) => p.angle);
    expect(a).toEqual(b);
    expect(a).toEqual(WHEEL_FAMILY_ORDER.map((_, i) => i * 40 - 20));
  });

  it("petals stay inside their own sector and never touch a neighbour", () => {
    expect(PETAL_HALF_DEG).toBeLessThan(SECTOR_DEG / 2);
    for (let i = 0; i < NINE; i++) {
      const endOfThis = familyAngle(i) + PETAL_HALF_DEG;
      const startOfNext = familyAngle(i + 1) - PETAL_HALF_DEG; // i + 1 = 9 is the first one, a turn later
      expect(startOfNext - endOfThis).toBeCloseTo(SECTOR_DEG - 2 * PETAL_HALF_DEG, 10);
      expect(startOfNext).toBeGreaterThan(endOfThis);
    }
  });

  it.each(FRAMES)("%s: every petal is a closed sector from the centre to the ring of its count", (_, f) => {
    for (let i = 0; i < NINE; i++) {
      for (let c = 1; c <= 7; c++) {
        const d = petalPath(f, i, c, 7);
        const m = PETAL.exec(d ?? "");
        expect(m, `${i}/${c}: ${d}`).not.toBeNull();
        const [x0, y0, ra, rb, x1, y1, x2, y2, r0a, r0b, x3, y3] = m!.slice(1).map(Number);
        const rr = ringRadius(f, c, 7);
        // the arcs' own radii are the ring and the centre
        expect([ra, rb]).toEqual([rr, rr]);
        expect([r0a, r0b]).toEqual([f.r0, f.r0]);
        // the four corners sit on those two circles
        expect(Math.abs(dist(f, x0, y0) - rr)).toBeLessThan(ON_RING);
        expect(Math.abs(dist(f, x1, y1) - rr)).toBeLessThan(ON_RING);
        expect(Math.abs(dist(f, x2, y2) - f.r0)).toBeLessThan(ON_RING);
        expect(Math.abs(dist(f, x3, y3) - f.r0)).toBeLessThan(ON_RING);
        // ... at the two edges of the petal, which are inside the family's sector
        const tol = (0.08 / rr) * (180 / Math.PI) + 1e-9;
        expect(Math.abs(norm(angleOf(f, x0, y0) - norm(familyAngle(i) - PETAL_HALF_DEG) + 180) - 180)).toBeLessThan(tol);
        expect(Math.abs(norm(angleOf(f, x1, y1) - norm(familyAngle(i) + PETAL_HALF_DEG) + 180) - 180)).toBeLessThan(tol);
      }
    }
  });

  it("a petal is as long as the number of people, on the scale the rings show", () => {
    const f = WHEEL_FRAMES.full;
    expect(ringRadius(f, 0, 7)).toBe(f.r0);
    expect(ringRadius(f, 7, 7)).toBe(f.R);
    expect(ringRadius(f, 99, 7)).toBe(f.R); // never past the outer ring
    expect(ringRadius(f, -3, 7)).toBe(f.r0);
    const radii = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => ringRadius(f, c, 7));
    for (let c = 1; c < radii.length; c++) expect(radii[c]).toBeGreaterThan(radii[c - 1]);
    // each petal ends on the ring of its own count
    const rings = wheelRings(f, 7);
    for (const p of wheelGeometry(byFamily(G), 7, f).petals) {
      if (p.count > 0) expect(p.radius).toBe(rings[p.count - 1].radius);
    }
  });

  it("a family nobody found takes no space, and keeps its place and its label", () => {
    const g = wheelGeometry(byFamily(G), 7);
    expect(g.petals).toHaveLength(NINE);
    expect(g.labels).toHaveLength(NINE);
    g.petals.forEach((p, i) => {
      expect(p.family).toBe(WHEEL_FAMILY_ORDER[i]);
      expect(p.d === null).toBe(G[i] === 0);
      expect(p.count).toBe(G[i]);
    });
  });

  it("the hand-checked petal: Frutal, 7 of 7, on the small wheel", () => {
    // centre (40, 40), r0 6, R 36, edges at 3 and 37 degrees:
    // 40 + 36 sin 3 = 41.9, 40 - 36 cos 3 = 4.0; 40 + 36 sin 37 = 61.7, 40 - 36 cos 37 = 11.2;
    // 40 + 6 sin 37 = 43.6, 40 - 6 cos 37 = 35.2; 40 + 6 sin 3 = 40.3, 40 - 6 cos 3 = 34.0.
    expect(petalPath(WHEEL_FRAMES.mini, 1, 7, 7)).toBe(
      "M 41.9 4 A 36 36 0 0 1 61.7 11.2 L 43.6 35.2 A 6 6 0 0 0 40.3 34 Z",
    );
  });
});

describe("rings", () => {
  it("one ring per person up to ten people, the last one the outer ring", () => {
    for (const n of [1, 2, 7, 10]) {
      const rings = wheelRings(WHEEL_FRAMES.full, n);
      expect(rings.map((r) => r.people)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expect(rings.filter((r) => r.outer)).toEqual([rings[n - 1]]);
      expect(rings[n - 1].radius).toBe(WHEEL_FRAMES.full.R);
      for (let i = 1; i < n; i++) expect(rings[i].radius).toBeGreaterThan(rings[i - 1].radius);
    }
  });

  it("quarters of the panel beyond ten people", () => {
    const rings = wheelRings(WHEEL_FRAMES.full, 24);
    expect(rings.map((r) => r.people)).toEqual([6, 12, 18, 24]);
    expect(rings[3]).toEqual({ people: 24, radius: 80, outer: true });
  });

  it("with nobody there is only the outer ring", () => {
    expect(wheelRings(WHEEL_FRAMES.full, 0)).toEqual([{ people: 0, radius: 80, outer: true }]);
  });
});

describe("labels", () => {
  it.each(FRAMES)("%s: nine anchors just outside the outer ring, the text growing away from the wheel", (_, f) => {
    const labels = WHEEL_FAMILY_ORDER.map((_, i) => wheelLabel(f, i));
    expect(new Set(labels.map((l) => `${l.x},${l.y}`)).size).toBe(NINE);
    for (const l of labels) {
      expect(Math.abs(dist(f, l.x, l.y) - (f.R + LABEL_GAP))).toBeLessThan(ON_RING);
      if (l.anchor === "start") expect(l.x).toBeGreaterThan(f.cx);
      if (l.anchor === "end") expect(l.x).toBeLessThan(f.cx);
      if (l.side === "above") expect(l.y).toBeLessThan(f.cy);
      if (l.side === "below") expect(l.y).toBeGreaterThan(f.cy);
    }
  });

  it("the full wheel's labels fit inside its frame's height", () => {
    const f = WHEEL_FRAMES.full;
    for (const l of wheelGeometry(byFamily(G), 7, f).labels) {
      expect(l.y).toBeGreaterThan(0);
      expect(l.y).toBeLessThan(f.height);
    }
  });
});

describe("the most found family", () => {
  it("is the longest petal", () => {
    expect(wheelGeometry(byFamily(G), 7).top).toEqual({ family: "fruity", count: 7 });
    expect(wheelGeometry(byFamily(D), 7).top).toEqual({ family: "green_veg", count: 5 });
  });

  it("on a tie it is the first one in the wheel's order, every time", () => {
    expect(wheelGeometry(byFamily([0, 4, 0, 0, 0, 4, 0, 0, 4]), 7).top).toEqual({ family: "fruity", count: 4 });
  });

  it("is absent when nobody picked anything", () => {
    expect(wheelGeometry({}, 7).top).toBeNull();
    expect(wheelGeometry(byFamily(G), 0).top).toBeNull();
  });
});

describe("the empty and the one-descriptor cases", () => {
  it("an empty coffee draws its ground and no petal", () => {
    const g = wheelGeometry({}, 7);
    expect(g.petals.every((p) => p.d === null && p.count === 0)).toBe(true);
    expect(g.rings).toHaveLength(7);
    expect(countedFamilies({}, 7)).toEqual([]);
    expect(countedDescriptors({}, 7)).toEqual([]);
  });

  it("no cuppers at all: nothing is drawn and nothing divides by zero", () => {
    const g = wheelGeometry(byFamily(G), 0);
    expect(g.n).toBe(0);
    expect(g.petals.every((p) => p.d === null && p.count === 0 && p.radius === g.frame.r0)).toBe(true);
    expect(JSON.stringify(g)).not.toMatch(/NaN|Infinity|null,null/);
    expect(territoryPath(WHEEL_FRAMES.compare, G, 0)).not.toMatch(/NaN|Infinity/);
  });

  it("one cupper, one descriptor: one full petal, one line in each list", () => {
    const one = countWheelPeople([["fruity:berry:blackberry"]]);
    expect(one).toEqual({
      n: 1,
      direct: { "fruity:berry:blackberry": 1 },
      rollup: { fruity: 1, "fruity:berry": 1, "fruity:berry:blackberry": 1 },
    });
    const g = wheelGeometry(one.rollup, one.n);
    expect(g.petals.filter((p) => p.d !== null).map((p) => p.family)).toEqual(["fruity"]);
    expect(g.petals[1].radius).toBe(g.frame.R);
    expect(g.rings).toEqual([{ people: 1, radius: g.frame.R, outer: true }]);
    expect(countedFamilies(one.rollup, 1).map((r) => [r.id, r.bar.count, r.bar.n])).toEqual([["fruity", 1, 1]]);
    expect(countedDescriptors(one.direct, 1)).toEqual([
      { id: "fruity:berry:blackberry", level: 3, family: "fruity", bar: { count: 1, n: 1, share: 1, pct: 100 } },
    ]);
  });
});

describe("counting people, not mentions", () => {
  it("a cupper counts once per node and once per family, however often they picked it", () => {
    const p = countWheelPeople([
      ["fruity:berry:blackberry", "fruity:berry:raspberry", "fruity:berry:blackberry", "fruity"],
      ["fruity:berry:raspberry"],
      [],
    ]);
    expect(p.n).toBe(3);
    expect(p.direct).toEqual({ fruity: 1, "fruity:berry:blackberry": 1, "fruity:berry:raspberry": 2 });
    expect(p.rollup).toEqual({
      fruity: 2,
      "fruity:berry": 2,
      "fruity:berry:blackberry": 1,
      "fruity:berry:raspberry": 2,
    });
  });

  it("retired ids are migrated, a legacy free text counts under Otros, anything else is ignored", () => {
    const p = countWheelPeople([
      ["sweet:vanilla", "sweet:sweet_aromatics"], // the first is retired INTO the second: one pick
      ["unmapped:nuec", "acidity:winey", "bitter", "mouthfeel:rough", "zzz", 7 as unknown as string],
    ]);
    expect(p.direct).toEqual({ "sweet:sweet_aromatics": 1, other: 1 });
    expect(p.rollup).toEqual({ sweet: 1, "sweet:sweet_aromatics": 1, other: 1 });
  });

  it("no family can have more people than cuppers", () => {
    const everything = FLAVOR_WHEEL.map((n) => n.id);
    const p = countWheelPeople([everything, everything, []]);
    for (const c of Object.values(p.rollup)) expect(c).toBeLessThanOrEqual(p.n);
    expect(familyCounts(p.rollup, p.n)).toEqual(Array(NINE).fill(2));
  });

  it("does not depend on the order of the cuppers or of their picks", () => {
    const a = [["fruity:berry", "floral"], ["sweet", "fruity:berry:blackberry"], ["other", "floral:black_tea"]];
    const b = [[...a[2]].reverse(), [...a[0]].reverse(), [...a[1]].reverse()];
    expect(JSON.stringify(countWheelPeople(b))).toBe(JSON.stringify(countWheelPeople(a)));
  });
});

describe("the counted list", () => {
  it("families: most people first, equal counts in the wheel's order, zeros left out", () => {
    const rows = countedFamilies(byFamily(G), 7);
    expect(rows.map((r) => [r.id, r.bar.count])).toEqual([
      ["fruity", 7],
      ["floral", 5],
      ["sweet", 5],
      ["sour_fermented", 3],
      ["spice", 1],
      ["nutty_cocoa", 1],
    ]);
    expect(rows[0].bar).toEqual({ count: 7, n: 7, share: 1, pct: 100 });
    expect(rows.every((r) => r.level === 1 && r.family === r.id)).toBe(true);
    expect(countedFamilies(byFamily(G), 7, 3).map((r) => r.id)).toEqual(["fruity", "floral", "sweet"]);
  });

  it("descriptors: wheel ids only, ordered by people and then as the wheel goes round", () => {
    const direct = {
      "sweet:sweet_aromatics": 3,
      "nutty_cocoa:nutty": 3,
      "fruity:berry:blackberry": 6,
      "floral:black_tea": 3,
      fruity: 3,
      "acidity:winey": 9, // not on the wheel: never listed
      "floral:floral:jasmine": 0,
    };
    const rows = countedDescriptors(direct, 7);
    expect(rows.map((r) => r.id)).toEqual([
      "fruity:berry:blackberry",
      "floral:black_tea",
      "fruity",
      "nutty_cocoa:nutty",
      "sweet:sweet_aromatics",
    ]);
    expect(rows[0]).toEqual({
      id: "fruity:berry:blackberry",
      level: 3,
      family: "fruity",
      bar: { count: 6, n: 7, share: 6 / 7, pct: 85.71 },
    });
    expect(countedDescriptors(direct, 7, 2)).toHaveLength(2);
  });
});

describe("territories (the comparison layer)", () => {
  it("the join curves never reach the middle of a sector", () => {
    expect(PLATEAU_HALF_DEG + JOIN_PULL_DEG).toBeLessThan(SECTOR_DEG / 2);
    expect(PLATEAU_HALF_DEG).toBeLessThan(PETAL_HALF_DEG);
  });

  it.each(FRAMES)("%s: the outline closes, and each plateau runs on the ring of its family's count", (_, f) => {
    for (const counts of [G, C, D, A, Array(NINE).fill(0), Array(NINE).fill(7)]) {
      const { start, steps } = parseTerritory(territoryPath(f, counts, 7));
      expect(steps).toHaveLength(NINE);
      // it ends where it began
      expect(steps[NINE - 1].slice(8)).toEqual(start);
      let from = start;
      steps.forEach(([ra, rb, ex, ey, , , , , nx, ny], i) => {
        const rr = ringRadius(f, counts[i], 7);
        expect([ra, rb]).toEqual([rr, rr]);
        // both ends of the plateau are ON that ring, at 12 degrees each side of the family's angle
        expect(Math.abs(dist(f, from[0], from[1]) - rr)).toBeLessThan(ON_RING);
        expect(Math.abs(dist(f, ex, ey) - rr)).toBeLessThan(ON_RING);
        const tol = (0.08 / rr) * (180 / Math.PI) + 1e-9;
        expect(Math.abs(norm(angleOf(f, ex, ey) - norm(familyAngle(i) + PLATEAU_HALF_DEG) + 180) - 180)).toBeLessThan(tol);
        expect(Math.abs(norm(angleOf(f, from[0], from[1]) - norm(familyAngle(i) - PLATEAU_HALF_DEG) + 180) - 180)).toBeLessThan(tol);
        from = [nx, ny];
      });
    }
  });

  it("a territory's edge lies exactly where the same coffee's petal ends", () => {
    const f = WHEEL_FRAMES.compare;
    const petals = wheelGeometry(byFamily(G), 7, f).petals;
    const { steps } = parseTerritory(territoryPath(f, G, 7));
    steps.forEach(([ra], i) => expect(ra).toBe(petals[i].radius));
  });

  it("zero and one are told apart: the centre is a ring, not a point", () => {
    const f = WHEEL_FRAMES.compare;
    expect(ringRadius(f, 0, 7)).toBe(24);
    expect(ringRadius(f, 1, 7)).toBeGreaterThan(24 + 7);
  });

  it("alone: up to three coffees, no petals, the rest listed as dropped", () => {
    const s = (id: string, counts: number[]) => ({ id, counts: byFamily(counts), n: 7 });
    const g = compareGeometry({ others: [s("G", G), s("C", C), s("D", D), s("A", A)] });
    expect(COMPARE_LIMITS).toEqual({ alone: 3, overPetals: 2 });
    expect(g.petals).toEqual([]);
    expect(g.territories.map((t) => [t.id, t.order])).toEqual([["G", 0], ["C", 1], ["D", 2]]);
    expect(g.dropped).toEqual(["A"]);
    expect(g.countsOnLabels).toBe(false);
    expect(g.table.series).toEqual([
      { id: "G", n: 7, role: "territory" },
      { id: "C", n: 7, role: "territory" },
      { id: "D", n: 7, role: "territory" },
    ]);
    // every family somebody found, in the wheel's order, one count per coffee drawn
    expect(g.table.rows.map((r) => r.family)).toEqual([...WHEEL_FAMILY_ORDER]);
    expect(g.table.rows[1]).toEqual({ family: "fruity", index: 1, counts: [7, 6, 1] });
    expect(g.territories[0].d).toBe(territoryPath(WHEEL_FRAMES.compare, G, 7));
  });

  it("over a coffee's petals: the base keeps its petals, up to two others are laid on top", () => {
    const s = (id: string, counts: number[]) => ({ id, counts: byFamily(counts), n: 7 });
    const g = compareGeometry({ base: s("G", G), others: [s("C", C), s("D", D), s("A", A)] });
    expect(g.petals.map((p) => p.count)).toEqual(G);
    expect(g.petals.filter((p) => p.d !== null)).toHaveLength(G.filter((c) => c > 0).length);
    expect(g.territories.map((t) => t.id)).toEqual(["C", "D"]);
    expect(g.dropped).toEqual(["A"]);
    expect(g.table.series.map((x) => x.role)).toEqual(["petals", "territory", "territory"]);
    expect(g.labels[1].counts).toEqual([7, 6, 1]);
    expect(g.countsOnLabels).toBe(false);
    // two coffees in all: the labels can carry both numbers
    expect(compareGeometry({ base: s("G", G), others: [s("C", C)] }).countsOnLabels).toBe(true);
  });

  it("each coffee's letter sits on its own edge, and no two share a family", () => {
    const f = WHEEL_FRAMES.compare;
    const s = (id: string, counts: number[]) => ({ id, counts: byFamily(counts), n: 7 });
    // G and C both reach furthest at Frutal: the second takes its next best
    const g = compareGeometry({ others: [s("G", G), s("C", C), s("D", D)] });
    expect(g.territories.map((t) => t.tag.family)).toEqual(["fruity", "sour_fermented", "green_veg"]);
    g.territories.forEach((t, k) => {
      const counts = [G, C, D][k];
      expect(Math.abs(dist(f, t.tag.x, t.tag.y) - ringRadius(f, counts[t.tag.index], 7))).toBeLessThan(ON_RING);
    });
  });

  it("panels of different sizes share one scale of PEOPLE: the largest panel is the outer ring", () => {
    const g = compareGeometry({
      others: [
        { id: "H", counts: byFamily([1, 2, 0, 1, 0, 3, 2, 6, 5]), n: 6 },
        { id: "G", counts: byFamily(G), n: 7 },
      ],
    });
    expect(g.n).toBe(7);
    expect(g.rings).toHaveLength(7);
    expect(g.table.series.map((x) => x.n)).toEqual([6, 7]);
    // 6 of 6 sits on the ring of six people, one short of the outer ring
    const { steps } = parseTerritory(g.territories[0].d);
    expect(steps[7][0]).toBe(ringRadius(g.frame, 6, 7));
    expect(steps[7][0]).toBeLessThan(g.frame.R);
    // a count is cut to its own panel before it is drawn
    const over = compareGeometry({ others: [{ id: "X", counts: { fruity: 9 }, n: 2 }, { id: "G", counts: byFamily(G), n: 7 }] });
    expect(over.labels[1].counts).toEqual([2, 7]);
  });

  it("nothing chosen: a ground and an empty table", () => {
    const g = compareGeometry({ others: [] });
    expect(g.territories).toEqual([]);
    expect(g.table).toEqual({ series: [], rows: [] });
    expect(g.n).toBe(0);
    expect(g.labels.every((l) => l.empty)).toBe(true);
  });
});

describe("the page and the PDF agree", () => {
  const shuffled = (rec: Record<string, number>) =>
    Object.fromEntries(Object.entries(rec).reverse());

  it("the same input gives byte-identical output, whatever the order of the keys", () => {
    const rec = byFamily(G);
    expect(JSON.stringify(wheelGeometry(shuffled(rec), 7))).toBe(JSON.stringify(wheelGeometry(rec, 7)));
    expect(JSON.stringify(wheelGeometry(rec, 7, WHEEL_FRAMES.mini))).toBe(
      JSON.stringify(wheelGeometry({ ...rec }, 7, { ...WHEEL_FRAMES.mini })),
    );
    const input = (r: Record<string, number>) => ({
      base: { id: "G", counts: r, n: 7 },
      others: [{ id: "C", counts: byFamily(C), n: 7 }, { id: "D", counts: byFamily(D), n: 7 }],
    });
    expect(JSON.stringify(compareGeometry(input(shuffled(rec))))).toBe(JSON.stringify(compareGeometry(input(rec))));
    expect(JSON.stringify(countedFamilies(shuffled(rec), 7))).toBe(JSON.stringify(countedFamilies(rec, 7)));
    const direct = { "sweet:sweet_aromatics": 3, "fruity:berry": 3, floral: 3 };
    expect(JSON.stringify(countedDescriptors(shuffled(direct), 7))).toBe(JSON.stringify(countedDescriptors(direct, 7)));
  });

  it("every coordinate has at most one decimal, and none is -0", () => {
    const all =
      JSON.stringify(wheelGeometry(byFamily(D), 7)) +
      JSON.stringify(compareGeometry({ others: [{ id: "A", counts: byFamily(A), n: 7 }] }));
    for (const m of all.matchAll(/"d":"([^"]+)"/g)) {
      for (const tok of m[1].split(" ")) {
        if (/^[MALCZ]$/.test(tok)) continue;
        expect(tok).toMatch(/^-?\d+(\.\d)?$/);
        expect(tok).not.toBe("-0");
      }
    }
  });

  it("the territory of the mock's coffee G, pinned", () => {
    expect(territoryPath(WHEEL_FRAMES.compare, G, 7)).toMatchInlineSnapshot(`"M 127.6 71.2 A 61.1 61.1 0 0 1 151.5 62.5 C 157.1 62 163.6 47.1 170.6 47.7 A 76 76 0 0 1 200.3 58.5 C 206.1 62.5 191.4 89 194.4 92 A 46.3 46.3 0 0 1 204 108.7 C 205.2 112.8 183.8 120 184 122.2 A 24 24 0 0 1 182.3 132 C 181.3 134 180.2 136 178.9 137.8 A 24 24 0 0 1 171.3 144.2 C 169.3 145.1 167.1 145.9 165 146.5 A 24 24 0 0 1 155 146.5 C 152.9 145.9 147.9 152 145.3 150.7 A 31.4 31.4 0 0 1 135.3 142.3 C 133.6 140 132.1 137.4 130.9 134.8 A 31.4 31.4 0 0 1 128.6 121.9 C 128.9 119 100.4 109.6 101.9 104.1 A 61.1 61.1 0 0 1 114.6 82.1 C 118.6 78.1 123 74.4 127.6 71.2 Z"`);
  });
});

describe("pure: no colour, no React, no DOM", () => {
  const FILES = ["lib/flavorWheel.ts", "lib/resultsScales.ts", "lib/scoreContext.ts"];
  const ALLOWED_IMPORTS = [
    "@/lib/constants",
    "@/lib/descriptors",
    "@/lib/resultsScales",
    "@/lib/reports/ranking",
  ];

  it.each(FILES)("%s imports only pure modules and names no colour", (file) => {
    const src = readFileSync(path.resolve(__dirname, "..", file), "utf8");
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    for (const from of imports) expect(ALLOWED_IMPORTS).toContain(from);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/var\(--|rgba?\(|hsl\(/);
    expect(src).not.toMatch(/\b(window|document|navigator)\./);
    expect(src).not.toMatch(/L1_GROUP_COLOR|flavorGroupColor|flavorNodeColor/);
  });

  it("no output carries a colour or a style", () => {
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
      }
    };
    walk(wheelGeometry(byFamily(G), 7));
    walk(compareGeometry({ base: { id: "G", counts: byFamily(G), n: 7 }, others: [{ id: "C", counts: byFamily(C), n: 7 }] }));
    walk(countedFamilies(byFamily(G), 7));
    for (const k of keys) expect(k).not.toMatch(/colou?r|fill|stroke|style|class/i);
  });
});
